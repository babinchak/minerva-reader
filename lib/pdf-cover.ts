/**
 * Extract the first page of a PDF as a PNG image for use as a cover.
 * Follows the readium-processor pattern: upload to covers bucket, path = {bookId}.png
 *
 * Requires serverExternalPackages: ["pdfjs-dist", "pdf-to-img"] in next.config
 * so the pdfjs worker resolves correctly (unbundled in Node).
 */

import { pdf } from "pdf-to-img";

/**
 * Render the first page of a PDF to a PNG buffer.
 * @param pdfBuffer - Raw PDF bytes
 * @returns PNG buffer or null if extraction fails
 */
export async function extractPdfFirstPageAsPng(pdfBuffer: ArrayBuffer): Promise<Buffer | null> {
  try {
    // pdf-to-img accepts Buffer, Uint8Array, or data URL
    const buffer = Buffer.from(pdfBuffer);
    const document = await pdf(buffer, { scale: 2 });
    const pageCount = document.length;
    if (pageCount < 1) {
      return null;
    }

    // getPage is 1-based (first page = 1)
    const firstPageBuffer = await document.getPage(1);
    return Buffer.from(firstPageBuffer);
  } catch (err) {
    console.warn("[pdf-cover] Extraction failed:", err);
    return null;
  }
}
