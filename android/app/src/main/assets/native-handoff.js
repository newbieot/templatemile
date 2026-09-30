(async function (manifest) {
  'use strict';
  window.__mileNativeTransfer = { state: 'working', id: manifest.id, progress: 0 };
  try {
    if (location.origin !== 'https://mile.posnew.com' || location.pathname !== '/camera') {
      throw new Error('Buka halaman kamera setelah login, lalu coba lagi.');
    }
    for (let attempt = 0; !window.MileCameraStore && attempt < 60; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!window.MileCameraStore) throw new Error('Halaman belum siap. Periksa koneksi lalu coba lagi.');
    const images = [];
    for (const photo of manifest.photos) {
      const response = await fetch(photo.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Foto ${photo.sequence} belum dapat dibaca.`);
      const blob = await response.blob();
      if (!blob.size || blob.type !== 'image/jpeg') throw new Error(`Foto ${photo.sequence} tidak valid.`);
      if (blob.size > 120000 || Math.max(photo.width, photo.height) > 1280 || Math.min(photo.width, photo.height) > 720) {
        throw new Error(`Foto ${photo.sequence} melebihi batas 720p / 120 KB. Buka ulang aplikasi untuk menyesuaikan draft.`);
      }
      const { url, ...metadata } = photo;
      images.push({ ...metadata, blob });
      window.__mileNativeTransfer.progress = images.length;
    }
    await window.MileCameraStore.save({
      id: manifest.id,
      createdAt: Date.parse(manifest.startedAt),
      startedAt: manifest.startedAt,
      finishedAt: new Date().toISOString(),
      route: 'review',
      draft: false,
      captureCount: images.length,
      captures: images.map(({ blob, ...photo }) => photo),
      images,
      inputFormat: 'direct-image',
      deviceName: manifest.deviceName,
      aiModel: 'gemini-3.8-flash',
      captureDurationSeconds: Math.max(0, (Date.now() - Date.parse(manifest.startedAt)) / 1000)
    });
    sessionStorage.setItem('mile_camera_active', '1');
    window.__mileNativeTransfer = { state: 'done', id: manifest.id, progress: images.length };
  } catch (error) {
    window.__mileNativeTransfer = { state: 'error', id: manifest.id, message: String(error.message || error) };
  }
})
