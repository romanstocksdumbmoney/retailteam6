const fs = require('fs/promises');
const path = require('path');

async function build() {
  const root = path.join(__dirname, '..');
  const srcDir = path.join(root, 'src');
  const buildDir = path.join(root, 'build');

  await fs.mkdir(buildDir, { recursive: true });

  const htmlSource = await fs.readFile(path.join(srcDir, 'index.html'), 'utf8');
  const stampedHtml = htmlSource.replace('__BUILD_TIME__', new Date().toISOString());

  await fs.writeFile(path.join(buildDir, 'index.html'), stampedHtml, 'utf8');
  await fs.copyFile(path.join(srcDir, 'app.js'), path.join(buildDir, 'app.js'));
  await fs.copyFile(path.join(srcDir, 'styles.css'), path.join(buildDir, 'styles.css'));
  console.log('Frontend build complete: frontend/build/index.html');
}

build().catch((error) => {
  console.error('Frontend build failed.');
  console.error(error);
  process.exit(1);
});
