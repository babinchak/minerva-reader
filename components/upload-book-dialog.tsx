"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UploadBookForm } from "@/components/upload-book-form";
import { Upload } from "lucide-react";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

export function UploadBookDialog({ iconOnly }: { iconOnly?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const abortRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setIsPaid(d.tier === "paid"); })
      .catch(() => {});
  }, []);

  const handleSuccess = () => {
    router.refresh();
    window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      abortRef.current = true;
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {iconOnly ? (
          <Button size="sm" variant="outline" aria-label="Add book" className="h-9 w-9 p-0">
            <Upload className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Upload className="h-4 w-4" />
            Add book
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add {isPaid ? "books" : "book"}</DialogTitle>
          <DialogDescription>
            Upload {isPaid ? "EPUB or PDF files" : "an EPUB or PDF file"} to add to your library.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <UploadBookForm onSuccess={handleSuccess} abortRef={abortRef} compact />
        </div>
      </DialogContent>
    </Dialog>
  );
}
