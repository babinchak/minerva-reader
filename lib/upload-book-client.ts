import { sha256HexFromFile } from "@/lib/file-hash";
import { createClient } from "@/lib/supabase/client";

export type DirectUploadResult =
  | {
      ok: true;
      alreadyInLibrary: boolean;
      duplicate: boolean;
      message?: string;
      book_title?: string;
      book_author?: string;
      book_cover_url?: string | null;
      book_type?: string | null;
    }
  | { ok: false; error: string };

/**
 * Uploads a book without sending file bytes through Next/Vercel (avoids ~4.5MB function payload limit).
 * Flow: init (JSON) → Supabase signed URL → complete (JSON).
 */
export async function uploadBookViaDirectStorage(file: File): Promise<DirectUploadResult> {
  try {
    const checksum = await sha256HexFromFile(file);

    const initRes = await fetch("/api/books/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileChecksum: checksum,
        fileName: file.name,
        fileSize: file.size,
      }),
    });

    const initData = await initRes.json();

    if (!initRes.ok) {
      return {
        ok: false,
        error: initData.error || initData.message || "Upload failed",
      };
    }

    if (initData.duplicate) {
      return {
        ok: true,
        duplicate: true,
        alreadyInLibrary: !!initData.alreadyInLibrary,
        message: initData.message,
        book_title: initData.book_title,
        book_author: initData.book_author,
        book_cover_url: initData.book_cover_url ?? null,
        book_type: initData.book_type ?? null,
      };
    }

    const bucket = initData.bucket as string;
    const path = initData.path as string;
    const token = initData.token as string;
    const contentType =
      (initData.content_type as string) ||
      file.type ||
      (file.name.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/epub+zip");

    if (!bucket || !path || !token) {
      return { ok: false, error: "Invalid upload session from server" };
    }

    const supabase = createClient();
    const { error: storageError } = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(path, token, file, { contentType });

    if (storageError) {
      return {
        ok: false,
        error: storageError.message || "Failed to upload file to storage",
      };
    }

    const completeRes = await fetch("/api/books/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: initData.book_id,
        fileChecksum: checksum,
        fileName: file.name,
        fileSize: file.size,
      }),
    });

    const data = await completeRes.json();

    if (!completeRes.ok) {
      return { ok: false, error: data.error || "Upload failed" };
    }

    return {
      ok: true,
      duplicate: !!data.duplicate,
      alreadyInLibrary: !!data.alreadyInLibrary,
      message: data.message,
      book_title: data.book_title,
      book_author: data.book_author,
      book_cover_url: data.book_cover_url ?? null,
      book_type: data.book_type ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed",
    };
  }
}
