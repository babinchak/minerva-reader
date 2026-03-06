import { calculateSelectionPositions } from "@/lib/book-position/positions";

export interface EpubVisibleContext {
  text: string;
  debugInfo?: {
    iframeCount: number;
    chosenIframeIndex: number | null;
    chosenIframeRect?: { x: number; y: number; width: number; height: number };
    anchorTag?: string;
  };
}

export interface EpubVisibleContextWithPosition extends EpubVisibleContext {
  startPosition: string;
  endPosition: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function rectIntersectionArea(a: DOMRect, b: DOMRect): number {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  const w = Math.max(0, right - left);
  const h = Math.max(0, bottom - top);
  return w * h;
}

function isProbablyBlock(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (
    tag === "p" ||
    tag === "li" ||
    tag === "blockquote" ||
    tag === "pre" ||
    tag === "article" ||
    tag === "section" ||
    tag === "main" ||
    tag === "h1" ||
    tag === "h2" ||
    tag === "h3" ||
    tag === "h4" ||
    tag === "h5" ||
    tag === "h6"
  ) {
    return true;
  }
  // divs are common containers; keep them only if they have meaningful text and not too many nested blocks.
  if (tag === "div") return true;
  return false;
}

function closestBlockElement(start: Element | null): Element | null {
  let el: Element | null = start;
  while (el) {
    if (isProbablyBlock(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function getElementText(el: Element): string {
  // innerText respects visibility and line breaks better than textContent.
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return raw.replace(/\s+/g, " ").trim();
}

function collectNearbyBlocksWithElements(
  anchor: Element,
  maxChars: number
): { text: string; blocks: Element[] } {
  const parent = anchor.parentElement;
  const blocks: Element[] = [];

  const pushIfOk = (el: Element | null) => {
    if (!el) return;
    const txt = getElementText(el);
    if (!txt) return;
    blocks.push(el);
  };

  pushIfOk(anchor);

  if (parent) {
    const children = Array.from(parent.children);
    const idx = children.indexOf(anchor);
    if (idx >= 0) {
      for (let offset = 1; offset <= 8; offset++) {
        pushIfOk(children[idx - offset] ?? null);
        pushIfOk(children[idx + offset] ?? null);
        if (blocks.length >= 14) break;
      }
    }
  }

  const unique: Element[] = [];
  const seen = new Set<Element>();
  for (const b of blocks) {
    if (seen.has(b)) continue;
    seen.add(b);
    unique.push(b);
  }

  let out = "";
  for (const el of unique) {
    const txt = getElementText(el);
    if (!txt) continue;
    const piece = out ? `\n\n${txt}` : txt;
    if (out.length + piece.length > maxChars) {
      const remaining = Math.max(0, maxChars - out.length);
      if (remaining > 50) {
        out += piece.slice(0, remaining);
      }
      break;
    }
    out += piece;
  }

  return { text: out.trim(), blocks: unique };
}

function collectNearbyBlocks(anchor: Element, maxChars: number): string {
  return collectNearbyBlocksWithElements(anchor, maxChars).text;
}

/**
 * Best-effort extraction of the "currently visible" text in the EPUB iframe.
 * This intentionally avoids any API calls that might change pagination / position.
 */
export function getEpubVisibleContext(options?: {
  maxChars?: number;
  includeDebugInfo?: boolean;
}): EpubVisibleContext | null {
  const maxChars = clamp(options?.maxChars ?? 30000, 1000, 60000);

  const iframes = Array.from(document.querySelectorAll("iframe"));
  const viewportRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);

  let bestIdx: number | null = null;
  let bestScore = 0;
  let bestRect: DOMRect | null = null;

  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const rect = iframe.getBoundingClientRect();
    const area = rectIntersectionArea(rect, viewportRect);
    if (area <= 0) continue;
    // Prefer larger visible iframes.
    if (area > bestScore) {
      bestScore = area;
      bestIdx = i;
      bestRect = rect;
    }
  }

  if (bestIdx == null) {
    return null;
  }

  const chosen = iframes[bestIdx];
  try {
    const doc = chosen.contentDocument || chosen.contentWindow?.document;
    const win = chosen.contentWindow;
    if (!doc || !win) return null;

    // Find an anchor element near the center of the iframe viewport.
    const x = Math.floor(win.innerWidth / 2);
    const y = Math.floor(win.innerHeight / 2);
    const atPoint = doc.elementFromPoint(x, y);
    const anchor = closestBlockElement(atPoint) ?? closestBlockElement(doc.body);
    if (!anchor) return null;

    const text = collectNearbyBlocks(anchor, maxChars);
    if (!text) return null;

    return {
      text,
      debugInfo: options?.includeDebugInfo
        ? {
            iframeCount: iframes.length,
            chosenIframeIndex: bestIdx,
            chosenIframeRect: bestRect
              ? {
                  x: bestRect.x,
                  y: bestRect.y,
                  width: bestRect.width,
                  height: bestRect.height,
                }
              : undefined,
            anchorTag: anchor.tagName.toLowerCase(),
          }
        : undefined,
    };
  } catch {
    // Cross-origin or inaccessible iframe.
    return null;
  }
}

/**
 * Like getEpubVisibleContext but also returns start/end position for the visible range.
 * Used to fetch intersect-based summaries for EPUB "Explain page" and typed sends without selection.
 */
export function getEpubVisibleContextWithPosition(
  readingOrder: Array<{ href?: string }>,
  options?: { maxChars?: number }
): EpubVisibleContextWithPosition | null {
  const maxChars = clamp(options?.maxChars ?? 30000, 1000, 60000);

  const iframes = Array.from(document.querySelectorAll("iframe"));
  const viewportRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);

  let bestIdx: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const rect = iframe.getBoundingClientRect();
    const area = rectIntersectionArea(rect, viewportRect);
    if (area <= 0) continue;
    if (area > bestScore) {
      bestScore = area;
      bestIdx = i;
    }
  }

  if (bestIdx == null) return null;

  const chosen = iframes[bestIdx];
  try {
    const doc = chosen.contentDocument || chosen.contentWindow?.document;
    const win = chosen.contentWindow;
    if (!doc || !win) return null;

    const x = Math.floor(win.innerWidth / 2);
    const y = Math.floor(win.innerHeight / 2);
    const atPoint = doc.elementFromPoint(x, y);
    const anchor = closestBlockElement(atPoint) ?? closestBlockElement(doc.body);
    if (!anchor) return null;

    const { text, blocks } = collectNearbyBlocksWithElements(anchor, maxChars);
    if (!text || blocks.length === 0) return null;

    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    if (!first || !last) return null;

    const range = doc.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);

    const positions = calculateSelectionPositions(range, readingOrder, doc, -1);
    return {
      text,
      startPosition: positions.start,
      endPosition: positions.end,
    };
  } catch {
    return null;
  }
}
