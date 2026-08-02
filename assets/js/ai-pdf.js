(() => {
  'use strict';

  const MAX_PDF_BYTES = 120 * 1024 * 1024;
  const MAX_PAGES = 300;
  const IMAGE_PROFILES = {
    fast: { maxSide: 1800, jpegQuality: 0.82, verify: 'none' },
    balanced: { maxSide: 2300, jpegQuality: 0.90, verify: 'smart' },
    accurate: { maxSide: 2700, jpegQuality: 0.92, verify: 'all' }
  };
  const DEFAULT_ACCURACY_MODE = 'balanced';
  const MAX_RETRIES = 3;
  const STORAGE_KEY = 'mile-ai-config-v4';
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
  let preferredTransport = 'proxy';
  let lastSuccessfulTransport = '';

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
    const accuracyMode = IMAGE_PROFILES[$('aiAccuracyMode')?.value] ? $('aiAccuracyMode').value : DEFAULT_ACCURACY_MODE;
    const pagesPerRequest = Math.max(2, Math.min(10, Number($('aiPagesPerRequest')?.value || 4)));
    const concurrency = Math.max(1, Math.min(6, Number($('aiConcurrency')?.value || 4)));
    if (!COSMOS_MODELS.has(model)) throw new Error('Model tidak tersedia pada daftar CosmosHub yang dikonfigurasi.');
    if (requireKey && !apiKey) throw new Error('Masukkan API key CosmosHub terlebih dahulu.');
    return { provider: 'cosmoshub', protocol, endpoint, apiKey, model, accuracyMode, pagesPerRequest, concurrency };
  }

  function saveNonSecretConfig() {
    try {
      const cfg = {
        model: $('aiModel')?.value || 'claude-sonnet-4.5',
        accuracyMode: $('aiAccuracyMode')?.value || DEFAULT_ACCURACY_MODE,
        pagesPerRequest: $('aiPagesPerRequest')?.value || '4',
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
      if ($('aiAccuracyMode') && IMAGE_PROFILES[cfg.accuracyMode]) $('aiAccuracyMode').value = cfg.accuracyMode;
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

  function estimateCornerBrightness(data, width, height) {
    const points = [
      [2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3],
      [Math.floor(width / 2), 2], [Math.floor(width / 2), height - 3]
    ];
    let total = 0;
    let count = 0;
    points.forEach(([x, y]) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const offset = (y * width + x) * 4;
      total += data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
      count++;
    });
    return count ? total / count : 255;
  }

  function findContentBounds(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data;
    const background = estimateCornerBrightness(pixels, width, height);
    const inkThreshold = Math.max(150, Math.min(244, background - 12));
    const step = Math.max(2, Math.floor(Math.max(width, height) / 900));
    const rowCount = Math.ceil(height / step);
    const colCount = Math.ceil(width / step);
    const rows = new Uint32Array(rowCount);
    const cols = new Uint32Array(colCount);

    for (let sy = 0, y = 0; y < height; y += step, sy++) {
      for (let sx = 0, x = 0; x < width; x += step, sx++) {
        const offset = (y * width + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (luminance < inkThreshold || (spread > 55 && luminance < 235)) {
          rows[sy]++;
          cols[sx]++;
        }
      }
    }

    const minRowInk = Math.max(2, Math.floor(colCount * 0.002));
    const minColInk = Math.max(2, Math.floor(rowCount * 0.002));
    let top = 0;
    let bottom = rowCount - 1;
    let left = 0;
    let right = colCount - 1;

    while (top < bottom && rows[top] < minRowInk) top++;
    while (bottom > top && rows[bottom] < minRowInk) bottom--;
    while (left < right && cols[left] < minColInk) left++;
    while (right > left && cols[right] < minColInk) right--;

    let x = left * step;
    let y = top * step;
    let w = Math.min(width, (right - left + 1) * step);
    let h = Math.min(height, (bottom - top + 1) * step);

    if (w < width * 0.18 || h < height * 0.18) return { x: 0, y: 0, w: width, h: height };

    const marginX = Math.round(w * 0.035);
    const marginY = Math.round(h * 0.045);
    x = Math.max(0, x - marginX);
    y = Math.max(0, y - marginY);
    w = Math.min(width - x, w + marginX * 2);
    h = Math.min(height - y, h + marginY * 2);
    return { x, y, w, h };
  }

  function findPrimaryTextBounds(context, width, height, fallback) {
    const pixels = context.getImageData(0, 0, width, height).data;
    const background = estimateCornerBrightness(pixels, width, height);
    const inkThreshold = Math.max(145, Math.min(242, background - 14));
    const step = Math.max(2, Math.floor(Math.max(width, height) / 900));

    // Detail audit intentionally focuses on the central recipient block. The first
    // pass still receives the complete page, so headers or reference numbers remain available.
    let y = Math.max(0, Math.round(fallback.y + fallback.h * 0.12));
    let h = Math.min(height - y, Math.round(fallback.h * 0.72));
    const colCount = Math.ceil(width / step);
    const cols = new Uint32Array(colCount);

    for (let yy = y; yy < y + h; yy += step) {
      for (let sx = 0, x = 0; x < width; x += step, sx++) {
        const offset = (yy * width + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (luminance < inkThreshold || (spread > 55 && luminance < 235)) cols[sx]++;
      }
    }

    const sampledRows = Math.max(1, Math.ceil(h / step));
    const colThreshold = Math.max(3, Math.floor(sampledRows * 0.004));
    let left = 0;
    let right = colCount - 1;
    while (left < right && cols[left] < colThreshold) left++;
    while (right > left && cols[right] < colThreshold) right--;

    let x = left * step;
    let w = Math.min(width - x, (right - left + 1) * step);
    if (w < width * 0.14) return fallback;

    const marginX = Math.round(w * 0.08);
    const marginY = Math.round(h * 0.08);
    x = Math.max(0, x - marginX);
    y = Math.max(0, y - marginY);
    w = Math.min(width - x, w + marginX * 2);
    h = Math.min(height - y, h + marginY * 2);

    const detail = { x, y, w, h };
    const fallbackArea = fallback.w * fallback.h;
    const detailArea = detail.w * detail.h;
    return detailArea < fallbackArea * 0.92 ? detail : fallback;
  }

  function enhanceForReading(context, width, height) {
    const image = context.getImageData(0, 0, width, height);
    const data = image.data;
    const contrast = 38;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
      const luminance = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const value = Math.max(0, Math.min(255, factor * (luminance - 128) + 136));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function encodeEnhancedCrop(sourceCanvas, bounds, maxSide, jpegQuality) {
    const outputScale = Math.min(1, maxSide / Math.max(bounds.w, bounds.h));
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = Math.max(1, Math.round(bounds.w * outputScale));
    outputCanvas.height = Math.max(1, Math.round(bounds.h * outputScale));
    const outputContext = outputCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.drawImage(
      sourceCanvas,
      bounds.x, bounds.y, bounds.w, bounds.h,
      0, 0, outputCanvas.width, outputCanvas.height
    );
    enhanceForReading(outputContext, outputCanvas.width, outputCanvas.height);
    const url = outputCanvas.toDataURL('image/jpeg', jpegQuality);
    outputCanvas.width = outputCanvas.height = 1;
    return url;
  }

  async function renderPageToImage(page, accuracyMode = DEFAULT_ACCURACY_MODE) {
    const profile = IMAGE_PROFILES[accuracyMode] || IMAGE_PROFILES[DEFAULT_ACCURACY_MODE];
    const viewportBase = page.getViewport({ scale: 1 });
    const initialTarget = Math.min(profile.maxSide * 1.15, 3200);
    const scale = Math.min(4, Math.max(1.5, initialTarget / Math.max(viewportBase.width, viewportBase.height)));
    const viewport = page.getViewport({ scale });
    const sourceCanvas = document.createElement('canvas');
    const sourceContext = sourceCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    sourceCanvas.width = Math.ceil(viewport.width);
    sourceCanvas.height = Math.ceil(viewport.height);
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    await page.render({ canvasContext: sourceContext, viewport }).promise;

    const fullBounds = findContentBounds(sourceContext, sourceCanvas.width, sourceCanvas.height);
    const detailBounds = profile.verify === 'none'
      ? fullBounds
      : findPrimaryTextBounds(sourceContext, sourceCanvas.width, sourceCanvas.height, fullBounds);

    const fullUrl = encodeEnhancedCrop(sourceCanvas, fullBounds, profile.maxSide, profile.jpegQuality);
    const detailUrl = (
      detailBounds.x !== fullBounds.x || detailBounds.y !== fullBounds.y ||
      detailBounds.w !== fullBounds.w || detailBounds.h !== fullBounds.h
    )
      ? encodeEnhancedCrop(sourceCanvas, detailBounds, profile.maxSide, profile.jpegQuality)
      : fullUrl;

    sourceCanvas.width = sourceCanvas.height = 1;
    return { fullUrl, detailUrl };
  }

  function buildPrompt(startPage, endPage) {
    return `Tolong ubah dokumen ini menjadi data terstruktur untuk Excel.
Kolom: No, Nama Penerima, Alamat Penerima, Nomor Surat.
Urutan data mengikuti urutan halaman dokumen.
Tandai nomor urut yang alamatnya jelas berada di luar Kota Batam.
Jangan menebak tulisan yang tidak terbaca; beri keterangan literal "PERLU DICEK" tepat pada bagian yang meragukan.

Sebelum menghasilkan jawaban, periksa kembali ejaan nama dan alamat terhadap gambar sebanyak dua kali. Jangan tampilkan proses pemeriksaan tersebut.

Kembalikan HANYA JSON valid tanpa markdown dan tanpa penjelasan:
{"rows":[{"no":1,"page":${startPage},"nama_penerima":"...","alamat_penerima":"...","nomor_surat":"","di_luar_batam":false,"perlu_dicek_fields":[],"confidence":0.95}]}

ATURAN PEMISAHAN KOLOM:
1. Setiap gambar diberi label HALAMAN. Gunakan nomor halaman itu; jangan menukar atau menggabungkan isi antarhalaman.
2. Hapus salam pembuka dari nama: "KEPADA YTH", "KEPADA YANG TERHORMAT", "YTH.", "ATTN", dan variasinya. Nama penerima hanya nama orang/perusahaan setelah salam tersebut.
3. Jangan memasukkan alamat ke kolom nama. Baris yang mulai dengan JL/JALAN, RUKO, PERUM/PERUMAHAN, KOMP/KOMPLEK, KAVLING, GEDUNG, BLOK, KAMPUNG, atau nama wilayah adalah alamat.
4. Abaikan header administrasi seperti "CABANG", "CARRIAGE", "245 BATAM", kode cabang, serta footer seperti "TGL TRANS", "TGL VALUTA", "NO DOKUMEN", dan "URAIAN MUTASI". Itu bukan nama, alamat, atau nomor surat.
5. "Nomor Surat" hanya diisi jika ada label atau pola nomor surat/referensi yang nyata pada isi dokumen. "245 BATAM", CABANG, CARRIAGE, nomor halaman, nomor rekening, atau kode pengiriman bukan nomor surat. Jika tidak ada nomor surat, gunakan string kosong.
6. Deretan nol/placeholder seperti "000000" yang berdiri sendiri tidak perlu dimasukkan ke alamat. Jangan mengubah deretan nol menjadi kata.
7. Jangan memperbaiki ejaan dengan tebakan. Jika satu kata tidak yakin, pertahankan bagian yang terbaca dan ganti hanya kata meragukan dengan "PERLU DICEK".
8. Jika satu halaman memuat lebih dari satu penerima, keluarkan semuanya sesuai urutan tampil. Jika tidak ada penerima, jangan membuat baris palsu.
9. di_luar_batam=true hanya jika alamat jelas berada di luar Kota Batam. Jika ragu, false dan tambahkan "PERLU DICEK" pada alamat.
10. confidence adalah keyakinan 0 sampai 1 terhadap ketepatan keseluruhan baris. Untuk scan buram/dot-matrix, jangan memberi nilai di atas 0.90. Isi perlu_dicek_fields dengan nama field yang meragukan, misalnya ["alamat_penerima"].
11. Pertahankan kapitalisasi secara wajar; jangan menambahkan informasi yang tidak terlihat.
12. Halaman yang diproses: ${startPage} sampai ${endPage}.`;
  }

  function buildVerificationPrompt(startPage, endPage, draftRows) {
    return `Audit ulang hasil ekstraksi berikut terhadap gambar asli halaman ${startPage}–${endPage}.
Tujuan audit adalah mengoreksi salah baca OCR tanpa menebak.

DRAFT:
${JSON.stringify({ rows: draftRows })}

Kembalikan HANYA JSON valid dengan struktur yang sama:
{"rows":[{"no":1,"page":${startPage},"nama_penerima":"...","alamat_penerima":"...","nomor_surat":"","di_luar_batam":false,"perlu_dicek_fields":[],"confidence":0.95}]}

Aturan audit:
- Hapus "KEPADA YTH/YTH/ATTN" dari nama.
- Jangan campur alamat ke nama.
- Abaikan CABANG/CARRIAGE/245 BATAM dan footer transaksi.
- Jangan gunakan "245 BATAM" sebagai nomor surat.
- Hapus placeholder nol yang berdiri sendiri.
- Cocokkan setiap kata dengan gambar. Jika tidak benar-benar terbaca, gunakan "PERLU DICEK", jangan menciptakan kata yang terdengar masuk akal.
- Pastikan urutan dan nomor halaman benar.
- Scan buram/dot-matrix harus diberi confidence realistis, maksimal 0.90.
- Jangan tampilkan penjelasan atau reasoning.`;
  }

  function buildApiBody(config, prompt, images, maxTokens = 7000) {
    const content = [{ type: 'text', text: prompt }];
    images.forEach((image, index) => {
      const page = Number(image?.page || image?.pageNumber || index + 1);
      const url = typeof image === 'string' ? image : image?.url || image?.dataUrl;
      content.push({ type: 'text', text: `HALAMAN ${page}` });
      content.push({ type: 'image_url', image_url: { url } });
    });

    return {
      model: config.model,
      stream: false,
      temperature: 0,
      top_p: 0.1,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: 'Anda adalah operator entri data yang sangat teliti. Utamakan kesetiaan pada gambar, pemisahan kolom yang benar, dan tandai ketidakpastian; jangan berhalusinasi.'
        },
        { role: 'user', content }
      ]
    };
  }

  function conciseResponseError(text, status, transport) {
    const raw = String(text || '').trim();
    const title = raw.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    if (title) return `${title} (HTTP ${status}, ${transport})`;
    if (raw.startsWith('<!DOCTYPE') || raw.startsWith('<html')) {
      return `Server ${transport} mengembalikan halaman HTML, bukan respons API (HTTP ${status}).`;
    }
    return raw.slice(0, 700) || `HTTP ${status}`;
  }

  async function parseApiResponse(response, transport) {
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = { error: { message: conciseResponseError(text, response.status, transport) } };
    }

    if (!response.ok) {
      let message = payload?.error?.message || payload?.message || `API gagal dengan HTTP ${response.status}`;
      if (response.status === 401 || response.status === 403) message = `API key CosmosHub ditolak (${response.status}). Periksa kembali key dan saldo akun.`;
      else if (response.status === 404) message = 'Endpoint atau model CosmosHub tidak ditemukan. Pastikan model yang dipilih masih tersedia.';
      else if (response.status === 429) message = 'CosmosHub membatasi terlalu banyak permintaan. Turunkan Permintaan paralel menjadi 1–2 lalu coba lagi.';
      else if (response.status === 413) message = 'Kelompok halaman terlalu besar. Turunkan Halaman per permintaan menjadi 2–4.';
      const error = new Error(message);
      error.status = response.status;
      error.details = payload;
      error.transport = transport;
      error.gateway = response.status >= 500 && /bad gateway|server .*html|halaman html|upstream/i.test(message);
      throw error;
    }

    if (payload && typeof payload === 'object') payload._mileTransport = transport;
    lastSuccessfulTransport = transport;
    return payload;
  }

  async function callViaProxy(config, body) {
    const controller = new AbortController();
    activeControllers.add(controller);
    try {
      const response = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ apiKey: config.apiKey, body })
      });
      return await parseApiResponse(response, 'proxy Cloudflare');
    } catch (error) {
      if (!error.transport) error.transport = 'proxy Cloudflare';
      throw error;
    } finally {
      activeControllers.delete(controller);
    }
  }

  async function callDirect(config, body) {
    const controller = new AbortController();
    activeControllers.add(controller);
    try {
      const response = await fetch(COSMOS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      return await parseApiResponse(response, 'langsung ke CosmosHub');
    } catch (error) {
      if (!error.transport) error.transport = 'langsung ke CosmosHub';
      if (!error.status && error?.name !== 'AbortError') {
        error.message = `Browser tidak dapat menghubungi CosmosHub secara langsung. Kemungkinan diblokir CORS atau jaringan: ${error.message}`;
      }
      throw error;
    } finally {
      activeControllers.delete(controller);
    }
  }

  async function callCosmos(config, body) {
    const first = preferredTransport === 'direct' ? callDirect : callViaProxy;
    const second = preferredTransport === 'direct' ? callViaProxy : callDirect;
    let firstError;

    try {
      return await first(config, body);
    } catch (error) {
      firstError = error;
      if (cancelled || error?.name === 'AbortError') throw error;

      const shouldFallback = !error?.status || error?.gateway || [500, 502, 503, 504].includes(Number(error?.status));
      if (!shouldFallback) throw error;
    }

    try {
      const payload = await second(config, body);
      preferredTransport = preferredTransport === 'direct' ? 'proxy' : 'direct';
      return payload;
    } catch (secondError) {
      const error = new Error(
        `Dua jalur koneksi gagal. ${firstError.transport || 'Jalur pertama'}: ${firstError.message} | ` +
        `${secondError.transport || 'Jalur kedua'}: ${secondError.message}`
      );
      error.status = secondError.status || firstError.status;
      error.details = { first: firstError.details, second: secondError.details };
      throw error;
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
        const payload = await callCosmos(config, body);
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

  function stripCommonArtifacts(value) {
    return String(value ?? '')
      .replace(/\u0000/g, ' ')
      .replace(/\b(?:CABANG|CARRIAGE)\s*:?\s*245\s+BATAM\b/gi, ' ')
      .replace(/\b(?:TGL\.?\s*TRANS|TGL\.?\s*VALUTA|NO\.?\s*DOKUMEN|URAIAN\s+MUTASI)\b.*$/gi, ' ')
      .replace(/\b[0O]{5,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripRecipientPrefix(value) {
    return String(value ?? '')
      .replace(/^\s*(?:KEPADA\s+(?:YANG\s+TERHORMAT|YTH\.?)|YTH\.?|ATTN\.?)\s*[:.,\-]?\s*/i, '')
      .trim();
  }

  function normalizeAIText(value, kind = 'text') {
    let raw = stripCommonArtifacts(value);
    if (!raw) return '';
    const core = window.__mileCore;
    if (kind === 'name') raw = stripRecipientPrefix(raw);
    if (kind === 'reference') {
      if (/^(?:245\s+BATAM|CABANG|CARRIAGE)$/i.test(raw)) return '';
      if (core?.cleanReference) return core.cleanReference(raw);
    }
    if (core?.cleanArtifacts) return core.cleanArtifacts(raw);
    return raw.toUpperCase();
  }

  function splitMixedNameAddress(name, address) {
    const pattern = /\b(?:JL\.?|JALAN|RUKO|PERUM(?:AHAN)?|KOMP(?:LEK)?|KAVLING|GEDUNG|PASIR\s+PUTIH\s+RESIDENCE)\b/i;
    const match = pattern.exec(name);
    if (!match || match.index < 5) return { name, address };
    const moved = name.slice(match.index).trim();
    const cleanName = name.slice(0, match.index).trim();
    return {
      name: cleanName,
      address: [moved, address].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    };
  }

  function normalizeReviewFields(value) {
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
    return [];
  }

  function clampConfidence(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0.75;
    return Math.max(0, Math.min(1, number));
  }

  function containsReviewMarker(value) {
    return /\bPERLU\s*(?:DI\s*)?CEK\b/i.test(String(value || ''));
  }

  function looksSuspiciousRow(row) {
    if (!row.name || !row.address) return true;
    if (row.aiConfidence < 0.92) return true;
    if (row.aiReviewFields.length) return true;
    if (containsReviewMarker(`${row.name} ${row.address} ${row.noSurat}`)) return true;
    if (/^\s*(?:KEPADA|YTH|ATTN)\b/i.test(row.name)) return true;
    if (row.name.length > 72) return true;
    if (/\b(?:JL\.?|JALAN|RUKO|PERUM(?:AHAN)?|KOMP(?:LEK)?|KAVLING|GEDUNG)\b/i.test(row.name)) return true;
    if (/\b(?:CABANG|CARRIAGE|TGL\s*TRANS|TGL\s*VALUTA|NO\s*DOKUMEN|URAIAN\s+MUTASI)\b/i.test(`${row.name} ${row.address} ${row.noSurat}`)) return true;
    return false;
  }

  function normalizeRows(aiRows, template, pageOffset = 0) {
    const core = window.__mileCore;
    return aiRows.map((item, index) => {
      let name = normalizeAIText(pick(item, ['nama_penerima', 'nama', 'name', 'penerima']), 'name');
      let address = normalizeAIText(pick(item, ['alamat_penerima', 'alamat', 'address', 'destination_address']));
      let noSurat = normalizeAIText(pick(item, ['nomor_surat', 'no_surat', 'surat', 'ref', 'reference']), 'reference');
      const split = splitMixedNameAddress(name, address);
      name = split.name;
      address = split.address;
      noSurat = /^(?:245\s+BATAM|CABANG|CARRIAGE)$/i.test(noSurat) ? '' : noSurat;

      const page = Number(pick(item, ['page', 'halaman', 'page_number'], pageOffset + index + 1)) || pageOffset + index + 1;
      const outsideBatam = normalizeBoolean(pick(item, ['di_luar_batam', 'luar_batam', 'outside_batam'], false));
      const aiReviewFields = normalizeReviewFields(pick(item, ['perlu_dicek_fields', 'review_fields', 'uncertain_fields'], []));
      const aiConfidence = clampConfidence(pick(item, ['confidence', 'keyakinan', 'score'], 0.75));
      const zip = core?.getZipCodeFromAddress ? core.getZipCodeFromAddress(address, template) : '29411';
      const row = {
        senderName: '', noSurat, name, phone: '0', zip, address,
        act: 0.2, p: 10, l: 10, t: 10, cw: '0.20',
        outsideBatam, sourcePage: page, aiConfidence, aiReviewFields
      };
      row.needsVerification = looksSuspiciousRow(row);
      return row;
    }).filter(row => row.name || row.address || row.noSurat);
  }

  function rowsForVerification(rows) {
    return rows.map((row, index) => ({
      no: index + 1,
      page: row.sourcePage,
      nama_penerima: row.name,
      alamat_penerima: row.address,
      nomor_surat: row.noSurat,
      di_luar_batam: row.outsideBatam,
      perlu_dicek_fields: row.aiReviewFields,
      confidence: row.aiConfidence
    }));
  }

  function shouldVerifyChunk(config, rows) {
    const profile = IMAGE_PROFILES[config.accuracyMode] || IMAGE_PROFILES[DEFAULT_ACCURACY_MODE];
    if (profile.verify === 'all') return true;
    if (profile.verify === 'none') return false;
    if (!rows.length) return true;
    const averageConfidence = rows.reduce((sum, row) => sum + Number(row.aiConfidence || 0), 0) / rows.length;
    return averageConfidence < 0.93 || rows.some(row => row.needsVerification);
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
      const payload = await callCosmos(config, body);
      const text = extractTextFromResponse(payload, 'openai').trim().slice(0, 120);
      const usage = getUsage(payload, 'openai');
      const usageText = usage.input || usage.output ? ` · ${formatUsage(usage)}` : '';
      const transportText = payload?._mileTransport ? ` melalui ${payload._mileTransport}` : '';
      setFeedback(`Koneksi CosmosHub berhasil${transportText}. Respons: ${text || 'OK'}${usageText}`, 'success');
      showToast(`Koneksi CosmosHub berhasil${payload?._mileTransport ? ` melalui ${payload._mileTransport}` : ''}.`, 'success');
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
        updateParallelProgress(chunk, 'Menyiapkan gambar');
        const images = [];
        for (let pageNumber = chunk.start; pageNumber <= chunk.end; pageNumber++) {
          if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
          const page = await pdf.getPage(pageNumber);
          try {
            const rendered = await renderPageToImage(page, config.accuracyMode);
            images.push({
              page: pageNumber,
              url: rendered.fullUrl,
              detailUrl: rendered.detailUrl
            });
          } finally {
            page.cleanup();
          }
        }

        updateParallelProgress(chunk, 'Ekstraksi pertama');
        const body = buildApiBody(
          config,
          buildPrompt(chunk.start, chunk.end),
          images,
          Math.max(3200, (chunk.end - chunk.start + 1) * 1150)
        );
        const payload = await callProxyWithRetry(config, body, `halaman ${chunk.start}–${chunk.end}`);
        let usage = getUsage(payload, config.protocol);
        totalUsage.input += Number(usage.input || 0);
        totalUsage.output += Number(usage.output || 0);
        const template = $('corporateTemplate')?.value || 'MANUAL';
        let normalized = normalizeRows(parseRows(payload, config.protocol), template, chunk.start - 1);

        if (shouldVerifyChunk(config, normalized)) {
          updateParallelProgress(chunk, 'Verifikasi akurasi');
          const verificationBody = buildApiBody(
            config,
            buildVerificationPrompt(chunk.start, chunk.end, rowsForVerification(normalized)),
            images.map(image => ({
              page: image.page,
              url: image.detailUrl || image.url
            })),
            Math.max(3200, (chunk.end - chunk.start + 1) * 1150)
          );
          const verifiedPayload = await callProxyWithRetry(config, verificationBody, `verifikasi halaman ${chunk.start}–${chunk.end}`);
          usage = getUsage(verifiedPayload, config.protocol);
          totalUsage.input += Number(usage.input || 0);
          totalUsage.output += Number(usage.output || 0);
          normalized = normalizeRows(parseRows(verifiedPayload, config.protocol), template, chunk.start - 1);
        }

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
    ['aiModel', 'aiAccuracyMode', 'aiPagesPerRequest', 'aiConcurrency'].forEach(id => {
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
    _test: { normalizeEndpoint, findBalancedJson, parseRows, normalizeRows, buildApiBody, buildPrompt, buildVerificationPrompt, stripRecipientPrefix, stripCommonArtifacts, splitMixedNameAddress, shouldVerifyChunk }
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
