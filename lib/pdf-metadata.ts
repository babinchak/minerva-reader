/**
 * Extract metadata from PDF files.
 * Uses pipe (|) as author delimiter for multiple authors (avoids comma conflicts).
 */

import { PDFDocument } from "pdf-lib";

/** Delimiter for multiple authors in the author field. Prefer pipe over comma. */
export const AUTHOR_DELIMITER = "|";

export interface PdfMetadata {
  title: string | null;
  author: string | null;
  authorSortName: string | null;
  publishedAt: string | null; // ISO 8601
}

/**
 * Extract title, author, and published date from PDF metadata.
 * - Author: normalized to pipe-separated for multiple authors
 * - authorSortName: authors sorted alphabetically, joined by pipe (for display/sorting)
 */
export async function extractPdfMetadata(pdfBuffer: ArrayBuffer): Promise<PdfMetadata> {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

  const title = doc.getTitle()?.trim() || null;
  const rawAuthor = doc.getAuthor()?.trim() || null;
  const creationDate = doc.getCreationDate();
  const modDate = doc.getModificationDate();

  // Prefer creation date as "published"; fallback to modification date
  const date = creationDate ?? modDate;
  const publishedAt = date ? date.toISOString() : null;

  // Normalize author: split on comma or semicolon, trim, rejoin with pipe
  let author: string | null = null;
  let authorSortName: string | null = null;

  if (rawAuthor) {
    const parts = rawAuthor
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      author = parts.join(AUTHOR_DELIMITER);
      authorSortName = [...parts].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).join(AUTHOR_DELIMITER);
    }
  }

  return {
    title,
    author,
    authorSortName,
    publishedAt,
  };
}
