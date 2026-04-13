import type { Metadata } from "next";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

const getBookMeta = unstable_cache(
  async (bookId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("books")
      .select("title, author, file_name, is_curated")
      .eq("id", bookId)
      .single();
    return data;
  },
  ["book-metadata"],
  { revalidate: 3600 },
);

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const bookId = pathname.split("/read/")[1]?.split("/")[0] ?? "";

  if (!bookId) {
    return {};
  }

  const book = await getBookMeta(bookId);

  const title = book?.title || book?.file_name || "Minerva Reader";
  const author = book?.author;

  if (!book?.is_curated) {
    return { title, robots: { index: false, follow: false } };
  }

  const description = author
    ? `Read "${title}" by ${author} online. Highlight passages for AI explanations and deep search.`
    : `Read "${title}" online. Highlight passages for AI explanations and deep search.`;

  return {
    title,
    description,
    openGraph: {
      title: author ? `${title} by ${author}` : title,
      description,
      type: "article",
      images: [{ url: `/api/og?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author ?? "")}&type=book`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: author ? `${title} by ${author}` : title,
      description,
      images: [`/api/og?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author ?? "")}&type=book`],
    },
  };
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
