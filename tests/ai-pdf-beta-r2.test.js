const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const fakeElement = {
  value: '',
  checked: false,
  disabled: false,
  hidden: false,
  style: {},
  classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {},
  setAttribute() {},
  removeAttribute() {},
  focus() {}
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
    addEventListener() {},
    getElementById() { return fakeElement; },
    querySelectorAll() { return []; }
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  sessionStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  alert() {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
sandbox.window = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/app-core.js'), 'utf8'), sandbox, {
  filename: 'app-core.js'
});
const aiRuntimeSource = fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8');
const betaHtmlSource = fs.readFileSync(path.join(root, 'beta.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
vm.runInContext(aiRuntimeSource, sandbox, {
  filename: 'ai-pdf-beta-r2.js'
});

const core = sandbox.__mileCore;
const ai = sandbox.MileAI._test;

sandbox.navigator.onLine = false;
assert.equal(ai.resolveNetworkProfile('normal').key, 'normal');
assert.doesNotMatch(aiRuntimeSource, /while \(navigator\.onLine === false\)/);
assert.doesNotMatch(aiRuntimeSource, /probeRemoteImageSupport/);
assert.match(aiRuntimeSource, /fast: \{ pagesPerRequest: 15, concurrency: 5/);
assert.match(aiRuntimeSource, /Math\.min\(15, Number\(\$\('aiPagesPerRequest'\)/);
assert.match(aiRuntimeSource, /Math\.min\(BETA_MAX_AI_CONCURRENCY, Number\(\$\('aiConcurrency'\)/);
assert.match(aiRuntimeSource, /normal: \{\s*key: 'normal', label: 'Turbo langsung', maxPagesPerRequest: 15, maxConcurrency: BETA_MAX_AI_CONCURRENCY/);
assert.match(aiRuntimeSource, /const STORAGE_KEY = 'mile-ai-config-beta-r2-v8'/);
assert.match(aiRuntimeSource, /const DEFAULT_MODEL = DEEPSEEK_R2_MODEL/);
assert.match(aiRuntimeSource, /const FIRST_PASS_MAX_SIDE = 1150/);
assert.match(aiRuntimeSource, /const FIRST_PASS_JPEG_QUALITY = 0\.72/);
assert.match(aiRuntimeSource, /const BETA_PREPARE_CONCURRENCY = 2/);
assert.match(aiRuntimeSource, /const BETA_INITIAL_AI_CONCURRENCY = 5/);
assert.match(aiRuntimeSource, /const BETA_MAX_AI_CONCURRENCY = 5/);
assert.match(aiRuntimeSource, /const GEMINI_REQUEST_TIMEOUT_MS = 75 \* 1000/);
assert.match(aiRuntimeSource, /const GEMINI_MAX_ATTEMPTS = 2/);
assert.match(aiRuntimeSource, /const GEMINI_RETRY_DELAY_MS = 500/);
assert.match(aiRuntimeSource, /while \(inFlight\.size >= activeAiLimit\)/);
assert.match(aiRuntimeSource, /activeAiLimit = workerCount/);
assert.match(aiRuntimeSource, /const PRIMARY_FALLBACK_MODEL = 'gemini-3\.7-flash'/);
assert.match(aiRuntimeSource, /const SECONDARY_FALLBACK_MODEL = 'gemini-3\.6-flash'/);
assert.match(aiRuntimeSource, /Object\.freeze\(\[GEMINI_38_MODEL, PRIMARY_FALLBACK_MODEL, SECONDARY_FALLBACK_MODEL\]\)/);
assert.doesNotMatch(aiRuntimeSource, /AUTO_FALLBACK_MODEL = 'qwen/);
assert.match(aiRuntimeSource, /const DEEPSEEK_R2_MODEL = 'deepseek-v4\.1-flash'/);
assert.match(aiRuntimeSource, /return publicUrl \? payload\.url : \(payload\.ref \|\| payload\.url\)/);
assert.match(aiRuntimeSource, /if \(publicR2Experiment\) \{\s*const strictR2Error = new Error/);
assert.equal((aiRuntimeSource.match(/if \(publicR2Experiment \|\| !isR2BridgeFailure\(error\)/g) || []).length, 2);
assert.doesNotMatch(aiRuntimeSource, /runtimeFallbackModel/);
assert.equal((aiRuntimeSource.match(/betaRemoteImagesAvailable = false/g) || []).length, 1);
assert.match(aiRuntimeSource, /betaRemoteImagesAvailable = \(publicR2Experiment \|\| config\.networkProfile\.key === 'unstable'\) && lastBetaImagesConfigured/);
assert.match(aiRuntimeSource, /const audits = pendingAudits\.filter\(Boolean\)/);
assert.match(aiRuntimeSource, /for \(const audit of audits\)/);
assert.match(betaHtmlSource, /Turbo langsung · 15 halaman × 5 jalur · Default/);
assert.match(betaHtmlSource, /Secure Gateway · Beta v16\.40/);
assert.match(betaHtmlSource, /<option value="gemini-3\.8-flash">Gemini 3\.8 Flash · Pilihan manual<\/option>/);
assert.match(betaHtmlSource, /<option value="gemini-3\.7-flash">Gemini 3\.7 Flash · Fallback pertama<\/option>/);
assert.match(betaHtmlSource, /<option value="gemini-3\.6-flash">Gemini 3\.6 Flash · Fallback kedua<\/option>/);
assert.match(betaHtmlSource, /<option value="deepseek-v4\.1-flash" selected>DeepSeek V4\.1 Flash · Default Beta · R2 URL<\/option>/);
assert.match(betaHtmlSource, /<option value="qwen-3\.7-flash">Qwen 3\.7 Flash · Eksperimen Hemat<\/option>/);
assert.match(betaHtmlSource, /<option value="15" selected>15 halaman · preset Turbo<\/option>/);
assert.match(betaHtmlSource, /<option value="5" selected>5 jalur · preset Turbo<\/option>/);
assert.match(aiRuntimeSource, /createBetaProbeBlob/);
assert.match(workerSource, /const BETA_IMAGE_REFERENCE_PREFIX = 'mile-r2:'/);
assert.match(workerSource, /'deepseek-v4\.1-flash'/);
assert.match(workerSource, /async function hydrateBetaImageReferences/);
assert.match(workerSource, /item\.imageUrl\.url = `data:\$\{contentType\};base64,/);
assert.match(workerSource, /'x-mile-transport': 'cloudflare-r2-bridge'/);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 404 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 503, details: { error: { source: 'r2-bridge' } } }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 401 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.7-flash' }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.6-flash' }, { status: 503 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'qwen-3.7-flash' }, { status: 503 }), false);
sandbox.navigator.onLine = true;

assert.equal(core.cleanRecipientName('FAHRUDIN 0028C20250400784'), 'FAHRUDIN');
assert.equal(core.cleanRecipientName('ANDI AB12-3456789'), 'ANDI');
assert.equal(core.cleanRecipientName('SITI NUR AINI'), 'SITI NUR AINI');

const normalizeOne = input => ai.normalizeRows([input], 'MANUAL', 0, { expectedPages: [1] })[0];

assert.equal(core.resolveZipCode('KEL. SADAI, KEC. BENGKONG, BATAM 29457', 'MANUAL'), '29426');
assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'PENERIMA',
  alamat_penerima: 'KEL. SADAI, KEC. BENGKONG, BATAM 29457'
}).zip, '29426');

assert.deepEqual(
  { name: normalizeOne({
    page: 1,
    nama_penerima: 'FAHRUDIN 0028C20250400784',
    alamat_penerima: 'JL MERDEKA BATAM 29444',
    nomor_surat: 'Perihal: Surat Pemberitahuan (SP1)'
  }).name },
  { name: 'FAHRUDIN' }
);

assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'FAHRUDIN',
  alamat_penerima: 'JL MERDEKA BATAM 29444',
  nomor_surat: 'Perihal: Surat Pemberitahuan (SP1)'
}).noSurat, 'SURAT PEMBERITAHUAN (SP1)');

assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'FAHRUDIN',
  alamat_penerima: 'JL MERDEKA BATAM 29444',
  nomor_surat: '123/ABC',
  perihal: 'Penagihan dan Peringatan Terakhir'
}).noSurat, '123/ABC');

assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'PT BATAM INDAH PERTIWI',
  alamat_penerima: 'KOMPLEK RUKO DC MALL NOMOR 12.A SEI JODOH KOTA BATAM 29432',
  nomor_surat: 'Nomor: 3166 /PAN.01.W32-U2/HK2. 4/VII/2026',
  perihal: 'Panggilan Sidang'
}).noSurat, '3166/PAN.01.W32-U2/HK2.4/VII/2026');

assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'FAHRUDIN',
  alamat_penerima: 'JL MERDEKA BATAM 29444',
  nomor_surat: '123/ABC'
}).noSurat, '123/ABC');

assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'FAHRUDIN',
  alamat_penerima: 'JL MERDEKA BATAM 29444',
  raw_lines: ['Perihal Penagihan dan Peringatan Terakhir']
}).noSurat, 'PENAGIHAN DAN PERINGATAN TERAKHIR');

assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'FAHRUDIN',
  alamat_penerima: 'JL MERDEKA BATAM 29444',
  raw_lines: ['Perihal:', 'Penagihan dan Peringatan Terakhir']
}).noSurat, 'PENAGIHAN DAN PERINGATAN TERAKHIR');

assert.equal(normalizeOne({
  page: 1,
  nama_penerima: 'PT BATAM INDAH PERTIWI',
  alamat_penerima: 'KOMPLEK RUKO DC MALL NOMOR 12.A SEI JODOH KOTA BATAM 29432',
  raw_lines: [
    'Nomor : 3166 /PAN.01.W32-U2/HK2. 4/VII/2026',
    'Jenis Surat',
    'No. 261/Pdt.G/2026/PN Btm'
  ]
}).noSurat, '3166/PAN.01.W32-U2/HK2.4/VII/2026');

const originalRow = normalizeOne({
  page: 1,
  nama_penerima: 'FAHRUDIN',
  alamat_penerima: 'JL MERDEKA BATAM 29444',
  nomor_surat: 'Perihal: Surat Pemberitahuan (SP1)'
});
const verifiedWithoutSubject = normalizeOne({
  page: 1,
  nama_penerima: 'FAHRUDIN',
  alamat_penerima: 'JL MERDEKA BATAM 29444',
  nomor_surat: ''
});
assert.equal(
  ai.mergeVerifiedRows([originalRow], [verifiedWithoutSubject], [1])[0].noSurat,
  'SURAT PEMBERITAHUAN (SP1)'
);

const officialNumberRow = normalizeOne({
  page: 1,
  nama_penerima: 'PT BATAM INDAH PERTIWI',
  alamat_penerima: 'KOMPLEK RUKO DC MALL NOMOR 12.A SEI JODOH KOTA BATAM 29432',
  nomor_surat: '3166/PAN.01.W32-U2/HK2.4/VII/2026'
});
const verifiedWithDocumentType = normalizeOne({
  page: 1,
  nama_penerima: 'PT BATAM INDAH PERTIWI',
  alamat_penerima: 'KOMPLEK RUKO DC MALL NOMOR 12.A SEI JODOH KOTA BATAM 29432',
  nomor_surat: 'Panggilan Sidang'
});
assert.equal(
  ai.mergeVerifiedRows([officialNumberRow], [verifiedWithDocumentType], [1])[0].noSurat,
  '3166/PAN.01.W32-U2/HK2.4/VII/2026'
);

const prompt = ai.buildPrompt(1, 1);
assert.match(prompt, /FAHRUDIN 0028C20250400784/);
assert.match(prompt, /Perihal: Surat Pemberitahuan \(SP1\)/);
assert.match(prompt, /Penagihan dan Peringatan Terakhir/);
assert.match(prompt, /3166\/PAN\.01\.W32-U2\/HK2\.4\/VII\/2026/);

const gemini38Body = ai.buildApiBody(
  { model: 'gemini-3.8-flash' },
  'uji',
  [],
  1200
);
assert.equal(gemini38Body.model, 'gemini-3.8-flash');
assert.equal(gemini38Body.response_format.type, 'json_object');
assert.equal('temperature' in gemini38Body, false);
assert.equal('top_p' in gemini38Body, false);

const remoteImageUrl = 'mile-r2:signed-token';
const remoteImageBody = ai.buildApiBody(
  { model: 'gemini-3.8-flash' },
  'uji URL gambar',
  [{ page: 7, label: 'HALAMAN 7', url: remoteImageUrl }],
  1200
);
const remoteImageContent = remoteImageBody.messages[1].content;
assert.equal(remoteImageContent[1].text, 'HALAMAN 7');
assert.equal(remoteImageContent[2].type, 'image_url');
assert.equal(remoteImageContent[2].image_url.url, remoteImageUrl);

const fallbackDataUrl = `data:image/jpeg;base64,${'A'.repeat(4096)}`;
const fallbackBody = ai.buildApiBody(
  { model: 'gemini-3.8-flash' },
  'uji fallback',
  [{ page: 8, dataUrl: fallbackDataUrl }],
  1200
);
assert.equal(fallbackBody.messages[1].content[2].image_url.url, fallbackDataUrl);
assert.ok(JSON.stringify(remoteImageBody).length < JSON.stringify(fallbackBody).length / 8);

const gemini37Body = ai.buildApiBody(
  { model: 'gemini-3.7-flash' },
  'uji',
  [],
  1200
);
assert.equal(gemini37Body.temperature, 0);
assert.equal(gemini37Body.top_p, 0.1);

const gemini38RepairBody = ai.buildJsonRepairBody(
  { model: 'gemini-3.8-flash' },
  '{"rows":['
);
assert.equal('temperature' in gemini38RepairBody, false);
assert.equal('top_p' in gemini38RepairBody, false);

const taskPool = ai.createTaskPool(2);
let activeTasks = 0;
let peakTasks = 0;
const poolJobs = Array.from({ length: 6 }, () => taskPool(async () => {
  activeTasks++;
  peakTasks = Math.max(peakTasks, activeTasks);
  await new Promise(resolve => setTimeout(resolve, 5));
  activeTasks--;
}));

async function runAsyncAssertions() {
  await Promise.all(poolJobs);
  assert.equal(peakTasks, 2);

  const responses = [
    { status: 404, body: { error: { message: 'No active credentials for provider: antigravity' } } },
    { status: 404, body: { error: { message: 'No active credentials for provider: antigravity' } } },
    { status: 503, body: { error: { message: 'Gemini 3.7 temporarily unavailable' } } },
    { status: 503, body: { error: { message: 'Gemini 3.7 temporarily unavailable' } } },
    { status: 200, body: { choices: [{ message: { content: '{"rows":[]}' } }] } },
    { status: 200, body: { choices: [{ message: { content: '{"rows":[]}' } }] } }
  ];
  const requestedModels = [];
  sandbox.XMLHttpRequest = class FakeXMLHttpRequest {
    constructor() {
      this.upload = {};
      this.readyState = 0;
      this.status = 0;
      this.statusText = '';
      this.responseText = '';
    }
    open() {}
    setRequestHeader() {}
    getResponseHeader(name) { return name.toLowerCase() === 'content-type' ? 'application/json' : ''; }
    abort() { this.onabort?.(); }
    send(rawBody) {
      const request = JSON.parse(rawBody);
      requestedModels.push(request.body.model);
      const response = responses.shift();
      setTimeout(() => {
        this.upload.onloadstart?.();
        this.upload.onload?.();
        this.status = response.status;
        this.responseText = JSON.stringify(response.body);
        this.readyState = 2;
        this.onreadystatechange?.();
        this.readyState = 4;
        this.onload?.();
      }, 0);
    }
  };

  const config = { model: 'gemini-3.8-flash', protocol: 'openai' };
  const body = ai.buildApiBody(config, 'uji fallback per kelompok', [], 1200);
  let fallbackEvents = 0;
  const firstPayload = await ai.callProxyWithRetry(config, body, 'kelompok pertama', {
    onFallback() { fallbackEvents++; }
  });
  assert.equal(firstPayload._mileEffectiveModel, 'gemini-3.6-flash');
  assert.deepEqual(Array.from(firstPayload._mileFallbackChain), ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
  assert.equal(fallbackEvents, 2);

  const secondPayload = await ai.callProxyWithRetry(config, body, 'kelompok kedua');
  assert.equal(secondPayload._mileEffectiveModel, 'gemini-3.8-flash');
  assert.deepEqual(requestedModels, [
    'gemini-3.8-flash', 'gemini-3.8-flash',
    'gemini-3.7-flash', 'gemini-3.7-flash',
    'gemini-3.6-flash', 'gemini-3.8-flash'
  ]);

  console.log('PASS ai-pdf-beta-r2: DeepSeek R2 URL default, render ringan 2 jalur, AI 15 × 5, dan fallback Gemini 3.8 → 3.7 → 3.6');
}

runAsyncAssertions().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
