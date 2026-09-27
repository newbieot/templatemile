const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appCore = fs.readFileSync(path.join(root, 'assets/js/app-core.js'), 'utf8');
const pickerJs = fs.readFileSync(path.join(root, 'assets/js/template-picker.js'), 'utf8');
const pickerCss = fs.readFileSync(path.join(root, 'assets/css/template-picker.css'), 'utf8');
const cameraSync = fs.readFileSync(path.join(root, 'assets/js/camera-sync.js'), 'utf8');
const pages = ['app.html', 'beta.html', 'review.html'];

const presetStart = appCore.indexOf('const corporateTemplatePresets');
const presetEnd = appCore.indexOf('function getCorporateTemplatePreset', presetStart);
assert.ok(presetStart >= 0 && presetEnd > presetStart, 'Konfigurasi preset tidak ditemukan.');
const sandbox = {};
vm.runInNewContext(`${appCore.slice(presetStart, presetEnd)}\nglobalThis.presets = corporateTemplatePresets;`, sandbox);
const configuredPresets = sandbox.presets;

const presets = [
  ['BRI_NAGOYA', 'BANKBRI01294A', 'BANK BRI NAGOYA'],
  ['FIF_GROUP', 'FINFIF02294A', 'PT FIF GROUP'],
  ['MEGACENTRAL', 'FINMEGACENT02110B', 'PT MEGACENTRAL FINANCE CAB BATAM'],
  ['MANDIRI_UTAMA', 'FINMUF02120A', 'PT MANDIRI UTAMA FINANCE'],
  ['ASTRA_SEDAYA', 'FINSEDAYA02294A', 'PT ASTRA SEDAYA FINANCE'],
  ['RS_GRAHA_HERMINE', 'KESRSGHBTAM01294A', 'RUMAH SAKIT GRAHA HERMINE BATAM'],
  ['OJK', 'LNOJK02294A', 'OTORITAS JASA KEUANGAN BATAM']
];

for (const [key, customerId, senderName] of presets) {
  assert.equal(configuredPresets[key].customerId, customerId);
  assert.equal(configuredPresets[key].senderName, senderName);
}

assert.equal(configuredPresets.MANDIRI_UTAMA.tariffCode, '884916');
assert.equal(configuredPresets.MANDIRI_UTAMA.lockTariff, true);
assert.equal(configuredPresets.MANDIRI_UTAMA.defaultServiceCode, 'PKH');
assert.equal(configuredPresets.MANDIRI_UTAMA.lockService, true);
assert.equal(configuredPresets.OJK.publishTariff, true);
assert.equal(configuredPresets.OJK.senderNameFromReference, true);
for (const preset of Object.values(configuredPresets)) {
  assert.ok(preset.customerId, 'Semua preset wajib memiliki ID pelanggan.');
  assert.ok(!(preset.publishTariff && preset.lockTariff), 'Tarif Publish tidak boleh sekaligus memiliki tarif terkunci.');
  if (preset.publishTariff) assert.equal(preset.tariffCode, undefined);
}
assert.equal(new Set(Object.values(configuredPresets).map(preset => preset.customerId)).size, Object.keys(configuredPresets).length, 'ID pelanggan preset harus unik.');
assert.match(appCore, /if \(preset\.publishTariff\) finalTariffCode = ''/);
assert.match(appCore, /activeCorporatePreset\?\.senderNameFromReference/);
assert.match(appCore, /No Ref\/Surat pada Baris ke-\$\{index \+ 1\} wajib diisi/);
assert.match(appCore, /Tarif Publish harus kosong/);

for (const pageName of pages) {
  const html = fs.readFileSync(path.join(root, pageName), 'utf8');
  assert.match(html, /class="[^"]*template-picker-host/);
  assert.match(html, /assets\/js\/template-picker\.js\?v=20260927-26\.02-customer-template-search/);
  assert.match(html, /assets\/css\/template-picker\.css\?v=20260927-26\.02-customer-template-search/);
  for (const [, customerId] of presets) {
    assert.equal((html.match(new RegExp(`data-customer-id="${customerId}"`, 'g')) || []).length, 1, `${customerId} harus muncul tepat sekali di ${pageName}`);
  }
  const optionValues = [...html.matchAll(/<option value="([A-Z0-9_]+)"/g)].map(match => match[1]);
  const templateValues = optionValues.slice(optionValues.indexOf('MANUAL'), optionValues.indexOf('MANUAL') + Object.keys(configuredPresets).length + 1);
  assert.deepEqual(new Set(templateValues), new Set(['MANUAL', ...Object.keys(configuredPresets)]), `Pilihan template ${pageName} harus sama dengan konfigurasi preset.`);
}

assert.match(pickerJs, /option\.searchText\.includes\(query\)/);
assert.match(pickerJs, /select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
assert.match(pickerJs, /event\.key === 'Escape'/);
assert.match(pickerCss, /@media \(max-width: 640px\)/);
assert.match(pickerCss, /min-height: 66px/);
assert.match(pickerCss, /env\(safe-area-inset-bottom\)/);
assert.match(cameraSync, /corporateTemplate: val\('corporateTemplate'\)/);
assert.match(cameraSync, /set\('corporateTemplate', form\.corporateTemplate\)/);
assert.match(cameraSync, /el\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
assert.match(cameraSync, /CAMERA_FORM_FIELD_IDS\.has\(event\.target\?\.id\)/);
assert.match(cameraSync, /scheduleCameraBatchResync/);
assert.match(cameraSync, /cameraBatchSaveQueue = cameraBatchSaveQueue\.catch/);

console.log('PASS customer-template-picker: 7 preset, aturan ekspor, pencarian, UI mobile, dan sinkronisasi kamera');
