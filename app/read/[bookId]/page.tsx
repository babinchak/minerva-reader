import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookReader } from "@/components/book-reader";
import PdfReaderClient from "@/components/pdf-reader-client";
import { EpubProcessingWait } from "@/components/epub-processing-wait";
import { DEMO_DATA } from "@/lib/demo-chat-data";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { bookId } = await params;
  const serviceSupabase = createServiceClient();
  const { data: book } = await serviceSupabase
    .from("books")
    .select("title, file_name")
    .eq("id", bookId)
    .single();
  const title = book?.title || book?.file_name || "Minerva Reader";
  return { title };
}

export default async function ReadBookPage({ params }: PageProps) {
  const { bookId } = await params;
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the book with service client so anonymous users can access curated books (RLS blocks user client when not logged in)
  const { data: book, error: bookError } = await serviceSupabase
    .from("books")
    .select("id, uploaded_by, book_type, storage_path, file_name, title, is_curated")
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Book Not Found</h1>
          <p className="text-muted-foreground">
            The book you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  let userBook: { current_page: number | null; reading_position: unknown; bookmarks?: number[] } | null = null;

  if (user) {
    const { data } = await supabase
      .from("user_books")
      .select("id, current_page, reading_position, bookmarks, custom_title, custom_author, file_name")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .single();
    userBook = data;
  }

  // Access control: logged-in users need user_books OR curated; anonymous only for curated
  if (user && !userBook && !book.is_curated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You don&apos;t have access to this book.</p>
        </div>
      </div>
    );
  }
  if (!user && !book.is_curated) {
    redirect("/auth/login");
  }

  // Record last_opened_at (fire-and-forget)
  const now = new Date().toISOString();
  serviceSupabase.from("books").update({ last_opened_at: now }).eq("id", bookId).then();
  if (user && userBook) {
    supabase.from("user_books").update({ last_opened_at: now }).eq("user_id", user.id).eq("book_id", bookId).then();
  }

  const isDemoMode = !user && !!book.is_curated;
  const demoEntries = isDemoMode ? (DEMO_DATA[bookId] ?? undefined) : undefined;

  const bookType = book.book_type || "epub";

  if (bookType === "pdf") {
    if (!book.storage_path) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">PDF Not Found</h1>
            <p className="text-muted-foreground">The PDF file path is missing.</p>
          </div>
        </div>
      );
    }

    const { data: signedUrl, error: signedError } = await serviceSupabase.storage
      .from("pdfs")
      .createSignedUrl(book.storage_path, 60 * 10);

    if (signedError || !signedUrl?.signedUrl) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">PDF Not Found</h1>
            <p className="text-muted-foreground">The PDF could not be loaded.</p>
          </div>
        </div>
      );
    }

    const ub = userBook as { custom_title?: string | null; file_name?: string | null } | null;
    const customTitle = ub?.custom_title;
    const displayTitle =
      (customTitle != null && customTitle !== "" ? customTitle : null) ??
      book.title ??
      ub?.file_name ??
      book.file_name ??
      "";

    return (
      <PdfReaderClient
        pdfUrl={signedUrl.signedUrl}
        fileName={displayTitle}
        bookId={bookId}
        initialPage={userBook?.current_page ?? undefined}
        initialBookmarks={userBook?.bookmarks ?? undefined}
        isLoggedIn={!!user}
        demoMode={isDemoMode}
        demoEntries={demoEntries}
      />
    );
  }

  // EPUB manifest lives at:
  // readium-manifests/books/{book_id}/manifest.json
  const manifestPath = `books/${book.id}/manifest.json`;

  // Fetch the manifest from readium-manifests bucket
  const { data: manifestData, error: manifestError } = await serviceSupabase.storage
    .from("readium-manifests")
    .download(manifestPath);

  if (manifestError || !manifestData) {
    return <EpubProcessingWait bookTitle={book.title ?? book.file_name ?? "Your book"} />;
  }

  // Parse the manifest JSON
  const manifestText = await manifestData.text();
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Invalid Manifest</h1>
          <p className="text-muted-foreground">The book manifest is invalid or corrupted.</p>
        </div>
      </div>
    );
  }

  // Extract the self href from the manifest, or construct it if missing
  const selfLink = manifest.links?.find(
    (link: { rel?: string; href?: string }) => link.rel === "self"
  );
  let selfHref = selfLink?.href || "";
  
  // If selfHref is missing or relative, construct the full URL
  if (!selfHref || !selfHref.startsWith("http")) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    selfHref = `${supabaseUrl}/storage/v1/object/public/readium-manifests/${manifestPath}`;
  }

  const epubTitle = book.title ?? book.file_name ?? "";

  return (
    <BookReader
      rawManifest={manifest}
      selfHref={selfHref}
      bookTitle={epubTitle}
      initialReadingPosition={(userBook?.reading_position as Record<string, unknown> | null | undefined) ?? undefined}
      isLoggedIn={!!user}
      demoMode={isDemoMode}
      demoEntries={demoEntries}
    />
  );
}
