import { NextRequest } from "next/server";
import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers";
import { createClient } from "@/lib/supabase/server";
import {
  getTier,
  getModelForTier,
  canMakeRequest,
} from "@/lib/credits";
import { recordUsage, costDollarsFromTokens } from "@/lib/usage";

const openai = wrapOpenAI(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}));

type IncomingChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const MARKDOWN_SYSTEM_PROMPT =
  "You are a helpful reading assistant. Respond using GitHub-flavored Markdown (GFM).\n" +
  "- Use headings, bullet lists, and tables when helpful.\n" +
  "- Use short section headings (e.g. ###) to break up the answer.\n" +
  "- Bold the key terms and the most meaningful phrases.\n" +
  "- Use fenced code blocks with a language tag for code.\n" +
  "- Do NOT wrap the entire response in a single code block.\n" +
  "- Avoid raw HTML; prefer Markdown.\n";

function shouldLogAiPrompts(): boolean {
  const v = process.env.LOG_AI_PROMPTS;
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function truncateForLog(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated ${text.length - maxChars} chars]`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key is not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body = (await req.json()) as { messages?: unknown; chatId?: string };
    const { messages, chatId } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const tier = await getTier(user?.id ?? null);
    const model = getModelForTier(tier);

    // Included mode: allow. On-demand mode: check can afford ~$0.50 for fast request.
    if (user) {
      const usageCheck = await canMakeRequest(user.id, 0.50, user.email);
      if (!usageCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: "Usage limit reached",
            usageDenied: true,
            reason: usageCheck.reason,
            resetAt: usageCheck.resetAt,
            tier: usageCheck.tier,
            extraUsageBalance: usageCheck.extraUsageBalance,
            onDemandLimitType: usageCheck.onDemandLimitType,
            onDemandLimitDollars: usageCheck.onDemandLimitDollars,
            extraUsageSpent: usageCheck.extraUsageSpent,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Convert messages to OpenAI format
    const openaiMessagesFromClient: OpenAI.Chat.ChatCompletionMessageParam[] = (
      messages as IncomingChatMessage[]
    ).map((msg) => ({
      role:
        msg.role === "assistant"
          ? "assistant"
          : msg.role === "system"
            ? "system"
            : "user",
      content: String(msg.content ?? ""),
    }));

    // Always enforce Markdown-capable output (ChatGPT-like formatting).
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: MARKDOWN_SYSTEM_PROMPT },
      ...openaiMessagesFromClient,
    ];

    if (shouldLogAiPrompts()) {
      const maxCharsPerMessage = Number.parseInt(
        process.env.LOG_AI_PROMPTS_MAX_CHARS_PER_MESSAGE || "6000",
        10
      );
      const safeMax = Number.isFinite(maxCharsPerMessage) ? Math.max(0, maxCharsPerMessage) : 6000;

      console.log("[ai] Outgoing chat request", {
        model,
        messageCount: openaiMessages.length,
      });

      openaiMessages.forEach((m, idx) => {
        const role = "role" in m ? (m.role as string) : "unknown";
        const content =
          typeof (m as { content?: unknown }).content === "string"
            ? ((m as { content: string }).content ?? "")
            : JSON.stringify((m as { content?: unknown }).content ?? "");
        console.log(
          `[ai] message[${idx}] role=${role}\n${truncateForLog(content, safeMax)}`
        );
      });
    }

    // Create a streaming response (include_usage needed for token counts in final chunk)
    const stream = await openai.chat.completions.create(
      {
        model,
        messages: openaiMessages,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: req.signal }
    );

    // Create a ReadableStream to send the response
    const encoder = new TextEncoder();
    let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined;
    let outputCharCount = 0;
    // Rough estimate of input tokens from the serialized prompt (used only on abort,
    // when OpenAI's final usage chunk never arrives).
    const estimatedInputTokens = Math.ceil(JSON.stringify(openaiMessages).length / 4);
    let usageRecorded = false;

    const recordIfNeeded = async (partial: boolean) => {
      if (usageRecorded) return null;
      usageRecorded = true;
      let inputTokens: number;
      let outputTokens: number;
      let cachedInputTokens: number;
      if (usage) {
        inputTokens = usage.prompt_tokens ?? 0;
        outputTokens = usage.completion_tokens ?? 0;
        cachedInputTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
      } else if (partial) {
        // OpenAI never sent usage (client aborted). Estimate from char counts
        // so we still bill for output the user actually saw.
        outputTokens = Math.ceil(outputCharCount / 4);
        if (outputTokens === 0) return null;
        inputTokens = estimatedInputTokens;
        cachedInputTokens = 0;
      } else {
        return null;
      }
      const costDollars = costDollarsFromTokens(model, inputTokens, outputTokens, false, cachedInputTokens);
      if (costDollars <= 0) return null;
      try {
        const result = await recordUsage({
          userId: user?.id ?? null,
          costDollars,
          usageType: "chat",
          model,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          referenceId: chatId,
        });
        return { result, inputTokens, outputTokens };
      } catch (err) {
        console.error("recordUsage failed:", err);
        return null;
      }
    };

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              outputCharCount += content.length;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
            if (chunk.usage) {
              usage = chunk.usage;
            }
          }

          const recorded = await recordIfNeeded(false);
          if (recorded?.result.success) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "usage",
                  inputTokens: recorded.inputTokens,
                  outputTokens: recorded.outputTokens,
                  costDollars: recorded.result.costDollars,
                  model,
                  chatMode: "fast",
                })}\n\n`
              )
            );
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error) {
          if (req.signal.aborted) {
            await recordIfNeeded(true);
            try { controller.close(); } catch { /* already closed */ }
            return;
          }
          controller.error(error);
        }
      },
      async cancel() {
        await recordIfNeeded(true);
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
