import { AdminFeedback } from "@/components/admin-feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminFeedbackPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Feedback</h1>
        <p className="text-muted-foreground mt-1">
          User-submitted feedback, bug reports, and suggestions
        </p>
      </div>
      <AdminFeedback />
    </div>
  );
}
