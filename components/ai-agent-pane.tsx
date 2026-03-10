"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Send, Plus, Clock, MessageSquare, Zap, Sparkles, Loader2, ChevronRight, Highlighter } from "lucide-react";
import { Markdown } from "@/components/markdown";
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
import { ContextPreviewDialog } from "@/components/context-preview-dialog";
import { UpgradeCta } from "@/components/upgrade-cta";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hapticLight, hapticHeader } from "@/lib/haptic";
import { useIsMobile } from "@/lib/use-media-query";

const DEFAULT_MAX_EXPLAIN_SELECTION_CHARS = 4000;
const MAX_EXPLAIN_SELECTION_CHARS = (() => {
  const raw = process.env.NEXT_PUBLIC_MAX_EXPLAIN_SELECTION_CHARS;
  if (!raw) return DEFAULT_MAX_EXPLAIN_SELECTION_CHARS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_EXPLAIN_SELECTION_CHARS;
  return Math.max(0, parsed);
})();

export interface MessageToolCall {
  toolName: string;
  args: Record<string, unknown>;
  id?: string;
}

const TOOL_LABELS: Record<string, string> = {
  vector_search: "Vector search",
  text_search: "Text Search",
  web_search: "Web search",
  get_passage_content: "Fetching passage",
};

function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

function getQueryPreview(tc: MessageToolCall, maxLen = 80): string {
  const query = tc.args?.query;
  if (typeof query === "string" && query.length > 0) {
    return query.length > maxLen ? `${query.slice(0, maxLen)}...` : query;
  }
  if (tc.toolName === "get_passage_content") {
    const ids = tc.args?.section_ids;
    const count = Array.isArray(ids) ? ids.length : 0;
    return count > 0 ? `${count} section${count === 1 ? "" : "s"}` : "";
  }
  return "";
}

function ToolCallSteps({ toolCalls }: { toolCalls: MessageToolCall[] }) {
  return (
    <div className="space-y-1 text-left">
      {toolCalls.map((tc, i) => (
        <details key={tc.id ?? i} className="group">
          <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
            <span className="font-medium">{formatToolLabel(tc.toolName)}</span>
            {getQueryPreview(tc) && (
              <span className="truncate">— {getQueryPreview(tc)}</span>
            )}
          </summary>
          <pre className="mt-1 ml-5 text-[10px] text-muted-foreground/80 overflow-x-auto whitespace-pre-wrap break-words">
            {JSON.stringify(tc.args, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  selectionPositionLabel?: string;
  selectionPositionTitle?: string;
  toolCalls?: MessageToolCall[];
}

export interface AIAgentPanelProps {
  selectedText?: string;
  bookId?: string;
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
  showSelectionChip?: boolean;
  /**
   * Current PDF page number (1-based). When provided, shows "Using page X for context" when no selection.
   * Enables page context to be included when user types a question.
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
    const parts = value.split(/[/:]/);
    if (parts.length < 3) return false;
    return parts.every((part) => /^\d+$/.test(part));
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
  rawManifest,
  bookType = "epub",
  autoRun = null,
  includeSelectionContextOnSend = false,
  showHeader = true,
  showMessages = true,
  showSelectedTextBanner = true,
  showSelectionChip = false,
  currentPage,
  pdfDocument,
  onActionStart,
  onActionComplete,
  className,
  onClose,
}: AIAgentPanelProps) {
  const lastAutoRunNonceRef = useRef<number | null>(null);

  const normalizedSelectedText = selectedText ?? "";
  const trimmedSelectedText = normalizedSelectedText.trim();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bookTitle, setBookTitle] = useState<string>("");
  const [bookAuthor, setBookAuthor] = useState<string>("");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<
    { id: string; book_id: string | null; created_at: string; title: string | null }[]
  >([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<"fast" | "agentic">("fast");
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [capturedContext, setCapturedContext] = useState<{
    startPosition?: string;
    endPosition?: string;
    localArea?: { beforeText?: string; selectedText?: string; afterText?: string };
    selectedText?: string;
  } | null>(null);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);
  const sendingRef = useRef(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
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

  const handleContextButtonPress = useCallback(() => {
    if (trimmedSelectedText) {
      const snapshot = getSelectionSnapshot();
      const selectedTextForContext = snapshot?.text?.trim() || trimmedSelectedText;

      const isPdf = bookType === "pdf";
      if (isPdf) {
        const pos = snapshot?.pdfPosition ?? getCurrentPdfSelectionPosition() ?? undefined;
        let localArea: { beforeText?: string; selectedText?: string; afterText?: string } | undefined;
        if (!pdfDocument) {
          const local = getPdfLocalContextAroundCurrentSelection({
            beforeChars: 800,
            afterChars: 800,
            maxTotalChars: 2400,
          });
          if (local) {
            localArea = {
              beforeText: local.beforeText || undefined,
              selectedText: local.selectedText || undefined,
              afterText: local.afterText || undefined,
            };
          }
        }
        setCapturedContext({
          startPosition: pos?.start,
          endPosition: pos?.end,
          selectedText: selectedTextForContext.trim(),
          localArea,
        });
      } else {
        const readingOrder = rawManifest?.readingOrder || [];
        const pos = snapshot?.epubPosition ?? getCurrentSelectionPosition(readingOrder, null) ?? undefined;
        setCapturedContext({
          startPosition: pos?.start,
          endPosition: pos?.end,
          selectedText: selectedTextForContext.trim(),
        });
      }
    } else {
      setCapturedContext(null);
    }
    setContextDialogOpen(true);
  }, [
    trimmedSelectedText,
    bookType,
    rawManifest?.readingOrder,
    pdfDocument,
    getSelectionSnapshot,
  ]);

  type StreamUsage = {
    inputTokens?: number | null;
    outputTokens?: number | null;
    costCents: number;
    model?: string;
    included: boolean;
    chatMode?: string;
  };

  // Helper function to handle streaming response
  const handleStreamingResponse = useCallback(
    async (
      response: Response,
      assistantMessageId: string,
      onStreamComplete?: (content: string, usage?: StreamUsage, toolCalls?: MessageToolCall[]) => void | Promise<void>,
      onStatus?: (message: string | null) => void
    ) => {
      if (!response.ok) {
        let message = response.statusText;
        try {
          const body = await response.json();
          if (body?.message) message = body.message;
          else if (body?.error) message = body.error;
        } catch {
          // Ignore JSON parse errors
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

      while (true) {
        const { done, value } = await reader.read();
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
              if (parsed.type === "tool_call" && typeof parsed.toolName === "string") {
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
              } else if (parsed.type === "status" && typeof parsed.message === "string") {
                onStatus?.(parsed.message);
              } else if (parsed.type === "usage") {
                streamUsage = {
                  inputTokens: parsed.inputTokens,
                  outputTokens: parsed.outputTokens,
                  costCents: parsed.costCents ?? 0,
                  model: parsed.model,
                  included: parsed.included ?? true,
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
    [onActionComplete]
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

  const anonChatKey = `minerva-anon-chat-${bookId ?? "general"}`;

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

  // Credits/tier info (for Deep mode limits and display). Fetch for both logged-in and anonymous (freeBetaMode).
  const [creditsInfo, setCreditsInfo] = useState<{
    tier: string;
    agenticToday: number;
    agenticLimit: number;
    balance: number;
    freeBetaMode?: boolean;
  } | null>(null);

  // Dialog shown when user runs out of credits
  const [creditsExhaustedDialogOpen, setCreditsExhaustedDialogOpen] = useState(false);
  useEffect(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d
          ? {
              tier: d.tier,
              agenticToday: d.agenticToday ?? 0,
              agenticLimit: d.agenticLimit ?? 5,
              balance: d.balance ?? 0,
              freeBetaMode: d.freeBetaMode ?? false,
            }
          : null
      )
      .then(setCreditsInfo)
      .catch(() => setCreditsInfo(null));
  }, [userId]);

  // Anonymous: force fast mode only (unless FREE_BETA_MODE)
  useEffect(() => {
    if (!userId && chatMode === "agentic" && !creditsInfo?.freeBetaMode) setChatMode("fast");
  }, [userId, chatMode, creditsInfo?.freeBetaMode]);

  // Processing status: summaries and vectors (both improve AI context quality)
  const [processingStatus, setProcessingStatus] = useState<{
    summariesReady: boolean;
    vectorsReady: boolean;
  } | null>(null);

  // Fetch book metadata and processing status when bookId is available; poll while incomplete
  // Uses API route so anonymous users can access curated books (direct Supabase hits RLS and returns 406)
  useEffect(() => {
    if (!bookId) {
      setProcessingStatus(null);
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      const res = await fetch(`/api/books/${bookId}/metadata`);
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author?: string;
          summaries_processed_at?: string | null;
          vectors_processed_at?: string | null;
        };
        const summariesReady = Boolean(data.summaries_processed_at);
        const vectorsReady = Boolean(data.vectors_processed_at);
        setBookTitle(data.title || "");
        setBookAuthor(data.author || "");
        setProcessingStatus({ summariesReady, vectorsReady });
        return summariesReady && vectorsReady;
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

  // Load messages when selecting a chat (skip while sending/streaming to avoid overwriting optimistic messages)
  // Anonymous: never clear on !activeChatId - we keep ephemeral messages in state (and sessionStorage)
  useEffect(() => {
    if (!activeChatId) {
      if (userId) setMessages([]);
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
      } else {
        setMessages([]);
      }
    };
    loadMessages();
  }, [activeChatId, isLoading, supabase]);

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    if (!userId && typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(`minerva-anon-chat-${bookId ?? "general"}`);
      } catch {
        // Ignore
      }
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
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

  const persistAssistantMessage = async (
    chatId: string,
    content: string,
    messageIndex: number,
    usage?: {
      inputTokens?: number | null;
      outputTokens?: number | null;
      costCents: number;
      model?: string;
      included: boolean;
      chatMode?: string;
    },
    toolCalls?: MessageToolCall[]
  ) => {
    await supabase.from("chat_messages").insert({
      chat_id: chatId,
      role: "assistant",
      content,
      message_index: messageIndex,
      cost_cents: usage?.costCents ?? null,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      model: usage?.model ?? null,
      usage_included: usage?.included ?? true,
      chat_mode: usage?.chatMode ?? null,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    if (sendingRef.current) return;
    sendingRef.current = true;
    hapticLight();
    onActionStart?.();
    // "Streaming started" – satisfying burst in same sync stack (only way to work on iOS)
    hapticHeader();

    const userInput = input;
    setInput("");
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
        const visible = getEpubVisibleContextWithPosition(readingOrder, { maxChars: 30000 });
        if (visible?.text) {
          sendPageContextBlock = `Current view text for context:\n\n"${visible.text}"`;
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
            // Best-effort context enrichment for typed sends.
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

      if (userId) {
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
        userContent = `User question:\n${userInput}\n\n${contextHeader}${sendContextBlock ? `${sendContextBlock}` : ""}${sendLocalContextBlock ? `${sendLocalContextBlock}` : ""}Selected text (use as context):\n"${selectionForSend}"`;
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
          userContent = `User question:\n${userInput}\n\n${contextHeader}${sendContextBlock ? `${sendContextBlock}` : ""}${sendPageContextBlock ? `${sendPageContextBlock}` : ""}`;
        }
      }

      const messagesForAPI = [
        ...historyForAPI,
        { role: "user" as const, content: userContent },
      ];

      const chatUrl = chatMode === "agentic" ? "/api/chat/agentic" : "/api/chat";
      const chatBody =
        chatMode === "agentic"
          ? JSON.stringify({ messages: messagesForAPI, bookId: bookId ?? undefined, chatId: chatId ?? undefined })
          : JSON.stringify({ messages: messagesForAPI, chatId: chatId ?? undefined });

      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: chatBody,
      });

      const isNewChat = chatId && msgCount === 0;
      await handleStreamingResponse(
        response,
        assistantMessageId,
        async (content, usage, toolCalls) => {
          if (chatId) {
            await persistAssistantMessage(chatId, content, assistantMsgIndex, usage, toolCalls);
            if (isNewChat) {
              generateAndUpdateChatTitle(chatId, userInput, content).catch(() => {});
            }
          }
        },
        undefined
      );
    } catch (error) {
      console.error("Chat API error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Sorry, an error occurred. Please try again.";
      const isCreditsError =
        errorMessage.toLowerCase().includes("credits") || errorMessage.toLowerCase().includes("run out");
      if (isCreditsError) {
        setCreditsExhaustedDialogOpen(true);
      }
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
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

    // If action says "page", but we are in an EPUB, we do a best-effort visible-context extraction.
    // For PDF we use the existing page-context logic.

    // Get current selection position
    setIsLoading(true);

    let summaries: SummaryContext[] = [];
    let selectionPositionLabel: string | undefined;
    let selectionPositionTitle: string | undefined;
    const explainUserMessage = isExplainPage ? "Explain page" : "Explain selection";
    let explainBodyText = currentSelectedText;
    if (isPdf) {
      if (isExplainPage) {
        const page = getCurrentPdfPageContext({ maxChars: 30000 });
        if (!page || !page.text) {
          setIsLoading(false);
          onActionComplete?.();
          return;
        }
        explainBodyText = page.text;
        selectionPositionLabel = `(Page ${page.pageNumber})`;
        selectionPositionTitle = `start=${page.startPosition} end=${page.endPosition}`;
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
          const formatted = formatSelectionPositionLabel(
            position.start,
            position.end
          );
          selectionPositionLabel = formatted.label;
          selectionPositionTitle = formatted.title;
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
          setIsLoading(false);
          onActionComplete?.();
          return;
        }
        explainBodyText = visible.text;
        selectionPositionLabel = `(View)`;
        selectionPositionTitle = "EPUB visible context";
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
          const formatted = formatSelectionPositionLabel(position.start, position.end);
          selectionPositionLabel = formatted.label;
          selectionPositionTitle = formatted.title;
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


    const userMessage: AIMessage = {
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

    try {
      let chatId: string | null = null;
      let historyForAPI: { role: "user" | "assistant"; content: string }[] = [];

      if (userId) {
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
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
      }

      const userMsgIndex = msgCount;
      const assistantMsgIndex = msgCount + 1;

      const messagesForAPI = [
        ...historyForAPI,
        { role: "user" as const, content: prompt },
      ];

      const chatUrl = chatMode === "agentic" ? "/api/chat/agentic" : "/api/chat";
      const chatBody =
        chatMode === "agentic"
          ? JSON.stringify({ messages: messagesForAPI, bookId: bookId ?? undefined, chatId: chatId ?? undefined })
          : JSON.stringify({ messages: messagesForAPI, chatId: chatId ?? undefined });

      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: chatBody,
      });

      const isNewChat = chatId && msgCount === 0;
      await handleStreamingResponse(
        response,
        assistantMessageId,
        async (content, usage, toolCalls) => {
          if (chatId) {
            await persistAssistantMessage(chatId, content, assistantMsgIndex, usage, toolCalls);
            if (isNewChat) {
              generateAndUpdateChatTitle(chatId, explainUserMessage, content).catch(() => {});
            }
          }
        },
        undefined
      );
    } catch (error) {
      console.error("Chat API error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Sorry, an error occurred. Please try again.";
      const isCreditsError =
        errorMessage.toLowerCase().includes("credits") || errorMessage.toLowerCase().includes("run out");
      if (isCreditsError) {
        setCreditsExhaustedDialogOpen(true);
      }
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

  // Mobile: scroll to bottom when user sends or assistant streams, so new question and response stay visible
  useEffect(() => {
    if (!isMobile || messages.length === 0) return;
    const el = messagesScrollRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight - el.clientHeight;
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
  }, [isMobile, messages, isLoading]);

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
              {userId && (
                <DropdownMenu>
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
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    {chats.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground">
                        No recent chats
                      </div>
                    ) : (
                      chats.map((chat) => (
                        <DropdownMenuItem
                          key={chat.id}
                          onClick={() => handleSelectChat(chat.id)}
                          className="flex items-center gap-2"
                        >
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          <span className="truncate min-w-0">
                            {chat.title?.trim() || new Date(chat.created_at).toLocaleDateString()}
                          </span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="flex items-center gap-1.5">
                {!userId && creditsInfo && !creditsInfo.freeBetaMode ? (
                  <span className="text-xs text-muted-foreground" title="Sign in for Deep mode">
                    Sign in for Deep mode
                  </span>
                ) : creditsInfo?.tier === "free" &&
                  (creditsInfo?.agenticToday ?? 0) >= (creditsInfo?.agenticLimit ?? 5) ? (
                  <span className="text-xs text-muted-foreground" title="5 deep mode questions per day on free tier">
                    {creditsInfo.agenticToday}/5 Deep today
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={chatMode === "agentic"}
                      aria-label={chatMode === "fast" ? "Quick mode (single call)" : "Deep mode (tools: vector, text, web search)"}
                      title={chatMode === "fast" ? "Quick mode (single call)" : "Deep mode (tools: vector, text, web search)"}
                      onClick={() => setChatMode(chatMode === "fast" ? "agentic" : "fast")}
                      disabled={
                        creditsInfo?.tier === "free" &&
                        (creditsInfo?.agenticToday ?? 0) >= (creditsInfo?.agenticLimit ?? 5)
                      }
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
                      {creditsInfo?.tier === "free" && (
                        <span className="ml-0.5">
                          ({creditsInfo.agenticToday}/{creditsInfo.agenticLimit})
                        </span>
                      )}
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
            </div>
          )}
        </div>
      )}

      {/* Empty state: input near top (Cursor-style) */}
      {showMessages && messages.length === 0 && (
        <div className="flex-1 flex flex-col justify-start pt-4 px-4 min-h-0">
          <div className="space-y-4 max-w-full">
              {showSelectionChip && (trimmedSelectedText || (currentPage && currentPage >= 1)) && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={handleContextButtonPress}
                    className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                  >
                    {trimmedSelectedText
                      ? "Using selected text for context"
                      : `Using page ${currentPage} for context`}
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={trimmedSelectedText ? "Ask a question about the selection..." : "Ask a question about the book..."}
                  disabled={isLoading}
                  className="flex-1 bg-muted/50 shadow-md border-border dark:bg-muted dark:border-muted-foreground/30 dark:shadow-none"
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
            return filteredMessages.map((message, index) => {
              const isLastMessage = index === filteredMessages.length - 1;
              const isStreaming =
                isLoading &&
                isLastMessage &&
                message.role === "assistant" &&
                !message.content.trim();
              if (message.role === "user") {
                return (
                  <div key={message.id} className="flex flex-col gap-2 items-end">
                    <div className="flex justify-end w-full max-w-[85%]">
                      <Card className="p-3 bg-primary text-primary-foreground">
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {message.content}
                        </p>
                        {message.selectionPositionLabel && (
                          <div className="mt-2">
                            <span
                              title={message.selectionPositionTitle}
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-primary-foreground/80 border-primary-foreground/40 bg-primary-foreground/10"
                            >
                              {message.selectionPositionLabel}
                            </span>
                          </div>
                        )}
                      </Card>
                    </div>
                  </div>
                );
              }
              return (
                <div key={message.id} className="flex flex-col gap-2 w-full">
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="w-full text-left">
                      <ToolCallSteps toolCalls={message.toolCalls} />
                    </div>
                  )}
                  <div className="w-full text-foreground select-text">
                    {message.content.trim() ? (
                      <Markdown content={message.content} />
                    ) : isStreaming ? (
                      <div className="flex gap-1">
                        <div className="h-2 w-2 bg-foreground rounded-full animate-bounce" />
                        <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    ) : null}
                    {message.selectionPositionLabel && (
                      <div className="mt-2">
                        <span
                          title={message.selectionPositionTitle}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-foreground/80 border-border bg-muted"
                        >
                          {message.selectionPositionLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Input (bottom: when chat has messages, or in compact mode when showMessages is false) */}
      {((showMessages && messages.length > 0) || !showMessages) && (
        <div className="p-4 border-t border-border shrink-0">
          {showSelectionChip && (trimmedSelectedText || (currentPage && currentPage >= 1)) && (
            <div className="mb-2">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={handleContextButtonPress}
                className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              >
                {trimmedSelectedText
                  ? "Using selected text for context"
                  : `Using page ${currentPage} for context`}
              </button>
            </div>
          )}
          {!showMessages && trimmedSelectedText && (
            <div className="mb-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleExplain("selection")}
                disabled={isLoading}
                className="w-full justify-center"
                aria-label="Explain selection"
              >
                <Highlighter className="h-4 w-4 mr-2" />
                Explain selection
              </Button>
            </div>
          )}
          <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={trimmedSelectedText ? "Ask a question about the selection..." : "Ask a question about the book..."}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
        </div>
      )}

      <ContextPreviewDialog
        isOpen={contextDialogOpen}
        onClose={() => {
          setContextDialogOpen(false);
          setCapturedContext(null);
        }}
        bookId={bookId}
        bookType={bookType}
        rawManifest={rawManifest}
        bookTitle={bookTitle}
        bookAuthor={bookAuthor}
        capturedContext={capturedContext}
        pdfDocument={pdfDocument}
      />

      <Dialog open={creditsExhaustedDialogOpen} onOpenChange={setCreditsExhaustedDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Out of credits</DialogTitle>
            <DialogDescription>
              You&apos;ve run out of credits. Upgrade or add more to continue using the AI assistant.
            </DialogDescription>
          </DialogHeader>
          <UpgradeCta />
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