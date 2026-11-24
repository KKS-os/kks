import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Pause,
  Play,
  Printer,
  Square,
  Volume2,
} from "lucide-react";
import type { StructuredRecapSummary, ToastNotification } from "./types";
import { getGeminiKeyHeaders, resolveApiUrl } from "../utils/apiKeyStorage";
import {
  buildRecapSpeechSegments,
  copyTextToClipboard,
  downloadTextFile,
  formatRecapAsMarkdown,
  formatRecapAsPlainText,
  sanitizeRecapFilename,
} from "../utils/recapExport";

interface RecapActionsBarProps {
  recap: StructuredRecapSummary;
  onNotifyToast?: (toast: Omit<ToastNotification, "id">) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

export function RecapActionsBar({ recap, onNotifyToast }: RecapActionsBarProps) {
  const [speechState, setSpeechState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [voiceEngine, setVoiceEngine] = useState<"web_speech" | "gemini_tts">("web_speech");
  const [currentSegmentIdx, setCurrentSegmentIdx] = useState<number>(0);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);

  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);
  const [downloadedExt, setDownloadedExt] = useState<"md" | "txt" | null>(null);

  const segments = useMemo(() => buildRecapSpeechSegments(recap), [recap]);
  const segmentIdxRef = useRef<number>(0);
  const speedRef = useRef<number>(1);
  const cancelledRef = useRef<boolean>(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);

  speedRef.current = playbackSpeed;

  const stopAllAudio = () => {
    cancelledRef.current = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.currentTime = 0;
      } catch {
        // Ignore
      }
      audioElRef.current = null;
    }
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    segmentIdxRef.current = 0;
    setCurrentSegmentIdx(0);
    setSpeechState("idle");
  };

  // Reset playback cleanly whenever recap content changes or component unmounts
  useEffect(() => {
    stopAllAudio();
    setAudioNotice(null);
    return () => {
      stopAllAudio();
    };
  }, [recap]);

  const speakWebSegment = (idx: number, rate: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioNotice("ဤ Browser တွင် Web Speech API မထောက်ပံ့သေးပါ။");
      setSpeechState("idle");
      return;
    }

    if (idx >= segments.length || cancelledRef.current) {
      segmentIdxRef.current = 0;
      setCurrentSegmentIdx(0);
      setSpeechState("idle");
      return;
    }

    segmentIdxRef.current = idx;
    setCurrentSegmentIdx(idx);

    const utterance = new SpeechSynthesisUtterance(segments[idx]);
    utterance.rate = rate;

    // Pick best matching installed voice (Myanmar if available, otherwise browser default)
    const voices = window.speechSynthesis.getVoices();
    const textHasMyanmar = /[\u1000-\u109F]/.test(segments[idx]);
    if (textHasMyanmar) {
      const myVoice = voices.find((v) => v.lang.toLowerCase().startsWith("my"));
      if (myVoice) utterance.voice = myVoice;
      utterance.lang = myVoice?.lang || "my-MM";
    } else {
      const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
      if (enVoice) utterance.voice = enVoice;
      utterance.lang = enVoice?.lang || "en-US";
    }

    utterance.onend = () => {
      if (!cancelledRef.current) {
        speakWebSegment(idx + 1, speedRef.current);
      }
    };

    utterance.onerror = () => {
      if (!cancelledRef.current) {
        setSpeechState("idle");
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const startWebSpeech = (fromIndex = 0, rate = playbackSpeed, preserveNotice = false) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioNotice("ဤ Browser တွင် Web Speech API မထောက်ပံ့သေးပါ။ Gemini TTS ကို ရွေးချယ်စမ်းသပ်ပါ။");
      return;
    }
    if (!preserveNotice) {
      setAudioNotice(null);
    }
    cancelledRef.current = true;
    window.speechSynthesis.cancel();

    setTimeout(() => {
      cancelledRef.current = false;
      setSpeechState("playing");
      speakWebSegment(fromIndex, rate);
    }, 30);
  };

  const startGeminiTts = async () => {
    stopAllAudio();
    setAudioNotice(null);
    setSpeechState("loading");

    try {
      const fullText = `${recap.title}. ${recap.executiveSummary}. ${recap.keyTakeaways.join(". ")}`;
      const res = await fetch(resolveApiUrl("/api/recap/tts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getGeminiKeyHeaders(),
        },
        body: JSON.stringify({ text: fullText }),
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
            message: `${parsedErr.error} Browser Voice ဖြင့် ဆက်လက်ဖတ်ပြပေးနေပါသည်။`,
            actionType: "open_api_key",
          });
        }
        throw new Error(parsedErr?.error || "Gemini TTS unavailable");
      }

      const wavBlob = await res.blob();
      const blobUrl = URL.createObjectURL(wavBlob);
      audioBlobUrlRef.current = blobUrl;

      const audio = new Audio(blobUrl);
      audio.playbackRate = speedRef.current;
      audioElRef.current = audio;

      audio.onended = () => {
        setSpeechState("idle");
      };
      audio.onerror = () => {
        setSpeechState("idle");
      };

      await audio.play();
      setSpeechState("playing");
    } catch {
      // Seamless automatic fallback to Web Speech API
      setVoiceEngine("web_speech");
      setAudioNotice("Gemini TTS အသင့်မဖြစ်သေးသဖြင့် Browser Web Speech API ဖြင့် ဖတ်ပြပေးနေပါသည်။");
      startWebSpeech(0, speedRef.current, true);
    }
  };

  const handleTogglePlayPause = () => {
    if (speechState === "loading") return;

    if (voiceEngine === "gemini_tts" && audioElRef.current) {
      if (speechState === "playing") {
        audioElRef.current.pause();
        setSpeechState("paused");
      } else if (speechState === "paused") {
        audioElRef.current.playbackRate = playbackSpeed;
        audioElRef.current.play().catch(() => {});
        setSpeechState("playing");
      } else {
        startGeminiTts();
      }
      return;
    }

    if (speechState === "idle") {
      if (voiceEngine === "gemini_tts") {
        startGeminiTts();
      } else {
        startWebSpeech(0, playbackSpeed);
      }
      return;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (speechState === "playing") {
        window.speechSynthesis.pause();
        setSpeechState("paused");
      } else if (speechState === "paused") {
        window.speechSynthesis.resume();
        setSpeechState("playing");
      }
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    setPlaybackSpeed(newSpeed);
    speedRef.current = newSpeed;

    if (audioElRef.current) {
      audioElRef.current.playbackRate = newSpeed;
      return;
    }

    if (speechState === "playing") {
      startWebSpeech(segmentIdxRef.current, newSpeed);
    }
  };

  const handleCopyMarkdown = async () => {
    const md = formatRecapAsMarkdown(recap);
    const ok = await copyTextToClipboard(md);
    if (ok) {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2500);
    }
  };

  const handleDownloadFile = (ext: "md" | "txt") => {
    const content = ext === "md" ? formatRecapAsMarkdown(recap) : formatRecapAsPlainText(recap);
    const mime = ext === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
    const filename = sanitizeRecapFilename(recap.title, ext);
    downloadTextFile(filename, content, mime);
    setDownloadedExt(ext);
    setTimeout(() => setDownloadedExt(null), 2200);
  };

  const handlePrintPdf = () => {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  };

  return (
    <div className="print:hidden bg-[#0A0A0F]/85 sm:bg-[#09090C]/95 backdrop-blur-md border border-white/[0.08] sm:border-[#F59E0B]/35 rounded-2xl p-3 sm:p-5 shadow-[0_12px_32px_rgba(0,0,0,0.7)] space-y-3">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        {/* 1. Listen to Recap Controls (Play, Pause, Stop, Speed, Engine) */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 w-full xl:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleTogglePlayPause}
              disabled={speechState === "loading"}
              className={`flex-1 sm:flex-initial min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-70 ${
                speechState === "playing"
                  ? "bg-[#181406] border border-[#F59E0B] text-[#FBBF24] shadow-[0_0_18px_rgba(245,158,11,0.3)]"
                  : "bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FBBF24] text-black hover:brightness-105"
              }`}
            >
              {speechState === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>ပြင်ဆင်နေပါသည်...</span>
                </>
              ) : speechState === "playing" ? (
                <>
                  <Pause className="w-4 h-4 fill-current shrink-0" />
                  <span>Pause</span>
                </>
              ) : speechState === "paused" ? (
                <>
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>Resume Recap</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 shrink-0" />
                  <span>Listen to Recap</span>
                </>
              )}
            </button>

            {(speechState === "playing" || speechState === "paused") && (
              <button
                type="button"
                onClick={stopAllAudio}
                title="အသံဖတ်ရှုမှု ရပ်တန့်ရန် (Stop)"
                className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl bg-[#18181B] border border-white/15 hover:border-red-400/60 text-[#E4E4E7] hover:text-red-300 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                aria-label="Stop audio recap"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            )}
          </div>

          {/* Speed Selector */}
          <div
            role="group"
            aria-label="Playback Speed"
            className="grid grid-cols-5 sm:flex items-center gap-1 p-1 bg-[#121215] border border-white/10 rounded-xl w-full sm:w-auto"
          >
            <span className="text-[11px] text-[#A1A1AA] px-1.5 hidden sm:inline">Speed:</span>
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleSpeedChange(rate)}
                className={`min-h-[44px] sm:min-h-[36px] px-2 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer flex items-center justify-center ${
                  playbackSpeed === rate
                    ? "bg-[#F59E0B] text-black font-bold"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Speech Engine Selector */}
          <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-[#121215] border border-white/10 rounded-xl text-xs w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                if (voiceEngine !== "web_speech") {
                  stopAllAudio();
                  setVoiceEngine("web_speech");
                  setAudioNotice(null);
                }
              }}
              className={`min-h-[44px] sm:min-h-[36px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
                voiceEngine === "web_speech"
                  ? "bg-[#F59E0B]/20 text-[#FBBF24] border border-[#F59E0B]/40 font-semibold"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
              title="Browser Built-in Web Speech API"
            >
              Browser Voice
            </button>
            <button
              type="button"
              onClick={() => {
                if (voiceEngine !== "gemini_tts") {
                  stopAllAudio();
                  setVoiceEngine("gemini_tts");
                  setAudioNotice(null);
                }
              }}
              className={`min-h-[44px] sm:min-h-[36px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
                voiceEngine === "gemini_tts"
                  ? "bg-[#F59E0B]/20 text-[#FBBF24] border border-[#F59E0B]/40 font-semibold"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
              title="Gemini AI Text-to-Speech"
            >
              Gemini TTS
            </button>
          </div>

          {speechState !== "idle" && voiceEngine === "web_speech" && segments.length > 0 && (
            <span className="text-xs text-[#FBBF24] font-mono tabular-nums px-2.5 py-1.5 rounded-lg bg-[#181406] border border-[#F59E0B]/30 self-start sm:self-center">
              {speechState === "paused" ? "Paused" : "Speaking"} · {currentSegmentIdx + 1}/
              {segments.length}
            </span>
          )}
        </div>

        {/* 2. Export Buttons (Copy Markdown, Download .md, Download .txt, Print/Save PDF) */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full xl:w-auto">
          <span className="col-span-2 sm:col-span-1 text-[11px] uppercase tracking-wider text-[#A1A1AA] font-semibold mr-1">
            Export:
          </span>

          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#121215] border border-white/15 hover:border-[#F59E0B]/60 text-xs font-semibold text-[#F4F4F6] hover:text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            {copiedMarkdown ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                <span className="text-[#10B981] truncate">Copied ✓</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                <span className="truncate">Copy Markdown</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleDownloadFile("md")}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#121215] border border-white/15 hover:border-[#F59E0B]/60 text-xs font-semibold text-[#F4F4F6] hover:text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            {downloadedExt === "md" ? (
              <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            )}
            <span>Download .md</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadFile("txt")}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#121215] border border-white/15 hover:border-[#F59E0B]/60 text-xs font-semibold text-[#F4F4F6] hover:text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            {downloadedExt === "txt" ? (
              <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            )}
            <span>Download .txt</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#181406] border border-[#F59E0B]/45 hover:bg-[#F59E0B] hover:text-black text-xs font-semibold text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Save PDF</span>
          </button>
        </div>
      </div>

      {audioNotice && (
        <p className="text-xs text-[#E5B842] bg-[#181406]/80 border border-[#F59E0B]/25 rounded-lg px-3 py-2 font-burmese leading-[1.8]">
          {audioNotice}
        </p>
      )}
    </div>
  );
}
