"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Send, Plus, Clock, MessageSquare } from "lucide-react";
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
import { getEpubVisibleContext } from "@/lib/epub-visible-context";
import { getEpubLocalContextAroundCurrentSelection } from "@/lib/book-position/local-context";
import { ContextPreviewDialog } from "@/components/context-preview-dialog";

const DEFAULT_MAX_EXPLAIN_SELECTION_CHARS = 4000;
const MAX_EXPLAIN_SELECTION_CHARS = (() => {
  const raw = process.env.NEXT_PUBLIC_MAX_EXPLAIN_SELECTION_CHARS;
  if (!raw) return DEFAULT_MAX_EXPLAIN_SELECTION_CHARS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_EXPLAIN_SELECTION_CHARS;
  return Math.max(0, parsed);
})();

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  selectionPositionLabel?: string;
  selectionPositionTitle?: string;
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
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [capturedContext, setCapturedContext] = useState<{
    startPosition?: string;
    endPosition?: string;
    localArea?: { beforeText?: string; selectedText?: string; afterText?: string };
    selectedText?: string;
  } | null>(null);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);
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

  // Helper function to handle streaming response
  const handleStreamingResponse = useCallback(
    async (
      response: Response,
      assistantMessageId: string,
      onStreamComplete?: (content: string) => void | Promise<void>
    ) => {
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

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
              setIsLoading(false);
              await onStreamComplete?.(fullContent);
              onActionComplete?.();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
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

      setIsLoading(false);
      await onStreamComplete?.(fullContent);
      onActionComplete?.();
    },
    [onActionComplete]
  );

  // Fetch current user
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    };
    init();
  }, [supabase]);

  // Fetch book metadata when bookId is available
  useEffect(() => {
    if (bookId) {
      const fetchBookMetadata = async () => {
        const { data, error } = await supabase
          .from("books")
          .select("title, author")
          .eq("id", bookId)
          .single();

        if (!error && data) {
          setBookTitle(data.title || "");
          setBookAuthor(data.author || "");
        }
      };

      fetchBookMetadata();
    }
  }, [bookId, supabase]);

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
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    if (isLoading) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content, selection_position_label, selection_position_title, created_at")
        .eq("chat_id", activeChatId)
        .order("message_index", { ascending: true });
      if (data && data.length > 0) {
        setMessages(
          data.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at),
            selectionPositionLabel: m.selection_position_label ?? undefined,
            selectionPositionTitle: m.selection_position_title ?? undefined,
          }))
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
    messageIndex: number
  ) => {
    await supabase.from("chat_messages").insert({
      chat_id: chatId,
      role: "assistant",
      content,
      message_index: messageIndex,
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
    onActionStart?.();

    const userInput = input;
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
        const visible = getEpubVisibleContext({ maxChars: 30000 });
        if (visible?.text) {
          sendPageContextBlock = `Current view text for context:\n\n"${visible.text}"`;
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

    setInput("");
    setIsLoading(true);

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
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
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

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: messagesForAPI }),
      });

      const isNewChat = chatId && msgCount === 0;
      await handleStreamingResponse(response, assistantMessageId, async (content) => {
        if (chatId) {
          await persistAssistantMessage(chatId, content, assistantMsgIndex);
          if (isNewChat) {
            generateAndUpdateChatTitle(chatId, userInput, content).catch(() => {});
          }
        }
      });
    } catch (error) {
      console.error("Error calling chat API:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content:
                  "Sorry, I encountered an error. Please make sure the OpenAI API key is configured correctly.",
              }
            : msg
        )
      );
      setIsLoading(false);
      onActionComplete?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExplain = useCallback(async (action: "page" | "selection") => {
    if (!bookId || isLoading) return;
    onActionStart?.();

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
    if (isExplainSelectionNow && !selectionExists) {
      return;
    }

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
        const visible = getEpubVisibleContext({ maxChars: 30000 });
        if (!visible?.text) {
          setIsLoading(false);
          onActionComplete?.();
          return;
        }
        explainBodyText = visible.text;
        selectionPositionLabel = `(View)`;
        selectionPositionTitle = "EPUB visible context";
        // No reliable position → we skip summary lookup here (best-effort).
        summaries = [];
      } else {
        const readingOrder = rawManifest?.readingOrder || [];
        const position = selectionSnapshot?.epubPosition ?? getCurrentSelectionPosition(readingOrder, null);
        if (position) {
          const formatted = formatSelectionPositionLabel(position.start, position.end);
          selectionPositionLabel = formatted.label;
          selectionPositionTitle = formatted.title;
          summaries = (await querySummariesForPosition(bookId, position.start, position.end)).map(
            ({ toc_title, chapter_path, summary_text }) => ({
              summary_type: "chapter",
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

    // Add local PDF context window around selection (from document for cross-page context)
    if (isPdf && !isExplainPage) {
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

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: messagesForAPI }),
      });

      const isNewChat = chatId && msgCount === 0;
      await handleStreamingResponse(response, assistantMessageId, async (content) => {
        if (chatId) {
          await persistAssistantMessage(chatId, content, assistantMsgIndex);
          if (isNewChat) {
            generateAndUpdateChatTitle(chatId, explainUserMessage, content).catch(() => {});
          }
        }
      });
    } catch (error) {
      console.error("Error calling chat API:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content:
                  "Sorry, I encountered an error. Please make sure the OpenAI API key is configured correctly.",
              }
            : msg
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
    handleExplain(autoRun.action).catch(() => {
      // best-effort
    });
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
        </div>
      )}

      {/* Empty state: input near top (Cursor-style) */}
      {showMessages && messages.length === 0 && (
        <div className="flex-1 flex flex-col justify-start pt-4 px-4 min-h-0">
          <div className="space-y-4 max-w-full">
              {(trimmedSelectedText || (currentPage && currentPage >= 1)) && (
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
                  placeholder="Ask a question about the book..."
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
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {messages
            .filter((m) => m.role !== "assistant" || m.content.trim().length > 0)
            .map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <Card
                className={`max-w-[80%] p-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground select-text"
                }`}
              >
                {message.role === "assistant" ? (
                  <Markdown content={message.content} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                )}
                {message.selectionPositionLabel && (
                  <div className="mt-2">
                    <span
                      title={message.selectionPositionTitle}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        message.role === "user"
                          ? "text-primary-foreground/80"
                          : "text-foreground/80"
                      } border-primary/40 bg-primary/10`}
                    >
                      {message.selectionPositionLabel}
                    </span>
                  </div>
                )}
              </Card>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <Card className="bg-muted p-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 bg-foreground rounded-full animate-bounce" />
                  <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="h-2 w-2 bg-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Input (bottom: when chat has messages, or in compact mode when showMessages is false) */}
      {((showMessages && messages.length > 0) || !showMessages) && (
        <div className="p-4 border-t border-border shrink-0">
          {(trimmedSelectedText || (currentPage && currentPage >= 1)) && (
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
          <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about the book..."
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