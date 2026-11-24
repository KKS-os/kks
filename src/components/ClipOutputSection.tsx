import React from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Download,
  Edit3,
  Film,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Share2,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ClipItem, formatSeconds } from "./types";

interface ClipOutputSectionProps {
  outputSectionRef: React.RefObject<HTMLElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  sourceTitle: string;
  clips: ClipItem[];
  activeClipIndex: number;
  setActiveClipIndex: (idx: number) => void;
  activeClip: ClipItem | undefined;
  isInitialLoading: boolean;
  isProcessing?: boolean;
  queuePosition?: number | null;
  queueLength?: number | null;
  processingStatusText?: string | null;
  videoCurrentTime: number;
  setVideoCurrentTime: (t: number) => void;
  videoDuration: number;
  setVideoDuration: (d: number) => void;
  bufferedPercent: number;
  isVideoPlaying: boolean;
  setIsVideoPlaying: (playing: boolean) => void;
  isVideoBuffering: boolean;
  setIsVideoBuffering: (buffering: boolean) => void;
  videoError: string | null;
  setVideoError: (err: string | null) => void;
  isMuted: boolean;
  isDownloading: boolean;
  downloadDoneId: string | null;
  copiedShare: boolean;
  onOpenSubtitleEditor: () => void;
  onVideoProgress: () => void;
  onSeekToCue: (startOffset: number) => void;
  onSliderSeek: (time: number) => void;
  onStepSeek: (delta: number) => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onRestartVideo: () => void;
  onReloadVideo: () => void;
  onToggleFullscreen: () => void;
  onDownloadActiveClip: () => void;
  onShareClip: () => void;
}

export function ClipOutputSection({
  outputSectionRef,
  videoRef,
  sourceTitle,
  clips,
  activeClipIndex,
  setActiveClipIndex,
  activeClip,
  isInitialLoading,
  isProcessing = false,
  queuePosition = null,
  queueLength = null,
  processingStatusText = null,
  videoCurrentTime,
  setVideoCurrentTime,
  videoDuration,
  setVideoDuration,
  bufferedPercent,
  isVideoPlaying,
  setIsVideoPlaying,
  isVideoBuffering,
  setIsVideoBuffering,
  videoError,
  setVideoError,
  isMuted,
  isDownloading,
  downloadDoneId,
  copiedShare,
  onOpenSubtitleEditor,
  onVideoProgress,
  onSeekToCue,
  onSliderSeek,
  onStepSeek,
  onTogglePlay,
  onToggleMute,
  onRestartVideo,
  onReloadVideo,
  onToggleFullscreen,
  onDownloadActiveClip,
  onShareClip,
}: ClipOutputSectionProps) {
  return (
    <section
      ref={outputSectionRef}
      aria-label="ဖြတ်တောက်ပြီးသော MP4 Clip များ ကြည့်ရှုရန်နှင့် ဒေါင်းလုဒ်ဆွဲရန်"
      className="mt-4 sm:mt-12 bg-[#0A0A0F]/85 sm:bg-black/90 backdrop-blur-md border border-white/[0.08] sm:border-[#F59E0B]/35 rounded-2xl p-3 sm:p-7 shadow-[0_14px_38px_rgba(0,0,0,0.7)] sm:shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
    >
      {/* Output Header with Clip Switcher & Subtitle Editor Trigger */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 pb-3.5 sm:pb-5 border-b border-white/[0.08]">
        <div>
          <p className="text-xs text-[#FBBF24] font-burmese">
            Social Media အကြိုက် မြန်မာစာတန်းထိုး Hard-coded MP4 ဗီဒီယိုအတိုများ
          </p>
          <h2 className="mt-1 text-base sm:text-xl font-semibold text-[#F8F8FA] burmese-heading">
            {sourceTitle}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {clips.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#121215] border border-[#F59E0B]/30 rounded-xl w-full sm:w-auto">
              {clips.map((clip, idx) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => setActiveClipIndex(idx)}
                  className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer flex items-center justify-center ${
                    idx === activeClipIndex
                      ? "bg-[#F59E0B] text-black font-semibold"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  Viral Clip 0{idx + 1}
                </button>
              ))}
            </div>
          )}

          {activeClip && (
            <button
              type="button"
              onClick={onOpenSubtitleEditor}
              className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/40 hover:border-[#F59E0B] text-xs font-semibold text-[#FBBF24] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-burmese">စာတန်းထိုး ပြင်ဆင်ရန် (Edit)</span>
            </button>
          )}
        </div>
      </div>

      {/* Render Queue / Processing Banner (Concurrency = 1 protection) */}
      {(isProcessing || (queuePosition !== null && queuePosition > 0)) && (
        <div
          role="status"
          className={`mt-4 p-3.5 rounded-xl border flex items-center gap-3 font-burmese ${
            queuePosition && queuePosition > 0
              ? "bg-[#1B1406] border-[#F59E0B]/70 text-[#FEF3C7]"
              : "bg-[#121216] border-[#F59E0B]/40 text-[#FBBF24]"
          }`}
        >
          {queuePosition && queuePosition > 0 ? (
            <Clock className="w-5 h-5 text-[#FBBF24] animate-pulse shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 text-[#F59E0B] animate-spin shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs sm:text-sm font-bold">
              {queuePosition && queuePosition > 0
                ? `⏳ Render Queue တွင် အလှည့်စောင့်ဆိုင်းနေပါသည် (အလှည့် ${queuePosition}${
                    queueLength && queueLength > 0 ? ` / ${queueLength}` : ""
                  })`
                : "🎬 ဗီဒီယို Render ပြုလုပ်နေပါသည် (Concurrency: 1)"}
            </div>
            <p className="text-[11px] sm:text-xs opacity-85 mt-0.5 truncate">
              {queuePosition && queuePosition > 0
                ? "ဆာဗာ 512MB RAM တည်ငြိမ်စေရန် တစ်ကြိမ်လျှင် ၁ ခုချင်းသာ စနစ်တကျ ဖြတ်ထုတ်ပေးနေပါသည်..."
                : processingStatusText || "FFmpeg ဖြင့် မြန်မာစာတန်းထိုး MP4 အသစ် ပြင်ဆင်နေပါသည်..."}
            </p>
          </div>
        </div>
      )}

      {isInitialLoading && !activeClip ? (
        <div className="py-20 flex flex-col items-center justify-center text-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-[#F59E0B]" />
          <p className="text-sm text-[#A8A8B3] font-burmese">
            Showroom Player ကို ပြင်ဆင်နေပါသည်...
          </p>
        </div>
      ) : activeClip ? (
        <div className="mt-4 sm:mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-7 items-stretch">
          {/* Left Column: Responsive Video Player with High-Fidelity Posters & Playback Controls */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center bg-[#09090D]/90 border border-white/[0.08] sm:border-[#F59E0B]/25 rounded-xl p-2.5 sm:p-4">
            <div
              className={`w-full overflow-hidden rounded-lg bg-black border border-white/10 shadow-2xl relative group ${
                activeClip.aspectRatio === "9:16"
                  ? "max-w-[320px] aspect-[9/16] min-h-[360px] sm:min-h-[500px]"
                  : activeClip.aspectRatio === "1:1"
                  ? "max-w-[420px] aspect-square min-h-[260px] sm:min-h-[320px]"
                  : "w-full aspect-video min-h-[200px] sm:min-h-[250px]"
              }`}
            >
              <video
                key={activeClip.videoUrl}
                ref={videoRef}
                poster={
                  activeClip.posterUrl ||
                  (activeClip.videoUrl ? activeClip.videoUrl.replace(/\.mp4(\?.*)?$/, ".jpg") : undefined)
                }
                controls
                autoPlay
                muted={isMuted}
                playsInline
                preload="auto"
                onCanPlay={(e) => {
                  setIsVideoBuffering(false);
                  const p = e.currentTarget.play();
                  if (p !== undefined) {
                    p.then(() => setIsVideoPlaying(true)).catch(() => {});
                  }
                }}
                onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                onProgress={onVideoProgress}
                onDurationChange={(e) =>
                  setVideoDuration(e.currentTarget.duration || activeClip?.durationSec || 12)
                }
                onSeeking={() => setIsVideoBuffering(true)}
                onSeeked={() => setIsVideoBuffering(false)}
                onPlay={() => {
                  setIsVideoPlaying(true);
                  setIsVideoBuffering(false);
                  setVideoError(null);
                }}
                onPause={() => setIsVideoPlaying(false)}
                onWaiting={() => setIsVideoBuffering(true)}
                onPlaying={() => {
                  setIsVideoPlaying(true);
                  setIsVideoBuffering(false);
                }}
                onLoadedData={() => {
                  setIsVideoBuffering(false);
                  setVideoError(null);
                }}
                onError={() => {
                  setIsVideoBuffering(false);
                  setVideoError("ရုပ်ထွက် ဖွင့်ရန် ပြင်ဆင်နေဆဲဖြစ်ပါသည်။ ပြန်လည် စမ်းသပ်ပေးပါ။");
                }}
                className="w-full h-full object-contain bg-black"
              >
                <source src={activeClip.videoUrl} type="video/mp4" />
                ဗီဒီယို ဖိုင်ကို ဖွင့်ရန် သင့် browser တွင် MP4 စနစ် မထောက်ပံ့သေးပါ။
              </video>

              {isMuted && isVideoPlaying && (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="absolute top-3 right-3 z-30 min-h-[44px] px-3.5 py-2 rounded-full bg-black/85 border border-[#F59E0B] text-xs font-bold text-[#FBBF24] shadow-[0_0_20px_rgba(245,158,11,0.5)] flex items-center gap-1.5 hover:bg-[#F59E0B] hover:text-black transition-all cursor-pointer animate-pulse"
                  title="အသံဖွင့်ရန် (Unmute Audio)"
                >
                  <VolumeX className="w-4 h-4 shrink-0" />
                  <span className="font-burmese">အသံဖွင့်ရန်</span>
                </button>
              )}

              {!isVideoPlaying && !isVideoBuffering && !videoError && (
                <div
                  onClick={onTogglePlay}
                  className="absolute inset-0 bg-black/40 hover:bg-black/25 flex flex-col items-center justify-center cursor-pointer transition-all z-20 group/overlay"
                  title="ဗီဒီယို စတင်ဖွင့်မည် (Play Video)"
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#F59E0B] to-[#FBBF24] text-black flex items-center justify-center shadow-[0_0_35px_rgba(245,158,11,0.7)] group-hover/overlay:scale-110 active:scale-95 transition-all">
                    <Play className="w-8 h-8 fill-current ml-1" />
                  </div>
                  <span className="mt-3 px-3.5 py-1.5 rounded-full bg-black/85 border border-[#F59E0B]/50 text-xs font-bold text-[#FBBF24] font-burmese shadow-lg backdrop-blur-sm">
                    ရုပ်ထွက် စတင်ဖွင့်မည် (Play Video)
                  </span>
                </div>
              )}

              {isVideoBuffering && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none z-30">
                  <Loader2 className="w-9 h-9 text-[#F59E0B] animate-spin" />
                  <span className="text-xs font-medium text-[#FBBF24] font-burmese bg-black/80 px-3 py-1 rounded border border-[#F59E0B]/30">
                    Buffer ပြင်ဆင်နေပါသည်...
                  </span>
                </div>
              )}

              {videoError && (
                <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center gap-3 z-30">
                  <AlertCircle className="w-9 h-9 text-amber-400" />
                  <p className="text-xs text-[#FBBF24] font-burmese leading-relaxed max-w-[260px]">
                    {videoError}
                  </p>
                  <button
                    type="button"
                    onClick={onReloadVideo}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-black text-xs font-bold font-burmese flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>ပြန်လည် ဖွင့်စမ်းသပ်မည်</span>
                  </button>
                </div>
              )}
            </div>

            {/* Interactive Seek Scrub Bar with 44px Touch Target */}
            <div className="w-full max-w-[420px] mt-2 px-1">
              <div className="relative w-full h-11 flex items-center group cursor-pointer">
                <div className="absolute left-0 right-0 h-2 rounded-full bg-white/10 overflow-hidden pointer-events-none">
                  <div
                    className="h-full bg-white/30 transition-all duration-150"
                    style={{ width: `${bufferedPercent}%` }}
                  />
                </div>
                <div
                  className="absolute left-0 h-2 rounded-full bg-gradient-to-r from-[#D97706] to-[#FBBF24] pointer-events-none shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                  style={{
                    width: `${videoDuration > 0 ? Math.min(100, (videoCurrentTime / videoDuration) * 100) : 0}%`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={videoDuration || activeClip.durationSec || 12}
                  step={0.1}
                  value={videoCurrentTime}
                  onChange={(e) => onSliderSeek(parseFloat(e.target.value))}
                  aria-label="ဗီဒီယို အချိန် လျှောတံ"
                  className="relative z-10 w-full h-11 opacity-0 cursor-pointer transition-opacity accent-[#F59E0B]"
                  title="ဗီဒီယို အချိန် လျှောတံ (Seek timeline)"
                />
              </div>
            </div>

            {/* Video Player Quick Controls Bar */}
            <div className="w-full max-w-[420px] mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/40 hover:border-[#F59E0B] hover:bg-[#27272A] text-xs font-semibold text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                  title={isVideoPlaying ? "ခေတ္တရပ်မည် (Pause)" : "ဖွင့်မည် (Play)"}
                  aria-label={isVideoPlaying ? "Pause video" : "Play video"}
                >
                  {isVideoPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      <span className="font-burmese hidden sm:inline">ရပ်မည်</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span className="font-burmese hidden sm:inline">ဖွင့်မည်</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onStepSeek(-2)}
                  className="min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-xs font-bold text-[#FBBF24] transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center"
                  title="၂ စက္ကန့် နောက်ဆုတ်မည် (-2s)"
                >
                  -2s
                </button>

                <button
                  type="button"
                  onClick={() => onStepSeek(2)}
                  className="min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-xs font-bold text-[#FBBF24] transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center"
                  title="၂ စက္ကန့် ရှေ့တိုးမည် (+2s)"
                >
                  +2s
                </button>

                <button
                  type="button"
                  onClick={onRestartVideo}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/40 hover:border-[#F59E0B] hover:bg-[#27272A] text-xs font-semibold text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                  title="ဗီဒီယိုကို 0 စက္ကန့်သို့ ချက်ချင်းပြန်ပို့ပြီး ရပ်တန့်ရန်"
                  aria-label="Restart video"
                >
                  <RotateCcw className="w-4 h-4 text-[#F59E0B]" />
                  <span className="font-burmese hidden sm:inline">Restart</span>
                </button>

                <button
                  type="button"
                  onClick={onReloadVideo}
                  className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-[#A1A1AA] hover:text-[#FBBF24] transition-all cursor-pointer flex items-center justify-center"
                  title="Buffer အသစ် ပြန်လည် Load မည် (Reload)"
                  aria-label="Reload video buffer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onToggleMute}
                  className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-[#A1A1AA] hover:text-[#FBBF24] transition-all cursor-pointer flex items-center justify-center"
                  title={isMuted ? "အသံဖွင့်မည်" : "အသံပိတ်မည်"}
                  aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-[#A1A1AA] hover:text-[#FBBF24] transition-all cursor-pointer flex items-center justify-center"
                  title="မျက်နှာပြင်ပြည့် ကြည့်ရှုမည်"
                  aria-label="Fullscreen video"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              <div className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 text-xs text-[#A1A1AA] font-mono tabular-nums bg-[#121215] px-3 py-1.5 rounded-xl border border-[#F59E0B]/20 self-start sm:self-center">
                <span className="text-[#FBBF24] font-medium">{formatSeconds(videoCurrentTime)}</span>
                <span className="text-white/30">/</span>
                <span>{formatSeconds(videoDuration || activeClip.durationSec)}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Details, Subtitle Timeline & Download Button */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#A1A1AA]">
                <span className="text-[#FBBF24] font-semibold">
                  Clip 0{activeClip.index}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{activeClip.resolutionLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {formatSeconds(activeClip.durationSec)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{activeClip.fileSizeMb}</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#38BDF8]">
                  {activeClip.audioMode === "original"
                    ? "မူရင်းအသံ"
                    : activeClip.audioMode === "voiceover"
                    ? "AI မြန်မာအသံ"
                    : "ရောနှောအသံ"}
                </span>
              </div>

              <h3 className="mt-2 text-lg sm:text-xl font-bold text-[#FFF2B2] burmese-heading">
                {activeClip.titleBurmese}
              </h3>

              <p className="mt-1.5 text-xs sm:text-sm text-[#A1A1AA] burmese-body leading-[1.88]">
                {activeClip.summaryBurmese}
              </p>

              {/* Subtitle Timeline Preview */}
              <div className="mt-5 pt-4 border-t border-white/[0.08]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-semibold text-[#FBBF24] font-burmese">
                    ရုပ်သံပေါ်တွင် တိုက်ရိုက်ပါဝင်သော မြန်မာစာတန်းထိုးများ (အချိန်ကိုက် Sync)
                  </span>
                  <button
                    type="button"
                    onClick={onOpenSubtitleEditor}
                    className="min-h-[44px] px-2.5 text-xs text-[#38BDF8] hover:underline font-burmese flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>ပြင်ဆင်ရန်</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                  {activeClip.subtitles.map((cue, idx) => {
                    const isCueActive =
                      videoCurrentTime >= cue.startOffset &&
                      videoCurrentTime <= cue.endOffset;
                    return (
                      <button
                        key={`${activeClip.id}-cue-${idx}`}
                        type="button"
                        onClick={() => onSeekToCue(cue.startOffset)}
                        className={`min-h-[44px] w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-start gap-2.5 group cursor-pointer ${
                          isCueActive
                            ? "bg-[#2A1D05] border-[#F59E0B] shadow-[0_0_15px_rgba(245,158,11,0.3)] text-[#FBBF24]"
                            : "bg-[#09090B] hover:bg-[#18181B] border-white/[0.06] hover:border-[#F59E0B]/40 text-[#ECECF0]"
                        }`}
                      >
                        <span
                          className={`tabular-nums text-xs pt-0.5 shrink-0 flex items-center gap-1 ${
                            isCueActive ? "text-[#FBBF24] font-bold" : "text-[#D97706]"
                          }`}
                        >
                          <Play
                            className={`w-3 h-3 ${
                              isCueActive ? "fill-current text-[#FBBF24]" : "opacity-70 group-hover:opacity-100"
                            }`}
                          />
                          {formatSeconds(cue.startOffset)}
                        </span>
                        <span className="text-xs sm:text-sm font-burmese leading-[1.85]">
                          {cue.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Actions: Download MP4 & Mobile Web Share API */}
            <div className="pt-4 border-t border-[#F59E0B]/25 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onDownloadActiveClip}
                  disabled={isDownloading}
                  className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FBBF24] text-black font-bold text-sm sm:text-base shadow-[0_8px_25px_rgba(245,158,11,0.3)] hover:brightness-105 active:scale-[0.995] transition-all flex items-center justify-center gap-2 text-center leading-snug cursor-pointer disabled:opacity-75"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-black shrink-0" />
                      <span>Downloading MP4...</span>
                    </>
                  ) : downloadDoneId === activeClip.id ? (
                    <>
                      <Check className="w-5 h-5 text-black shrink-0" />
                      <span>MP4 သိမ်းဆည်းပြီး ✓</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5 text-black shrink-0" />
                      <span>Download MP4 Clip</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onShareClip}
                  className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-[#141208] border border-[#F59E0B]/60 hover:border-[#FBBF24] hover:bg-[#1E1A0C] text-[#FBBF24] font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 text-center leading-snug cursor-pointer shadow-md"
                >
                  {copiedShare ? (
                    <>
                      <Check className="w-5 h-5 text-[#10B981] shrink-0" />
                      <span className="text-[#10B981]">မျှဝေ/ကူးယူပြီးပါပြီ ✓</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-5 h-5 text-[#FBBF24] shrink-0" />
                      <span className="font-burmese">Save Video / မျှဝေရန် (Share)</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-burmese pt-1 text-[#A1A1AA]">
                <span className="flex items-center gap-1.5 text-[#E5B842]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>iOS Safari &amp; Android Chrome တို့တွင် MP4 တိုက်ရိုက် Save/Share လုပ်နိုင်သည်</span>
                </span>
                <button
                  type="button"
                  onClick={onOpenSubtitleEditor}
                  className="min-h-[44px] sm:min-h-[32px] text-[#FBBF24] hover:underline flex items-center gap-1.5 cursor-pointer font-semibold self-start sm:self-auto"
                >
                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                  <span>စာတန်းထိုး စာသားပြင်ရန်</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-14 flex flex-col items-center justify-center text-center">
          <Film className="w-10 h-10 text-[#F59E0B]/60 mb-2" />
          <p className="text-sm text-[#A1A1AA] font-burmese">
            ဗီဒီယို Link ထည့်သွင်းပြီး ခလုတ်နှိပ်လိုက်သည်နှင့် မြန်မာစာတန်းထိုးပါဝင်သော MP4 အပိုင်းများ ဤနေရာတွင် ပေါ်လာပါမည်
          </p>
        </div>
      )}
    </section>
  );
}
