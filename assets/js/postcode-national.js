(function (root) {
  'use strict';
  const DATA_URL = '/assets/data/postcodes-indonesia.json?v=20261001-cn23-3';
  const MAX_CANDIDATES = 100;
  let records = [];
  let tokenIndex = new Map();
  let postcodeIndex = new Map();
  let loaded = false;
  let loading = null;

  function normalize(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function aliases(value) {
    const parts = String(value || '').split(/[\/;]/);
    return [...new Set(parts.map(normalize).filter(Boolean))].sort((a, b) => b.length - a.length);
  }

  function install(data) {
    if (data?.formatVersion !== 1 || !Array.isArray(data.rows) || data.rows.length !== data.recordCount) {
      throw new Error('Format database kode pos nasional tidak sesuai.');
    }
    const { districts, cities, provinces } = data.dictionaries || {};
    if (![districts, cities, provinces].every(Array.isArray)) throw new Error('Database wilayah tidak lengkap.');
    const nextRecords = [];
    const nextTokens = new Map();
    const nextPostcodes = new Map();
    const unique = new Set();
    data.rows.forEach((row, sourceIndex) => {
      const [postcode, village, districtId, cityId, provinceId] = row;
      const district = districts[districtId];
      const city = cities[cityId];
      const province = provinces[provinceId];
      if (!/^\d{5}$/.test(postcode) || ![village, district, city, province].every(v => typeof v === 'string' && v.trim())) {
        throw new Error('Ada baris database kode pos yang tidak valid.');
      }
      const key = JSON.stringify([postcode, village, district, city, province]);
      if (unique.has(key)) return;
      unique.add(key);
      const candidate = {
        id: `postal-${sourceIndex}`, postcode, village, district, city, province,
        label: `${district} — ${village} — ${city}, ${province} (${postcode})`
      };
      const fields = [aliases(village), aliases(district), aliases(city), aliases(province)];
      const index = nextRecords.length;
      nextRecords.push({ candidate, fields });
      for (const token of new Set(fields.flat().flatMap(field => field.split(' ')))) {
        if (token.length < 2) continue;
        if (!nextTokens.has(token)) nextTokens.set(token, []);
        nextTokens.get(token).push(index);
      }
      if (!nextPostcodes.has(postcode)) nextPostcodes.set(postcode, []);
      nextPostcodes.get(postcode).push(index);
    });
    records = nextRecords;
    tokenIndex = nextTokens;
    postcodeIndex = nextPostcodes;
    loaded = true;
    return api;
  }

  function load() {
    if (loaded) return Promise.resolve(api);
    if (!loading) {
      loading = root.fetch(DATA_URL, { credentials: 'same-origin' }).then(async response => {
        if (!response.ok) throw new Error('Database kode pos nasional belum dapat dimuat. Coba lagi setelah koneksi pulih.');
        return install(await response.json());
      }).catch(error => { loading = null; throw error; });
    }
    return loading;
  }

  function outcome(status, matches = [], reason = '') {
    const selected = status === 'matched' ? matches[0] : null;
    return { status, postcode: selected?.postcode || '', selected,
      candidates: matches.slice(0, MAX_CANDIDATES), candidateCount: matches.length, reason };
  }

  function match(address, postcode = '') {
    if (!loaded) return outcome('unavailable', [], 'Database kode pos nasional belum dimuat.');
    // Expand common administrative abbreviations without changing the label text.
    const text = normalize(address).replace(/\bINHIL\b/g, 'INDRAGIRI HILIR')
      .replace(/\bINHU\b/g, 'INDRAGIRI HULU').replace(/\bKEPRI\b/g, 'KEPULAUAN RIAU');
    const padded = ` ${text} `;
    const explicit = String(postcode || '').trim();
    const printed = String(address || '').match(/\b\d{5}\b/g) || [];
    const knownPrinted = [...new Set(printed.filter(code => postcodeIndex.has(code)))];
    const hint = explicit || (knownPrinted.length === 1 ? knownPrinted[0] : (printed.length === 1 ? printed[0] : ''));
    const pool = new Set();
    for (const token of new Set(text.split(' '))) {
      for (const index of tokenIndex.get(token) || []) pool.add(index);
    }
    const evidence = [];
    for (const index of pool) {
      const record = records[index];
      const matchedAliases = record.fields.map(field => field.find(alias => padded.includes(` ${alias} `)) || '');
      if (!matchedAliases.some(Boolean)) continue;
      evidence.push({ index, matchedAliases });
    }
    // PULAU must not compete with PULAU KIJANG merely because both occur in
    // the same village phrase. Keep whole, most specific names per field.
    const namesByField = [0, 1, 2, 3].map(field => [...new Set(evidence.map(item => item.matchedAliases[field]).filter(Boolean))]);
    const containedNames = namesByField.map(names => new Set(names.filter(name =>
      names.some(longer => longer !== name && ` ${longer} `.includes(` ${name} `)))));
    const geographic = [];
    for (const item of evidence) {
      const { index } = item;
      const matchedAliases = item.matchedAliases.map((name, field) => containedNames[field].has(name) ? '' : name);
      const hits = matchedAliases.map(Boolean);
      if (!hits.some(Boolean)) continue;
      // A single name repeated in village/district/city is still one piece of evidence.
      const count = new Set(matchedAliases.filter(Boolean)).size;
      const score = hits.reduce((total, hit, i) => total + (hit ? [4, 3, 2, 1][i] : 0), 0);
      geographic.push({ index, count, score });
    }
    const ranked = geographic;
    ranked.sort((a, b) => b.count - a.count || b.score - a.score || a.index - b.index);
    const bestCount = ranked[0]?.count || 0;
    // A village and its district/city together outrank isolated name collisions.
    // Single-field matches stay together even when the same word means a village elsewhere.
    let best = bestCount >= 2 ? ranked.filter(item => item.count === bestCount) : ranked;
    if (bestCount >= 2) {
      const bestScore = best[0]?.score;
      best = best.filter(item => item.score === bestScore);
    }
    if (hint) {
      const hinted = new Set(postcodeIndex.get(hint) || []);
      const intersection = best.filter(item => hinted.has(item.index));
      if (intersection.length) best = intersection;
      else if (best.length) {
        return outcome('ambiguous', best.map(item => records[item.index].candidate),
          `Kode pos ${hint} tidak cocok dengan wilayah yang terbaca. Pilih wilayah yang benar.`);
      } else {
        const candidates = [...hinted].map(index => records[index].candidate);
        if (!candidates.length) return outcome('not_found', [], `Kode pos ${hint} tidak ditemukan dalam database lampiran.`);
        return outcome(candidates.length === 1 ? 'matched' : 'ambiguous', candidates,
          candidates.length > 1 ? 'Kode pos ini mencakup beberapa wilayah. Pilih kelurahan/desa tujuan.' : '');
      }
    }
    const candidates = best.map(item => records[item.index].candidate);
    if (!candidates.length) return outcome('not_found', [], 'Wilayah belum ditemukan. Lengkapi kelurahan/desa, kecamatan, atau kota/kabupaten.');
    return outcome(candidates.length === 1 ? 'matched' : 'ambiguous', candidates,
      candidates.length > 1 ? 'Alamat cocok ke beberapa wilayah. Pilih tujuan atau lengkapi alamat.' : '');
  }

  const api = { load, match, isLoaded: () => loaded, normalize, dataUrl: DATA_URL };
  root.MilePostalNational = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
