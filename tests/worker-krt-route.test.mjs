import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { createSessionToken };`).toString('base64')}`);
const secret = 'krt-route-test-secret-12345678901234567890';
const token = await worker.createSessionToken({ v: 1, email: 'ikhsan@posnew.com', uid: 'krt-qa', exp: Math.floor(Date.now() / 1000) + 600 }, secret);
const assetPaths = [];
const env = {
  MILE_SESSION_SECRET: secret,
  ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname;
    assetPaths.push(path);
    if (path === '/krt') return new Response(await fs.readFile(new URL('../krt.html', import.meta.url)), { headers: { 'content-type': 'text/html' } });
    return new Response('asset');
  } }
};

for (const path of ['/krt', '/krt.html']) {
  const unauthenticated = await worker.default.fetch(new Request(`https://mile.posnew.com${path}`), env);
  assert.equal(unauthenticated.status, 302);
  assert.equal(unauthenticated.headers.get('location'), '/');
  const response = await worker.default.fetch(new Request(`https://mile.posnew.com${path}`, { headers: { cookie: `__Host-mile_session=${token}` } }), env);
  assert.equal(response.status, 200);
  assert.equal(assetPaths.at(-1), '/krt', 'Both URLs must use the extensionless asset to avoid Pages redirect loops');
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('x-mile-app-version'), '20261019-26.55-krt-tariff');
  assert.match(response.headers.get('content-security-policy'), /script-src/);
  assert.match(await response.text(), /No IO/);
}
for (const path of ['/assets/js/krt.js', '/assets/css/krt.css']) {
  const response = await worker.default.fetch(new Request(`https://mile.posnew.com${path}`), env);
  assert.equal(response.status, 401, 'KRT assets must remain behind authentication');
}
console.log('PASS KRT route: login required, protected assets, canonical route, security headers, no-store and deployment version');
