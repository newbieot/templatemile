(() => {
  'use strict';

  const PHOTO_MAX_SIDE = 4096;
  const IMAGE_QUALITIES = Object.freeze([0.94, 0.92, 0.90, 0.88, 0.86]);

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

  async function encodeImage(canvas, maxBytes = 2 * 1024 * 1024) {
    for (const type of ['image/webp', 'image/jpeg']) {
      for (const quality of IMAGE_QUALITIES) {
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(value => value ? resolve(value) : reject(new Error('Foto gagal dibuat oleh browser.')), type, quality);
        });
        // Unsupported canvas formats silently return PNG. Never call it WebP
        // or upload that much larger fallback under a misleading extension.
        if (blob.type !== type) break;
        if (blob.size <= maxBytes) return { blob, quality, type };
      }
    }
    // Keep real pixels; never silently reduce to tiny images to satisfy a budget.
    throw new Error('Foto melebihi 2 MB pada kualitas tinggi. Kurangi area latar di dalam panduan lalu capture ulang.');
  }

  const api = { PHOTO_MAX_SIDE, IMAGE_QUALITIES, supportsStillCapture, previewConstraints, photoSettings, createStillCamera, mapPreviewCrop, fileExtension, encodeImage };
  if (typeof window !== 'undefined') window.MileCameraPhoto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
