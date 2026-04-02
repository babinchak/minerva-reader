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
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="h-4 w-4" />
          Add book
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add books</DialogTitle>
          <DialogDescription>
            Upload EPUB or PDF files to add them to your library.
          </DialogDescription>
        </DialogHeader>
        <UploadBookForm onSuccess={handleSuccess} compact />
      </DialogContent>
    </Dialog>
  );
}
