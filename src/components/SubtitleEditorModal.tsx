import React from "react";
import { Check, Edit3, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import { ClipItem, SubtitleCue } from "./types";

interface SubtitleEditorModalProps {
  isOpen: boolean;
  activeClip: ClipItem | undefined;
  editingSubtitles: SubtitleCue[];
  setEditingSubtitles: React.Dispatch<React.SetStateAction<SubtitleCue[]>>;
  isReburning: boolean;
  reburnSuccessMsg: string | null;
  onClose: () => void;
  onSeekToCue: (startOffset: number) => void;
  onSaveAndReburn: () => void;
}

export function SubtitleEditorModal({
  isOpen,
  activeClip,
  editingSubtitles,
  setEditingSubtitles,
  isReburning,
  reburnSuccessMsg,
  onClose,
  onSeekToCue,
  onSaveAndReburn,
}: SubtitleEditorModalProps) {
  if (!isOpen || !activeClip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/85 backdrop-blur-md">
      <div className="bg-[#09090B] border border-[#F59E0B]/50 rounded-2xl w-full max-w-2xl p-4 sm:p-7 shadow-[0_0_60px_rgba(245,158,11,0.35)] relative max-h-[92dvh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Edit3 className="w-5 h-5 text-[#FBBF24] shrink-0" />
            <h3 className="text-sm sm:text-lg font-bold text-[#FFF2B2] font-burmese truncate">
              စာတန်းထိုး ပြင်ဆင်ရန် (Subtitle Editor)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ပိတ်မည်"
            className="min-h-[44px] min-w-[44px] rounded-xl text-[#A1A1AA] hover:text-white hover:bg-white/10 cursor-pointer flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-2 text-xs text-[#A1A1AA] font-burmese shrink-0">
          စာသား သို့မဟုတ် စက္ကန့် အချိန်များကို လိုအပ်သလို ပြင်ဆင်ပြီး &apos;စာတန်းထိုး အသစ်ဖြင့် ထုတ်ယူမည်&apos; ကို နှိပ်ပါ
        </p>

        {/* Quick Shift Timestamps Calibration Tool */}
        <div className="mt-3 p-3 rounded-xl bg-[#121215] border border-[#F59E0B]/30 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 text-xs font-burmese shrink-0">
          <span className="text-[#FBBF24] font-medium">⏱️ အချိန် တစ်ပြိုင်နက် ချိန်ညှိရန် (Shift):</span>
          <div className="grid grid-cols-4 sm:flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setEditingSubtitles((prev) =>
                  prev.map((c) => ({
                    ...c,
                    startOffset: Math.max(0, Number((c.startOffset - 0.5).toFixed(2))),
                    endOffset: Math.max(0.5, Number((c.endOffset - 0.5).toFixed(2))),
                  }))
                );
              }}
              className="min-h-[44px] sm:min-h-[36px] px-2 py-1.5 rounded-lg bg-[#1C1917] hover:bg-[#292524] text-[#FBBF24] border border-[#F59E0B]/30 cursor-pointer text-xs flex items-center justify-center"
              title="စာတန်းထိုးအားလုံးကို 0.5 စက္ကန့် စောတင်ရန်"
            >
              -0.5s
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSubtitles((prev) =>
                  prev.map((c) => ({
                    ...c,
                    startOffset: Number((c.startOffset + 0.5).toFixed(2)),
                    endOffset: Number((c.endOffset + 0.5).toFixed(2)),
                  }))
                );
              }}
              className="min-h-[44px] sm:min-h-[36px] px-2 py-1.5 rounded-lg bg-[#1C1917] hover:bg-[#292524] text-[#FBBF24] border border-[#F59E0B]/30 cursor-pointer text-xs flex items-center justify-center"
              title="စာတန်းထိုးအားလုံးကို 0.5 စက္ကန့် နောက်ဆုတ်ရန်"
            >
              +0.5s
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSubtitles((prev) =>
                  prev.map((c) => ({
                    ...c,
                    startOffset: Math.max(0, Number((c.startOffset - 1.0).toFixed(2))),
                    endOffset: Math.max(1.0, Number((c.endOffset - 1.0).toFixed(2))),
                  }))
                );
              }}
              className="min-h-[44px] sm:min-h-[36px] px-2 py-1.5 rounded-lg bg-[#1C1917] hover:bg-[#292524] text-[#FBBF24] border border-[#F59E0B]/30 cursor-pointer text-xs flex items-center justify-center"
              title="စာတန်းထိုးအားလုံးကို 1.0 စက္ကန့် စောတင်ရန်"
            >
              -1.0s
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSubtitles((prev) =>
                  prev.map((c) => ({
                    ...c,
                    startOffset: Number((c.startOffset + 1.0).toFixed(2)),
                    endOffset: Number((c.endOffset + 1.0).toFixed(2)),
                  }))
                );
              }}
              className="min-h-[44px] sm:min-h-[36px] px-2 py-1.5 rounded-lg bg-[#1C1917] hover:bg-[#292524] text-[#FBBF24] border border-[#F59E0B]/30 cursor-pointer text-xs flex items-center justify-center"
              title="စာတန်းထိုးအားလုံးကို 1.0 စက္ကန့် နောက်ဆုတ်ရန်"
            >
              +1.0s
            </button>
          </div>
        </div>

        {/* Subtitle Cue List */}
        <div className="mt-4 space-y-3 overflow-y-auto flex-1 pr-1 font-burmese">
          {editingSubtitles.map((cue, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-[#121215] border border-white/10 focus-within:border-[#F59E0B]/50 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-2.5">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSeekToCue(cue.startOffset)}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] p-2 rounded-xl bg-[#1F190B] text-[#FBBF24] hover:text-white border border-[#F59E0B]/30 cursor-pointer flex items-center justify-center"
                      title="ဤစက္ကန့်သို့ ဗီဒီယို ရွှေ့ပြပါ"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                    <span className="text-xs font-semibold text-[#FBBF24]">
                      စာတန်းထိုး အပိုင်း {idx + 1}
                    </span>
                  </div>

                  {editingSubtitles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSubtitles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="sm:hidden min-h-[44px] min-w-[44px] p-2 rounded-xl text-[#F87171] hover:text-[#EF4444] hover:bg-red-950/30 cursor-pointer flex items-center justify-center"
                      aria-label={`Delete subtitle ${idx + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#8E8E9A]">စက္ကန့်:</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    value={cue.startOffset}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditingSubtitles((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, startOffset: val } : c))
                      );
                    }}
                    className="w-20 sm:w-16 min-h-[44px] sm:min-h-[36px] px-2 py-1 rounded-lg bg-[#09090B] border border-white/10 text-base sm:text-xs text-center text-white tabular-nums"
                  />
                  <span className="text-xs text-[#8E8E9A]">မှ</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    value={cue.endOffset}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditingSubtitles((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, endOffset: val } : c))
                      );
                    }}
                    className="w-20 sm:w-16 min-h-[44px] sm:min-h-[36px] px-2 py-1 rounded-lg bg-[#09090B] border border-white/10 text-base sm:text-xs text-center text-white tabular-nums"
                  />
                  {editingSubtitles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSubtitles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="hidden sm:flex min-h-[36px] min-w-[36px] p-1.5 rounded-lg text-[#F87171] hover:text-[#EF4444] hover:bg-red-950/30 cursor-pointer items-center justify-center"
                      aria-label={`Delete subtitle ${idx + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <textarea
                rows={2}
                value={cue.text}
                onChange={(e) => {
                  const text = e.target.value;
                  setEditingSubtitles((prev) =>
                    prev.map((c, i) => (i === idx ? { ...c, text } : c))
                  );
                }}
                placeholder="မြန်မာစာတန်းထိုး ရေးသားပါ..."
                className="w-full bg-[#09090B] border border-white/10 rounded-xl p-3 text-base sm:text-sm text-[#F4F4F6] focus:border-[#F59E0B] focus:outline-none leading-[1.85]"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              const lastEnd =
                editingSubtitles.length > 0
                  ? editingSubtitles[editingSubtitles.length - 1].endOffset
                  : 0;
              setEditingSubtitles((prev) => [
                ...prev,
                {
                  startOffset: lastEnd,
                  endOffset: lastEnd + 3,
                  text: "စာတန်းထိုး အသစ်",
                },
              ]);
            }}
            className="w-full min-h-[44px] py-2.5 rounded-xl border border-dashed border-[#F59E0B]/40 hover:border-[#F59E0B] text-xs font-medium text-[#FBBF24] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>စာကြောင်း အသစ် ထည့်ရန်</span>
          </button>
        </div>

        {/* Success message */}
        {reburnSuccessMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-[#064E3B] text-emerald-200 text-xs text-center font-burmese">
            {reburnSuccessMsg}
          </div>
        )}

        {/* Modal Actions */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#18181B] text-xs font-medium text-[#A1A1AA] hover:text-white cursor-pointer flex items-center justify-center"
          >
            မလုပ်တော့ပါ
          </button>

          <button
            type="button"
            onClick={onSaveAndReburn}
            disabled={isReburning}
            className="min-h-[48px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-black font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
          >
            {isReburning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black shrink-0" />
                <span>Hard-code ပြန်လည်ထည့်သွင်းနေပါသည်...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-black shrink-0" />
                <span>စာတန်းထိုး အသစ်ဖြင့် ဗီဒီယို ထုတ်ယူမည်</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
