/* mile.posnew.com beta AI PDF runtime — bounded render pool + temporary R2 URLs */
(() => {
  'use strict';

  const MAX_PDF_BYTES = 80 * 1024 * 1024;
  const MAX_PAGES = 300;
  const IMAGE_PROFILES = {
    auto: { maxSide: 2400, jpegQuality: 0.90, verify: 'smart' },
    fast: { maxSide: 1900, jpegQuality: 0.84, verify: 'none' },
    balanced: { maxSide: 2400, jpegQuality: 0.90, verify: 'smart' },
    accurate: { maxSide: 2800, jpegQuality: 0.93, verify: 'all' }
  };
  const SPEED_PRESETS = {
    medium: { pagesPerRequest: 5, concurrency: 2, verification: 'all', label: 'Sedang' },
    fast: { pagesPerRequest: 15, concurrency: 4, verification: 'smart', label: 'Cepat stabil' },
    custom: { verification: 'smart', label: 'Kustom' }
  };
  const DEFAULT_ACCURACY_MODE = 'auto';
  const DEFAULT_SPEED_PRESET = 'fast';
  const DEFAULT_NETWORK_MODE = 'normal';
  const FIRST_PASS_MAX_SIDE = 1600;
  const AUDIT_MAX_SIDE = 2600;
  const FIRST_PASS_JPEG_QUALITY = 0.79;
  const AUDIT_JPEG_QUALITY = 0.91;
  const MAX_JSON_REPAIR_CHARS = 48000;
  const SMART_CONFIDENCE_THRESHOLD = 0.82;
  const MAX_RETRIES = 3;
  const REQUEST_TIMEOUT_MS = 6 * 60 * 1000;
  const UPLOAD_STALL_TIMEOUT_MS = 45 * 1000;
  const HEALTH_TIMEOUT_MS = 15 * 1000;
  const STORAGE_KEY = 'mile-ai-config-beta-r2-v3';
  const BETA_UPLOAD_TIMEOUT_MS = 15 * 1000;
  const BETA_PREPARE_CONCURRENCY = 2;
  const COSMOS_BASE_URL = 'https://api.cosmoshub.tech/v1';
  const COSMOS_ENDPOINT = `${COSMOS_BASE_URL}/chat/completions`;
  const COSMOS_MODELS = new Set([
    'claude-opus-5','claude-sonnet-4.5','claude-haiku-4.5',
    'gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.1-pro',
    'qwen-3.7-plus','qwen-3.7-flash'
  ]);
  const DEFAULT_MODEL = 'gemini-3.7-flash';
  const GEMINI_38_MODEL = 'gemini-3.8-flash';
  const AUTO_FALLBACK_MODEL = 'qwen-3.7-flash';
  const activeControllers = new Set();
  let cancelled = false;
  let runtimeFallbackModel = '';
  let fallbackAnnounced = false;
  let lastSuccessfulTransport = '';
  let stopwatchInterval = 0;
  let stopwatchStartedAt = 0;
  let progressHeartbeatInterval = 0;
  let progressHideTimeout = 0;
  let progressActivityAt = 0;
  let progressWaitingSince = 0;
  let progressActivityLabel = 'Menyiapkan proses';
  let lastHealthLatencyMs = 0;
  let lastHealthCheckedAt = 0;
  let lastHealthConfigured = false;
  let lastBetaImagesConfigured = false;
  let betaRemoteImagesAvailable = false;
  let betaRemoteFallbackAnnounced = false;

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

  function getConfig() {
    const protocol = 'openai';
    const model = String($('aiModel')?.value || DEFAULT_MODEL).trim();
    const accuracyMode = IMAGE_PROFILES[$('aiAccuracyMode')?.value] ? $('aiAccuracyMode').value : DEFAULT_ACCURACY_MODE;
    const speedPreset = SPEED_PRESETS[$('aiSpeedPreset')?.value] ? $('aiSpeedPreset').value : DEFAULT_SPEED_PRESET;
    const requestedPagesPerRequest = Math.max(1, Math.min(15, Number($('aiPagesPerRequest')?.value || SPEED_PRESETS[DEFAULT_SPEED_PRESET].pagesPerRequest)));
    const requestedConcurrency = Math.max(1, Math.min(4, Number($('aiConcurrency')?.value || SPEED_PRESETS[DEFAULT_SPEED_PRESET].concurrency)));
    const networkMode = ['auto', 'unstable', 'normal'].includes($('aiNetworkMode')?.value) ? $('aiNetworkMode').value : DEFAULT_NETWORK_MODE;
    const networkProfile = resolveNetworkProfile(networkMode);
    const pagesPerRequest = Math.min(requestedPagesPerRequest, networkProfile.maxPagesPerRequest);
    const concurrency = Math.min(requestedConcurrency, networkProfile.maxConcurrency);
    const verificationPolicy = SPEED_PRESETS[speedPreset]?.verification || 'smart';
    if (!COSMOS_MODELS.has(model)) throw new Error('Model tidak tersedia pada daftar model vision CosmosHub yang diizinkan.');
    return {
      provider: 'cosmoshub', protocol, model, accuracyMode, speedPreset, verificationPolicy,
      pagesPerRequest, concurrency, requestedPagesPerRequest, requestedConcurrency,
      networkMode, networkProfile
    };
  }

  function connectionSignals() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const browserOnline = navigator.onLine !== false;
    return {
      // navigator.onLine hanya mencerminkan indikator jaringan browser/OS. Pada
      // beberapa PC lama dengan LAN nilainya dapat false meski server terjangkau.
      online: browserOnline || lastHealthConfigured,
      browserOnline,
      available: Boolean(connection),
      saveData: Boolean(connection?.saveData),
      effectiveType: String(connection?.effectiveType || '').toLowerCase(),
      downlink: Number(connection?.downlink || 0),
      rtt: Number(connection?.rtt || 0)
    };
  }

  function resolveNetworkProfile(mode = DEFAULT_NETWORK_MODE) {
    const signals = connectionSignals();
    const profiles = {
      unstable: {
        key: 'unstable', label: 'Hemat data', maxPagesPerRequest: 4, maxConcurrency: 1,
        maxImageSide: 1850, jpegQuality: 0.80
      },
      balanced: {
        key: 'balanced', label: 'Adaptif aman', maxPagesPerRequest: 6, maxConcurrency: 2,
        maxImageSide: 2150, jpegQuality: 0.85
      },
      normal: {
        key: 'normal', label: 'Normal stabil', maxPagesPerRequest: 15, maxConcurrency: 4,
        maxImageSide: Infinity, jpegQuality: 1
      }
    };

    if (mode === 'unstable') return profiles.unstable;
    if (mode === 'normal') return profiles.normal;

    const clearlySlow = signals.saveData ||
      ['slow-2g', '2g', '3g'].includes(signals.effectiveType) ||
      (signals.downlink > 0 && signals.downlink < 2) ||
      signals.rtt >= 650 ||
      lastHealthLatencyMs >= 1400;
    if (clearlySlow) return profiles.unstable;

    const clearlyFast = signals.available &&
      ['4g', '5g'].includes(signals.effectiveType) &&
      (!signals.downlink || signals.downlink >= 5) &&
      (!signals.rtt || signals.rtt < 350) &&
      (!lastHealthLatencyMs || lastHealthLatencyMs < 700);
    if (clearlyFast) return profiles.normal;

    // Firefox desktop belum menyediakan Network Information API. Dalam kondisi
    // itu Auto memilih profil paling aman; pengguna berkoneksi cepat tetap dapat
    // memilih "Internet stabil" untuk membuka batas 15 halaman × 4 jalur.
    if (!signals.available) return profiles.unstable;
    return profiles.balanced;
  }

  function saveNonSecretConfig() {
    try {
      const cfg = {
        accuracyMode: $('aiAccuracyMode')?.value || DEFAULT_ACCURACY_MODE,
        networkMode: $('aiNetworkMode')?.value || DEFAULT_NETWORK_MODE,
        speedPreset: $('aiSpeedPreset')?.value || DEFAULT_SPEED_PRESET,
        pagesPerRequest: $('aiPagesPerRequest')?.value || String(SPEED_PRESETS[DEFAULT_SPEED_PRESET].pagesPerRequest),
        concurrency: $('aiConcurrency')?.value || String(SPEED_PRESETS[DEFAULT_SPEED_PRESET].concurrency)
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
    refreshConfigStatus();
  }

  function loadNonSecretConfig() {
    // Model selalu kembali ke default stabil Gemini 3.7 Flash saat halaman dimuat.
    // Pengguna tetap dapat mengganti model selama sesi berjalan.
    if ($('aiModel')) $('aiModel').value = DEFAULT_MODEL;
    try {
      // Hapus konfigurasi lama agar mode Auto/Hemat data tidak terbawa sebagai default.
      ['mile-ai-config-v11','mile-ai-config-v12','mile-ai-config-v13','mile-ai-config-v14','mile-ai-config-v15','mile-ai-config-v16','mile-ai-config-v16-4','mile-ai-config-v16-5','mile-ai-config-v16-6','mile-ai-config-v16-9','mile-ai-config-v16-10','mile-ai-config-v16-11','mile-ai-config-v16-12','mile-ai-config-v16-13','mile-ai-config-v16-14','mile-ai-config-v16-15','mile-ai-config-v16-16'].forEach(key => sessionStorage.removeItem(key));
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        if ($('aiAccuracyMode')) $('aiAccuracyMode').value = DEFAULT_ACCURACY_MODE;
        if ($('aiNetworkMode')) $('aiNetworkMode').value = DEFAULT_NETWORK_MODE;
        if ($('aiSpeedPreset')) $('aiSpeedPreset').value = DEFAULT_SPEED_PRESET;
        applySpeedPreset(DEFAULT_SPEED_PRESET, false);
        return;
      }
      const cfg = JSON.parse(raw);
      if ($('aiAccuracyMode') && IMAGE_PROFILES[cfg.accuracyMode]) $('aiAccuracyMode').value = cfg.accuracyMode;
      if ($('aiNetworkMode') && ['auto', 'unstable', 'normal'].includes(cfg.networkMode)) $('aiNetworkMode').value = cfg.networkMode;
      if ($('aiSpeedPreset') && SPEED_PRESETS[cfg.speedPreset]) $('aiSpeedPreset').value = cfg.speedPreset;
      if ($('aiPagesPerRequest') && cfg.pagesPerRequest) $('aiPagesPerRequest').value = String(cfg.pagesPerRequest);
      if ($('aiConcurrency') && cfg.concurrency) $('aiConcurrency').value = String(cfg.concurrency);
    } catch (_) {}
  }

  function applySpeedPreset(presetName, persist = true) {
    const preset = SPEED_PRESETS[presetName];
    if (!preset || presetName === 'custom') return;
    if ($('aiPagesPerRequest')) $('aiPagesPerRequest').value = String(preset.pagesPerRequest);
    if ($('aiConcurrency')) $('aiConcurrency').value = String(preset.concurrency);
    if ($('aiSpeedPreset')) $('aiSpeedPreset').value = presetName;
    updateSpeedPresetHint();
    if (persist) saveNonSecretConfig();
  }

  function updateSpeedPresetHint() {
    const hint = $('aiSpeedPresetHint');
    if (!hint) return;
    const presetName = $('aiSpeedPreset')?.value || DEFAULT_SPEED_PRESET;
    const descriptions = {
      medium: '5 halaman × 2 jalur, audit kedua untuk semua kelompok. Paling aman untuk scan sulit.',
      fast: 'Mode ringan stabil: hingga dua halaman disiapkan bersamaan, lalu AI bekerja pada 15 halaman × maksimal 4 jalur. Audit kedua hanya jika hasil meragukan.',
      custom: 'Nilai halaman dan paralel diatur manual. Audit kedua dijalankan secara adaptif.'
    };
    hint.textContent = descriptions[presetName] || descriptions.custom;
  }

  function updateNetworkModeHint() {
    const hint = $('aiNetworkModeHint');
    if (!hint) return;
    const mode = $('aiNetworkMode')?.value || DEFAULT_NETWORK_MODE;
    const profile = resolveNetworkProfile(mode);
    const signals = connectionSignals();
    const connectionNote = signals.online ? '' : ' Status LAN belum dapat dipastikan; aplikasi tetap akan mencoba server.';
    const descriptions = {
      auto: `Profil aktif: ${profile.label}, maksimal ${profile.maxPagesPerRequest} halaman × ${profile.maxConcurrency} jalur. Pilih mode ini hanya bila ingin sistem membatasi proses berdasarkan kualitas koneksi.`,
      unstable: 'Hemat data aktif: maksimal 4 halaman × 1 jalur, gambar diperkecil, dan retry otomatis diprioritaskan.',
      normal: 'Mode ringan aktif: maksimal dua halaman disiapkan bersamaan dan AI bekerja pada maksimal 15 halaman × 4 jalur melalui gambar sementara.'
    };
    hint.textContent = `${descriptions[mode] || descriptions.auto}${connectionNote}`;
  }

  function markSpeedPresetCustom() {
    const pages = Number($('aiPagesPerRequest')?.value || 0);
    const concurrency = Number($('aiConcurrency')?.value || 0);
    const exact = Object.entries(SPEED_PRESETS).find(([name, preset]) =>
      name !== 'custom' && preset.pagesPerRequest === pages && preset.concurrency === concurrency
    );
    if ($('aiSpeedPreset')) $('aiSpeedPreset').value = exact?.[0] || 'custom';
    updateSpeedPresetHint();
    saveNonSecretConfig();
  }

  function refreshConfigStatus() {
    const status = $('aiConfigStatus');
    if (!status || status.dataset.healthChecked === 'true') return;
    status.classList.remove('is-ready');
    status.textContent = 'Memeriksa layanan…';
  }

  async function checkServerConfiguration({ showFeedback = false } = {}) {
    const status = $('aiConfigStatus');
    if (lastHealthConfigured && Date.now() - lastHealthCheckedAt < 60 * 1000) {
      updateNetworkModeHint();
      return true;
    }
    const controller = new AbortController();
    const startedAt = performance.now();
    let healthTimedOut = false;
    const timeout = window.setTimeout(() => {
      healthTimedOut = true;
      controller.abort();
    }, HEALTH_TIMEOUT_MS);
    activeControllers.add(controller);
    try {
      const response = await fetch('/api/health', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      });
      lastHealthLatencyMs = Math.max(1, performance.now() - startedAt);
      const data = await response.json();
      const configured = Boolean(response.ok && data?.cosmosConfigured && data?.firebaseConfigured && data?.sessionConfigured && data?.serverSideGate);
      lastHealthCheckedAt = Date.now();
      lastHealthConfigured = configured;
      lastBetaImagesConfigured = Boolean(configured && data?.betaImagesConfigured);
      if (status) {
        status.dataset.healthChecked = 'true';
        status.classList.toggle('is-ready', configured);
        status.textContent = configured
          ? (data?.betaImagesConfigured
              ? 'AI siap · Mode ringan aktif'
              : 'AI siap · Mode ringan memakai jalur cadangan')
          : 'Konfigurasi server belum lengkap';
      }
      if (!configured && showFeedback) {
        setFeedback('Konfigurasi Secure Gateway belum lengkap. Pastikan COSMOS_API_KEY, FIREBASE_WEB_API_KEY, dan MILE_SESSION_SECRET tersedia di Cloudflare Variables and Secrets, lalu deploy ulang.', 'error');
      }
      updateNetworkModeHint();
      return configured;
    } catch (error) {
      lastHealthLatencyMs = Math.max(1, performance.now() - startedAt);
      lastHealthConfigured = false;
      lastBetaImagesConfigured = false;
      if (status) {
        status.dataset.healthChecked = 'true';
        status.classList.remove('is-ready');
        status.textContent = 'Server belum terhubung';
      }
      if (showFeedback) {
        const message = healthTimedOut || error?.name === 'AbortError'
          ? 'Pemeriksaan server melewati 15 detik. Koneksi sedang sangat lambat atau terputus; coba lagi setelah sinyal membaik.'
          : 'Server tidak dapat dijangkau. Periksa koneksi internet lalu coba lagi.';
        setFeedback(message, 'error');
      }
      updateNetworkModeHint();
      return false;
    } finally {
      window.clearTimeout(timeout);
      activeControllers.delete(controller);
    }
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

  function markProgressActivity(label, { waiting = false } = {}) {
    progressActivityAt = performance.now();
    progressActivityLabel = label || 'Proses berjalan';
    progressWaitingSince = waiting ? (progressWaitingSince || performance.now()) : 0;
    if ($('aiProgressActivity')) $('aiProgressActivity').textContent = progressActivityLabel;
  }

  function setTransferProgress(percent, label, { waiting = false, error = false } = {}) {
    const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const track = $('aiTransferBar')?.parentElement;
    if ($('aiTransferBar')) $('aiTransferBar').style.width = `${safe}%`;
    if ($('aiTransferPercent')) $('aiTransferPercent').textContent = waiting ? 'AI bekerja' : `${safe}%`;
    if ($('aiTransferStatus')) $('aiTransferStatus').textContent = label || 'Menunggu pengiriman';
    track?.classList.toggle('is-waiting', waiting);
    track?.classList.toggle('is-error', error);
    markProgressActivity(label, { waiting });
  }

  function setProgressStats({ renderedPages, totalPages, completedChunks, totalChunks } = {}) {
    if ($('aiProgressPages') && Number.isFinite(renderedPages) && Number.isFinite(totalPages)) {
      $('aiProgressPages').textContent = `${renderedPages}/${totalPages}`;
    }
    if ($('aiProgressChunks') && Number.isFinite(completedChunks) && Number.isFinite(totalChunks)) {
      $('aiProgressChunks').textContent = `${completedChunks}/${totalChunks}`;
    }
  }

  function refreshProgressHeartbeat() {
    const signals = connectionSignals();
    const networkNode = $('aiProgressNetwork');
    if (networkNode) {
      const mode = $('aiNetworkMode')?.value || DEFAULT_NETWORK_MODE;
      const profile = resolveNetworkProfile(mode);
      networkNode.textContent = signals.online ? profile.label : 'Memeriksa server';
      networkNode.classList.remove('is-offline');
    }

    const activityNode = $('aiProgressActivity');
    if (!activityNode) return;
    if (!signals.online) {
      activityNode.textContent = 'Status LAN belum pasti · proses tetap mencoba server';
      return;
    }
    if (progressWaitingSince) {
      activityNode.textContent = `AI masih bekerja · ${formatDuration((performance.now() - progressWaitingSince) / 1000)}`;
      return;
    }
    const age = progressActivityAt ? (performance.now() - progressActivityAt) / 1000 : 0;
    activityNode.textContent = age < 2 ? progressActivityLabel : `${progressActivityLabel} · ${formatDuration(age)} lalu`;
  }

  function startProgressHeartbeat() {
    window.clearInterval(progressHeartbeatInterval);
    progressActivityAt = performance.now();
    progressWaitingSince = 0;
    refreshProgressHeartbeat();
    progressHeartbeatInterval = window.setInterval(refreshProgressHeartbeat, 1000);
  }

  function stopProgressHeartbeat() {
    window.clearInterval(progressHeartbeatInterval);
    progressHeartbeatInterval = 0;
    progressWaitingSince = 0;
  }

  function hideProgress() {
    window.clearTimeout(progressHideTimeout);
    progressHideTimeout = 0;
    const modal = $('aiProgressModal');
    if (modal) modal.style.display = 'none';
    stopProgressHeartbeat();
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

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} KB`;
    return `${(value / (1024 * 1024)).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
  }

  function formatPreciseDuration(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    if (value < 60) return `${value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} detik`;
    const minutes = Math.floor(value / 60);
    const rest = value - minutes * 60;
    return `${minutes} menit ${rest.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} detik`;
  }

  function formatStopwatch(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const rest = value - minutes * 60;
    const secondsText = rest.toFixed(1).padStart(4, '0');
    return `${String(minutes).padStart(2, '0')}:${secondsText}`;
  }

  function updateStopwatch(seconds, totalRows = 0) {
    if ($('aiElapsedTime')) $('aiElapsedTime').textContent = formatStopwatch(seconds);
    if ($('aiElapsedRate')) {
      $('aiElapsedRate').textContent = totalRows > 0
        ? `${(seconds / totalRows).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} detik per data`
        : 'Rata-rata per data dihitung setelah proses selesai';
    }
  }

  function startStopwatch(startedAt) {
    window.clearTimeout(progressHideTimeout);
    progressHideTimeout = 0;
    window.clearInterval(stopwatchInterval);
    stopwatchStartedAt = startedAt;
    updateStopwatch(0, 0);
    startProgressHeartbeat();
    stopwatchInterval = window.setInterval(() => {
      if (!stopwatchStartedAt) return;
      updateStopwatch((performance.now() - stopwatchStartedAt) / 1000, 0);
    }, 500);
  }

  function stopStopwatch(elapsedSeconds, totalRows = 0) {
    window.clearInterval(stopwatchInterval);
    stopwatchInterval = 0;
    stopwatchStartedAt = 0;
    updateStopwatch(elapsedSeconds, totalRows);
    stopProgressHeartbeat();
  }

  function setMetricsSyncStatus(message, type = '') {
    const node = $('aiMetricsSyncStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-success', type === 'success');
    node.classList.toggle('is-error', type === 'error');
  }

  function showProcessingSummary(metrics) {
    const summary = $('aiRunSummary');
    if (!summary) return;
    summary.hidden = false;
    summary.dataset.status = metrics.status || '';
    if ($('aiRunSummaryTitle')) {
      $('aiRunSummaryTitle').textContent =
        metrics.status === 'SUCCESS' ? 'Pemrosesan AI selesai' :
        metrics.status === 'CANCELLED' ? 'Pemrosesan AI dibatalkan' :
        'Pemrosesan AI belum berhasil';
    }
    if ($('aiRunDuration')) $('aiRunDuration').textContent = formatPreciseDuration(metrics.durationSeconds);
    if ($('aiRunRows')) $('aiRunRows').textContent = `${Number(metrics.totalRows || 0).toLocaleString('id-ID')} data`;
    if ($('aiRunPerRow')) {
      $('aiRunPerRow').textContent = metrics.totalRows > 0
        ? `${(metrics.durationSeconds / metrics.totalRows).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} detik/data`
        : '—';
    }
    if ($('aiRunPages')) $('aiRunPages').textContent = `${Number(metrics.pageCount || 0).toLocaleString('id-ID')} halaman`;
    if ($('aiRunSummaryNote')) {
      const detail = metrics.status === 'SUCCESS'
        ? `${metrics.reviewCount} data perlu dicek · ${metrics.outsideBatamCount} alamat luar Kota Batam.`
        : (metrics.message || 'Proses tidak menghasilkan data.');
      $('aiRunSummaryNote').textContent = `${detail} Log hanya menyimpan metrik, tanpa nama, alamat, telepon, atau isi dokumen.`;
    }
    setMetricsSyncStatus('Menyimpan ke Google Sheets…');
  }

  async function submitProcessingMetrics(metrics) {
    showProcessingSummary(metrics);
    let timeout = 0;
    try {
      const controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 16000);
      const response = await fetch('/api/metrics/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(metrics),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true) {
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }
      setMetricsSyncStatus('Tersimpan di Google Sheets', 'success');
      return true;
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'Google Sheets timeout'
        : 'Gagal dicatat ke Google Sheets';
      setMetricsSyncStatus(message, 'error');
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function reviewRowCount(rows) {
    return rows.filter(row => Boolean(row?.needsVerification || (Array.isArray(row?.aiReviewFields) && row.aiReviewFields.length))).length;
  }

  function outsideBatamRowCount(rows) {
    return rows.filter(row => Boolean(row?.outsideBatam)).length;
  }

  function sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  async function cancellableSleep(ms) {
    const deadline = performance.now() + Math.max(0, ms);
    while (performance.now() < deadline) {
      if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
      await sleep(Math.min(300, deadline - performance.now()));
    }
  }

  async function waitUntilOnline(label = 'permintaan AI') {
    if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
    if (navigator.onLine !== false || lastHealthConfigured) return;
    const current = Number($('aiProgressPercent')?.textContent?.replace(/\D/g, '') || 1);
    setProgress(current, 'Mencoba menghubungi server', `${label} tetap dijalankan meski status LAN dari browser belum pasti.`, $('aiProgressUsage')?.textContent || '');
    setTransferProgress(0, 'Status LAN belum pasti · mencoba server', { waiting: true });
  }

  function yieldToBrowser() {
    return new Promise(resolve => {
      if (document.hidden || typeof window.requestAnimationFrame !== 'function') {
        window.setTimeout(resolve, 0);
        return;
      }
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });
  }

  function fileToArrayBuffer(file, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      activeControllers.add(reader);
      reader.onprogress = event => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      };
      reader.onload = () => {
        activeControllers.delete(reader);
        resolve(reader.result);
      };
      reader.onerror = () => {
        activeControllers.delete(reader);
        reject(reader.error || new Error('Gagal membaca PDF.'));
      };
      reader.onabort = () => {
        activeControllers.delete(reader);
        reject(new DOMException('Proses dibatalkan pengguna.', 'AbortError'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function createBetaJobId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '');
    const bytes = new Uint8Array(18);
    window.crypto?.getRandomValues?.(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') || `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  function canvasToJpegBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Browser gagal membuat JPEG halaman PDF.'));
      }, 'image/jpeg', quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      activeControllers.add(reader);
      reader.onload = () => {
        activeControllers.delete(reader);
        resolve(String(reader.result || ''));
      };
      reader.onerror = () => {
        activeControllers.delete(reader);
        reject(reader.error || new Error('Gagal membaca JPEG halaman.'));
      };
      reader.onabort = () => {
        activeControllers.delete(reader);
        reject(new DOMException('Proses dibatalkan pengguna.', 'AbortError'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [header, encoded] = String(dataUrl || '').split(',', 2);
    const type = header?.match(/^data:([^;]+)/i)?.[1] || 'image/jpeg';
    const binary = atob(encoded || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type });
  }

  async function uploadBetaImage(jobId, pageNumber, variant, blob) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), BETA_UPLOAD_TIMEOUT_MS);
    activeControllers.add(controller);
    try {
      const response = await fetch(`/api/beta/images/${encodeURIComponent(jobId)}/${pageNumber}/${variant}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'image/jpeg' },
        body: blob,
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        const error = new Error(payload?.error?.message || `Penyimpanan gambar beta gagal (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return payload.url;
    } catch (error) {
      if (error?.name === 'AbortError' && !cancelled) {
        const timeoutError = new Error('Upload JPEG beta melewati 15 detik.');
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      activeControllers.delete(controller);
    }
  }

  async function cleanupBetaImages(jobId) {
    if (!jobId) return;
    try {
      await fetch('/api/beta/images/cleanup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId }),
        keepalive: true
      });
    } catch (_) {}
  }

  async function renderPageToLightBlob(page, accuracyMode = DEFAULT_ACCURACY_MODE, speedPreset = DEFAULT_SPEED_PRESET, networkProfile = null, audit = false) {
    const baseProfile = IMAGE_PROFILES[accuracyMode] || IMAGE_PROFILES[DEFAULT_ACCURACY_MODE];
    const networkMaxSide = Number(networkProfile?.maxImageSide);
    const networkQuality = Number(networkProfile?.jpegQuality);
    const maxSideLimit = Number.isFinite(networkMaxSide) && networkMaxSide > 0 ? networkMaxSide : Infinity;
    const qualityLimit = Number.isFinite(networkQuality) && networkQuality > 0 ? networkQuality : 1;
    const targetSide = audit
      ? Math.min(accuracyMode === 'accurate' ? 2800 : AUDIT_MAX_SIDE, maxSideLimit)
      : Math.min(baseProfile.maxSide, speedPreset === 'fast' ? FIRST_PASS_MAX_SIDE : baseProfile.maxSide, maxSideLimit);
    const quality = audit
      ? Math.min(Math.max(baseProfile.jpegQuality, AUDIT_JPEG_QUALITY), qualityLimit)
      : Math.min(baseProfile.jpegQuality, speedPreset === 'fast' ? FIRST_PASS_JPEG_QUALITY : baseProfile.jpegQuality, qualityLimit);
    const viewportBase = page.getViewport({ scale: 1 });
    const scale = Math.min(4.5, Math.max(1, targetSide / Math.max(viewportBase.width, viewportBase.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas browser tidak tersedia untuk merender PDF.');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await page.render({ canvasContext: context, viewport }).promise;
      await yieldToBrowser();
      return await canvasToJpegBlob(canvas, quality);
    } finally {
      canvas.width = canvas.height = 1;
      await yieldToBrowser();
    }
  }

  function createTaskPool(limit = 1) {
    const maximum = Math.max(1, Math.floor(Number(limit) || 1));
    const queue = [];
    let active = 0;
    const drain = () => {
      while (active < maximum && queue.length) {
        const item = queue.shift();
        active++;
        Promise.resolve()
          .then(item.task)
          .then(item.resolve, item.reject)
          .finally(() => {
            active--;
            drain();
          });
      }
    };
    return task => new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      drain();
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

  function encodeCrop(sourceCanvas, bounds, maxSide, jpegQuality, enhance = false) {
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
    if (enhance) enhanceForReading(outputContext, outputCanvas.width, outputCanvas.height);
    const url = outputCanvas.toDataURL('image/jpeg', jpegQuality);
    outputCanvas.width = outputCanvas.height = 1;
    return url;
  }

  async function renderPageToImage(page, accuracyMode = DEFAULT_ACCURACY_MODE, speedPreset = DEFAULT_SPEED_PRESET, networkProfile = null, audit = false) {
    const baseProfile = IMAGE_PROFILES[accuracyMode] || IMAGE_PROFILES[DEFAULT_ACCURACY_MODE];
    const profile = { ...baseProfile };
    const networkMaxSide = Number(networkProfile?.maxImageSide);
    const networkQuality = Number(networkProfile?.jpegQuality);
    const maxSideLimit = Number.isFinite(networkMaxSide) && networkMaxSide > 0 ? networkMaxSide : Infinity;
    const qualityLimit = Number.isFinite(networkQuality) && networkQuality > 0 ? networkQuality : 1;
    const firstPassMaxSide = Math.min(
      profile.maxSide,
      speedPreset === 'fast' ? FIRST_PASS_MAX_SIDE : profile.maxSide,
      maxSideLimit
    );
    const auditTarget = accuracyMode === 'accurate' ? 2800 : AUDIT_MAX_SIDE;
    const auditMaxSide = Math.min(Math.max(profile.maxSide, auditTarget), maxSideLimit);
    const firstPassQuality = Math.min(profile.jpegQuality, speedPreset === 'fast' ? FIRST_PASS_JPEG_QUALITY : profile.jpegQuality, qualityLimit);
    const auditQuality = Math.min(Math.max(profile.jpegQuality, AUDIT_JPEG_QUALITY), qualityLimit);
    const viewportBase = page.getViewport({ scale: 1 });
    const renderMaxSide = audit ? auditMaxSide : firstPassMaxSide;
    const initialTarget = Math.min(renderMaxSide * 1.12, 3400);
    const scale = Math.min(4.5, Math.max(1.7, initialTarget / Math.max(viewportBase.width, viewportBase.height)));
    const viewport = page.getViewport({ scale });
    const sourceCanvas = document.createElement('canvas');
    const sourceContext = sourceCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    sourceCanvas.width = Math.ceil(viewport.width);
    sourceCanvas.height = Math.ceil(viewport.height);
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    await page.render({ canvasContext: sourceContext, viewport }).promise;
    await yieldToBrowser();

    const fullBounds = findContentBounds(sourceContext, sourceCanvas.width, sourceCanvas.height);
    const detailBounds = !audit || profile.verify === 'none'
      ? fullBounds
      : findPrimaryTextBounds(sourceContext, sourceCanvas.width, sourceCanvas.height, fullBounds);

    // Pass pertama benar-benar dirender lebih ringan. Gambar audit resolusi tinggi
    // baru dibuat bila halaman tersebut masuk daftar pemeriksaan selektif.
    const fullUrl = encodeCrop(
      sourceCanvas,
      fullBounds,
      audit ? auditMaxSide : firstPassMaxSide,
      audit ? auditQuality : firstPassQuality,
      true
    );
    const originalUrl = fullUrl;
    const detailDiffers = (
      detailBounds.x !== fullBounds.x || detailBounds.y !== fullBounds.y ||
      detailBounds.w !== fullBounds.w || detailBounds.h !== fullBounds.h
    );
    const detailUrl = audit && detailDiffers
      ? encodeCrop(sourceCanvas, detailBounds, auditMaxSide, auditQuality, true)
      : (audit ? fullUrl : '');

    sourceCanvas.width = sourceCanvas.height = 1;
    await yieldToBrowser();
    return { originalUrl, fullUrl, detailUrl, firstPassMaxSide, auditMaxSide };
  }

  function buildPrompt(startPage, endPage, options = {}) {
    return `Tolong ubah dokumen ini menjadi data terstruktur.
Baca HANYA sebagai HASIL SCAN. Cocokkan tulisan dari gambar, JANGAN menebak yang tidak terbaca, beri "PERLU DICEK" pada bagian meragukan.
Kembalikan HANYA JSON valid tanpa markdown, tanpa penjelasan, dan TANPA whitespace berlebih.

Aturan:
1. Urutan sesuai urutan halaman dokumen (halaman ${startPage} - ${endPage}).
2. nama_penerima: Hapus "KEPADA YTH", "ATTN", dan SETIAP kode/resi panjang yang mencampur huruf dengan angka. Contoh wajib: "FAHRUDIN 0028C20250400784" menjadi "FAHRUDIN". Jangan campur alamat. JL, RUKO, BLOK, dll masuk alamat.
3. Abaikan CABANG/CARRIAGE BATAM dan footer transaksi.
4. nomor_hp: Hanya diisi bila ada nomor telp/wa (08..., +62...), abaikan kode mandiri.
5. nomor_surat: PRIORITAS PERTAMA adalah nomor surat resmi setelah label NOMOR/NOMOR SURAT/NO. SURAT/REF. Contoh pada kepala surat "Nomor: 3166 /PAN.01.W32-U2/HK2. 4/VII/2026" wajib menjadi "3166/PAN.01.W32-U2/HK2.4/VII/2026". Abaikan nomor perkara di bagian Jenis Surat bila nomor kepala surat tersedia. Jika nomor surat resmi tidak ada, gunakan isi setelah label PERIHAL/HAL/SUBJECT tanpa kata label; contoh "Perihal: Surat Pemberitahuan (SP1)" menjadi "Surat Pemberitahuan (SP1)" dan "Perihal Penagihan dan Peringatan Terakhir" menjadi "Penagihan dan Peringatan Terakhir". Setelah itu barulah gunakan ID Pesanan atau Resi. Nilai boleh berupa teks.
6. di_luar_batam: true HANYA JIKA jelas bukan Kota Batam atau kode pos bukan 294xx. Jika meragukan, false dan tandai alamat_penerima di perlu_dicek_fields.
7. perlu_dicek_fields: array string nama kolom jika ragu dengan bacaan.

Format Wajib:
{"rows":[{"page":1,"nama_penerima":"...","alamat_penerima":"...","nomor_hp":"","nomor_surat":"","di_luar_batam":false,"perlu_dicek_fields":[]}]}
`;
  }

  function buildVerificationPrompt(startPage, endPage, draftRows, options = {}) {
    const pages = [...new Set((options.pages || draftRows.map(row => row?.page)).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
    const pageLabel = pages.length ? pages.join(', ') : `${startPage}–${endPage}`;
    return `Audit gambar halaman ${pageLabel} secara INDEPENDEN.
Jangan sekadar menyetujui draft.

DRAFT:
${JSON.stringify({ rows: draftRows })}

Kembalikan HANYA JSON perbaikan tanpa markdown dan whitespace berlebih:
{"rows":[{"page":${pages[0] || startPage},"nama_penerima":"...","alamat_penerima":"...","nomor_hp":"","nomor_surat":"","di_luar_batam":false,"perlu_dicek_fields":[]}]}

Aturan:
- nama_penerima: Hapus KEPADA YTH dan setiap kode/resi panjang campuran huruf-angka. Contoh "FAHRUDIN 0028C20250400784" wajib menjadi "FAHRUDIN". Jangan campur alamat.
- nomor_surat: PRIORITASKAN nomor surat resmi pada kepala surat setelah label NOMOR/NOMOR SURAT/NO. SURAT/REF. Contoh "Nomor: 3166 /PAN.01.W32-U2/HK2. 4/VII/2026" wajib menjadi "3166/PAN.01.W32-U2/HK2.4/VII/2026". Abaikan nomor perkara pada Jenis Surat bila nomor kepala surat ada. PERIHAL/HAL/SUBJECT hanya menjadi fallback jika nomor resmi tidak ada.
- Abaikan CABANG BATAM, kode mandiri 5-8 digit.
- di_luar_batam: true bila jelas bukan Kota Batam / 294xx.
- Gunakan PERLU DICEK bila tak pasti dan tambahkan ke perlu_dicek_fields.
- Pastikan nomor halaman benar sesuai gambar audit.
`;
  }

  function extractionTokenLimit(pageCount) {
    return Math.max(2400, Math.min(7000, 1800 + Math.max(1, Number(pageCount) || 1) * 340));
  }

  function verificationTokenLimit(pageCount) {
    return Math.max(1800, Math.min(5200, 1400 + Math.max(1, Number(pageCount) || 1) * 280));
  }

  function buildApiBody(config, prompt, sources, maxTokens = 5000) {
    const content = [{ type: 'text', text: prompt }];
    sources.forEach((source, index) => {
      const page = Number(source?.page || source?.pageNumber || index + 1);
      const url = typeof source === 'string' ? source : source?.url || source?.dataUrl;
      const label = typeof source === 'string'
        ? `HALAMAN ${page}`
        : (source?.label || `HALAMAN ${page}`);
      if (url) {
        content.push({ type: 'text', text: label });
        content.push({ type: 'image_url', image_url: { url } });
      }
    });

    const body = {
      model: config.model,
      stream: false,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'Anda adalah operator data entri. Utamakan kesetiaan pada gambar. Kembalikan HANYA format JSON valid TANPA penjelasan, TANPA markdown block, dan minimalkan newline/spasi untuk efisiensi token.'
        },
        { role: 'user', content }
      ]
    };
    // Gemini 3.8 menolak/mengabaikan parameter sampling lama. Model lain pada
    // gateway CosmosHub tetap memakai parameter yang sudah teruji sebelumnya.
    if (config.model !== GEMINI_38_MODEL) {
      body.temperature = 0;
      body.top_p = 0.1;
    }
    return body;
  }

  function buildJsonRepairBody(config, rawText, maxTokens = 2600) {
    const clipped = String(rawText || '').slice(0, MAX_JSON_REPAIR_CHARS);
    const body = {
      model: config.model,
      stream: false,
      max_tokens: Math.max(1200, Math.min(7000, Number(maxTokens) || 2600)),
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'Perbaiki sintaks JSON. Kembalikan HANYA JSON.'
        },
        {
          role: 'user',
          content: `Perbaiki teks berikut menjadi JSON valid dengan bentuk {"rows":[...]}. Tutup string/array terpotong.

${clipped}`
        }
      ]
    };
    if (config.model !== GEMINI_38_MODEL) {
      body.temperature = 0;
      body.top_p = 0.1;
    }
    return body;
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
      if (response.status === 401) {
        message = 'Sesi login telah berakhir. Silakan masuk kembali.';
        window.dispatchEvent(new CustomEvent('mile:session-expired'));
      } else if (response.status === 403) message = 'Akun ini tidak memiliki izin menggunakan layanan AI.';
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

  async function callViaProxy(config, body, onTransport = () => {}) {
    onTransport({ phase: 'encoding', loaded: 0, total: 0 });
    await yieldToBrowser();
    const requestBody = JSON.stringify({ body });
    const totalBytes = new Blob([requestBody]).size;
    onTransport({ phase: 'ready', loaded: 0, total: totalBytes });
    await yieldToBrowser();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      let uploadStalled = false;
      let stallTimeout = 0;

      const clearStallTimeout = () => {
        window.clearTimeout(stallTimeout);
        stallTimeout = 0;
      };
      const armStallTimeout = () => {
        clearStallTimeout();
        stallTimeout = window.setTimeout(() => {
          uploadStalled = true;
          xhr.abort();
        }, UPLOAD_STALL_TIMEOUT_MS);
      };
      const cleanup = () => {
        if (settled) return false;
        settled = true;
        clearStallTimeout();
        activeControllers.delete(xhr);
        return true;
      };
      const fail = error => {
        if (!cleanup()) return;
        if (!error.transport) error.transport = 'proxy Cloudflare';
        reject(error);
      };

      xhr.open('POST', '/api/ai-proxy', true);
      xhr.withCredentials = true;
      xhr.timeout = REQUEST_TIMEOUT_MS;
      xhr.setRequestHeader('content-type', 'application/json');
      xhr.setRequestHeader('accept', 'application/json');

      xhr.upload.onloadstart = () => {
        onTransport({ phase: 'uploading', loaded: 0, total: totalBytes });
        armStallTimeout();
      };
      xhr.upload.onprogress = event => {
        const total = event.lengthComputable && event.total ? event.total : totalBytes;
        onTransport({ phase: 'uploading', loaded: event.loaded, total });
        armStallTimeout();
      };
      xhr.upload.onload = () => {
        clearStallTimeout();
        onTransport({ phase: 'waiting', loaded: totalBytes, total: totalBytes });
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState >= 2 && !settled) {
          clearStallTimeout();
          onTransport({ phase: 'waiting', loaded: totalBytes, total: totalBytes });
        }
      };
      xhr.onload = () => {
        if (!xhr.status) {
          const error = new Error('Server tidak mengembalikan status HTTP. Koneksi kemungkinan terputus.');
          fail(error);
          return;
        }
        if (!cleanup()) return;
        const headers = new Headers({ 'content-type': xhr.getResponseHeader('content-type') || 'application/json' });
        const response = new Response(xhr.responseText || '', { status: xhr.status, statusText: xhr.statusText, headers });
        parseApiResponse(response, 'proxy Cloudflare').then(payload => {
          onTransport({ phase: 'complete', loaded: totalBytes, total: totalBytes });
          resolve(payload);
        }, reject);
      };
      xhr.onerror = () => {
        const error = new Error('Koneksi ke server terputus sebelum respons AI selesai.');
        fail(error);
      };
      xhr.ontimeout = () => {
        const error = new Error('Permintaan AI melewati batas 6 menit dan akan dicoba ulang.');
        error.status = 408;
        fail(error);
      };
      xhr.onabort = () => {
        if (uploadStalled) {
          const error = new Error('Unggahan tidak bergerak selama 45 detik. Sistem akan mencoba ulang otomatis.');
          error.status = 408;
          fail(error);
          return;
        }
        fail(new DOMException('Proses dibatalkan pengguna.', 'AbortError'));
      };

      activeControllers.add(xhr);
      xhr.send(requestBody);
    });
  }

  async function callCosmos(config, body, onTransport) {
    return callViaProxy(config, body, onTransport);
  }

  function isRetryable(error) {
    if (cancelled || error?.name === 'AbortError') return false;
    if (!error?.status) return true;
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(error.status));
  }

  function isAutoFallbackEligible(config, error) {
    if (cancelled || error?.name === 'AbortError' || config?.model !== DEFAULT_MODEL) return false;
    const status = Number(error?.status || 0);
    if (!status) return true;
    if ([404, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    return /JSON valid|array rows|teks hasil/i.test(String(error?.message || ''));
  }

  async function callProxyWithRetry(config, body, label = '', hooks = {}) {
    const configuredModel = String(config?.model || body?.model || '').trim();
    const requestModel = configuredModel === DEFAULT_MODEL && runtimeFallbackModel
      ? runtimeFallbackModel
      : String(body?.model || configuredModel).trim();
    const requestConfig = requestModel === configuredModel ? config : { ...config, model: requestModel };
    const requestBody = body?.model === requestModel ? body : { ...body, model: requestModel };
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
      await waitUntilOnline(label);
      try {
        hooks.onAttempt?.(attempt, MAX_RETRIES, requestModel);
        const payload = await callCosmos(requestConfig, requestBody, event => hooks.onTransport?.({ ...event, attempt, maxAttempts: MAX_RETRIES, model: requestModel }));
        try {
          // Validasi JSON di sini agar respons terpotong bisa diperbaiki atau dicoba ulang.
          parseRows(payload, requestConfig.protocol);
          payload._mileEffectiveModel = requestModel;
          return payload;
        } catch (parseError) {
          let rawText = '';
          try { rawText = extractTextFromResponse(payload, requestConfig.protocol); } catch (_) {}
          if (!rawText || rawText.length > MAX_JSON_REPAIR_CHARS) throw parseError;

          hooks.onRepair?.({ attempt, maxAttempts: MAX_RETRIES, error: parseError });
          const repairedPayload = await callCosmos(
            requestConfig,
            buildJsonRepairBody(requestConfig, rawText, Math.min(7000, Math.max(1600, Math.ceil(rawText.length / 3.6) + 400))),
            event => hooks.onTransport?.({ ...event, attempt, maxAttempts: MAX_RETRIES, repair: true, model: requestModel })
          );
          parseRows(repairedPayload, requestConfig.protocol);
          const originalUsage = readBaseUsage(payload, requestConfig.protocol);
          const existingExtra = repairedPayload?._mileAdditionalUsage || {};
          repairedPayload._mileAdditionalUsage = {
            input: Number(existingExtra.input || 0) + Number(originalUsage.input || 0),
            output: Number(existingExtra.output || 0) + Number(originalUsage.output || 0)
          };
          repairedPayload._mileJsonRepaired = true;
          repairedPayload._mileEffectiveModel = requestModel;
          return repairedPayload;
        }
      } catch (error) {
        lastError = error;
        const retryable = isRetryable(error) || /JSON valid|array rows|teks hasil/i.test(String(error.message || ''));
        const providerFailure = Boolean(Number(error?.status || 0)) || /JSON valid|array rows|teks hasil/i.test(String(error.message || ''));
        if (requestModel === DEFAULT_MODEL && providerFailure && isAutoFallbackEligible(config, error)) break;
        if (!retryable) {
          if (requestModel === DEFAULT_MODEL && isAutoFallbackEligible(config, error)) break;
          throw error;
        }
        if (attempt >= MAX_RETRIES) break;
        const delay = Number(error?.status) === 429
          ? ([8000, 18000][attempt - 1] || 18000)
          : ([1800, 4200, 8500][attempt - 1] || 8500);
        hooks.onRetry?.({ attempt, nextAttempt: attempt + 1, maxAttempts: MAX_RETRIES, delay, error });
        setProgress(
          Number($('aiProgressPercent')?.textContent?.replace(/\D/g, '') || 10),
          `Mencoba ulang ${label}`,
          `Percobaan ${attempt + 1}/${MAX_RETRIES} dimulai dalam ${formatDuration(delay / 1000)}.`,
          $('aiProgressUsage')?.textContent || ''
        );
        setTransferProgress(0, `Koneksi terganggu · mencoba lagi ${attempt + 1}/${MAX_RETRIES}`, { error: true });
        await cancellableSleep(delay + Math.floor(Math.random() * 700));
      }
    }
    if (requestModel === DEFAULT_MODEL && isAutoFallbackEligible(config, lastError)) {
      const firstActivation = runtimeFallbackModel !== AUTO_FALLBACK_MODEL;
      runtimeFallbackModel = AUTO_FALLBACK_MODEL;
      if (firstActivation && !fallbackAnnounced) {
        fallbackAnnounced = true;
        if ($('aiModel')) $('aiModel').value = AUTO_FALLBACK_MODEL;
        hooks.onFallback?.({ from: DEFAULT_MODEL, to: AUTO_FALLBACK_MODEL, error: lastError });
        showToast('Gemini 3.7 terkendala. Proses dilanjutkan otomatis dengan Qwen 3.7 Flash.', 'info');
      }
      const fallbackPayload = await callProxyWithRetry(config, { ...body, model: AUTO_FALLBACK_MODEL }, label, hooks);
      fallbackPayload._mileFallbackFrom = DEFAULT_MODEL;
      return fallbackPayload;
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

  function stripCommonArtifacts(value, kind = 'text') {
    let raw = String(value ?? '')
      .replace(/\u0000/g, ' ')
      .replace(/\b(?:CABANG|CARRIAGE)\s*:?\s*245\s+BATAM\b/gi, ' ')
      .replace(/\b(?:TGL\.?\s*TRANS|TGL\.?\s*VALUTA|NO\.?\s*DOKUMEN|URAIAN\s+MUTASI)\b.*$/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Kode mandiri pada dokumen BNI bukan bagian nama, alamat, maupun nomor surat.
    if (kind === 'name') raw = raw.replace(/^\s*[0O]{5,8}\s*$/i, '');
    return raw;
  }

  function stripRecipientPrefix(value) {
    return String(value ?? '')
      .replace(/^\s*(?:KEPADA\s+(?:YANG\s+TERHORMAT|YTH\.?)|YTH\.?|ATTN\.?)\s*[:.,\-]?\s*/i, '')
      .trim();
  }

  function isRecipientMachineCode(token) {
    const compact = String(token || '')
      .normalize('NFKC')
      .replace(/^[([{]+|[)\]},.;:]+$/g, '')
      .replace(/[\s/_.-]+/g, '');
    if (compact.length < 8) return false;
    return /\p{L}/u.test(compact) && /\d/u.test(compact) && (compact.match(/\d/g) || []).length >= 3;
  }

  function stripRecipientMachineCodes(value) {
    return String(value ?? '')
      .split(/\s+/)
      .filter(token => token && !isRecipientMachineCode(token))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripSubjectLabel(value) {
    return String(value ?? '')
      .replace(/^\s*(?:PERIHAL(?:\s+SURAT)?|HAL|SUBJECT)\s*(?::|[-–—])?\s*/i, '')
      .trim();
  }

  function stripOfficialReferenceLabel(value) {
    return String(value ?? '')
      .replace(/^\s*(?:(?:NOMOR|NO\.?)\s*(?:SURAT)?|REF(?:ERENSI)?|REFERENCE)(?![A-Z0-9])\s*[:#-]?\s*/i, '')
      .trim();
  }

  function compactOfficialReference(value) {
    const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!isStructuredOfficialReference(raw)) return raw;
    return raw
      .replace(/\s*([/.])\s*/g, '$1')
      .replace(/\s*-\s*/g, '-')
      .trim();
  }

  function isStructuredOfficialReference(value) {
    const raw = stripOfficialReferenceLabel(value);
    const separatorCount = (raw.match(/[/.]/g) || []).length;
    return /^\d+\s*[/.]/.test(raw) || (/\d/.test(raw) && separatorCount >= 2);
  }

  function normalizeOfficialReference(value) {
    return normalizeAIText(compactOfficialReference(stripOfficialReferenceLabel(value)), 'reference');
  }

  function normalizeAIText(value, kind = 'text') {
    let raw = stripCommonArtifacts(value, kind);
    if (!raw) return '';
    const core = window.__mileCore;
    if (kind === 'name') {
      raw = stripRecipientMachineCodes(stripRecipientPrefix(raw));
      if (core?.cleanRecipientName) return core.cleanRecipientName(raw);
    }
    if (kind === 'reference') {
      raw = stripSubjectLabel(raw);
      if (/^(?:245\s+BATAM|CABANG|CARRIAGE)$/i.test(raw)) return '';
      if (core?.cleanReference) return core.cleanReference(raw);
    }
    if (core?.cleanArtifacts) return core.cleanArtifacts(raw);
    return raw.toUpperCase();
  }

  function normalizeAIPhone(value, rawLines = []) {
    const direct = String(value ?? '').trim();
    if (containsReviewMarker(direct)) return direct.toUpperCase();
    const joined = [direct, ...normalizeRawLines(rawLines)].join(' ');
    const candidates = joined.match(/(?:\+?62|0)[\s().-]*8(?:[\s().-]*\d){7,12}/g) || [];
    for (const candidate of candidates) {
      let digits = String(candidate).replace(/\D/g, '');
      if (digits.startsWith('62')) digits = `0${digits.slice(2)}`;
      if (/^08\d{7,12}$/.test(digits)) return digits;
    }
    return '';
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
    return /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(String(value || ''));
  }

  function normalizeRawLines(value) {
    const source = Array.isArray(value)
      ? value
      : (typeof value === 'string' ? value.split(/\r?\n|\s*\|\s*/) : []);
    return source
      .map(line => String(line ?? '').replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function isAdministrativeLine(line) {
    return /^(?:CABANG|CARRIAGE)\b|^245\s+BATAM$|^(?:TGL\.?\s*TRANS|TGL\.?\s*VALUTA|NO\.?\s*DOKUMEN|URAIAN\s+MUTASI)\b/i.test(line);
  }

  function isAddressLine(line) {
    return /^(?:JL\.?|JALAN|RUKO|PERUM(?:AHAN)?|KOMP(?:LEK)?|KAVLING|GEDUNG|BLOK|KAMPUNG|PASIR\s+PUTIH\s+RESIDENCE)\b/i.test(line);
  }

  function isPhoneLine(line) {
    const value = String(line || '').trim();
    return /^(?:NO\.?\s*)?(?:HP|TELP?\.?|TELEPON|PHONE|WA|WHATSAPP)\b/i.test(value) || /(?:\+?62|0)[\s().-]*8(?:[\s().-]*\d){7,12}/.test(value);
  }

  function isReferenceLine(line) {
    return /^(?:(?:NOMOR|NO\.?)\s*(?:SURAT)?|REF(?:ERENSI)?|REFERENCE|PERIHAL(?:\s+SURAT)?|HAL|SUBJECT)\b/i.test(String(line || '').trim());
  }

  function extractReferenceFromLines(lines) {
    const normalizedLines = normalizeRawLines(lines);
    for (const line of normalizedLines) {
      if (!/^(?:NOMOR(?:\s+SURAT)?|NO\.?\s+SURAT|REF(?:ERENSI)?|REFERENCE)(?![A-Z0-9])/i.test(line)) continue;
      const normalized = normalizeOfficialReference(line);
      if (normalized) return normalized;
    }
    for (let index = 0; index < normalizedLines.length; index++) {
      const line = normalizedLines[index];
      if (!/^(?:PERIHAL(?:\s+SURAT)?|HAL|SUBJECT)\b/i.test(line)) continue;
      const inlineCandidate = stripSubjectLabel(line);
      const nextLine = normalizedLines[index + 1] || '';
      const candidate = inlineCandidate || (
        nextLine && !isAdministrativeLine(nextLine) && !isAddressLine(nextLine) && !isPhoneLine(nextLine)
          ? nextLine
          : ''
      );
      const normalized = normalizeAIText(candidate, 'reference');
      if (normalized) return normalized;
    }
    return '';
  }

  function compactReferenceCandidate(value) {
    return String(value || '').toUpperCase().replace(/[\s.,/_\-:]/g, '');
  }

  function isIgnoredBniStandaloneCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return false;
    const compact = compactReferenceCandidate(raw);
    if (/^294\d{2}$/.test(compact)) return false; // kode pos Batam tetap dipertahankan
    if (/^[0-9O]{5,8}(?:[?*]+)?$/.test(compact)) return true;
    return /^(?:DONGDOI|DONGD0I|DONGD01|OOOOOO|OOOOO|00000O|O00000)$/i.test(compact);
  }

  function normalizeBniReference(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw || /^(?:245\s+BATAM|CABANG|CARRIAGE)$/i.test(raw)) return '';
    if (isIgnoredBniStandaloneCode(raw)) return '';

    // Tanda PERLU DICEK yang hanya berasal dari kode mandiri juga dibuang.
    if (containsReviewMarker(raw) && /(?:DONGD|OOOO|0000|KODE|TIDAK\s+TERBACA)/i.test(raw)) return '';

    // Nomor surat nyata biasanya memiliki digit dan pemisah/komponen alfabet.
    const hasDigit = /\d/.test(raw);
    const hasLetter = /[A-Z]/.test(raw);
    const hasSeparator = /[\/\-]/.test(raw);
    if (hasDigit && (hasSeparator || hasLetter)) return raw.replace(/\s+/g, ' ').trim();
    return '';
  }

  function removeIgnoredBniCodesFromAddress(value) {
    return String(value || '')
      .split(/\s*,\s*/)
      .map(part => part.trim())
      .filter(part => part && !isIgnoredBniStandaloneCode(part))
      .join(', ')
      .replace(/\b(?:DONGDOI|DONGD0I|DONGD01|OOOOOO)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/(?:,\s*){2,}/g, ', ')
      .replace(/^,\s*|\s*,$/g, '')
      .trim();
  }

  function normalizeAddressPunctuation(value) {
    return String(value || '')
      .replace(/\s*\/\s*/g, ', ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/(?:,\s*){2,}/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/^,\s*|\s*,$/g, '')
      .trim();
  }

  function extractPrintedZip(address) {
    const matches = String(address || '').match(/\b\d{5}\b/g);
    return matches?.length ? matches[matches.length - 1] : '';
  }

  function ensureBatamCity(address) {
    const value = normalizeAddressPunctuation(address);
    const zip = extractPrintedZip(value);
    if (!/^294\d{2}$/.test(zip) || /\bBATAM\b/i.test(value)) return value;
    return value.replace(new RegExp(`\\s*,?\\s*${zip}\\b`), `, BATAM ${zip}`);
  }


  const BATAM_AREA_PATTERN = /\b(?:BATAM|BATAM\s+KOTA|BELIAN|BENGKONG|BATU\s+AMPAR|BATU\s+AJI|BULANG|GALANG|LUBUK\s+BAJA|NONGSA|SAGULUNG|SEKUPANG|SEI\s+BEDUK|SUNGAI\s+BEDUK|TIBAN|BALOI|NAGOYA|JODOH|KABIL|MUKA\s+KUNING|TANJUNG\s+UNCANG|BARELANG|PIAYU|TEMBESI|PUNGGUR|TELUK\s+TERING)\b/i;

  function classifyOutsideBatam(address, aiFlag) {
    const value = normalizeAddressPunctuation(address).toUpperCase();
    const printedZip = extractPrintedZip(value);

    // Bukti lokal yang kuat selalu mengalahkan salah deteksi AI.
    if (/^294\d{2}$/.test(printedZip) || BATAM_AREA_PATTERN.test(value)) {
      return { outside: false, reason: '' };
    }

    // Kode pos tercetak di luar kelompok Kota Batam merupakan bukti yang jelas.
    if (/^\d{5}$/.test(printedZip) && !/^294\d{2}$/.test(printedZip)) {
      return { outside: true, reason: `Kode pos ${printedZip} bukan kelompok kode pos Kota Batam (294xx).` };
    }

    if (normalizeBoolean(aiFlag)) {
      return { outside: true, reason: 'AI membaca kota/kabupaten tujuan berada di luar Kota Batam.' };
    }

    return { outside: false, reason: '' };
  }

  function parseBniStructure(rawLines, fallback) {
    let lines = normalizeRawLines(rawLines)
      .filter(line => !isAdministrativeLine(line));

    const greetingIndex = lines.findIndex(line => /^(?:KEPADA\s+(?:YANG\s+TERHORMAT|YTH\.?)|YTH\.?|ATTN\.?)\b/i.test(line));
    if (greetingIndex >= 0) {
      const greeting = lines[greetingIndex];
      const remainder = stripRecipientPrefix(greeting);
      lines = lines.slice(greetingIndex + 1);
      if (remainder) lines.unshift(remainder);
    }

    lines = lines
      .map(line => stripCommonArtifacts(line))
      .filter(Boolean)
      .filter((line, index, arr) => !(line.toUpperCase() === 'PT' && arr.some(other => /\bPT\b/i.test(other) && other !== line)));

    // Kode angka mandiri dan hasil OCR rekaan atas kode itu dibuang total.
    const ignoredCodeIndexes = new Set();
    lines.forEach((line, index) => {
      if (isIgnoredBniStandaloneCode(line)) ignoredCodeIndexes.add(index);
    });

    let addressStart = lines.findIndex(isAddressLine);
    if (addressStart < 0 && fallback.address) addressStart = 1;

    const beforeAddress = addressStart > 0 ? lines.slice(0, addressStart) : [];
    const afterAddress = addressStart >= 0 ? lines.slice(addressStart) : [];

    const nameFromLines = beforeAddress
      .filter((_, index) => !ignoredCodeIndexes.has(index))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const addressFromLines = afterAddress
      .filter((_, index) => !ignoredCodeIndexes.has(addressStart + index))
      .filter(line => !isIgnoredBniStandaloneCode(line))
      .filter(line => !isPhoneLine(line) && !isReferenceLine(line))
      .join(', ');

    let name = nameFromLines || fallback.name || '';
    let address = addressFromLines || fallback.address || '';
    const noSurat = normalizeBniReference(fallback.noSurat) || extractReferenceFromLines(lines);

    name = stripRecipientMachineCodes(stripRecipientPrefix(name))
      .replace(/\bPT\s+PT\b/gi, 'PT')
      .replace(/\s+/g, ' ')
      .trim();

    address = normalizeAddressPunctuation(removeIgnoredBniCodesFromAddress(address));
    const cleanedRawLines = lines.filter((_, index) => !ignoredCodeIndexes.has(index));
    return { name, address, noSurat, rawLines: cleanedRawLines };
  }

  function looksSuspiciousRow(row) {
    if (!row.name || !row.address) return true;
    if (row.aiConfidence < SMART_CONFIDENCE_THRESHOLD) return true;
    if (row.aiReviewFields.length) return true;
    if (containsReviewMarker(`${row.name} ${row.address} ${row.noSurat}`)) return true;
    if (/^\s*(?:KEPADA|YTH|ATTN)\b/i.test(row.name)) return true;
    if (row.name.length > 72) return true;
    if (/\b(?:JL\.?|JALAN|RUKO|PERUM(?:AHAN)?|KOMP(?:LEK)?|KAVLING|GEDUNG)\b/i.test(row.name)) return true;
    if (/\b(?:CABANG|CARRIAGE|TGL\s*TRANS|TGL\s*VALUTA|NO\s*DOKUMEN|URAIAN\s+MUTASI)\b/i.test(`${row.name} ${row.address} ${row.noSurat}`)) return true;
    return false;
  }

  function normalizeRows(aiRows, template, pageOffset = 0, options = {}) {
    const core = window.__mileCore;
    const expectedPages = Array.isArray(options.expectedPages)
      ? options.expectedPages.map(Number).filter(Number.isFinite)
      : [];
    const expectedPageSet = new Set(expectedPages);
    return aiRows.map((item, index) => {
      let name = normalizeAIText(pick(item, ['nama_penerima', 'nama', 'name', 'penerima']), 'name');
      let address = normalizeAIText(pick(item, ['alamat_penerima', 'alamat', 'address', 'destination_address']), 'address');
      const rawLines = normalizeRawLines(pick(item, ['raw_lines', 'baris_mentah', 'lines', 'transcription'], []));
      const subject = pick(item, ['perihal_surat', 'perihal', 'hal', 'subject'], '');
      const directReferenceValues = ['nomor_resmi', 'nomor_surat_resmi', 'nomor', 'nomor_surat', 'no_surat', 'surat', 'ref', 'reference']
        .map(key => item?.[key])
        .filter(value => value !== undefined && value !== null && String(value).trim());
      const directReference = directReferenceValues.find(isStructuredOfficialReference) || directReferenceValues[0] || '';
      let noSurat = normalizeOfficialReference(directReference) ||
        normalizeAIText(subject, 'reference') ||
        extractReferenceFromLines(rawLines);
      let phone = normalizeAIPhone(pick(item, ['nomor_hp', 'no_hp', 'phone', 'telepon', 'telp', 'whatsapp', 'wa']), rawLines);


      const split = splitMixedNameAddress(name, address);
      name = split.name;
      address = ensureBatamCity(removeIgnoredBniCodesFromAddress(split.address));
      if (/^(?:245\s+BATAM|CABANG|CARRIAGE)$/i.test(noSurat) || isIgnoredBniStandaloneCode(noSurat)) noSurat = '';
      const cleanedRawLines = rawLines.filter(line => !isIgnoredBniStandaloneCode(line));

      const fallbackPage = expectedPages[index] || pageOffset + index + 1;
      const parsedPage = Number(pick(item, ['page', 'halaman', 'page_number'], fallbackPage)) || fallbackPage;
      const page = expectedPageSet.size && !expectedPageSet.has(parsedPage) ? fallbackPage : parsedPage;
      const outsideAssessment = classifyOutsideBatam(
        address,
        pick(item, ['di_luar_batam', 'luar_batam', 'outside_batam'], false)
      );
      const outsideBatam = outsideAssessment.outside;
      let aiReviewFields = normalizeReviewFields(pick(item, ['perlu_dicek_fields', 'review_fields', 'uncertain_fields'], []));
      if (containsReviewMarker(noSurat) && !aiReviewFields.includes('nomor_surat')) aiReviewFields.push('nomor_surat');
      if (containsReviewMarker(phone) && !aiReviewFields.includes('nomor_hp')) aiReviewFields.push('nomor_hp');
      if (containsReviewMarker(name) && !aiReviewFields.includes('nama_penerima')) aiReviewFields.push('nama_penerima');
      if (containsReviewMarker(address) && !aiReviewFields.includes('alamat_penerima')) aiReviewFields.push('alamat_penerima');

      const rawConfidence = pick(item, ['confidence', 'keyakinan', 'score'], null);
      const hasConfidence = rawConfidence !== null && rawConfidence !== '';
      // Prompt ringkas tidak lagi meminta confidence. Baris bersih dianggap mantap;
      // penanda PERLU DICEK/review_fields tetap memicu audit selektif.
      const aiConfidence = hasConfidence
        ? clampConfidence(rawConfidence)
        : (aiReviewFields.length ? 0.74 : 0.95);
      const printedZip = extractPrintedZip(address);
      const zip = printedZip || (core?.getZipCodeFromAddress ? core.getZipCodeFromAddress(address, template) : '29411');
      const row = {
        noSurat, name, phone: phone || '0', zip, address,
        act: 0.2, p: 10, l: 10, t: 10, cw: '0.20',
        outsideBatam, outsideBatamReason: outsideAssessment.reason,
        sourcePage: page, aiConfidence, aiReviewFields,
        rawLines: cleanedRawLines, bniMode: false
      };
      row.needsVerification = looksSuspiciousRow(row);
      return row;
    }).filter(row => row.name || row.address || row.noSurat);
  }

  function rowsForVerification(rows) {
    return rows.map(row => ({
      page: row.sourcePage,
      nama_penerima: row.name,
      alamat_penerima: row.address,
      nomor_hp: row.phone === '0' ? '' : row.phone,
      nomor_surat: row.noSurat,
      di_luar_batam: row.outsideBatam,
      perlu_dicek_fields: row.aiReviewFields
    }));
  }

  function verificationPages(config, rows, expectedPages = []) {
    const profile = IMAGE_PROFILES[config.accuracyMode] || IMAGE_PROFILES[DEFAULT_ACCURACY_MODE];
    const policy = ['all', 'none'].includes(profile.verify)
      ? profile.verify
      : (config.verificationPolicy || profile.verify);
    const expected = [...new Set((expectedPages.length ? expectedPages : rows.map(row => row.sourcePage))
      .map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
    if (policy === 'none') return [];
    if (policy === 'all') return expected;

    const rowsByPage = new Map();
    rows.forEach(row => {
      const page = Number(row.sourcePage);
      if (!Number.isFinite(page)) return;
      const list = rowsByPage.get(page) || [];
      list.push(row);
      rowsByPage.set(page, list);
    });

    const audit = new Set();
    expected.forEach(page => {
      const pageRows = rowsByPage.get(page) || [];
      if (pageRows.length !== 1 || pageRows.some(row => row.needsVerification || looksSuspiciousRow(row))) audit.add(page);
    });
    return [...audit].sort((a, b) => a - b);
  }

  function shouldVerifyChunk(config, rows, expectedPages = []) {
    return verificationPages(config, rows, expectedPages).length > 0;
  }

  function mergeVerifiedRows(originalRows, verifiedRows, auditedPages = []) {
    const audited = new Set(auditedPages.map(Number).filter(Number.isFinite));
    const originalByPage = new Map();
    originalRows.forEach(row => {
      const page = Number(row.sourcePage);
      if (!originalByPage.has(page)) originalByPage.set(page, row);
    });
    const verifiedByPage = new Map();
    verifiedRows.forEach(row => {
      const page = Number(row.sourcePage);
      if (!audited.has(page)) return;
      const list = verifiedByPage.get(page) || [];
      const original = originalByPage.get(page);
      const preserveOfficialReference = original?.noSurat && isStructuredOfficialReference(original.noSurat) && !isStructuredOfficialReference(row.noSurat);
      const preserveMissingReference = !row.noSurat && original?.noSurat;
      list.push(preserveOfficialReference || preserveMissingReference ? { ...row, noSurat: original.noSurat } : row);
      verifiedByPage.set(page, list);
    });

    const merged = originalRows.filter(row => !audited.has(Number(row.sourcePage)) || !verifiedByPage.has(Number(row.sourcePage)));
    auditedPages.forEach(page => {
      const replacements = verifiedByPage.get(Number(page));
      if (replacements?.length) merged.push(...replacements);
    });
    return merged.sort((a, b) => Number(a.sourcePage || 0) - Number(b.sourcePage || 0));
  }

  function readBaseUsage(payload, protocol) {
    if (protocol === 'anthropic') {
      return { input: payload?.usage?.input_tokens || 0, output: payload?.usage?.output_tokens || 0 };
    }
    return {
      input: payload?.usage?.prompt_tokens || payload?.usage?.input_tokens || 0,
      output: payload?.usage?.completion_tokens || payload?.usage?.output_tokens || 0
    };
  }

  function getUsage(payload, protocol) {
    const base = readBaseUsage(payload, protocol);
    const extra = payload?._mileAdditionalUsage || {};
    return {
      input: Number(base.input || 0) + Number(extra.input || 0),
      output: Number(base.output || 0) + Number(extra.output || 0)
    };
  }

  async function testConnection() {
    const button = $('testAiConnection');
    try {
      const configured = await checkServerConfiguration({ showFeedback: true });
      if (!configured) {
        throw new Error('Konfigurasi Secure Gateway belum lengkap. Periksa tiga secret Cloudflare lalu deploy ulang.');
      }
      const config = getConfig();
      saveNonSecretConfig();
      button.disabled = true;
      button.textContent = 'Menguji layanan AI…';
      setFeedback(`Menguji layanan AI dengan model ${config.model}…`);
      // Gunakan bentuk payload produksi agar tes tidak memberi hasil positif
      // palsu ketika teks sederhana berhasil tetapi structured output gagal.
      const body = buildApiBody(
        config,
        'Balas hanya dengan JSON valid persis seperti ini: {"rows":[]}',
        [],
        1200
      );
      const payload = await callCosmos(config, body);
      parseRows(payload, 'openai');
      const text = extractTextFromResponse(payload, 'openai').trim().slice(0, 120);
      const usage = getUsage(payload, 'openai');
      const usageText = usage.input || usage.output ? ` · ${formatUsage(usage)}` : '';
      const transportText = payload?._mileTransport ? ` melalui ${payload._mileTransport}` : '';
      setFeedback(`Layanan AI siap${transportText}. Respons: ${text || 'OK'}${usageText}`, 'success');
      showToast('Layanan AI siap digunakan.', 'success');
    } catch (error) {
      setFeedback(`Tes layanan AI gagal: ${error.message}`, 'error');
      showToast(`Tes layanan AI gagal: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Tes layanan AI';
      refreshConfigStatus();
    }
  }

  async function processPDFFile(file) {
    const core = window.__mileCore;
    if (!core) {
      alert('Aplikasi mile.posnew.com belum siap. Muat ulang halaman.');
      return;
    }
    cancelled = false;
    runtimeFallbackModel = '';
    fallbackAnnounced = false;
    betaRemoteFallbackAnnounced = false;
    const startedAt = performance.now();
    startStopwatch(startedAt);
    setProgress(1, 'Memeriksa berkas dan koneksi', 'Validasi PDF dan layanan AI sedang dilakukan…');
    setTransferProgress(0, 'Belum ada data yang dikirim');
    setProgressStats({ renderedPages: 0, totalPages: 0, completedChunks: 0, totalChunks: 0 });

    let config;
    try {
      if (!file || file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) throw new Error('Berkas bukan PDF.');
      if (file.size > MAX_PDF_BYTES) throw new Error('Ukuran PDF melebihi 80 MB. Kompres PDF lalu coba lagi.');
      if (typeof window.pdfjsLib === 'undefined') throw new Error('Library pembaca PDF gagal dimuat. Periksa koneksi lalu muat ulang halaman.');
      const configured = await checkServerConfiguration({ showFeedback: true });
      if (!configured) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        throw new Error('Layanan AI belum dapat dijangkau. Periksa sinyal internet atau konfigurasi server lalu coba lagi.');
      }
      config = getConfig();
      saveNonSecretConfig();
    } catch (error) {
      const elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
      stopStopwatch(elapsed, 0);
      hideProgress();
      $('aiConfigPanel')?.setAttribute('open', '');
      showToast(error?.name === 'AbortError' ? 'Proses PDF dibatalkan.' : error.message, error?.name === 'AbortError' ? 'info' : 'error');
      core.processNextInQueue();
      return;
    }

    let pdf = null;
    let pageCount = 0;
    let completedRowCount = 0;
    const totalUsage = { input: 0, output: 0 };
    const betaJobId = createBetaJobId();
    const betaPerf = { renderMs: 0, uploadMs: 0, aiMs: 0, auditMs: 0, remotePages: 0, base64Pages: 0 };
    const runRender = createTaskPool(BETA_PREPARE_CONCURRENCY);
    try {
      setProgress(2, 'Membaca PDF', `Membuka ${file.name}…`);
      setTransferProgress(0, `Membaca ${formatBytes(file.size)} dari perangkat`);
      const bytes = await fileToArrayBuffer(file, (loaded, total) => {
        const ratio = total ? loaded / total : 0;
        setProgress(1 + ratio * 2, 'Membaca PDF', `${formatBytes(loaded)} dari ${formatBytes(total)} telah dibaca dari perangkat.`);
        setTransferProgress(ratio * 100, 'Membaca PDF dari perangkat');
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs/pdf.worker.min.js?v=20260909-beta-r2.1';
      pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      pageCount = pdf.numPages;
      if (pdf.numPages > MAX_PAGES) throw new Error(`PDF memiliki ${pdf.numPages} halaman. Batas maksimal adalah ${MAX_PAGES} halaman.`);
      if (pdf.numPages > 150) showToast('PDF besar terdeteksi. Biarkan tab tetap terbuka sampai proses selesai.', 'info');
      setTransferProgress(0, 'PDF siap · belum mengirim gambar halaman');

      config = {
        ...config,
        bniMode: false,
        accuracyMode: config.accuracyMode === 'auto' ? 'balanced' : config.accuracyMode
      };

      betaRemoteImagesAvailable = lastBetaImagesConfigured;
      setProgress(4, 'Menyiapkan halaman pertama', betaRemoteImagesAvailable
        ? 'Jalur gambar sementara siap · pemrosesan langsung dimulai.'
        : 'Jalur gambar sementara belum tersedia · memakai jalur cadangan.');
      setTransferProgress(0, betaRemoteImagesAvailable ? 'Mulai menyiapkan gambar halaman' : 'Jalur cadangan aktif');

      const chunks = [];
      for (let start = 1; start <= pdf.numPages; start += config.pagesPerRequest) {
        chunks.push({ start, end: Math.min(pdf.numPages, start + config.pagesPerRequest - 1) });
      }

      const results = new Array(chunks.length);
      const chunkStates = chunks.map(() => ({ progress: 0, phase: 'Menunggu', waiting: false }));
      let completedChunks = 0;
      let renderedPages = 0;
      let rowsFound = 0;
      let firstCompletedAt = 0;

      const updateParallelProgress = (chunk, chunkIndex, phase = 'AI') => {
        const state = chunkStates[chunkIndex];
        if (state) state.phase = phase;
        const elapsed = (performance.now() - startedAt) / 1000;
        const throughput = completedChunks ? completedChunks / Math.max(1, elapsed) : 0;
        const remainingChunks = Math.max(0, chunks.length - completedChunks);
        const eta = throughput ? ` · estimasi sisa ${formatDuration(remainingChunks / throughput)}` : '';
        const aggregate = chunkStates.reduce((sum, item) => sum + Number(item.progress || 0), 0) / Math.max(1, chunkStates.length);
        const percent = 5 + aggregate * 90;
        setProgress(
          percent,
          `${phase} halaman ${chunk.start}–${chunk.end}`,
          `${renderedPages}/${pdf.numPages} halaman siap · ${completedChunks}/${chunks.length} kelompok selesai · ${rowsFound} baris ditemukan${eta}`,
          formatUsage(totalUsage)
        );
        setProgressStats({ renderedPages, totalPages: pdf.numPages, completedChunks, totalChunks: chunks.length });
      };

      const makeTransportHooks = (chunk, chunkIndex, label, startWeight, waitWeight, completeWeight) => ({
        onAttempt(attempt, maxAttempts, model) {
          chunkStates[chunkIndex].waiting = false;
          chunkStates[chunkIndex].progress = Math.max(chunkStates[chunkIndex].progress, startWeight);
          setTransferProgress(0, `${label} halaman ${chunk.start}–${chunk.end} · ${model} · percobaan ${attempt}/${maxAttempts}`);
          updateParallelProgress(chunk, chunkIndex, label);
        },
        onTransport(event) {
          const total = Number(event.total || 0);
          const ratio = total ? Math.max(0, Math.min(1, Number(event.loaded || 0) / total)) : 0;
          if (event.repair && event.phase === 'encoding') {
            chunkStates[chunkIndex].progress = Math.max(chunkStates[chunkIndex].progress, startWeight);
            setTransferProgress(0, `Memperbaiki format JSON halaman ${chunk.start}–${chunk.end} tanpa mengirim ulang gambar`);
          } else if (event.phase === 'encoding') {
            chunkStates[chunkIndex].progress = Math.max(chunkStates[chunkIndex].progress, startWeight);
            setTransferProgress(0, `Mengemas gambar halaman ${chunk.start}–${chunk.end}`);
          } else if (event.phase === 'ready') {
            setTransferProgress(0, `${formatBytes(total)} siap dikirim untuk halaman ${chunk.start}–${chunk.end}`);
          } else if (event.phase === 'uploading') {
            chunkStates[chunkIndex].waiting = false;
            chunkStates[chunkIndex].progress = Math.max(chunkStates[chunkIndex].progress, startWeight + (waitWeight - startWeight) * ratio);
            setTransferProgress(ratio * 100, `Mengunggah ${formatBytes(event.loaded)} dari ${formatBytes(total)} · halaman ${chunk.start}–${chunk.end}`);
          } else if (event.phase === 'waiting') {
            chunkStates[chunkIndex].waiting = true;
            chunkStates[chunkIndex].progress = Math.max(chunkStates[chunkIndex].progress, waitWeight);
            setTransferProgress(100, `Upload halaman ${chunk.start}–${chunk.end} selesai · menunggu respons AI`, { waiting: true });
          } else if (event.phase === 'complete') {
            chunkStates[chunkIndex].waiting = false;
            chunkStates[chunkIndex].progress = Math.max(chunkStates[chunkIndex].progress, completeWeight);
            setTransferProgress(100, `Respons AI halaman ${chunk.start}–${chunk.end} diterima`);
          }
          updateParallelProgress(chunk, chunkIndex, label);
        },
        onRetry({ nextAttempt, maxAttempts, delay }) {
          chunkStates[chunkIndex].waiting = false;
          setTransferProgress(0, `Jaringan terganggu · percobaan ${nextAttempt}/${maxAttempts} dalam ${formatDuration(delay / 1000)}`, { error: true });
          updateParallelProgress(chunk, chunkIndex, `Menyiapkan retry ${nextAttempt}/${maxAttempts}`);
        },
        onFallback({ to }) {
          chunkStates[chunkIndex].waiting = false;
          setTransferProgress(0, `Gemini 3.7 terkendala · beralih otomatis ke ${to}`, { waiting: true });
          updateParallelProgress(chunk, chunkIndex, 'Fallback ke Qwen 3.7 Flash');
        },
        onRepair() {
          setTransferProgress(100, `Respons halaman ${chunk.start}–${chunk.end} lengkap tetapi JSON perlu dirapikan`, { waiting: true });
          updateParallelProgress(chunk, chunkIndex, 'Memperbaiki JSON');
        }
      });

      async function prepareChunk(chunk, chunkIndex) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        chunkStates[chunkIndex].progress = 0.01;
        updateParallelProgress(chunk, chunkIndex, 'Menyiapkan gambar scan');
        const pageSources = [];
        const pagesInChunk = chunk.end - chunk.start + 1;
        let nextPageNumber = chunk.start;
        async function preparePageWorker() {
          while (true) {
            const pageNumber = nextPageNumber++;
            if (pageNumber > chunk.end) return;
            if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
            markProgressActivity(`Merender scan ${pageNumber}/${pdf.numPages}`);
            updateParallelProgress(chunk, chunkIndex, `Merender scan ${pageNumber}`);
            const page = await pdf.getPage(pageNumber);
            try {
              const blob = await runRender(async () => {
                const renderStartedAt = performance.now();
                try {
                  return await renderPageToLightBlob(page, config.accuracyMode, config.speedPreset, config.networkProfile);
                } finally {
                  betaPerf.renderMs += performance.now() - renderStartedAt;
                }
              });
              let url = '';
              let remote = false;
              if (betaRemoteImagesAvailable) {
                markProgressActivity(`Mengirim gambar ${pageNumber}/${pdf.numPages}`);
                setTransferProgress(0, `Mengirim gambar halaman ${pageNumber}/${pdf.numPages}`);
                const uploadStartedAt = performance.now();
                try {
                  url = await uploadBetaImage(betaJobId, pageNumber, 'first', blob);
                  remote = true;
                  betaPerf.remotePages++;
                } catch (uploadError) {
                  betaRemoteImagesAvailable = false;
                  if (!betaRemoteFallbackAnnounced) {
                    betaRemoteFallbackAnnounced = true;
                    showToast('Pengiriman gambar sementara terhenti. Halaman berikutnya otomatis memakai jalur cadangan.', 'info');
                  }
                  url = await blobToDataUrl(blob);
                  betaPerf.base64Pages++;
                } finally {
                  betaPerf.uploadMs += performance.now() - uploadStartedAt;
                }
              } else {
                url = await blobToDataUrl(blob);
                betaPerf.base64Pages++;
              }
              pageSources[pageNumber - chunk.start] = {
                page: pageNumber,
                url,
                remote,
                sourceType: 'image'
              };
              renderedPages++;
              const renderedInChunk = pageSources.filter(Boolean).length;
              chunkStates[chunkIndex].progress = 0.03 + (renderedInChunk / pagesInChunk) * 0.22;
              updateParallelProgress(chunk, chunkIndex, `Gambar scan halaman ${pageNumber} siap`);
              await yieldToBrowser();
            } finally {
              page.cleanup();
            }
          }
        }
        const pageWorkerCount = Math.min(BETA_PREPARE_CONCURRENCY, pagesInChunk);
        await Promise.all(Array.from({ length: pageWorkerCount }, () => preparePageWorker()));

        return pageSources;
      }

      async function processChunk(chunk, chunkIndex, pageSources) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        const pagesInChunk = chunk.end - chunk.start + 1;
        const expectedPages = Array.from({ length: pagesInChunk }, (_, index) => chunk.start + index);

        chunkStates[chunkIndex].progress = 0.27;
        updateParallelProgress(chunk, chunkIndex, 'Ekstraksi pertama');
        const extractionSources = pageSources.map(source => ({
          page: source.page,
          label: `HALAMAN ${source.page}`,
          url: source.url || ''
        }));

        const body = buildApiBody(
          config,
          buildPrompt(chunk.start, chunk.end, config),
          extractionSources,
          extractionTokenLimit(pagesInChunk)
        );
        const aiStartedAt = performance.now();
        const payload = await callProxyWithRetry(
          config,
          body,
          `halaman ${chunk.start}–${chunk.end}`,
          makeTransportHooks(chunk, chunkIndex, 'Ekstraksi pertama', 0.28, 0.53, 0.62)
        ).finally(() => {
          betaPerf.aiMs += performance.now() - aiStartedAt;
        });
        let usage = getUsage(payload, config.protocol);
        totalUsage.input += Number(usage.input || 0);
        totalUsage.output += Number(usage.output || 0);
        const template = $('corporateTemplate')?.value || 'MANUAL';
        let normalized = normalizeRows(
          parseRows(payload, config.protocol),
          template,
          chunk.start - 1,
          { ...config, expectedPages }
        );

        const auditPages = verificationPages(config, normalized, expectedPages);
        if (auditPages.length) {
          chunkStates[chunkIndex].progress = Math.max(chunkStates[chunkIndex].progress, 0.66);
          updateParallelProgress(chunk, chunkIndex, `Audit selektif ${auditPages.length} halaman`);
          const verificationImages = [];
          for (const pageNumber of auditPages) {
            const source = pageSources.find(item => item.page === pageNumber);
            if (!source) continue;
            const auditStartedAt = performance.now();
            const page = await pdf.getPage(pageNumber);
            let auditUrl = '';
            try {
              const rendered = await runRender(() => renderPageToImage(page, config.accuracyMode, config.speedPreset, config.networkProfile, true));
              auditUrl = rendered.detailUrl || rendered.fullUrl;
              if (betaRemoteImagesAvailable) {
                try {
                  auditUrl = await uploadBetaImage(betaJobId, pageNumber, 'audit', dataUrlToBlob(auditUrl));
                } catch (_) {
                  betaRemoteImagesAvailable = false;
                }
              }
            } finally {
              page.cleanup();
              betaPerf.auditMs += performance.now() - auditStartedAt;
            }
            verificationImages.push({
              page: source.page,
              label: `HALAMAN ${source.page} — ZOOM AUDIT`,
              url: auditUrl || source.url
            });
          }

          const draftRows = rowsForVerification(
            normalized.filter(row => auditPages.includes(Number(row.sourcePage)))
          );

          const verificationBody = buildApiBody(
            config,
            buildVerificationPrompt(chunk.start, chunk.end, draftRows, { ...config, pages: auditPages }),
            verificationImages,
            verificationTokenLimit(auditPages.length)
          );
          const auditAiStartedAt = performance.now();
          const verifiedPayload = await callProxyWithRetry(
            config,
            verificationBody,
            `audit halaman ${auditPages.join(', ')}`,
            makeTransportHooks(chunk, chunkIndex, 'Audit selektif', 0.68, 0.85, 0.93)
          ).finally(() => {
            betaPerf.aiMs += performance.now() - auditAiStartedAt;
          });
          usage = getUsage(verifiedPayload, config.protocol);
          totalUsage.input += Number(usage.input || 0);
          totalUsage.output += Number(usage.output || 0);
          const verifiedRows = normalizeRows(
            parseRows(verifiedPayload, config.protocol),
            template,
            chunk.start - 1,
            { ...config, expectedPages: auditPages }
          );
          normalized = mergeVerifiedRows(normalized, verifiedRows, auditPages);
        }

        results[chunkIndex] = normalized;
        rowsFound += normalized.length;
        completedChunks++;
        chunkStates[chunkIndex].waiting = false;
        chunkStates[chunkIndex].progress = 1;
        if (!firstCompletedAt) firstCompletedAt = performance.now();
        updateParallelProgress(chunk, chunkIndex, 'Selesai');
      }

      const workerCount = Math.min(config.concurrency, chunks.length);
      const limitedByNetwork = config.pagesPerRequest !== config.requestedPagesPerRequest || config.concurrency !== config.requestedConcurrency;
      const networkExplanation = limitedByNetwork
        ? `Profil ${config.networkProfile.label} membatasi sementara menjadi ${config.pagesPerRequest} halaman × ${workerCount} jalur agar stabil.`
        : `Profil ${config.networkProfile.label} memakai ${config.pagesPerRequest} halaman × ${workerCount} jalur.`;
      const imageTransport = betaRemoteImagesAvailable ? 'jalur gambar sementara' : 'jalur cadangan';
      setProgress(5, 'Memulai mode ringan cepat', `${chunks.length} kelompok disiapkan. Maksimal dua halaman dibuat bersamaan, ${networkExplanation} Pengiriman: ${imageTransport}.`, formatUsage(totalUsage));
      setProgressStats({ renderedPages: 0, totalPages: pdf.numPages, completedChunks: 0, totalChunks: chunks.length });
      setTransferProgress(0, 'Menyiapkan gambar kelompok pertama');
      const runAI = createTaskPool(workerCount);
      const processTasks = [];
      let pipelineError = null;
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        if (pipelineError) break;
        const chunk = chunks[chunkIndex];
        const pageSources = await prepareChunk(chunk, chunkIndex);
        if (pipelineError) break;
        const task = runAI(async () => {
          if (pipelineError) return;
          await processChunk(chunk, chunkIndex, pageSources);
        }).catch(error => {
          pipelineError ||= error;
        });
        processTasks.push(task);
      }
      await Promise.all(processTasks);
      if (pipelineError) throw pipelineError;
      setTransferProgress(100, 'Semua respons AI telah diterima');

      const mergedRows = results.flat().filter(Boolean);
      if (!mergedRows.length) throw new Error('AI tidak menemukan data penerima pada PDF ini.');
      mergedRows.sort((a, b) => Number(a.sourcePage || 0) - Number(b.sourcePage || 0));
      completedRowCount = mergedRows.length;
      const elapsed = (performance.now() - startedAt) / 1000;
      stopStopwatch(elapsed, mergedRows.length);
      setProgress(
        98,
        'Menyiapkan tabel',
        `${mergedRows.length} baris hasil ekstraksi sedang dimasukkan ke tabel. Total ${formatPreciseDuration(elapsed)} · ${(elapsed / mergedRows.length).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} detik/data.`,
        formatUsage(totalUsage)
      );

      const metrics = {
        status: 'SUCCESS',
        fileCount: 1,
        pageCount,
        model: runtimeFallbackModel ? `${config.model} -> ${runtimeFallbackModel}` : config.model,
        chunkSize: config.pagesPerRequest,
        concurrency: config.concurrency,
        durationSeconds: Number(elapsed.toFixed(3)),
        totalRows: mergedRows.length,
        reviewCount: reviewRowCount(mergedRows),
        outsideBatamCount: outsideBatamRowCount(mergedRows),
        message: `beta-r2;remote=${betaPerf.remotePages};base64=${betaPerf.base64Pages};render_ms=${Math.round(betaPerf.renderMs)};upload_ms=${Math.round(betaPerf.uploadMs)};ai_sum_ms=${Math.round(betaPerf.aiMs)};audit_ms=${Math.round(betaPerf.auditMs)}`
      };
      void submitProcessingMetrics(metrics);

      const itemType = $('itemType')?.value || 'DOKUMEN';
      if (itemType === 'PAKET') {
        core.tempExtractedRows = mergedRows;
        hideProgress();
        core.showWeightModal();
      } else {
        core.uploadedFilesManager.push({ id: Date.now(), name: file.name, rows: mergedRows, source: 'AI PDF' });
        core.updateInterface();
        setProgress(100, 'Selesai', `${mergedRows.length} baris berhasil diekstrak dalam ${formatPreciseDuration(elapsed)} (${(elapsed / mergedRows.length).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} detik/data). Mode ringan: penyiapan ${formatPreciseDuration(betaPerf.renderMs / 1000)}, pengiriman ${formatPreciseDuration(betaPerf.uploadMs / 1000)}, gambar sementara ${betaPerf.remotePages}/${pageCount} halaman.`, formatUsage(totalUsage));
        progressHideTimeout = window.setTimeout(hideProgress, 1200);
        showToast(`${mergedRows.length} data selesai dalam ${formatPreciseDuration(elapsed)} · ${(elapsed / mergedRows.length).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} detik/data.`, 'success');
        core.processNextInQueue();
      }
    } catch (error) {
      if (error?.name !== 'AbortError') cancelled = true;
      const elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
      stopStopwatch(elapsed, completedRowCount);
      const failedMetrics = {
        status: error?.name === 'AbortError' ? 'CANCELLED' : 'FAILED',
        fileCount: 1,
        pageCount,
        model: runtimeFallbackModel && config?.model === DEFAULT_MODEL ? `${config.model} -> ${runtimeFallbackModel}` : (config?.model || ''),
        chunkSize: config?.pagesPerRequest || 1,
        concurrency: config?.concurrency || 1,
        durationSeconds: Number(elapsed.toFixed(3)),
        totalRows: completedRowCount,
        reviewCount: 0,
        outsideBatamCount: 0,
        message: error?.name === 'AbortError' ? 'Dibatalkan pengguna' : String(error?.message || 'Kesalahan pemrosesan').slice(0, 240)
      };
      void submitProcessingMetrics(failedMetrics);
      hideProgress();
      if (error?.name === 'AbortError') showToast(`Proses PDF dibatalkan setelah ${formatPreciseDuration(elapsed)}.`, 'info');
      else showToast(`Gagal memproses PDF setelah ${formatPreciseDuration(elapsed)}: ${error.message}`, 'error');
      core.processNextInQueue();
    } finally {
      activeControllers.forEach(controller => controller.abort());
      activeControllers.clear();
      await cleanupBetaImages(betaJobId);
      try { pdf?.cleanup?.(); pdf?.destroy?.(); } catch (_) {}
    }
  }

  function cancelProcess() {
    cancelled = true;
    setTransferProgress(0, 'Membatalkan proses…');
    activeControllers.forEach(controller => controller.abort());
    activeControllers.clear();
  }

  function bind() {
    loadNonSecretConfig();
    updateSpeedPresetHint();
    updateNetworkModeHint();
    ['aiModel', 'aiAccuracyMode'].forEach(id => {
      $(id)?.addEventListener('change', saveNonSecretConfig);
      $(id)?.addEventListener('input', saveNonSecretConfig);
    });
    $('aiSpeedPreset')?.addEventListener('change', event => {
      const preset = event.target.value;
      if (preset !== 'custom') applySpeedPreset(preset);
      else { updateSpeedPresetHint(); saveNonSecretConfig(); }
    });
    $('aiNetworkMode')?.addEventListener('change', () => {
      updateNetworkModeHint();
      saveNonSecretConfig();
    });
    ['aiPagesPerRequest', 'aiConcurrency'].forEach(id => {
      $(id)?.addEventListener('change', markSpeedPresetCustom);
      $(id)?.addEventListener('input', markSpeedPresetCustom);
    });
    $('testAiConnection')?.addEventListener('click', testConnection);
    $('cancelAiProcess')?.addEventListener('click', cancelProcess);
    window.addEventListener('online', () => {
      updateNetworkModeHint();
      refreshProgressHeartbeat();
      showToast('Koneksi jaringan terdeteksi. Proses berjalan seperti biasa.', 'success');
    });
    window.addEventListener('offline', () => {
      updateNetworkModeHint();
      refreshProgressHeartbeat();
      showToast('Status LAN berubah. Aplikasi tetap mencoba server dan akan mengulang otomatis bila diperlukan.', 'info');
    });
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    connection?.addEventListener?.('change', updateNetworkModeHint);
    refreshConfigStatus();
    checkServerConfiguration();
  }

  window.MileAI = {
    processPDFFile,
    testConnection,
    cancel: cancelProcess,
    _test: { normalizeEndpoint, findBalancedJson, parseRows, normalizeRows, buildApiBody, buildJsonRepairBody, buildPrompt, buildVerificationPrompt, extractionTokenLimit, verificationTokenLimit, callViaProxy, callProxyWithRetry, isAutoFallbackEligible, stripRecipientPrefix, stripRecipientMachineCodes, isRecipientMachineCode, stripSubjectLabel, stripOfficialReferenceLabel, compactOfficialReference, isStructuredOfficialReference, normalizeOfficialReference, extractReferenceFromLines, stripCommonArtifacts, splitMixedNameAddress, shouldVerifyChunk, verificationPages, mergeVerifiedRows, normalizeBniReference, isIgnoredBniStandaloneCode, removeIgnoredBniCodesFromAddress, parseBniStructure, extractPrintedZip, classifyOutsideBatam, formatPreciseDuration, formatStopwatch, formatBytes, resolveNetworkProfile, createTaskPool, reviewRowCount, outsideBatamRowCount, getUsage }
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
