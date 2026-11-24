import fs from "node:fs";
import { GoogleGenAI, Type, createPartFromUri } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import type {
  CachedGeminiAnalysis,
  GeneratedClipSpec,
  GeneratedRecapPayload,
  RecapLanguage,
  RecapTimelineEvent,
  SourceMediaInfo,
  StructuredRecapSummary,
  SubtitleCue,
} from "./types.ts";

const geminiAnalysisCache = new Map<string, CachedGeminiAnalysis>();

function normalizeUnicode(text: string): string {
  return String(text || "").trim().normalize("NFC");
}

export function isValidUserGeminiApiKey(rawKey?: string | null): boolean {
  if (!rawKey || typeof rawKey !== "string") return false;
  const trimmed = rawKey.trim();
  if (trimmed === "MY_GEMINI_API_KEY") return false;
  if (trimmed.length < 20 || trimmed.length > 160) return false;
  return /^[A-Za-z0-9_-]{20,160}$/.test(trimmed);
}

export function resolveEffectiveGeminiApiKey(overrideApiKey?: string): string | null {
  if (isValidUserGeminiApiKey(overrideApiKey)) {
    return overrideApiKey!.trim();
  }
  const envKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!envKey || envKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return envKey;
}

function getGenAIClient(overrideApiKey?: string): GoogleGenAI {
  const effectiveKey = resolveEffectiveGeminiApiKey(overrideApiKey);
  return new GoogleGenAI({
    apiKey: effectiveKey || undefined,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export function getDesiredCueCount(durationSec: number): number {
  if (durationSec <= 20) return 4;
  return Math.min(36, Math.max(6, Math.round(durationSec / 6)));
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function buildTimedFallbackCues(targetDuration: number, startOffsetIndex = 0): SubtitleCue[] {
  const cueCount = getDesiredCueCount(targetDuration);
  const slot = targetDuration / cueCount;
  const reviewLines = [
    "ဒီဇာတ်ကားရဲ့ အဖွင့်မြင်ကွင်းမှာတင် ပရိသတ်ကို ဆွဲဆောင်ထားပါတယ်",
    "ဇာတ်လမ်းရဲ့ အဓိက ဇာတ်ကောင်နဲ့ အဖြစ်အပျက်တွေ စတင်လာပါပြီ",
    "ပထမမြင်မြင်ချင်း သာမန်လို့ ထင်ရပေမယ့် လျှို့ဝှက်ချက်တွေ ရှိနေပါတယ်",
    "ဇာတ်ရှိန်က တဖြည်းဖြည်း မြင့်တက်လာပြီး စိတ်ဝင်စားစရာ ဖြစ်လာပါပြီ",
    "မထင်မှတ်ထားတဲ့ အလှည့်အပြောင်းတစ်ခု ဖြစ်ပေါ်လာပုံကို ကြည့်ရှုပါ",
    "ဇာတ်ကောင်ရဲ့ ဆုံးဖြတ်ချက်က အခြေအနေတစ်ခုလုံးကို ပြောင်းလဲစေခဲ့ပါတယ်",
    "နောက်ကွယ်က တကယ့်အကြောင်းရင်းကို တဖြည်းဖြည်း ဖော်ထုတ်လာပါပြီ",
    "တင်းမာမှုတွေ မြင့်တက်လာပြီး စိတ်လှုပ်ရှားစရာ အခိုက်အတန့် ရောက်လာပါပြီ",
    "အရေးကြီးဆုံး အမှန်တရားကို ရှင်းရှင်းလင်းလင်း တွေ့မြင်ရတော့မှာပါ",
    "ဒီအခန်းကတော့ ဇာတ်ကားတစ်ခုလုံးရဲ့ အသက်အပါဆုံး အပိုင်းပဲ ဖြစ်ပါတယ်",
    "ရင်သပ်ရှုမောဖွယ် မြင်ကွင်းတွေနဲ့အတူ ဇာတ်လမ်းက ပိုမိုပြင်းထန်လာပါတယ်",
    "ဘယ်သူမှ ကြိုတင်မခန့်မှန်းနိုင်တဲ့ အခြေအနေဆီ ဦးတည်နေပါပြီ",
    "အန္တရာယ်တွေ ဝိုင်းရံနေတဲ့ကြားက ရင်ဆိုင်ကျော်ဖြတ်ရမယ့် အချိန်ပါပဲ",
    "ဇာတ်ကောင်တွေကြားက ပဋိပက္ခတွေ ပိုမိုနက်ရှိုင်းလာတာကို တွေ့ရပါတယ်",
    "သာမန်ကြည့်ရင် သတိမထားမိတဲ့ အသေးစိတ်အချက်လေးတစ်ခု ပေါ်လာပါပြီ",
    "အခက်အခဲတွေကို ဘယ်လိုနည်းဗျူဟာနဲ့ ကျော်လွှားမလဲ ကြည့်လိုက်ရအောင်",
    "နောက်ဆက်တွဲ အကျိုးဆက်တွေက အားလုံးကို အံ့အားသင့်စေခဲ့ပါတယ်",
    "အချိန်ကိုက် လှုပ်ရှားမှုတစ်ခုက အခြေအနေကို ပြောင်းပြန်လှန်ပစ်လိုက်ပါတယ်",
    "စိတ်ခံစားချက် အပြည့်နဲ့ ရိုက်ကူးထားတဲ့ အထူးမြင်ကွင်း ဖြစ်ပါတယ်",
    "အမှန်တရားနဲ့ လှည့်စားမှုကြားက တကယ့်တိုက်ပွဲ စတင်နေပါပြီ",
    "ဇာတ်သိမ်းပိုင်းနဲ့ နီးကပ်လာတာနဲ့အမျှ လျှို့ဝှက်ချက်တွေ ပွင့်ကျလာပါတယ်",
    "ဒီဆုံးဖြတ်ချက်ဟာ နောက်ကြောင်းပြန်လှည့်လို့ မရတော့တဲ့ ခြေလှမ်းပါပဲ",
    "ပရိသတ်တွေ အကြိုက်ဆုံး အလှည့်အပြောင်း အခိုက်အတန့် ဖြစ်လာပါပြီ",
    "မယုံနိုင်စရာ အဖြစ်အပျက်တွေ ဆက်တိုက် ဖြစ်ပေါ်နေတာကို တွေ့ရမှာပါ",
    "အတိတ်က အရိပ်အယောင်တွေ ပြန်လည်ပေါ်ပေါက်လာတဲ့ အခန်းပဲ ဖြစ်ပါတယ်",
    "အားလုံး စောင့်မျှော်နေကြတဲ့ အဓိက ရင်ဆိုင်တွေ့ဆုံမှု ရောက်ရှိလာပါပြီ",
    "အဆုံးအဖြတ်ပေးမယ့် အချိန်က စက္ကန့်ပိုင်းအတွင်း ရောက်လာတော့မှာပါ",
    "ဇာတ်ကားရဲ့ အနှစ်သာရအပြည့်အဝကို ဒီအပိုင်းမှာ ခံစားရမှာ ဖြစ်ပါတယ်",
    "မျှော်လင့်ချက် ရောင်ခြည်လေးတစ်ခု ပြန်လည်ထွန်းလင်းလာပါပြီ",
    "နောက်ဆုံးအခန်းမှာ ဘယ်လိုအဖြေထွက်မလဲ ဆက်လက် ကြည့်ရှုလိုက်ပါ",
    "အမှန်တကယ် ထိုက်တန်တဲ့ ရလဒ်ကို မြင်တွေ့ရတော့မှာ ဖြစ်ပါတယ်",
    "ဒီဇာတ်ကားက ပေးချင်တဲ့ အဓိက သင်ခန်းစာက အရမ်းကို လေးနက်ပါတယ်",
    "တစ်ကားလုံးရဲ့ အကောင်းဆုံး အနှစ်ချုပ် အခိုက်အတန့်တွေပဲ ဖြစ်ပါတယ်",
    "အစကနေ အဆုံးထိ မပျင်းရအောင် ဆွဲဆောင်နိုင်တဲ့ ဇာတ်လမ်းကောင်းပါပဲ",
    "နောက်ထပ် ဘယ်လိုအံ့ဩစရာတွေ ဆက်ဖြစ်မလဲ ကြည့်ရှုခံစားလိုက်ပါ",
    "အဆုံးထိ ကြည့်ရှုပေးတဲ့အတွက် အထူးကျေးဇူးတင်ပါတယ်",
  ];

  const cues: SubtitleCue[] = [];
  for (let i = 0; i < cueCount; i++) {
    const startOffset = Number((i * slot).toFixed(2));
    const endOffset = i === cueCount - 1 ? targetDuration : Number(((i + 1) * slot).toFixed(2));
    cues.push({
      startOffset,
      endOffset,
      text: reviewLines[(i + startOffsetIndex) % reviewLines.length],
    });
  }
  return cues;
}

export function sanitizeClipSpecs(
  specs: GeneratedClipSpec[],
  sourceDuration: number | null,
  targetDuration: number,
  language: RecapLanguage = "my"
): GeneratedClipSpec[] {
  const defaultCueText =
    language === "en"
      ? "Watch what happens next in this turning point"
      : "ဒီအခန်းမှာ ဘာဆက်ဖြစ်မလဲ ကြည့်လိုက်ရအောင်";
  const defaultTitlePrefix =
    language === "en" ? "Story Highlight Clip" : "ရုပ်ရှင်ဇာတ်ကြောင်း အပိုင်းတို";
  const defaultSummary =
    language === "en"
      ? "Key turning point captured with synchronized storytelling subtitles."
      : "ပရိသတ်အာရုံကို ဆွဲဆောင်နိုင်မယ့် အဓိက ဇာတ်ဝင်ခန်း အပိုင်းတို";

  return specs.slice(0, 3).map((clip, idx) => {
    const durationSec = targetDuration;
    let startSec = Number.isFinite(clip.startSec) && clip.startSec >= 0 ? clip.startSec : idx * (targetDuration + 2);
    if (sourceDuration && sourceDuration > 3) {
      const maxStart = Math.max(0, sourceDuration - durationSec);
      if (startSec > maxStart) {
        startSec = idx === 0 ? 0 : Math.max(0, maxStart * 0.5);
      }
    }

    const rawSubs = Array.isArray(clip.subtitles) && clip.subtitles.length > 0 ? clip.subtitles : [];
    const normalizedSubs: SubtitleCue[] =
      rawSubs.length > 0
        ? rawSubs.map((s, sIdx) => {
            const slot = durationSec / rawSubs.length;
            const startOffset =
              Number.isFinite(s.startOffset) && s.startOffset >= 0 && s.startOffset < durationSec
                ? s.startOffset
                : Number((sIdx * slot).toFixed(2));
            const endOffset =
              Number.isFinite(s.endOffset) && s.endOffset > startOffset && s.endOffset <= durationSec + 0.5
                ? Math.min(durationSec, s.endOffset)
                : Number(Math.min(durationSec, (sIdx + 1) * slot).toFixed(2));
            return {
              startOffset,
              endOffset,
              text: normalizeUnicode(s.text) || defaultCueText,
            };
          })
        : buildTimedFallbackCues(durationSec, idx * 2);

    return {
      clipTitleBurmese: normalizeUnicode(clip.clipTitleBurmese) || `${defaultTitlePrefix} (${idx + 1})`,
      clipSummaryBurmese: normalizeUnicode(clip.clipSummaryBurmese) || defaultSummary,
      startSec,
      durationSec,
      narrationBurmese:
        normalizeUnicode(clip.narrationBurmese) || normalizedSubs.map((s) => s.text).join(" "),
      subtitles: normalizedSubs,
    };
  });
}

function sanitizeStructuredRecap(
  raw: Partial<StructuredRecapSummary> | undefined,
  media: SourceMediaInfo,
  clips: GeneratedClipSpec[],
  targetDuration: number,
  language: RecapLanguage = "my"
): StructuredRecapSummary {
  const isBurmese = language !== "en";
  const cleanTitle =
    typeof raw?.title === "string" && raw.title.trim()
      ? normalizeUnicode(raw.title)
      : clips[0]?.clipTitleBurmese ||
        media.title ||
        (isBurmese ? "မထင်မှတ်ထားတဲ့ ဇာတ်လမ်းအလှည့်အပြောင်း" : "Cinematic Story Recap");

  const cleanExecSummary =
    typeof raw?.executiveSummary === "string" && raw.executiveSummary.trim()
      ? normalizeUnicode(raw.executiveSummary)
      : clips[0]?.narrationBurmese ||
        clips[0]?.clipSummaryBurmese ||
        (isBurmese
          ? "အစပိုင်းမှာ သာမန်လို့ ထင်ရပေမယ့် တကယ်တမ်း ဇာတ်ရှိန်တက်လာတဲ့အခါ မထင်မှတ်ထားတဲ့ အလှည့်အပြောင်းတွေက ပရိသတ်ကို အဆုံးထိ ဆွဲခေါ်သွားပါတယ်။"
          : "What begins as an ordinary moment quickly escalates into a gripping turning point you will not want to miss.");

  const cleanTakeaways = Array.isArray(raw?.keyTakeaways)
    ? raw.keyTakeaways
        .map((t) => normalizeUnicode(String(t || "")))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const takeaways =
    cleanTakeaways.length > 0
      ? cleanTakeaways
      : isBurmese
      ? [
          "အဖွင့်မြင်ကွင်းမှာတင် ပရိသတ် စိတ်ဝင်စားအောင် ဇာတ်ကြောင်းချိတ်ဆက်နိုင်မှု",
          "ဇာတ်ကောင်ရဲ့ ဆုံးဖြတ်ချက်တစ်ခုကြောင့် တစ်ကားလုံး အခြေအနေ ပြောင်းလဲသွားပုံ",
          "အသံနဲ့ စာတန်းထိုး တွဲဖက်မှုကြောင့် ဇာတ်လမ်းအရသာ ပိုပေါ်လွင်နေမှု",
        ]
      : [
          "Opens with an immediate narrative hook that pulls viewers into the conflict.",
          "A decisive choice reshapes every character's fate in the second half.",
          "Synchronized subtitles and pacing highlight the emotional peak.",
        ];

  const cleanTimeline: RecapTimelineEvent[] = Array.isArray(raw?.timeline)
    ? raw.timeline
        .map((item) => ({
          timestamp: String(item?.timestamp || "").trim() || "00:00",
          event: normalizeUnicode(String(item?.event || "")),
        }))
        .filter((item) => item.event.length > 0)
        .slice(0, 8)
    : [];

  const fallbackTimeline: RecapTimelineEvent[] = (clips[0]?.subtitles || [])
    .filter((_, idx, arr) => {
      if (arr.length <= 4) return true;
      const step = Math.max(1, Math.floor(arr.length / 4));
      return idx % step === 0;
    })
    .slice(0, 4)
    .map((cue) => ({
      timestamp: formatMmSs(cue.startOffset),
      event: cue.text,
    }));

  if (fallbackTimeline.length === 0) {
    fallbackTimeline.push(
      {
        timestamp: "00:00",
        event: isBurmese
          ? "ဇာတ်လမ်းစတင်ချိန်မှာတင် ထူးခြားတဲ့ အရိပ်အယောင် ပေါ်လာပါပြီ"
          : "An unexpected spark sets the story in motion",
      },
      {
        timestamp: formatMmSs(Math.floor(targetDuration * 0.5)),
        event: isBurmese
          ? "အဓိက အလှည့်အပြောင်း ဖြစ်ရပ်ဆီ ရောက်ရှိလာပုံ"
          : "The decisive turning point unfolds",
      }
    );
  }

  const cleanTone =
    typeof raw?.sentimentOrTone === "string" && raw.sentimentOrTone.trim()
      ? normalizeUnicode(raw.sentimentOrTone)
      : isBurmese
      ? "Cinematic Storyteller · ရင်ခုန်စိတ်လှုပ်ရှားဖွယ်"
      : "Cinematic & Suspenseful Storytelling";

  return {
    title: cleanTitle,
    executiveSummary: cleanExecSummary,
    keyTakeaways: takeaways,
    timeline: cleanTimeline.length > 0 ? cleanTimeline : fallbackTimeline,
    sentimentOrTone: cleanTone,
  };
}

export function buildFallbackClipSpecs(
  media: SourceMediaInfo,
  targetDuration: number,
  language: RecapLanguage = "my"
): GeneratedRecapPayload {
  const isBurmese = language !== "en";
  const cleanTitle = normalizeUnicode(media.title).slice(0, 44);
  const clip1Cues = buildTimedFallbackCues(targetDuration, 0);
  const rawSpecs: GeneratedClipSpec[] = [
    {
      clipTitleBurmese: isBurmese
        ? `${cleanTitle} — ဇာတ်လမ်းအလှည့်အပြောင်း`
        : `${cleanTitle} — Turning Point`,
      clipSummaryBurmese: isBurmese
        ? "ပရိသတ်အာရုံကို ချက်ချင်း ဖမ်းစားသွားမယ့် အဓိက ဇာတ်ဝင်ခန်း"
        : "A captivating opening sequence that sets up the main twist",
      startSec: 0,
      durationSec: targetDuration,
      narrationBurmese: isBurmese
        ? "ပရိသတ်ကြီးရေ… ဒီဗီဒီယိုရဲ့ အစပိုင်းမှာတင် မထင်မှတ်ထားတဲ့ အဖြစ်အပျက်တစ်ခု စတင်လာပါပြီ။ နောက်ကွယ်မှာ ဘယ်လိုလျှို့ဝှက်ချက်တွေ ရှိနေမလဲဆိုတာ အတူတူ ဆက်ကြည့်လိုက်ရအောင်ပါ။"
        : "Watch closely as an ordinary opening moment unexpectedly spirals into the pivotal twist of the entire story.",
      subtitles: clip1Cues,
    },
  ];

  if (targetDuration < 90) {
    rawSpecs.push({
      clipTitleBurmese: isBurmese
        ? "နောက်ဆုံးအဖြေနဲ့ ရင်ခုန်စရာ အခိုက်အတန့်"
        : "The Final Payoff & Reveal",
      clipSummaryBurmese: isBurmese
        ? "ဇာတ်ရှိန်အမြင့်ဆုံးနဲ့ အမှတ်တရဖြစ်ကျန်မယ့် အနှစ်ချုပ် အပိုင်းတို"
        : "The dramatic climax and lasting message of the recap",
      startSec: Math.max(0, Math.round(targetDuration * 0.7)),
      durationSec: targetDuration,
      narrationBurmese: isBurmese
        ? "တကယ်တော့ ဒီနေရာမှာ ချမှတ်လိုက်တဲ့ ဆုံးဖြတ်ချက်တစ်ခုက အခြေအနေအားလုံးကို ပြောင်းပြန်လှန်ပစ်လိုက်တာပါပဲ။"
        : "In the end, one split-second choice flips the entire situation upside down.",
      subtitles: buildTimedFallbackCues(targetDuration, 4),
    });
  }

  const sanitizedClips = sanitizeClipSpecs(rawSpecs, media.videoDurationSec, targetDuration, language);
  const recap = sanitizeStructuredRecap(
    {
      title: isBurmese ? `${cleanTitle} — ဇာတ်ကြောင်းအနှစ်ချုပ်` : `${cleanTitle} — Story Recap`,
      executiveSummary: isBurmese
        ? "အစမှာတော့ သာမန်အဖြစ်အပျက်လေးလို့ ထင်ရပေမယ့် ဇာတ်ရှိန်တက်လာတာနဲ့အမျှ မထင်မှတ်ထားတဲ့ လျှို့ဝှက်ချက်တွေ ပွင့်ကျလာပါတယ်။ အဓိက ဇာတ်ကောင်ရဲ့ ရင်ဆိုင်ရတဲ့ အခက်အခဲနဲ့ အလှည့်အပြောင်းတွေကို ဇာတ်ကြောင်းပြောဟန်အတိုင်း စုစည်းတင်ဆက်ထားပါတယ်။"
        : "What starts off calmly soon unveils hidden stakes and unexpected turns, brought together in an engaging narrative recap.",
      keyTakeaways: isBurmese
        ? [
            "အဖွင့်ပိုင်းမှာတင် စိတ်ဝင်စားမှု ဆွဲတင်ပေးနိုင်တဲ့ ဇာတ်လမ်းအချိတ်အဆက်",
            "အခြေအနေတစ်ခုလုံးကို ပြောင်းလဲသွားစေတဲ့ အဓိက ဆုံးဖြတ်ချက်",
            "ရုပ်ရှင်အရသာမပျက် မြန်မာဇာတ်ကြောင်းပြောဟန်နဲ့ တင်ဆက်ထားမှု",
          ]
        : [
            "Strong opening hook that establishes tension immediately",
            "Pivotal decision that reshapes the narrative arc",
            "Storyteller-paced breakdown timed to key visual beats",
          ],
      sentimentOrTone: isBurmese
        ? "Engaging Storyteller · ရင်ခုန်စိတ်လှုပ်ရှားဖွယ်"
        : "Cinematic & Suspenseful Storytelling",
    },
    media,
    sanitizedClips,
    targetDuration,
    language
  );

  return { recap, clips: sanitizedClips };
}

const RECAP_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description:
        "Punchy, emotionally engaging storyteller headline (spoken-style natural Burmese Unicode when Burmese is selected, never a dry literal translation).",
    },
    executiveSummary: {
      type: Type.STRING,
      description:
        "3-4 sentence gripping narrative synopsis with an opening hook, rising tension, and storyteller cadence suitable for spoken voiceover.",
    },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "3 to 5 crisp, memorable insights or turning points written in natural storyteller phrasing.",
    },
    timeline: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: {
            type: Type.STRING,
            description: "MM:SS timestamp string matching the moment in the recap (e.g., 00:00, 00:08).",
          },
          event: {
            type: Type.STRING,
            description:
              "Vivid narrative beat describing what unfolds at that timestamp in natural spoken cadence.",
          },
        },
        required: ["timestamp", "event"],
      },
      description: "Chronological timeline of 3 to 6 vivid story beats in the recap.",
    },
    sentimentOrTone: {
      type: Type.STRING,
      description:
        "Concise mood/tone label (e.g., 'Suspenseful Storyteller · ရင်ခုန်စိတ်လှုပ်ရှားဖွယ်').",
    },
    clips: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          clipTitleBurmese: { type: Type.STRING },
          clipSummaryBurmese: { type: Type.STRING },
          startSec: { type: Type.NUMBER },
          durationSec: { type: Type.NUMBER },
          narrationBurmese: {
            type: Type.STRING,
            description:
              "Fluid, engaging voiceover script paced cleanly for TTS narration with natural breath pauses.",
          },
          subtitles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startOffset: { type: Type.NUMBER },
                endOffset: { type: Type.NUMBER },
                text: { type: Type.STRING },
              },
              required: ["startOffset", "endOffset", "text"],
            },
          },
        },
        required: [
          "clipTitleBurmese",
          "clipSummaryBurmese",
          "startSec",
          "durationSec",
          "narrationBurmese",
          "subtitles",
        ],
      },
    },
  },
  required: [
    "title",
    "executiveSummary",
    "keyTakeaways",
    "timeline",
    "sentimentOrTone",
    "clips",
  ],
};

interface RawStructuredGeminiOutput extends Partial<StructuredRecapSummary> {
  clips?: GeneratedClipSpec[];
}

export function buildRecapSystemInstruction(
  language: RecapLanguage = "my",
  sourceKind: "media_url" | "uploaded_file" = "media_url"
): string {
  if (language === "en") {
    return `You are KKSRecap AI, a captivating cinematic storyteller, movie recapper, and ${
      sourceKind === "uploaded_file" ? "audio/video" : "multimedia"
    } narrator.
Voice & Style Rules:
- Narrate like a charismatic human storyteller speaking directly to an audience—use vivid verbs, tension-building hooks, and smooth spoken transitions rather than robotic textbook summaries.
- Craft every section (title, executiveSummary, keyTakeaways, timeline, narrationBurmese, subtitles) in crisp, natural English suitable for both screen reading and voiceover TTS.
- Keep subtitle lines punchy (5 to 11 words per cue) so they read effortlessly on mobile screens.
- Always return a strict JSON object matching the configured responseSchema.`;
  }

  return `You are KKSRecap AI, an acclaimed Burmese cinematic movie-recap host and master oral storyteller (ရုပ်ရှင်ဇာတ်လမ်းနှင့် အကြောင်းအရာများကို ပရိသတ်နားထောင်ချင်အောင် ပြန်လည်ပြောပြတတ်သည့် ဝါရင့် မြန်မာ Storyteller / Narrator).

CRITICAL BURMESE STORYTELLING & TRANSLATION RULES:
1. Natural Oral Storyteller Voice (စကားပြောဟန် ဇာတ်ကြောင်းပြောနည်း):
   - NEVER produce stiff, robotic, word-for-word literal translations from English syntax. Avoid dry bureaucratic or textbook endings such as "...ခြင်းဖြစ်သည်", "...ကို ပြုလုပ်ခဲ့သည်", "...ကြောင့်ဖြစ်ပါသည်", "ဤဗီဒီယိုတွင်", or unnatural pronouns like "သူ/သူမ သည်".
   - Write in warm, vivid, captivating spoken-style Burmese (အပြောစကား + ဇာတ်ကြောင်းပြောဟန်) as if narrating an exciting story to listeners: use natural conversational endings ("...ပါတယ်", "...လိုက်ရပါတယ်", "...သွားခဲ့ပြီပေါ့", "...ဖြစ်နေပါတော့တယ်", "...ပါပဲ") and gripping connectors ("တကယ်တော့...", "မထင်မှတ်ထားတဲ့အချိန်မှာပဲ...", "ဒီနေရာမှာတင်...", "အဲဒီနောက် ဘာဆက်ဖြစ်လဲဆိုတော့...", "စိတ်ဝင်စားဖို့ကောင်းတာက...").
2. Dramatic Pacing & TTS Breath Rhythm:
   - Open executiveSummary and narrationBurmese with an intriguing hook that makes the viewer curious right away, build tension through the middle, and land on an impactful reveal or insight.
   - Structure sentences cleanly with natural breath pauses (Burmese "၊" or "။") so Gemini TTS and Web Speech voiceovers sound expressive, fluent, and unhurried.
3. Subtitle Craftsmanship:
   - Keep each subtitle cue concise (12 to 34 Burmese characters) using conversational spoken phrases that sync comfortably with rapid visual cuts.
4. Strict Standard Myanmar Unicode Only:
   - Output 100% standard NFC Myanmar Unicode (U+1000–U+109F). NEVER emit Zawgyi codepoints, garbled glyphs, or broken character sequences.
   - Keep well-known proper names accurate or smoothly phoneticized for natural Burmese pronunciation.
5. Strictly adhere to the configured JSON responseSchema.`;
}

export function buildRecapPromptText(params: {
  language: RecapLanguage;
  sourceKind: "media_url" | "uploaded_file";
  media: SourceMediaInfo;
  safeDurationTarget: number;
  desiredCueCount: number;
  clipCountGoal: number;
  maxDurationHint: string;
  extraSourceSection?: string;
  mimeType?: string;
}): string {
  const {
    language,
    sourceKind,
    media,
    safeDurationTarget,
    desiredCueCount,
    clipCountGoal,
    maxDurationHint,
    extraSourceSection = "",
    mimeType = "video/mp4",
  } = params;

  const langDirective =
    language === "en"
      ? "Write all titles, summaries, takeaways, timeline events, narration, and subtitle cues in gripping, natural English storytelling prose."
      : "Write title, executiveSummary, keyTakeaways, timeline events, narrationBurmese, and subtitle cues in natural, captivating SPOKEN BURMESE storytelling style (မြန်မာ ဇာတ်ကြောင်းပြော Storyteller ဟန် — စာအုပ်ဆန်ဆန် ဘာသာပြန်ခြင်း လုံးဝရှောင်ကြဉ်ပါ).";

  const sourceHeader =
    sourceKind === "uploaded_file"
      ? `Analyze this uploaded ${mimeType.startsWith("audio/") ? "audio" : "video"} file directly via Gemini File API.`
      : `Analyze this source content (frames, transcript, or article text and metadata).`;

  return `${sourceHeader}
Language Mode: ${language === "en" ? "English Storyteller" : "Burmese Storyteller (Myanmar Unicode)"}
${langDirective}

Deliver:
1. Structured recap intelligence:
   - title: Intriguing, scroll-stopping story headline (no generic "Summary of..." prefix).
   - executiveSummary: 3-4 vivid, flowing storyteller sentences — start with a compelling hook, trace the rising stakes or core idea, and close with a memorable thought/cliffhanger.
   - keyTakeaways: 3 to 5 crisp, conversational reflections or highlights viewers will remember.
   - timeline: Chronological array of 3 to 6 { timestamp (MM:SS within 00:00..${formatMmSs(safeDurationTarget)}), event } narrative beats matching real moments.
   - sentimentOrTone: Mood/genre tag reflecting the emotional atmosphere.
2. ${clipCountGoal} cinematic recap clip blueprint(s) with durationSec = ${safeDurationTarget}, fluid voiceover narrationBurmese, and ${desiredCueCount} evenly timed subtitle cues spanning 0.0s to ${safeDurationTarget}.0s.

Source URL: ${media.normalizedUrl}
Title: ${media.title}
${sourceKind === "uploaded_file" ? `MIME Type: ${mimeType}` : `Author/Channel: ${media.author || "Unknown"}\nDescription: ${media.description || "N/A"}`}
${maxDurationHint}${extraSourceSection}`;
}

export async function analyzeVideoWithGemini(
  media: SourceMediaInfo,
  clipDurationTarget = 12,
  language: RecapLanguage = "my",
  apiKey?: string
): Promise<GeneratedRecapPayload> {
  const safeDurationTarget = Math.max(5, Math.min(300, Math.round(clipDurationTarget)));
  const lang: RecapLanguage = language === "en" ? "en" : "my";
  const analysisCacheKey = `${media.normalizedUrl || media.title}::${lang}::${safeDurationTarget}::${Math.floor(media.videoDurationSec || 0)}`;
  const cachedAnalysis = geminiAnalysisCache.get(analysisCacheKey);
  if (cachedAnalysis && Date.now() - cachedAnalysis.timestamp < 30 * 60 * 1000) {
    return {
      recap: JSON.parse(JSON.stringify(cachedAnalysis.recap)) as StructuredRecapSummary,
      clips: JSON.parse(JSON.stringify(cachedAnalysis.specs)) as GeneratedClipSpec[],
    };
  }

  const effectiveKey = resolveEffectiveGeminiApiKey(apiKey);
  if (!effectiveKey) {
    return buildFallbackClipSpecs(media, safeDurationTarget, lang);
  }

  const ai = getGenAIClient(effectiveKey);
  const desiredCueCount = getDesiredCueCount(safeDurationTarget);
  const clipCountGoal = safeDurationTarget >= 90 ? 1 : 2;
  const maxDurationHint = media.videoDurationSec
    ? `Source video total duration is ${Math.floor(media.videoDurationSec)} seconds. Choose startSec safely within [0, ${Math.max(0, Math.floor(media.videoDurationSec - safeDurationTarget - 1))}].`
    : `Choose realistic startSec timestamps (e.g. 0 or 10).`;

  const systemInstruction = buildRecapSystemInstruction(lang, "media_url");

  const extraSourceSection = media.articleText
    ? `\nSource Type: ${media.platform}\nArticle / Raw Text Content:\n${media.articleText.slice(0, 18000)}\n`
    : media.transcriptText
    ? `\nSource Type: ${media.platform}\nTimestamped Transcript:\n${media.transcriptText.slice(0, 16000)}\n`
    : "";

  const promptText = buildRecapPromptText({
    language: lang,
    sourceKind: "media_url",
    media,
    safeDurationTarget,
    desiredCueCount,
    clipCountGoal,
    maxDurationHint,
    extraSourceSection,
  });

  // Primary: gemini-4-hydrogen, Secondary: gemini-3.1-flash-lite (no deprecated sampling params)
  const candidateModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];
  const aiTimeoutMs = Math.max(12000, Math.min(35000, 9000 + desiredCueCount * 400));

  for (const modelName of candidateModels) {
    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      for (const framePath of media.framePaths.slice(0, 5)) {
        if (framePath && fs.existsSync(framePath)) {
          const imgBytes = fs.readFileSync(framePath);
          if (imgBytes.byteLength > 1000 && imgBytes.byteLength < 2 * 1024 * 1024) {
            parts.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: imgBytes.toString("base64"),
              },
            });
          }
        }
      }
      parts.push({ text: promptText });

      const response: GenerateContentResponse = await Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: RECAP_RESPONSE_SCHEMA,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("AI Analysis Timeout")), aiTimeoutMs)
        ),
      ]);

      const rawJson = (response.text ?? "").trim();
      if (rawJson) {
        const parsed = JSON.parse(rawJson) as RawStructuredGeminiOutput;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const rawClips = Array.isArray(parsed.clips) && parsed.clips.length > 0
            ? parsed.clips
            : buildFallbackClipSpecs(media, safeDurationTarget, lang).clips;

          const sanitizedClips = sanitizeClipSpecs(rawClips, media.videoDurationSec, safeDurationTarget, lang);
          const sanitizedRecap = sanitizeStructuredRecap(
            parsed,
            media,
            sanitizedClips,
            safeDurationTarget,
            lang
          );

          if (geminiAnalysisCache.size >= 50) {
            const oldestKey = geminiAnalysisCache.keys().next().value;
            if (oldestKey) geminiAnalysisCache.delete(oldestKey);
          }
          geminiAnalysisCache.set(analysisCacheKey, {
            recap: JSON.parse(JSON.stringify(sanitizedRecap)) as StructuredRecapSummary,
            specs: JSON.parse(JSON.stringify(sanitizedClips)) as GeneratedClipSpec[],
            timestamp: Date.now(),
          });

          return {
            recap: sanitizedRecap,
            clips: sanitizedClips,
          };
        }
      }
    } catch {
      // Try next model or fallback template
    }
  }

  return buildFallbackClipSpecs(media, safeDurationTarget, lang);
}

export async function analyzeUploadedMediaWithGeminiFileApi(options: {
  filePath: string;
  mimeType: string;
  media: SourceMediaInfo;
  clipDurationTarget?: number;
  language?: RecapLanguage;
  apiKey?: string;
  onProgress?: (percent: number, message: string) => void;
}): Promise<GeneratedRecapPayload> {
  const { filePath, mimeType, media, clipDurationTarget = 12, language = "my", apiKey, onProgress } = options;
  const safeDurationTarget = Math.max(5, Math.min(300, Math.round(clipDurationTarget)));
  const lang: RecapLanguage = language === "en" ? "en" : "my";

  const effectiveKey = resolveEffectiveGeminiApiKey(apiKey);
  if (!effectiveKey || !fs.existsSync(filePath)) {
    return analyzeVideoWithGemini(media, safeDurationTarget, lang, apiKey);
  }

  const ai = getGenAIClient(effectiveKey);
  let uploadedFileName: string | undefined;

  try {
    onProgress?.(32, "Gemini File API သို့ အသံ/ဗီဒီယိုဖိုင် တင်ပို့စစ်ဆေးနေပါသည်...");
    const uploaded = await ai.files.upload({
      file: filePath,
      config: {
        mimeType,
        displayName: media.title || "kks-uploaded-media",
      },
    });
    uploadedFileName = uploaded.name;

    let activeFile = uploaded;
    const pollStart = Date.now();
    while (activeFile.state === "PROCESSING" && Date.now() - pollStart < 75000) {
      onProgress?.(40, "Gemini AI မှ ဖိုင်အတွင်းရှိ အသံနှင့် မြင်ကွင်းများကို ဖတ်ရှုနေပါသည်...");
      await new Promise((r) => setTimeout(r, 1500));
      if (!uploadedFileName) break;
      activeFile = await ai.files.get({ name: uploadedFileName });
    }

    if (activeFile.state === "FAILED") {
      throw new Error("Gemini File API processing failed for uploaded file.");
    }

    if (!activeFile.uri) {
      throw new Error("Gemini File API did not return a file URI.");
    }

    onProgress?.(
      52,
      lang === "en"
        ? "Crafting engaging storyteller recap & synchronized subtitles..."
        : "မြန်မာ Storyteller ဇာတ်ကြောင်းပြောဟန်ဖြင့် Recap နှင့် စာတန်းထိုးများ ထုတ်ယူနေပါသည်..."
    );

    const desiredCueCount = getDesiredCueCount(safeDurationTarget);
    const clipCountGoal = safeDurationTarget >= 90 ? 1 : 2;
    const maxDurationHint = media.videoDurationSec
      ? `Uploaded media duration is ${Math.floor(media.videoDurationSec)} seconds. Choose startSec safely within [0, ${Math.max(0, Math.floor(media.videoDurationSec - safeDurationTarget - 1))}].`
      : `Choose realistic startSec timestamps starting at 0.`;

    const systemInstruction = buildRecapSystemInstruction(lang, "uploaded_file");
    const promptText = buildRecapPromptText({
      language: lang,
      sourceKind: "uploaded_file",
      media,
      safeDurationTarget,
      desiredCueCount,
      clipCountGoal,
      maxDurationHint,
      mimeType,
    });

    const filePart = createPartFromUri(activeFile.uri, activeFile.mimeType || mimeType);
    const candidateModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

    for (const modelName of candidateModels) {
      try {
        const response: GenerateContentResponse = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents: { parts: [filePart, { text: promptText }] },
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: RECAP_RESPONSE_SCHEMA,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Gemini File API analysis timeout")), 45000)
          ),
        ]);

        const rawJson = (response.text ?? "").trim();
        if (rawJson) {
          const parsed = JSON.parse(rawJson) as RawStructuredGeminiOutput;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const rawClips =
              Array.isArray(parsed.clips) && parsed.clips.length > 0
                ? parsed.clips
                : buildFallbackClipSpecs(media, safeDurationTarget, lang).clips;
            const sanitizedClips = sanitizeClipSpecs(
              rawClips,
              media.videoDurationSec,
              safeDurationTarget,
              lang
            );
            const sanitizedRecap = sanitizeStructuredRecap(
              parsed,
              media,
              sanitizedClips,
              safeDurationTarget,
              lang
            );

            return {
              recap: sanitizedRecap,
              clips: sanitizedClips,
            };
          }
        }
      } catch {
        // Try next candidate model
      }
    }
  } catch (err) {
    console.warn("Gemini File API upload analysis fallback:", err instanceof Error ? err.message : err);
  } finally {
    if (uploadedFileName) {
      ai.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }

  return analyzeVideoWithGemini(media, safeDurationTarget, lang, apiKey);
}

export function wrapPcmWithWavHeader(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  if (pcmBuffer.length >= 12 && pcmBuffer.toString("utf-8", 0, 4) === "RIFF") {
    return pcmBuffer; // Already valid WAV
  }
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export async function generateNarrationWavBuffer(
  narrationText: string,
  apiKey?: string
): Promise<Buffer | null> {
  const cleanText = String(narrationText || "").trim().slice(0, 4000);
  if (!cleanText) return null;
  const effectiveKey = resolveEffectiveGeminiApiKey(apiKey);
  if (!effectiveKey) {
    return null;
  }
  try {
    const ai = getGenAIClient(effectiveKey);
    const ttsTimeoutMs = Math.max(10000, Math.min(45000, cleanText.length * 70));
    const response = await Promise.race([
      ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [{ text: cleanText }],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TTS timeout")), ttsTimeoutMs)),
    ]);

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const rawBuffer = Buffer.from(base64Audio, "base64");
      if (rawBuffer.byteLength > 200) {
        return wrapPcmWithWavHeader(rawBuffer);
      }
    }
  } catch {
    // Graceful fallback
  }
  return null;
}

export async function generateNarrationWav(
  narrationText: string,
  outWavPath: string,
  apiKey?: string
): Promise<boolean> {
  const wavBuffer = await generateNarrationWavBuffer(narrationText, apiKey);
  if (!wavBuffer) return false;
  fs.writeFileSync(outWavPath, wavBuffer);
  return true;
}
