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
  assert.equal(api.match('SUNGAI GUNTUNG KATEMAN INHIL RIAU','29273').postcode,'29255', 'Known geography wins over a conflicting postal hint.');
  for (const address of ['JL. PENDIDIKAN PULAU KIJANG INHIL-RIAU.', 'PULAU KIJANG RIAU', 'Kel. PULAU KIJANG']) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', 'The whole village phrase must beat its shorter substring: ' + address);
    assert.equal(result.postcode, '29273');
    assert.equal(result.selected.village, 'PULAU KIJANG');
    assert.equal(result.selected.city, 'INDRAGIRI HILIR');
  }
  assert.equal(api.match('PULAU KIJANG INHIL', '28463').postcode, '29273', 'A conflicting number cannot route a known village into another city.');
  assert.equal(api.match('BELIAN BATAM KOTA BATAM KEPRI').postcode, '29464');
  for (const address of ['PULAU', 'KERITANG', 'SUKAMAJU', 'Kel. Sukamaju', 'Sekolah tidak teridentifikasi', 'Jl. Sudirman No. 86', 'Jl. Surabaya No. 12', 'Gedung Sahid Sudirman Center']) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', address);
    assert.equal(result.postcode, '29411', address);
    assert.equal(result.selected.city, 'BATAM', address);
    assert.equal(result.selected.district, '', 'Do not invent a district for the configured default.');
    assert.equal(result.selected.village, '', address);
    assert.equal(result.defaulted, true, address);
  }
  assert.equal(broad.postcode, '29411');
  const printed = api.match('Pengalihan Keritang 29274');
  assert.equal(printed.status, 'matched');
  assert.equal(printed.postcode, '29274');
  assert.equal(api.match('Pengalihan Keritang', '29276').postcode, '29274', 'Precise area evidence resolves a conflicting printed postcode automatically.');
  assert.equal(api.match('Sekolah tidak teridentifikasi 99999').postcode, '29411', 'An unknown five-digit reference must not prevent the no-region default.');
  assert.equal(api.match('Alamat tanpa kota 10220').postcode, '10220', 'Keep a valid printed postcode authoritative.');
  assert.equal(api.match('Provinsi Jawa Barat').defaulted, undefined, 'A known province must never default to Batam.');
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
    assert.equal(result.status, 'matched', 'Incomplete Jakarta addresses route automatically inside Jakarta.');
    assert.equal(result.selected.province, 'DAERAH KHUSUS IBUKOTA JAKARTA');
    assert.equal(result.selected.village, '', 'A routing default must not fabricate a village.');
    assert.equal(result.routingDefault, true);
    assert.equal(result.postcode.endsWith('111'), false, 'Jakarta does not use the generic city suffix.');
  }
  for (const address of ['Jakarta 90553', 'Kel. Menteng Jakarta Pusat 10220', 'Kel. Sudirman Kec. Tanralili Jakarta 10220']) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', 'Resolve conflicting earlier clues automatically: ' + address);
    assert.equal(result.selected.province, 'DAERAH KHUSUS IBUKOTA JAKARTA', 'The final city/province retains authority.');
  }
  assert.equal(api.match('Kel. Sudirman Kec. Tanralili Jakarta 10220').postcode, '10220', 'Discard an earlier area outside Jakarta, then use its compatible printed postcode.');
  assert.equal(api.match('Kota Batam Kec. Batam Kota, kepada Jakarta 10220').postcode, '10220', 'An earlier sender area must not erase the last destination postcode.');
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
  for (const [address, expected] of [['Bandung','40111'],['Medan','20111'],['Surabaya','60111'],['Pekanbaru','28111'],['Maros','90511'],['Batam','29411'],['Jambi','36111'],['Tebo Jambi','37511']]) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', address);
    assert.equal(result.postcode, expected, address);
    assert.equal(result.regionScope, 'CITY_POSTCODE', address);
    assert.equal(result.selected.village, '', 'Never fabricate a village for a city-only address.');
    assert.equal(result.selected.district, '', address);
  }
  assert.equal(api.match('Jl. Sudirman Batam').postcode, '29411');
  assert.equal(api.match('Batam 29411').postcode, '29411');
  assert.equal(api.match('Batam 29411').regionScope, 'CITY_POSTCODE');
  assert.equal(api.match('Belian Batam Kota 29411').postcode, '29464', 'A generic printed city code yields to a known village.');
  assert.equal(api.match('Belian Batam Kota').postcode, '29464', 'A known village keeps its actual code.');
  assert.equal(api.match('Kec. Tanah Abang Jakarta Pusat').status, 'matched', 'District evidence routes automatically.');
  assert.equal(api.match('Kec. Tanah Abang Jakarta Pusat').regionScope, 'DISTRICT_POSTCODE');
  assert.equal(api.match('Kel. Karet Tengsin Kec. Tanah Abang Jakarta Pusat').postcode, '10220');
  assert.equal(api.match('Jakarta Pusat').status, 'matched', 'Jakarta routes automatically using a postcode in its own city.');
  assert.equal(api.match('Jakarta Pusat').selected.village, '');
  assert.equal(api.match('Jakarta Pusat').postcode.endsWith('111'), false);
  for (const province of data.dictionaries.provinces) {
    const result = api.match(`Provinsi ${province}`);
    assert.equal(result.status, 'matched', province);
    assert.equal(result.selected.province, province, 'Province-only routing stays inside the known province.');
    assert.equal(result.selected.village, '', province);
  }
  let cityCases = 0;
  for (const city of data.dictionaries.cities) {
    if (/JAKARTA/.test(city) || city === 'KEPULAUAN SERIBU' || city === 'BANJAR') continue;
    const result = api.match(city);
    assert.equal(result.status, 'matched', 'Automatic city routing: ' + city);
    assert.equal(result.selected.city, city, 'Never route a city into another city: ' + city);
    cityCases++;
  }
  assert.ok(cityCases > 460);
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
