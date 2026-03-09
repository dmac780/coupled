const { extractAssetsAndHtml } = require('./parse');
const COMPONENT_ASSETS = {};
const COMPONENT_ASSETS_BY_SLOT = {};
const COMPONENT_HTML   = {};


/**
 * Register a component with the given path, meta data, and body.
 * @param {string} cPath - The component path to register.
 * @param {Record<string, string>} meta - The meta data to register the component with.
 * @param {string} body - The body to register the component with.
 * @returns {void}
 */
function registerComponent(cPath, meta, body) {
  const { mounts, html } = extractAssetsAndHtml(body, cPath);

  if (!meta.MOUNT && !meta.mount) {
    console.warn(`Component ${cPath} is missing 'MOUNT' in frontmatter; its HTML will not be mounted.`);
    return;
  }

  const mountName = String(meta.MOUNT || meta.mount).trim();

  for (const [targetMount, data] of Object.entries(mounts)) {
    if (!COMPONENT_ASSETS[targetMount]) {
      COMPONENT_ASSETS[targetMount] = { styles: [], scripts: [] };
    }
    COMPONENT_ASSETS[targetMount].styles.push(...data.styles);
    COMPONENT_ASSETS[targetMount].scripts.push(...data.scripts);
  }

  if (!COMPONENT_ASSETS_BY_SLOT[mountName]) {
    COMPONENT_ASSETS_BY_SLOT[mountName] = { styles: [], scripts: [] };
  }
  for (const [targetMount, data] of Object.entries(mounts)) {
    for (const s of data.styles) {
      COMPONENT_ASSETS_BY_SLOT[mountName].styles.push({ ...s, targetMount });
    }
    for (const s of data.scripts) {
      COMPONENT_ASSETS_BY_SLOT[mountName].scripts.push({ ...s, targetMount });
    }
  }

  if (!COMPONENT_HTML[mountName]) {
    COMPONENT_HTML[mountName] = [];
  }
  if (html && html.trim()) {
    COMPONENT_HTML[mountName].push(html.trim());
  }
}


/**
 * Get component assets only for mounts that are used on the page (template + body reference them).
 * @param {Set<string>} usedSlots - Set of mount slot names (e.g. hero, footer) that are referenced.
 * @returns {Record<string, {styles: string[], scripts: string[]}>} - Merged assets keyed by target mount (head, body, etc.).
 */
function getComponentAssetsForSlots(usedSlots) {
  const out = {};
  for (const slot of usedSlots) {
    const data = COMPONENT_ASSETS_BY_SLOT[slot];
    if (!data) continue;
    for (const s of data.styles) {
      const m = s.targetMount;
      if (!out[m]) out[m] = { styles: [], scripts: [] };
      const { targetMount, ...rest } = s;
      out[m].styles.push(rest);
    }
    for (const s of data.scripts) {
      const m = s.targetMount;
      if (!out[m]) out[m] = { styles: [], scripts: [] };
      const { targetMount, ...rest } = s;
      out[m].scripts.push(rest);
    }
  }
  return out;
}


/**
 * Get the component HTML.
 * @returns {Record<string, string[]>} - The component HTML.
 */
function getComponentHtml() {
  return COMPONENT_HTML;
}

module.exports = {
  registerComponent,
  getComponentAssetsForSlots,
  getComponentHtml
};
