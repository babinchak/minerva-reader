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
  return <SiteNav rightSlot={rightSlot} showAdmin={showAdmin} isLoggedIn={!!user} />;
}
