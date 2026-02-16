/**
 * Web search via Tavily API.
 * Set TAVILY_API_KEY in .env.local to enable.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  error?: string;
}

export async function webSearch(
  query: string,
  options?: { maxResults?: number }
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey?.trim()) {
    return { results: [], error: "TAVILY_API_KEY is not configured" };
  }

  const maxResults = Math.min(Math.max(1, options?.maxResults ?? 5), 20);

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: query.trim(),
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = (errBody as { detail?: { error?: string } })?.detail?.error ?? res.statusText;
      return { results: [], error: msg };
    }

    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const results: WebSearchResult[] = (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
    }));

    return { results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Web search failed";
    return { results: [], error: msg };
  }
}
