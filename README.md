# Coupled

## What this is

You put your HTML, CSS, and JS in one file. The build automatically moves styles, scripts, and html to the right places based on your configuration. It’s modular and native-component friendly. Reusable chunks, conditionals, and passing data into mounts. Inspired by atomic build processes, it uses attributes and props to drive the build so each component can keep its markup, styles, and scripts in one file—and you always know how and when they run.

You can preload scripts or place them to free the critical path, and you can hydrate on events:
-  **idle** (when the thread is free)
- **visible** (when an element or the page is in the viewport)
- **load** (when the page has loaded). The build can inline CSS/JS or write them to bundled files. One small Node script, no npm install.

Pages and reusable bits live in `.c.html` files: you designate where each style and script goes (which mount) and whether it’s inline or bundled to a file. 

Layouts live in `.t.html` templates. Template files are not emitted as pages; they are run through by the build so each page gets an HTML skeleton with variables and mount slots filled in.

You can define a c.html file as type: component, or type: page. Pages require a template file to process through, and components can be placed anywhere including template files or other components. Arguments can be passed into mounts for compoennts changing values per page they are places, along with conditional logic for templating.

---

### example directory: 
```
node_modules/
dist/
|_index.html
src/
|_ index.c.html
|_ index.t.html
```

### index.t.html - Template File
```
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    {{MOUNT.head}}
</head>
<body>
    {{MOUNT.content}}
    {{MOUNT.body}}
</body>
</html>
```

### index.c.html - Coupled File
```
---
title: Home
TYPE: page
MOUNT: content
TEMPLATE: index.t.html
---
<style mount="head" serve="inline">
.component {
  background-color: #222;
  color: #d1d1d1;
  padding: 20px;
}
</style>

// your HTML goes here
<div class="component">
  <h1>Hello World</h1>
</div>

// your JS scripts live in the same file!
<script mount="body" 
        serve="file" 
        bundle="main" 
        destination="static/js" 
        type="module" 
        preload 
        preload_mount="head">
  console.log('index scripts loaded');
</script>
```
That's a HTML file with a inline style tag, inline script, and HTML! that's a big no no in normal HTML development. but with coupled build process you split everything and optionally bundle scripts/styles together to serve multiple components or pages, very logical and keeps styles where they need to be for development.

The above `index.c.html` example tells the build process to move the styles defined in the file into the `{{MOUNT.head}}` as inlined styles (automatically minified), while instructing the script to create a file under `static/js/` directory preload in the head with a rel="modulepreload" while including the script on the page mounted to the `{{MOUNT.body}}` mount.

This outputs pure HTML:
```

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home</title>
    <link rel="modulepreload" href="static/js/main.js">
    <style>.component{background-color:#222;color:#d1d1d1;padding:20px;}</style>
</head>
<body>
    <div class="component">
        <h1>Hello World</h1>
    </div>
    <script src="static/js/main.js" type="module"></script>
</body>
</html>
```

very clean and just as you expect it to be. You don't have to worry about duplicate scripts or styles from including multiple components or pages as duplicates are removed during build process.



## File types

**`.c.html` (coupled file)**  
YAML frontmatter between `---` then HTML. The file can contain `<style>` and `<script>`; use attributes such as `mount`, `serve`, `bundle`, and `destination` on those tags. Set `TYPE: page` so the file is treated as a page and its path becomes a URL under `dist/`. Set `TYPE: component` when the file is not a page: it has no URL and only fills the mount slots that pages or the template reference. You can use components inside pages or inside the template: in the template you write `{{MOUNT.slotName}}` (e.g. `{{MOUNT.nav}}`) and in a page body you write `{{MOUNT.slotName}}` or `{{MOUNT.slotName:var}}` (e.g. `{{MOUNT.hero:heroTitle}}`). Components can themselves include other components by using `{{MOUNT.otherSlot}}` in their HTML.

**`.t.html` (template)**  
An HTML skeleton with placeholders like `{{title}}` and `{{MOUNT.slotName}}`. It is not emitted as its own page. Each page chooses its template in frontmatter with `TEMPLATE: layout.t.html` (or a path like `_templates/layout.t.html`). Any number of page `.c.html` files can use the same template file; the build runs each page through that template and outputs one HTML file per page.

**`src/static/`**  
Copied as-is to `dist/static/`. Put images, fonts, or global CSS here and link to them from the template.

**Folders whose name starts with `_`**  
That path segment is omitted in `dist/`. For example `src/_stuff/foo.c.html` becomes `dist/foo.html`. Use this for shared layouts or components, or any directory you do not want reflected in the output path.

**`c/build.js`**  
The build script. Run with `node c/build.js`. No npm install.

---

## Concepts

**Frontmatter**  
YAML at the top of a `.c.html` file. System keys are all caps: `MOUNT` (which slot receives this file’s body), `TYPE` (page or component), `TEMPLATE` (which `.t.html` wraps the page). Any other keys (e.g. `title`, `heroTitle`) are your own and are available as `{{key}}` in the template and when passing into mounts.

**Mounts**  
Named slots. On `<style>` and `<script>` you set `mount="head"` or `mount="body"` (or any name). In the template you have `{{MOUNT.head}}`, `{{MOUNT.content}}`, `{{MOUNT.body}}`, and any other slot names you use. The body HTML of a page or component goes into the slot specified by `MOUNT:` in frontmatter. The build merges everything that targets a given slot into one place and does not emit duplicate style or script blocks.

**Passing variables into a mount**  
`{{MOUNT.hero}}` inserts the hero slot’s HTML. `{{MOUNT.hero:heroTitle}}` does the same but passes a variable: the component can use `@@heroTitle` or `{{heroTitle}}` and `{{if heroTitle}}...{{else}}...{{/if}}`. For several values use something like `{{MOUNT.card:title,description}}` and in the component use `@@title`, `@@description`, and conditionals on those names.

**Bundles**  
With `serve="inline"` (the default) each `<style>` or `<script>` is emitted inline in place. With `serve="file"` and a `bundle="main"` (or any name), all blocks that share that bundle name are merged into one file. You only need one `destination` per bundle (e.g. `destination="static/css"`); if no block in the bundle specifies it, the file is written at the dist root and the build warns. Duplicate blocks are not emitted; each block is included once.

**Preload**  
On a script that has `serve="file"` and `type="module"` you can add `preload` and `preload_mount="head"` (or another head mount). The build then emits `<link rel="modulepreload" href="...">` in that mount. Only pages that actually use that script bundle get the link.

**Hydration**  
Use `hydrate="load"`, `hydrate="idle"`, `hydrate="visible"`, or `hydrate="visible:#id"` to control when the script runs. If you omit the attribute, the script runs immediately.

---

## Examples (small .c.html snippets)

### Bundles: inline vs file

Inline style, bundled script:

```
---
TYPE: page
MOUNT: content
TEMPLATE: layout.t.html
---
<style mount="head" serve="inline">
  .box { padding: 1rem; }
</style>

<script mount="body" serve="file" bundle="main" destination="static/js">
  console.log('bundled');
</script>
```

The build groups style and script blocks by bundle name only. Every block that has the same `bundle="main"` (and `serve="file"`) is merged into one output file. You do not need to repeat `destination` on every block: the engine only needs one destination definition per bundle. If one block has `destination="static/js"` and another block with the same bundle omits it, the build uses that one destination. If no block in the bundle specifies `destination`, the file is written at the dist root (e.g. `main.js` in `dist/`), and the build prints a warning. If two blocks in the same bundle specify different destinations (e.g. one `static/js` and one `assets/js`), that is a conflict: the build falls back to inlining and warns. Same rules for styles. A different bundle name (e.g. `bundle="components"`) produces a separate file.

### MOUNT with a variable (component receives value)

Page passes a value; component uses it and has a fallback:

```
---
title: Home
heroTitle: Welcome
TYPE: page
MOUNT: content
TEMPLATE: layout.t.html
---
{{MOUNT.hero:heroTitle}}

<div>...</div>
```

Component (e.g. `hero.c.html`):

```
---
TYPE: component
MOUNT: hero
---
<div class="hero">
  {{if heroTitle}}
    <h1>@@heroTitle</h1>
  {{else}}
    <h1>Default title</h1>
  {{/if}}
</div>
```

Same variable name in both: `heroTitle` in frontmatter, `@@heroTitle` and `{{if heroTitle}}` in the component.

### Multiple values into a mount

```
{{MOUNT.card:title,description,image}}
```

In the component: `@@title`, `@@description`, `@@image`, and `{{if title}}` etc.

### Conditionals

```
{{if showSidebar}}
  <aside>...</aside>
{{else}}
  <p>No sidebar</p>
{{/if}}
```

Nested conditionals work (inside-out).

### Foreach

Frontmatter: `items: '["a","b","c"]'` or `items: Apple, Banana, Cherry`. In body:

```
<ul>
{{foreach items}}
  <li>{{index}}: {{item}}</li>
{{/foreach}}
</ul>
```

For objects: `links: '[{"name":"Home","url":"/"}]'` then `{{item.name}}`, `{{item.url}}` inside the loop.

### Preload + module script

```
<script mount="body"
        serve="file"
        bundle="main"
        destination="static/js"
        type="module"
        preload
        preload_mount="head">
  // ...
</script>
```

Build puts `<link rel="modulepreload" href="static/js/main.js">` in the head and the script tag in body. Only on pages that use this bundle.

### Hydration: idle, load, or visible

```
<script mount="body" serve="inline" hydrate="idle">
  // runs when thread is free
</script>

<script mount="body" serve="inline" hydrate="load">
  // runs on window load
</script>

<script mount="body" serve="inline" hydrate="visible:#my-section">
  // runs when #my-section enters viewport
</script>
```

---

## Build and run

**From this repo**  
`npm run build` then `npm run serve` to build and view the site locally.

**Installed in your project**  
Add the package, then from your project root (where `src/` lives):

```bash
npm install github:dmac/coupled
npx coupled build
npx coupled serve
```

Or add to `package.json`: `"build": "coupled build"` and `"serve": "coupled serve"`, then `npm run build` and `npm run serve`. Serve uses a built-in Node server (default port 8080); use `npx coupled serve 3000` for another port.

**Output:** `dist/` (wiped each build except `dist/.git`).

The build (1) clears `dist/` except `dist/.git` if present, (2) copies `src/static/` to `dist/static/`, (3) scans all `.c.html` files and registers components, (4) resolves style and script bundles and writes bundle files, (5) builds each page by merging mounts and rendering the template, and (6) writes the final HTML into `dist/` according to the path and underscore rules above.

If you use another static server (e.g. `npx http-server dist -p 8080`), avoid `destination="public/..."`; use `destination="static/css"` and `destination="static/js"` instead.

**Base URL (subpath deployment)**  
Write normal links in your templates: `href="/docs"`, `href="/"`. You never add a variable. At **build time**, if the site will be served from a subpath (e.g. `https://username.github.io/coupled/`), set the base and the build rewrites every `href="/` and `src="/` in the output to that path (e.g. `/coupled/docs`). Set it via CLI or env:

- **CLI:** `npx coupled build --base_url=coupled` or `npx coupled deploy --base_url=coupled` (build then serve).
- **Env:** `BASE_PATH=/coupled npm run build` (or `BASE_URL=/coupled`).

Default is root (`/`); omit the flag/env for local or root deployment.
