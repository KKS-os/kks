import type {
  ClipItem,
  InputSourceTab,
  StructuredRecapSummary,
} from "../components/types";

export interface RecapHistoryEntry {
  id: string;
  createdAt: number;
  sourceType: InputSourceTab;
  sourceLabel: string;
  sourceTitle: string;
  recapSummary: StructuredRecapSummary;
  clips: ClipItem[];
  cachedHit?: boolean;
}

const HISTORY_STORAGE_KEY = "kks_recap_history_v1";
const MAX_HISTORY_ENTRIES = 40;

function isValidEntry(raw: unknown): raw is RecapHistoryEntry {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Record<string, unknown>;
  const summary = candidate.recapSummary as Record<string, unknown> | undefined;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.sourceTitle === "string" &&
    Boolean(summary) &&
    typeof summary?.title === "string" &&
    typeof summary?.executiveSummary === "string" &&
    Array.isArray(summary?.keyTakeaways) &&
    Array.isArray(summary?.timeline) &&
    Array.isArray(candidate.clips)
  );
}

function writeHistoryStorage(items: RecapHistoryEntry[]): RecapHistoryEntry[] {
  if (typeof window === "undefined" || !window.localStorage) return items;
  let bounded = items.slice(0, MAX_HISTORY_ENTRIES);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(bounded));
      return bounded;
    } catch {
      // Trim oldest items if browser localStorage quota is nearly full
      if (bounded.length <= 1) break;
      bounded = bounded.slice(0, Math.max(1, Math.floor(bounded.length * 0.7)));
    }
  }
  return bounded;
}

export function loadRecapHistory(): RecapHistoryEntry[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveRecapToHistory(input: {
  sourceType: InputSourceTab;
  sourceLabel: string;
  sourceTitle: string;
  recapSummary: StructuredRecapSummary;
  clips: ClipItem[];
  cachedHit?: boolean;
}): { items: RecapHistoryEntry[]; savedEntry: RecapHistoryEntry } {
  const existing = loadRecapHistory();
  const normalizedLabel = input.sourceLabel.trim().slice(0, 180);
  const normalizedTitle = input.recapSummary.title.trim();

  // Deduplicate identical source + recap title so repeated/cached runs float cleanly to top
  const filtered = existing.filter(
    (item) =>
      !(
        item.sourceType === input.sourceType &&
        item.sourceLabel === normalizedLabel &&
        item.recapSummary.title.trim() === normalizedTitle
      )
  );

  const savedEntry: RecapHistoryEntry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    sourceType: input.sourceType,
    sourceLabel: normalizedLabel || input.sourceTitle,
    sourceTitle: input.sourceTitle,
    recapSummary: input.recapSummary,
    clips: input.clips,
    cachedHit: input.cachedHit,
  };

  const next = writeHistoryStorage([savedEntry, ...filtered]);
  return { items: next, savedEntry };
}

export function deleteRecapHistoryItem(id: string): RecapHistoryEntry[] {
  const current = loadRecapHistory();
  const next = current.filter((item) => item.id !== id);
  return writeHistoryStorage(next);
}

export function clearRecapHistory(): RecapHistoryEntry[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  return [];
}

export function searchRecapHistory(
  items: RecapHistoryEntry[],
  query: string,
  filterType: InputSourceTab | "all" = "all"
): RecapHistoryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) => {
    if (filterType !== "all" && item.sourceType !== filterType) {
      return false;
    }
    if (!normalizedQuery) return true;

    const searchableFields = [
      item.sourceTitle,
      item.sourceLabel,
      item.recapSummary.title,
      item.recapSummary.executiveSummary,
      item.recapSummary.sentimentOrTone,
      ...item.recapSummary.keyTakeaways,
      ...item.recapSummary.timeline.map((t) => `${t.timestamp} ${t.event}`),
    ];

    return searchableFields.some((field) =>
      String(field || "").toLowerCase().includes(normalizedQuery)
    );
  });
}

export function formatRelativeTimeBurmese(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "ယခုလေးတင်";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} မိနစ်အကြာက`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} နာရီအကြာက`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ရက်အကြာက`;
  try {
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return "";
  }
}
