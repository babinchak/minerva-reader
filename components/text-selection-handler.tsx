"use client";

import { useStore } from "react-redux";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getCurrentSelectionPosition } from "@/lib/book-position-utils";

interface TextSelectionHandlerProps {
  rawManifest: { readingOrder?: Array<{ href?: string }> };
  bookId: string;
}

export function TextSelectionHandler({ rawManifest }: TextSelectionHandlerProps) {
  const readingOrder = rawManifest?.readingOrder || [];
  const store = useStore();
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);

  const handleButtonClick = () => {
    const positions = getCurrentSelectionPosition(readingOrder, store);
    
    if (!positions) {
      return;
    }

    // Log positions for debugging
    console.log("Selection start position:", positions.start);
    console.log("Selection end position:", positions.end);
    console.log("View start position:", positions.viewStart);
    console.log("View end position:", positions.viewEnd);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Debug Panel */}
      <div className="bg-background border-t border-border shadow-lg">
        {/* Panel Header - Always Visible */}
        <button
          onClick={() => setIsDebugPanelOpen(!isDebugPanelOpen)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          <span className="text-sm font-medium">Debug</span>
          {isDebugPanelOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
        
        {/* Panel Content - Collapsible */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            isDebugPanelOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-4 py-3 space-y-2">
            <Button
              onClick={handleButtonClick}
              variant="default"
              className="w-full"
            >
              Log Position
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
