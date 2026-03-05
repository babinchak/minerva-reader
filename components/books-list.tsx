import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { createClient } from "@/lib/supabase/server";
import { BookCard } from "@/components/book-card";

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
