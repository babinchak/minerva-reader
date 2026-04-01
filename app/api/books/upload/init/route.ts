import { tryResolveDuplicateUpload, parseBookFileMeta } from "@/lib/book-upload-pipeline";
import { isSha256Hex } from "@/lib/file-hash";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  countBooksUploadedThisWeek,
  getTier,
  isFreeBetaMode,
  countInFlightProcessing,
  MAX_CONCURRENT_PROCESSING,
} from "@/lib/credits";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

/** Sanity cap; large files must not pass through the serverless request body. */
const MAX_BOOK_UPLOAD_BYTES = 100 * 1024 * 1024;

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
  const fileChecksum =
    typeof o.fileChecksum === "string" ? o.fileChecksum.trim().toLowerCase() : "";
  const fileName = typeof o.fileName === "string" ? o.fileName : "";
  const fileSize = typeof o.fileSize === "number" ? o.fileSize : NaN;

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

  const duplicateResponse = await tryResolveDuplicateUpload(
    serviceSupabase,
    user,
    fileChecksum,
    fileName,
  );
  if (duplicateResponse) return duplicateResponse;

  const admin = isAdminEmail(user.email);
  const tier = await getTier(user.id);
  if (!admin && tier === "free" && !isFreeBetaMode()) {
    const uploadedThisWeek = await countBooksUploadedThisWeek(user.id);
    if (uploadedThisWeek >= 3) {
      return NextResponse.json(
        {
          error: "Upload limit reached",
          message:
            "Free tier allows 3 new books per week. Upgrade to Pro for unlimited uploads.",
        },
        { status: 403 },
      );
    }
  }

  // Check concurrent processing limit
  if (!admin) {
    const inFlight = await countInFlightProcessing(user.id);
    if (inFlight >= MAX_CONCURRENT_PROCESSING) {
      return NextResponse.json(
        {
          error: "Processing limit reached",
          message: `You have ${inFlight} books currently being processed. Please wait for them to finish before uploading more.`,
        },
        { status: 429 },
      );
    }
  }

  const bookId = crypto.randomUUID();
  const storagePath = `books/${user.id}/${bookId}.${meta.extension}`;

  const { data: signed, error: signError } = await serviceSupabase.storage
    .from(meta.bucketName)
    .createSignedUploadUrl(storagePath);

  if (signError || !signed) {
    console.error("[UPLOAD] createSignedUploadUrl:", signError);
    return NextResponse.json(
      {
        error: "Failed to create upload URL",
        details: signError?.message ?? "unknown",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    book_id: bookId,
    bucket: meta.bucketName,
    path: signed.path,
    token: signed.token,
    signed_url: signed.signedUrl,
    content_type: meta.mimeType,
  });
}
