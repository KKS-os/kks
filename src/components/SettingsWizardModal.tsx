import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { CustomDurationInputs } from "./CustomDurationInputs";
import {
  DemoQuotaStatus,
  MAX_CLIP_DURATION_SEC,
  MIN_CLIP_DURATION_SEC,
  SETTINGS_DURATION_PRESETS,
  SettingsWizardTab,
  SubtitleStyleOptions,
  clampClipDuration,
  formatDurationBurmese,
} from "./types";
import { maskGeminiApiKey } from "../utils/apiKeyStorage";

interface SettingsWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  settingsStep: SettingsWizardTab;
  setSettingsStep: React.Dispatch<React.SetStateAction<SettingsWizardTab>>;
  clipDuration: number;
  setClipDuration: (sec: number) => void;
  aspectRatio: "9:16" | "16:9" | "1:1";
  setAspectRatio: (val: "9:16" | "16:9" | "1:1") => void;
  framingMode: "blur_bg" | "crop_fill" | "letterbox";
  setFramingMode: (val: "blur_bg" | "crop_fill" | "letterbox") => void;
  audioMode: "original" | "voiceover" | "mix";
  setAudioMode: (val: "original" | "voiceover" | "mix") => void;
  bypassCensorship: boolean;
  setBypassCensorship: (val: boolean) => void;
  autoCutOnPaste: boolean;
  setAutoCutOnPaste: (val: boolean) => void;
  subtitleStyle: SubtitleStyleOptions;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyleOptions>>;
  userApiKey: string;
  onSaveUserApiKey: (rawKey: string) => void;
  onClearUserApiKey: () => void;
  demoQuota: DemoQuotaStatus;
}

export function SettingsWizardModal({
  isOpen,
  onClose,
  settingsStep,
  setSettingsStep,
  clipDuration,
  setClipDuration,
  aspectRatio,
  setAspectRatio,
  framingMode,
  setFramingMode,
  audioMode,
  setAudioMode,
  bypassCensorship,
  setBypassCensorship,
  autoCutOnPaste,
  setAutoCutOnPaste,
  subtitleStyle,
  setSubtitleStyle,
  userApiKey,
  onSaveUserApiKey,
  onClearUserApiKey,
  demoQuota,
}: SettingsWizardModalProps) {
  const [apiKeyDraft, setApiKeyDraft] = useState<string>(userApiKey);
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeySavedMsg, setApiKeySavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setApiKeyDraft(userApiKey);
      setApiKeyError(null);
      setApiKeySavedMsg(null);
      setShowKeyText(false);
    }
  }, [isOpen, userApiKey]);

  if (!isOpen) return null;

  const hasSavedPersonalKey = Boolean(userApiKey);

  const handleSaveKeyClick = () => {
    setApiKeyError(null);
    setApiKeySavedMsg(null);
    try {
      onSaveUserApiKey(apiKeyDraft);
      setApiKeySavedMsg("✓ ကိုယ်ပိုင် Gemini API Key ကို သိမ်းဆည်းပြီးပါပြီ (Unlimited Mode Active)");
    } catch (err) {
      setApiKeyError(
        err instanceof Error ? err.message : "API Key ပုံစံ မမှန်ကန်ပါ။"
      );
    }
  };

  const handleClearKeyClick = () => {
    setApiKeyError(null);
    setApiKeySavedMsg(null);
    setApiKeyDraft("");
    onClearUserApiKey();
    setApiKeySavedMsg("Personal API Key ကို ဖယ်ရှားပြီး Free Demo Mode သို့ ပြောင်းလဲထားပါသည်။");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-[#09090B] border border-[#F59E0B]/50 rounded-2xl w-full max-w-lg p-4 sm:p-6 shadow-[0_0_50px_rgba(245,158,11,0.3)] relative max-h-[92dvh] flex flex-col font-burmese">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#181406] border border-[#F59E0B]/50 flex items-center justify-center text-[#FBBF24] shrink-0">
              <Settings className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-[#FFF2B2] truncate">
                Studio Settings & Free API Key
              </h3>
              <p className="text-[11px] text-[#A1A1AA] truncate">
                {settingsStep === "api_key"
                  ? "ကိုယ်ပိုင် Free Gemini API Key ဖြင့် Unlimited သုံးရန်"
                  : `အဆင့် ${settingsStep} / 4 · စိတ်ကြိုက်ရွေးချယ်နေစဉ် API မသုံးပါ`}
              </p>
            </div>
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

        {/* 5-Tab Bar: Free API Key + Steps 1..4 (2-col wrap on small screens, 5-col on >=640px) */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSettingsStep("api_key")}
            className={`col-span-2 sm:col-span-1 min-h-[44px] py-2 px-2 rounded-xl border text-xs sm:text-[11px] font-semibold transition-all cursor-pointer text-center truncate flex items-center justify-center gap-1.5 ${
              settingsStep === "api_key"
                ? "bg-[#F59E0B] text-black border-[#F59E0B] shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                : hasSavedPersonalKey
                ? "bg-[#092117] text-emerald-300 border-emerald-500/45 hover:border-emerald-400"
                : "bg-[#181406] text-[#FBBF24] border-[#F59E0B]/40 hover:border-[#F59E0B]"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Free API Key</span>
          </button>

          {[
            { step: 1 as const, label: "၁. ကြာချိန်" },
            { step: 2 as const, label: "၂. ပုံစံအချိုး" },
            { step: 3 as const, label: "၃. အသံ/ကာကွယ်" },
            { step: 4 as const, label: "၄. စာတန်း" },
          ].map((item) => {
            const isActive = settingsStep === item.step;
            const isDone = typeof settingsStep === "number" && settingsStep > item.step;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => setSettingsStep(item.step)}
                className={`min-h-[44px] py-2 px-2 rounded-xl border text-xs sm:text-[11px] font-semibold transition-all cursor-pointer text-center truncate flex items-center justify-center ${
                  isActive
                    ? "bg-[#F59E0B] text-black border-[#F59E0B] shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                    : isDone
                    ? "bg-[#181406] text-[#FBBF24] border-[#F59E0B]/45 hover:border-[#F59E0B]"
                    : "bg-[#141418] text-[#8E8E9A] border-white/10 hover:text-white"
                }`}
              >
                {isDone ? `✓ ${item.label.replace(/^[၁-၄]\.\s*/, "")}` : item.label}
              </button>
            );
          })}
        </div>

        {/* Step Content Body */}
        <div className="mt-4 flex-1 overflow-y-auto pr-0.5 space-y-4 text-sm">
          {/* BYOK API KEY PANEL */}
          {settingsStep === "api_key" && (
            <div className="space-y-4">
              {/* Current Mode Card */}
              <div
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                  hasSavedPersonalKey
                    ? "bg-[#092117]/90 border-emerald-500/50 text-emerald-100"
                    : "bg-[#181406] border-[#F59E0B]/40 text-[#FEF3C7]"
                }`}
              >
                <div className="space-y-1">
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    {hasSavedPersonalKey ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Unlimited Mode (Personal API Key Active)</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4 text-[#FBBF24] shrink-0" />
                        <span>
                          Free Demo Mode ({demoQuota.demoRemaining}/{demoQuota.demoLimit} left today)
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] opacity-85 leading-[1.7]">
                    {hasSavedPersonalKey
                      ? `သင့် Browser တွင် သိမ်းဆည်းထားသော Key (${maskGeminiApiKey(userApiKey)}) ဖြင့် နေ့စဉ်ကန့်သတ်ချက်မရှိ အသုံးပြုနေပါသည်။`
                      : "Server ၏ Free Demo Key ဖြင့် ၂၄ နာရီလျှင် ၂ ကြိမ် စမ်းသပ်နိုင်ပါသည်။ ကိုယ်ပိုင် Key ထည့်ပါက အကန့်အသတ်မရှိ ၁၀၀% အခမဲ့ သုံးနိုင်ပါသည်။"}
                  </p>
                </div>
              </div>

              {/* 30-Second Free Gemini API Key Guide */}
              <div className="p-4 rounded-xl bg-[#121215] border border-[#F59E0B]/30 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#FBBF24]">
                    ⚡ စက္ကန့် ၃၀ အတွင်း Free Gemini API Key ရယူနည်း
                  </span>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 rounded-xl bg-[#F59E0B] text-black font-bold text-xs inline-flex items-center justify-center gap-1.5 hover:brightness-105 transition-all"
                  >
                    <span>Google AI Studio ဖွင့်မည်</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>

                <ol className="text-[11px] sm:text-xs text-[#D4D4D8] space-y-1.5 list-decimal pl-4 leading-[1.8]">
                  <li>
                    အထက်ပါ{" "}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FBBF24] underline font-semibold"
                    >
                      aistudio.google.com/apikey
                    </a>{" "}
                    သို့ Google Account ဖြင့် ဝင်ရောက်ပါ (Credit Card မလိုပါ — ၁၀၀% Free Tier)။
                  </li>
                  <li>
                    &quot;Create API Key&quot; ခလုတ်ကို နှိပ်ပြီး ရရှိလာသော{" "}
                    <code className="text-[#FDE68A] bg-black/50 px-1 py-0.5 rounded">AIza...</code>{" "}
                    Key ကို Copy ကူးယူပါ။
                  </li>
                  <li>
                    အောက်ပါအကွက်ထဲသို့ Paste ထည့်ပြီး &quot;Save Key&quot; ကို နှိပ်ပါ (Key ကို သင့်စက်၏{" "}
                    <code className="text-[#FDE68A]">localStorage</code> ထဲတွင်သာ လုံခြုံစွာ သိမ်းဆည်းပါသည်)။
                  </li>
                </ol>
              </div>

              {/* API Key Input & Controls */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#121215] border border-white/10 space-y-3">
                <label htmlFor="kks-user-gemini-key" className="block text-xs font-semibold text-[#FBBF24]">
                  သင့် Google Gemini API Key (AIza...)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      id="kks-user-gemini-key"
                      type={showKeyText ? "text" : "password"}
                      value={apiKeyDraft}
                      onChange={(e) => {
                        setApiKeyDraft(e.target.value);
                        if (apiKeyError) setApiKeyError(null);
                        if (apiKeySavedMsg) setApiKeySavedMsg(null);
                      }}
                      placeholder="AIzaSy..."
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full min-h-[44px] pl-3.5 pr-12 py-2.5 rounded-xl bg-[#09090C] border border-white/15 focus:border-[#F59E0B] focus:outline-none text-base sm:text-sm font-mono text-[#FFF2B2]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyText((prev) => !prev)}
                      aria-label={showKeyText ? "Key ဝှက်ထားမည်" : "Key ပြသမည်"}
                      className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#A1A1AA] hover:text-white cursor-pointer"
                    >
                      {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {apiKeyError && (
                  <p className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2">
                    {apiKeyError}
                  </p>
                )}

                {apiKeySavedMsg && (
                  <p className="text-xs text-emerald-200 bg-emerald-950/50 border border-emerald-500/40 rounded-lg px-3 py-2">
                    {apiKeySavedMsg}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveKeyClick}
                    className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-black font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:brightness-105"
                  >
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Save Personal API Key</span>
                  </button>

                  {hasSavedPersonalKey && (
                    <button
                      type="button"
                      onClick={handleClearKeyClick}
                      className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-xl bg-red-950/50 border border-red-500/40 hover:border-red-400 text-red-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />
                      <span>Remove Key</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* STEP 1: CLIP DURATION */}
          {settingsStep === 1 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#121215] border border-[#F59E0B]/25">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#FBBF24]">
                    အဆင့် (၁) — ဗီဒီယို ကြာချိန် ဘယ်လောက်လိုချင်ပါသလဲ?
                  </span>
                  <span className="text-xs font-bold text-[#FFF5C0] bg-[#181406] border border-[#F59E0B]/40 px-2.5 py-0.5 rounded-lg shrink-0">
                    {formatDurationBurmese(clipDuration)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">
                  အောက်ပါ အမြန်ခလုတ်များကို နှိပ်၍ဖြစ်စေ၊ Slider ဆွဲ၍ဖြစ်စေ 5 စက္ကန့် မှ 5 မိနစ်အထိ ရွေးနိုင်ပါသည်။
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {SETTINGS_DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.sec}
                    type="button"
                    onClick={() => setClipDuration(preset.sec)}
                    className={`min-h-[44px] py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center justify-center text-center ${
                      clipDuration === preset.sec
                        ? "bg-[#F59E0B] text-black border-[#F59E0B] shadow-md"
                        : "bg-[#18181B] border-white/10 text-[#D4D4D8] hover:border-[#F59E0B]/50"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-[#121215] border border-white/10 space-y-3">
                <input
                  type="range"
                  min={MIN_CLIP_DURATION_SEC}
                  max={MAX_CLIP_DURATION_SEC}
                  step={5}
                  value={clampClipDuration(clipDuration)}
                  onChange={(e) => setClipDuration(clampClipDuration(Number(e.target.value)))}
                  aria-label="ဗီဒီယို ကြာချိန် Slider"
                  className="w-full h-8 accent-[#F59E0B] cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] text-[#71717A]">
                  <span>5 စက္ကန့်</span>
                  <span>2 မိနစ် 30 စက္ကန့်</span>
                  <span>5 မိနစ်</span>
                </div>
                <div className="pt-2.5 border-t border-white/[0.06] flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
                  <span className="text-xs text-[#D4D4D8]">မိနစ်/စက္ကန့် တိကျစွာ ရိုက်ထည့်ရန်:</span>
                  <CustomDurationInputs valueSec={clipDuration} onChangeSec={setClipDuration} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: ASPECT RATIO & FRAMING */}
          {settingsStep === 2 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#121215] border border-[#F59E0B]/25">
                <div className="text-xs font-semibold text-[#FBBF24]">
                  အဆင့် (၂) — ဗီဒီယို မျက်နှာပြင်အချိုးနှင့် ဘောင်ပုံစံ ရွေးချယ်ပါ
                </div>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">
                  TikTok / Reels / Shorts အတွက် ဒေါင်လိုက် (9:16) နှင့် YouTube / Facebook အတွက် အလျားလိုက် (16:9) အသင့်တော်ဆုံး ဖြစ်ပါသည်။
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#FBBF24] mb-2">
                  ၁။ ဗီဒီယို အချိုး (Aspect Ratio)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { ratio: "9:16" as const, title: "9:16 ဒေါင်လိုက်", sub: "TikTok · Reels" },
                    { ratio: "16:9" as const, title: "16:9 ရုပ်ရှင်", sub: "YouTube · FB" },
                    { ratio: "1:1" as const, title: "1:1 လေးထောင့်", sub: "Feed Post" },
                  ].map((item) => (
                    <button
                      key={item.ratio}
                      type="button"
                      onClick={() => setAspectRatio(item.ratio)}
                      className={`min-h-[48px] py-2.5 px-3 rounded-xl border text-left sm:text-center transition-all cursor-pointer flex sm:block items-center justify-between ${
                        aspectRatio === item.ratio
                          ? "bg-[#F59E0B] text-black border-[#F59E0B] shadow-md"
                          : "bg-[#18181B] border-white/10 text-[#D4D4D8] hover:border-[#F59E0B]/50"
                      }`}
                    >
                      <div className="text-xs font-bold">{item.title}</div>
                      <div
                        className={`text-[11px] sm:text-[10px] sm:mt-0.5 ${
                          aspectRatio === item.ratio ? "text-black/75" : "text-[#8E8E9A]"
                        }`}
                      >
                        {item.sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#FBBF24] mb-2">
                  ၂။ မြင်ကွင်း အံဝင်ခွင်ကျစနစ် (Framing)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "blur_bg", label: "✨ နောက်ခံဝါး", desc: "ရုပ်မပျက် အချိုးကျ" },
                    { id: "crop_fill", label: "📐 အလယ်ပြည့်", desc: "မျက်နှာပြင်အပြည့်" },
                    { id: "letterbox", label: "🎬 ရုပ်ရှင်ဘား", desc: "အမည်းဘားဖြင့်" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setFramingMode(mode.id as "blur_bg" | "crop_fill" | "letterbox")}
                      className={`min-h-[48px] py-2.5 px-3 rounded-xl border text-left sm:text-center transition-all cursor-pointer flex sm:block items-center justify-between ${
                        framingMode === mode.id
                          ? "bg-[#F59E0B] text-black border-[#F59E0B] shadow-md"
                          : "bg-[#18181B] border-white/10 text-[#D4D4D8] hover:border-[#F59E0B]/50"
                      }`}
                    >
                      <div className="text-xs font-bold">{mode.label}</div>
                      <div
                        className={`text-[11px] sm:text-[10px] sm:mt-0.5 ${
                          framingMode === mode.id ? "text-black/75" : "text-[#8E8E9A]"
                        }`}
                      >
                        {mode.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: AUDIO & ANTI-COPYRIGHT / AUTO-CUT */}
          {settingsStep === 3 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#121215] border border-[#F59E0B]/25">
                <div className="text-xs font-semibold text-[#FBBF24]">
                  အဆင့် (၃) — အသံစနစ်နှင့် မူပိုင်ခွင့် ကာကွယ်မှု
                </div>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">
                  ရုပ်သံမူပိုင်ခွင့် လွတ်ကင်းစေရန်နှင့် Link ထည့်လိုက်သည်နှင့် အလိုအလျောက်ဖြတ်မည့် စနစ်ကို ရွေးချယ်ပါ။
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#FBBF24] mb-2">
                  ၁။ အသံ စနစ် (Audio Track Mode)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "original", label: "မူရင်းအသံ", desc: "ဗီဒီယိုမူရင်းသံ" },
                    { id: "voiceover", label: "AI မြန်မာအသံ", desc: "ဇာတ်ကြောင်းပြော" },
                    { id: "mix", label: "ရောနှောအသံ", desc: "မူရင်း + ဇာတ်ကြောင်း" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAudioMode(item.id as "original" | "voiceover" | "mix")}
                      className={`min-h-[48px] py-2.5 px-3 rounded-xl border text-left sm:text-center transition-all cursor-pointer flex sm:block items-center justify-between ${
                        audioMode === item.id
                          ? "bg-[#F59E0B] text-black border-[#F59E0B] shadow-md"
                          : "bg-[#18181B] border-white/10 text-[#D4D4D8] hover:border-[#F59E0B]/50"
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div
                        className={`text-[11px] sm:text-[10px] sm:mt-0.5 ${
                          audioMode === item.id ? "text-black/75" : "text-[#8E8E9A]"
                        }`}
                      >
                        {item.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setBypassCensorship(!bypassCensorship)}
                  className={`min-h-[54px] w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                    bypassCensorship
                      ? "bg-[#181406] border-[#F59E0B]/60 text-[#FFF2B2]"
                      : "bg-[#121215] border-white/10 text-[#A1A1AA]"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <span>🛡️ Anti-Copyright & Bypass</span>
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      မူပိုင်ခွင့်နှင့် ဆင်ဆာစစ်ဆေးမှုများ လွတ်ကင်းအောင် အရောင်/အသံ ချိန်ညှိပေးသည်
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                      bypassCensorship ? "bg-[#F59E0B] text-black" : "bg-white/10 text-[#8E8E9A]"
                    }`}
                  >
                    {bypassCensorship ? "ဖွင့်ထား ✓" : "ပိတ်ထား"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAutoCutOnPaste(!autoCutOnPaste)}
                  className={`min-h-[54px] w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                    autoCutOnPaste
                      ? "bg-[#181406] border-[#F59E0B]/60 text-[#FFF2B2]"
                      : "bg-[#121215] border-white/10 text-[#A1A1AA]"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <span>⚡ Auto-Cut on Paste</span>
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      Link Paste လုပ်လိုက်သည်နှင့် ၁ ကြိမ်တည်း တိုက်ရိုက်ဖြတ်ပေးသည် (API ထပ်ခါမသုံးပါ)
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                      autoCutOnPaste ? "bg-[#F59E0B] text-black" : "bg-white/10 text-[#8E8E9A]"
                    }`}
                  >
                    {autoCutOnPaste ? "ဖွင့်ထား ✓" : "ပိတ်ထား"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: SUBTITLE STYLE + LIVE PREVIEW */}
          {settingsStep === 4 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#121215] border border-[#F59E0B]/25">
                <div className="text-xs font-semibold text-[#FBBF24]">
                  အဆင့် (၄) — မြန်မာစာတန်းထိုး ပုံစံ စိတ်ကြိုက်ရွေးပါ
                </div>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">
                  ရွေးချယ်လိုက်သည့်အတိုင်း အောက်ပါ Preview တွင် ချက်ချင်းမြင်တွေ့နိုင်ပြီး ပြီးပါက &apos;သိမ်းဆည်းမည်&apos; ကို နှိပ်ပါ။
                </p>
              </div>

              {/* Mini Visual Subtitle Preview */}
              <div className="h-24 rounded-xl bg-gradient-to-b from-[#16161C] via-[#0B0B0E] to-[#141006] border border-[#F59E0B]/30 relative flex px-4 py-2.5 overflow-hidden">
                <div
                  className={`w-full text-center flex justify-center ${
                    subtitleStyle.position === "top"
                      ? "items-start"
                      : subtitleStyle.position === "center"
                      ? "items-center"
                      : "items-end"
                  }`}
                >
                  <span
                    className={`px-3 py-1 rounded-lg bg-black/75 border border-white/10 font-bold leading-snug ${
                      subtitleStyle.fontSize === "sm"
                        ? "text-xs"
                        : subtitleStyle.fontSize === "lg"
                        ? "text-base"
                        : "text-sm"
                    } ${
                      subtitleStyle.theme === "white_gold"
                        ? "text-white drop-shadow-[0_1px_4px_rgba(245,158,11,0.9)]"
                        : subtitleStyle.theme === "neon_amber"
                        ? "text-[#FFCA3A] drop-shadow-[0_0_8px_rgba(245,158,11,0.75)]"
                        : "text-[#FBBF24]"
                    }`}
                  >
                    နမူနာ မြန်မာစာတန်းထိုး — KKSRecap AI
                  </span>
                </div>
              </div>

              {/* Subtitle Theme */}
              <div>
                <label className="block text-xs font-semibold text-[#FBBF24] mb-1.5">
                  စာတန်းထိုး အရောင် (Color Theme)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "gold", label: "ရွှေရောင်ဆိုက်ဘာ" },
                    { id: "white_gold", label: "အဖြူ ရွှေကွပ်" },
                    { id: "neon_amber", label: "နီယွန် ရွှေဝါ" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          theme: t.id as "gold" | "white_gold" | "neon_amber",
                        }))
                      }
                      className={`min-h-[44px] py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer flex items-center justify-center ${
                        subtitleStyle.theme === t.id
                          ? "bg-[#F59E0B] text-black border-[#F59E0B]"
                          : "bg-[#18181B] border-white/10 text-[#D4D4D8]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size & Position */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#FBBF24] mb-1.5">
                    စာလုံးအရွယ် (Font Size)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "sm", label: "ပုံမှန်" },
                      { id: "md", label: "ကြီး" },
                      { id: "lg", label: "အကြီးဆုံး" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setSubtitleStyle((prev) => ({
                            ...prev,
                            fontSize: s.id as "sm" | "md" | "lg",
                          }))
                        }
                        className={`min-h-[44px] py-2 px-1.5 rounded-xl border text-xs font-semibold cursor-pointer flex items-center justify-center ${
                          subtitleStyle.fontSize === s.id
                            ? "bg-[#F59E0B] text-black border-[#F59E0B]"
                            : "bg-[#18181B] border-white/10 text-[#D4D4D8]"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#FBBF24] mb-1.5">
                    နေရာ (Position)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "bottom", label: "အောက်" },
                      { id: "center", label: "အလယ်" },
                      { id: "top", label: "ထိပ်" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setSubtitleStyle((prev) => ({
                            ...prev,
                            position: p.id as "bottom" | "center" | "top",
                          }))
                        }
                        className={`min-h-[44px] py-2 px-1.5 rounded-xl border text-xs font-semibold cursor-pointer flex items-center justify-center ${
                          subtitleStyle.position === p.id
                            ? "bg-[#F59E0B] text-black border-[#F59E0B]"
                            : "bg-[#18181B] border-white/10 text-[#D4D4D8]"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Compact Live Summary Strip */}
        <div className="mt-3 px-3 py-2 rounded-xl bg-[#121215] border border-white/10 text-[11px] text-[#A1A1AA] flex flex-wrap items-center justify-between gap-1.5 shrink-0">
          <span>
            <strong className="text-[#FBBF24]">ရွေးချယ်ထားမှု:</strong>{" "}
            {formatDurationBurmese(clipDuration)} · {aspectRatio} ·{" "}
            {audioMode === "original" ? "မူရင်းအသံ" : audioMode === "voiceover" ? "AI မြန်မာအသံ" : "ရောနှောအသံ"} ·{" "}
            {bypassCensorship ? "🛡️ ကာကွယ်မှု ON" : "🛡️ OFF"}
          </span>
        </div>

        {/* Step Navigation Footer */}
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            {settingsStep !== "api_key" && (
              <button
                type="button"
                onClick={() =>
                  setSettingsStep((prev) =>
                    prev === 1
                      ? "api_key"
                      : typeof prev === "number" && prev > 1
                      ? ((prev - 1) as SettingsWizardTab)
                      : "api_key"
                  )
                }
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#18181B] border border-white/10 hover:border-white/25 text-xs text-[#D4D4D8] flex items-center justify-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>အရှေ့သို့</span>
              </button>
            )}
            {settingsStep !== 4 && (
              <button
                type="button"
                onClick={onClose}
                className={`min-h-[44px] px-3 py-2 rounded-xl bg-[#141418] sm:bg-transparent text-xs text-[#A1A1AA] hover:text-white cursor-pointer flex items-center justify-center ${
                  settingsStep === "api_key" ? "col-span-2 sm:col-span-1" : ""
                }`}
              >
                သိမ်းပြီးပိတ်မည်
              </button>
            )}
          </div>

          {settingsStep !== 4 ? (
            <button
              type="button"
              onClick={() =>
                setSettingsStep((prev) =>
                  prev === "api_key"
                    ? 1
                    : typeof prev === "number" && prev < 4
                    ? ((prev + 1) as SettingsWizardTab)
                    : 4
                )
              }
              className="min-h-[46px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-black font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
            >
              <span>{settingsStep === "api_key" ? "Video Settings သို့" : "နောက်တစ်ဆင့်"}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-black font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
            >
              <Check className="w-4 h-4 text-black" />
              <span>ချိန်ညှိမှု သိမ်းဆည်းမည်</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
