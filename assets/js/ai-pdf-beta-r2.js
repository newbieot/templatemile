/* mile.posnew.com beta AI PDF runtime — DeepSeek R2 URL default pipeline */
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
    fast: { pagesPerRequest: 15, concurrency: 5, verification: 'none', label: 'Turbo Langsung' },
    custom: { verification: 'smart', label: 'Kustom' }
  };
  const DEFAULT_ACCURACY_MODE = 'auto';
  const DEFAULT_SPEED_PRESET = 'fast';
  const DEFAULT_NETWORK_MODE = 'normal';
  const FIRST_PASS_MAX_SIDE = 1150;
  const AUDIT_MAX_SIDE = 2600;
  const FIRST_PASS_JPEG_QUALITY = 0.72;
  const AUDIT_JPEG_QUALITY = 0.91;
  const MAX_JSON_REPAIR_CHARS = 48000;
  const SMART_CONFIDENCE_THRESHOLD = 0.82;
  const MAX_RETRIES = 3;
  const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;
  const GEMINI_REQUEST_TIMEOUT_MS = 75 * 1000;
  const GEMINI_MAX_ATTEMPTS = 2;
  const GEMINI_RETRY_DELAY_MS = 500;
  const CAMERA_REQUEST_TIMEOUT_MS = 35 * 1000;
  const CAMERA_MODEL_MAX_ATTEMPTS = 1;
  const UPLOAD_STALL_TIMEOUT_MS = 45 * 1000;
  const HEALTH_TIMEOUT_MS = 15 * 1000;
  const STORAGE_KEY = 'mile-ai-config-beta-r2-v8';
  const BETA_UPLOAD_TIMEOUT_MS = 15 * 1000;
  const BETA_PREPARE_CONCURRENCY = 2;
  const BETA_INITIAL_AI_CONCURRENCY = 5;
  const BETA_MAX_AI_CONCURRENCY = 5;
  const BETA_PROBE_CODE = 'MILE38';
  const COSMOS_BASE_URL = 'https://api.cosmoshub.tech/v1';
  const COSMOS_ENDPOINT = `${COSMOS_BASE_URL}/chat/completions`;
  const COSMOS_MODELS = new Set([
    'claude-opus-5','claude-sonnet-4.5','claude-haiku-4.5',
    'gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.1-pro',
    'deepseek-v4.1-flash','deepseek-v4-pro',
    'qwen-3.8-flash','qwen-3.7-plus','qwen-3.7-flash',
    'glm-5.3','glm-5.3-flashx','glm-5.3-flash'
  ]);
  const GEMINI_38_MODEL = 'gemini-3.8-flash';
  const GLM_FLASHX_MODEL = 'glm-5.3-flashx';
  const DEEPSEEK_R2_MODEL = 'deepseek-v4.1-flash';
  const DEFAULT_MODEL = DEEPSEEK_R2_MODEL;
  const CAMERA_DEFAULT_MODEL = 'gemini-3.8-flash';
  const CAMERA_WAVE_SIZE = 15;
  const CAMERA_BATCH_SIZE = 3;
  const CAMERA_AI_CONCURRENCY = 4;
  const CAMERA_DIRECT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
  // New captures are WebP <= 2 MB. Also preserve older JPEGs up to 4 MB:
  // five original 4 MB images still fit the gateway's 28 MB JSON/base64 limit.
  const CAMERA_DIRECT_BATCH_RAW_BYTES = 20 * 1024 * 1024;
  const CAMERA_MODELS = new Set([
    'glm-5.3-flashx', 'glm-5.3', 'glm-5.3-flash',
    'gemini-3.8-flash', 'gemini-3.7-flash',
    'deepseek-v4.1-flash', 'deepseek-v4-pro'
  ]);
  const PRIMARY_FALLBACK_MODEL = 'gemini-3.7-flash';
  const SECONDARY_FALLBACK_MODEL = 'gemini-3.6-flash';
  const CAMERA_GEMINI_FALLBACK_CHAIN = Object.freeze([GEMINI_38_MODEL, PRIMARY_FALLBACK_MODEL, GLM_FLASHX_MODEL]);
  const GEMINI_FALLBACK_CHAIN = Object.freeze([GEMINI_38_MODEL, PRIMARY_FALLBACK_MODEL, SECONDARY_FALLBACK_MODEL]);
  const activeControllers = new Set();
  let cancelled = false;
  const fallbackAnnouncements = new Set();
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
  let progressLaneStates = [];

  const $ = id => document.getElementById(id);

  function pageDefaultModel() {
    const configured = String(document.body?.dataset?.pdfDefaultModel || '').trim();
    return COSMOS_MODELS.has(configured) ? configured : DEFAULT_MODEL;
  }

  function isGeminiModel(model) {
    return String(model || '').startsWith('gemini-');
  }

  function adaptRequestBodyForModel(body, model) {
    const adapted = { ...body, model };
    if (isGeminiModel(model)) {
      delete adapted.response_format;
      delete adapted.temperature;
      delete adapted.top_p;
    } else {
      adapted.response_format ||= { type: 'json_object' };
      adapted.temperature ??= 0;
      adapted.top_p ??= 0.1;
    }
    return adapted;
  }

  function isCameraDirectMode() {
    return Boolean(document.body?.classList?.contains('camera-mode'));
  }

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
    const cameraDirect = isCameraDirectMode();
    const protocol = 'openai';
    const selectedModel = String($('aiModel')?.value || (cameraDirect ? CAMERA_DEFAULT_MODEL : pageDefaultModel())).trim();
    const model = cameraDirect && !CAMERA_MODELS.has(selectedModel) ? CAMERA_DEFAULT_MODEL : selectedModel;
    const accuracyMode = IMAGE_PROFILES[$('aiAccuracyMode')?.value] ? $('aiAccuracyMode').value : DEFAULT_ACCURACY_MODE;
    const speedPreset = SPEED_PRESETS[$('aiSpeedPreset')?.value] ? $('aiSpeedPreset').value : DEFAULT_SPEED_PRESET;
    const requestedPagesPerRequest = cameraDirect
      ? CAMERA_BATCH_SIZE
      : Math.max(1, Math.min(15, Number($('aiPagesPerRequest')?.value || SPEED_PRESETS[DEFAULT_SPEED_PRESET].pagesPerRequest)));
    const requestedConcurrency = cameraDirect
      ? CAMERA_AI_CONCURRENCY
      : Math.max(1, Math.min(BETA_MAX_AI_CONCURRENCY, Number($('aiConcurrency')?.value || SPEED_PRESETS[DEFAULT_SPEED_PRESET].concurrency)));
    const selectedNetworkMode = ['auto', 'unstable', 'normal'].includes($('aiNetworkMode')?.value) ? $('aiNetworkMode').value : DEFAULT_NETWORK_MODE;
    const networkMode = cameraDirect ? 'normal' : selectedNetworkMode;
    const networkProfile = resolveNetworkProfile(networkMode);
    const pagesPerRequest = Math.min(requestedPagesPerRequest, networkProfile.maxPagesPerRequest);
    const concurrency = Math.min(requestedConcurrency, networkProfile.maxConcurrency);
    const verificationPolicy = cameraDirect ? 'smart' : (SPEED_PRESETS[speedPreset]?.verification || 'smart');
    if (!COSMOS_MODELS.has(model)) throw new Error('Model tidak tersedia pada daftar model vision CosmosHub yang diizinkan.');
    return {
      provider: 'cosmoshub', protocol, model, accuracyMode, speedPreset, verificationPolicy,
      pagesPerRequest, concurrency, requestedPagesPerRequest, requestedConcurrency,
      networkMode, networkProfile, cameraDirect
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
        key: 'normal', label: 'Turbo langsung', maxPagesPerRequest: 15, maxConcurrency: BETA_MAX_AI_CONCURRENCY,
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
    // memilih profil R2 aman. Mode Normal tetap menjadi jalur Turbo langsung.
    if (!signals.available) return profiles.unstable;
    return profiles.balanced;
  }

  function saveNonSecretConfig() {
    if (isCameraDirectMode()) {
      refreshConfigStatus();
      return;
    }
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
    if (isCameraDirectMode()) {
      if ($('aiModel')) $('aiModel').value = CAMERA_DEFAULT_MODEL;
      if ($('aiAccuracyMode')) $('aiAccuracyMode').value = DEFAULT_ACCURACY_MODE;
      if ($('aiNetworkMode')) $('aiNetworkMode').value = 'normal';
      if ($('aiSpeedPreset')) $('aiSpeedPreset').value = 'fast';
      if ($('aiPagesPerRequest')) $('aiPagesPerRequest').value = String(CAMERA_BATCH_SIZE);
      if ($('aiConcurrency')) $('aiConcurrency').value = String(CAMERA_AI_CONCURRENCY);
      return;
    }
    // Setiap halaman dapat menentukan default PDF sendiri. Halaman utama memakai
    // Gemini langsung tanpa R2, sedangkan halaman eksperimen tetap memakai DeepSeek.
    if ($('aiModel')) $('aiModel').value = pageDefaultModel();
    try {
      // Hapus konfigurasi lama agar mode Auto/Hemat data tidak terbawa sebagai default.
      ['mile-ai-config-v11','mile-ai-config-v12','mile-ai-config-v13','mile-ai-config-v14','mile-ai-config-v15','mile-ai-config-v16','mile-ai-config-v16-4','mile-ai-config-v16-5','mile-ai-config-v16-6','mile-ai-config-v16-9','mile-ai-config-v16-10','mile-ai-config-v16-11','mile-ai-config-v16-12','mile-ai-config-v16-13','mile-ai-config-v16-14','mile-ai-config-v16-15','mile-ai-config-v16-16','mile-ai-config-beta-r2-v3','mile-ai-config-beta-r2-v4','mile-ai-config-beta-r2-v5','mile-ai-config-beta-r2-v6','mile-ai-config-beta-r2-v7'].forEach(key => sessionStorage.removeItem(key));
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
    if (isCameraDirectMode()) {
      hint.textContent = 'Mode Kamera: 15 gambar per batch, 3 gambar per permintaan, hingga 4 permintaan paralel tanpa R2.';
      return;
    }
    const usesDeepSeekR2Url = $('aiModel')?.value === DEEPSEEK_R2_MODEL;
    const descriptions = {
      medium: '5 halaman × 2 jalur, audit kedua untuk semua kelompok. Paling aman untuk scan sulit.',
      fast: usesDeepSeekR2Url
        ? 'Mode Turbo R2: dua gambar ringan disiapkan bersamaan, diunggah ke R2, lalu DeepSeek menjalankan 5 jalur berisi maksimal 15 halaman melalui URL sementara.'
        : 'Mode Turbo: dua gambar ringan disiapkan bersamaan agar PC tetap responsif, lalu Gemini menjalankan 5 jalur berisi maksimal 15 halaman.',
      custom: 'Nilai halaman dan paralel diatur manual. Audit kedua dijalankan secara adaptif.'
    };
    hint.textContent = descriptions[presetName] || descriptions.custom;
  }

  function updateNetworkModeHint() {
    const hint = $('aiNetworkModeHint');
    if (!hint) return;
    if (isCameraDirectMode()) {
      hint.textContent = 'Jalur Kamera Direct aktif: gambar dikirim sebagai base64 melalui Secure Gateway dan tidak pernah diunggah ke R2.';
      return;
    }
    const mode = $('aiNetworkMode')?.value || DEFAULT_NETWORK_MODE;
    const profile = resolveNetworkProfile(mode);
    const signals = connectionSignals();
    const connectionNote = signals.online ? '' : ' Status LAN belum dapat dipastikan; aplikasi tetap akan mencoba server.';
    const usesDeepSeekR2Url = $('aiModel')?.value === DEEPSEEK_R2_MODEL;
    const descriptions = {
      auto: `Profil aktif: ${profile.label}, maksimal ${profile.maxPagesPerRequest} halaman × ${profile.maxConcurrency} jalur. Pilih mode ini hanya bila ingin sistem membatasi proses berdasarkan kualitas koneksi.`,
      unstable: 'Hemat data aktif: maksimal 4 halaman × 1 jalur, gambar diperkecil, dan retry otomatis diprioritaskan.',
      normal: usesDeepSeekR2Url
        ? 'Mode Turbo R2 aktif: gambar 1150 px disiapkan maksimal 2 bersamaan, lalu DeepSeek menerima URL R2 sementara dalam kelompok 15 halaman × 5 jalur.'
        : 'Mode Turbo aktif: gambar 1150 px disiapkan maksimal 2 bersamaan agar PC tetap ringan, lalu 15 halaman × 5 jalur Gemini langsung.'
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

  function shortModelLabel(model) {
    if (model === GEMINI_38_MODEL) return 'Gemini 3.8';
    if (model === PRIMARY_FALLBACK_MODEL) return 'Gemini 3.7';
    if (model === SECONDARY_FALLBACK_MODEL) return 'Gemini 3.6';
    if (model === DEEPSEEK_R2_MODEL) return 'DeepSeek V4.1';
    return String(model || 'AI');
  }

  function activeLaneStatus(now = performance.now()) {
    return progressLaneStates
      .filter(state => state?.active)
      .slice(0, BETA_MAX_AI_CONCURRENCY)
      .map(state => {
        const since = state.waitingSince || state.startedAt || now;
        const elapsed = formatDuration((now - since) / 1000);
        const model = state.model ? ` · ${shortModelLabel(state.model)}` : '';
        return `H${state.start}–${state.end}${model} · ${state.phase} · ${elapsed}`;
      })
      .join(' | ');
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
    const lanes = activeLaneStatus();
    if (lanes) {
      activityNode.textContent = `Jalur aktif: ${lanes}`;
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
    progressLaneStates = [];
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

  function publicChunkTimings(entries) {
    return (Array.isArray(entries) ? entries : []).map(item => ({
      group: Number(item.group) || 0,
      start: Number(item.start) || 0,
      end: Number(item.end) || 0,
      inputBytes: Math.max(0, Math.round(Number(item.inputBytes) || 0)),
      encodedBytes: Math.max(0, Math.round(Number(item.encodedBytes) || 0)),
      prepareMs: Math.max(0, Math.round(Number(item.prepareMs) || 0)),
      encodeMs: Math.max(0, Math.round(Number(item.encodeMs) || 0)),
      uploadMs: Math.max(0, Math.round(Number(item.uploadMs) || 0)),
      waitMs: Math.max(0, Math.round(Number(item.waitMs) || 0)),
      totalMs: Math.max(0, Math.round(Number(item.totalMs) || 0)),
      auditMs: Math.max(0, Math.round(Number(item.auditMs) || 0)),
      auditPages: Math.max(0, Math.round(Number(item.auditPages) || 0)),
      rows: Math.max(0, Math.round(Number(item.rows) || 0)),
      attempts: Math.max(0, Math.round(Number(item.attempts) || 0)),
      retries: Math.max(0, Math.round(Number(item.retries) || 0)),
      model: String(item.model || ''),
      fallbackFrom: String(item.fallbackFrom || ''),
      status: String(item.status || '')
    }));
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

  async function createBetaProbeBlob() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 220;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas browser tidak tersedia untuk menguji jalur gambar.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111827';
    context.font = 'bold 76px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(BETA_PROBE_CODE, canvas.width / 2, canvas.height / 2);
    try {
      return await canvasToJpegBlob(canvas, 0.84);
    } finally {
      canvas.width = canvas.height = 1;
    }
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

  function normalizeCameraImages(images) {
    if (!Array.isArray(images)) return [];
    return images.map((item, index) => {
      const blob = item?.blob;
      if (!blob || typeof blob.size !== 'number' || typeof blob.arrayBuffer !== 'function') {
        throw new Error(`Data gambar kamera ${index + 1} tidak valid.`);
      }
      if (!/^image\/(?:jpeg|jpg|png|webp)$/i.test(String(blob.type || 'image/jpeg'))) {
        throw new Error(`Format gambar kamera ${index + 1} tidak didukung.`);
      }
      if (blob.size > CAMERA_DIRECT_IMAGE_MAX_BYTES) {
        throw new Error(`Gambar kamera ${index + 1} melebihi batas 4 MB.`);
      }
      return {
        blob,
        width: Math.max(1, Math.round(Number(item?.width) || 1)),
        height: Math.max(1, Math.round(Number(item?.height) || 1)),
        name: String(item?.fileName || item?.name || `${String(index + 1).padStart(3, '0')}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`)
      };
    });
  }

  async function decodeCameraBlob(blob) {
    if (typeof window.createImageBitmap === 'function') {
      const bitmap = await window.createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.()
      };
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('JPEG kamera tidak dapat dibuka oleh browser.'));
        element.src = objectUrl;
      });
      return {
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        close: () => URL.revokeObjectURL(objectUrl)
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function compressCameraBlobToBudget(blob, targetBytes) {
    if (blob.size <= targetBytes) return blob;
    const decoded = await decodeCameraBlob(blob);
    const canvas = document.createElement('canvas');
    let scale = 1;
    let quality = 0.86;
    let output = blob;
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        canvas.width = Math.max(1, Math.round(decoded.width * scale));
        canvas.height = Math.max(1, Math.round(decoded.height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas browser tidak tersedia untuk menyiapkan JPEG kamera.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
        output = await canvasToJpegBlob(canvas, quality);
        if (output.size <= targetBytes) return output;
        const ratio = Math.sqrt(targetBytes / Math.max(1, output.size));
        scale *= Math.min(0.93, Math.max(0.68, ratio * 0.96));
        quality = Math.max(0.72, quality - 0.03);
        await yieldToBrowser();
      }
      if (output.size > targetBytes) throw new Error('JPEG kamera terlalu besar untuk batch langsung. Dekatkan label dan coba capture ulang.');
      return output;
    } finally {
      canvas.width = canvas.height = 1;
      decoded.close();
    }
  }

  async function prepareCameraBlobsForBatch(images) {
    const originalBlobs = images.map(image => image.blob);
    const originalBytes = originalBlobs.reduce((total, blob) => total + blob.size, 0);
    if (originalBytes <= CAMERA_DIRECT_BATCH_RAW_BYTES) return originalBlobs;

    const targetBytes = Math.floor((CAMERA_DIRECT_BATCH_RAW_BYTES * 0.96) / Math.max(1, images.length));
    markProgressActivity(`Menyesuaikan ukuran JPEG agar ${images.length} gambar tetap dalam satu kelompok`);
    const pool = createTaskPool(BETA_PREPARE_CONCURRENCY);
    const prepared = await Promise.all(originalBlobs.map(blob => pool(() => compressCameraBlobToBudget(blob, targetBytes))));
    const preparedBytes = prepared.reduce((total, blob) => total + blob.size, 0);
    if (preparedBytes > CAMERA_DIRECT_BATCH_RAW_BYTES) {
      throw new Error(`Total JPEG kamera terlalu besar untuk satu kelompok ${images.length} gambar. Dekatkan label dan coba capture ulang.`);
    }
    return prepared;
  }

  function dataUrlToBlob(dataUrl) {
    const [header, encoded] = String(dataUrl || '').split(',', 2);
    const type = header?.match(/^data:([^;]+)/i)?.[1] || 'image/jpeg';
    const binary = atob(encoded || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type });
  }

  async function uploadBetaImage(jobId, pageNumber, variant, blob, publicUrl = false) {
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
      if (!response.ok || !(payload?.ref || payload?.url)) {
        const error = new Error(payload?.error?.message || `Penyimpanan gambar beta gagal (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return publicUrl ? payload.url : (payload.ref || payload.url);
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

  async function uploadBetaImageWithRetry(jobId, pageNumber, variant, blob, publicUrl = false) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await uploadBetaImage(jobId, pageNumber, variant, blob, publicUrl);
      } catch (error) {
        lastError = error;
        if (cancelled || error?.name === 'AbortError') throw error;
        const status = Number(error?.status || 0);
        const retryable = !status || [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
        if (!retryable || attempt >= 2) break;
        markProgressActivity(`Upload halaman ${pageNumber} terganggu · mencoba lagi`);
        await cancellableSleep(GEMINI_RETRY_DELAY_MS);
      }
    }
    throw lastError || new Error(`Upload halaman ${pageNumber} gagal.`);
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
      messages: [
        {
          role: 'system',
          content: 'Anda adalah operator data entri. Utamakan kesetiaan pada gambar. Kembalikan HANYA format JSON valid TANPA penjelasan, TANPA markdown block, dan minimalkan newline/spasi untuk efisiensi token.'
        },
        { role: 'user', content }
      ]
    };
    // Keluarga Gemini pada gateway tidak selalu menerima parameter OpenAI
    // opsional. Prompt dan parser tetap memaksa serta memvalidasi JSON.
    if (!isGeminiModel(config.model)) {
      body.response_format = { type: 'json_object' };
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
    if (!isGeminiModel(config.model)) {
      body.response_format = { type: 'json_object' };
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
      else if (response.status === 404) {
        message = /no active credentials for provider:\s*antigravity/i.test(message)
          ? `Slot provider Gemini 3.8 Flash sedang penuh. ${message}`
          : 'Endpoint atau model CosmosHub tidak ditemukan. Pastikan model yang dipilih masih tersedia.';
      }
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
      const requestTimeoutMs = config?.cameraDirect
        ? CAMERA_REQUEST_TIMEOUT_MS
        : (isGeminiModel(config?.model) ? GEMINI_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
      xhr.timeout = requestTimeoutMs;
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
        const actualTransport = xhr.getResponseHeader('x-mile-transport') || 'proxy Cloudflare';
        const headers = new Headers({ 'content-type': xhr.getResponseHeader('content-type') || 'application/json' });
        const response = new Response(xhr.responseText || '', { status: xhr.status, statusText: xhr.statusText, headers });
        parseApiResponse(response, actualTransport).then(payload => {
          onTransport({ phase: 'complete', loaded: totalBytes, total: totalBytes });
          resolve(payload);
        }, reject);
      };
      xhr.onerror = () => {
        const error = new Error('Koneksi ke server terputus sebelum respons AI selesai.');
        fail(error);
      };
      xhr.ontimeout = () => {
        const error = new Error(config?.cameraDirect
          ? `${shortModelLabel(config?.model)} tidak memberi respons dalam 35 detik. Kelompok ini langsung dialihkan ke model berikutnya.`
          : (isGeminiModel(config?.model)
            ? 'Gemini tidak memberi respons dalam 75 detik. Kelompok ini akan dialihkan tanpa mengubah kelompok lain.'
            : 'Permintaan AI melewati batas 3 menit dan akan dicoba ulang.'));
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

  function nextFallbackModel(model, config = {}) {
    const chain = config.cameraDirect ? CAMERA_GEMINI_FALLBACK_CHAIN : GEMINI_FALLBACK_CHAIN;
    const index = chain.indexOf(String(model || '').trim());
    return index >= 0 ? (chain[index + 1] || '') : '';
  }

  function isAutoFallbackEligible(config, error) {
    if (cancelled || error?.name === 'AbortError' || !nextFallbackModel(config?.model, config)) return false;
    if (isR2BridgeFailure(error)) return false;
    const status = Number(error?.status || 0);
    if (config?.cameraDirect && status === 400 && isGeminiModel(config?.model)) return true;
    if (!status) return true;
    if ([404, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    return /JSON valid|array rows|teks hasil/i.test(String(error?.message || ''));
  }

  function isR2BridgeFailure(error) {
    if (error?.details?.error?.source === 'r2-bridge') return true;
    return /worker exceeded resource limits|error\s*1102|jembatan (?:gambar )?r2|referensi gambar beta|gambar sementara beta/i.test(String(error?.message || ''));
  }

  async function callProxyWithRetry(config, body, label = '', hooks = {}) {
    const configuredModel = String(config?.model || body?.model || '').trim();
    const requestModel = String(body?.model || configuredModel).trim();
    const requestConfig = requestModel === configuredModel ? config : { ...config, model: requestModel };
    const requestBody = adaptRequestBodyForModel(body, requestModel);
    const isGeminiFallbackModel = GEMINI_FALLBACK_CHAIN.includes(requestModel);
    const maxAttempts = config?.cameraDirect
      ? CAMERA_MODEL_MAX_ATTEMPTS
      : (isGeminiFallbackModel ? GEMINI_MAX_ATTEMPTS : MAX_RETRIES);
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
      await waitUntilOnline(label);
      try {
        hooks.onAttempt?.(attempt, maxAttempts, requestModel);
        const payload = await callCosmos(requestConfig, requestBody, event => hooks.onTransport?.({ ...event, attempt, maxAttempts, model: requestModel }));
        try {
          // Validasi JSON di sini agar respons terpotong bisa diperbaiki atau dicoba ulang.
          parseRows(payload, requestConfig.protocol);
          payload._mileEffectiveModel = requestModel;
          return payload;
        } catch (parseError) {
          let rawText = '';
          try { rawText = extractTextFromResponse(payload, requestConfig.protocol); } catch (_) {}
          if (!rawText || rawText.length > MAX_JSON_REPAIR_CHARS) throw parseError;

          hooks.onRepair?.({ attempt, maxAttempts, error: parseError });
          const repairedPayload = await callCosmos(
            requestConfig,
            buildJsonRepairBody(requestConfig, rawText, Math.min(7000, Math.max(1600, Math.ceil(rawText.length / 3.6) + 400))),
            event => hooks.onTransport?.({ ...event, attempt, maxAttempts, repair: true, model: requestModel })
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
        const status = Number(error?.status || 0);
        const malformed = /JSON valid|array rows|teks hasil/i.test(String(error.message || ''));
        const bridgeFailure = isR2BridgeFailure(error);
        const geminiRetryable = isGeminiFallbackModel &&
          status !== 408 &&
          (bridgeFailure
            ? (isRetryable(error) && !/worker exceeded resource limits|error\s*1102/i.test(String(error?.message || '')))
            : (!status || [404, 409, 425, 429, 500, 502, 503, 504].includes(status) || malformed));
        const canRetry = isGeminiFallbackModel
          ? geminiRetryable
          : (isRetryable(error) || malformed);
        if (!canRetry) {
          if (isAutoFallbackEligible(requestConfig, error)) break;
          throw error;
        }
        if (attempt >= maxAttempts) break;
        let delay = isGeminiFallbackModel
          ? GEMINI_RETRY_DELAY_MS
          : (status === 429
            ? ([8000, 18000][attempt - 1] || 18000)
            : ([1800, 4200, 8500][attempt - 1] || 8500));
        const adjustedDelay = Number(hooks.retryDelay?.({ attempt, nextAttempt: attempt + 1, maxAttempts, delay, error }));
        if (Number.isFinite(adjustedDelay) && adjustedDelay >= delay) delay = adjustedDelay;
        hooks.onRetry?.({ attempt, nextAttempt: attempt + 1, maxAttempts, delay, error });
        setProgress(
          Number($('aiProgressPercent')?.textContent?.replace(/\D/g, '') || 10),
          `Mencoba ulang ${label}`,
          `Percobaan ${attempt + 1}/${maxAttempts} dimulai dalam ${delay < 1000 ? '0,5 detik' : formatDuration(delay / 1000)}.`,
          $('aiProgressUsage')?.textContent || ''
        );
        setTransferProgress(0, `Koneksi terganggu · mencoba lagi ${attempt + 1}/${maxAttempts}`, { error: true });
        await cancellableSleep(delay);
      }
    }
    const nextModel = nextFallbackModel(requestModel, requestConfig);
    if (nextModel && isAutoFallbackEligible(requestConfig, lastError)) {
      hooks.onFallback?.({ from: requestModel, to: nextModel, error: lastError });
      const transition = `${requestModel}->${nextModel}`;
      if (!fallbackAnnouncements.has(transition)) {
        fallbackAnnouncements.add(transition);
        showToast(`Sebagian kelompok ${shortModelLabel(requestModel)} terkendala. Hanya kelompok tersebut yang dialihkan ke ${shortModelLabel(nextModel)}.`, 'info');
      }
      const fallbackConfig = { ...requestConfig, model: nextModel };
      const fallbackPayload = await callProxyWithRetry(fallbackConfig, adaptRequestBodyForModel(requestBody, nextModel), label, hooks);
      const existingChain = Array.isArray(fallbackPayload._mileFallbackChain)
        ? fallbackPayload._mileFallbackChain
        : [nextModel];
      fallbackPayload._mileFallbackChain = [requestModel, ...existingChain];
      fallbackPayload._mileFallbackFrom ||= requestModel;
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
      const zip = core?.resolveZipCode
        ? core.resolveZipCode(address, template, printedZip)
        : (printedZip || (core?.getZipCodeFromAddress ? core.getZipCodeFromAddress(address, template) : '29411'));
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
    let probeJobId = '';
    try {
      const configured = await checkServerConfiguration({ showFeedback: true });
      if (!configured) {
        throw new Error('Konfigurasi Secure Gateway belum lengkap. Periksa tiga secret Cloudflare lalu deploy ulang.');
      }
      const config = getConfig();
      const publicR2Experiment = !config.cameraDirect && config.model === DEEPSEEK_R2_MODEL;
      const testViaR2 = !config.cameraDirect && (publicR2Experiment || config.networkProfile.key === 'unstable');
      const transportLabel = publicR2Experiment
        ? 'R2 URL eksperimental'
        : (testViaR2 ? 'R2 pemulihan' : (config.cameraDirect ? 'Kamera Direct tanpa R2' : 'Turbo langsung'));
      if (testViaR2 && !lastBetaImagesConfigured) {
        throw new Error('Penyimpanan gambar R2 Beta belum dikonfigurasi untuk mode Hemat data.');
      }
      saveNonSecretConfig();
      button.disabled = true;
      button.textContent = testViaR2 ? 'Menguji jalur R2…' : 'Menguji jalur Turbo…';
      setFeedback(`Menguji jalur ${transportLabel} dan ${config.model} dengan satu gambar sungguhan…`);
      const probeBlob = await createBetaProbeBlob();
      let probeReference;
      if (testViaR2) {
        probeJobId = createBetaJobId();
        probeReference = await uploadBetaImageWithRetry(probeJobId, 0, 'probe', probeBlob, publicR2Experiment);
      } else {
        probeReference = await blobToDataUrl(probeBlob);
      }
      const body = buildApiBody(
        config,
        `Baca kode besar pada gambar. Balas HANYA JSON valid {"code":"${BETA_PROBE_CODE}"}.`,
        [{ page: 1, label: 'UJI GAMBAR BETA', url: probeReference }],
        300
      );
      const payload = await callCosmos(config, body);
      const text = extractTextFromResponse(payload, 'openai').trim().slice(0, 120);
      if (!text.toUpperCase().includes(BETA_PROBE_CODE)) {
        throw new Error(`AI merespons tetapi belum berhasil membaca gambar melalui jalur ${transportLabel}.`);
      }
      const usage = getUsage(payload, 'openai');
      const usageText = usage.input || usage.output ? ` · ${formatUsage(usage)}` : '';
      const transportText = payload?._mileTransport ? ` melalui ${payload._mileTransport}` : '';
      setFeedback(`Jalur ${transportLabel} dan layanan AI siap${transportText}. Gambar berhasil dibaca${usageText}`, 'success');
      showToast(`Jalur ${transportLabel} dan AI siap digunakan.`, 'success');
    } catch (error) {
      setFeedback(`Tes jalur gambar gagal: ${error.message}`, 'error');
      showToast(`Tes jalur gambar gagal: ${error.message}`, 'error');
    } finally {
      await cleanupBetaImages(probeJobId);
      button.disabled = false;
      button.textContent = 'Tes layanan AI';
      refreshConfigStatus();
    }
  }

  async function processPDFFile(file, options = {}) {
    const core = window.__mileCore;
    if (!core) {
      alert('Aplikasi mile.posnew.com belum siap. Muat ulang halaman.');
      return;
    }
    cancelled = false;
    fallbackAnnouncements.clear();
    betaRemoteFallbackAnnounced = false;
    let cameraImages = [];
    try {
      cameraImages = normalizeCameraImages(options.cameraImages);
    } catch (error) {
      showToast(error.message, 'error');
      core.processNextInQueue();
      return;
    }
    const directCameraInput = cameraImages.length > 0;
    const inputName = directCameraInput
      ? String(options.name || `Kamera - ${cameraImages.length} foto`)
      : String(file?.name || 'PDF');
    const startedAt = performance.now();
    startStopwatch(startedAt);
    setProgress(1, 'Memeriksa berkas dan koneksi', `${directCameraInput ? 'Validasi foto kamera' : 'Validasi PDF'} dan layanan AI sedang dilakukan…`);
    setTransferProgress(0, 'Belum ada data yang dikirim');
    setProgressStats({ renderedPages: 0, totalPages: 0, completedChunks: 0, totalChunks: 0 });

    let config;
    try {
      if (directCameraInput) {
        if (!isCameraDirectMode()) throw new Error('Jalur gambar langsung hanya tersedia dari halaman kamera.');
        if (cameraImages.length > MAX_PAGES) throw new Error(`Jumlah gambar melebihi batas ${MAX_PAGES}.`);
      } else {
        if (!file || file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) throw new Error('Berkas bukan PDF.');
        if (file.size > MAX_PDF_BYTES) throw new Error('Ukuran PDF melebihi 80 MB. Kompres PDF lalu coba lagi.');
        if (typeof window.pdfjsLib === 'undefined') {
          if (!window.MileVendorLoader?.loadPdfJs) throw new Error('Pemuat library PDF tidak tersedia. Muat ulang halaman.');
          setProgress(1, 'Memuat pembaca PDF', 'Library PDF dimuat hanya saat jalur kompatibilitas membutuhkannya…');
          await window.MileVendorLoader.loadPdfJs();
        }
      }
      const configured = await checkServerConfiguration({ showFeedback: true });
      if (!configured) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        throw new Error('Layanan AI belum dapat dijangkau. Periksa sinyal internet atau konfigurasi server lalu coba lagi.');
      }
      config = getConfig();
      if (!config.cameraDirect && config.model === DEEPSEEK_R2_MODEL && !lastBetaImagesConfigured) {
        throw new Error('Eksperimen DeepSeek memerlukan penyimpanan R2 Beta yang aktif.');
      }
      saveNonSecretConfig();
    } catch (error) {
      const elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
      stopStopwatch(elapsed, 0);
      hideProgress();
      $('aiConfigPanel')?.setAttribute('open', '');
      showToast(error?.name === 'AbortError' ? `Proses ${directCameraInput ? 'kamera' : 'PDF'} dibatalkan.` : error.message, error?.name === 'AbortError' ? 'info' : 'error');
      core.processNextInQueue();
      return;
    }

    let pdf = null;
    let pageCount = 0;
    let completedRowCount = 0;
    const totalUsage = { input: 0, output: 0 };
    const betaJobId = createBetaJobId();
    const betaPerf = {
      renderMs: 0, uploadMs: 0, aiMs: 0, auditMs: 0,
      remotePages: 0, base64Pages: 0, r2Failures: 0,
      fallbackRequests: 0, fallbackReasons: {}, fallbackModels: [], auditPages: 0, geminiSuccesses: 0,
      chunkTimings: []
    };
    const runRender = createTaskPool(BETA_PREPARE_CONCURRENCY);
    try {
      if (directCameraInput) {
        pageCount = cameraImages.length;
        pdf = { numPages: pageCount, cleanup() {}, destroy() {} };
        const totalBytes = cameraImages.reduce((total, image) => total + image.blob.size, 0);
        setProgress(3, 'Foto kamera siap', `${pageCount} foto (${formatBytes(totalBytes)}) dibaca langsung tanpa membuat PDF.`);
        setTransferProgress(0, 'Foto asli siap · belum mengirim gambar');
      } else {
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
      }

      config = {
        ...config,
        bniMode: false,
        accuracyMode: config.accuracyMode === 'auto' ? 'balanced' : config.accuracyMode
      };

      const publicR2Experiment = !config.cameraDirect && config.model === DEEPSEEK_R2_MODEL;
      betaRemoteImagesAvailable = !config.cameraDirect && (publicR2Experiment || config.networkProfile.key === 'unstable') && lastBetaImagesConfigured;
      setProgress(4, 'Menyiapkan halaman pertama', betaRemoteImagesAvailable
        ? (publicR2Experiment
          ? 'Eksperimen DeepSeek siap · gambar dikirim sebagai tautan R2 sementara.'
          : 'Mode pemulihan R2 siap · pemrosesan hemat data dimulai.')
        : (config.cameraDirect
          ? `Mode Kamera Direct siap · ${CAMERA_WAVE_SIZE} gambar per batch, ${CAMERA_BATCH_SIZE} gambar per permintaan × hingga ${CAMERA_AI_CONCURRENCY} jalur paralel tanpa R2.`
          : 'Mode Turbo langsung siap · gambar tidak menunggu unggah R2.'));
      setTransferProgress(0, betaRemoteImagesAvailable ? 'Mulai menyiapkan gambar melalui R2' : 'Mulai menyiapkan gambar langsung');

      const chunks = [];
      for (let start = 1; start <= pdf.numPages; start += config.pagesPerRequest) {
        chunks.push({ start, end: Math.min(pdf.numPages, start + config.pagesPerRequest - 1) });
      }

      const results = new Array(chunks.length);
      const pendingAudits = new Array(chunks.length);
      const chunkStates = chunks.map(chunk => ({
        start: chunk.start, end: chunk.end, progress: 0, phase: 'Menunggu',
        active: false, waiting: false, startedAt: 0, waitingSince: 0, model: ''
      }));
      betaPerf.chunkTimings = chunks.map((chunk, index) => ({
        group: index + 1,
        start: chunk.start,
        end: chunk.end,
        inputBytes: 0,
        encodedBytes: 0,
        prepareMs: 0,
        encodeMs: 0,
        uploadMs: 0,
        waitMs: 0,
        totalMs: 0,
        auditMs: 0,
        attempts: 0,
        retries: 0,
        model: config.model,
        fallbackFrom: '',
        status: 'queued'
      }));
      progressLaneStates = chunkStates;
      const workerCount = Math.min(config.concurrency, BETA_MAX_AI_CONCURRENCY, chunks.length);
      let activeAiLimit = config.model === DEFAULT_MODEL
        ? Math.min(BETA_INITIAL_AI_CONCURRENCY, workerCount)
        : workerCount;
      let completedChunks = 0;
      let renderedPages = 0;
      let rowsFound = 0;

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
          const state = chunkStates[chunkIndex];
          const timing = betaPerf.chunkTimings[chunkIndex];
          const now = performance.now();
          state.active = true;
          state.waiting = false;
          state.waitingSince = 0;
          state.startedAt ||= performance.now();
          state.model = model;
          state.progress = Math.max(state.progress, startWeight);
          timing.attempts++;
          timing.model = model;
          timing.status = 'requesting';
          timing._firstRequestStartedAt ||= now;
          timing._attemptStartedAt = now;
          setTransferProgress(0, `${label} halaman ${chunk.start}–${chunk.end} · ${model} · percobaan ${attempt}/${maxAttempts}`);
          updateParallelProgress(chunk, chunkIndex, label);
        },
        onTransport(event) {
          const state = chunkStates[chunkIndex];
          const timing = betaPerf.chunkTimings[chunkIndex];
          const now = performance.now();
          const total = Number(event.total || 0);
          const ratio = total ? Math.max(0, Math.min(1, Number(event.loaded || 0) / total)) : 0;
          state.model = event.model || state.model;
          if (event.repair && event.phase === 'encoding') {
            timing._encodeStartedAt = now;
            state.progress = Math.max(state.progress, startWeight);
            setTransferProgress(0, `Memperbaiki format JSON halaman ${chunk.start}–${chunk.end} tanpa mengirim ulang gambar`);
          } else if (event.phase === 'encoding') {
            timing._encodeStartedAt = now;
            state.progress = Math.max(state.progress, startWeight);
            setTransferProgress(0, `Mengemas gambar halaman ${chunk.start}–${chunk.end}`);
          } else if (event.phase === 'ready') {
            if (timing._encodeStartedAt) timing.encodeMs += Math.max(0, now - timing._encodeStartedAt);
            timing._encodeStartedAt = 0;
            timing.encodedBytes = Math.max(timing.encodedBytes, total);
            setTransferProgress(0, `${formatBytes(total)} siap dikirim untuk halaman ${chunk.start}–${chunk.end}`);
          } else if (event.phase === 'uploading') {
            timing._uploadStartedAt ||= now;
            state.waiting = false;
            state.waitingSince = 0;
            state.progress = Math.max(state.progress, startWeight + (waitWeight - startWeight) * ratio);
            setTransferProgress(ratio * 100, `Mengunggah ${formatBytes(event.loaded)} dari ${formatBytes(total)} · halaman ${chunk.start}–${chunk.end}`);
          } else if (event.phase === 'waiting') {
            if (timing._uploadStartedAt) timing.uploadMs += Math.max(0, now - timing._uploadStartedAt);
            timing._uploadStartedAt = 0;
            timing._waitingStartedAt ||= now;
            state.waiting = true;
            state.waitingSince ||= performance.now();
            state.progress = Math.max(state.progress, waitWeight);
            setTransferProgress(100, `Upload halaman ${chunk.start}–${chunk.end} selesai · menunggu respons AI`, { waiting: true });
          } else if (event.phase === 'complete') {
            if (timing._waitingStartedAt) timing.waitMs += Math.max(0, now - timing._waitingStartedAt);
            timing._waitingStartedAt = 0;
            timing.status = 'success';
            state.waiting = false;
            state.waitingSince = 0;
            state.progress = Math.max(state.progress, completeWeight);
            setTransferProgress(100, `Respons AI halaman ${chunk.start}–${chunk.end} diterima`);
          }
          updateParallelProgress(chunk, chunkIndex, label);
        },
        retryDelay({ delay, error }) {
          if (!config.cameraDirect || Number(error?.status || 0) !== 429) return delay;
          activeAiLimit = Math.max(1, activeAiLimit - 1);
          const stagger = chunkIndex * 1250;
          markProgressActivity(`Provider membatasi request · jalur aktif diturunkan menjadi ${activeAiLimit}`);
          return delay + stagger;
        },
        onRetry({ nextAttempt, maxAttempts, delay }) {
          const state = chunkStates[chunkIndex];
          const timing = betaPerf.chunkTimings[chunkIndex];
          const now = performance.now();
          if (timing._waitingStartedAt) timing.waitMs += Math.max(0, now - timing._waitingStartedAt);
          timing._waitingStartedAt = 0;
          timing._uploadStartedAt = 0;
          timing.retries++;
          timing.status = 'retrying';
          state.waiting = false;
          state.waitingSince = 0;
          const delayText = delay < 1000 ? '0,5 detik' : formatDuration(delay / 1000);
          setTransferProgress(0, `Jaringan terganggu · percobaan ${nextAttempt}/${maxAttempts} dalam ${delayText}`, { error: true });
          updateParallelProgress(chunk, chunkIndex, `Menyiapkan retry ${nextAttempt}/${maxAttempts}`);
        },
        onFallback({ from, to, error }) {
          const state = chunkStates[chunkIndex];
          const timing = betaPerf.chunkTimings[chunkIndex];
          state.waiting = false;
          state.waitingSince = 0;
          state.model = to;
          timing.fallbackFrom ||= from;
          timing.model = to;
          timing.status = 'fallback';
          betaPerf.fallbackRequests++;
          if (!betaPerf.fallbackModels.includes(to)) betaPerf.fallbackModels.push(to);
          const reason = String(Number(error?.status || 0) || 'network');
          betaPerf.fallbackReasons[reason] = Number(betaPerf.fallbackReasons[reason] || 0) + 1;
          setTransferProgress(0, `Kelompok ${chunk.start}–${chunk.end}: ${shortModelLabel(from)} terkendala · memakai ${shortModelLabel(to)}`, { waiting: true });
          updateParallelProgress(chunk, chunkIndex, `Fallback ke ${shortModelLabel(to)}`);
        },
        onRepair() {
          setTransferProgress(100, `Respons halaman ${chunk.start}–${chunk.end} lengkap tetapi JSON perlu dirapikan`, { waiting: true });
          updateParallelProgress(chunk, chunkIndex, 'Memperbaiki JSON');
        }
      });

      async function prepareChunk(chunk, chunkIndex) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        const prepareStartedAt = performance.now();
        const timing = betaPerf.chunkTimings[chunkIndex];
        timing.status = 'preparing';
        chunkStates[chunkIndex].progress = 0.01;
        updateParallelProgress(chunk, chunkIndex, 'Menyiapkan gambar scan');
        const pageSources = [];
        const pagesInChunk = chunk.end - chunk.start + 1;
        const cameraChunkImages = directCameraInput ? cameraImages.slice(chunk.start - 1, chunk.end) : [];
        const cameraChunkBlobs = directCameraInput ? await prepareCameraBlobsForBatch(cameraChunkImages) : [];
        let nextPageNumber = chunk.start;
        async function preparePageWorker() {
          while (true) {
            const pageNumber = nextPageNumber++;
            if (pageNumber > chunk.end) return;
            if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
            markProgressActivity(`${directCameraInput ? 'Membaca foto' : 'Merender scan'} ${pageNumber}/${pdf.numPages}`);
            updateParallelProgress(chunk, chunkIndex, `${directCameraInput ? 'Membaca foto' : 'Merender scan'} ${pageNumber}`);
            const page = directCameraInput ? null : await pdf.getPage(pageNumber);
            try {
              const blob = directCameraInput
                ? cameraChunkBlobs[pageNumber - chunk.start]
                : await runRender(async () => {
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
                  url = await uploadBetaImageWithRetry(betaJobId, pageNumber, 'first', blob, publicR2Experiment);
                  remote = true;
                  betaPerf.remotePages++;
                } catch (uploadError) {
                  betaPerf.r2Failures++;
                  if (publicR2Experiment) {
                    const strictR2Error = new Error(`Gagal mengunggah halaman ${pageNumber} ke R2. DeepSeek memerlukan URL R2 dan tidak akan mengirim gambar langsung dari komputer.`);
                    strictR2Error.status = Number(uploadError?.status || 503);
                    throw strictR2Error;
                  }
                  if (!betaRemoteFallbackAnnounced) {
                    betaRemoteFallbackAnnounced = true;
                    showToast('Sebagian gambar tidak dapat disimpan sementara. Hanya halaman tersebut yang memakai jalur cadangan.', 'info');
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
                blob,
                sourceType: 'image'
              };
              renderedPages++;
              const renderedInChunk = pageSources.filter(Boolean).length;
              chunkStates[chunkIndex].progress = 0.03 + (renderedInChunk / pagesInChunk) * 0.22;
              updateParallelProgress(chunk, chunkIndex, `${directCameraInput ? 'Foto' : 'Gambar scan'} ${pageNumber} siap`);
              await yieldToBrowser();
            } finally {
              page?.cleanup?.();
            }
          }
        }
        const pageWorkerCount = Math.min(BETA_PREPARE_CONCURRENCY, pagesInChunk);
        await Promise.all(Array.from({ length: pageWorkerCount }, () => preparePageWorker()));

        timing.prepareMs = Math.max(0, performance.now() - prepareStartedAt);
        timing.inputBytes = pageSources.reduce((total, source) => total + Number(source?.blob?.size || 0), 0);
        timing.status = 'prepared';

        return pageSources;
      }

      async function processChunk(chunk, chunkIndex, pageSources) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        const pagesInChunk = chunk.end - chunk.start + 1;
        const expectedPages = Array.from({ length: pagesInChunk }, (_, index) => chunk.start + index);
        const timing = betaPerf.chunkTimings[chunkIndex];

        chunkStates[chunkIndex].progress = 0.27;
        updateParallelProgress(chunk, chunkIndex, 'Ekstraksi pertama');
        const extractionSources = pageSources.map(source => ({
          page: source.page,
          label: `HALAMAN ${source.page}`,
          url: source.url || ''
        }));

        let body = buildApiBody(
          config,
          buildPrompt(chunk.start, chunk.end, config),
          extractionSources,
          extractionTokenLimit(pagesInChunk)
        );
        const aiStartedAt = performance.now();
        let payload;
        try {
          payload = await callProxyWithRetry(
            config,
            body,
            `halaman ${chunk.start}–${chunk.end}`,
            makeTransportHooks(chunk, chunkIndex, 'Ekstraksi pertama', 0.28, 0.53, 0.62)
          );
        } catch (error) {
          if (publicR2Experiment || !isR2BridgeFailure(error) || !pageSources.every(source => source?.blob instanceof Blob)) throw error;
          markProgressActivity(`Jembatan R2 halaman ${chunk.start}–${chunk.end} dialihkan ke jalur langsung`);
          setTransferProgress(0, `Jembatan R2 terkendala · menyiapkan jalur langsung halaman ${chunk.start}–${chunk.end}`, { waiting: true });
          const directSources = [];
          for (const source of pageSources) {
            const dataUrl = String(source.url || '').startsWith('data:')
              ? source.url
              : await blobToDataUrl(source.blob);
            if (source.remote) betaPerf.base64Pages++;
            directSources.push({ page: source.page, label: `HALAMAN ${source.page}`, url: dataUrl });
          }
          body = buildApiBody(
            config,
            buildPrompt(chunk.start, chunk.end, config),
            directSources,
            extractionTokenLimit(pagesInChunk)
          );
          payload = await callProxyWithRetry(
            config,
            body,
            `halaman ${chunk.start}–${chunk.end} jalur langsung`,
            makeTransportHooks(chunk, chunkIndex, 'Ekstraksi jalur langsung', 0.28, 0.53, 0.62)
          );
        } finally {
          const firstPassMs = performance.now() - aiStartedAt;
          betaPerf.aiMs += firstPassMs;
          timing.totalMs = Math.max(0, firstPassMs);
        }
        body = null;
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

        if (payload?._mileEffectiveModel === GEMINI_38_MODEL) {
          betaPerf.geminiSuccesses++;
          activeAiLimit = workerCount;
        }

        const auditPages = verificationPages(config, normalized, expectedPages);
        timing.rows = normalized.length;
        timing.auditPages = auditPages.length;
        results[chunkIndex] = normalized;
        rowsFound += normalized.length;
        const state = chunkStates[chunkIndex];
        state.active = false;
        state.waiting = false;
        state.waitingSince = 0;
        if (auditPages.length) {
          betaPerf.auditPages += auditPages.length;
          pendingAudits[chunkIndex] = { chunk, chunkIndex, pageSources, auditPages, expectedPages, template };
          state.progress = Math.max(state.progress, 0.66);
          updateParallelProgress(chunk, chunkIndex, `Menunggu audit ${auditPages.length} halaman`);
        } else {
          pageSources.forEach(source => { source.url = ''; source.blob = null; });
          completedChunks++;
          state.progress = 1;
          updateParallelProgress(chunk, chunkIndex, 'Selesai');
        }
      }

      async function auditChunk({ chunk, chunkIndex, pageSources, auditPages, template }) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        const auditGroupStartedAt = performance.now();
        const timing = betaPerf.chunkTimings[chunkIndex];
        timing.status = 'auditing';
        const state = chunkStates[chunkIndex];
        state.active = true;
        state.startedAt = performance.now();
        state.waitingSince = 0;
        state.progress = Math.max(state.progress, 0.68);
        updateParallelProgress(chunk, chunkIndex, `Audit selektif ${auditPages.length} halaman`);

        const verificationImages = [];
        for (const pageNumber of auditPages) {
          const source = pageSources.find(item => item.page === pageNumber);
          if (!source) continue;
          const auditStartedAt = performance.now();
          const page = directCameraInput ? null : await pdf.getPage(pageNumber);
          let auditUrl = '';
          let directAuditUrl = '';
          try {
            if (directCameraInput) {
              directAuditUrl = source.url || await blobToDataUrl(source.blob);
              auditUrl = directAuditUrl;
            } else {
              const rendered = await runRender(() => renderPageToImage(page, config.accuracyMode, config.speedPreset, config.networkProfile, true));
              directAuditUrl = rendered.detailUrl || rendered.fullUrl;
              auditUrl = directAuditUrl;
              if (betaRemoteImagesAvailable) {
                try {
                  auditUrl = await uploadBetaImageWithRetry(betaJobId, pageNumber, 'audit', dataUrlToBlob(auditUrl), publicR2Experiment);
                } catch (uploadError) {
                  betaPerf.r2Failures++;
                  if (publicR2Experiment) {
                    const strictR2Error = new Error(`Gagal mengunggah audit halaman ${pageNumber} ke R2. DeepSeek memerlukan URL R2 dan tidak akan mengirim gambar langsung dari komputer.`);
                    strictR2Error.status = Number(uploadError?.status || 503);
                    throw strictR2Error;
                  }
                }
              }
            }
          } finally {
            page?.cleanup?.();
            betaPerf.auditMs += performance.now() - auditStartedAt;
          }
          verificationImages.push({
            page: source.page,
            label: `HALAMAN ${source.page} — ZOOM AUDIT`,
            url: auditUrl || source.url,
            directUrl: directAuditUrl
          });
        }

        const originalRows = results[chunkIndex] || [];
        const draftRows = rowsForVerification(
          originalRows.filter(row => auditPages.includes(Number(row.sourcePage)))
        );
        let verificationBody = buildApiBody(
          config,
          buildVerificationPrompt(chunk.start, chunk.end, draftRows, { ...config, pages: auditPages }),
          verificationImages,
          verificationTokenLimit(auditPages.length)
        );
        const auditAiStartedAt = performance.now();
        let verifiedPayload;
        try {
          verifiedPayload = await callProxyWithRetry(
            config,
            verificationBody,
            `audit halaman ${auditPages.join(', ')}`,
            makeTransportHooks(chunk, chunkIndex, 'Audit selektif', 0.68, 0.85, 0.93)
          );
        } catch (error) {
          if (publicR2Experiment || !isR2BridgeFailure(error) || !verificationImages.every(source => source.directUrl)) throw error;
          const directVerificationImages = verificationImages.map(source => ({
            page: source.page,
            label: source.label,
            url: source.directUrl
          }));
          verificationBody = buildApiBody(
            config,
            buildVerificationPrompt(chunk.start, chunk.end, draftRows, { ...config, pages: auditPages }),
            directVerificationImages,
            verificationTokenLimit(auditPages.length)
          );
          verifiedPayload = await callProxyWithRetry(
            config,
            verificationBody,
            `audit halaman ${auditPages.join(', ')} jalur langsung`,
            makeTransportHooks(chunk, chunkIndex, 'Audit jalur langsung', 0.68, 0.85, 0.93)
          );
        } finally {
          betaPerf.aiMs += performance.now() - auditAiStartedAt;
        }
        verificationBody = null;
        const usage = getUsage(verifiedPayload, config.protocol);
        totalUsage.input += Number(usage.input || 0);
        totalUsage.output += Number(usage.output || 0);
        const verifiedRows = normalizeRows(
          parseRows(verifiedPayload, config.protocol),
          template,
          chunk.start - 1,
          { ...config, expectedPages: auditPages }
        );
        const merged = mergeVerifiedRows(originalRows, verifiedRows, auditPages);
        timing.rows = merged.length;
        rowsFound += merged.length - originalRows.length;
        results[chunkIndex] = merged;
        pageSources.forEach(source => { source.url = ''; source.blob = null; });
        completedChunks++;
        state.active = false;
        state.waiting = false;
        state.waitingSince = 0;
        state.progress = 1;
        timing.auditMs += Math.max(0, performance.now() - auditGroupStartedAt);
        timing.status = 'success';
        updateParallelProgress(chunk, chunkIndex, 'Audit selesai');
      }

      const limitedByNetwork = config.pagesPerRequest !== config.requestedPagesPerRequest || config.concurrency !== config.requestedConcurrency;
      const networkExplanation = limitedByNetwork
        ? `Profil ${config.networkProfile.label} membatasi menjadi ${config.pagesPerRequest} halaman × maksimal ${workerCount} jalur.`
        : (config.cameraDirect
          ? `${CAMERA_WAVE_SIZE} gambar diproses per batch dalam kelompok ${CAMERA_BATCH_SIZE}, hingga ${CAMERA_AI_CONCURRENCY} permintaan paralel.`
          : GEMINI_FALLBACK_CHAIN.includes(config.model)
          ? `Gemini berjalan dengan ${activeAiLimit} jalur Turbo langsung.`
          : `Model pilihan berjalan dengan maksimal ${workerCount} jalur.`);
      const imageTransport = publicR2Experiment
        ? 'tautan gambar R2 sementara ke DeepSeek'
        : (betaRemoteImagesAvailable ? 'R2 pemulihan' : `gambar base64 langsung ke ${shortModelLabel(config.model)}`);
      const preparationExplanation = config.cameraDirect
        ? 'Foto hasil capture dibaca langsung tanpa render PDF.'
        : 'Maksimal dua halaman dirender bersamaan agar PC tetap responsif.';
      setProgress(5, 'Memulai mode Turbo', `${chunks.length} kelompok disiapkan. ${preparationExplanation} ${networkExplanation} Pengiriman: ${imageTransport}.`, formatUsage(totalUsage));
      setProgressStats({ renderedPages: 0, totalPages: pdf.numPages, completedChunks: 0, totalChunks: chunks.length });
      setTransferProgress(0, 'Menyiapkan gambar kelompok pertama');
      const inFlight = new Set();
      let pipelineError = null;
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        if (cancelled) throw new DOMException('Proses dibatalkan pengguna.', 'AbortError');
        if (pipelineError) throw pipelineError;
        while (inFlight.size >= activeAiLimit) {
          await Promise.race(inFlight);
          if (pipelineError) throw pipelineError;
        }
        const chunk = chunks[chunkIndex];
        const pageSources = await prepareChunk(chunk, chunkIndex);
        if (pipelineError) throw pipelineError;
        const task = processChunk(chunk, chunkIndex, pageSources)
          .catch(error => {
            pipelineError ||= error;
          })
          .finally(() => inFlight.delete(task));
        inFlight.add(task);
      }
      await Promise.all(inFlight);
      if (pipelineError) throw pipelineError;

      const audits = pendingAudits.filter(Boolean);
      if (audits.length) {
        setTransferProgress(0, `${audits.length} kelompok perlu audit · dijalankan satu jalur`);
        for (const audit of audits) {
          await auditChunk(audit);
        }
      }
      setTransferProgress(100, 'Semua respons AI telah diterima');

      const mergedRows = results.flat().filter(Boolean);
      if (!mergedRows.length) throw new Error(`AI tidak menemukan data penerima pada ${directCameraInput ? 'foto kamera' : 'PDF'} ini.`);
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
        model: betaPerf.fallbackModels.length ? [config.model, ...betaPerf.fallbackModels].join(' -> ') : config.model,
        chunkSize: config.pagesPerRequest,
        concurrency: config.concurrency,
        durationSeconds: Number(elapsed.toFixed(3)),
        totalRows: mergedRows.length,
        reviewCount: reviewRowCount(mergedRows),
        outsideBatamCount: outsideBatamRowCount(mergedRows),
        chunkTimings: publicChunkTimings(betaPerf.chunkTimings),
        message: `${config.cameraDirect ? 'camera-direct' : 'beta-r2'};input=${directCameraInput ? 'jpeg' : 'pdf'};remote=${betaPerf.remotePages};base64=${betaPerf.base64Pages};r2_fail=${betaPerf.r2Failures};render_ms=${Math.round(betaPerf.renderMs)};upload_ms=${Math.round(betaPerf.uploadMs)};ai_sum_ms=${Math.round(betaPerf.aiMs)};audit_ms=${Math.round(betaPerf.auditMs)};audit_pages=${betaPerf.auditPages};gemini_ok=${betaPerf.geminiSuccesses};fallback=${betaPerf.fallbackRequests};fallback_reason=${JSON.stringify(betaPerf.fallbackReasons)}`
      };
      void submitProcessingMetrics(metrics);

      const itemType = $('itemType')?.value || 'DOKUMEN';
      if (itemType === 'PAKET') {
        core.tempExtractedRows = mergedRows;
        hideProgress();
        core.showWeightModal();
      } else {
        core.uploadedFilesManager.push({ id: Date.now(), name: inputName, rows: mergedRows, source: directCameraInput ? 'Camera AI' : 'AI PDF' });
        core.updateInterface();
        setProgress(100, 'Selesai', `${mergedRows.length} baris berhasil diekstrak dalam ${formatPreciseDuration(elapsed)} (${(elapsed / mergedRows.length).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} detik/data). Penyiapan ${formatPreciseDuration(betaPerf.renderMs / 1000)} · ${config.cameraDirect ? `${pageCount} gambar dikirim langsung tanpa R2` : `gambar sementara ${betaPerf.remotePages}/${pageCount} halaman`}.`, formatUsage(totalUsage));
        progressHideTimeout = window.setTimeout(hideProgress, 1200);
        showToast(`${mergedRows.length} data selesai dalam ${formatPreciseDuration(elapsed)} · ${(elapsed / mergedRows.length).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} detik/data.`, 'success');
        core.processNextInQueue();
      }
      return metrics;
    } catch (error) {
      if (error?.name !== 'AbortError') cancelled = true;
      const elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
      stopStopwatch(elapsed, completedRowCount);
      const failedMetrics = {
        status: error?.name === 'AbortError' ? 'CANCELLED' : 'FAILED',
        fileCount: 1,
        pageCount,
        model: betaPerf.fallbackModels.length
          ? [config?.model || DEFAULT_MODEL, ...betaPerf.fallbackModels].join(' -> ')
          : (config?.model || ''),
        chunkSize: config?.pagesPerRequest || 1,
        concurrency: config?.concurrency || 1,
        durationSeconds: Number(elapsed.toFixed(3)),
        totalRows: completedRowCount,
        reviewCount: 0,
        outsideBatamCount: 0,
        message: error?.name === 'AbortError'
          ? 'Dibatalkan pengguna'
          : `${config?.cameraDirect ? 'camera-direct' : 'beta-r2'};input=${directCameraInput ? 'jpeg' : 'pdf'};remote=${betaPerf.remotePages};base64=${betaPerf.base64Pages};r2_fail=${betaPerf.r2Failures};audit_pages=${betaPerf.auditPages};gemini_ok=${betaPerf.geminiSuccesses};fallback=${betaPerf.fallbackRequests};error=${String(error?.message || 'Kesalahan pemrosesan')}`.slice(0, 400)
      };
      void submitProcessingMetrics(failedMetrics);
      hideProgress();
      if (error?.name === 'AbortError') showToast(`Proses ${directCameraInput ? 'kamera' : 'PDF'} dibatalkan setelah ${formatPreciseDuration(elapsed)}.`, 'info');
      else showToast(`Gagal memproses ${directCameraInput ? 'kamera' : 'PDF'} setelah ${formatPreciseDuration(elapsed)}: ${error.message}`, 'error');
      core.processNextInQueue();
    } finally {
      activeControllers.forEach(controller => controller.abort());
      activeControllers.clear();
      if (betaRemoteImagesAvailable) await cleanupBetaImages(betaJobId);
      try { pdf?.cleanup?.(); pdf?.destroy?.(); } catch (_) {}
    }
  }

  function processCameraImages(images, options = {}) {
    return processPDFFile(null, { ...options, cameraImages: images });
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
      $(id)?.addEventListener('change', () => {
        if (id === 'aiModel') {
          updateSpeedPresetHint();
          updateNetworkModeHint();
        }
        saveNonSecretConfig();
      });
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
    processCameraImages,
    testConnection,
    cancel: cancelProcess,
    _test: { normalizeEndpoint, findBalancedJson, parseRows, normalizeRows, buildApiBody, buildJsonRepairBody, buildPrompt, buildVerificationPrompt, extractionTokenLimit, verificationTokenLimit, callViaProxy, callProxyWithRetry, isAutoFallbackEligible, stripRecipientPrefix, stripRecipientMachineCodes, isRecipientMachineCode, stripSubjectLabel, stripOfficialReferenceLabel, compactOfficialReference, isStructuredOfficialReference, normalizeOfficialReference, extractReferenceFromLines, stripCommonArtifacts, splitMixedNameAddress, shouldVerifyChunk, verificationPages, mergeVerifiedRows, normalizeBniReference, isIgnoredBniStandaloneCode, removeIgnoredBniCodesFromAddress, parseBniStructure, extractPrintedZip, classifyOutsideBatam, formatPreciseDuration, formatStopwatch, formatBytes, resolveNetworkProfile, createTaskPool, reviewRowCount, outsideBatamRowCount, getUsage, getConfig, pageDefaultModel, isCameraDirectMode, normalizeCameraImages, prepareCameraBlobsForBatch }
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
