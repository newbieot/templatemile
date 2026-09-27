const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8');
const cameraHtml = fs.readFileSync(path.join(root, 'camera.html'), 'utf8');
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
  'glm-5.3-flashx',
  'glm-5.3',
  'glm-5.3-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash'
]) {
  element('aiModel').value = model;
  const config = ai.getConfig();
  assert.equal(config.model, model);
  assert.equal(config.cameraDirect, true);
  assert.equal(config.pagesPerRequest, 5);
  assert.equal(config.concurrency, 3);
  assert.equal(config.networkMode, 'normal');
  assert.equal(config.verificationPolicy, 'smart');
}

element('aiModel').value = 'model-tidak-diizinkan';
assert.equal(ai.getConfig().model, 'gemini-3.8-flash');
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash', cameraDirect: true }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.7-flash', cameraDirect: true }, { status: 503 }), false);

const sources = Array.from({ length: 15 }, (_, index) => ({
  page: index + 1,
  label: `GAMBAR ${index + 1}`,
  url: `data:image/jpeg;base64,${Buffer.from(String(index + 1)).toString('base64')}`
}));
const groups = [sources.slice(0, 5), sources.slice(5, 10), sources.slice(10, 15)];
const bodies = groups.map((group, index) => ai.buildApiBody({ model: 'glm-5.3-flashx' }, `uji kelompok ${index + 1}`, group, 3500));
assert.equal(bodies.length, 3);
assert.equal(bodies.reduce((total, body) => total + body.messages[1].content.filter(part => part.type === 'image_url').length, 0), 15);
bodies.forEach(body => {
  const content = body.messages[1].content;
  assert.equal(content.filter(part => part.type === 'image_url').length, 5);
  assert.equal(content.filter(part => part.type === 'text').length, 6);
});

assert.match(source, /betaRemoteImagesAvailable = !config\.cameraDirect/);
assert.match(source, /const testViaR2 = !config\.cameraDirect/);
assert.match(source, /const CAMERA_WAVE_SIZE = 15/);
assert.match(source, /const CAMERA_BATCH_SIZE = 5/);
assert.match(source, /const CAMERA_AI_CONCURRENCY = 3/);
assert.match(source, /activeAiLimit = Math\.max\(1, activeAiLimit - 1\)/);
assert.match(source, /const stagger = chunkIndex \* 1250/);
assert.match(source, /const CAMERA_DEFAULT_MODEL = 'gemini-3\.8-flash'/);
assert.match(source, /CAMERA_GEMINI_FALLBACK_CHAIN = Object\.freeze\(\[GEMINI_38_MODEL, PRIMARY_FALLBACK_MODEL\]\)/);
assert.match(source, /input=\$\{directCameraInput \? 'jpeg' : 'pdf'\}/);
assert.match(source, /cameraChunkBlobs = directCameraInput \? await prepareCameraBlobsForBatch/);
assert.match(source, /JPEG asli siap · belum mengirim gambar/);
assert.match(source, /directCameraInput \? null : await pdf\.getPage\(pageNumber\)/);
assert.match(source, /chunkTimings: publicChunkTimings/);
assert.match(cameraHtml, /gemini-3\.8-flash" selected/);
assert.match(cameraHtml, /gemini-3\.8-flash/);
assert.match(cameraHtml, /gemini-3\.7-flash/);
assert.match(reviewHtml, /value="gemini-3\.8-flash" selected/);
assert.match(reviewHtml, /id="aiPagesPerRequest"><option value="5" selected/);
assert.match(reviewHtml, /id="aiConcurrency"><option value="3" selected/);
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

console.log('PASS camera-direct-ai: JPEG tanpa PDF/R2, default Gemini 3.8 → fallback 3.7, dan gelombang 15 sebagai 3 request paralel × 5');
