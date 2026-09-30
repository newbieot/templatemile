import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = await fs.readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const moduleSource = `${source}\nexport { createSessionToken };`;
const importWorker = () => import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const worker = await importWorker();
const origin = 'https://mile.posnew.com';
const secret = 'android-persistent-test-secret-1234567890';
const objects = new Map();
let failure = '';
let firebaseStatus = 200;
let firebaseCalls = 0;
const bucket = {
  async put(key, value, options) {
    if (failure === 'put') throw new Error('storage unavailable');
    assert.equal(options.httpMetadata.cacheControl, 'private, no-store, max-age=0');
    objects.set(key, String(value));
    return { key };
  },
  async get(key) {
    if (failure === 'get') throw new Error('storage unavailable');
    const value = objects.get(key);
    if (value === undefined) return null;
    return { size: Buffer.byteLength(value), async json() { return JSON.parse(value); } };
  },
  async delete(key) {
    if (failure === 'delete') throw new Error('storage unavailable');
    objects.delete(key);
  }
};
const env = { MILE_SESSION_SECRET: secret, FIREBASE_WEB_API_KEY: 'test-key', BETA_AI_IMAGES: bucket };
const call = (path, { method = 'GET', token, body, requestOrigin = origin, environment = env } = {}) => worker.default.fetch(new Request(`${origin}${path}`, {
  method,
  headers: { accept: 'application/json', origin: requestOrigin, ...(token ? { cookie: `__Host-mile_session=${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
}), environment);
const login = (extra = {}, options = {}) => call('/api/auth/login', {
  method: 'POST', body: { email: 'ikhsan@posnew.com', password: 'test-password', sessionMode: 'android-persistent', ...extra }, ...options
});
const cookieToken = response => response.headers.get('set-cookie')?.match(/^__Host-mile_session=([^;]+);/)?.[1];
const storedKey = token => `auth/android-sessions/${createHash('sha256').update(token).digest('hex')}.json`;
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
try {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword\?key=/);
    const credentials = JSON.parse(options.body);
    assert.equal(credentials.email, 'ikhsan@posnew.com');
    assert.equal(credentials.password, 'test-password');
    firebaseCalls++;
    return Response.json(firebaseStatus === 200 ? { email: credentials.email, localId: 'android-test-user' } : { error: { message: 'INVALID_PASSWORD' } }, { status: firebaseStatus });
  };

  assert.equal((await call('/api/auth/me')).status, 401);
  const blocked = await login({}, { requestOrigin: 'https://other.example' });
  assert.equal(blocked.status, 403);
  assert.equal(firebaseCalls, 0);
  assert.equal((await login({ email: 'not-allowed@example.com' })).status, 401);
  assert.equal(firebaseCalls, 0);

  firebaseStatus = 400;
  assert.equal((await login()).status, 401);
  assert.equal(objects.size, 0, 'failed credential verification must not create a persistent session');
  firebaseStatus = 200;
  const loggedIn = await login();
  assert.equal(loggedIn.status, 200);
  const token = cookieToken(loggedIn);
  assert.match(token, /^android1\.[a-f0-9]{64}$/);
  assert.match(loggedIn.headers.get('set-cookie'), /Max-Age=34560000; HttpOnly; Secure; SameSite=Lax$/);
  const loginBody = await loggedIn.json();
  assert.deepEqual(loginBody, { ok: true, authenticated: true, persistent: true, user: { email: 'ikhsan@posnew.com' }, expiresAt: null });
  assert.equal(JSON.stringify(loginBody).includes(token), false);
  assert.equal(objects.size, 1);
  const key = storedKey(token);
  assert.equal(objects.has(key), true);
  assert.equal([...objects.keys()][0].includes(token), false, 'only a digest may be used in the object key');
  const record = JSON.parse(objects.get(key));
  assert.equal(record.kind, 'android-session');
  assert.equal(record.uid, 'android-test-user');
  assert.equal(record.email, 'ikhsan@posnew.com');
  assert.equal('exp' in record, false);
  assert.equal(objects.get(key).includes(token), false, 'the record must never contain the bearer token');
  const secondLogin = await login();
  const secondToken = cookieToken(secondLogin);
  assert.notEqual(secondToken, token, 'each device/login gets an independent cryptographically random token');
  assert.equal(objects.size, 2);

  // A new Worker module/process must load the durable record, not trust in-memory state.
  const restarted = await import(`data:text/javascript;base64,${Buffer.from(`${moduleSource}\n// fresh isolate`).toString('base64')}`);
  const restartMe = await restarted.default.fetch(new Request(`${origin}/api/auth/me`, { headers: { cookie: `__Host-mile_session=${token}` } }), env);
  assert.equal(restartMe.status, 200);
  assert.deepEqual(await restartMe.json(), { authenticated: true, user: { email: 'ikhsan@posnew.com' }, expiresAt: null, persistent: true });
  Date.now = () => originalNow() + 10 * 365 * 24 * 60 * 60 * 1000;
  assert.equal((await call('/api/auth/me', { token })).status, 200, 'a persistent session has no scheduled expiry');
  Date.now = originalNow;

  const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
  assert.equal((await call('/api/auth/me', { token: tampered })).status, 401);
  for (const invalid of ['android1.short', `${token}.extra`, `android1.${'g'.repeat(64)}`, `android1.${'a'.repeat(65)}`]) {
    assert.equal((await call('/api/auth/me', { token: invalid })).status, 401);
  }
  assert.equal((await call('/api/auth/me', { token, environment: { ...env, MILE_ALLOWED_EMAILS: 'another@example.com' } })).status, 401);

  failure = 'get';
  assert.equal((await call('/api/auth/me', { token })).status, 503);
  failure = '';
  assert.equal((await call('/api/auth/me', { token, environment: { MILE_SESSION_SECRET: secret } })).status, 503);
  objects.set(key, '{bad json');
  assert.equal((await call('/api/auth/me', { token })).status, 401);
  objects.set(key, JSON.stringify(record));

  const missingStorage = await login({}, { environment: { MILE_SESSION_SECRET: secret, FIREBASE_WEB_API_KEY: 'test-key' } });
  assert.equal(missingStorage.status, 503);
  assert.equal(missingStorage.headers.get('set-cookie'), null);
  failure = 'put';
  const writeFailure = await login();
  assert.equal(writeFailure.status, 503);
  assert.equal(writeFailure.headers.get('set-cookie'), null, 'no token may be issued before its durable record exists');
  failure = '';

  const rejectedLogout = await call('/api/auth/logout', { method: 'POST', token, requestOrigin: 'https://other.example' });
  assert.equal(rejectedLogout.status, 403);
  assert.equal(objects.has(key), true);
  failure = 'delete';
  const failedLogout = await call('/api/auth/logout', { method: 'POST', token });
  assert.equal(failedLogout.status, 503);
  assert.equal(failedLogout.headers.get('set-cookie'), null);
  failure = '';
  assert.equal((await call('/api/auth/me', { token })).status, 200);
  const loggedOut = await call('/api/auth/logout', { method: 'POST', token });
  assert.equal(loggedOut.status, 200);
  assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(objects.has(key), false);
  assert.equal((await call('/api/auth/me', { token })).status, 401, 'replaying a saved token after logout must fail');
  assert.equal((await restarted.default.fetch(new Request(`${origin}/api/auth/me`, { headers: { cookie: `__Host-mile_session=${token}` } }), env)).status, 401);
  assert.equal((await call('/api/auth/me', { token: secondToken })).status, 200, 'logout revokes the current device, preserving other devices');
  assert.equal((await call('/api/auth/logout', { method: 'POST', token: secondToken })).status, 200);
  assert.equal(objects.size, 0);

  // Existing web login remains a signed 12-hour / 7-day session without R2.
  for (const remember of [false, true]) {
    const webLogin = await login({ sessionMode: undefined, remember }, { environment: { MILE_SESSION_SECRET: secret, FIREBASE_WEB_API_KEY: 'test-key' } });
    assert.equal(webLogin.status, 200);
    const seconds = remember ? 7 * 24 * 60 * 60 : 12 * 60 * 60;
    assert.equal((await webLogin.json()).expiresIn, seconds);
    const webToken = cookieToken(webLogin);
    assert.equal(webToken.startsWith('android1.'), false);
    const webMe = await call('/api/auth/me', { token: webToken });
    assert.equal(webMe.status, 200);
    const me = await webMe.json();
    assert.equal(me.persistent, false);
    assert.equal(me.expiresAt > Math.floor(originalNow() / 1000), true);
    Date.now = () => originalNow() + (seconds + 60) * 1000;
    assert.equal((await call('/api/auth/me', { token: webToken })).status, 401);
    Date.now = originalNow;
  }
  assert.equal(objects.size, 0, 'web sessions must not allocate durable Android session records');
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
console.log('PASS worker-android-session: Firebase-gated persistent login, digest-only durable records, restart, no expiry, tamper rejection, server logout revocation, storage failure handling, and web expiry preserved');
