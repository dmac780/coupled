#!/usr/bin/env node
/**
 * CLI: coupled [build] | coupled serve [port] | coupled deploy [--base_url=path]
 * - coupled | coupled build     → run build
 * - coupled build --base_url=X  → build with BASE_PATH=/X (for GitHub Pages subpath)
 * - coupled serve [port]        → serve dist/
 * - coupled deploy [--base_url=X] → build (with optional base) then serve
 */

const args = process.argv.slice(2);
const cmd = args[0];
const isDeploy = cmd === 'deploy';

for (const arg of args) {
  if (arg === '--base_url' || arg === '--base-url') continue;
  const m = arg.match(/^--base_url=(.+)$/i) || arg.match(/^--base-url=(.+)$/i);
  if (m) {
    const v = m[1].trim();
    process.env.BASE_PATH = v.startsWith('/') ? v : '/' + v;
    break;
  }
}

if (cmd === 'serve') {
  const port = parseInt(args[1], 10) || parseInt(process.env.PORT, 10) || 8080;
  require('./serve').serve(port);
} else {
  if (cmd === 'deploy' || !cmd || cmd === 'build') {
    require('./build').main();
    if (isDeploy) {
      const port = parseInt(process.env.PORT, 10) || 8080;
      require('./serve').serve(port);
    }
  } else {
    require('./build').main();
  }
}
