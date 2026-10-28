const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const xlsx = require('../assets/vendor/sheetjs/xlsx.full.min.js');

(async () => {
  for (const file of ['app.html', 'beta.html', 'review.html']) {
    for (const [today, defaultService] of [['2026-10-16T03:00:00Z', 'PKH'], ['2026-10-19T03:00:00Z', 'PE']]) {
      const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url: 'https://fixture.test/app', runScripts: 'outside-only' });
      const w = dom.window, d = w.document;
      try {
        const OriginalDate = w.Date;
        w.Date = class extends OriginalDate {
          constructor(...args) { super(...(args.length ? args : [today])); }
        };
        w.alert = message => { throw new Error(message); };
        w.HTMLElement.prototype.scrollIntoView = () => {};
        const downloads = [];
        w.XLSX = { ...xlsx, writeFile(book) { downloads.push(xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]])); } };
        for (const source of ['postcode-zones', 'app-core', 'events-v16']) w.eval(fs.readFileSync(`assets/js/${source}.js`, 'utf8'));
        await new Promise(resolve => w.setTimeout(resolve, 10));
        const change = (id, value) => {
          d.getElementById(id).value = value;
          d.getElementById(id).dispatchEvent(new w.Event('change', { bubbles: true }));
        };
        change('clientMode', 'KORPORAT');
        change('corporateTemplate', 'PN_BATAM');
        const tariffs = { PKH: '898845', PE: '897924' };
        assert.equal(d.getElementById('serviceCode').value, defaultService, `${file}: existing calendar recommendation`);
        assert.equal(d.getElementById('tariffCode').value, tariffs[defaultService], `${file}: default tariff follows the recommendation`);
        assert.equal(d.getElementById('tariffCode').readOnly, true);
        assert.equal(d.getElementById('serviceCode').disabled, false, 'Manual service changes remain available');
        assert.match(d.querySelector('option[value="PN_BATAM"]').dataset.tariff, /PKH 898845.*PE 897924/);

        const core = w.__mileCore;
        core.uploadedFilesManager.push({ id: 'pn-batam', name: 'Batch lama', rows: [
          { name: 'PENERIMA', address: 'BELIAN BATAM KOTA', phone: '0', noSurat: 'PN-REF-001', cw: '0.20', p: 10, l: 10, t: 10 }
        ] });
        core.updateInterface();
        for (const service of ['PKH', 'PE', 'PKH']) {
          change('serviceCode', service);
          assert.equal(d.getElementById('tariffCode').value, tariffs[service], `${file}: changing service updates the locked tariff`);
          // Restoring an old camera batch may write the previous fixed tariff after its service.
          d.getElementById('tariffCode').value = '897924';
          core.updateInterface();
          assert.equal(d.getElementById('tariffCode').value, tariffs[service], 'Old batch values are refreshed');
          d.getElementById('tariffCode').value = 'STALE-TARIFF';
          d.getElementById('customerId').value = 'STALE-CUSTOMER';
          const before = downloads.length;
          await w.downloadFinalExcel();
          assert.equal(downloads.length, before + 1, `${file}: workbook is created`);
          const exported = downloads.at(-1)[0];
          assert.equal(exported.customer_code, 'LNMAPN01294A');
          assert.equal(exported.service_code, service);
          assert.equal(exported.connote_sub_service_code, tariffs[service], `${file}: exported tariff follows service despite stale inputs`);
          assert.equal(exported.origin_data_customer_name, 'PN-REF-001');
        }

        change('corporateTemplate', 'MENSA');
        change('serviceCode', 'PE');
        await w.downloadFinalExcel();
        assert.equal(downloads.at(-1)[0].connote_sub_service_code, '914556', 'Other locked tariffs retain their existing behavior');
        for (const script of ['postcode-zones', 'app-core']) {
          assert.match(d.querySelector(`script[src*="/${script}.js?"]`).src, /v=20261028-postcode-zones-1$/);
        }
      } finally { w.close(); }
    }
  }
  console.log('PASS PN Batam: PKH/PE defaults, manual changes, old batches, locked customer/tariff Excel export, and cache versions on app/beta/review');
})().catch(error => { console.error(error); process.exitCode = 1; });
