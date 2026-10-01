(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { ready:'Siap', filling:'Mengisi', review:'Periksa / klik Selesai', awaiting_receipt:'Menunggu resi', done:'Selesai', error:'Pengisian terhenti', unknown:'Hasil belum pasti' };
  let state = { rows:[] }, busy = false;
  const notify = (message, error = false) => { $('message').textContent = message; $('message').className = error ? 'error' : 'success'; };
  async function request(type, extra = {}) {
    if (!globalThis.chrome?.runtime?.id) throw new Error('Buka panel dengan ikon ekstensi di Chrome setelah Load unpacked.');
    const reply = await chrome.runtime.sendMessage({ type, ...extra });
    if (!reply?.ok) throw new Error(reply?.error || 'Ekstensi belum siap.');
    return reply.data;
  }
  const cell = (row, value) => { const td = document.createElement('td'); td.textContent = String(value ?? ''); row.append(td); return td; };
  function action(td, text, run) { const button = document.createElement('button'); button.textContent = text; button.addEventListener('click', () => task(run)); td.append(button); }
  function render() {
    $('filename').textContent = state.fileName || 'Belum ada file'; $('rows').replaceChildren();
    const counts = {}; for (const row of state.rows) counts[row.status] = (counts[row.status] || 0) + 1;
    $('summary').textContent = `${state.rows.length} kiriman · ${counts.done || 0} selesai · ${counts.ready || 0} siap · ${counts.error || 0} terhenti · ${counts.unknown || 0} belum pasti`;
    for (const row of state.rows) {
      const tr = document.createElement('tr'); cell(tr, row.id); cell(tr, row.data.recipient_name);
      cell(tr, `${row.data.recipient_city} · ${row.data.recipient_postcode}`); cell(tr, row.data.payment_method);
      const statusCell = cell(tr, labels[row.status] || row.status);
      if (row.error) { const small = document.createElement('small'); small.textContent = row.error; statusCell.append(small); }
      const receiptCell = cell(tr, row.receipt?.code || '—');
      if (row.receipt?.url) { const link = document.createElement('a'); link.href = row.receipt.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Buka resi'; receiptCell.append(document.createElement('br'), link); }
      if (row.status === 'error' && !state.active) action(receiptCell, 'Siapkan ulang', async () => {
        if (!confirm('Pengisian gagal sebelum Selesai. Pastikan form baru kosong dan kiriman belum dibuat di Mile. Siapkan ulang baris ini?')) return;
        await request('RETRY', { id:row.id }); await refreshState();
      });
      if (['unknown', 'awaiting_receipt', 'review'].includes(row.status)) action(receiptCell, 'Catat resi yang telah diperiksa', async () => {
        const code = prompt('Nomor resi untuk kiriman ini (periksa nama, alamat, referensi di Mile):'); if (!code) return;
        const url = prompt('Tempel URL halaman resi apiexpos.mile.app untuk kiriman yang sama:'); if (!url) return;
        if (!confirm(`Saya sudah memeriksa bahwa resi ${code} milik ${row.data.recipient_name}, ${row.data.recipient_city}, referensi ${row.data.ref_no || 'kosong'}. Tandai selesai?`)) return;
        await request('MANUAL_RECEIPT', { id:row.id, code:code.trim().toUpperCase(), url:url.trim() }); await refreshState();
      });
      $('rows').append(tr);
    }
    $('run').disabled = Boolean(state.active) || !state.rows.some(row => row.status === 'ready') || Boolean(counts.unknown);
    $('clear').disabled = Boolean(state.active) || state.rows.some(row => ['filling', 'review', 'awaiting_receipt', 'unknown'].includes(row.status));
    if (state.error) notify(state.error, true);
  }
  async function refreshState() { state = await request('GET'); render(); }
  async function refreshTabs() {
    const selected = $('tabs').value; const tabs = await request('TABS'); $('tabs').replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Pilih tab CN23'; $('tabs').append(placeholder);
    for (const tab of tabs.filter(tab => new URL(tab.url).pathname === '/new-transaction-custom')) { const option = document.createElement('option'); option.value = String(tab.id); option.textContent = `${tab.title || 'Mile CN23'} · tab ${tab.id}`; $('tabs').append(option); }
    if ([...$('tabs').options].some(option => option.value === selected)) $('tabs').value = selected;
    else if ($('tabs').options.length === 2) $('tabs').selectedIndex = 1;
  }
  async function task(fn) {
    if (busy) return; busy = true;
    try { await fn(); } catch (error) { notify(error.message, true); } finally { busy = false; }
  }
  $('file').addEventListener('change', () => task(async () => {
    const file = $('file').files[0]; if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error('Pilih Excel .xlsx dengan ukuran maksimal 10 MB.');
    const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type:'array', cellFormula:true });
    if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== 'CN23_ANTREAN') throw new Error('Gunakan Excel Antrean CN23 tersendiri, bukan Excel lokal Batam atau file gabungan.');
    const sheet = workbook.Sheets.CN23_ANTREAN;
    if (Object.values(sheet).some(cell => cell?.f)) throw new Error('Antrean tidak boleh mengandung formula. Gunakan hasil ekspor CN23 dari Mile.');
    const rows = XLSX.utils.sheet_to_json(sheet, { defval:'', raw:true }); MileCN23.validateRows(rows);
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    state = await request('IMPORT', { rows, batchId:digest, fileName:file.name }); render(); notify(`${rows.length} kiriman CN23 siap. Mulai dengan satu kiriman.`);
  }));
  $('submit').addEventListener('change', () => { $('limit').disabled = !$('submit').checked; });
  $('open').addEventListener('click', () => task(async () => { const tab = await request('OPEN_MILE'); await refreshTabs(); $('tabs').value = String(tab.tabId); }));
  $('refresh').addEventListener('click', () => task(refreshTabs));
  $('run').addEventListener('click', () => task(async () => {
    if (!$('tabs').value) throw new Error('Pilih tab form CN23 kosong dahulu.');
    const options = { autoAdvance:$('advance').checked, autoSubmit:$('submit').checked, maxCost:Number($('limit').value) };
    if (options.autoSubmit && !confirm(`Selesai akan diklik otomatis untuk kiriman dalam antrean ini dengan batas Rp ${options.maxCost.toLocaleString('id-ID')} per kiriman. Data dan preset sudah diperiksa?`)) return;
    state = await request('RUN', { tabId:Number($('tabs').value), options }); render(); notify('Pengisian dimulai. Lihat tab Mile untuk memeriksa prosesnya.');
  }));
  $('pause').addEventListener('click', () => task(async () => { await request('PAUSE'); await refreshState(); notify('Antrean dijeda. Kiriman yang sudah dikirim harus diperiksa resinya dahulu.'); }));
  $('clear').addEventListener('click', () => task(async () => { if (!confirm('Sudah mengekspor hasil? Hapus antrean dari Chrome ini?')) return; await request('CLEAR'); await refreshState(); notify('Antrean dikosongkan.'); }));
  $('export').addEventListener('click', () => task(async () => {
    await refreshState(); if (!state.rows.length) throw new Error('Antrean kosong.');
    const rows = state.rows.map(row => ({ ...row.data, hasil_status:labels[row.status], nomor_resi:row.receipt?.code || '', kode_transaksi:row.receipt?.transactionCode || '', tautan_resi:row.receipt?.url || '', verifikasi:row.receipt?.verified || '', waktu:row.receipt?.at ? new Date(row.receipt.at).toISOString() : '', catatan:row.error || '' }));
    const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(workbook, sheet, 'HASIL_CN23');
    XLSX.writeFile(workbook, `Hasil_CN23_${new Date().toISOString().slice(0,10)}.xlsx`); notify('Hasil antrean dan tautan resi diekspor.');
  }));
  task(async () => { await refreshTabs(); await refreshState(); });
  setInterval(() => { if (!busy) void refreshState().catch(error => notify(error.message, true)); }, 2000);
})();
