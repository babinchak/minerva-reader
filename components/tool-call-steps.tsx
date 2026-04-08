import { ChevronRight, Search, Sparkles, TextSearch, Globe, BookOpen } from "lucide-react";

export interface MessageToolCall {
  toolName: string;
  args: Record<string, unknown>;
  id?: string;
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

export function getQueryPreview(tc: MessageToolCall, maxLen = 80): string {
  const query = tc.args?.query;
  if (typeof query === "string" && query.length > 0) {
    return query.length > maxLen ? `${query.slice(0, maxLen)}...` : query;
  }
  if (tc.toolName === "get_passages") {
    const ranges = tc.args?.ranges;
    const count = Array.isArray(ranges) ? ranges.length : 0;
    return count > 0 ? `${count} range${count === 1 ? "" : "s"}` : "";
  }
  return "";
}

export interface BookMapEntry {
  label: string;
  author?: string | null;
}

/** Build a human-readable detail string for the expanded view. */
function formatToolDetail(tc: MessageToolCall, bookMap?: Map<string, BookMapEntry>): string | null {
  const { toolName, args } = tc;

  if (toolName === "vector_search" || toolName === "text_search") {
    const parts: string[] = [];
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
    return parts.join("\n") || null;
  }

  if (toolName === "get_passages") {
    const ranges = Array.isArray(args.ranges) ? args.ranges as Array<Record<string, unknown>> : [];
    if (ranges.length === 0) return null;
    // Group ranges by book for cleaner display
    const grouped = new Map<string, { label: string; chunks: { str: string; sort: number }[] }>();
    const ungrouped: string[] = [];
    for (const r of ranges) {
      const start = typeof r.start === "number" ? r.start : "?";
      const end = typeof r.end === "number" ? r.end : "?";
      const chunkStr = start === end ? `${start}` : `${start}–${end}`;
      const bookId = typeof r.book_id === "string" ? r.book_id : null;
      const entry = bookId ? bookMap?.get(bookId) : undefined;
      if (entry) {
        const key = bookId!;
        if (!grouped.has(key)) {
          const bookPart = entry.author ? `${entry.author} · ${entry.label}` : entry.label;
          grouped.set(key, { label: bookPart, chunks: [] });
        }
        grouped.get(key)!.chunks.push({ str: chunkStr, sort: typeof r.start === "number" ? r.start : Infinity });
      } else {
        ungrouped.push(`§${chunkStr}`);
      }
    }
    const lines: string[] = [];
    for (const { label, chunks } of grouped.values()) {
      const sorted = chunks.sort((a, b) => a.sort - b.sort).map((c) => c.str);
      lines.push(`${label} — §${sorted.join(", §")}`);
    }
    lines.push(...ungrouped);
    return lines.join("\n");
  }

  if (toolName === "web_search") {
    const query = typeof args.query === "string" ? args.query : null;
    return query ? `"${query}"` : null;
  }

  return null;
}

export function ToolCallSteps({ toolCalls, bookMap }: { toolCalls: MessageToolCall[]; bookMap?: Map<string, BookMapEntry> }) {
  return (
    <div className="space-y-1 text-left">
      {toolCalls.map((tc, i) => {
        const Icon = TOOL_ICONS[tc.toolName] ?? Search;
        const detail = formatToolDetail(tc, bookMap);
        return (
          <details key={tc.id ?? i} className="group">
            <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
              <Icon className="h-3 w-3 shrink-0" />
              <span className="font-medium">{formatToolLabel(tc.toolName)}</span>
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
