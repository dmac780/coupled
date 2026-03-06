const path = require('path');
const { DIST_DIR } = require('./paths');
const { minifyCSS, minifyJS, wrapHydrate } = require('./bundles');


/**
 * Escape the given string for use in a regular expression.
 * @param {string} string - The string to escape.
 * @returns {string} - The escaped string.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Render the template with the given meta, main HTML, mounts, and resolved file bundles.
 * @param {string} templateSource - The template source to render.
 * @param {Record<string, string>} meta - The meta data to render the template with.
 * @param {string} mainHtml - The main HTML to render the template with.
 * @param {Record<string, {styles: string[], scripts: string[], html: string[]}>} mounts - The mounts to render the template with.
 * @param {string} outDir - The output directory to render the template to.
 * @param {Record<string, {path: string, attrs: Record<string, string>}>} resolvedFileBundles - The resolved file bundles to render the template with.
 * @returns {string} - The rendered template.
 */
function renderTemplate(templateSource, meta, mainHtml, mounts, outDir, resolvedFileBundles) {
  let output = templateSource;
  resolvedFileBundles = resolvedFileBundles || {};
  outDir = outDir || DIST_DIR;

  const vars = {};
  for (const [key, value] of Object.entries(meta)) {
    vars[key] = value;
  }

  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp('\\{\\{' + escapeRegExp(key) + '\\}\\}', 'g');
    output = output.replace(re, String(value));
  }

  /**
   * Replace the given variables in the given string with the given context.
   * @param {string} str - The string to replace the variables in.
   * @param {Record<string, string>} context - The context to replace the variables with.
   * @returns {string} - The replaced string.
   */
  function replaceVars(str, context) {
    let out = str;
    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) continue;
      const re = new RegExp('\\{\\{' + escapeRegExp(key) + '\\}\\}', 'g');
      out = out.replace(re, String(value));
    }
    return out;
  }


  /**
   * Expand the given string with the given variables.
   * @param {string} str - The string to expand.
   * @param {Record<string, string>} vars - The variables to expand the string with.
   * @returns {string} - The expanded string.
   */
  function expandForeach(str, vars) {
    const foreachRegex = /\{\{foreach\s+(\w+)\}\}((?:(?!\{\{foreach\s)[\s\S])*?)\{\{\/foreach\}\}/g;
    let out = str;
    let prev = '';
    while (prev !== out) {
      prev = out;
      out = out.replace(foreachRegex, (match, varName, body) => {
        let arr = vars[varName];
        if (typeof arr === 'string') {
          try {
            arr = JSON.parse(arr);
          } catch (_) {
            arr = arr.split(',').map((s) => s.trim());
          }
        }
        if (!Array.isArray(arr)) return '';
        const parts = [];
        arr.forEach((el, i) => {
          const ctx = { ...vars, item: el, index: i };
          let bodyOut = body;
          if (el !== null && typeof el === 'object') {
            for (const [k, v] of Object.entries(el)) {
              const re = new RegExp('\\{\\{item\\.' + escapeRegExp(k) + '\\}\\}', 'g');
              bodyOut = bodyOut.replace(re, String(v != null ? v : ''));
            }
          }
          bodyOut = bodyOut.replace(/\{\{item\}\}/g, el !== null && typeof el === 'object' ? JSON.stringify(el) : String(el));
          bodyOut = bodyOut.replace(/\{\{index\}\}/g, String(i));
          parts.push(replaceVars(bodyOut, ctx));
        });
        return parts.join('');
      });
    }
    return out;
  }


  /**
   * Evaluate the given conditional string with the given context.
   * @param {string} str - The string to evaluate.
   * @param {Record<string, string>} context - The context to evaluate the string with.
   * @returns {string} - The evaluated string.
   */
  function evalConditionals(str, context) {
    const innerCondRegex = /\{\{if\s+(!?)(\w+)\}\}((?:(?!\{\{if\s)[\s\S])*?)\{\{\/if\}\}/g;
    let out = str;
    let prev = '';
    while (prev !== out) {
      prev = out;
      out = out.replace(innerCondRegex, (match, negate, varName, content) => {
        const truthy = context[varName] != null && context[varName] !== '';
        const showBlock = negate === '!' ? !truthy : truthy;
        const hasElse = content.includes('{{else}}');
        if (hasElse) {
          const [ifBlock, elseBlock] = content.split('{{else}}');
          return showBlock ? ifBlock : elseBlock;
        }
        return showBlock ? content : '';
      });
    }
    return out;
  }

  output = evalConditionals(output, vars);

  const scriptBundlesOnPage = new Set();
  const styleBundlesOnPage = new Set();
  for (const data of Object.values(mounts)) {
    for (const s of data.scripts || []) {
      if (s.bundle) scriptBundlesOnPage.add(s.bundle);
    }
    for (const s of data.styles || []) {
      if (s.bundle) styleBundlesOnPage.add(s.bundle);
    }
  }
  const linksByMount = {};
  for (const [key, fileRef] of Object.entries(resolvedFileBundles)) {
    if (!fileRef.preloadMount) continue;
    const href = path.relative(outDir, path.join(DIST_DIR, fileRef.path)).replace(/\\/g, '/');
    const quotedHref = href.replace(/"/g, '&quot;');
    const mountName = fileRef.preloadMount;
    if (!linksByMount[mountName]) linksByMount[mountName] = [];
    if (key.startsWith('script:')) {
      const bundleKey = key.slice('script:'.length);
      if (!scriptBundlesOnPage.has(bundleKey)) continue;
      const passthrough = fileRef.attrs || {};
      const wantsPreload = passthrough.rel === 'modulepreload' || passthrough.preload !== undefined;
      if (!wantsPreload) continue;
      linksByMount[mountName].push(`<link rel="modulepreload" href="${quotedHref}">`);
    } else if (key.startsWith('style:')) {
      const bundleKey = key.slice('style:'.length);
      if (!styleBundlesOnPage.has(bundleKey)) continue;
      linksByMount[mountName].push(`<link rel="preload" href="${quotedHref}" as="style">`);
    }
  }

  
  /**
   * Emit the given items as bundled content.
   * @param {string[]} items - The items to emit.
   * @param {string} tag - The tag to emit the items as.
   * @returns {string} - The emitted content.
   */
  function emitBundled(items, tag) {
    const minify = tag === 'style' ? minifyCSS : minifyJS;
    const byBundle = {};
    for (const item of items) {
      const content = typeof item === 'string' ? item : item.content;
      const bundle = typeof item === 'string' ? undefined : item.bundle;
      const key = (bundle != null && bundle !== '') ? bundle : '';
      if (!byBundle[key]) byBundle[key] = [];
      if (tag === 'script') byBundle[key].push({ content: minify(content), hydrate: item.hydrate });
      else byBundle[key].push(minify(content));
    }
    let out = '';
    for (const [bundleKey, contents] of Object.entries(byBundle)) {
      const fileRef = bundleKey !== '' ? resolvedFileBundles[tag + ':' + bundleKey] : null;
      if (fileRef) {
        const href = path.relative(outDir, path.join(DIST_DIR, fileRef.path)).replace(/\\/g, '/');
        const passthrough = fileRef.attrs || {};
        const attrsObj = tag === 'style'
          ? { href, rel: 'stylesheet', ...passthrough }
          : (() => {
              const { rel, preload, hydrate, ...rest } = passthrough;
              return { src: href, ...rest };
            })();
        const attrsStr = Object.entries(attrsObj)
          .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
          .join(' ');
        if (tag === 'style') {
          out += `<link ${attrsStr}>`;
        } else {
          const emitModulepreload = (passthrough.rel === 'modulepreload' || passthrough.preload !== undefined) && !fileRef.preloadMount;
          if (emitModulepreload) out += `<link rel="modulepreload" href="${href.replace(/"/g, '&quot;')}">\n`;
          out += `<script ${attrsStr}></script>`;
        }
      } else {
        if (bundleKey === '') {
          for (const entry of contents) {
            const c = tag === 'script' ? entry.content : entry;
            const hydrate = tag === 'script' ? entry.hydrate : undefined;
            const code = tag === 'script' && hydrate ? wrapHydrate(c, hydrate) : c;
            if (code.trim()) out += `<${tag}>${code}</${tag}>`;
          }
        } else {
          const combined = tag === 'script' ? contents.map((x) => x.content).join('') : contents.join('');
          const hydrate = tag === 'script' && contents.length ? contents[0].hydrate : undefined;
          const code = tag === 'script' && hydrate ? wrapHydrate(combined, hydrate) : combined;
          if (code.trim()) out += `<${tag}>${code}</${tag}>`;
        }
      }
    }
    return out;
  }

  const rawMountHtml = {};
  for (const [name, data] of Object.entries(mounts)) {
    let mountHtml = '';
    if (linksByMount[name] && linksByMount[name].length) {
      mountHtml += linksByMount[name].join('\n');
    }
    if (data.html && data.html.length) {
      mountHtml += (mountHtml ? '\n' : '') + data.html.join('\n');
    }
    if (data.styles.length) {
      mountHtml += (mountHtml ? '\n' : '') + emitBundled(data.styles, 'style');
    }
    if (data.scripts.length) {
      mountHtml += (mountHtml ? '\n' : '') + emitBundled(data.scripts, 'script');
    }
    mountHtml = evalConditionals(mountHtml, vars);
    rawMountHtml[name] = mountHtml;
  }


  /**
   * Parse the given CSV string into an array of variable names.
   * @param {string} csv - The CSV string to parse.
   * @returns {string[]} - The array of variable names.
   */
  function parseMountVars(csv) {
    if (!csv || !String(csv).trim()) return [];
    return String(csv).split(',').map((s) => s.trim()).filter(Boolean);
  }


  /**
   * Inject the given variable names into the given mount content.
   * @param {string} mountContent - The mount content to inject the variable names into.
   * @param {string[]} varNames - The variable names to inject.
   * @param {Record<string, string>} evalVars - The variables to evaluate.
   * @returns {string} - The injected mount content.
   */
  function injectMountVars(mountContent, varNames, evalVars) {
    let out = mountContent;
    for (const n of varNames) {
      const val = evalVars[n] != null ? String(evalVars[n]) : '';
      const esc = escapeRegExp(n);
      out = out.replace(new RegExp('@@' + esc + '\\b', 'g'), val);
      out = out.replace(new RegExp('\\{\\{' + esc + '\\}\\}', 'g'), val);
    }
    return evalConditionals(out, evalVars);
  }

  const expandedMountHtml = { ...rawMountHtml };
  for (let iter = 0; iter < 5; iter++) {
    for (const name of Object.keys(expandedMountHtml)) {
      let s = expandedMountHtml[name];
      for (const other of Object.keys(mounts)) {
        const reWithVar = new RegExp('\\{\\{MOUNT\\.' + escapeRegExp(other) + ':([^}]*)\\}\\}', 'g');
        s = s.replace(reWithVar, (match, csv) => {
          let mountContent = expandedMountHtml[other] || '';
          const varNames = parseMountVars(csv);
          if (varNames.length === 0) {
            mountContent = mountContent.replace(/@@value/g, '');
            mountContent = mountContent.replace(/\{\{value\}\}/g, '');
            return evalConditionals(mountContent, { value: '' });
          }
          const context = {};
          for (const n of varNames) context[n] = vars[n] != null ? String(vars[n]) : '';
          return injectMountVars(mountContent, varNames, context);
        });
        const re = new RegExp('\\{\\{MOUNT\\.' + escapeRegExp(other) + '\\}\\}', 'g');
        s = s.replace(re, () => {
          let mountContent = expandedMountHtml[other] || '';
          mountContent = mountContent.replace(/@@value/g, '');
          mountContent = mountContent.replace(/\{\{value\}\}/g, '');
          mountContent = evalConditionals(mountContent, { value: '' });
          return mountContent;
        });
      }
      expandedMountHtml[name] = s;
    }
  }

  for (const [name, mountHtml] of Object.entries(expandedMountHtml)) {
    const reWithVar = new RegExp('\\{\\{MOUNT\\.' + escapeRegExp(name) + ':([^}]*)\\}\\}', 'g');
    output = output.replace(reWithVar, (match, csv) => {
      let content = mountHtml;
      const varNames = parseMountVars(csv);
      if (varNames.length === 0) {
        content = content.replace(/@@value/g, '');
        content = content.replace(/\{\{value\}\}/g, '');
        return evalConditionals(content, { value: '' });
      }
      const context = {};
      for (const n of varNames) context[n] = vars[n] != null ? String(vars[n]) : '';
      return injectMountVars(content, varNames, context);
    });
    const re = new RegExp('\\{\\{MOUNT\\.' + escapeRegExp(name) + '\\}\\}', 'g');
    output = output.replace(re, () => {
      let content = mountHtml;
      content = content.replace(/@@value/g, '');
      content = content.replace(/\{\{value\}\}/g, '');
      content = evalConditionals(content, { value: '' });
      return content;
    });
  }

  output = expandForeach(output, vars);
  output = output.replace(/\{\{MOUNT\.[^}]+}}/g, '');

  return output;
}

module.exports = { renderTemplate };
