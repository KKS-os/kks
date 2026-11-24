import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CLIPS_DIR,
  ROOT_DIR,
} from "./types.ts";
import type {
  CachedRecapResult,
  InputSourceType,
  RecapLanguage,
  RenderedClipResult,
  StructuredRecapSummary,
  SubtitleStyleOptions,
} from "./types.ts";

const DATA_DIR = path.resolve(ROOT_DIR, ".data");
const CACHE_FILE_PATH = path.resolve(DATA_DIR, "recap_cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 100;

interface PersistedCachePayload {
  version: number;
  entries: Array<[string, CachedRecapResult]>;
}

const memoryCache = new Map<string, CachedRecapResult>();
let cacheLoaded = false;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function isClipFileSafeAndPresent(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  const base = path.basename(filename);
  const resolved = path.resolve(CLIPS_DIR, base);
  if (!resolved.startsWith(CLIPS_DIR + path.sep)) return false;
  try {
    const stat = fs.statSync(resolved);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function pruneAndEnforceLimit(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (!entry || typeof entry.timestamp !== "number" || now - entry.timestamp > CACHE_TTL_MS) {
      memoryCache.delete(key);
    }
  }

  if (memoryCache.size <= MAX_CACHE_ENTRIES) return;

  const sortedByAge = Array.from(memoryCache.entries()).sort(
    (a, b) => a[1].timestamp - b[1].timestamp
  );
  const removeCount = memoryCache.size - MAX_CACHE_ENTRIES;
  for (let i = 0; i < removeCount; i++) {
    memoryCache.delete(sortedByAge[i][0]);
  }
}

function loadCacheOnce(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    if (!fs.existsSync(CACHE_FILE_PATH)) return;
    const raw = fs.readFileSync(CACHE_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PersistedCachePayload;
    if (!parsed || !Array.isArray(parsed.entries)) return;
    for (const item of parsed.entries) {
      if (
        Array.isArray(item) &&
        typeof item[0] === "string" &&
        item[1] &&
        typeof item[1].sourceTitle === "string" &&
        item[1].recapSummary &&
        Array.isArray(item[1].clips)
      ) {
        memoryCache.set(item[0], item[1]);
      }
    }
    pruneAndEnforceLimit();
  } catch (err) {
    console.warn("Recap cache load warning (starting fresh):", err);
  }
}

function persistCacheToDisk(): void {
  try {
    ensureDataDir();
    pruneAndEnforceLimit();
    const payload: PersistedCachePayload = {
      version: 1,
      entries: Array.from(memoryCache.entries()),
    };
    const tmpPath = `${CACHE_FILE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload), "utf-8");
    fs.renameSync(tmpPath, CACHE_FILE_PATH);
  } catch (err) {
    console.warn("Recap cache persist warning:", err);
  }
}

export function normalizeCanonicalUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      parsed.hash = "";
      return parsed.toString();
    }
  } catch {
    // Fall back cleanly to trimmed string
  }
  return trimmed;
}

export function normalizeCanonicalText(rawText: string): string {
  return rawText.trim().replace(/\r\n/g, "\n");
}

export function buildRecapCacheKey(params: {
  sourceType: InputSourceType;
  rawUrl: string;
  rawText: string;
  language?: RecapLanguage;
  aspectRatio: "9:16" | "16:9" | "1:1";
  audioMode: "original" | "voiceover" | "mix";
  clipDuration: number;
  framingMode: "blur_bg" | "crop_fill" | "letterbox";
  bypassCensorship: boolean;
  styleOptions: SubtitleStyleOptions;
}): { exactKey: string; contentKey: string } {
  const normUrl = normalizeCanonicalUrl(params.rawUrl);
  const normText = normalizeCanonicalText(params.rawText);
  const lang: RecapLanguage = params.language === "en" ? "en" : "my";

  const contentHash = crypto
    .createHash("sha256")
    .update(`${params.sourceType}::${lang}::${normUrl}::${normText}`)
    .digest("hex");

  const contentKey = `${params.sourceType}::${lang}::${contentHash}`;
  const exactKey = `${contentKey}::${params.aspectRatio}::${params.audioMode}::${params.clipDuration}::${params.framingMode}::${params.bypassCensorship}::${params.styleOptions.theme}::${params.styleOptions.fontSize}::${params.styleOptions.position}`;
  return { exactKey, contentKey };
}

export function getCachedRecapResult(keys: {
  exactKey: string;
  contentKey: string;
}): CachedRecapResult | null {
  loadCacheOnce();
  const now = Date.now();

  const tryValidateEntry = (key: string): CachedRecapResult | null => {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (now - entry.timestamp > CACHE_TTL_MS) {
      memoryCache.delete(key);
      persistCacheToDisk();
      return null;
    }
    const allClipsValid =
      Array.isArray(entry.clips) &&
      entry.clips.length > 0 &&
      entry.clips.every((c) => isClipFileSafeAndPresent(c.filename));
    if (!allClipsValid) {
      memoryCache.delete(key);
      persistCacheToDisk();
      return null;
    }
    return entry;
  };

  return tryValidateEntry(keys.exactKey);
}

export function setCachedRecapResult(
  keys: { exactKey: string; contentKey: string },
  payload: {
    sourceTitle: string;
    recapSummary: StructuredRecapSummary;
    clips: RenderedClipResult[];
  }
): void {
  loadCacheOnce();
  const entry: CachedRecapResult = {
    sourceTitle: payload.sourceTitle,
    recapSummary: payload.recapSummary,
    clips: payload.clips,
    timestamp: Date.now(),
  };
  memoryCache.set(keys.exactKey, entry);
  persistCacheToDisk();
}

export function getRecapCacheStats(): { count: number; ttlHours: number } {
  loadCacheOnce();
  pruneAndEnforceLimit();
  return {
    count: memoryCache.size,
    ttlHours: Math.round(CACHE_TTL_MS / (60 * 60 * 1000)),
  };
}
