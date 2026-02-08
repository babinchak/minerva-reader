/**
 * Work around a packaging issue in some `pdfjs-dist` versions where
 * `web/pdf_viewer.css` references `web/images/checkmark.svg`, but the file
 * isn't shipped.
 *
 * This script runs in `postinstall` and creates the missing asset in
 * `node_modules` so Next.js (Turbopack) can resolve the CSS url().
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function writeFallbackSvg(targetPath) {
  // Generic, tiny SVG placeholder. Using `currentColor` keeps it theme-friendly
  // in case it ever gets displayed.
  const fallbackSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M6 12l4 4L18 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
  fs.writeFileSync(targetPath, fallbackSvg, "utf8");
}

function ensurePdfjsViewerAssets() {
  let pdfjsPkgJsonPath;
  try {
    pdfjsPkgJsonPath = require.resolve("pdfjs-dist/package.json");
  } catch {
    // pdfjs-dist not installed; nothing to do.
    return;
  }

  const pdfjsRoot = path.dirname(pdfjsPkgJsonPath);
  const imagesDir = path.join(pdfjsRoot, "web", "images");

  fs.mkdirSync(imagesDir, { recursive: true });

  const viewerCssPath = path.join(pdfjsRoot, "web", "pdf_viewer.css");
  const viewerCss = safeReadText(viewerCssPath);
  if (!viewerCss) return;

  // Collect all url(images/...) references from the viewer CSS.
  const referenced = new Set();
  const re = /url\((['"]?)(images\/[^'")]+)\1\)/g;
  let match;
  while ((match = re.exec(viewerCss))) {
    const raw = match[2]; // e.g. images/checkmark.svg
    const file = raw.replace(/^images\//, "").split(/[?#]/)[0];
    if (file) referenced.add(file);
  }

  // Prefer copying from existing icons when possible; otherwise generate placeholders.
  const copyMap = new Map([
    ["checkmark.svg", "annotation-check.svg"],
  ]);

  let createdCount = 0;
  for (const file of referenced) {
    const targetPath = path.join(imagesDir, file);
    if (fs.existsSync(targetPath)) continue;

    // Only generate/copy SVGs (the package already ships its GIFs in practice).
    if (!file.toLowerCase().endsWith(".svg")) continue;

    const mapped = copyMap.get(file);
    const mappedPath = mapped ? path.join(imagesDir, mapped) : null;
    if (mappedPath && fs.existsSync(mappedPath)) {
      fs.copyFileSync(mappedPath, targetPath);
      createdCount += 1;
      continue;
    }

    writeFallbackSvg(targetPath);
    createdCount += 1;
  }

  if (createdCount > 0) {
    console.log(
      `[postinstall] Ensured pdfjs-dist viewer assets: created ${createdCount} missing SVG file(s) in ${path.relative(
        process.cwd(),
        imagesDir,
      )}`,
    );
  }
}

try {
  ensurePdfjsViewerAssets();
} catch (e) {
  // Don't fail installs/builds if this workaround can't run for some reason.
  console.warn("[postinstall] pdfjs-dist asset fix failed:", e);
}

