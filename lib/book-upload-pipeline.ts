import { extractPdfMetadata, AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type BookFileMeta = {
  bookType: "pdf" | "epub";
  mimeType: string;
  bucketName: string;
  extension: string;
  isPdf: boolean;
};

export function parseBookFileMeta(fileName: string): BookFileMeta | null {
  const lowerName = fileName.toLowerCase();
  const isEpub = lowerName.endsWith(".epub");
  const isPdf = lowerName.endsWith(".pdf");
  if (!isEpub && !isPdf) return null;
  const bookType = isPdf ? "pdf" : "epub";
  return {
    bookType,
    mimeType: isPdf ? "application/pdf" : "application/epub+zip",
    bucketName: isPdf ? "pdfs" : "epubs",
    extension: isPdf ? "pdf" : "epub",
    isPdf,
  };
}

type ServiceClient = SupabaseClient;

/**
 * If checksum matches an existing book, link user and return a JSON response; otherwise null.
 */
export async function tryResolveDuplicateUpload(
  serviceSupabase: ServiceClient,
  user: User,
  hashHex: string,
  fileName: string,
): Promise<NextResponse | null> {
  const { data: existingBook, error: checkError } = await serviceSupabase
    .from("books")
    .select("id, title, author, title_source, cover_path, book_type")
    .eq("file_checksum", hashHex)
    .maybeSingle();

  if (checkError) {
    console.error("[UPLOAD] Database error checking duplicates:", checkError);
    return NextResponse.json(
      { error: "Database error", details: checkError.message },
      { status: 500 },
    );
  }

  if (!existingBook) return null;

  const { data: existingLink } = await serviceSupabase
    .from("user_books")
    .select("id, custom_title, file_name")
    .eq("user_id", user.id)
    .eq("book_id", existingBook.id)
    .maybeSingle();

  const cleanedFileName = fileName.replace(/\.(epub|pdf)$/i, "");

  if (!existingLink) {
    const userBookData: { user_id: string; book_id: string; file_name?: string } = {
      user_id: user.id,
      book_id: existingBook.id,
    };
    if (cleanedFileName) userBookData.file_name = cleanedFileName;
    const { error: linkError } = await serviceSupabase.from("user_books").insert(userBookData);

    if (linkError) {
      console.error("[UPLOAD] Error linking duplicate book:", linkError);
      return NextResponse.json(
        { error: "Failed to link book to user", details: linkError.message },
        { status: 500 },
      );
    }
  }

  const bookTitle =
    existingLink?.custom_title ??
    existingBook.title ??
    existingLink?.file_name ??
    cleanedFileName ??
    "Unknown";
  const bookAuthor = existingBook.author ?? null;
  const authorDisplay = bookAuthor
    ? bookAuthor.split(AUTHOR_DELIMITER).map((a: string) => a.trim()).filter(Boolean).join(", ")
    : null;
  const bookLabel = authorDisplay ? `${bookTitle} by ${authorDisplay}` : bookTitle;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const coverUrl =
    existingBook.cover_path && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/covers/${existingBook.cover_path}`
      : null;

  return NextResponse.json({
    book_id: existingBook.id,
    duplicate: true,
    alreadyInLibrary: !!existingLink,
    message: existingLink
      ? `You already have "${bookLabel}" in your library`
      : `"${bookLabel}" already exists and has been added to your library`,
    book_title: bookTitle,
    book_author: authorDisplay,
    book_cover_url: coverUrl,
    book_type: existingBook.book_type ?? null,
  });
}

export async function finalizeNewBookAfterDirectStorageUpload(params: {
  userId: string;
  supabase: ServiceClient;
  serviceSupabase: ServiceClient;
  bookId: string;
  storagePath: string;
  bucketName: string;
  meta: BookFileMeta;
  fileName: string;
  fileSize: number;
  hashHex: string;
  arrayBuffer: ArrayBuffer;
}): Promise<NextResponse> {
  const {
    userId,
    supabase,
    serviceSupabase,
    bookId,
    storagePath,
    bucketName,
    meta,
    fileName,
    fileSize,
    hashHex,
    arrayBuffer,
  } = params;

  const { bookType, mimeType, isPdf } = meta;
  const cleanedFileName = fileName.replace(/\.(epub|pdf)$/i, "");

  let pdfMetadata: Awaited<ReturnType<typeof extractPdfMetadata>> | null = null;
  let epubMetadata: Awaited<ReturnType<typeof import("@/lib/epub-metadata").extractEpubMetadata>> | null =
    null;

  if (isPdf) {
    try {
      pdfMetadata = await extractPdfMetadata(arrayBuffer);
    } catch (err) {
      console.warn("[UPLOAD] PDF metadata extraction failed (non-fatal):", err);
    }
  } else {
    try {
      const { extractEpubMetadata } = await import("@/lib/epub-metadata");
      epubMetadata = await extractEpubMetadata(arrayBuffer);
    } catch (err) {
      console.warn("[UPLOAD] EPUB metadata extraction failed (non-fatal):", err);
    }
  }

  const titleFromMetadata =
    (pdfMetadata?.title?.trim() || epubMetadata?.title?.trim()) || null;
  const bookData: Record<string, unknown> = {
    id: bookId,
    title: titleFromMetadata ?? null,
    title_source: titleFromMetadata ? "metadata" : null,
    file_size: fileSize,
    file_checksum: hashHex,
    uploaded_by: userId,
    storage_path: storagePath,
    file_name: fileName,
    book_type: bookType,
    mime_type: mimeType,
  };
  if (pdfMetadata?.author != null) bookData.author = pdfMetadata.author;
  else if (epubMetadata?.author != null) bookData.author = epubMetadata.author;
  if (pdfMetadata?.authorSortName != null) bookData.author_sort_name = pdfMetadata.authorSortName;
  else if (epubMetadata?.authorSortName != null)
    bookData.author_sort_name = epubMetadata.authorSortName;
  if (pdfMetadata?.publishedAt != null) bookData.published_at = pdfMetadata.publishedAt;

  const { error: bookError } = await supabase.from("books").insert(bookData);

  if (bookError) {
    console.error("[UPLOAD] Error creating book record:", {
      message: bookError.message,
      code: bookError.code,
      details: bookError.details,
      hint: bookError.hint,
    });

    await serviceSupabase.storage.from(bucketName).remove([storagePath]);

    if (bookError.code === "23505") {
      const { data: raceConditionBook } = await serviceSupabase
        .from("books")
        .select("id, title, author, title_source")
        .eq("file_checksum", hashHex)
        .maybeSingle();

      if (raceConditionBook) {
        const rcCleanedFileName = fileName.replace(/\.(epub|pdf)$/i, "");

        const { data: rcExistingLink } = await serviceSupabase
          .from("user_books")
          .select("id, custom_title, file_name")
          .eq("user_id", userId)
          .eq("book_id", raceConditionBook.id)
          .maybeSingle();

        if (!rcExistingLink) {
          const raceUserBookData: { user_id: string; book_id: string; file_name?: string } = {
            user_id: userId,
            book_id: raceConditionBook.id,
          };
          if (rcCleanedFileName) raceUserBookData.file_name = rcCleanedFileName;
          await serviceSupabase.from("user_books").insert(raceUserBookData);
        }

        const rcTitle =
          rcExistingLink?.custom_title ??
          raceConditionBook.title ??
          rcExistingLink?.file_name ??
          rcCleanedFileName ??
          "Unknown";
        const rcAuthor = raceConditionBook.author ?? null;
        const rcAuthorDisplay = rcAuthor
          ? rcAuthor.split(AUTHOR_DELIMITER).map((a: string) => a.trim()).filter(Boolean).join(", ")
          : null;
        const rcLabel = rcAuthorDisplay ? `${rcTitle} by ${rcAuthorDisplay}` : rcTitle;

        return NextResponse.json({
          book_id: raceConditionBook.id,
          duplicate: true,
          message: `"${rcLabel}" already exists and has been added to your library`,
          book_title: rcTitle,
          book_author: rcAuthorDisplay,
        });
      }
    }

    return NextResponse.json(
      {
        error: "Failed to create book record",
        details: bookError.message,
        code: bookError.code,
        hint: bookError.hint,
      },
      { status: 500 },
    );
  }

  const userBookData: { user_id: string; book_id: string; file_name?: string } = {
    user_id: userId,
    book_id: bookId,
  };
  if (cleanedFileName) userBookData.file_name = cleanedFileName;
  const { error: linkError } = await supabase.from("user_books").insert(userBookData);

  if (linkError) {
    console.error("[UPLOAD] Error linking book to user:", linkError);
    await serviceSupabase.from("books").delete().eq("id", bookId);
    await serviceSupabase.storage.from(bucketName).remove([storagePath]);
    return NextResponse.json(
      { error: "Failed to link book to user", details: linkError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    book_id: bookId,
    message: "Book uploaded successfully",
  });
}
