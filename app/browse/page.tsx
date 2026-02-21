import { createServiceClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, User } from "lucide-react";
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import { EnvVarWarning } from "@/components/env-var-warning";
import { Suspense } from "react";

const AUTHOR_DELIMITER = "|";

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrowsePage() {
  if (!hasEnvVars) {
    return (
      <main className="min-h-screen flex flex-col items-center text-foreground">
        <nav className="w-full flex justify-center border-b border-border h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href="/" className="flex items-center gap-2 text-foreground">
                <BookOpen className="h-5 w-5" />
                Minerva Reader
              </Link>
              <Link href="/browse" className="text-muted-foreground hover:text-foreground transition-colors">
                Browse
              </Link>
              <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
                Settings
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <EnvVarWarning />
              <ThemeSwitcher />
            </div>
          </div>
        </nav>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted-foreground">Configure environment variables to continue.</p>
        </div>
      </main>
    );
  }

  const supabase = createServiceClient();
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author, cover_path")
    .eq("is_curated", true)
    .order("title");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const curatedBooks = (books ?? []).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl:
      book.cover_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
        : null,
  }));

  return (
    <main className="min-h-screen flex flex-col text-foreground">
      <nav className="w-full flex justify-center border-b border-border h-16">
        <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
          <div className="flex gap-5 items-center font-semibold">
            <Link href="/" className="flex items-center gap-2 text-foreground">
              <BookOpen className="h-5 w-5" />
              Minerva Reader
            </Link>
            <Link href="/browse" className="text-muted-foreground hover:text-foreground transition-colors">
              Browse
            </Link>
            <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
              Settings
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Suspense>
              <AuthButton />
            </Suspense>
            <ThemeSwitcher />
          </div>
        </div>
      </nav>

      <div className="flex-1 max-w-5xl w-full mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Curated Library</h1>
          <p className="text-muted-foreground">
            Public domain books you can read and explore with AI. Sign up to upload your own.
          </p>
        </div>

        {error ? (
          <Card className="w-full">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">Error loading books: {error.message}</p>
            </CardContent>
          </Card>
        ) : curatedBooks.length === 0 ? (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Curated Library
              </CardTitle>
              <CardDescription>
                Public domain books available to all readers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                No curated books yet. Check back later or sign up to upload your own.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Curated Library ({curatedBooks.length})
              </CardTitle>
              <CardDescription>
                Public domain books available to all readers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {curatedBooks.map((book) => (
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
                      <h3 className="font-semibold text-lg mb-1 truncate">{book.title}</h3>
                      {book.author && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <User className="h-4 w-4" />
                          <span className="truncate">{formatAuthorDisplay(book.author)}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
