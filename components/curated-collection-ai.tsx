"use client";

import { LibraryAIAssistant } from "@/components/library-ai-assistant";
import type { AIScope } from "@/components/library-ai-assistant";

interface CuratedCollectionAIProps {
  collectionName: string;
  bookIds: string[];
  prefillQuestion?: string | null;
  forceOpen?: boolean;
}

export function CuratedCollectionAI({ collectionName, bookIds, prefillQuestion, forceOpen }: CuratedCollectionAIProps) {
  const scope: AIScope = {
    type: "collection",
    id: `curated-${collectionName}`,
    name: collectionName,
    bookIds,
  };

  return (
    <LibraryAIAssistant
      bookIds={bookIds}
      aiScope={scope}
      onAiScopeChange={() => {}}
      buttonLabel="Ask across collection"
      prefillQuestion={prefillQuestion}
      forceOpen={forceOpen}
    />
  );
}
