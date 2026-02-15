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

    document.addEventListener("selectionchange", handleSelection);
    return () => {
      document.removeEventListener("selectionchange", handleSelection);
    };
  }, []);

  return selectedText;
}
