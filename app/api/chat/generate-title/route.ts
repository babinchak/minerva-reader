import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TITLE_SYSTEM_PROMPT =
  "You generate chat titles. The title must describe the CONTENT or SUBJECT discussed in the assistant's reply—what the chat is actually about. " +
  "Do NOT use the user's action (e.g. 'Explain page', 'Explain selection') as the title. " +
  "Output a short title (4–8 words) that captures the topic, theme, or question. " +
  "Output ONLY the title. No quotes, no punctuation, no markdown, no explanation, no preamble.";

function fallbackTitleFromContent(content: string): string {
  // Strip markdown (###, **, etc.) and get plain text
  const stripped = content
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  const lines = stripped.split(/\n/).map((s) => s.trim()).filter(Boolean);
  // Skip structural headings like "What's happening on this page (plain summary)"
  const structuralPattern =
    /^(summary|overview|what'?s happening|key points|in this (page|section|chapter)|plain summary|table of contents)/i;
  const firstRealLine = lines.find((l) => !structuralPattern.test(l) || l.length > 80);
  const firstContent = firstRealLine ?? lines[0] ?? content;
  const words = firstContent.split(/\s+/).filter(Boolean).slice(0, 8);
  const candidate = words.join(" ");
  return candidate.length > 50 ? candidate.slice(0, 47) + "…" : candidate || "Chat";
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as {
      chatId?: string;
      userMessage?: string;
      assistantMessage?: string;
    };

    const chatId = body.chatId;
    const userMessage = String(body.userMessage ?? "").trim();
    const assistantMessage = String(body.assistantMessage ?? "").trim();

    if (!userMessage || !assistantMessage) {
      return NextResponse.json(
        { error: "userMessage and assistantMessage are required" },
        { status: 400 }
      );
    }

    const assistantPreview =
      assistantMessage.length > 400
        ? assistantMessage.slice(0, 400) + "..."
        : assistantMessage;

    // Use a dedicated title model; default to gpt-4o-mini (o1/o3 are poor at short outputs)
    const model = process.env.OPENAI_TITLE_MODEL || "gpt-4o-mini";

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: TITLE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `User: ${userMessage}\n\nAssistant's reply (this is what the chat is about):\n${assistantPreview}\n\nTitle describing the content above:`,
        },
      ],
      max_completion_tokens: 150,
    });

    const msg = completion.choices[0]?.message;
    const rawContent =
      typeof msg?.content === "string"
        ? msg.content.trim()
        : Array.isArray(msg?.content)
          ? (msg.content as { type: string; text?: string }[])
              .filter((c) => c.type === "text" && c.text)
              .map((c) => c.text!)
              .join("")
              .trim()
          : "";

    // Reasoning models may output extra text; take the last non-empty line as the title
    const lines = rawContent.split(/\n/).map((s) => s.trim()).filter(Boolean);
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
    const title = lastLine
      .replace(/^#{1,6}\s*/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/^["']|["']$/g, "")
      .replace(/^(title|chat title):\s*/i, "")
      .trim()
      .slice(0, 100);
    const genericUserPhrases = ["explain page", "explain selection", "chat"];
    const isGenericTitle =
      !title || genericUserPhrases.includes(title.toLowerCase());
    const isGenericUserMessage = genericUserPhrases
      .slice(0, -1)
      .includes(userMessage.toLowerCase());
    const fallbackSource = isGenericUserMessage ? assistantMessage : userMessage;
    const finalTitle = isGenericTitle
      ? fallbackTitleFromContent(fallbackSource)
      : title;

    if (chatId?.trim()) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("chats")
          .update({ title: finalTitle, updated_at: new Date().toISOString() })
          .eq("id", chatId)
          .eq("user_id", user.id);
      }
    }

    return NextResponse.json({ title: finalTitle });
  } catch (error) {
    console.error("Generate title API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate title",
      },
      { status: 500 }
    );
  }
}
