/**
 * Generate favicons from the owl face logo.
 *
 * Usage: node scripts/generate-favicons.cjs
 * Sources:
 *   owl-face-logo-transparent.png — black owl, transparent bg (in-app, uses CSS invert for dark mode)
 *   owl-face-logo.png             — black owl, gold bg (favicon & PWA icons)
 * Output: public/favicon-*.png, public/icons/*.png, app/favicon.ico
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

async function main() {
  const repoRoot = process.cwd();
  const blackPath = path.join(repoRoot, "owl-face-logo-transparent.png");
  const goldPath = path.join(repoRoot, "owl-face-logo.png");
  const publicDir = path.join(repoRoot, "public");
  const iconsDir = path.join(publicDir, "icons");

  for (const p of [blackPath, goldPath]) {
    if (!fs.existsSync(p)) {
      console.error(`[generate-favicons] Source not found: ${p}`);
      process.exit(1);
    }
  }

  const sharp = require("sharp");
  const black = sharp(blackPath);
  const gold = sharp(goldPath);

  // Transparent icons (black owl) — used in-app via MinervaLogo component
  const sizes = [16, 32, 48, 96, 180, 192, 512];
  for (const size of sizes) {
    await black
      .clone()
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(iconsDir, `favicon-${size}.png`));
    console.log(`  ${size}x${size} transparent`);
  }

  // Default copies in public root
  for (const size of [16, 32]) {
    await gold
      .clone()
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `favicon-${size}.png`));
    console.log(`  ${size}x${size} favicon (gold)`);
  }

  // Generate favicon.ico (gold background) for legacy browsers
  const toIco = require("to-ico");
  const png16 = await gold.clone().resize(16, 16).png().toBuffer();
  const png32 = await gold.clone().resize(32, 32).png().toBuffer();
  const icoBuffer = await toIco([png16, png32]);
  const appDir = path.join(repoRoot, "app");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "favicon.ico"), icoBuffer);
  console.log("  favicon.ico (16+32, gold) -> app/");

  // PWA & App Store icons — gold background
  const pwaSizes = [
    [192, "icon-192.png"],
    [512, "icon-512.png"],
    [512, "icon-512-maskable.png"],
    [180, "apple-touch-icon.png"],
  ];
  for (const [sz, name] of pwaSizes) {
    await gold
      .clone()
      .resize(sz, sz)
      .png()
      .toFile(path.join(iconsDir, name));
    console.log(`  ${sz}x${sz} ${name} (gold)`);
  }

  console.log(`[generate-favicons] Done.`);
}

main().catch((e) => {
  console.error("[generate-favicons]", e);
  process.exit(1);
});
