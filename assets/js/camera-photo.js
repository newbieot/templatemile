(() => {
  'use strict';

  const PHOTO_MAX_SIDE = 1280;
  const PHOTO_MAX_PIXELS = 1280 * 720;
  const JPEG_QUALITIES = Object.freeze([0.84, 0.74, 0.64, 0.54, 0.44, 0.34, 0.24]);
  const DEFAULT_IMAGE_MAX_BYTES = 120 * 1000;

  function previewConstraints() {
    // Ask the device for an HD stream only. Both dimensions are capped so a
    // browser that ignores ideal sizes still cannot save an oversized frame.
    return {
      width: { ideal: 1280, max: PHOTO_MAX_SIDE },
      height: { ideal: 720, max: PHOTO_MAX_SIDE },
      frameRate: { ideal: 24, max: 30 },
      advanced: [{ focusMode: 'continuous' }, { zoom: 1 }]
    };
  }

  function fileExtension(blob) {
    // Older local drafts may still contain WebP; all new camera output is JPEG.
    return blob?.type === 'image/webp' ? 'webp' : 'jpg';
  }

  async function encodeImage(canvas, maxBytes = DEFAULT_IMAGE_MAX_BYTES) {
    if (!canvas?.width || !canvas?.height || !(maxBytes > 0)) {
      throw new Error('Foto kamera tidak memiliki ukuran yang valid.');
    }

    const sourceLongSide = Math.max(canvas.width, canvas.height);
    const scale = Math.min(
      1,
      PHOTO_MAX_SIDE / sourceLongSide,
      Math.sqrt(PHOTO_MAX_PIXELS / (canvas.width * canvas.height))
    );
    let width = Math.max(1, Math.round(canvas.width * scale));
    let height = Math.max(1, Math.round(canvas.height * scale));
    while (width * height > PHOTO_MAX_PIXELS) {
      if (width >= height) width -= 1;
      else height -= 1;
    }
    let temporaryCanvas = null;
    let workCanvas = canvas;

    try {
      if (width !== canvas.width || height !== canvas.height) {
        temporaryCanvas = document.createElement('canvas');
        temporaryCanvas.width = width;
        temporaryCanvas.height = height;
        const context = temporaryCanvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Browser tidak dapat menyiapkan foto JPEG.');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);
        workCanvas = temporaryCanvas;
      }

      for (const quality of JPEG_QUALITIES) {
        const blob = await new Promise((resolve, reject) => {
          workCanvas.toBlob(value => value ? resolve(value) : reject(new Error('Foto gagal dibuat oleh browser.')), 'image/jpeg', quality);
        });
        if (blob.type !== 'image/jpeg') {
          throw new Error('Browser tidak menghasilkan JPEG. Muat ulang halaman lalu coba capture lagi.');
        }
        if (blob.size <= maxBytes) return { blob, quality, type: 'image/jpeg', width, height };
      }
    } finally {
      if (temporaryCanvas) {
        temporaryCanvas.width = 1;
        temporaryCanvas.height = 1;
      }
    }

    throw new Error('Foto JPEG masih melebihi 120 KB. Dekatkan kamera ke label lalu capture ulang.');
  }

  const api = { PHOTO_MAX_SIDE, PHOTO_MAX_PIXELS, JPEG_QUALITIES, DEFAULT_IMAGE_MAX_BYTES, previewConstraints, fileExtension, encodeImage };
  if (typeof window !== 'undefined') window.MileCameraPhoto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
