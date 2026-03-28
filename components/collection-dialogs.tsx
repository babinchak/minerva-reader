"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookOpen, Loader2 } from "lucide-react";
import type { LibraryBook } from "@/components/library-grid-with-sort";
import type { CollectionSummary } from "@/components/collections-view";

// ---- Create Collection Dialog ----

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCollectionDialog({ open, onOpenChange }: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setName("");
        onOpenChange(false);
        window.dispatchEvent(new CustomEvent("collections-refresh"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            Create a collection to group books for focused AI search.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Philosophy, History, Research..."
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Edit Collection Dialog ----

interface EditCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: CollectionSummary | null;
}

export function EditCollectionDialog({ open, onOpenChange, collection }: EditCollectionDialogProps) {
  const [name, setName] = useState(collection?.name ?? "");
  const [saving, setSaving] = useState(false);

  // Sync name when collection changes
  const collectionId = collection?.id;
  const [lastId, setLastId] = useState<string | undefined>();
  if (collectionId !== lastId) {
    setLastId(collectionId);
    setName(collection?.name ?? "");
  }

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || !collection || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        onOpenChange(false);
        window.dispatchEvent(new CustomEvent("collections-refresh"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename collection</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-collection-name">Name</Label>
            <Input
              id="edit-collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Add Books to Collection Dialog ----

interface AddBooksToCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: CollectionSummary | null;
  books: LibraryBook[];
}

export function AddBooksToCollectionDialog({
  open,
  onOpenChange,
  collection,
  books,
}: AddBooksToCollectionDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existingBookIds, setExistingBookIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing books when dialog opens
  const collectionId = collection?.id;
  const [lastFetchedId, setLastFetchedId] = useState<string | undefined>();
  if (open && collectionId && collectionId !== lastFetchedId) {
    setLastFetchedId(collectionId);
    setSelected(new Set());
    setLoaded(false);
    fetch(`/api/collections/${collectionId}/books`)
      .then((r) => r.json())
      .then((data) => {
        const ids = new Set<string>(data.bookIds ?? []);
        setExistingBookIds(ids);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  const toggleBook = (bookId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!collection || selected.size === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookIds: Array.from(selected) }),
      });
      if (res.ok) {
        onOpenChange(false);
        setSelected(new Set());
        setLastFetchedId(undefined);
        window.dispatchEvent(new CustomEvent("collections-refresh"));
      }
    } finally {
      setSaving(false);
    }
  };

  const availableBooks = books.filter((b) => !existingBookIds.has(b.id));

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setSelected(new Set());
        setLastFetchedId(undefined);
      }
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add books to {collection?.name ?? "collection"}</DialogTitle>
          <DialogDescription>
            Select books from your library to add.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 py-2">
          {!loaded ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : availableBooks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              All your books are already in this collection.
            </p>
          ) : (
            availableBooks.map((book) => (
              <label
                key={book.id}
                className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent/50 cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(book.id)}
                  onCheckedChange={() => toggleBook(book.id)}
                />
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt=""
                      className="h-10 w-7 rounded-sm object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-10 w-7 items-center justify-center rounded-sm bg-muted shrink-0">
                      <BookOpen className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{book.title ?? "Untitled"}</p>
                    {book.author && (
                      <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                    )}
                  </div>
                </div>
                {book.bookType && (
                  <span className="text-[10px] font-medium uppercase text-muted-foreground/70 shrink-0">
                    {book.bookType}
                  </span>
                )}
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={selected.size === 0 || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${selected.size > 0 ? selected.size : ""} book${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
