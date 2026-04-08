import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

type Issue = {
  type:
    | "orphaned_book"
    | "orphaned_embedding"
    | "orphaned_chat"
    | "orphaned_user_book"
    | "orphaned_summary"
    | "empty_chat"
    | "missing_storage"
    | "no_embeddings"
    | "no_summaries"
    | "inconsistent_embeddings"
    | "inconsistent_summaries";
  severity: "warning" | "error";
  description: string;
  resourceId: string;
  resourceName?: string;
};

export const maxDuration = 60;

export async function GET() {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await serviceSupabase.rpc("health_check_issues");
    if (error) throw new Error(error.message);

    const issues: Issue[] = (data ?? []).map((row: { issue_type: string; severity: string; description: string; resource_id: string; resource_name: string | null }) => ({
      type: row.issue_type as Issue["type"],
      severity: row.severity as Issue["severity"],
      description: row.description,
      resourceId: row.resource_id,
      resourceName: row.resource_name ?? undefined,
    }));

    // Group issues by type
    const grouped: Record<string, Issue[]> = {};
    for (const issue of issues) {
      if (!grouped[issue.type]) grouped[issue.type] = [];
      grouped[issue.type].push(issue);
    }

    const totalErrors = issues.filter((i) => i.severity === "error").length;
    const totalWarnings = issues.filter((i) => i.severity === "warning").length;

    return NextResponse.json({
      groups: grouped,
      summary: {
        total: issues.length,
        errors: totalErrors,
        warnings: totalWarnings,
      },
    });
  } catch (err) {
    console.error("[ADMIN] Health check error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
