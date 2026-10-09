const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const data = JSON.parse(fs.readFileSync('assets/data/postcodes-indonesia.json', 'utf8'));
const xlsx = require('../assets/vendor/sheetjs/xlsx.full.min.js');

(async () => {
  for (const file of ['review.html', 'app.html', 'beta.html']) {
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url: 'https://fixture.test/review', runScripts: 'outside-only' });
    const w = dom.window, d = w.document;
    try {
      w.fetch = async () => ({ ok: true, json: async () => data });
      w.alert = message => { throw new Error(message); };
      w.HTMLElement.prototype.scrollIntoView = () => {};
      for (const source of ['postcode-national', 'app-core', 'ui', 'events-v16']) w.eval(fs.readFileSync(`assets/js/${source}.js`, 'utf8'));
      await new Promise(resolve => w.setTimeout(resolve, 10));
      d.getElementById('clientMode').value = 'RITEL'; w.handleModeChange();
      for (const [id, value] of Object.entries({ destinationMode: 'mixed', senderName: 'PENGIRIM', senderAddress: 'BATAM', serviceCode: 'PKH' })) d.getElementById(id).value = value;
      const core = w.__mileCore;
      await core.refreshNationalPostcodes();
      const local = { name: 'PENERIMA BATAM', address: 'PERUM TIBAN RIAU BERTUAH THP II', cw: '2.00', phone: '0' };
      const outside = { name: 'PENERIMA JAKARTA', address: 'Karet Tengsin Tanah Abang Jakarta Pusat 10220', cw: '1.50', phone: '0' };
      core.uploadedFilesManager.push({ id: 'fixture', name: 'Foto', rows: [local, outside] }); core.updateInterface();
      const rows = () => [...d.querySelectorAll('#resultTable tbody tr[data-row-id]')];
      assert.equal(rows().filter(row => !row.hidden).length, 2, file);
      assert.equal(d.getElementById('batamRouteCount').textContent, '1');
      assert.equal(d.getElementById('cn23RouteCount').textContent, '1');
      assert.equal(d.getElementById('outsideBatamCount').closest('.summary-item').hidden, true, 'Only the active local/CN23 counters are shown in national modes.');
      d.getElementById('cn23RouteSummary').click();
      assert.deepEqual(rows().filter(row => !row.hidden).map(row => row.querySelector('.val-name').value), ['PENERIMA JAKARTA']);
      assert.equal(rows().filter(row => !row.hidden)[0].dataset.rowNumber, '2', 'Original row number identifies the capture.');
      assert.equal(d.getElementById('cn23RouteSummary').getAttribute('aria-pressed'), 'true');
      const weight = rows().find(row => !row.hidden).querySelector('.val-cw');
      weight.value = '3.25'; weight.dispatchEvent(new w.Event('input', { bubbles: true }));
      d.getElementById('batamRouteSummary').click();
      assert.deepEqual(rows().filter(row => !row.hidden).map(row => row.querySelector('.val-name').value), ['PENERIMA BATAM']);
      assert.equal(outside.cw, '3.25', 'Changing filters preserves edits.');
      assert.equal(d.getElementById('recordCount').textContent, '2', 'Counts describe the whole batch.');
      const downloads = [];
      w.XLSX = { ...xlsx, writeFile(book, name) { downloads.push({ name, rows: xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]) }); } };
      await w.downloadFinalExcel();
      assert.equal(downloads.length, 2, 'Filtering cannot silently drop hidden recipients from export.');
      assert.equal(downloads.find(item => item.name.startsWith('Antrean')).rows[0].weight_kg, 3.25);
      d.querySelector('[data-route="all"]').click();
      assert.equal(rows().filter(row => !row.hidden).length, 2);
      d.getElementById('destinationMode').value = 'cn23'; core.updateInterface();
      assert.equal(d.getElementById('cn23RouteSummary').hidden, false, 'Filtering is available for either national mode.');
      d.getElementById('cn23RouteSummary').click();
      const address = rows().find(row => !row.hidden).querySelector('.val-address');
      address.value = 'BATAM'; address.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.equal(rows().filter(row => !row.hidden).length, 0, 'Address edits recalculate route while filtered.');
      assert.equal(d.getElementById('batamRouteCount').textContent, '2');
      d.querySelector('[data-route="all"]').click(); assert.equal(rows().filter(row => !row.hidden).length, 2);
      d.getElementById('destinationMode').value = 'batam'; core.updateInterface();
      assert.equal(rows().filter(row => !row.hidden).length, 2, 'Local-only mode clears the national filter.');
    } finally { w.close(); }
  }
  console.log('PASS route filters: local/CN23/all on review/app/beta, original capture numbers, retained edits, both Excel groups, address changes and mode changes');
})().catch(error => { console.error(error); process.exitCode = 1; });
