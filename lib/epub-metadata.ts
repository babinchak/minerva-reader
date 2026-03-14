/**
 * Extract metadata from EPUB files.
 * Uses pipe (|) as author delimiter for multiple authors (matches pdf-metadata).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AUTHOR_DELIMITER } from "./pdf-metadata";

export interface EpubMetadata {
  title: string | null;
  author: string | null;
  authorSortName: string | null;
}

type RawCreator = { text?: string; "file-as"?: string } | string;

function normalizeCreator(creator: RawCreator | RawCreator[] | undefined): string | null {
  if (!creator) return null;
  const items = Array.isArray(creator) ? creator : [creator];
  const names = items
    .map((c) => (typeof c === "string" ? c : c?.text ?? c?.["file-as"]))
    .filter((s): s is string => Boolean(s?.trim()));
  return names.length > 0 ? names.join(AUTHOR_DELIMITER) : null;
}

/**
 * Extract title and author from EPUB metadata.
 * Writes to temp file because epub-metadata requires a path.
 */
export async function extractEpubMetadata(epubBuffer: ArrayBuffer): Promise<EpubMetadata> {
  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(path.join(tmpdir(), "epub-meta-"));
    const epubPath = path.join(tmpDir, "input.epub");
    await writeFile(epubPath, Buffer.from(epubBuffer));

    const epubMetadata = (await import("epub-metadata")).default;
    const raw = await epubMetadata(epubPath);

    if (!raw) {
      return { title: null, author: null, authorSortName: null };
    }

    const title = raw.title?.trim() || null;
    const author = normalizeCreator(raw.creator);
    const authorSortName = author
      ? author
          .split(AUTHOR_DELIMITER)
          .map((a) => a.trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
          .join(AUTHOR_DELIMITER)
      : null;

    return { title, author, authorSortName };
  } catch (err) {
    console.warn("[epub-metadata] Extraction failed:", err);
    return { title: null, author: null, authorSortName: null };
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
