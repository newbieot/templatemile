(() => {
  'use strict';

  const MAX_PDF_BYTES = 120 * 1024 * 1024;
  const MAX_PAGES = 300;
  const MAX_IMAGE_SIDE = 1568;
  const JPEG_QUALITY = 0.76;
  const MAX_RETRIES = 3;
  const STORAGE_KEY = 'mile-ai-config-v3';
  const COSMOS_BASE_URL = 'https://api.cosmoshub.tech/v1';
  const COSMOS_ENDPOINT = `${COSMOS_BASE_URL}/chat/completions`;
  const COSMOS_MODELS = new Set([
    'qwen-3.7-max','gemini-3.5-flash','gemini-3.1-pro','mimo-v2.5','mimo-v2.5-pro',
    'kimi-k2.7-code','glm-5.2','deepseek-v4-pro','deepseek-v4-flash','gpt-5.5',
    'gpt-5.6-luna','gpt-5.6-sol','gpt-5.6-terra','muse-spark-1.1','claude-haiku-4.5',
    'claude-sonnet-4.5','nemotron-3-super','kimi-k3','minimax-m3','minimax-m2.5',
    'deepseek-3.2','gemini-3.6-flash','claude-opus-5','glm-5','qwen-3.8-max-preview',
    'deepseek-v4-flash-0731'
  ]);
  const activeControllers = new Set();
  let cancelled = false;

  const $ = id => document.getElementById(id);

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else window.alert(message);
  }

  function normalizeEndpoint(raw) {
    const value = String(raw || COSMOS_BASE_URL).trim().replace(/\/+$/, '');
    if (value === COSMOS_BASE_URL || value === COSMOS_ENDPOINT) return COSMOS_ENDPOINT;
    throw new Error('Base URL CosmosHub tidak sesuai. Gunakan https://api.cosmoshub.tech/v1.');
  }

  function getConfig({ requireKey = true } = {}) {
    const protocol = 'openai';
    const endpoint = normalizeEndpoint($('aiEndpoint')?.value);
    const apiKey = String($('aiApiKey')?.value || '').trim();
    const model = String($('aiModel')?.value || 'claude-sonnet-4.5').trim();
    const pagesPerRequest = Math.max(2, Math.min(10, Number($('aiPagesPerRequest')?.value || 6)));
    const concurrency = Math.max(1, Math.min(6, Number($('aiConcurrency')?.value || 4)));
    if (!COSMOS_MODELS.has(model)) throw new Error('Model tidak tersedia pada daftar CosmosHub yang dikonfigurasi.');
    if (requireKey && !apiKey) throw new Error('Masukkan API key CosmosHub terlebih dahulu.');
    return { provider: 'cosmoshub', protocol, endpoint, apiKey, model, pagesPerRequest, concurrency };
  }

  function saveNonSecretConfig() {
    try {
      const cfg = {
        model: $('aiModel')?.value || 'claude-sonnet-4.5',
        pagesPerRequest: $('aiPagesPerRequest')?.value || '6',
        concurrency: $('aiConcurrency')?.value || '4'
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
    refreshConfigStatus();
  }

  function loadNonSecretConfig() {
    if ($('aiEndpoint')) $('aiEndpoint').value = COSMOS_BASE_URL;
    if ($('aiProtocol')) $('aiProtocol').value = 'openai';
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY) || sessionStorage.getItem('mile-ai-config-v2') || sessionStorage.getItem('mile-ai-config-v1');
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if ($('aiModel') && cfg.model && COSMOS_MODELS.has(cfg.model)) $('aiModel').value = cfg.model;
      if ($('aiPagesPerRequest') && cfg.pagesPerRequest) $('aiPagesPerRequest').value = String(cfg.pagesPerRequest);
      if ($('aiConcurrency') && cfg.concurrency) $('aiConcurrency').value = String(cfg.concurrency);
    } catch (_) {}
  }

  function refreshConfigStatus() {
    const status = $('aiConfigStatus');
    if (!status) return;
    const hasKey = Boolean(String($('aiApiKey')?.value || '').trim());
    status.classList.toggle('is-ready', hasKey);
    status.textContent = hasKey ? 'CosmosHub siap' : 'Masukkan API key';
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

  function formatDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    if (value < 60) return `${value} detik`;
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${minutes} menit ${rest} detik` : `${minutes} menit`;
  }

  function sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
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
    return {
      model: config.model,
      stream: false,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map(image => ({ type: 'image_url', image_url: { url: image } }))
        ]
      }]
    };
  }

  async function callProxy(config, body) {
    const controller = new AbortController();
    activeControllers.add(controller);
    try {
      const response = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider: 'cosmoshub',
          apiKey: config.apiKey,
          body
        })
      });
      let payload;
      const text = await response.text();
      try { payload = JSON.parse(text); } catch (_) { payload = { error: { message: text || `HTTP ${response.status}` } }; }
      if (!response.ok) {
        let message = payload?.error?.message || payload?.message || `API gagal dengan HTTP ${response.status}`;
        if (response.status === 401 || response.status === 403) message = `API key CosmosHub ditolak (${response.status}). Periksa kembali key dan saldo akun.`;
        else if (response.status === 404) message = 'Endpoint atau model CosmosHub tidak ditemukan. Pastikan model yang dipilih masih tersedia.';
        else if (response.status === 429) message = 'CosmosHub membatasi terlalu banyak permintaan. Turunkan Permintaan paralel menjadi 1–2 lalu coba lagi.';
        else if (response.status === 413) message = 'Kelompok halaman terlalu besar. Turunkan Halaman per permintaan menjadi 2–4.';
        const error = new Error(message);
        error.status = response.status;
        error.details = payload;
        throw error;
      }
      return payload;
    } finally {
      activeControllers.delete(controller);
    }
  }

  function isRetryable(error) {
    if (cancelled || error?.name === 'AbortError') return false;
    if (!error?.status) return true;
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(error.status));
  }

  async function callProxyWithRetry(config, body, label = '') {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
      try {
        const payload = await callProxy(config, body);
        // Validasi JSON di sini agar respons terpotong juga dicoba ulang.
        parseRows(payload, config.protocol);
        return payload;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) && !/JSON valid|array rows|teks hasil/i.test(String(error.message || ''))) throw error;
        if (attempt >= MAX_RETRIES) break;
        const delay = [1800, 4200, 8500][attempt - 1] || 8500;
        setProgress(
          Number($('aiProgressPercent')?.textContent?.replace(/\D/g, '') || 10),
          `Mencoba ulang ${label}`,
          `Percobaan ${attempt + 1}/${MAX_RETRIES} dimulai dalam ${formatDuration(delay / 1000)}.`,
          $('aiProgressUsage')?.textContent || ''
        );
        await sleep(delay + Math.floor(Math.random() * 700));
      }
    }
    throw lastError || new Error('Permintaan AI gagal setelah beberapa kali percobaan.');
  }

  function extractTextFromResponse(payload, protocol) {
    if (protocol === 'anthropic') {
      if (typeof payload?.content === 'string') return payload.content;
      if (Array.isArray(payload?.content)) {
        return payload.content.map(block => block?.text || block?.content || '').filter(Boolean).join('\n');
      }
    }
    const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.message?.reasoning_content ?? payload?.choices?.[0]?.text ?? payload?.output_text;
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
      button.textContent = 'Menguji CosmosHub…';
      setFeedback(`Menghubungi CosmosHub dengan model ${config.model}…`);
      const body = {
        model: config.model,
        messages: [{ role: 'user', content: 'Balas hanya dengan kata OK.' }]
      };
      const payload = await callProxy(config, body);
      const text = extractTextFromResponse(payload, 'openai').trim().slice(0, 120);
      const usage = getUsage(payload, 'openai');
      const usageText = usage.input || usage.output ? ` · ${formatUsage(usage)}` : '';
      setFeedback(`Koneksi CosmosHub berhasil. Respons: ${text || 'OK'}${usageText}`, 'success');
      showToast('Koneksi CosmosHub berhasil.', 'success');
    } catch (error) {
      setFeedback(`Koneksi CosmosHub gagal: ${error.message}`, 'error');
      showToast(`Koneksi CosmosHub gagal: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Tes API CosmosHub';
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
      if (file.size > MAX_PDF_BYTES) throw new Error('Ukuran PDF melebihi 120 MB. Kompres PDF lalu coba lagi.');
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
    const startedAt = performance.now();
    try {
      setProgress(2, 'Membaca PDF', `Membuka ${file.name}…`);
      const bytes = await fileToArrayBuffer(file);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      if (pdf.numPages > MAX_PAGES) throw new Error(`PDF memiliki ${pdf.numPages} halaman. Batas maksimal adalah ${MAX_PAGES} halaman.`);
      if (pdf.numPages > 150) showToast('PDF besar terdeteksi. Biarkan tab tetap terbuka sampai proses selesai.', 'info');

      const chunks = [];
      for (let start = 1; start <= pdf.numPages; start += config.pagesPerRequest) {
        chunks.push({ start, end: Math.min(pdf.numPages, start + config.pagesPerRequest - 1) });
      }

      const results = new Array(chunks.length);
      let nextChunkIndex = 0;
      let completedChunks = 0;
      let rowsFound = 0;
      let firstCompletedAt = 0;

      const updateParallelProgress = (chunk, phase = 'AI') => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const throughput = completedChunks ? completedChunks / Math.max(1, elapsed) : 0;
        const remainingChunks = Math.max(0, chunks.length - completedChunks);
        const eta = throughput ? ` · estimasi sisa ${formatDuration(remainingChunks / throughput)}` : '';
        const percent = 5 + (completedChunks / Math.max(1, chunks.length)) * 90;
        setProgress(
          percent,
          `${phase} halaman ${chunk.start}–${chunk.end}`,
          `${completedChunks}/${chunks.length} kelompok selesai · ${rowsFound} baris ditemukan${eta}`,
          formatUsage(totalUsage)
        );
      };

      async function processChunk(chunk, chunkIndex) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        updateParallelProgress(chunk, 'Menyiapkan');
        const images = [];
        for (let pageNumber = chunk.start; pageNumber <= chunk.end; pageNumber++) {
          if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
          const page = await pdf.getPage(pageNumber);
          try {
            images.push(await renderPageToImage(page));
          } finally {
            page.cleanup();
          }
        }

        updateParallelProgress(chunk, 'Membaca AI');
        const body = buildApiBody(config, buildPrompt(chunk.start, chunk.end), images, Math.max(3000, (chunk.end - chunk.start + 1) * 950));
        const payload = await callProxyWithRetry(config, body, `halaman ${chunk.start}–${chunk.end}`);
        const usage = getUsage(payload, config.protocol);
        totalUsage.input += Number(usage.input || 0);
        totalUsage.output += Number(usage.output || 0);
        const aiRows = parseRows(payload, config.protocol);
        const template = $('corporateTemplate')?.value || 'MANUAL';
        const normalized = normalizeRows(aiRows, template, chunk.start - 1);
        results[chunkIndex] = normalized;
        rowsFound += normalized.length;
        completedChunks++;
        if (!firstCompletedAt) firstCompletedAt = performance.now();
        updateParallelProgress(chunk, 'Selesai');
      }

      async function worker() {
        while (true) {
          if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
          const index = nextChunkIndex++;
          if (index >= chunks.length) return;
          await processChunk(chunks[index], index);
        }
      }

      const workerCount = Math.min(config.concurrency, chunks.length);
      setProgress(5, 'Memulai pemrosesan paralel', `${chunks.length} kelompok halaman diproses dengan ${workerCount} jalur paralel.`, formatUsage(totalUsage));
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      const mergedRows = results.flat().filter(Boolean);
      if (!mergedRows.length) throw new Error('AI tidak menemukan data penerima pada PDF ini.');
      mergedRows.sort((a, b) => Number(a.sourcePage || 0) - Number(b.sourcePage || 0));
      const elapsed = (performance.now() - startedAt) / 1000;
      setProgress(98, 'Menyiapkan tabel', `${mergedRows.length} baris hasil ekstraksi sedang dimasukkan ke tabel. Waktu proses ${formatDuration(elapsed)}.`, formatUsage(totalUsage));

      const itemType = $('itemType')?.value || 'DOKUMEN';
      if (itemType === 'PAKET') {
        core.tempExtractedRows = mergedRows;
        hideProgress();
        core.showWeightModal();
      } else {
        core.uploadedFilesManager.push({ id: Date.now(), name: file.name, rows: mergedRows, source: 'AI PDF' });
        core.updateInterface();
        setProgress(100, 'Selesai', `${mergedRows.length} baris berhasil diekstrak dalam ${formatDuration(elapsed)}. Periksa semua sel kuning sebelum ekspor.`, formatUsage(totalUsage));
        window.setTimeout(hideProgress, 1200);
        showToast(`${mergedRows.length} baris berhasil dibaca dari PDF dalam ${formatDuration(elapsed)}.`, 'success');
        core.processNextInQueue();
      }
    } catch (error) {
      if (error?.name !== 'AbortError') cancelled = true;
      hideProgress();
      if (error?.name === 'AbortError') showToast('Proses PDF dibatalkan.', 'info');
      else showToast(`Gagal memproses PDF: ${error.message}`, 'error');
      core.processNextInQueue();
    } finally {
      activeControllers.forEach(controller => controller.abort());
      activeControllers.clear();
      try { pdf?.cleanup?.(); pdf?.destroy?.(); } catch (_) {}
    }
  }

  function cancelProcess() {
    cancelled = true;
    activeControllers.forEach(controller => controller.abort());
    activeControllers.clear();
  }

  function bind() {
    loadNonSecretConfig();
    ['aiModel', 'aiPagesPerRequest', 'aiConcurrency'].forEach(id => {
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
