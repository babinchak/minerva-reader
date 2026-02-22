import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, User } from "lucide-react";
import Link from "next/link";

/** Format author string for display: split by pipe, join with ", " */
function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export async function BooksList() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: userBookLinks, error: linksError } = await supabase
    .from("user_books")
    .select("book_id")
    .eq("user_id", user.id);

  if (linksError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Error loading books: {linksError.message}
      </div>
    );
  }

  if (!userBookLinks || userBookLinks.length === 0) {
    return null; // Caller renders empty state
  }

  const bookIds = userBookLinks.map((link) => link.book_id);
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, author, created_at, cover_path")
    .in("id", bookIds)
    .order("created_at", { ascending: false });

  if (booksError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Error loading books: {booksError.message}
      </div>
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const userBooks = (books || []).map((book) => {
    const coverUrl = book.cover_path && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
      : null;
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl,
    };
  });

  if (userBooks.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {userBooks.map((book) => (
        <Link
          key={book.id}
          href={`/read/${book.id}`}
          className="group flex flex-col rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
        >
          <div className="mb-3 aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-sm">
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={`Cover of ${book.title}`}
                className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <BookOpen className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          <h3 className="line-clamp-2 font-medium text-foreground group-hover:text-primary">
            {book.title}
          </h3>
          {book.author && (
            <p className="mt-0.5 line-clamp-1 flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{formatAuthorDisplay(book.author)}</span>
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
