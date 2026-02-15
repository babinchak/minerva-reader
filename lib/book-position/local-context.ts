import { getTextSelection } from "@/lib/book-position/selection";
import { normalizeExtractedText } from "@/lib/text/normalize-extracted-text";

export interface EpubLocalSelectionContext {
  beforeText: string;
  selectedText: string;
  afterText: string;
}

function trimStartToWordBoundary(text: string): string {
  if (!text) return text;
  return text.replace(/^\S*\s?/, "").trim();
}

function trimEndToWordBoundary(text: string): string {
  if (!text) return text;
  return text.replace(/\s?\S*$/, "").trim();
}

export function getEpubLocalContextAroundCurrentSelection(options?: {
  beforeChars?: number;
  afterChars?: number;
  maxTotalChars?: number;
}): EpubLocalSelectionContext | null {
  const beforeChars = Math.max(0, options?.beforeChars ?? 800);
  const afterChars = Math.max(0, options?.afterChars ?? 800);
  const maxTotalChars = Math.max(0, options?.maxTotalChars ?? 2400);

  const selectionResult = getTextSelection();
  const range = selectionResult?.range;
  const doc = selectionResult?.targetDoc;
  if (!range || !doc) return null;

  const selectedText = normalizeExtractedText(range.toString());
  if (!selectedText) return null;

  const root = doc.body || doc.documentElement;
  if (!root) {
    return {
      beforeText: "",
      selectedText,
      afterText: "",
    };
  }

  try {
    const beforeRange = doc.createRange();
    beforeRange.selectNodeContents(root);
    beforeRange.setEnd(range.startContainer, range.startOffset);

    const afterRange = doc.createRange();
    afterRange.selectNodeContents(root);
    afterRange.setStart(range.endContainer, range.endOffset);

    let beforeText = normalizeExtractedText(beforeRange.toString());
    let afterText = normalizeExtractedText(afterRange.toString());

    if (beforeText.length > beforeChars) {
      beforeText = trimStartToWordBoundary(beforeText.slice(beforeText.length - beforeChars));
    }
    if (afterText.length > afterChars) {
      afterText = trimEndToWordBoundary(afterText.slice(0, afterChars));
    }

    const totalLen = beforeText.length + selectedText.length + afterText.length;
    if (maxTotalChars > 0 && totalLen > maxTotalChars) {
      const budget = Math.max(0, maxTotalChars - selectedText.length);
      const beforeBudget = Math.min(beforeText.length, Math.floor(budget / 2));
      const afterBudget = Math.min(afterText.length, budget - beforeBudget);

      if (beforeText.length > beforeBudget) {
        beforeText = trimStartToWordBoundary(beforeText.slice(beforeText.length - beforeBudget));
      }
      if (afterText.length > afterBudget) {
        afterText = trimEndToWordBoundary(afterText.slice(0, afterBudget));
      }
    }

    return { beforeText, selectedText, afterText };
  } catch {
    return {
      beforeText: "",
      selectedText,
      afterText: "",
    };
  }
}

