const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MILE_PLAYWRIGHT_PATH || 'playwright');
const xlsx = require('../assets/vendor/sheetjs/xlsx.full.min.js');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.wrangler');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/api/auth/me') {
    response.setHeader('content-type', 'application/json');
    return response.end(JSON.stringify({ authenticated: true, user: { email: 'qa-local@example.test' } }));
  }
  const file = path.resolve(root, `.${pathname === '/krt' ? '/krt.html' : pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.statusCode = 404;
    return response.end();
  }
  response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  response.end(fs.readFileSync(file));
});

let browser;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 393, 852], ['small-mobile', 320, 700]]) {
    const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/krt`);
    await page.getByText('470', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Persiapan kiriman' }).isVisible(), true);
    assert.equal(await page.locator('#krtForm input').evaluateAll(inputs => inputs.every(input => input.value === '')), true);
    await page.getByRole('button', { name: 'Unduh Excel KRT' }).click();
    await page.getByRole('status').filter({ hasText: 'Kode pelanggan wajib diisi' }).waitFor();
    for (const [id, value] of Object.entries({ krtCustomerCode: 'QA-CUSTOMER', krtInternalOrder: '000012345', krtExpiryStart: '2026-11-01', krtExpiryEnd: '2027-11-01' })) {
      await page.locator(`#${id}`).fill(value);
    }
    for (const [field, value] of Object.entries({ tariff_from_code: '00123', tariff_to_code: '00456', tariff_sla_day: '7', tariff_sla_hours: '168', base_tariff: '23456.75', tariff_sub_service_description: 'Tarif uji KRT' })) {
      await page.locator(`[name="${field}"]`).fill(value);
    }
    await page.locator('#krtInternalOrder').fill('');
    await page.getByRole('button', { name: 'Unduh Excel KRT' }).click();
    await page.getByRole('status').filter({ hasText: 'No IO KRT wajib diisi' }).waitFor();
    await page.locator('#krtInternalOrder').fill('000012345');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Unduh Excel KRT' }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'template_import_customer_tariff_cba_KRT.xlsx');
    const saved = path.join(output, `krt-${name}-qa.xlsx`);
    await download.saveAs(saved);
    const book = xlsx.read(fs.readFileSync(saved), { type: 'buffer' });
    assert.deepEqual(book.SheetNames, ['TariffCbaCustomer']);
    const rows = xlsx.utils.sheet_to_json(book.Sheets.TariffCbaCustomer);
    assert.equal(rows.length, 1);
    assert.equal(Object.keys(rows[0]).length, 14);
    assert.equal(rows[0].internal_order, '000012345');
    assert.equal(rows[0].service_id, 470);
    assert.equal(rows[0].tariff_sub_service_code, '916479');
    assert.equal(rows[0].customer_type_code, 'QA-CUSTOMER');
    assert.equal(JSON.parse(rows[0].tariff_formula_data).base_tariff, '23456.75');
    await page.getByRole('status').filter({ hasText: '1 baris tarif' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${name}: page must not overflow`);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, `krt-${name}.png`), fullPage: true });
    console.log(`PASS KRT browser ${name}: empty form, required IO, real lazy-loaded Excel download, exact schema, leading zeros, no overflow or JS errors`);
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
