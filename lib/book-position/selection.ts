import { TextSelectionResult } from "@/lib/book-position/types";

interface StoredSelection {
  range: Range;
  targetDoc: Document;
}

let lastSelection: StoredSelection | null = null;
const PERSISTENT_SELECTION_HIGHLIGHT_KEY = "minerva-persistent-selection";
const PERSISTENT_SELECTION_STYLE_ID = "minerva-persistent-selection-style";

function getHighlightRegistry():
  | { set: (name: string, highlight: unknown) => void; delete: (name: string) => void }
  | null {
  const cssWithHighlights = CSS as unknown as {
    highlights?: { set: (name: string, highlight: unknown) => void; delete: (name: string) => void };
  };
  return cssWithHighlights.highlights ?? null;
}

function ensurePersistentHighlightStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(PERSISTENT_SELECTION_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PERSISTENT_SELECTION_STYLE_ID;
  style.textContent = `
::highlight(${PERSISTENT_SELECTION_HIGHLIGHT_KEY}) {
  background-color: hsl(var(--primary) / 0.3);
}

.dark ::highlight(${PERSISTENT_SELECTION_HIGHLIGHT_KEY}) {
  background-color: hsl(var(--primary) / 0.38);
}
`;
  document.head.appendChild(style);
}

function isInAIPane(node: Node | null): boolean {
  if (!node) return false;
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest("[data-ai-pane='true']"));
}

export function isCurrentSelectionInAIPane(): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  return isInAIPane(selection.anchorNode) || isInAIPane(selection.focusNode);
}

// Utility function to get text selection from main document or iframe
export function getTextSelection(): TextSelectionResult | null {
  // Try to get selection from the main document first
  let selection: Selection | null = window.getSelection();
  let range: Range | null = null;
  let targetDoc: Document = document;

  // Check if selection is valid in main document
  if (selection && selection.rangeCount > 0 && selection.toString().trim() !== "") {
    if (isInAIPane(selection.anchorNode) || isInAIPane(selection.focusNode)) {
      selection = null;
    } else {
    range = selection.getRangeAt(0);
    return { selection, range, targetDoc };
    }
  }

  // Look for iframe that might contain the reader content
  const iframes = document.querySelectorAll("iframe");
  for (const iframe of iframes) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const iframeSelection = iframeDoc.getSelection();
        if (iframeSelection && iframeSelection.rangeCount > 0 && iframeSelection.toString().trim() !== "") {
          selection = iframeSelection;
          range = iframeSelection.getRangeAt(0);
          targetDoc = iframeDoc;
          return { selection, range, targetDoc };
        }
      }
    } catch {
      // Cross-origin iframe, skip
      continue;
    }
  }

  return null;
}

// Utility function to get selected text from main document or iframe
export function getSelectedText(): string {
  const result = getTextSelection();
  return result?.selection?.toString().trim() || "";
}

// Store the current selection so it can be restored later
export function captureSelection(): string {
  const result = getTextSelection();
  const selectedText = result?.selection?.toString().trim() || "";

  if (result?.range && selectedText) {
    lastSelection = {
      range: result.range.cloneRange(),
      targetDoc: result.targetDoc,
    };
  }

  return selectedText;
}

// Restore the most recent selection (useful when focus shifts away)
export function restoreLastSelection(): void {
  if (!lastSelection) return;

  const selection = lastSelection.targetDoc.getSelection();
  if (!selection) return;

  if (selection.rangeCount === 0 || selection.toString().trim() === "") {
    selection.removeAllRanges();
    selection.addRange(lastSelection.range.cloneRange());
  }
}

export function showPersistentSelectionHighlight(): void {
  if (!lastSelection) return;
  const registry = getHighlightRegistry();
  const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
    .Highlight;
  if (!registry || !HighlightCtor) return;

  try {
    ensurePersistentHighlightStyle();
    const highlight = new HighlightCtor(lastSelection.range.cloneRange());
    registry.set(PERSISTENT_SELECTION_HIGHLIGHT_KEY, highlight);
  } catch {
    // No-op on unsupported browsers or stale ranges.
  }
}

export function clearPersistentSelectionHighlight(): void {
  const registry = getHighlightRegistry();
  if (!registry) return;
  registry.delete(PERSISTENT_SELECTION_HIGHLIGHT_KEY);
}
