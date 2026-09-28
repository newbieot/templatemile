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
assert.equal(authenticated.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self)');
assert.equal(authenticated.headers.get('x-mile-app-version'), '20260928-26.20-fast-shutter-720p-jpeg');
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
    model: 'gemini-3.8-flash',
    chunkSize: 5,
    concurrency: 3,
    chunkTimings: [{ group: 1, start: 1, end: 3, inputBytes: 1024, prepareMs: 120, encodeMs: 80, uploadMs: 300, waitMs: 900, totalMs: 1280, attempts: 1, retries: 0, rows: 3, model: 'gemini-3.8-flash', status: 'success' }],
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
assert.equal(batchList.batches[0].model, 'gemini-3.8-flash');
assert.equal(batchList.batches[0].reviewCount, 1);
assert.equal(batchList.batches[0].reviewFieldCount, 2);
assert.equal(batchList.batches[0].outsideBatamCount, 1);
assert.equal(batchList.batches[0].cleanCount, 1);
assert.equal(batchList.batches[0].durationSeconds, 25.5);
assert.equal(batchList.batches[0].customerId, 'CUST-01');
assert.equal(batchList.batches[0].chunkTimings.length, 1);
assert.equal(batchList.batches[0].chunkTimings[0].waitMs, 900);

console.log('PASS worker-camera-route: auth gate, camera-only permission, protected assets, review route, dan detail log kamera');
