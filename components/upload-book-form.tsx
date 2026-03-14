'use client'

import { useState, useEffect, useCallback } from 'react';
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
import { Upload, CheckCircle2, XCircle, Loader2, BookOpen, User } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CREDITS_REFRESH_EVENT } from '@/lib/credits-refresh';

export function UploadBookForm({
  onSuccess,
  compact = false,
}: { onSuccess?: () => void; compact?: boolean } = {}) {
  const [file, setFile] = useState<File | null>(null);
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
  const [uploadLimit, setUploadLimit] = useState<{
    booksUploadedThisWeek: number;
    booksUploadLimit: number;
  } | null>(null);

  const fetchCredits = useCallback(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d
          ? {
              booksUploadedThisWeek: d.booksUploadedThisWeek ?? 0,
              booksUploadLimit: d.booksUploadLimit ?? 3,
            }
          : null
      )
      .then(setUploadLimit)
      .catch(() => setUploadLimit(null));
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits, message]);

  useEffect(() => {
    const handler = () => fetchCredits();
    window.addEventListener(CREDITS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
  }, [fetchCredits]);

  const limitReached =
    uploadLimit &&
    uploadLimit.booksUploadLimit < 999 &&
    uploadLimit.booksUploadedThisWeek >= uploadLimit.booksUploadLimit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || limitReached) return;

    setUploading(true);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/books/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      if (data.alreadyInLibrary) {
        setAlreadyInLibraryBook({
          title: data.book_title ?? undefined,
          author: data.book_author ?? undefined,
          coverUrl: data.book_cover_url ?? null,
          bookType: data.book_type ?? null,
        });
        setAlreadyInLibraryOpen(true);
      } else {
        setMessage(data.duplicate ? data.message : `Success: ${data.message}`);
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

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
          {compact && uploadLimit && uploadLimit.booksUploadLimit < 999 && (
            <p className="text-sm text-muted-foreground dark:text-foreground/80">
              {uploadLimit.booksUploadedThisWeek}/{uploadLimit.booksUploadLimit} books this week.
              {limitReached && (
                <> <Link href="/?upgrade=1" className="text-primary hover:underline">Upgrade</Link> for unlimited.</>
              )}
            </p>
          )}
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
                if (droppedFile) {
                  const lower = droppedFile.name.toLowerCase();
                  const valid = droppedFile.type === "application/epub+zip" || droppedFile.type === "application/pdf" || lower.endsWith(".epub") || lower.endsWith(".pdf");
                  if (valid) {
                    setFile(droppedFile);
                    setMessage(null);
                    setError(null);
                  }
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
            disabled={!file || uploading || !!limitReached}
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
        <CardTitle>Upload Book</CardTitle>
        <CardDescription>
          {uploadLimit && uploadLimit.booksUploadLimit < 999 ? (
            <>
              Upload an EPUB or PDF file. {uploadLimit.booksUploadedThisWeek}/{uploadLimit.booksUploadLimit} books this week.
              {uploadLimit.booksUploadedThisWeek >= uploadLimit.booksUploadLimit && (
                <> <Link href="/?upgrade=1" className="text-primary hover:underline">Upgrade</Link> for unlimited.</>
              )}
            </>
          ) : (
            'Upload an EPUB or PDF file to add it to your library.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {formContent}
      </CardContent>
    </Card>
  );
}
