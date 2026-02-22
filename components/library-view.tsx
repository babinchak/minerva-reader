import { createClient } from "@/lib/supabase/server";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { BooksList } from "@/components/books-list";
import { UploadBookDialog } from "@/components/upload-book-dialog";

export async function LibraryView() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: userBookLinks } = await supabase
    .from("user_books")
    .select("book_id")
    .eq("user_id", user.id);

  const hasBooks = userBookLinks && userBookLinks.length > 0;

  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          Library
        </h1>
        <div className="flex items-center gap-2">
          <UploadBookDialog />
          <Link
            href="/browse"
            className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Browse curated
          </Link>
        </div>
      </div>

      {hasBooks ? (
        <BooksList />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Your library is empty
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Upload an EPUB or PDF to get started, or browse our curated collection
            of public domain books.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <UploadBookDialog />
            <Link
              href="/browse"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <BookOpen className="h-4 w-4" />
              Browse curated library
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
