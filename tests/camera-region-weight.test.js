const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const data = JSON.parse(fs.readFileSync('assets/data/postcodes-indonesia.json', 'utf8'));

(async () => {
  const dom = new JSDOM(fs.readFileSync('review.html', 'utf8'), { url: 'https://fixture.test/review', runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  const address = 'Gedung Sahid Sudirman Center Jl. Jend. Sudirman Kav. 86 Jakarta 10220';
  let batch = { rows: [{ name: 'PENERIMA', address, cw: '0.20', phone: '0',
    _confirmedNationalPostcode: { sourceKey: `${address}\n`, selected: { postcode: '90553', city: 'MAROS' } },
    _nationalPostcodeMatch: { status: 'ambiguous', lookupKey: `${address}\n\n`, candidates: [{ city: 'MAROS' }] } }],
    form: { destinationMode: 'mixed', clientMode: 'RITEL', senderName: 'PENGIRIM', senderAddress: 'BATAM', itemType: 'DOKUMEN', serviceCode: 'PKH' } };
  let databaseReady = false, saves = 0;
  const notifications = [];
  w.showToast = message => notifications.push(message);
  w.alert = message => { throw new Error(message); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async (url, options) => {
    if (url.includes('postcodes-indonesia')) {
      await new Promise(resolve => setTimeout(resolve, 240));
      databaseReady = true;
      return { ok: true, json: async () => data };
    }
    if (options?.method === 'POST') { batch = JSON.parse(options.body); saves++; return { json: async () => ({ ok: true }) }; }
    return { json: async () => ({ ok: true, batch: structuredClone(batch), batches: [] }) };
  };
  for (const file of ['postcode-national', 'app-core', 'camera-sync']) w.eval(fs.readFileSync(`assets/js/${file}.js`, 'utf8'));
  await new Promise(resolve => w.setTimeout(resolve, 20));
  const core = w.__mileCore;
  try {
    await w.MileCameraSync.loadBatchToDesktop('CAM-REGRESSION');
    assert.equal(databaseReady, true, 'Log reload must wait for slow database loading.');
    assert.equal(core.uploadedFilesManager.length, 1, notifications.join('; '));
    let row = core.uploadedFilesManager[0].rows[0];
    assert.equal(core.getNationalPostcodeMatch(row).postcode, '10220');
    assert.equal(row._confirmedNationalPostcode, undefined, 'A stale manual selection outside Jakarta must not override the new algorithm.');
    const tr = d.querySelector('#resultTable tbody tr');
    assert.ok(tr.cells[0].classList.contains('row-number-cell'));
    assert.ok(tr.cells[1].querySelector('.val-cw'), 'Kg must be beside row number, before recipient name.');
    assert.equal(tr.querySelectorAll('.val-cw').length, 1);
    assert.ok(tr.cells[2].querySelector('.val-name'), 'Recipient name must follow Kg.');
    assert.equal(d.querySelector('.national-postcode-choice'), null, 'The website must not ask the user to select a region.');
    assert.ok(tr.querySelector('.national-postcode-review').textContent.includes('KARET TENGSIN'));
    const input = tr.querySelector('.val-cw');
    input.value = '1,5'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(row.cw, '1,5');
    assert.equal(core.buildCn23QueueRows([row])[0].weight_kg, 1.5);
    await w.MileCameraSync.saveBatchResults('CAM-REGRESSION', 1, Date.now(), 'Fixture', 2);
    assert.ok(saves > 0);
    assert.equal(batch.rows[0].cw, '1,5');
    core.uploadedFilesManager.length = 0;
    await w.MileCameraSync.loadBatchToDesktop('CAM-REGRESSION');
    row = core.uploadedFilesManager[0].rows[0];
    assert.equal(row.cw, '1,5', 'Edited weight survives camera log roundtrip.');
    assert.equal(core.buildCn23QueueRows([row])[0].weight_kg, 1.5);
    assert.equal(d.querySelector('.val-cw').value, '1,5');
    row.address = 'Jl. Sudirman Bandung';
    core.updateInterface();
    assert.equal(core.buildCn23QueueRows([row])[0].recipient_postcode, '40111');
    assert.equal(core.buildCn23QueueRows([row])[0].recipient_region_scope, 'CITY POSTCODE');
    assert.equal(d.querySelector('.national-postcode-choice'), null);
    const defaultAddress = 'Gedung Sahid Sudirman Center Jl. Jend. Sudirman Kav. 86';
    batch.rows[0].address = defaultAddress;
    batch.rows[0]._nationalPostcodeMatch = { status: 'ambiguous', matcherVersion: '20261005-auto-city-weight-2',
      lookupKey: `${defaultAddress}\n\n`, selected: null };
    batch.rows[0].aiConfidence = 0.4;
    batch.rows[0].needsVerification = true;
    batch.rows[0].aiReviewFields = ['nama_penerima', 'alamat_penerima'];
    batch.rows[0]._aiReviewHydrated = true;
    batch.rows[0]._reviewState = { name: { source: 'ai-row', pending: true, requiresChange: false },
      address: { source: 'ai-field', pending: true, requiresChange: false } };
    core.uploadedFilesManager.length = 0;
    await w.MileCameraSync.loadBatchToDesktop('CAM-REGRESSION');
    row = core.uploadedFilesManager[0].rows[0];
    const defaultMatch = core.getNationalPostcodeMatch(row);
    assert.equal(defaultMatch.defaulted, true, 'Restored logs recalculate the new configured default.');
    assert.equal(defaultMatch.postcode, '29411');
    assert.equal(core.getShipmentRoute(row), 'batam');
    assert.equal(d.getElementById('pendingRouteCount').textContent, '0');
    assert.equal(w.getPendingReviewCount(), 0, 'Readable low-confidence data loaded from old logs requires no mandatory correction.');
    assert.equal(d.querySelector('input[data-review-pending="true"]'), null);
    assert.equal(batch.reviewCount, 0, 'Saved log summaries use the reconciled mandatory correction policy.');
    assert.ok(d.querySelector('.national-postcode-review').textContent.includes('Default Batam: 29411'));
    assert.equal(d.querySelector('.national-postcode-review').textContent.includes('Tujuan perlu diperiksa'), false);
    const xlsx = require('../assets/vendor/sheetjs/xlsx.full.min.js'), downloads = [];
    w.XLSX = { ...xlsx, writeFile(book, filename) {
      downloads.push({ filename, rows: xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]) });
    } };
    await w.downloadFinalExcel();
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].filename, 'Upload_MileApp_Ritel.xlsx');
    assert.equal(downloads[0].rows[0].destination_data_customer_zip_code, '29411');
    assert.equal(downloads[0].rows[0].koli_data_koli_weight, 1.5);
    console.log('PASS camera-region-weight: slow database, stale region reload, editable Kg order, export and saved-log roundtrip');
  } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
