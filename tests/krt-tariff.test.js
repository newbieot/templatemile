const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const xlsx = require('../assets/vendor/sheetjs/xlsx.full.min.js');

const headers = [
  'tariff_from_code', 'tariff_to_code', 'service_id', 'tariff_sla_day', 'tariff_sla_hours',
  'tariff_formula_id', 'tariff_formula_data', 'expiry_start', 'expiry_end', 'customer_type_code',
  'disableTariff', 'tariff_sub_service_code', 'tariff_sub_service_description', 'internal_order'
];
const html = fs.readFileSync('krt.html', 'utf8');
const source = fs.readFileSync('assets/js/krt.js', 'utf8');

function fixture() {
  const dom = new JSDOM(html, { url: 'https://fixture.test/krt', runScripts: 'outside-only' });
  const w = dom.window;
  const downloads = [];
  w.XLSX = { ...xlsx, writeFile(book, filename) {
    // Test the serialized XLSX, including identifier types and JSON/date text.
    downloads.push({ filename, book: xlsx.read(xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }) });
  } };
  w.eval(source);
  const d = w.document;
  function set(id, value) { d.getElementById(id).value = value; }
  function fillRow(row, values = {}) {
    for (const [name, value] of Object.entries({
      tariff_from_code: '00123', tariff_to_code: '00456', tariff_sla_day: '3', tariff_sla_hours: '72',
      base_tariff: '12500.50', tariff_sub_service_description: 'KRT pelanggan uji', ...values
    })) row.querySelector(`[name="${name}"]`).value = value;
  }
  function fill() {
    set('krtCustomerCode', 'CUSTOMER-TEST');
    set('krtInternalOrder', '000012345');
    set('krtExpiryStart', '2026-11-01');
    set('krtExpiryEnd', '2027-10-31');
    fillRow(d.querySelector('.krt-rate-row'));
  }
  async function submit() {
    d.getElementById('krtForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { dom, w, d, downloads, set, fill, fillRow, submit };
}

(async () => {
  const f = fixture();
  try {
    const { d } = f;
    for (const input of d.querySelectorAll('#krtForm input')) assert.equal(input.value, '', 'Example data must not prefill any input');
    assert.equal(d.getElementById('krtServiceId').textContent, '470');
    assert.equal(d.getElementById('krtCustomerServiceCode').textContent, '915903');
    assert.equal(d.getElementById('krtSubserviceCode').textContent, '916479');
    assert.equal(d.getElementById('krtFormulaId').textContent, '1644');
    await f.submit();
    assert.equal(f.downloads.length, 0);
    assert.match(d.getElementById('krtStatus').textContent, /Kode pelanggan wajib/);

    f.fill();
    f.set('krtInternalOrder', '   ');
    await f.submit();
    assert.equal(f.downloads.length, 0);
    assert.match(d.getElementById('krtStatus').textContent, /No IO KRT wajib/);
    f.fill();
    f.set('krtExpiryEnd', '2026-10-31');
    await f.submit();
    assert.equal(f.downloads.length, 0);
    assert.match(d.getElementById('krtStatus').textContent, /tidak boleh sebelum/);

    for (const [name, value] of [['tariff_sla_day', '-1'], ['tariff_sla_hours', '1.5'], ['base_tariff', '-5'], ['base_tariff', '1.001'], ['tariff_to_code', ' '], ['tariff_sub_service_description', '']]) {
      f.fill();
      d.querySelector(`[name="${name}"]`).value = value;
      await f.submit();
      assert.equal(f.downloads.length, 0, `${name}=${value} must block export`);
    }

    f.fill();
    await f.submit();
    assert.equal(f.downloads.length, 1);
    const exported = f.downloads[0];
    assert.equal(exported.filename, 'template_import_customer_tariff_cba_KRT.xlsx');
    assert.deepEqual(exported.book.SheetNames, ['TariffCbaCustomer']);
    const sheet = exported.book.Sheets.TariffCbaCustomer;
    assert.deepEqual(xlsx.utils.sheet_to_json(sheet, { header: 1 })[0], headers);
    const data = xlsx.utils.sheet_to_json(sheet);
    assert.equal(data.length, 1);
    assert.deepEqual(data[0], {
      tariff_from_code: '00123', tariff_to_code: '00456', service_id: 470,
      tariff_sla_day: 3, tariff_sla_hours: 72, tariff_formula_id: 1644,
      tariff_formula_data: '{"base_tariff":"12500.5"}', expiry_start: '2026-11-01', expiry_end: '2027-10-31',
      customer_type_code: 'CUSTOMER-TEST', disableTariff: 0, tariff_sub_service_code: '916479',
      tariff_sub_service_description: 'KRT pelanggan uji', internal_order: '000012345'
    });
    for (const address of ['A2', 'B2', 'J2', 'L2', 'N2']) assert.equal(sheet[address].t, 's');
    for (const address of ['C2', 'D2', 'E2', 'F2', 'K2']) assert.equal(sheet[address].t, 'n');
    assert.equal(d.getElementById('krtExport').disabled, false);

    d.getElementById('krtAddRow').click();
    await f.submit();
    assert.equal(f.downloads.length, 1, 'An incomplete later row must block the entire workbook');
    f.fillRow(d.querySelectorAll('.krt-rate-row')[1], { tariff_to_code: '00789', base_tariff: '0', tariff_sla_day: '0', tariff_sla_hours: '0', tariff_sub_service_description: '=1+1' });
    f.set('krtDisabled', '1');
    await f.submit();
    assert.equal(f.downloads.length, 2);
    const multiSheet = f.downloads.at(-1).book.Sheets.TariffCbaCustomer;
    const multiRows = xlsx.utils.sheet_to_json(multiSheet);
    assert.equal(multiRows.length, 2);
    assert.equal(multiRows[1].tariff_to_code, '00789');
    assert.equal(multiRows[1].internal_order, '000012345');
    assert.equal(multiRows[1].disableTariff, 1);
    assert.equal(JSON.parse(multiRows[1].tariff_formula_data).base_tariff, '0');
    assert.equal(multiSheet.M3.t, 's');
    assert.equal(multiSheet.M3.f, undefined, 'User text must never become a formula');

    d.querySelectorAll('[data-remove-row]')[0].click();
    assert.equal(d.querySelectorAll('.krt-rate-row').length, 1);
    assert.equal(d.querySelector('[data-row-number]').textContent, '1');
    assert.equal(d.querySelector('[data-remove-row]').disabled, true);
  } finally { f.dom.window.close(); }

  const lazy = fixture();
  try {
    lazy.fill();
    delete lazy.w.XLSX;
    let loads = 0;
    lazy.w.MileVendorLoader = { async loadSheetJs() { loads++; throw new Error('Tidak terhubung'); } };
    await lazy.submit();
    assert.equal(lazy.downloads.length, 0);
    assert.equal(lazy.d.getElementById('krtExport').disabled, false, 'Loader failure must permit retry');
    assert.match(lazy.d.getElementById('krtStatus').textContent, /Tidak terhubung/);
    let ready;
    lazy.w.MileVendorLoader.loadSheetJs = () => { loads++; return new Promise(resolve => { ready = resolve; }); };
    await lazy.submit();
    await lazy.submit();
    assert.equal(loads, 2, 'Duplicate clicks while loading must not start a second export');
    lazy.set('krtInternalOrder', '');
    lazy.w.XLSX = xlsx;
    ready();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(lazy.d.getElementById('krtStatus').textContent, /No IO KRT wajib/, 'Edits made during library loading must be validated again');
    assert.equal(lazy.d.getElementById('krtExport').disabled, false);
  } finally { lazy.dom.window.close(); }

  for (const page of ['app.html', 'beta.html', 'review.html']) {
    assert.match(fs.readFileSync(page, 'utf8'), /href="\/krt"[^>]*target="_blank"/);
  }
  console.log('PASS KRT tariff: empty user inputs, required IO, dates/numbers, 14-column XLSX roundtrip, text IDs, multi-route atomic export, literal text, loader retry and duplicate clicks');
})().catch(error => { console.error(error); process.exitCode = 1; });
