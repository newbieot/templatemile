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
  const kateman=api.match('SUNGAI GUNTUNG KATEMAN INHIL RIAU');
  assert.equal(kateman.status,'matched');assert.equal(kateman.postcode,'29255');assert.equal(kateman.selected.village,'');assert.equal(kateman.regionScope,'DISTRICT_POSTCODE');
  assert.equal(api.match('SUNGAI GUNTUNG KATEMAN INHIL RIAU','29273').status,'ambiguous');
  for (const address of ['JL. PENDIDIKAN PULAU KIJANG INHIL-RIAU.', 'PULAU KIJANG RIAU', 'PULAU KIJANG']) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', 'The whole village phrase must beat its shorter substring: ' + address);
    assert.equal(result.postcode, '29273');
    assert.equal(result.selected.village, 'PULAU KIJANG');
    assert.equal(result.selected.city, 'INDRAGIRI HILIR');
  }
  assert.equal(api.match('PULAU KIJANG INHIL', '28463').status, 'ambiguous', 'Long-name matching cannot override a conflicting printed postcode.');
  assert.equal(api.match('BELIAN BATAM KOTA BATAM KEPRI').postcode, '29464');
  assert.equal(api.match('PULAU').status, 'ambiguous', 'A broad word alone still needs more evidence.');
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
  const photoAddress = 'PT. Dom Pizza Indonesia 27th Floor Gedung Sahid Sudirman Center Jl. Jend. Sudirman Kav. 86, Jakarta 10220, Indonesia';
  for (const address of [photoAddress, 'Jl. Jend. Sudirman Kav. 86 Jakarta 10220', 'Gedung Sahid Sudirman Center Jakarta 10220',
    'Jl. Surabaya, Jakarta 10220', 'Jl. Menteng, Jakarta Pusat 10220', 'Jl. Sudirman Jakpus 10220', 'Jakarta 10220']) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', address);
    assert.equal(result.selected.village, 'KARET TENGSIN', address);
    assert.equal(result.selected.district, 'TANAH ABANG', address);
    assert.equal(result.selected.city, 'JAKARTA PUSAT', address);
    assert.equal(result.postcode, '10220', address);
  }
  for (const address of ['Gedung Sahid Sudirman Center Jl. Jend. Sudirman Jakarta', 'Jl. Sudirman DKI Jakarta']) {
    const result = api.match(address);
    assert.equal(result.status, 'ambiguous', 'A city without postcode or smaller region must not invent one.');
    assert.ok(result.candidates.every(candidate => candidate.province === 'DAERAH KHUSUS IBUKOTA JAKARTA'));
    assert.ok(result.candidateCount > 100, 'Do not limit the search to the first 100 rows.');
  }
  for (const address of ['Jakarta 90553', 'Kel. Menteng Jakarta Pusat 10220', 'Kel. Sudirman Kec. Tanralili Jakarta 10220']) {
    assert.equal(api.match(address).status, 'ambiguous', 'Conflicting geography requires review: ' + address);
  }
  assert.equal(api.match('Jl. Riau, Bandung 40115').selected.city, 'BANDUNG');
  assert.equal(api.match('Gedung Gambir, Karet Tengsin, Tanah Abang, Jakarta').postcode, '10220', 'Later district wins over an earlier building name.');
  assert.equal(api.match('Sudirman Tanralili Maros Sulawesi Selatan').postcode, '90553', 'The real village Sudirman remains valid in its own region.');
  assert.equal(api.match('Gedung Gumanti Tegineneng Pesawaran Lampung').postcode, '35363');
  assert.equal(api.match('Belian Batam Kota').postcode, '29464', 'KOTA is not an alias for Lima Puluh Kota.');
  const limaPuluh = api.match('Harau Lima Puluh Kota Sumatera Barat');
  assert.ok(limaPuluh.candidates.every(candidate => candidate.city === 'LIMA PULUH KOTO / KOTA'));

  // Geographic coverage uses the shipped source: one full address per province,
  // both with and without postcode, with misleading street/building names ahead.
  // This catches accidental Jakarta-only logic and cross-province collisions.
  let provinceCases = 0;
  for (const province of data.dictionaries.provinces) {
    const row = data.rows.find(entry => data.dictionaries.provinces[entry[4]] === province &&
      [entry[1], data.dictionaries.districts[entry[2]], data.dictionaries.cities[entry[3]]].every(value => /^[A-Z ]+$/.test(value)));
    assert.ok(row, province);
    const [code, village, districtId, cityId] = row;
    const district = data.dictionaries.districts[districtId], city = data.dictionaries.cities[cityId];
    for (const zip of ['', code]) {
      const address = `Gedung Sahid Sudirman, Jl. Merdeka No. 86, Kel. ${village}, Kec. ${district}, ${city}, ${province} ${zip}`;
      const result = api.match(address);
      assert.equal(result.status, 'matched', `${province}: ${address}: ${result.reason}`);
      assert.equal(result.postcode, code, address);
      assert.equal(result.selected.city, city, address);
      assert.equal(result.selected.province, province, address);
      provinceCases++;
    }
  }
  assert.equal(provinceCases, 68);
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
