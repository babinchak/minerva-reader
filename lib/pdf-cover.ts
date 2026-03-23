/**
 * Extract the first page of a PDF as a thumbnail image for library display.
 * Outputs JPEG, resized to max 400px on longest edge, ~80% quality.
 *
 * Uses pdf-to-img (marked as a serverExternalPackage in next.config.ts so
 * pdfjs worker paths resolve correctly without Next.js bundling interference).
 */

import { pdf } from "pdf-to-img";
import sharp from "sharp";

const THUMBNAIL_MAX_DIM = 400;
const THUMBNAIL_JPEG_QUALITY = 80;

/**
 * Render the first page of a PDF as a thumbnail JPEG buffer.
 * @param pdfBuffer - Raw PDF bytes
 * @returns JPEG buffer or null if extraction fails
 */
export async function extractPdfFirstPageAsPng(pdfBuffer: ArrayBuffer): Promise<Buffer | null> {
  try {
    const document = await pdf(Buffer.from(pdfBuffer), { scale: 1 });
    const firstPageBuffer = await document.getPage(1);
    const jpegBuffer = await sharp(Buffer.from(firstPageBuffer))
      .resize(THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
      .toBuffer();
    return jpegBuffer;
  } catch (err) {
    console.warn("[pdf-cover] Extraction failed:", err);
    return null;
  }
}
