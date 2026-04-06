"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type FeedbackItem = {
  id: string;
  user_id: string | null;
  email: string | null;
  category: string;
  message: string;
  created_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  feedback: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  suggestion: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function AdminFeedback() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feedback");
      const data = await res.json();
      setFeedback(data.feedback ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch("/api/admin/feedback", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setFeedback((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (feedback.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MessageSquareText className="h-10 w-10 mb-2" />
        <p>No feedback yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-border bg-card p-4 space-y-2"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge
                variant="secondary"
                className={CATEGORY_COLORS[item.category] ?? ""}
              >
                {item.category}
              </Badge>
              <span className="text-muted-foreground">
                {item.email ?? "Anonymous"}
              </span>
              <span className="text-muted-foreground">
                {relativeTime(item.created_at)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(item.id)}
              disabled={deleting === item.id}
            >
              {deleting === item.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {item.message}
          </p>
        </div>
      ))}
    </div>
  );
}
