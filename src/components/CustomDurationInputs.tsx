import { useEffect, useState } from "react";
import { MIN_CLIP_DURATION_SEC, clampClipDuration } from "./types";

interface CustomDurationInputsProps {
  valueSec: number;
  onChangeSec: (nextSec: number) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function CustomDurationInputs({
  valueSec,
  onChangeSec,
  disabled = false,
  compact = false,
}: CustomDurationInputsProps) {
  const safe = clampClipDuration(valueSec);
  const [minsDraft, setMinsDraft] = useState<string>(String(Math.floor(safe / 60)));
  const [secsDraft, setSecsDraft] = useState<string>(String(safe % 60));

  useEffect(() => {
    const clamped = clampClipDuration(valueSec);
    setMinsDraft(String(Math.floor(clamped / 60)));
    setSecsDraft(String(clamped % 60));
  }, [valueSec]);

  const commitValues = (rawMins: string, rawSecs: string) => {
    const m = Math.min(5, Math.max(0, parseInt(rawMins || "0", 10) || 0));
    const s = Math.min(59, Math.max(0, parseInt(rawSecs || "0", 10) || 0));
    const total = m >= 5 ? 300 : clampClipDuration(m * 60 + s);
    setMinsDraft(String(Math.floor(total / 60)));
    setSecsDraft(String(total % 60));
    onChangeSec(total);
  };

  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-burmese">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={5}
        disabled={disabled}
        aria-label="မိနစ်"
        value={minsDraft}
        onChange={(e) => {
          const v = e.target.value;
          setMinsDraft(v);
          const parsedM = parseInt(v, 10);
          const parsedS = parseInt(secsDraft || "0", 10) || 0;
          if (!Number.isNaN(parsedM)) {
            const clampedM = Math.min(5, Math.max(0, parsedM));
            const total = clampedM >= 5 ? 300 : clampedM * 60 + Math.min(59, Math.max(0, parsedS));
            if (total >= MIN_CLIP_DURATION_SEC) {
              onChangeSec(clampClipDuration(total));
            }
          }
        }}
        onBlur={() => commitValues(minsDraft, secsDraft)}
        className={`${
          compact
            ? "w-14 min-h-[44px] sm:w-11 sm:min-h-[36px] text-base sm:text-xs"
            : "w-16 min-h-[44px] text-base sm:text-sm"
        } px-1.5 py-1 rounded-lg bg-[#09090C] border border-[#F59E0B]/35 focus:border-[#FBBF24] focus:outline-none text-center text-[#FBBF24] font-semibold tabular-nums`}
      />
      <span className="text-[#A1A1AA] text-xs">မိနစ်</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        disabled={disabled}
        aria-label="စက္ကန့်"
        value={secsDraft}
        onChange={(e) => {
          const v = e.target.value;
          setSecsDraft(v);
          const parsedM = parseInt(minsDraft || "0", 10) || 0;
          const parsedS = parseInt(v, 10);
          if (!Number.isNaN(parsedS)) {
            const clampedM = Math.min(5, Math.max(0, parsedM));
            const clampedS = Math.min(59, Math.max(0, parsedS));
            const total = clampedM >= 5 ? 300 : clampedM * 60 + clampedS;
            if (total >= MIN_CLIP_DURATION_SEC) {
              onChangeSec(clampClipDuration(total));
            }
          }
        }}
        onBlur={() => commitValues(minsDraft, secsDraft)}
        className={`${
          compact
            ? "w-14 min-h-[44px] sm:w-12 sm:min-h-[36px] text-base sm:text-xs"
            : "w-16 min-h-[44px] text-base sm:text-sm"
        } px-1.5 py-1 rounded-lg bg-[#09090C] border border-[#F59E0B]/35 focus:border-[#FBBF24] focus:outline-none text-center text-[#FBBF24] font-semibold tabular-nums`}
      />
      <span className="text-[#A1A1AA] text-xs">စက္ကန့်</span>
    </div>
  );
}
