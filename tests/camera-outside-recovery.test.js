const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = JSON.parse(read('assets/data/postcodes-indonesia.json'));
const pause = () => new Promise(resolve => setTimeout(resolve, 20));

(async () => {
  for (const page of ['review.html', 'app.html', 'beta.html']) {
    const dom = new JSDOM(read(page), { url: 'https://fixture.test/review', runScripts: 'outside-only' });
    const w = dom.window;
    try {
      const errors = [];
      w.addEventListener('error', event => errors.push(event.error));
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: text => ({ width: String(text).length * 8 }) });
      w.confirm = () => { throw new Error('Recovery must not ask to delete or rewrite an address'); };
      w.fetch = async () => ({ ok: true, json: async () => data });
      w.eval(read('extensions/mile-cn23/vendor/xlsx.full.min.js'));
      const exports = [];
      w.XLSX.writeFile = (workbook, filename) => exports.push({ workbook, filename });
      const get = id => w.document.getElementById(id);
      get('clientMode').value = 'RITEL';
      get('destinationMode').value = 'batam';
      for (const [id, value] of Object.entries({ senderName: 'PENGIRIM UJI', senderPhone: '08123456789', senderAddress: 'KOTA BATAM' })) get(id).value = value;
      w.eval(read('assets/js/postcode-national.js'));
      w.eval(read('assets/js/app-core.js'));
      w.eval(read('assets/js/ui.js'));
      await pause(); // Real DOMContentLoaded binds the recovery button.
      const addresses = ['JL. PENDIDIKAN PULAU KIJANG INHIL-RIAU.', 'SUNGAI GUNTUNG KATEMAN INHIL RIAU', 'PULAU KIJANG RIAU', 'BELIAN BATAM KOTA BATAM KEPRI'];
      const rows = addresses.map((address, index) => ({
        _rowId: 'capture-' + index, name: 'PENERIMA ' + index, address, phone: '0', noSurat: 'REF ' + index,
        zip: '29411', outsideBatam: index < 3, act: 0.2, cw: '0.20', p: 10, l: 10, t: 10
      }));
      w.__mileCore.uploadedFilesManager.push({ id: 'camera-test', name: 'Foto uji', source: 'CAMERA', rows });
      w.updateInterface();
      assert.equal(get('outsideBatamAlert').hidden, false, page);
      assert.doesNotMatch(get('outsideBatamActionHint').textContent, /Hapus baris|wajib diperbaiki/);
      get('useMixedDestinationButton').click();
      for (let attempt = 0; attempt < 50 && get('resultTable').querySelectorAll('[data-postcode-status="matched"]').length < 4; attempt++) await pause();
      assert.equal(get('destinationMode').value, 'mixed');
      assert.equal(w.__mileCore.uploadedFilesManager[0].rows.length, 4, 'All captures are retained');
      assert.deepEqual(Array.from(rows, row => row.address), addresses, 'Recovery never invents Batam or changes the label');
      assert.equal(get('outsideBatamAlert').hidden, true);
      assert.equal(get('resultTable').querySelectorAll('[data-outside-batam-pending="true"]').length, 0);
      assert.equal(get('resultTable').querySelectorAll('[data-postcode-status="matched"]').length, 4);
      assert.equal(get('resultTable').querySelectorAll('.national-postcode-query, .national-postcode-choice').length, 0, 'Matched addresses need no manual region search');
      assert.deepEqual(Array.from(rows, row => row.zip), ['29273', '29255', '29273', '29464']);
      assert.equal(get('batamRouteCount').textContent, '1');
      assert.equal(get('cn23RouteCount').textContent, '3');
      await w.downloadLocalExcel();
      await w.downloadCn23Excel();
      assert.equal(exports.length, 2, 'Two separate workbooks');
      const local = exports.find(item => !item.workbook.SheetNames.includes('CN23_ANTREAN'));
      const national = exports.find(item => item.workbook.SheetNames.includes('CN23_ANTREAN'));
      assert.equal(w.XLSX.utils.sheet_to_json(local.workbook.Sheets.Sheet1).length, 1);
      const queue = w.XLSX.utils.sheet_to_json(national.workbook.Sheets.CN23_ANTREAN);
      assert.equal(queue.length, 3);
      const Q=require('../extensions/mile-cn23/queue.js');assert.equal(Q.validateRows(queue).length,3);
      assert.equal(queue[1].recipient_village,'');assert.equal(queue[1].recipient_region_scope,'DISTRICT POSTCODE');assert.equal(queue[1].recipient_postcode,'29255');
      assert.equal(queue[0].recipient_village, 'PULAU KIJANG');
      assert.equal(queue[0].recipient_district, 'RETEH');
      assert.equal(queue[0].recipient_postcode, '29273');
      // Missing city/province uses the configured default without changing or removing the label.
      const editor = get('resultTable').querySelector('.val-address');
      editor.value = 'SUKAMAJU';
      editor.dispatchEvent(new w.Event('input', { bubbles: true }));
      await pause();
      assert.equal(rows[0].zip, '29411');
      assert.equal(get('resultTable').querySelector('.national-postcode-choice'), null);
      assert.match(get('resultTable').querySelector('.national-postcode-review').textContent, /Default Batam: 29411/);
      assert.equal(get('pendingRouteCount').textContent, '0');
      assert.equal(get('batamRouteCount').textContent, '2');
      assert.equal(rows.length, 4);
      assert.equal(errors.length, 0, errors.map(String).join('\n'));
    } finally { dom.window.close(); }
  }
  console.log('Actual review/app/beta DOM: recover outside rows, automatic postcodes, split Excel, and exceptional ambiguity verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
