import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clock,
  Edit3,
  FileText,
  Film,
  ListChecks,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import type { StructuredRecapSummary, ToastNotification } from "./types";
import { getGeminiKeyHeaders, resolveApiUrl } from "../utils/apiKeyStorage";

interface RecapScriptEditorProps {
  recap: StructuredRecapSummary;
  isDraftPendingRender: boolean;
  isRenderingVideo: boolean;
  hasActiveClip: boolean;
  activeClipDuration?: number;
  onSeekToTime?: (seconds: number) => void;
  onUpdateRecap: (updated: StructuredRecapSummary) => void;
  onRenderVideoFromScript: (editedRecap: StructuredRecapSummary) => void;
  onCloseEditor: () => void;
  onNotifyToast?: (toast: Omit<ToastNotification, "id">) => void;
}

interface SegmentAudioEntry {
  blobUrl?: string;
  engine: "gemini_tts" | "web_speech";
  textSnapshot: string;
}

function parseTimestampSeconds(raw: string): number | null {
  const cleaned = raw.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(cleaned);
  if (!match) return null;
  if (match[3] !== undefined) {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function suggestNextTimestamp(timeline: Array<{ timestamp: string; event: string }>): string {
  if (timeline.length === 0) return "00:00";
  const lastSec = parseTimestampSeconds(timeline[timeline.length - 1].timestamp);
  const nextSec = lastSec !== null ? lastSec + 5 : timeline.length * 5;
  const mins = Math.floor(nextSec / 60);
  const secs = nextSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function RecapScriptEditor({
  recap,
  isDraftPendingRender,
  isRenderingVideo,
  hasActiveClip,
  activeClipDuration,
  onSeekToTime,
  onUpdateRecap,
  onRenderVideoFromScript,
  onCloseEditor,
  onNotifyToast,
}: RecapScriptEditorProps) {
  const [audioLoadingKey, setAudioLoadingKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [audioEntries, setAudioEntries] = useState<Record<string, SegmentAudioEntry>>({});
  const [audioStatusMsg, setAudioStatusMsg] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const entriesRef = useRef<Record<string, SegmentAudioEntry>>({});
  entriesRef.current = audioEntries;

  const stopPlayback = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // Ignore
      }
      audioRef.current = null;
    }
    setPlayingKey(null);
  };

  useEffect(() => {
    return () => {
      stopPlayback();
      Object.values(entriesRef.current).forEach((entry) => {
        if (entry.blobUrl) {
          URL.revokeObjectURL(entry.blobUrl);
        }
      });
    };
  }, []);

  const speakWithWebSpeech = (key: string, text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioStatusMsg("ဤ Browser တွင် Web Speech API မထောက်ပံ့သေးပါ။");
      setPlayingKey(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const hasMyanmar = /[\u1000-\u109F]/.test(text);
    if (hasMyanmar) {
      const myVoice = voices.find((v) => v.lang.toLowerCase().startsWith("my"));
      if (myVoice) utterance.voice = myVoice;
      utterance.lang = myVoice?.lang || "my-MM";
    } else {
      const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
      if (enVoice) utterance.voice = enVoice;
      utterance.lang = enVoice?.lang || "en-US";
    }

    utterance.onend = () => setPlayingKey(null);
    utterance.onerror = () => setPlayingKey(null);

    setPlayingKey(key);
    setAudioEntries((prev) => ({
      ...prev,
      [key]: { engine: "web_speech", textSnapshot: text },
    }));
    setAudioStatusMsg("Browser Web Speech API ဖြင့် အသံအသစ် ဖတ်ပြနေပါသည် ✓");
    window.speechSynthesis.speak(utterance);
  };

  const handleRegenerateAudio = async (key: string, rawText: string) => {
    const cleanText = rawText.trim();
    if (cleanText.length < 3) {
      setAudioStatusMsg("အသံထုတ်ယူရန် အနည်းဆုံး စာလုံး ၃ လုံး ထည့်သွင်းပေးပါ။");
      return;
    }

    stopPlayback();
    setAudioLoadingKey(key);
    setAudioStatusMsg(null);

    try {
      const res = await fetch(resolveApiUrl("/api/recap/tts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getGeminiKeyHeaders(),
        },
        cache: "no-store",
        body: JSON.stringify({ text: cleanText }),
      });

      const remainingHeader = res.headers.get("x-demo-remaining");
      const modeHeader = res.headers.get("x-demo-mode");
      const limitHeader = res.headers.get("x-demo-limit");
      if (modeHeader || remainingHeader !== null) {
        const limit = limitHeader !== null ? Number(limitHeader) : 2;
        const remaining = remainingHeader !== null ? Number(remainingHeader) : limit;
        window.dispatchEvent(
          new CustomEvent("kks-demo-quota", {
            detail: {
              mode: modeHeader === "byok" ? "byok" : "demo",
              hasPersonalApiKey: modeHeader === "byok",
              demoLimit: Number.isFinite(limit) ? limit : 2,
              demoRemaining: Number.isFinite(remaining) ? Math.max(0, remaining) : 2,
              demoUsed: Math.max(0, (Number.isFinite(limit) ? limit : 2) - (Number.isFinite(remaining) ? remaining : 2)),
            },
          })
        );
      }

      if (!res.ok) {
        let parsedErr: any = null;
        try {
          parsedErr = await res.json();
        } catch {
          // Ignore non-JSON body
        }
        if (res.status === 429 && parsedErr?.error) {
          onNotifyToast?.({
            variant: "warning",
            title:
              parsedErr.code === "DEMO_QUOTA_EXCEEDED"
                ? "Free Demo Mode ကန့်သတ်ချက် ပြည့်ပါပြီ"
                : "AI TTS Rate Limit",
            message: `${parsedErr.error} Browser Voice ဖြင့် စမ်းသပ်နားဆင်ပေးနေပါသည်။`,
            actionType: "open_api_key",
          });
        }
        throw new Error(parsedErr?.error || "TTS fallback");
      }

      const wavBlob = await res.blob();
      const newBlobUrl = URL.createObjectURL(wavBlob);

      setAudioEntries((prev) => {
        const oldUrl = prev[key]?.blobUrl;
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        return {
          ...prev,
          [key]: {
            blobUrl: newBlobUrl,
            engine: "gemini_tts",
            textSnapshot: cleanText,
          },
        };
      });

      const audio = new Audio(newBlobUrl);
      audioRef.current = audio;
      audio.onended = () => setPlayingKey(null);
      audio.onerror = () => setPlayingKey(null);

      await audio.play();
      setPlayingKey(key);
      setAudioStatusMsg("Gemini TTS ဖြင့် အသံအသစ် ပြန်လည်ဖန်တီးပြီး နားဆင်နေပါသည် ✓");
    } catch {
      speakWithWebSpeech(key, cleanText);
    } finally {
      setAudioLoadingKey(null);
    }
  };

  const handlePlayExistingSegmentAudio = (key: string, currentText: string) => {
    if (playingKey === key) {
      stopPlayback();
      return;
    }
    const entry = audioEntries[key];
    if (entry && entry.textSnapshot === currentText.trim() && entry.blobUrl) {
      stopPlayback();
      const audio = new Audio(entry.blobUrl);
      audioRef.current = audio;
      audio.onended = () => setPlayingKey(null);
      audio.onerror = () => setPlayingKey(null);
      audio.play().catch(() => {});
      setPlayingKey(key);
      return;
    }
    handleRegenerateAudio(key, currentText);
  };

  const renderAudioRegenControls = (key: string, textValue: string, compact = false) => {
    const isLoading = audioLoadingKey === key;
    const isPlaying = playingKey === key;
    const entry = audioEntries[key];
    const isFreshForCurrentText = Boolean(entry && entry.textSnapshot === textValue.trim());

    return (
      <div className="flex flex-wrap items-center gap-2">
        {isPlaying ? (
          <button
            type="button"
            onClick={stopPlayback}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 hover:bg-red-900/70 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          isFreshForCurrentText && (
            <button
              type="button"
              onClick={() => handlePlayExistingSegmentAudio(key, textValue)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#0F291E] border border-emerald-500/45 text-emerald-200 hover:brightness-110 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              title="ပြန်လည်ဖန်တီးထားသော အသံကို ပြန်ဖွင့်ရန်"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Play</span>
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => handleRegenerateAudio(key, textValue)}
          disabled={isLoading || textValue.trim().length < 3}
          className={`${
            compact ? "min-h-[44px] px-3 py-2 text-xs" : "min-h-[44px] px-3.5 py-2 text-xs"
          } rounded-xl bg-[#181406] border border-[#F59E0B]/45 hover:bg-[#F59E0B] hover:text-black text-[#FBBF24] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50`}
          title="ပြင်ဆင်ထားသော စာသားအတွက် TTS အသံအသစ် ပြန်လည်ဖန်တီးရန်"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Regenerating...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Regenerate Audio</span>
            </>
          )}
        </button>

        {isFreshForCurrentText && !isLoading && (
          <span className="text-[11px] text-emerald-300 font-semibold px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30">
            Audio Updated ✓
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="print:hidden bg-[#0A0A0F]/85 sm:bg-[#09090C]/95 backdrop-blur-md border border-white/[0.08] sm:border-[#F59E0B]/55 rounded-2xl p-3 sm:p-6 shadow-[0_16px_42px_rgba(245,158,11,0.14)] space-y-4 sm:space-y-5 font-burmese">
      {/* Editor Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/10">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[#FBBF24]">
            <Edit3 className="w-4 h-4 text-[#F59E0B]" />
            <span>
              {isDraftPendingRender
                ? "Draft Ready — TTS အသံနှင့် ဗီဒီယို မထုတ်မီ Script & Timeline ပြင်ဆင်ရန်"
                : "Recap Script & Timeline Editor (တိုက်ရိုက်ပြင်ဆင်ရန်)"}
            </span>
          </div>
          <p className="text-xs text-[#A1A1AA]">
            အသံထွက် သို့မဟုတ် ဘာသာပြန် မှားယွင်းနေသည့် စာကြောင်းများကို ပြင်ဆင်ပြီး &apos;Regenerate Audio&apos; ဖြင့် စမ်းသပ်နားထောင်နိုင်သလို ဗီဒီယိုအသစ် ပြန်လည်ထုတ်ယူနိုင်ပါသည်။
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            stopPlayback();
            onCloseEditor();
          }}
          className="min-h-[44px] w-full sm:w-auto px-4 py-2 rounded-xl bg-[#141418] border border-white/15 hover:border-[#F59E0B]/50 text-xs font-semibold text-[#E4E4E7] inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
        >
          <Check className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Done Editing</span>
        </button>
      </div>

      {audioStatusMsg && (
        <div className="px-3.5 py-2 rounded-xl bg-[#181406] border border-[#F59E0B]/40 text-xs text-[#FBBF24]">
          {audioStatusMsg}
        </div>
      )}

      {/* Title & Tone Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-[#FBBF24] block">
            Recap Title (ခေါင်းစဉ်)
          </label>
          <input
            type="text"
            value={recap.title}
            onChange={(e) => onUpdateRecap({ ...recap, title: e.target.value })}
            placeholder="ရုပ်ရှင်အနှစ်ချုပ် ခေါင်းစဉ်..."
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#111116] border border-white/15 focus:border-[#F59E0B] focus:outline-none text-base sm:text-sm text-[#FFF2B2] font-semibold font-burmese leading-[1.8]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#FBBF24] block">
            Sentiment / Tone (ခံစားချက်)
          </label>
          <input
            type="text"
            value={recap.sentimentOrTone}
            onChange={(e) => onUpdateRecap({ ...recap, sentimentOrTone: e.target.value })}
            placeholder="Dramatic / Suspenseful..."
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#111116] border border-white/15 focus:border-[#F59E0B] focus:outline-none text-base sm:text-sm text-[#E4E4E7] font-burmese leading-[1.8]"
          />
        </div>
      </div>

      {/* Executive Summary / Narration Script */}
      <div className="p-3 sm:p-4 rounded-2xl bg-[#111116]/90 border border-white/[0.08] space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#FBBF24]">
            <FileText className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>Recap Script / Executive Summary</span>
          </div>
          {renderAudioRegenControls("summary", recap.executiveSummary, true)}
        </div>

        <textarea
          rows={4}
          value={recap.executiveSummary}
          onChange={(e) => onUpdateRecap({ ...recap, executiveSummary: e.target.value })}
          placeholder="မြန်မာဘာသာဖြင့် အနှစ်ချုပ် Narration Script..."
          className="w-full px-3.5 py-3 rounded-xl bg-[#09090C] border border-white/15 focus:border-[#F59E0B] focus:outline-none text-base sm:text-sm text-[#F4F4F6] font-burmese leading-[1.95]"
        />
      </div>

      {/* Timeline Segments Editor with Per-Segment Regenerate Audio */}
      <div className="p-3 sm:p-4 rounded-2xl bg-[#111116]/90 border border-white/[0.08] space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-[#FBBF24]">
            <Clock className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>Timeline Segments ({recap.timeline.length})</span>
            <span className="text-[11px] font-normal text-[#A1A1AA]">
              · စာသားပြင်ဆင်ပြီး အပိုင်းတစ်ခုချင်းစီ၏ အသံကို ပြန်လည်စစ်ဆေးနိုင်ပါသည်
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              const nextTs = suggestNextTimestamp(recap.timeline);
              onUpdateRecap({
                ...recap,
                timeline: [...recap.timeline, { timestamp: nextTs, event: "" }],
              });
            }}
            className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 rounded-xl bg-[#181406] border border-[#F59E0B]/40 hover:border-[#F59E0B] text-xs font-semibold text-[#FBBF24] inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Segment အသစ်ထည့်</span>
          </button>
        </div>

        <div className="space-y-3">
          {recap.timeline.map((seg, idx) => {
            const segKey = `seg-${idx}`;
            const sec = parseTimestampSeconds(seg.timestamp);
            const canSeek =
              hasActiveClip &&
              Boolean(onSeekToTime) &&
              sec !== null &&
              (activeClipDuration === undefined || sec <= activeClipDuration);

            return (
              <div
                key={`edit-seg-${idx}`}
                className="p-3.5 rounded-xl bg-[#09090C] border border-white/10 focus-within:border-[#F59E0B]/55 space-y-2.5 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#FBBF24] px-2.5 py-1 rounded-lg bg-[#181406] border border-[#F59E0B]/30">
                      #{idx + 1}
                    </span>

                    <input
                      type="text"
                      value={seg.timestamp}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        onUpdateRecap({
                          ...recap,
                          timeline: recap.timeline.map((item, i) =>
                            i === idx ? { ...item, timestamp: nextVal } : item
                          ),
                        });
                      }}
                      aria-label={`Segment ${idx + 1} timestamp`}
                      className="w-24 min-h-[44px] sm:min-h-[38px] px-2 py-1.5 rounded-xl bg-[#121216] border border-white/15 focus:border-[#F59E0B] focus:outline-none text-base sm:text-xs font-mono text-center text-[#FBBF24] tabular-nums"
                    />

                    {canSeek && (
                      <button
                        type="button"
                        onClick={() => onSeekToTime?.(sec!)}
                        className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-[#181406] border border-[#F59E0B]/35 text-[#FBBF24] hover:bg-[#F59E0B] hover:text-black transition-colors cursor-pointer flex items-center justify-center"
                        title="ဗီဒီယိုတွင် ဤအချိန်သို့ ရွှေ့ကြည့်ရန်"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
                    {renderAudioRegenControls(segKey, seg.event, true)}

                    {recap.timeline.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          stopPlayback();
                          onUpdateRecap({
                            ...recap,
                            timeline: recap.timeline.filter((_, i) => i !== idx),
                          });
                        }}
                        className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-[#71717A] hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer flex items-center justify-center"
                        aria-label={`Delete segment ${idx + 1}`}
                        title="ဤအပိုင်းကို ဖျက်ရန်"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={seg.event}
                  onChange={(e) => {
                    const nextEvent = e.target.value;
                    onUpdateRecap({
                      ...recap,
                      timeline: recap.timeline.map((item, i) =>
                        i === idx ? { ...item, event: nextEvent } : item
                      ),
                    });
                  }}
                  aria-label={`Segment ${idx + 1} script`}
                  placeholder="ဤအချိန်ပိုင်းအတွက် မြန်မာစာတန်းထိုးနှင့် အသံထွက် စာသား..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#121216] border border-white/10 focus:border-[#F59E0B] focus:outline-none text-base sm:text-sm text-[#F4F4F6] font-burmese leading-[1.9]"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Takeaways Editor */}
      <div className="p-3 sm:p-4 rounded-2xl bg-[#111116]/90 border border-white/[0.08] space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#FBBF24]">
            <ListChecks className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>Key Takeaways ({recap.keyTakeaways.length})</span>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateRecap({
                ...recap,
                keyTakeaways: [...recap.keyTakeaways, ""],
              })
            }
            className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 rounded-xl bg-[#181406] border border-[#F59E0B]/40 hover:border-[#F59E0B] text-xs font-semibold text-[#FBBF24] inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>အချက်အသစ်ထည့်</span>
          </button>
        </div>

        <div className="space-y-2">
          {recap.keyTakeaways.map((point, idx) => (
            <div key={`edit-takeaway-${idx}`} className="flex items-center gap-2">
              <input
                type="text"
                value={point}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateRecap({
                    ...recap,
                    keyTakeaways: recap.keyTakeaways.map((item, i) => (i === idx ? val : item)),
                  });
                }}
                placeholder="အဓိက မှတ်သားဖွယ်ရာ..."
                className="flex-1 min-w-0 min-h-[44px] px-3 py-2.5 rounded-xl bg-[#09090C] border border-white/10 focus:border-[#F59E0B] focus:outline-none text-base sm:text-sm text-[#E4E4E7] font-burmese leading-[1.85]"
              />
              {recap.keyTakeaways.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateRecap({
                      ...recap,
                      keyTakeaways: recap.keyTakeaways.filter((_, i) => i !== idx),
                    })
                  }
                  className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-[#71717A] hover:text-red-400 hover:bg-red-950/40 cursor-pointer flex items-center justify-center shrink-0"
                  aria-label={`Delete takeaway ${idx + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Render Video & Apply Action Footer */}
      <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="text-xs text-[#A1A1AA]">
          ပြင်ဆင်ချက်များသည် Audio Reader နှင့် Export (Markdown/.txt/PDF) တို့တွင် ချက်ချင်း အကျုံးဝင်ပြီးဖြစ်ပါသည်။
        </div>

        <button
          type="button"
          disabled={isRenderingVideo}
          onClick={() => {
            stopPlayback();
            onRenderVideoFromScript(recap);
          }}
          className="min-h-[48px] w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FBBF24] text-black font-bold text-xs sm:text-sm shadow-[0_8px_28px_rgba(245,158,11,0.35)] hover:brightness-105 active:scale-[0.99] disabled:opacity-65 inline-flex items-center justify-center gap-2 text-center cursor-pointer shrink-0"
        >
          {isRenderingVideo ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Script ဖြင့် MP4 ဗီဒီယို ဖန်တီးနေပါသည်...</span>
            </>
          ) : (
            <>
              <Film className="w-4 h-4 shrink-0" />
              <span>
                {isDraftPendingRender
                  ? "Generate TTS & Render Video (ဗီဒီယို ထုတ်ယူမည်)"
                  : hasActiveClip
                  ? "Apply Script & Re-Render Video (ဗီဒီယို ပြန်ထုတ်မည်)"
                  : "Render Video from Edited Script"}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
