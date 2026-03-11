const fs = require('fs');
const path = require('path');
const { SRC_DIR, DIST_DIR, ensureDirSync } = require('./paths');
const { parseFrontmatterAndBody, extractAssetsAndHtml } = require('./parse');
const { renderTemplate } = require('./template');
const { getComponentAssetsForSlots, getComponentHtml } = require('./components');


const MOUNT_REF_RE = /\{\{MOUNT\.([a-zA-Z0-9_-]+)(?::[^}]*)?\}\}/g;

/**
 * Extract mount slot names from a string (e.g. {{MOUNT.hero}} or {{MOUNT.hero:var}}).
 * @param {string} text - Text to scan.
 * @returns {Set<string>} - Set of slot names found.
 */
function getMountNamesFromText(text) {
  const used = new Set();
  if (!text) return used;
  let m;
  const re = new RegExp(MOUNT_REF_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    used.add(m[1]);
  }
  return used;
}

/**
 * Find mount slot names referenced in template or page body (e.g. {{MOUNT.hero}} or {{MOUNT.hero:var}}).
 * @param {string} templateSource - The template source.
 * @param {string} body - The page body (content).
 * @returns {Set<string>} - Set of slot names that are used.
 */
function getUsedMountSlots(templateSource, body) {
  const text = (templateSource || '') + '\n' + (body || '');
  return getMountNamesFromText(text);
}

/**
 * Expand usedSlots to include any mount names referenced inside component HTML (nested mounts / "mountception").
 * @param {Set<string>} usedSlots - Initial set of slot names (from page template + body).
 * @param {Record<string, string[]>} componentHtml - COMPONENT_HTML from getComponentHtml().
 * @returns {Set<string>} - Expanded set including nested refs (same Set, mutated).
 */
function expandUsedSlots(usedSlots, componentHtml) {
  let added;
  do {
    added = 0;
    for (const slot of usedSlots) {
      const htmlList = componentHtml[slot];
      if (!htmlList) continue;
      const combined = htmlList.join('\n');
      for (const name of getMountNamesFromText(combined)) {
        if (!usedSlots.has(name)) {
          usedSlots.add(name);
          added++;
        }
      }
    }
  } while (added > 0);
  return usedSlots;
}


/**
 * Resolve the template path for a given component path and meta data.
 * @param {string} cPath - The component path to resolve the template path for.
 * @param {Record<string, string>} meta - The meta data to resolve the template path for.
 * @returns {string} - The resolved template path.
 */
function resolveTemplatePath(cPath, meta) {
  const dir = path.dirname(cPath);
  const base = path.basename(cPath, '.c.html');

  let requestedPath;

  if (meta.TEMPLATE || meta.template) {
    const spec = String(meta.TEMPLATE || meta.template).trim();
    const rel = spec.replace(/^\/+/, '');
    requestedPath = path.join(SRC_DIR, rel);
  } else {
    requestedPath = path.join(dir, `${base}.t.html`);
  }

  if (fs.existsSync(requestedPath)) {
    return requestedPath;
  }

  console.warn(
    `Template not found for ${cPath}. Expected "${requestedPath}". Skipping page.`
  );
  return null;
}


/**
 * Get the merged mounts for a given page path. Only includes component assets for mounts that are referenced in the page's template or body.
 * @param {string} cPath - The page path to get the merged mounts for.
 * @returns {Record<string, {styles: string[], scripts: string[], html: string[]}>} - The merged mounts.
 */
function getMergedMountsForPage(cPath) {
  const source = fs.readFileSync(cPath, 'utf8');
  const { meta, body } = parseFrontmatterAndBody(source);

  if ((meta.TYPE || meta.type || 'page').trim() === 'component') {
    return null;
  }

  const templatePath = resolveTemplatePath(cPath, meta);
  const templateSource = templatePath && fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';
  const usedSlots = expandUsedSlots(getUsedMountSlots(templateSource, body), getComponentHtml());
  const componentAssetsForPage = getComponentAssetsForSlots(usedSlots);

  const { mounts } = extractAssetsAndHtml(body, cPath);
  const COMPONENT_HTML = getComponentHtml();
  const merged = {};

  // Merge only the component assets for mounts used on this page
  for (const [name, data] of Object.entries(componentAssetsForPage)) {
    if (!merged[name]) {
      merged[name] = { styles: [], scripts: [], html: [] };
    }
    merged[name].styles.push(...data.styles);
    merged[name].scripts.push(...data.scripts);
  }

  // Merge the page mounts
  for (const [name, data] of Object.entries(mounts)) {
    if (!merged[name]) {
      merged[name] = { styles: [], scripts: [], html: [] };
    }
    merged[name].styles.push(...data.styles);
    merged[name].scripts.push(...data.scripts);
    merged[name].html.push(...data.html);
  }

  // Merge the component HTML only for used slots
  for (const slot of usedSlots) {
    const htmlList = COMPONENT_HTML[slot];
    if (!htmlList) continue;
    if (!merged[slot]) {
      merged[slot] = { styles: [], scripts: [], html: [] };
    }
    merged[slot].html.push(...htmlList);
  }

  return merged;
}


/**
 * Process a page file with the given path, meta data, body, and resolved file bundles.
 * @param {string} cPath - The page path to process.
 * @param {Record<string, string>} meta - The meta data to process the page with.
 * @param {string} body - The body to process the page with.
 * @param {Record<string, {path: string, attrs: Record<string, string>}>} resolvedFileBundles - The resolved file bundles to process the page with.
 * @returns {void}
 */
/**
 * Normalize base path from env for subpath deployment (e.g. GitHub Pages at /coupled/).
 * @returns {string} - '' for root, or '/coupled/' (leading + trailing slash).
 */
function getBasePath() {
  const raw = process.env.BASE_PATH || process.env.BASE_URL || '';
  if (!raw || !String(raw).trim()) return '/';
  let p = String(raw).trim().replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p += '/';
  return p;
}

function processPageFile(cPath, meta, body, resolvedFileBundles) {
  const dir  = path.dirname(cPath);
  const base = path.basename(cPath, '.c.html');

  resolvedFileBundles = resolvedFileBundles || {};

  const templatePath = resolveTemplatePath(cPath, meta);
  if (!templatePath) {
    return;
  }

  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const { mounts: pageMounts, html } = extractAssetsAndHtml(body, cPath);
  const usedSlots = expandUsedSlots(getUsedMountSlots(templateSource, body), getComponentHtml());
  const componentAssetsForPage = getComponentAssetsForSlots(usedSlots);
  const COMPONENT_HTML = getComponentHtml();

  for (const [name, data] of Object.entries(componentAssetsForPage)) {
    if (!pageMounts[name]) {
      pageMounts[name] = { styles: [], scripts: [], html: [] };
    }
    pageMounts[name].styles.push(...data.styles);
    pageMounts[name].scripts.push(...data.scripts);
  }

  for (const slot of usedSlots) {
    const htmlList = COMPONENT_HTML[slot];
    if (!htmlList) continue;
    if (!pageMounts[slot]) {
      pageMounts[slot] = { styles: [], scripts: [], html: [] };
    }
    pageMounts[slot].html.push(...htmlList);
  }

  if (meta.MOUNT || meta.mount) {
    const mountName = String(meta.MOUNT || meta.mount).trim();
    if (!pageMounts[mountName]) {
      pageMounts[mountName] = { styles: [], scripts: [], html: [] };
    }
    if (html && html.trim()) {
      pageMounts[mountName].html.push(html.trim());
    }
  }

  const relDir = path.relative(SRC_DIR, dir);
  const outRelDir = relDir.split(path.sep).filter((segment) => !segment.startsWith('_')).join(path.sep);
  const outDir = path.join(DIST_DIR, outRelDir);

  ensureDirSync(outDir);

  let finalHtml = renderTemplate(templateSource, meta, html, pageMounts, outDir, resolvedFileBundles);

  const basePath = getBasePath();
  if (basePath !== '/') {
    finalHtml = finalHtml.replace(/href="\//g, 'href="' + basePath);
    finalHtml = finalHtml.replace(/src="\//g, 'src="' + basePath);
  }

  const dirName = path.basename(dir);
  const outFileName = base === dirName ? 'index.html' : `${base}.html`;
  const outPath = path.join(outDir, outFileName);
  
  fs.writeFileSync(outPath, finalHtml, 'utf8');
  console.log(`Built ${outPath}`);
}

module.exports = {
  resolveTemplatePath,
  getMergedMountsForPage,
  processPageFile
};
