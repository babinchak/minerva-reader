"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Markdown, type PassageRef } from "@/components/markdown";
import { ToolCallSteps } from "@/components/tool-call-steps";
import type { DemoChatEntry } from "@/lib/demo-chat-data";
import { cn } from "@/lib/utils";

export interface DemoAIPanelProps {
  bookId: string;
  demoEntries: DemoChatEntry[];
  onNavigateToRef?: (ref: {
    page?: number;
    readingOrderIndex?: number;
    quotedText?: string;
  }) => void;
  onClose?: () => void;
  className?: string;
}

export function DemoAIPanel({
  bookId,
  demoEntries,
  onNavigateToRef,
  onClose,
  className,
}: DemoAIPanelProps) {
  const [playedEntries, setPlayedEntries] = useState<
    { question: string; toolCalls: DemoChatEntry["toolCalls"]; streamedText: string; done: boolean }[]
  >([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [visibleToolCalls, setVisibleToolCalls] = useState(0);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, []);

  const playEntry = useCallback(
    async (entry: DemoChatEntry) => {
      if (isStreaming) return;
      cancelRef.current = false;
      setIsStreaming(true);
      setVisibleToolCalls(0);

      // Add the new entry
      setPlayedEntries((prev) => [
        ...prev,
        { question: entry.question, toolCalls: entry.toolCalls, streamedText: "", done: false },
      ]);
      scrollToBottom();

      // Phase 1: Reveal tool calls one by one
      for (let i = 0; i < entry.toolCalls.length; i++) {
        if (cancelRef.current) break;
        await delay(400);
        setVisibleToolCalls(i + 1);
        scrollToBottom();
      }

      // Phase 2: Stream answer character by character
      const text = entry.answer;
      let pos = 0;
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (cancelRef.current) {
            clearInterval(interval);
            resolve();
            return;
          }
          // Stream 1-3 chars at a time for natural feel
          pos += 1 + Math.floor(Math.random() * 2);
          if (pos >= text.length) {
            setPlayedEntries((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                streamedText: text,
                done: true,
              };
              return updated;
            });
            clearInterval(interval);
            resolve();
          } else {
            setPlayedEntries((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                streamedText: text.slice(0, pos),
              };
              return updated;
            });
          }
          scrollToBottom();
        }, 15);
      });

      setIsStreaming(false);
      setVisibleToolCalls(0);
    },
    [isStreaming, scrollToBottom]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const handleRefClick = useCallback(
    (ref: PassageRef) => {
      onNavigateToRef?.({
        page: ref.page,
        readingOrderIndex: ref.readingOrderIndex,
        quotedText: ref.quotedText,
      });
    },
    [onNavigateToRef]
  );

  // Which questions are still available (not yet played)
  const playedQuestions = new Set(playedEntries.map((e) => e.question));
  const remainingEntries = demoEntries.filter((e) => !playedQuestions.has(e.question));

  const questionChips = (
    <div className="space-y-2">
      {remainingEntries.map((entry) => (
        <button
          key={entry.question}
          type="button"
          disabled={isStreaming}
          onClick={() => playEntry(entry)}
          className={cn(
            "w-full text-left rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm transition-colors",
            isStreaming
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-accent hover:border-accent-foreground/20"
          )}
        >
          {entry.question}
        </button>
      ))}
    </div>
  );

  return (
    <div className={cn("flex flex-col bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium text-foreground">Minerva AI</span>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
            Demo
          </span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-foreground"
            aria-label="Close AI assistant"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages area */}
      {playedEntries.length === 0 ? (
        <div className="flex-1 flex flex-col justify-start pt-6 px-4 min-h-0 overflow-y-auto">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Try asking Minerva about this book
            </p>
            {questionChips}
          </div>
        </div>
      ) : (
        <div
          ref={messagesRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {playedEntries.map((entry, groupIndex) => {
            const isLast = groupIndex === playedEntries.length - 1;

            return (
              <div
                key={`demo-${groupIndex}`}
                className="space-y-4"
                style={isLast ? { minHeight: "100%" } : undefined}
              >
                {/* User message */}
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex justify-end w-full max-w-[85%]">
                    <Card className="p-3 bg-primary text-primary-foreground">
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {entry.question}
                      </p>
                    </Card>
                  </div>
                </div>

                {/* Tool calls */}
                {entry.toolCalls.length > 0 && (isLast ? visibleToolCalls > 0 : true) && (
                  <div className="w-full text-left">
                    <ToolCallSteps
                      toolCalls={
                        isLast && !entry.done
                          ? entry.toolCalls.slice(0, visibleToolCalls).map((tc, i) => ({
                              ...tc,
                              id: `demo-tc-${groupIndex}-${i}`,
                            }))
                          : entry.toolCalls.map((tc, i) => ({
                              ...tc,
                              id: `demo-tc-${groupIndex}-${i}`,
                            }))
                      }
                    />
                  </div>
                )}

                {/* Assistant response */}
                {entry.streamedText && (
                  <div className="w-full text-foreground select-text">
                    <Markdown
                      content={entry.streamedText}
                      bookId={bookId}
                      onRefClick={handleRefClick}
                    />
                  </div>
                )}

                {/* Typing indicator */}
                {isLast && isStreaming && !entry.streamedText && visibleToolCalls >= entry.toolCalls.length && (
                  <div className="flex gap-1">
                    <div className="h-2 w-2 bg-foreground rounded-full animate-bounce" />
                    <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Remaining question chips after messages */}
          {!isStreaming && remainingEntries.length > 0 && (
            <div className="pt-2">
              {questionChips}
            </div>
          )}
        </div>
      )}

      {/* Disabled composer */}
      <div className="p-4 border-t border-border shrink-0">
        <div className="flex gap-2">
          <Input
            disabled
            placeholder="Sign in to ask your own questions"
            className="flex-1 opacity-60"
          />
          <Button disabled size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
