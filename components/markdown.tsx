"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";

/** Recursively extract plain text from React children. */
function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

export interface PassageRef {
  /** The section_id (UUID) from the embedding_sections table. */
  sectionId: string;
  /** The quoted text shown in the link — used for text-based search on the page. */
  quotedText?: string;
  /** Resolved page number (PDFs only, baked in by the server-side streaming proxy). */
  page?: number;
  /** Reading order index (EPUBs only, baked in by the server-side streaming proxy). */
  readingOrderIndex?: number;
  /** Book ID (populated in library mode). */
  bookId?: string;
}

/**
 * Parse a `ref:<section_id>` or `ref:<section_id>?p=42&ro=5&bid=abc` href
 * into a PassageRef, or null if it doesn't match.
 */
export function parsePassageRef(href: string | undefined): PassageRef | null {
  if (!href) return null;
  const match = href.match(/^ref:([^?]+)(\?.*)?$/);
  if (!match || !match[1]) return null;

  const ref: PassageRef = { sectionId: match[1] };

  if (match[2]) {
    const params = new URLSearchParams(match[2]);
    const p = params.get("p");
    if (p) { const n = parseInt(p, 10); if (!Number.isNaN(n)) ref.page = n; }
    const ro = params.get("ro");
    if (ro) { const n = parseInt(ro, 10); if (!Number.isNaN(n)) ref.readingOrderIndex = n; }
    const bid = params.get("bid");
    if (bid) ref.bookId = bid;
  }

  return ref;
}

export interface SectionBookInfo {
  bookId: string;
  bookLabel: string;
  bookType: string | null;
}

type MarkdownProps = {
  content: string;
  className?: string;
  bookId?: string;
  /** Map of sectionId → book info, used in library mode to show book titles and build URLs. */
  sectionBookMap?: Map<string, SectionBookInfo>;
  onRefClick?: (ref: PassageRef) => void;
};

export function Markdown({ content, className, bookId, sectionBookMap, onRefClick }: MarkdownProps) {
  return (
    <div
      className={[
        "select-text cursor-text",
        "text-sm leading-relaxed text-foreground",
        "space-y-3",
        className ?? "",
      ].join(" ")}
      onDragStart={(e) => {
        // If something upstream disables selection, browsers can start a drag gesture instead.
        // Prevent that so users can reliably highlight/copy AI output.
        e.preventDefault();
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => {
          // Allow ref: links through without sanitization
          if (url.startsWith("ref:")) return url;
          // Fall back to default sanitization for everything else
          return url;
        }}
        components={{
          a: ({ children, href, ...props }) => {
            const ref = parsePassageRef(href);
            if (ref && onRefClick) {
              // Strip surrounding quotation marks from the displayed text
              const raw = extractText(children);
              const display = raw.replace(/^[""\u201C\u201D]+/, "").replace(/[""\u201C\u201D]+$/, "").trim();
              // In library mode, resolve the bookId from the section map or enriched ref
              const sectionBook = sectionBookMap?.get(ref.sectionId);
              const resolvedBookId = bookId || sectionBook?.bookId || ref.bookId;
              const newTabUrl = resolvedBookId
                ? `/read/${resolvedBookId}?refSection=${encodeURIComponent(ref.sectionId)}&refQuote=${encodeURIComponent(raw)}`
                : null;
              const isLibraryMode = !bookId && (!!sectionBook || !!ref.bookId);
              const pageNumber = ref.page ?? null;
              const handleContainerClick = isLibraryMode && newTabUrl
                ? undefined
                : () => onRefClick({ ...ref, quotedText: raw });
              return (
                <span
                  role={handleContainerClick ? "button" : undefined}
                  tabIndex={handleContainerClick ? 0 : undefined}
                  onClick={handleContainerClick}
                  onKeyDown={handleContainerClick ? (e) => { if (e.key === "Enter" || e.key === " ") handleContainerClick(); } : undefined}
                  className={`my-1.5 flex flex-col w-full rounded-md border border-border bg-muted/50 text-sm leading-relaxed text-foreground hover:bg-muted hover:border-primary/30 transition-colors break-words${handleContainerClick ? " cursor-pointer" : ""}`}
                  title={handleContainerClick ? "Jump to this passage in the book" : undefined}
                >
                  {isLibraryMode && sectionBook?.bookLabel && (
                    <span className="px-3 pt-2 text-xs font-medium text-muted-foreground">{sectionBook.bookLabel}</span>
                  )}
                  {(pageNumber != null || newTabUrl) && (
                    <span className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                      {pageNumber != null && (
                        <span>Page {pageNumber}</span>
                      )}
                      {newTabUrl && (
                        <a
                          href={newTabUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-auto p-0.5 rounded hover:bg-background/80 hover:text-foreground transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </span>
                  )}
                  <span className={pageNumber != null || newTabUrl ? "border-t border-border px-3 py-2" : "px-3 py-2"}>
                    <span className="italic">{display}</span>
                  </span>
                </span>
              );
            }
            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 text-primary hover:text-primary/90 break-words"
              >
                {children}
              </a>
            );
          },
          p: ({ children }) => (
            <p className="whitespace-pre-wrap break-words">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 space-y-1 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 space-y-1 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="break-words">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          pre: ({ children, ...props }) => (
            <pre
              {...props}
              className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground"
            >
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const text = Array.isArray(children)
              ? children.join("")
              : String(children ?? "");

            const isProbablyBlock =
              Boolean(className && className.includes("language-")) ||
              text.includes("\n");

            if (!isProbablyBlock) {
              return (
                <code
                  {...props}
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                {...props}
                className={[
                  "block whitespace-pre",
                  className ?? "",
                ].join(" ")}
              >
                {text.replace(/\n$/, "")}
              </code>
            );
          },
          hr: () => <hr className="my-4 border-border" />,
          h1: ({ children }) => (
            <h1 className="mt-3 text-xl font-semibold leading-snug">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 text-lg font-semibold leading-snug">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 text-base font-semibold leading-snug">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 text-sm font-semibold leading-snug">{children}</h4>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border bg-muted px-2 py-1 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-2 py-1 align-top">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

