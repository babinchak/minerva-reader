"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, BookOpen, Check, FileText, FolderOpen, Loader2, MoreVertical, Pencil, Trash2, User } from "lucide-react";
import { hapticLight } from "@/lib/haptic";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditBookMetadataDialog } from "@/components/edit-book-metadata-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/markdown";
import { createClient } from "@/lib/supabase/client";
import type { CollectionSummary } from "@/components/collections-view";

interface BookCardProps {
  id: string;
  title: string;
  authorDisplay: string;
  /** Raw author string for edit form. When provided with showRemove, enables Edit option. */
  author?: string | null;
  coverUrl: string | null;
  bookType: "epub" | "pdf" | null;
  /** When false, hides the remove-from-library dropdown. Default true. */
  showRemove?: boolean;
  /** Stage 1: EPUB manifest not ready — book is unopenable. */
  epubNotReady?: "processing" | "error" | null;
  /** Stage 2: Summaries/vectors still generating — book is readable but AI features pending. */
  aiProcessing?: "processing" | "error" | null;
  /** Available collections for "Add to Collection" submenu. */
  collections?: CollectionSummary[];
}

export function BookCard({
  id,
  title,
  authorDisplay,
  author,
  coverUrl,
  bookType,
  showRemove = true,
  epubNotReady,
  aiProcessing,
  collections,
}: BookCardProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/books/${id}/library`, { method: "DELETE" });
      if (res.ok) {
        hapticLight();
        router.refresh();
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const handleViewSummary = async () => {
    setSummaryOpen(true);
    if (summaryText !== null) return; // already loaded
    setSummaryLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("summaries")
        .select("summary_text")
        .eq("book_id", id)
        .eq("summary_type", "book")
        .single();
      setSummaryText(data?.summary_text ?? "No summary available yet.");
    } catch {
      setSummaryText("Failed to load summary.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // Stage 1: book can't be opened at all
  const isBlocked = epubNotReady === "processing" || epubNotReady === "error";

  const cardContent = (
    <>
      <div className={`relative mb-3 aspect-[2/3] w-full flex-none overflow-hidden rounded-md bg-muted shadow-sm ${isBlocked ? "opacity-50" : ""}`}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={`Cover of ${title}`}
            className={`absolute inset-0 h-full w-full object-cover ${isBlocked ? "" : "transition-transform group-hover:scale-[1.02]"}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <BookOpen className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1">
        <h3 className={`min-h-[2.75rem] line-clamp-2 font-medium ${isBlocked ? "text-muted-foreground" : "text-foreground group-hover:text-primary"}`}>
          {title}
        </h3>
        {authorDisplay && (
          <p className="mt-0 line-clamp-1 flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{authorDisplay}</span>
          </p>
        )}
      </div>
    </>
  );

  // Determine the status badge
  let statusBadge: React.ReactNode;
  if (epubNotReady === "error") {
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-destructive/80">
        <AlertCircle className="h-3 w-3" />
        Processing failed
      </span>
    );
  } else if (epubNotReady === "processing") {
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
        <Loader2 className="h-3 w-3 animate-spin" />
        Preparing book
      </span>
    );
  } else if (aiProcessing === "error") {
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-destructive/80">
        <AlertCircle className="h-3 w-3" />
        Processing failed
      </span>
    );
  } else if (aiProcessing === "processing") {
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </span>
    );
  } else if (bookType) {
    statusBadge = (
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
        {bookType}
      </span>
    );
  } else {
    statusBadge = <div />;
  }

  return (
    <div
      className={`group flex h-full flex-col rounded-lg border bg-card px-3 pt-3 pb-2 transition-colors ${isBlocked ? "" : "hover:bg-accent/50"} transition-opacity ${
        isRemoving ? "pointer-events-none opacity-0" : ""
      }`}
    >
      {isBlocked ? (
        <div className="flex flex-1 flex-col cursor-default">
          {cardContent}
        </div>
      ) : (
        <a
          href={`/read/${id}`}
          onClick={() => hapticLight()}
          className="flex flex-1 flex-col"
        >
          {cardContent}
        </a>
      )}
      <div className="mt-1 flex h-8 items-center justify-between">
        {statusBadge}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 -mr-1"
              aria-label="Book options"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleViewSummary}>
              <FileText className="h-4 w-4" />
              Book summary
            </DropdownMenuItem>
            {showRemove && (
              <>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit title & author
                </DropdownMenuItem>
                {collections && collections.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderOpen className="h-4 w-4" />
                      Add to collection
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {collections.map((col) => (
                        <DropdownMenuItem
                          key={col.id}
                          onClick={async () => {
                            const res = await fetch(`/api/collections/${col.id}/books`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ bookId: id }),
                            });
                            if (res.ok) {
                              setAddedTo(col.id);
                              router.refresh();
                              setTimeout(() => setAddedTo(null), 2000);
                            }
                          }}
                        >
                          {addedTo === col.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <FolderOpen className="h-4 w-4" />
                          )}
                          {col.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuItem
                  onClick={handleRemove}
                  disabled={isRemoving}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {isRemoving ? "Removing…" : "Remove from library"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EditBookMetadataDialog
        bookId={id}
        currentTitle={title}
        currentAuthor={author ?? ""}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-2">{title}</DialogTitle>
          </DialogHeader>
          {summaryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Markdown content={summaryText ?? ""} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
