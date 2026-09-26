import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${source}\nexport { createSessionToken, verifySessionToken, currentSession, parseCookies };`).toString('base64')}`;
const workerModule = await import(moduleUrl);
const secret = 'mile-camera-route-test-secret-1234567890';
const token = await workerModule.createSessionToken({
  v: 1,
  email: 'ikhsan@posnew.com',
  uid: 'camera-qa-user',
  exp: Math.floor(Date.now() / 1000) + 600
}, secret);
const env = {
  MILE_SESSION_SECRET: secret,
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/camera') return new Response('<title>Camera Capture Batch</title>', { headers: { 'content-type': 'text/html' } });
      if (pathname === '/review') return new Response('<title>Review Hasil Kamera</title>', { headers: { 'content-type': 'text/html' } });
      return new Response('asset', { headers: { 'content-type': 'text/javascript' } });
    }
  }
};

assert.equal((await workerModule.verifySessionToken(token, secret))?.email, 'ikhsan@posnew.com');
assert.equal(workerModule.parseCookies(`__Host-mile_session=${token}`)['__Host-mile_session'], token);

const unauthenticated = await workerModule.default.fetch(new Request('https://mile.posnew.com/camera'), env);
assert.equal(unauthenticated.status, 302);
assert.equal(unauthenticated.headers.get('location'), '/');

const authenticated = await workerModule.default.fetch(new Request('https://mile.posnew.com/camera', {
  headers: { cookie: `__Host-mile_session=${token}` }
}), env);
assert.equal(authenticated.status, 200);
assert.equal(authenticated.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
assert.equal(authenticated.headers.get('x-mile-app-version'), '20260926-25.10-camera-direct15');
assert.match(await authenticated.text(), /Camera Capture Batch/);

const unauthenticatedReview = await workerModule.default.fetch(new Request('https://mile.posnew.com/review'), env);
assert.equal(unauthenticatedReview.status, 302);
assert.equal(unauthenticatedReview.headers.get('location'), '/');

const authenticatedReview = await workerModule.default.fetch(new Request('https://mile.posnew.com/review', {
  headers: { cookie: `__Host-mile_session=${token}` }
}), env);
assert.equal(authenticatedReview.status, 200);
assert.match(await authenticatedReview.text(), /Review Hasil Kamera/);

const protectedAsset = await workerModule.default.fetch(new Request('https://mile.posnew.com/assets/js/camera.js', {
  headers: { accept: 'text/javascript' }
}), env);
assert.equal(protectedAsset.status, 401);

console.log('PASS worker-camera-route: auth gate, camera-only permission, version header, protected assets, dan review route');
