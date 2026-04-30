"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";
import { StreamingMarkdown, type PassageRef, type SectionBookInfo } from "@/components/markdown";
import { ToolCallSteps, type MessageToolCall } from "@/components/tool-call-steps";
import { cn } from "@/lib/utils";

interface AnonMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: MessageToolCall[];
}

interface LandingAnonChatProps {
  collectionSlug: string;
  collectionName: string;
  initialQuestion: string;
  /** Called when the user wants to dismiss the chat (close button). */
  onClose: () => void;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "invisible";
          appearance?: "always" | "execute" | "interaction-only";
        }
      ) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
      getResponse: (id?: string) => string | undefined;
    };
  }
}

export function LandingAnonChat({
  collectionSlug,
  collectionName,
  initialQuestion,
  onClose,
}: LandingAnonChatProps) {
  const [messages, setMessages] = useState<AnonMessage[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; resetAt?: string | null; reason?: string } | null>(null);
  const [sectionBookMap, setSectionBookMap] = useState<Map<string, SectionBookInfo>>(new Map());

  const turnstileTokenRef = useRef<string | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const [turnstileReady, setTurnstileReady] = useState(!TURNSTILE_SITE_KEY);
  const initialSentRef = useRef(false);

  // Render Turnstile widget when script loads
  const renderTurnstile = useCallback(() => {
    if (!TURNSTILE_SITE_KEY || !window.turnstile || !turnstileContainerRef.current) return;
    if (turnstileWidgetIdRef.current) return;
    try {
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        appearance: "interaction-only",
        callback: (token) => {
          turnstileTokenRef.current = token;
          setTurnstileReady(true);
        },
        "error-callback": () => {
          turnstileTokenRef.current = null;
          setTurnstileReady(false);
        },
        "expired-callback": () => {
          turnstileTokenRef.current = null;
          setTurnstileReady(false);
          if (turnstileWidgetIdRef.current && window.turnstile) {
            window.turnstile.reset(turnstileWidgetIdRef.current);
          }
        },
      });
    } catch (err) {
      console.error("Turnstile render failed:", err);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(turnstileWidgetIdRef.current); } catch { /* noop */ }
      }
    };
  }, []);

  const sendQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || isLoading) return;
      setError(null);

      const userMsg: AnonMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: question.trim(),
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: AnonMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
      };
      const nextMessages = [...messages, userMsg, assistantMsg];
      setMessages(nextMessages);
      setIsLoading(true);

      const apiMessages = nextMessages
        .filter((m, i) => !(i === nextMessages.length - 1 && m.role === "assistant"))
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/chat/agentic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            curatedCollectionSlug: collectionSlug,
            scopeLabel: `curated collection "${collectionName}"`,
            isPrivate: true,
            turnstileToken: turnstileTokenRef.current,
          }),
        });

        if (!res.ok) {
          let body: { error?: string; anonGateDenied?: boolean; reason?: string; resetAt?: string | null } = {};
          try { body = await res.json(); } catch { /* noop */ }
          setError({
            message: body.error || "Something went wrong. Please try again.",
            reason: body.reason,
            resetAt: body.resetAt ?? null,
          });
          // Remove the empty assistant placeholder on hard error
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setIsLoading(false);
          // Reset Turnstile so the user can retry with a fresh token
          if (turnstileWidgetIdRef.current && window.turnstile) {
            try { window.turnstile.reset(turnstileWidgetIdRef.current); } catch { /* noop */ }
          }
          turnstileTokenRef.current = null;
          return;
        }

        if (!res.body) {
          setError({ message: "No response stream." });
          setIsLoading(false);
          return;
        }

        // Stream SSE
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") {
              setIsLoading(false);
              continue;
            }
            try {
              const parsed = JSON.parse(data) as {
                type?: string;
                content?: string;
                toolName?: string;
                args?: Record<string, unknown>;
                id?: string;
                toolCallId?: string;
                results?: unknown;
                sectionId?: string;
                bookId?: string;
                bookLabel?: string;
                bookAuthor?: string;
                bookType?: string;
              };

              if (parsed.type === "tool_call" && typeof parsed.toolName === "string") {
                const tc: MessageToolCall = {
                  toolName: parsed.toolName,
                  args: parsed.args ?? {},
                  id: typeof parsed.id === "string" ? parsed.id : undefined,
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
                      : m
                  )
                );
              } else if (parsed.type === "tool_result_summary" && typeof parsed.toolCallId === "string") {
                const summary = Array.isArray(parsed.results) ? parsed.results : [];
                const tcId = parsed.toolCallId;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId && m.toolCalls
                      ? {
                          ...m,
                          toolCalls: m.toolCalls.map((t) =>
                            t.id === tcId ? { ...t, resultSummary: summary } : t
                          ),
                        }
                      : m
                  )
                );
              } else if (parsed.type === "section_map" && typeof parsed.sectionId === "string") {
                if (parsed.bookId) {
                  setSectionBookMap((prev) => {
                    const next = new Map(prev);
                    const rawLabel = parsed.bookLabel ?? "Unknown book";
                    const author = parsed.bookAuthor ?? null;
                    const titleOnly = author && rawLabel.endsWith(` by ${author}`)
                      ? rawLabel.slice(0, -` by ${author}`.length)
                      : rawLabel;
                    next.set(parsed.sectionId!, {
                      bookId: parsed.bookId!,
                      bookLabel: titleOnly,
                      bookAuthor: author,
                      bookType: parsed.bookType ?? null,
                    });
                    return next;
                  });
                }
              } else if (typeof parsed.content === "string") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + parsed.content }
                      : m
                  )
                );
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      } catch (err) {
        console.error("Anon chat stream error:", err);
        setError({ message: err instanceof Error ? err.message : "Stream failed" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setIsLoading(false);
      }
    },
    [collectionSlug, collectionName, isLoading, messages]
  );

  // Auto-fire the initial question once Turnstile is ready (or immediately if not configured)
  useEffect(() => {
    if (initialSentRef.current) return;
    if (!turnstileReady) return;
    if (!initialQuestion.trim()) return;
    initialSentRef.current = true;
    void sendQuestion(initialQuestion);
  }, [initialQuestion, turnstileReady, sendQuestion]);

  const handleRefClick = useCallback((ref: PassageRef) => {
    const bid = ref.bookId || sectionBookMap.get(ref.sectionId)?.bookId;
    if (bid) {
      const url = `/read/${bid}?refSection=${encodeURIComponent(ref.sectionId)}&refQuote=${encodeURIComponent(ref.quotedText ?? "")}`;
      window.open(url, "_blank", "noreferrer");
    }
  }, [sectionBookMap]);

  const handleFollowUp = useCallback(() => {
    const q = followUp.trim();
    if (!q) return;
    setFollowUp("");
    void sendQuestion(q);
  }, [followUp, sendQuestion]);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages]
  );

  const hasContent = lastAssistant && lastAssistant.content.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Cloudflare Turnstile script (loaded once, no-op when site key not set) */}
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={renderTurnstile}
        />
      )}
      <div ref={turnstileContainerRef} className="hidden" aria-hidden />

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{collectionName}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Free preview
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[36rem] overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {msg.content}
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className="space-y-3">
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ToolCallSteps toolCalls={msg.toolCalls} />
                )}
                {msg.content && (
                  <div className="text-foreground select-text">
                    <StreamingMarkdown
                      isStreaming={isLoading && msg.id === lastAssistant?.id}
                      content={msg.content}
                      sectionBookMap={sectionBookMap.size > 0 ? sectionBookMap : undefined}
                      onRefClick={handleRefClick}
                    />
                  </div>
                )}
                {!msg.content && isLoading && msg.id === lastAssistant?.id && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Searching the collection...</span>
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{error.message}</p>
              {(error.reason === "rate_limit" || error.reason === "budget_cap" || error.reason === "disabled") && (
                <a
                  href="/auth/sign-up"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline"
                >
                  Sign up free
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-muted/20 px-4 py-3">
          {hasContent && !isLoading && !error && (
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
              <span className="font-medium">Like what you see?</span>{" "}
              <a href="/auth/sign-up" className="font-medium text-primary hover:underline">
                Sign up free
              </a>{" "}
              to save answers, ask follow-ups across more books, and search your own library.
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && followUp.trim() && !isLoading) {
                  e.preventDefault();
                  handleFollowUp();
                }
              }}
              placeholder={isLoading ? "Generating..." : "Ask a follow-up..."}
              disabled={isLoading}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleFollowUp}
              disabled={isLoading || !followUp.trim()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                followUp.trim() && !isLoading
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
