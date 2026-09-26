const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8');
const cameraHtml = fs.readFileSync(path.join(root, 'camera.html'), 'utf8');
const reviewHtml = fs.readFileSync(path.join(root, 'review.html'), 'utf8');

const values = {
  aiModel: 'glm-5.3-flashx',
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
  assert.equal(config.pagesPerRequest, 15);
  assert.equal(config.concurrency, 1);
  assert.equal(config.networkMode, 'normal');
  assert.equal(config.verificationPolicy, 'none');
}

element('aiModel').value = 'model-tidak-diizinkan';
assert.equal(ai.getConfig().model, 'glm-5.3-flashx');

const sources = Array.from({ length: 15 }, (_, index) => ({
  page: index + 1,
  label: `GAMBAR ${index + 1}`,
  url: `data:image/jpeg;base64,${Buffer.from(String(index + 1)).toString('base64')}`
}));
const body = ai.buildApiBody({ model: 'glm-5.3-flashx' }, 'uji 15 gambar', sources, 5200);
const content = body.messages[1].content;
assert.equal(content.filter(part => part.type === 'image_url').length, 15);
assert.equal(content.filter(part => part.type === 'text').length, 16);

assert.match(source, /betaRemoteImagesAvailable = !config\.cameraDirect/);
assert.match(source, /const testViaR2 = !config\.cameraDirect/);
assert.match(source, /const CAMERA_BATCH_SIZE = 15/);
assert.match(source, /const CAMERA_DEFAULT_MODEL = 'glm-5\.3-flashx'/);
assert.match(source, /input=\$\{directCameraInput \? 'jpeg' : 'pdf'\}/);
assert.match(source, /cameraChunkBlobs = directCameraInput \? await prepareCameraBlobsForBatch/);
assert.match(source, /JPEG asli siap · belum mengirim gambar/);
assert.match(cameraHtml, /glm-5\.3-flashx" selected/);
assert.match(cameraHtml, /gemini-3\.8-flash/);
assert.match(cameraHtml, /gemini-3\.7-flash/);
assert.match(reviewHtml, /id="aiPagesPerRequest"><option value="15" selected/);
assert.match(reviewHtml, /id="aiConcurrency"><option value="1" selected/);
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

console.log('PASS camera-direct-ai: JPEG langsung tanpa PDF/R2, GLM/Gemini, default GLM 5.3 FlashX, dan 15 gambar per request');
