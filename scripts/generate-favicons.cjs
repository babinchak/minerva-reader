/**
 * Generate favicons from the owl face logo.
 *
 * Usage: node scripts/generate-favicons.cjs
 * Source: owl-face-logo.png (project root)
 * Output: public/favicon-*.png, public/icons/*.png
 *
 * Preserves alpha channel - transparent background works on any theme.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

async function main() {
  const repoRoot = process.cwd();
  const sourcePath = path.join(repoRoot, "owl-face-logo.png");
  const publicDir = path.join(repoRoot, "public");
  const iconsDir = path.join(publicDir, "icons");

  if (!fs.existsSync(sourcePath)) {
    console.error(`[generate-favicons] Source not found: ${sourcePath}`);
    process.exit(1);
  }

  const sharp = require("sharp");
  const input = sharp(sourcePath);

  const sizes = [16, 32, 48, 96, 180, 192, 512];

  for (const size of sizes) {
    await input
      .clone()
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(iconsDir, `favicon-${size}.png`));
    console.log(`  ${size}x${size}`);
  }

  for (const size of [16, 32]) {
    await input
      .clone()
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(publicDir, `favicon-${size}.png`));
  }

  await input
    .clone()
    .resize(32, 32)
    .ensureAlpha()
    .png()
    .toFile(path.join(iconsDir, "favicon-32.png"));

  const pwaSizes = [
    [192, "icon-192.png"],
    [512, "icon-512.png"],
    [512, "icon-512-maskable.png"],
    [180, "apple-touch-icon.png"],
  ];
  for (const [sz, name] of pwaSizes) {
    await input.clone().resize(sz, sz).ensureAlpha().png().toFile(path.join(iconsDir, name));
  }

  console.log(`[generate-favicons] Done. Icons with alpha preserved in public/ and public/icons/`);
}

main().catch((e) => {
  console.error("[generate-favicons]", e);
  process.exit(1);
});
