const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/camera-sync.js'), 'utf8');

const elements = new Map([
  ['clientMode', { id: 'clientMode', type: 'select-one', value: 'KORPORAT' }],
  ['corporateTemplate', { id: 'corporateTemplate', type: 'select-one', value: 'MANUAL' }],
  ['customerId', { id: 'customerId', type: 'text', value: '' }],
  ['senderName', { id: 'senderName', type: 'text', value: '' }],
  ['senderPhone', { id: 'senderPhone', type: 'text', value: '' }],
  ['senderAddress', { id: 'senderAddress', type: 'text', value: '' }],
  ['serviceCode', { id: 'serviceCode', type: 'select-one', value: 'PKH' }],
  ['tariffCode', { id: 'tariffCode', type: 'text', value: '' }],
  ['itemType', { id: 'itemType', type: 'select-one', value: 'DOKUMEN' }],
  ['useInsurance', { id: 'useInsurance', type: 'checkbox', checked: false }]
]);
const listeners = {};
const rows = [{ name: 'BUDI', address: 'BATAM CENTRE', phone: '0812', noSurat: 'REF-1' }];
const requests = [];

const document = {
  getElementById(id) { return elements.get(id) || null; },
  addEventListener(type, listener) {
    (listeners[type] ||= []).push(listener);
  },
  querySelector() { return null; }
};
const window = {
  location: { pathname: '/review' },
  setTimeout,
  clearTimeout,
  __mileCore: {
    uploadedFilesManager: [{ id: 1, rows }],
    tempExtractedRows: []
  },
  showToast() {}
};
const sandbox = {
  window,
  document,
  console,
  Date,
  Promise,
  encodeURIComponent,
  setTimeout,
  clearTimeout,
  fetch: async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) });
    return { json: async () => ({ ok: true }) };
  }
};
vm.runInNewContext(source, sandbox, { filename: 'camera-sync.js' });

async function run() {
  const saved = await window.MileCameraSync.saveBatchResults('CAM-12345678', 1, Date.now(), 'HP Uji', 2);
  assert.equal(saved, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.form.corporateTemplate, 'MANUAL');

  elements.get('corporateTemplate').value = 'BRI_NAGOYA';
  elements.get('customerId').value = 'BANKBRI01294A';
  elements.get('senderName').value = 'BANK BRI NAGOYA';
  for (const listener of listeners.change || []) {
    listener({ target: elements.get('corporateTemplate') });
  }
  await new Promise(resolve => setTimeout(resolve, 750));

  assert.equal(requests.length, 2, 'Perubahan template harus menyimpan ulang batch kamera.');
  assert.equal(requests[1].payload.form.corporateTemplate, 'BRI_NAGOYA');
  assert.equal(requests[1].payload.form.customerId, 'BANKBRI01294A');
  assert.equal(requests[1].payload.form.tariffCode, '');

  rows[0].address = 'NAGOYA, KOTA BATAM';
  const rowInput = { id: '', closest: selector => selector === '#resultTable' ? {} : null };
  for (const listener of listeners.change || []) listener({ target: rowInput });
  await new Promise(resolve => setTimeout(resolve, 750));

  assert.equal(requests.length, 3, 'Koreksi hasil review harus menyimpan ulang batch kamera.');
  assert.equal(requests[2].payload.rows[0].address, 'NAGOYA, KOTA BATAM');
  assert.deepEqual(requests.map(request => request.payload.form.corporateTemplate), ['MANUAL', 'BRI_NAGOYA', 'BRI_NAGOYA']);

  console.log('PASS camera-template-sync: template dan koreksi Review tersimpan berurutan untuk Muat ke Desktop');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
