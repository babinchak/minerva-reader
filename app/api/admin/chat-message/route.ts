import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const messageId = request.nextUrl.searchParams.get("id");
    if (!messageId) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Fetch the specified message (the user question)
    const { data: questionMsg, error: qErr } = await serviceSupabase
      .from("chat_messages")
      .select("id, chat_id, message_index, role, content")
      .eq("id", messageId)
      .single();

    if (qErr || !questionMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Fetch the next message in the same chat (the assistant answer)
    const { data: answerMsg, error: aErr } = await serviceSupabase
      .from("chat_messages")
      .select("id, role, content, tool_calls")
      .eq("chat_id", questionMsg.chat_id)
      .eq("message_index", questionMsg.message_index + 1)
      .single();

    if (aErr || !answerMsg) {
      return NextResponse.json({ error: "Answer message not found (no message at index+1)" }, { status: 404 });
    }

    return NextResponse.json({
      question: questionMsg.content,
      answer: answerMsg.content,
      toolCalls: answerMsg.tool_calls ?? [],
    });
  } catch (err) {
    console.error("[ADMIN] Fetch chat message error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
