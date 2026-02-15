import type { PDFDocumentProxy } from "pdfjs-dist";
import { normalizeExtractedText } from "@/lib/text/normalize-extracted-text";

export interface PdfLocalSelectionContext {
  beforeText: string;
  selectedText: string;
  afterText: string;
}

function parsePosition(pos: string): { page: number; itemIndex: number; charOffset: number } | null {
  const parts = pos.split(/[/:]/).map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) return null;
  return { page: parts[0], itemIndex: parts[1], charOffset: parts[2] };
}

function normalizeWhitespace(text: string): string {
  return normalizeExtractedText(text);
}

function appendFragment(acc: string, next: string): string {
  if (!acc) return next;
  if (!next) return acc;
  const leftLast = acc[acc.length - 1];
  const rightFirst = next[0];
  if (!leftLast || !rightFirst) return acc + next;
  if (/\s/.test(leftLast) || /\s/.test(rightFirst)) return acc + next;
  if (leftLast === "-") return acc + next;
  if (/[A-Za-z0-9]/.test(leftLast) && /[A-Za-z0-9]/.test(rightFirst)) {
    return `${acc} ${next}`;
  }
  return acc + next;
}

/**
 * Extracts local context (before/selected/after) from the PDF document using pdf.js,
 * so we get text from previous and next pages regardless of what's rendered in the DOM.
 *
 * Uses N characters before and after the selection (approximates ~10-15 lines each).
 */
export async function getPdfLocalContextFromDocument(
  pdf: PDFDocumentProxy,
  startPosition: string,
  endPosition: string,
  selectedText: string,
  options?: {
    beforeChars?: number;
    afterChars?: number;
    pagesBefore?: number;
    pagesAfter?: number;
    maxTotalChars?: number;
  }
): Promise<PdfLocalSelectionContext | null> {
  const beforeChars = Math.max(0, options?.beforeChars ?? 1200);
  const afterChars = Math.max(0, options?.afterChars ?? 1200);
  const pagesBefore = Math.max(0, options?.pagesBefore ?? 2);
  const pagesAfter = Math.max(0, options?.pagesAfter ?? 2);
  const maxTotalChars = Math.max(0, options?.maxTotalChars ?? 4000);

  const start = parsePosition(startPosition);
  const end = parsePosition(endPosition);
  if (!start || !end) return null;

  const numPages = pdf.numPages;
  const pageStart = Math.max(1, start.page - pagesBefore);
  const pageEnd = Math.min(numPages, end.page + pagesAfter);

  type PageText = { pageNum: number; fullText: string; itemStarts: number[] };
  const pages: PageText[] = [];

  for (let p = pageStart; p <= pageEnd; p++) {
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{ str?: string }>;
    const itemStarts: number[] = [];
    let fullText = "";
    for (let i = 0; i < items.length; i++) {
      itemStarts.push(fullText.length);
      fullText = appendFragment(fullText, items[i]?.str ?? "");
    }
    pages.push({ pageNum: p, fullText, itemStarts });
  }

  let globalStart = 0;
  let globalEnd = 0;
  let offset = 0;
  for (const pt of pages) {
    const pageLen = pt.fullText.length;
    if (pt.pageNum === start.page) {
      const itemStart = Math.min(start.itemIndex, pt.itemStarts.length - 1);
      const base = pt.itemStarts[itemStart] ?? 0;
      globalStart = offset + base + Math.min(start.charOffset, (pt.fullText.length - base));
    }
    if (pt.pageNum === end.page) {
      const itemEnd = Math.min(end.itemIndex, pt.itemStarts.length - 1);
      const base = pt.itemStarts[itemEnd] ?? 0;
      globalEnd = offset + base + Math.min(end.charOffset, (pt.fullText.length - base));
    }
    offset += pageLen;
  }

  const fullText = pages.map((p) => p.fullText).join("");
  const normalizedFull = normalizeWhitespace(fullText);
  const normalizedSelected = normalizeWhitespace(selectedText);

  const selStart = normalizedFull.indexOf(normalizedSelected);
  const selEnd = selStart >= 0 ? selStart + normalizedSelected.length : globalEnd;

  const useGlobal = selStart < 0;
  const actualStart = useGlobal ? globalStart : Math.min(selStart, fullText.length);
  const actualEnd = useGlobal ? globalEnd : Math.min(selEnd, fullText.length);

  let beforeAcc = fullText.slice(0, actualStart);
  let afterAcc = fullText.slice(actualEnd);
  const selectedAcc = fullText.slice(actualStart, actualEnd);

  beforeAcc = normalizeWhitespace(beforeAcc);
  afterAcc = normalizeWhitespace(afterAcc);

  if (beforeAcc.length > beforeChars) {
    beforeAcc = beforeAcc.slice(beforeAcc.length - beforeChars);
    beforeAcc = beforeAcc.replace(/^\S*\s?/, "").trim();
  }
  if (afterAcc.length > afterChars) {
    afterAcc = afterAcc.slice(0, afterChars);
    afterAcc = afterAcc.replace(/\s?\S*$/, "").trim();
  }

  const totalLen = beforeAcc.length + selectedAcc.length + afterAcc.length;
  if (maxTotalChars > 0 && totalLen > maxTotalChars) {
    const budget = Math.max(0, maxTotalChars - selectedAcc.length);
    const beforeBudget = Math.min(beforeAcc.length, Math.floor(budget / 2));
    const afterBudget = Math.min(afterAcc.length, budget - beforeBudget);
    if (beforeAcc.length > beforeBudget) {
      beforeAcc = beforeAcc.slice(beforeAcc.length - beforeBudget).trim();
      beforeAcc = beforeAcc.replace(/^\S*\s?/, "").trim();
    }
    if (afterAcc.length > afterBudget) {
      afterAcc = afterAcc.slice(0, afterBudget).trim();
      afterAcc = afterAcc.replace(/\s?\S*$/, "").trim();
    }
  }

  return {
    beforeText: beforeAcc,
    selectedText: normalizeWhitespace(selectedAcc) || normalizedSelected,
    afterText: afterAcc,
  };
}
