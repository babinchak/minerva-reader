"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hapticLight } from "@/lib/haptic";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { Plus, X } from "lucide-react";

function parseAuthors(authorStr: string): string[] {
  if (!authorStr?.trim()) return [];
  return authorStr
    .split(AUTHOR_DELIMITER)
    .map((a) => a.trim())
    .filter(Boolean);
}

function joinAuthors(authors: string[]): string | null {
  const trimmed = authors.map((a) => a.trim()).filter(Boolean);
  return trimmed.length > 0 ? trimmed.join(AUTHOR_DELIMITER) : null;
}

interface EditBookMetadataDialogProps {
  bookId: string;
  currentTitle: string;
  currentAuthor: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditBookMetadataDialog({
  bookId,
  currentTitle,
  currentAuthor,
  open,
  onOpenChange,
}: EditBookMetadataDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState(currentTitle);
  const [authors, setAuthors] = useState<string[]>(() => parseAuthors(currentAuthor));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(currentTitle);
      setAuthors(parseAuthors(currentAuthor));
    }
  }, [open, currentTitle, currentAuthor]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTitle(currentTitle);
      setAuthors(parseAuthors(currentAuthor));
    }
    onOpenChange(next);
  };

  const addAuthor = () => {
    setAuthors((prev) => [...prev, ""]);
  };

  const removeAuthor = (index: number) => {
    setAuthors((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAuthor = (index: number, value: string) => {
    setAuthors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/library`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_title: title.trim() || null,
          custom_author: joinAuthors(authors),
        }),
      });
      if (res.ok) {
        hapticLight();
        onOpenChange(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/library`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_title: null,
          custom_author: null,
        }),
      });
      if (res.ok) {
        hapticLight();
        onOpenChange(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit title & authors</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title"
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Authors</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-muted-foreground"
                onClick={addAuthor}
              >
                <Plus className="h-4 w-4" />
                Add author
              </Button>
            </div>
            <div className="space-y-2">
              {authors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No authors. Click &quot;Add author&quot; to add one.
                </p>
              ) : (
                authors.map((author, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={author}
                      onChange={(e) => updateAuthor(index, e.target.value)}
                      placeholder={`Author ${index + 1}`}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeAuthor(index)}
                      aria-label="Remove author"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleReset}
              disabled={saving}
            >
              Reset to original metadata
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
