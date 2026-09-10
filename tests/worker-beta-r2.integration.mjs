import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

if (process.env.MILE_RUN_R2_INTEGRATION !== '1') {
  console.log('SKIP worker-beta-r2: jalankan bersama Wrangler lokal dengan MILE_RUN_R2_INTEGRATION=1');
  process.exit(0);
}

const origin = process.env.MILE_TEST_ORIGIN || 'http://127.0.0.1:8791';
const secret = process.env.MILE_TEST_SESSION_SECRET || 'mile-local-beta-r2-session-secret-1234567890';
const encode = value => Buffer.from(value).toString('base64url');
const payload = encode(JSON.stringify({
  v: 1,
  email: 'test@example.com',
  uid: 'local-test-user',
  exp: Math.floor(Date.now() / 1000) + 600
}));
const signature = createHmac('sha256', secret).update(payload).digest('base64url');
const cookie = `__Host-mile_session=${payload}.${signature}`;
const authenticatedHeaders = { cookie };
const jobId = 'workerintegration01';

const health = await fetch(`${origin}/api/health`).then(response => response.json());
assert.equal(health.ok, true);
assert.equal(health.betaImagesConfigured, true);

const uploadResponse = await fetch(`${origin}/api/beta/images/${jobId}/1/first`, {
  method: 'POST',
  headers: { ...authenticatedHeaders, 'content-type': 'image/jpeg' },
  body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
});
assert.equal(uploadResponse.status, 200);
const upload = await uploadResponse.json();
assert.equal(upload.ok, true);
assert.match(upload.ref, /^mile-r2:/);
assert.match(upload.url, /^http:\/\/127\.0\.0\.1:8791\/api\/beta\/image\?t=/);

const imageResponse = await fetch(upload.url);
assert.equal(imageResponse.status, 200);
assert.equal(imageResponse.headers.get('content-type'), 'image/jpeg');
assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

const headResponse = await fetch(upload.url, { method: 'HEAD' });
assert.equal(headResponse.status, 200);
assert.equal(await headResponse.text(), '');

const cleanupResponse = await fetch(`${origin}/api/beta/images/cleanup`, {
  method: 'POST',
  headers: { ...authenticatedHeaders, 'content-type': 'application/json' },
  body: JSON.stringify({ jobId })
});
assert.equal(cleanupResponse.status, 200);
assert.equal((await cleanupResponse.json()).deleted, 1);
assert.equal((await fetch(upload.url)).status, 404);

console.log('PASS worker-beta-r2: upload, referensi jembatan, signed read, HEAD, cleanup, dan expiry behavior');
