import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./user-menu";
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
    <UserMenu
      email={email}
      displayName={displayName}
      avatarUrl={avatarUrl}
    />
  );
}
