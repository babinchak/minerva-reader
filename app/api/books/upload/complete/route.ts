import {
  finalizeNewBookAfterDirectStorageUpload,
  parseBookFileMeta,
} from "@/lib/book-upload-pipeline";
import { isSha256Hex } from "@/lib/file-hash";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const MAX_BOOK_UPLOAD_BYTES = 100 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const bookId = typeof o.bookId === "string" ? o.bookId : "";
  const fileChecksum =
    typeof o.fileChecksum === "string" ? o.fileChecksum.trim().toLowerCase() : "";
  const fileName = typeof o.fileName === "string" ? o.fileName : "";
  const fileSize = typeof o.fileSize === "number" ? o.fileSize : NaN;

  if (!UUID_RE.test(bookId)) {
    return NextResponse.json({ error: "Invalid bookId" }, { status: 400 });
  }
  if (!isSha256Hex(fileChecksum)) {
    return NextResponse.json({ error: "Invalid fileChecksum" }, { status: 400 });
  }

  const meta = parseBookFileMeta(fileName);
  if (!meta) {
    return NextResponse.json(
      { error: "Invalid file type. Expected EPUB or PDF file." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BOOK_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
  }

  const storagePath = `books/${user.id}/${bookId}.${meta.extension}`;

  const { data: blob, error: dlError } = await serviceSupabase.storage
    .from(meta.bucketName)
    .download(storagePath);

  if (dlError || !blob) {
    console.error("[UPLOAD] complete download:", dlError);
    return NextResponse.json(
      {
        error: "Uploaded file not found",
        details: dlError?.message ?? "Complete the direct upload before finishing.",
      },
      { status: 400 },
    );
  }

  if (blob.size !== fileSize) {
    await serviceSupabase.storage.from(meta.bucketName).remove([storagePath]);
    return NextResponse.json(
      { error: "File size mismatch after upload" },
      { status: 400 },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (hashHex !== fileChecksum) {
    await serviceSupabase.storage.from(meta.bucketName).remove([storagePath]);
    return NextResponse.json({ error: "Checksum mismatch" }, { status: 400 });
  }

  return finalizeNewBookAfterDirectStorageUpload({
    userId: user.id,
    supabase,
    serviceSupabase,
    bookId,
    storagePath,
    bucketName: meta.bucketName,
    meta,
    fileName,
    fileSize,
    hashHex,
    arrayBuffer,
  });
}
