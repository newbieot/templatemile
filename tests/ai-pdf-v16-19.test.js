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
vm.runInContext(aiRuntimeSource, sandbox, {
  filename: 'ai-pdf-v16-19.js'
});

const core = sandbox.__mileCore;
const ai = sandbox.MileAI._test;

sandbox.navigator.onLine = false;
assert.equal(ai.resolveNetworkProfile('normal').key, 'normal');
assert.doesNotMatch(aiRuntimeSource, /while \(navigator\.onLine === false\)/);
sandbox.navigator.onLine = true;

assert.equal(core.cleanRecipientName('FAHRUDIN 0028C20250400784'), 'FAHRUDIN');
assert.equal(core.cleanRecipientName('ANDI AB12-3456789'), 'ANDI');
assert.equal(core.cleanRecipientName('SITI NUR AINI'), 'SITI NUR AINI');

const normalizeOne = input => ai.normalizeRows([input], 'MANUAL', 0, { expectedPages: [1] })[0];

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

assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.7-flash' }, { status: 429 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.7-flash' }, { status: 503 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.7-flash' }, { status: 404 }), true);
assert.equal(ai.isAutoFallbackEligible({ model: 'gemini-3.7-flash' }, { status: 401 }), false);
assert.equal(ai.isAutoFallbackEligible({ model: 'qwen-3.7-flash' }, { status: 503 }), false);

console.log('PASS ai-pdf-v16-19: ekstraksi, kompatibilitas model, dan fallback otomatis');
