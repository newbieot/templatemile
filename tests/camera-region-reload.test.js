const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const data = JSON.parse(fs.readFileSync('assets/data/postcodes-indonesia.json', 'utf8'));

(async () => {
  const dom = new JSDOM(fs.readFileSync('review.html', 'utf8'), { url: 'https://fixture.test/review', runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  const address = 'Gedung Sahid Sudirman Center Jl. Jend. Sudirman Kav. 86 Jakarta 10220';
  const batch = { rows: [{ name: 'PENERIMA', address, cw: '0.20', phone: '0',
    _nationalPostcodeMatch: { status: 'ambiguous', lookupKey: `${address}\n\n`, candidates: [{ city: 'MAROS' }] } }],
    form: { destinationMode: 'mixed', clientMode: 'RITEL', senderName: 'PENGIRIM', senderAddress: 'BATAM', itemType: 'DOKUMEN', serviceCode: 'PKH' } };
  let databaseReady = false;
  const notifications = [];
  w.showToast = message => notifications.push(message);
  w.alert = message => { throw new Error(message); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  let saved;
  w.fetch = async (url, options) => {
    if (url.includes('postcodes-indonesia')) {
      await new Promise(resolve => setTimeout(resolve, 240));
      databaseReady = true;
      return { ok: true, json: async () => data };
    }
    if (options?.method === 'POST') { saved = JSON.parse(options.body); return { json: async () => ({ ok: true }) }; }
    return { json: async () => ({ ok: true, batch: structuredClone(batch), batches: [] }) };
  };
  for (const file of ['postcode-national', 'app-core', 'camera-sync']) w.eval(fs.readFileSync(`assets/js/${file}.js`, 'utf8'));
  await new Promise(resolve => w.setTimeout(resolve, 20));
  const core = w.__mileCore;
  try {
    await w.MileCameraSync.loadBatchToDesktop('CAM-REGRESSION');
    assert.equal(databaseReady, true, 'Log reload must wait for slow database loading.');
    assert.equal(core.uploadedFilesManager.length, 1, notifications.join('; '));
    const row = core.uploadedFilesManager[0].rows[0];
    assert.equal(core.getNationalPostcodeMatch(row).postcode, '10220');
    assert.equal(row._nationalPostcodeMatch.matcherVersion, w.MilePostalNational.matcherVersion);
    assert.ok(d.querySelector('.national-postcode-review').textContent.includes('KARET TENGSIN'));
    const queue = core.buildCn23QueueRows([row]);
    assert.equal(queue[0].recipient_city, 'JAKARTA PUSAT');
    assert.equal(queue[0].recipient_district, 'TANAH ABANG');
    assert.equal(queue[0].recipient_postcode, '10220');
    const compoundAddress = 'ARTHA INDAH BATU AJI BLOK K NO 19 DI TEMPAT';
    const wrongRegion = { city: 'BATU', province: 'JAWA TIMUR', postcode: '65311', village: '', district: '' };
    batch.rows = [{ name: 'PENERIMA', address: compoundAddress, cw: '0.20', phone: '0', zip: '65311', outsideBatam: true,
      _nationalPostcodeMatch: { status: 'matched', selected: wrongRegion, postcode: '65311',
        matcherVersion: '20261006-auto-destination-4', lookupKey: `${compoundAddress}\n\n` },
      _confirmedNationalPostcode: { sourceKey: `${compoundAddress}\n`, selected: wrongRegion } }];
    core.uploadedFilesManager.length = 0;
    await w.MileCameraSync.loadBatchToDesktop('CAM-COMPOUND-REGION');
    const local = core.uploadedFilesManager[0].rows[0];
    assert.equal(core.getNationalPostcodeMatch(local).selected.city, 'BATAM');
    assert.equal(core.getNationalPostcodeMatch(local).selected.district, 'BATU AJI');
    assert.equal(local.zip, '29438');
    assert.equal(local._confirmedNationalPostcode, undefined, 'A stale Kota Batu selection is invalidated.');
    assert.equal(core.getShipmentRoute(local), 'batam', 'The stale outsideBatam flag cannot route this address into CN23.');
    assert.equal(d.getElementById('pendingRouteCount').textContent, '0');
    assert.ok(d.querySelector('.national-postcode-review').textContent.includes('Batam · Excel Mile'));
    assert.equal(d.querySelector('.national-postcode-choice'), null);
    await w.MileCameraSync.saveBatchResults('CAM-COMPOUND-REGION', 1, Date.now(), 'Fixture', 2);
    assert.equal(saved.localBatamCount, 1);
    assert.equal(saved.cn23Count, 0);
    assert.equal(saved.destinationPendingCount, 0);
    assert.equal(saved.rows[0].zip, '29438');
    const xlsx = require('../assets/vendor/sheetjs/xlsx.full.min.js'), downloads = [];
    w.XLSX = { ...xlsx, writeFile(book, filename) { downloads.push({ filename, rows: xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]) }); } };
    await w.downloadFinalExcel();
    assert.equal(downloads.length, 1, 'Only a local Batam workbook is downloaded.');
    assert.equal(downloads[0].filename, 'Upload_MileApp_Ritel.xlsx');
    assert.equal(downloads[0].rows[0].destination_data_customer_zip_code, '29438');
    const housingAddress = 'PERUM TIBAN RIAU BERTUAH THP II BLOK F NO 19';
    const wrongRiau = { city: 'INDRAGIRI HULU', province: 'RIAU', district: 'LIRIK', village: 'LAMBANG SARI I / II / III', postcode: '29353' };
    batch.rows = [{ name: 'PENERIMA TIBAN', address: housingAddress, cw: '1.50', phone: '0', zip: '29353', outsideBatam: true,
      _nationalPostcodeMatch: { status: 'matched', selected: wrongRiau, postcode: '29353',
        matcherVersion: '20261006-whole-region-5', lookupKey: `${housingAddress}\n\n` },
      _confirmedNationalPostcode: { sourceKey: `${housingAddress}\n`, selected: wrongRiau } }];
    core.uploadedFilesManager.length = 0;
    await w.MileCameraSync.loadBatchToDesktop('CAM-TIBAN-REGION');
    const housing = core.uploadedFilesManager[0].rows[0];
    const housingMatch = core.getNationalPostcodeMatch(housing);
    assert.equal(housingMatch.selected.city, 'BATAM');
    assert.equal(housingMatch.selected.district, 'SEKUPANG');
    assert.equal(housingMatch.selected.village, 'PATAM LESTARI');
    assert.equal(housing.zip, '29427');
    assert.equal(housing._confirmedNationalPostcode, undefined);
    assert.equal(core.getShipmentRoute(housing), 'batam');
    await w.MileCameraSync.saveBatchResults('CAM-TIBAN-REGION', 1, Date.now(), 'Fixture', 3);
    assert.equal(saved.localBatamCount, 1);
    assert.equal(saved.cn23Count, 0);
    assert.equal(saved.rows[0].zip, '29427');
    await w.downloadFinalExcel();
    assert.equal(downloads.length, 2);
    assert.equal(downloads[1].filename, 'Upload_MileApp_Ritel.xlsx');
    assert.equal(downloads[1].rows[0].destination_data_customer_zip_code, '29427');
    assert.equal(downloads[1].rows[0].koli_data_koli_weight, 1.5);
    console.log('PASS camera-region-reload: delayed database, Jakarta/Batu Aji/Tiban stale logs recalculated, stale manual/outside flags overridden, local summary and correct Excel export');
  } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
