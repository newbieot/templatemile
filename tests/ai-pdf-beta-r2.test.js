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

sandbox.document.body = { dataset: { pdfDefaultModel: 'gemini-3.8-flash' } };
assert.equal(ai.pageDefaultModel(), 'gemini-3.8-flash');
sandbox.document.body = { dataset: { pdfDefaultModel: 'model-tidak-valid' } };
assert.equal(ai.pageDefaultModel(), 'gemini-3.8-flash');
delete sandbox.document.body;

sandbox.navigator.onLine = false;
assert.equal(ai.resolveNetworkProfile('normal').key, 'normal');
assert.doesNotMatch(aiRuntimeSource, /while \(navigator\.onLine === false\)/);
assert.doesNotMatch(aiRuntimeSource, /probeRemoteImageSupport/);
assert.match(aiRuntimeSource, /fast: \{ pagesPerRequest: 15, concurrency: 5/);
assert.match(aiRuntimeSource, /Math\.min\(15, Number\(\$\('aiPagesPerRequest'\)/);
assert.match(aiRuntimeSource, /Math\.min\(BETA_MAX_AI_CONCURRENCY, Number\(\$\('aiConcurrency'\)/);
assert.match(aiRuntimeSource, /normal: \{\s*key: 'normal', label: 'Turbo langsung', maxPagesPerRequest: 15, maxConcurrency: BETA_MAX_AI_CONCURRENCY/);
assert.match(aiRuntimeSource, /const STORAGE_KEY = 'mile-ai-config-beta-r2-v10'/);
assert.match(aiRuntimeSource, /const DEFAULT_MODEL = GEMINI_38_MODEL/);
assert.match(aiRuntimeSource, /const FIRST_PASS_MAX_SIDE = 1150/);
assert.match(aiRuntimeSource, /const FIRST_PASS_JPEG_QUALITY = 0\.72/);
assert.match(aiRuntimeSource, /const BETA_PREPARE_CONCURRENCY = 2/);
assert.match(aiRuntimeSource, /const BETA_INITIAL_AI_CONCURRENCY = 5/);
assert.match(aiRuntimeSource, /const BETA_MAX_AI_CONCURRENCY = 5/);
assert.match(aiRuntimeSource, /const GEMINI_MAX_PAGES_PER_REQUEST = 15/);
assert.match(aiRuntimeSource, /const GEMINI_MAX_AI_CONCURRENCY = 3/);
assert.match(aiRuntimeSource, /const GEMINI_REASONING_EFFORT = 'medium'/);
assert.match(aiRuntimeSource, /const AUDIT_AI_CONCURRENCY = 2/);
assert.match(aiRuntimeSource, /const GEMINI_REQUEST_TIMEOUT_MS = 135 \* 1000/);
assert.match(aiRuntimeSource, /const GEMINI_MAX_ATTEMPTS = 2/);
assert.match(aiRuntimeSource, /const GEMINI_RETRY_DELAY_MS = 500/);
assert.match(aiRuntimeSource, /while \(inFlight\.size >= activeAiLimit\)/);
assert.match(aiRuntimeSource, /activeAiLimit = workerCount/);
assert.match(aiRuntimeSource, /const PRIMARY_FALLBACK_MODEL = DEEPSEEK_MODEL/);
assert.match(aiRuntimeSource, /const OCR_FALLBACK_CHAIN = CAMERA_FALLBACK_CHAIN/);
assert.match(aiRuntimeSource, /Object\.freeze\(\[GEMINI_38_MODEL, DEEPSEEK_MODEL\]\)/);
assert.doesNotMatch(aiRuntimeSource, /AUTO_FALLBACK_MODEL = 'qwen/);
assert.doesNotMatch(aiRuntimeSource, /DEEPSEEK_R2_MODEL/);
assert.match(aiRuntimeSource, /return publicUrl \? payload\.url : \(payload\.ref \|\| payload\.url\)/);
assert.doesNotMatch(aiRuntimeSource, /publicR2Experiment/);
assert.equal((aiRuntimeSource.match(/if \(!isR2BridgeFailure\(error\)/g) || []).length, 2);
assert.doesNotMatch(aiRuntimeSource, /runtimeFallbackModel/);
assert.equal((aiRuntimeSource.match(/betaRemoteImagesAvailable = false/g) || []).length, 1);
assert.match(aiRuntimeSource, /betaRemoteImagesAvailable = !config\.cameraDirect && config\.networkProfile\.key === 'unstable' && lastBetaImagesConfigured/);
assert.match(aiRuntimeSource, /const audits = pendingAudits\.filter\(Boolean\)/);
assert.match(aiRuntimeSource, /const runAudit = createTaskPool\(auditWorkerCount\)/);
assert.match(aiRuntimeSource, /Promise\.all\(audits\.map\(audit => runAudit/);
assert.match(betaHtmlSource, /Turbo langsung · Gemini 15 halaman × 3 jalur · Default/);
assert.match(betaHtmlSource, /Secure Gateway · Beta v26\.57/);
assert.match(betaHtmlSource, /<option value="gemini-3\.8-flash" selected>Gemini 3\.8 Flash · Default OCR<\/option>/);
assert.match(betaHtmlSource, /<option value="deepseek-v4\.1-flash">DeepSeek V4\.1 Flash · Fallback otomatis<\/option>/);
assert.doesNotMatch(betaHtmlSource, /value="(?:qwen|glm|gemini-3\.[1567])/);
assert.match(betaHtmlSource, /<option value="15" selected>15 halaman · preset Turbo<\/option>/);
assert.match(betaHtmlSource, /<option value="3" selected>3 jalur · preset Gemini<\/option>/);
assert.match(aiRuntimeSource, /createBetaProbeBlob/);
assert.match(workerSource, /const BETA_IMAGE_REFERENCE_PREFIX = 'mile-r2:'/);
assert.match(workerSource, /'claude-haiku-5\.5'/);
assert.match(workerSource, /async function hydrateBetaImageReferences/);
assert.match(workerSource, /item\.imageUrl\.url = `data:\$\{contentType\};base64,/);
assert.match(workerSource, /'x-mile-transport': 'cloudflare-r2-bridge'/);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 404 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 503, details: { error: { source: 'r2-bridge' } } }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 401 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'claude-haiku-5.5' }, { status: 503 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'deepseek-v4.1-flash' }, { status: 503 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'claude-sonnet-5' }, { status: 503 }), false);
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
assert.equal(gemini38Body.response_format.type, 'json_schema');
assert.equal(gemini38Body.response_format.json_schema.strict, true);
assert.deepEqual(
  Array.from(gemini38Body.response_format.json_schema.schema.required),
  ['rows']
);
assert.equal(gemini38Body.temperature, undefined);
assert.equal(gemini38Body.top_p, undefined);
assert.equal('temperature' in gemini38Body, false);
assert.equal('top_p' in gemini38Body, false);
assert.equal(gemini38Body.reasoning_effort, 'medium');

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
assert.ok(JSON.stringify(fallbackBody).length - JSON.stringify(remoteImageBody).length > 3000);

const claudeBody = ai.buildApiBody(
  { model: 'claude-haiku-5.5' },
  'uji',
  [],
  1200
);
assert.equal(claudeBody.response_format, undefined);
assert.equal(claudeBody.temperature, undefined);
assert.equal(claudeBody.top_p, undefined);
assert.equal(claudeBody.reasoning_effort, undefined);

const gemini38RepairBody = ai.buildJsonRepairBody(
  { model: 'gemini-3.8-flash' },
  '{"rows":['
);
assert.equal('temperature' in gemini38RepairBody, false);
assert.equal('top_p' in gemini38RepairBody, false);
assert.equal(gemini38RepairBody.response_format.type, 'json_schema');
assert.equal(gemini38RepairBody.reasoning_effort, 'medium');

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
    { status: 200, body: { choices: [{ message: { content: '{"rows":[]}' } }] } },
    { status: 200, body: { choices: [{ message: { content: '{"rows":[]}' } }] } }
  ];
  const requestedModels = [];
  const requestedResponseFormats = [];
  const requestedReasoningEfforts = [];
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
      requestedResponseFormats.push(request.body.response_format?.type);
      requestedReasoningEfforts.push(request.body.reasoning_effort);
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
  assert.equal(firstPayload._mileEffectiveModel, 'deepseek-v4.1-flash');
  assert.deepEqual(Array.from(firstPayload._mileFallbackChain), ['gemini-3.8-flash', 'deepseek-v4.1-flash']);
  assert.equal(fallbackEvents, 1);

  const secondPayload = await ai.callProxyWithRetry(config, body, 'kelompok kedua');
  assert.equal(secondPayload._mileEffectiveModel, 'gemini-3.8-flash');
  assert.deepEqual(requestedModels, [
    'gemini-3.8-flash', 'gemini-3.8-flash',
    'deepseek-v4.1-flash', 'gemini-3.8-flash'
  ]);

  responses.push(
    { status: 400, body: { error: { message: 'response_format json_schema is not supported' } } },
    { status: 200, body: { choices: [{ message: { content: '{"rows":[]}' } }] } }
  );
  let structuredFallbackEvents = 0;
  const compatibilityPayload = await ai.callProxyWithRetry(
    config,
    ai.buildApiBody(config, 'uji fallback schema', [], 1200),
    'kompatibilitas schema',
    { onStructuredFallback() { structuredFallbackEvents++; } }
  );
  assert.equal(compatibilityPayload._mileEffectiveModel, 'gemini-3.8-flash');
  assert.equal(structuredFallbackEvents, 1);
  assert.deepEqual(requestedModels.slice(-2), ['gemini-3.8-flash', 'gemini-3.8-flash']);
  assert.deepEqual(requestedResponseFormats.slice(-2), ['json_schema', undefined]);

  responses.push({ status: 400, body: { error: { message: 'invalid image payload' } } });
  const unrelatedBadRequestStart = requestedModels.length;
  await assert.rejects(
    ai.callProxyWithRetry(
      { model: 'claude-haiku-5.5', protocol: 'openai' },
      ai.buildApiBody({ model: 'claude-haiku-5.5', protocol: 'openai' }, 'uji 400 lain', [], 1200),
      'bad request non-schema'
    ),
    error => error?.status === 400 && /invalid image payload/i.test(error.message)
  );
  assert.equal(requestedModels.length - unrelatedBadRequestStart, 1);
  assert.equal(requestedResponseFormats.at(-1), undefined);

  responses.push(
    { status: 400, body: { error: { message: 'reasoning_effort medium is not supported by this route' } } },
    { status: 200, body: { choices: [{ message: { content: '{"rows":[]}' } }] } }
  );
  let reasoningFallbackEvents = 0;
  const reasoningPayload = await ai.callProxyWithRetry(
    { model: 'gemini-3.8-flash', protocol: 'openai' },
    ai.buildApiBody({ model: 'gemini-3.8-flash', protocol: 'openai' }, 'uji fallback reasoning', [], 1200),
    'kompatibilitas reasoning',
    { onReasoningFallback() { reasoningFallbackEvents++; } }
  );
  assert.equal(reasoningPayload._mileEffectiveModel, 'gemini-3.8-flash');
  assert.equal(reasoningFallbackEvents, 1);
  assert.deepEqual(requestedReasoningEfforts.slice(-2), ['medium', undefined]);
  assert.deepEqual(requestedResponseFormats.slice(-2), [undefined, undefined]);

  for (const address of ['BELAKANG PADANG KOTA BATAM 29491', 'BELAKANGPADANG BATAM', '29492']) {
    assert.equal(ai.classifyOutsideBatam(address, false).outside, true, address);
  }
  assert.equal(ai.classifyOutsideBatam('SEMBULANG GALANG BATAM 29481', true).outside, false);
  console.log('PASS ai-pdf-beta-r2: Gemini 15 × 3, schema/reasoning compatibility, DeepSeek V4.1 Flash fallback');
}

runAsyncAssertions().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
