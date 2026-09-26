(() => {
  'use strict';

  // Universal redirect guard: pastikan sesi kamera selalu menuju /review
  const earlySessionId = new URLSearchParams(window.location.search).get('cameraSession');
  if (earlySessionId && !window.location.pathname.startsWith('/review')) {
    window.location.replace(`/review?cameraSession=${encodeURIComponent(earlySessionId)}`);
    return;
  }

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

    if (sessionId && !window.location.pathname.startsWith('/review')) {
      window.location.replace(`/review?cameraSession=${encodeURIComponent(sessionId)}`);
      return;
    }

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
      if (!session || (!session.pdfBlob && !session.streamedRows) || Number(session.captureCount || 0) < 1) {
        throw new Error('Batch camera tidak ditemukan atau sudah selesai diproses.');
      }
      activateCameraMode(session.captureCount);
      const age = Date.now() - Number(session.createdAt || 0);
      if (!Number.isFinite(age) || age > 6 * 60 * 60 * 1000) {
        await store.remove(sessionId);
        throw new Error('Batch camera sudah kedaluwarsa. Silakan capture ulang.');
      }

      if (!window.location.pathname.startsWith('/review')) {
        window.location.replace(`/review?cameraSession=${encodeURIComponent(sessionId)}`);
        return;
      }

      const core = window.__mileCore;
      
      if (session.streamedRows && session.streamedRows.length > 0) {
        if (session.streamedRows[0]._error) {
           notify('AI gagal: ' + session.streamedRows[0]._error, 'error');
           await store.remove(sessionId);
           return;
        }

        // Fast path: AI already processed via background stream!
        notify(`${session.captureCount} foto telah diproses otomatis oleh Streaming AI!`, 'success');
        
        const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, cleanUrl);
        
        // Ensure core accepts the rows directly
        if (core && core.uploadedFilesManager) {
           core.uploadedFilesManager.push({ id: Date.now(), name: `Kamera - ${session.deviceName || sessionId}`, rows: session.streamedRows, source: 'AI PDF' });
           core.updateInterface();
        }
        
        await store.remove(sessionId);
        
        if (typeof window.MileCameraSync?.saveBatchResults === 'function') {
          try {
            const mRows = session.streamedRows || [];
            let outOfTown = 0, reviewCount = 0;
            mRows.forEach(r => {
              if (r.outOfTown) outOfTown++;
              if (r.reviewFields && r.reviewFields.length) reviewCount++;
            });
            await fetch('/api/metrics/ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'SUCCESS',
                fileCount: 1,
                pageCount: session.captureCount || mRows.length,
                model: session.aiModel || 'glm-5.3-flashx',
                chunkSize: (session.aiModel || '').startsWith('glm') ? 7 : 10,
                concurrency: 1,
                durationSeconds: session.durationSeconds || 0,
                totalRows: mRows.length,
                reviewCount: reviewCount,
                outsideBatamCount: outOfTown,
                message: 'Camera Stream V2'
              }),
              credentials: 'same-origin'
            });
          } catch (e) {
            console.error('Failed to log metrics:', e);
          }
          window.MileCameraSync.saveBatchResults(sessionId, session.captureCount, session.createdAt, session.deviceName, session.durationSeconds);
        }
        return;
      }
      
      // Fallback path: Legacy PDF
      if (!session.pdfBlob) {
         // This means it was a streaming session but AI completely failed.
         notify('AI gagal memproses gambar. Sesi kamera selesai tanpa hasil.', 'warning');
         await store.remove(sessionId);
         return;
      }
      
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
      const file = new File([session.pdfBlob], session.fileName || `camera-${sessionId}.pdf`, {
        type: 'application/pdf',
        lastModified: Date.now()
      });
      const beforeFileCount = Number(core?.uploadedFilesManager?.length || 0);
      notify(`${session.captureCount} hasil capture siap diproses...`, 'success');
      await ai.processPDFFile(file);
      const completed = Number(core?.uploadedFilesManager?.length || 0) > beforeFileCount
        || Number(core?.tempExtractedRows?.length || 0) > 0;
      if (completed) {
        await store.remove(sessionId);
        // Sync results to server for desktop access (72h TTL)
        if (typeof window.MileCameraSync?.saveBatchResults === 'function') {
          window.MileCameraSync.saveBatchResults(sessionId, session.captureCount, session.createdAt, session.deviceName, session.durationSeconds);
        }
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
