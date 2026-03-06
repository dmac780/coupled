const { extractAssetsAndHtml } = require('./parse');
const COMPONENT_ASSETS = {};
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

  for (const [name, data] of Object.entries(mounts)) {
    if (!COMPONENT_ASSETS[name]) {
      COMPONENT_ASSETS[name] = { styles: [], scripts: [] };
    }
    COMPONENT_ASSETS[name].styles.push(...data.styles);
    COMPONENT_ASSETS[name].scripts.push(...data.scripts);
  }

  if (!meta.MOUNT && !meta.mount) {
    console.warn(`Component ${cPath} is missing 'MOUNT' in frontmatter; its HTML will not be mounted.`);
    return;
  }

  const mountName = String(meta.MOUNT || meta.mount).trim();
  if (!COMPONENT_HTML[mountName]) {
    COMPONENT_HTML[mountName] = [];
  }
  if (html && html.trim()) {
    COMPONENT_HTML[mountName].push(html.trim());
  }
}


/**
 * Get the component assets.
 * @returns {Record<string, {styles: string[], scripts: string[]}>} - The component assets.
 */
function getComponentAssets() {
  return COMPONENT_ASSETS;
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
  getComponentAssets,
  getComponentHtml
};
