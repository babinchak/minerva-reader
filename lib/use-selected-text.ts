import { useEffect, useState } from "react";
import {
  captureSelection,
  clearPersistentSelectionHighlight,
  isCurrentSelectionInAIPane,
  showPersistentSelectionHighlight,
} from "@/lib/book-position-utils";

function isEditableElement(node: Element | null): boolean {
  if (!node) return false;
  const htmlNode = node as HTMLElement;
  return (
    htmlNode.isContentEditable ||
    node.tagName === "INPUT" ||
    node.tagName === "TEXTAREA"
  );
}

export function useSelectedText(): string {
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    const handleSelection = () => {
      // Don't let the reader-selection tracking interfere with selecting/copying AI output.
      if (isCurrentSelectionInAIPane()) return;
      const nextSelection = captureSelection();
      if (nextSelection) {
        showPersistentSelectionHighlight();
        setSelectedText(nextSelection);
        return;
      }

      const activeElement = document.activeElement;
      const isTypingInAIPane = Boolean(
        activeElement?.closest("[data-ai-pane='true']") && isEditableElement(activeElement)
      );

      // Keep the last reader selection while the user types in the AI input.
      setSelectedText((prev) => {
        if (isTypingInAIPane) {
          return prev;
        }
        clearPersistentSelectionHighlight();
        return "";
      });
    };

    const watchedDocs = new Set<Document>();
    const iframeLoadHandlers = new Map<HTMLIFrameElement, () => void>();

    const attachSelectionListener = (targetDoc: Document | null | undefined) => {
      if (!targetDoc || watchedDocs.has(targetDoc)) return;
      targetDoc.addEventListener("selectionchange", handleSelection);
      watchedDocs.add(targetDoc);
    };

    const attachIframeSelectionListener = (iframe: HTMLIFrameElement) => {
      if (iframeLoadHandlers.has(iframe)) return;

      const handleIframeLoad = () => {
        try {
          attachSelectionListener(iframe.contentDocument ?? iframe.contentWindow?.document);
        } catch {
          // Ignore cross-origin or inaccessible iframe documents.
        }
      };

      iframe.addEventListener("load", handleIframeLoad);
      iframeLoadHandlers.set(iframe, handleIframeLoad);
      handleIframeLoad();
    };

    const syncIframeSelectionListeners = () => {
      const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
      for (const iframe of iframes) {
        if (iframe instanceof HTMLIFrameElement) {
          attachIframeSelectionListener(iframe);
        }
      }
    };

    attachSelectionListener(document);
    syncIframeSelectionListeners();

    const observer = new MutationObserver(() => {
      syncIframeSelectionListeners();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      watchedDocs.forEach((targetDoc) => {
        targetDoc.removeEventListener("selectionchange", handleSelection);
      });
      iframeLoadHandlers.forEach((handler, iframe) => {
        iframe.removeEventListener("load", handler);
      });
    };
  }, []);

  return selectedText;
}
