import { History, KeyRound, Settings, ShieldCheck, Smartphone } from "lucide-react";
import type { DemoQuotaStatus, SettingsWizardTab } from "./types";

interface StudioHeaderProps {
  isAppInstalled: boolean;
  historyCount: number;
  hasPersonalApiKey: boolean;
  demoQuota: DemoQuotaStatus;
  onInstallApp: () => void;
  onOpenHistory: () => void;
  onOpenSettings: (step?: SettingsWizardTab) => void;
}

export function StudioHeader({
  isAppInstalled,
  historyCount,
  hasPersonalApiKey,
  demoQuota,
  onInstallApp,
  onOpenHistory,
  onOpenSettings,
}: StudioHeaderProps) {
  const isQuotaDepleted = !hasPersonalApiKey && demoQuota.demoRemaining <= 0;

  return (
    <>
      {/* TOP APP BAR: Ultra-Compact Single-Row Sticky Mobile Header + Full Desktop Bar */}
      <div className="sticky top-0 z-30 -mx-3 px-3 sm:mx-0 sm:px-0 sm:static h-14 sm:h-auto sm:pt-3 sm:pb-3 flex items-center justify-between gap-2 sm:gap-3 text-xs bg-[#07070B]/88 sm:bg-transparent backdrop-blur-xl sm:backdrop-blur-none border-b border-white/[0.08] sm:border-[#F59E0B]/20 text-[#A1A1AA] font-burmese">
        {/* Left: Brand Title + Compact Quota Pill */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-base shrink-0">👑</span>
            <span className="tracking-tight sm:tracking-wide text-sm font-bold text-white whitespace-nowrap truncate sm:hidden">
              KKSRecap AI
            </span>
            <span className="tracking-wide text-sm font-bold text-white whitespace-nowrap hidden sm:inline">
              KKSRecap AI Studio
            </span>
            <span className="text-[#A1A1AA] hidden md:inline shrink-0">· Movie Recap & Auto-Cut</span>
          </div>

          <button
            type="button"
            onClick={() => onOpenSettings("api_key")}
            className="min-h-[44px] sm:min-h-[38px] inline-flex items-center shrink-0 cursor-pointer group"
            title="Gemini API Key စီမံခန့်ခွဲရန် နှိပ်ပါ"
          >
            {/* Mobile Tiny Pill Badge */}
            <span
              className={`sm:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-tight whitespace-nowrap tabular-nums transition-colors ${
                hasPersonalApiKey
                  ? "bg-[#092117] border-emerald-500/50 text-emerald-300"
                  : isQuotaDepleted
                  ? "bg-[#2A1014] border-red-500/55 text-red-300"
                  : "bg-[#181406] border-[#F59E0B]/45 text-[#FBBF24]"
              }`}
            >
              {hasPersonalApiKey ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Pro Key</span>
                </>
              ) : (
                <span>
                  {demoQuota.demoRemaining}/{demoQuota.demoLimit} Free
                </span>
              )}
            </span>

            {/* Desktop Full Quota Badge */}
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                hasPersonalApiKey
                  ? "bg-[#092117] border-emerald-500/50 text-emerald-300 group-hover:border-emerald-400"
                  : isQuotaDepleted
                  ? "bg-[#2A1014] border-red-500/55 text-red-300 group-hover:border-red-400"
                  : "bg-[#181406] border-[#F59E0B]/45 text-[#FBBF24] group-hover:border-[#FBBF24]"
              }`}
            >
              {hasPersonalApiKey ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Unlimited Mode (Personal API Key Active)</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 shrink-0" />
                  <span>
                    Free Demo Mode ({demoQuota.demoRemaining}/{demoQuota.demoLimit} left today)
                  </span>
                </>
              )}
            </span>
          </button>
        </div>

        {/* Right Mobile: Clean Icon-Only Action Buttons */}
        <div className="flex sm:hidden items-center gap-1 shrink-0">
          {!isAppInstalled && (
            <button
              type="button"
              onClick={onInstallApp}
              aria-label="App ထည့်သွင်းမည်"
              title="App ထည့်သွင်းမည်"
              className="min-h-[44px] min-w-[44px] rounded-xl text-[#FBBF24] hover:bg-white/[0.06] active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            >
              <Smartphone className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenSettings(1)}
            aria-label="Settings ဖွင့်မည်"
            title="Settings"
            className="min-h-[44px] min-w-[44px] rounded-xl text-[#E4E4E7] hover:text-[#FBBF24] hover:bg-white/[0.06] active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Right Desktop: Full Action Buttons */}
        <div className="hidden sm:flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenHistory}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#181406] border border-[#F59E0B]/40 hover:border-[#FBBF24] text-xs font-medium text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="သိမ်းဆည်းထားသော Recap History များ ကြည့်ရှုရန်"
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Recap History</span>
            {historyCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#F59E0B] text-black text-[10px] font-bold font-mono tabular-nums shrink-0">
                {historyCount}
              </span>
            )}
          </button>

          {!isAppInstalled && (
            <button
              type="button"
              onClick={onInstallApp}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#18181B] border border-[#F59E0B]/30 hover:border-[#FBBF24] text-xs font-medium text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              title="ဖုန်း သို့မဟုတ် ကွန်ပျူတာတွင် App အဖြစ် ထည့်သွင်းရန်"
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>App ထည့်သွင်းမည်</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenSettings(1)}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#18181B] border border-white/15 hover:border-[#F59E0B] text-xs font-medium text-[#FBBF24] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings (တဆင့်ချင်း)</span>
          </button>
        </div>
      </div>

      {/* ၁။ APP HEADER (Desktop / Tablet Only so Mobile opens straight into Studio Card) */}
      <header className="hidden sm:block pt-8 pb-7 text-center relative">
        <h1
          className="font-display-gold font-bold tracking-tight text-3xl sm:text-4xl lg:text-[2.6rem] leading-tight bg-gradient-to-b from-[#FFF5C0] via-[#FBBF24] to-[#D97706] bg-clip-text text-transparent mx-auto max-w-4xl px-1"
          style={{ textWrap: "balance" }}
        >
          KKSRecap AI — Movie Recap & Auto-Cut Studio
        </h1>
        <p className="mt-2.5 text-sm text-[#D4D4D8] font-burmese max-w-2xl mx-auto leading-relaxed px-1">
          မည်သည့် ဗီဒီယို Link သို့မဟုတ် ဖိုင်ကိုမဆို ထည့်သွင်းရုံဖြင့် မူရင်းအသံထွက်နှင့် မြန်မာစာတန်းထိုး Hard-coded ပါဝင်သော Viral Movie Recap MP4 အဖြစ် ချက်ချင်း အလိုအလျောက် ဖြတ်ထုတ်ပေးပါသည်
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-xs text-[#A1A1AA] font-burmese px-1">
          <span className="text-[#FBBF24]">⚡ 1-Click Auto-Cut</span>
          <span aria-hidden="true" className="text-white/20">·</span>
          <span>🎬 မြန်မာစာတန်းထိုး Hard-coded MP4</span>
          <span aria-hidden="true" className="text-white/20">·</span>
          <span>🛡️ Anti-Copyright</span>
          <span aria-hidden="true" className="text-white/20">·</span>
          <span className="text-[#10B981]">✨ ၁၀၀% အခမဲ့</span>
        </div>
      </header>
    </>
  );
}
