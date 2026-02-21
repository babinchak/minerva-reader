import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UsageContent } from "@/components/settings-usage-content";

export const dynamic = "force-dynamic";

export default async function UsageSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usage</h1>
        <p className="text-muted-foreground mt-1">
          Your credits, upload limits, and AI usage
        </p>
      </div>

      <UsageContent />
    </div>
  );
}
