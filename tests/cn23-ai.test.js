const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, setAttribute() {}, removeAttribute() {}
  });
  return elements.get(id);
};
element('destinationMode').value = 'batam';
let activeMode = 'batam';
let nationalLoads = 0;
const resolverCalls = [];
const sandbox = {
  console, Intl, Date, Math, JSON, Map, Set, Headers, Response, Blob,
  AbortController, DOMException, TextEncoder, performance,
  navigator: { onLine: true },
  document: {
    body: { classList: { contains(name) { return name === 'camera-mode'; } } },
    addEventListener() {},
    getElementById: element,
    querySelectorAll() { return []; }
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  alert() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  MilePostalNational: {
    async load() { nationalLoads++; },
    match(address, postcode) {
      if (/KERITANG.*PENGALIHAN|PENGALIHAN.*KERITANG/.test(address)) {
        return { status: 'matched', postcode: '29274' };
      }
      if (postcode === '10110') return { status: 'matched', postcode };
      if (/SUKAMAJU/.test(address)) return { status: 'ambiguous', postcode: '' };
      return { status: 'not_found', postcode: '' };
    }
  },
  __mileCore: {
    getDestinationMode() { return activeMode; },
    cleanArtifacts(value) { return String(value).toUpperCase(); },
    resolveZipCode(address, template, postcode, options) {
      resolverCalls.push({ address, template, postcode, options });
      if (['cn23', 'mixed'].includes(options.destinationMode)) {
        const match = sandbox.MilePostalNational.match(address, postcode);
        return match.status === 'matched' ? match.postcode : '';
      }
      return postcode || '29411';
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8'), sandbox, {
  filename: 'ai-pdf-beta-r2.js'
});
const ai = sandbox.MileAI._test;
const normalized = (address, options = {}) => ai.normalizeRows([{
  page: 1, nama_penerima: 'PENERIMA', alamat_penerima: address,
  di_luar_batam: true, confidence: 0.96
}], 'MANUAL', 0, { expectedPages: [1], ...options })[0];

(async () => {
  assert.equal(ai.getConfig().destinationMode, 'batam');
  await ai.prepareDestinationData({ destinationMode: 'batam' });
  assert.equal(nationalLoads, 0, 'Batam processing must not load the nationwide database');

  activeMode = 'cn23';
  element('destinationMode').value = 'cn23';
  assert.equal(ai.getConfig().destinationMode, 'cn23');
  await ai.prepareDestinationData({ destinationMode: 'cn23' });
  assert.equal(nationalLoads, 1);

  const keritang = normalized('JL MERDEKA, KERITANG PENGALIHAN');
  assert.equal(keritang.zip, '29274');
  assert.equal(keritang.address, 'JL MERDEKA, KERITANG PENGALIHAN');
  assert.equal(keritang.outsideBatam, true, 'Outside-Batam classification remains information on retained rows');
  assert.equal(keritang.destinationMode, 'cn23');
  assert.equal(keritang.postcodeSource, 'database');
  assert.equal(keritang._printedPostcode, '');
  assert.deepEqual([keritang.act, keritang.cw, keritang.p, keritang.l, keritang.t], [0.2, '0.20', 0, 0, 0]);

  const printed = ai.normalizeRows([{
    page: 1, nama_penerima: 'PENERIMA',
    alamat_penerima: 'KERITANG PENGALIHAN, 29274',
    raw_lines: ['PENERIMA', 'KERITANG PENGALIHAN', '29274'],
    di_luar_batam: true
  }], 'MANUAL', 0, { destinationMode: 'cn23' })[0];
  assert.equal(printed.zip, '29274');
  assert.equal(printed._printedPostcode, '29274');
  assert.equal(printed.postcodeSource, 'label');
  assert.match(printed.address, /29274$/);
  assert.ok(printed.rawLines.includes('29274'), 'Standalone nationwide postcodes must survive address cleanup');

  assert.equal(normalized('JL MERDEKA, SUKAMAJU').zip, '', 'Ambiguous addresses must not inherit Batam defaults');
  assert.equal(normalized('JL TIDAK DIKETAHUI').zip, '', 'Unknown nationwide addresses must not default to 29411');
  assert.equal(normalized('JL MERDEKA, JAKARTA, 10110').zip, '10110');
  assert.equal(ai.ensureBatamCity('JL MERDEKA 29411', { destinationMode: 'cn23' }), 'JL MERDEKA 29411');

  // A run captures its selected mode; changing the form later cannot apply another postcode policy.
  activeMode = 'batam';
  element('destinationMode').value = 'batam';
  const snapshot = normalized('KERITANG PENGALIHAN', { destinationMode: 'cn23' });
  assert.equal(snapshot.zip, '29274');
  assert.equal(resolverCalls.at(-1).options.destinationMode, 'cn23');
  const batam = normalized('JL MERDEKA 29444', { destinationMode: 'batam' });
  assert.match(batam.address, /BATAM 29444$/);
  assert.equal(batam.destinationMode, 'batam');
  assert.deepEqual([batam.p, batam.l, batam.t], [10, 10, 10]);
  assert.equal(normalized('JL TIDAK DIKETAHUI', { destinationMode: 'batam' }).zip, '29411');

  const prompt = ai.buildPrompt(1, 1, { cameraDirect: true, destinationMode: 'cn23' });
  assert.match(prompt, /seluruh Indonesia/);
  assert.match(prompt, /jangan menambahkan BATAM/i);
  assert.match(prompt, /seluruh nama desa\/kelurahan, kecamatan, kabupaten\/kota/);
  assert.match(prompt, /di_luar_batam hanya informasi/);
  const auditPrompt = ai.buildVerificationPrompt(1, 1, [], { destinationMode: 'cn23' });
  assert.match(auditPrompt, /kode transaksi yang bukan kode pos tujuan/);
  assert.doesNotMatch(ai.buildPrompt(1, 1, { destinationMode: 'batam' }), /seluruh Indonesia/);

  const national = sandbox.MilePostalNational;
  delete sandbox.MilePostalNational;
  await ai.prepareDestinationData({ destinationMode: 'batam' });
  await assert.rejects(ai.prepareDestinationData({ destinationMode: 'cn23' }), /Database kode pos nasional belum tersedia/);
  sandbox.MilePostalNational = { ...national, async load() { throw new Error('Database gagal dimuat'); } };
  await assert.rejects(ai.prepareDestinationData({ destinationMode: 'cn23' }), /Database gagal dimuat/);

  // Even a reduced embedding without core postcode services never invents a local CN23 postcode.
  delete sandbox.__mileCore.resolveZipCode;
  assert.equal(normalized('ALAMAT BELUM LENGKAP', { destinationMode: 'cn23' }).zip, '');
  assert.equal(normalized('JAKARTA 10110', { destinationMode: 'cn23' }).zip, '10110');

  // Integrate the real core and the user's national database, including the demonstrated missing-county address.
  let databaseFetches = 0;
  sandbox.fetch = async () => {
    databaseFetches++;
    return new Response(fs.readFileSync(path.join(root, 'assets/data/postcodes-indonesia.json'), 'utf8'), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/postcode-national.js'), 'utf8'), sandbox, {
    filename: 'postcode-national.js'
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/app-core.js'), 'utf8'), sandbox, {
    filename: 'app-core.js'
  });
  await ai.prepareDestinationData({ destinationMode: 'batam' });
  assert.equal(databaseFetches, 0);
  element('destinationMode').value = 'cn23';
  await ai.prepareDestinationData({ destinationMode: 'cn23' });
  await ai.prepareDestinationData({ destinationMode: 'cn23' });
  assert.equal(databaseFetches, 1, 'The nationwide database is cached after its first CN23 load');
  const realRow = normalized('DESA PENGALIHAN, KEC. KERITANG', { destinationMode: 'cn23' });
  assert.equal(realRow.zip, '29274');
  assert.equal(realRow.postcodeSource, 'database');
  assert.equal(realRow.outsideBatam, true);
  assert.doesNotMatch(realRow.address, /BATAM/);
  const realMatch = sandbox.__mileCore.getNationalPostcodeMatch(realRow);
  assert.equal(realMatch.status, 'matched');
  assert.match(realMatch.selected.city, /INDRAGIRI HILIR/);
  const school = normalized('SMA NEGERI 2 KERITANG PENGALIHAN', { destinationMode: 'cn23' });
  assert.equal(school.zip, '29274');
  assert.equal(school.outsideBatam, true);
  assert.doesNotMatch(school.address, /BATAM/);
  const screenshot = normalized('JL. PENDIDIKAN PULAU KIJANG INHIL-RIAU.', { destinationMode: 'mixed' });
  assert.equal(screenshot.zip, '29273', 'The supplied screenshot address fills the postcode automatically.');
  assert.equal(screenshot.postcodeSource, 'database');
  assert.equal(sandbox.__mileCore.getShipmentRoute(screenshot), 'cn23');
  const realAmbiguous = normalized('JL MERDEKA, SUKAMAJU', { destinationMode: 'cn23' });
  assert.equal(realAmbiguous.zip, '');
  assert.equal(sandbox.__mileCore.getNationalPostcodeMatch(realAmbiguous).status, 'ambiguous');
  const realPrinted = normalized('DESA PENGALIHAN, KERITANG, 29274', { destinationMode: 'cn23' });
  assert.equal(realPrinted._printedPostcode, '29274');
  assert.equal(realPrinted.postcodeSource, 'label');
  assert.equal(realPrinted.zip, '29274');

  element('destinationMode').value = 'mixed';
  assert.equal(ai.getConfig().destinationMode, 'mixed');
  assert.equal(ai.isNationalDestinationMode('mixed'), true);
  await ai.prepareDestinationData({ destinationMode: 'mixed' });
  assert.equal(databaseFetches, 1);
  const mixedRows = ai.normalizeRows([
    { page: 1, nama_penerima: 'LOKAL', alamat_penerima: 'BELIAN, BATAM, 29464', di_luar_batam: false },
    { page: 2, nama_penerima: 'LUAR KOTA', alamat_penerima: 'KERITANG PENGALIHAN, 29274', di_luar_batam: true },
    { page: 3, nama_penerima: 'PERLU DIPERIKSA', alamat_penerima: 'SUKAMAJU', di_luar_batam: true }
  ], 'MANUAL', 0, { destinationMode: 'mixed', expectedPages: [1, 2, 3] });
  assert.equal(mixedRows.length, 3, 'A mixed batch retains local, outside, and ambiguous captures');
  assert.equal(mixedRows[0].zip, '29464');
  assert.equal(mixedRows[0].outsideBatam, false);
  assert.deepEqual([mixedRows[0].p, mixedRows[0].l, mixedRows[0].t], [10, 10, 10]);
  assert.equal(mixedRows[1].zip, '29274');
  assert.equal(mixedRows[1].outsideBatam, true);
  assert.doesNotMatch(mixedRows[1].address, /BATAM/);
  assert.deepEqual([mixedRows[1].p, mixedRows[1].l, mixedRows[1].t], [0, 0, 0]);
  assert.equal(mixedRows[2].zip, '');
  assert.deepEqual([mixedRows[2].p, mixedRows[2].l, mixedRows[2].t], [0, 0, 0]);
  assert.ok(mixedRows.every(row => row.destinationMode === 'mixed'));
  assert.match(ai.buildPrompt(1, 3, { destinationMode: 'mixed' }), /seluruh Indonesia/);
  assert.match(ai.buildVerificationPrompt(1, 3, [], { destinationMode: 'mixed' }), /seluruh Indonesia/);
  element('destinationMode').value = 'cn23';

  // Database failure stops a real camera run before any photo is sent to the AI gateway.
  const requestedUrls = [];
  sandbox.fetch = async url => {
    requestedUrls.push(url);
    assert.equal(url, '/api/health');
    return new Response(JSON.stringify({
      cosmosConfigured: true, firebaseConfigured: true, sessionConfigured: true, serverSideGate: true
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  let queuedNext = 0;
  sandbox.__mileCore.processNextInQueue = () => queuedNext++;
  sandbox.MilePostalNational = { async load() { throw new Error('Database gagal dimuat'); } };
  const stoppedRun = await sandbox.MileAI.processCameraImages([{ blob: new Blob(['jpeg'], { type: 'image/jpeg' }) }], {
    destinationMode: 'cn23'
  });
  assert.equal(stoppedRun.status, 'FAILED');
  assert.equal(stoppedRun.destinationMode, 'cn23');
  assert.match(stoppedRun.error, /Database gagal dimuat/);
  assert.equal(requestedUrls.length, 1);
  assert.equal(queuedNext, 1);
  console.log('PASS cn23-ai: nationwide address preservation, source provenance, no local defaults, stable modes, lazy database loading');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
