import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileAudio,
  FileText,
  FileVideo,
  Globe,
  Link2,
  Loader2,
  Music,
  PlayCircle,
  Scissors,
  Settings,
  Sparkles,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { CustomDurationInputs } from "./CustomDurationInputs";
import {
  PROCESSING_STEPS_BURMESE,
  SAMPLE_ARTICLE_LINKS,
  SAMPLE_LINKS,
  SAMPLE_RAW_TEXT,
  TOOLBAR_DURATION_PRESETS,
  extractYouTubeIdClient,
  formatBytesMb,
  formatDurationBurmese,
  isValidAutoCutUrl,
} from "./types";
import type {
  InputSourceTab,
  RecapLanguage,
  SettingsWizardTab,
  UploadTransferProgress,
} from "./types";

interface StudioInputSectionProps {
  activeTab: InputSourceTab;
  setActiveTab: (tab: InputSourceTab) => void;
  textSubMode: "url" | "raw";
  setTextSubMode: (mode: "url" | "raw") => void;
  articleUrlInput: string;
  setArticleUrlInput: (val: string) => void;
  rawTextInput: string;
  setRawTextInput: (val: string) => void;
  videoUrlInput: string;
  setVideoUrlInput: (val: string) => void;
  selectedUploadFile: File | null;
  uploadTransferProgress: UploadTransferProgress | null;
  aspectRatio: "9:16" | "16:9" | "1:1";
  setAspectRatio: (val: "9:16" | "16:9" | "1:1") => void;
  framingMode: "blur_bg" | "crop_fill" | "letterbox";
  setFramingMode: (val: "blur_bg" | "crop_fill" | "letterbox") => void;
  audioMode: "original" | "voiceover" | "mix";
  setAudioMode: (val: "original" | "voiceover" | "mix") => void;
  bypassCensorship: boolean;
  setBypassCensorship: (val: boolean) => void;
  recapLanguage: RecapLanguage;
  setRecapLanguage: (lang: RecapLanguage) => void;
  autoCutOnPaste: boolean;
  setAutoCutOnPaste: (val: boolean) => void;
  draftFirstMode: boolean;
  setDraftFirstMode: (val: boolean) => void;
  clipDuration: number;
  setClipDuration: (sec: number) => void;
  isProcessing: boolean;
  processingProgress: number | null;
  processingStatusText: string | null;
  queuePosition?: number | null;
  queueLength?: number | null;
  stepIndex: number;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;
  successMessage: string | null;
  isProcessingRef: React.MutableRefObject<boolean>;
  justPastedRef: React.MutableRefObject<boolean>;
  autoCutDebounceRef: React.MutableRefObject<number | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onGenerateClips: (overrideUrl?: string) => void;
  onGenerateTextArticleRecap: (overrideUrl?: string, overrideText?: string) => void;
  onLocalFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadFileObject: (file: File) => void;
  onClearSelectedUploadFile: () => void;
  onOpenSettings: (step?: SettingsWizardTab) => void;
}

export function StudioInputSection({
  activeTab,
  setActiveTab,
  textSubMode,
  setTextSubMode,
  articleUrlInput,
  setArticleUrlInput,
  rawTextInput,
  setRawTextInput,
  videoUrlInput,
  setVideoUrlInput,
  selectedUploadFile,
  uploadTransferProgress,
  aspectRatio,
  setAspectRatio,
  framingMode,
  setFramingMode,
  audioMode,
  setAudioMode,
  bypassCensorship,
  setBypassCensorship,
  recapLanguage,
  setRecapLanguage,
  autoCutOnPaste,
  setAutoCutOnPaste,
  draftFirstMode,
  setDraftFirstMode,
  clipDuration,
  setClipDuration,
  isProcessing,
  processingProgress,
  processingStatusText,
  queuePosition = null,
  queueLength = null,
  stepIndex,
  errorMessage,
  setErrorMessage,
  successMessage,
  isProcessingRef,
  justPastedRef,
  autoCutDebounceRef,
  fileInputRef,
  onGenerateClips,
  onGenerateTextArticleRecap,
  onLocalFileUpload,
  onUploadFileObject,
  onClearSelectedUploadFile,
  onOpenSettings,
}: StudioInputSectionProps) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const detectedYouTubeId = extractYouTubeIdClient(videoUrlInput);

  const handlePrimarySubmit = () => {
    if (isProcessing) return;
    if (activeTab === "text_article") {
      onGenerateTextArticleRecap();
      return;
    }
    if (activeTab === "media_upload") {
      if (selectedUploadFile) {
        onUploadFileObject(selectedUploadFile);
      } else {
        fileInputRef.current?.click();
      }
      return;
    }
    onGenerateClips();
  };

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (isProcessing) return;
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      onUploadFileObject(droppedFile);
    }
  };

  const primaryButtonLabel = draftFirstMode
    ? activeTab === "text_article"
      ? "1. AI Recap Script & Timeline အရင်ထုတ်ယူမည် (Draft)"
      : activeTab === "media_upload"
      ? selectedUploadFile
        ? `${selectedUploadFile.name} မှ Script & Timeline အရင်ထုတ်ယူမည် (Draft)`
        : "အသံ သို့မဟုတ် ဗီဒီယိုဖိုင် ရွေးချယ်တင်သွင်းရန်"
      : "YouTube / ဗီဒီယိုမှ Script & Timeline အရင်ထုတ်ယူမည် (Draft)"
    : activeTab === "text_article"
    ? textSubMode === "url"
      ? "ဆောင်းပါး Link မှ AI Recap နှင့် မြန်မာစာတန်းထိုး ဖန်တီးရန်"
      : "စာသားမှ AI Recap နှင့် မြန်မာစာတန်းထိုး ဖန်တီးရန်"
    : activeTab === "media_upload"
    ? selectedUploadFile
      ? `${selectedUploadFile.name} ကို Gemini File API ဖြင့် Recap ပြုလုပ်ရန်`
      : "အသံ သို့မဟုတ် ဗီဒီယိုဖိုင် ရွေးချယ်တင်သွင်းရန်"
    : "YouTube / ဗီဒီယိုမှ AI Recap နှင့် မြန်မာစာတန်းထိုး MP4 ဖြတ်ထုတ်ရန်";

  return (
    <section
      aria-label="အရင်းအမြစ် ၃ မျိုးဖြင့် Recap ဖန်တီးရန်"
      className="mt-3 sm:mt-0 bg-[#0A0A0F]/85 sm:bg-[#09090C]/95 backdrop-blur-md border border-white/[0.08] sm:border-[#F59E0B]/35 rounded-2xl p-3 sm:p-6 shadow-[0_12px_36px_rgba(0,0,0,0.65)] sm:shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative"
    >
      {/* Hidden shared file input for Audio/Video uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*,audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/ogg,audio/m4a,audio/flac,audio/*"
        onChange={onLocalFileUpload}
        className="hidden"
      />

      {/* 3-Source Tabbed Selector: Sleek Horizontal Segmented Pill Tabs on Mobile, Rich Cards on Desktop */}
      <div
        role="tablist"
        aria-label="Recap Input Sources"
        className="grid grid-cols-3 gap-1 sm:gap-2 p-1 sm:p-1.5 bg-[#050508]/95 border border-white/[0.08] rounded-full sm:rounded-xl mb-3 sm:mb-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "text_article"}
          disabled={isProcessing}
          onClick={() => {
            setActiveTab("text_article");
            if (errorMessage) setErrorMessage(null);
          }}
          className={`min-h-[44px] sm:min-h-[54px] flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 px-2 sm:px-3.5 py-1.5 sm:py-2.5 rounded-full sm:rounded-lg text-center sm:text-left transition-all cursor-pointer disabled:opacity-60 ${
            activeTab === "text_article"
              ? "bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FBBF24] text-black shadow-[0_4px_16px_rgba(245,158,11,0.3)]"
              : "text-[#A1A1AA] hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <FileText
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
              activeTab === "text_article" ? "text-black" : "text-[#F59E0B]"
            }`}
          />
          <span className="sm:hidden text-[11px] font-bold whitespace-nowrap truncate">
            Text/URL
          </span>
          <div className="hidden sm:block min-w-0 font-burmese">
            <div className="text-xs sm:text-sm font-bold leading-[1.55] truncate">
              1. Text / Article URL
            </div>
            <div
              className={`text-[11px] leading-[1.65] truncate ${
                activeTab === "text_article" ? "text-black/80 font-medium" : "text-[#71717A]"
              }`}
            >
              စာသား သို့မဟုတ် ဆောင်းပါး Link
            </div>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "media_upload"}
          disabled={isProcessing}
          onClick={() => {
            setActiveTab("media_upload");
            if (errorMessage) setErrorMessage(null);
          }}
          className={`min-h-[44px] sm:min-h-[54px] flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 px-2 sm:px-3.5 py-1.5 sm:py-2.5 rounded-full sm:rounded-lg text-center sm:text-left transition-all cursor-pointer disabled:opacity-60 ${
            activeTab === "media_upload"
              ? "bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FBBF24] text-black shadow-[0_4px_16px_rgba(245,158,11,0.3)]"
              : "text-[#A1A1AA] hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <Upload
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
              activeTab === "media_upload" ? "text-black" : "text-[#F59E0B]"
            }`}
          />
          <span className="sm:hidden text-[11px] font-bold whitespace-nowrap truncate">
            Audio/Video
          </span>
          <div className="hidden sm:block min-w-0 font-burmese">
            <div className="text-xs sm:text-sm font-bold leading-[1.55] truncate">
              2. Audio / Video File
            </div>
            <div
              className={`text-[11px] leading-[1.65] truncate ${
                activeTab === "media_upload" ? "text-black/80 font-medium" : "text-[#71717A]"
              }`}
            >
              Gemini File API (150MB ထိ)
            </div>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "youtube"}
          disabled={isProcessing}
          onClick={() => {
            setActiveTab("youtube");
            if (errorMessage) setErrorMessage(null);
          }}
          className={`min-h-[44px] sm:min-h-[54px] flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 px-2 sm:px-3.5 py-1.5 sm:py-2.5 rounded-full sm:rounded-lg text-center sm:text-left transition-all cursor-pointer disabled:opacity-60 ${
            activeTab === "youtube"
              ? "bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FBBF24] text-black shadow-[0_4px_16px_rgba(245,158,11,0.3)]"
              : "text-[#A1A1AA] hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <PlayCircle
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
              activeTab === "youtube" ? "text-black" : "text-[#F59E0B]"
            }`}
          />
          <span className="sm:hidden text-[11px] font-bold whitespace-nowrap truncate">
            YouTube
          </span>
          <div className="hidden sm:block min-w-0 font-burmese">
            <div className="text-xs sm:text-sm font-bold leading-[1.55] truncate">
              3. YouTube Link
            </div>
            <div
              className={`text-[11px] leading-[1.65] truncate ${
                activeTab === "youtube" ? "text-black/80 font-medium" : "text-[#71717A]"
              }`}
            >
              Transcript, Metadata & Video
            </div>
          </div>
        </button>
      </div>

      {/* TAB 1 PANEL: RAW TEXT OR ARTICLE URL */}
      {activeTab === "text_article" && (
        <div role="tabpanel" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
            <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-[#121215] border border-white/10 rounded-xl font-burmese w-full sm:w-auto">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setTextSubMode("url")}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  textSubMode === "url"
                    ? "bg-[#F59E0B] text-black font-semibold"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">ဆောင်းပါး URL</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setTextSubMode("raw")}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  textSubMode === "raw"
                    ? "bg-[#F59E0B] text-black font-semibold"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">စာသားတိုက်ရိုက်</span>
              </button>
            </div>

            {textSubMode === "raw" && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setRawTextInput(SAMPLE_RAW_TEXT);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="min-h-[44px] w-full sm:w-auto px-3 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/30 hover:border-[#F59E0B] text-xs text-[#FBBF24] font-burmese cursor-pointer flex items-center justify-center"
              >
                ✨ နမူနာ စာသားထည့်မည်
              </button>
            )}
          </div>

          {textSubMode === "url" ? (
            <>
              <div className="relative flex items-center bg-[#000000] border-2 border-[#F59E0B]/50 focus-within:border-[#FBBF24] focus-within:ring-4 focus-within:ring-[#F59E0B]/20 rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.12)]">
                <div className="pl-3.5 sm:pl-4 pr-2 text-[#FBBF24] shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <input
                  id="kks-article-url"
                  type="url"
                  value={articleUrlInput}
                  onChange={(e) => {
                    setArticleUrlInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isProcessing) {
                      e.preventDefault();
                      onGenerateTextArticleRecap();
                    }
                  }}
                  disabled={isProcessing}
                  placeholder="https://... ဆောင်းပါး သို့မဟုတ် Wikipedia URL ထည့်သွင်းပါ"
                  className="w-full min-w-0 h-12 sm:h-14 bg-transparent px-2 text-base text-[#F4F4F6] placeholder:text-[#6E6E7A] focus:outline-none font-burmese"
                />
                {articleUrlInput && !isProcessing && (
                  <button
                    type="button"
                    onClick={() => setArticleUrlInput("")}
                    aria-label="Article URL ရှင်းလင်းရန်"
                    className="min-h-[44px] min-w-[44px] mr-1 text-[#8E8E9A] hover:text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[#8E8E9A] font-burmese">
                <span className="text-[#FBBF24]/80 w-full sm:w-auto">နမူနာ ဆောင်းပါးများ —</span>
                {SAMPLE_ARTICLE_LINKS.map((sample) => (
                  <button
                    key={sample.url}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setArticleUrlInput(sample.url);
                      setErrorMessage(null);
                      onGenerateTextArticleRecap(sample.url, undefined);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#18181B] border border-white/10 hover:border-[#F59E0B] text-[#FBBF24] hover:text-white transition-all cursor-pointer text-xs text-left"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="relative bg-[#000000] border-2 border-[#F59E0B]/50 focus-within:border-[#FBBF24] focus-within:ring-4 focus-within:ring-[#F59E0B]/20 rounded-xl transition-all p-3">
              <textarea
                id="kks-raw-text"
                rows={4}
                value={rawTextInput}
                onChange={(e) => {
                  setRawTextInput(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isProcessing}
                placeholder="အနှစ်ချုပ်လိုသော ဇာတ်လမ်း၊ မှတ်စု၊ ဇာတ်ညွှန်း သို့မဟုတ် ဆောင်းပါးစာသားများကို ဤနေရာတွင် ကူးယူထည့်သွင်းပါ..."
                className="w-full bg-transparent text-base sm:text-sm text-[#F4F4F6] placeholder:text-[#6E6E7A] focus:outline-none font-burmese leading-[1.9] resize-y min-h-[120px] py-1"
              />
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs text-[#71717A] font-burmese">
                <span>စာလုံးရေ: {rawTextInput.trim().length} / 24,000</span>
                {rawTextInput && !isProcessing && (
                  <button
                    type="button"
                    onClick={() => setRawTextInput("")}
                    className="min-h-[44px] px-2.5 text-[#A1A1AA] hover:text-white cursor-pointer flex items-center"
                  >
                    စာသားရှင်းမည်
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2 PANEL: UPLOADED AUDIO / VIDEO FILE WITH LOADING PROGRESS INDICATOR */}
      {activeTab === "media_upload" && (
        <div role="tabpanel" className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isProcessing) setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDropFile}
            onClick={() => {
              if (!isProcessing) fileInputRef.current?.click();
            }}
            className={`relative rounded-xl border-2 border-dashed p-4 sm:p-6 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2.5 ${
              isDraggingFile
                ? "border-[#FBBF24] bg-[#F59E0B]/10 shadow-[0_0_30px_rgba(245,158,11,0.25)]"
                : "border-[#F59E0B]/45 bg-[#000000]/90 hover:border-[#FBBF24] hover:bg-[#0D0B05]"
            } ${isProcessing ? "opacity-80 cursor-not-allowed" : ""}`}
          >
            <div className="w-12 h-12 rounded-xl bg-[#181406] border border-[#F59E0B]/50 flex items-center justify-center text-[#FBBF24] shadow-inner">
              {selectedUploadFile && selectedUploadFile.type.startsWith("audio/") ? (
                <FileAudio className="w-6 h-6" />
              ) : selectedUploadFile ? (
                <FileVideo className="w-6 h-6" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </div>

            <div className="font-burmese">
              <p className="text-sm sm:text-base font-bold text-[#FFF2B2]">
                {selectedUploadFile
                  ? selectedUploadFile.name
                  : "အသံ (MP3, WAV, M4A) သို့မဟုတ် ဗီဒီယို (MP4, MOV, WebM) ဖိုင်ကို ဤနေရာသို့ ဆွဲထည့်ပါ"}
              </p>
              <p className="mt-1 text-xs text-[#A1A1AA]">
                {selectedUploadFile
                  ? `${formatBytesMb(selectedUploadFile.size)} · ${
                      selectedUploadFile.type || "Media File"
                    }`
                  : "သို့မဟုတ် နှိပ်၍ ဖုန်း/ကွန်ပျူတာထဲမှ ဖိုင်ရွေးချယ်ပါ (150MB အထိ · Gemini File API ဖြင့် စစ်ဆေးပေးသည်)"}
              </p>
            </div>

            {selectedUploadFile && !isProcessing && (
              <div
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 w-full sm:w-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/40 text-xs font-medium text-[#FBBF24] hover:border-[#FBBF24] font-burmese cursor-pointer flex items-center justify-center"
                >
                  အခြားဖိုင် ပြောင်းရွေးမည်
                </button>
                <button
                  type="button"
                  onClick={onClearSelectedUploadFile}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-[#A1A1AA] hover:text-white cursor-pointer flex items-center justify-center"
                >
                  ✕ ဖယ်ရှားမည်
                </button>
              </div>
            )}
          </div>

          {/* Dedicated File Upload Loading Progress Indicator */}
          {uploadTransferProgress && (
            <div className="p-3.5 rounded-xl bg-[#120F05] border border-[#F59E0B]/60 shadow-[0_0_24px_rgba(245,158,11,0.2)] font-burmese">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 font-bold text-[#FBBF24] truncate">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span className="truncate">
                    {uploadTransferProgress.phase === "uploading"
                      ? `ဖိုင်တင်သွင်းနေပါသည်: ${uploadTransferProgress.fileName}`
                      : `Gemini File API (ai.files.upload) ဖြင့် စစ်ဆေးနေပါသည်: ${uploadTransferProgress.fileName}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums font-bold text-[#FFF5C0]">
                  {formatBytesMb(uploadTransferProgress.loadedBytes)} /{" "}
                  {formatBytesMb(uploadTransferProgress.totalBytes)} ({uploadTransferProgress.percent}%)
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-black/70 overflow-hidden border border-[#F59E0B]/25">
                <div
                  className="h-full bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FFF5C0] transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.max(4, uploadTransferProgress.percent))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3 PANEL: YOUTUBE LINKS (AND DIRECT/SOCIAL VIDEO LINKS) */}
      {activeTab === "youtube" && (
        <div role="tabpanel" className="space-y-3">
          <div className="relative flex items-center bg-[#000000] border-2 border-[#F59E0B]/50 focus-within:border-[#FBBF24] focus-within:ring-4 focus-within:ring-[#F59E0B]/20 rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.12)]">
            <div className="pl-3.5 sm:pl-4 pr-2 text-[#FBBF24] shrink-0">
              <Link2 className="w-5 h-5" />
            </div>

            <input
              id="kks-video-url"
              type="url"
              value={videoUrlInput}
              onChange={(e) => {
                const val = e.target.value;
                setVideoUrlInput(val);
                if (errorMessage) setErrorMessage(null);
                if (justPastedRef.current) return;
                if (autoCutDebounceRef.current) {
                  clearTimeout(autoCutDebounceRef.current);
                  autoCutDebounceRef.current = null;
                }
                if (autoCutOnPaste && !isProcessingRef.current) {
                  const trimmed = val.trim();
                  if (isValidAutoCutUrl(trimmed)) {
                    autoCutDebounceRef.current = window.setTimeout(() => {
                      if (!isProcessingRef.current) {
                        onGenerateClips(trimmed);
                      }
                    }, 1000);
                  }
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text").trim();
                if (pasted && isValidAutoCutUrl(pasted)) {
                  if (autoCutDebounceRef.current) {
                    clearTimeout(autoCutDebounceRef.current);
                    autoCutDebounceRef.current = null;
                  }
                  justPastedRef.current = true;
                  setTimeout(() => {
                    justPastedRef.current = false;
                  }, 700);
                  setVideoUrlInput(pasted);
                  if (errorMessage) setErrorMessage(null);
                  if (autoCutOnPaste && !isProcessingRef.current) {
                    autoCutDebounceRef.current = window.setTimeout(() => {
                      if (!isProcessingRef.current) {
                        onGenerateClips(pasted);
                      }
                    }, 180);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isProcessing) {
                  e.preventDefault();
                  onGenerateClips();
                }
              }}
              disabled={isProcessing}
              placeholder="https://youtube.com/watch?v=... သို့မဟုတ် Video Link ထည့်ပါ"
              className="w-full min-w-0 h-12 sm:h-16 bg-transparent px-2 text-base text-[#F4F4F6] placeholder:text-[#6E6E7A] focus:outline-none font-burmese"
            />

            {videoUrlInput && !isProcessing && (
              <button
                type="button"
                onClick={() => setVideoUrlInput("")}
                aria-label="Link ရှင်းလင်းရန်"
                className="min-h-[44px] min-w-[44px] mr-1 text-[#8E8E9A] hover:text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {detectedYouTubeId && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#121215] border border-[#F59E0B]/35 font-burmese">
              <img
                src={`https://i.ytimg.com/vi/${detectedYouTubeId}/mqdefault.jpg`}
                alt="YouTube thumbnail preview"
                className="w-20 h-11 object-cover rounded-lg border border-white/10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-[#FBBF24] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">YouTube ID: {detectedYouTubeId}</span>
                </div>
                <p className="text-[11px] text-[#A1A1AA] line-clamp-2 sm:truncate">
                  Transcript / Captions, Metadata နှင့် Video Stream တို့ကို အလိုအလျောက် ဆွဲယူသုံးသပ်ပေးပါမည်
                </p>
              </div>
            </div>
          )}

          {/* Quick 1-Click Sample Links */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8E8E9A] font-burmese">
            <span className="text-[#FBBF24]/80 w-full sm:w-auto">အသင့်စမ်းသပ်ရန် —</span>
            {SAMPLE_LINKS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setVideoUrlInput(sample.url);
                  setErrorMessage(null);
                  onGenerateClips(sample.url);
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#18181B] border border-white/10 hover:border-[#F59E0B] text-[#FBBF24] hover:text-white transition-all cursor-pointer text-xs text-left"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unified Compact Studio Controls Bar */}
      <div className="mt-3 sm:mt-4 pt-3 sm:pt-3.5 border-t border-white/[0.08] flex flex-col lg:flex-row lg:flex-wrap lg:items-center lg:justify-between gap-2.5 sm:gap-3 text-xs font-burmese">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
          {/* Aspect Ratio Selector */}
          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 bg-[#121215] border border-white/10 rounded-xl w-full sm:w-auto">
            <span className="text-[11px] text-[#A1A1AA] px-1.5 hidden sm:inline shrink-0">အချိုး:</span>
            {(["9:16", "16:9", "1:1"] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`min-h-[44px] sm:min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center text-center ${
                  aspectRatio === ratio
                    ? "bg-[#F59E0B] text-black font-semibold"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                {ratio === "9:16" ? "9:16 ဒေါင်" : ratio === "16:9" ? "16:9 ရုပ်ရှင်" : "1:1"}
              </button>
            ))}
          </div>

          {/* Framing Mode Selector */}
          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 bg-[#121215] border border-white/10 rounded-xl w-full sm:w-auto">
            <span className="text-[11px] text-[#A1A1AA] px-1.5 hidden sm:inline shrink-0">ဘောင်:</span>
            {[
              { id: "blur_bg", label: "နောက်ခံဝါး" },
              { id: "crop_fill", label: "အလယ်ပြည့်" },
              { id: "letterbox", label: "ရုပ်ရှင်ဘား" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFramingMode(item.id as "blur_bg" | "crop_fill" | "letterbox")}
                className={`min-h-[44px] sm:min-h-[38px] px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center text-center ${
                  framingMode === item.id
                    ? "bg-[#F59E0B] text-black font-semibold"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Audio Mode */}
          <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-[#121215] border border-white/10 rounded-xl w-full sm:w-auto">
            {[
              { id: "original", label: "မူရင်းအသံ", icon: Volume2 },
              { id: "mix", label: "ရောနှောအသံ", icon: Music },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAudioMode(item.id as "original" | "mix")}
                className={`min-h-[44px] sm:min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  audioMode === item.id
                    ? "bg-[#F59E0B] text-black font-semibold"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Recap Language / Storyteller Selector */}
          <div
            role="group"
            aria-label="Recap Language Mode"
            className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-[#121215] border border-[#F59E0B]/30 rounded-xl w-full sm:w-auto"
          >
            <span className="text-[11px] text-[#A1A1AA] px-1.5 hidden sm:inline shrink-0">ဘာသာ:</span>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setRecapLanguage("my")}
              className={`min-h-[44px] sm:min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center ${
                recapLanguage === "my"
                  ? "bg-[#F59E0B] text-black font-semibold"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
              title="မြန်မာ Storyteller ဇာတ်ကြောင်းပြောဟန်ဖြင့် ထုတ်ယူရန်"
            >
              မြန်မာ (Storyteller)
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setRecapLanguage("en")}
              className={`min-h-[44px] sm:min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center ${
                recapLanguage === "en"
                  ? "bg-[#F59E0B] text-black font-semibold"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
              title="Generate engaging recap in English storyteller voice"
            >
              English
            </button>
          </div>
        </div>

        {/* Right Controls: Anti-Copyright, Auto-Cut & Settings */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setBypassCensorship(!bypassCensorship)}
            className={`min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              bypassCensorship
                ? "bg-[#181406] text-[#FBBF24] border-[#F59E0B]/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                : "bg-[#141416] text-[#71717A] border-white/10"
            }`}
            title="ရုပ်ရှင်မူပိုင်ခွင့်စစ်ဆေးမှုများ ကျော်လွှားနိုင်ရန် စနစ်"
          >
            <span>🛡️</span>
            <span className="truncate">Anti-Copyright {bypassCensorship ? "✓" : "✕"}</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoCutOnPaste(!autoCutOnPaste)}
            className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-[#121215] border border-white/10 text-xs text-[#A1A1AA] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
            title="Link ထည့်လိုက်သည်နှင့် အလိုအလျောက် ချက်ချင်းဖြတ်ရန်"
          >
            <span
              className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] font-bold shrink-0 ${
                autoCutOnPaste ? "bg-[#F59E0B] border-[#F59E0B] text-black" : "border-white/30"
              }`}
            >
              {autoCutOnPaste ? "✓" : ""}
            </span>
            <span className="truncate">Auto-Cut on Paste</span>
          </button>

          <button
            type="button"
            onClick={() => setDraftFirstMode(!draftFirstMode)}
            className={`min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl border text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              draftFirstMode
                ? "bg-[#181406] border-[#F59E0B]/60 text-[#FBBF24] font-semibold"
                : "bg-[#121215] border-white/10 text-[#A1A1AA] hover:text-white"
            }`}
            title="TTS အသံနှင့် MP4 ဗီဒီယို မထုတ်မီ AI Script နှင့် Timeline ကို စိတ်ကြိုက်အရင်ပြင်ဆင်ရန်"
          >
            <span
              className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] font-bold shrink-0 ${
                draftFirstMode ? "bg-[#F59E0B] border-[#F59E0B] text-black" : "border-white/30"
              }`}
            >
              {draftFirstMode ? "✓" : ""}
            </span>
            <span className="truncate">Edit Script First</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSettings(1)}
            className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/35 hover:border-[#F59E0B] text-xs text-[#FBBF24] flex items-center justify-center gap-1.5 cursor-pointer"
            title="အဆင့် ၁ မှ ၄ အထိ တဆင့်ချင်း အလွယ်တကူ ချိန်ညှိရန်"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Settings</span>
          </button>
        </div>
      </div>

      {/* User-Customizable Duration Selector Row (5s up to 5 Minutes) */}
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 text-xs font-burmese">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto">
          <span className="inline-flex items-center gap-1.5 text-[#FBBF24] font-semibold">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>ကြာချိန် (5 မိနစ်ထိ ရွေးချယ်နိုင်):</span>
          </span>

          <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1 p-1 bg-[#121215] border border-white/10 rounded-xl w-full sm:w-auto">
            {TOOLBAR_DURATION_PRESETS.map((preset) => (
              <button
                key={preset.sec}
                type="button"
                disabled={isProcessing}
                onClick={() => setClipDuration(preset.sec)}
                className={`min-h-[44px] sm:min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center ${
                  clipDuration === preset.sec
                    ? "bg-[#F59E0B] text-black font-semibold"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2.5 p-2 px-3 bg-[#121215] border border-[#F59E0B]/25 rounded-xl w-full sm:w-auto">
          <span className="text-xs text-[#A1A1AA]">စိတ်ကြိုက်:</span>
          <CustomDurationInputs
            valueSec={clipDuration}
            onChangeSec={setClipDuration}
            disabled={isProcessing}
            compact
          />
          <span className="text-xs text-[#FBBF24] font-semibold sm:border-l sm:border-white/10 sm:pl-2">
            {formatDurationBurmese(clipDuration)}
          </span>
        </div>
      </div>

      {/* Glowing Live Processing Banner */}
      {isProcessing && (
        <div className="mt-3.5 p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-[#1E1705] via-[#2A1D05] to-[#1E1705] border border-[#F59E0B] shadow-[0_0_30px_rgba(245,158,11,0.35)]">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-[#FBBF24] animate-spin shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm font-bold text-[#FBBF24] font-burmese flex items-center justify-between gap-2">
                <span className="truncate">
                  {queuePosition && queuePosition > 0
                    ? `⏳ Render Queue — အလှည့် ${queuePosition}${
                        queueLength && queueLength > 0 ? ` / ${queueLength}` : ""
                      } စောင့်ဆိုင်းနေပါသည်`
                    : `⚡ AI Pipeline မှ ${formatDurationBurmese(clipDuration)} စာ Recap ဖန်တီးနေပါသည်`}
                </span>
                {typeof processingProgress === "number" && (
                  <span className="shrink-0 tabular-nums text-[#FFF5C0]">
                    {processingProgress}%
                  </span>
                )}
              </div>
              <p className="text-xs text-[#E5B842] font-burmese mt-0.5 truncate">
                {processingStatusText || PROCESSING_STEPS_BURMESE[stepIndex]}
              </p>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 w-full rounded-full bg-black/60 overflow-hidden border border-[#F59E0B]/20">
            <div
              className="h-full bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FFF5C0] transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(6, processingProgress ?? 18))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Success Banner */}
      {successMessage && !isProcessing && (
        <div className="mt-3.5 p-3 rounded-xl bg-[#0F291E] border border-[#10B981]/50 text-xs sm:text-sm text-[#A7F3D0] font-burmese flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
          <span className="flex-1">{successMessage}</span>
        </div>
      )}

      {/* Error Notice */}
      {errorMessage && (
        <div
          role="alert"
          className="mt-3.5 px-4 py-3 rounded-xl bg-[#2A1215] border border-[#F87171]/40 text-sm text-[#FCA5A5] font-burmese flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setActiveTab("media_upload");
                fileInputRef.current?.click();
              }}
              disabled={isProcessing}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#18181B] border border-[#F59E0B]/60 text-[#FBBF24] font-semibold text-xs hover:bg-[#F59E0B]/15 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>ဖိုင်တင်မည် (Upload)</span>
            </button>
            <button
              type="button"
              onClick={handlePrimarySubmit}
              disabled={isProcessing}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-black font-bold text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md flex items-center justify-center disabled:opacity-50"
            >
              🔄 ထပ်မံကြိုးစားမည် (Retry)
            </button>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs transition-all cursor-pointer flex items-center justify-center"
              title="Dismiss"
            >
              ✕ ပိတ်မည်
            </button>
          </div>
        </div>
      )}

      {/* Radiant Gold Primary Action Button */}
      <div className="mt-3 sm:mt-4">
        <button
          type="button"
          onClick={handlePrimarySubmit}
          disabled={isProcessing}
          className="w-full min-h-[48px] sm:min-h-[54px] px-4 sm:px-6 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FBBF24] text-black font-bold text-sm sm:text-base shadow-[0_8px_28px_rgba(245,158,11,0.32)] hover:brightness-105 active:scale-[0.995] disabled:opacity-75 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-center leading-snug cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-black shrink-0" />
              <span className="font-burmese line-clamp-2 sm:truncate">
                {processingStatusText || PROCESSING_STEPS_BURMESE[stepIndex]}
              </span>
            </>
          ) : (
            <>
              <Scissors className="w-5 h-5 text-black shrink-0" />
              <span className="font-burmese font-bold">{primaryButtonLabel}</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
