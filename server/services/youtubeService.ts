import fs from "node:fs";
import path from "node:path";
import type { SourceMediaInfo, TranscriptSegment } from "./types.ts";
import {
  createGoldCyberBackdrop,
  decodeHtmlEntities,
  ensureCinematicBaseVideo,
  extractSourceMedia,
  extractYouTubeId,
  normalizeUserUrl,
  probeMediaFile,
} from "./mediaExtractor.ts";

interface YouTubeMetadataAndTranscript {
  youtubeId: string;
  canonicalUrl: string;
  title: string;
  author: string;
  description: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  transcriptText: string;
  transcriptSegments: TranscriptSegment[];
}

function formatTranscriptTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function extractBalancedJsonObject(source: string, markerIndex: number): string | null {
  const start = source.indexOf("{", markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length && i < start + 1_500_000; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

async function fetchTimedTextSegments(trackUrl: string): Promise<TranscriptSegment[]> {
  const parsed = new URL(trackUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return [];

  // Prefer JSON3 for crisp millisecond timing
  const jsonUrl = new URL(parsed.toString());
  jsonUrl.searchParams.set("fmt", "json3");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(jsonUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    if (res.ok) {
      const json: any = await res.json();
      const events = Array.isArray(json?.events) ? json.events : [];
      const segments: TranscriptSegment[] = [];
      for (const ev of events) {
        if (!Array.isArray(ev?.segs)) continue;
        const text = ev.segs
          .map((s: any) => String(s?.utf8 || ""))
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (!text || text === "\n") continue;
        const startSec = Number(ev.tStartMs || 0) / 1000;
        const durationSec = Math.max(0.5, Number(ev.dDurationMs || 2500) / 1000);
        segments.push({ startSec, durationSec, text });
      }
      if (segments.length > 0) return segments;
    }
  } catch {
    // Fallback to XML caption parsing below
  } finally {
    clearTimeout(timer);
  }

  // Fallback to default XML caption format
  const xmlCtrl = new AbortController();
  const xmlTimer = setTimeout(() => xmlCtrl.abort(), 7000);
  try {
    const res = await fetch(parsed.toString(), { signal: xmlCtrl.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    const segments: TranscriptSegment[] = [];
    const regex = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null) {
      const startSec = Number(match[1] || 0);
      const durationSec = Number(match[2] || 2.5);
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        segments.push({ startSec, durationSec, text });
      }
    }
    return segments;
  } catch {
    return [];
  } finally {
    clearTimeout(xmlTimer);
  }
}

export async function extractYouTubeMetadataAndTranscript(
  youtubeId: string
): Promise<YouTubeMetadataAndTranscript> {
  const canonicalUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  let title = "";
  let author = "";
  let description = "";
  let durationSec: number | null = null;
  let thumbnailUrl: string | null = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  let transcriptSegments: TranscriptSegment[] = [];

  // 1. Fetch Watch HTML for ytInitialPlayerResponse (metadata + captions tracklist)
  const watchCtrl = new AbortController();
  const watchTimer = setTimeout(() => watchCtrl.abort(), 9000);
  try {
    const watchRes = await fetch(canonicalUrl, {
      signal: watchCtrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,my;q=0.8",
      },
    });
    if (watchRes.ok) {
      const html = await watchRes.text();
      const marker = html.indexOf("ytInitialPlayerResponse");
      if (marker !== -1) {
        const jsonRaw = extractBalancedJsonObject(html, marker);
        if (jsonRaw) {
          try {
            const playerResp: any = JSON.parse(jsonRaw);
            const details = playerResp?.videoDetails;
            if (details) {
              if (details.title) title = String(details.title);
              if (details.author) author = String(details.author);
              if (details.shortDescription) {
                description = String(details.shortDescription).slice(0, 1200);
              }
              if (details.lengthSeconds) {
                const parsedLen = Number(details.lengthSeconds);
                if (Number.isFinite(parsedLen) && parsedLen > 0) {
                  durationSec = parsedLen;
                }
              }
              const thumbs = details.thumbnail?.thumbnails;
              if (Array.isArray(thumbs) && thumbs.length > 0) {
                const best = thumbs[thumbs.length - 1];
                if (typeof best?.url === "string") {
                  thumbnailUrl = best.url;
                }
              }
            }

            const tracks =
              playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(tracks) && tracks.length > 0) {
              const preferredTrack =
                tracks.find((t: any) => t?.languageCode === "my") ||
                tracks.find((t: any) => t?.languageCode === "en" && t?.kind !== "asr") ||
                tracks.find((t: any) => String(t?.languageCode || "").startsWith("en")) ||
                tracks[0];
              if (typeof preferredTrack?.baseUrl === "string") {
                transcriptSegments = await fetchTimedTextSegments(preferredTrack.baseUrl);
              }
            }
          } catch {
            // Fall through to HTML meta tags / oEmbed
          }
        }
      }

      if (!title) {
        const ogTitle =
          html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
          html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
        if (ogTitle) title = decodeHtmlEntities(ogTitle.replace(/\s*-\s*YouTube$/, ""));
      }
      if (!description) {
        const ogDesc =
          html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
          html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
        if (ogDesc) description = decodeHtmlEntities(ogDesc);
      }
    }
  } catch {
    // Fallback to oEmbed below
  } finally {
    clearTimeout(watchTimer);
  }

  // 2. YouTube oEmbed reliable fallback for title, author & thumbnail
  if (!title || !author) {
    const oembedCtrl = new AbortController();
    const oembedTimer = setTimeout(() => oembedCtrl.abort(), 5000);
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
        { signal: oembedCtrl.signal }
      );
      if (oembedRes.ok) {
        const oembed: any = await oembedRes.json();
        if (!title && oembed?.title) title = String(oembed.title);
        if (!author && oembed?.author_name) author = String(oembed.author_name);
        if (oembed?.thumbnail_url) thumbnailUrl = String(oembed.thumbnail_url);
      }
    } catch {
      // Non-fatal
    } finally {
      clearTimeout(oembedTimer);
    }
  }

  const transcriptText = transcriptSegments
    .slice(0, 180)
    .map((seg) => `[${formatTranscriptTimestamp(seg.startSec)}] ${seg.text}`)
    .join("\n")
    .slice(0, 18000);

  return {
    youtubeId,
    canonicalUrl,
    title: title || `YouTube Video (${youtubeId})`,
    author: author || "YouTube Creator",
    description,
    durationSec,
    thumbnailUrl,
    transcriptText,
    transcriptSegments,
  };
}

export async function extractYouTubeSourceMedia(
  rawUrl: string,
  jobDir: string,
  targetDurationSec = 12
): Promise<SourceMediaInfo> {
  const normalizedUrl = normalizeUserUrl(rawUrl);
  const youtubeId = extractYouTubeId(normalizedUrl);

  // If user pasted a non-YouTube direct/social video link inside URL tab, reuse existing stream pipeline cleanly
  if (!youtubeId) {
    const media = await extractSourceMedia(normalizedUrl, jobDir, targetDurationSec);
    return {
      ...media,
      sourceType: "youtube",
      hasVideo: true,
    };
  }

  // Extract metadata & transcript first (fast & works even when video stream downloads are rate-limited)
  const ytMeta = await extractYouTubeMetadataAndTranscript(youtubeId);

  // Try downloading real moving video stream first
  try {
    const videoMedia = await extractSourceMedia(ytMeta.canonicalUrl, jobDir, targetDurationSec);
    return {
      ...videoMedia,
      sourceType: "youtube",
      hasVideo: true,
      title: videoMedia.title && !videoMedia.title.includes("အထူးကဏ္ဍ") ? videoMedia.title : ytMeta.title,
      author: videoMedia.author || ytMeta.author,
      description: videoMedia.description || ytMeta.description,
      transcriptText: ytMeta.transcriptText || undefined,
      transcriptSegments:
        ytMeta.transcriptSegments.length > 0 ? ytMeta.transcriptSegments : undefined,
    };
  } catch (streamErr) {
    // Graceful Transcript & Metadata YouTube Pipeline when video stream download is bot-blocked
    const hasUsableContext =
      Boolean(ytMeta.transcriptText) ||
      (Boolean(ytMeta.title) && !ytMeta.title.startsWith("YouTube Video (")) ||
      Boolean(ytMeta.description);

    if (!hasUsableContext) {
      throw streamErr;
    }

    const framePaths: string[] = [];
    if (ytMeta.thumbnailUrl) {
      const thumbCtrl = new AbortController();
      const thumbTimer = setTimeout(() => thumbCtrl.abort(), 5000);
      try {
        const thumbRes = await fetch(ytMeta.thumbnailUrl, { signal: thumbCtrl.signal });
        if (thumbRes.ok) {
          const thumbBuf = Buffer.from(await thumbRes.arrayBuffer());
          if (thumbBuf.byteLength > 1500) {
            const thumbPath = path.join(jobDir, "yt_thumb.jpg");
            fs.writeFileSync(thumbPath, thumbBuf);
            framePaths.push(thumbPath);
          }
        }
      } catch {
        // Non-fatal
      } finally {
        clearTimeout(thumbTimer);
      }
    }

    while (framePaths.length < 3) {
      framePaths.push(await createGoldCyberBackdrop(jobDir, framePaths.length));
    }

    const baseVideo = await ensureCinematicBaseVideo();
    const probed = await probeMediaFile(baseVideo);
    const clampedTarget = Math.max(5, Math.min(300, Math.round(targetDurationSec)));
    const fallbackReelDur = Math.min(
      30,
      Math.max(8, ytMeta.durationSec ? Math.min(ytMeta.durationSec, clampedTarget) : clampedTarget)
    );

    return {
      normalizedUrl: ytMeta.canonicalUrl,
      platform: "YouTube_Transcript",
      youtubeId,
      title: ytMeta.title,
      author: ytMeta.author,
      description: ytMeta.description,
      sourceVideoPath: baseVideo,
      videoDurationSec: Math.min(probed?.durationSec || 30, fallbackReelDur),
      hasAudio: probed?.hasAudio ?? true,
      hasVideo: true,
      framePaths,
      sourceType: "youtube",
      transcriptText: ytMeta.transcriptText || undefined,
      transcriptSegments:
        ytMeta.transcriptSegments.length > 0 ? ytMeta.transcriptSegments : undefined,
    };
  }
}
