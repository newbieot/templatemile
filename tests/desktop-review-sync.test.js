const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/app-core.js'), 'utf8');
const start = source.indexOf('const reviewFieldKeys');
const end = source.indexOf('function getFieldReviewState', start);
assert.ok(start >= 0 && end > start, 'Blok sinkronisasi review tidak ditemukan.');

const sandbox = {};
vm.runInNewContext(`
  function containsReviewMarker(value) {
    return /PERLU[\\s._-]*(?:DI[\\s._-]*)?CEK/i.test(String(value ?? ''));
  }
  ${source.slice(start, end)}
  globalThis.reviewTestApi = { normalizeReviewFieldKey, ensureRowReviewState };
`, sandbox);

const { normalizeReviewFieldKey, ensureRowReviewState } = sandbox.reviewTestApi;
assert.equal(normalizeReviewFieldKey('nama_penerima'), 'name');
assert.equal(normalizeReviewFieldKey('alamat_penerima'), 'address');
assert.equal(normalizeReviewFieldKey('nomor_hp'), 'phone');
assert.equal(normalizeReviewFieldKey('nomor_surat'), 'noSurat');

const explicit = {
  name: 'BUDI',
  address: 'BATAM',
  phone: '0812',
  noSurat: 'REF-1',
  sourcePage: 4,
  aiReviewFields: ['nama_penerima', 'nomor_hp'],
  needsVerification: true
};
const explicitState = ensureRowReviewState(explicit);
assert.equal(explicitState.name, undefined, 'A readable name does not need mandatory confirmation just because AI flagged it.');
assert.equal(explicitState.phone, undefined, 'Optional phone uncertainty does not block export.');
assert.equal(explicitState.address, undefined);

const legacy = {
  name: 'SITI',
  address: 'BATAM CENTRE',
  phone: '0',
  noSurat: '',
  aiConfidence: 0.45,
  needsVerification: true
};
const legacyState = ensureRowReviewState(legacy);
assert.equal(Object.keys(legacyState).length, 0, 'Low confidence and legacy needsVerification alone must not block correct data.');

const restored = { ...legacy, _aiReviewHydrated: true, _reviewState: {
  name: { source: 'ai-row', pending: true, requiresChange: false },
  address: { source: 'ai-field', pending: true, requiresChange: false }
} };
assert.equal(ensureRowReviewState(restored).name.pending, false);
assert.equal(restored._reviewState.address.pending, false, 'Old camera log warnings must be reconciled too.');

const company = { name: 'PT PENGELOLA GEDUNG KOMPLEK PERUMAHAN JALAN RAYA INDONESIA DAN SELURUH CABANG NUSANTARA', address: 'Jl. Merdeka No. 12', needsVerification: true };
assert.equal(Object.keys(ensureRowReviewState(company)).length, 0, 'Long business names and address words are not proof of an incorrect reading.');
const missing = { name: '', address: '', phone: '', noSurat: '' };
assert.equal(ensureRowReviewState(missing).name.pending, true);
assert.equal(missing._reviewState.address.pending, true);
assert.equal(missing._reviewState.phone, undefined);
assert.equal(missing._reviewState.noSurat, undefined);
missing.name = 'BUDI'; missing.address = 'Jl. Sudirman No. 10';
assert.equal(ensureRowReviewState(missing).name.pending, false, 'Filled required fields are no longer invalid.');
assert.equal(missing._reviewState.address.pending, false);
const invalidWeight = { ...company, cw: '0' };
assert.equal(ensureRowReviewState(invalidWeight).cw.pending, true);
invalidWeight.cw = '1,5';
assert.equal(ensureRowReviewState(invalidWeight).cw.pending, false);

const marker = {
  name: 'PERLU DICEK',
  address: 'BATAM',
  aiReviewFields: ['nama_penerima'],
  needsVerification: true
};
const markerState = ensureRowReviewState(marker);
assert.equal(markerState.name.pending, true);
assert.equal(markerState.name.requiresChange, true);
assert.match(markerState.name.reason, /PERLU DICEK/);

console.log('PASS desktop-review-sync: readable uncertain values and old logs pass; missing data, invalid weight and unreadable markers remain mandatory');
