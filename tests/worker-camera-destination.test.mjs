import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${source}\nexport { createSessionToken, summarizeCameraRows, cameraNationalPostcodePending };`).toString('base64')}`;
const worker = await import(moduleUrl);
const region = { postcode: '29274', village: 'PENGALIHAN', district: 'KERITANG', city: 'INDRAGIRI HILIR', province: 'RIAU' };
const matchedRow = (address, selected = region, outsideBatam = true) => ({
  name: 'PENERIMA', address, zip: selected.postcode, outsideBatam,
  _nationalPostcodeMatch: { status: 'matched', postcode: selected.postcode, selected, lookupKey: `${address}\n\n` }
});
const outside = matchedRow('DESA PENGALIHAN, KERITANG');
const reviewedOutside = {
  ...outside, aiReviewFields: ['nama_penerima', 'alamat_penerima'], needsVerification: true,
  _aiReviewHydrated: true, _reviewState: { name: { pending: false }, address: { pending: false } }
};
const ambiguous = {
  name: 'PENERIMA', address: 'PENGALIHAN', outsideBatam: true,
  _nationalPostcodeMatch: { status: 'ambiguous', selected: null, candidates: [region], lookupKey: 'PENGALIHAN\n\n' }
};
const local = matchedRow('BELIAN, BATAM', { ...region, postcode: '29464', village: 'BELIAN', district: 'BATAM KOTA', city: 'BATAM' }, false);
const pendingText = { ...outside, needsReview: true };

assert.deepEqual(worker.summarizeCameraRows([outside], { destinationMode: 'cn23' }), {
  destinationMode: 'cn23', reviewCount: 0, reviewFieldCount: 0, outsideBatamCount: 1, cleanCount: 1, localBatamCount: 0, cn23Count: 1, destinationPendingCount: 0
});
assert.equal(worker.summarizeCameraRows([reviewedOutside], { destinationMode: 'cn23' }).cleanCount, 1);
assert.deepEqual(worker.summarizeCameraRows([ambiguous], { destinationMode: 'cn23' }), {
  destinationMode: 'cn23', reviewCount: 1, reviewFieldCount: 1, outsideBatamCount: 1, cleanCount: 0, localBatamCount: 0, cn23Count: 0, destinationPendingCount: 1
});
assert.deepEqual(worker.summarizeCameraRows([local, reviewedOutside, ambiguous, pendingText], { destinationMode: 'mixed' }), {
  destinationMode: 'mixed', reviewCount: 2, reviewFieldCount: 2, outsideBatamCount: 3, cleanCount: 2, localBatamCount: 1, cn23Count: 2, destinationPendingCount: 1
});
assert.equal(worker.summarizeCameraRows([{ ...outside, destinationMode: 'mixed' }], {}).destinationMode, 'batam');
assert.equal(worker.summarizeCameraRows([outside], { destinationMode: 'unsupported' }).cleanCount, 0);
assert.equal(worker.summarizeCameraRows([local, outside], undefined).cleanCount, 1);
assert.equal(worker.summarizeCameraRows([{ ...outside, _nationalPostcodeMatch: undefined }], { destinationMode: 'cn23' }).reviewCount, 1);
assert.equal(worker.summarizeCameraRows([{ ...reviewedOutside, _reviewState: { address: { pending: true } } }], { destinationMode: 'cn23' }).cleanCount, 0);
assert.equal(worker.summarizeCameraRows([{ ...reviewedOutside, name: 'PERLU DICEK' }], { destinationMode: 'cn23' }).reviewCount, 1);

const confirmed = {
  ...ambiguous, _confirmedNationalPostcode: { sourceKey: 'PENGALIHAN\n', selected: region }
};
assert.equal(worker.cameraNationalPostcodePending(confirmed), false, 'A current manual choice resolves an ambiguous match');
assert.equal(worker.cameraNationalPostcodePending({ ...confirmed, address: 'KERITANG' }), true);
assert.equal(worker.cameraNationalPostcodePending({ ...outside, address: 'ALAMAT BARU' }), true);
assert.equal(worker.cameraNationalPostcodePending({ ...outside, _nationalPostcodeQuery: 'SUKAMAJU' }), true);
assert.equal(worker.cameraNationalPostcodePending({ ...outside, _printedPostcode: '99999' }), true);
const queried = {
  ...outside, _nationalPostcodeQuery: '29274',
  _nationalPostcodeMatch: { ...outside._nationalPostcodeMatch, lookupKey: `${outside.address}\n29274\n29274` }
};
assert.equal(worker.cameraNationalPostcodePending(queried), false);

const secret = 'worker-camera-destination-test-secret-123456789';
const token = await worker.createSessionToken({
  v: 1, email: 'ikhsan@posnew.com', uid: 'destination-test', exp: Math.floor(Date.now() / 1000) + 600
}, secret);
const objects = new Map();
const bucket = {
  async put(key, value) { objects.set(key, String(value)); },
  async get(key) { return objects.has(key) ? { async json() { return JSON.parse(objects.get(key)); } } : null; },
  async list({ prefix = '' } = {}) {
    return { objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false };
  }
};
const env = { MILE_SESSION_SECRET: secret, BETA_AI_IMAGES: bucket };
const cookie = `__Host-mile_session=${token}`;
const save = async (id, form, rows, destinationMode) => {
  const response = await worker.default.fetch(new Request(`https://mile.posnew.com/api/camera/batch/${id}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ id, createdAt: Date.now(), form, rows, destinationMode })
  }), env);
  assert.equal(response.status, 200);
  const get = await worker.default.fetch(new Request(`https://mile.posnew.com/api/camera/batch/${id}`, { headers: { cookie } }), env);
  assert.equal(get.status, 200);
  return (await get.json()).batch;
};

const cn23Rows = [reviewedOutside, ambiguous, pendingText];
const savedCn23 = await save('CAM-destination-cn23-test', { destinationMode: 'cn23', customerId: 'CUSTOMER' }, cn23Rows, 'batam');
assert.equal(savedCn23.destinationMode, 'cn23', 'The stored form takes priority over top-level mode');
assert.equal(savedCn23.form.destinationMode, 'cn23');
assert.equal(savedCn23.form.customerId, 'CUSTOMER');
assert.equal(savedCn23.cleanCount, 1);
assert.equal(savedCn23.reviewCount, 2);
assert.equal(savedCn23.outsideBatamCount, 3);
assert.deepEqual(savedCn23.rows, cn23Rows, 'Review and national lookup metadata survive the result roundtrip');

const savedMixed = await save('CAM-destination-mixed-test', { destinationMode: 'mixed' }, [local, confirmed], 'cn23');
assert.equal(savedMixed.cleanCount, 2);
assert.equal(savedMixed.reviewCount, 0);
assert.equal(savedMixed.destinationMode, 'mixed');
const savedLegacy = await save('CAM-destination-legacy-test', {}, [local, { ...outside, destinationMode: 'cn23' }], 'mixed');
assert.equal(savedLegacy.destinationMode, 'batam');
assert.equal(savedLegacy.form.destinationMode, 'batam');
assert.equal(savedLegacy.cleanCount, 1);
const savedInvalid = await save('CAM-destination-invalid-test', { destinationMode: 'invalid' }, [outside], 'mixed');
assert.equal(savedInvalid.destinationMode, 'batam');
assert.equal(savedInvalid.cleanCount, 0);

// Older CN23 summaries can carry stale clean counts; list derives them from current row metadata.
for (const [key, value] of objects) {
  const result = JSON.parse(value);
  if (result.id === savedCn23.id) {
    result.cleanCount = 0;
    result.reviewCount = 0;
    result.reviewFieldCount = 0;
  }
  if (result.id === savedLegacy.id) {
    delete result.cleanCount;
    delete result.reviewCount;
    delete result.reviewFieldCount;
    delete result.outsideBatamCount;
    delete result.form.destinationMode;
    result.destinationMode = 'mixed';
  }
  objects.set(key, JSON.stringify(result));
}
const listedResponse = await worker.default.fetch(new Request('https://mile.posnew.com/api/camera/batches', { headers: { cookie } }), env);
assert.equal(listedResponse.status, 200);
const listed = (await listedResponse.json()).batches;
const listedCn23 = listed.find(batch => batch.id === savedCn23.id);
assert.equal(listedCn23.destinationMode, 'cn23');
assert.equal(listedCn23.cleanCount, 1);
assert.equal(listedCn23.reviewCount, 2);
assert.equal(listedCn23.reviewFieldCount, 2);
assert.equal(listedCn23.outsideBatamCount, 3);
const listedLegacy = listed.find(batch => batch.id === savedLegacy.id);
assert.equal(listedLegacy.destinationMode, 'batam');
assert.equal(listedLegacy.cleanCount, 1);
assert.equal(listedLegacy.outsideBatamCount, 1);
const listedMixed = listed.find(batch => batch.id === savedMixed.id);
assert.equal(listedMixed.destinationMode, 'mixed');
assert.equal(listedMixed.cleanCount, 2);
assert.equal(listedMixed.localBatamCount, 1);
assert.equal(listedMixed.cn23Count, 1);
assert.equal(listedMixed.destinationPendingCount, 0);

console.log('PASS worker-camera-destination: authoritative form mode, reviewed national rows, unresolved destination gates, legacy fallback, result roundtrip');
