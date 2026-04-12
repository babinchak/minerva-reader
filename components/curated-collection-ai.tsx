"use client";

import { useState } from "react";
import { LibraryAIAssistant } from "@/components/library-ai-assistant";
import type { AIScope } from "@/components/library-ai-assistant";

interface CuratedCollectionAIProps {
  collectionId: string;
  collectionName: string;
  bookIds: string[];
  curatedCollections?: { id: string; name: string; bookCount: number; bookIds: string[] }[];
  allCuratedBookIds?: string[];
  prefillQuestion?: string | null;
  forceOpen?: boolean;
}

export function CuratedCollectionAI({
  collectionId,
  collectionName,
  bookIds,
  curatedCollections,
  allCuratedBookIds,
  prefillQuestion,
  forceOpen,
}: CuratedCollectionAIProps) {
  const [aiScope, setAiScope] = useState<AIScope>({
    type: "curated-collection",
    id: collectionId,
    name: collectionName,
    bookIds,
  });

  const effectiveBookIds = aiScope.type === "curated-collection"
    ? aiScope.bookIds
    : aiScope.type === "curated-library"
      ? (aiScope.bookIds ?? [])
      : bookIds;

  return (
    <LibraryAIAssistant
      bookIds={effectiveBookIds}
      curatedCollections={curatedCollections}
      allCuratedBookIds={allCuratedBookIds}
      aiScope={aiScope}
      onAiScopeChange={setAiScope}
      buttonLabel="Ask across collection"
      prefillQuestion={prefillQuestion}
      forceOpen={forceOpen}
    />
  );
}
