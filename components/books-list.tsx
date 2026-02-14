import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, User, Calendar } from "lucide-react";
import Link from "next/link";

export async function BooksList() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  // First, get the book_ids for this user from user_books
  const { data: userBookLinks, error: linksError } = await supabase
    .from("user_books")
    .select("book_id")
    .eq("user_id", user.id);

  if (linksError) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Your Books
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <p className="text-sm text-red-600 dark:text-red-400">
            Error loading books: {linksError.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  // If no book links, show empty state
  if (!userBookLinks || userBookLinks.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Your Books
          </CardTitle>
          <CardDescription>
            Books you&apos;ve uploaded or added to your library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No books yet. Upload your first EPUB or PDF book to get started!
          </p>
        </CardContent>
      </Card>
    );
  }

  // Fetch the actual books using the book_ids
  const bookIds = userBookLinks.map((link) => link.book_id);
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, author, created_at, cover_path")
    .in("id", bookIds)
    .order("created_at", { ascending: false });

  if (booksError) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Your Books
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <p className="text-sm text-red-600 dark:text-red-400">
            Error loading books: {booksError.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Build cover URLs for books that have cover_path (covers bucket is public)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const userBooks = (books || []).map((book) => {
    const coverUrl = book.cover_path && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
      : null;
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      createdAt: book.created_at,
      coverUrl,
    };
  });

  if (userBooks.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Your Books
          </CardTitle>
          <CardDescription>
            Books you&apos;ve uploaded or added to your library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No books found. This might be a data consistency issue.
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Your Books ({userBooks.length})
        </CardTitle>
          <CardDescription>
            Books you&apos;ve uploaded or added to your library
          </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {userBooks.map((book) => (
            <Link
              key={book.id}
              href={`/read/${book.id}`}
              className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer block"
            >
              <div className="flex-shrink-0">
                <div className="w-[100px] h-[150px] rounded-lg overflow-hidden bg-muted flex items-center justify-center shadow-sm">
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt={`Cover of ${book.title}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BookOpen className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg mb-1 truncate">
                  {book.title}
                </h3>
                {book.author && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <User className="h-4 w-4" />
                    <span className="truncate">{book.author}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  {book.createdAt && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>Added {formatDate(book.createdAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
