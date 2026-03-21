"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, BookOpen, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";
import { uploadBookViaDirectStorage } from "@/lib/upload-book-client";

function isValidBookFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const isEpub = file.type === "application/epub+zip" || lowerName.endsWith(".epub");
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  return isEpub || isPdf;
}

export function FullPageLibraryDropZone({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const router = useRouter();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alreadyInLibraryOpen, setAlreadyInLibraryOpen] = useState(false);
  const [alreadyInLibraryBook, setAlreadyInLibraryBook] = useState<{
    title?: string;
    author?: string;
    coverUrl?: string | null;
    bookType?: string | null;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleSuccess = useCallback(() => {
    router.refresh();
    window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
  }, [router]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isValidBookFile(file)) return;

      setUploading(true);
      setUploadError(null);

      try {
        const result = await uploadBookViaDirectStorage(file);

        if (!result.ok) {
          throw new Error(result.error);
        }

        if (result.alreadyInLibrary) {
          setAlreadyInLibraryBook({
            title: result.book_title ?? undefined,
            author: result.book_author ?? undefined,
            coverUrl: result.book_cover_url ?? null,
            bookType: result.book_type ?? null,
          });
          setAlreadyInLibraryOpen(true);
        } else {
          handleSuccess();
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [handleSuccess]
  );

  useEffect(() => {
    if (!enabled) return;

    let leaveTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      if (leaveTimeout) {
        clearTimeout(leaveTimeout);
        leaveTimeout = null;
      }
      setIsDraggingOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      // Only hide when leaving the document (e.g. out of browser window)
      if (e.relatedTarget != null && document.body.contains(e.relatedTarget as Node)) return;
      leaveTimeout = setTimeout(() => setIsDraggingOver(false), 50);
    };

    const handleDrop = (e: DragEvent) => {
      if (leaveTimeout) {
        clearTimeout(leaveTimeout);
        leaveTimeout = null;
      }
      setIsDraggingOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && isValidBookFile(file)) {
        e.preventDefault();
        e.stopPropagation();
        uploadFile(file);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    };

    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      if (leaveTimeout) clearTimeout(leaveTimeout);
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [enabled, uploadFile]);

  return (
    <>
      {children}

      {/* Full-viewport drag overlay */}
      {enabled && isDraggingOver && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[2px]"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file && isValidBookFile(file)) {
              uploadFile(file);
            }
          }}
          aria-hidden
        >
          <Upload className="h-16 w-16 text-primary mb-4" />
          <p className="text-xl font-semibold text-foreground">Upload book</p>
          <p className="text-sm text-muted-foreground mt-2">
            Drop EPUB or PDF anywhere
          </p>
        </div>
      )}

      {/* Full-viewport uploading overlay */}
      {enabled && uploading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          aria-hidden
        >
          <div className="animate-pulse flex flex-col items-center gap-3">
            <Upload className="h-12 w-12 text-primary" />
            <p className="text-base font-medium text-foreground">Uploading…</p>
          </div>
        </div>
      )}

      {/* Error toast - fixed position */}
      {enabled && uploadError && !uploading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 p-4 rounded-lg bg-destructive/10 text-destructive text-sm shadow-lg border border-destructive/20">
          {uploadError}
        </div>
      )}

      <Dialog open={alreadyInLibraryOpen} onOpenChange={setAlreadyInLibraryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Already in library
            </DialogTitle>
            <DialogDescription>
              {alreadyInLibraryBook?.title || alreadyInLibraryBook?.author ? (
                <>
                  You already have{" "}
                  <span className="font-medium text-foreground">
                    {alreadyInLibraryBook.title ?? "this book"}
                    {alreadyInLibraryBook.author && ` by ${alreadyInLibraryBook.author}`}
                  </span>{" "}
                  in your library. No need to upload it again.
                </>
              ) : (
                "You already have this book in your library. No need to upload it again."
              )}
            </DialogDescription>
          </DialogHeader>
          {alreadyInLibraryBook && (
            <div
              className="flex flex-col rounded-lg border bg-card px-3 pt-3 pb-2 pointer-events-none select-none"
              aria-hidden
            >
              <div className="relative mb-3 aspect-[2/3] w-full max-w-[120px] mx-auto flex-none overflow-hidden rounded-md bg-muted shadow-sm">
                {alreadyInLibraryBook.coverUrl ? (
                  <img
                    src={alreadyInLibraryBook.coverUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <BookOpen className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 text-center">
                <p className="min-h-[2rem] line-clamp-2 font-medium text-foreground text-sm">
                  {alreadyInLibraryBook.title ?? "Unknown"}
                </p>
                {alreadyInLibraryBook.author && (
                  <p className="mt-0 line-clamp-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="truncate">{alreadyInLibraryBook.author}</span>
                  </p>
                )}
              </div>
              {alreadyInLibraryBook.bookType && (
                <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                  {alreadyInLibraryBook.bookType}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAlreadyInLibraryOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
