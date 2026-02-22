"use client";

import { useState } from "react";
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

export function UploadBookDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    router.refresh();
    window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="h-4 w-4" />
          Add book
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add book</DialogTitle>
          <DialogDescription>
            Upload an EPUB or PDF file to add it to your library.
          </DialogDescription>
        </DialogHeader>
        <UploadBookForm onSuccess={handleSuccess} compact />
      </DialogContent>
    </Dialog>
  );
}
