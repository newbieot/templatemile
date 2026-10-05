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
const bucketObjects = new Map();
const cameraBucket = {
  async put(key, value) { bucketObjects.set(key, String(value)); },
  async get(key) {
    const value = bucketObjects.get(key);
    if (value === undefined) return null;
    return {
      size: Buffer.byteLength(value),
      async json() { return JSON.parse(value); },
      async arrayBuffer() { return Buffer.from(value); }
    };
  },
  async list({ prefix = '' } = {}) {
    return {
      objects: [...bucketObjects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })),
      truncated: false
    };
  },
  async delete(key) { bucketObjects.delete(key); }
};
const env = {
  MILE_SESSION_SECRET: secret,
  BETA_AI_IMAGES: cameraBucket,
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (/^\/downloads\/Mile-Camera-0\.1\.(?:1|3|4|5|6)\.apk$/.test(pathname)) return new Response(new Uint8Array([0x50,0x4b,3,4]), { headers: { 'content-type': 'application/octet-stream' } });
      if (/^\/downloads\/Mile-CN23-Helper-0\.2\.[789]\.zip$/.test(pathname)) return new Response(new Uint8Array([0x50,0x4b,3,4]));
      if (pathname === '/unduhan') return new Response(await fs.readFile(new URL('../unduhan.html', import.meta.url), 'utf8'), {headers:{'content-type':'text/html; charset=utf-8'}});
      if (pathname === '/assets/css/downloads.css') return new Response(await fs.readFile(new URL('../assets/css/downloads.css', import.meta.url), 'utf8'), {headers:{'content-type':'text/css'}});
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

const apk = await workerModule.default.fetch(new Request('https://mile.posnew.com/downloads/Mile-Camera-0.1.1.apk'), env);
assert.equal(apk.status, 200);
assert.equal(apk.headers.get('content-type'), 'application/vnd.android.package-archive');
assert.equal(apk.headers.get('content-disposition'), 'attachment; filename="Mile-Camera-0.1.1.apk"');
const newApk = await workerModule.default.fetch(new Request('https://mile.posnew.com/downloads/Mile-Camera-0.1.6.apk'), env);
assert.equal(newApk.status, 200); assert.equal(newApk.headers.get('content-disposition'), 'attachment; filename="Mile-Camera-0.1.6.apk"');
const extensionZip = await workerModule.default.fetch(new Request('https://mile.posnew.com/downloads/Mile-CN23-Helper-0.2.9.zip'), env);
assert.equal(extensionZip.status, 200); assert.equal(extensionZip.headers.get('content-type'), 'application/zip');
const latestApk = await workerModule.default.fetch(new Request('https://mile.posnew.com/downloads/Mile-Camera.apk'), env);
assert.equal(latestApk.headers.get('location'), '/downloads/Mile-Camera-0.1.6.apk');
assert.deepEqual(new Uint8Array(await apk.arrayBuffer()), new Uint8Array([0x50,0x4b,3,4]));
assert.equal((await workerModule.default.fetch(new Request('https://mile.posnew.com/downloads/other.apk'), env)).status, 302);

for (const path of ['/unduhan','/unduhan.html']) {
  const guide=await workerModule.default.fetch(new Request('https://mile.posnew.com'+path),env);
  assert.equal(guide.status,200);assert.match(guide.headers.get('content-type'),/text\/html/);
  assert.match(guide.headers.get('cache-control'),/no-store/);
  const html=await guide.text();
  assert.match(html,/Mile-Camera-0\.1\.6\.apk/);assert.match(html,/Mile-CN23-Helper-0\.2\.9\.zip/);
  assert.match(html,/Chrome 88 ke atas/);assert.match(html,/32-bit dan 64-bit/);
  assert.match(html,/CN23_ANTREAN/);assert.match(html,/Kode pos dan kode zona mengikuti Mile/);
}
const guideCss=await workerModule.default.fetch(new Request('https://mile.posnew.com/assets/css/downloads.css?v=20261001-26.40'),env);
assert.equal(guideCss.status,200);assert.match(guideCss.headers.get('content-type'),/text\/css/);

const authenticated = await workerModule.default.fetch(new Request('https://mile.posnew.com/camera', {
  headers: { cookie: `__Host-mile_session=${token}` }
}), env);
assert.equal(authenticated.status, 200);
assert.equal(authenticated.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self)');
assert.equal(authenticated.headers.get('x-mile-app-version'), '20261005-26.43-cn23-chrome88');
assert.match(await authenticated.text(), /Camera Capture Batch/);

const unauthenticatedReview = await workerModule.default.fetch(new Request('https://mile.posnew.com/review'), env);
assert.equal(unauthenticatedReview.status, 302);
assert.equal(unauthenticatedReview.headers.get('location'), '/');

const authenticatedReview = await workerModule.default.fetch(new Request('https://mile.posnew.com/review', {
  headers: { cookie: `__Host-mile_session=${token}` }
}), env);
assert.equal(authenticatedReview.status, 200);
assert.match(authenticatedReview.headers.get('permissions-policy'), /accelerometer=\(\), gyroscope=\(\)/);
assert.match(await authenticatedReview.text(), /Review Hasil Kamera/);

const protectedAsset = await workerModule.default.fetch(new Request('https://mile.posnew.com/assets/js/camera.js', {
  headers: { accept: 'text/javascript' }
}), env);
assert.equal(protectedAsset.status, 401);

const batchId = 'CAM-camera-log-detail-1234';
const createdAt = Date.now();
const saveBatch = await workerModule.default.fetch(new Request(`https://mile.posnew.com/api/camera/batch/${batchId}`, {
  method: 'POST',
  headers: { cookie: `__Host-mile_session=${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    id: batchId,
    createdAt,
    startedAt: new Date(createdAt - 120000).toISOString(),
    captureFinishedAt: new Date(createdAt - 60000).toISOString(),
    finishedAt: new Date(createdAt).toISOString(),
    captureCount: 3,
    deviceName: 'HP Gudang A',
    model: 'deepseek-v4.1-flash',
    chunkSize: 5,
    concurrency: 3,
    chunkTimings: [{ group: 1, start: 1, end: 3, inputBytes: 1024, prepareMs: 120, encodeMs: 80, uploadMs: 300, waitMs: 900, totalMs: 1280, attempts: 2, retries: 1, structuredFallbacks: 1, reasoningFallbacks: 1, requestStartOffsetMs: 250, requestEndOffsetMs: 1530, errorStatus: 400, upstreamMs: 875, requestId: 'req-test-123', rows: 3, model: 'deepseek-v4.1-flash', status: 'success' }],
    captureDurationSeconds: 60,
    processingDurationSeconds: 25.5,
    totalDurationSeconds: 120,
    form: { corporateTemplate: 'BSN', customerId: 'CUST-01', serviceCode: 'REG', tariffCode: 'T1', itemType: 'DOKUMEN' },
    rows: [
      { name: 'A', address: 'Batam' },
      { name: 'B', address: 'Batam', aiReviewFields: ['nama_penerima', 'alamat_penerima'] },
      { name: 'C', address: 'Tanjungpinang', outsideBatam: true }
    ]
  })
}), env);
assert.equal(saveBatch.status, 200);

const batchListResponse = await workerModule.default.fetch(new Request('https://mile.posnew.com/api/camera/batches', {
  headers: { cookie: `__Host-mile_session=${token}` }
}), env);
assert.equal(batchListResponse.status, 200);
const batchList = await batchListResponse.json();
assert.equal(batchList.batches.length, 1);
assert.equal(batchList.batches[0].deviceName, 'HP Gudang A');
assert.equal(batchList.batches[0].model, 'deepseek-v4.1-flash');
assert.equal(batchList.batches[0].reviewCount, 1);
assert.equal(batchList.batches[0].reviewFieldCount, 2);
assert.equal(batchList.batches[0].outsideBatamCount, 1);
assert.equal(batchList.batches[0].cleanCount, 1);
assert.equal(batchList.batches[0].durationSeconds, 25.5);
assert.equal(batchList.batches[0].customerId, 'CUST-01');
assert.equal(batchList.batches[0].chunkTimings.length, 1);
assert.equal(batchList.batches[0].chunkTimings[0].waitMs, 900);
assert.equal(batchList.batches[0].chunkTimings[0].structuredFallbacks, 1);
assert.equal(batchList.batches[0].chunkTimings[0].reasoningFallbacks, 1);
assert.equal(batchList.batches[0].chunkTimings[0].requestStartOffsetMs, 250);
assert.equal(batchList.batches[0].chunkTimings[0].requestEndOffsetMs, 1530);
assert.equal(batchList.batches[0].chunkTimings[0].errorStatus, 400);
assert.equal(batchList.batches[0].chunkTimings[0].upstreamMs, 875);
assert.equal(batchList.batches[0].chunkTimings[0].requestId, 'req-test-123');

console.log('PASS worker-camera-route: auth gate, camera-only permission, protected assets, review route, dan detail log kamera');
