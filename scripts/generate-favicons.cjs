/**
 * Generate favicons from the owl face logo.
 *
 * Usage: node scripts/generate-favicons.cjs
 * Sources:
 *   owl-face-logo-transparent.png — transparent bg, used for favicons & in-app
 *   owl-face-logo.png             — cream bg, used for PWA & App Store icons
 * Output: public/favicon-*.png, public/icons/*.png
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

async function main() {
  const repoRoot = process.cwd();
  const transparentPath = path.join(repoRoot, "owl-face-logo-transparent.png");
  const creamPath = path.join(repoRoot, "owl-face-logo.png");
  const publicDir = path.join(repoRoot, "public");
  const iconsDir = path.join(publicDir, "icons");

  for (const p of [transparentPath, creamPath]) {
    if (!fs.existsSync(p)) {
      console.error(`[generate-favicons] Source not found: ${p}`);
      process.exit(1);
    }
  }

  const sharp = require("sharp");
  const transparent = sharp(transparentPath);
  const cream = sharp(creamPath);

  // Transparent icons — favicons & in-app
  const sizes = [16, 32, 48, 96, 180, 192, 512];

  for (const size of sizes) {
    await transparent
      .clone()
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(iconsDir, `favicon-${size}.png`));
    console.log(`  ${size}x${size} (transparent)`);
  }

  for (const size of [16, 32]) {
    await transparent
      .clone()
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(publicDir, `favicon-${size}.png`));
  }

  await transparent
    .clone()
    .resize(32, 32)
    .ensureAlpha()
    .png()
    .toFile(path.join(iconsDir, "favicon-32.png"));

  // Generate favicon.ico for Safari and legacy browsers (expect /favicon.ico)
  const toIco = require("to-ico");
  const png16 = await transparent.clone().resize(16, 16).ensureAlpha().png().toBuffer();
  const png32 = await transparent.clone().resize(32, 32).ensureAlpha().png().toBuffer();
  const icoBuffer = await toIco([png16, png32]);
  const appDir = path.join(repoRoot, "app");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "favicon.ico"), icoBuffer);
  console.log("  favicon.ico (16+32) -> app/");

  // Cream-background icons — PWA & App Store
  const pwaSizes = [
    [192, "icon-192.png"],
    [512, "icon-512.png"],
    [512, "icon-512-maskable.png"],
    [180, "apple-touch-icon.png"],
  ];
  for (const [sz, name] of pwaSizes) {
    await cream.clone().resize(sz, sz).png().toFile(path.join(iconsDir, name));
    console.log(`  ${sz}x${sz} ${name} (cream)`);
  }

  console.log(`[generate-favicons] Done. Icons with alpha preserved in public/ and public/icons/`);
}

main().catch((e) => {
  console.error("[generate-favicons]", e);
  process.exit(1);
});
