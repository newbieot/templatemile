/* Operates visible Mile fields. Never calls Mile's transaction API. */
(() => {
  'use strict';
  if (location.pathname !== '/new-transaction-custom') return;
  const Q = MileCN23;
  let current = null;
  const visible = el => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const one = (selector, root = document) => {
    const list = all(selector, root).filter(visible);
    if (list.length !== 1) throw new Error(`Kolom tidak ditemukan atau ganda: ${selector}. Periksa tampilan Mile.`);
    return list[0];
  };
  async function send(type, extra = {}) {
    const reply = await chrome.runtime.sendMessage({ type, token: current?.token, ...extra });
    if (!reply?.ok) throw new Error(reply?.error || 'Status antrean belum dapat disimpan.');
    return reply.data;
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function wait(fn, description, timeout = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (current?.cancelled && !current?.submitted) throw new Error('Dijeda oleh petugas. Bersihkan form sebelum mencoba isi ulang.');
      const result = fn();
      if (result) return result;
      await sleep(150);
    }
    throw new Error(`Mile belum siap: ${description}. Periksa form sebelum melanjutkan.`);
  }
  function status(message, action) {
    let bar = document.getElementById('mile-cn23-helper');
    if (!bar) {
      bar = document.createElement('aside'); bar.id = 'mile-cn23-helper';
      Object.assign(bar.style, { position:'fixed', bottom:'12px', left:'12px', right:'12px', zIndex:'2147483647', background:'#112b46', color:'white', padding:'14px', borderRadius:'12px', boxShadow:'0 4px 24px #0005', font:'14px Arial' });
      document.body.append(bar);
    }
    bar.replaceChildren();
    const label = document.createElement('span'); label.textContent = `Mile CN23 Helper · ${message}`; bar.append(label);
    if (action) {
      const button = document.createElement('button'); button.textContent = action.label;
      button.style.cssText = 'margin-left:16px;padding:8px 12px;cursor:pointer';
      button.addEventListener('click', action.run, { once:true }); bar.append(button);
    }
  }
  function fill(el, value) {
    if (el.disabled || el.readOnly) throw new Error('Kolom belum dapat diisi: ' + (el.id || el.placeholder));
    el.focus();
    const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, String(value ?? ''));
    el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); el.blur();
  }
  const byId = (id, value) => fill(one('#' + id), value);
  const byPlaceholder = (placeholder, value) => fill(one(`input[placeholder="${placeholder}"]`), value);
  function exactButton(text, root = document) {
    return all('button', root).filter(visible).find(el => Q.norm(el.textContent) === Q.norm(text) && !el.disabled);
  }
  async function select(input, labels) {
    const labelList = labels.map(Q.norm);
    input.click();
    const option = await wait(() => all('.el-select-dropdown__item').filter(visible).find(el => labelList.includes(Q.norm(el.textContent)) && !el.classList.contains('is-disabled')), 'pilihan ' + labels.join('/'));
    option.click();
    await wait(() => labelList.includes(Q.norm(input.value)), 'pilihan terkunci ' + labels.join('/'));
  }
  function selectContaining(label) {
    const containers = all('.el-select').filter(visible).filter(el => all('.el-select-dropdown__item', el).some(item => Q.norm(item.textContent) === Q.norm(label)));
    if (containers.length !== 1) throw new Error('Menu belum dikenali: ' + label);
    return one('input', containers[0]);
  }
  async function autocomplete(input, query, accept) {
    fill(input, query); input.focus();
    const option = await wait(() => all('.el-autocomplete-suggestion li').filter(visible).find(el => accept(Q.norm(el.textContent))), 'hasil pencarian ' + query);
    option.click(); await sleep(250);
  }
  function regionTextMatches(text, row) {
    return [row.recipient_city, row.recipient_district].every(value => text.includes(Q.norm(value))) &&
      (!row.recipient_village || String(row.recipient_village).split(/[\/;]/).some(value => text.includes(Q.norm(value))));
  }
  async function destination(row) {
    const input = one('#addressDetail');
    const query = `${row.recipient_district} ${row.recipient_village ? String(row.recipient_village).split(/[\/;]/)[0] : row.recipient_postcode}`;
    fill(input, query); input.focus();
    await wait(() => {
      const postal = one('input[placeholder="KODE POS"]').value;
      if (postal && regionTextMatches(Q.norm(input.value), row)) return true;
      const candidates = all('.el-autocomplete-suggestion li').filter(visible).filter(el => regionTextMatches(Q.norm(el.textContent), row));
      if (candidates.length === 1) { candidates[0].click(); return true; }
      if (candidates.length > 1) {
        const postalMatches = candidates.filter(el => Q.norm(el.textContent).split(' ').includes(String(row.recipient_postcode)));
        if (postalMatches.length === candidates.length) { candidates[0].click(); return true; }
        throw new Error('Pilihan Mile belum menunjukkan satu kode pos yang cocok dengan antrean.');
      }
      return false;
    }, 'kelurahan/kecamatan/kota tujuan');
    await wait(() => one('input[placeholder="KODE POS"]').value, 'kode pos terkunci');
    const postal = one('input[placeholder="KODE POS"]').value;
    if (postal !== String(row.recipient_postcode) || !regionTextMatches(Q.norm(input.value), row)) throw new Error(`Tujuan Mile belum cocok. Excel ${row.recipient_postcode}; Mile ${postal}. Periksa pilihan wilayah.`);
    const zone = one('input[placeholder="KODE ZONA"]').value;
    if (!zone || (row.destination_code && String(row.destination_code) !== zone)) throw new Error('Kode zona Mile kosong atau berbeda dari antrean. Periksa tujuan.');
  }
  function totalCost(dialog) {
    // Label is deliberately required: unrelated amounts must never become the cost limit.
    const labels = all('label, .el-form-item__label', dialog).filter(visible).filter(el => /^(TOTAL TAGIHAN|TOTAL PEMBAYARAN|TOTAL BAYAR|GRAND TOTAL)$/.test(Q.norm(el.textContent)));
    if (labels.length !== 1) return NaN;
    const parent = labels[0].closest('.el-form-item') || labels[0].parentElement;
    const value = parent.querySelector('input')?.value || parent.textContent.replace(labels[0].textContent, '');
    const cleaned = String(value).replace(/Rp\.?|\s/gi, '').replace(/\./g, '').replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
  }
  async function submit(button) {
    if (!current || current.submitting || current.submitted || current.cancelled) return;
    if (button.disabled || !visible(button)) throw new Error('Tombol Selesai belum siap.');
    current.submitting = true;
    await send('SUBMIT_INTENT'); // Durable status must precede the irreversible click.
    current.submitted = true; current.permitClick = true;
    status('Menunggu resi baru. Jangan klik Selesai lagi.');
    button.click(); current.permitClick = false;
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!current || Q.norm(button?.textContent) !== 'SELESAI') return;
    if (current.permitClick) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (current.paymentReady && !current.submitted) submit(button).catch(fail);
  }, true);
  async function fail(error) {
    status(error.message || String(error));
    try { await send('FORM_ERROR', { error:error.message || String(error) }); } catch (_) { /* Retain local guard when storage is unavailable. */ }
    if (!current?.submitted) current = null;
  }
  async function run(row, options) {
    await wait(() => document.getElementById('namapenerima') && visible(document.getElementById('namapenerima')), 'form CN23');
    if (one('#namapenerima').value.trim() || one('#ref_no').value.trim() || exactButton('Ubah Data')) throw new Error('Form Mile sudah berisi transaksi. Buka form CN23 baru yang kosong dahulu.');
    status(`Mengisi ${row.queue_id} · ${row.recipient_name}`);
    if (row.customer_mode === 'KORPORAT') {
      for (const id of ['namapengirim', 'phonePengirim', 'alamatPengirim']) byId(id, '');
      const field = one('input[name="pelanggan"]'); fill(field, row.customer_code);
      await send('PROGRESS', { phase:'customer_loading' });
      field.focus();
      for (const type of ['keydown', 'keypress', 'keyup']) field.dispatchEvent(new KeyboardEvent(type, { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
      status(`Memuat pelanggan ${row.customer_code}…`);
      await wait(() => Q.norm(field.value).includes(Q.norm(row.customer_code)) &&
        one('#namapengirim').value.trim() && one('#phonePengirim').value.trim() && one('#alamatPengirim').value.trim() &&
        !all('.el-loading-mask').some(visible), 'nama dan alamat pelanggan setelah Enter', 45000);
      await send('PROGRESS', { phase:'filling', customerResolved:{sender_name:one('#namapengirim').value.trim(),sender_phone:one('#phonePengirim').value.trim(),sender_address:one('#alamatPengirim').value.trim()} });
    }
    for (const [id, key] of Object.entries({ namapengirim:'sender_name', phonePengirim:'sender_phone', alamatPengirim:'sender_address', namapenerima:'recipient_name', phonePenerima:'recipient_phone', alamatPenerima:'recipient_address' })) { if (row.customer_mode !== 'KORPORAT' || key.startsWith('recipient_')) byId(id, row[key]); }
    await destination(row);
    await autocomplete(one('#service'), row.service_code, text => text === Q.norm(row.service_code) || text.startsWith(Q.norm(row.service_code) + ' '));
    await select(one('#COD'), ['NON-COD']); await select(one('#Jenis_Barang'), ['Dokumen']);
    for (const [id, key] of Object.entries({ ref_no:'ref_no', instruksi_pengiriman:'shipping_instruction', koli_description:'description', koli_length:'length_cm', koli_width:'width_cm', koli_height:'height_cm' })) byId(id, row[key]);
    await select(selectContaining('Dokumen / Documents'), ['Dokumen / Documents']);
    await select(selectContaining('Ecommerce/Biasa'), ['Ecommerce/Biasa']);
    await wait(() => !one('input[placeholder="Pilih HSCODE"]').disabled, 'detail item');
    byPlaceholder('NPWP', row.npwp);
    await autocomplete(one('input[placeholder="Pilih HSCODE"]'), row.hs_code, text => text.startsWith(row.hs_code));
    for (const [placeholder, key] of Object.entries({ 'Nama Barang':'item_name', 'Jumlah Barang':'quantity', Rupiah:'item_value_idr', Berat:'weight_kg', 'Imei 1':'imei_1', 'Imei 2':'imei_2' })) byPlaceholder(placeholder, row[key]);
    const country = one('input[placeholder="Negara Asal"]');
    if (country.value !== 'ID') await autocomplete(country, 'ID', text => text === 'ID' || text.startsWith('ID '));
    await select(selectContaining('EN - Envelope'), ['EN-Envelope', 'EN - Envelope', 'Envelope']);
    const pdriSelect = selectContaining('Insurance');
    const pdriContainer = pdriSelect.closest('.el-select');
    if (row.insurance === 'Y') {
      pdriSelect.click(); const option = await wait(() => all('.el-select-dropdown__item').filter(visible).find(el => /^(INSURANCE|ASURANSI)$/.test(Q.norm(el.textContent))), 'Insurance'); option.click();
      if (!/INSURANCE|ASURANSI/i.test(pdriContainer.textContent)) throw new Error('Asuransi belum terkunci.');
    } else if (/INSURANCE|ASURANSI/i.test(all('.el-tag', pdriContainer).map(el => el.textContent).join(' '))) throw new Error('Asuransi sudah terpilih pada form tanpa asuransi. Buka form baru.');
    await wait(() => Number(one('#koli_weight').value) === .2 && Number(one('#harga_barang').value) === 20000, 'berat/nilai barang dari detail item');
    const calculate = exactButton('Proses Hitung PDRI'); if (!calculate) throw new Error('Proses Hitung PDRI belum aktif.'); calculate.click();
    await wait(() => exactButton('Ubah Data') && exactButton('Pembayaran'), 'hasil hitung PDRI', 45000);
    exactButton('Pembayaran').click();
    const dialog = await wait(() => all('.el-dialog').filter(visible).find(el => exactButton('Selesai', el)), 'jendela pembayaran');
    const payment = one('.el-select input', dialog);
    await select(payment, row.payment_method === 'CASH' ? ['Cash'] : row.payment_method === 'CREDIT' ? ['CREDIT'] : ['Invoice']);
    await send('FILLED'); current.paymentReady = true;
    const button = exactButton('Selesai', dialog);
    if (options.autoSubmit !== false) {
      const amount = totalCost(dialog);
      if (options.maxCost > 0 && (!Number.isFinite(amount) || amount > options.maxCost)) throw new Error('Tagihan melampaui batas biaya yang ditetapkan.');
      await submit(button);
    } else status(`${row.recipient_name} siap. Periksa data dan biaya, lalu klik Selesai di Mile.`);
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'CN23_FILL') {
      if (current) { reply({ accepted:false, error:'Form masih memiliki kiriman aktif. Muat ulang form kosong dahulu.' }); return; }
      current = { token:message.token, cancelled:false, submitted:false, paymentReady:false };
      reply({ accepted:true }); run(message.row, message.options || {}).catch(fail);
    } else if (message.type === 'CN23_PAUSE') {
      if (current?.token === message.token) {
        current.cancelled = true; status('Dijeda. Kiriman yang sudah dikirim tetap menunggu verifikasi resi.');
        if (!current.submitted && current.paymentReady) void fail(new Error('Dijeda sebelum Selesai. Buka form kosong untuk melanjutkan.'));
        current?.cancelResolve?.();
      }
      reply({ accepted:true });
    } else if (message.type === 'CN23_FINISHED') {
      current = null; status('Resi tersimpan. Melanjutkan antrean…'); reply({ accepted:true });
    }
    return false;
  });
  wait(() => document.getElementById('namapenerima'), 'form baru', 45000).then(() => chrome.runtime.sendMessage({ type:'FORM_READY' })).catch(() => {});
})();
