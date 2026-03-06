const fs = require('fs');
const path = require('path');
const { DIST_DIR, SRC_DIR, ensureDirSync } = require('./paths');


/**
 * Get the next available path for a given absolute path.
 * @param {string} absPath - The absolute path to get the next available path for.
 * @returns {string} - The next available path.
 */
function nextAvailablePath(absPath) {
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const base = path.basename(absPath, ext);
  let n = 0;
  let candidate = absPath;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, base + '_' + n + ext);
    n++;
  }
  return candidate;
}

  
/**
 * Minify the given CSS string.
 * @param {string} css - The CSS string to minify.
 * @returns {string} - The minified CSS string.
 */
function minifyCSS(css) {
  if (typeof css !== 'string') return css;
  let s = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}


/**
 * Minify the given JavaScript string.
 * @param {string} js - The JavaScript string to minify.
 * @returns {string} - The minified JavaScript string.
 */
function minifyJS(js) {
  if (typeof js !== 'string') return js;
  const len = js.length;
  let out = '';
  let i = 0;
  let inWS = false;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inBlockComment = false;
  let inLineComment = false;

  while (i < len) {
    const c = js[i];
    const next = js[i + 1];

    if (inLineComment) {
      if (c === '\n' || c === '\r') {
        inLineComment = false;
        inWS = true;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      out += c;
      if (c === '\\') { out += js[i + 1] || ''; i++; }
      else if (c === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      out += c;
      if (c === '\\') { out += js[i + 1] || ''; i++; }
      else if (c === '"') inDouble = false;
      i++;
      continue;
    }
    if (inTemplate) {
      out += c;
      if (c === '\\') { out += js[i + 1] || ''; i++; }
      else if (c === '`') inTemplate = false;
      else if (c === '$' && next === '{') { out += next; i++; }
      i++;
      continue;
    }

    if (c === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      out += c;
      inSingle = true;
      i++;
      continue;
    }
    if (c === '"') {
      out += c;
      inDouble = true;
      i++;
      continue;
    }
    if (c === '`') {
      out += c;
      inTemplate = true;
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      if (!inWS) out += ' ';
      inWS = true;
      i++;
      continue;
    }
    inWS = false;
    out += c;
    i++;
  }
  return out.trim();
}

/**
 * Wrap the given code with a hydration function.
 * @param {string} code - The code to wrap with a hydration function.
 * @param {string} event - The event to wrap the code with.
 * @returns {string} - The wrapped code.
 */
function wrapHydrate(code, event) {
  const e = (event || '').toLowerCase().trim();
  if (!e || e === 'immediate') return code;
  const run = 'var __run=function(){' + code + '};';
  if (e === 'idle') {
    return "(function(){" + run + "if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(__run,{timeout:2e3});}else{setTimeout(__run,1);}})();";
  }
  if (e === 'load') {
    return "(function(){" + run + "if(document.readyState==='complete')setTimeout(__run,0);else window.addEventListener('load',__run);})();";
  }
  if (e === 'visible' || e.startsWith('visible:')) {
    const sel = e === 'visible' ? '' : e.replace('visible:', '').trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const selector = sel ? "document.querySelector('" + sel + "')" : 'document.body';
    return "(function(){" + run + "var once=function(entries){var e=entries[0];if(e&&e.isIntersecting){__run();ob.disconnect();}};var ob=new IntersectionObserver(once,{root:null,threshold:0});var start=function(){var el=" + selector + ";if(el){ob.observe(el);}else{window.addEventListener('DOMContentLoaded',start);}};if(document.readyState==='loading'){window.addEventListener('DOMContentLoaded',start);}else{start();}})();";
  }
  return code;
}


/**
 * Resolve file bundles from collected styles and scripts; write bundle files and return path map.
 * @param {Array} allStyles - Array of style items (each with content, bundle, serve, destination, sourcePath, extraAttrs).
 * @param {Array} allScripts - Array of script items (each with content, bundle, serve, destination, sourcePath, preloadMount, hydrate, extraAttrs).
 * @returns {Record<string, {path: string, attrs: Record<string, string>, preloadMount?: string}>} - Resolved refs keyed by 'style:bundleKey' / 'script:bundleKey'.
 */
function resolveFileBundles(allStyles, allScripts) {
  const styleByBundle = {};
  const scriptByBundle = {};
  for (const item of allStyles) {
    const key = (item.bundle != null && item.bundle !== '') ? item.bundle : '\0none';
    if (!styleByBundle[key]) styleByBundle[key] = [];
    styleByBundle[key].push(item);
  }
  for (const item of allScripts) {
    const key = (item.bundle != null && item.bundle !== '') ? item.bundle : '\0none';
    if (!scriptByBundle[key]) scriptByBundle[key] = [];
    scriptByBundle[key].push(item);
  }
  const resolved = {};

  function resolveBundle(tag, byBundle, ext) {
    for (const [bundleKey, items] of Object.entries(byBundle)) {
      if (bundleKey === '\0none') continue;
      const serves = [...new Set(items.map((i) => i.serve))];
      if (serves.length > 1) {
        const sources = [...new Set(items.map((i) => i.sourcePath).filter(Boolean))];
        console.warn(
          `[coupled] Bundle "${bundleKey}" has mixed serve (${serves.join(', ')}). Using inline. Sources: ${sources.join(', ')}`
        );
        continue;
      }
      if (serves[0] !== 'file') continue;
      const definedDests = [...new Set(items.map((i) => i.destination).filter((d) => d != null && d !== ''))];
      if (definedDests.length > 1) {
        const sources = [...new Set(items.map((i) => i.sourcePath).filter(Boolean))];
        console.warn(
          `[coupled] Bundle "${bundleKey}" has mixed destination. Using inline. Sources: ${sources.join(', ')}`
        );
        continue;
      }
      const dest = definedDests.length === 1 ? definedDests[0] : undefined;
      const minify = tag === 'style' ? minifyCSS : minifyJS;
      const content = items.map((i) => i.content).map(minify).join('');
      if (!content.trim()) continue;
      let outPathRel;
      let outPathAbs;
      if (dest) {
        outPathRel = path.join(dest, bundleKey + ext).replace(/\\/g, '/');
        outPathAbs = path.join(DIST_DIR, dest, bundleKey + ext);
      } else {
        outPathRel = bundleKey + ext;
        outPathAbs = path.join(DIST_DIR, outPathRel);
        console.warn(
          `[coupled] File created at dist root (missing destination) for serve=file bundle "${bundleKey}".`
        );
      }
      ensureDirSync(path.dirname(outPathAbs));
      let useSrcFile = null;
      if (dest && dest.split(/[/\\]/)[0] === 'static') {
        const parts = dest.split(/[/\\]/).filter(Boolean).slice(1);
        const srcFile = path.join(SRC_DIR, 'static', ...parts, bundleKey + ext);
        if (fs.existsSync(srcFile) && fs.statSync(srcFile).isFile()) {
          useSrcFile = srcFile;
        }
      }
      const finalPathAbs = nextAvailablePath(outPathAbs);
      const finalPathRel = path.relative(DIST_DIR, finalPathAbs).replace(/\\/g, '/');
      const firstItem = items[0];
      let toWrite = content;
      if (tag === 'script' && firstItem && firstItem.hydrate && !useSrcFile) toWrite = wrapHydrate(content, firstItem.hydrate);
      if (useSrcFile) {
        fs.copyFileSync(useSrcFile, finalPathAbs);
      } else {
        fs.writeFileSync(finalPathAbs, toWrite, 'utf8');
      }
      const ref = {
        path: finalPathRel,
        attrs: (firstItem && firstItem.extraAttrs) ? { ...firstItem.extraAttrs } : {}
      };
      if (firstItem && firstItem.preloadMount) ref.preloadMount = firstItem.preloadMount;
      resolved[tag + ':' + bundleKey] = ref;
    }
  }
  resolveBundle('style', styleByBundle, '.css');
  resolveBundle('script', scriptByBundle, '.js');
  return resolved;
}

module.exports = {
  resolveFileBundles,
  minifyCSS,
  minifyJS,
  wrapHydrate
};
