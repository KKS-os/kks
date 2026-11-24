import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Edit3, FileText, Film, ListChecks, Loader2, Play, Sparkles } from "lucide-react";
import { RecapActionsBar } from "./RecapActionsBar";
import { RecapScriptEditor } from "./RecapScriptEditor";
import type { StructuredRecapSummary, ToastNotification } from "./types";

interface RecapInsightsCardsProps {
  recap: StructuredRecapSummary | null;
  activeClipDuration?: number;
  hasActiveClip?: boolean;
  isDraftPendingRender?: boolean;
  isRenderingFromScript?: boolean;
  onSeekToTime?: (seconds: number) => void;
  onUpdateRecap?: (updated: StructuredRecapSummary) => void;
  onRenderVideoFromScript?: (editedRecap: StructuredRecapSummary) => void;
  onNotifyToast?: (toast: Omit<ToastNotification, "id">) => void;
}

function parseTimestampSeconds(raw: string): number | null {
  const cleaned = raw.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(cleaned);
  if (!match) return null;
  if (match[3] !== undefined) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    return h * 3600 + m * 60 + s;
  }
  const m = Number(match[1]);
  const s = Number(match[2]);
  return m * 60 + s;
}

export function RecapInsightsCards({
  recap,
  activeClipDuration,
  hasActiveClip = false,
  isDraftPendingRender = false,
  isRenderingFromScript = false,
  onSeekToTime,
  onUpdateRecap,
  onRenderVideoFromScript,
  onNotifyToast,
}: RecapInsightsCardsProps) {
  const [isEditingScript, setIsEditingScript] = useState<boolean>(isDraftPendingRender);
  const wasRenderingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isDraftPendingRender) {
      setIsEditingScript(true);
    }
  }, [isDraftPendingRender]);

  useEffect(() => {
    if (wasRenderingRef.current && !isRenderingFromScript) {
      setIsEditingScript(false);
    }
    wasRenderingRef.current = isRenderingFromScript;
  }, [isRenderingFromScript]);

  if (!recap) return null;

  return (
    <section
      aria-label="AI အနှစ်ချုပ် သုံးသပ်ချက် ကတ်များ"
      className="mt-5 sm:mt-8 space-y-3 sm:space-y-4 font-burmese"
    >
      {/* Interactive Listen to Recap & Export Toolbar + Edit Script Trigger */}
      <RecapActionsBar recap={recap} onNotifyToast={onNotifyToast} />

      <div className="print:hidden flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 sm:gap-3 p-3 sm:px-4 sm:py-3.5 rounded-2xl bg-[#0A0A0F]/85 backdrop-blur-md border border-white/[0.08] sm:border-[#F59E0B]/30">
        <div className="text-xs text-[#D4D4D8] flex items-start sm:items-center gap-2">
          <Edit3 className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5 sm:mt-0" />
          <span>
            {isDraftPendingRender
              ? "Draft Script အဆင်သင့်ဖြစ်ပါပြီ — TTS အသံ သို့မဟုတ် ဗီဒီယို မထုတ်မီ Script နှင့် Timeline ကို ပြင်ဆင်နိုင်ပါသည်"
              : "Recap Script နှင့် Timeline အချိန်မှတ်တမ်းများကို ပြင်ဆင်ပြီး Segment အသံ ပြန်လည်ထုတ်ယူနိုင်ပါသည်"}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsEditingScript((prev) => !prev)}
            className={`min-h-[44px] w-full sm:w-auto px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isEditingScript
                ? "bg-[#F59E0B] text-black shadow-md"
                : "bg-[#181406] border border-[#F59E0B]/50 text-[#FBBF24] hover:bg-[#F59E0B]/20"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isEditingScript
                ? "Preview Cards ကြည့်ရန်"
                : "Edit Script & Timeline / Regenerate Audio"}
            </span>
          </button>

          {!isEditingScript && isDraftPendingRender && onRenderVideoFromScript && (
            <button
              type="button"
              disabled={isRenderingFromScript}
              onClick={() => onRenderVideoFromScript(recap)}
              className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-black font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-60"
            >
              {isRenderingFromScript ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Film className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Render Video Now</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Interactive Script & Timeline Editor OR Screen Dark-Gold Cards */}
      {isEditingScript && onUpdateRecap && onRenderVideoFromScript ? (
        <RecapScriptEditor
          recap={recap}
          isDraftPendingRender={isDraftPendingRender}
          isRenderingVideo={isRenderingFromScript}
          hasActiveClip={hasActiveClip}
          activeClipDuration={activeClipDuration}
          onSeekToTime={onSeekToTime}
          onUpdateRecap={onUpdateRecap}
          onRenderVideoFromScript={onRenderVideoFromScript}
          onCloseEditor={() => setIsEditingScript(false)}
          onNotifyToast={onNotifyToast}
        />
      ) : (
        <div className="space-y-3 sm:space-y-4 print:hidden">
          {/* Top Card: Title & Sentiment / Tone */}
          <div className="bg-[#0A0A0F]/85 sm:bg-[#09090C]/95 backdrop-blur-md border border-white/[0.08] sm:border-[#F59E0B]/35 rounded-2xl p-3 sm:p-6 shadow-[0_14px_36px_rgba(0,0,0,0.7)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-[#F59E0B] font-semibold">
                Structured AI Recap Intelligence
              </div>
              <h2 className="mt-1 text-lg sm:text-xl font-bold text-[#FFF2B2] burmese-heading">
                {recap.title}
              </h2>
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#181406] border border-[#F59E0B]/45 text-xs font-semibold text-[#FBBF24] font-burmese leading-[1.7] shrink-0 self-start sm:self-center">
              <Sparkles className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <span>{recap.sentimentOrTone}</span>
            </div>
          </div>

          {/* Executive Summary Card */}
          <div className="bg-[#0A0A0F]/85 sm:bg-[#09090C]/95 backdrop-blur-md border border-white/[0.08] hover:border-[#F59E0B]/35 transition-colors rounded-2xl p-3 sm:p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 text-sm font-bold text-[#FBBF24] burmese-heading">
                <div className="w-8 h-8 rounded-lg bg-[#181406] border border-[#F59E0B]/40 flex items-center justify-center text-[#F59E0B] shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <span>အနှစ်ချုပ် သုံးသပ်ချက် (Executive Summary)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingScript(true)}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#181406] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-xs text-[#FBBF24] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Script</span>
              </button>
            </div>
            <p className="mt-3 sm:mt-3.5 text-sm sm:text-[15px] text-[#E4E4E7] burmese-body leading-[1.95]">
              {recap.executiveSummary}
            </p>
          </div>

          {/* 2-Column Grid: Key Takeaways + Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {/* Key Takeaways Card */}
            <div className="bg-[#0A0A0F]/85 sm:bg-[#09090C]/95 backdrop-blur-md border border-white/[0.08] hover:border-[#F59E0B]/35 transition-colors rounded-2xl p-3 sm:p-6 shadow-xl flex flex-col">
              <div className="flex items-center gap-2.5 text-sm font-bold text-[#FBBF24] burmese-heading">
                <div className="w-8 h-8 rounded-lg bg-[#181406] border border-[#F59E0B]/40 flex items-center justify-center text-[#F59E0B] shrink-0">
                  <ListChecks className="w-4 h-4" />
                </div>
                <span>အဓိက မှတ်သားဖွယ်ရာများ (Key Takeaways)</span>
              </div>

              <ul className="mt-3 sm:mt-4 space-y-2 sm:space-y-2.5 flex-1">
                {recap.keyTakeaways.map((point, idx) => (
                  <li
                    key={`takeaway-${idx}`}
                    className="flex items-start gap-2.5 p-2.5 sm:p-3.5 rounded-xl bg-[#121215]/90 border border-white/[0.06]"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#F59E0B] shrink-0 mt-1.5" />
                    <span className="text-xs sm:text-sm text-[#E4E4E7] burmese-body leading-[1.9]">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Chronological Timeline Card */}
            <div className="bg-[#0A0A0F]/85 sm:bg-[#09090C]/95 backdrop-blur-md border border-white/[0.08] hover:border-[#F59E0B]/35 transition-colors rounded-2xl p-3 sm:p-6 shadow-xl flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 text-sm font-bold text-[#FBBF24] burmese-heading">
                  <div className="w-8 h-8 rounded-lg bg-[#181406] border border-[#F59E0B]/40 flex items-center justify-center text-[#F59E0B] shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <span>ဇာတ်လမ်း အချိန်မှတ်တမ်း (Timeline)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingScript(true)}
                  className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#181406] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-xs text-[#FBBF24] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Segments</span>
                </button>
              </div>

              <div className="mt-3 sm:mt-4 space-y-2 sm:space-y-2.5 flex-1">
                {recap.timeline.map((item, idx) => {
                  const sec = parseTimestampSeconds(item.timestamp);
                  const canSeek =
                    Boolean(onSeekToTime) &&
                    sec !== null &&
                    (activeClipDuration === undefined || sec <= activeClipDuration);

                  return (
                    <div
                      key={`timeline-${idx}`}
                      className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl bg-[#121215]/90 border border-white/[0.06] hover:border-[#F59E0B]/30 transition-colors"
                    >
                      {canSeek ? (
                        <button
                          type="button"
                          onClick={() => onSeekToTime?.(sec!)}
                          className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#1F190B] border border-[#F59E0B]/45 hover:bg-[#F59E0B] hover:text-black text-xs font-mono font-bold text-[#FBBF24] tabular-nums shrink-0 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                          title="ဤအချိန်သို့ ဗီဒီယို ရွှေ့ကြည့်ရန်"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{item.timestamp}</span>
                        </button>
                      ) : (
                        <span className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#181406] border border-[#F59E0B]/30 text-xs font-mono font-bold text-[#FBBF24] tabular-nums shrink-0 inline-flex items-center">
                          {item.timestamp}
                        </span>
                      )}

                      <span className="text-xs sm:text-sm text-[#E4E4E7] burmese-body leading-[1.9]">
                        {item.event}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print / Save PDF Clean Editorial Document View with Myanmar Unicode Support */}
      <article className="hidden print:block bg-white text-neutral-900 p-6 space-y-6 font-burmese">
        <header className="print-section border-b-2 border-amber-600 pb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            KKSRecap AI Studio — Structured Recap Export
          </div>
          <h1 className="mt-2 text-2xl font-bold text-neutral-900 burmese-heading leading-[1.72]">
            {recap.title}
          </h1>
          <p className="mt-2.5 text-sm font-medium text-neutral-700 burmese-body leading-[1.85]">
            Tone / Mood: {recap.sentimentOrTone}
          </p>
        </header>

        <section className="print-section">
          <h2 className="text-base font-bold text-neutral-900 border-b border-neutral-300 pb-1.5 burmese-heading">
            Executive Summary (အနှစ်ချုပ် သုံးသပ်ချက်)
          </h2>
          <p className="mt-3 text-[15px] text-neutral-800 burmese-body leading-[1.95]">
            {recap.executiveSummary}
          </p>
        </section>

        <section className="print-section">
          <h2 className="text-base font-bold text-neutral-900 border-b border-neutral-300 pb-1.5 burmese-heading">
            Key Takeaways (အဓိက မှတ်သားဖွယ်ရာများ)
          </h2>
          <ul className="mt-3 list-disc pl-5 space-y-2.5 text-[14px] text-neutral-800 burmese-body leading-[1.95]">
            {recap.keyTakeaways.map((point, idx) => (
              <li key={`print-takeaway-${idx}`} className="print-row">
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className="print-section">
          <h2 className="text-base font-bold text-neutral-900 border-b border-neutral-300 pb-1.5 burmese-heading">
            Timeline (ဇာတ်လမ်း အချိန်မှတ်တမ်း)
          </h2>
          <div className="mt-3 space-y-2.5 text-[14px] text-neutral-800 burmese-body leading-[1.95]">
            {recap.timeline.map((item, idx) => (
              <div key={`print-timeline-${idx}`} className="print-row flex items-start gap-3">
                <span className="font-mono font-bold text-amber-800 shrink-0 pt-0.5">
                  [{item.timestamp}]
                </span>
                <span className="burmese-body leading-[1.95]">{item.event}</span>
              </div>
            ))}
          </div>
        </section>
      </article>
    </section>
  );
}
