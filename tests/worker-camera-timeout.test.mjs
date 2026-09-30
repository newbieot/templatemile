import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { createSessionToken, aiUpstreamTimeoutMs };`).toString('base64')}`);
const secret = 'camera-timeout-test-secret-1234567890';
const token = await worker.createSessionToken({ v: 1, email: 'ikhsan@posnew.com', uid: 'timeout-test', exp: Math.floor(Date.now() / 1000) + 600 }, secret);
const models = ['gemini-3.8-flash', 'gemini-3.1-pro', 'gemini-3.7-flash', 'deepseek-v4.1-flash'];
assert.equal(worker.aiUpstreamTimeoutMs(models[0], 'document'), 60000);
assert.equal(worker.aiUpstreamTimeoutMs(models[3], 'document'), 180000);

const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let upstreamSignal;
let responseCancelled;
let timerDelay;
try {
  // Fast-forward only the gateway timer; exercise cancellation of a stalled response body.
  globalThis.setTimeout = (callback, delay) => {
    timerDelay = delay;
    return setImmediate(callback);
  };
  globalThis.clearTimeout = clearImmediate;
  globalThis.fetch = async (_url, options) => {
    upstreamSignal = options.signal;
    assert.equal('requestProfile' in JSON.parse(options.body), false);
    return new Response(new ReadableStream({ cancel() { responseCancelled = true; } }), { headers: { 'content-type': 'application/json' } });
  };
  for (const model of models) {
    responseCancelled = false;
    assert.equal(worker.aiUpstreamTimeoutMs(model, 'camera'), 30000);
    const response = await worker.default.fetch(new Request('https://mile.posnew.com/api/ai-proxy', {
      method: 'POST',
      headers: { cookie: `__Host-mile_session=${token}`, origin: 'https://mile.posnew.com', 'content-type': 'application/json' },
      body: JSON.stringify({ requestProfile: 'camera', body: { model, messages: [] } })
    }), { MILE_SESSION_SECRET: secret, COSMOS_API_KEY: 'test-only-key' });
    assert.equal(timerDelay, 30000);
    assert.equal(response.status, 504);
    assert.equal(response.headers.get('x-mile-upstream-timeout-ms'), '30000');
    assert.equal((await response.json()).error.code, 'UPSTREAM_TIMEOUT');
    assert.equal(upstreamSignal.aborted, true);
    assert.equal(responseCancelled, true);
  }
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
console.log('PASS worker-camera-timeout: all camera models stop at 30 seconds, stalled body cancelled, document budgets preserved');
