"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Link from "next/link";

type Collection = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  coverImagePath: string | null;
  coverUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  bookCount: number;
};

export function AdminCollectionsList() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formCoverPath, setFormCoverPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [coverCacheBust, setCoverCacheBust] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete dialog state
  const [confirmDelete, setConfirmDelete] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCollections = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/curated-collections");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { collections: Collection[] };
      setCollections(data.collections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormSlug("");
    setFormCoverPath(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (c: Collection) => {
    setEditingId(c.id);
    setFormName(c.name);
    setFormDescription(c.description ?? "");
    setFormSlug(c.slug);
    setFormCoverPath(c.coverImagePath);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleCoverUpload = async (file: File) => {
    setUploading(true);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (editingId) formData.append("collectionId", editingId);

      const res = await fetch("/api/admin/curated-collections/upload-cover", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { path: string };
      setFormCoverPath(data.path);
      setCoverCacheBust(Date.now());

      // If editing, the API already updated the DB — refresh the list
      if (editingId) fetchCollections();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError("Name is required");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/admin/curated-collections/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || null,
            slug: formSlug.trim() || undefined,
            coverImagePath: formCoverPath,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      } else {
        const res = await fetch("/api/admin/curated-collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || undefined,
            slug: formSlug.trim() || undefined,
            coverImagePath: formCoverPath || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      }
      setDialogOpen(false);
      fetchCollections();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/curated-collections/${confirmDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setConfirmDelete(null);
      fetchCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= collections.length) return;

    const updated = [...collections];
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    const order = updated.map((c, i) => ({ id: c.id, sortOrder: i }));

    // Optimistic update
    setCollections(updated.map((c, i) => ({ ...c, sortOrder: i })));

    try {
      const res = await fetch("/api/admin/curated-collections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) {
        fetchCollections(); // revert on failure
      }
    } catch {
      fetchCollections();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {collections.length} collection{collections.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Create Collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No curated collections yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map((c, index) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => handleMove(index, "up")}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === collections.length - 1}
                  onClick={() => handleMove(index, "down")}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {c.coverUrl ? (
                <img
                  src={coverCacheBust ? `${c.coverUrl}?t=${coverCacheBust}` : c.coverUrl}
                  alt=""
                  className="h-10 w-16 rounded object-cover border border-border shrink-0"
                />
              ) : (
                <div className="flex h-10 w-16 items-center justify-center rounded border border-border bg-muted shrink-0">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">{c.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    /{c.slug}
                  </span>
                </div>
                {c.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{c.description}</p>
                )}
              </div>

              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <BookOpen className="h-3.5 w-3.5" />
                {c.bookCount}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <Link
                  href={`/admin/collections/${c.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Manage
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(c)}
                  aria-label="Edit collection"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(c)}
                  aria-label="Delete collection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Collection" : "Create Collection"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the collection details." : "Create a new curated collection."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="col-name">Name</label>
              <Input
                id="col-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Philosophy Classics"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="col-desc">Description</label>
              <Input
                id="col-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="A short description for the browse page"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="col-slug">
                Slug <span className="text-muted-foreground font-normal">(auto-generated if empty)</span>
              </label>
              <Input
                id="col-slug"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="philosophy-classics"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Cover Image</label>
              {formCoverPath ? (
                <div className="mt-1 flex items-center gap-3">
                  <img
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/covers/${formCoverPath}${coverCacheBust ? `?t=${coverCacheBust}` : ""}`}
                    alt=""
                    className="h-16 w-24 rounded border border-border object-cover"
                  />
                  <div className="flex flex-col gap-1">
                    <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <ImagePlus className="h-3.5 w-3.5" />
                      Replace
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleCoverUpload(f);
                          e.target.value = "";
                        }}
                        disabled={uploading}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormCoverPath(null)}
                      className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                      disabled={uploading}
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                  {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              ) : (
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-4 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {uploading ? "Uploading…" : "Upload cover image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCoverUpload(f);
                      e.target.value = "";
                    }}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{confirmDelete?.name}&rdquo;? This removes the collection but not its books.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
