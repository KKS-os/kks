import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MemoryStore, ipKeyGenerator, rateLimit } from "express-rate-limit";
import {
  CLIPS_DIR,
  PORT,
  ROOT_DIR,
  TMP_JOBS_DIR,
} from "./server/services/types.ts";
import type {
  DraftRecapSession,
  InputSourceType,
  RecapJobState,
  RecapLanguage,
  RenderedClipResult,
  SourceMediaInfo,
  SubtitleCue,
  SubtitleStyleOptions,
} from "./server/services/types.ts";
import {
  buildRecapCacheKey,
  getCachedRecapResult,
  setCachedRecapResult,
} from "./server/services/recapCacheService.ts";
import {
  analyzeUploadedMediaWithGeminiFileApi,
  analyzeVideoWithGemini,
  generateNarrationWavBuffer,
  isValidUserGeminiApiKey,
} from "./server/services/geminiService.ts";
import {
  enqueueRenderTask,
  getRenderQueueSnapshot,
} from "./server/services/renderQueueService.ts";
import { extractArticleSourceMedia } from "./server/services/articleExtractor.ts";
import { extractYouTubeSourceMedia } from "./server/services/youtubeService.ts";
import {
  createGoldCyberBackdrop,
  ensureCinematicBaseVideo,
  extractRealFramesFromVideo,
  probeMediaFile,
} from "./server/services/mediaExtractor.ts";
import {
  buildClipSpecFromEditedRecap,
  ensureShowcaseClips,
  reburnClipSubtitles,
  renderClipToMp4,
  sanitizeStructuredRecapInput,
} from "./server/services/videoRenderService.ts";

export { renderClipToMp4 };
export type {
  GeneratedClipSpec,
  RenderedClipResult,
  SubtitleCue,
  SubtitleStyleOptions,
} from "./server/services/types.ts";

const recapJobStore = new Map<string, RecapJobState>();
const draftSessionStore = new Map<string, DraftRecapSession>();

function pruneOldDraftSessions() {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of draftSessionStore.entries()) {
    if (session.createdAt < cutoff) {
      draftSessionStore.delete(id);
      try {
        if (session.draftDir && session.draftDir.startsWith(TMP_JOBS_DIR + path.sep)) {
          fs.rmSync(session.draftDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

function pruneOldRecapJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of recapJobStore.entries()) {
    if (job.createdAt < cutoff) {
      recapJobStore.delete(id);
    }
  }
}

function isRateLimitError(err: any): boolean {
  return Boolean(
    err &&
      (err.status === 429 ||
        err.statusCode === 429 ||
        (typeof err.message === "string" &&
          (err.message.includes("Rate exceeded") ||
            err.message.includes("rate limit") ||
            err.message.includes("quota") ||
            err.message.includes("ResourceExhausted"))))
  );
}

const DEMO_DAILY_LIMIT = 2;
const DEMO_WINDOW_MS = 24 * 60 * 60 * 1000;

function extractValidUserApiKey(req: express.Request): string | undefined {
  const raw = req.header("x-gemini-api-key");
  if (!isValidUserGeminiApiKey(raw)) return undefined;
  return raw!.trim();
}

function getClientIpKey(req: express.Request): string {
  const rawIp = req.ip || req.socket?.remoteAddress || "127.0.0.1";
  return ipKeyGenerator(rawIp);
}

function resolveAllowedOrigins(): string[] | "*" {
  const configured = (process.env.FRONTEND_URL || "*").trim();
  if (!configured || configured === "*") return "*";
  const list = configured
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return list.length > 0 ? list : "*";
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);

  const allowedOrigins = resolveAllowedOrigins();
  app.use((req, res, next) => {
    const requestOrigin = (req.headers.origin || "").trim().replace(/\/+$/, "");
    if (allowedOrigins === "*") {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
    } else if (!requestOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0]);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Range, x-gemini-api-key"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Range, Accept-Ranges, Content-Length, X-Demo-Remaining, X-Demo-Limit, X-Demo-Reset-At, X-Demo-Mode"
    );
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "6mb" }));

  const demoDailyStore = new MemoryStore();

  const recapAbuseLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => getClientIpKey(req),
    skip: (req) =>
      req.method === "GET" &&
      (req.path.startsWith("/status/") ||
        req.path === "/quota" ||
        req.path === "/queue-status"),
    handler: (_req, res) => {
      res.status(429).json({
        error:
          "တောင်းဆိုမှု အရေအတွက် များပြားနေပါသည်။ စက္ကန့်အနည်းငယ် စောင့်ဆိုင်းပြီး ထပ်မံ ကြိုးစားပေးပါ။",
        code: "ABUSE_RATE_LIMIT",
      });
    },
  });

  const serverFallbackRpmLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => getClientIpKey(req),
    skip: (req) => Boolean(extractValidUserApiKey(req)),
    handler: (_req, res) => {
      res.status(429).json({
        error:
          "Free Demo Server ၏ ၁ မိနစ်အတွင်း AI အသုံးပြုမှု ကန့်သတ်ချက် ပြည့်နေပါသည်။ စက္ကန့် ၃၀ ခန့်စောင့်ဆိုင်းပါ သို့မဟုတ် Settings ထဲတွင် ကိုယ်ပိုင် Free Gemini API Key ထည့်သွင်းပြီး အကန့်အသတ်မရှိ သုံးနိုင်ပါသည်။",
        code: "SERVER_RPM_LIMIT",
      });
    },
  });

  const demoDailyLimiter = rateLimit({
    windowMs: DEMO_WINDOW_MS,
    limit: DEMO_DAILY_LIMIT,
    store: demoDailyStore,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => getClientIpKey(req),
    skip: (req) => Boolean(extractValidUserApiKey(req)),
    handler: async (req, res) => {
      const record = await demoDailyStore.get(getClientIpKey(req)).catch(() => undefined);
      const resetAt = record?.resetTime ? record.resetTime.toISOString() : null;
      res.setHeader("X-Demo-Mode", "demo");
      res.setHeader("X-Demo-Limit", String(DEMO_DAILY_LIMIT));
      res.setHeader("X-Demo-Remaining", "0");
      if (resetAt) res.setHeader("X-Demo-Reset-At", resetAt);
      res.status(429).json({
        error:
          "အခမဲ့ Demo Mode (တစ်ရက်လျှင် ၂ ကြိမ်) ကန့်သတ်ချက် ပြည့်သွားပါပြီ။ Settings ထဲတွင် ကိုယ်ပိုင် Free Gemini API Key ထည့်သွင်းပြီး ၁၀၀% အခမဲ့ အကန့်အသတ်မရှိ ဆက်လက်အသုံးပြုနိုင်ပါသည်။",
        code: "DEMO_QUOTA_EXCEEDED",
        demoLimit: DEMO_DAILY_LIMIT,
        demoRemaining: 0,
        resetAt,
      });
    },
  });

  const readDemoQuotaInfo = async (req: express.Request) => {
    const userApiKey = extractValidUserApiKey(req);
    if (userApiKey) {
      return {
        mode: "byok" as const,
        hasPersonalApiKey: true,
        demoLimit: DEMO_DAILY_LIMIT,
        demoUsed: 0,
        demoRemaining: DEMO_DAILY_LIMIT,
        resetAt: null as string | null,
      };
    }
    const record = await demoDailyStore.get(getClientIpKey(req)).catch(() => undefined);
    const totalHits = record?.totalHits || 0;
    const demoRemaining = Math.max(0, DEMO_DAILY_LIMIT - totalHits);
    return {
      mode: "demo" as const,
      hasPersonalApiKey: false,
      demoLimit: DEMO_DAILY_LIMIT,
      demoUsed: totalHits,
      demoRemaining,
      resetAt: record?.resetTime ? record.resetTime.toISOString() : null,
    };
  };

  const attachDemoQuotaHeaders = async (req: express.Request, res: express.Response) => {
    const quota = await readDemoQuotaInfo(req);
    res.setHeader("X-Demo-Mode", quota.mode);
    res.setHeader("X-Demo-Limit", String(quota.demoLimit));
    res.setHeader("X-Demo-Remaining", String(quota.demoRemaining));
    if (quota.resetAt) {
      res.setHeader("X-Demo-Reset-At", quota.resetAt);
    }
    return quota;
  };

  const refundDemoQuotaHitIfNeeded = async (req: express.Request) => {
    if (!extractValidUserApiKey(req)) {
      await demoDailyStore.decrement(getClientIpKey(req)).catch(() => {});
    }
  };

  app.use("/api/recap", recapAbuseLimiter);

  // Dedicated video streamer supporting full HTTP 206 Partial Content, HEAD, and robust 416 handling
  const streamVideoFile = (
    req: express.Request,
    res: express.Response,
    isHeadOnly = false
  ) => {
    const safeName = path.basename(String(req.params.filename || ""));
    const isMp4 = safeName.endsWith(".mp4");
    const isJpg = safeName.endsWith(".jpg") || safeName.endsWith(".jpeg");
    if (!isMp4 && !isJpg) {
      res.status(400).json({ error: "Invalid filename." });
      return;
    }
    const filePath = path.join(CLIPS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "ဖိုင် မတွေ့ရှိပါ။" });
      return;
    }

    if (isJpg) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (isHeadOnly) {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    let fileSize = 0;
    try {
      const stat = fs.statSync(filePath);
      fileSize = stat.size;
    } catch {
      res.status(404).json({ error: "ဗီဒီယိုဖိုင် ဖတ်၍မရပါ။" });
      return;
    }

    if (fileSize === 0) {
      res.status(404).json({ error: "ဗီဒီယိုဖိုင် ပြင်ဆင်နေဆဲဖြစ်ပါသည်။" });
      return;
    }

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    }

    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
      res.setHeader("Content-Length", fileSize);
      res.status(200);
      if (isHeadOnly) {
        res.end();
        return;
      }
      const stream = fs.createReadStream(filePath);
      stream.on("error", (err) => {
        console.error("Stream error on full file:", err);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      res.end();
      return;
    }

    let start: number;
    let end: number;

    if (match[1] === "" && match[2] !== "") {
      const suffixLength = parseInt(match[2], 10);
      if (isNaN(suffixLength) || suffixLength <= 0) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
        return;
      }
      start = Math.max(0, fileSize - suffixLength);
      end = fileSize - 1;
    } else if (match[1] !== "" && match[2] === "") {
      start = parseInt(match[1], 10);
      end = fileSize - 1;
    } else if (match[1] !== "" && match[2] !== "") {
      start = parseInt(match[1], 10);
      end = parseInt(match[2], 10);
    } else {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || end < start) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      res.end();
      return;
    }

    const safeEnd = Math.min(end, fileSize - 1);
    const chunkSize = safeEnd - start + 1;

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${safeEnd}/${fileSize}`);
    res.setHeader("Content-Length", chunkSize);

    if (isHeadOnly) {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath, { start, end: safeEnd });
    stream.on("error", (err) => {
      console.error("Stream error on partial file:", err);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    stream.pipe(res);
  };

  app.get("/api/clips/:filename", (req, res) => {
    streamVideoFile(req, res, false);
  });

  app.head("/api/clips/:filename", (req, res) => {
    streamVideoFile(req, res, true);
  });

  app.get("/clips/:filename", (req, res) => {
    streamVideoFile(req, res, false);
  });

  app.head("/clips/:filename", (req, res) => {
    streamVideoFile(req, res, true);
  });

  // Quota & mode status endpoint (BYOK vs Demo Mode 2/day)
  app.get("/api/recap/quota", async (req, res) => {
    const quota = await attachDemoQuotaHeaders(req, res);
    res.json(quota);
  });

  // Live single-concurrency render queue status endpoint
  app.get("/api/recap/queue-status", (_req, res) => {
    res.json(getRenderQueueSnapshot());
  });

  // Get pre-rendered Showcase clip
  app.get("/api/recap/showcase", async (req, res) => {
    try {
      await attachDemoQuotaHeaders(req, res);
      const clips = await ensureShowcaseClips();
      res.json({
        sourceTitle: "KKS Gold OS — နမူနာ ပြသမှု",
        recapSummary: clips[0]?.recapSummary || null,
        clips,
      });
    } catch (err) {
      console.error("Showcase endpoint error:", err);
      res.status(500).json({ error: "နမူနာဗီဒီယို ရယူရာတွင် အခက်အခဲရှိနေပါသည်။" });
    }
  });

  // Cross-device permalink endpoint
  app.get("/api/recap/clip/:id", (req, res) => {
    const rawId = String(req.params.id || "").trim();
    const clipId = path.basename(rawId).replace(/\.mp4$/, "").replace(/\.json$/, "");
    if (!clipId) {
      res.status(400).json({ error: "Clip ID မမှန်ကန်ပါ။" });
      return;
    }

    const metaPath = path.join(CLIPS_DIR, `${clipId}.json`);
    if (fs.existsSync(metaPath)) {
      try {
        const raw = fs.readFileSync(metaPath, "utf-8");
        const parsed = JSON.parse(raw);
        res.json({ clip: parsed });
        return;
      } catch {
        // Fallback
      }
    }

    const mp4Path = path.join(CLIPS_DIR, `${clipId}.mp4`);
    if (fs.existsSync(mp4Path)) {
      const stat = fs.statSync(mp4Path);
      res.json({
        clip: {
          id: clipId,
          index: 1,
          titleBurmese: "မျှဝေထားသော ရုပ်ရှင်အနှစ်ချုပ် ဗီဒီယို",
          summaryBurmese: "မြန်မာစာတန်းထိုးပါဝင်သော ရုပ်ရှင်ဇာတ်လမ်း သုံးသပ်ချက် MP4",
          videoUrl: `/api/clips/${clipId}.mp4`,
          downloadUrl: `/api/clips/${clipId}.mp4?download=1`,
          posterUrl: `/api/clips/${clipId}.jpg`,
          filename: `${clipId}.mp4`,
          durationSec: 12,
          aspectRatio: "9:16",
          resolutionLabel: "720×1280 (9:16)",
          fileSizeMb: `${Math.max(0.2, stat.size / (1024 * 1024)).toFixed(2)} MB`,
          audioMode: "original",
          subtitles: [],
        },
      });
      return;
    }

    res.status(404).json({ error: "ရုပ်သံဖိုင် မတွေ့ရှိပါ။ အသစ်ပြန်လည် ပြုလုပ်ပေးပါ။" });
  });

  // Re-burn subtitles endpoint
  app.post("/api/recap/re-burn", async (req, res) => {
    try {
      const {
        originalFilename,
        subtitles,
        titleBurmese,
        aspectRatio = "9:16",
        framingMode = "blur_bg",
        bypassCensorship = true,
        styleOptions,
        durationSec = 12,
      } = req.body;

      if (!originalFilename || !Array.isArray(subtitles)) {
        res.status(400).json({ error: "လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ။" });
        return;
      }

      const safeOriginal = path.basename(originalFilename);
      const originalPath = path.join(CLIPS_DIR, safeOriginal);
      if (!fs.existsSync(originalPath)) {
        res.status(404).json({ error: "မူရင်း ဗီဒီယိုဖိုင် မတွေ့ရှိပါ။" });
        return;
      }

      const payload = await reburnClipSubtitles({
        originalPath,
        subtitles: subtitles as SubtitleCue[],
        titleBurmese: titleBurmese || "KKS Gold OS Subtitles",
        aspectRatio,
        framingMode,
        bypassCensorship,
        styleOptions,
        durationSec,
      });

      res.json(payload);
    } catch (err) {
      console.error("Re-burn error:", err);
      res.status(500).json({ error: "စာတန်းထိုး ပြန်လည်ထည့်သွင်းရာတွင် အခက်အခဲ ရှိနေပါသည်။" });
    }
  });

  // Poll async recap job progress, queue position & result
  app.get("/api/recap/status/:jobId", (req, res) => {
    const job = recapJobStore.get(String(req.params.jobId || ""));
    if (!job) {
      res.status(404).json({ error: "လုပ်ငန်းစဉ် မှတ်တမ်း မတွေ့ရှိပါ။" });
      return;
    }
    res.json({
      ...job,
      jobId: job.id,
      progress: job.progressPercent,
      message: job.progressMessage,
      queuePosition: job.queuePosition ?? 0,
      queueLength: job.queueLength ?? 0,
    });
  });

  // On-demand Gemini TTS endpoint for "Listen to Recap" audio reader
  app.post("/api/recap/tts", serverFallbackRpmLimiter, demoDailyLimiter, async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim().slice(0, 4000);
      if (text.length < 3) {
        await refundDemoQuotaHitIfNeeded(req);
        res.status(400).json({ error: "အသံဖတ်ရှုရန် စာသား မပြည့်စုံပါ။" });
        return;
      }
      const userApiKey = extractValidUserApiKey(req);
      const wavBuffer = await generateNarrationWavBuffer(text, userApiKey);
      if (!wavBuffer) {
        await refundDemoQuotaHitIfNeeded(req);
        res.status(503).json({
          error: "Gemini TTS ကို ခေတ္တ အသုံးပြု၍မရသဖြင့် Browser Web Speech API ဖြင့် ဖတ်ရှုပေးပါမည်။",
        });
        return;
      }
      await attachDemoQuotaHeaders(req, res);
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Cache-Control", "no-store");
      res.send(wavBuffer);
    } catch (err) {
      console.error("TTS endpoint error:", err);
      res.status(500).json({ error: "အသံဖိုင် ဖန်တီးရာတွင် အခက်အခဲရှိနေပါသည်။" });
    }
  });

  const inferUploadedMediaMeta = (
    filename: string,
    rawContentType: string | undefined,
    hasVideo: boolean
  ): { ext: string; mimeType: string } => {
    const lowerName = filename.toLowerCase();
    const cleanType = (rawContentType || "").split(";")[0].trim().toLowerCase();

    if (lowerName.endsWith(".mp3") || cleanType === "audio/mpeg" || cleanType === "audio/mp3") {
      return { ext: ".mp3", mimeType: "audio/mp3" };
    }
    if (lowerName.endsWith(".wav") || cleanType === "audio/wav" || cleanType === "audio/x-wav") {
      return { ext: ".wav", mimeType: "audio/wav" };
    }
    if (lowerName.endsWith(".m4a") || cleanType === "audio/mp4" || cleanType === "audio/m4a" || cleanType === "audio/x-m4a") {
      return { ext: ".m4a", mimeType: "audio/mp4" };
    }
    if (lowerName.endsWith(".aac") || cleanType === "audio/aac") {
      return { ext: ".aac", mimeType: "audio/aac" };
    }
    if (lowerName.endsWith(".ogg") || cleanType === "audio/ogg") {
      return { ext: ".ogg", mimeType: "audio/ogg" };
    }
    if (lowerName.endsWith(".flac") || cleanType === "audio/flac") {
      return { ext: ".flac", mimeType: "audio/flac" };
    }
    if (lowerName.endsWith(".mov") || cleanType === "video/quicktime") {
      return { ext: ".mov", mimeType: "video/quicktime" };
    }
    if (lowerName.endsWith(".webm") || cleanType.includes("webm")) {
      return { ext: ".webm", mimeType: hasVideo ? "video/webm" : "audio/webm" };
    }
    if (lowerName.endsWith(".mkv") || cleanType === "video/x-matroska") {
      return { ext: ".mkv", mimeType: "video/mp4" };
    }
    if (cleanType.startsWith("audio/") || !hasVideo) {
      return { ext: ".mp3", mimeType: cleanType.startsWith("audio/") ? cleanType : "audio/mp3" };
    }
    return { ext: ".mp4", mimeType: cleanType.startsWith("video/") ? cleanType : "video/mp4" };
  };

  // Direct local audio/video file upload (supports up to 150MB, 5-minute duration & Gemini File API ai.files.upload)
  app.post(
    "/api/recap/upload",
    serverFallbackRpmLimiter,
    demoDailyLimiter,
    express.raw({ type: ["video/*", "audio/*", "application/octet-stream"], limit: "160mb" }),
    async (req, res) => {
      let uploadDirToCleanup: string | null = null;
      let keepDirOutsideError = false;
      try {
        const userApiKey = extractValidUserApiKey(req);
        const bodyBuf = req.body as Buffer;
        if (!Buffer.isBuffer(bodyBuf) || bodyBuf.byteLength < 1024) {
          await refundDemoQuotaHitIfNeeded(req);
          res.status(400).json({ error: "အသံ သို့မဟုတ် ဗီဒီယိုဖိုင် မမှန်ကန်ပါ။ MP4, MOV, MP3, WAV ဖိုင် ရွေးချယ်ပေးပါ။" });
          return;
        }
        const uploadId = `local_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
        const uploadDir = path.join(TMP_JOBS_DIR, uploadId);
        uploadDirToCleanup = uploadDir;
        fs.mkdirSync(uploadDir, { recursive: true });

        const fileLabel = decodeURIComponent(String(req.query.name || "Uploaded Media")).slice(0, 60);
        const initialMeta = inferUploadedMediaMeta(
          fileLabel,
          req.headers["content-type"],
          !String(req.headers["content-type"] || "").startsWith("audio/")
        );
        const savedMediaPath = path.join(uploadDir, `source${initialMeta.ext}`);
        fs.writeFileSync(savedMediaPath, bodyBuf);

        const probed = await probeMediaFile(savedMediaPath);
        if (!probed) {
          await refundDemoQuotaHitIfNeeded(req);
          fs.rmSync(uploadDir, { recursive: true, force: true });
          uploadDirToCleanup = null;
          res.status(400).json({ error: "ရွေးချယ်ထားသော အသံ/ဗီဒီယိုဖိုင်ကို ဖတ်ရှု၍မရပါ။" });
          return;
        }

        const resolvedMeta = inferUploadedMediaMeta(
          fileLabel,
          req.headers["content-type"],
          probed.hasVideo
        );

        const aspectRatio: "9:16" | "16:9" | "1:1" =
          req.query.aspect === "16:9" ? "16:9" : req.query.aspect === "1:1" ? "1:1" : "9:16";
        const framingMode: "blur_bg" | "crop_fill" | "letterbox" =
          req.query.framing === "crop_fill" || req.query.framing === "letterbox"
            ? (req.query.framing as "crop_fill" | "letterbox")
            : "blur_bg";
        const audioMode: "original" | "voiceover" | "mix" =
          req.query.audio === "voiceover" || req.query.audio === "mix"
            ? (req.query.audio as "voiceover" | "mix")
            : "original";
        const bypassCensorship = req.query.bypass !== "false" && req.query.bypass !== "0";
        const clipDuration = Math.max(
          5,
          Math.min(300, Math.round(Number(req.query.duration) || 12))
        );
        const styleOptions: SubtitleStyleOptions = {
          theme:
            req.query.theme === "white_gold" || req.query.theme === "neon_amber"
              ? (req.query.theme as "white_gold" | "neon_amber")
              : "gold",
          fontSize:
            req.query.fontSize === "sm" || req.query.fontSize === "lg"
              ? (req.query.fontSize as "sm" | "lg")
              : "md",
          position:
            req.query.position === "top" || req.query.position === "center"
              ? (req.query.position as "top" | "center")
              : "bottom",
        };
        const asyncMode = req.query.async === "1";
        const draftOnly = req.query.draft === "1";
        const language: RecapLanguage = req.query.language === "en" ? "en" : "my";

        const runUploadJob = async (jobState?: RecapJobState) => {
          return enqueueRenderTask({
            label: `Upload: ${fileLabel}`,
            onStatus: (queueStatus) => {
              if (!jobState) return;
              jobState.queuePosition = queueStatus.position;
              jobState.queueLength = queueStatus.queueLength;
              if (queueStatus.queued) {
                jobState.status = "queued";
                jobState.progressPercent = Math.min(jobState.progressPercent || 12, 16);
                jobState.progressMessage = `Render Queue တွင် အစဉ်လိုက် စောင့်ဆိုင်းနေပါသည် (အလှည့် ${queueStatus.position} / ${queueStatus.queueLength}) — RAM ချွေတာရန် ၁ ခုချင်း ထုတ်ပေးနေပါသည်...`;
              } else {
                jobState.status = "processing";
              }
            },
            run: async () => {
              let keepDirForDraft = false;
              try {
                if (jobState) {
                  jobState.status = "processing";
                  jobState.queuePosition = 0;
                  jobState.progressPercent = 22;
                  jobState.progressMessage = probed.hasVideo
                    ? "ဗီဒီယိုဖိုင်ထဲမှ အဓိက မြင်ကွင်းများကို စစ်ဆေးနေပါသည်..."
                    : "အသံဖိုင်ကို စစ်ဆေးပြီး ရုပ်သံနောက်ခံ ပြင်ဆင်နေပါသည်...";
                }

                const framePaths: string[] = [];
                let visualVideoPath = savedMediaPath;
                let audioOnlyPath: string | null = null;

                if (probed.hasVideo) {
                  await extractRealFramesFromVideo(
                    savedMediaPath,
                    probed.durationSec,
                    uploadDir,
                    framePaths,
                    clipDuration > 45 ? 5 : 3
                  );
                } else {
                  visualVideoPath = await ensureCinematicBaseVideo();
                  audioOnlyPath = savedMediaPath;
                }

                while (framePaths.length < 3) {
                  framePaths.push(await createGoldCyberBackdrop(uploadDir, framePaths.length));
                }

                const media: SourceMediaInfo = {
                  normalizedUrl: `https://local.upload/${encodeURIComponent(fileLabel)}`,
                  platform: probed.hasVideo ? "Local_Video" : "Local_Audio",
                  youtubeId: null,
                  title: fileLabel,
                  author: "စက်တွင်း ဖိုင်",
                  description: probed.hasVideo
                    ? "အသုံးပြုသူ တင်သွင်းထားသော ဗီဒီယိုဖိုင်"
                    : "အသုံးပြုသူ တင်သွင်းထားသော အသံဖိုင်",
                  sourceVideoPath: visualVideoPath,
                  sourceAudioPath: audioOnlyPath,
                  videoDurationSec: probed.durationSec,
                  hasAudio: probed.hasAudio,
                  hasVideo: probed.hasVideo,
                  framePaths,
                  sourceType: "media_upload",
                  mimeType: resolvedMeta.mimeType,
                };

                const { recap, clips: specs } = await analyzeUploadedMediaWithGeminiFileApi({
                  filePath: savedMediaPath,
                  mimeType: resolvedMeta.mimeType,
                  media,
                  clipDurationTarget: clipDuration,
                  language,
                  apiKey: userApiKey,
                  onProgress: (percent, msg) => {
                    if (jobState) {
                      jobState.progressPercent = percent;
                      jobState.progressMessage = msg;
                    }
                  },
                });

                if (draftOnly) {
                  pruneOldDraftSessions();
                  keepDirForDraft = true;
                  const draftId = `draft_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
                  draftSessionStore.set(draftId, {
                    id: draftId,
                    createdAt: Date.now(),
                    draftDir: uploadDir,
                    sourceType: "media_upload",
                    media,
                    recapSummary: recap,
                    specs,
                    targetDurationSec: clipDuration,
                  });
                  if (jobState) {
                    jobState.status = "done";
                    jobState.progressPercent = 100;
                    jobState.progressMessage = "Script & Timeline ပြင်ဆင်ရန် အသင့်ဖြစ်ပါပြီ ✓";
                    jobState.sourceTitle = media.title;
                    jobState.recapSummary = recap;
                    jobState.clips = [];
                    jobState.draftMode = true;
                    jobState.draftId = draftId;
                    jobState.targetDurationSec = clipDuration;
                  }
                  return {
                    draftMode: true,
                    draftId,
                    targetDurationSec: clipDuration,
                    sourceTitle: media.title,
                    recapSummary: recap,
                    clips: [],
                  };
                }

                const batchId = `${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;

                if (jobState) {
                  jobState.progressPercent = 70;
                  jobState.progressMessage = `MP4 ရုပ်သံ (${Math.min(clipDuration, Math.round(probed.durationSec))} စက္ကန့်) ကို Hard-code ဖြတ်ထုတ်နေပါသည်...`;
                }
                const outName1 = `KKS_Clip_${batchId}_01.mp4`;
                const clip1 = await renderClipToMp4({
                  clipSpec: specs[0],
                  clipIndex: 0,
                  media,
                  aspectRatio,
                  audioMode,
                  framingMode,
                  bypassCensorship,
                  styleOptions,
                  recapSummary: recap,
                  jobDir: uploadDir,
                  outputFilename: outName1,
                  apiKey: userApiKey,
                });
                const renderedClips: RenderedClipResult[] = [clip1];

                if (jobState) {
                  jobState.status = "done";
                  jobState.progressPercent = 100;
                  jobState.progressMessage = "ပြီးစီးပါပြီ ✓";
                  jobState.sourceTitle = media.title;
                  jobState.recapSummary = recap;
                  jobState.clips = renderedClips;
                }

                if (specs.length > 1 && probed.durationSec >= clipDuration * 1.35) {
                  const outName2 = `KKS_Clip_${batchId}_02.mp4`;
                  const clip2 = await renderClipToMp4({
                    clipSpec: specs[1],
                    clipIndex: 1,
                    media,
                    aspectRatio,
                    audioMode,
                    framingMode,
                    bypassCensorship,
                    styleOptions,
                    recapSummary: recap,
                    jobDir: uploadDir,
                    outputFilename: outName2,
                    apiKey: userApiKey,
                  });
                  renderedClips.push(clip2);
                }

                return { sourceTitle: media.title, recapSummary: recap, clips: renderedClips };
              } finally {
                if (!keepDirForDraft) {
                  try {
                    fs.rmSync(uploadDir, { recursive: true, force: true });
                  } catch {
                    // Ignore cleanup errors
                  }
                }
              }
            },
          });
        };

        await attachDemoQuotaHeaders(req, res);

        if (asyncMode) {
          pruneOldRecapJobs();
          const jobState: RecapJobState = {
            id: uploadId,
            status: "processing",
            progressPercent: 18,
            progressMessage: "ဖိုင်လက်ခံရရှိပြီး Gemini File API ဖြင့် စတင်စစ်ဆေးနေပါသည်...",
            sourceType: "media_upload",
            createdAt: Date.now(),
          };
          recapJobStore.set(uploadId, jobState);
          keepDirOutsideError = true;
          const runPromise = runUploadJob(jobState);
          res.json({
            jobId: uploadId,
            status: jobState.status,
            queuePosition: jobState.queuePosition ?? 0,
            queueLength: jobState.queueLength ?? 0,
          });
          runPromise.catch((err) => {
            console.error("Async upload error:", err);
            jobState.status = "error";
            jobState.error =
              err instanceof Error ? err.message : "ဖိုင်ဖြတ်တောက်ရာတွင် အခက်အခဲ ဖြစ်ပေါ်ခဲ့ပါသည်။";
          });
          return;
        }

        const result = await runUploadJob();
        res.json(result);
      } catch (err) {
        console.error("Upload error:", err);
        if (uploadDirToCleanup && !keepDirOutsideError) {
          try {
            fs.rmSync(uploadDirToCleanup, { recursive: true, force: true });
          } catch {
            // Ignore
          }
        }
        res.status(500).json({ error: "အသံ/ဗီဒီယို ဖြတ်တောက်ရာတွင် အခက်အခဲ ဖြစ်ပေါ်ခဲ့ပါသည်။" });
      }
    }
  );

  // Unified Multi-Source Recap Endpoint (Raw Text / Article URL, YouTube Transcript+Video, Direct Video URL)
  app.post("/api/recap/process", serverFallbackRpmLimiter, demoDailyLimiter, async (req, res) => {
    const userApiKey = extractValidUserApiKey(req);
    const rawUrl = String(req.body?.url || req.body?.articleUrl || "").trim();
    const rawText = String(req.body?.text || "").trim();
    const requestedSourceType = req.body?.sourceType as InputSourceType | undefined;
    const sourceType: InputSourceType =
      requestedSourceType === "text_article" || (rawText.length > 0 && !rawUrl)
        ? "text_article"
        : "youtube";

    const aspectRatio: "9:16" | "16:9" | "1:1" =
      req.body?.aspectRatio === "16:9" ? "16:9" : req.body?.aspectRatio === "1:1" ? "1:1" : "9:16";
    const audioMode: "original" | "voiceover" | "mix" =
      req.body?.audioMode === "voiceover" || req.body?.audioMode === "mix"
        ? req.body.audioMode
        : "original";
    const clipDuration: number = Math.max(5, Math.min(300, Math.round(Number(req.body?.durationSec) || 12)));
    const framingMode: "blur_bg" | "crop_fill" | "letterbox" =
      req.body?.framingMode === "crop_fill" || req.body?.framingMode === "letterbox"
        ? req.body.framingMode
        : "blur_bg";
    const bypassCensorship = req.body?.bypassCensorship !== false;
    const styleOptions: SubtitleStyleOptions = req.body?.styleOptions || {
      theme: "gold",
      fontSize: "md",
      position: "bottom",
    };
    const asyncMode = req.body?.asyncMode === true;
    const draftOnly = req.body?.draftOnly === true;
    const language: RecapLanguage = req.body?.language === "en" ? "en" : "my";

    if (sourceType === "text_article") {
      if (!rawUrl && rawText.length < 20) {
        await refundDemoQuotaHitIfNeeded(req);
        res.status(400).json({
          error: "ကျေးဇူးပြု၍ အနည်းဆုံး စာလုံး ၂၀ ခန့်ပါသော စာသား သို့မဟုတ် ဆောင်းပါး URL ထည့်သွင်းပေးပါ။",
        });
        return;
      }
    } else if (!rawUrl) {
      await refundDemoQuotaHitIfNeeded(req);
      res.status(400).json({ error: "ကျေးဇူးပြု၍ ဗီဒီယို သို့မဟုတ် YouTube Link တစ်ခု ထည့်သွင်းပေးပါ။" });
      return;
    }

    const cacheKeys = buildRecapCacheKey({
      sourceType,
      rawUrl,
      rawText,
      language,
      aspectRatio,
      audioMode,
      clipDuration,
      framingMode,
      bypassCensorship,
      styleOptions,
    });
    if (!draftOnly) {
      const cachedEntry = getCachedRecapResult(cacheKeys);
      if (cachedEntry) {
        await refundDemoQuotaHitIfNeeded(req);
        await attachDemoQuotaHeaders(req, res);
        res.json({
          sourceTitle: cachedEntry.sourceTitle,
          recapSummary: cachedEntry.recapSummary,
          clips: cachedEntry.clips,
          cached: true,
        });
        return;
      }
    }

    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const jobDir = path.join(TMP_JOBS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const executePipeline = async (jobState?: RecapJobState) => {
      return enqueueRenderTask({
        label: sourceType === "text_article" ? "Article / Text Recap" : `Video Recap: ${rawUrl.slice(0, 40)}`,
        onStatus: (queueStatus) => {
          if (!jobState) return;
          jobState.queuePosition = queueStatus.position;
          jobState.queueLength = queueStatus.queueLength;
          if (queueStatus.queued) {
            jobState.status = "queued";
            jobState.progressPercent = Math.min(jobState.progressPercent || 8, 12);
            jobState.progressMessage = `Render Queue တွင် အလှည့်စောင့်ဆိုင်းနေပါသည် (အလှည့် ${queueStatus.position} / ${queueStatus.queueLength}) — ဆာဗာ 512MB RAM တည်ငြိမ်စေရန် ၁ ခုချင်း လုပ်ဆောင်နေပါသည်...`;
          } else {
            jobState.status = "processing";
          }
        },
        run: async () => {
          let keepJobDirForClip2 = false;
          try {
            if (jobState) {
              jobState.status = "processing";
              jobState.queuePosition = 0;
            }
            let media: SourceMediaInfo;

        if (sourceType === "text_article") {
          if (jobState) {
            jobState.progressPercent = 20;
            jobState.progressMessage = rawUrl
              ? "ဆောင်းပါး Link မှ စာသားအချက်အလက်များကို ဖတ်ရှုနေပါသည်..."
              : "ထည့်သွင်းထားသော စာသားကို စစ်ဆေးနေပါသည်...";
          }
          media = await extractArticleSourceMedia(
            { articleUrl: rawUrl, rawText, targetDurationSec: clipDuration },
            jobDir
          );
        } else {
          if (jobState) {
            jobState.progressPercent = 20;
            jobState.progressMessage =
              "YouTube Transcript / Metadata နှင့် Moving Video Stream ကို ဆွဲယူနေပါသည်...";
          }
          media = await extractYouTubeSourceMedia(rawUrl, jobDir, clipDuration);
        }

        if (jobState) {
          jobState.progressPercent = 50;
          jobState.progressMessage =
            language === "en"
              ? "Crafting engaging storyteller recap & synchronized subtitles..."
              : "မြန်မာ Storyteller ဇာတ်ကြောင်းပြောဟန်ဖြင့် Recap နှင့် စာတန်းထိုးများ ဖန်တီးနေပါသည်...";
        }
        const { recap, clips: specs } = await analyzeVideoWithGemini(
          media,
          clipDuration,
          language,
          userApiKey
        );

        if (draftOnly) {
          pruneOldDraftSessions();
          keepJobDirForClip2 = true; // Preserve jobDir media assets for rendering after edit
          const draftId = `draft_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
          draftSessionStore.set(draftId, {
            id: draftId,
            createdAt: Date.now(),
            draftDir: jobDir,
            sourceType,
            media,
            recapSummary: recap,
            specs,
            targetDurationSec: clipDuration,
            cacheKeys,
          });
          if (jobState) {
            jobState.status = "done";
            jobState.progressPercent = 100;
            jobState.progressMessage = "Script & Timeline ပြင်ဆင်ရန် အသင့်ဖြစ်ပါပြီ ✓";
            jobState.sourceTitle = media.title;
            jobState.recapSummary = recap;
            jobState.clips = [];
            jobState.draftMode = true;
            jobState.draftId = draftId;
            jobState.targetDurationSec = clipDuration;
          }
          return {
            draftMode: true,
            draftId,
            targetDurationSec: clipDuration,
            sourceTitle: media.title,
            recapSummary: recap,
            clips: [],
          };
        }

        const batchId = `${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;

        if (jobState) {
          const targetOutDur = media.videoDurationSec
            ? Math.min(clipDuration, Math.round(media.videoDurationSec))
            : clipDuration;
          jobState.progressPercent = 72;
          jobState.progressMessage = `MP4 ဗီဒီယို (${targetOutDur} စက္ကန့်စာ) ပေါ်တွင် မြန်မာစာတန်းထိုး Hard-code ထည့်သွင်းနေပါသည်...`;
        }

        const outName1 = `KKS_Clip_${batchId}_01.mp4`;
        const clip1 = await renderClipToMp4({
          clipSpec: specs[0],
          clipIndex: 0,
          media,
          aspectRatio,
          audioMode,
          framingMode,
          bypassCensorship,
          styleOptions,
          recapSummary: recap,
          jobDir,
          outputFilename: outName1,
          apiKey: userApiKey,
        });

        const renderedClips: RenderedClipResult[] = [clip1];

        setCachedRecapResult(cacheKeys, {
          sourceTitle: media.title,
          recapSummary: recap,
          clips: renderedClips,
        });

        if (jobState) {
          jobState.status = "done";
          jobState.progressPercent = 100;
          jobState.progressMessage = "အနှစ်ချုပ်နှင့် ဗီဒီယို ဖန်တီးမှု ပြီးစီးပါပြီ ✓";
          jobState.sourceTitle = media.title;
          jobState.recapSummary = recap;
          jobState.clips = renderedClips;
        }

        const shouldRenderClip2 =
          sourceType !== "text_article" &&
          specs.length > 1 &&
          (!media.videoDurationSec || media.videoDurationSec >= clipDuration * 1.35);
        if (shouldRenderClip2) {
          keepJobDirForClip2 = true;
          (async () => {
            try {
              const outName2 = `KKS_Clip_${batchId}_02.mp4`;
              const clip2 = await renderClipToMp4({
                clipSpec: specs[1],
                clipIndex: 1,
                media,
                aspectRatio,
                audioMode,
                framingMode,
                bypassCensorship,
                styleOptions,
                recapSummary: recap,
                jobDir,
                outputFilename: outName2,
                apiKey: userApiKey,
              });
              renderedClips.push(clip2);
              setCachedRecapResult(cacheKeys, {
                sourceTitle: media.title,
                recapSummary: recap,
                clips: renderedClips,
              });
            } catch (clip2Err) {
              console.warn("Clip 2 background render warning:", clip2Err);
            } finally {
              try {
                fs.rmSync(jobDir, { recursive: true, force: true });
              } catch {
                // Ignore
              }
            }
          })();
        }

        return { sourceTitle: media.title, recapSummary: recap, clips: renderedClips };
          } finally {
            if (!keepJobDirForClip2) {
              try {
                fs.rmSync(jobDir, { recursive: true, force: true });
              } catch {
                // Ignore
              }
            }
          }
        },
      });
    };

    await attachDemoQuotaHeaders(req, res);

    if (asyncMode) {
      pruneOldRecapJobs();
      const jobState: RecapJobState = {
        id: jobId,
        status: "processing",
        progressPercent: 10,
        progressMessage:
          sourceType === "text_article"
            ? "ဆောင်းပါး / စာသား အနှစ်ချုပ် စတင်ပြုလုပ်နေပါသည်..."
            : "ဗီဒီယို Link ကို စတင်စစ်ဆေးနေပါသည်...",
        sourceType,
        createdAt: Date.now(),
      };
      recapJobStore.set(jobId, jobState);
      const runPromise = executePipeline(jobState);
      res.json({
        jobId,
        status: jobState.status,
        queuePosition: jobState.queuePosition ?? 0,
        queueLength: jobState.queueLength ?? 0,
      });

      runPromise.catch((err: any) => {
        console.error("Async recap process error:", err);
        jobState.status = "error";
        jobState.error = isRateLimitError(err)
          ? "Gemini AI API တောင်းဆိုမှု အရေအတွက် ခေတ္တ ပြည့်နေပါသည် (Rate limit exceeded)။ Settings ထဲတွင် ကိုယ်ပိုင် Free Gemini API Key ထည့်သွင်း၍ဖြစ်စေ စက္ကန့်အနည်းငယ် စောင့်ဆိုင်း၍ဖြစ်စေ ထပ်မံ ကြိုးစားပေးပါ။"
          : err instanceof Error
          ? err.message
          : "အနှစ်ချုပ် ဖန်တီးရာတွင် အခက်အခဲ ဖြစ်ပေါ်နေပါသည်။ ထည့်သွင်းမှုကို စစ်ဆေးပြီး ထပ်မံကြိုးစားပါ။";
      });
      return;
    }

    try {
      const payload = await executePipeline();
      res.json(payload);
    } catch (err: any) {
      console.error("Recap process error:", err);
      if (isRateLimitError(err)) {
        res.status(429).json({
          error:
            "Gemini AI API တောင်းဆိုမှု အရေအတွက် ခေတ္တ ပြည့်နေပါသည် (Rate limit exceeded)။ Settings ထဲတွင် ကိုယ်ပိုင် Free Gemini API Key ထည့်သွင်း၍ဖြစ်စေ စက္ကန့်အနည်းငယ် စောင့်ဆိုင်း၍ဖြစ်စေ ထပ်မံ ကြိုးစားပေးပါ။",
        });
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : "အနှစ်ချုပ် ဖန်တီးရာတွင် အခက်အခဲ ဖြစ်ပေါ်နေပါသည်။ ထည့်သွင်းမှုကို စစ်ဆေးပြီး ထပ်မံကြိုးစားပါ။";
      res.status(500).json({ error: message });
    }
  });

  // Render final MP4 video + optional regenerated voiceover TTS from user-edited recap script & timeline segments
  app.post("/api/recap/render-from-script", serverFallbackRpmLimiter, async (req, res) => {
    try {
      const userApiKey = extractValidUserApiKey(req);
      const draftId = String(req.body?.draftId || "").trim();
      const originalFilename = String(req.body?.originalFilename || "").trim();
      const rawRecap = req.body?.recapSummary;
      if (!rawRecap || typeof rawRecap !== "object") {
        res.status(400).json({ error: "ပြင်ဆင်ထားသော Recap Script အချက်အလက် မပြည့်စုံပါ။" });
        return;
      }

      const editedRecap = sanitizeStructuredRecapInput(rawRecap);
      const aspectRatio: "9:16" | "16:9" | "1:1" =
        req.body?.aspectRatio === "16:9" ? "16:9" : req.body?.aspectRatio === "1:1" ? "1:1" : "9:16";
      const audioMode: "original" | "voiceover" | "mix" =
        req.body?.audioMode === "voiceover" || req.body?.audioMode === "mix"
          ? req.body.audioMode
          : "original";
      const framingMode: "blur_bg" | "crop_fill" | "letterbox" =
        req.body?.framingMode === "crop_fill" || req.body?.framingMode === "letterbox"
          ? req.body.framingMode
          : "blur_bg";
      const bypassCensorship = req.body?.bypassCensorship !== false;
      const requestedDuration = Math.max(5, Math.min(300, Math.round(Number(req.body?.durationSec) || 12)));
      const styleOptions: SubtitleStyleOptions = req.body?.styleOptions || {
        theme: "gold",
        fontSize: "md",
        position: "bottom",
      };

      const draftSession = draftId ? draftSessionStore.get(draftId) : undefined;
      if (draftSession) {
        const effectiveDuration =
          draftSession.sourceType === "text_article"
            ? Math.min(30, requestedDuration || draftSession.targetDurationSec)
            : requestedDuration || draftSession.targetDurationSec;

        const updatedSpec = buildClipSpecFromEditedRecap(
          editedRecap,
          draftSession.specs[0],
          effectiveDuration
        );
        const batchId = `${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
        const outName1 = `KKS_ScriptClip_${batchId}_01.mp4`;
        const renderDir = path.join(TMP_JOBS_DIR, `render_${batchId}`);
        fs.mkdirSync(renderDir, { recursive: true });

        try {
          const clip1 = await enqueueRenderTask({
            label: `Script Render: ${editedRecap.title.slice(0, 32)}`,
            run: () =>
              renderClipToMp4({
                clipSpec: updatedSpec,
                clipIndex: 0,
                media: draftSession.media,
                aspectRatio,
                audioMode,
                framingMode,
                bypassCensorship,
                styleOptions,
                recapSummary: editedRecap,
                jobDir: renderDir,
                outputFilename: outName1,
                apiKey: userApiKey,
              }),
          });

          const renderedClips: RenderedClipResult[] = [clip1];
          if (draftSession.cacheKeys) {
            setCachedRecapResult(draftSession.cacheKeys, {
              sourceTitle: draftSession.media.title,
              recapSummary: editedRecap,
              clips: renderedClips,
            });
          }

          res.json({
            sourceTitle: draftSession.media.title,
            recapSummary: editedRecap,
            clips: renderedClips,
            renderedFromScript: true,
          });
          return;
        } finally {
          fs.rmSync(renderDir, { recursive: true, force: true });
        }
      }

      if (originalFilename) {
        const safeOriginal = path.basename(originalFilename);
        const resolvedOriginalPath = path.resolve(CLIPS_DIR, safeOriginal);
        if (
          !resolvedOriginalPath.startsWith(CLIPS_DIR + path.sep) ||
          !fs.existsSync(resolvedOriginalPath)
        ) {
          res.status(404).json({ error: "မူရင်း ဗီဒီယိုဖိုင် မတွေ့ရှိပါ။" });
          return;
        }

        const updatedSpec = buildClipSpecFromEditedRecap(editedRecap, undefined, requestedDuration);
        const payload = await reburnClipSubtitles({
          originalPath: resolvedOriginalPath,
          subtitles: updatedSpec.subtitles,
          titleBurmese: editedRecap.title,
          aspectRatio,
          framingMode,
          bypassCensorship,
          styleOptions,
          durationSec: requestedDuration,
          narrationBurmese: updatedSpec.narrationBurmese,
          audioMode,
          apiKey: userApiKey,
        });

        res.json({
          sourceTitle: editedRecap.title,
          recapSummary: editedRecap,
          renderedFromScript: true,
          rebuiltClip: {
            ...payload,
            titleBurmese: editedRecap.title,
            summaryBurmese: editedRecap.executiveSummary,
            audioMode,
            framingMode,
            styleOptions,
            recapSummary: editedRecap,
          },
        });
        return;
      }

      // Fallback when rendering directly from a text-only / edited recap without an active MP4
      const batchId = `${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
      const renderDir = path.join(TMP_JOBS_DIR, `script_only_${batchId}`);
      fs.mkdirSync(renderDir, { recursive: true });
      try {
        const clip1 = await enqueueRenderTask({
          label: `Script Fallback Render: ${editedRecap.title.slice(0, 32)}`,
          run: async () => {
            const baseVideo = await ensureCinematicBaseVideo();
            const probed = await probeMediaFile(baseVideo);
            const framePaths: string[] = [];
            for (let i = 0; i < 3; i++) {
              framePaths.push(await createGoldCyberBackdrop(renderDir, i));
            }

            const fallbackMedia: SourceMediaInfo = {
              normalizedUrl: "https://kks.studio/edited-script",
              platform: "KKS_Script_Studio",
              youtubeId: null,
              title: editedRecap.title,
              author: "KKS Studio Editor",
              description: editedRecap.executiveSummary.slice(0, 200),
              sourceVideoPath: baseVideo,
              videoDurationSec: probed?.durationSec || 30,
              hasAudio: probed?.hasAudio ?? true,
              framePaths,
              sourceType: "text_article",
            };
            const updatedSpec = buildClipSpecFromEditedRecap(editedRecap, undefined, requestedDuration);
            return renderClipToMp4({
              clipSpec: updatedSpec,
              clipIndex: 0,
              media: fallbackMedia,
              aspectRatio,
              audioMode,
              framingMode,
              bypassCensorship,
              styleOptions,
              recapSummary: editedRecap,
              jobDir: renderDir,
              outputFilename: `KKS_ScriptClip_${batchId}_01.mp4`,
              apiKey: userApiKey,
            });
          },
        });

        res.json({
          sourceTitle: editedRecap.title,
          recapSummary: editedRecap,
          clips: [clip1],
          renderedFromScript: true,
        });
      } finally {
        fs.rmSync(renderDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error("Render-from-script error:", err);
      res.status(500).json({
        error: "ပြင်ဆင်ထားသော Script ဖြင့် ဗီဒီယို ဖန်တီးရာတွင် အခက်အခဲ ရှိနေပါသည်။",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(ROOT_DIR, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (
      err &&
      (err.name === "RangeNotSatisfiableError" ||
        err.status === 416 ||
        err.statusCode === 416 ||
        (typeof err.message === "string" && err.message.includes("Range Not Satisfiable")))
    ) {
      if (!res.headersSent) {
        res.status(416).setHeader("Content-Range", "bytes */*").end();
      }
      return;
    }
    console.error("Express unhandled error:", err);
    if (!res.headersSent) {
      if (isRateLimitError(err)) {
        res.status(429).json({
          error:
            "ဆာဗာ တောင်းဆိုမှု အရေအတွက် ခေတ္တ ပြည့်နေပါသည် (Rate limit exceeded)။ စက္ကန့်အနည်းငယ် စောင့်ဆိုင်းပြီး ထပ်မံ ကြိုးစားပေးပါ။",
        });
        return;
      }
      res.status(err.status || 500).json({ error: err.message || "Internal server error" });
    }
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`KKS Recap AI (Gold Mode) server listening on http://0.0.0.0:${PORT}`);
    setTimeout(() => {
      ensureShowcaseClips().catch((err) => {
        console.error("Showcase warmup error:", err);
      });
    }, 1000);
  });
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  server.setTimeout(900000);
}

startServer();
