import { History, KeyRound, Sparkles } from "lucide-react";

interface MobileBottomNavProps {
  activeView: "studio" | "history" | "settings";
  historyCount: number;
  hasPersonalApiKey: boolean;
  onSelectStudio: () => void;
  onSelectHistory: () => void;
  onSelectSettings: () => void;
}

export function MobileBottomNav({
  activeView,
  historyCount,
  hasPersonalApiKey,
  onSelectStudio,
  onSelectHistory,
  onSelectSettings,
}: MobileBottomNavProps) {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="print:hidden md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090D]/92 backdrop-blur-xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.65)]"
    >
      <div className="grid grid-cols-3 items-center h-14 max-w-lg mx-auto px-2 gap-1">
        <button
          type="button"
          onClick={onSelectStudio}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
            activeView === "studio"
              ? "text-[#FBBF24]"
              : "text-[#8E8E9A] hover:text-[#E4E4E7]"
          }`}
        >
          <Sparkles className="w-5 h-5 shrink-0" />
          <span className="text-[11px] font-medium leading-none tracking-tight whitespace-nowrap">
            Studio
          </span>
        </button>

        <button
          type="button"
          onClick={onSelectHistory}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer relative ${
            activeView === "history"
              ? "text-[#FBBF24]"
              : "text-[#8E8E9A] hover:text-[#E4E4E7]"
          }`}
        >
          <div className="relative flex items-center justify-center">
            <History className="w-5 h-5 shrink-0" />
            {historyCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#F59E0B] text-black text-[9px] font-bold font-mono tabular-nums flex items-center justify-center leading-none">
                {historyCount > 99 ? "99+" : historyCount}
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium leading-none tracking-tight whitespace-nowrap">
            History
          </span>
        </button>

        <button
          type="button"
          onClick={onSelectSettings}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
            activeView === "settings"
              ? "text-[#FBBF24]"
              : "text-[#8E8E9A] hover:text-[#E4E4E7]"
          }`}
        >
          <KeyRound
            className={`w-5 h-5 shrink-0 ${
              hasPersonalApiKey && activeView !== "settings" ? "text-emerald-400" : ""
            }`}
          />
          <span className="text-[11px] font-medium leading-none tracking-tight whitespace-nowrap">
            API Key
          </span>
        </button>
      </div>
    </nav>
  );
}
