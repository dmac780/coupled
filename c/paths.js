const fs = require('fs');
const path = require('path');

// When installed via npm (e.g. npx coupled), run from the project that has src/ and dist/.
// When run from the repo (node c/build.js), use repo root.
const ROOT_DIR = __dirname.includes('node_modules') ? process.cwd() : path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');


/**
 * Ensure the given directory exists.
 * @param {string} dir - The directory to ensure.
 * @returns {void}
 */
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}


/**
 * Clear the given directory preserving the .git directory.
 * @returns {void}
 */
function clearDistPreservingGit() {
  if (!fs.existsSync(DIST_DIR)) return;
  const entries = fs.readdirSync(DIST_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const fullPath = path.join(DIST_DIR, entry.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}


/**
 * Copy the static assets from the source directory to the destination directory.
 * @returns {void}
 */
function copyStaticAssets() {
  const staticSrc = path.join(SRC_DIR, 'static');
  if (!fs.existsSync(staticSrc) || !fs.statSync(staticSrc).isDirectory()) return;
  const staticDest = path.join(DIST_DIR, 'static');
  ensureDirSync(staticDest);
  function copyRecurse(srcDir, destDir) {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        ensureDirSync(destPath);
        copyRecurse(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  copyRecurse(staticSrc, staticDest);
}

module.exports = {
  ROOT_DIR,
  SRC_DIR,
  DIST_DIR,
  ensureDirSync,
  clearDistPreservingGit,
  copyStaticAssets
};
