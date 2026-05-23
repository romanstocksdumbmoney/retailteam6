const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const port = process.env.FRONTEND_PORT || 3000;

async function start() {
  const srcDir = path.join(__dirname, '..', 'src');

  const server = http.createServer(async (req, res) => {
    const requestPath = req.url === '/' ? '/index.html' : req.url;
    const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(srcDir, safePath);

    let contentType = 'text/plain; charset=utf-8';
    if (safePath.endsWith('.html')) contentType = 'text/html; charset=utf-8';
    if (safePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
    if (safePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const rendered = safePath.endsWith('.html')
        ? content.replace('__BUILD_TIME__', 'development')
        : content;

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(rendered);
    } catch (_error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`Frontend dev server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Frontend dev server failed to start.');
  console.error(error);
  process.exit(1);
});
