import type { Metadata } from "next";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

const getCollection = unstable_cache(
  async (slug: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("curated_collections")
      .select("name, description")
      .eq("slug", slug)
      .single();
    return data;
  },
  ["collection-metadata"],
  { revalidate: 3600 },
);

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const slug = pathname.split("/browse/")[1]?.split("/")[0] ?? "";

  if (!slug) {
    return { description: "Explore curated collections of classic books on Minerva Reader." };
  }

  const data = await getCollection(slug);

  const title = data?.name ?? "Explore";
  const description = data?.description
    ? `${data.description} Read and discuss these books with AI on Minerva Reader.`
    : "Explore this curated collection of classic books on Minerva Reader.";

  return {
    title,
    description,
    openGraph: {
      title: `${title} — Curated Collection`,
      description,
      images: [{ url: `/api/og?title=${encodeURIComponent(title)}&type=collection`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — Curated Collection`,
      description,
      images: [`/api/og?title=${encodeURIComponent(title)}&type=collection`],
    },
  };
}

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
