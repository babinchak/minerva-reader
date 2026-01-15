import { TextSelectionResult } from "@/lib/book-position/types";

// Utility function to get text selection from main document or iframe
export function getTextSelection(): TextSelectionResult | null {
  // Try to get selection from the main document first
  let selection: Selection | null = window.getSelection();
  let range: Range | null = null;
  let targetDoc: Document = document;

  // Check if selection is valid in main document
  if (selection && selection.rangeCount > 0 && selection.toString().trim() !== "") {
    range = selection.getRangeAt(0);
    return { selection, range, targetDoc };
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
