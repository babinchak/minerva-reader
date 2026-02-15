"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X } from "lucide-react";
import {
  getCurrentSelectionPosition,
  getSelectedText,
} from "@/lib/book-position-utils";
import { getCurrentPdfSelectionPosition } from "@/lib/pdf-position/selection-position";
import { getCurrentPdfPageContext } from "@/lib/pdf-position/page-context";
import { getPdfLocalContextAroundCurrentSelection } from "@/lib/pdf-position/local-context";
import { getEpubVisibleContext } from "@/lib/epub-visible-context";
import { getPdfLocalContextFromDocument } from "@/lib/pdf-position/local-context-from-document";
import type { ContextSummary } from "@/app/api/books/[bookId]/context/route";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface ContextPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string | undefined;
  bookType: "epub" | "pdf";
  rawManifest?: { readingOrder?: Array<{ href?: string }> };
  bookTitle?: string;
  bookAuthor?: string;
  /** Pre-captured position and local context (from mousedown before selection is lost) */
  capturedContext?: {
    startPosition?: string;
    endPosition?: string;
    localArea?: { beforeText?: string; selectedText?: string; afterText?: string };
    selectedText?: string;
  } | null;
  /** PDF document for extracting local context from arbitrary pages */
  pdfDocument?: PDFDocumentProxy | null;
}

export function ContextPreviewDialog({
  isOpen,
  onClose,
  bookId,
  bookType,
  rawManifest,
  bookTitle,
  bookAuthor,
  capturedContext,
  pdfDocument,
}: ContextPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<{ title: string; author: string } | null>(null);
  const [summaries, setSummaries] = useState<ContextSummary[]>([]);
  const [localArea, setLocalArea] = useState<{
    beforeText?: string;
    selectedText?: string;
    afterText?: string;
  } | null>(null);
  const [visibleText, setVisibleText] = useState<string | null>(null);
  const [selectedTextOnly, setSelectedTextOnly] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    if (!bookId || !isOpen) return;
    setLoading(true);
    setError(null);
    setSummaries([]);
    setBook(null);
    setLocalArea(null);
    setVisibleText(null);
    setSelectedTextOnly(null);

    try {
      const isPdf = bookType === "pdf";
      let startPosition: string | undefined;
      let endPosition: string | undefined;

      if (capturedContext) {
        startPosition = capturedContext.startPosition;
        endPosition = capturedContext.endPosition;
        if (capturedContext.localArea) {
          setLocalArea(capturedContext.localArea);
        } else if (capturedContext.selectedText) {
          if (pdfDocument && bookType === "pdf" && startPosition && endPosition) {
            getPdfLocalContextFromDocument(
              pdfDocument,
              startPosition,
              endPosition,
              capturedContext.selectedText,
              { beforeChars: 1200, afterChars: 1200, pagesBefore: 2, pagesAfter: 2, maxTotalChars: 4000 }
            )
              .then((local) => {
                if (local) {
                  setLocalArea({
                    beforeText: local.beforeText || undefined,
                    selectedText: local.selectedText || undefined,
                    afterText: local.afterText || undefined,
                  });
                } else {
                  setSelectedTextOnly(capturedContext.selectedText ?? null);
                }
              })
              .catch(() => setSelectedTextOnly(capturedContext.selectedText ?? null));
          } else {
            setSelectedTextOnly(capturedContext.selectedText);
          }
        }
      } else {
        const selectionText = getSelectedText();
        const hasSelection = Boolean(selectionText?.trim());

        if (isPdf) {
          if (hasSelection) {
            const pos = getCurrentPdfSelectionPosition();
            if (pos) {
              startPosition = pos.start;
              endPosition = pos.end;
            }
            const local = getPdfLocalContextAroundCurrentSelection({
              beforeChars: 800,
              afterChars: 800,
              maxTotalChars: 2400,
            });
            if (local) {
              setLocalArea({
                beforeText: local.beforeText || undefined,
                selectedText: local.selectedText || undefined,
                afterText: local.afterText || undefined,
              });
            } else {
              setSelectedTextOnly(selectionText?.trim() || null);
            }
          } else {
            const page = getCurrentPdfPageContext({ maxChars: 30000 });
            if (page) {
              startPosition = page.startPosition;
              endPosition = page.endPosition;
            }
          }
        } else {
          if (hasSelection) {
            const readingOrder = rawManifest?.readingOrder || [];
            const pos = getCurrentSelectionPosition(readingOrder, null);
            if (pos) {
              startPosition = pos.start;
              endPosition = pos.end;
            }
            setSelectedTextOnly(selectionText?.trim() || null);
          }
        }
      }

      if (startPosition && endPosition) {
        const res = await fetch(`/api/books/${bookId}/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookType: isPdf ? "pdf" : "epub",
            startPosition,
            endPosition,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to fetch context");
        }
        const data = await res.json();
        setBook(data.book);
        setSummaries(data.summaries || []);
      } else {
        setBook(bookTitle || bookAuthor ? { title: bookTitle || "", author: bookAuthor || "" } : null);
      }

      if (!capturedContext) {
        const selectionText = getSelectedText();
        const hasSelection = Boolean(selectionText?.trim());
        if (!hasSelection && !isPdf) {
          const visible = getEpubVisibleContext({ maxChars: 8000 });
          if (visible?.text) {
            setVisibleText(visible.text);
          }
        }
        if (!hasSelection && isPdf) {
          const page = getCurrentPdfPageContext({ maxChars: 12000 });
          if (page?.text) {
            setVisibleText(page.text);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load context");
    } finally {
      setLoading(false);
    }
  }, [bookId, bookType, rawManifest, isOpen, bookTitle, bookAuthor, capturedContext, pdfDocument]);

  useEffect(() => {
    if (isOpen) {
      fetchContext();
    }
  }, [isOpen, fetchContext]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bookSummaries = summaries.filter((s) => s.summary_type === "book");
  const wideSummaries = summaries.filter((s) => s.summary_type === "chapter");
  const narrowSummaries = summaries.filter((s) => s.summary_type === "subchapter");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="context-preview-title"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
      />
      <div
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 id="context-preview-title" className="text-lg font-semibold">
            Context sent to AI
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex gap-1">
                <div className="h-2 w-2 rounded-full bg-foreground animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-foreground animate-bounce [animation-delay:0.2s]" />
                <div className="h-2 w-2 rounded-full bg-foreground animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {!loading && !error && (
            <>
              {/* Book context */}
              {(book?.title || book?.author || bookTitle || bookAuthor) && (
                <Section title="Book">
                  <p className="text-sm text-muted-foreground">
                    {(book?.title || bookTitle) && (
                      <span className="font-medium text-foreground">{(book?.title || bookTitle)}</span>
                    )}
                    {(book?.author || bookAuthor) && (
                      <span> by {(book?.author || bookAuthor)}</span>
                    )}
                  </p>
                  {bookSummaries.map((s, i) => (
                    <p key={i} className="mt-2 text-sm">
                      {s.summary_text || "(No summary)"}
                    </p>
                  ))}
                </Section>
              )}

              {/* Wide context (chapters) */}
              {wideSummaries.length > 0 && (
                <Section title="Wide context">
                  {wideSummaries.map((s, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      <p className="text-sm">{s.summary_text || "(No summary)"}</p>
                    </div>
                  ))}
                </Section>
              )}

              {/* Narrow context (subchapters) */}
              {narrowSummaries.length > 0 && (
                <Section title="Narrow context">
                  {narrowSummaries.map((s, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      <p className="text-sm">{s.summary_text || "(No summary)"}</p>
                    </div>
                  ))}
                </Section>
              )}

              {/* Local area */}
              {localArea && (localArea.beforeText || localArea.selectedText || localArea.afterText) && (
                <Section title="Local area">
                  {localArea.beforeText && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Before</p>
                      <p className="text-sm whitespace-pre-wrap">{localArea.beforeText}</p>
                    </div>
                  )}
                  {localArea.selectedText && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Selected</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">
                        {localArea.selectedText}
                      </p>
                    </div>
                  )}
                  {localArea.afterText && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">After</p>
                      <p className="text-sm whitespace-pre-wrap">{localArea.afterText}</p>
                    </div>
                  )}
                </Section>
              )}

              {/* Selected text only (EPUB selection, no local before/after) */}
              {selectedTextOnly && !localArea && (
                <Section title="Selected text">
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">
                    {selectedTextOnly}
                  </p>
                </Section>
              )}

              {/* Visible / page text (when no selection) */}
              {visibleText && !localArea && (
                <Section title="Page / visible text">
                  <p className="text-sm whitespace-pre-wrap">{visibleText}</p>
                </Section>
              )}

              {!book?.title && !book?.author && !bookTitle && !bookAuthor &&
                summaries.length === 0 && !localArea && !visibleText && !selectedTextOnly && !loading && (
                <p className="text-sm text-muted-foreground">
                  No context available. Select text or ensure you&apos;re viewing a page.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-2 text-foreground">{title}</h3>
      {children}
    </Card>
  );
}
