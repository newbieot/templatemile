const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/postcode-national.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/postcodes-indonesia.json'), 'utf8'));

function service(fetch) {
  const sandbox = { console, fetch };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.MilePostalNational;
}

(async () => {
  let requests = 0;
  const api = service(async () => { requests++; return { ok: true, json: async () => data }; });
  assert.equal(api.match('KERITANG PENGALIHAN').status, 'unavailable');
  await Promise.all([api.load(), api.load()]);
  assert.equal(requests, 1, 'Concurrent loads share one request.');
  assert.equal(data.recordCount, 81248, 'Preserve every source record in the shipped dataset.');
  assert.equal(api.isLoaded(), true);
  for (const address of [
    'SMA NEGERI 2 KERITANG PENGALIHAN',
    'Desa Pengalehan, Kec. Keritang',
    'Pengalihan, Keritang, Kabupaten Indragiri Hilir, Riau'
  ]) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', address);
    assert.equal(result.postcode, '29274');
    assert.equal(result.selected.city, 'INDRAGIRI HILIR');
    assert.equal(result.selected.village, 'PENGALIHAN / PENGALEHAN');
  }
  const broad = api.match('Keritang');
  assert.equal(broad.status, 'ambiguous');
  assert.equal(broad.postcode, '');
  assert.ok(broad.candidates.some(candidate => candidate.district === 'KEMUNING'));
  assert.ok(broad.candidates.some(candidate => candidate.district === 'KERITANG'));
  assert.equal(api.match('SUKAMAJU').status, 'ambiguous', 'Shared village names must not pick the first record.');
  const printed = api.match('Pengalihan Keritang 29274');
  assert.equal(printed.status, 'matched');
  assert.equal(printed.postcode, '29274');
  assert.equal(api.match('Pengalihan Keritang', '29276').status, 'ambiguous', 'Conflicting printed postcode requires review.');
  assert.equal(api.match('Sekolah tidak teridentifikasi').status, 'not_found');
  assert.equal(api.match('Sekolah tidak teridentifikasi').postcode, '', 'Never invent a Batam fallback.');
  const local = api.match('BELIAN BATAM KOTA BATAM');
  assert.equal(local.status, 'matched');
  assert.equal(local.selected.city, 'BATAM');
  const belianSource = data.rows.find(row => row[1] === 'BELIAN' && data.dictionaries.cities[row[3]] === 'BATAM');
  assert.equal(local.postcode, belianSource[0], 'Use the supplied source postcode, even if legacy local mapping differs.');
  let attempts = 0;
  const retry = service(async () => { attempts++; return attempts === 1 ? { ok: false } : { ok: true, json: async () => data }; });
  await assert.rejects(retry.load(), /belum dapat dimuat/);
  assert.equal(retry.isLoaded(), false);
  await retry.load();
  assert.equal(retry.isLoaded(), true, 'A failed download can be retried.');
  const malformed = service(async () => ({ ok: true, json: async () => ({ formatVersion: 1, rows: [], recordCount: 1 }) }));
  await assert.rejects(malformed.load(), /Format database/);
  console.log('National postcode data, aliases, ambiguity, conflicts and load recovery verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
