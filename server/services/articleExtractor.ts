import dns from "node:dns/promises";
import net from "node:net";
import type { SourceMediaInfo } from "./types.ts";
import {
  createGoldCyberBackdrop,
  ensureCinematicBaseVideo,
  probeMediaFile,
} from "./mediaExtractor.ts";

function isPrivateOrBlockedIp(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();
  if (!normalized) return true;

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
  if (normalized.startsWith("::ffff:")) {
    return isPrivateOrBlockedIp(normalized.slice(7));
  }

  if (net.isIPv4(normalized)) {
    const parts = normalized.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }

  if (net.isIPv6(normalized)) {
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff")
    ) {
      return true;
    }
    return false;
  }

  return true;
}

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("မှန်ကန်သော ဆောင်းပါး URL (http/https) ထည့်သွင်းပေးပါ။");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("http:// သို့မဟုတ် https:// Link များကိုသာ လက်ခံပါသည်။");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    throw new Error("လုံခြုံရေးအရ Local သို့မဟုတ် Private Server Link များကို ဝင်ရောက်ခွင့် မပြုပါ။");
  }

  if (net.isIP(host)) {
    if (isPrivateOrBlockedIp(host)) {
      throw new Error("Private IP Address Link များကို ဝင်ရောက်ခွင့် မပြုပါ။");
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (!records || records.length === 0) {
      throw new Error("Domain အမည်ကို ရှာမတွေ့ပါ (DNS lookup failed)။");
    }
    for (const rec of records) {
      if (isPrivateOrBlockedIp(rec.address)) {
        throw new Error("လုံခြုံရေးအရ Private Network IP သို့ ညွှန်ပြနေသော Link ကို ခွင့်မပြုပါ။");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("လုံခြုံရေး")) {
      throw err;
    }
    // Allow hostname through only if strictly public syntax and fetch handles DNS failure cleanly
  }

  return parsed;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 1114111 ? String.fromCodePoint(code) : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function extractReadableHtmlContent(html: string): {
  title: string;
  author: string;
  description: string;
  bodyText: string;
} {
  const ogTitle =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    "";

  const author =
    html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    "";

  const description =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    "";

  // Prefer <article> or <main> container when substantial
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const rawSegment =
    articleMatch && articleMatch.length > 400
      ? articleMatch
      : mainMatch && mainMatch.length > 400
      ? mainMatch
      : html;

  const stripped = rawSegment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<\/(p|div|h1|h2|h3|h4|li|blockquote|section|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = stripped
    .split(/\r?\n/)
    .map((line) => decodeHtmlEntities(line))
    .filter((line) => line.length > 24);

  const bodyText = lines.join("\n").slice(0, 24000);

  return {
    title: decodeHtmlEntities(ogTitle),
    author: decodeHtmlEntities(author),
    description: decodeHtmlEntities(description),
    bodyText,
  };
}

async function fetchArticleHtmlSafely(rawUrl: string): Promise<{
  finalUrl: string;
  contentType: string;
  text: string;
}> {
  let currentUrl = await assertSafePublicHttpUrl(rawUrl);

  for (let hop = 0; hop < 4; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(currentUrl.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        const nextUrl = new URL(location, currentUrl);
        currentUrl = await assertSafePublicHttpUrl(nextUrl.toString());
        continue;
      }

      if (!res.ok || !res.body) {
        throw new Error(`ဆောင်းပါး Link ကို ဖတ်ရှု၍မရပါ (HTTP ${res.status})။`);
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      const maxBytes = 2 * 1024 * 1024;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }

      return {
        finalUrl: currentUrl.toString(),
        contentType,
        text: Buffer.concat(chunks).toString("utf-8"),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("ဆောင်းပါး URL Redirect အကြိမ်ရေ များလွန်းသဖြင့် ဖတ်ရှု၍မရပါ။");
}

export async function extractArticleSourceMedia(
  input: { articleUrl?: string; rawText?: string; targetDurationSec?: number },
  jobDir: string
): Promise<SourceMediaInfo> {
  const rawText = String(input.rawText || "").trim();
  const articleUrl = String(input.articleUrl || "").trim();

  let title = "စာသားနှင့် ဆောင်းပါး အနှစ်ချုပ်";
  let author = "KKS Article Reader";
  let description = "";
  let articleText = rawText;
  let normalizedUrl = "https://kks.studio/text-input";

  if (articleUrl) {
    const fetched = await fetchArticleHtmlSafely(articleUrl);
    normalizedUrl = fetched.finalUrl;

    if (fetched.contentType.includes("text/plain") || fetched.contentType.includes("text/markdown")) {
      const plain = fetched.text.trim().slice(0, 24000);
      if (plain.length < 30 && !rawText) {
        throw new Error("ဆောင်းပါးစာသား အလုံအလောက် ဖတ်ရှု၍မရပါ။ Raw Text ဖြင့် ထည့်သွင်းစမ်းသပ်ကြည့်ပါ။");
      }
      const firstLine = plain.split(/\r?\n/)[0]?.trim() || "";
      if (firstLine.length > 4 && firstLine.length < 120) {
        title = firstLine;
      }
      articleText = rawText ? `${rawText}\n\n${plain}` : plain;
    } else {
      const parsed = extractReadableHtmlContent(fetched.text);
      if (parsed.title) title = parsed.title;
      if (parsed.author) author = parsed.author;
      if (parsed.description) description = parsed.description;

      const combined = rawText
        ? `${rawText}\n\n${parsed.bodyText || parsed.description}`
        : parsed.bodyText || parsed.description;

      if (!combined || combined.trim().length < 25) {
        throw new Error(
          "ဤဝဘ်ဆိုက် စာမျက်နှာမှ ဆောင်းပါးစာသားကို တိုက်ရိုက် ဖတ်ရှု၍မရပါ။ စာသားများကို Copy ယူ၍ 'Raw Text' တွင် ထည့်သွင်းပေးပါ။"
        );
      }
      articleText = combined.trim().slice(0, 24000);
    }
  } else {
    if (rawText.length < 20) {
      throw new Error("ကျေးဇူးပြု၍ အနည်းဆုံး စာလုံး ၂၀ ခန့်ပါဝင်သော စာသား သို့မဟုတ် ဆောင်းပါး Link ထည့်သွင်းပေးပါ။");
    }
    const firstSentence = rawText.split(/[\n.။!?]/)[0]?.trim() || "";
    if (firstSentence.length >= 6) {
      title = firstSentence.slice(0, 80);
    }
    description = rawText.slice(0, 260);
    articleText = rawText.slice(0, 24000);
  }

  const baseVideo = await ensureCinematicBaseVideo();
  const probed = await probeMediaFile(baseVideo);
  const framePaths: string[] = [];
  for (let i = 0; i < 3; i++) {
    framePaths.push(await createGoldCyberBackdrop(jobDir, i));
  }

  const cappedReelDuration = Math.min(30, Math.max(8, Math.round(input.targetDurationSec || 18)));

  return {
    normalizedUrl,
    platform: articleUrl ? "Article_URL" : "Raw_Text",
    youtubeId: null,
    title,
    author,
    description: description || articleText.slice(0, 240),
    sourceVideoPath: baseVideo,
    videoDurationSec: Math.min(probed?.durationSec || 30, cappedReelDuration),
    hasAudio: probed?.hasAudio ?? true,
    hasVideo: true,
    framePaths,
    sourceType: "text_article",
    articleText,
  };
}
