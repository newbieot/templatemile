(() => {
  'use strict';

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    const status = document.getElementById('workspaceStatus');
    if (status) {
      const dot = document.createElement('span');
      dot.className = 'status-dot';
      status.replaceChildren(dot, document.createTextNode(message));
    }
  }

  function activateCameraMode(captureCount) {
    document.body.classList.add('camera-mode');
    try { sessionStorage.setItem('mile_camera_active', '1'); } catch (_) {}

    let banner = document.getElementById('cameraSessionBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'cameraSessionBanner';
      banner.className = 'camera-session-banner';
      const setupCard = document.querySelector('.setup-card');
      if (setupCard && setupCard.parentNode) {
        setupCard.parentNode.insertBefore(banner, setupCard);
      }
    }
    if (banner) {
      banner.innerHTML = `
        <div class="camera-session-banner__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
        <div class="camera-session-banner__copy">
          <div class="camera-session-banner__badge">Mode Kamera Aktif</div>
          <strong>${captureCount ? captureCount + ' Foto Dokumen Siap' : 'Batch Kamera Masuk'}</strong>
          <p>Unggah berkas dinonaktifkan. Silakan tentukan <strong>Template pelanggan</strong> atau periksa hasil di bawah.</p>
        </div>
      `;
    }
  }

  async function importCameraBatch() {
    const sessionId = new URLSearchParams(window.location.search).get('cameraSession');
    let isCameraStored = false;
    try { isCameraStored = sessionStorage.getItem('mile_camera_active') === '1'; } catch (_) {}

    if (sessionId || isCameraStored) {
      activateCameraMode();
    }

    if (!sessionId) return;
    if (!/^CAM-[a-zA-Z0-9-]{16,80}$/.test(sessionId)) {
      notify('ID sesi camera tidak valid.', 'error');
      return;
    }

    const store = window.MileCameraStore;
    const ai = window.MileAI;
    if (!store || typeof ai?.processPDFFile !== 'function') {
      notify('Batch camera belum dapat dibuka. Muat ulang halaman.', 'error');
      return;
    }

    try {
      const session = await store.get(sessionId);
      if (!session?.pdfBlob || Number(session.captureCount || 0) < 1) {
        throw new Error('Batch camera tidak ditemukan atau sudah selesai diproses.');
      }
      activateCameraMode(session.captureCount);
      const age = Date.now() - Number(session.createdAt || 0);
      if (!Number.isFinite(age) || age > 6 * 60 * 60 * 1000) {
        await store.remove(sessionId);
        throw new Error('Batch camera sudah kedaluwarsa. Silakan capture ulang.');
      }

      const currentRoute = window.location.pathname.startsWith('/beta') ? 'beta' : 'app';
      if (session.route && session.route !== currentRoute) {
        window.location.replace(`/${session.route}?cameraSession=${encodeURIComponent(sessionId)}`);
        return;
      }

      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
      const file = new File([session.pdfBlob], session.fileName || `camera-${sessionId}.pdf`, {
        type: 'application/pdf',
        lastModified: Date.now()
      });
      const core = window.__mileCore;
      const beforeFileCount = Number(core?.uploadedFilesManager?.length || 0);
      notify(`${session.captureCount} hasil capture siap. Pemrosesan dimulai otomatis…`, 'success');
      await ai.processPDFFile(file);
      const completed = Number(core?.uploadedFilesManager?.length || 0) > beforeFileCount
        || Number(core?.tempExtractedRows?.length || 0) > 0;
      if (completed) {
        await store.remove(sessionId);
      } else {
        window.history.replaceState({}, document.title, `${window.location.pathname}?cameraSession=${encodeURIComponent(sessionId)}`);
        throw new Error('Batch camera belum menghasilkan data. Batch tetap tersimpan; muat ulang halaman untuk mencoba lagi.');
      }
    } catch (error) {
      notify(error?.message || 'Batch camera gagal diproses.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(importCameraBatch, 180);
  });
})();
