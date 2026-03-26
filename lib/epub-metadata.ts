/**
 * EPUB metadata extraction.
 * Parses the EPUB (ZIP) to extract title, author, and cover image
 * from the OPF package document.
 */

import { unzipSync } from "fflate";

export interface EpubMetadata {
  title: string | null;
  author: string | null;
  authorSortName: string | null;
  /** Cover image bytes (JPEG/PNG) extracted from the EPUB, if found. */
  coverImage: Uint8Array | null;
  /** MIME type of the cover image (e.g. "image/jpeg"). */
  coverMimeType: string | null;
}

/**
 * Extract metadata from an EPUB file buffer.
 * Parses container.xml → OPF → dc:title, dc:creator, cover image.
 */
export async function extractEpubMetadata(epubBuffer: ArrayBuffer): Promise<EpubMetadata> {
  const result: EpubMetadata = {
    title: null,
    author: null,
    authorSortName: null,
    coverImage: null,
    coverMimeType: null,
  };

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(epubBuffer));
  } catch {
    return result;
  }

  // Helper: read a file from the ZIP (case-insensitive path matching)
  const readFile = (path: string): string | null => {
    // Try exact match first
    if (files[path]) {
      return new TextDecoder().decode(files[path]);
    }
    // Case-insensitive fallback
    const lower = path.toLowerCase();
    for (const key of Object.keys(files)) {
      if (key.toLowerCase() === lower) {
        return new TextDecoder().decode(files[key]);
      }
    }
    return null;
  };

  const readBinary = (path: string): Uint8Array | null => {
    if (files[path]) return files[path];
    const lower = path.toLowerCase();
    for (const key of Object.keys(files)) {
      if (key.toLowerCase() === lower) return files[key];
    }
    return null;
  };

  // Step 1: Find the OPF path from container.xml
  const containerXml = readFile("META-INF/container.xml");
  if (!containerXml) return result;

  const rootfileMatch = containerXml.match(
    /<rootfile[^>]+full-path\s*=\s*"([^"]+)"[^>]*media-type\s*=\s*"application\/oebps-package\+xml"/i
  ) ?? containerXml.match(
    /<rootfile[^>]+media-type\s*=\s*"application\/oebps-package\+xml"[^>]*full-path\s*=\s*"([^"]+)"/i
  );

  if (!rootfileMatch) return result;
  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  // Step 2: Parse the OPF file
  const opfXml = readFile(opfPath);
  if (!opfXml) return result;

  // Extract title
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  if (titleMatch) {
    result.title = decodeXmlEntities(titleMatch[1].trim()) || null;
  }

  // Extract author(s) - dc:creator
  const creatorRegex = /<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi;
  const authors: string[] = [];
  let creatorMatch: RegExpExecArray | null;
  while ((creatorMatch = creatorRegex.exec(opfXml)) !== null) {
    const name = decodeXmlEntities(creatorMatch[1].trim());
    if (name) authors.push(name);
  }
  if (authors.length > 0) {
    result.author = authors.join("|");
    result.authorSortName = [...authors]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .join("|");
  }

  // Step 3: Find cover image
  // Method A: <meta name="cover" content="cover-image-id"/>
  // Method B: <item properties="cover-image" .../>
  let coverHref: string | null = null;
  let coverMediaType: string | null = null;

  // Method B first (EPUB 3)
  const coverItemMatch = opfXml.match(
    /<item[^>]+properties\s*=\s*"[^"]*cover-image[^"]*"[^>]*>/i
  );
  if (coverItemMatch) {
    const hrefMatch = coverItemMatch[0].match(/href\s*=\s*"([^"]+)"/i);
    const mtMatch = coverItemMatch[0].match(/media-type\s*=\s*"([^"]+)"/i);
    if (hrefMatch) {
      coverHref = hrefMatch[1];
      coverMediaType = mtMatch?.[1] ?? null;
    }
  }

  // Method A fallback (EPUB 2)
  if (!coverHref) {
    const metaCoverMatch = opfXml.match(
      /<meta[^>]+name\s*=\s*"cover"[^>]+content\s*=\s*"([^"]+)"/i
    ) ?? opfXml.match(
      /<meta[^>]+content\s*=\s*"([^"]+)"[^>]+name\s*=\s*"cover"/i
    );
    if (metaCoverMatch) {
      const coverId = metaCoverMatch[1];
      // Find the manifest item with this id
      const idPattern = new RegExp(
        `<item[^>]+id\\s*=\\s*"${escapeRegex(coverId)}"[^>]*>`,
        "i"
      );
      const itemMatch = opfXml.match(idPattern);
      if (itemMatch) {
        const hrefMatch = itemMatch[0].match(/href\s*=\s*"([^"]+)"/i);
        const mtMatch = itemMatch[0].match(/media-type\s*=\s*"([^"]+)"/i);
        if (hrefMatch && mtMatch?.[1]?.startsWith("image/")) {
          coverHref = hrefMatch[1];
          coverMediaType = mtMatch[1];
        }
      }
    }
  }

  // Extract cover image bytes
  if (coverHref) {
    const decodedHref = decodeURIComponent(coverHref);
    const coverPath = decodedHref.startsWith("/")
      ? decodedHref.substring(1)
      : opfDir + decodedHref;
    const coverBytes = readBinary(coverPath);
    if (coverBytes && coverBytes.length > 0) {
      result.coverImage = coverBytes;
      result.coverMimeType = coverMediaType ?? guessMimeType(coverPath);
    }
  }

  return result;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function guessMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}
