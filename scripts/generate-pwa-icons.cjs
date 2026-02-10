/**
 * Generate simple PNG icons for PWA installability.
 *
 * Why: Chrome/Edge install criteria expect 192x192 + 512x512 PNG icons.
 * We generate them during postinstall so the repo doesn't need to store binaries.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

function safeMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function setPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx + 0] = rgba.r;
  png.data[idx + 1] = rgba.g;
  png.data[idx + 2] = rgba.b;
  png.data[idx + 3] = rgba.a ?? 255;
}

function fill(png, rgba) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) setPixel(png, x, y, rgba);
  }
}

// 5x7 bitmap font for "H" and "R"
const GLYPHS = {
  H: [
    "10001",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "10001",
  ],
  R: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10100",
    "10010",
    "10001",
  ],
};

function drawGlyph(png, glyphRows, x0, y0, scale, rgba) {
  for (let y = 0; y < glyphRows.length; y++) {
    const row = glyphRows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          setPixel(png, x0 + x * scale + dx, y0 + y * scale + dy, rgba);
        }
      }
    }
  }
}

function writePng(filePath, size, { backgroundHex, foregroundHex, maskable }) {
  const { PNG } = require("pngjs");
  const png = new PNG({ width: size, height: size });

  const bg = { ...hexToRgb(backgroundHex), a: 255 };
  const fg = { ...hexToRgb(foregroundHex), a: 255 };
  fill(png, bg);

  const scale = Math.max(1, Math.floor(size / (maskable ? 28 : 22)));
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const spacing = 3 * scale;
  const totalW = glyphW + spacing + glyphW;

  const xStart = Math.floor((size - totalW) / 2);
  const yStart = Math.floor((size - glyphH) / 2);

  // For maskable icons, keep a little extra padding.
  const pad = maskable ? Math.floor(size * 0.12) : 0;
  const x = Math.max(pad, xStart);
  const y = Math.max(pad, yStart);

  drawGlyph(png, GLYPHS.H, x, y, scale, fg);
  drawGlyph(png, GLYPHS.R, x + glyphW + spacing, y, scale, fg);

  const out = PNG.sync.write(png);
  fs.writeFileSync(filePath, out);
}

function main() {
  const repoRoot = process.cwd();
  const iconsDir = path.join(repoRoot, "public", "icons");
  safeMkdir(iconsDir);

  const bg = "#0b0f19";
  const fg = "#ffffff";

  writePng(path.join(iconsDir, "icon-192.png"), 192, {
    backgroundHex: bg,
    foregroundHex: fg,
    maskable: false,
  });
  writePng(path.join(iconsDir, "icon-512.png"), 512, {
    backgroundHex: bg,
    foregroundHex: fg,
    maskable: false,
  });
  writePng(path.join(iconsDir, "icon-512-maskable.png"), 512, {
    backgroundHex: bg,
    foregroundHex: fg,
    maskable: true,
  });
  writePng(path.join(iconsDir, "apple-touch-icon.png"), 180, {
    backgroundHex: bg,
    foregroundHex: fg,
    maskable: false,
  });

  console.log(`[postinstall] Generated PWA icons in ${path.relative(repoRoot, iconsDir)}`);
}

try {
  main();
} catch (e) {
  console.warn("[postinstall] PWA icon generation failed:", e);
}

