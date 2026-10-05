const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/app-core.js'), 'utf8');
const elements = new Map();
function element(id, value = '') {
  const result = { id, value, checked: false, hidden: false, disabled: false, textContent: id, innerHTML: '', dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {} }, eventListeners: {}, addEventListener(type, listener) { (this.eventListeners[type] ||= []).push(listener); }, appendChild() {} };
  elements.set(id, result);
  return result;
}
['dropzone', 'clientMode', 'corporateTemplate', 'itemType', 'useInsurance', 'destinationMode', 'exportButton', 'exportBatamButton', 'exportCn23Button', 'cn23Settings', 'cn23PaymentMethodGroup', 'fileQueue', 'resultTable', 'batamRouteCount', 'cn23RouteCount', 'pendingRouteCount'].forEach(id => element(id));
elements.get('clientMode').value = 'RITEL';
elements.get('corporateTemplate').value = 'MANUAL';
elements.get('itemType').value = 'DOKUMEN';
const region = { id: '14523', postcode: '29274', village: 'PENGALIHAN / PENGALEHAN', district: 'KERITANG', city: 'INDRAGIRI HILIR', province: 'RIAU' };
const second = { ...region, id: '99999', postcode: '29276', village: 'CONTOH LAIN' };
const batamRegion = { id: 'batam-29414', postcode: '29414', village: 'BELIAN', district: 'BATAM KOTA', city: 'BATAM', province: 'KEPULAUAN RIAU' };
let loaded = true;
const hints = [];
const matches = (address, hint = '') => {
  hints.push(hint);
  if (/BELIAN.*BATAM|BATAM.*BELIAN/.test(address)) return { status: 'matched', postcode: batamRegion.postcode, candidates: [batamRegion], selected: batamRegion };
  if (/PENGALIHAN|PENGALEHAN/.test(address)) return { status: 'matched', postcode: region.postcode, candidates: [region], selected: region };
  if (/KERITANG/.test(address)) return { status: 'ambiguous', postcode: '', candidates: [region, second], selected: null };
  return { status: 'not_found', postcode: '', candidates: [], selected: null };
};
const thead = { innerHTML: '' };
const tbody = { innerHTML: '', appendChild() {} };
const listeners = {};
const window = { MilePostalNational: { isLoaded: () => loaded, load: async () => { loaded = true; }, match: matches } };
const document = {
  body: { dataset: {} },
  getElementById: id => elements.get(id) || null,
  addEventListener: (event, listener) => { listeners[event] = listener; },
  querySelectorAll: () => [],
  querySelector: selector => selector === '#resultTable thead' ? thead : selector === '#resultTable tbody' ? tbody : null,
  createElement: () => ({ innerHTML: '', dataset: {}, classList: { toggle() {} } })
};
const sandbox = { window, document, console, Date, Intl, setTimeout, HTMLInputElement: class {}, alert: message => { throw new Error(message); } };
vm.runInNewContext(source, sandbox, { filename: 'app-core.js' });
const core = window.__mileCore;

assert.equal(core.getDestinationMode(), 'batam');
assert.equal(core.resolveZipCode('Alamat tanpa wilayah', 'MANUAL'), '29411');
assert.equal(core.resolveZipCode('Alamat tanpa wilayah', 'MENSA'), '29111');
elements.get('destinationMode').value = 'cn23';
assert.equal(core.resolveZipCode('Alamat tanpa wilayah', 'MANUAL'), '', 'CN23 tidak memakai fallback 29411');
assert.equal(core.resolveZipCode('KERITANG', 'MANUAL'), '', 'Wilayah ambigu tidak diberi kode pos otomatis');
assert.equal(core.resolveZipCode('KERITANG PENGALIHAN', 'MANUAL'), '29274');
assert.equal(core.resolveZipCode('Alamat tanpa wilayah', 'MANUAL', '', { destinationMode: 'batam' }), '29411', 'Snapshot AI Batam tidak berubah karena selector diganti');

const row = { _rowId: 'test-1', name: 'BUDI', address: 'KERITANG PENGALIHAN', phone: '08123456789', noSurat: 'REF-1', zip: '29411', outsideBatam: true, p: 10, l: 10, t: 10, insHarga: 0 };
core.uploadedFilesManager.push({ id: 'test-file', name: 'label.jpg', rows: [row] });
assert.equal(window.getPendingOutsideBatamCount(), 0, 'Tujuan luar kota tetap dipertahankan dalam CN23');
hints.length = 0;
assert.equal(core.getNationalPostcodeMatch(row).postcode, '29274');
assert.equal(hints.at(-1), '', 'Kode fallback pada batch Batam lama tidak menjadi petunjuk nasional');
elements.get('destinationMode').value = 'batam';
assert.equal(window.getPendingOutsideBatamCount(), 1, 'Pembatasan Batam kembali aktif saat mode Batam');
elements.get('destinationMode').value = 'cn23';

const config = { clientMode: 'RITEL', senderName: 'PENGIRIM', senderAddress: 'KOTA BATAM', senderPhone: '0811111111', serviceCode: 'PKH', useInsurance: false };
const queue = core.buildCn23QueueRows([row], config);
assert.equal(queue.length, 1);
assert.equal(queue[0].recipient_postcode, '29274');
assert.equal(queue[0].recipient_city, 'INDRAGIRI HILIR');
assert.equal(queue[0].payment_method, 'CASH');
assert.equal(queue[0].insurance, 'N');
assert.equal(queue[0].destination_code, '', 'Kode tujuan Mile tidak disamakan diam-diam dengan kode pos');
assert.equal(queue[0].hs_code, '49011000');
assert.equal(queue[0].npwp, '000000000000000');
assert.equal(queue[0].item_value_idr, 20000, 'Nilai deklarasi tetap Rp20.000 tanpa asuransi');
assert.equal(queue[0].weight_kg, 0.2);
for (const weight of ['1', '1.5', '1,25', '2']) assert.equal(core.buildCn23QueueRows([{ ...row, cw: weight }], config)[0].weight_kg, Number(weight.replace(',', '.')));
for (const weight of ['', '0', '-1', '1kg', 'Infinity']) assert.throws(() => core.buildCn23QueueRows([{ ...row, cw: weight }], config), /Berat.*lebih dari 0/);
assert.equal(queue[0].length_cm, 0);
assert.equal(queue[0].width_cm, 0);
assert.equal(queue[0].height_cm, 0);
assert.equal(queue[0].description, 'DOKUMEN', 'Deskripsi terpisah dari referensi');
assert.equal(queue[0].ref_no, 'REF-1');
for (const mode of ['RITEL', 'KORPORAT']) {
  const pe = core.buildCn23QueueRows([row], { ...config, serviceCode: 'PE', clientMode: mode, customerId: 'CLIENT1', cn23PaymentMethod: 'INVOICE' })[0];
  assert.equal(pe.service_code, 'PE', 'PE selected in the camera review must reach the CN23 queue');
  assert.equal(pe.payment_method, mode === 'RITEL' ? 'CASH' : 'INVOICE');
  assert.equal(pe.hs_code, '49011000');assert.equal(pe.weight_kg, 0.2);
}
assert.equal(core.buildCn23QueueRows([row], { ...config, clientMode: 'KORPORAT', customerId: 'CLIENT1', cn23PaymentMethod: 'CREDIT' })[0].payment_method, 'CREDIT');
assert.throws(() => core.buildCn23QueueRows([row], { ...config, clientMode: 'KORPORAT', customerId: '' }), /Kode Pelanggan wajib/);
assert.throws(() => core.buildCn23QueueRows([row], { ...config, clientMode: 'KORPORAT', customerId: 'CLIENT1', cn23PaymentMethod: 'CASH' }), /Invoice atau CREDIT/);
assert.throws(() => core.buildCn23QueueRows([row], { ...config, clientMode: 'PINDAH' }), /Ritel atau Korporat/);
assert.throws(() => core.buildCn23QueueRows([{ ...row, address: 'KERITANG' }], config), /beberapa pilihan/);

const ambiguous = { ...row, address: 'KERITANG', _confirmedNationalPostcode: { sourceKey: 'KERITANG\n', selected: region } };
assert.equal(core.buildCn23QueueRows([ambiguous], config)[0].postcode_review, 'PILIHAN PETUGAS');
ambiguous.address = 'ALAMAT TIDAK DIKENAL';
assert.throws(() => core.buildCn23QueueRows([ambiguous], config), /belum ditemukan/, 'Pilihan lama harus gugur saat alamat berubah');
loaded = false;
assert.throws(() => core.buildCn23QueueRows([row], config), /belum siap/, 'Ekspor diblokir ketika database belum siap');

async function run() {
  await core.handleDestinationModeChange();
  assert.equal(core.uploadedFilesManager[0].rows.length, 1, 'Pergantian mode tidak menghapus antrean');
  assert.equal(elements.get('itemType').value, 'DOKUMEN');
  assert.equal(elements.get('itemType').disabled, true);
  assert.equal(elements.get('exportButton').textContent, 'Ekspor Antrean CN23');
  for (const [id, value] of Object.entries(config)) {
    if (id !== 'useInsurance') (elements.get(id) || element(id)).value = value;
  }
  let written = null;
  const xlsx = {
    utils: {
      encode_cell: ({ r, c }) => `R${r}C${c}`,
      json_to_sheet: rows => {
        const sheet = { rows, '!ref': 'A1:AR2' };
        const headers = Object.keys(rows[0]);
        rows.forEach((entry, r) => headers.forEach((header, c) => { sheet[`R${r + 1}C${c}`] = { v: entry[header], t: typeof entry[header] === 'number' ? 'n' : 's' }; }));
        return sheet;
      },
      book_new: () => ({ Sheets: {}, SheetNames: [] }),
      book_append_sheet: (book, sheet, name) => { book.Sheets[name] = sheet; book.SheetNames.push(name); },
      decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 1, c: 30 } })
    },
    writeFile: (book, filename) => { written = { book, filename }; }
  };
  window.XLSX = sandbox.XLSX = xlsx;
  const tr = { dataset: { fileId: 'test-file', rowId: 'test-1' }, querySelector: () => ({ value: '' }) };
  document.querySelectorAll = selector => selector === '#resultTable tbody tr' ? [tr] : [];
  await sandbox.downloadFinalExcel();
  assert.equal(written.filename, 'Antrean_CN23_Dokumen_RITEL.xlsx');
  assert.deepEqual(written.book.SheetNames, ['CN23_ANTREAN']);
  const sheet = written.book.Sheets.CN23_ANTREAN;
  const headers = Object.keys(sheet.rows[0]);
  for (const header of ['recipient_postcode', 'npwp', 'hs_code', 'recipient_phone']) {
    const cell = sheet[`R1C${headers.indexOf(header)}`];
    assert.equal(cell.t, 's', `${header} harus tertulis sebagai teks`);
    assert.equal(cell.z, '@');
  }
  assert.equal(sheet.rows[0].item_value_idr, 20000);
  assert.equal(sheet.rows[0].length_cm, 0);

  elements.get('serviceCode').value = 'PE';
  await sandbox.downloadFinalExcel();
  assert.equal(written.book.Sheets.CN23_ANTREAN.rows[0].service_code, 'PE', 'PE must be retained in the exported workbook');
  elements.get('serviceCode').value = 'PKH';

  const local = { _rowId: 'local-1', name: 'SITI', address: 'KEL. BELIAN KEC. BATAM KOTA', phone: '0819999999', noSurat: 'BATAM-REF', cw: '0.20', p: 10, l: 10, t: 10 };
  core.uploadedFilesManager[0].rows.push(local);
  elements.get('destinationMode').value = 'mixed';
  elements.get('exportBatamButton').disabled = true;
  elements.get('exportCn23Button').disabled = true;
  await core.handleDestinationModeChange();
  assert.equal(elements.get('exportButton').hidden, true);
  assert.equal(elements.get('exportBatamButton').hidden, false);
  assert.equal(elements.get('exportCn23Button').hidden, false);
  assert.equal(elements.get('exportBatamButton').disabled, false, 'Antrean Batam yang siap mengaktifkan tombol ekspor terpisah');
  assert.equal(elements.get('exportCn23Button').disabled, false, 'Antrean luar kota yang siap mengaktifkan tombol CN23 terpisah');
  assert.equal(core.getShipmentRoute(local), 'batam');
  assert.equal(core.getShipmentRoute(row), 'cn23');
  assert.equal(core.resolveZipCode('Alamat tanpa wilayah', 'MANUAL', '', { destinationMode: 'mixed' }), '');
  const makeTr = entry => ({ dataset: { fileId: 'test-file', rowId: entry._rowId }, querySelector: selector => {
    const fields = { '.val-noSurat': 'noSurat', '.val-name': 'name', '.val-phone': 'phone', '.val-address': 'address', '.val-cw': 'cw', '.val-p': 'p', '.val-l': 'l', '.val-t': 't' };
    return { value: String(entry[fields[selector]] ?? (selector === '.val-cw' ? '0.20' : '')) };
  } });
  document.querySelectorAll = selector => selector === '#resultTable tbody tr' ? [makeTr(local), makeTr(row)] : [];
  await window.downloadLocalExcel();
  assert.equal(written.filename, 'Upload_MileApp_Ritel.xlsx');
  assert.deepEqual(written.book.SheetNames, ['Sheet1']);
  const localExport = written.book.Sheets.Sheet1.rows;
  assert.equal(localExport.length, 1);
  assert.equal(localExport[0].destination_data_customer_name, 'SITI');
  assert.equal(localExport[0].destination_data_customer_zip_code, '29414');
  assert.equal(localExport[0].destination_data_zone_code, '29400');
  local.address = 'JL. CONTOH NO. 1';
  local._confirmedNationalPostcode = { sourceKey: `${local.address}\n`, selected: batamRegion };
  await window.downloadLocalExcel();
  assert.equal(written.book.Sheets.Sheet1.rows[0].destination_data_customer_zip_code, '29414', 'Wilayah Batam yang dipilih petugas tetap dipakai walaupun alamat tidak menyebut desa');
  await window.downloadCn23Excel();
  assert.equal(written.filename, 'Antrean_CN23_Dokumen_RITEL.xlsx');
  assert.deepEqual(written.book.SheetNames, ['CN23_ANTREAN']);
  const outsideExport = written.book.Sheets.CN23_ANTREAN.rows;
  assert.equal(outsideExport.length, 1);
  assert.equal(outsideExport[0].recipient_name, 'BUDI');
  assert.equal(outsideExport[0].recipient_postcode, '29274');
  assert.throws(() => core.buildCn23QueueRows([local], config), /hanya memuat tujuan luar Batam/);
  elements.get('destinationMode').value = 'cn23';
  assert.throws(() => core.buildCn23QueueRows([local, row], config), /tujuan Kota Batam.*Capture Campuran/, 'Mode CN23 murni juga tidak boleh mencampurkan kiriman Batam ke file luar kota');
  assert.equal(core.uploadedFilesManager[0].rows.length, 2, 'Penolakan ekspor tidak menghapus baris Batam atau luar kota');
  elements.get('destinationMode').value = 'mixed';
  core.uploadedFilesManager[0].rows.push({ ...local, _rowId: 'pending-1', address: 'KERITANG' });
  core.updateInterface();
  assert.equal(elements.get('exportBatamButton').disabled, true, 'Tujuan belum terklasifikasi menahan kedua tombol ekspor');
  assert.equal(elements.get('exportCn23Button').disabled, true);
  await assert.rejects(window.downloadLocalExcel(), /belum dapat dipisahkan/, 'Kiriman ambigu tidak boleh dilewati diam-diam saat ekspor Batam');
  await assert.rejects(window.downloadCn23Excel(), /belum dapat dipisahkan/, 'Kiriman ambigu tidak boleh dilewati diam-diam saat ekspor CN23');
  const nationalSource = fs.readFileSync(path.join(__dirname, '../assets/js/postcode-national.js'), 'utf8');
  const nationalData = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/postcodes-indonesia.json'), 'utf8'));
  sandbox.fetch = async () => ({ ok: true, json: async () => nationalData });
  window.fetch = sandbox.fetch;
  vm.runInNewContext(nationalSource, sandbox, { filename: 'postcode-national.js' });
  assert.equal(await core.refreshNationalPostcodes(), true);
  const actualOutside = { name: 'BUDI', address: 'KERITANG PENGALIHAN', zip: '29411' };
  const actualLocal = { name: 'SITI', address: 'BELIAN BATAM KOTA' };
  assert.equal(core.getShipmentRoute(actualOutside), 'cn23');
  assert.equal(core.getNationalPostcodeMatch(actualOutside).postcode, '29274');
  assert.equal(core.getShipmentRoute(actualLocal), 'batam');
  assert.equal(core.getNationalPostcodeMatch(actualLocal).postcode, '29464', 'Mode campuran menampilkan dan mempertahankan nilai database nasional meskipun tabel Batam lama berbeda');
  assert.equal(core.getShipmentRoute({ address: 'KERITANG' }), 'pending');
  const oldAddress = 'Gedung Sahid Sudirman Center Jl. Jend. Sudirman Kav. 86 Jakarta 10220';
  const oldMatch = { status: 'matched', postcode: '90553', selected: { city: 'MAROS', postcode: '90553' },
    lookupKey: `${oldAddress}\n\n` };
  const restoredCameraRow = { address: oldAddress, _nationalPostcodeMatch: oldMatch };
  assert.equal(core.getNationalPostcodeMatch(restoredCameraRow).postcode, '10220', 'Restored camera results must invalidate automatic matches from the old algorithm.');
  assert.equal(restoredCameraRow._nationalPostcodeMatch.matcherVersion, window.MilePostalNational.matcherVersion);
  const freshMatch = restoredCameraRow._nationalPostcodeMatch;
  assert.equal(core.getNationalPostcodeMatch(restoredCameraRow), freshMatch, 'Current-version results remain cached.');
  const realSheetJs = require('../assets/vendor/sheetjs/xlsx.full.min.js');
  const actualExports = [];
  window.XLSX = sandbox.XLSX = {
    ...realSheetJs,
    writeFile: (book, filename) => {
      const buffer = realSheetJs.write(book, { bookType: 'xlsx', type: 'buffer' });
      if (process.env.MILE_CN23_QA_OUTPUT) {
        fs.mkdirSync(process.env.MILE_CN23_QA_OUTPUT, { recursive: true });
        fs.writeFileSync(path.join(process.env.MILE_CN23_QA_OUTPUT, filename), buffer);
      }
      const reread = realSheetJs.read(buffer, { type: 'buffer' });
      actualExports.push({ filename, book: reread });
    }
  };
  actualOutside._rowId = 'actual-outside';
  actualLocal._rowId = 'actual-local';
  core.uploadedFilesManager.splice(0, core.uploadedFilesManager.length, { id: 'test-file', name: 'mixed-labels.pdf', rows: [actualLocal, actualOutside] });
  document.querySelectorAll = selector => selector === '#resultTable tbody tr' ? [makeTr(actualLocal), makeTr(actualOutside)] : [];
  await window.downloadLocalExcel();
  await window.downloadCn23Excel();
  assert.equal(actualExports.length, 2);
  assert.equal(actualExports[0].filename, 'Upload_MileApp_Ritel.xlsx');
  const actualLocalRows = realSheetJs.utils.sheet_to_json(actualExports[0].book.Sheets.Sheet1);
  assert.equal(actualLocalRows.length, 1);
  assert.equal(actualLocalRows[0].destination_data_customer_name, 'SITI');
  assert.equal(actualLocalRows[0].destination_data_customer_zip_code, '29464');
  assert.equal(actualExports[1].filename, 'Antrean_CN23_Dokumen_RITEL.xlsx');
  const actualOutsideRows = realSheetJs.utils.sheet_to_json(actualExports[1].book.Sheets.CN23_ANTREAN);
  assert.equal(actualOutsideRows.length, 1);
  assert.equal(actualOutsideRows[0].recipient_name, 'BUDI');
  assert.equal(actualOutsideRows[0].recipient_postcode, '29274');
  assert.equal(actualOutsideRows[0].npwp, '000000000000000');
  assert.equal(actualOutsideRows[0].length_cm, 0);
  assert.equal(actualOutsideRows[0].item_value_idr, 20000);

  // Jalankan listener core yang sebenarnya tanpa mengganti editor alamat aktif.
  ['wrapTemplate', 'cardDataPengirim', 'wrapCustomerId', 'wrapSenderName', 'wrapSenderPhone', 'wrapSenderAddress', 'wrapTariffCode', 'wrapItemType', 'tariffCode', 'wrapPindahDest'].forEach(id => { if (!elements.has(id)) element(id); });
  listeners.DOMContentLoaded();
  const postalCell = { outerHTML: '' };
  const editTr = { dataset: { fileId: 'test-file', rowId: 'actual-outside' }, querySelector: selector => selector === '.national-postcode-review' ? postalCell : null };
  const addressInput = new sandbox.HTMLInputElement();
  Object.assign(addressInput, { value: 'SUKAMAJU', dataset: { reviewPending: 'false' }, selectionStart: 5, selectionEnd: 5,
    classList: { contains: name => name === 'val-address', toggle() {}, remove() {}, add() {} },
    closest: selector => selector === 'tr[data-file-id][data-row-id]' ? editTr : null,
    matches: selector => selector === '.val-address' });
  document.activeElement = addressInput;
  const inputHandlers = elements.get('resultTable').eventListeners.input;
  assert.equal(inputHandlers.length, 1);
  inputHandlers[0]({ target: addressInput });
  assert.equal(actualOutside.address, 'SUKAMAJU');
  assert.match(postalCell.outerHTML, /data-postcode-status="ambiguous"|data-postcode-status="not_found"/);
  assert.match(postalCell.outerHTML, /Tujuan perlu diperiksa/);
  assert.equal(elements.get('pendingRouteCount').textContent, '1');
  assert.equal(elements.get('cn23RouteCount').textContent, '0');
  assert.equal(elements.get('exportBatamButton').disabled, true);
  assert.equal(elements.get('exportCn23Button').disabled, true);
  assert.equal(document.activeElement, addressInput, 'Koreksi wilayah tidak mengganti node alamat yang sedang diedit');
  assert.equal(addressInput.selectionStart, 5);
  assert.equal(addressInput.selectionEnd, 5);
  addressInput.value = 'KERITANG PENGALIHAN';
  inputHandlers[0]({ target: addressInput });
  assert.match(postalCell.outerHTML, /29274/);
  assert.equal(elements.get('pendingRouteCount').textContent, '0');
  assert.equal(elements.get('exportBatamButton').disabled, false);
  assert.equal(elements.get('exportCn23Button').disabled, false);
  addressInput.value = 'SUKAMAJU';
  elements.get('resultTable').eventListeners.change[0]({ target: addressInput });
  assert.equal(elements.get('pendingRouteCount').textContent, '1', 'Perubahan pada blur juga menghitung ulang klasifikasi wilayah');
  console.log('PASS cn23-core: fallback Batam tetap, antrean luar kota dipertahankan, kode pos ambigu wajib dipilih, preset CN23 dan korporat tepat');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
