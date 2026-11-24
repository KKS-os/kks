import { useEffect, useMemo, useState } from "react";
import {
  BookmarkPlus,
  Clock,
  FileAudio,
  FileText,
  History,
  Play,
  Search,
  Sparkles,
  Trash2,
  X,
  Youtube,
  Zap,
} from "lucide-react";
import type { InputSourceTab } from "./types";
import {
  formatRelativeTimeBurmese,
  searchRecapHistory,
} from "../utils/recapHistory";
import type { RecapHistoryEntry } from "../utils/recapHistory";

interface RecapHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  items: RecapHistoryEntry[];
  activeHistoryId: string | null;
  canSaveCurrentRecap: boolean;
  onSelectItem: (item: RecapHistoryEntry) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onSaveCurrentRecap: () => void;
}

const SOURCE_BADGE_MAP: Record<
  InputSourceTab,
  { label: string; icon: typeof Youtube; colorClass: string }
> = {
  youtube: {
    label: "YouTube / Link",
    icon: Youtube,
    colorClass: "text-[#FBBF24] bg-[#181406] border-[#F59E0B]/35",
  },
  text_article: {
    label: "စာသား / ဆောင်းပါး",
    icon: FileText,
    colorClass: "text-sky-300 bg-sky-950/50 border-sky-400/35",
  },
  media_upload: {
    label: "File Upload",
    icon: FileAudio,
    colorClass: "text-emerald-300 bg-emerald-950/50 border-emerald-400/35",
  },
};

export function RecapHistorySidebar({
  isOpen,
  onClose,
  items,
  activeHistoryId,
  canSaveCurrentRecap,
  onSelectItem,
  onDeleteItem,
  onClearAll,
  onSaveCurrentRecap,
}: RecapHistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterType, setFilterType] = useState<InputSourceTab | "all">("all");
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmClearAll(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredItems = useMemo(
    () => searchRecapHistory(items, searchQuery, filterType),
    [items, searchQuery, filterType]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end print:hidden font-burmese"
      role="dialog"
      aria-modal="true"
      aria-label="Recap History Sidebar"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
      />

      {/* Slide-over Sidebar Panel */}
      <aside className="relative z-10 w-full max-w-md h-full bg-[#09090C] border-l border-[#F59E0B]/35 shadow-[-20px_0_60px_rgba(0,0,0,0.9)] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-[#0D0D12]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#181406] border border-[#F59E0B]/45 flex items-center justify-center text-[#F59E0B] shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-[#FFF2B2] truncate">
                  Recap History
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums bg-[#181406] border border-[#F59E0B]/40 text-[#FBBF24]">
                  {items.length}
                </span>
              </div>
              <p className="text-[11px] text-[#A1A1AA] truncate">
                AI ထပ်မသုံးဘဲ သိမ်းဆည်းပြီးသား အနှစ်ချုပ်များ ပြန်ကြည့်ရန်
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-[#141418] border border-white/10 hover:border-[#F59E0B]/50 text-[#A1A1AA] hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Close Recap History"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="p-4 border-b border-white/10 space-y-3 bg-[#0B0B0F]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#A1A1AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ခေါင်းစဉ်၊ စာသား သို့မဟုတ် URL ဖြင့် ရှာဖွေရန်..."
              aria-label="Search past recaps"
              className="w-full min-h-[44px] pl-10 pr-11 py-2 rounded-xl bg-[#121216] border border-white/15 focus:border-[#F59E0B] focus:outline-none text-base sm:text-sm text-[#F4F4F6] placeholder-[#71717A]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white cursor-pointer flex items-center justify-center"
                aria-label="Clear search query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid grid-cols-4 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {(
                [
                  { id: "all", label: "အားလုံး" },
                  { id: "youtube", label: "YouTube" },
                  { id: "text_article", label: "စာ/URL" },
                  { id: "media_upload", label: "File" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`min-h-[44px] sm:min-h-[34px] px-2 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center ${
                    filterType === tab.id
                      ? "bg-[#F59E0B] text-black"
                      : "bg-[#141418] text-[#A1A1AA] border border-white/10 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {items.length > 0 && (
              <div>
                {confirmClearAll ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onClearAll();
                        setConfirmClearAll(false);
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      အားလုံးဖျက်မည်
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[#18181B] text-[#A1A1AA] hover:text-white text-xs cursor-pointer"
                    >
                      မလုပ်တော့ပါ
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="min-h-[44px] sm:min-h-[34px] px-2 text-xs text-red-400/90 hover:text-red-300 underline-offset-2 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}
          </div>

          {canSaveCurrentRecap && (
            <button
              type="button"
              onClick={onSaveCurrentRecap}
              className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-[#181406] border border-[#F59E0B]/40 hover:border-[#F59E0B] text-xs font-semibold text-[#FBBF24] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <BookmarkPlus className="w-4 h-4 shrink-0" />
              <span>လက်ရှိပြသထားသော Recap ကို မှတ်တမ်းထဲ သိမ်းဆည်းမည်</span>
            </button>
          )}
        </div>

        {/* History Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="py-14 px-4 text-center space-y-2.5 border border-dashed border-white/10 rounded-2xl bg-[#0D0D12]/60">
              <History className="w-8 h-8 text-[#F59E0B]/60 mx-auto" />
              <div className="text-sm font-semibold text-[#E4E4E7]">
                {items.length === 0
                  ? "သိမ်းဆည်းထားသော Recap မှတ်တမ်း မရှိသေးပါ"
                  : "ရှာဖွေမှုနှင့် ကိုက်ညီသော Recap မတွေ့ရှိပါ"}
              </div>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                {items.length === 0
                  ? "YouTube, စာသား/ဆောင်းပါး URL သို့မဟုတ် File ဖြင့် Recap အသစ်ဖန်တီးလိုက်သည်နှင့် ဤနေရာတွင် အလိုအလျောက် သိမ်းဆည်းပေးပါမည်။"
                  : "တခြားသော စာလုံးဖြင့် ရှာဖွေကြည့်ပါ သို့မဟုတ် Filter ကို ပြန်ဖြုတ်ပါ။"}
              </p>
              {(searchQuery || filterType !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterType("all");
                  }}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-[#181406] border border-[#F59E0B]/40 text-xs text-[#FBBF24] cursor-pointer"
                >
                  Filter အားလုံး ရှင်းလင်းမည်
                </button>
              )}
            </div>
          ) : (
            filteredItems.map((item) => {
              const badge = SOURCE_BADGE_MAP[item.sourceType] || SOURCE_BADGE_MAP.youtube;
              const BadgeIcon = badge.icon;
              const isActive = activeHistoryId === item.id;
              const clipDuration = item.clips[0]?.durationSec;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectItem(item);
                    }
                  }}
                  className={`group rounded-2xl p-3.5 border transition-all cursor-pointer space-y-2.5 ${
                    isActive
                      ? "bg-[#181406]/90 border-[#F59E0B] shadow-[0_0_24px_rgba(245,158,11,0.18)]"
                      : "bg-[#111116] border-white/10 hover:border-[#F59E0B]/50 hover:bg-[#15151C]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${badge.colorClass}`}
                      >
                        <BadgeIcon className="w-3 h-3 shrink-0" />
                        <span>{badge.label}</span>
                      </span>

                      {item.cachedHit && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/35 text-[10px] text-emerald-300 font-semibold">
                          <Zap className="w-2.5 h-2.5" />
                          <span>Cached</span>
                        </span>
                      )}

                      {clipDuration && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-mono tabular-nums text-[#D4D4D8]">
                          {clipDuration}s
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem(item.id);
                      }}
                      title="ဤမှတ်တမ်းကို ဖျက်ရန်"
                      aria-label={`Delete ${item.recapSummary.title}`}
                      className="min-h-[44px] min-w-[44px] -mt-1 -mr-1 p-2 rounded-xl text-[#71717A] hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#FFF2B2] line-clamp-2 burmese-heading">
                      {item.recapSummary.title || item.sourceTitle}
                    </h3>
                    <p className="mt-1 text-[11px] text-[#D4D4D8] line-clamp-2 burmese-body leading-[1.85]">
                      {item.recapSummary.executiveSummary}
                    </p>
                  </div>

                  {item.sourceLabel && (
                    <div className="text-[10px] text-[#71717A] truncate font-mono">
                      {item.sourceLabel}
                    </div>
                  )}

                  <div className="pt-1 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-[#A1A1AA]">
                      <Clock className="w-3 h-3 text-[#F59E0B]/80" />
                      <span>{formatRelativeTimeBurmese(item.createdAt)}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[#FBBF24]/90 max-w-[130px] truncate">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.recapSummary.sentimentOrTone}</span>
                      </span>

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F59E0B]/15 border border-[#F59E0B]/35 text-[#FBBF24] font-semibold group-hover:bg-[#F59E0B] group-hover:text-black transition-colors">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>ကြည့်ရန်</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
