const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = JSON.parse(fs.readFileSync('assets/data/postcodes-indonesia.json', 'utf8'));
const sandbox = { fetch: async () => ({ ok: true, json: async () => data }) };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync('assets/js/postcode-national.js', 'utf8'), sandbox);

(async () => {
  const api = sandbox.MilePostalNational;
  await api.load();
  const source = data.rows.find(row => row[1] === 'PATAM LESTARI' && data.dictionaries.cities[row[3]] === 'BATAM');
  for (const address of [
    'PERUM TIBAN RIAU BERTUAH THP II BLOK F NO 19',
    'PERUMAHAN TIBAN RIAU BERTUAH TAHAP 2 BLOK F NO 19',
    'Komplek Tiban Riau Bertuah, Tahap III, Blok F No.19',
    'TIBAN RIAU BERTUAH THP VII BLOK F NO 19',
    'Tiban-Riau-Bertuah Blok F No 19',
    'PERUM TIBAN RIAUBERTUAH THP II BLOK F NO 19',
    'TIBANRIAUBERTUAH THP II BLOK F NO 19',
    'PERUM TIBAN RIAU BERTUAH BLOK F NO 19 BATAM',
    'PERUM TIBAN RIAU BERTUAH THP II BLOK F NO 19 29353'
  ]) {
    const result = api.match(address);
    assert.equal(result.status, 'matched', address);
    assert.equal(result.selected.city, 'BATAM', address);
    assert.equal(result.selected.province, 'KEPULAUAN RIAU', address);
    assert.equal(result.selected.district, 'SEKUPANG', address);
    assert.equal(result.selected.village, 'PATAM LESTARI', address);
    assert.equal(result.postcode, source[0], 'Use the verified village in the national postal source: ' + address);
    assert.equal(result.defaulted, undefined, 'A verified place is more precise than the city fallback.');
  }
  // Changing only the housing phase/number must not invent a different region.
  for (const phase of ['I', 'II', 'III', 'IV', 'V', 'VII', '9', '100']) {
    const result = api.match(`PERUM ANGGREK THP ${phase} BLOK ${phase} NO ${phase}`);
    assert.equal(result.selected.city, 'BATAM');
    assert.equal(result.defaulted, true);
    assert.equal(result.selected.village, '');
    assert.equal(result.postcode, '29411');
  }
  for (const ordinal of ['I', 'II', 'III']) {
    const address = `Kel. Lambang Sari ${ordinal}, Kec. Lirik, Indragiri Hulu, Riau`;
    const result = api.match(address);
    assert.equal(result.selected.village, 'LAMBANG SARI I / II / III', 'Keep legitimate ordinal villages when their full name is present: ' + address);
    assert.equal(result.selected.city, 'INDRAGIRI HULU');
    assert.equal(result.postcode, '29353');
  }
  // Exercise every source province as a misleading name inside a complex,
  // with a real destination suffix after it. Province-only evidence still
  // works when it is actually written as an administrative component.
  let cases = 0;
  for (const province of data.dictionaries.provinces) {
    for (const kind of ['PERUMAHAN', 'KOMPLEK', 'GEDUNG', 'RUKO']) {
      const address = `${kind} ${province} BERTUAH THP II BLOK F NO 19, Kel. Karet Tengsin, Kec. Tanah Abang, Jakarta Pusat 10220`;
      const result = api.match(address);
      assert.equal(result.selected.city, 'JAKARTA PUSAT', address);
      assert.equal(result.selected.district, 'TANAH ABANG', address);
      assert.equal(result.postcode, '10220', address);
      const noParent = api.match(`${kind} ${province} BERTUAH THP II BLOK F NO 19`);
      assert.equal(noParent.selected.city, 'BATAM', 'A province inside a name must not create an unrelated destination: ' + address);
      assert.equal(noParent.postcode, '29411');
      cases++;
    }
  }
  assert.equal(cases, 136);
  for (const address of [
    'PERUM BANDUNG INDAH THP II BLOK F NO 19',
    'GEDUNG BATU PERMAI LANTAI II',
    'RUKO MEDAN BERTUAH BLOK III NO 100',
    'PERUMAHAN RIAU BERTUAH, BLOK F NO 19',
    'PERUMAHAN JAWA TIMUR INDAH\nBLOK F NO 19'
  ]) assert.equal(api.match(address).postcode, '29411', address);
  for (const address of [
    'PERUM TIBAN RIAU BERTUAH BLOK F NO 19, Kota Bandung, Jawa Barat',
    'PERUM TIBAN RIAU BERTUAH BLOK F NO 19 Kota Bandung Jawa Barat',
    'PERUM TIBAN RIAU BERTUAH, BANDUNG, JAWA BARAT',
    'PERUM TIBAN RIAU BERTUAH\nBandung Jawa Barat',
    'PERUM INDAH Bandung Jawa Barat'
  ]) {
    const result = api.match(address);
    assert.equal(result.selected.city, 'BANDUNG', 'The actual city at the end remains authoritative: ' + address);
    assert.equal(result.postcode, '40111', address);
    assert.equal(result.selected.village, '', address);
  }
  assert.equal(api.match('PERUM TIBAN RIAU BERTUAH, Kel. Tiban Baru, Batam').selected.village, 'TIBAN BARU', 'Explicit village overrides the place alias.');
  assert.equal(api.match('PERUM INDAH, Riau').selected.province, 'RIAU');
  assert.equal(api.match('Perum Indah BLOK F NO 19 Provinsi Riau').selected.province, 'RIAU');
  assert.equal(api.match('Tiban Riau Berbeda BLOK F NO 19').selected.village, '', 'Do not fuzzy-match a different place name.');
  console.log('PASS address context: verified Tiban Riau Bertuah, phase/number isolation, 136 national housing-name collisions, real administrative suffixes and conflicting evidence');
})().catch(error => { console.error(error); process.exitCode = 1; });
