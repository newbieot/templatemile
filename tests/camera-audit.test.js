const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = {
  aiModel: 'deepseek-v4.1-flash',
  aiAccuracyMode: 'auto',
  aiSpeedPreset: 'fast',
  aiPagesPerRequest: '3',
  aiConcurrency: '1',
  aiNetworkMode: 'unstable'
};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { value: values[id] || '' });
  return elements.get(id);
};

const sandbox = {
  console, Intl, Date, Math, JSON, Map, Set, Headers, Response, Blob,
  AbortController, DOMException, TextEncoder, performance,
  navigator: { onLine: true },
  document: {
    body: { classList: { contains(name) { return name === 'camera-mode'; } } },
    addEventListener() {},
    getElementById(id) { return element(id); },
    querySelectorAll() { return []; }
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  alert() {}, setTimeout, clearTimeout, setInterval, clearInterval
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8'), sandbox, {
  filename: 'ai-pdf-beta-r2.js'
});
const ai = sandbox.MileAI._test;

const cameraConfig = {
  cameraDirect: true,
  accuracyMode: 'auto',
  verificationPolicy: 'low-confidence'
};
const readable = {
  page: 1,
  nama_penerima: 'SITI NUR AINI',
  alamat_penerima: 'JL MERDEKA NOMOR 12, BATAM 29444',
  nomor_hp: '',
  nomor_surat: '123/ABC',
  perlu_dicek_fields: []
};
const normalize = (overrides = {}, expectedPages = [1]) => ai.normalizeRows(
  [{ ...readable, ...overrides }], 'MANUAL', 0, { expectedPages }
);
const auditedPages = (rows, expectedPages = [1], config = cameraConfig) => Array.from(
  ai.verificationPages(config, rows, expectedPages)
);

const config = ai.getConfig();
assert.equal(config.pagesPerRequest, 7, 'Camera must use seven images per request');
assert.equal(config.concurrency, 7, 'Camera must allow seven requests in parallel');
assert.equal(config.verificationPolicy, 'low-confidence');
assert.deepEqual(auditedPages(normalize()), [], 'Readable data should proceed directly to user review');

const exampleFromPrompt = options => {
  const prompt = ai.buildPrompt(1, 4, options);
  const marker = 'Format Wajib:';
  const exampleStart = prompt.indexOf(marker);
  assert.notEqual(exampleStart, -1, 'Extraction prompt must include its response contract');
  return JSON.parse(prompt.slice(exampleStart + marker.length).trim());
};
const cameraExample = exampleFromPrompt(cameraConfig);
assert.equal(cameraExample.rows.length, 1);
assert.equal(typeof cameraExample.rows[0].confidence, 'number', 'Camera response example must request a numeric readability score');
assert.ok(cameraExample.rows[0].confidence >= 0 && cameraExample.rows[0].confidence <= 1);
const pdfExample = exampleFromPrompt({ cameraDirect: false });
assert.deepEqual(pdfExample, {
  rows: [{
    page: 1, nama_penerima: '...', alamat_penerima: '...', nomor_hp: '',
    nomor_surat: '', di_luar_batam: false, perlu_dicek_fields: []
  }]
}, 'PDF extraction response format must retain its established contract');
const { confidence: exampleConfidence, ...cameraExampleFields } = cameraExample.rows[0];
assert.deepEqual(cameraExampleFields, pdfExample.rows[0], 'Camera adds readability scoring without changing the extracted fields');

for (const field of ['nomor_hp', 'nomor_surat']) {
  const rows = normalize({ [field]: 'PERLU DICEK', perlu_dicek_fields: [field] });
  assert.deepEqual(auditedPages(rows), [], `${field} uncertainty should remain for manual review`);
  assert.ok(rows[0].aiReviewFields.includes(field), 'Manual review fields must remain available');
  assert.equal(rows[0].needsVerification, true, 'Manual review must remain visible');
}

const reviewOnly = normalize({ perlu_dicek_fields: ['alamat_penerima'] });
assert.equal(reviewOnly[0].aiConfidence, 0.74, 'Review flags can retain the legacy inferred score');
assert.equal(reviewOnly[0].aiConfidenceExplicit, false);
assert.deepEqual(auditedPages(reviewOnly), [], 'A review flag alone must not schedule another AI call');

const heuristicRows = normalize({
  nama_penerima: 'PT PERUSAHAAN DISTRIBUSI DAN PENGIRIMAN DOKUMEN NASIONAL INDONESIA CABANG BATAM',
  alamat_penerima: 'JL MERDEKA GEDUNG CABANG BATAM 29444'
});
assert.equal(heuristicRows[0].needsVerification, true);
assert.deepEqual(auditedPages(heuristicRows), [], 'Long names and formatting heuristics belong to manual review');
assert.deepEqual(auditedPages([{ ...normalize()[0], needsVerification: true }]), [],
  'A legacy needsVerification flag must not trigger a camera audit');
const geographicRows = normalize({
  alamat_penerima: 'JL MERDEKA NOMOR 12, JAKARTA 12345', di_luar_batam: true
});
assert.equal(geographicRows[0].outsideBatam, true);
assert.deepEqual(auditedPages(geographicRows), [],
  'Geographic classification alone must not trigger a camera audit');
assert.deepEqual(auditedPages([...normalize(), ...normalize({ nama_penerima: 'ANDI' })]), [],
  'Multiple readable recipients on a page must not trigger an audit merely because of the row count');

assert.deepEqual(auditedPages(normalize(), [1, 2]), [2], 'Missing pages must be recovered by AI');
assert.deepEqual(auditedPages([]), [1], 'No extracted rows must trigger an audit');
for (const field of ['nama_penerima', 'alamat_penerima']) {
  assert.deepEqual(auditedPages(normalize({ [field]: '' })), [1], `${field} is required`);
  for (const marker of ['PERLU DICEK', 'PERLUDICEK', 'PERLU_DI_CEK']) {
    assert.deepEqual(auditedPages(normalize({ [field]: marker })), [1],
      `An unreadable ${field} must trigger an audit`);
  }
}

for (const confidence of [0, 0.6, '0.60']) {
  const rows = normalize({ confidence });
  assert.equal(rows[0].aiConfidenceExplicit, true);
  assert.deepEqual(auditedPages(rows), [1], 'An explicit low readability score must trigger an audit');
}
for (const confidence of [0.65, 0.75, 1, '0.95']) {
  const rows = normalize({ confidence });
  assert.equal(rows[0].aiConfidenceExplicit, true);
  assert.deepEqual(auditedPages(rows), [], 'A readable row at or above the threshold should proceed');
}
for (const confidence of [undefined, null, '', '  ', false, true, -0.1, 1.1, 'unknown', Infinity]) {
  const rows = normalize({ confidence });
  assert.equal(rows[0].aiConfidenceExplicit, false, `Invalid score ${String(confidence)} must not count as model evidence`);
  assert.deepEqual(auditedPages(rows), [], 'Missing or invalid scores must not create extra audits');
}

const mixedRows = [
  ...normalize({ page: 1 }, [1, 2, 3]),
  ...normalize({ page: 2, confidence: 0.6 }, [1, 2, 3]),
  ...normalize({ page: 3, perlu_dicek_fields: ['nomor_hp'] }, [1, 2, 3])
];
assert.deepEqual(auditedPages(mixedRows, [1, 2, 3, 4]), [2, 4],
  'Audit only pages with strong evidence of extraction failure');

element('aiAccuracyMode').value = 'accurate';
const accurateCameraConfig = ai.getConfig();
assert.equal(accurateCameraConfig.verificationPolicy, 'low-confidence');
assert.deepEqual(auditedPages(normalize(), [1], accurateCameraConfig), [],
  'A legacy accurate setting must not expand camera audits to every page');
assert.deepEqual(auditedPages(normalize({ confidence: 0.6 }), [1], accurateCameraConfig), [1]);

const pdfConfig = { cameraDirect: false, accuracyMode: 'auto', verificationPolicy: 'smart' };
assert.deepEqual(auditedPages(normalize(), [1], pdfConfig), [], 'PDF smart mode should retain clean rows');
assert.deepEqual(auditedPages(reviewOnly, [1], pdfConfig), [1], 'PDF smart review behavior must remain intact');
assert.deepEqual(auditedPages(normalize(), [1], { ...pdfConfig, accuracyMode: 'accurate' }), [1],
  'PDF accurate mode must retain full audits');
assert.deepEqual(auditedPages(normalize({ confidence: 0.6 }), [1], { ...pdfConfig, accuracyMode: 'fast' }), [],
  'PDF fast mode must retain disabled audits');
assert.deepEqual(auditedPages(normalize(), [1], { ...pdfConfig, verificationPolicy: 'all' }), [1]);
assert.deepEqual(auditedPages(normalize({ confidence: 0.6 }), [1], { ...pdfConfig, verificationPolicy: 'none' }), []);

console.log('PASS camera-audit: required fields, explicit confidence, manual review flags, selective pages, PDF policy compatibility');

(async()=>{
  const good=normalize({page:1,nomor_hp:'08122222222'}), blank=normalize({page:1,nama_penerima:'PERLU DICEK',alamat_penerima:''});
  const merged=ai.mergeVerifiedRows(good,blank,[1]);assert.equal(merged[0].name,good[0].name);assert.equal(merged[0].address,good[0].address);assert.equal(merged[0].phone,good[0].phone);
  const initial=[...normalize({page:1},[1,2,3,4]),...normalize({page:2},[1,2,3,4])], calls=[];
  const result=await ai.recoverCameraPages(initial,[1,2,3,4],async(page,round)=>{calls.push([page,round]);if(page===4&&round===1)return [];
    return ai.normalizeRows([{...readable,page:1,nama_penerima:'PENERIMA FOTO '+page}], 'MANUAL',page-1,{expectedPages:[page]});});
  assert.deepEqual(Array.from(result.rows,row=>row.sourcePage),[1,2,3,4]);assert.equal(result.rows[2].name,'PENERIMA FOTO 3');assert.equal(result.rows[3].name,'PENERIMA FOTO 4');
  assert.equal(calls.some(([page])=>page<3),false);assert.equal(calls.length,3);assert.deepEqual(Array.from(result.failedPages),[]);
  const failed=await ai.recoverCameraPages(initial,[1,2,3,4],async()=>{throw new Error('offline');});assert.deepEqual(Array.from(failed.failedPages),[3,4]);assert.equal(failed.rows.length,2);
  await assert.rejects(ai.recoverCameraPages([],[1],async()=>{throw new DOMException('cancelled','AbortError');}),{name:'AbortError'});
  console.log('PASS camera recovery: four-photo partial result, isolated retries, global source IDs, retained readable fields and abort');
})().catch(error=>{console.error(error);process.exitCode=1;});
