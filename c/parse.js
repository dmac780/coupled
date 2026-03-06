/**
 * Parse the frontmatter and body from a content string.
 * @param {string} content - The content to parse.
 * @returns {{meta: Record<string, string>, body: string}} - An object with meta and body properties keyed by string.
 */
function parseFrontmatterAndBody(content) {
  const fmMatch = content.match(/^---\s*[\r\n]+([\s\S]*?)^---\s*[\r\n]+/m);

  if (!fmMatch) {
    return { meta: {}, body: content };
  }

  const fmBlock = fmMatch[1];
  const meta = {};

  fmBlock.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  });

  const bodyStart = fmMatch.index + fmMatch[0].length;
  const body = content.slice(bodyStart);

  return { meta, body };
}


/**
 * Extract the assets and HTML from a body string.
 * @param {string} body - The body to extract assets and HTML from.
 * @param {string} sourcePath - The source path of the body.
 * @returns {{mounts: Record<string, {styles: string[], scripts: string[], html: string[]}>, html: string}} - An object with mounts and html properties.
 */
function extractAssetsAndHtml(body, sourcePath) {
  const mounts = {};

  /**
   * Get or create a mount with the given name.
   * @param {string} name - The name of the mount to get or create.
   * @returns {Record<string, {styles: string[], scripts: string[], html: string[]}>} - The mount.
   */
  function getOrCreateMount(name) {
    if (!mounts[name]) {
      mounts[name] = { styles: [], scripts: [], html: [] };
    }
    return mounts[name];
  }

  const ENGINE_ATTRS = ['mount', 'bundle', 'serve', 'destination', 'dest', 'preloadmount', 'preload_mount', 'hydrate'];

  /**
   * Parse the given attributes as passthrough attributes.
   * @param {string} attrs - The attributes to parse.
   * @returns {Record<string, string>} - The parsed attributes.
   */
  function parsePassthroughAttrs(attrs) {
    const out = {};
    const attrRegex = /(\w+)=["']([^"']*)["']/g;
    let m;
    while ((m = attrRegex.exec(attrs)) !== null) {
      const key = m[1].toLowerCase();
      if (!ENGINE_ATTRS.includes(key)) out[m[1]] = m[2];
    }
    const withoutVal = attrs.replace(/(\w+)=["'][^"']*["']/g, '');
    const boolRegex = /\b([a-zA-Z][\w-]*)\b/g;
    while ((m = boolRegex.exec(withoutVal)) !== null) {
      const key = m[1].toLowerCase();
      if (!ENGINE_ATTRS.includes(key) && out[m[1]] === undefined) out[m[1]] = '';
    }
    return out;
  }

  /**
   * Parse the given attributes as serve and destination attributes.
   * @param {string} attrs - The attributes to parse.
   * @returns {Record<string, string>} - The parsed attributes.
   */
  function parseServeDest(attrs) {
    const serveMatch = attrs.match(/\bserve="([^"]+)"/i);
    const destMatch = attrs.match(/\bdestination="([^"]+)"/i) || attrs.match(/\bdest="([^"]+)"/i);
    return {
      serve: (serveMatch ? serveMatch[1] : 'inline').trim().toLowerCase(),
      destination: destMatch ? destMatch[1].trim().replace(/^\/+/, '') : undefined
    };
  }

  const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  let stylesMatch;
  while ((stylesMatch = styleRegex.exec(body)) !== null) {
    const attrs = stylesMatch[1] || '';
    const css = stylesMatch[2] || '';
    const mountMatch = attrs.match(/\bmount="([^"]+)"/i);
    const bundleMatch = attrs.match(/\bbundle="([^"]+)"/i);
    const preloadMountMatch = attrs.match(/\bpreload_mount="([^"]+)"/i) || attrs.match(/\bpreloadmount="([^"]+)"/i);
    const { serve, destination } = parseServeDest(attrs);
    const mountName = mountMatch ? mountMatch[1] : 'head';
    const mount = getOrCreateMount(mountName);
    mount.styles.push({
      content: css.trim(),
      bundle: bundleMatch ? bundleMatch[1] : undefined,
      serve,
      destination: destination || undefined,
      sourcePath: sourcePath || undefined,
      preloadMount: preloadMountMatch ? preloadMountMatch[1].trim() : undefined,
      extraAttrs: parsePassthroughAttrs(attrs)
    });
  }

  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptsMatch;
  while ((scriptsMatch = scriptRegex.exec(body)) !== null) {
    const attrs = scriptsMatch[1] || '';
    const js = scriptsMatch[2] || '';
    const mountMatch = attrs.match(/\bmount="([^"]+)"/i);
    const bundleMatch = attrs.match(/\bbundle="([^"]+)"/i);
    const preloadMountMatch = attrs.match(/\bpreload_mount="([^"]+)"/i) || attrs.match(/\bpreloadmount="([^"]+)"/i);
    const hydrateMatch = attrs.match(/\bhydrate="([^"]+)"/i);
    const { serve, destination } = parseServeDest(attrs);
    const mountName = mountMatch ? mountMatch[1] : 'body';
    const mount = getOrCreateMount(mountName);
    mount.scripts.push({
      content: js.trim(),
      bundle: bundleMatch ? bundleMatch[1] : undefined,
      serve,
      destination: destination || undefined,
      sourcePath: sourcePath || undefined,
      preloadMount: preloadMountMatch ? preloadMountMatch[1].trim() : undefined,
      hydrate: hydrateMatch ? hydrateMatch[1].trim().toLowerCase() : undefined,
      extraAttrs: parsePassthroughAttrs(attrs)
    });
  }

  let html = body.replace(styleRegex, '').replace(scriptRegex, '').trim();

  return { mounts, html };
}

module.exports = {
  parseFrontmatterAndBody,
  extractAssetsAndHtml
};
