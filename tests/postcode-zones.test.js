const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const xlsx = require('../assets/vendor/sheetjs/xlsx.full.min.js');
const zones = require('../assets/js/postcode-zones.js');
const data = JSON.parse(fs.readFileSync('assets/data/postcodes-indonesia.json', 'utf8'));

assert.equal(zones.source.sourceRecordCount, 12201);
assert.equal(Object.keys(zones.zones).length, 12202);
for (const [postcode, expected] of [
  ['29411', '29400'], ['29414', '29400'], ['29438', '29400'], ['29491', '29400'],
  ['29481', '29664'], ['29488', '29664'], ['29111', '29100'], ['10220', '10000'],
  ['40111', '40000'], ['28511', '28558B1'], ['99695', '99692B1']
]) assert.equal(zones.resolve(postcode), expected, postcode);
for (const postcode of ['', '2941', '29411B1', '29411.0', '00000', '29437', '29465']) {
  assert.throws(() => zones.resolve(postcode), /5 digit|belum ada dalam referensi/, postcode);
}
for (const row of data.rows) {
  if (data.dictionaries.cities[row[3]] !== 'BATAM') continue;
  const district = data.dictionaries.districts[row[2]];
  assert.equal(zones.isLocalBatam({ postcode: row[0], district, city: 'BATAM' }), district !== 'BELAKANG PADANG', district);
}
assert.equal(zones.isLocalBatam({ city: 'DELI SERDANG', district: 'GALANG' }), false);

(async () => {
  for (const file of ['app.html', 'beta.html', 'review.html']) {
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url: 'https://fixture.test/review', runScripts: 'outside-only' });
    const w = dom.window, d = w.document;
    try {
      const alerts = [], downloads = [];
      let saved;
      w.fetch = async (url, options) => {
        if (String(url).includes('postcodes-indonesia')) return { ok: true, json: async () => data };
        if (options?.method === 'POST') saved = JSON.parse(options.body);
        return { ok: true, json: async () => ({ ok: true, batch: saved, batches: [] }) };
      };
      w.alert = message => alerts.push(message);
      w.showToast = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.XLSX = { ...xlsx, writeFile(book, filename) {
        const reread = xlsx.read(xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
        const sheet = reread.Sheets[reread.SheetNames[0]];
        downloads.push({ filename, sheet, rows: xlsx.utils.sheet_to_json(sheet) });
      } };
      for (const source of ['postcode-zones', 'postcode-national', 'app-core', 'camera-sync', 'events-v16']) {
        w.eval(fs.readFileSync(`assets/js/${source}.js`, 'utf8'));
      }
      await new Promise(resolve => w.setTimeout(resolve, 10));
      d.getElementById('clientMode').value = 'RITEL'; w.handleModeChange();
      for (const [id, value] of Object.entries({ destinationMode: 'mixed', senderName: 'PENGIRIM', senderAddress: 'BATAM', serviceCode: 'PKH' })) {
        d.getElementById(id).value = value;
      }
      const core = w.__mileCore;
      await core.refreshNationalPostcodes();
      const rows = [
        { name: 'BATAM', address: 'KEL. BELIAN KEC. BATAM KOTA BATAM 29414' },
        { name: 'GALANG', address: 'SEMBULANG KEC. GALANG BATAM 29481', outsideBatam: true },
        { name: 'GALANG BARU', address: 'GALANG BARU KEC. GALANG BATAM 29484' },
        { name: 'BATU AJI', address: 'KEL. BULIANG KEC. BATU AJI BATAM 29438' },
        { name: 'PECONG', address: 'KEL. PECONG KEC. BELAKANG PADANG BATAM 29414' },
        { name: 'BELAKANG PADANG', address: 'KEC. BELAKANGPADANG KOTA BATAM' }
      ].map(row => ({ ...row, phone: '0', cw: '0.20' }));
      // Old saved matches must be recomputed under the new routing policy.
      rows.at(-1)._nationalPostcodeMatch = { status: 'matched', matcherVersion: 'old',
        lookupKey: `${rows.at(-1).address}\n\n`, selected: { postcode: '29411', city: 'BATAM' } };
      core.uploadedFilesManager.push({ id: 'zone-fixture', name: 'Batch campuran lama', rows });
      core.updateInterface();
      assert.deepEqual(rows.map(row => core.getShipmentRoute(row)), ['batam', 'batam', 'batam', 'batam', 'cn23', 'cn23'], file);
      assert.equal(d.getElementById('batamRouteCount').textContent, '4', file);
      assert.equal(d.getElementById('cn23RouteCount').textContent, '2', file);
      await w.downloadFinalExcel();
      assert.deepEqual(alerts, [], `${file}: export validation`);
      assert.equal(downloads.length, 2, file);
      const local = downloads.find(item => item.filename.startsWith('Upload_'));
      const cn = downloads.find(item => item.filename.startsWith('Antrean_'));
      assert.deepEqual(local.rows.map(row => row.destination_data_customer_name), ['BATAM', 'GALANG', 'GALANG BARU', 'BATU AJI']);
      assert.deepEqual(cn.rows.map(row => row.recipient_name), ['PECONG', 'BELAKANG PADANG']);
      for (const row of local.rows) {
        assert.equal(row.origin_data_zone_code, zones.resolve(row.origin_data_customer_zip_code));
        assert.equal(row.destination_data_zone_code, zones.resolve(row.destination_data_customer_zip_code));
      }
      assert.equal(local.rows[1].destination_data_zone_code, '29664', 'Galang keeps its reference zone in a local workbook');
      assert.equal(local.rows[2].destination_data_zone_code, '29664');
      assert.equal(local.rows[3].destination_data_zone_code, '29400', 'Explicitly confirmed Batu Aji mapping');
      for (const address of ['BELAKANG PADANG BATAM 29491', 'BELAKANGPADANG BATAM', 'PECONG KEC. BELAKANG PADANG BATAM']) {
        assert.equal(core.getShipmentRoute({ address }), 'cn23', address);
      }
      for (const row of [
        { address: 'ALAMAT SINGKAT 29491' },
        { address: 'ALAMAT SINGKAT BATAM', _printedPostcode: '29492' },
        { address: 'BELAKANG PADANG BATAM 29496' }
      ]) {
        assert.equal(core.getShipmentRoute(row), 'cn23', 'Reference-only postal evidence must not become default local Batam');
        assert.match(core.getNationalPostcodeMatch(row).postcode, /^2949[1-6]$/);
      }
      assert.equal(core.getShipmentRoute({ address: 'BELIAN BATAM 29491' }), 'batam', 'A contradictory printed code cannot replace a clear different village');

      if (file === 'review.html') {
        await w.MileCameraSync.saveBatchResults('CAM-ZONES', 1, Date.now(), 'Fixture', 6);
        assert.equal(saved.localBatamCount, 4);
        assert.equal(saved.cn23Count, 2);
        core.uploadedFilesManager.length = 0;
        await w.MileCameraSync.loadBatchToDesktop('CAM-ZONES');
        assert.deepEqual(Array.from(core.uploadedFilesManager[0].rows, row => core.getShipmentRoute(row)), ['batam', 'batam', 'batam', 'batam', 'cn23', 'cn23']);
      }

      downloads.length = 0;
      core.uploadedFilesManager[0].rows.push({ name: 'BELUM DIPADANKAN', address: 'KEL. TANJUNG PIAYU KEC. SUNGAI BEDUK BATAM 29437', phone: '0', cw: '0.20' });
      core.updateInterface();
      await w.downloadFinalExcel();
      assert.equal(downloads.length, 0, 'A missing mapping blocks all files before any partial download');
      assert.match(alerts.pop(), /29437.*belum ada dalam referensi/);
      core.uploadedFilesManager[0].rows.splice(-1);

      d.getElementById('destinationMode').value = 'batam';
      core.uploadedFilesManager[0].rows = [{ name: 'BELAKANG PADANG', address: 'BELAKANG PADANG BATAM 29491', phone: '0', cw: '0.20' }];
      core.updateInterface();
      assert.equal(w.getPendingOutsideBatamCount(), 1, 'Belakang Padang also cannot enter a local-only export');
      await w.downloadFinalExcel();
      assert.equal(downloads.length, 0);
      assert.match(alerts.pop(), /luar Kota Batam/);

      d.getElementById('clientMode').value = 'PINDAH'; w.handleModeChange();
      d.getElementById('senderName').value = 'PENGIRIM';
      d.getElementById('senderAddress').value = 'BATAM';
      d.getElementById('destZipPindah').value = '28511';
      d.getElementById('destZipPindah').dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.equal(d.getElementById('destZonePindah').value, '28558B1');
      assert.equal(d.getElementById('destZonePindah').readOnly, true);
      d.getElementById('destZonePindah').value = 'STALE-ZONE';
      core.uploadedFilesManager.push({ id: 'pindah-fixture', name: 'Barang Pindah', rows: [
        { name: 'PINDAH', address: 'PASIRPENGARAIAN', phone: '0', cw: '2.00', insHarga: 100000 }
      ] });
      core.updateInterface();
      await w.downloadFinalExcel();
      assert.deepEqual(alerts, []);
      assert.equal(downloads.length, 1);
      assert.equal(downloads[0].rows[0].destination_data_customer_zip_code, '28511');
      assert.equal(downloads[0].rows[0].destination_data_zone_code, '28558B1', 'Exact alphanumeric zone survives actual XLSX serialization and stale inputs');
      assert.equal(downloads[0].sheet.L2.t, 's');
    } finally { w.close(); }
  }
  console.log('PASS postcode zones: exact reference pairs, alpha zones, origin/destination XLSX, Galang local, Belakang Padang CN, stale logs, missing mappings, and PINDAH on app/beta/review');
})().catch(error => { console.error(error); process.exitCode = 1; });
