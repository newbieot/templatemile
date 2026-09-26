(() => {
  'use strict';

  const MAX_CAPTURES = 150;
  const MAX_PDF_BYTES = 115 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const OUTPUT_MAX_SIDE = 2000;
  const ANALYSIS_MAX_WIDTH = 360;
  const MIN_DETECTION_CONFIDENCE = 0.55;
  const core = window.MileCameraCore;
  const store = window.MileCameraStore;
  const $ = id => document.getElementById(id);

  let stream = null;
  let captures = [];
  let sessionId = '';
  let sessionStartedAt = '';
  let analysisTimer = 0;
  let liveDetection = core?.fixedGuideBounds?.() || { x: 0.08, y: 0.13, width: 0.84, height: 0.74, confidence: 0, method: 'fixed-guide' };
  let captureBusy = false;
  let wakeLock = null;

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

  function isCameraFullscreen() {
    return Boolean(
      (document.fullscreenElement || document.webkitFullscreenElement) === $('cameraStage')
      || $('cameraStage')?.classList.contains('is-fullscreen')
      || document.body.classList.contains('camera-fullscreen-active')
    );
  }

  async function requestCameraFullscreen() {
    const stage = $('cameraStage');
    if (!stage) return;
    try {
      if (stage.requestFullscreen) {
        await stage.requestFullscreen({ navigationUI: 'hide' });
      } else if (stage.webkitRequestFullscreen) {
        await stage.webkitRequestFullscreen();
      } else {
        stage.classList.add('is-fullscreen');
        document.body.classList.add('camera-fullscreen-active');
        handleViewportChange();
      }
    } catch (_) {
      stage.classList.add('is-fullscreen');
      document.body.classList.add('camera-fullscreen-active');
      handleViewportChange();
    }
  }

  function exitCameraFullscreen() {
    const stage = $('cameraStage');
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

  function toggleCameraFullscreen() {
    if (isCameraFullscreen()) {
      exitCameraFullscreen();
    } else {
      requestCameraFullscreen();
    }
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

  function detectionLabel(detection) {
    if (!detection || detection.method === 'fixed-guide') return 'Guide tetap aktif';
    const confidence = Math.round(Number(detection.confidence || 0) * 100);
    return confidence >= 70 ? `Auto crop ${confidence}%` : `Auto crop dibantu guide ${confidence}%`;
  }

  function videoDisplayRect() {
    const stage = $('cameraStage');
    const video = $('cameraPreview');
    if (!stage?.clientWidth || !stage?.clientHeight || !video?.videoWidth || !video?.videoHeight) return null;
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const videoRatio = video.videoWidth / video.videoHeight;
    const stageRatio = stageWidth / stageHeight;
    if (stageRatio > videoRatio) {
      const height = stageHeight;
      const width = height * videoRatio;
      return { x: (stageWidth - width) / 2, y: 0, width, height };
    }
    const width = stageWidth;
    const height = width / videoRatio;
    return { x: 0, y: (stageHeight - height) / 2, width, height };
  }

  function updateStageAspect() {
    const stage = $('cameraStage');
    const video = $('cameraPreview');
    if (!stage || !video?.videoWidth || !video?.videoHeight) return;
    stage.style.setProperty('--camera-aspect', `${video.videoWidth}/${video.videoHeight}`);
    stage.dataset.orientation = video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait';
    window.requestAnimationFrame(() => updateGuide(liveDetection));
  }

  function handleViewportChange() {
    updateStageAspect();
  }

  function updateGuide(detection) {
    const guide = $('cropGuide');
    const label = $('cropStatus');
    if (!guide || !detection) return;
    const display = videoDisplayRect();
    guide.style.left = display ? `${display.x + detection.x * display.width}px` : `${detection.x * 100}%`;
    guide.style.top = display ? `${display.y + detection.y * display.height}px` : `${detection.y * 100}%`;
    guide.style.width = display ? `${detection.width * display.width}px` : `${detection.width * 100}%`;
    guide.style.height = display ? `${detection.height * display.height}px` : `${detection.height * 100}%`;
    const accepted = detection.method === 'fixed-guide' || Number(detection.confidence || 0) >= MIN_DETECTION_CONFIDENCE;
    guide.classList.toggle('is-low-confidence', !accepted);
    if (label) {
      label.textContent = detectionLabel(detection);
      label.dataset.state = accepted ? 'ready' : 'warning';
    }
  }

  function stopCamera() {
    if (analysisTimer) window.clearInterval(analysisTimer);
    analysisTimer = 0;
    stream?.getTracks?.().forEach(track => track.stop());
    stream = null;
    const video = $('cameraPreview');
    if (video) video.srcObject = null;
    $('cameraStage')?.classList.remove('is-active');
    setCaptureDisabled(true);
    $('cameraState').textContent = 'Kamera belum aktif';
  }

  async function populateCameras(selectedDeviceId = '') {
    const select = $('cameraDevice');
    if (!select || !navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
    const currentValue = selectedDeviceId || select.value;
    select.replaceChildren();
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Kamera ${index + 1}`;
      select.appendChild(option);
    });
    if (devices.some(device => device.deviceId === currentValue)) select.value = currentValue;
    select.disabled = devices.length < 2;
  }

  async function startCamera() {
    const button = $('openCameraButton');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera API tidak tersedia. Buka halaman ini melalui HTTPS di Chrome Android.', 'error');
      return;
    }
    getAudioContext();
    requestCameraFullscreen();
    button.disabled = true;
    button.textContent = 'Membuka kamera…';
    setStatus('Izinkan akses kamera ketika Chrome menampilkan permintaan.', 'info');
    stopCamera();

    try {
      const deviceId = $('cameraDevice')?.value;
      const videoConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      const video = $('cameraPreview');
      video.srcObject = stream;
      await video.play();
      $('cameraStage')?.classList.add('is-active');
      updateStageAspect();
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings?.() || {};
      try {
        const capabilities = track.getCapabilities?.() || {};
        if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch (_) {}
      await populateCameras(settings.deviceId || '');
      $('cameraState').textContent = `${settings.width || video.videoWidth} × ${settings.height || video.videoHeight} · kamera belakang diprioritaskan`;
      await ensureSession();
      setCaptureDisabled(false);
      setStatus('Kamera aktif dan siap Capture. Posisi portrait maupun landscape didukung.', 'success');
      updateLiveDetection();
      analysisTimer = window.setInterval(updateLiveDetection, 650);
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
      button.textContent = stream ? 'Buka ulang kamera' : 'Open Camera';
    }
  }

  function analysisFrame() {
    const video = $('cameraPreview');
    const canvas = $('cameraAnalysisCanvas');
    if (!video?.videoWidth || !video?.videoHeight || !canvas) return null;
    const width = Math.min(ANALYSIS_MAX_WIDTH, video.videoWidth);
    const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  }

  function updateLiveDetection() {
    if (!stream || captureBusy || !core) return;
    try {
      const fixedMode = $('fixedGuideMode')?.checked;
      const frame = analysisFrame();
      if (!frame) return;
      liveDetection = fixedMode ? core.fixedGuideBounds() : core.detectDocumentBounds(frame);
      updateGuide(liveDetection);
    } catch (_) {}
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
  }

  async function ensureSession() {
    if (sessionId) return;
    sessionId = randomId('CAM');
    sessionStartedAt = new Date().toISOString();
    $('sessionIdentifier').textContent = sessionId;
    $('sessionDetails').hidden = false;
    $('cameraDevice').disabled = true;
    $('processingRoute').disabled = true;
    await requestWakeLock();
    updateBatchUi();
  }

  function validationFrame(canvas) {
    const validationCanvas = $('cameraValidationCanvas');
    const width = Math.min(360, canvas.width);
    const height = Math.max(1, Math.round(width * canvas.height / canvas.width));
    validationCanvas.width = width;
    validationCanvas.height = height;
    const context = validationCanvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  }

  function captureQualityMetadata(outputCanvas) {
    const imageData = validationFrame(outputCanvas);
    return {
      code: 'measured',
      brightness: core.averageBrightness(imageData),
      sharpness: core.calculateSharpness(imageData)
    };
  }

  function canvasToBlob(canvas, quality = 0.9) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gambar gagal dibuat oleh browser.')), 'image/jpeg', quality);
    });
  }

  async function captureImage() {
    if (captureBusy || !stream || !sessionId) return;
    if (captures.length >= MAX_CAPTURES) {
      setStatus(`Maksimal ${MAX_CAPTURES} gambar per sesi. Selesaikan batch ini lebih dahulu.`, 'error');
      return;
    }
    getAudioContext();
    captureBusy = true;
    setCaptureDisabled(true);
    setFinishDisabled(true);
    setStatus('Mengambil foto dan menyiapkan crop…', 'info');

    try {
      const video = $('cameraPreview');
      const sourceCanvas = $('cameraCaptureCanvas');
      sourceCanvas.width = video.videoWidth;
      sourceCanvas.height = video.videoHeight;
      sourceCanvas.getContext('2d').drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);

      const frame = analysisFrame();
      const detectedBounds = $('fixedGuideMode')?.checked ? core.fixedGuideBounds() : core.detectDocumentBounds(frame);
      const useGuideFallback = detectedBounds.method === 'fixed-guide' || Number(detectedBounds.confidence || 0) < MIN_DETECTION_CONFIDENCE;
      const cropBounds = useGuideFallback ? core.fixedGuideBounds() : detectedBounds;
      updateGuide(cropBounds);
      const sx = Math.round(cropBounds.x * sourceCanvas.width);
      const sy = Math.round(cropBounds.y * sourceCanvas.height);
      const sw = Math.max(1, Math.round(cropBounds.width * sourceCanvas.width));
      const sh = Math.max(1, Math.round(cropBounds.height * sourceCanvas.height));
      const scale = Math.min(1, OUTPUT_MAX_SIDE / Math.max(sw, sh));
      const outputCanvas = $('cameraOutputCanvas');
      outputCanvas.width = Math.max(1, Math.round(sw * scale));
      outputCanvas.height = Math.max(1, Math.round(sh * scale));
      outputCanvas.getContext('2d').drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outputCanvas.width, outputCanvas.height);

      const quality = captureQualityMetadata(outputCanvas);

      let blob = await canvasToBlob(outputCanvas, 0.9);
      if (blob.size > MAX_IMAGE_BYTES) blob = await canvasToBlob(outputCanvas, 0.78);
      if (blob.size > MAX_IMAGE_BYTES) blob = await canvasToBlob(outputCanvas, 0.68);
      if (blob.size > MAX_IMAGE_BYTES) {
        throw new Error('Ukuran foto melewati batas 4 MB. Kurangi resolusi kamera atau gunakan pencahayaan yang lebih stabil.');
      }
      const timestamp = new Date().toISOString();
      const sequence = captures.length + 1;
      const fileName = `${String(sequence).padStart(3, '0')}.jpg`;
      captures.push({
        captureId: randomId('IMG'),
        timestamp,
        sessionId,
        sequence,
        fileName,
        blob,
        width: outputCanvas.width,
        height: outputCanvas.height,
        detection: {
          method: cropBounds.method,
          confidence: Number(detectedBounds.confidence || 0),
          guideFallback: useGuideFallback
        },
        quality: {
          code: quality.code,
          brightness: Number(quality.brightness.toFixed(1)),
          sharpness: Number(quality.sharpness.toFixed(1))
        },
        previewUrl: URL.createObjectURL(blob)
      });
      playShutterSound();
      flashCameraStage();
      showHudToast(`Capture ${sequence} (${fileName}) tersimpan`);
      setStatus(`Capture ${sequence} tersimpan. Ganti sampul berikutnya tanpa mengubah posisi HP.`, 'success');
      toast(`${fileName} tersimpan`, 'success');
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    } catch (error) {
      setStatus(`Capture gagal: ${error?.message || 'gambar tidak dapat disimpan.'}`, 'error');
    } finally {
      captureBusy = false;
      setCaptureDisabled(!stream || !sessionId);
      updateBatchUi();
    }
  }

  function removeCapture(captureId) {
    const capture = captures.find(item => item.captureId === captureId);
    if (capture) URL.revokeObjectURL(capture.previewUrl);
    captures = captures.filter(item => item.captureId !== captureId).map((item, index) => ({
      ...item,
      sequence: index + 1,
      fileName: `${String(index + 1).padStart(3, '0')}.jpg`
    }));
    setStatus('Capture dihapus. Nomor urut batch telah dirapikan.', 'info');
    updateBatchUi();
  }

  function updateBatchUi() {
    $('capturedCount').textContent = `${captures.length} gambar`;
    $('fullscreenCapturedCount').textContent = `${captures.length} gambar`;
    setFinishDisabled(!captures.length || captureBusy);
    const list = $('captureList');
    list.replaceChildren();
    $('emptyCaptureState').hidden = Boolean(captures.length);

    captures.forEach(capture => {
      const card = document.createElement('article');
      card.className = 'capture-card';
      const image = document.createElement('img');
      image.src = capture.previewUrl;
      image.alt = `Hasil capture ${capture.sequence}`;
      const body = document.createElement('div');
      body.className = 'capture-card__body';
      const title = document.createElement('strong');
      title.textContent = capture.fileName;
      const detail = document.createElement('small');
      detail.textContent = `${formatTime(capture.timestamp)} · ${capture.width} × ${capture.height} · ${formatBytes(capture.blob.size)}`;
      const quality = document.createElement('span');
      quality.className = 'capture-card__quality';
      quality.textContent = capture.detection.guideFallback
        ? 'Crop memakai area panduan · periksa preview'
        : `Auto crop ${Math.round(capture.detection.confidence * 100)}% · periksa preview`;
      body.append(title, detail, quality);
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'capture-card__remove';
      removeButton.textContent = 'Hapus';
      removeButton.setAttribute('aria-label', `Hapus ${capture.fileName}`);
      removeButton.addEventListener('click', () => removeCapture(capture.captureId));
      card.append(image, body, removeButton);
      list.appendChild(card);
    });
  }

  function updateProcessingStatus(step, message) {
    $('processingStatus').hidden = false;
    $('processingStatusStep').textContent = step;
    $('processingStatusMessage').textContent = message;
  }

  async function finishCapturing() {
    if (!captures.length || !sessionId || captureBusy) return;
    setFinishDisabled(true);
    setCaptureDisabled(true);
    exitCameraFullscreen();
    updateProcessingStatus('Preparing…', `Mengemas ${captures.length} hasil crop tanpa mengunggah background meja.`);
    showHudToast('Menyiapkan batch…');

    try {
      const pdfBlob = await core.buildJpegPdf(captures);
      if (pdfBlob.size > MAX_PDF_BYTES) {
        throw new Error(`Ukuran batch ${formatBytes(pdfBlob.size)} melewati batas 115 MB. Kurangi jumlah capture.`);
      }
      updateProcessingStatus('Saving…', 'Menyimpan batch sementara di HP sebelum membuka pipeline AI.');
      const route = 'review';
      const metadata = captures.map(({ blob, previewUrl, ...capture }) => capture);
      await store.save({
        id: sessionId,
        createdAt: Date.now(),
        startedAt: sessionStartedAt,
        finishedAt: new Date().toISOString(),
        route: 'review',
        captureCount: captures.length,
        captures: metadata,
        fileName: `camera-${sessionId}.pdf`,
        pdfBlob
      });
      updateProcessingStatus('Uploading…', 'Membuka antarmuka review kamera (Beta R2 + DeepSeek 4.1). Analisis dilanjutkan otomatis.');
      window.location.assign(`/review?cameraSession=${encodeURIComponent(sessionId)}`);
    } catch (error) {
      updateProcessingStatus('Gagal', error?.message || 'Batch tidak dapat disiapkan.');
      setStatus(error?.message || 'Batch tidak dapat disiapkan.', 'error');
      setFinishDisabled(false);
      setCaptureDisabled(false);
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
    $('enterFullscreenButton')?.addEventListener('click', toggleCameraFullscreen);
    $('exitFullscreenButton').addEventListener('click', exitCameraFullscreen);
    $('finishCaptureButton').addEventListener('click', finishCapturing);
    $('finishCaptureButtonFullscreen')?.addEventListener('click', finishCapturing);
    $('finishCaptureButtonBatch')?.addEventListener('click', finishCapturing);
    $('cameraDevice').addEventListener('change', () => {
      if (stream && !sessionId) startCamera();
    });
    $('fixedGuideMode').addEventListener('change', updateLiveDetection);
    $('cameraPreview').addEventListener('resize', updateStageAspect);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.screen?.orientation?.addEventListener?.('change', handleViewportChange);
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(eventName => {
      document.addEventListener(eventName, () => {
        const active = isCameraFullscreen();
        $('cameraStage')?.classList.toggle('is-fullscreen', active);
        document.body.classList.toggle('camera-fullscreen-active', active);
        handleViewportChange();
      });
    });
    document.addEventListener('keydown', event => {
      if (event.code !== 'Space' || event.repeat || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
      if (!$('captureButton').disabled) {
        event.preventDefault();
        captureImage();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && sessionId && !wakeLock) requestWakeLock();
    });
    window.addEventListener('beforeunload', () => {
      stopCamera();
      captures.forEach(capture => URL.revokeObjectURL(capture.previewUrl));
      wakeLock?.release?.().catch(() => {});
    });
    store.cleanup().catch(() => {});
    updateBatchUi();
    updateGuide(liveDetection);
  }

  document.addEventListener('DOMContentLoaded', bind);
})();
