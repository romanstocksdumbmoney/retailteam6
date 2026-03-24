const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const port = process.env.FRONTEND_PORT || 3000;

async function start() {
  const htmlPath = path.join(__dirname, '..', 'src', 'index.html');
  const html = await fs.readFile(htmlPath, 'utf8');
  const rendered = html.replace('__BUILD_TIME__', 'development');

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(rendered);
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
