const USER_GEMINI_API_KEY_STORAGE = "kks_user_gemini_api_key";

export function isValidClientGeminiApiKey(rawKey?: string | null): boolean {
  if (!rawKey || typeof rawKey !== "string") return false;
  const trimmed = rawKey.trim();
  if (trimmed === "MY_GEMINI_API_KEY") return false;
  if (trimmed.length < 20 || trimmed.length > 160) return false;
  return /^[A-Za-z0-9_-]{20,160}$/.test(trimmed);
}

export function loadUserGeminiApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(USER_GEMINI_API_KEY_STORAGE) || "";
    const trimmed = raw.trim();
    return isValidClientGeminiApiKey(trimmed) ? trimmed : "";
  } catch {
    return "";
  }
}

export function saveUserGeminiApiKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (!isValidClientGeminiApiKey(trimmed)) {
    throw new Error(
      "Gemini API Key ပုံစံ မမှန်ကန်ပါ။ Google AI Studio မှ ရရှိသော AIza... Key အပြည့်အစုံကို ထည့်သွင်းပေးပါ။"
    );
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(USER_GEMINI_API_KEY_STORAGE, trimmed);
    } catch {
      // Ignore storage quota issues
    }
  }
  return trimmed;
}

export function clearUserGeminiApiKey(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(USER_GEMINI_API_KEY_STORAGE);
    } catch {
      // Ignore
    }
  }
}

export function maskGeminiApiKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 10) return "••••••••";
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}

export function getGeminiKeyHeaders(): Record<string, string> {
  const key = loadUserGeminiApiKey();
  return key ? { "x-gemini-api-key": key } : {};
}

export function getApiBaseUrl(): string {
  try {
    const envBase = String((import.meta as any).env?.VITE_API_BASE_URL || "").trim();
    return envBase.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getApiBaseUrl();
  if (!base) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${normalizedPath}`;
}
