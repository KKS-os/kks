import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT_DIR } from "./types.ts";
import type { SourceMediaInfo } from "./types.ts";

const execFileAsync = promisify(execFile);

const YT_DLP_PATHS = [
  "/usr/local/bin/yt-dlp",
  path.resolve(ROOT_DIR, "bin", "yt-dlp"),
  "/tmp/yt-dlp_linux",
  "/tmp/yt-dlp",
  "/usr/bin/yt-dlp",
];

const CINEMA_BASE_PATH = path.resolve(ROOT_DIR, "public", "assets", "cinema_base.mp4");

function findYtDlpBinary(): string | null {
  for (const candidate of YT_DLP_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function ensureYtDlpBinary(): Promise<string | null> {
  const existing = findYtDlpBinary();
  if (existing) return existing;
  const target = path.resolve(ROOT_DIR, "bin", "yt-dlp");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    await execFileAsync(
      "curl",
      [
        "-L",
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
        "-o",
        target,
      ],
      { timeout: 60000 }
    );
    fs.chmodSync(target, 0o755);
    return target;
  } catch {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(target, Buffer.from(arrayBuffer));
      fs.chmodSync(target, 0o755);
      return target;
    } catch {
      return null;
    }
  }
}

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && id.length === 11 ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = parsed.searchParams.get("v");
      if (v && v.length === 11) return v;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") &&
        parts[1] &&
        parts[1].length >= 11
      ) {
        return parts[1].slice(0, 11);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function detectPlatform(rawUrl: string): string {
  const lower = rawUrl.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "Stream_YT";
  if (lower.includes("facebook.com") || lower.includes("fb.watch") || lower.includes("fb.com")) return "Stream_FB";
  if (lower.includes("tiktok.com")) return "Stream_TT";
  if (lower.includes("instagram.com")) return "Stream_IG";
  if (lower.includes("vimeo.com")) return "Stream_VM";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower)) return "Direct_Video";
  return "Web_Video";
}

export function normalizeUserUrl(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) throw new Error("ဗီဒီယို Link ထည့်သွင်းပေးပါ။");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("မှန်ကန်သော http/https Video Link ထည့်သွင်းပေးပါ။");
  }
  return parsed.toString();
}

async function fetchBufferWithTimeout(
  url: string,
  timeoutMs: number,
  maxBytes = 48 * 1024 * 1024,
  extraHeaders: Record<string, string> = {}
): Promise<{ buffer: Buffer; contentType: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "*/*",
        ...extraHeaders,
      },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return null;
    const contentType = res.headers.get("content-type") || "";
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return { buffer: Buffer.concat(chunks), contentType, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function ensureCinematicBaseVideo(): Promise<string> {
  if (fs.existsSync(CINEMA_BASE_PATH)) {
    try {
      const stat = fs.statSync(CINEMA_BASE_PATH);
      if (stat.size > 20000) return CINEMA_BASE_PATH;
    } catch {
      // regenerate if unreadable
    }
  }
  const assetsDir = path.dirname(CINEMA_BASE_PATH);
  fs.mkdirSync(assetsDir, { recursive: true });

  try {
    // Generate a high-definition luxury cinematic moving motion background (never a still frame or color bar)
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", "gradients=s=1280x720:d=30:r=24:c0=0x150F02:c1=0x422B06:c2=0x221603:speed=0.005",
      "-f", "lavfi",
      "-i", "aevalsrc=0.03*sin(2*PI*110*t)+0.02*sin(2*PI*164*t):s=24000:d=30",
      "-t", "30",
      "-filter_complex",
      "[0:v]vignette=PI/4,drawbox=x=0:y=ih*0.49:w=iw:h=2:color=0xD4AF37@0.4:t=fill[v]",
      "-map", "[v]",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      CINEMA_BASE_PATH,
    ]);
  } catch (err) {
    console.error("Failed to generate cinema base video:", err);
  }
  return CINEMA_BASE_PATH;
}

export async function probeMediaFile(
  filePath: string
): Promise<{ durationSec: number; hasAudio: boolean; hasVideo: boolean } | null> {
  try {
    const args = ["-v", "error"];
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      args.push(
        "-user_agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5"
      );
    }
    args.push(
      "-show_entries",
      "format=duration:stream=codec_type,duration",
      "-of",
      "json",
      filePath
    );
    const { stdout } = await execFileAsync("ffprobe", args, { timeout: 10000 });
    const parsed = JSON.parse(stdout);
    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    const hasVideo = streams.some((s: { codec_type?: string }) => s.codec_type === "video");
    const hasAudio = streams.some((s: { codec_type?: string }) => s.codec_type === "audio");
    if (!hasVideo && !hasAudio) return null;

    let duration = Number(parsed?.format?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      const streamDur = Number(streams.find((s: { duration?: string }) => s.duration)?.duration || 0);
      duration = streamDur > 0 ? streamDur : 120; // Default sensible fallback duration
    }
    return { durationSec: duration, hasAudio, hasVideo };
  } catch {
    return null;
  }
}

export async function createGoldCyberBackdrop(jobDir: string, index: number): Promise<string> {
  const generatedPath = path.join(jobDir, `gold_backdrop_${index}.jpg`);
  if (!fs.existsSync(generatedPath)) {
    const colors = ["0x0A0803", "0x120E05", "0x0E0B04"];
    const c = colors[index % colors.length];
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${c}:s=720x1280:d=1`,
      "-frames:v",
      "1",
      generatedPath,
    ]);
  }
  return generatedPath;
}

async function downloadVideoSectionOrFile(
  mediaUrl: string,
  destPath: string,
  refererUrl?: string,
  maxDurationSec = 60
): Promise<{ durationSec: number; hasAudio: boolean } | null> {
  const safeMaxDur = Math.max(15, Math.min(340, Math.round(maxDurationSec)));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Range: "bytes=0-1023",
    };
    if (refererUrl) headers["Referer"] = refererUrl;
    const check = await fetch(mediaUrl, { signal: ctrl.signal, headers, redirect: "follow" });
    if (!check.ok && check.status !== 206) {
      return null;
    }
    const ctype = (check.headers.get("content-type") || "").toLowerCase();
    if (ctype.includes("text/html") || ctype.includes("application/json")) {
      return null;
    }
  } catch {
    // Proceed carefully to ffmpeg/fetch fallback
  } finally {
    clearTimeout(timer);
  }

  // 1. Fast HTTP stream copy of requested duration window via ffmpeg
  try {
    const ffArgs = [
      "-y",
      "-user_agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    ];
    if (refererUrl) {
      ffArgs.push("-headers", `Referer: ${refererUrl}\r\n`);
    }
    ffArgs.push(
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "3",
      "-ss", "0",
      "-t", String(safeMaxDur),
      "-i", mediaUrl,
      "-c", "copy",
      "-movflags", "+faststart",
      destPath
    );
    const ffTimeout = Math.max(30000, Math.min(240000, safeMaxDur * 800));
    await execFileAsync("ffmpeg", ffArgs, { timeout: ffTimeout });
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 20000) {
      const probed = await probeMediaFile(destPath);
      if (probed) return probed;
    }
  } catch {
    // Fallback to direct buffered fetch
  }

  // 2. Direct fetch fallback for servers that reject Range or ffmpeg headers
  const extraHeaders: Record<string, string> = {};
  if (refererUrl) extraHeaders["Referer"] = refererUrl;
  const dlTimeout = Math.max(20000, Math.min(180000, safeMaxDur * 600));
  const mediaRes = await fetchBufferWithTimeout(mediaUrl, dlTimeout, 150 * 1024 * 1024, extraHeaders);
  if (mediaRes && mediaRes.buffer.byteLength > 20000 && !mediaRes.contentType.includes("text/html")) {
    fs.writeFileSync(destPath, mediaRes.buffer);
    const probed = await probeMediaFile(destPath);
    if (probed) return probed;
  }

  return null;
}

async function resolveRedirectUrl(rawUrl: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(rawUrl, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return res.url || rawUrl;
  } catch {
    return rawUrl;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveViaTikWm(
  url: string,
  destPath: string,
  maxDurationSec = 60
): Promise<{
  probed: { durationSec: number; hasAudio: boolean };
  title?: string;
  author?: string;
  coverUrl?: string;
} | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const apiRes = await fetch(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
      {
        signal: ctrl.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      }
    );
    if (!apiRes.ok) return null;
    const json: any = await apiRes.json();
    if (json?.code !== 0 || !json?.data) return null;
    const candidates = [json.data.hdplay, json.data.play, json.data.wmplay].filter(
      (u: unknown): u is string => typeof u === "string" && u.startsWith("http")
    );
    for (const dlUrl of candidates) {
      const probed = await downloadVideoSectionOrFile(
        dlUrl,
        destPath,
        "https://www.tikwm.com/",
        maxDurationSec
      );
      if (probed) {
        return {
          probed,
          title: typeof json.data.title === "string" ? json.data.title : undefined,
          author:
            typeof json.data.author?.nickname === "string"
              ? json.data.author.nickname
              : typeof json.data.author?.unique_id === "string"
              ? json.data.author.unique_id
              : undefined,
          coverUrl: typeof json.data.cover === "string" ? json.data.cover : undefined,
        };
      }
    }
  } catch {
    // Fallback cleanly
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function resolveViaClipto(
  url: string,
  destPath: string,
  maxDurationSec = 60
): Promise<{
  probed: { durationSec: number; hasAudio: boolean };
  title?: string;
  author?: string;
  thumbnail?: string;
} | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch("https://www.clipto.com/api/youtube", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json?.success || !Array.isArray(json?.medias) || json.medias.length === 0) return null;

    const qualityRank = (m: any): number => {
      const q = String(m.quality || "").toLowerCase();
      if (m.type === "audio" || q === "audio" || m.audioAvailable === false) return 100;
      if (q === "hd_no_watermark" || q === "hd") return 1;
      if (q === "720p" || q === "mp4 (720p) avc1") return 2;
      if (q === "no_watermark" || q === "sd") return 3;
      if (q === "360p" || q.includes("360p")) return 4;
      if (m.type === "video") return 5;
      return 50;
    };

    const sortedMedias = [...json.medias]
      .filter((m: any) => typeof m?.url === "string" && m.url.startsWith("http") && m.type !== "audio")
      .sort((a, b) => qualityRank(a) - qualityRank(b));

    for (const m of sortedMedias.slice(0, 3)) {
      const probed = await downloadVideoSectionOrFile(m.url, destPath, undefined, maxDurationSec);
      if (probed) {
        return {
          probed,
          title: typeof json.title === "string" ? json.title : undefined,
          author: typeof json.author === "string" ? json.author : undefined,
          thumbnail: typeof json.thumbnail === "string" ? json.thumbnail : undefined,
        };
      }
    }
  } catch {
    // Fallback cleanly
  } finally {
    clearTimeout(timer);
  }
  return null;
}

export async function extractRealFramesFromVideo(
  videoPath: string,
  durationSec: number,
  jobDir: string,
  framePaths: string[],
  desiredFrames = 3
): Promise<void> {
  try {
    const safeDur = Math.max(1, durationSec);
    const frameCount = Math.max(3, Math.min(6, desiredFrames));
    for (let i = 0; i < frameCount; i++) {
      const frac = (i + 0.5) / frameCount;
      const snapSec = Math.min(Math.max(0.4, safeDur * frac), Math.max(0.5, safeDur - 0.3));
      const snapPath = path.join(jobDir, `frame_${i}.jpg`);
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-ss",
          snapSec.toFixed(2),
          "-i",
          videoPath,
          "-vframes",
          "1",
          "-q:v",
          "3",
          snapPath,
        ],
        { timeout: 12000 }
      );
      if (fs.existsSync(snapPath) && fs.statSync(snapPath).size > 1000) {
        framePaths.unshift(snapPath);
      }
    }
  } catch (snapErr) {
    console.warn("Real frame thumbnail extraction warning:", snapErr);
  }
}

export async function extractSourceMedia(
  rawUrl: string,
  jobDir: string,
  targetDurationSec = 12
): Promise<SourceMediaInfo> {
  const clampedTarget = Math.max(5, Math.min(300, Math.round(targetDurationSec)));
  const downloadWindowSec = Math.min(330, Math.max(45, clampedTarget + 15));

  const normalizedUrl = normalizeUserUrl(rawUrl);
  const platform = detectPlatform(normalizedUrl);
  const youtubeId = extractYouTubeId(normalizedUrl);

  let title = "";
  let author = "";
  let description = "";
  const framePaths: string[] = [];
  let ogVideoCandidate: string | null = null;

  // 1. Metadata & Thumbnail Discovery
  if (youtubeId) {
    try {
      const oembedRes = await fetchBufferWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}&format=json`,
        4500,
        256 * 1024
      );
      if (oembedRes) {
        const json = JSON.parse(oembedRes.buffer.toString("utf-8"));
        title = json.title || "";
        author = json.author_name || "";
      }
    } catch {
      // Ignore oembed error
    }
  } else if (platform !== "Direct_Video") {
    const htmlRes = await fetchBufferWithTimeout(normalizedUrl, 5000, 1024 * 1024);
    if (htmlRes && htmlRes.contentType.includes("text/html")) {
      const html = htmlRes.buffer.toString("utf-8");
      const ogTitle =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      const ogDesc =
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
      const ogVideo =
        html.match(/<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta[^>]+property=["']og:video:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<video[^>]+src=["']([^"']+\.(?:mp4|webm|mov)[^"']*)["']/i)?.[1];

      if (ogTitle && !ogTitle.toLowerCase().includes("discover popular videos")) {
        title = decodeHtmlEntities(ogTitle);
      }
      if (ogDesc) description = decodeHtmlEntities(ogDesc);
      if (ogVideo) {
        const cleanVid = decodeHtmlEntities(ogVideo);
        if (cleanVid.startsWith("http")) ogVideoCandidate = cleanVid;
      }
    }
  }

  // 2. Real Moving Video Stream Acquisition (STRICTLY real video — NEVER fake photo pan/zoom!)
  let sourceVideoPath: string | null = null;
  let videoDurationSec: number | null = null;
  let hasAudio = false;
  let sawYouTubeBotWall = false;

  const candidateSourcePath = path.join(jobDir, "source.mp4");

  if (platform === "Direct_Video") {
    const probedUrl = await probeMediaFile(normalizedUrl);
    if (probedUrl) {
      sourceVideoPath = normalizedUrl;
      videoDurationSec = probedUrl.durationSec;
      hasAudio = probedUrl.hasAudio;
    } else {
      const probedDl = await downloadVideoSectionOrFile(
        normalizedUrl,
        candidateSourcePath,
        undefined,
        downloadWindowSec
      );
      if (probedDl) {
        sourceVideoPath = candidateSourcePath;
        videoDurationSec = probedDl.durationSec;
        hasAudio = probedDl.hasAudio;
      }
    }
  } else {
    // Tier A: Platform-native API resolvers (TikWM for TikTok, Clipto for FB/TT/IG)
    if (platform === "Stream_TT") {
      const tikRes = await resolveViaTikWm(normalizedUrl, candidateSourcePath, downloadWindowSec);
      if (tikRes) {
        sourceVideoPath = candidateSourcePath;
        videoDurationSec = tikRes.probed.durationSec;
        hasAudio = tikRes.probed.hasAudio;
        if (tikRes.title) title = tikRes.title;
        if (tikRes.author) author = tikRes.author;
      }
      if (!sourceVideoPath) {
        const cliptoRes = await resolveViaClipto(normalizedUrl, candidateSourcePath, downloadWindowSec);
        if (cliptoRes) {
          sourceVideoPath = candidateSourcePath;
          videoDurationSec = cliptoRes.probed.durationSec;
          hasAudio = cliptoRes.probed.hasAudio;
          if (cliptoRes.title && (!title || title.startsWith("- "))) title = cliptoRes.title;
          if (cliptoRes.author) author = cliptoRes.author;
        }
      }
    } else if (platform === "Stream_FB" || platform === "Stream_IG") {
      let targetSocialUrl = normalizedUrl;
      if (
        normalizedUrl.includes("/share/") ||
        normalizedUrl.includes("fb.watch")
      ) {
        const resolved = await resolveRedirectUrl(normalizedUrl);
        if (resolved && resolved.startsWith("http")) {
          targetSocialUrl = resolved;
        }
      }

      const cliptoRes = await resolveViaClipto(targetSocialUrl, candidateSourcePath, downloadWindowSec);
      if (cliptoRes) {
        sourceVideoPath = candidateSourcePath;
        videoDurationSec = cliptoRes.probed.durationSec;
        hasAudio = cliptoRes.probed.hasAudio;
        if (cliptoRes.title && cliptoRes.title !== "- Facebook Reel" && !title) {
          title = cliptoRes.title;
        }
        if (cliptoRes.author && cliptoRes.author !== "User" && !author) {
          author = cliptoRes.author;
        }
      } else if (targetSocialUrl !== normalizedUrl) {
        const cliptoOrig = await resolveViaClipto(normalizedUrl, candidateSourcePath, downloadWindowSec);
        if (cliptoOrig) {
          sourceVideoPath = candidateSourcePath;
          videoDurationSec = cliptoOrig.probed.durationSec;
          hasAudio = cliptoOrig.probed.hasAudio;
          if (cliptoOrig.title && cliptoOrig.title !== "- Facebook Reel" && !title) {
            title = cliptoOrig.title;
          }
        }
      }
    } else if (platform === "Web_Video" && ogVideoCandidate) {
      const probedOg = await downloadVideoSectionOrFile(
        ogVideoCandidate,
        candidateSourcePath,
        normalizedUrl,
        downloadWindowSec
      );
      if (probedOg) {
        sourceVideoPath = candidateSourcePath;
        videoDurationSec = probedOg.durationSec;
        hasAudio = probedOg.hasAudio;
      }
    }

    // Tier B: yt-dlp real video stream extractor (primary for YouTube, backup for FB/TT/IG/Web)
    if (!sourceVideoPath) {
      const ytDlpBin = await ensureYtDlpBinary();
      if (ytDlpBin) {
        const nodeJsRuntime = `node:${process.execPath}`;
        const ytTimeout = Math.max(35000, Math.min(240000, downloadWindowSec * 700));

        const readDownloadedYtDlpFile = async (): Promise<string | null> => {
          const infoJsonFiles = fs.readdirSync(jobDir).filter((f) => f.endsWith(".info.json"));
          if (infoJsonFiles.length > 0) {
            try {
              const rawJson = fs.readFileSync(path.join(jobDir, infoJsonFiles[0]), "utf-8");
              const parsed = JSON.parse(rawJson);
              if (parsed.title) title = String(parsed.title);
              if (parsed.uploader) author = String(parsed.uploader);
              if (parsed.description) description = String(parsed.description).slice(0, 500);
              if (parsed.duration) videoDurationSec = Number(parsed.duration);
            } catch {
              // Ignore json parse error
            }
          }

          if (fs.existsSync(candidateSourcePath) && fs.statSync(candidateSourcePath).size > 20000) {
            return candidateSourcePath;
          }
          const files = fs.readdirSync(jobDir);
          const found = files.find(
            (f) => f.startsWith("source.") && !f.endsWith(".json") && !f.endsWith(".part") && !f.endsWith(".ytdl")
          );
          if (found) {
            const full = path.join(jobDir, found);
            if (fs.statSync(full).size > 20000) return full;
          }
          return null;
        };

        // Attempt 1: Fast section download matching requested window up to 5.5 min
        try {
          await execFileAsync(
            ytDlpBin,
            [
              "-4",
              "--no-playlist",
              "--no-warnings",
              "--no-check-certificates",
              "--socket-timeout",
              "12",
              "--ffmpeg-location",
              "/usr/bin/ffmpeg",
              "--js-runtimes",
              nodeJsRuntime,
              "-f",
              "18/bestvideo[vcodec^=avc1][height<=720]+bestaudio[acodec^=mp4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best",
              "--download-sections",
              `*0-${downloadWindowSec}`,
              "--merge-output-format",
              "mp4",
              "--write-info-json",
              "-o",
              path.join(jobDir, "source.%(ext)s"),
              normalizedUrl,
            ],
            { timeout: ytTimeout }
          );

          const chosen = await readDownloadedYtDlpFile();
          if (chosen) {
            const probed = await probeMediaFile(chosen);
            if (probed) {
              sourceVideoPath = chosen;
              videoDurationSec = probed.durationSec;
              hasAudio = probed.hasAudio;
            }
          }
        } catch (sectionErr: any) {
          const errText = String(sectionErr?.stderr || sectionErr?.message || "");
          if (errText.includes("Sign in to confirm") || errText.includes("not a bot")) {
            sawYouTubeBotWall = true;
          }
          console.warn("yt-dlp fast section download skipped:", errText.slice(0, 220));
        }

        // Attempt 2: Direct file download with 150MB size limit (when download-sections isn't supported)
        if (!sourceVideoPath && !sawYouTubeBotWall) {
          try {
            await execFileAsync(
              ytDlpBin,
              [
                "-4",
                "--no-playlist",
                "--no-warnings",
                "--no-check-certificates",
                "--socket-timeout",
                "12",
                "--ffmpeg-location",
                "/usr/bin/ffmpeg",
                "--js-runtimes",
                nodeJsRuntime,
                "-f",
                "18/best[height<=720][ext=mp4]/best[height<=720]/best",
                "--max-filesize",
                "150M",
                "--merge-output-format",
                "mp4",
                "--write-info-json",
                "-o",
                path.join(jobDir, "source.%(ext)s"),
                normalizedUrl,
              ],
              { timeout: ytTimeout }
            );

            const chosen = await readDownloadedYtDlpFile();
            if (chosen) {
              const probed = await probeMediaFile(chosen);
              if (probed) {
                sourceVideoPath = chosen;
                videoDurationSec = probed.durationSec;
                hasAudio = probed.hasAudio;
              }
            }
          } catch (fallbackErr: any) {
            const errText = String(fallbackErr?.stderr || fallbackErr?.message || "");
            if (errText.includes("Sign in to confirm") || errText.includes("not a bot")) {
              sawYouTubeBotWall = true;
            }
            console.warn("yt-dlp fallback download skipped:", errText.slice(0, 220));
          }
        }
      }
    }
  }

  // STRICT CHECK: NEVER fall back to turning a still thumbnail photo or dark gradient into the user's video!
  if (!sourceVideoPath) {
    if (platform === "Stream_YT" && sawYouTubeBotWall) {
      throw new Error(
        "YouTube မှ Cloud Server ကို ယာယီ Bot စစ်ဆေးကန့်သတ်ထားသဖြင့် ဤ YouTube Link ကို တိုက်ရိုက်ဒေါင်းလုဒ်ဆွဲ၍ မရနိုင်သေးပါ။ ဓာတ်ပုံဖြင့် အစားထိုးခြင်း မပြုဘဲ တကယ့်ဗီဒီယိုဖိုင် ရရှိမှသာ ဖြတ်တောက်ပေးမည်ဖြစ်ပါသဖြင့် TikTok / Facebook / Direct MP4 Link များ သို့မဟုတ် အောက်ပါ 'ဗီဒီယိုဖိုင် ရွေးမည် (Upload)' ခလုတ်ကို အသုံးပြုပေးပါ။"
      );
    }
    throw new Error(
      "ဤ Link မှ ရုပ်သံဗီဒီယိုဖိုင် (Moving Video Stream) ကို တိုက်ရိုက်ရယူ၍ မရနိုင်ပါ (Private Video သို့မဟုတ် Link မမှန်ကန်ခြင်း ဖြစ်နိုင်ပါသည်)။ ဓာတ်ပုံကို ဗီဒီယိုအဖြစ် ပြောင်းလဲခြင်း မပြုဘဲ တကယ့်ဗီဒီယိုဖိုင်သာ ဖြတ်တောက်ပေးမည်ဖြစ်ပါသဖြင့် Public Video Link သို့မဟုတ် 'ဗီဒီယိုဖိုင် ရွေးမည် (Upload)' ဖြင့် တင်သွင်းပေးပါ။"
    );
  }

  // Extract 3-6 real frames across the actual moving video for Gemini AI analysis
  const desiredFrames = clampedTarget > 45 ? 5 : 3;
  await extractRealFramesFromVideo(
    sourceVideoPath,
    videoDurationSec || clampedTarget,
    jobDir,
    framePaths,
    desiredFrames
  );

  while (framePaths.length < 3) {
    framePaths.push(await createGoldCyberBackdrop(jobDir, framePaths.length));
  }

  return {
    normalizedUrl,
    platform,
    youtubeId,
    title: title || `ရုပ်သံဗီဒီယို အထူးကဏ္ဍ`,
    author,
    description,
    sourceVideoPath,
    videoDurationSec,
    hasAudio,
    hasVideo: true,
    framePaths,
  };
}
