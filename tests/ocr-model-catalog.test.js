const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const catalog = ["gemini-3.8-flash", "deepseek-v4.1-flash", "claude-haiku-5.5", "claude-sonnet-5", "claude-opus-4.8", "claude-fable-5.1", "claude-opus-5", "claude-opus-5.5", "claude-sonnet-5.5", "gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "glm-5.3-flashx", "glm-5.3-flash", "glm-5v-turbo", "kimi-k3.1-pro", "kimi-k3", "kimi-k2.7-code", "kimi-k2.6", "kimi-k2.5", "qwen-3.8-max-0902", "qwen-3.8-max", "qwen-3.8-flash", "minimax-m3.1-flash", "minimax-m3", "mimo-v2.6-pro", "step-5-preview"];
const removed = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro',
  'deepseek-v4-pro', 'qwen-3.7-plus', 'glm-5.3', 'claude-sonnet-4.5', 'deepseek-v3.2', 'deepseek-v3.2-free', 'deepseek-v4-flash', 'deepseek-v4-flash-0731', 'deepseek-v4-pro-0813', 'glm-5.2', 'hy3', 'hy3-free', 'hy4-preview', 'hy4-preview-free', 'minimax-m2.7', 'qwen-3.7-max'];
const imageUrl = 'data:image/jpeg;base64,/9j/2Q==';

require('node:test')('OCR catalog, compatible requests and image-only probe', { timeout: 15000 }, async () => {
  const source = fs.readFileSync('_worker.js', 'utf8');
  const worker = await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { ALLOWED_MODELS, createSessionToken, aiUpstreamTimeoutMs };`).toString('base64')}`);
  assert.deepEqual([...worker.ALLOWED_MODELS], catalog, 'Gateway accepts exactly the OCR catalog');
  const secret = 'ocr-catalog-test-secret-123456789012345';
  const token = await worker.createSessionToken({ v: 1, uid: 'ocr-test', email: 'ikhsan@posnew.com', exp: Math.floor(Date.now() / 1000) + 600 }, secret);
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (_url, options) => {
    upstreamCalls++;
    const body = JSON.parse(options.body);
    assert.ok(catalog.includes(body.model));
    assert.equal(body.messages[0].content[0].image_url.url, imageUrl);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"rows":[]}' } }] }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    for (const model of [...catalog, ...removed]) {
      const before = upstreamCalls;
      const response = await worker.default.fetch(new Request('https://mile.posnew.com/api/ai-proxy', {
        method: 'POST', headers: { cookie: `__Host-mile_session=${token}`, origin: 'https://mile.posnew.com', 'content-type': 'application/json' },
        body: JSON.stringify({ requestProfile: 'camera', body: { model, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageUrl } }] }] } })
      }), { MILE_SESSION_SECRET: secret, COSMOS_API_KEY: 'test-only-key' });
      assert.equal(response.status, catalog.includes(model) ? 200 : 400, model);
      assert.equal(upstreamCalls - before, catalog.includes(model) ? 1 : 0, 'Removed models cannot reach the provider');
    }
  } finally { globalThis.fetch = originalFetch; }

  for (const page of ['app.html', 'beta.html', 'review.html']) {
    const dom = new JSDOM(fs.readFileSync(page, 'utf8'), { url: 'https://fixture.test/review', runScripts: 'outside-only' });
    const w = dom.window, d = w.document;
    try {
      w.fetch = async () => ({ ok: true, json: async () => ({ ok: true, cosmosConfigured: true, firebaseConfigured: true, sessionConfigured: true, serverSideGate: true, betaImagesConfigured: true }) });
      w.alert = () => {};
      w.Response = Response;
      w.Headers = Headers;
      w.eval(fs.readFileSync('assets/js/ai-pdf-beta-r2.js', 'utf8'));
      await new Promise(resolve => w.setTimeout(resolve, 10));
      const ai = w.MileAI._test;
      assert.deepEqual([...d.querySelectorAll('#aiModel option')].map(option => option.value), catalog, page);
      assert.equal(ai.getConfig().model, catalog[0]);
      for (const model of catalog) {
        d.getElementById('aiModel').value = model;
        assert.equal(ai.getConfig().model, model, `${page}: ${model}`);
        const body = ai.buildApiBody({ model, cameraDirect: true }, 'Baca gambar', [{ page: 1, label: 'FOTO', url: imageUrl }], 1200);
        assert.equal(body.messages[1].content.find(part => part.type === 'image_url').image_url.url, imageUrl);
        if (model.startsWith('gpt-')) {
          assert.equal(body.response_format.type, 'json_object');
          assert.equal(body.reasoning_effort, 'low');
          assert.ok(body.max_completion_tokens >= 4096);
          for (const key of ['max_tokens', 'temperature', 'top_p']) assert.equal(key in body, false, `${model}: ${key}`);
        } else if (model === 'deepseek-v4.1-flash') {
          assert.equal(body.response_format.type, 'json_object');
          assert.equal('reasoning_effort' in body, false);
        } else if (model.startsWith('gemini-')) {
          assert.equal(body.response_format.type, 'json_schema');
        } else {
          for (const key of ['response_format', 'reasoning_effort', 'temperature', 'top_p']) assert.equal(key in body, false, `${model}: ${key}`);
        }
      }
      for (const model of removed) {
        d.getElementById('aiModel').value = model;
        assert.equal(ai.getConfig().model, catalog[0], 'Stale page/camera models return to Gemini 3.8');
      }
      const probe = ai.createOcrProbe();
      assert.match(probe.code, /^[A-HJ-NP-Z2-9]{6}$/);
      assert.equal(probe.prompt.includes(probe.code), false, 'The OCR answer is never supplied as text');
      assert.equal(ai.verifyOcrProbe(JSON.stringify({ code: probe.code }), probe.code), true);
      assert.equal(ai.verifyOcrProbe(JSON.stringify({ code: 'MILE38' }), probe.code), false);
      assert.equal(ai.verifyOcrProbe(`I can see ${probe.code}`, probe.code), false);
      assert.equal(ai.verifyOcrProbe(JSON.stringify({ code: `extra ${probe.code}` }), probe.code), false);
      assert.equal(ai.verifyOcrProbe('{"rows":[]}', probe.code), false);

      // Exercise the actual test button: a text-only response must fail, while
      // the correct image-only challenge passes. No provider traffic is made.
      let paintedCode, reply, request;
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, fillText(code) { paintedCode = code; } });
      w.HTMLCanvasElement.prototype.toBlob = function (callback) { callback(new w.Blob(['fixture'], { type: 'image/jpeg' })); };
      w.XMLHttpRequest = class {
        constructor() { this.upload = {}; }
        open() {} setRequestHeader() {} getResponseHeader() { return 'application/json'; }
        send(raw) {
          request = JSON.parse(raw).body;
          assert.equal(JSON.stringify(request.messages).includes(paintedCode), false);
          assert.equal('response_format' in request, false);
          w.setTimeout(() => { this.status = 200; this.responseText = JSON.stringify({ choices: [{ message: { content: JSON.stringify({ code: reply === 'correct' ? paintedCode : 'MILE38' }) } }] }); this.onload(); }, 0);
        }
      };
      d.getElementById('aiModel').value = 'gemini-3.8-flash';
      d.getElementById('aiNetworkMode').value = 'normal';
      reply = 'text-only';
      await w.MileAI.testConnection();
      assert.match(d.getElementById('aiConfigFeedback').textContent, /gagal|belum berhasil membaca gambar/i);
      reply = 'correct';
      await w.MileAI.testConnection();
      assert.match(d.getElementById('aiConfigFeedback').textContent, /Gambar berhasil dibaca/);
      d.getElementById('aiModel').value = 'gpt-6.1-sol';
      await w.MileAI.testConnection();
      assert.match(d.getElementById('aiConfigFeedback').textContent, /Gambar berhasil dibaca/);
      assert.equal(request.max_completion_tokens, 4096);
      assert.equal(request.reasoning_effort, 'low');
      assert.equal('max_tokens' in request, false);
    } finally { w.close(); }
  }
  console.log('PASS OCR catalog: 31 models, page/gateway parity, rejected aliases, preserved images, compatible vision requests and image-only probe');
});
