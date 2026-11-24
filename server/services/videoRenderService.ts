import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLIPS_DIR, TMP_JOBS_DIR } from "./types.ts";
import type {
  GeneratedClipSpec,
  RenderedClipResult,
  SourceMediaInfo,
  StructuredRecapSummary,
  SubtitleCue,
  SubtitleStyleOptions,
} from "./types.ts";
import { writeBurmeseAssFile } from "./subtitleService.ts";
import { generateNarrationWav } from "./geminiService.ts";
import { cleanupOldRenderedClips, enqueueRenderTask } from "./renderQueueService.ts";
import {
  createGoldCyberBackdrop,
  ensureCinematicBaseVideo,
  probeMediaFile,
} from "./mediaExtractor.ts";

const execFileAsync = promisify(execFile);

function parseTimelineTimestampSec(raw: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(raw || "").trim());
  if (!match) return null;
  if (match[3] !== undefined) {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function sanitizeStructuredRecapInput(raw: any): StructuredRecapSummary {
  const title = String(raw?.title || "").trim().slice(0, 180) || "KKSRecap AI — ရုပ်ရှင်အနှစ်ချုပ်";
  const executiveSummary =
    String(raw?.executiveSummary || "").trim().slice(0, 2400) || title;
  const sentimentOrTone =
    String(raw?.sentimentOrTone || "").trim().slice(0, 140) || "Engaging Cinematic Recap";

  const keyTakeaways: string[] = Array.isArray(raw?.keyTakeaways)
    ? raw.keyTakeaways
        .map((item: unknown) => String(item || "").trim().slice(0, 400))
        .filter(Boolean)
        .slice(0, 15)
    : [];

  const timeline = Array.isArray(raw?.timeline)
    ? raw.timeline
        .map((entry: any, idx: number) => {
          const event = String(entry?.event || "").trim().slice(0, 450);
          if (!event) return null;
          const fallbackMin = Math.floor((idx * 5) / 60);
          const fallbackSec = (idx * 5) % 60;
          const fallbackTs = `${String(fallbackMin).padStart(2, "0")}:${String(fallbackSec).padStart(2, "0")}`;
          const timestamp = String(entry?.timestamp || "").trim().slice(0, 16) || fallbackTs;
          return { timestamp, event };
        })
        .filter((item: unknown): item is { timestamp: string; event: string } => Boolean(item))
        .slice(0, 30)
    : [];

  return {
    title,
    executiveSummary,
    keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : [executiveSummary.slice(0, 180)],
    timeline,
    sentimentOrTone,
  };
}

export function buildClipSpecFromEditedRecap(
  recap: StructuredRecapSummary,
  baseSpec: GeneratedClipSpec | undefined,
  targetDurationSec: number
): GeneratedClipSpec {
  const safeDuration = Math.max(5, Math.min(300, Math.round(targetDurationSec || baseSpec?.durationSec || 12)));
  const segmentTexts =
    recap.timeline.length > 0
      ? recap.timeline.map((t) => ({ ts: parseTimelineTimestampSec(t.timestamp), text: t.event }))
      : recap.executiveSummary
          .split(/(?<=[.!?။])\s+|\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12)
          .map((text) => ({ ts: null as number | null, text }));

  let subtitles: SubtitleCue[] = [];
  if (segmentTexts.length > 0) {
    const validOrderedTimestamps =
      segmentTexts.every((s) => s.ts !== null && s.ts >= 0 && s.ts < safeDuration) &&
      segmentTexts.every((s, idx) => idx === 0 || (s.ts as number) > (segmentTexts[idx - 1].ts as number));

    if (validOrderedTimestamps) {
      subtitles = segmentTexts.map((seg, idx) => {
        const startOffset = Number((seg.ts as number).toFixed(2));
        const nextTs = idx < segmentTexts.length - 1 ? (segmentTexts[idx + 1].ts as number) : safeDuration;
        const endOffset = Number(Math.max(startOffset + 1, Math.min(safeDuration, nextTs)).toFixed(2));
        return { startOffset, endOffset, text: seg.text };
      });
    } else {
      const slot = safeDuration / segmentTexts.length;
      subtitles = segmentTexts.map((seg, idx) => ({
        startOffset: Number((idx * slot).toFixed(2)),
        endOffset: idx === segmentTexts.length - 1 ? safeDuration : Number(((idx + 1) * slot).toFixed(2)),
        text: seg.text,
      }));
    }
  } else if (baseSpec?.subtitles?.length) {
    subtitles = baseSpec.subtitles;
  } else {
    subtitles = [{ startOffset: 0, endOffset: safeDuration, text: recap.executiveSummary.slice(0, 120) }];
  }

  const timelineSpoken = recap.timeline.map((t) => t.event).join(". ");
  const narrationBurmese = [recap.title, recap.executiveSummary, timelineSpoken]
    .filter((s) => Boolean(s && s.trim()))
    .join(". ")
    .slice(0, 3800);

  return {
    clipTitleBurmese: recap.title,
    clipSummaryBurmese: recap.executiveSummary,
    startSec: baseSpec?.startSec ?? 0,
    durationSec: safeDuration,
    narrationBurmese,
    subtitles,
  };
}

export async function renderClipToMp4(options: {
  clipSpec: GeneratedClipSpec;
  clipIndex: number;
  media: SourceMediaInfo;
  aspectRatio: "9:16" | "16:9" | "1:1";
  audioMode: "original" | "voiceover" | "mix";
  framingMode?: "blur_bg" | "crop_fill" | "letterbox";
  bypassCensorship?: boolean;
  styleOptions?: SubtitleStyleOptions;
  recapSummary?: StructuredRecapSummary;
  jobDir: string;
  outputFilename: string;
  apiKey?: string;
}): Promise<RenderedClipResult> {
  return enqueueRenderTask({
    label: `Render ${options.outputFilename}`,
    run: async () => {
  const {
    clipSpec,
    clipIndex,
    media,
    aspectRatio,
    audioMode,
    framingMode = "blur_bg",
    bypassCensorship = true,
    styleOptions,
    recapSummary,
    jobDir,
    outputFilename,
    apiKey,
  } = options;

  let W = 720;
  let H = 1280;
  if (aspectRatio === "16:9") {
    W = 1280;
    H = 720;
  } else if (aspectRatio === "1:1") {
    W = 1080;
    H = 1080;
  }

  const isAudioOnly = media.hasVideo === false && Boolean(media.sourceAudioPath);

  const actualClipDur =
    media.sourceType === "text_article"
      ? Math.max(6, Math.min(30, clipSpec.durationSec))
      : media.sourceVideoPath && media.videoDurationSec
      ? Math.max(4, Math.min(clipSpec.durationSec, media.videoDurationSec))
      : clipSpec.durationSec;

  const adjustedSubtitles = clipSpec.subtitles.map((cue, idx, arr) => {
    if (actualClipDur < clipSpec.durationSec) {
      const ratio = actualClipDur / clipSpec.durationSec;
      return {
        startOffset: Number((cue.startOffset * ratio).toFixed(2)),
        endOffset: Number((Math.min(actualClipDur, cue.endOffset * ratio)).toFixed(2)),
        text: cue.text,
      };
    }
    if (idx === arr.length - 1) {
      return { ...cue, endOffset: Math.min(actualClipDur, cue.endOffset) };
    }
    return cue;
  });

  const assPath = path.join(jobDir, `sub_${clipIndex}_${Date.now()}.ass`);
  writeBurmeseAssFile(assPath, adjustedSubtitles, aspectRatio, clipSpec.clipTitleBurmese, styleOptions);

  const outputPath = path.join(CLIPS_DIR, outputFilename);

  // Video source MUST be a real moving video stream (or cinema backdrop paired with uploaded audio/transcript)
  const activeVideoPath = isAudioOnly
    ? media.sourceVideoPath || (await ensureCinematicBaseVideo())
    : media.sourceVideoPath;
  if (
    !activeVideoPath ||
    (!activeVideoPath.startsWith("http://") &&
      !activeVideoPath.startsWith("https://") &&
      !fs.existsSync(activeVideoPath))
  ) {
    throw new Error("မူရင်း ဗီဒီယိုဖိုင် မတွေ့ရှိပါသဖြင့် ဖြတ်တောက်၍မရနိုင်ပါ။");
  }

  const durationLimit =
    media.videoDurationSec && media.videoDurationSec > 3
      ? media.videoDurationSec
      : Math.max(30, clipSpec.durationSec);
  const safeStart = Math.max(0, Math.min(clipSpec.startSec, Math.max(0, durationLimit - actualClipDur)));

  // Build multi-scene movie recap highlight segments when source file is significantly longer than target recap duration
  const isLocalFile = !activeVideoPath.startsWith("http://") && !activeVideoPath.startsWith("https://");
  const segments: Array<{ startSec: number; durSec: number }> = [];
  if (
    !isAudioOnly &&
    isLocalFile &&
    media.videoDurationSec &&
    media.videoDurationSec >= actualClipDur * 1.45 &&
    actualClipDur >= 12
  ) {
    const segCount = actualClipDur >= 45 ? 4 : 3;
    const baseSlice = Number((actualClipDur / segCount).toFixed(2));
    const anchors = segCount === 4 ? [0.02, 0.28, 0.56, 0.8] : [0.02, 0.42, 0.76];
    let remainingDur = actualClipDur;
    for (let sIdx = 0; sIdx < segCount; sIdx++) {
      const segDur = sIdx === segCount - 1 ? Number(remainingDur.toFixed(2)) : baseSlice;
      const anchorTime = Math.max(
        0,
        Math.min(media.videoDurationSec - segDur - 0.3, Math.floor(media.videoDurationSec * anchors[sIdx]))
      );
      segments.push({ startSec: Number(anchorTime.toFixed(2)), durSec: segDur });
      remainingDur -= segDur;
    }
  } else {
    segments.push({ startSec: Number(safeStart.toFixed(2)), durSec: Number(actualClipDur.toFixed(2)) });
  }

  // Non-mirrored Anti-Copyright transform: subtle 5% center zoom + cinematic grade (NEVER mirror text backwards with hflip)
  const preFilterBody = bypassCensorship
    ? `crop=trunc(iw*0.95/2)*2:trunc(ih*0.95/2)*2:(iw-trunc(iw*0.95/2)*2)/2:(ih-trunc(ih*0.95/2)*2)/2,eq=contrast=1.05:brightness=0.01:saturation=1.10:gamma=1.02`
    : `null`;

  const wavPath = path.join(jobDir, `tts_${clipIndex}.wav`);
  let hasTts = false;
  if (audioMode === "voiceover" || audioMode === "mix") {
    hasTts = await generateNarrationWav(clipSpec.narrationBurmese, wavPath, apiKey);
  }

  const ffmpegArgs: string[] = ["-y"];

  if (!isAudioOnly && !isLocalFile) {
    ffmpegArgs.push(
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

  let segCount = segments.length;
  let audioInputIndex = 0;

  if (isAudioOnly && media.sourceAudioPath) {
    // Input 0: Looped cinematic background video
    ffmpegArgs.push("-stream_loop", "-1", "-t", actualClipDur.toFixed(2), "-i", activeVideoPath);
    // Input 1: Uploaded user audio file at safeStart..actualClipDur
    ffmpegArgs.push(
      "-ss",
      safeStart.toFixed(2),
      "-t",
      actualClipDur.toFixed(2),
      "-i",
      media.sourceAudioPath
    );
    segCount = 2;
    audioInputIndex = 1;
  } else {
    for (const seg of segments) {
      ffmpegArgs.push(
        "-ss",
        seg.startSec.toFixed(2),
        "-t",
        seg.durSec.toFixed(2),
        "-i",
        activeVideoPath
      );
    }
  }

  const needOrigAudioFromVideo = media.hasAudio && (!hasTts || audioMode === "mix");
  const filterParts: string[] = [];

  if (isAudioOnly) {
    filterParts.push(`[0:v]setpts=PTS-STARTPTS,${preFilterBody}[cinematic_v]`);
    if (needOrigAudioFromVideo) {
      filterParts.push(`[${audioInputIndex}:a]aresample=44100,asetpts=PTS-STARTPTS[raw_a]`);
    }
  } else if (segCount > 1) {
    for (let i = 0; i < segCount; i++) {
      filterParts.push(`[${i}:v]setpts=PTS-STARTPTS[sv${i}]`);
    }
    const vConcatInputs = segments.map((_, i) => `[sv${i}]`).join("");
    filterParts.push(`${vConcatInputs}concat=n=${segCount}:v=1:a=0[v_concat]`);
    filterParts.push(`[v_concat]${preFilterBody}[cinematic_v]`);

    if (needOrigAudioFromVideo) {
      for (let i = 0; i < segCount; i++) {
        filterParts.push(`[${i}:a]aresample=44100,asetpts=PTS-STARTPTS[sa${i}]`);
      }
      const aConcatInputs = segments.map((_, i) => `[sa${i}]`).join("");
      filterParts.push(`${aConcatInputs}concat=n=${segCount}:v=0:a=1[raw_a]`);
    }
  } else {
    filterParts.push(`[0:v]setpts=PTS-STARTPTS,${preFilterBody}[cinematic_v]`);
    if (needOrigAudioFromVideo) {
      filterParts.push(`[0:a]aresample=44100,asetpts=PTS-STARTPTS[raw_a]`);
    }
  }

  // Clean, distortion-free framing (crop blur background cleanly to aspect ratio; no mid-frame box cut)
  if (framingMode === "blur_bg") {
    const bgW = Math.max(160, Math.round(W / 4 / 2) * 2);
    const bgH = Math.max(160, Math.round(H / 4 / 2) * 2);
    filterParts.push(
      `[cinematic_v]split=2[in_bg][in_fg]`,
      `[in_bg]scale=${bgW}:${bgH}:force_original_aspect_ratio=increase,crop=${bgW}:${bgH},boxblur=6:2,scale=${W}:${H},setsar=1[bg]`,
      `[in_fg]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,ass=${assPath}[vout]`
    );
  } else if (framingMode === "letterbox") {
    filterParts.push(
      `[cinematic_v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,ass=${assPath}[vout]`
    );
  } else {
    filterParts.push(
      `[cinematic_v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,ass=${assPath}[vout]`
    );
  }

  // Normalize sample rate before asetrate so 48kHz audio NEVER slows down or stretches past clip duration
  const audioMod = bypassCensorship
    ? "aresample=44100,asetrate=44100*1.012,atempo=1/1.012,aresample=44100"
    : "aresample=44100";

  const extraInputIdx = segCount;
  if (hasTts && fs.existsSync(wavPath)) {
    ffmpegArgs.push("-i", wavPath);
    if (audioMode === "mix" && media.hasAudio) {
      filterParts.push(
        `[raw_a]${audioMod},volume=0.35[orig_a]`,
        `[${extraInputIdx}:a]aresample=44100,volume=1.2[tts_a]`,
        `[orig_a][tts_a]amix=inputs=2:duration=first[aout]`
      );
      ffmpegArgs.push("-filter_complex", filterParts.join(";"), "-map", "[vout]", "-map", "[aout]");
    } else {
      ffmpegArgs.push(
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[vout]",
        "-map",
        `${extraInputIdx}:a:0`
      );
    }
  } else if (media.hasAudio) {
    filterParts.push(`[raw_a]${audioMod}[aout]`);
    ffmpegArgs.push("-filter_complex", filterParts.join(";"), "-map", "[vout]", "-map", "[aout]");
  } else {
    ffmpegArgs.push(
      "-f",
      "lavfi",
      "-t",
      actualClipDur.toFixed(2),
      "-i",
      "aevalsrc=0.03*sin(2*PI*110*t)+0.015*sin(2*PI*164.81*t):s=44100",
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[vout]",
      "-map",
      `${extraInputIdx}:a:0`
    );
  }

  ffmpegArgs.push(
    "-t",
    actualClipDur.toFixed(2),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "fastdecode",
    "-threads",
    "2",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath
  );

  const renderTimeoutMs = Math.max(45000, Math.min(720000, Math.round(actualClipDur * 2500)));
  try {
    await execFileAsync("ffmpeg", ffmpegArgs, { timeout: renderTimeoutMs });

    const posterFilename = outputFilename.replace(/\.mp4$/, ".jpg");
    const posterPath = path.join(CLIPS_DIR, posterFilename);
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        "0.5",
        "-i",
        outputPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        posterPath,
      ]);
    } catch {
      // Non-fatal
    }

    const stat = fs.statSync(outputPath);
    const fileSizeMb = `${Math.max(0.2, stat.size / (1024 * 1024)).toFixed(2)} MB`;

    let resLabel = "720×1280 (9:16)";
    if (aspectRatio === "16:9") resLabel = "1280×720 (16:9)";
    if (aspectRatio === "1:1") resLabel = "1080×1080 (1:1)";

    const clipResult: RenderedClipResult = {
      id: outputFilename.replace(/\.mp4$/, ""),
      index: clipIndex + 1,
      titleBurmese: clipSpec.clipTitleBurmese,
      summaryBurmese: clipSpec.clipSummaryBurmese,
      videoUrl: `/api/clips/${outputFilename}`,
      downloadUrl: `/api/clips/${outputFilename}?download=1`,
      posterUrl: `/api/clips/${posterFilename}`,
      filename: outputFilename,
      durationSec: Math.round(actualClipDur),
      aspectRatio,
      resolutionLabel: resLabel,
      fileSizeMb,
      audioMode,
      framingMode,
      bypassCensorship,
      subtitles: adjustedSubtitles,
      styleOptions,
      recapSummary,
    };

    try {
      const metaPath = path.join(CLIPS_DIR, `${clipResult.id}.json`);
      fs.writeFileSync(metaPath, JSON.stringify(clipResult, null, 2), "utf-8");
    } catch {
      // Non-fatal
    }

    cleanupOldRenderedClips();
    return clipResult;
  } finally {
    [assPath, wavPath].forEach((tmpFile) => {
      try {
        if (tmpFile && fs.existsSync(tmpFile)) {
          fs.rmSync(tmpFile, { force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });
  }
    },
  });
}

export async function reburnClipSubtitles(options: {
  originalPath: string;
  subtitles: SubtitleCue[];
  titleBurmese: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  framingMode: "blur_bg" | "crop_fill" | "letterbox";
  bypassCensorship: boolean;
  styleOptions?: SubtitleStyleOptions;
  durationSec: number;
  narrationBurmese?: string;
  audioMode?: "original" | "voiceover" | "mix";
  apiKey?: string;
}): Promise<{
  id: string;
  videoUrl: string;
  downloadUrl: string;
  filename: string;
  fileSizeMb: string;
  subtitles: SubtitleCue[];
  durationSec: number;
  bypassCensorship: boolean;
  audioRegenerated?: boolean;
}> {
  return enqueueRenderTask({
    label: "Re-burn subtitles",
    run: async () => {
  const {
    originalPath,
    subtitles,
    titleBurmese,
    aspectRatio,
    framingMode,
    bypassCensorship,
    styleOptions,
    durationSec,
    narrationBurmese,
    audioMode = "original",
    apiKey,
  } = options;

  const jobId = `reburn_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;
  const jobDir = path.join(TMP_JOBS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const newFilename = `KKS_Edited_${Date.now()}_${crypto.randomBytes(2).toString("hex")}.mp4`;
  const outputPath = path.join(CLIPS_DIR, newFilename);

  try {
    const assPath = path.join(jobDir, "reburn.ass");
    writeBurmeseAssFile(
      assPath,
      subtitles,
      aspectRatio,
      titleBurmese || "KKS Gold OS Subtitles",
      styleOptions
    );

    let W = 720;
    let H = 1280;
    if (aspectRatio === "16:9") {
      W = 1280;
      H = 720;
    } else if (aspectRatio === "1:1") {
      W = 1080;
      H = 1080;
    }

    const bgW = Math.max(160, Math.round(W / 4 / 2) * 2);
    const bgH = Math.max(160, Math.round(H / 4 / 2) * 2);
    const videoPreFilter = bypassCensorship
      ? `[0:v]eq=contrast=1.04:saturation=1.06[cinematic_v]`
      : `[0:v]null[cinematic_v]`;

    let framingChain = "";
    if (framingMode === "blur_bg") {
      framingChain = [
        `[cinematic_v]split=2[in_bg][in_fg]`,
        `[in_bg]scale=${bgW}:${bgH}:force_original_aspect_ratio=increase,crop=${bgW}:${bgH},boxblur=6:2,scale=${W}:${H},setsar=1[bg]`,
        `[in_fg]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg]`,
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,ass=${assPath}[vout]`,
      ].join(";");
    } else if (framingMode === "letterbox") {
      framingChain = [
        `[cinematic_v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,ass=${assPath}[vout]`,
      ].join(";");
    } else {
      framingChain = [
        `[cinematic_v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,ass=${assPath}[vout]`,
      ].join(";");
    }

    const wavPath = path.join(jobDir, "reburn_tts.wav");
    const shouldGenerateTts =
      Boolean(narrationBurmese && narrationBurmese.trim().length >= 3) &&
      (audioMode === "voiceover" || audioMode === "mix");
    const hasTts = shouldGenerateTts
      ? await generateNarrationWav(String(narrationBurmese), wavPath, apiKey)
      : false;

    const probedOrig = hasTts ? await probeMediaFile(originalPath) : null;
    const origHasAudio = Boolean(probedOrig?.hasAudio);

    const ffmpegArgs: string[] = ["-y", "-i", originalPath];
    let filterComplexChain = `${videoPreFilter};${framingChain}`;

    if (hasTts && fs.existsSync(wavPath)) {
      ffmpegArgs.push("-i", wavPath);
      if (audioMode === "mix" && origHasAudio) {
        filterComplexChain += `;[0:a]aresample=44100,volume=0.35[orig_a];[1:a]aresample=44100,volume=1.2[tts_a];[orig_a][tts_a]amix=inputs=2:duration=first[aout]`;
        ffmpegArgs.push(
          "-filter_complex",
          filterComplexChain,
          "-map",
          "[vout]",
          "-map",
          "[aout]",
          "-c:a",
          "aac",
          "-b:a",
          "128k"
        );
      } else {
        ffmpegArgs.push(
          "-filter_complex",
          filterComplexChain,
          "-map",
          "[vout]",
          "-map",
          "1:a:0",
          "-shortest",
          "-c:a",
          "aac",
          "-b:a",
          "128k"
        );
      }
    } else {
      ffmpegArgs.push(
        "-filter_complex",
        filterComplexChain,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        "-c:a",
        "copy"
      );
    }

    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "fastdecode",
      "-threads",
      "2",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath
    );

    const renderTimeoutMs = Math.max(45000, Math.min(720000, Math.round(durationSec * 2500)));
    await execFileAsync("ffmpeg", ffmpegArgs, { timeout: renderTimeoutMs });

    const stat = fs.statSync(outputPath);
    const fileSizeMb = `${Math.max(0.2, stat.size / (1024 * 1024)).toFixed(2)} MB`;

    cleanupOldRenderedClips();

    return {
      id: newFilename.replace(/\.mp4$/, ""),
      videoUrl: `/api/clips/${newFilename}`,
      downloadUrl: `/api/clips/${newFilename}?download=1`,
      filename: newFilename,
      fileSizeMb,
      subtitles,
      durationSec,
      bypassCensorship,
      audioRegenerated: hasTts,
    };
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
    },
  });
}

let showcaseClipsPromise: Promise<RenderedClipResult[]> | null = null;

export async function ensureShowcaseClips(): Promise<RenderedClipResult[]> {
  if (showcaseClipsPromise) return showcaseClipsPromise;

  showcaseClipsPromise = (async () => {
    const showcaseSpec: GeneratedClipSpec = {
      clipTitleBurmese: "KKSRecap AI — ရုပ်ရှင်ဇာတ်လမ်း သုံးသပ်ချက် အနှစ်ချုပ် (Movie Review)",
      clipSummaryBurmese: "ရုပ်ရှင်ဆန်ဆန် သုံးသပ်ချက် ဇာတ်ကြောင်းပြောနှင့် မြန်မာစာတန်းထိုး Hard-coded MP4 Clip",
      startSec: 0,
      durationSec: 12,
      narrationBurmese:
        "ဒီဇာတ်ကားထဲမှာတော့ ဇာတ်ကောင်ဟာ အန္တရာယ်ကြီးတစ်ခုနဲ့ ရင်ဆိုင်ရပါတော့တယ်။ မထင်မှတ်ထားတဲ့ အချိန်မှာ ရန်သူရဲ့ လှည့်ကွက်က စတင်ပေါ်ပေါက်လာခဲ့ပြီး သူ့ရဲ့ ရဲရင့်တဲ့ ဆုံးဖြတ်ချက်ကသာ ကံကြမ္မာကို အပြောင်းအလဲ ဖြစ်စေခဲ့တာပါ။",
      subtitles: [
        { startOffset: 0, endOffset: 3, text: "ဒီဇာတ်ကားထဲမှာတော့ ဇာတ်ကောင်ဟာ အန္တရာယ်ကြီးတစ်ခုနဲ့ ရင်ဆိုင်ရပါတော့တယ်" },
        { startOffset: 3, endOffset: 6, text: "မထင်မှတ်ထားတဲ့ အချိန်မှာ ရန်သူရဲ့ လှည့်ကွက်က စတင်ပေါ်ပေါက်လာခဲ့ပါတယ်" },
        { startOffset: 6, endOffset: 9, text: "သူ့ရဲ့ ရဲရင့်တဲ့ ဆုံးဖြတ်ချက်ကသာ ကံကြမ္မာကို အပြောင်းအလဲ ဖြစ်စေခဲ့တာပါ" },
        { startOffset: 9, endOffset: 12, text: "မည်သည့် Video Link မဆို ထည့်သွင်း၍ ရုပ်ရှင်အနှစ်ချုပ် ဖြတ်တောက်ပါ" },
      ],
    };

    const showcaseRecapSummary: StructuredRecapSummary = {
      title: "KKSRecap AI — ရုပ်ရှင်ဇာတ်လမ်း သုံးသပ်ချက် အနှစ်ချုပ်",
      executiveSummary:
        "ဇာတ်ကောင်သည် မထင်မှတ်ထားသော အန္တရာယ်နှင့် ရန်သူ၏ လှည့်ကွက်ကို ရဲရင့်စွာ ရင်ဆိုင်ကျော်ဖြတ်ပြီး ကံကြမ္မာကို အပြောင်းအလဲဖြစ်စေခဲ့ပုံအား မြန်မာစာတန်းထိုးဖြင့် အနှစ်ချုပ်တင်ဆက်ထားပါသည်။",
      keyTakeaways: [
        "ဇာတ်လမ်း၏ အရေးကြီးဆုံး အလှည့်အပြောင်း မြင်ကွင်းများကို စက္ကန့်အတိုချုံး စုစည်းထားခြင်း",
        "မူရင်းအသံနှင့်အတူ မြန်မာစာတန်းထိုး Hard-coded စနစ်ဖြင့် တိုက်ရိုက်ကြည့်ရှုနိုင်ခြင်း",
        "Video Link သို့မဟုတ် စက်တွင်းဖိုင်မဆို ၅ စက္ကန့် မှ ၅ မိနစ်အထိ စိတ်ကြိုက်ဖြတ်ထုတ်နိုင်ခြင်း",
      ],
      timeline: [
        { timestamp: "00:00", event: "ဇာတ်ကောင်သည် အန္တရာယ်ကြီးတစ်ခုနှင့် စတင်ရင်ဆိုင်ရခြင်း" },
        { timestamp: "00:03", event: "ရန်သူ၏ မထင်မှတ်ထားသော လှည့်ကွက် ပေါ်ပေါက်လာခြင်း" },
        { timestamp: "00:06", event: "ရဲရင့်သော ဆုံးဖြတ်ချက်ဖြင့် ကံကြမ္မာကို ပြောင်းလဲစေခြင်း" },
        { timestamp: "00:09", event: "အနှစ်ချုပ် သုံးသပ်ချက် နိဂုံးပိုင်း" },
      ],
      sentimentOrTone: "Dramatic & Suspenseful · စိတ်လှုပ်ရှားဖွယ် ရုပ်ရှင်သုံးသပ်ချက်",
    };

    const showcasePath = path.join(CLIPS_DIR, "kks_gold_showcase_01.mp4");
    if (fs.existsSync(showcasePath)) {
      try {
        const stat = fs.statSync(showcasePath);
        if (stat.size > 20000) {
          return [
            {
              id: "kks_gold_showcase_01",
              index: 1,
              titleBurmese: showcaseSpec.clipTitleBurmese,
              summaryBurmese: showcaseSpec.clipSummaryBurmese,
              videoUrl: "/api/clips/kks_gold_showcase_01.mp4",
              downloadUrl: "/api/clips/kks_gold_showcase_01.mp4?download=1",
              posterUrl: "/api/clips/kks_gold_showcase_01.jpg",
              filename: "kks_gold_showcase_01.mp4",
              durationSec: 12,
              aspectRatio: "9:16",
              resolutionLabel: "720×1280 (9:16)",
              fileSizeMb: `${Math.max(0.2, stat.size / (1024 * 1024)).toFixed(2)} MB`,
              audioMode: "original",
              subtitles: showcaseSpec.subtitles,
              recapSummary: showcaseRecapSummary,
            },
          ];
        }
      } catch {
        // regenerate if unreadable
      }
    }

    const jobDir = path.join(TMP_JOBS_DIR, "showcase_boot");
    fs.mkdirSync(jobDir, { recursive: true });

    const framePaths: string[] = [];
    for (let i = 0; i < 3; i++) {
      framePaths.push(await createGoldCyberBackdrop(jobDir, i));
    }

    const baseVideo = await ensureCinematicBaseVideo();
    const probed = await probeMediaFile(baseVideo);

    const demoMedia: SourceMediaInfo = {
      normalizedUrl: "https://kks.studio/demo-preview",
      platform: "KKS_OS_Demo",
      youtubeId: null,
      title: "KKS Gold OS 2026 — Viral Video Intelligence",
      author: "KKS Studio",
      description: "Showroom preview clip with hard-coded Burmese subtitles",
      sourceVideoPath: baseVideo,
      videoDurationSec: probed?.durationSec || 30,
      hasAudio: probed?.hasAudio ?? true,
      framePaths,
    };

    const clip1 = await renderClipToMp4({
      clipSpec: showcaseSpec,
      clipIndex: 0,
      media: demoMedia,
      aspectRatio: "9:16",
      audioMode: "original",
      framingMode: "blur_bg",
      recapSummary: showcaseRecapSummary,
      jobDir,
      outputFilename: "kks_gold_showcase_01.mp4",
    });

    return [clip1];
  })();

  return showcaseClipsPromise;
}
