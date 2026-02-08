"use client";

import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AIRailProps {
  selectedText?: string;
  onActivate: (action: "page" | "selection") => void;
}

export function AIRail({ selectedText, onActivate }: AIRailProps) {
  const selectionExists = Boolean(selectedText && selectedText.trim().length > 0);
  const action: "page" | "selection" = selectionExists ? "selection" : "page";
  const title = selectionExists ? "Explain selection" : "Explain page";

  return (
    <div className="fixed right-0 top-1/2 z-50 -translate-y-1/2">
      <Button
        type="button"
        variant="outline"
        onClick={() => onActivate(action)}
        title={title}
        aria-label={title}
        className="h-24 w-12 rounded-l-xl rounded-r-none border-r-0 bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70 flex flex-col items-center justify-center gap-2 px-2"
      >
        <Bot className="h-5 w-5" />
        {selectionExists && (
          <span className="text-[10px] leading-tight text-center font-medium">
            Explain
            <br />
            selection
          </span>
        )}
      </Button>
    </div>
  );
}

