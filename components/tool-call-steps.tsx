import { ChevronRight } from "lucide-react";

export interface MessageToolCall {
  toolName: string;
  args: Record<string, unknown>;
  id?: string;
}

export const TOOL_LABELS: Record<string, string> = {
  vector_search: "Vector search",
  text_search: "Text Search",
  web_search: "Web search",
  get_passages: "Fetching passages",
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

export function ToolCallSteps({ toolCalls }: { toolCalls: MessageToolCall[] }) {
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
