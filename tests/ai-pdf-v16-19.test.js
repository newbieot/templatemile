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
const aiRuntimeSource = fs.readFileSync(path.join(root, 'assets/js/ai-pdf-v16-19.js'), 'utf8');
const appHtmlSource = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
vm.runInContext(aiRuntimeSource, sandbox, {
  filename: 'ai-pdf-v16-19.js'
});

const core = sandbox.__mileCore;
const ai = sandbox.MileAI._test;

sandbox.navigator.onLine = false;
assert.equal(ai.resolveNetworkProfile('normal').key, 'normal');
assert.doesNotMatch(aiRuntimeSource, /while \(navigator\.onLine === false\)/);
assert.match(aiRuntimeSource, /const DEFAULT_MODEL = 'gemini-3\.8-flash'/);
assert.match(aiRuntimeSource, /const PRIMARY_FALLBACK_MODEL = 'claude-haiku-5\.5'/);
assert.match(aiRuntimeSource, /const SECONDARY_FALLBACK_MODEL = 'claude-sonnet-5'/);
assert.match(aiRuntimeSource, /Object\.freeze\(\[DEFAULT_MODEL, PRIMARY_FALLBACK_MODEL, SECONDARY_FALLBACK_MODEL\]\)/);
assert.doesNotMatch(aiRuntimeSource, /AUTO_FALLBACK_MODEL = 'qwen/);
assert.match(appHtmlSource, /<option value="gemini-3\.8-flash" selected>Gemini 3\.8 Flash · Default OCR<\/option>/);
assert.match(appHtmlSource, /<option value="claude-haiku-5\.5">Claude Haiku 5\.5 · Fallback pertama<\/option>/);
assert.match(appHtmlSource, /<option value="claude-sonnet-5">Claude Sonnet 5 · Fallback kedua<\/option>/);
assert.doesNotMatch(appHtmlSource, /value="(?:deepseek|qwen|glm|gemini-3\.[1567])/);
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

const claudeBody = ai.buildApiBody(
  { model: 'claude-haiku-5.5' },
  'uji',
  [],
  1200
);
assert.equal(claudeBody.temperature, undefined);
assert.equal(claudeBody.top_p, undefined);
assert.equal(claudeBody.response_format, undefined);

const gemini38RepairBody = ai.buildJsonRepairBody(
  { model: 'gemini-3.8-flash' },
  '{"rows":['
);
assert.equal('temperature' in gemini38RepairBody, false);
assert.equal('top_p' in gemini38RepairBody, false);

assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 429 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 404 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.8-flash' }, { status: 401 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'claude-haiku-5.5' }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'claude-sonnet-5' }, { status: 503 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'qwen-3.7-flash' }, { status: 503 }), false);

async function runFallbackAssertions() {
  const responses = [
    { status: 404, body: { error: { message: 'Gemini 3.8 unavailable' } } },
    { status: 503, body: { error: { message: 'Gemini 3.7 unavailable' } } },
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
  const body = ai.buildApiBody(config, 'uji fallback utama', [], 1200);
  let fallbackEvents = 0;
  const firstPayload = await ai.callProxyWithRetry(config, body, 'kelompok pertama', {
    onFallback() { fallbackEvents++; }
  });
  assert.equal(firstPayload._mileEffectiveModel, 'claude-sonnet-5');
  assert.deepEqual(Array.from(firstPayload._mileFallbackChain), ['gemini-3.8-flash', 'claude-haiku-5.5', 'claude-sonnet-5']);
  assert.equal(fallbackEvents, 2);

  const secondPayload = await ai.callProxyWithRetry(config, body, 'kelompok kedua');
  assert.equal(secondPayload._mileEffectiveModel, 'claude-sonnet-5');
  assert.deepEqual(requestedModels, [
    'gemini-3.8-flash', 'claude-haiku-5.5', 'claude-sonnet-5', 'claude-sonnet-5'
  ]);

  for (const address of ['BELAKANG PADANG KOTA BATAM 29491', 'BELAKANGPADANG BATAM', '29492']) {
    assert.equal(ai.classifyOutsideBatam(address, false).outside, true, address);
  }
  assert.equal(ai.classifyOutsideBatam('SEMBULANG GALANG BATAM 29481', true).outside, false);
  console.log('PASS ai-pdf-v16-19: extraction, Claude parameter compatibility, Gemini → Haiku → Sonnet fallback');
}

runFallbackAssertions().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
