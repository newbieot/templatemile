(() => {
  'use strict';

  const pending = new Map();

  function loadScript({ key, src, ready }) {
    if (ready()) return Promise.resolve();
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-mile-vendor="${key}"]`);
      if (existing) {
        existing.addEventListener('load', () => ready() ? resolve() : reject(new Error(`Library ${key} tidak tersedia setelah dimuat.`)), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Library ${key} gagal dimuat.`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.mileVendor = key;
      script.addEventListener('load', () => ready() ? resolve() : reject(new Error(`Library ${key} tidak tersedia setelah dimuat.`)), { once: true });
      script.addEventListener('error', () => reject(new Error(`Library ${key} gagal dimuat. Periksa koneksi lalu coba lagi.`)), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      pending.delete(key);
      document.querySelector(`script[data-mile-vendor="${key}"]`)?.remove();
      throw error;
    });
    pending.set(key, promise);
    return promise;
  }

  window.MileVendorLoader = Object.freeze({
    loadSheetJs() {
      return loadScript({
        key: 'sheetjs',
        src: '/assets/vendor/sheetjs/xlsx.full.min.js?v=20260909-beta-r2.1',
        ready: () => typeof window.XLSX !== 'undefined'
      });
    },
    loadPdfJs() {
      return loadScript({
        key: 'pdfjs',
        src: '/assets/vendor/pdfjs/pdf.min.js?v=20260909-beta-r2.1',
        ready: () => typeof window.pdfjsLib !== 'undefined'
      });
    }
  });
})();
