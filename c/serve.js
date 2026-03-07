/**
 * Built-in static file server for dist/. Node only, no dependencies.
 * Usage: node c/serve.js [port]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DIST_DIR } = require('./paths');

const MIMES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
};

function serve(port) {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('[coupled] dist/ not found. Run the build first: npx coupled build');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const filePath = path.join(DIST_DIR, path.normalize(p).replace(/^\//, ''));

    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403);
      res.end();
      return;
    }

    const tryPaths = [filePath];
    if (!path.extname(filePath)) {
      tryPaths.push(path.join(filePath, 'index.html'));
      tryPaths.push(filePath + '.html');
    }

    let found = null;
    for (const fp of tryPaths) {
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        found = fp;
        break;
      }
    }

    if (!found) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(found);
    const contentType = MIMES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(found).pipe(res);
  });

  server.listen(port, () => {
    console.log(`[coupled] Serving dist/ at http://localhost:${port}`);
  });
}

module.exports = { serve };

if (require.main === module) {
  const port = parseInt(process.argv[2], 10) || parseInt(process.env.PORT, 10) || 8080;
  serve(port);
}
