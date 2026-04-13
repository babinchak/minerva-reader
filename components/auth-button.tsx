import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

function emailToColor(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash >> 0) & 0xff) * 1.41;
  return `hsl(${hue}, 55%, 45%)`;
}

export async function AuthButton() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="sm" variant={"outline"}>
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" variant={"default"}>
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  const email = user.email!;
  const displayName = user.user_metadata?.full_name || email.split("@")[0];
  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <div className="flex items-center gap-2 text-foreground">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-7 rounded-full"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: emailToColor(email) }}
        >
          {email[0].toUpperCase()}
        </div>
      )}
      <span className="text-sm text-muted-foreground">{displayName}</span>
      <LogoutButton />
    </div>
  );
}
