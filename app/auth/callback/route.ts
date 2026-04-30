import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      const isNewUser = user && new Date(user.created_at).getTime() > Date.now() - 60000;
      // New signups land on /browse by default (curated collections > empty
      // home) but always honor an explicit `next` (e.g. anon-chat handoff).
      if (isNewUser) {
        const target = nextParam ?? "/browse";
        const sep = target.includes("?") ? "&" : "?";
        return NextResponse.redirect(`${origin}${target}${sep}new_signup=true`);
      }
      return NextResponse.redirect(`${origin}${nextParam ?? "/"}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error?error=Could not authenticate`);
}
