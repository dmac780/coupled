/**
 * The build script for the coupled static site build process.
 * It collects all coupled files from the source directory, registers all components,
 * resolves the file bundles, and processes the page files.
 * It then writes the final HTML files to the output directory.
 * 
 * @author dmac780
 * @see https://github.com/dmac780/coupled
 * @module build
 */


const fs = require('fs');
const path = require('path');
const { SRC_DIR, DIST_DIR, ensureDirSync, clearDistPreservingGit, copyStaticAssets } = require('./paths');
const { parseFrontmatterAndBody } = require('./parse');
const { resolveFileBundles } = require('./bundles');
const { registerComponent } = require('./components');
const { getMergedMountsForPage, processPageFile } = require('./page');


/**
 * Collect all coupled files from the given start directory.
 * @param {string} startDir - The start directory to collect coupled files from.
 * @param {string[]} acc - The accumulator to collect the coupled files into.
 * @returns {string[]} - The collected coupled files.
 */
function collectCoupledFiles(startDir, acc) {
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectCoupledFiles(fullPath, acc);
    } else if (entry.isFile() && entry.name.endsWith('.c.html')) {
      acc.push(fullPath);
    }
  }
  return acc;
}


/**
 * The main function to run the build process.
 * @returns {void}
 */
function main() {
  ensureDirSync(DIST_DIR);
  clearDistPreservingGit();
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }
  copyStaticAssets();

  const files = collectCoupledFiles(SRC_DIR, []);

  // First pass: register all components
  for (const cPath of files) {
    const source = fs.readFileSync(cPath, 'utf8');
    const { meta, body } = parseFrontmatterAndBody(source);
    const type = (meta.TYPE || meta.type || 'page').trim();
    if (type === 'component') {
      registerComponent(cPath, meta, body);
    }
  }

  const pageFiles = files.filter((cPath) => {
    const source = fs.readFileSync(cPath, 'utf8');
    const { meta } = parseFrontmatterAndBody(source);
    return (meta.TYPE || meta.type || 'page').trim() !== 'component';
  });
  const allStyles = [];
  const allScripts = [];
  for (const cPath of pageFiles) {
    const mounts = getMergedMountsForPage(cPath);
    if (!mounts) continue;
    for (const data of Object.values(mounts)) {
      allStyles.push(...data.styles);
      allScripts.push(...data.scripts);
    }
  }
  const resolvedFileBundles = resolveFileBundles(allStyles, allScripts);

  for (const cPath of files) {
    const source = fs.readFileSync(cPath, 'utf8');
    const { meta, body } = parseFrontmatterAndBody(source);
    if ((meta.TYPE || meta.type || 'page').trim() !== 'component') {
      processPageFile(cPath, meta, body, resolvedFileBundles);
    }
  }
}


// if the file is run directly, run the main function
if (require.main === module) {
  main();
}

module.exports = { main };
