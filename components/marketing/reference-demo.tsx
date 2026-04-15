"use client";

import { useCallback } from "react";
import { Markdown, type PassageRef, type SectionBookInfo } from "@/components/markdown";

const NIETZSCHE_QUOTE_MD = `His central claim is genealogical: the doctrine of free will was invented to justify **blame**, **guilt**, and **punishment**. He says:

["The doctrine of the will was invented principally for the purpose of punishment,—that is to say, with the intention of tracing guilt."](ref:6f8f4589-e729-4cda-855c-9e77587233a0?ro=1&pos=95&bid=42acdbf9-5289-43d3-a2b5-6ea6f839f613)`;

const SECTION_BOOK_MAP = new Map<string, SectionBookInfo>([
  [
    "6f8f4589-e729-4cda-855c-9e77587233a0",
    {
      bookId: "42acdbf9-5289-43d3-a2b5-6ea6f839f613",
      bookLabel: "The Twilight of the Idols",
      bookAuthor: "Friedrich Wilhelm Nietzsche",
      bookType: "epub",
    },
  ],
]);

export function ReferenceDemo() {
  const handleRefClick = useCallback((ref: PassageRef) => {
    const bid = ref.bookId ?? "42acdbf9-5289-43d3-a2b5-6ea6f839f613";
    const url = `/read/${bid}?refSection=${encodeURIComponent(ref.sectionId)}&refQuote=${encodeURIComponent(ref.quotedText ?? "")}`;
    window.open(url, "_blank", "noreferrer");
  }, []);

  return (
    <Markdown
      content={NIETZSCHE_QUOTE_MD}
      sectionBookMap={SECTION_BOOK_MAP}
      onRefClick={handleRefClick}
    />
  );
}
