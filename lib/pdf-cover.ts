/**
 * Extract the first page of a PDF as a thumbnail image for library display.
 * Outputs JPEG, resized to max 400px on longest edge, ~80% quality.
 *
 * Runs via a standalone Node script (scripts/extract-pdf-cover.mjs) to avoid
 * pdfjs worker path issues when bundled by Next.js. The API route uses pdfjs
 * for the PDF viewer; cover extraction runs in a separate process.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Render the first page of a PDF as a thumbnail JPEG buffer.
 * @param pdfBuffer - Raw PDF bytes
 * @returns JPEG buffer or null if extraction fails
 */
export async function extractPdfFirstPageAsPng(pdfBuffer: ArrayBuffer): Promise<Buffer | null> {
  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(path.join(tmpdir(), "pdf-cover-"));
    const pdfPath = path.join(tmpDir, "input.pdf");
    await writeFile(pdfPath, Buffer.from(pdfBuffer));

    const scriptPath = path.join(process.cwd(), "scripts", "extract-pdf-cover.mjs");
    const child = spawn(process.execPath, [scriptPath, pdfPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });

    return Buffer.concat(chunks);
  } catch (err) {
    console.warn("[pdf-cover] Extraction failed:", err);
    return null;
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
