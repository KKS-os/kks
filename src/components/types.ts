import { getGeminiKeyHeaders, resolveApiUrl } from "../utils/apiKeyStorage";

export interface SubtitleCue {
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface SubtitleStyleOptions {
  theme: "gold" | "white_gold" | "neon_amber";
  fontSize: "sm" | "md" | "lg";
  position: "bottom" | "center" | "top";
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

export interface ClipItem {
  id: string;
  index: number;
  titleBurmese: string;
  summaryBurmese: string;
  videoUrl: string;
  downloadUrl: string;
  posterUrl?: string;
  filename: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolutionLabel: string;
  fileSizeMb: string;
  audioMode: "original" | "voiceover" | "mix";
  bypassCensorship?: boolean;
  subtitles: SubtitleCue[];
  styleOptions?: SubtitleStyleOptions;
  recapSummary?: StructuredRecapSummary;
}

export type InputSourceTab = "text_article" | "media_upload" | "youtube";
export type RecapLanguage = "my" | "en";
export type SettingsWizardTab = "api_key" | 1 | 2 | 3 | 4;

export interface DemoQuotaStatus {
  mode: "demo" | "byok";
  hasPersonalApiKey: boolean;
  demoLimit: number;
  demoUsed: number;
  demoRemaining: number;
  resetAt: string | null;
}

export interface ToastNotification {
  id: string;
  variant: "error" | "warning" | "info" | "success";
  title: string;
  message: string;
  actionType?: "open_api_key";
}

export interface UploadTransferProgress {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  fileName: string;
  phase: "uploading" | "analyzing";
}

export interface SampleSource {
  label: string;
  url: string;
}

export const SAMPLE_LINKS: SampleSource[] = [
  {
    label: "🎬 Rick Astley (YouTube · Transcript + Video)",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    label: "⚔️ Big Buck Bunny Open Movie (720p HD)",
    url: "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
  },
  {
    label: "🌸 Cinematic Direct Stream (MP4 HD)",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
];

export const SAMPLE_ARTICLE_LINKS: SampleSource[] = [
  {
    label: "📖 Wikipedia: Artificial Intelligence",
    url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
  },
  {
    label: "🎬 Wikipedia: Cinema of Myanmar",
    url: "https://en.wikipedia.org/wiki/Cinema_of_Myanmar",
  },
];

export const SAMPLE_RAW_TEXT =
  "AI နည်းပညာသည် ယနေ့ခေတ် ရုပ်ရှင်ထုတ်လုပ်ရေးနှင့် ဒစ်ဂျစ်တယ် မီဒီယာလောကကို အရှိန်အဟုန်ဖြင့် ပြောင်းလဲလျက်ရှိသည်။ ဇာတ်ညွှန်းရေးသားခြင်း၊ အသံတည်းဖြတ်ခြင်းနှင့် ဘာသာပြန် စာတန်းထိုး စနစ်များတွင် AI ကို ထိရောက်စွာ အသုံးချလာနိုင်ခြင်းကြောင့် ဖန်တီးသူများသည် အချိန်ကုန်သက်သာပြီး ကမ္ဘာတစ်ဝှမ်းရှိ ပရိသတ်များထံ မြန်ဆန်စွာ ရောက်ရှိနိုင်ပြီဖြစ်သည်။";

export function extractYouTubeIdClient(rawUrl: string): string | null {
  try {
    const candidate = /^https?:\/\//i.test(rawUrl.trim())
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;
    const parsed = new URL(candidate);
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

export function formatBytesMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0.0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PROCESSING_STEPS_BURMESE = [
  "ဗီဒီယို Link မှ ရုပ်သံနှင့် အသံဖိုင်ကို စစ်ဆေးနေပါသည်...",
  "Viral ဖြစ်မည့် အဓိက အလှည့်အပြောင်း ရုပ်ရှင်အခိုက်အတန့်များကို ရွေးထုတ်နေပါသည်...",
  "မူရင်းအသံနှင့် ကိုက်ညီသော မြန်မာဘာသာပြန် စာတန်းထိုးကို စီစဉ်နေပါသည်...",
  "မြန်မာစာတန်းထိုးကို MP4 ဗီဒီယိုပေါ်တွင် Hard-code ထည့်သွင်းနေပါသည်...",
];

export const MIN_CLIP_DURATION_SEC = 5;
export const MAX_CLIP_DURATION_SEC = 300;

export const TOOLBAR_DURATION_PRESETS: { sec: number; label: string }[] = [
  { sec: 15, label: "15s" },
  { sec: 30, label: "30s" },
  { sec: 60, label: "1 မိနစ်" },
  { sec: 180, label: "3 မိနစ်" },
  { sec: 300, label: "5 မိနစ်" },
];

export const SETTINGS_DURATION_PRESETS: { sec: number; label: string }[] = [
  { sec: 15, label: "15 စက္ကန့်" },
  { sec: 30, label: "30 စက္ကန့်" },
  { sec: 60, label: "1 မိနစ်" },
  { sec: 120, label: "2 မိနစ်" },
  { sec: 180, label: "3 မိနစ်" },
  { sec: 300, label: "5 မိနစ်" },
];

export function clampClipDuration(sec: number): number {
  if (!Number.isFinite(sec)) return 30;
  return Math.min(MAX_CLIP_DURATION_SEC, Math.max(MIN_CLIP_DURATION_SEC, Math.round(sec)));
}

export function formatDurationBurmese(sec: number): string {
  const safe = clampClipDuration(sec);
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  if (mins === 0) return `${rem} စက္ကန့်`;
  if (rem === 0) return `${mins} မိနစ်`;
  return `${mins} မိနစ် ${rem} စက္ကန့်`;
}

export function isValidAutoCutUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 12) return false;
  const candidate = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (!parsed.hostname || !parsed.hostname.includes(".")) return false;
    const tld = parsed.hostname.split(".").pop() || "";
    if (tld.length < 2) return false;
    return parsed.pathname.length > 1 || parsed.search.length > 1;
  } catch {
    return false;
  }
}

export function formatSeconds(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export interface SafeFetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  code?: string;
  quota?: Partial<DemoQuotaStatus>;
}

function parseQuotaHeaders(headers: Headers): Partial<DemoQuotaStatus> | undefined {
  const modeHeader = headers.get("x-demo-mode");
  const remHeader = headers.get("x-demo-remaining");
  const limitHeader = headers.get("x-demo-limit");
  const resetHeader = headers.get("x-demo-reset-at");
  if (!modeHeader && remHeader === null && limitHeader === null) return undefined;

  const limit = limitHeader !== null ? Number(limitHeader) : 2;
  const remaining = remHeader !== null ? Number(remHeader) : limit;
  const safeLimit = Number.isFinite(limit) ? limit : 2;
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 2;

  return {
    mode: modeHeader === "byok" ? "byok" : "demo",
    hasPersonalApiKey: modeHeader === "byok",
    demoLimit: safeLimit,
    demoRemaining: safeRemaining,
    demoUsed: Math.max(0, safeLimit - safeRemaining),
    resetAt: resetHeader || null,
  };
}

export function normalizeClipMediaUrls(clip: ClipItem): ClipItem {
  return {
    ...clip,
    videoUrl: resolveApiUrl(clip.videoUrl),
    downloadUrl: resolveApiUrl(clip.downloadUrl),
    posterUrl: clip.posterUrl ? resolveApiUrl(clip.posterUrl) : clip.posterUrl,
  };
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit,
  retriesLeft = 1
): Promise<SafeFetchResult<T>> {
  try {
    const resolvedInput = typeof input === "string" ? resolveApiUrl(input) : input;
    const mergedHeaders = new Headers(init?.headers || {});
    const byokHeaders = getGeminiKeyHeaders();
    Object.entries(byokHeaders).forEach(([k, v]) => {
      if (!mergedHeaders.has(k)) {
        mergedHeaders.set(k, v);
      }
    });

    const res = await fetch(resolvedInput, {
      ...init,
      headers: mergedHeaders,
    });
    const quota = parseQuotaHeaders(res.headers);
    if (quota && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("kks-demo-quota", { detail: quota }));
    }

    const rawText = await res.text();
    let parsed: any = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Not valid JSON
      }
    }

    const responseCode = parsed && typeof parsed.code === "string" ? parsed.code : undefined;
    const isDailyDemoExceeded = responseCode === "DEMO_QUOTA_EXCEEDED";
    const isRateExceeded =
      res.status === 429 ||
      (typeof rawText === "string" &&
        (rawText.toLowerCase().includes("rate exceeded") ||
          rawText.toLowerCase().includes("too many requests")));

    if (isRateExceeded && !isDailyDemoExceeded && retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 2500));
      return safeFetchJson<T>(input, init, retriesLeft - 1);
    }

    if (!res.ok) {
      let errorMsg = "";
      if (parsed && typeof parsed.error === "string") {
        errorMsg = parsed.error;
      } else if (isRateExceeded) {
        errorMsg =
          "ဆာဗာ တောင်းဆိုမှု အရေအတွက် ခေတ္တ ပြည့်နေပါသည် (Rate limit exceeded)။ Settings ထဲတွင် ကိုယ်ပိုင် Free Gemini API Key ထည့်သွင်း၍ဖြစ်စေ စက္ကန့်အနည်းငယ် စောင့်ဆိုင်း၍ဖြစ်စေ ထပ်မံ ကြိုးစားပေးပါ။";
      } else if (rawText && rawText.length < 250 && !rawText.includes("<html")) {
        errorMsg = rawText;
      } else {
        errorMsg = `ဆာဗာ ချိတ်ဆက်မှု အခက်အခဲ ဖြစ်ပေါ်နေပါသည် (HTTP ${res.status})။ ခေတ္တစောင့်ဆိုင်းပြီး ပြန်လည် စမ်းသပ်ပေးပါ။`;
      }
      return { ok: false, status: res.status, error: errorMsg, code: responseCode, quota };
    }

    return { ok: true, status: res.status, data: (parsed || {}) as T, quota };
  } catch (err: any) {
    const isNet =
      err instanceof TypeError ||
      (err?.message && (err.message.includes("fetch") || err.message.includes("network")));
    return {
      ok: false,
      status: 0,
      code: isNet ? "NETWORK_ERROR" : undefined,
      error: isNet
        ? "အင်တာနက် သို့မဟုတ် ဆာဗာ ချိတ်ဆက်မှု အခက်အခဲ ရှိနေပါသည်။ ခေတ္တစောင့်ဆိုင်းပြီး ပြန်လည် စမ်းသပ်ပေးပါ။"
        : err?.message || "မထင်မှတ်ထားသော အမှားတစ်ခု ဖြစ်ပေါ်ခဲ့ပါသည်။",
    };
  }
}
