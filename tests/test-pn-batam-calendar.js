const fs = require('fs');
const vm = require('vm');
const path = require('path');

global.window = {
  setTimeout: () => 0,
  confirm: () => true,
  updateInterface: () => {},
  handleFileSelection: () => {},
  processNextInQueue: () => {},
  handleTemplateChange: () => {},
  handleModeChange: () => {}
};
global.document = {
  addEventListener: () => {},
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null,
  body: { dataset: {} },
  visibilityState: 'visible'
};
global.MutationObserver = class { observe() {} };
global.getComputedStyle = () => ({ display: 'none' });

const uiPath = path.join(__dirname, '..', 'assets', 'js', 'ui.js');
vm.runInThisContext(fs.readFileSync(uiPath, 'utf8'), { filename: uiPath });

const cases = [
  ['2026-07-30T12:00:00', 'PE', 'Kamis biasa'],
  ['2026-07-31T12:00:00', 'PKH', 'Jumat'],
  ['2026-08-24T12:00:00', 'PKH', 'H-1 Maulid Nabi'],
  ['2026-08-25T12:00:00', 'PKH', 'Hari libur Maulid Nabi'],
  ['2026-08-26T12:00:00', 'PE', 'Rabu setelah libur'],
  ['2026-02-15T12:00:00', 'PKH', 'H-1 cuti bersama Imlek'],
  ['2026-05-13T12:00:00', 'PKH', 'H-1 Kenaikan Yesus Kristus'],
  ['2026-06-15T12:00:00', 'PKH', 'H-1 1 Muharam']
];

let failures = 0;
for (const [input, expected, label] of cases) {
  const result = window.getPnBatamServiceDecision(new Date(input));
  const passed = result.code === expected;
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${input.slice(0, 10)} ${label}: ${result.code} — ${result.reason}`);
}

if (failures) {
  console.error(`\n${failures} pengujian gagal.`);
  process.exit(1);
}
console.log('\nSemua pengujian lulus.');
