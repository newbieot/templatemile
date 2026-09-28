(() => {
  'use strict';

  const PHOTO_MAX_SIDE = 4096;
  const IMAGE_QUALITIES = Object.freeze([0.88, 0.76, 0.64, 0.52]);
  const DEFAULT_IMAGE_MAX_BYTES = 120 * 1000;
  const MIN_ENCODED_LONG_SIDE = 1200;

  function supportsStillCapture(ImageCaptureClass = globalThis.ImageCapture) {
    return typeof ImageCaptureClass === 'function' && typeof ImageCaptureClass.prototype?.takePhoto === 'function';
  }

  function previewConstraints(stillSupported = supportsStillCapture()) {
    // Both dimensions matter: width alone can select a very small portrait stream.
    // Native still capture lets the live preview stay lighter than the saved photo.
    return {
      width: { ideal: stillSupported ? 1920 : 2560, max: PHOTO_MAX_SIDE },
      height: { ideal: stillSupported ? 1440 : 1920, max: PHOTO_MAX_SIDE },
      frameRate: { ideal: 24, max: 30 },
      advanced: [{ focusMode: 'continuous' }, { zoom: 1 }]
    };
  }

  function photoSettings(capabilities) {
    const width = Number(capabilities?.imageWidth?.max);
    const height = Number(capabilities?.imageHeight?.max);
    if (!(width > 0 && height > 0)) return null;
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
    const settings = {
      imageWidth: Math.max(Number(capabilities.imageWidth.min) || 1, Math.round(width * scale)),
      imageHeight: Math.max(Number(capabilities.imageHeight.min) || 1, Math.round(height * scale))
    };
    // A camera exposing only a fixed 48/50 MP still mode would allocate too
    // much memory on a phone; use the higher-resolution video fallback instead.
    return settings.imageWidth * settings.imageHeight <= 20 * 1000 * 1000 ? settings : null;
  }

  function withTimeout(promise, timeoutMs) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Pengambilan foto resolusi tinggi melewati batas waktu.')), timeoutMs);
      })
    ]).finally(() => clearTimeout(timer));
  }

  async function decodePhoto(blob) {
    if (typeof globalThis.createImageBitmap === 'function') {
      const bitmap = await globalThis.createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Foto kamera tidak dapat dibuka.'));
        element.src = url;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  function createStillCamera(track, {
    ImageCaptureClass = globalThis.ImageCapture,
    decode = decodePhoto,
    capabilityTimeoutMs = 1000,
    captureTimeoutMs = 2400
  } = {}) {
    if (!supportsStillCapture(ImageCaptureClass)) return null;
    let camera;
    try { camera = new ImageCaptureClass(track); } catch (_) { return null; }
    let disabled = false;
    // Query capabilities in the background; opening the camera never waits on it.
    const settingsPromise = withTimeout(Promise.resolve().then(() => camera.getPhotoCapabilities()), capabilityTimeoutMs)
      .then(photoSettings).catch(() => null).then(settings => {
        if (!settings) disabled = true;
        return settings;
      });
    return {
      ready: settingsPromise.then(settings => Boolean(settings)),
      get available() { return !disabled; },
      async take(previewWidth, previewHeight) {
        if (disabled || track.readyState === 'ended') return null;
        let decoded = null;
        try {
          const settings = await settingsPromise;
          // Do not request an unbounded default (some phones return 50 MP images).
          if (!settings) { disabled = true; return null; }
          const blob = await withTimeout(Promise.resolve().then(() => camera.takePhoto(settings)), captureTimeoutMs);
          decoded = await decode(blob);
          const sameAxes = (decoded.width >= decoded.height) === (previewWidth >= previewHeight);
          if (!(decoded.width > 0 && decoded.height > 0) || !sameAxes
              || Math.min(decoded.width / previewWidth, decoded.height / previewHeight) <= 1) {
            // A rotated/unrelated native image must not silently crop a different label.
            disabled = true;
            decoded.close();
            return null;
          }
          return decoded;
        } catch (_) {
          disabled = true;
          decoded?.close();
          return null;
        }
      }
    };
  }

  function mapPreviewCrop(crop, photoWidth, photoHeight, rotation = 0) {
    const rotated = Math.abs(rotation) === 90;
    const fullWidth = rotated ? photoHeight : photoWidth;
    const fullHeight = rotated ? photoWidth : photoHeight;
    // Still images can be 4:3 while the preview is 16:9. Map the preview's
    // centered sensor window, not a new crop based on the photo's aspect ratio.
    const scale = Math.min(fullWidth / crop.fullWidth, fullHeight / crop.fullHeight);
    return {
      fullWidth, fullHeight,
      x: (fullWidth - crop.fullWidth * scale) / 2 + crop.x * scale,
      y: (fullHeight - crop.fullHeight * scale) / 2 + crop.y * scale,
      width: crop.width * scale,
      height: crop.height * scale
    };
  }

  function fileExtension(blob) {
    return blob?.type === 'image/webp' ? 'webp' : 'jpg';
  }

  async function encodeImage(canvas, maxBytes = DEFAULT_IMAGE_MAX_BYTES) {
    if (!canvas?.width || !canvas?.height || !(maxBytes > 0)) {
      throw new Error('Foto kamera tidak memiliki ukuran yang valid.');
    }

    for (const type of ['image/webp', 'image/jpeg']) {
      let width = canvas.width;
      let height = canvas.height;
      let workCanvas = canvas;
      let temporaryCanvas = null;
      let formatSupported = true;

      try {
        // First preserve all pixels and use a high quality. If necessary,
        // reduce dimensions gradually rather than making text unreadable by
        // aggressively lowering the encoder quality.
        for (let resizeAttempt = 0; resizeAttempt < 7; resizeAttempt += 1) {
          if (workCanvas.width !== width || workCanvas.height !== height) {
            temporaryCanvas ||= document.createElement('canvas');
            temporaryCanvas.width = width;
            temporaryCanvas.height = height;
            const context = temporaryCanvas.getContext('2d', { alpha: false });
            if (!context) throw new Error('Browser tidak dapat menyiapkan kompresi foto.');
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);
            workCanvas = temporaryCanvas;
          }

          const minimumLongSide = Math.min(MIN_ENCODED_LONG_SIDE, Math.max(canvas.width, canvas.height));
          const qualities = resizeAttempt === 0 && Math.max(width, height) > minimumLongSide
            ? [IMAGE_QUALITIES[0]]
            : IMAGE_QUALITIES;
          let largestBlob = null;
          for (const quality of qualities) {
            const blob = await new Promise((resolve, reject) => {
              workCanvas.toBlob(value => value ? resolve(value) : reject(new Error('Foto gagal dibuat oleh browser.')), type, quality);
            });
            // Unsupported canvas formats silently return PNG. Never call it
            // WebP or upload it under a misleading extension.
            if (blob.type !== type) {
              formatSupported = false;
              break;
            }
            largestBlob = blob;
            if (blob.size <= maxBytes) {
              return { blob, quality, type, width, height };
            }
            // At the original resolution, resize before lowering quality.
            if (resizeAttempt === 0) break;
          }

          if (!formatSupported) break;
          if (!largestBlob) break;

          const currentLongSide = Math.max(width, height);
          if (currentLongSide <= minimumLongSide) {
            // At the minimum readable size all quality levels have already
            // been tried; never save an oversized or unreadable result.
            break;
          }

          const estimatedScale = Math.sqrt(maxBytes / largestBlob.size) * 0.92;
          const scale = Math.max(0.5, Math.min(0.88, estimatedScale));
          const nextLongSide = Math.max(minimumLongSide, Math.floor(currentLongSide * scale));
          if (nextLongSide >= currentLongSide) break;
          const resizeScale = nextLongSide / currentLongSide;
          width = Math.max(1, Math.round(width * resizeScale));
          height = Math.max(1, Math.round(height * resizeScale));
          // The final attempt at minimum dimensions should try every quality.
          if (Math.max(width, height) <= minimumLongSide) resizeAttempt = 5;
        }
      } finally {
        if (temporaryCanvas) {
          temporaryCanvas.width = 1;
          temporaryCanvas.height = 1;
        }
      }
    }

    // Never save or send an image larger than the configured per-photo cap.
    // Refuse only when meeting it would require shrinking below a readable
    // resolution or unacceptable quality; user can move the camera closer.
    throw new Error('Foto belum bisa dikompres hingga 120 KB tanpa mengurangi keterbacaan label. Dekatkan kamera ke label lalu capture ulang.');
  }

  const api = { PHOTO_MAX_SIDE, IMAGE_QUALITIES, supportsStillCapture, previewConstraints, photoSettings, createStillCamera, mapPreviewCrop, fileExtension, encodeImage };
  if (typeof window !== 'undefined') window.MileCameraPhoto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
