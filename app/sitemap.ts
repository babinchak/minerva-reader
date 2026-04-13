import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:4000";

  const supabase = createServiceClient();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/browse`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Curated collections
  const { data: collections } = await supabase
    .from("curated_collections")
    .select("slug, updated_at");

  const collectionPages: MetadataRoute.Sitemap = (collections ?? []).map((c) => ({
    url: `${baseUrl}/browse/${c.slug}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  // Curated books (publicly accessible)
  const { data: books } = await supabase
    .from("books")
    .select("id, updated_at")
    .eq("is_curated", true);

  const bookPages: MetadataRoute.Sitemap = (books ?? []).map((b) => ({
    url: `${baseUrl}/read/${b.id}`,
    lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...collectionPages, ...bookPages];
}
