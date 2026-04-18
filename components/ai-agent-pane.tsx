"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { X, Send, Square, Plus, Clock, MessageSquare, Zap, Sparkles, Loader2, ChevronRight, Highlighter, AlertCircle, FolderOpen, Trash2, EyeOff, ExternalLink, BookOpenText } from "lucide-react";
import { StreamingMarkdown, type SectionBookInfo, type PassageRef } from "@/components/markdown";
import { ToolCallSteps, formatToolLabel, getQueryPreview, type MessageToolCall } from "@/components/tool-call-steps";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getCurrentSelectionPosition,
  querySummariesForPosition,
  getSelectedText,
  getLiveSelectedText,
  isCurrentSelectionInAIPane,
} from "@/lib/book-position-utils";
import { getCurrentPdfSelectionPosition } from "@/lib/pdf-position/selection-position";
import { getCurrentPdfPageContext } from "@/lib/pdf-position/page-context";
import { queryPdfSummariesForPosition } from "@/lib/pdf-position/summaries";
import { getPdfLocalContextAroundCurrentSelection } from "@/lib/pdf-position/local-context";
import { getPdfLocalContextFromDocument } from "@/lib/pdf-position/local-context-from-document";
import { getEpubVisibleContext, getEpubVisibleContextWithPosition } from "@/lib/epub-visible-context";
import { getEpubLocalContextAroundCurrentSelection } from "@/lib/book-position/local-context";
import { resolveQuotePage, resolveQuoteReadingOrder } from "@/lib/resolve-quote-page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hapticLight, hapticHeader } from "@/lib/haptic";

const DEFAULT_MAX_EXPLAIN_SELECTION_CHARS = 4000;
const MAX_EXPLAIN_SELECTION_CHARS = (() => {
  const raw = process.env.NEXT_PUBLIC_MAX_EXPLAIN_SELECTION_CHARS;
  if (!raw) return DEFAULT_MAX_EXPLAIN_SELECTION_CHARS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_EXPLAIN_SELECTION_CHARS;
  return Math.max(0, parsed);
})();

// MessageToolCall, ToolCallSteps, formatToolLabel, getQueryPreview imported from @/components/tool-call-steps

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  selectionPositionLabel?: string;
  selectionPositionTitle?: string;
  toolCalls?: MessageToolCall[];
}

interface ChatInputProps {
  initialValue?: string | null;
  placeholder: string;
  loading: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
  variant: "empty-state" | "bottom";
}

function ChatInput({ initialValue, placeholder, loading, onSubmit, onStop, variant }: ChatInputProps) {
  const [input, setInput] = useState(initialValue ?? "");

  const submit = () => {
    if (!input.trim() || loading) return;
    const text = input;
    setInput("");
    onSubmit(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (loading) return;
      submit();
    }
  };

  const textareaClass =
    variant === "empty-state"
      ? "flex-1 min-h-[36px] max-h-[80px] resize-none overflow-y-auto py-2 bg-muted/50 shadow-md border-border dark:bg-muted dark:border-muted-foreground/30 dark:shadow-none"
      : "flex-1 min-h-[36px] max-h-[80px] resize-none overflow-y-auto py-2";

  return (
    <div className="flex gap-2">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        style={{ fieldSizing: "content" } as React.CSSProperties}
        className={textareaClass}
      />
      {loading ? (
        <Button onClick={onStop} size="icon" aria-label="Stop generating" title="Stop generating">
          <Square className="h-3 w-3 fill-current" />
        </Button>
      ) : (
        <Button onClick={submit} disabled={!input.trim()} size="icon" aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface MessageGroupProps {
  user: AIMessage;
  assistant?: AIMessage;
  isLastGroup: boolean;
  isLastAssistant: boolean;
  isStreaming: boolean;
  bookId?: string;
  sectionBookMap?: Map<string, SectionBookInfo>;
  onRefClick: (ref: PassageRef) => void;
  activeChatId?: string | null;
}

const MessageGroup = memo(function MessageGroup({
  user,
  assistant,
  isLastGroup,
  isLastAssistant,
  isStreaming,
  bookId,
  sectionBookMap,
  onRefClick,
  activeChatId,
}: MessageGroupProps) {
  return (
    <div
      data-user-message
      className="space-y-4"
      style={isLastGroup ? { minHeight: "100%" } : undefined}
    >
      <div className="flex flex-col gap-2 items-end">
        <div className="flex justify-end w-full max-w-[85%]">
          <Card className="p-3 bg-primary text-primary-foreground">
            <p className="text-sm whitespace-pre-wrap break-words">
              {user.content}
            </p>
            {user.selectionPositionLabel && (
              <div className="mt-2">
                <span
                  title={user.selectionPositionTitle}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-primary-foreground/80 border-primary-foreground/40 bg-primary-foreground/10"
                >
                  {user.selectionPositionLabel}
                </span>
              </div>
            )}
          </Card>
        </div>
      </div>

      {assistant && (
        <div className="flex flex-col gap-2 w-full">
          {assistant.toolCalls && assistant.toolCalls.length > 0 && (
            <div className="w-full text-left">
              <ToolCallSteps toolCalls={assistant.toolCalls} />
            </div>
          )}
          <div className="w-full text-foreground select-text">
            {assistant.content.trim() ? (
              <StreamingMarkdown
                isStreaming={isLastAssistant}
                content={assistant.content}
                bookId={bookId}
                sectionBookMap={sectionBookMap}
                onRefClick={onRefClick}
                chatId={activeChatId}
              />
            ) : isStreaming ? (
              <div className="flex gap-1">
                <div className="h-2 w-2 bg-foreground rounded-full animate-bounce" />
                <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            ) : null}
            {assistant.selectionPositionLabel && (
              <div className="mt-2">
                <span
                  title={assistant.selectionPositionTitle}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-foreground/80 border-border bg-muted"
                >
                  {assistant.selectionPositionLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export interface AIAgentPanelProps {
  selectedText?: string;
  bookId?: string;
  /** When set, enables library mode: searches across multiple books instead of a single book. */
  bookIds?: string[];
  rawManifest?: { readingOrder?: Array<{ href?: string }> };
  bookType?: "epub" | "pdf";
  autoRun?: { nonce: number; action: "page" | "selection" } | null;
  /**
   * If true, when sending a typed question we will include the currently selected text as context.
   * Intended for mobile quick-action UX.
   */
  includeSelectionContextOnSend?: boolean;
  /**
   * UI visibility controls for embedding the panel in compact shells (e.g. mobile quick state).
   */
  showHeader?: boolean;
  showMessages?: boolean;
  showSelectedTextBanner?: boolean;
  /**
   * Current PDF page number (1-based). Enables page context to be included when user types a question.
   */
  currentPage?: number;
  /** PDF document for extracting local context from arbitrary pages (not just DOM). */
  pdfDocument?: PDFDocumentProxy | null;
  /**
   * Notified when a user-triggered action starts (send/explain).
   * Useful for shells (e.g. mobile quick state) to expand UI to show the response.
   */
  onActionStart?: () => void;
  /**
   * Notified when the assistant finishes responding (success or error).
   */
  onActionComplete?: () => void;
  /**
   * Container class for layout shell (docked/overlay/bottom sheet).
   */
  className?: string;
  /**
   * If provided, show a close button in the header.
   */
  onClose?: () => void;
  /**
   * Called when the user clicks a navigable reference (ref: link) in an AI response.
   * The parent reader should navigate to the position and highlight the text.
   */
  onNavigateToRef?: (ref: { page?: number; readingOrderIndex?: number; quotedText?: string }) => void;
  /** Initial chat ID to load on mount (e.g. from "open in new tab" URL param). */
  initialChatId?: string | null;
  /** Quoted text from the navigable reference that triggered the new tab. Used to scroll to the reference after loading. */
  initialRefQuote?: string | null;
  /** Available collections for the scope dropdown in library mode. */
  collections?: { id: string; name: string; bookCount: number; bookIds: string[] }[];
  /** Available curated collections for the scope dropdown in library mode. */
  curatedCollections?: { id: string; name: string; bookCount: number; bookIds: string[] }[];
  /** All curated book IDs (for "Curated Library" scope). */
  allCuratedBookIds?: string[];
  /** Current AI search scope. */
  aiScope?: { type: "library" } | { type: "collection"; id: string; name: string; bookIds: string[] } | { type: "curated-library"; bookIds: string[] } | { type: "curated-collection"; id: string; name: string; bookIds: string[] };
  /** Called when user changes scope in the dropdown. */
  onAiScopeChange?: (scope: { type: "library" } | { type: "collection"; id: string; name: string; bookIds: string[] } | { type: "curated-library"; bookIds: string[] } | { type: "curated-collection"; id: string; name: string; bookIds: string[] }) => void;
  /** Pre-fill the composer with this question on mount. */
  prefillQuestion?: string | null;
}

interface SummaryContext {
  summary_type?: "book" | "chapter" | "subchapter";
  toc_title: string;
  chapter_path: string;
  summary_text: string | null;
}

interface ContextApiSummary {
  summary_type: "book" | "chapter" | "subchapter";
  toc_title: string;
  chapter_path: string;
  start_position: string | null;
  end_position: string | null;
  summary_text: string | null;
}

interface SelectionSnapshot {
  text: string;
  pdfPosition?: { start: string; end: string };
  epubPosition?: { start: string; end: string };
}

function isLikelyValidEpubPosition(pos: { start: string; end: string } | undefined): boolean {
  if (!pos) return false;
  const isValid = (value: string) => {
    if (!value || value.includes("unknown")) return false;
    const parts = value.split("/");
    if (parts.length < 3) return false;
    return parts.every((part) => /^\d+$/.test(part));
  };
  return isValid(pos.start) && isValid(pos.end);
}

function isLikelyValidPdfPosition(pos: { start: string; end: string } | undefined): boolean {
  if (!pos) return false;
  const isValid = (value: string) => {
    // Accept both page-only ("5") and legacy "5/12/0" formats
    const parts = value.split(/[/:]/);
    return parts.length >= 1 && parts.every((part) => /^\d+$/.test(part));
  };
  return isValid(pos.start) && isValid(pos.end);
}

function formatSelectionPositionLabel(
  start: string,
  end: string
): { label: string; title: string } {
  const parseThreePart = (pos: string): { a: number; b: number; c: number } | null => {
    const parts = pos.split(/[/:]/).map((p) => parseInt(p, 10));
    if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) return null;
    return { a: parts[0], b: parts[1], c: parts[2] };
  };

  // PDF positions look like: page/itemIndex/charOffset (we display page:itemIndex).
  const start3 = parseThreePart(start);
  const end3 = parseThreePart(end);
  if (start3 && end3) {
    const label = `(${start3.a}:${start3.b}-${end3.a}:${end3.b})`;
    const title = `start=${start} end=${end}`;
    return { label, title };
  }

  // EPUB positions look like: readingOrderIndex/path/charOffset (we keep it, but make it compact-ish).
  const compact = (pos: string) => pos.replaceAll("/", ":");
  const label = `(${compact(start)}-${compact(end)})`;
  const title = `start=${start} end=${end}`;
  return { label, title };
}

export function AIAgentPanel({
  selectedText,
  bookId,
  bookIds,
  rawManifest,
  bookType = "epub",
  autoRun = null,
  includeSelectionContextOnSend = false,
  showHeader = true,
  showMessages = true,
  showSelectedTextBanner = true,
  currentPage,
  pdfDocument,
  onActionStart,
  onActionComplete,
  className,
  onClose,
  onNavigateToRef,
  initialChatId,
  initialRefQuote,
  collections: collectionsProp,
  curatedCollections: curatedCollectionsProp,
  allCuratedBookIds,
  aiScope,
  onAiScopeChange,
  prefillQuestion,
}: AIAgentPanelProps) {
  const lastAutoRunNonceRef = useRef<number | null>(null);

  const normalizedSelectedText = selectedText ?? "";
  const trimmedSelectedText = normalizedSelectedText.trim();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [bookTitle, setBookTitle] = useState<string>("");
  const [bookAuthor, setBookAuthor] = useState<string>("");
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId ?? null);
  const [chats, setChats] = useState<
    { id: string; book_id: string | null; created_at: string; title: string | null }[]
  >([]);
  const [userId, setUserId] = useState<string | null>(null);
  const isLibraryMode = !bookId && Array.isArray(bookIds) && bookIds.length > 0;
  const [chatMode, setChatMode] = useState<"fast" | "agentic">(() => {
    if (isLibraryMode) return "agentic";
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("minerva-chat-mode");
      if (stored === "fast" || stored === "agentic") return stored;
    }
    return "fast";
  });
  const [isPrivateChat, setIsPrivateChat] = useState(false);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);
  const sendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Server-assigned chat_messages.id for the in-flight assistant response, if persisted. */
  const assistantMessageIdRef = useRef<string | null>(null);

  const handleStop = useCallback(async () => {
    // Tell the server to abort upstream LLM generation — distinguished from a
    // tab-close, which deliberately does NOT trigger this endpoint so the
    // response still completes and persists for later viewing.
    const id = assistantMessageIdRef.current;
    if (id) {
      try {
        await fetch("/api/chat/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assistantMessageId: id }),
        });
      } catch {
        // Best-effort — even if the stop signal fails, the local abort below
        // still stops the user from seeing further tokens.
      }
    }
    abortControllerRef.current?.abort();
  }, []);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const initialRefScrolledRef = useRef(false);
  /** Map of section_id → section data for resolving navigable references to pages. */
  const sectionCacheRef = useRef<Map<string, { startPosition: string; pageBreaks: number[] | null; xhtmlBreaks: number[] | null; contentText: string | null }>>(new Map());
  /** Map of section_id → book info for library mode (which book each section belongs to). */
  const [sectionBookMap, setSectionBookMap] = useState<Map<string, SectionBookInfo>>(new Map());
  /** Derived bookId → {label, author} map for tool call display. */
  const supabase = createClient();

  const getSelectionSnapshot = useCallback((): SelectionSnapshot | null => {
    const liveText = getLiveSelectedText().trim();
    const remembered = selectionSnapshotRef.current;
    if (liveText) {
      const sameAsRemembered = remembered?.text === liveText;
      const snapshot: SelectionSnapshot = {
        text: liveText,
        pdfPosition: sameAsRemembered ? remembered?.pdfPosition : undefined,
        epubPosition: sameAsRemembered ? remembered?.epubPosition : undefined,
      };
      if (bookType === "pdf") {
        const pos = getCurrentPdfSelectionPosition() ?? undefined;
        if (isLikelyValidPdfPosition(pos)) {
          snapshot.pdfPosition = pos;
        }
      } else {
        const readingOrder = rawManifest?.readingOrder || [];
        const pos = getCurrentSelectionPosition(readingOrder, null) ?? undefined;
        if (isLikelyValidEpubPosition(pos)) {
          snapshot.epubPosition = pos;
        }
      }
      selectionSnapshotRef.current = snapshot;
      return snapshot;
    }

    if (trimmedSelectedText && remembered?.text?.trim()) {
      return remembered;
    }

    if (!trimmedSelectedText) return null;
    return { text: trimmedSelectedText };
  }, [bookType, rawManifest?.readingOrder, trimmedSelectedText]);

  useEffect(() => {
    if (!trimmedSelectedText) return;
    void getSelectionSnapshot();
  }, [trimmedSelectedText, getSelectionSnapshot]);

  useEffect(() => {
    if (!trimmedSelectedText) {
      selectionSnapshotRef.current = null;
    }
  }, [trimmedSelectedText]);

  useEffect(() => {
    const onSelectionChange = () => {
      if (isCurrentSelectionInAIPane()) return;
      const liveText = getLiveSelectedText().trim();
      if (!liveText) return;

      const previous = selectionSnapshotRef.current;
      const sameAsPrevious = previous?.text === liveText;
      const next: SelectionSnapshot = {
        text: liveText,
        pdfPosition: sameAsPrevious ? previous?.pdfPosition : undefined,
        epubPosition: sameAsPrevious ? previous?.epubPosition : undefined,
      };

      if (bookType === "pdf") {
        const pos = getCurrentPdfSelectionPosition() ?? undefined;
        if (isLikelyValidPdfPosition(pos)) {
          next.pdfPosition = pos;
        }
      } else {
        const readingOrder = rawManifest?.readingOrder || [];
        const pos = getCurrentSelectionPosition(readingOrder, null) ?? undefined;
        if (isLikelyValidEpubPosition(pos)) {
          next.epubPosition = pos;
        }
      }

      selectionSnapshotRef.current = next;
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [bookType, rawManifest?.readingOrder]);

  type StreamUsage = {
    inputTokens?: number | null;
    outputTokens?: number | null;
    costDollars: number;
    model?: string;
    chatMode?: string;
  };

  // Credits/tier info. Fetch for both logged-in and anonymous (freeBetaMode).
  const [creditsInfo, setCreditsInfo] = useState<{
    tier: string;
    includedBalance: number;
    extraUsageBalance: number;
    allowanceDollars: number;
    freeBetaMode?: boolean;
  } | null>(null);

  const refreshCredits = useCallback(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d
          ? {
              tier: d.tier,
              includedBalance: d.includedBalance ?? 0,
              extraUsageBalance: d.extraUsageBalance ?? 0,
              allowanceDollars: d.allowanceDollars ?? 0,
              freeBetaMode: d.freeBetaMode ?? false,
            }
          : null
      )
      .then(setCreditsInfo)
      .catch(() => setCreditsInfo(null));
  }, []);

  // Helper function to handle streaming response
  const handleStreamingResponse = useCallback(
    async (
      response: Response,
      assistantMessageId: string,
      onStreamComplete?: (content: string, usage?: StreamUsage, toolCalls?: MessageToolCall[]) => void | Promise<void>,
      onStatus?: (message: string | null) => void,
      signal?: AbortSignal,
      onAssistantMessageId?: (id: string) => void
    ) => {
      if (!response.ok) {
        let message = response.statusText;
        try {
          const body = await response.json();
          if (body?.usageDenied) {
            setUsageDeniedInfo({
              reason: body.reason ?? "no_credits",
              resetAt: body.resetAt ?? null,
              tier: body.tier ?? "free",
              extraUsageBalance: body.extraUsageBalance ?? 0,
              onDemandLimitType: body.onDemandLimitType ?? "disabled",
              onDemandLimitDollars: body.onDemandLimitDollars ?? 0,
              extraUsageSpent: body.extraUsageSpent ?? 0,
            });
            setCreditsExhaustedDialogOpen(true);
            throw new Error("Usage limit reached");
          }
          if (body?.message) message = body.message;
          else if (body?.error) message = body.error;
        } catch (e) {
          if (e instanceof Error && e.message === "Usage limit reached") throw e;
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let streamUsage: StreamUsage | undefined;
      const accumulatedToolCalls: MessageToolCall[] = [];

      const finalizeAbort = async () => {
        onStatus?.(null);
        await onStreamComplete?.(fullContent, streamUsage, accumulatedToolCalls);
        setIsLoading(false);
        onActionComplete?.();
      };

      while (true) {
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch (err) {
          if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
            await finalizeAbort();
            return;
          }
          throw err;
        }
        if (signal?.aborted) {
          await finalizeAbort();
          return;
        }
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              onStatus?.(null);
              await onStreamComplete?.(fullContent, streamUsage, accumulatedToolCalls);
              setIsLoading(false);
              onActionComplete?.();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "assistant_message_id" && typeof parsed.id === "string") {
                onAssistantMessageId?.(parsed.id);
              } else if (parsed.type === "tool_call" && typeof parsed.toolName === "string") {
                const tc: MessageToolCall = {
                  toolName: parsed.toolName,
                  args: parsed.args && typeof parsed.args === "object" ? parsed.args : {},
                  id: typeof parsed.id === "string" ? parsed.id : undefined,
                };
                accumulatedToolCalls.push(tc);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, toolCalls: [...(msg.toolCalls ?? []), tc] }
                      : msg
                  )
                );
              } else if (parsed.type === "section_map") {
                // section_map events from stream — cache for quick lookups
                if (typeof parsed.sectionId === "string") {
                  sectionCacheRef.current.set(parsed.sectionId, {
                    startPosition: parsed.startPosition,
                    pageBreaks: parsed.pageBreaks ?? null,
                    xhtmlBreaks: parsed.xhtmlBreaks ?? null,
                    contentText: parsed.contentText ?? null,
                  });
                  // In library mode, track which book each section belongs to
                  if (parsed.bookId && typeof parsed.bookId === "string") {
                    setSectionBookMap((prev) => {
                      const next = new Map(prev);
                      // bookLabel from stream is "Title by Author" — strip the " by Author" suffix
                      // since we now track author separately for compact metadata display
                      const rawLabel: string = parsed.bookLabel ?? "Unknown book";
                      const author: string | null = parsed.bookAuthor ?? null;
                      const titleOnly = author && rawLabel.endsWith(` by ${author}`)
                        ? rawLabel.slice(0, -` by ${author}`.length)
                        : rawLabel;
                      next.set(parsed.sectionId, {
                        bookId: parsed.bookId,
                        bookLabel: titleOnly,
                        bookAuthor: author,
                        bookType: parsed.bookType ?? null,
                      });
                      return next;
                    });
                  }
                }
              } else if (parsed.type === "tool_result_summary" && typeof parsed.toolCallId === "string") {
                // Attach search result summary to the matching tool call
                const summary = Array.isArray(parsed.results) ? parsed.results : [];
                const tcId = parsed.toolCallId;
                // Update in accumulated list
                const matchedTc = accumulatedToolCalls.find((t) => t.id === tcId);
                if (matchedTc) matchedTc.resultSummary = summary;
                // Update in rendered messages
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId && msg.toolCalls
                      ? {
                          ...msg,
                          toolCalls: msg.toolCalls.map((t) =>
                            t.id === tcId ? { ...t, resultSummary: summary } : t
                          ),
                        }
                      : msg
                  )
                );
              } else if (parsed.type === "status" && typeof parsed.message === "string") {
                onStatus?.(parsed.message);
              } else if (parsed.type === "usage") {
                streamUsage = {
                  inputTokens: parsed.inputTokens,
                  outputTokens: parsed.outputTokens,
                  costDollars: parsed.costDollars ?? 0,
                  model: parsed.model,
                  chatMode: parsed.chatMode,
                };
              } else if (parsed.content) {
                fullContent += parsed.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + parsed.content }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }

      onStatus?.(null);
      await onStreamComplete?.(fullContent, streamUsage, accumulatedToolCalls);
      setIsLoading(false);
      onActionComplete?.();
    },
    [onActionComplete, refreshCredits]
  );

  /** Resolve a section_id ref to a page number + quoted text, then delegate to parent handler. */
  /** Fetch section data — check in-memory cache first, then hit API. */
  const fetchSection = useCallback(
    async (sectionId: string): Promise<{ startPosition: string; pageBreaks: number[] | null; xhtmlBreaks: number[] | null; contentText: string | null } | null> => {
      const cached = sectionCacheRef.current.get(sectionId);
      if (cached) return cached;

      try {
        // In library mode, use the bookId-free sections endpoint; otherwise use the per-book endpoint
        const url = bookId
          ? `/api/books/${bookId}/sections?sectionId=${encodeURIComponent(sectionId)}`
          : `/api/sections?sectionId=${encodeURIComponent(sectionId)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const section = {
          startPosition: data.startPosition as string,
          pageBreaks: (data.pageBreaks as number[] | null) ?? null,
          xhtmlBreaks: (data.xhtmlBreaks as number[] | null) ?? null,
          contentText: (data.contentText as string | null) ?? null,
        };
        sectionCacheRef.current.set(sectionId, section);
        // If response includes book info (library mode), update sectionBookMap
        if (data.bookId && typeof data.bookId === "string") {
          setSectionBookMap((prev) => {
            const next = new Map(prev);
            next.set(sectionId, {
              bookId: data.bookId,
              bookLabel: data.bookTitle ?? "Unknown book",
              bookAuthor: data.bookAuthor ?? null,
              bookType: data.bookType ?? null,
            });
            return next;
          });
        }
        return section;
      } catch {
        return null;
      }
    },
    [bookId]
  );

  const handleRefClick = useCallback(
    (ref: PassageRef) => {
      // In library mode, refs open in new tab via the Markdown component's <a> tag,
      // so this handler is only used for single-book mode navigation.
      if (isLibraryMode) return;
      if (!onNavigateToRef) return;

      // Use enriched ref data if available (baked in by server-side proxy)
      if (ref.page != null) {
        onNavigateToRef({ page: ref.page, quotedText: ref.quotedText });
        return;
      }
      if (ref.readingOrderIndex != null) {
        onNavigateToRef({ readingOrderIndex: ref.readingOrderIndex, quotedText: ref.quotedText });
        return;
      }

      // Fallback for old messages without enriched refs — async section lookup
      (async () => {
        const section = await fetchSection(ref.sectionId);
        if (!section) return;

        if (bookType === "epub") {
          const parts = section.startPosition.split("/");
          const startRo = parseInt(parts[0], 10);
          if (Number.isNaN(startRo)) return;
          const readingOrderIndex = resolveQuoteReadingOrder(section, startRo, ref.quotedText);
          onNavigateToRef({ readingOrderIndex, quotedText: ref.quotedText });
          return;
        }

        const page = resolveQuotePage(section, ref.quotedText);
        if (page == null) return;
        onNavigateToRef({ page, quotedText: ref.quotedText });
      })();
    },
    [onNavigateToRef, fetchSection, bookType, isLibraryMode]
  );

  const [authChecked, setAuthChecked] = useState(false);

  // Fetch current user
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      setAuthChecked(true);
    };
    init();
  }, [supabase]);

  const anonChatKey = `minerva-anon-chat-${bookId ?? (isLibraryMode ? "library" : "general")}`;

  // Anonymous: load ephemeral chat from sessionStorage (once we know we're anonymous)
  useEffect(() => {
    if (!authChecked || userId !== null || !bookId) return;
    try {
      const raw = sessionStorage.getItem(anonChatKey);
      if (raw) {
        const parsed = JSON.parse(raw) as AIMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored = parsed.map((m) => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
          }));
          setMessages(restored);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [authChecked, userId, bookId, anonChatKey]);

  // Anonymous: persist ephemeral chat to sessionStorage when messages change
  useEffect(() => {
    if (!userId && messages.length > 0 && typeof window !== "undefined") {
      try {
        const toStore = messages.map((m) => ({
          ...m,
          timestamp: m.timestamp?.toISOString?.() ?? new Date().toISOString(),
        }));
        sessionStorage.setItem(anonChatKey, JSON.stringify(toStore));
      } catch {
        // Ignore quota/parse errors
      }
    }
  }, [userId, messages, anonChatKey]);

  // Dialog shown when user runs out of usage
  interface UsageDeniedInfo {
    reason: string;
    resetAt: string | null;
    tier: string;
    extraUsageBalance: number;
    onDemandLimitType: string;
    onDemandLimitDollars: number;
    extraUsageSpent: number;
  }
  const [creditsExhaustedDialogOpen, setCreditsExhaustedDialogOpen] = useState(false);
  const [usageDeniedInfo, setUsageDeniedInfo] = useState<UsageDeniedInfo | null>(null);
  const [upgradeCheckoutLoading, setUpgradeCheckoutLoading] = useState(false);

  useEffect(() => {
    refreshCredits();
  }, [userId, refreshCredits]);

  // Anonymous: force fast mode only (unless FREE_BETA_MODE)
  useEffect(() => {
    if (authChecked && !userId && chatMode === "agentic" && !creditsInfo?.freeBetaMode) setChatMode("fast");
  }, [authChecked, userId, chatMode, creditsInfo?.freeBetaMode]);

  // Processing status: summaries and vectors (both improve AI context quality)
  const [processingStatus, setProcessingStatus] = useState<{
    summariesReady: boolean;
    vectorsReady: boolean;
    failed: boolean;
  } | null>(null);

  // Fetch book metadata and processing status when bookId is available; poll while incomplete
  // Uses API route so anonymous users can access curated books (direct Supabase hits RLS and returns 406)
  useEffect(() => {
    if (!bookId) {
      setProcessingStatus(null);
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const TIMEOUT_MS = 10 * 60 * 1000;

    const poll = async () => {
      const res = await fetch(`/api/books/${bookId}/metadata`);
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author?: string;
          summaries_processed_at?: string | null;
          vectors_processed_at?: string | null;
          created_at?: string | null;
        };
        const summariesReady = Boolean(data.summaries_processed_at);
        const vectorsReady = Boolean(data.vectors_processed_at);
        const allDone = summariesReady && vectorsReady;
        const timedOut = !allDone && data.created_at
          ? Date.now() - new Date(data.created_at).getTime() > TIMEOUT_MS
          : false;
        setBookTitle(data.title || "");
        setBookAuthor(data.author || "");
        setProcessingStatus({ summariesReady, vectorsReady, failed: timedOut });
        // Stop polling if complete or timed out
        return allDone || timedOut;
      }
      setProcessingStatus(null);
      return false;
    };

    void (async () => {
      const done = await poll();
      if (!done) {
        intervalId = setInterval(async () => {
          const complete = await poll();
          if (complete && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }, 15_000);
      }
    })();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [bookId]);

  // Fetch chats for user (filter by bookId when in a book)
  useEffect(() => {
    if (!userId) {
      setChats([]);
      return;
    }
    const fetchChats = async () => {
      let q = supabase
        .from("chats")
        .select("id, book_id, created_at, title")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (bookId) {
        q = q.or(`book_id.eq.${bookId},book_id.is.null`);
      }
      const { data } = await q;
      setChats(data ?? []);
    };
    fetchChats();
  }, [userId, bookId, supabase]);

  // Scroll so the last user message is pinned to the top of the viewport (ChatGPT-style).
  // The bottom spacer in the messages container ensures there's enough room to scroll past.
  const suppressScrollRef = useRef(false);
  const scrollToLastUserMessage = useCallback(() => {
    requestAnimationFrame(() => {
      if (suppressScrollRef.current) return;
      const container = messagesScrollRef.current;
      if (!container) return;
      const userMsgs = container.querySelectorAll("[data-user-message]");
      const last = userMsgs[userMsgs.length - 1] as HTMLElement | undefined;
      if (last) {
        // Scroll so the user message sits at the top of the scroll container
        container.scrollTop = last.offsetTop - container.offsetTop;
      } else {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, []);

  // Load messages when selecting a chat (skip while sending/streaming to avoid overwriting optimistic messages)
  // Anonymous: never clear on !activeChatId - we keep ephemeral messages in state (and sessionStorage)
  useEffect(() => {
    if (!activeChatId) {
      if (userId && !isPrivateChat) setMessages([]);
      return;
    }
    if (isLoading) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content, selection_position_label, selection_position_title, tool_calls, created_at")
        .eq("chat_id", activeChatId)
        .order("message_index", { ascending: true });
      if (data && data.length > 0) {
        setMessages(
          data.map((m) => {
            const rawToolCalls = m.tool_calls;
            const toolCalls: MessageToolCall[] | undefined = Array.isArray(rawToolCalls)
              ? rawToolCalls
                  .filter((tc) => tc && typeof tc.toolName === "string")
                  .map((tc) => ({
                    toolName: tc.toolName as string,
                    args: (tc.args && typeof tc.args === "object" ? tc.args : {}) as Record<string, unknown>,
                    id: typeof tc.id === "string" ? tc.id : undefined,
                    resultSummary: Array.isArray(tc.resultSummary) ? tc.resultSummary : undefined,
                  }))
              : undefined;
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.created_at),
              selectionPositionLabel: m.selection_position_label ?? undefined,
              selectionPositionTitle: m.selection_position_title ?? undefined,
              toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
            };
          })
        );
        // In library mode, hydrate sectionBookMap so book labels render for historical refs
        if (!bookId) {
          const allContent = data.map((m) => m.content).join("\n");
          const refIds = [...allContent.matchAll(/ref:([0-9a-f-]+)/g)].map((m) => m[1]!);
          const unique = [...new Set(refIds)];
          if (unique.length > 0) {
            // fetchSection populates sectionBookMap as a side effect
            Promise.all(unique.map((id) => fetchSection(id)));
          }
        }
      } else {
        setMessages([]);
      }

      // If this is the initial load from a "open in new tab" ref link, scroll to the reference card
      if (initialRefQuote && activeChatId === initialChatId && !initialRefScrolledRef.current) {
        initialRefScrolledRef.current = true;
        // Suppress competing scrollToLastUserMessage calls while we scroll to the ref
        suppressScrollRef.current = true;
        // Wait for React to render the messages, then find and scroll to the reference
        requestAnimationFrame(() => {
          setTimeout(() => {
            const container = messagesScrollRef.current;
            if (!container) {
              suppressScrollRef.current = false;
              return;
            }
            const normalizeForMatch = (s: string) =>
              s.replace(/[\u201C\u201D\u2018\u2019""'']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
            const targetText = normalizeForMatch(initialRefQuote);
            // Find the reference card's italic span that contains the quoted text
            const italicSpans = container.querySelectorAll("span.italic");
            for (const span of italicSpans) {
              if (normalizeForMatch(span.textContent ?? "").includes(targetText.slice(0, 60)) ||
                  targetText.includes(normalizeForMatch(span.textContent ?? "").slice(0, 60))) {
                // Scroll the reference card (parent span with border) to center
                const card = span.closest("span.rounded-md") ?? span;
                card.scrollIntoView({ block: "center", behavior: "instant" });
                // Brief highlight flash
                const el = card as HTMLElement;
                el.style.outline = "2px solid hsl(var(--primary))";
                el.style.outlineOffset = "2px";
                el.style.borderRadius = "0.375rem";
                setTimeout(() => {
                  el.style.outline = "";
                  el.style.outlineOffset = "";
                }, 2000);
                // Release scroll suppression after all competing effects have settled
                setTimeout(() => { suppressScrollRef.current = false; }, 500);
                return;
              }
            }
            // Fallback: scroll to last user message
            suppressScrollRef.current = false;
            scrollToLastUserMessage();
          }, 50);
        });
      } else {
        scrollToLastUserMessage();
      }
    };
    loadMessages();
  }, [activeChatId, supabase, scrollToLastUserMessage, initialChatId, initialRefQuote, bookId, fetchSection]);

  // Scroll to bottom when messages become visible (e.g. mobile drawer expanding).
  useEffect(() => {
    if (showMessages) scrollToLastUserMessage();
  }, [showMessages, scrollToLastUserMessage]);

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setIsPrivateChat(false);
    if (!userId && typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(`minerva-anon-chat-${bookId ?? "general"}`);
      } catch {
        // Ignore
      }
    }
  };

  const handleNewPrivateChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setIsPrivateChat(true);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setIsPrivateChat(false);
  };

  const handleDeleteChat = async (chatIdToDelete: string) => {
    try {
      const res = await fetch(`/api/chats/${chatIdToDelete}`, { method: "DELETE" });
      if (!res.ok) return;
      setChats((prev) => prev.filter((c) => c.id !== chatIdToDelete));
      if (activeChatId === chatIdToDelete) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch {
      // Best-effort
    }
  };

  const persistUserMessage = async (
    chatId: string,
    content: string,
    messageIndex: number,
    selectionPositionLabel?: string,
    selectionPositionTitle?: string
  ) => {
    await supabase.from("chat_messages").insert({
      chat_id: chatId,
      role: "user",
      content,
      message_index: messageIndex,
      selection_position_label: selectionPositionLabel ?? null,
      selection_position_title: selectionPositionTitle ?? null,
    });
  };

  const generateAndUpdateChatTitle = useCallback(
    async (chatId: string, userMessage: string, assistantContent: string) => {
      try {
        const res = await fetch("/api/chat/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            userMessage,
            assistantMessage: assistantContent,
          }),
        });
        if (!res.ok) return;
        const { title } = (await res.json()) as { title?: string };
        if (!title?.trim()) return;
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title: title.trim() } : c))
        );
      } catch {
        // Best-effort: ignore title generation failures
      }
    },
    []
  );

  const ensureChat = useCallback(
    async (
      forBookId: string | null
    ): Promise<{ chatId: string; isExisting: boolean } | null> => {
      if (!userId) return null;

      // If we have an active chat, check if it's for this book (from local list or DB)
      if (activeChatId) {
        const fromList = chats.find((c) => c.id === activeChatId);
        if (fromList && fromList.book_id === forBookId) {
          return { chatId: activeChatId, isExisting: true };
        }
        // Not in list or wrong book - fetch from DB to be sure
        const { data: chatRow } = await supabase
          .from("chats")
          .select("book_id")
          .eq("id", activeChatId)
          .single();
        if (chatRow && chatRow.book_id === forBookId) {
          return { chatId: activeChatId, isExisting: true };
        }
      }

      // When activeChatId is null (e.g. user clicked "New chat"), always create a new chat.
      // Only try reusing the most recent chat when activeChatId was set but didn't match (e.g. wrong book).
      if (activeChatId !== null) {
        let existingQuery = supabase
          .from("chats")
          .select("id, book_id, created_at, title")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (forBookId === null) {
          existingQuery = existingQuery.is("book_id", null);
        } else {
          existingQuery = existingQuery.eq("book_id", forBookId);
        }
        const { data: existingChats } = await existingQuery;
        if (existingChats && existingChats.length > 0) {
          const chat = existingChats[0];
          setActiveChatId(chat.id);
          setChats((prev) => {
            if (prev.some((c) => c.id === chat.id)) return prev;
            return [
              {
                id: chat.id,
                book_id: chat.book_id,
                created_at: chat.created_at,
                title: (chat as { title?: string | null }).title ?? null,
              },
              ...prev,
            ];
          });
          return { chatId: chat.id, isExisting: true };
        }
      }

      // Create new chat
      const { data, error } = await supabase
        .from("chats")
        .insert({
          user_id: userId,
          book_id: forBookId,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("Failed to create chat");
      setActiveChatId(data.id);
      setChats((prev) => [
        {
          id: data.id,
          book_id: forBookId,
          created_at: new Date().toISOString(),
          title: null,
        },
        ...prev,
      ]);
      return { chatId: data.id, isExisting: false };
    },
    [activeChatId, chats, userId, supabase]
  );

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
    // Anonymous users in library/browse mode: redirect to sign up
    if (authChecked && !userId && isLibraryMode) {
      window.location.href = "/auth/sign-up";
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    hapticLight();
    onActionStart?.();
    // "Streaming started" – satisfying burst in same sync stack (only way to work on iOS)
    hapticHeader();

    const userInput = text;
    setIsLoading(true);
    try {
    let sendPositionLabel: string | undefined;
    let sendPositionTitle: string | undefined;
    let sendContextBlock = "";
    let sendBookContext: { title?: string | null; author?: string | null } | null = null;
    let sendLocalContextBlock = "";
    let sendPageContextBlock = "";

    const selectionSnapshot = includeSelectionContextOnSend ? getSelectionSnapshot() : null;
    const selectionForSend = includeSelectionContextOnSend
      ? (selectionSnapshot?.text || trimmedSelectedText)
      : "";
    const hasSelection = Boolean(selectionForSend?.trim());

    if (bookType === "pdf") {
      if (hasSelection) {
        const pos = selectionSnapshot?.pdfPosition ?? getCurrentPdfSelectionPosition();
        if (pos) {
          const formatted = formatSelectionPositionLabel(pos.start, pos.end);
          sendPositionLabel = formatted.label;
          sendPositionTitle = formatted.title;
        }
      } else if (currentPage && currentPage >= 1) {
        sendPositionLabel = `(Page ${currentPage})`;
        sendPositionTitle = `Page ${currentPage}`;
      } else {
        const pageCtx = getCurrentPdfPageContext({ maxChars: 1 });
        if (pageCtx) {
          sendPositionLabel = `(Page ${pageCtx.pageNumber})`;
          sendPositionTitle = `start=${pageCtx.startPosition} end=${pageCtx.endPosition}`;
        }
      }
    } else if (hasSelection) {
      const readingOrder = rawManifest?.readingOrder || [];
      const pos = selectionSnapshot?.epubPosition ?? getCurrentSelectionPosition(readingOrder, null);
      if (pos) {
        const formatted = formatSelectionPositionLabel(pos.start, pos.end);
        sendPositionLabel = formatted.label;
        sendPositionTitle = formatted.title;
      }
    } else if (isLibraryMode) {
      sendPositionLabel = aiScope?.type === "collection" ? aiScope.name : aiScope?.type === "curated-library" ? "Curated Library" : aiScope?.type === "curated-collection" ? aiScope.name : "Library";
      sendPositionTitle = aiScope?.type === "collection" ? `Collection: ${aiScope.name}` : aiScope?.type === "curated-library" ? "Curated Library" : aiScope?.type === "curated-collection" ? `Curated: ${aiScope.name}` : "Library";
    } else {
      sendPositionLabel = "(View)";
      sendPositionTitle = "EPUB visible context";
    }

    const appendContextSummaries = (summaries: ContextApiSummary[]) => {
      const bookSummaries = summaries.filter((summary) => summary.summary_type === "book");
      const broadSummaries = summaries.filter((summary) => summary.summary_type === "chapter");
      const narrowSummaries = summaries.filter((summary) => summary.summary_type === "subchapter");

      const appendSummaries = (label: string, items: ContextApiSummary[]) => {
        if (items.length === 0) return;
        sendContextBlock += `${label}:\n`;
        items.forEach((summary) => {
          sendContextBlock += `- ${summary.summary_text || "(No summary text available)"}\n`;
        });
        sendContextBlock += "\n";
      };

      appendSummaries("Book-level summary (highest-level context)", bookSummaries);
      appendSummaries("Broader summary (wide context)", broadSummaries);
      appendSummaries("More specific summary (narrow context)", narrowSummaries);
    };

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userInput,
      timestamp: new Date(),
      selectionPositionLabel: sendPositionLabel,
      selectionPositionTitle: sendPositionTitle,
    };
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: AIMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    scrollToLastUserMessage();

    // Yield so React paints the optimistic bubble + ellipsis before heavy sync
    // work (PDF span walk, EPUB iframe DOM walk with getBoundingClientRect).
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    if (bookId) {
      if (!hasSelection && bookType === "pdf") {
        const page = getCurrentPdfPageContext({ maxChars: 30000 });
        if (page?.text) {
          sendPositionLabel = `(Page ${page.pageNumber})`;
          sendPositionTitle = `start=${page.startPosition} end=${page.endPosition}`;
          sendPageContextBlock = `Current page (page ${page.pageNumber}) text for context:\n\n"${page.text}"`;
          try {
            const contextRes = await fetch(`/api/books/${bookId}/context`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bookType: "pdf",
                startPosition: page.startPosition,
                endPosition: page.endPosition,
              }),
            });
            if (contextRes.ok) {
              const contextData = (await contextRes.json()) as {
                book?: { title?: string | null; author?: string | null } | null;
                summaries?: ContextApiSummary[];
              };
              sendBookContext = contextData.book ?? null;
              appendContextSummaries(contextData.summaries ?? []);
            }
          } catch {
            // Best-effort context enrichment for typed sends.
          }
        }
      } else if (!hasSelection && bookType === "epub") {
        const readingOrder = rawManifest?.readingOrder || [];

        // Determine current reading order index from Readium's localStorage locator for THIS book
        let currentReadingOrderIndex = 0;
        try {
          for (let li = 0; li < localStorage.length; li++) {
            const lsKey = localStorage.key(li);
            if (!lsKey || !lsKey.endsWith("-current-location") || !bookId || !lsKey.includes(bookId)) continue;
            const raw = localStorage.getItem(lsKey);
            if (!raw) continue;
            const locator = JSON.parse(raw) as { href?: string };
            if (locator.href) {
              const locFilename = locator.href.split("/").pop() || "";
              for (let j = 0; j < readingOrder.length; j++) {
                const itemFilename = (readingOrder[j]?.href || "").split("/").pop() || "";
                if (itemFilename && locFilename === itemFilename) {
                  currentReadingOrderIndex = j;
                  break;
                }
              }
            }
            break; // found the key for this book
          }
        } catch { /* ignore */ }

        const visible = getEpubVisibleContextWithPosition(readingOrder, { maxChars: 30000, readingOrderIndex: currentReadingOrderIndex });

        // Get visible text — fall back to simpler extraction without positions
        const visibleText = visible?.text || getEpubVisibleContext({ maxChars: 30000 })?.text;
        if (visibleText) {
          sendPageContextBlock = `Current view text for context:\n\n"${visibleText}"`;
        }

        // Fetch summaries if we have positions (even if visible text failed)
        if (visible?.startPosition && visible?.endPosition) {
          try {
            const contextRes = await fetch(`/api/books/${bookId}/context`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bookType: "epub",
                startPosition: visible.startPosition,
                endPosition: visible.endPosition,
              }),
            });
            if (contextRes.ok) {
              const contextData = (await contextRes.json()) as {
                book?: { title?: string | null; author?: string | null } | null;
                summaries?: ContextApiSummary[];
              };
              sendBookContext = contextData.book ?? null;
              appendContextSummaries(contextData.summaries ?? []);
            }
          } catch {
            // Best-effort context enrichment
          }
        } else {
          // No precise positions — use fallback so we still get book-level summaries
          try {
            const contextRes = await fetch(`/api/books/${bookId}/context`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bookType: "epub",
                startPosition: "0/0/0",
                endPosition: "0/9999/9999",
              }),
            });
            if (contextRes.ok) {
              const contextData = (await contextRes.json()) as {
                book?: { title?: string | null; author?: string | null } | null;
                summaries?: ContextApiSummary[];
              };
              sendBookContext = contextData.book ?? null;
              appendContextSummaries(contextData.summaries ?? []);
            }
          } catch (err) {
            console.error("[ai-send] Fallback context API fetch error:", err);
          }
        }
      }
    }

    if (hasSelection && bookId) {
      let startPosition: string | undefined;
      let endPosition: string | undefined;

      if (bookType === "pdf") {
        const pos = selectionSnapshot?.pdfPosition ?? getCurrentPdfSelectionPosition();
        startPosition = pos?.start;
        endPosition = pos?.end;
      } else {
        const readingOrder = rawManifest?.readingOrder || [];
        const pos = selectionSnapshot?.epubPosition ?? getCurrentSelectionPosition(readingOrder, null);
        startPosition = pos?.start;
        endPosition = pos?.end;
      }

      if (startPosition && endPosition) {
        try {
          const contextRes = await fetch(`/api/books/${bookId}/context`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookType,
              startPosition,
              endPosition,
            }),
          });
          if (contextRes.ok) {
            const contextData = (await contextRes.json()) as {
              book?: { title?: string | null; author?: string | null } | null;
              summaries?: ContextApiSummary[];
            };
            sendBookContext = contextData.book ?? null;
            appendContextSummaries(contextData.summaries ?? []);
          }
        } catch {
          // Best-effort context enrichment for typed sends.
        }
      }
    }

    if (hasSelection) {
      if (bookType === "pdf") {
        const pos = selectionSnapshot?.pdfPosition ?? getCurrentPdfSelectionPosition();
        let local: { beforeText: string; selectedText: string; afterText: string } | null = null;
        if (pdfDocument && pos && selectionForSend) {
          local = await getPdfLocalContextFromDocument(
            pdfDocument,
            pos.start,
            pos.end,
            selectionForSend,
            { beforeChars: 1200, afterChars: 1200, pagesBefore: 2, pagesAfter: 2, maxTotalChars: 4000 }
          );
        }
        if (!local) {
          local = getPdfLocalContextAroundCurrentSelection({
            beforeChars: 800,
            afterChars: 800,
            maxTotalChars: 2400,
          });
        }
        if (local && (local.beforeText || local.afterText)) {
          sendLocalContextBlock += "Local context around the selection (PDF text from surrounding pages):\n\n";
          if (local.beforeText) {
            sendLocalContextBlock += `Before:\n"${local.beforeText}"\n\n`;
          }
          sendLocalContextBlock += `Selected:\n"${local.selectedText}"\n\n`;
          if (local.afterText) {
            sendLocalContextBlock += `After:\n"${local.afterText}"\n\n`;
          }
        }
      } else {
        const local = getEpubLocalContextAroundCurrentSelection({
          beforeChars: 900,
          afterChars: 900,
          maxTotalChars: 2800,
        });
        if (local && (local.beforeText || local.afterText)) {
          sendLocalContextBlock += "Local context around the selection (EPUB nearby text):\n\n";
          if (local.beforeText) {
            sendLocalContextBlock += `Before:\n"${local.beforeText}"\n\n`;
          }
          sendLocalContextBlock += `Selected:\n"${local.selectedText}"\n\n`;
          if (local.afterText) {
            sendLocalContextBlock += `After:\n"${local.afterText}"\n\n`;
          }
        }
      }
    }

    try {
      let chatId: string | null = null;
      let msgCount = 0;
      let historyForAPI: { role: "user" | "assistant"; content: string }[] = [];

      if (userId && !isPrivateChat) {
        const result = await ensureChat(bookId ?? null);
        if (result) {
          chatId = result.chatId;
          if (result.isExisting) {
            const { data: existingMsgs } = await supabase
              .from("chat_messages")
              .select("id, role, content, selection_position_label, selection_position_title, created_at")
              .eq("chat_id", result.chatId)
              .order("message_index", { ascending: true });
            msgCount = existingMsgs?.length ?? 0;
            const existingAsAIMessages: AIMessage[] = (existingMsgs ?? []).map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.created_at),
              selectionPositionLabel: m.selection_position_label ?? undefined,
              selectionPositionTitle: m.selection_position_title ?? undefined,
            }));
            historyForAPI = existingAsAIMessages.map((m) => ({ role: m.role, content: m.content }));
            setMessages([...existingAsAIMessages, userMessage, assistantMessage]);
          } else {
            setMessages([userMessage, assistantMessage]);
          }
          scrollToLastUserMessage();
          await persistUserMessage(
            chatId,
            userInput,
            msgCount,
            sendPositionLabel,
            sendPositionTitle
          );
        }
      } else {
        historyForAPI = messages.map((m) => ({ role: m.role, content: m.content }));
      }

      const userMsgIndex = msgCount;
      const assistantMsgIndex = msgCount + 1;

      let userContent = userInput;

      if (selectionForSend && selectionForSend.trim().length > 0) {
        let contextHeader = "";
        const finalBookTitle = sendBookContext?.title ?? bookTitle;
        const finalBookAuthor = sendBookContext?.author ?? bookAuthor;
        if (finalBookTitle) {
          contextHeader += `Book: ${finalBookTitle}\n`;
        }
        if (finalBookAuthor) {
          contextHeader += `Author: ${finalBookAuthor}\n`;
        }
        if (contextHeader) {
          contextHeader += "\n";
        }
        userContent = `${contextHeader}${sendContextBlock ? `${sendContextBlock}` : ""}${sendLocalContextBlock ? `${sendLocalContextBlock}` : ""}Selected text (use as context):\n"${selectionForSend}"\n\nUser question:\n${userInput}`;
      } else if (!selectionForSend) {
        let contextHeader = "";
        const finalBookTitle = sendBookContext?.title ?? bookTitle;
        const finalBookAuthor = sendBookContext?.author ?? bookAuthor;
        if (finalBookTitle) {
          contextHeader += `Book: ${finalBookTitle}\n`;
        }
        if (finalBookAuthor) {
          contextHeader += `Author: ${finalBookAuthor}\n`;
        }
        if (contextHeader) {
          contextHeader += "\n";
        }
        if (sendContextBlock || sendPageContextBlock || contextHeader) {
          userContent = `${contextHeader}${sendContextBlock ? `${sendContextBlock}` : ""}${sendPageContextBlock ? `${sendPageContextBlock}\n\n` : ""}User question:\n${userInput}`;
        }
      }

      const messagesForAPI = [
        ...historyForAPI,
        { role: "user" as const, content: userContent },
      ];

      const useAgentic = chatMode === "agentic" || isLibraryMode;
      const chatUrl = useAgentic ? "/api/chat/agentic" : "/api/chat";
      const chatBody = useAgentic
        ? JSON.stringify({
            messages: messagesForAPI,
            bookId: bookId ?? undefined,
            bookIds: isLibraryMode ? bookIds : undefined,
            chatId: chatId ?? undefined,
            messageIndex: assistantMsgIndex,
            isPrivate: isPrivateChat,
            scopeLabel: isLibraryMode ? (aiScope?.type === "collection" ? `collection "${aiScope.name}"` : aiScope?.type === "curated-library" ? "the curated library" : aiScope?.type === "curated-collection" ? `curated collection "${aiScope.name}"` : undefined) : undefined,
          })
        : JSON.stringify({
            messages: messagesForAPI,
            chatId: chatId ?? undefined,
            messageIndex: assistantMsgIndex,
            isPrivate: isPrivateChat,
          });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      assistantMessageIdRef.current = null;

      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: chatBody,
        signal: abortController.signal,
      });

      const isNewChat = chatId && msgCount === 0;
      await handleStreamingResponse(
        response,
        assistantMessageId,
        async (content) => {
          // Server persists the assistant message. Client only fires the
          // new-chat title generation on clean completion.
          if (chatId && !isPrivateChat && isNewChat) {
            generateAndUpdateChatTitle(chatId, userInput, content).catch(() => {});
          }
        },
        undefined,
        abortController.signal,
        (id) => { assistantMessageIdRef.current = id; }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setIsLoading(false);
        onActionComplete?.();
        return;
      }
      console.error("Chat API error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Sorry, an error occurred. Please try again.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, content: errorMessage } : msg
        )
      );
      setIsLoading(false);
      onActionComplete?.();
    }
    } finally {
      sendingRef.current = false;
      refreshCredits();
    }
  };

  const handleExplain = useCallback(async (action: "page" | "selection") => {
    let msgCount = 0;
    if (!bookId || isLoading) return;

    const isPdf = bookType === "pdf";
    if (!rawManifest && !isPdf) return;

    // Use remembered snapshot (text + optional position) when live selection is gone.
    const selectionSnapshot = getSelectionSnapshot();
    const currentSelectedText = selectionSnapshot?.text || trimmedSelectedText;
    if (
      currentSelectedText &&
      currentSelectedText.trim().length > 0 &&
      currentSelectedText.length > MAX_EXPLAIN_SELECTION_CHARS
    ) {
      return;
    }

    const selectionExists = Boolean(currentSelectedText && currentSelectedText.trim().length > 0);
    const isExplainPage = action === "page";
    const isExplainSelectionNow = action === "selection";
    if (isExplainSelectionNow && !selectionExists) return;

    hapticLight();
    onActionStart?.();
    hapticHeader();

    setIsLoading(true);

    let summaries: SummaryContext[] = [];
    let selectionPositionLabel: string | undefined;
    let selectionPositionTitle: string | undefined;
    const explainUserMessage = isExplainPage ? "Explain page" : "Explain selection";
    let explainBodyText = currentSelectedText;

    // Compute label/title from the cached selection snapshot so the optimistic
    // bubble can render before the slow DOM walks and Supabase summary queries.
    // PDF "Explain page" still needs the DOM walk for the page number — label is
    // updated after that work completes.
    if (isPdf && !isExplainPage) {
      const position = selectionSnapshot?.pdfPosition ?? getCurrentPdfSelectionPosition();
      if (position) {
        const formatted = formatSelectionPositionLabel(position.start, position.end);
        selectionPositionLabel = formatted.label;
        selectionPositionTitle = formatted.title;
      }
    } else if (!isPdf && isExplainPage) {
      selectionPositionLabel = `(View)`;
      selectionPositionTitle = "EPUB visible context";
    } else if (!isPdf && !isExplainPage) {
      const readingOrder = rawManifest?.readingOrder || [];
      const position = selectionSnapshot?.epubPosition ?? getCurrentSelectionPosition(readingOrder, null);
      if (position) {
        const formatted = formatSelectionPositionLabel(position.start, position.end);
        selectionPositionLabel = formatted.label;
        selectionPositionTitle = formatted.title;
      }
    }

    let userMessage: AIMessage = {
      id: Date.now().toString(),
      role: "user",
      content: explainUserMessage,
      timestamp: new Date(),
      selectionPositionLabel,
      selectionPositionTitle,
    };
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: AIMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    scrollToLastUserMessage();

    // Yield so React paints the bubble + ellipsis before heavy sync DOM walks
    // and awaited summary queries.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    if (isPdf) {
      if (isExplainPage) {
        const page = getCurrentPdfPageContext({ maxChars: 30000 });
        if (!page || !page.text) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId)
          );
          setIsLoading(false);
          onActionComplete?.();
          return;
        }
        explainBodyText = page.text;
        selectionPositionLabel = `(Page ${page.pageNumber})`;
        selectionPositionTitle = `start=${page.startPosition} end=${page.endPosition}`;
        userMessage = { ...userMessage, selectionPositionLabel, selectionPositionTitle };
        setMessages((prev) =>
          prev.map((m) => (m.id === userMessage.id ? userMessage : m))
        );
        summaries = (
          await queryPdfSummariesForPosition(
            bookId,
            page.startPosition,
            page.endPosition
          )
        ).map(({ summary_type, toc_title, chapter_path, summary_text }) => ({
          summary_type,
          toc_title,
          chapter_path,
          summary_text,
        }));
      } else {
        // Selection explain should still work from persisted selected text
        // even when live DOM selection position cannot be recovered.
        const position = selectionSnapshot?.pdfPosition ?? getCurrentPdfSelectionPosition();
        if (position) {
          summaries = (
            await queryPdfSummariesForPosition(
              bookId,
              position.start,
              position.end
            )
          ).map(({ summary_type, toc_title, chapter_path, summary_text }) => ({
            summary_type,
            toc_title,
            chapter_path,
            summary_text,
          }));
        }
      }
    } else {
      if (isExplainPage) {
        const readingOrder = rawManifest?.readingOrder || [];
        const visible = getEpubVisibleContextWithPosition(readingOrder, { maxChars: 30000 });
        if (!visible?.text) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId)
          );
          setIsLoading(false);
          onActionComplete?.();
          return;
        }
        explainBodyText = visible.text;
        summaries = (
          await querySummariesForPosition(bookId, visible.startPosition, visible.endPosition)
        ).map(({ summary_type, toc_title, chapter_path, summary_text }) => ({
          summary_type: summary_type ?? "chapter",
          toc_title,
          chapter_path,
          summary_text,
        }));
      } else {
        const readingOrder = rawManifest?.readingOrder || [];
        const position = selectionSnapshot?.epubPosition ?? getCurrentSelectionPosition(readingOrder, null);
        if (position) {
          summaries = (await querySummariesForPosition(bookId, position.start, position.end)).map(
            ({ summary_type, toc_title, chapter_path, summary_text }) => ({
              summary_type: summary_type ?? "chapter",
              toc_title,
              chapter_path,
              summary_text,
            })
          );
        }
      }
    }

    // Build the prompt with context
    let prompt = "";
    
    // Add book context
    if (bookTitle) {
      prompt += `Book: ${bookTitle}\n`;
    }
    if (bookAuthor) {
      prompt += `Author: ${bookAuthor}\n`;
    }
    if (bookTitle || bookAuthor) {
      prompt += "\n";
    }

    const bookSummaries = summaries.filter((summary) => summary.summary_type === "book");
    const broadSummaries = summaries.filter((summary) => summary.summary_type === "chapter");
    const narrowSummaries = summaries.filter((summary) => summary.summary_type === "subchapter");

    const appendSummaries = (label: string, items: SummaryContext[]) => {
      if (items.length === 0) return;
      prompt += `${label}:\n`;
      items.forEach((summary) => {
        if (summary.summary_text) {
          prompt += `- ${summary.summary_text}\n`;
        } else {
          prompt += `- (No summary text available)\n`;
        }
      });
      prompt += "\n";
    };

    // Note: we intentionally avoid chapter numbers/titles/paths here.
    // They can be wrong/noisy and confuse the model.
    appendSummaries("Book-level summary (highest-level context)", bookSummaries);
    appendSummaries("Broader summary (wide context)", broadSummaries);
    appendSummaries("More specific summary (narrow context)", narrowSummaries);

    // Add local context window around selection (PDF from document for cross-page; EPUB from DOM)
    if (!isExplainPage) {
      if (isPdf) {
        const position = selectionSnapshot?.pdfPosition ?? getCurrentPdfSelectionPosition();
        let local: { beforeText: string; selectedText: string; afterText: string } | null = null;
        if (pdfDocument && position && explainBodyText) {
          local = await getPdfLocalContextFromDocument(
            pdfDocument,
            position.start,
            position.end,
            explainBodyText,
            { beforeChars: 1200, afterChars: 1200, pagesBefore: 2, pagesAfter: 2, maxTotalChars: 4000 }
          );
        }
        if (!local) {
          local = getPdfLocalContextAroundCurrentSelection({
            beforeChars: 800,
            afterChars: 800,
            maxTotalChars: 2400,
          });
        }
        if (local && (local.beforeText || local.afterText)) {
          prompt += "Local context around the selection (PDF text from surrounding pages):\n\n";
          if (local.beforeText) {
            prompt += `Before:\n"${local.beforeText}"\n\n`;
          }
          prompt += `Selected:\n"${local.selectedText}"\n\n`;
          if (local.afterText) {
            prompt += `After:\n"${local.afterText}"\n\n`;
          }
        }
      } else {
        const local = getEpubLocalContextAroundCurrentSelection({
          beforeChars: 900,
          afterChars: 900,
          maxTotalChars: 2800,
        });
        if (local && (local.beforeText || local.afterText)) {
          prompt += "Local context around the selection (EPUB nearby text):\n\n";
          if (local.beforeText) {
            prompt += `Before:\n"${local.beforeText}"\n\n`;
          }
          prompt += `Selected:\n"${local.selectedText}"\n\n`;
          if (local.afterText) {
            prompt += `After:\n"${local.afterText}"\n\n`;
          }
        }
      }
    }

    // Add the selected text and instruction
    prompt += `Please explain the following ${
      isExplainPage ? "page" : "selected text"
    } from the book:\n\n"${explainBodyText}"\n\nProvide a clear and helpful explanation in the context of the book.`;

    try {
      let chatId: string | null = null;
      let historyForAPI: { role: "user" | "assistant"; content: string }[] = [];

      if (userId && !isPrivateChat) {
        const result = await ensureChat(bookId ?? null);
        if (result) {
          chatId = result.chatId;
          if (result.isExisting) {
            const { data: existingMsgs } = await supabase
              .from("chat_messages")
              .select("id, role, content, selection_position_label, selection_position_title, created_at")
              .eq("chat_id", result.chatId)
              .order("message_index", { ascending: true });
            msgCount = existingMsgs?.length ?? 0;
            const existingAsAIMessages: AIMessage[] = (existingMsgs ?? []).map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.created_at),
              selectionPositionLabel: m.selection_position_label ?? undefined,
              selectionPositionTitle: m.selection_position_title ?? undefined,
            }));
            historyForAPI = existingAsAIMessages.map((m) => ({ role: m.role, content: m.content }));
            setMessages([...existingAsAIMessages, userMessage, assistantMessage]);
          } else {
            setMessages([userMessage, assistantMessage]);
          }
          scrollToLastUserMessage();
          await persistUserMessage(
            chatId,
            explainUserMessage,
            msgCount,
            selectionPositionLabel,
            selectionPositionTitle
          );
        }
      } else {
        historyForAPI = messages.map((m) => ({ role: m.role, content: m.content }));
      }

      const userMsgIndex = msgCount;
      const assistantMsgIndex = msgCount + 1;

      const messagesForAPI = [
        ...historyForAPI,
        { role: "user" as const, content: prompt },
      ];

      const useAgentic = chatMode === "agentic" || isLibraryMode;
      const chatUrl = useAgentic ? "/api/chat/agentic" : "/api/chat";
      const chatBody = useAgentic
        ? JSON.stringify({
            messages: messagesForAPI,
            bookId: bookId ?? undefined,
            bookIds: isLibraryMode ? bookIds : undefined,
            chatId: chatId ?? undefined,
            messageIndex: assistantMsgIndex,
            isPrivate: isPrivateChat,
            scopeLabel: isLibraryMode ? (aiScope?.type === "collection" ? `collection "${aiScope.name}"` : aiScope?.type === "curated-library" ? "the curated library" : aiScope?.type === "curated-collection" ? `curated collection "${aiScope.name}"` : undefined) : undefined,
          })
        : JSON.stringify({
            messages: messagesForAPI,
            chatId: chatId ?? undefined,
            messageIndex: assistantMsgIndex,
            isPrivate: isPrivateChat,
          });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      assistantMessageIdRef.current = null;

      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: chatBody,
        signal: abortController.signal,
      });

      const isNewChat = chatId && msgCount === 0;
      await handleStreamingResponse(
        response,
        assistantMessageId,
        async (content) => {
          if (chatId && !isPrivateChat && isNewChat) {
            generateAndUpdateChatTitle(chatId, explainUserMessage, content).catch(() => {});
          }
        },
        undefined,
        abortController.signal,
        (id) => { assistantMessageIdRef.current = id; }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setIsLoading(false);
        onActionComplete?.();
        return;
      }
      console.error("Chat API error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Sorry, an error occurred. Please try again.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, content: errorMessage } : msg
        )
      );
      setIsLoading(false);
      onActionComplete?.();
    }
  }, [
    bookAuthor,
    bookId,
    bookTitle,
    bookType,
    chatMode,
    pdfDocument,
    handleStreamingResponse,
    generateAndUpdateChatTitle,
    isLoading,
    messages,
    rawManifest,
    trimmedSelectedText,
    getSelectionSnapshot,
    onActionComplete,
    onActionStart,
    ensureChat,
  ]);

  useEffect(() => {
    if (!autoRun) return;
    if (autoRun.nonce === lastAutoRunNonceRef.current) return;
    lastAutoRunNonceRef.current = autoRun.nonce;
    handleExplain(autoRun.action).catch(console.error);
  }, [autoRun, handleExplain]);

  return (
    <div
      data-ai-pane="true"
      className={
        (className ??
          "bg-background border-l border-border shadow-lg flex flex-col select-text") +
        " min-h-0"
      }
    >
      {/* Header */}
      {showHeader && (
        <div className="flex flex-col border-b border-border">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-1">
              {userId ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-foreground"
                      aria-label="New chat"
                      title="New chat"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => e.detail.originalEvent.stopPropagation()}
                  >
                    <DropdownMenuItem onClick={handleNewChat} className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      New chat
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleNewPrivateChat} className="flex items-center gap-2">
                      <EyeOff className="h-4 w-4" />
                      New private chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewChat}
                  className="h-8 w-8 text-foreground"
                  aria-label="New chat"
                  title="New chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              {userId && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-foreground"
                      aria-label="Recent chats"
                      title="Recent chats"
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-64 overflow-y-auto max-w-[calc(100vw-2rem)]"
                    collisionPadding={16}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => e.detail.originalEvent.stopPropagation()}
                  >
                    {chats.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground">
                        No recent chats
                      </div>
                    ) : (
                      chats.map((chat) => (
                        <DropdownMenuItem
                          key={chat.id}
                          onClick={() => handleSelectChat(chat.id)}
                          className="flex items-center gap-2 group"
                        >
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          <span className="truncate min-w-0 flex-1">
                            {chat.title?.trim() || new Date(chat.created_at).toLocaleDateString()}
                          </span>
                          <button
                            type="button"
                            className="sm:opacity-0 sm:group-hover:opacity-100 shrink-0 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteChat(chat.id);
                            }}
                            aria-label="Delete chat"
                            title="Delete chat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="flex items-center gap-1.5">
                {isLibraryMode ? (
                  onAiScopeChange && ((collectionsProp && collectionsProp.length > 0) || (curatedCollectionsProp && curatedCollectionsProp.length > 0) || allCuratedBookIds) ? (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Sparkles className="h-3 w-3 text-blue-500" />
                          <span className="max-w-[140px] truncate">
                            {aiScope?.type === "collection" ? aiScope.name : aiScope?.type === "curated-library" ? "Curated Library" : aiScope?.type === "curated-collection" ? aiScope.name : "My Library"}
                          </span>
                          <ChevronRight className="h-3 w-3 rotate-90" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[180px] max-h-[320px] overflow-y-auto">
                        {/* My Library section — shown when user collections are provided */}
                        {collectionsProp && collectionsProp.length > 0 && (
                          <>
                            <DropdownMenuItem
                              onClick={() => onAiScopeChange({ type: "library" })}
                              className={aiScope?.type === "library" ? "bg-accent" : ""}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              All library
                            </DropdownMenuItem>
                            {collectionsProp.map((col) => (
                              <DropdownMenuItem
                                key={col.id}
                                onClick={() => {
                                  onAiScopeChange({
                                    type: "collection",
                                    id: col.id,
                                    name: col.name,
                                    bookIds: col.bookIds,
                                  });
                                }}
                                className={aiScope?.type === "collection" && aiScope.id === col.id ? "bg-accent" : ""}
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                                <span className="truncate">{col.name}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">{col.bookCount}</span>
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                        {/* Curated Library section — shown when curated data is provided */}
                        {(allCuratedBookIds || (curatedCollectionsProp && curatedCollectionsProp.length > 0)) && (
                          <>
                            {allCuratedBookIds && (
                              <DropdownMenuItem
                                onClick={() => onAiScopeChange({ type: "curated-library", bookIds: allCuratedBookIds })}
                                className={aiScope?.type === "curated-library" ? "bg-accent" : ""}
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                All curated books
                              </DropdownMenuItem>
                            )}
                            {curatedCollectionsProp?.map((col) => (
                              <DropdownMenuItem
                                key={`curated-${col.id}`}
                                onClick={() => {
                                  onAiScopeChange({
                                    type: "curated-collection",
                                    id: col.id,
                                    name: col.name,
                                    bookIds: col.bookIds,
                                  });
                                }}
                                className={aiScope?.type === "curated-collection" && aiScope.id === col.id ? "bg-accent" : ""}
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                                <span className="truncate">{col.name}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">{col.bookCount}</span>
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3 text-blue-500" />
                      {aiScope?.type === "collection" ? aiScope.name : aiScope?.type === "curated-library" ? "Curated Library" : aiScope?.type === "curated-collection" ? aiScope.name : "Library search"}
                    </span>
                  )
                ) : !userId && creditsInfo && !creditsInfo.freeBetaMode ? (
                  <a href="/auth/login" className="text-xs text-primary hover:underline" title="Sign in for Deep mode and higher quality answers">
                    Sign in for better answers
                  </a>
                ) : (
                  <>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={chatMode === "agentic"}
                      aria-label={chatMode === "fast" ? "Quick mode (single call)" : "Deep mode (tools: vector, text, web search)"}
                      title={chatMode === "fast" ? "Quick mode (single call)" : "Deep mode (tools: vector, text, web search)"}
                      onClick={() => {
                        const next = chatMode === "fast" ? "agentic" : "fast";
                        setChatMode(next);
                        localStorage.setItem("minerva-chat-mode", next);
                      }}
                      disabled={false}
                      className={cn(
                        "relative flex h-6 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed",
                        chatMode === "fast" ? "bg-amber-400 dark:bg-amber-500" : "bg-blue-500 dark:bg-blue-600"
                      )}
                    >
                      <Zap className="absolute left-1 h-3.5 w-3.5 shrink-0 text-amber-900 dark:text-amber-950" aria-hidden />
                      <Sparkles className="absolute right-1.5 h-3.5 w-3.5 shrink-0 text-blue-900 dark:text-blue-950" aria-hidden />
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-6 rounded-full bg-white shadow-md transition-all duration-200",
                          chatMode === "fast" ? "left-[calc(100%-1.5rem-2px)]" : "left-0.5"
                        )}
                        aria-hidden
                      />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {chatMode === "fast" ? "Quick" : "Deep"}
                    </span>
                  </>
                )}
              </div>
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
          {/* Processing status banner: set expectations when summaries/vectors aren't ready */}
          {bookId && processingStatus && (!processingStatus.summariesReady || !processingStatus.vectorsReady) && (
            <div
              className="px-4 pb-3 pt-0"
              role="status"
              aria-live="polite"
            >
              {processingStatus.failed ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 dark:bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p className="min-w-0 flex-1">
                    Processing failed. AI features may be unavailable for this book.
                  </p>
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                  <p className="min-w-0 flex-1">
                    {!processingStatus.summariesReady && !processingStatus.vectorsReady ? (
                      "Book is still processing. AI context will be limited until summaries and vector search are ready."
                    ) : !processingStatus.summariesReady ? (
                      "Summaries processing… Responses will have limited context until done."
                    ) : (
                      "Vector search processing… Deep mode uses keyword search until semantic search is ready."
                    )}
                  </p>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400" aria-hidden />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Anonymous sign-up banner for library/browse mode */}
      {authChecked && !userId && isLibraryMode && (
        <div className="px-4 py-3 border-b border-border bg-blue-50 dark:bg-blue-950/30">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <a href="/auth/sign-up" className="font-medium underline hover:text-blue-900 dark:hover:text-blue-100">Sign up</a>
            {" "}to ask questions across this collection with AI.
          </p>
        </div>
      )}

      {/* Empty state: input near top (Cursor-style) */}
      {showMessages && messages.length === 0 && (
        <div className="flex-1 flex flex-col justify-start pt-4 px-4 min-h-0">
          <div className="space-y-4 max-w-full">
              {creditsInfo && creditsInfo.tier === "free" && creditsInfo.allowanceDollars > 0 && (
                <div className="flex justify-center -mt-2 -mb-2.5">
                  <span className="text-xs text-muted-foreground">
                    {Math.max(0, Math.round((creditsInfo.includedBalance / creditsInfo.allowanceDollars) * 100))}% remaining today
                  </span>
                </div>
              )}
              <ChatInput
                variant="empty-state"
                initialValue={prefillQuestion}
                placeholder={isLibraryMode ? (aiScope?.type === "collection" || aiScope?.type === "curated-collection" ? `Ask across ${aiScope.name}...` : aiScope?.type === "curated-library" ? "Ask across curated library..." : "Ask a question across your library...") : trimmedSelectedText ? "Ask a question about the selection..." : "Ask a question about the book..."}
                loading={isLoading}
                onSubmit={handleSend}
                onStop={handleStop}
              />
            </div>
        </div>
      )}

      {/* Private chat banner */}
      {isPrivateChat && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs border-b border-amber-200 dark:border-amber-800">
          <EyeOff className="h-3 w-3 shrink-0" />
          Private chat — messages won&apos;t be saved to history
        </div>
      )}

      {/* Messages */}
      {showMessages && messages.length > 0 && (
        <div
          ref={messagesScrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {(() => {
            const filteredMessages = messages.filter(
              (m) =>
                m.role !== "assistant" ||
                m.content.trim().length > 0 ||
                (m.toolCalls?.length ?? 0) > 0 ||
                (isLoading && messages[messages.length - 1]?.id === m.id)
            );

            // Group messages into Q&A pairs: each user message starts a new group
            const groups: { user: typeof filteredMessages[0]; assistant?: typeof filteredMessages[0] }[] = [];
            for (const msg of filteredMessages) {
              if (msg.role === "user") {
                groups.push({ user: msg });
              } else if (groups.length > 0) {
                groups[groups.length - 1].assistant = msg;
              }
            }

            return groups.map((group, groupIndex) => {
              const isLastGroup = groupIndex === groups.length - 1;
              const assistantMsg = group.assistant;
              const isLastAssistant = !!(
                isLoading &&
                assistantMsg &&
                filteredMessages[filteredMessages.length - 1]?.id === assistantMsg.id
              );
              const isStreaming = isLastAssistant && !assistantMsg!.content.trim();

              return (
                <MessageGroup
                  key={group.user.id}
                  user={group.user}
                  assistant={assistantMsg}
                  isLastGroup={isLastGroup}
                  isLastAssistant={isLastAssistant}
                  isStreaming={isStreaming}
                  bookId={bookId}
                  sectionBookMap={isLibraryMode ? sectionBookMap : undefined}
                  onRefClick={handleRefClick}
                  activeChatId={activeChatId}
                />
              );
            });
          })()}
        </div>
      )}

      {/* Input (bottom: when chat has messages, or in compact mode when showMessages is false) */}
      {((showMessages && messages.length > 0) || !showMessages) && (
        <div className="p-4 border-t border-border shrink-0">
          {!showMessages && (
            <div className="mb-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleExplain(trimmedSelectedText ? "selection" : "page")}
                disabled={isLoading}
                className="w-full justify-center"
                aria-label={trimmedSelectedText ? "Explain selection" : "Explain page"}
              >
                {trimmedSelectedText ? (
                  <><Highlighter className="h-4 w-4 mr-2" />Explain selection</>
                ) : (
                  <><BookOpenText className="h-4 w-4 mr-2" />Explain page</>
                )}
              </Button>
            </div>
          )}
          {creditsInfo && creditsInfo.tier === "free" && creditsInfo.allowanceDollars > 0 && (
            <div className="flex justify-center mb-1 -mt-2.5">
              <span className="text-xs text-muted-foreground">
                {Math.max(0, Math.round((creditsInfo.includedBalance / creditsInfo.allowanceDollars) * 100))}% remaining today
              </span>
            </div>
          )}
          <ChatInput
            variant="bottom"
            initialValue={prefillQuestion}
            placeholder={isLibraryMode ? (aiScope?.type === "collection" || aiScope?.type === "curated-collection" ? `Ask across ${aiScope.name}...` : aiScope?.type === "curated-library" ? "Ask across curated library..." : "Ask a question across your library...") : trimmedSelectedText ? "Ask a question about the selection..." : "Ask a question about the book..."}
            loading={isLoading}
            onSubmit={handleSend}
            onStop={handleStop}
          />
        </div>
      )}

      <Dialog open={creditsExhaustedDialogOpen} onOpenChange={setCreditsExhaustedDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Out of usage</DialogTitle>
            <DialogDescription className="pt-2">
              {(() => {
                const info = usageDeniedInfo;
                if (!info) return "You've used all your available usage.";
                const resetLine = info.resetAt
                  ? `Your included usage resets on ${new Date(info.resetAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`
                  : null;
                switch (info.reason) {
                  case "included_exhausted_extra_disabled":
                    return info.tier !== "paid" ? (
                      <>
                        You&apos;ve used all your free usage for today.
                        {resetLine && <> {resetLine}</>}
                      </>
                    ) : (
                      <>
                        You&apos;ve used all your included usage and extra usage is disabled.
                        {resetLine && <> {resetLine}</>}
                        {" "}You can enable extra usage to keep going.
                      </>
                    );
                  case "included_exhausted_extra_empty":
                    return (
                      <>
                        You&apos;ve used all your included usage and your extra usage balance is empty.
                        {resetLine && <> {resetLine}</>}
                        {" "}Add more balance to keep going.
                      </>
                    );
                  case "included_exhausted_extra_limit_reached":
                    return (
                      <>
                        You&apos;ve used all your included usage and reached your ${info.onDemandLimitDollars?.toFixed(2)} monthly extra usage limit.
                        {resetLine && <> Both reset on {new Date(info.resetAt!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.</>}
                        {" "}You can adjust your limit or wait for it to reset.
                      </>
                    );
                  default:
                    return "You've used all your available usage.";
                }
              })()}
            </DialogDescription>
          </DialogHeader>
          {usageDeniedInfo?.tier !== "paid" && (
            <Button
              onClick={() => {
                setUpgradeCheckoutLoading(true);
                fetch("/api/stripe/checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "subscription" }),
                })
                  .then((r) => r.json())
                  .then((d) => { if (d.url) window.location.href = d.url; })
                  .catch(() => setUpgradeCheckoutLoading(false));
              }}
              disabled={upgradeCheckoutLoading}
              className="w-full"
            >
              {upgradeCheckoutLoading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  Redirecting...
                </>
              ) : (
                "Subscribe to Pro"
              )}
            </Button>
          )}
          {usageDeniedInfo?.tier === "paid" && (
            <div className="flex justify-end">
              <Button variant="outline" asChild>
                <a href="/settings/usage" target="_blank" rel="noopener noreferrer">
                  Manage usage
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AIAgentPaneProps extends AIAgentPanelProps {
  isOpen: boolean;
}

export function AIAgentPane({ isOpen, ...rest }: AIAgentPaneProps) {
  if (!isOpen) return null;
  return (
    <AIAgentPanel
      {...rest}
      className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border shadow-lg flex flex-col z-50 select-text"
    />
  );
}