"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, BookOpen, Check, FileText, FolderOpen, Library, Loader2, MoreVertical, Pencil, Trash2, User } from "lucide-react";
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
  /** Show "Add to library" option (for curated collection books). */
  showAddToLibrary?: boolean;
  /** Whether this book is already in the user's library. */
  inLibrary?: boolean;
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
  showAddToLibrary,
  inLibrary,
}: BookCardProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);
  const [addedToLibrary, setAddedToLibrary] = useState(false);
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

  const handleAddToLibrary = async () => {
    if (isAddingToLibrary || addedToLibrary || inLibrary) return;
    setIsAddingToLibrary(true);
    try {
      const res = await fetch(`/api/books/${id}/library`, {
        method: "POST",
      });
      if (res.ok) {
        hapticLight();
        setAddedToLibrary(true);
        router.refresh();
      }
    } finally {
      setIsAddingToLibrary(false);
    }
  };

  // Stage 1: book can't be opened at all
  const isBlocked = epubNotReady === "processing" || epubNotReady === "error";

  const cardContent = (
    <>
      <div className={`relative aspect-[2/3] w-full flex-none overflow-hidden rounded-md bg-muted shadow-md ${isBlocked ? "opacity-50" : ""}`}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={`Cover of ${title}`}
            loading="lazy"
            className={`absolute inset-0 h-full w-full object-cover ${isBlocked ? "" : "transition-transform group-hover:scale-[1.03]"}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="mt-2 flex-1">
        <h3 className={`line-clamp-2 text-sm font-medium leading-snug ${isBlocked ? "text-muted-foreground" : "text-foreground group-hover:text-primary"}`}>
          {title}
        </h3>
        {authorDisplay && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {authorDisplay}
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
      className={`group relative flex h-full flex-col transition-opacity ${
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
      <div className="mt-1 flex h-6 items-center justify-between">
        {statusBadge}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:data-[state=open]:opacity-100"
              aria-label="Book options"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleViewSummary}>
              <FileText className="h-4 w-4" />
              Book summary
            </DropdownMenuItem>
            {showAddToLibrary && (
              <DropdownMenuItem
                onClick={handleAddToLibrary}
                disabled={isAddingToLibrary || addedToLibrary || inLibrary}
              >
                {addedToLibrary || inLibrary ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : isAddingToLibrary ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Library className="h-4 w-4" />
                )}
                {addedToLibrary || inLibrary ? "In your library" : isAddingToLibrary ? "Adding…" : "Add to library"}
              </DropdownMenuItem>
            )}
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
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="line-clamp-2 pr-6">{title}</DialogTitle>
            {authorDisplay && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span>{authorDisplay}</span>
              </p>
            )}
          </DialogHeader>
          <div className="-mx-6 min-h-0 overflow-y-auto px-6 pb-1">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Markdown content={summaryText ?? ""} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
