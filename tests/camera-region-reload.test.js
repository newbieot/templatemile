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
  w.fetch = async url => {
    if (url.includes('postcodes-indonesia')) {
      await new Promise(resolve => setTimeout(resolve, 240));
      databaseReady = true;
      return { ok: true, json: async () => data };
    }
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
    console.log('PASS camera-region-reload: delayed database, old camera log recalculated, correct region displayed and exported');
  } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
