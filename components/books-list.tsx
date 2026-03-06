import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { createClient } from "@/lib/supabase/server";
import { BookCard } from "@/components/book-card";
import type { LibrarySortType, LibrarySortDir } from "@/components/library-sort-controls";

/** Format author string for display: split by pipe, join with ", " */
function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export async function BooksList({
  sort = "dateAdded",
  dir = "desc",
}: {
  sort?: LibrarySortType;
  dir?: LibrarySortDir;
}) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: userBookRows, error: linksError } = await supabase
    .from("user_books")
    .select("book_id, created_at, updated_at")
    .eq("user_id", user.id);

  if (linksError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Error loading books: {linksError.message}
      </div>
    );
  }

  if (!userBookRows || userBookRows.length === 0) {
    return null; // Caller renders empty state
  }

  const bookIds = userBookRows.map((r) => r.book_id);
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, author, cover_path")
    .in("id", bookIds);

  if (booksError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Error loading books: {booksError.message}
      </div>
    );
  }

  const dateAddedMap = new Map(
    userBookRows.map((r) => [r.book_id, r.created_at ?? r.updated_at ?? ""])
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let userBooks = (books || []).map((book) => {
    const coverUrl = book.cover_path && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
      : null;
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl,
      dateAdded: dateAddedMap.get(book.id) ?? "",
    };
  });

  // Sort by type and direction
  const asc = dir === "asc";
  if (sort === "dateAdded") {
    userBooks = [...userBooks].sort((a, b) => {
      const da = new Date(a.dateAdded).getTime();
      const db = new Date(b.dateAdded).getTime();
      return asc ? da - db : db - da;
    });
  } else {
    userBooks = [...userBooks].sort((a, b) => {
      const ta = (a.title ?? "").toLowerCase();
      const tb = (b.title ?? "").toLowerCase();
      const cmp = ta.localeCompare(tb);
      return asc ? cmp : -cmp;
    });
  }

  if (userBooks.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {userBooks.map((book) => (
        <BookCard
          key={book.id}
          id={book.id}
          title={book.title}
          authorDisplay={formatAuthorDisplay(book.author)}
          coverUrl={book.coverUrl}
        />
      ))}
    </div>
  );
}
