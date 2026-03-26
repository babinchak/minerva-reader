/**
 * EPUB metadata types.
 * Server-side extraction is handled by the backend lambda;
 * this module only defines the shape returned during upload.
 */

export interface EpubMetadata {
  title: string | null;
  author: string | null;
  authorSortName: string | null;
}

/**
 * Returns empty metadata — the backend lambda handles real EPUB metadata extraction.
 */
export async function extractEpubMetadata(_epubBuffer: ArrayBuffer): Promise<EpubMetadata> {
  return { title: null, author: null, authorSortName: null };
}
