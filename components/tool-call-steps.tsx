import { ChevronRight, Search, Sparkles, TextSearch, Globe, BookOpen } from "lucide-react";

export interface ToolResultBook {
  bookId: string;
  book: string;
  bookAuthor?: string | null;
  indices: number[];
  resultCount?: number;
}

export interface MessageToolCall {
  toolName: string;
  args: Record<string, unknown>;
  id?: string;
  /** Populated after tool returns — per-book summary of search results. */
  resultSummary?: ToolResultBook[];
}

export const TOOL_LABELS: Record<string, string> = {
  vector_search: "Semantic search",
  text_search: "Text Search",
  web_search: "Web search",
  get_passages: "Fetching passages",
};

const TOOL_ICONS: Record<string, typeof Search> = {
  vector_search: Sparkles,
  text_search: TextSearch,
  web_search: Globe,
  get_passages: BookOpen,
};

export function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

/** Collapse sorted indices into range strings: [10,11,12,50,51] → ["§10–12", "§50–51"] */
function formatSectionRanges(indices: number[]): string {
  if (indices.length === 0) return "";
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `§${start}` : `§${start}–${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `§${start}` : `§${start}–${end}`);
  return ranges.join(", ");
}

export function getQueryPreview(tc: MessageToolCall, maxLen = 80): string {
  const query = tc.args?.query;
  if (typeof query === "string" && query.length > 0) {
    return query.length > maxLen ? `${query.slice(0, maxLen)}...` : query;
  }
  if (tc.toolName === "get_passages") {
    const sections = tc.args?.sections;
    const count = Array.isArray(sections) ? sections.length : 0;
    return count > 0 ? `${count} passage${count === 1 ? "" : "s"}` : "";
  }
  return "";
}

export interface BookMapEntry {
  label: string;
  author?: string | null;
}

/** Build a human-readable detail string for the expanded view. */
function formatToolDetail(tc: MessageToolCall): string | null {
  const { toolName, args } = tc;

  if (toolName === "vector_search" || toolName === "text_search") {
    const parts: string[] = [];
    // Always show query args
    const query = typeof args.query === "string" ? args.query : null;
    if (query) parts.push(`"${query}"`);
    const limit = typeof args.limit === "number" ? args.limit : null;
    const maxPerBook = typeof args.max_per_book === "number" ? args.max_per_book : null;
    if (limit || maxPerBook) {
      const detail: string[] = [];
      if (limit) detail.push(`limit ${limit}`);
      if (maxPerBook) detail.push(`max ${maxPerBook} per book`);
      parts.push(detail.join(", "));
    }
    // Append result summary if available
    if (tc.resultSummary && tc.resultSummary.length > 0) {
      parts.push(""); // blank line separator
      // In-book mode: single entry with no real book info — just show section numbers
      const isSingleBook = tc.resultSummary.length === 1 && tc.resultSummary[0].bookId === "_unknown";
      if (isSingleBook) {
        const entry = tc.resultSummary[0];
        if (entry.indices.length > 0) {
          parts.push(`Sections ${formatSectionRanges(entry.indices)}`);
        } else if (entry.resultCount && entry.resultCount > 0) {
          parts.push(`Found ${entry.resultCount} result${entry.resultCount === 1 ? "" : "s"}`);
        }
      } else {
        for (const b of tc.resultSummary) {
          // b.book may be "Title by Author" from formatBookLabel — strip author suffix
          const rawTitle = b.book;
          const title = b.bookAuthor && rawTitle.endsWith(` by ${b.bookAuthor}`)
            ? rawTitle.slice(0, -` by ${b.bookAuthor}`.length)
            : rawTitle;
          const bookPart = b.bookAuthor ? `${b.bookAuthor} · ${title}` : title;
          if (b.indices.length > 0) {
            parts.push(`${bookPart} — ${formatSectionRanges(b.indices)}`);
          } else {
            parts.push(bookPart);
          }
        }
      }
    }
    return parts.join("\n") || null;
  }

  if (toolName === "get_passages") {
    // Use result summary (with section indices) if available
    if (tc.resultSummary && tc.resultSummary.length > 0) {
      const lines: string[] = [];
      const isSingleBook = tc.resultSummary.length === 1 && tc.resultSummary[0].bookId === "_unknown";
      if (isSingleBook) {
        const entry = tc.resultSummary[0];
        if (entry.indices.length > 0) {
          lines.push(`Sections ${formatSectionRanges(entry.indices)}`);
        } else if (entry.resultCount && entry.resultCount > 0) {
          lines.push(`${entry.resultCount} passage${entry.resultCount === 1 ? "" : "s"}`);
        }
      } else {
        for (const b of tc.resultSummary) {
          const rawTitle = b.book;
          const title = b.bookAuthor && rawTitle.endsWith(` by ${b.bookAuthor}`)
            ? rawTitle.slice(0, -` by ${b.bookAuthor}`.length)
            : rawTitle;
          const bookPart = b.bookAuthor ? `${b.bookAuthor} · ${title}` : title;
          if (b.indices.length > 0) {
            lines.push(`${bookPart} — ${formatSectionRanges(b.indices)}`);
          } else {
            lines.push(bookPart);
          }
        }
      }
      return lines.join("\n") || null;
    }
    // Fallback: show count from args
    const sections = Array.isArray(args.sections) ? args.sections : [];
    return sections.length > 0 ? `${sections.length} passage${sections.length === 1 ? "" : "s"}` : null;
  }

  if (toolName === "web_search") {
    const query = typeof args.query === "string" ? args.query : null;
    return query ? `"${query}"` : null;
  }

  return null;
}

export function ToolCallSteps({ toolCalls }: { toolCalls: MessageToolCall[] }) {
  return (
    <div className="space-y-1 text-left">
      {toolCalls.map((tc, i) => {
        const Icon = TOOL_ICONS[tc.toolName] ?? Search;
        const detail = formatToolDetail(tc);
        return (
          <details key={tc.id ?? i} className="group">
            <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
              <Icon className="h-3 w-3 shrink-0" />
              <span className="font-medium shrink-0 whitespace-nowrap">{formatToolLabel(tc.toolName)}</span>
              {getQueryPreview(tc) && (
                <span className="truncate">— {getQueryPreview(tc)}</span>
              )}
            </summary>
            {detail && (
              <div className="mt-1 ml-5 text-[11px] text-muted-foreground/70 whitespace-pre-wrap break-words">
                {detail}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}
