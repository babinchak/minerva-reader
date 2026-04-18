import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Explicit stop signal from the client's Stop button. We mark the assistant
 * message row; the streaming route polls this between agent steps and aborts
 * the upstream LLM call when it's set. Tab-close does NOT hit this endpoint,
 * which is how the streaming route distinguishes "user wants to stop" from
 * "user navigated away" (in which case we let generation complete so the
 * answer still lands in chat history).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { assistantMessageId?: string } | null;
  const id = body?.assistantMessageId;
  if (!id) return NextResponse.json({ error: "assistantMessageId is required" }, { status: 400 });

  // RLS on chat_messages restricts updates to rows whose chat the user owns.
  const { error } = await supabase
    .from("chat_messages")
    .update({ stop_requested_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
