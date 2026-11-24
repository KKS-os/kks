import fs from "node:fs";
import type { SubtitleCue, SubtitleStyleOptions } from "./types.ts";

export function isMyanmarCombiningMark(code: number): boolean {
  return (
    (code >= 0x102b && code <= 0x103e) ||
    (code >= 0x1056 && code <= 0x1059) ||
    (code >= 0x105e && code <= 0x1060) ||
    (code >= 0x1071 && code <= 0x108d) ||
    code === 0x108f ||
    (code >= 0x109a && code <= 0x109d)
  );
}

export function countVisibleBaseUnits(str: string): number {
  let count = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) || 0;
    if (!isMyanmarCombiningMark(code)) {
      count += 1;
    }
  }
  return count;
}

export function wrapBurmeseSubtitleLine(rawText: string, maxUnitsPerLine: number): string {
  const cleaned = rawText
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // If already contains ASS tags or within limit, return with clean spacing
  const visibleOnly = cleaned.replace(/\{[^}]+\}/g, "");
  if (countVisibleBaseUnits(visibleOnly) <= maxUnitsPerLine) {
    return cleaned;
  }

  const segments = cleaned
    .replace(/([၊။])/g, "$1 ")
    .split(" ")
    .filter(Boolean);

  if (segments.length > 1) {
    const lines: string[] = [];
    let current = "";
    for (const seg of segments) {
      const candidate = current ? `${current} ${seg}` : seg;
      if (current && countVisibleBaseUnits(candidate) > maxUnitsPerLine) {
        lines.push(current);
        current = seg;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 2).join("\\N");
  }

  let units = 0;
  let splitIdx = -1;
  const chars = Array.from(cleaned);
  const targetMid = Math.min(maxUnitsPerLine, Math.ceil(countVisibleBaseUnits(cleaned) / 2));

  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].codePointAt(0) || 0;
    if (!isMyanmarCombiningMark(code)) {
      units += 1;
    }
    if (units >= targetMid && i + 1 < chars.length) {
      const nextCode = chars[i + 1].codePointAt(0) || 0;
      const prevIsVirama = code === 0x1039 || code === 0x103a;
      if (!isMyanmarCombiningMark(nextCode) && !prevIsVirama) {
        splitIdx = i + 1;
        break;
      }
    }
  }

  if (splitIdx > 0 && splitIdx < chars.length) {
    return `${chars.slice(0, splitIdx).join("")}\\N${chars.slice(splitIdx).join("")}`;
  }
  return cleaned;
}

export function formatAssTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const cs = Math.floor(Math.round((clamped - Math.floor(clamped)) * 100));
  const safeCs = Math.min(99, cs);
  return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(safeCs).padStart(2, "0")}`;
}

export function writeBurmeseAssFile(
  assPath: string,
  subtitles: SubtitleCue[],
  aspectRatio: "9:16" | "16:9" | "1:1",
  clipTitleBurmese: string,
  styleOptions?: SubtitleStyleOptions
): void {
  const isVertical = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";
  const playResX = isVertical ? 720 : isSquare ? 1080 : 1280;
  const playResY = isVertical ? 1280 : isSquare ? 1080 : 720;

  const theme = styleOptions?.theme || "gold";
  const fontSizeChoice = styleOptions?.fontSize || "md";
  const positionChoice = styleOptions?.position || "bottom";

  let baseFontSize = isVertical ? 38 : 34;
  if (fontSizeChoice === "sm") baseFontSize = isVertical ? 32 : 28;
  if (fontSizeChoice === "lg") baseFontSize = isVertical ? 44 : 40;

  // Primary color in &HAABBGGRR
  let primaryColour = "&H0003B7FF"; // Cyber Gold #FFB703
  let outlineColour = "&H0005080C"; // Deep charcoal
  if (theme === "white_gold") {
    primaryColour = "&H00FFFFFF";
    outlineColour = "&H000088CC"; // Gold outline
  } else if (theme === "neon_amber") {
    primaryColour = "&H0024BFFB"; // Amber Neon #FBBF24
    outlineColour = "&H00020408";
  }

  let alignment = 2; // Bottom Center
  let marginV = isVertical ? 140 : 70;
  if (positionChoice === "center") {
    alignment = 5; // Middle Center
    marginV = 20;
  } else if (positionChoice === "top") {
    alignment = 8; // Top Center
    marginV = isVertical ? 140 : 70;
  }

  const maxUnits = isVertical ? 24 : 38;
  const headerTitle = wrapBurmeseSubtitleLine(clipTitleBurmese, isVertical ? 26 : 42);
  const totalEnd = subtitles.length > 0 ? Math.max(...subtitles.map((s) => s.endOffset), 10) : 12;

  const lines: string[] = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: KKSGoldSub,Noto Sans Myanmar,${baseFontSize},${primaryColour},&H00FFFFFF,${outlineColour},&HAA000000,-1,0,0,0,100,100,0.5,0,1,4.2,2.2,${alignment},40,40,${marginV},1`,
    `Style: KKSTopKicker,Noto Sans Myanmar,${isVertical ? 22 : 20},&H2594E6FC,&H00FFFFFF,&H0008080A,&H90000000,-1,0,0,0,100,100,0.6,0,1,3.0,1.5,8,40,40,${isVertical ? 65 : 34},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,0:00:00.00,${formatAssTimestamp(totalEnd)},KKSTopKicker,,0,0,0,,{\\fad(200,200)}${headerTitle}`,
  ];

  for (const cue of subtitles) {
    const startStr = formatAssTimestamp(cue.startOffset);
    const endStr = formatAssTimestamp(cue.endOffset);
    const wrapped = wrapBurmeseSubtitleLine(cue.text, maxUnits);
    lines.push(`Dialogue: 1,${startStr},${endStr},KKSGoldSub,,0,0,0,,{\\fad(130,120)}${wrapped}`);
  }

  fs.writeFileSync(assPath, lines.join("\n"), "utf-8");
}
