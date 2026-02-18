'use client'

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { CREDITS_REFRESH_EVENT } from '@/lib/credits-refresh';

export function UploadBookForm() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

      setMessage(data.duplicate 
        ? `Book already exists: ${data.message}`
        : `Success: ${data.message}`
      );
      
      setFile(null);
      const fileInput = document.getElementById('book-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

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
            'Upload an EPUB or PDF file to add it to your library. Duplicate books will be automatically detected.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="book-file" className="text-sm font-medium">
              Select EPUB or PDF File
            </label>
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
              className="cursor-pointer"
            />
            {file && (
              <p className="text-sm text-muted-foreground">
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
        </form>
      </CardContent>
    </Card>
  );
}
