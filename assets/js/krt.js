(() => {
  'use strict';

  const SERVICE = Object.freeze({ serviceId: 470, customerServiceCode: '915903', subserviceCode: '916479', formulaId: 1644 });
  // Preserve the importer schema, including its column order and sheet name.
  // The customer service code identifies KRT in the UI; the CBA template has no column for it.
  const HEADERS = Object.freeze([
    'tariff_from_code', 'tariff_to_code', 'service_id', 'tariff_sla_day', 'tariff_sla_hours',
    'tariff_formula_id', 'tariff_formula_data', 'expiry_start', 'expiry_end', 'customer_type_code',
    'disableTariff', 'tariff_sub_service_code', 'tariff_sub_service_description', 'internal_order'
  ]);
  const form = document.getElementById('krtForm');
  const rows = document.getElementById('krtRows');
  const status = document.getElementById('krtStatus');
  const exportButton = document.getElementById('krtExport');
  let exporting = false;

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }

  function invalid(input, text) {
    input.setCustomValidity(text);
    input.reportValidity();
    input.focus();
    throw new Error(text);
  }

  function textValue(input, label) {
    const value = input.value.trim();
    if (!value) invalid(input, `${label} wajib diisi.`);
    if (/[\u0000-\u001f\u007f]/.test(value)) invalid(input, `${label} mengandung karakter yang tidak valid.`);
    return value;
  }

  function numberValue(input, label, integer = false) {
    if (!input.value.trim()) invalid(input, `${label} wajib diisi.`);
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
      invalid(input, `${label} harus berupa ${integer ? 'bilangan bulat ' : 'angka '}nol atau lebih.`);
    }
    if (!input.checkValidity()) invalid(input, `${label} tidak valid.`);
    return value;
  }

  function dateValue(input, label) {
    const value = textValue(input, label);
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      invalid(input, `${label} harus berupa tanggal yang valid.`);
    }
    return value;
  }

  function renumberRows() {
    const items = Array.from(rows.querySelectorAll('.krt-rate-row'));
    items.forEach((item, index) => {
      item.querySelector('[data-row-number]').textContent = String(index + 1);
      const removeButton = item.querySelector('[data-remove-row]');
      removeButton.disabled = items.length === 1;
      removeButton.setAttribute('aria-label', `Hapus baris tarif ${index + 1}`);
    });
  }

  function addRow(focus = false) {
    const fragment = document.getElementById('krtRowTemplate').content.cloneNode(true);
    const input = fragment.querySelector('input');
    rows.appendChild(fragment);
    renumberRows();
    message('');
    if (focus) input.focus();
  }

  function collectRows() {
    form.querySelectorAll('input, select').forEach(input => input.setCustomValidity(''));
    const customer = textValue(document.getElementById('krtCustomerCode'), 'Kode pelanggan');
    const internalOrder = textValue(document.getElementById('krtInternalOrder'), 'No IO KRT');
    const start = dateValue(document.getElementById('krtExpiryStart'), 'Tanggal berlaku mulai');
    const endInput = document.getElementById('krtExpiryEnd');
    const end = dateValue(endInput, 'Tanggal berlaku sampai');
    if (end < start) invalid(endInput, 'Tanggal berlaku sampai tidak boleh sebelum tanggal mulai.');
    const disabledInput = document.getElementById('krtDisabled');
    if (!['0', '1'].includes(disabledInput.value)) invalid(disabledInput, 'Pilih status tarif Aktif atau Nonaktif.');
    return Array.from(rows.querySelectorAll('.krt-rate-row')).map((item, index) => {
      const input = name => item.querySelector(`[name="${name}"]`);
      const label = name => `${name} pada baris tarif ${index + 1}`;
      return {
        tariff_from_code: textValue(input('tariff_from_code'), label('Kode asal')),
        tariff_to_code: textValue(input('tariff_to_code'), label('Kode tujuan')),
        service_id: SERVICE.serviceId,
        tariff_sla_day: numberValue(input('tariff_sla_day'), label('SLA hari'), true),
        tariff_sla_hours: numberValue(input('tariff_sla_hours'), label('SLA jam'), true),
        tariff_formula_id: SERVICE.formulaId,
        tariff_formula_data: JSON.stringify({ base_tariff: String(numberValue(input('base_tariff'), label('Tarif dasar'))) }),
        expiry_start: start,
        expiry_end: end,
        customer_type_code: customer,
        disableTariff: Number(disabledInput.value),
        tariff_sub_service_code: SERVICE.subserviceCode,
        tariff_sub_service_description: textValue(input('tariff_sub_service_description'), label('Deskripsi tarif')),
        internal_order: internalOrder
      };
    });
  }

  async function download(event) {
    event.preventDefault();
    if (exporting) return;
    exporting = true;
    exportButton.disabled = true;
    exportButton.textContent = 'Menyiapkan Excel…';
    try {
      collectRows();
      if (typeof window.XLSX === 'undefined') {
        if (!window.MileVendorLoader?.loadSheetJs) throw new Error('Pemuat Excel belum tersedia. Muat ulang halaman.');
        await window.MileVendorLoader.loadSheetJs();
      }
      // Read again after loading: the user may have edited the form while awaiting the vendor.
      const data = collectRows();
      const sheet = window.XLSX.utils.json_to_sheet(data, { header: [...HEADERS] });
      // Identifiers (especially No IO) must retain leading zeros and remain literal text.
      const identifiers = ['tariff_from_code', 'tariff_to_code', 'customer_type_code', 'tariff_sub_service_code', 'internal_order'];
      data.forEach((row, index) => identifiers.forEach(header => {
        const cell = sheet[window.XLSX.utils.encode_cell({ r: index + 1, c: HEADERS.indexOf(header) })];
        cell.t = 's';
        cell.v = row[header];
        cell.z = '@';
      }));
      sheet['!cols'] = HEADERS.map(header => ({ wch: Math.max(header.length + 2, header === 'tariff_formula_data' ? 32 : 18) }));
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, 'TariffCbaCustomer');
      window.XLSX.writeFile(workbook, 'template_import_customer_tariff_cba_KRT.xlsx');
      message(`Excel KRT berisi ${data.length} baris tarif telah disiapkan.`);
    } catch (error) {
      message(error?.message || 'Excel KRT belum dapat dibuat. Periksa data dan coba kembali.', true);
    } finally {
      exporting = false;
      exportButton.disabled = false;
      exportButton.textContent = 'Unduh Excel KRT';
    }
  }

  document.getElementById('krtServiceId').textContent = String(SERVICE.serviceId);
  document.getElementById('krtCustomerServiceCode').textContent = SERVICE.customerServiceCode;
  document.getElementById('krtSubserviceCode').textContent = SERVICE.subserviceCode;
  document.getElementById('krtFormulaId').textContent = String(SERVICE.formulaId);
  document.getElementById('krtAddRow').addEventListener('click', () => addRow(true));
  rows.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-row]');
    if (!button || rows.children.length <= 1) return;
    const item = button.closest('.krt-rate-row');
    const next = item.nextElementSibling || item.previousElementSibling;
    item.remove();
    renumberRows();
    message('');
    next?.querySelector('input')?.focus();
  });
  form.addEventListener('input', event => { event.target.setCustomValidity?.(''); message(''); });
  form.addEventListener('change', () => message(''));
  form.addEventListener('submit', download);
  addRow();
})();
