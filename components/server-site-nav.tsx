import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { SiteNav } from "@/components/site-nav";

export async function ServerSiteNav({
  rightSlot,
}: {
  rightSlot: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const showAdmin = !!user && isAdminEmail(user.email);

  const userInfo = user
    ? {
        email: user.email!,
        displayName:
          user.user_metadata?.full_name || user.email!.split("@")[0],
        avatarUrl: user.user_metadata?.avatar_url as string | undefined,
      }
    : undefined;

  return (
    <SiteNav
      rightSlot={rightSlot}
      showAdmin={showAdmin}
      userInfo={userInfo}
    />
  );
}
