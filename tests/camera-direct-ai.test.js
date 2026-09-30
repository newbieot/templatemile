const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8');
const cameraHtml = fs.readFileSync(path.join(root, 'camera.html'), 'utf8');
const cameraRuntime = fs.readFileSync(path.join(root, 'assets/js/camera.js'), 'utf8');
const reviewHtml = fs.readFileSync(path.join(root, 'review.html'), 'utf8');

const values = {
  aiModel: 'gemini-3.8-flash',
  aiAccuracyMode: 'auto',
  aiSpeedPreset: 'fast',
  aiPagesPerRequest: '4',
  aiConcurrency: '5',
  aiNetworkMode: 'unstable'
};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) {
    elements.set(id, {
      value: values[id] || '',
      checked: false,
      disabled: false,
      hidden: false,
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
      focus() {}
    });
  }
  return elements.get(id);
};

const sandbox = {
  console,
  Intl,
  Date,
  Math,
  JSON,
  Map,
  Set,
  Headers,
  Response,
  Blob,
  AbortController,
  DOMException,
  TextEncoder,
  performance,
  navigator: { onLine: true },
  document: {
    body: { classList: { contains(name) { return name === 'camera-mode'; } } },
    addEventListener() {},
    getElementById(id) { return element(id); },
    querySelectorAll() { return []; }
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  alert() {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'ai-pdf-beta-r2.js' });

const ai = sandbox.MileAI._test;
assert.equal(ai.isCameraDirectMode(), true);
assert.equal(typeof sandbox.MileAI.processCameraImages, 'function');

const directJpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
const normalizedCameraImages = ai.normalizeCameraImages([{ blob: directJpeg, width: 1200, height: 800, fileName: '001.jpg' }]);
assert.equal(normalizedCameraImages.length, 1);
assert.equal(normalizedCameraImages[0].blob, directJpeg);
assert.equal(normalizedCameraImages[0].name, '001.jpg');

for (const model of [
  'deepseek-v4.1-flash',
  'gemini-3.8-flash',
  'gemini-3.1-pro',
  'gemini-3.7-flash'
]) {
  element('aiModel').value = model;
  const config = ai.getConfig();
  assert.equal(config.model, model);
  assert.equal(config.cameraDirect, true);
  assert.equal(config.pagesPerRequest, 7);
  assert.equal(config.concurrency, 7);
  assert.equal(config.networkMode, 'normal');
  assert.equal(config.verificationPolicy, 'low-confidence');
}

element('aiModel').value = 'model-tidak-diizinkan';
assert.equal(ai.getConfig().model, 'gemini-3.8-flash');
assert.equal(ai.isAutoFallbackEligible({ model: 'deepseek-v4.1-flash', cameraDirect: true }, { status: 503 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'deepseek-v4.1-flash', cameraDirect: true }, { status: 400 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash', cameraDirect: true }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash', cameraDirect: true }, { status: 400 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.1-pro', cameraDirect: true }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.7-flash', cameraDirect: true }, { status: 408 }), true);

const sources = Array.from({ length: 49 }, (_, index) => ({
  page: index + 1,
  label: `GAMBAR ${index + 1}`,
  url: `data:image/jpeg;base64,${Buffer.from(String(index + 1)).toString('base64')}`
}));
const groups = Array.from({ length: 7 }, (_, index) => sources.slice(index * 7, index * 7 + 7));
const bodies = groups.map((group, index) => ai.buildApiBody({ model: 'deepseek-v4.1-flash' }, `uji kelompok ${index + 1}`, group, 3500));
assert.equal(bodies.length, 7);
assert.equal(bodies.reduce((total, body) => total + body.messages[1].content.filter(part => part.type === 'image_url').length, 0), 49);
bodies.forEach((body, index) => {
  const content = body.messages[1].content;
  assert.equal(body.response_format.type, 'json_object');
  assert.equal('reasoning_effort' in body, false);
  assert.equal(content.filter(part => part.type === 'image_url').length, groups[index].length);
  assert.equal(content.filter(part => part.type === 'text').length, groups[index].length + 1);
});

assert.match(source, /betaRemoteImagesAvailable = !config\.cameraDirect/);
assert.match(source, /const testViaR2 = !config\.cameraDirect/);
assert.match(source, /const CAMERA_BATCH_SIZE = 7/);
assert.match(source, /const CAMERA_AI_CONCURRENCY = 7/);
assert.match(source, /config\.cameraDirect \? CAMERA_AI_CONCURRENCY : BETA_MAX_AI_CONCURRENCY/);
assert.match(source, /const AUDIT_AI_CONCURRENCY = 2/);
assert.match(source, /const CAMERA_DIRECT_BATCH_RAW_BYTES = 20 \* 1024 \* 1024/);
assert.match(source, /onError\(\{ error \}\)[\s\S]*?activeAiLimit = 1/);
assert.match(source, /config\.cameraDirect && \[429, 520\]\.includes\(timing\.errorStatus\)/);
assert.match(source, /const CAMERA_DEFAULT_MODEL = GEMINI_38_MODEL/);
assert.match(source, /CAMERA_FALLBACK_CHAIN = Object\.freeze\(\[GEMINI_38_MODEL, GEMINI_31_PRO_MODEL, PRIMARY_FALLBACK_MODEL, DEEPSEEK_R2_MODEL\]\)/);
assert.match(source, /const CAMERA_REQUEST_TIMEOUT_MS = 30 \* 1000/);
assert.match(source, /const CAMERA_MODEL_MAX_ATTEMPTS = 1/);
assert.match(source, /input=\$\{directCameraInput \? 'jpeg' : 'pdf'\}/);
assert.match(source, /cameraChunkBlobs = directCameraInput \? await prepareCameraBlobsForBatch/);
assert.match(source, /Foto asli siap · belum mengirim gambar/);
assert.match(source, /directCameraInput \? null : await pdf\.getPage\(pageNumber\)/);
assert.match(source, /chunkTimings: publicChunkTimings/);
assert.doesNotMatch(cameraHtml, /id="(?:aiModelSelect|cameraAiModel)"|Model AI \(Vision\)/);
assert.match(cameraRuntime, /const DEFAULT_AI_MODEL = 'gemini-3\.8-flash'/);
assert.match(cameraRuntime, /aiModel: DEFAULT_AI_MODEL/);
assert.match(reviewHtml, /value="gemini-3\.8-flash" selected/);
assert.match(reviewHtml, /id="aiPagesPerRequest"><option value="7" selected/);
assert.match(reviewHtml, /id="aiConcurrency"><option value="7" selected/);
for (const requiredProgressId of [
  'aiProgressModal',
  'aiProgressStep',
  'aiProgressMessage',
  'aiProgressBar',
  'aiProgressPercent',
  'aiProgressUsage',
  'aiElapsedTime',
  'aiElapsedRate',
  'aiTransferStatus',
  'aiTransferPercent',
  'aiTransferBar',
  'aiProgressPages',
  'aiProgressChunks',
  'aiProgressNetwork',
  'aiProgressActivity'
]) {
  assert.match(reviewHtml, new RegExp(`id="${requiredProgressId}"`), `review.html harus menyediakan #${requiredProgressId}`);
}
assert.doesNotMatch(reviewHtml, /id="aiModal"/);
assert.match(source, /const modal = \$\('aiProgressModal'\)/);

async function runQualityAssertions() {
  const webp = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'image/webp' });
  const mixed = ai.normalizeCameraImages([{ blob: webp, width: 3200, height: 2400 }, { blob: directJpeg, fileName: '002.jpg' }]);
  assert.equal(mixed[0].name, '001.webp');
  assert.equal(mixed[1].name, '002.jpg');
  const mixedPrepared = await ai.prepareCameraBlobsForBatch(mixed);
  assert.equal(mixedPrepared[0], webp);
  assert.equal(mixedPrepared[1], directJpeg);
  const webpUrl = `data:image/webp;base64,${Buffer.from(await webp.arrayBuffer()).toString('base64')}`;
  const webpBody = ai.buildApiBody({ model: 'gemini-3.8-flash' }, 'uji webp', [{ page: 1, label: 'GAMBAR 1', url: webpUrl }], 1200);
  assert.equal(webpBody.messages[1].content.find(part => part.type === 'image_url').image_url.url, webpUrl);
  const cameraGeminiBody = ai.buildApiBody({ model: 'gemini-3.8-flash', cameraDirect: true }, 'uji schema kamera', [{ page: 1, label: 'GAMBAR 1', url: webpUrl }], 1200);
  const cameraRowSchema = cameraGeminiBody.response_format.json_schema.schema.properties.rows.items;
  assert.equal(cameraGeminiBody.response_format.type, 'json_schema');
  assert.ok(cameraRowSchema.required.includes('confidence'));
  assert.equal(cameraGeminiBody.reasoning_effort, 'medium');
  // Original high-resolution camera images must reach AI byte-for-byte,
  // Preserve a legacy five-photo subset byte-for-byte when it fits the gateway.
  const largeJpeg = new Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'image/jpeg' });
  const originals = ai.normalizeCameraImages(Array.from({ length: 5 }, () => ({ blob: largeJpeg, width: 4096, height: 3072 })));
  const prepared = await ai.prepareCameraBlobsForBatch(originals);
  prepared.forEach(blob => assert.equal(blob, largeJpeg));
  const sevenOriginals = ai.normalizeCameraImages(Array.from({ length: 7 }, () => ({ blob: webp, width: 3200, height: 2400 })));
  const sevenPrepared = await ai.prepareCameraBlobsForBatch(sevenOriginals);
  assert.equal(sevenPrepared.length, 7);
  sevenPrepared.forEach(blob => assert.equal(blob, webp));
  const dataUrl = `data:image/jpeg;base64,${Buffer.alloc(largeJpeg.size).toString('base64')}`;
  const maxBody = ai.buildApiBody({ model: 'gemini-3.8-flash' }, 'uji foto resolusi tinggi', Array.from({ length: 5 }, (_, index) => ({ page: index + 1, label: `GAMBAR ${index + 1}`, url: dataUrl })), 3500);
  assert.ok(Buffer.byteLength(JSON.stringify({ body: maxBody })) < 28 * 1024 * 1024 - 64 * 1024);
  await runFallbackAssertions();
  console.log('PASS camera-direct-ai: JPEG preserved, gateway budget, 7 × 7, ordered timeout fallback, shared deadline');
}

async function runFallbackAssertions() {
  const models = ['gemini-3.8-flash', 'gemini-3.1-pro', 'gemini-3.7-flash', 'deepseek-v4.1-flash'];
  const requests = [];
  let responses = ['timeout', 'timeout', 'timeout', 'success', 'success'];
  let clockMs = 1000;
  sandbox.performance = { now: () => clockMs };
  sandbox.XMLHttpRequest = class {
    constructor() { this.upload = {}; }
    open() {}
    setRequestHeader() {}
    getResponseHeader() { return ''; }
    abort() { this.onabort?.(); }
    send(raw) {
      const request = JSON.parse(raw);
      requests.push({ model: request.body.model, timeout: this.timeout, profile: request.requestProfile });
      assert.ok(this.timeout > 0 && this.timeout <= 30000);
      const response = responses.shift();
      setTimeout(() => {
        if (response === 'timeout') {
          clockMs += this.timeout;
          this.ontimeout();
        } else if (response === 'schema') {
          clockMs += 22000;
          this.status = 400;
          this.responseText = JSON.stringify({ error: { message: 'response_format json_schema unsupported' } });
          this.onload();
        } else {
          this.status = 200;
          this.responseText = JSON.stringify({ choices: [{ message: { content: '{"rows":[{"page":1,"nama":"Uji","alamat":"Batam"}]}' } }] });
          this.onload();
        }
      }, 0);
    }
  };
  const config = { model: models[0], cameraDirect: true, protocol: 'openai', cameraModelState: { blocked: new Set(), errors: new Map() } };
  const body = ai.buildApiBody(config, 'uji timeout kamera', sources.slice(0, 7), 3500);
  const payload = await ai.callProxyWithRetry(config, body);
  assert.deepEqual(requests.map(request => request.model), models);
  assert.ok(requests.every(request => request.profile === 'camera'));
  assert.equal(payload._mileEffectiveModel, models[3]);
  assert.deepEqual(Array.from(payload._mileFallbackChain), models);
  await ai.callProxyWithRetry(config, body);
  assert.equal(requests.at(-1).model, models[3], 'Queued groups skip timed-out models');

  responses = ['schema', 'timeout', 'success'];
  const freshConfig = { ...config, cameraModelState: { blocked: new Set(), errors: new Map() } };
  const start = requests.length;
  const compatible = await ai.callProxyWithRetry(freshConfig, body);
  assert.deepEqual(requests.slice(start).map(request => request.model), [models[0], models[0], models[1]]);
  assert.equal(requests[start + 1].timeout, 8000, 'Compatibility retry shares the model 30-second budget');
  assert.equal(requests[start + 2].timeout, 30000, 'Next model gets a fresh 30-second budget');
  assert.equal(compatible._mileEffectiveModel, models[1]);

  responses = ['timeout', 'timeout', 'timeout', 'timeout'];
  const failureStart = requests.length;
  await assert.rejects(ai.callProxyWithRetry({ ...freshConfig, cameraModelState: { blocked: new Set(), errors: new Map() } }, body), error => error.status === 408);
  assert.deepEqual(requests.slice(failureStart).map(request => request.model), models, 'Stop after the last fallback times out');
}
runQualityAssertions().catch(error => { console.error(error); process.exitCode = 1; });
