import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileContent } from "@/components/settings-profile-content";

export const metadata: Metadata = {
  title: "Profile",
};

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your display name and avatar
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ProfileContent
            initialDisplayName={user.user_metadata?.full_name || ""}
            initialAvatarUrl={user.user_metadata?.avatar_url || ""}
            email={user.email!}
          />
        </CardContent>
      </Card>
    </div>
  );
}
