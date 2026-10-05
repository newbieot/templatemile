(function (root) {
  'use strict';
  const DATA_URL = '/assets/data/postcodes-indonesia.json?v=20261001-cn23-4';
  const MAX_CANDIDATES = 100;
  const MATCHER_VERSION = '20261005-auto-city-weight-2';
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
    const parts = String(value || '').split(/[\/;]/).map(normalize).filter(Boolean);
    // Source data abbreviates shared words around a slash, e.g.
    // "LIMA PULUH KOTO / KOTA" and "GEDUNG / GEDONG GUMANTI".
    // Expanding the shared words prevents KOTA/GEDUNG becoming false regions.
    if (parts.length === 2) {
      const words = parts.map(part => part.split(' '));
      if (words[0].length > 1 && words[1].length === 1) parts[1] = [...words[0].slice(0, -1), parts[1]].join(' ');
      else if (words[0].length === 1 && words[1].length > 1) parts[0] = [parts[0], ...words[1].slice(1)].join(' ');
    }
    return [...new Set(parts)].sort((a, b) => b.length - a.length);
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
      if (province === 'DAERAH KHUSUS IBUKOTA JAKARTA') fields[3].push('JAKARTA');
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

  function cityDefault(matches) {
    const cities = new Set(matches.map(item => JSON.stringify([item.city, item.province])));
    if (cities.size !== 1) return null;
    const { city, province } = matches[0];
    if (province === 'DAERAH KHUSUS IBUKOTA JAKARTA') return null;
    const all = records.filter(item => item.candidate.city === city && item.candidate.province === province).map(item => item.candidate);
    const codes = [...new Set(all.map(item => item.postcode))].sort();
    // City defaults are coarse routing codes, not inferred villages. Prefer
    // the supplied xx111/xxx11 code; otherwise retain the city's dominant
    // three-digit routing prefix. Batam's application default is 29411.
    const prefixes = new Map();
    all.forEach(item => prefixes.set(item.postcode.slice(0, 3), (prefixes.get(item.postcode.slice(0, 3)) || 0) + 1));
    const mainPrefix = [...prefixes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    const postcode = city === 'BATAM' ? '29411' :
      codes.find(code => code.endsWith('111')) || codes.find(code => code.startsWith(mainPrefix) && code.endsWith('11')) ||
      codes.find(code => code.endsWith('11')) || (mainPrefix ? `${mainPrefix}11` : '');
    if (!postcode) return null;
    return { id: `city-${matches[0].id}`, postcode, village: '', district: '', city, province,
      label: `${city}, ${province} (${postcode}) — kode pos kota` };
  }

  function resolveCandidates(matches, context = {}) {
    if (matches.length === 1) return outcome('matched', matches);
    // A district-level address can be complete for postal routing even when
    // its village is absent from the supplied data. Never invent a village.
    const areas = new Set(matches.map(item => JSON.stringify([item.postcode, item.district, item.city, item.province])));
    if (matches.length && areas.size === 1) {
      const { postcode, district, city, province } = matches[0];
      const selected = { id: `district-${matches[0].id}`, postcode, village: '', district, city, province,
        label: `${district} — ${city}, ${province} (${postcode})` };
      return { ...outcome('matched', matches), selected, postcode, postcodeConsensus: true, regionScope: 'DISTRICT_POSTCODE' };
    }
    if (context.cityKnown && !context.lowerKnown && !context.postalHint) {
      const selected = cityDefault(matches);
      if (selected) return { ...outcome('matched', [selected]), regionScope: 'CITY_POSTCODE', automatic: true };
    }
    // Same postcode across several villages can route without inventing a village.
    const postcodes = new Set(matches.map(item => item.postcode));
    const districts = new Set(matches.map(item => JSON.stringify([item.district, item.city, item.province])));
    if (matches.length && context.cityKnown && context.lowerKnown && districts.size === 1) {
      const counts = new Map();
      matches.forEach(item => counts.set(item.postcode, (counts.get(item.postcode) || 0) + 1));
      const postcode = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const { district, city, province } = matches[0];
      const selected = { id: `district-${matches[0].id}`, postcode, village: '', district, city, province,
        label: `${district} — ${city}, ${province} (${postcode})` };
      return { ...outcome('matched', [selected]), regionScope: 'DISTRICT_POSTCODE', automatic: true,
        postcodeConsensus: postcodes.size === 1, routingDefault: postcodes.size > 1 };
    }
    return outcome('ambiguous', matches, 'Alamat belum cukup rinci untuk menentukan kode pos secara otomatis.');
  }

  function match(address, postcode = '') {
    if (!loaded) return outcome('unavailable', [], 'Database kode pos nasional belum dimuat.');
    // Expand common administrative abbreviations without changing the label text.
    const text = normalize(address).replace(/\bINHIL\b/g, 'INDRAGIRI HILIR')
      .replace(/\bINHU\b/g, 'INDRAGIRI HULU').replace(/\bKEPRI\b/g, 'KEPULAUAN RIAU')
      .replace(/\bJAKPUS\b/g, 'JAKARTA PUSAT').replace(/\bJAKSEL\b/g, 'JAKARTA SELATAN')
      .replace(/\bJAKBAR\b/g, 'JAKARTA BARAT').replace(/\bJAKTIM\b/g, 'JAKARTA TIMUR')
      .replace(/\bJAKUT\b/g, 'JAKARTA UTARA');
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
    const spansByField = namesByField.map(names => names.flatMap(name => {
      const spans = [];
      let start = padded.indexOf(` ${name} `);
      while (start >= 0) {
        spans.push({ start, end: start + name.length });
        start = padded.indexOf(` ${name} `, start + 1);
      }
      return spans;
    }));
    function areaPosition(name, field) {
      if (!name || containedNames[field].has(name)) return -1;
      let position = padded.lastIndexOf(` ${name} `);
      while (position >= 0) {
        const before = padded.slice(0, position);
        const street = /\b(?:JL|JLN|JALAN)(?:\s+(?:JEND|JENDERAL|JENDRAL|H|HJ|KH))?\s*$/.test(before);
        // YOGYAKARTA inside DAERAH ISTIMEWA YOGYAKARTA is province
        // evidence, not a second mention of the city or a smaller area.
        const parent = spansByField.slice(field + 1).some((spans, offset) => spans.some(span =>
          (span.end - span.start > name.length || field + offset + 1 >= 2) &&
          span.start <= position && span.end >= position + name.length));
        if (!street && !parent) return position;
        if (position === 0) break;
        position = padded.lastIndexOf(` ${name} `, position - 1);
      }
      return -1;
    }
    let geographic = [];
    for (const item of evidence) {
      const { index } = item;
      const positions = item.matchedAliases.map(areaPosition);
      const matchedAliases = item.matchedAliases.map((name, field) => positions[field] >= 0 ? name : '');
      const hits = matchedAliases.map(Boolean);
      if (!hits.some(Boolean)) continue;
      // A single name repeated in village/district/city is still one piece of evidence.
      const count = new Set(matchedAliases.filter(Boolean)).size;
      const score = hits.reduce((total, hit, i) => total + (hit ? [4, 3, 2, 1][i] : 0), 0);
      geographic.push({ index, count, score, matchedAliases, positions });
    }
    const markers = [/\b(?:KEL|KELURAHAN|DESA|DS)\s*$/, /\b(?:KEC|KECAMATAN)\s*$/,
      /\b(?:KOTA|KAB|KABUPATEN)\s*$/, /\b(?:PROV|PROVINSI)\s*$/];
    const explicitPositions = markers.map((marker, field) => geographic.reduce((last, item) => {
      const position = item.positions[field];
      return position >= 0 && marker.test(padded.slice(0, position)) ? Math.max(last, position) : last;
    }, -1));
    // Read the address from its tail: the last city/province establishes the
    // outer boundary before village or district names can compete. A province
    // may contain many cities; narrow it to the last city inside that boundary.
    // This also handles "Jl. Surabaya ... Jakarta" without routing to Surabaya.
    const tail = geographic.reduce((last, item) => Math.max(last, item.positions[2], item.positions[3]), -1);
    if (tail >= 0) {
      geographic = geographic.filter(item => item.positions[2] === tail || item.positions[3] === tail);
      const cityTail = geographic.reduce((last, item) => Math.max(last, item.positions[2]), -1);
      if (cityTail >= 0) geographic = geographic.filter(item => item.positions[2] === cityTail);
      else if (!markers[3].test(padded.slice(0, tail))) {
        // A city such as JAMBI shares its name with the province. If no other
        // city was supplied and the text does not explicitly say Provinsi,
        // route the city rather than asking the operator to choose among the province.
        const sameNameCity = geographic.filter(item => records[item.index].fields[2].some(alias =>
          padded.lastIndexOf(` ${alias} `) === tail && alias === item.matchedAliases[3]));
        if (sameNameCity.length) {
          geographic = sameNameCity;
          geographic.forEach(item => { item.positions[2] = tail; });
        }
      }
    }
    const cityKnown = geographic.some(item => item.positions[2] >= 0);
    for (const [field, position] of explicitPositions.entries()) {
      if (position < 0) continue;
      const compatible = geographic.filter(item => item.positions[field] === position);
      if (!compatible.length) return outcome('ambiguous', geographic.map(item => records[item.index].candidate),
        'Nama wilayah yang tertulis saling bertentangan. Periksa kelurahan, kecamatan, kota, dan provinsi pada alamat.');
      geographic = compatible;
    }
    // Within the boundary, an explicit kelurahan/kecamatan or two independent
    // lower-area names are strong evidence. An isolated word in a building or
    // street name must not defeat a compatible printed postal code.
    const strongLower = geographic.filter(item => {
      const lower = item.matchedAliases.slice(0, 2).filter(Boolean);
      return new Set(lower).size >= 2 || item.matchedAliases.slice(0, 2).some((name, field) => {
        if (!name) return false;
        const before = padded.slice(0, item.positions[field]);
        return markers[field].test(before);
      });
    });
    let ranked = geographic;
    if (tail >= 0) {
      // Continue inward from the administrative tail. The last district and
      // then village inside the known city beat earlier building-name matches.
      for (const field of [1, 0]) {
        const last = ranked.reduce((position, item) => Math.max(position, item.positions[field]), -1);
        if (last >= 0) ranked = ranked.filter(item => item.positions[field] === last);
      }
    }
    const lowerKnown = ranked.some(item => item.positions[0] >= 0 || item.positions[1] >= 0);
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
      // Intersect postal evidence with the geographic boundary BEFORE ranking
      // incidental lower names. Keep genuine contradictory area evidence for review.
      const postalPool = strongLower.length ? strongLower : (tail >= 0 ? geographic : []);
      const intersection = postalPool.filter(item => hinted.has(item.index));
      if (intersection.length) best = intersection;
      else if (postalPool.length) {
        const cityRouting = cityKnown ? cityDefault(geographic.map(item => records[item.index].candidate)) : null;
        if (cityRouting?.postcode === hint) {
          // A generic city code on an older label must not erase a known
          // village/district. Recompute the finer result instead of asking
          // the operator to choose between the city default and that area.
          if (lowerKnown) return resolveCandidates(best.map(item => records[item.index].candidate), { cityKnown, lowerKnown });
          return { ...outcome('matched', [cityRouting]), regionScope: 'CITY_POSTCODE', automatic: true };
        }
        return outcome('ambiguous', best.map(item => records[item.index].candidate),
          `Kode pos ${hint} tidak cocok dengan wilayah yang terbaca. Alamat perlu diperjelas untuk pencocokan otomatis.`);
      } else {
        const candidates = [...hinted].map(index => records[index].candidate);
        if (!candidates.length) return outcome('not_found', [], `Kode pos ${hint} tidak ditemukan dalam database lampiran.`);
        return resolveCandidates(candidates);
      }
    }
    const candidates = best.map(item => records[item.index].candidate);
    if (!candidates.length) return outcome('not_found', [], 'Wilayah belum ditemukan. Lengkapi kelurahan/desa, kecamatan, atau kota/kabupaten.');
    return resolveCandidates(candidates, { cityKnown, lowerKnown, postalHint: Boolean(hint) });
  }

  const api = { load, match, isLoaded: () => loaded, normalize, dataUrl: DATA_URL, matcherVersion: MATCHER_VERSION };
  root.MilePostalNational = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
