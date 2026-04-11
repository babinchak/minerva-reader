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

/**
 * Check whether an element is at least partially visible in the iframe viewport.
 * Uses getBoundingClientRect which returns coordinates relative to the iframe viewport
 * (0,0 = top-left of the visible area). In paginated EPUB (CSS columns), off-page
 * elements have rects far to the left or right of the viewport.
 */
function isElementVisible(el: Element, viewportWidth: number, viewportHeight: number): boolean {
  try {
    const rect = el.getBoundingClientRect();
    // Element must have some size and overlap with the viewport
    if (rect.width === 0 && rect.height === 0) return false;
    return rect.right > 0 && rect.left < viewportWidth &&
           rect.bottom > 0 && rect.top < viewportHeight;
  } catch {
    return false;
  }
}

/**
 * Collect block-level elements that are visible in the iframe viewport.
 * Walks the body's direct children (and their block children) in DOM order,
 * only including elements whose bounding rect intersects the visible area.
 */
function collectVisibleBlocksWithElements(
  doc: Document,
  win: Window,
  maxChars: number
): { text: string; blocks: Element[] } {
  const body = doc.body;
  if (!body) return { text: "", blocks: [] };

  const vpWidth = win.innerWidth || doc.documentElement.clientWidth || 0;
  const vpHeight = win.innerHeight || doc.documentElement.clientHeight || 0;

  const blocks: Element[] = [];
  let totalChars = 0;

  // Walk block-level descendants in document order
  const walk = (parent: Element) => {
    if (totalChars >= maxChars) return;
    for (const child of parent.children) {
      if (totalChars >= maxChars) return;
      if (!isProbablyBlock(child)) continue;

      if (!isElementVisible(child, vpWidth, vpHeight)) continue;

      // Check if this is a leaf block (has text but no block children)
      const hasBlockChildren = Array.from(child.children).some(isProbablyBlock);
      if (hasBlockChildren) {
        // Recurse into container blocks (e.g., section, article, div with nested p's)
        walk(child);
      } else {
        const txt = getElementText(child);
        if (!txt) continue;
        blocks.push(child);
        totalChars += txt.length;
      }
    }
  };

  walk(body);

  // Build text output
  let out = "";
  for (const el of blocks) {
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

  return { text: out.trim(), blocks };
}

/** Legacy sibling-based collection (used by getEpubVisibleContext which doesn't have win). */
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

    // Use viewport-aware collection
    const { text } = collectVisibleBlocksWithElements(doc, win, maxChars);

    // Fallback to anchor-based if viewport walk found nothing
    if (!text) {
      const x = Math.floor(win.innerWidth / 2);
      const y = Math.floor(win.innerHeight / 2);
      const atPoint = doc.elementFromPoint(x, y);
      const anchor = closestBlockElement(atPoint) ?? closestBlockElement(doc.body);
      if (!anchor) return null;

      const fallbackText = collectNearbyBlocks(anchor, maxChars);
      if (!fallbackText) return null;

      return {
        text: fallbackText,
        debugInfo: options?.includeDebugInfo
          ? {
              iframeCount: iframes.length,
              chosenIframeIndex: bestIdx,
              chosenIframeRect: bestRect
                ? { x: bestRect.x, y: bestRect.y, width: bestRect.width, height: bestRect.height }
                : undefined,
              anchorTag: anchor.tagName.toLowerCase(),
            }
          : undefined,
      };
    }

    return {
      text,
      debugInfo: options?.includeDebugInfo
        ? {
            iframeCount: iframes.length,
            chosenIframeIndex: bestIdx,
            chosenIframeRect: bestRect
              ? { x: bestRect.x, y: bestRect.y, width: bestRect.width, height: bestRect.height }
              : undefined,
            anchorTag: "viewport-walk",
          }
        : undefined,
    };
  } catch {
    // Cross-origin or inaccessible iframe.
    return null;
  }
}

/**
 * Compute start/end positions from collected blocks, with fallback to readingOrder-based positions.
 */
function computePositionResult(
  text: string,
  blocks: Element[],
  doc: Document,
  readingOrder: Array<{ href?: string }>,
  iframe: HTMLIFrameElement,
  readingOrderIndex?: number
): EpubVisibleContextWithPosition {
  const roIndex = readingOrderIndex ?? findReadingOrderIndex(doc, iframe, readingOrder);
  try {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    if (first && last) {
      const range = doc.createRange();
      range.setStart(first, 0);
      range.setEnd(last, last.childNodes.length);
      const positions = calculateSelectionPositions(range, readingOrder, doc, roIndex);
      return { text, startPosition: positions.start, endPosition: positions.end };
    }
  } catch {
    // Position calculation failed, using fallback
  }
  return { text, startPosition: `${roIndex}/0/0`, endPosition: `${roIndex}/9999/9999` };
}

/**
 * Like getEpubVisibleContext but also returns start/end position for the visible range.
 * Used to fetch intersect-based summaries for EPUB "Explain page" and typed sends without selection.
 */
export function getEpubVisibleContextWithPosition(
  readingOrder: Array<{ href?: string }>,
  options?: { maxChars?: number; readingOrderIndex?: number }
): EpubVisibleContextWithPosition | null {
  const maxChars = clamp(options?.maxChars ?? 30000, 1000, 60000);
  const roIndexOverride = options?.readingOrderIndex;

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

  if (bestIdx == null) {
    return null;
  }

  const chosen = iframes[bestIdx];
  try {
    const doc = chosen.contentDocument || chosen.contentWindow?.document;
    const win = chosen.contentWindow;
    if (!doc || !win) return null;

    // Collect only elements visible in the iframe viewport (respects CSS column pagination)
    const { text, blocks } = collectVisibleBlocksWithElements(doc, win, maxChars);

    if (text && blocks.length > 0) {
      return computePositionResult(text, blocks, doc, readingOrder, chosen, roIndexOverride);
    }

    // Fallback: anchor-based collection if viewport walk found nothing
    const x = Math.floor(win.innerWidth / 2);
    const y = Math.floor(win.innerHeight / 2);
    const atPoint = doc.elementFromPoint(x, y);
    const anchor = closestBlockElement(atPoint) ?? closestBlockElement(doc.body);
    if (!anchor) {
      const roIndex = roIndexOverride ?? findReadingOrderIndex(doc, chosen, readingOrder);
      return { text: "", startPosition: `${roIndex}/0/0`, endPosition: `${roIndex}/9999/9999` };
    }
    const fallback = collectNearbyBlocksWithElements(anchor, maxChars);
    if (!fallback.text || fallback.blocks.length === 0) {
      const roIndex = roIndexOverride ?? findReadingOrderIndex(doc, chosen, readingOrder);
      return { text: "", startPosition: `${roIndex}/0/0`, endPosition: `${roIndex}/9999/9999` };
    }
    return computePositionResult(fallback.text, fallback.blocks, doc, readingOrder, chosen, roIndexOverride);
  } catch {
    return null;
  }
}

/**
 * Find the readingOrder index by reading Readium's locator from localStorage,
 * falling back to URL matching. Returns 0 if no match is found.
 */
function findReadingOrderIndex(
  doc: Document,
  iframe: HTMLIFrameElement,
  readingOrder: Array<{ href?: string }>
): number {
  /** Strict filename match against reading order */
  const matchFilename = (filename: string): number => {
    if (!filename || !filename.includes(".")) return -1; // must look like a real file
    for (let i = 0; i < readingOrder.length; i++) {
      const itemFilename = (readingOrder[i]?.href || "").split("/").pop() || "";
      if (itemFilename && filename === itemFilename) return i;
    }
    return -1;
  };

  // Primary: read Readium's locator from localStorage (most reliable — works with blob URLs)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.endsWith("-current-location")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const locator = JSON.parse(raw) as { href?: string };
      if (locator.href) {
        const locFilename = locator.href.split("/").pop() || "";
        const idx = matchFilename(locFilename);
        if (idx >= 0) return idx;
      }
    }
  } catch {
    // localStorage not available or parse error
  }

  // Fallback: try document URL / iframe src
  const urls: string[] = [];
  try { if (doc.URL) urls.push(doc.URL); } catch { /* cross-origin */ }
  try { if (doc.baseURI) urls.push(doc.baseURI); } catch { /* cross-origin */ }
  if (iframe.src) urls.push(iframe.src);

  for (const url of urls) {
    try {
      const filename = new URL(url).pathname.split("/").pop() || "";
      const idx = matchFilename(filename);
      if (idx >= 0) return idx;
    } catch { /* invalid URL */ }
  }

  return 0;
}
