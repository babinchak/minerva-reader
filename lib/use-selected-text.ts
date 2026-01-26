import { useEffect, useState } from "react";
import { getSelectedText } from "@/lib/book-position-utils";

export function useSelectedText(): string {
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    const handleSelection = () => {
      setSelectedText(getSelectedText());
    };

    document.addEventListener("selectionchange", handleSelection);
    return () => {
      document.removeEventListener("selectionchange", handleSelection);
    };
  }, []);

  return selectedText;
}
