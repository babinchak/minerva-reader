#!/usr/bin/env node
/**
 * Standalone script to extract the first page of a PDF as a thumbnail JPEG.
 * Runs in plain Node (no Next.js bundling) so pdfjs worker resolves correctly.
 *
 * Usage: node scripts/extract-pdf-cover.mjs <input.pdf
 * Output: raw JPEG bytes to stdout
 *
 * Or: node scripts/extract-pdf-cover.mjs /path/to/file.pdf
 * Output: raw JPEG bytes to stdout
 */

import { readFileSync } from "node:fs";
import { stdin } from "node:process";
import { pdf } from "pdf-to-img";
import sharp from "sharp";

const THUMBNAIL_MAX_DIM = 400;
const THUMBNAIL_JPEG_QUALITY = 80;

async function getPdfBuffer() {
  const arg = process.argv[2];
  if (arg) {
    return readFileSync(arg);
  }
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function main() {
  try {
    const pdfBuffer = await getPdfBuffer();
    if (pdfBuffer.length === 0) {
      process.exit(1);
    }
    const document = await pdf(pdfBuffer, { scale: 1 });
    if (document.length < 1) {
      process.exit(1);
    }
    const firstPageBuffer = await document.getPage(1);
    const pngBuffer = Buffer.from(firstPageBuffer);
    const jpegBuffer = await sharp(pngBuffer)
      .resize(THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
      .toBuffer();
    process.stdout.write(jpegBuffer);
  } catch (err) {
    console.error("[extract-pdf-cover]", err?.message || err);
    process.exit(1);
  }
}

main();
