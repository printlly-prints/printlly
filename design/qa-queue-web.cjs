// Local synthetic fixture only. No production session or browser profile.
const { chromium } = require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const output = path.join(__dirname, 'implementation-validation');
  const owner = { id: 'qa-owner', name: 'QA Partner', role: 'shop_owner' };
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(({ owner }) => {
    localStorage.setItem('token', 'local-partner-qa'); localStorage.setItem('user', JSON.stringify(owner));
  }, { owner });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const setStatus = async status => {
    const response = await page.request.patch('http://127.0.0.1:5180/shops/me/status', { data: { shop_status: status } });
    assert.equal(response.status(), 200);
  };
  await setStatus('open');
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:5174/dashboard');
    await page.evaluate(theme => localStorage.setItem('printlly.appearance', theme), theme);
    await page.reload();
    await page.getByText('Low rush', { exact: true }).waitFor();
    await page.getByText('2 awaiting preparation · 1 ready for pickup', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, `web-queue-${theme}-${width}.png`), fullPage: true });
  }
  await setStatus('closed');
  await page.getByRole('button', { name: 'Refresh orders and queue' }).click();
  await page.getByText('Closed to new orders', { exact: true }).first().waitFor();
  assert.equal(await page.getByText(/^(Low|Medium|High) rush$/).count(), 0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'web-queue-closed-dark-390.png'), fullPage: true });
  await setStatus('open');
  const admin = await browser.newContext();
  await admin.addInitScript(() => {
    localStorage.setItem('admin_token', 'local-admin-qa');
    localStorage.setItem('admin_user', JSON.stringify({ id: 'qa-admin', name: 'QA Admin', role: 'admin' }));
  });
  const adminPage = await admin.newPage(); adminPage.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await adminPage.setViewportSize({ width, height: 1000 });
    await adminPage.goto('http://127.0.0.1:5173/settings');
    await adminPage.getByRole('heading', { name: 'Rush count fallback' }).waitFor();
    await adminPage.getByText(/Closed shops show no rush/).waitFor();
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await adminPage.screenshot({ path: path.join(output, `admin-queue-fallback-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 4 vendor open layouts, closed rush hidden, 2 admin settings layouts; no horizontal overflow or runtime errors. Synthetic fixture only.');
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
