function shouldInsertSpaceAtBoundary(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftLast = left[left.length - 1];
  const rightFirst = right[0];
  if (!leftLast || !rightFirst) return false;
  if (/\s/.test(leftLast) || /\s/.test(rightFirst)) return false;
  // Preserve hyphenated line breaks (e.g. "state-\nment" -> "state-ment").
  if (leftLast === "-") return false;
  return true;
}

function repairMissingWordBoundaries(text: string): string {
  // PDF extraction sometimes glues prose words without whitespace
  // (e.g. "theDisposal"). Add a space for likely word boundaries:
  // - left side ends with >=3 lowercase letters
  // - right side starts with Uppercase + lowercase letters
  // This avoids most short-prefix proper nouns like "McGonagall".
  return text.replace(/\b([a-z]{3,})([A-Z][a-z]{2,})\b/g, "$1 $2");
}

/**
 * Normalizes extracted text from selection/PDF sources.
 * - Merges line fragments with a space when needed.
 * - Keeps hyphenated line breaks joined without an extra space.
 * - Collapses repeated whitespace.
 */
export function normalizeExtractedText(text: string): string {
  if (!text) return "";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let merged = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!merged) {
      merged = line;
      continue;
    }
    merged = shouldInsertSpaceAtBoundary(merged, line) ? `${merged} ${line}` : `${merged}${line}`;
  }

  const collapsed = merged.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  return repairMissingWordBoundaries(collapsed);
}

