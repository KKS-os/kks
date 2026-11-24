import fs from "node:fs";
import path from "node:path";

export const PORT = Number(process.env.PORT) || 3000;
export const ROOT_DIR = process.cwd();
export const CLIPS_DIR = path.resolve(ROOT_DIR, "public", "clips");
export const TMP_JOBS_DIR = path.resolve("/tmp", "kks_recap_jobs");

fs.mkdirSync(CLIPS_DIR, { recursive: true });
fs.mkdirSync(TMP_JOBS_DIR, { recursive: true });

export type InputSourceType = "text_article" | "media_upload" | "youtube";
export type RecapLanguage = "my" | "en";

export interface TranscriptSegment {
  startSec: number;
  durationSec: number;
  text: string;
}

export interface SubtitleCue {
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface RecapTimelineEvent {
  timestamp: string;
  event: string;
}

export interface StructuredRecapSummary {
  title: string;
  executiveSummary: string;
  keyTakeaways: string[];
  timeline: RecapTimelineEvent[];
  sentimentOrTone: string;
}

export interface GeneratedClipSpec {
  clipTitleBurmese: string;
  clipSummaryBurmese: string;
  startSec: number;
  durationSec: number;
  narrationBurmese: string;
  subtitles: SubtitleCue[];
}

export interface GeneratedRecapPayload {
  recap: StructuredRecapSummary;
  clips: GeneratedClipSpec[];
}

export interface SubtitleStyleOptions {
  theme: "gold" | "white_gold" | "neon_amber";
  fontSize: "sm" | "md" | "lg";
  position: "bottom" | "center" | "top";
}

export interface RenderedClipResult {
  id: string;
  index: number;
  titleBurmese: string;
  summaryBurmese: string;
  videoUrl: string;
  downloadUrl: string;
  posterUrl: string;
  filename: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolutionLabel: string;
  fileSizeMb: string;
  audioMode: "original" | "voiceover" | "mix";
  framingMode?: "blur_bg" | "crop_fill" | "letterbox";
  bypassCensorship?: boolean;
  subtitles: SubtitleCue[];
  styleOptions?: SubtitleStyleOptions;
  recapSummary?: StructuredRecapSummary;
  sourceClipPath?: string;
}

export interface SourceMediaInfo {
  normalizedUrl: string;
  platform: string;
  youtubeId: string | null;
  title: string;
  author: string;
  description: string;
  sourceVideoPath: string | null;
  sourceAudioPath?: string | null;
  videoDurationSec: number | null;
  hasAudio: boolean;
  hasVideo?: boolean;
  framePaths: string[];
  sourceType?: InputSourceType;
  articleText?: string;
  transcriptText?: string;
  transcriptSegments?: TranscriptSegment[];
  mimeType?: string;
}

export interface RecapJobState {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  progressPercent: number;
  progressMessage: string;
  sourceType?: InputSourceType;
  sourceTitle?: string;
  recapSummary?: StructuredRecapSummary;
  clips?: RenderedClipResult[];
  draftMode?: boolean;
  draftId?: string;
  targetDurationSec?: number;
  queuePosition?: number;
  queueLength?: number;
  error?: string;
  createdAt: number;
}

export interface CachedRecapResult {
  sourceTitle: string;
  recapSummary: StructuredRecapSummary;
  clips: RenderedClipResult[];
  timestamp: number;
}

export interface CachedGeminiAnalysis {
  recap: StructuredRecapSummary;
  specs: GeneratedClipSpec[];
  timestamp: number;
}

export interface DraftRecapSession {
  id: string;
  createdAt: number;
  draftDir: string;
  sourceType: InputSourceType;
  media: SourceMediaInfo;
  recapSummary: StructuredRecapSummary;
  specs: GeneratedClipSpec[];
  targetDurationSec: number;
  cacheKeys?: { exactKey: string; contentKey: string };
}

