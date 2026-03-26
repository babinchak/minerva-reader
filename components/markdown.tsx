"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen } from "lucide-react";

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
}

/** Parse a `ref:<section_id>` href into a PassageRef, or null if it doesn't match. */
export function parsePassageRef(href: string | undefined): PassageRef | null {
  if (!href) return null;
  // ref:<section_id> where section_id is a UUID or any non-empty string
  const match = href.match(/^ref:(.+)$/);
  if (match && match[1]) {
    return { sectionId: match[1] };
  }
  return null;
}

type MarkdownProps = {
  content: string;
  className?: string;
  onRefClick?: (ref: PassageRef) => void;
};

export function Markdown({ content, className, onRefClick }: MarkdownProps) {
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
              return (
                <button
                  type="button"
                  onClick={() => onRefClick({ ...ref, quotedText: raw })}
                  className="my-1.5 flex items-start gap-2 w-full text-left rounded-md border border-border bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground hover:bg-muted hover:border-primary/30 transition-colors cursor-pointer break-words"
                  title="Jump to this passage in the book"
                >
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="italic">{display}</span>
                </button>
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

