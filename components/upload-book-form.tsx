'use client'

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, CheckCircle2, XCircle, Loader2, BookOpen, User, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CREDITS_REFRESH_EVENT } from '@/lib/credits-refresh';
import { uploadBookViaDirectStorage } from '@/lib/upload-book-client';

type QueuedFile = {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error' | 'duplicate';
  message?: string;
};

export function UploadBookForm({
  onSuccess,
  abortRef: externalAbortRef,
  compact = false,
}: { onSuccess?: () => void; abortRef?: React.MutableRefObject<boolean>; compact?: boolean } = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyInLibraryOpen, setAlreadyInLibraryOpen] = useState(false);
  const [alreadyInLibraryBook, setAlreadyInLibraryBook] = useState<{
    title?: string;
    author?: string;
    coverUrl?: string | null;
    bookType?: string | null;
  } | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const internalAbortRef = useRef(false);
  const abortRef = externalAbortRef ?? internalAbortRef;

  useEffect(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setIsPaid(d.tier === 'paid'); })
      .catch(() => {});
  }, []);

  const isValidFile = (f: File) => {
    const lower = f.name.toLowerCase();
    return (
      f.type === 'application/epub+zip' ||
      f.type === 'application/pdf' ||
      lower.endsWith('.epub') ||
      lower.endsWith('.pdf')
    );
  };

  const addFilesToQueue = (files: File[]) => {
    const valid = files.filter(isValidFile);
    if (valid.length === 0) return;

    if (isPaid) {
      setQueue((prev) => {
        const existingNames = new Set(prev.map((q) => q.file.name + q.file.size));
        const newItems = valid
          .filter((f) => !existingNames.has(f.name + f.size))
          .map((f) => ({ file: f, status: 'pending' as const }));
        return [...prev, ...newItems];
      });
    } else {
      setFile(valid[0]);
    }
    setMessage(null);
    setError(null);
  };

  // Single file upload (free tier)
  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setMessage(null);
    setError(null);

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
        setMessage(
          result.duplicate ? result.message ?? 'Book added' : `Success: ${result.message ?? 'OK'}`,
        );
        onSuccess?.();
      }
      setFile(null);
      const fileInput = document.getElementById('book-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Bulk upload (paid tier)
  const handleSubmitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const pending = queue.filter((q) => q.status === 'pending');
    if (pending.length === 0) return;

    setUploading(true);
    abortRef.current = false;

    for (let i = 0; i < queue.length; i++) {
      if (abortRef.current) break;
      if (queue[i].status !== 'pending') continue;

      setQueue((prev) =>
        prev.map((q, idx) => (idx === i ? { ...q, status: 'uploading' } : q))
      );

      try {
        const result = await uploadBookViaDirectStorage(queue[i].file);

        if (!result.ok) {
          setQueue((prev) =>
            prev.map((q, idx) =>
              idx === i ? { ...q, status: 'error', message: result.error } : q
            )
          );
          continue;
        }

        if (result.alreadyInLibrary) {
          setQueue((prev) =>
            prev.map((q, idx) =>
              idx === i
                ? { ...q, status: 'duplicate', message: `Already in library${result.book_title ? `: ${result.book_title}` : ''}` }
                : q
            )
          );
        } else {
          setQueue((prev) =>
            prev.map((q, idx) =>
              idx === i
                ? {
                    ...q,
                    status: 'done',
                    message: result.duplicate
                      ? result.message ?? 'Book added'
                      : result.message ?? 'Uploaded',
                  }
                : q
            )
          );
          onSuccess?.();
        }
      } catch (err) {
        setQueue((prev) =>
          prev.map((q, idx) =>
            idx === i
              ? { ...q, status: 'error', message: err instanceof Error ? err.message : 'Upload failed' }
              : q
          )
        );
      }
    }

    setUploading(false);
    window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
  };

  const removeFromQueue = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCompleted = () => {
    setQueue((prev) => prev.filter((q) => q.status === 'pending' || q.status === 'uploading'));
  };

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const doneCount = queue.filter((q) => q.status === 'done').length;
  const hasCompleted = queue.some((q) => q.status !== 'pending' && q.status !== 'uploading');

  const formContent = isPaid ? (
    <form onSubmit={handleSubmitBulk} className="space-y-4">
      <p className="text-xs text-muted-foreground dark:text-foreground/80">
        Only upload content you own or are authorized to use.
      </p>
      <div className="space-y-2">
        <label htmlFor="book-file" className="text-sm font-medium text-foreground">
          Select EPUB or PDF Files
        </label>
        <div
          className={cn(
            'rounded-lg border-2 border-dashed border-primary/30 bg-muted/30 px-4 py-6 transition-colors',
            isDragOver && 'border-primary bg-primary/5',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const related = e.relatedTarget as Node | null;
            if (!related || !e.currentTarget.contains(related)) setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            addFilesToQueue(Array.from(e.dataTransfer.files));
          }}
        >
          <label htmlFor="book-file" className="block cursor-pointer">
            <Input
              id="book-file"
              type="file"
              accept=".epub,.pdf,application/epub+zip,application/pdf"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  addFilesToQueue(Array.from(e.target.files));
                }
                e.target.value = '';
              }}
              disabled={uploading}
              className="cursor-pointer file:cursor-pointer file:text-foreground border-0 bg-transparent p-0 h-auto file:mr-2 file:border-0 file:bg-transparent file:font-medium file:text-foreground"
            />
            <span className="text-sm text-muted-foreground dark:text-foreground/80">
              {isDragOver ? 'Drop EPUB or PDF files here' : 'Drag and drop or click to browse — select multiple files'}
            </span>
          </label>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {uploading
                ? `Uploading... (${doneCount + queue.filter((q) => q.status === 'duplicate').length}/${queue.length} done)`
                : pendingCount > 0
                  ? `${pendingCount} file${pendingCount !== 1 ? 's' : ''} ready to upload`
                  : 'All files processed'}
            </p>
            {hasCompleted && !uploading && (
              <Button type="button" variant="ghost" size="sm" onClick={clearCompleted} className="h-7 text-xs">
                Clear
              </Button>
            )}
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
            {queue.map((item, i) => (
              <div
                key={`${item.file.name}-${item.file.size}-${i}`}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm',
                  item.status === 'done' && 'bg-primary/5 text-primary',
                  item.status === 'error' && 'bg-destructive/5 text-destructive',
                  item.status === 'duplicate' && 'bg-muted/50 text-muted-foreground',
                  item.status === 'uploading' && 'bg-primary/5',
                  item.status === 'pending' && 'text-foreground',
                )}
              >
                {item.status === 'uploading' && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                {item.status === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {item.status === 'error' && <XCircle className="h-4 w-4 shrink-0" />}
                {item.status === 'duplicate' && <BookOpen className="h-4 w-4 shrink-0" />}
                {item.status === 'pending' && <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.file.name}</p>
                  {item.message && item.status !== 'pending' && (
                    <p className="truncate text-xs opacity-70">{item.message}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(item.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {(item.status === 'pending' || item.status === 'error') && !uploading && (
                  <button
                    type="button"
                    onClick={() => removeFromQueue(i)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(pendingCount > 0 || uploading) && (
        <div className="flex gap-2">
          {pendingCount > 0 && !uploading && (
            <Button
              type="submit"
              className="flex-1"
            >
              <Upload />
              Upload {pendingCount} {pendingCount === 1 ? 'Book' : 'Books'}
            </Button>
          )}
          {uploading && (
            <>
              <Button
                type="button"
                disabled
                className="flex-1"
              >
                <Loader2 className="animate-spin" />
                Uploading...
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { abortRef.current = true; }}
              >
                Stop
              </Button>
            </>
          )}
        </div>
      )}

      {message && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-sm">{message}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
          <XCircle className="h-4 w-4" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </form>
  ) : (
    <form onSubmit={handleSubmitSingle} className="space-y-4">
          <p className="text-xs text-muted-foreground dark:text-foreground/80">
            Only upload content you own or are authorized to use.
          </p>
          <div className="space-y-2">
            <label htmlFor="book-file" className="text-sm font-medium text-foreground">
              Select EPUB or PDF File
            </label>
            <div
              className={cn(
                "rounded-lg border-2 border-dashed border-primary/30 bg-muted/30 px-4 py-6 transition-colors",
                isDragOver && "border-primary bg-primary/5"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const related = e.relatedTarget as Node | null;
                if (!related || !e.currentTarget.contains(related)) setIsDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile && isValidFile(droppedFile)) {
                  setFile(droppedFile);
                  setMessage(null);
                  setError(null);
                }
              }}
            >
              <label htmlFor="book-file" className="block cursor-pointer">
                <Input
                  id="book-file"
                  type="file"
                  accept=".epub,.pdf,application/epub+zip,application/pdf"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0] || null;
                    setFile(selectedFile);
                    setMessage(null);
                    setError(null);
                  }}
                  disabled={uploading}
                  className="cursor-pointer file:cursor-pointer file:text-foreground border-0 bg-transparent p-0 h-auto file:mr-2 file:border-0 file:bg-transparent file:font-medium file:text-foreground"
                />
                <span className="text-sm text-muted-foreground dark:text-foreground/80">
                  {isDragOver ? "Drop EPUB or PDF here" : "Drag and drop or click to browse"}
                </span>
              </label>
            </div>
            {file && (
              <p className="text-sm text-muted-foreground dark:text-foreground/80">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={!file || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload />
                Upload Book
              </>
            )}
          </Button>

          {message && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-sm">{message}</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
              <XCircle className="h-4 w-4" />
              <p className="text-sm">{error}</p>
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
                      You already have{' '}
                      <span className="font-medium text-foreground">
                        {alreadyInLibraryBook.title ?? 'this book'}
                        {alreadyInLibraryBook.author ? ` by ${alreadyInLibraryBook.author}` : ''}
                      </span>
                      {' '}in your library. No need to upload it again.
                    </>
                  ) : (
                    'You already have this book in your library. No need to upload it again.'
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
                      {alreadyInLibraryBook.title ?? 'Unknown'}
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
        </form>
  );

  if (compact) {
    return formContent;
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Upload {isPaid ? 'Books' : 'Book'}</CardTitle>
        <CardDescription>
          Upload EPUB or PDF files to add them to your library.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {formContent}
      </CardContent>
    </Card>
  );
}
