/**
 * Resolve which page a quoted text falls on within a section's content,
 * given page_breaks offsets and the raw content_text.
 *
 * Returns the 1-based page number, or null if resolution fails.
 */

/** Normalize typography: curly quotes, ligatures, dashes, ellipsis → ASCII equivalents. */
function normalizeTypo(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");
}

/**
 * Build a mapping from normalized-content character index → raw-content character index.
 * Needed because page_breaks offsets refer to the raw content.
 */
function buildNormToRawMap(rawContent: string): number[] {
  const ligatures: Record<string, string> = {
    "\uFB00": "ff",
    "\uFB01": "fi",
    "\uFB02": "fl",
    "\uFB03": "ffi",
    "\uFB04": "ffl",
  };
  const ellipsis = "\u2026";
  const map: number[] = [];
  let prevWasSpace = false;

  for (let ri = 0; ri < rawContent.length; ri++) {
    const ch = rawContent[ri]!;
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        map.push(ri);
        prevWasSpace = true;
      }
    } else if (ligatures[ch]) {
      for (let k = 0; k < ligatures[ch]!.length; k++) map.push(ri);
      prevWasSpace = false;
    } else if (ch === ellipsis) {
      map.push(ri);
      map.push(ri);
      map.push(ri);
      prevWasSpace = false;
    } else {
      map.push(ri);
      prevWasSpace = false;
    }
  }

  return map;
}

/** Try to find normQuote in normContent using direct, spaceless, and alpha-only strategies. */
function findExactishIndex(normContent: string, normQuote: string): number {
  // Exact normalized match
  let idx = normContent.indexOf(normQuote);
  if (idx >= 0) return idx;

  // Spaceless fallback
  const stripContent = normContent.replace(/\s+/g, "");
  const stripQuote = normQuote.replace(/\s+/g, "");
  const stripIdx = stripContent.indexOf(stripQuote);
  if (stripIdx >= 0) {
    let si = 0;
    idx = 0;
    for (; idx < normContent.length && si < stripIdx; idx++) {
      if (!/\s/.test(normContent[idx]!)) si++;
    }
    while (idx < normContent.length && /\s/.test(normContent[idx]!)) idx++;
    return idx;
  }

  // Alpha-only fallback
  const alphaOnly = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const alphaContent = alphaOnly(normContent);
  const alphaQuote = alphaOnly(normQuote);
  let alphaIdx = alphaContent.indexOf(alphaQuote);

  // Partial match fallback: try first ~40 alphanumeric chars
  if (alphaIdx < 0 && alphaQuote.length >= 15) {
    alphaIdx = alphaContent.indexOf(alphaQuote.slice(0, 40));
  }

  if (alphaIdx >= 0) {
    let ai = 0;
    idx = 0;
    while (idx < normContent.length && ai < alphaIdx) {
      if (/[a-z0-9]/.test(normContent[idx]!)) ai++;
      idx++;
    }
    while (idx < normContent.length && !/[a-z0-9]/.test(normContent[idx]!)) idx++;
    return idx;
  }

  return -1;
}

/** Find the normalized index of the quote in the normalized content, with fallbacks. */
function findQuoteIndex(normContent: string, normQuote: string): number {
  // Try matching the full quote first (handles real ellipsis in source text)
  const fullIdx = findExactishIndex(normContent, normQuote);
  if (fullIdx >= 0) return fullIdx;

  // Ellipsis fragment fallback: the AI may have used … / ... to omit text
  // between fragments. Split on ellipsis, try each fragment (longest first).
  const fragments = normQuote
    .split(/\.{3}|\u2026/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 10);

  if (fragments.length > 1) {
    // Sort by length descending — longer fragments are more unique
    const sorted = [...fragments].sort((a, b) => b.length - a.length);
    for (const frag of sorted) {
      const fragIdx = findExactishIndex(normContent, frag);
      if (fragIdx >= 0) return fragIdx;
    }
  }

  return -1;
}

export interface SectionData {
  startPosition: string;
  pageBreaks: number[] | null;
  contentText: string | null;
}

/**
 * Resolve which page a quoted passage falls on.
 *
 * @param section  Section metadata (startPosition as page number string, pageBreaks, contentText)
 * @param quotedText  The quoted text to locate within the section
 * @returns The 1-based page number, or null if the section isn't a PDF / resolution fails
 */
export function resolveQuotePage(
  section: SectionData,
  quotedText: string | undefined
): number | null {
  const startPage = parseInt(section.startPosition, 10);
  if (Number.isNaN(startPage)) return null;

  // Clean quoted text
  const cleaned = quotedText
    ?.replace(/^[""\u201C\u201D]+/, "")
    .replace(/[""\u201C\u201D]+$/, "")
    .trim();

  if (!cleaned || !section.contentText || !section.pageBreaks?.length) {
    return startPage;
  }

  const rawContent = section.contentText;
  const normContent = normalizeTypo(rawContent.toLowerCase()).replace(/\s+/g, " ");
  const normQuote = normalizeTypo(cleaned.toLowerCase()).replace(/\s+/g, " ");
  const normToRawMap = buildNormToRawMap(rawContent);

  const idx = findQuoteIndex(normContent, normQuote);
  if (idx < 0) return startPage;

  const rawIdx = normToRawMap[idx] ?? 0;
  let page = startPage;
  for (const breakOffset of section.pageBreaks) {
    if (rawIdx >= breakOffset) page++;
    else break;
  }

  return page;
}
