(() => {
  'use strict';

  const MAX_CAPTURES = 150;
  const MAX_IMAGE_BYTES = 120 * 1000;
  const OUTPUT_MAX_SIDE = 1280;
  const OUTPUT_MAX_PIXELS = 1280 * 720;
  const THUMBNAIL_MAX_SIDE = 360;
  const FOCUS_RESET_DELAY_MS = 650;
  const DRAFT_SAVE_DELAY_MS = 2400;
  const DRAFT_SAVE_MAX_WAIT_MS = 5000;
  const DEFAULT_AI_MODEL = 'deepseek-v4.1-flash';
  const DEVICE_NAME_STORAGE_KEY = 'mile_camera_device_name';
  const core = window.MileCameraCore;
  const photo = window.MileCameraPhoto;
  const store = window.MileCameraStore;
  const $ = id => document.getElementById(id);

  let stream = null;
  let captures = [];
  let pendingCaptureQueue = [];
  let pendingCaptureCount = 0;
  let captureQueueRunning = false;
  let sessionId = '';
  let sessionStartedAt = '';
  let captureBusy = false;
  let finalizingBatch = false;
  let wakeLock = null;
  let galleryIndex = 0;
  let galleryObjectUrl = '';
  let retakeSlotIndex = -1;
  let draftSaveChain = Promise.resolve();
  let draftSaveTimer = 0;
  let draftSaveUsesIdleCallback = false;
  let draftRestorePromise = Promise.resolve();
  let savedDeviceName = '';
  let focusIndicatorTimer = 0;
  let focusResetTimer = 0;
  let orientationSyncTimer = 0;
  let physicalOrientation = '';
  let physicalOrientationRotation = 0;
  let orientationCandidate = '';
  let orientationCandidateCount = 0;
  let orientationSensorStarted = false;
  let orientationPermissionPromise = null;
  let lastMotionOrientationAt = 0;
  let continuousFocusTrack = null;
  let continuousFocusEnabled = false;
  let continuousFocusRetryTimers = [];

  const constrainedDevice = (() => {
    const memory = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    return (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
  })();
  const MAX_PENDING_CAPTURE_FRAMES = constrainedDevice ? 3 : 5;
  document.documentElement.classList.toggle('camera-low-power', constrainedDevice);

  function captureButtons() {
    return [$('captureButton'), $('captureButtonFullscreen')].filter(Boolean);
  }

  function setCaptureDisabled(disabled) {
    captureButtons().forEach(button => { button.disabled = disabled; });
  }

  function finishButtons() {
    return [$('finishCaptureButton'), $('finishCaptureButtonFullscreen'), $('finishCaptureButtonBatch')].filter(Boolean);
  }

  function setFinishDisabled(disabled) {
    finishButtons().forEach(button => { button.disabled = disabled; });
  }

  function setReviewDisabled(disabled) {
    const button = $('reviewCapturesButtonFullscreen');
    if (button) button.disabled = disabled;
  }

  let audioContext = null;
  let hudToastTimer = 0;

  function getAudioContext() {
    try {
      if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioContext = new AudioContextClass();
      }
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
    } catch (_) {}
    return audioContext;
  }

  function playShutterSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1400, now);
      osc1.frequency.exponentialRampToValueAtTime(180, now + 0.022);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.025);

      const snapTime = now + 0.036;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1200, snapTime);
      osc2.frequency.exponentialRampToValueAtTime(90, snapTime + 0.035);
      gain2.gain.setValueAtTime(0.5, snapTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, snapTime + 0.035);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(snapTime);
      osc2.stop(snapTime + 0.04);

      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(160, snapTime);
      thump.frequency.exponentialRampToValueAtTime(45, snapTime + 0.045);
      thumpGain.gain.setValueAtTime(0.4, snapTime);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, snapTime + 0.045);
      thump.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thump.start(snapTime);
      thump.stop(snapTime + 0.05);
    } catch (_) {}
  }

  function flashCameraStage() {
    const flash = $('cameraFlash');
    if (!flash) return;
    flash.classList.add('is-flashing');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        flash.classList.remove('is-flashing');
      });
    });
  }

  function showHudToast(message) {
    const hud = $('cameraHudToast');
    if (!hud) return;
    if (hudToastTimer) window.clearTimeout(hudToastTimer);
    hud.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" style="flex-shrink:0;color:#4ade80"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/></svg><span>${message}</span>`;
    hud.classList.add('is-visible');
    hudToastTimer = window.setTimeout(() => {
      hud.classList.remove('is-visible');
      hudToastTimer = 0;
    }, 2400);
  }

  let userExitedFullscreen = false;

  function isCameraFullscreen() {
    return Boolean(
      (document.fullscreenElement || document.webkitFullscreenElement) === $('cameraStage')
      || $('cameraStage')?.classList.contains('is-fullscreen')
      || document.body.classList.contains('camera-fullscreen-active')
    );
  }

  function enterFullscreenMode() {
    userExitedFullscreen = false;
    const stage = $('cameraStage');
    if (!stage) return;
    stage.classList.add('is-fullscreen');
    document.body.classList.add('camera-fullscreen-active');
    handleViewportChange();
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (stage.requestFullscreen) {
          stage.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        } else if (stage.webkitRequestFullscreen) {
          stage.webkitRequestFullscreen();
        }
      }
    } catch (_) {}
  }

  function exitCameraFullscreen() {
    userExitedFullscreen = true;
    const stage = $('cameraStage');
    closeCaptureGallery();
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(() => {});
      }
    } catch (_) {}
    stage?.classList.remove('is-fullscreen');
    document.body.classList.remove('camera-fullscreen-active');
    handleViewportChange();
  }

  function randomId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    const bytes = new Uint8Array(16);
    window.crypto?.getRandomValues?.(bytes);
    return `${prefix}-${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function setStatus(message, type = 'info') {
    const node = $('cameraMessage');
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
    node.hidden = !message;
  }

  function toast(message, type = 'info') {
    const region = $('toastRegion');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `camera-toast camera-toast--${type}`;
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 4200);
  }

  function formatTime(iso) {
    try {
      return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
    } catch (_) {
      return iso;
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
  }

  function applyPhysicalOrientationCandidate(orientation, rotation = 0) {
    if (!['portrait', 'landscape'].includes(orientation)) return;
    const normalizedRotation = orientation === 'landscape' && rotation === -90 ? -90
      : orientation === 'landscape' ? 90 : 0;
    const candidate = `${orientation}:${normalizedRotation}`;
    const current = `${physicalOrientation}:${physicalOrientationRotation}`;
    if (candidate === current) {
      orientationCandidate = candidate;
      orientationCandidateCount = 0;
      return;
    }
    if (orientationCandidate !== candidate) {
      orientationCandidate = candidate;
      orientationCandidateCount = 1;
      return;
    }
    orientationCandidateCount += 1;
    // Tiga sampel berurutan mencegah preview bolak-balik saat HP hampir datar.
    if (orientationCandidateCount < 3) return;
    physicalOrientation = orientation;
    physicalOrientationRotation = normalizedRotation;
    orientationCandidateCount = 0;
    window.requestAnimationFrame(updateStageAspect);
  }

  function handleDeviceMotionOrientation(event) {
    const gravity = event.accelerationIncludingGravity;
    if (gravity?.x == null || gravity?.y == null) return;
    const x = Number(gravity?.x);
    const y = Number(gravity?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    // Abaikan posisi hampir datar karena gravitasi tidak cukup untuk menentukan
    // apakah sisi panjang HP sedang portrait atau landscape.
    if (Math.hypot(absX, absY) < 3.8) return;
    lastMotionOrientationAt = Date.now();
    if (absX > 4.5 && absX > absY + 1.6) {
      applyPhysicalOrientationCandidate('landscape', x > 0 ? -90 : 90);
    } else if (absY > 4.5 && absY > absX + 1.6) {
      applyPhysicalOrientationCandidate('portrait', 0);
    }
  }

  function handleDeviceOrientationSensor(event) {
    // DeviceMotion lebih stabil untuk mendeteksi gravitasi dan diprioritaskan.
    if (Date.now() - lastMotionOrientationAt < 1200) return;
    if (event.beta == null || event.gamma == null) return;
    const beta = Number(event.beta);
    const gamma = Number(event.gamma);
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    const absBeta = Math.abs(beta);
    const absGamma = Math.abs(gamma);
    if (absGamma >= 48) {
      const gravityX = -Math.cos(beta * Math.PI / 180) * Math.sin(gamma * Math.PI / 180);
      applyPhysicalOrientationCandidate('landscape', gravityX > 0 ? -90 : 90);
    } else if (absGamma <= 26 && absBeta >= 42) {
      applyPhysicalOrientationCandidate('portrait', 0);
    }
  }

  function startPhysicalOrientationTracking() {
    if (orientationSensorStarted) return Promise.resolve(true);
    if (orientationPermissionPromise) return orientationPermissionPromise;
    orientationPermissionPromise = (async () => {
      try {
        const MotionEvent = window.DeviceMotionEvent;
        const OrientationEvent = window.DeviceOrientationEvent;
        const requestPermission = typeof MotionEvent?.requestPermission === 'function'
          ? MotionEvent.requestPermission.bind(MotionEvent)
          : typeof OrientationEvent?.requestPermission === 'function'
            ? OrientationEvent.requestPermission.bind(OrientationEvent)
            : null;
        if (requestPermission && await requestPermission() !== 'granted') return false;
        window.addEventListener('devicemotion', handleDeviceMotionOrientation, { passive: true });
        window.addEventListener('deviceorientation', handleDeviceOrientationSensor, { passive: true });
        orientationSensorStarted = true;
        return true;
      } catch (_) {
        return false;
      }
    })();
    return orientationPermissionPromise;
  }

  function updateStageAspect() {
    const stage = $('cameraStage');
    const video = $('cameraPreview');
    if (!stage) return;
    const viewportOrientation = window.matchMedia?.('(orientation: landscape)').matches
      || window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    const fullscreen = isCameraFullscreen();
    const usesPhysicalSensor = fullscreen && Boolean(physicalOrientation);
    const cameraOrientation = usesPhysicalSensor ? physicalOrientation : viewportOrientation;
    stage.dataset.orientation = cameraOrientation;
    stage.dataset.orientationSource = usesPhysicalSensor ? 'sensor' : 'viewport';
    document.documentElement.dataset.cameraOrientation = cameraOrientation;
    const layout = core.fullscreenLayout({
      width: stage.clientWidth || window.innerWidth,
      height: stage.clientHeight || window.innerHeight,
      orientation: fullscreen ? cameraOrientation : viewportOrientation,
      rotation: physicalOrientationRotation
    });
    stage.dataset.layoutRotation = String(fullscreen ? layout.rotation : 0);
    stage.style.setProperty('--camera-view-width', `${layout.width}px`);
    stage.style.setProperty('--camera-view-height', `${layout.height}px`);
    stage.style.setProperty('--camera-view-rotation', `${fullscreen ? layout.rotation : 0}deg`);
    if (!video?.videoWidth || !video?.videoHeight) return;
    const frameOrientation = video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait';
    // Browser/camera drivers already orient the video. Rotate the controls only:
    // a second CSS rotation flips Chrome Android's live image when portrait is locked.
    stage.dataset.frameOrientation = frameOrientation;
    stage.dataset.previewRotation = '0';
    stage.dataset.captureRotation = String(fullscreen ? -layout.rotation : 0);
    stage.style.setProperty('--camera-aspect', `${video.videoWidth}/${video.videoHeight}`);
  }

  function currentCaptureRotation() {
    const value = Number($('cameraStage')?.dataset?.captureRotation || 0);
    return value === 90 || value === -90 ? value : 0;
  }

  function handleViewportChange() {
    updateStageAspect();
    if (orientationSyncTimer) window.clearTimeout(orientationSyncTimer);
    // Android mengubah dimensi video beberapa frame sesudah event orientasi layar.
    orientationSyncTimer = window.setTimeout(() => {
      updateStageAspect();
      scheduleContinuousAutofocus(stream?.getVideoTracks?.()[0], [0, 320], true);
      orientationSyncTimer = 0;
    }, 180);
  }

  function rememberDeviceName(value = $('cameraDeviceName')?.value) {
    const name = String(value || '').trim().slice(0, 30);
    if (!name) return savedDeviceName;
    savedDeviceName = name;
    const input = $('cameraDeviceName');
    if (input) input.value = name;
    try { localStorage.setItem(DEVICE_NAME_STORAGE_KEY, name); } catch (_) {}
    return savedDeviceName;
  }

  function currentDeviceName() {
    return savedDeviceName || String($('cameraDeviceName')?.value || '').trim();
  }

  function pointInCameraView(event) {
    const stage = $('cameraStage');
    const rect = stage.getBoundingClientRect();
    return core.cameraViewPoint({
      x: event.clientX - rect.left, y: event.clientY - rect.top,
      width: rect.width, height: rect.height,
      rotation: Number(stage.dataset.layoutRotation || 0)
    });
  }

  function showFocusIndicator(event) {
    const stage = $('cameraStage');
    const indicator = $('cameraFocusIndicator');
    if (!stage || !indicator) return;
    const rect = stage.getBoundingClientRect();
    const view = $('cameraView');
    const point = pointInCameraView(event);
    indicator.style.left = `${Math.max(24, Math.min((view?.clientWidth || rect.width) - 24, point.x))}px`;
    indicator.style.top = `${Math.max(24, Math.min((view?.clientHeight || rect.height) - 24, point.y))}px`;
    indicator.hidden = false;
    indicator.classList.remove('is-focusing');
    void indicator.offsetWidth;
    indicator.classList.add('is-focusing');
    if (focusIndicatorTimer) window.clearTimeout(focusIndicatorTimer);
    focusIndicatorTimer = window.setTimeout(() => {
      indicator.classList.remove('is-focusing');
      indicator.hidden = true;
      focusIndicatorTimer = 0;
    }, FOCUS_RESET_DELAY_MS);
  }

  function clearContinuousFocusRetries() {
    continuousFocusRetryTimers.forEach(timer => window.clearTimeout(timer));
    continuousFocusRetryTimers = [];
  }

  async function enableContinuousAutofocus(track = stream?.getVideoTracks?.()[0], { force = false } = {}) {
    if (!track || track.readyState === 'ended' || !track.applyConstraints) return false;
    if (track !== continuousFocusTrack) {
      continuousFocusTrack = track;
      continuousFocusEnabled = false;
    }
    const settings = track.getSettings?.() || {};
    if (!force && (continuousFocusEnabled || settings.focusMode === 'continuous')) {
      continuousFocusEnabled = true;
      return true;
    }
    const capabilities = track.getCapabilities?.() || {};
    const focusModes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
    if (focusModes.length && !focusModes.includes('continuous')) {
      $('cameraStage')?.setAttribute('data-autofocus', 'device-default');
      return false;
    }
    try {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      continuousFocusEnabled = true;
      $('cameraStage')?.setAttribute('data-autofocus', 'continuous');
      return true;
    } catch (_) {
      continuousFocusEnabled = false;
      return false;
    }
  }

  function scheduleContinuousAutofocus(track = stream?.getVideoTracks?.()[0], delays = [0, 260, 900], force = false) {
    if (!track || track.readyState === 'ended') return;
    clearContinuousFocusRetries();
    continuousFocusRetryTimers = delays.map((delay, index) => window.setTimeout(async () => {
      if (track !== stream?.getVideoTracks?.()[0]) return;
      const enabled = await enableContinuousAutofocus(track, { force: force && index === 0 });
      if (enabled) clearContinuousFocusRetries();
    }, delay));
  }

  async function focusCameraAt(event) {
    if (!stream || !isCameraFullscreen()) return;
    if (event.target?.closest?.('button,.camera-capture-gallery')) return;
    showFocusIndicator(event);
    const track = stream.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    try {
      const capabilities = track.getCapabilities?.() || {};
      const focusModes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
      const requestedMode = focusModes.includes('single-shot')
        ? 'single-shot'
        : focusModes.includes('continuous') ? 'continuous' : '';
      if (!requestedMode) return;
      continuousFocusEnabled = false;
      await track.applyConstraints({ advanced: [{ focusMode: requestedMode }] });
      if (requestedMode === 'single-shot' && focusModes.includes('continuous')) {
        if (focusResetTimer) window.clearTimeout(focusResetTimer);
        focusResetTimer = window.setTimeout(() => {
          scheduleContinuousAutofocus(track, [0, 260], true);
          focusResetTimer = 0;
        }, FOCUS_RESET_DELAY_MS);
      } else if (requestedMode === 'continuous') {
        continuousFocusEnabled = true;
      }
    } catch (_) {}
  }

  function stopCamera() {
    if (focusIndicatorTimer) window.clearTimeout(focusIndicatorTimer);
    if (focusResetTimer) window.clearTimeout(focusResetTimer);
    if (orientationSyncTimer) window.clearTimeout(orientationSyncTimer);
    clearContinuousFocusRetries();
    focusIndicatorTimer = 0;
    focusResetTimer = 0;
    orientationSyncTimer = 0;
    continuousFocusTrack = null;
    continuousFocusEnabled = false;
    stream?.getTracks?.().forEach(track => track.stop());
    stream = null;
    const video = $('cameraPreview');
    if (video) video.srcObject = null;
    $('cameraStage')?.classList.remove('is-active');
    if ($('cameraActionDock')) $('cameraActionDock').hidden = true;
    setCaptureDisabled(true);
    $('cameraState').textContent = 'Kamera belum aktif';
  }

  async function startCamera() {
    const button = $('openCameraButton');
    const buttonLabel = button?.querySelector('.camera-open-button__copy strong');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera API tidak tersedia. Buka halaman ini melalui HTTPS di Chrome Android.', 'error');
      return;
    }
    getAudioContext();
    // Dipicu dari klik pengguna agar iOS dapat meminta izin sensor. Proses kamera
    // tidak menunggu sensor sehingga Android lama tetap membuka preview secepatnya.
    void startPhysicalOrientationTracking();
    // Harus dipanggil sebelum await agar native fullscreen masih berada dalam user gesture klik.
    enterFullscreenMode();
    await draftRestorePromise;
    rememberDeviceName();
    button.disabled = true;
    if (buttonLabel) buttonLabel.textContent = 'Membuka Kamera…';
    setStatus('Izinkan akses kamera ketika Chrome menampilkan permintaan.', 'info');
    stopCamera();

    try {
      const sharedConstraints = photo.previewConstraints();
      const videoConstraints = { ...sharedConstraints, facingMode: { ideal: 'environment' } };
      
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      const video = $('cameraPreview');
      video.srcObject = stream;
      await video.play();
      $('cameraStage')?.classList.add('is-active');
      updateStageAspect();
      const track = stream.getVideoTracks()[0];
      track.addEventListener?.('unmute', () => scheduleContinuousAutofocus(track, [0, 260], true));
      const settings = track.getSettings?.() || {};
      $('cameraState').textContent = `${settings.width || video.videoWidth} × ${settings.height || video.videoHeight} sumber · JPEG maks 720p / 120 KB · zoom 1×`;
      ensureSession();
      if ($('cameraActionDock')) $('cameraActionDock').hidden = false;
      updateBatchUi();
      setStatus('Kamera aktif dan mode capture fullscreen siap digunakan.', 'success');

      // Konfigurasi tambahan tidak boleh menahan kamera siap digunakan pada HP lama.
      window.setTimeout(async () => {
        const capabilities = track.getCapabilities?.() || {};
        if (Number.isFinite(capabilities.zoom?.min) && Number.isFinite(capabilities.zoom?.max)
            && capabilities.zoom.min <= 1 && capabilities.zoom.max >= 1) {
          try {
            await track.applyConstraints({ advanced: [{ zoom: 1 }] });
          } catch (_) {}
        }
        scheduleContinuousAutofocus(track);
      }, 0);
    } catch (error) {
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      setStatus(
        denied
          ? 'Izin kamera ditolak. Buka pengaturan situs Chrome, izinkan Camera, lalu coba lagi.'
          : `Kamera tidak dapat dibuka: ${error?.message || 'perangkat tidak tersedia'}`,
        'error'
      );
      exitCameraFullscreen();
    } finally {
      button.disabled = false;
      if (buttonLabel) buttonLabel.textContent = stream ? 'Buka Ulang Kamera' : 'Open Camera';
    }
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => { wakeLock = null; }, { once: true });
      }
    } catch (_) {}
  }

  function ensureSession() {
    if (sessionId) return;
    sessionId = randomId('CAM');
    if (window.MileCameraStream) window.MileCameraStream.init(sessionId);
    sessionStartedAt = new Date().toISOString();
    $('sessionIdentifier').textContent = sessionId;
    $('sessionDetails').hidden = false;
    updateBatchUi();
    void requestWakeLock();
  }

  function draftCapturePayload(capture) {
    const { previewUrl, ...stored } = capture;
    return stored;
  }

  function persistDraftSnapshot() {
    if (!store || !sessionId || finalizingBatch) return draftSaveChain;
    const id = sessionId;
    const startedAt = sessionStartedAt;
    const draftCaptures = captures.map(draftCapturePayload);
    const snapshot = {
      id,
      createdAt: Date.parse(startedAt) || Date.now(),
      updatedAt: Date.now(),
      startedAt,
      route: 'camera',
      draft: true,
      captureCount: draftCaptures.length,
      draftCaptures,
      deviceName: currentDeviceName(),
      aiModel: DEFAULT_AI_MODEL
    };
    draftSaveChain = draftSaveChain
      .catch(() => {})
      .then(() => draftCaptures.length ? store.save(snapshot) : store.remove(id))
      .catch(error => {
        console.warn('Draft capture tidak dapat disimpan.', error);
        toast('Penyimpanan otomatis belum berhasil. Jangan tutup halaman sebelum Finish.', 'error');
      });
    return draftSaveChain;
  }

  function queueDraftSave({ immediate = false } = {}) {
    cancelScheduledDraftSave();
    if (immediate) return persistDraftSnapshot();
    const saveWhenIdle = () => {
      draftSaveTimer = 0;
      draftSaveUsesIdleCallback = false;
      if (captureBusy) {
        queueDraftSave();
        return;
      }
      void persistDraftSnapshot();
    };
    if (typeof window.requestIdleCallback === 'function') {
      draftSaveUsesIdleCallback = true;
      draftSaveTimer = window.requestIdleCallback(saveWhenIdle, { timeout: DRAFT_SAVE_MAX_WAIT_MS });
    } else {
      draftSaveTimer = window.setTimeout(saveWhenIdle, DRAFT_SAVE_DELAY_MS);
    }
    return draftSaveChain;
  }

  function cancelScheduledDraftSave() {
    if (draftSaveTimer) {
      if (draftSaveUsesIdleCallback && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(draftSaveTimer);
      else window.clearTimeout(draftSaveTimer);
    }
    draftSaveTimer = 0;
    draftSaveUsesIdleCallback = false;
  }

  function flushDraftSave() {
    cancelScheduledDraftSave();
    return persistDraftSnapshot();
  }

  async function restoreLatestDraft() {
    if (!store?.latestDraft || sessionId || captures.length) return false;
    try {
      const draft = await store.latestDraft();
      if (!draft?.id || !Array.isArray(draft.draftCaptures) || !draft.draftCaptures.length) return false;
      sessionId = draft.id;
      sessionStartedAt = draft.startedAt || new Date(Number(draft.createdAt) || Date.now()).toISOString();
      captures = draft.draftCaptures
        .filter(item => item?.blob instanceof Blob)
        .slice(0, MAX_CAPTURES)
        .map((item, index) => ({
          ...item,
          sequence: index + 1,
          fileName: `${String(index + 1).padStart(3, '0')}.${photo.fileExtension(item.blob)}`,
          previewUrl: URL.createObjectURL(item.thumbnailBlob instanceof Blob ? item.thumbnailBlob : item.blob)
        }));
      if (!captures.length) {
        await store.remove(draft.id);
        sessionId = '';
        sessionStartedAt = '';
        return false;
      }
      $('sessionIdentifier').textContent = sessionId;
      $('sessionDetails').hidden = false;
      if (draft.deviceName) {
        rememberDeviceName(draft.deviceName);
        const setup = $('deviceNameSetup');
        if (setup) setup.hidden = true;
      }
      updateBatchUi();
      setStatus(`${captures.length} capture dari sesi sebelumnya berhasil dipulihkan. Buka kamera untuk melanjutkan.`, 'success');
      toast(`${captures.length} foto dipulihkan otomatis`, 'success');
      return true;
    } catch (error) {
      console.warn('Draft capture tidak dapat dipulihkan.', error);
      return false;
    }
  }

  function validationFrame(canvas) {
    const validationCanvas = $('cameraValidationCanvas');
    const width = Math.min(240, canvas.width);
    const height = Math.max(1, Math.round(width * canvas.height / canvas.width));
    validationCanvas.width = width;
    validationCanvas.height = height;
    const context = validationCanvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  }

  function captureQualityMetadata(outputCanvas) {
    const imageData = validationFrame(outputCanvas);
    return core.validateImageQuality({
      imageData,
      width: outputCanvas.width,
      height: outputCanvas.height
    });
  }

  function canvasToBlob(canvas, quality = 0.9) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gambar gagal dibuat oleh browser.')), 'image/jpeg', quality);
    });
  }

  async function createThumbnailBlob(sourceCanvas) {
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(sourceCanvas.width, sourceCanvas.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    try {
      return await canvasToBlob(canvas, 0.74);
    } finally {
      canvas.width = canvas.height = 1;
    }
  }

  function qualityLabel(quality) {
    if (!quality || quality.ok !== false) return 'Kualitas foto baik';
    if (quality.code === 'blur') return 'Foto mungkin buram · disarankan foto ulang';
    if (quality.code === 'dark') return 'Foto terlalu gelap · disarankan foto ulang';
    if (quality.code === 'bright') return 'Foto terlalu terang · kurangi pantulan';
    if (quality.code === 'resolution') return 'Resolusi foto rendah · dekatkan kamera';
    return quality.reason || 'Periksa kembali kualitas foto';
  }

  function renumberCaptures() {
    captures = captures.map((item, index) => ({
      ...item,
      sequence: index + 1,
      fileName: `${String(index + 1).padStart(3, '0')}.${photo.fileExtension(item.blob)}`
    }));
  }

  function captureImage() {
    if (!stream || !sessionId || finalizingBatch) return;
    const galleryOpen = Boolean($('cameraCaptureGallery') && !$('cameraCaptureGallery').hidden);
    if (galleryOpen) return;
    if (captures.length + pendingCaptureCount >= MAX_CAPTURES) {
      setStatus(`Maksimal ${MAX_CAPTURES} gambar per sesi. Selesaikan batch ini lebih dahulu.`, 'error');
      return;
    }
    if (pendingCaptureCount >= MAX_PENDING_CAPTURE_FRAMES) {
      showHudToast('Antrean foto penuh · tunggu sebentar lalu capture lagi');
      setStatus('Foto sedang disimpan. Tunggu sebentar agar antrean kosong, lalu capture lagi.', 'info');
      return;
    }
    getAudioContext();
    playShutterSound();
    flashCameraStage();
    if (navigator.vibrate) navigator.vibrate(35);

    let snapshotCanvas = null;
    try {
      const video = $('cameraPreview');
      const activeTrack = stream.getVideoTracks()[0];
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error('Tunggu kamera menampilkan gambar sebelum capture.');
      updateStageAspect();
      if (stream?.getVideoTracks()[0] !== activeTrack || activeTrack.readyState === 'ended') {
        throw new Error('Kamera berubah saat mengambil foto. Silakan capture ulang.');
      }
      const captureRotation = currentCaptureRotation();
      const scale = Math.min(
        1,
        OUTPUT_MAX_SIDE / Math.max(sourceWidth, sourceHeight),
        Math.sqrt(OUTPUT_MAX_PIXELS / (sourceWidth * sourceHeight))
      );
      let renderWidth = Math.max(1, Math.round(sourceWidth * scale));
      let renderHeight = Math.max(1, Math.round(sourceHeight * scale));
      while (renderWidth * renderHeight > OUTPUT_MAX_PIXELS) {
        if (renderWidth >= renderHeight) renderWidth -= 1;
        else renderHeight -= 1;
      }
      // Snapshot frame langsung saat tap. Setiap tap memiliki canvas sendiri sehingga
      // JPEG dapat dikompresi berurutan tanpa menghalangi shutter berikutnya.
      snapshotCanvas = document.createElement('canvas');
      snapshotCanvas.width = captureRotation ? renderHeight : renderWidth;
      snapshotCanvas.height = captureRotation ? renderWidth : renderHeight;
      const outputContext = snapshotCanvas.getContext('2d', { alpha: false });
      if (!outputContext) throw new Error('Browser tidak dapat menyiapkan gambar.');
      if (captureRotation) {
        outputContext.translate(snapshotCanvas.width / 2, snapshotCanvas.height / 2);
        outputContext.rotate(captureRotation * Math.PI / 180);
        outputContext.translate(-renderWidth / 2, -renderHeight / 2);
      }
      outputContext.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, renderWidth, renderHeight);
      const quality = captureQualityMetadata(snapshotCanvas);
      const queuedRetakeIndex = retakeSlotIndex >= 0 ? retakeSlotIndex : -1;
      if (queuedRetakeIndex >= 0) retakeSlotIndex = -1;
      pendingCaptureQueue.push({
        canvas: snapshotCanvas,
        quality,
        sourceWidth,
        sourceHeight,
        timestamp: new Date().toISOString(),
        retakeIndex: queuedRetakeIndex
      });
      pendingCaptureCount += 1;
      captureBusy = true;
      updateBatchUi();
      setFinishDisabled(true);
      showHudToast(pendingCaptureCount > 1 ? `Foto masuk antrean · ${pendingCaptureCount} sedang disimpan` : 'Foto diterima · menyimpan JPEG…');
      setStatus('Foto langsung diambil. Penyimpanan JPEG berjalan di antrean agar shutter tetap responsif.', 'info');
      snapshotCanvas = null;
      void processCaptureQueue();
    } catch (error) {
      if (snapshotCanvas) snapshotCanvas.width = snapshotCanvas.height = 1;
      setStatus(`Capture gagal: ${error?.message || 'gambar tidak dapat disimpan.'}`, 'error');
      showHudToast(`Foto belum tersimpan · ${error?.message || 'silakan capture ulang'}`);
      updateBatchUi();
    }
  }

  async function processCaptureQueue() {
    if (captureQueueRunning) return;
    captureQueueRunning = true;
    try {
      while (pendingCaptureQueue.length) {
        const task = pendingCaptureQueue.shift();
        try {
          const { canvas, quality, sourceWidth, sourceHeight, timestamp, retakeIndex } = task;
          const thumbnailPromise = createThumbnailBlob(canvas).catch(() => null);
          const { blob, quality: encodingQuality, width: storedWidth, height: storedHeight } = await photo.encodeImage(canvas, MAX_IMAGE_BYTES);
          const thumbnailBlob = await thumbnailPromise;
          const outputWidth = canvas.width;
          const outputHeight = canvas.height;
          const targetIndex = retakeIndex >= 0 ? Math.min(retakeIndex, captures.length) : captures.length;
          const sequence = targetIndex + 1;
          const fileName = `${String(sequence).padStart(3, '0')}.${photo.fileExtension(blob)}`;
          const capture = {
            captureId: randomId('IMG'),
            timestamp,
            sessionId,
            sequence,
            fileName,
            blob,
            width: storedWidth || outputWidth,
            height: storedHeight || outputHeight,
            sourceWidth,
            sourceHeight,
            resolutionSource: 'video-frame',
            imageFormat: blob.type,
            encodingQuality,
            quality: {
              code: quality.code,
              ok: quality.ok !== false,
              reason: quality.reason || '',
              brightness: Number.isFinite(Number(quality.brightness)) ? Number(Number(quality.brightness).toFixed(1)) : 0,
              sharpness: Number.isFinite(Number(quality.sharpness)) ? Number(Number(quality.sharpness).toFixed(1)) : 0
            },
            thumbnailBlob,
            previewUrl: URL.createObjectURL(thumbnailBlob || blob)
          };
          captures.splice(targetIndex, 0, capture);
          renumberCaptures();
          void queueDraftSave();

          if (window.MileCameraStream) window.MileCameraStream.queueCapture(blob);
          const qualityWarning = quality.ok === false;
          showHudToast(qualityWarning ? `Capture ${sequence} tersimpan · periksa kualitas` : `Capture ${sequence} (${capture.fileName}) tersimpan`);
          setStatus(
            qualityWarning
              ? `${capture.fileName} tersimpan, tetapi ${qualityLabel(quality).toLowerCase()}. Gunakan Lihat Hasil untuk foto ulang.`
              : `Capture ${sequence} tersimpan (${capture.width} × ${capture.height}, ${formatBytes(blob.size)} JPEG). Seluruh frame tersimpan.`,
            qualityWarning ? 'info' : 'success'
          );
          toast(qualityWarning ? `${capture.fileName}: ${qualityLabel(quality)}` : `${capture.fileName} tersimpan`, qualityWarning ? 'info' : 'success');
        } catch (error) {
          if (task.retakeIndex >= 0) retakeSlotIndex = Math.min(task.retakeIndex, captures.length);
          setStatus(`Capture gagal: ${error?.message || 'gambar tidak dapat disimpan.'}`, 'error');
          showHudToast(`Foto belum tersimpan · ${error?.message || 'silakan capture ulang'}`);
        } finally {
          task.canvas.width = task.canvas.height = 1;
          pendingCaptureCount = Math.max(0, pendingCaptureCount - 1);
          captureBusy = pendingCaptureCount > 0;
          updateBatchUi();
        }
      }
    } finally {
      captureQueueRunning = false;
      captureBusy = pendingCaptureCount > 0;
      updateBatchUi();
      if (!captureBusy) scheduleContinuousAutofocus(stream?.getVideoTracks?.()[0], [0, 260], true);
    }
  }

  function removeCapture(captureId, { persist = true } = {}) {
    const capture = captures.find(item => item.captureId === captureId);
    if (capture?.previewUrl) URL.revokeObjectURL(capture.previewUrl);
    captures = captures.filter(item => item.captureId !== captureId);
    renumberCaptures();
    if (persist) void queueDraftSave();
    setStatus('Capture dihapus. Nomor urut batch telah dirapikan.', 'info');
    updateBatchUi();
  }

  function releaseGalleryObjectUrl() {
    if (!galleryObjectUrl) return;
    URL.revokeObjectURL(galleryObjectUrl);
    galleryObjectUrl = '';
  }

  function renderCaptureGallery() {
    const gallery = $('cameraCaptureGallery');
    if (!gallery || gallery.hidden) return;
    if (!captures.length) {
      closeCaptureGallery();
      return;
    }
    galleryIndex = Math.max(0, Math.min(galleryIndex, captures.length - 1));
    const capture = captures[galleryIndex];
    releaseGalleryObjectUrl();
    galleryObjectUrl = URL.createObjectURL(capture.blob);
    $('cameraGalleryImage').src = galleryObjectUrl;
    $('cameraGalleryImage').alt = `Hasil capture ${capture.sequence} dari ${captures.length}`;
    $('cameraGalleryCounter').textContent = `${capture.sequence}/${captures.length} · ${capture.fileName}`;
    $('cameraGalleryDetails').textContent = `${formatTime(capture.timestamp)} · ${capture.width} × ${capture.height} · ${formatBytes(capture.blob.size)}`;
    const qualityNode = $('cameraGalleryQuality');
    qualityNode.textContent = qualityLabel(capture.quality);
    qualityNode.dataset.quality = capture.quality?.ok === false ? 'warning' : 'good';
    $('previousCaptureButton').disabled = galleryIndex <= 0;
    $('nextCaptureButton').disabled = galleryIndex >= captures.length - 1;
  }

  function openCaptureGallery(index = captures.length - 1) {
    const gallery = $('cameraCaptureGallery');
    if (captureBusy) {
      showHudToast('Tunggu antrean foto selesai disimpan sebelum membuka hasil');
      return;
    }
    if (!gallery || !captures.length || !isCameraFullscreen()) return;
    galleryIndex = Math.max(0, Math.min(Number(index) || 0, captures.length - 1));
    gallery.hidden = false;
    $('cameraStage')?.classList.add('is-gallery-open');
    setCaptureDisabled(true);
    setFinishDisabled(true);
    renderCaptureGallery();
    $('closeCaptureGallery')?.focus({ preventScroll: true });
  }

  function closeCaptureGallery() {
    const gallery = $('cameraCaptureGallery');
    if (!gallery || gallery.hidden) return;
    gallery.hidden = true;
    $('cameraStage')?.classList.remove('is-gallery-open');
    releaseGalleryObjectUrl();
    updateBatchUi();
    $('reviewCapturesButtonFullscreen')?.focus({ preventScroll: true });
  }

  function moveCaptureGallery(offset) {
    const target = galleryIndex + offset;
    if (target < 0 || target >= captures.length) return;
    galleryIndex = target;
    renderCaptureGallery();
  }

  function deleteCaptureFromGallery() {
    const capture = captures[galleryIndex];
    if (!capture) return;
    removeCapture(capture.captureId);
    if (captures.length) {
      galleryIndex = Math.min(galleryIndex, captures.length - 1);
      renderCaptureGallery();
    } else closeCaptureGallery();
  }

  function retakeCaptureFromGallery() {
    const capture = captures[galleryIndex];
    if (!capture) return;
    const slot = galleryIndex;
    removeCapture(capture.captureId);
    retakeSlotIndex = Math.min(slot, captures.length);
    closeCaptureGallery();
    showHudToast(`Foto ${slot + 1} dihapus · ambil ulang sekarang`);
    setStatus(`Siap foto ulang untuk posisi ${slot + 1}. Capture berikutnya akan kembali ke urutan tersebut.`, 'info');
  }

  function updateBatchUi() {
    const countLabel = pendingCaptureCount
      ? `${captures.length} gambar · ${pendingCaptureCount} proses`
      : `${captures.length} gambar`;
    $('capturedCount').textContent = countLabel;
    $('fullscreenCapturedCount').textContent = countLabel;
    const galleryOpen = Boolean($('cameraCaptureGallery') && !$('cameraCaptureGallery').hidden);
    setCaptureDisabled(!stream || !sessionId || finalizingBatch || galleryOpen || captures.length + pendingCaptureCount >= MAX_CAPTURES);
    setFinishDisabled(!captures.length || captureBusy || galleryOpen || retakeSlotIndex >= 0);
    setReviewDisabled(!captures.length || captureBusy || galleryOpen);
    const list = $('captureList');
    $('emptyCaptureState').hidden = Boolean(captures.length);

    const existingCards = new Map(Array.from(list.children).map(card => [card.dataset.captureId, card]));

    captures.forEach(capture => {
      let card = existingCards.get(capture.captureId);
      if (!card) {
        card = document.createElement('article');
        card.className = 'capture-card';
        card.dataset.captureId = capture.captureId;
        const image = document.createElement('img');
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('click', () => {
          const index = captures.findIndex(item => item.captureId === card.dataset.captureId);
          if (index >= 0 && isCameraFullscreen()) openCaptureGallery(index);
        });
        const body = document.createElement('div');
        body.className = 'capture-card__body';
        const title = document.createElement('strong');
        const detail = document.createElement('small');
        const quality = document.createElement('span');
        quality.className = 'capture-card__quality';
        body.append(title, detail, quality);
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'capture-card__remove';
        removeButton.textContent = 'Hapus';
        removeButton.addEventListener('click', () => removeCapture(card.dataset.captureId));
        card.append(image, body, removeButton);
      }
      existingCards.delete(capture.captureId);
      const image = card.querySelector('img');
      image.src = capture.previewUrl;
      image.alt = `Hasil capture ${capture.sequence}`;
      const title = card.querySelector('.capture-card__body strong');
      title.textContent = capture.fileName;
      const detail = card.querySelector('.capture-card__body small');
      detail.textContent = `${formatTime(capture.timestamp)} · ${capture.width} × ${capture.height} · ${formatBytes(capture.blob.size)}`;
      const quality = card.querySelector('.capture-card__quality');
      const frameLabel = 'Foto penuh';
      quality.textContent = capture.quality?.ok === false ? `${frameLabel} · ${qualityLabel(capture.quality)}` : `${frameLabel} · kualitas baik`;
      quality.classList.toggle('is-warning', capture.quality?.ok === false);
      const removeButton = card.querySelector('.capture-card__remove');
      removeButton.setAttribute('aria-label', `Hapus ${capture.fileName}`);
      list.appendChild(card);
    });
    existingCards.forEach(card => card.remove());
  }

  function updateProcessingStatus(step, message) {
    $('processingStatus').hidden = false;
    $('processingStatusStep').textContent = step;
    $('processingStatusMessage').textContent = message;
    
    let overlay = $('fullscreenLoader');
    if (!overlay) {
       overlay = document.createElement('div');
       overlay.id = 'fullscreenLoader';
       overlay.innerHTML = `
         <div style="background: white; padding: 25px 30px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 85vw; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
           <span class="camera-processing-spinner" style="margin-bottom: 5px; width: 45px; height: 45px; border-width: 4px;"></span>
           <strong id="fsLoaderStep" style="font-size: 1.25rem; color: #1e3a8a;">${step}</strong>
           <p id="fsLoaderMessage" style="font-size: 0.9rem; color: #475569; margin: 0;">${message}</p>
           <div id="fsLoaderTimer" style="margin-top: 10px; font-family: monospace; font-size: 1.4rem; font-weight: 800; color: #2563eb; background: #eff6ff; padding: 4px 12px; border-radius: 8px;">00:00</div>
         </div>
       `;
       Object.assign(overlay.style, {
         position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
         background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(5px)',
         zIndex: '999999', display: 'flex', alignItems: 'center', justifyContent: 'center'
       });
       document.body.appendChild(overlay);

       window.fsLoaderStartTime = Date.now();
       window.fsLoaderInterval = setInterval(() => {
         const seconds = Math.floor((Date.now() - window.fsLoaderStartTime) / 1000);
         const m = String(Math.floor(seconds / 60)).padStart(2, '0');
         const s = String(seconds % 60).padStart(2, '0');
         const timerEl = document.getElementById('fsLoaderTimer');
         if (timerEl) timerEl.textContent = `${m}:${s}`;
       }, 1000);
    } else {
       const stepEl = document.getElementById('fsLoaderStep');
       const msgEl = document.getElementById('fsLoaderMessage');
       if (stepEl) stepEl.textContent = step;
       if (msgEl) msgEl.textContent = message;
    }
  }
  window.updateProcessingStatus = updateProcessingStatus;

  function hideProcessingStatus() {
    if (window.fsLoaderInterval) window.clearInterval(window.fsLoaderInterval);
    window.fsLoaderInterval = 0;
    $('fullscreenLoader')?.remove();
    if ($('processingStatus')) $('processingStatus').hidden = true;
  }

  async function finishCapturing() {
    if (!captures.length || !sessionId || captureBusy || finalizingBatch) return;
    finalizingBatch = true;
    setFinishDisabled(true);
    setCaptureDisabled(true);
    exitCameraFullscreen();
    updateProcessingStatus('Menyiapkan foto...', `Menyiapkan ${captures.length} foto asli untuk jalur AI langsung...`);
    showHudToast('Menyiapkan batch...');

    try {
      updateProcessingStatus('Menyimpan...', 'Menyimpan batch sementara di HP sebelum membuka pipeline AI...');
      cancelScheduledDraftSave();
      await draftSaveChain.catch(() => {});
      const metadata = captures.map(({ blob, thumbnailBlob, previewUrl, ...capture }) => capture);
      const images = captures.map(({ blob, thumbnailBlob, previewUrl, ...capture }) => ({
        ...capture,
        blob
      }));
      const deviceName = rememberDeviceName();
      const aiModel = DEFAULT_AI_MODEL;
      const captureFinishedAt = new Date();
      const captureStartedMs = Date.parse(sessionStartedAt);
      const captureDurationSeconds = Number.isFinite(captureStartedMs)
        ? Math.max(0, (captureFinishedAt.getTime() - captureStartedMs) / 1000)
        : 0;
      await store.save({
        id: sessionId,
        createdAt: Date.now(),
        startedAt: sessionStartedAt,
        finishedAt: captureFinishedAt.toISOString(),
        route: 'review',
        draft: false,
        captureCount: captures.length,
        captures: metadata,
        images,
        inputFormat: 'direct-image',
        deviceName,
        aiModel,
        captureDurationSeconds: Number(captureDurationSeconds.toFixed(3))
      });
      updateProcessingStatus('Membuka Review...', 'Membuka antarmuka review kamera. Foto diproses per 5 gambar/request, hingga 3 permintaan paralel. Audit keyakinan rendah berjalan maksimal 2 jalur...');
      window.location.assign(`/review?cameraSession=${encodeURIComponent(sessionId)}`);
    } catch (error) {
      finalizingBatch = false;
      hideProcessingStatus();
      setStatus(error?.message || 'Batch tidak dapat disiapkan.', 'error');
      updateBatchUi();
    }
  }

  function bind() {
    if (!core || !store) {
      setStatus('Modul camera capture tidak lengkap. Muat ulang halaman.', 'error');
      return;
    }
    $('openCameraButton').addEventListener('click', startCamera);
    $('captureButton').addEventListener('click', captureImage);
    $('captureButtonFullscreen').addEventListener('click', captureImage);
    $('cameraPreviewFullscreenButton')?.addEventListener('click', () => {
      if (stream) enterFullscreenMode();
    });
    // pointerdown terasa lebih responsif daripada menunggu jari diangkat pada layar sentuh.
    $('cameraStage')?.addEventListener('pointerdown', focusCameraAt);
    $('exitFullscreenButton').addEventListener('click', exitCameraFullscreen);
    $('finishCaptureButton').addEventListener('click', finishCapturing);
    $('finishCaptureButtonFullscreen')?.addEventListener('click', finishCapturing);
    $('finishCaptureButtonBatch')?.addEventListener('click', finishCapturing);
    $('reviewCapturesButtonFullscreen')?.addEventListener('click', () => openCaptureGallery(captures.length - 1));
    $('closeCaptureGallery')?.addEventListener('click', closeCaptureGallery);
    $('continueCaptureFromGallery')?.addEventListener('click', closeCaptureGallery);
    $('previousCaptureButton')?.addEventListener('click', () => moveCaptureGallery(-1));
    $('nextCaptureButton')?.addEventListener('click', () => moveCaptureGallery(1));
    $('deleteCaptureFromGallery')?.addEventListener('click', deleteCaptureFromGallery);
    $('retakeCaptureFromGallery')?.addEventListener('click', retakeCaptureFromGallery);
    const deviceNameInput = $('cameraDeviceName');
    const deviceNameSetup = $('deviceNameSetup');
    if (deviceNameInput) {
      try {
        savedDeviceName = String(localStorage.getItem(DEVICE_NAME_STORAGE_KEY) || '').trim().slice(0, 30);
      } catch (_) {}
      if (savedDeviceName) deviceNameInput.value = savedDeviceName;
      if (deviceNameSetup) deviceNameSetup.hidden = Boolean(savedDeviceName);
      deviceNameInput.addEventListener('change', () => {
        rememberDeviceName();
        if (sessionId && captures.length) void queueDraftSave();
      });
    }
    let galleryTouchStartX = 0;
    $('cameraGalleryImage')?.addEventListener('touchstart', event => {
      if (event.changedTouches?.[0]) galleryTouchStartX = pointInCameraView(event.changedTouches[0]).x;
    }, { passive: true });
    $('cameraGalleryImage')?.addEventListener('touchend', event => {
      if (!event.changedTouches?.[0]) return;
      const endX = pointInCameraView(event.changedTouches[0]).x;
      const distance = endX - galleryTouchStartX;
      if (Math.abs(distance) >= 48) moveCaptureGallery(distance > 0 ? -1 : 1);
    }, { passive: true });

    $('cameraPreview').addEventListener('resize', updateStageAspect);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.screen?.orientation?.addEventListener?.('change', handleViewportChange);
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(eventName => {
      document.addEventListener(eventName, () => {
        const nativeActive = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        if (nativeActive) {
          $('cameraStage')?.classList.add('is-fullscreen');
          document.body.classList.add('camera-fullscreen-active');
        } else {
          userExitedFullscreen = true;
          $('cameraStage')?.classList.remove('is-fullscreen');
          document.body.classList.remove('camera-fullscreen-active');
        }
        handleViewportChange();
      });
    });
    document.addEventListener('keydown', event => {
      const galleryOpen = Boolean($('cameraCaptureGallery') && !$('cameraCaptureGallery').hidden);
      if (galleryOpen) {
        if (event.key === 'Escape') closeCaptureGallery();
        else if (event.key === 'ArrowLeft') moveCaptureGallery(-1);
        else if (event.key === 'ArrowRight') moveCaptureGallery(1);
        else return;
        event.preventDefault();
        return;
      }
      if (event.code !== 'Space' || event.repeat || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
      if (!$('captureButton').disabled) {
        event.preventDefault();
        captureImage();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (sessionId && !wakeLock) requestWakeLock();
        scheduleContinuousAutofocus(stream?.getVideoTracks?.()[0], [0, 320, 900], true);
      }
      else if (document.visibilityState === 'hidden' && sessionId && captures.length && !finalizingBatch) void flushDraftSave();
    });
    window.addEventListener('beforeunload', () => {
      cancelScheduledDraftSave();
      stopCamera();
      releaseGalleryObjectUrl();
      captures.forEach(capture => URL.revokeObjectURL(capture.previewUrl));
      wakeLock?.release?.().catch(() => {});
    });
    store.cleanup().catch(() => {});
    updateBatchUi();
    draftRestorePromise = restoreLatestDraft();
  }

  document.addEventListener('DOMContentLoaded', bind);
})();
