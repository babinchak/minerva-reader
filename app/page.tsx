import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UploadBookForm } from "@/components/upload-book-form";
import { BooksList } from "@/components/books-list";
import { UpgradeCta } from "@/components/upgrade-cta";
import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";

async function HomeContent({
  showUpgrade,
}: {
  showUpgrade: boolean;
}) {
  if (!hasEnvVars) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <BookOpen className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-4xl font-bold text-foreground">Minerva Reader</h1>
        <p className="text-lg text-muted-foreground max-w-md">
          Your personal EPUB and PDF library. Upload and read your books in one place.
        </p>
        <Suspense>
          <AuthButton />
        </Suspense>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // User is logged in - show upload form and books list
    return (
      <div className="w-full max-w-2xl space-y-8">
        {showUpgrade && <UpgradeCta />}
        <div>
          <h1 className="text-3xl font-bold mb-2 text-foreground">My Library</h1>
          <p className="text-muted-foreground">
            Upload EPUB or PDF books to your personal library
          </p>
        </div>
        <UploadBookForm />
        <BooksList />
      </div>
    );
  }

  // User is not logged in - show landing page with browse CTA
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <BookOpen className="h-16 w-16 text-muted-foreground" />
      <h1 className="text-4xl font-bold text-foreground">Minerva Reader</h1>
      <p className="text-lg text-muted-foreground max-w-md">
        Your personal EPUB and PDF library. Upload and read your books in one place.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/browse"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Browse curated library
        </Link>
        <Suspense>
          <AuthButton />
        </Suspense>
      </div>
      <p className="text-sm text-muted-foreground">
        Sign up to upload your own books and get more AI features.
      </p>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; topup?: string }>;
}) {
  const params = await searchParams;
  const showUpgrade = params.upgrade === "1" || params.topup === "1";

  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-border h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"} className="flex items-center gap-2 text-foreground">
                <BookOpen className="h-5 w-5" />
                Minerva Reader
              </Link>
              <Link href={"/browse"} className="text-muted-foreground hover:text-foreground transition-colors">
                Browse
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {!hasEnvVars ? (
                <EnvVarWarning />
              ) : (
                <Suspense>
                  <AuthButton />
                </Suspense>
              )}
              <ThemeSwitcher />
            </div>
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-12 max-w-5xl p-5 items-center justify-center">
          <Suspense>
            <HomeContent showUpgrade={showUpgrade} />
          </Suspense>
        </div>

        <footer className="w-full flex items-center justify-center border-t border-border mx-auto text-center text-xs gap-8 py-16 text-muted-foreground">
          Minerva Reader
        </footer>
      </div>
    </main>
  );
}
