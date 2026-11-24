import type { StructuredRecapSummary } from "../components/types";

export function formatRecapAsMarkdown(recap: StructuredRecapSummary): string {
  const lines: string[] = [
    `# ${recap.title}`,
    "",
    `> **Tone / Mood:** ${recap.sentimentOrTone}`,
    "",
    "## Executive Summary",
    "",
    recap.executiveSummary,
    "",
    "## Key Takeaways",
    "",
    ...recap.keyTakeaways.map((point) => `- ${point}`),
    "",
    "## Timeline",
    "",
    ...recap.timeline.map((item) => `- **${item.timestamp}** — ${item.event}`),
    "",
  ];
  return lines.join("\n");
}

export function formatRecapAsPlainText(recap: StructuredRecapSummary): string {
  const lines: string[] = [
    recap.title,
    "=".repeat(Math.min(64, Math.max(20, recap.title.length))),
    `Tone / Mood: ${recap.sentimentOrTone}`,
    "",
    "EXECUTIVE SUMMARY",
    "-----------------",
    recap.executiveSummary,
    "",
    "KEY TAKEAWAYS",
    "-------------",
    ...recap.keyTakeaways.map((point, idx) => `${idx + 1}. ${point}`),
    "",
    "TIMELINE",
    "--------",
    ...recap.timeline.map((item) => `[${item.timestamp}] ${item.event}`),
    "",
  ];
  return lines.join("\n");
}

export function buildRecapSpeechSegments(recap: StructuredRecapSummary): string[] {
  const segments: string[] = [];
  if (recap.title.trim()) {
    segments.push(recap.title.trim());
  }
  if (recap.executiveSummary.trim()) {
    // Split long summaries cleanly at sentence delimiters to keep Web Speech API responsive
    const rawParts = recap.executiveSummary
      .split(/(?<=[.!?။])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    segments.push(...(rawParts.length > 0 ? rawParts : [recap.executiveSummary.trim()]));
  }
  if (recap.keyTakeaways.length > 0) {
    recap.keyTakeaways.forEach((point, idx) => {
      if (point.trim()) {
        segments.push(`Key point ${idx + 1}: ${point.trim()}`);
      }
    });
  }
  if (recap.timeline.length > 0) {
    recap.timeline.forEach((item) => {
      if (item.event.trim()) {
        segments.push(`At ${item.timestamp}: ${item.event.trim()}`);
      }
    });
  }
  return segments;
}

export function sanitizeRecapFilename(title: string, ext: "md" | "txt"): string {
  const asciiSlug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
  const base = asciiSlug && asciiSlug.length >= 3 ? asciiSlug : "kks-recap-summary";
  return `${base}-recap.${ext}`;
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back cleanly below
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
