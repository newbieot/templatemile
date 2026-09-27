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
assert.equal(explicitState.name.pending, true);
assert.equal(explicitState.name.requiresChange, false);
assert.equal(explicitState.name.sourcePage, 4);
assert.equal(explicitState.phone.pending, true);
assert.equal(explicitState.address, undefined);

const legacy = {
  name: 'SITI',
  address: 'BATAM CENTRE',
  phone: '0',
  noSurat: '',
  aiConfidence: 0.95,
  needsVerification: true
};
const legacyState = ensureRowReviewState(legacy);
assert.equal(legacyState.name.pending, true);
assert.equal(legacyState.address.pending, true);
assert.equal(legacyState.name.requiresChange, false);

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

console.log('PASS desktop-review-sync: aiReviewFields, fallback batch lama, dan marker wajib ubah');
