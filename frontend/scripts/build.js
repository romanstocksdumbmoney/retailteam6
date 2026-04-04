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
  await fs.copyFile(path.join(srcDir, 'pro.html'), path.join(buildDir, 'pro.html'));
  await fs.copyFile(path.join(srcDir, 'payment.html'), path.join(buildDir, 'payment.html'));
  await fs.copyFile(path.join(srcDir, 'checkout.html'), path.join(buildDir, 'checkout.html'));
  await fs.copyFile(path.join(srcDir, 'ai-trade.html'), path.join(buildDir, 'ai-trade.html'));
  await fs.copyFile(path.join(srcDir, 'ai-trade-access.html'), path.join(buildDir, 'ai-trade-access.html'));
  await fs.copyFile(path.join(srcDir, 'social-auth.html'), path.join(buildDir, 'social-auth.html'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-trader.html'), path.join(buildDir, 'ai-bot-trader.html'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-funding.html'), path.join(buildDir, 'ai-bot-funding.html'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-paper-connect.html'), path.join(buildDir, 'ai-bot-paper-connect.html'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-funding-payment.html'), path.join(buildDir, 'ai-bot-funding-payment.html'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-account.html'), path.join(buildDir, 'ai-bot-account.html'));
  await fs.copyFile(path.join(srcDir, 'brokerage-onboarding.html'), path.join(buildDir, 'brokerage-onboarding.html'));
  await fs.copyFile(path.join(srcDir, 'ai-implementation-steps.html'), path.join(buildDir, 'ai-implementation-steps.html'));
  await fs.copyFile(path.join(srcDir, 'ai-analyzer.html'), path.join(buildDir, 'ai-analyzer.html'));
  await fs.copyFile(path.join(srcDir, 'insider-trades.html'), path.join(buildDir, 'insider-trades.html'));
  await fs.copyFile(path.join(srcDir, 'portfolios.html'), path.join(buildDir, 'portfolios.html'));
  await fs.copyFile(path.join(srcDir, 'logo-mark.svg'), path.join(buildDir, 'logo-mark.svg'));
  await fs.copyFile(path.join(srcDir, 'app.js'), path.join(buildDir, 'app.js'));
  await fs.copyFile(path.join(srcDir, 'pro.js'), path.join(buildDir, 'pro.js'));
  await fs.copyFile(path.join(srcDir, 'payment.js'), path.join(buildDir, 'payment.js'));
  await fs.copyFile(path.join(srcDir, 'checkout.js'), path.join(buildDir, 'checkout.js'));
  await fs.copyFile(path.join(srcDir, 'ai-trade.js'), path.join(buildDir, 'ai-trade.js'));
  await fs.copyFile(path.join(srcDir, 'ai-trade-access.js'), path.join(buildDir, 'ai-trade-access.js'));
  await fs.copyFile(path.join(srcDir, 'social-auth.js'), path.join(buildDir, 'social-auth.js'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-trader.js'), path.join(buildDir, 'ai-bot-trader.js'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-funding.js'), path.join(buildDir, 'ai-bot-funding.js'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-paper-connect.js'), path.join(buildDir, 'ai-bot-paper-connect.js'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-funding-payment.js'), path.join(buildDir, 'ai-bot-funding-payment.js'));
  await fs.copyFile(path.join(srcDir, 'ai-bot-account.js'), path.join(buildDir, 'ai-bot-account.js'));
  await fs.copyFile(path.join(srcDir, 'brokerage-onboarding.js'), path.join(buildDir, 'brokerage-onboarding.js'));
  await fs.copyFile(path.join(srcDir, 'ai-implementation-steps.js'), path.join(buildDir, 'ai-implementation-steps.js'));
  await fs.copyFile(path.join(srcDir, 'ai-analyzer.js'), path.join(buildDir, 'ai-analyzer.js'));
  await fs.copyFile(path.join(srcDir, 'insider-trades.js'), path.join(buildDir, 'insider-trades.js'));
  await fs.copyFile(path.join(srcDir, 'portfolios.js'), path.join(buildDir, 'portfolios.js'));
  await fs.copyFile(path.join(srcDir, 'styles.css'), path.join(buildDir, 'styles.css'));
  console.log('Frontend build complete: frontend/build/index.html');
}

build().catch((error) => {
  console.error('Frontend build failed.');
  console.error(error);
  process.exit(1);
});
