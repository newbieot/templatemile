(() => {
  'use strict';

  const MAX_PDF_BYTES = 15 * 1024 * 1024;
  const MAX_PAGES = 60;
  const MAX_IMAGE_SIDE = 1800;
  const JPEG_QUALITY = 0.82;
  const STORAGE_KEY = 'mile-ai-config-v1';
  let activeController = null;
  let cancelled = false;

  const $ = id => document.getElementById(id);

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else window.alert(message);
  }

  function normalizeEndpoint(raw, protocol) {
    let value = String(raw || '').trim();
    if (!value) return '';
    if (!/^https:\/\//i.test(value)) throw new Error('Endpoint API wajib menggunakan HTTPS.');
    const url = new URL(value);
    let path = url.pathname.replace(/\/+$/, '');
    if (!path || path === '/') path = '/v1';
    if (/\/v1$/i.test(path)) path += protocol === 'anthropic' ? '/messages' : '/chat/completions';
    if (protocol === 'anthropic' && !/\/messages$/i.test(path)) {
      if (/\/chat\/completions$/i.test(path)) path = path.replace(/\/chat\/completions$/i, '/messages');
    }
    if (protocol === 'openai' && !/\/chat\/completions$/i.test(path)) {
      if (/\/messages$/i.test(path)) path = path.replace(/\/messages$/i, '/chat/completions');
    }
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  function getConfig({ requireKey = true } = {}) {
    const protocol = $('aiProtocol')?.value || 'openai';
    const endpoint = normalizeEndpoint($('aiEndpoint')?.value, protocol);
    const apiKey = String($('aiApiKey')?.value || '').trim();
    const model = String($('aiModel')?.value || '').trim();
    const pagesPerRequest = Math.max(2, Math.min(5, Number($('aiPagesPerRequest')?.value || 3)));
    if (!endpoint) throw new Error('Isi endpoint API dari penyedia terlebih dahulu.');
    if (!model) throw new Error('Isi nama model API.');
    if (requireKey && !apiKey) throw new Error('Masukkan API key terlebih dahulu.');
    return { protocol, endpoint, apiKey, model, pagesPerRequest };
  }

  function saveNonSecretConfig() {
    try {
      const cfg = {
        protocol: $('aiProtocol')?.value || 'openai',
        endpoint: $('aiEndpoint')?.value || '',
        model: $('aiModel')?.value || 'claude-sonnet-4.5',
        pagesPerRequest: $('aiPagesPerRequest')?.value || '3'
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
    refreshConfigStatus();
  }

  function loadNonSecretConfig() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if ($('aiProtocol') && cfg.protocol) $('aiProtocol').value = cfg.protocol;
      if ($('aiEndpoint') && cfg.endpoint) $('aiEndpoint').value = cfg.endpoint;
      if ($('aiModel') && cfg.model) $('aiModel').value = cfg.model;
      if ($('aiPagesPerRequest') && cfg.pagesPerRequest) $('aiPagesPerRequest').value = String(cfg.pagesPerRequest);
    } catch (_) {}
  }

  function refreshConfigStatus() {
    const status = $('aiConfigStatus');
    if (!status) return;
    const hasEndpoint = Boolean(String($('aiEndpoint')?.value || '').trim());
    const hasKey = Boolean(String($('aiApiKey')?.value || '').trim());
    status.classList.toggle('is-ready', hasEndpoint && hasKey);
    status.textContent = hasEndpoint && hasKey ? 'Siap untuk PDF' : hasEndpoint ? 'Masukkan API key' : 'Belum dikonfigurasi';
  }

  function setFeedback(message, type = 'info') {
    const box = $('aiConfigFeedback');
    if (!box) return;
    box.hidden = !message;
    box.className = `ai-config-feedback${type === 'success' ? ' is-success' : type === 'error' ? ' is-error' : ''}`;
    box.textContent = message || '';
  }

  function setProgress(percent, step, message, usage = '') {
    const modal = $('aiProgressModal');
    if (modal) modal.style.display = 'flex';
    const safe = Math.max(0, Math.min(100, Math.round(percent)));
    if ($('aiProgressBar')) $('aiProgressBar').style.width = `${safe}%`;
    if ($('aiProgressPercent')) $('aiProgressPercent').textContent = `${safe}%`;
    if ($('aiProgressStep')) $('aiProgressStep').textContent = step || 'Memproses PDF';
    if ($('aiProgressMessage')) $('aiProgressMessage').textContent = message || '';
    if ($('aiProgressUsage')) $('aiProgressUsage').textContent = usage || 'Token akan tampil setelah respons';
  }

  function hideProgress() {
    const modal = $('aiProgressModal');
    if (modal) modal.style.display = 'none';
  }

  function formatUsage(total) {
    if (!total || (!total.input && !total.output)) return 'Usage token tidak diberikan provider';
    return `Input ${Number(total.input || 0).toLocaleString('id-ID')} · Output ${Number(total.output || 0).toLocaleString('id-ID')} token`;
  }

  function fileToArrayBuffer(file) {
    return file.arrayBuffer ? file.arrayBuffer() : new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Gagal membaca PDF.'));
      reader.readAsArrayBuffer(file);
    });
  }

  async function renderPageToImage(page) {
    const viewportBase = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_IMAGE_SIDE / Math.max(viewportBase.width, viewportBase.height));
    const viewport = page.getViewport({ scale: Math.max(1.25, scale) });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    canvas.width = 1;
    canvas.height = 1;
    return dataUrl;
  }

  function buildPrompt(startPage, endPage) {
    return `Anda bertugas mengekstrak data penerima dari gambar halaman PDF untuk aplikasi pengiriman MILE.

Kembalikan HANYA JSON valid tanpa markdown dan tanpa penjelasan dengan format:
{"rows":[{"no":1,"page":${startPage},"nama_penerima":"...","alamat_penerima":"...","nomor_surat":"...","di_luar_batam":false}]}

Aturan wajib:
1. Urutan data harus mengikuti urutan halaman, dari halaman ${startPage} sampai ${endPage}.
2. Kolom yang diekstrak: no, page, nama_penerima, alamat_penerima, nomor_surat, di_luar_batam.
3. Jangan menebak tulisan yang tidak terbaca. Pada bagian meragukan, tulis literal "PERLU DICEK" sambil mempertahankan bagian lain yang masih terbaca.
4. Jika satu halaman memuat lebih dari satu penerima, keluarkan semuanya sesuai urutan tampil.
5. Jika halaman tidak memiliki data penerima, jangan membuat baris palsu.
6. di_luar_batam bernilai true hanya bila alamat jelas berada di luar Kota Batam. Jika ragu, false dan tambahkan "PERLU DICEK" pada alamat.
7. Jangan mengubah nomor surat, nama, atau alamat menjadi informasi yang tidak terlihat pada dokumen.
8. Gunakan string kosong untuk kolom yang benar-benar tidak tersedia, kecuali tulisan tampak ada tetapi tidak terbaca: gunakan "PERLU DICEK".`;
  }

  function buildApiBody(config, prompt, images, maxTokens = 7000) {
    if (config.protocol === 'anthropic') {
      return {
        model: config.model,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...images.map(image => ({
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: image.split(',')[1] }
            }))
          ]
        }]
      };
    }
    return {
      model: config.model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map(image => ({ type: 'image_url', image_url: { url: image, detail: 'high' } }))
        ]
      }]
    };
  }

  async function callProxy(config, body) {
    activeController = new AbortController();
    const response = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: activeController.signal,
      body: JSON.stringify({
        protocol: config.protocol,
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        body
      })
    });
    let payload;
    const text = await response.text();
    try { payload = JSON.parse(text); } catch (_) { payload = { error: { message: text || `HTTP ${response.status}` } }; }
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `API gagal dengan HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }

  function extractTextFromResponse(payload, protocol) {
    if (protocol === 'anthropic') {
      if (typeof payload?.content === 'string') return payload.content;
      if (Array.isArray(payload?.content)) {
        return payload.content.map(block => block?.text || block?.content || '').filter(Boolean).join('\n');
      }
    }
    const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? payload?.output_text;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(part => part?.text || part?.content || '').filter(Boolean).join('\n');
    if (payload?.rows || Array.isArray(payload)) return JSON.stringify(payload);
    throw new Error('Respons API tidak memiliki teks hasil yang dapat dibaca.');
  }

  function findBalancedJson(text) {
    const cleaned = String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(cleaned); } catch (_) {}
    const starts = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter(i => i >= 0).sort((a, b) => a - b);
    for (const start of starts) {
      const open = cleaned[start];
      const close = open === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === open) depth++;
        if (ch === close) depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try { return JSON.parse(candidate); } catch (_) { break; }
        }
      }
    }
    throw new Error('AI tidak mengembalikan JSON valid. Coba ulangi dengan lebih sedikit halaman per permintaan.');
  }

  function parseRows(payload, protocol) {
    const text = extractTextFromResponse(payload, protocol);
    const parsed = findBalancedJson(text);
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows || parsed?.data || parsed?.result;
    if (!Array.isArray(rows)) throw new Error('JSON AI tidak memiliki array rows.');
    return rows;
  }

  function pick(item, keys, fallback = '') {
    for (const key of keys) {
      if (item && item[key] !== undefined && item[key] !== null) return item[key];
    }
    return fallback;
  }

  function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    return /^(true|ya|yes|1|luar)/i.test(String(value || '').trim());
  }

  function normalizeAIText(value, kind = 'text') {
    const raw = String(value ?? '').replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const core = window.__mileCore;
    if (kind === 'reference' && core?.cleanReference) return core.cleanReference(raw);
    if (core?.cleanArtifacts) return core.cleanArtifacts(raw);
    return raw.toUpperCase();
  }

  function normalizeRows(aiRows, template, pageOffset = 0) {
    const core = window.__mileCore;
    return aiRows.map((item, index) => {
      const name = normalizeAIText(pick(item, ['nama_penerima', 'nama', 'name', 'penerima']));
      const address = normalizeAIText(pick(item, ['alamat_penerima', 'alamat', 'address', 'destination_address']));
      const noSurat = normalizeAIText(pick(item, ['nomor_surat', 'no_surat', 'surat', 'ref', 'reference']), 'reference');
      const page = Number(pick(item, ['page', 'halaman', 'page_number'], pageOffset + index + 1)) || pageOffset + index + 1;
      const outsideBatam = normalizeBoolean(pick(item, ['di_luar_batam', 'luar_batam', 'outside_batam'], false));
      const zip = core?.getZipCodeFromAddress ? core.getZipCodeFromAddress(address, template) : '29411';
      return {
        senderName: '', noSurat, name, phone: '0', zip, address,
        act: 0.2, p: 10, l: 10, t: 10, cw: '0.20',
        outsideBatam, sourcePage: page
      };
    }).filter(row => row.name || row.address || row.noSurat);
  }

  function getUsage(payload, protocol) {
    if (protocol === 'anthropic') {
      return { input: payload?.usage?.input_tokens || 0, output: payload?.usage?.output_tokens || 0 };
    }
    return {
      input: payload?.usage?.prompt_tokens || payload?.usage?.input_tokens || 0,
      output: payload?.usage?.completion_tokens || payload?.usage?.output_tokens || 0
    };
  }

  async function testConnection() {
    const button = $('testAiConnection');
    try {
      const config = getConfig();
      saveNonSecretConfig();
      button.disabled = true;
      button.textContent = 'Menguji…';
      setFeedback('Menghubungi endpoint API…');
      const body = config.protocol === 'anthropic'
        ? { model: config.model, max_tokens: 8, messages: [{ role: 'user', content: 'Balas hanya dengan kata OK.' }] }
        : { model: config.model, max_tokens: 8, messages: [{ role: 'user', content: 'Balas hanya dengan kata OK.' }] };
      const payload = await callProxy(config, body);
      const text = extractTextFromResponse(payload, config.protocol).trim().slice(0, 80);
      setFeedback(`Koneksi berhasil. Respons model: ${text || 'OK'}`, 'success');
      showToast('Koneksi API berhasil.', 'success');
    } catch (error) {
      setFeedback(`Koneksi gagal: ${error.message}`, 'error');
      showToast(`Koneksi API gagal: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Tes koneksi API';
      activeController = null;
      refreshConfigStatus();
    }
  }

  async function processPDFFile(file) {
    const core = window.__mileCore;
    if (!core) {
      alert('Core MILE belum siap. Muat ulang halaman.');
      return;
    }
    let config;
    try {
      config = getConfig();
      saveNonSecretConfig();
      if (!file || file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) throw new Error('Berkas bukan PDF.');
      if (file.size > MAX_PDF_BYTES) throw new Error('Ukuran PDF melebihi 15 MB. Kompres PDF lalu coba lagi.');
      if (typeof window.pdfjsLib === 'undefined') throw new Error('Library pembaca PDF gagal dimuat. Periksa koneksi lalu muat ulang halaman.');
    } catch (error) {
      $('aiConfigPanel')?.setAttribute('open', '');
      showToast(error.message, 'error');
      core.processNextInQueue();
      return;
    }

    cancelled = false;
    let pdf = null;
    const totalUsage = { input: 0, output: 0 };
    try {
      setProgress(2, 'Membaca PDF', `Membuka ${file.name}…`);
      const bytes = await fileToArrayBuffer(file);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      if (pdf.numPages > MAX_PAGES) throw new Error(`PDF memiliki ${pdf.numPages} halaman. Batas sementara adalah ${MAX_PAGES} halaman.`);

      const chunks = [];
      for (let start = 1; start <= pdf.numPages; start += config.pagesPerRequest) {
        chunks.push({ start, end: Math.min(pdf.numPages, start + config.pagesPerRequest - 1) });
      }
      const mergedRows = [];
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        const chunk = chunks[chunkIndex];
        const images = [];
        for (let pageNumber = chunk.start; pageNumber <= chunk.end; pageNumber++) {
          const base = 5 + ((chunkIndex + (pageNumber - chunk.start) / Math.max(1, chunk.end - chunk.start + 1)) / chunks.length) * 45;
          setProgress(base, `Menyiapkan halaman ${pageNumber}/${pdf.numPages}`, `Mengubah halaman menjadi gambar agar dapat dibaca model.`, formatUsage(totalUsage));
          const page = await pdf.getPage(pageNumber);
          images.push(await renderPageToImage(page));
          page.cleanup();
        }

        const requestNo = chunkIndex + 1;
        const beforeCall = 50 + (chunkIndex / chunks.length) * 45;
        setProgress(beforeCall, `Permintaan AI ${requestNo}/${chunks.length}`, `Membaca halaman ${chunk.start}–${chunk.end} menggunakan ${config.model}.`, formatUsage(totalUsage));
        const body = buildApiBody(config, buildPrompt(chunk.start, chunk.end), images);
        const payload = await callProxy(config, body);
        activeController = null;
        const usage = getUsage(payload, config.protocol);
        totalUsage.input += Number(usage.input || 0);
        totalUsage.output += Number(usage.output || 0);
        const aiRows = parseRows(payload, config.protocol);
        const template = $('corporateTemplate')?.value || 'MANUAL';
        mergedRows.push(...normalizeRows(aiRows, template, chunk.start - 1));
        setProgress(50 + ((chunkIndex + 1) / chunks.length) * 45, `Permintaan AI ${requestNo}/${chunks.length} selesai`, `${mergedRows.length} baris ditemukan sementara.`, formatUsage(totalUsage));
      }

      if (!mergedRows.length) throw new Error('AI tidak menemukan data penerima pada PDF ini.');
      mergedRows.sort((a, b) => Number(a.sourcePage || 0) - Number(b.sourcePage || 0));
      setProgress(98, 'Menyiapkan tabel', `${mergedRows.length} baris hasil ekstraksi sedang dimasukkan ke tabel.`, formatUsage(totalUsage));

      const itemType = $('itemType')?.value || 'DOKUMEN';
      if (itemType === 'PAKET') {
        core.tempExtractedRows = mergedRows;
        hideProgress();
        core.showWeightModal();
      } else {
        core.uploadedFilesManager.push({ id: Date.now(), name: file.name, rows: mergedRows, source: 'AI PDF' });
        core.updateInterface();
        setProgress(100, 'Selesai', `${mergedRows.length} baris berhasil diekstrak. Periksa semua sel kuning sebelum ekspor.`, formatUsage(totalUsage));
        window.setTimeout(hideProgress, 800);
        showToast(`${mergedRows.length} baris berhasil dibaca dari PDF.`, 'success');
        core.processNextInQueue();
      }
    } catch (error) {
      hideProgress();
      if (error?.name === 'AbortError' || cancelled) showToast('Proses PDF dibatalkan.', 'info');
      else showToast(`Gagal memproses PDF: ${error.message}`, 'error');
      core.processNextInQueue();
    } finally {
      activeController = null;
      try { pdf?.cleanup?.(); pdf?.destroy?.(); } catch (_) {}
    }
  }

  function cancelProcess() {
    cancelled = true;
    activeController?.abort();
  }

  function bind() {
    loadNonSecretConfig();
    ['aiProtocol', 'aiEndpoint', 'aiModel', 'aiPagesPerRequest'].forEach(id => {
      $(id)?.addEventListener('change', saveNonSecretConfig);
      $(id)?.addEventListener('input', saveNonSecretConfig);
    });
    $('aiApiKey')?.addEventListener('input', refreshConfigStatus);
    $('toggleApiKey')?.addEventListener('click', () => {
      const input = $('aiApiKey');
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      $('toggleApiKey').textContent = showing ? 'Lihat' : 'Sembunyikan';
    });
    $('testAiConnection')?.addEventListener('click', testConnection);
    $('cancelAiProcess')?.addEventListener('click', cancelProcess);
    refreshConfigStatus();
  }

  window.MileAI = {
    processPDFFile,
    testConnection,
    cancel: cancelProcess,
    _test: { normalizeEndpoint, findBalancedJson, parseRows, normalizeRows, buildApiBody }
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
