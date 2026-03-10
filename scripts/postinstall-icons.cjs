/**
 * Run favicon generation if owl source exists; otherwise fall back to placeholder PWA icons.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "owl-face-logo.png");

if (fs.existsSync(sourcePath)) {
  execSync("node scripts/generate-favicons.cjs", { stdio: "inherit", cwd: repoRoot });
} else {
  execSync("node scripts/generate-pwa-icons.cjs", { stdio: "inherit", cwd: repoRoot });
}
