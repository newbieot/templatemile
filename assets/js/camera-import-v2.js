(() => {
  'use strict';

  let reviewWakeLock = null;
  let cameraImportRunning = false;
  let aiProcessingActive = false;
  const DEFAULT_CAMERA_MODEL = 'deepseek-v4.1-flash';
  const CAMERA_CHUNK_SIZE = 5;
  const CAMERA_CONCURRENCY = 3;

  function storedCameraModel(model) {
    const value = String(model || '').trim();
    return !value || value === 'gpt-6-luna' ? DEFAULT_CAMERA_MODEL : value;
  }

  async function requestReviewWakeLock() {
    try {
      if (!aiProcessingActive || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      if (reviewWakeLock && !reviewWakeLock.released) return;
      reviewWakeLock = await navigator.wakeLock.request('screen');
      reviewWakeLock.addEventListener?.('release', () => { reviewWakeLock = null; }, { once: true });
    } catch (_) {}
  }

  function releaseReviewWakeLock() {
    const lock = reviewWakeLock;
    reviewWakeLock = null;
    lock?.release?.().catch(() => {});
  }

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

  function buildSyncDetails(session, runMetrics = {}) {
    const startedAtMs = Date.parse(session?.startedAt || '');
    const captureFinishedAtMs = Date.parse(session?.finishedAt || '');
    const captureDurationSeconds = Number(session?.captureDurationSeconds) || (
      Number.isFinite(startedAtMs) && Number.isFinite(captureFinishedAtMs)
        ? Math.max(0, (captureFinishedAtMs - startedAtMs) / 1000)
        : 0
    );
    const totalDurationSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, (Date.now() - startedAtMs) / 1000)
      : 0;
    return {
      startedAt: session?.startedAt || '',
      captureFinishedAt: session?.finishedAt || '',
      captureDurationSeconds,
      processingDurationSeconds: Number(runMetrics?.durationSeconds || session?.durationSeconds || 0),
      totalDurationSeconds,
      model: String(runMetrics?.model || storedCameraModel(session?.aiModel)),
      chunkSize: Number(runMetrics?.chunkSize || CAMERA_CHUNK_SIZE),
      concurrency: Number(runMetrics?.concurrency || CAMERA_CONCURRENCY),
      chunkTimings: Array.isArray(runMetrics?.chunkTimings) ? runMetrics.chunkTimings : [],
      reviewCount: Number(runMetrics?.reviewCount || 0),
      outsideBatamCount: Number(runMetrics?.outsideBatamCount || 0)
    };
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
    if (cameraImportRunning) return;
    cameraImportRunning = true;

    const store = window.MileCameraStore;
    const ai = window.MileAI;
    if (!store || typeof ai?.processPDFFile !== 'function' || typeof ai?.processCameraImages !== 'function') {
      cameraImportRunning = false;
      notify('Batch camera belum dapat dibuka. Muat ulang halaman.', 'error');
      return;
    }

    try {
      const session = await store.get(sessionId);
      if (!session || (!session.images?.length && !session.pdfBlob && !session.streamedRows) || Number(session.captureCount || 0) < 1) {
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
           core.uploadedFilesManager.push({ id: Date.now(), name: `Kamera - ${session.deviceName || sessionId}`, rows: session.streamedRows, source: 'Camera AI' });
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
                model: storedCameraModel(session.aiModel),
                chunkSize: CAMERA_CHUNK_SIZE,
                concurrency: CAMERA_CONCURRENCY,
                durationSeconds: session.durationSeconds || 0,
                totalRows: mRows.length,
                reviewCount: reviewCount,
                outsideBatamCount: outOfTown,
                message: 'Camera Direct · hingga 3 permintaan paralel × 5 gambar · audit maksimal 2 jalur · tanpa R2'
              }),
              credentials: 'same-origin'
            });
          } catch (e) {
            console.error('Failed to log metrics:', e);
          }
          await window.MileCameraSync.saveBatchResults(
            sessionId,
            session.captureCount,
            session.createdAt,
            session.deviceName,
            session.durationSeconds,
            buildSyncDetails(session, {
              durationSeconds: session.durationSeconds,
              model: session.aiModel,
              chunkSize: CAMERA_CHUNK_SIZE,
              concurrency: CAMERA_CONCURRENCY,
              reviewCount,
              outsideBatamCount: outOfTown
            })
          );
        }
        return;
      }
      
      if (Array.isArray(session.images) && session.images.length > 0) {
        const beforeFileCount = Number(core?.uploadedFilesManager?.length || 0);
        notify(`${session.captureCount} foto kamera siap dikirim langsung ke AI...`, 'success');
        aiProcessingActive = true;
        await requestReviewWakeLock();
        const runMetrics = await ai.processCameraImages(session.images, {
          name: `Kamera - ${session.deviceName || sessionId}`
        });
        if (['FAILED', 'CANCELLED'].includes(runMetrics?.status)) {
          window.history.replaceState({}, document.title, `${window.location.pathname}?cameraSession=${encodeURIComponent(sessionId)}${window.location.hash || ''}`);
          notify(String(runMetrics.error?.message || runMetrics.error || 'AI belum berhasil memproses foto. Foto asli tetap tersimpan untuk dicoba kembali.'), runMetrics.status === 'CANCELLED' ? 'info' : 'error');
          return;
        }
        const failedPages = Array.isArray(runMetrics?.failedPages)
          ? [...new Set(runMetrics.failedPages.map(Number).filter(page => Number.isInteger(page) && page > 0))].sort((a, b) => a - b)
          : [];
        const auditFailedPages = Array.isArray(runMetrics?.auditFailedPages)
          ? [...new Set(runMetrics.auditFailedPages.map(Number).filter(page => Number.isInteger(page) && page > 0))].sort((a, b) => a - b)
          : [];
        const partial = runMetrics?.status === 'PARTIAL' || failedPages.length > 0 || auditFailedPages.length > 0;
        const completed = Number(core?.uploadedFilesManager?.length || 0) > beforeFileCount
          || Number(core?.tempExtractedRows?.length || 0) > 0;
        if (completed) {
          if (!partial) await store.remove(sessionId);
          const reviewUrl = partial
            ? `${window.location.pathname}?cameraSession=${encodeURIComponent(sessionId)}${window.location.hash || ''}`
            : `${window.location.pathname}${window.location.hash || ''}`;
          window.history.replaceState({}, document.title, reviewUrl);
          if (typeof window.MileCameraSync?.saveBatchResults === 'function') {
            await window.MileCameraSync.saveBatchResults(
              sessionId,
              session.captureCount,
              session.createdAt,
              session.deviceName,
              runMetrics?.durationSeconds || session.durationSeconds,
              buildSyncDetails(session, runMetrics)
            );
          }
          if (partial) {
            const messages = [];
            if (failedPages.length) messages.push(`Foto ${failedPages.join(', ')} belum berhasil dibaca AI. Hasil sudah tersedia untuk diperiksa dan diisi manual.`);
            if (auditFailedPages.length) messages.push(`Audit foto ${auditFailedPages.join(', ')} belum selesai; periksa hasil awal.`);
            if (!messages.length) messages.push('Sebagian hasil masih perlu diperiksa dan diisi manual.');
            messages.push('Foto asli tetap tersimpan; muat ulang halaman untuk mencoba kembali.');
            notify(messages.join(' '), 'warning');
          }
        } else {
          window.history.replaceState({}, document.title, `${window.location.pathname}?cameraSession=${encodeURIComponent(sessionId)}`);
          throw new Error('Batch kamera belum menghasilkan data. Foto tetap tersimpan; muat ulang halaman untuk mencoba lagi.');
        }
        return;
      }

      // Compatibility path untuk sesi lama yang masih tersimpan sebagai PDF.
      if (!session.pdfBlob) {
         // This means it was a streaming session but AI completely failed.
         notify('AI gagal memproses gambar. Sesi kamera selesai tanpa hasil.', 'warning');
         await store.remove(sessionId);
         return;
      }
      
      const file = new File([session.pdfBlob], session.fileName || `camera-${sessionId}.pdf`, {
        type: 'application/pdf',
        lastModified: Date.now()
      });
      const beforeFileCount = Number(core?.uploadedFilesManager?.length || 0);
      notify(`${session.captureCount} hasil capture siap diproses...`, 'success');
      aiProcessingActive = true;
      await requestReviewWakeLock();
      const runMetrics = await ai.processPDFFile(file);
      const completed = Number(core?.uploadedFilesManager?.length || 0) > beforeFileCount
        || Number(core?.tempExtractedRows?.length || 0) > 0;
      if (completed) {
        await store.remove(sessionId);
        const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, cleanUrl);
        // Sync results to server for desktop access (72h TTL)
        if (typeof window.MileCameraSync?.saveBatchResults === 'function') {
          await window.MileCameraSync.saveBatchResults(
            sessionId,
            session.captureCount,
            session.createdAt,
            session.deviceName,
            runMetrics?.durationSeconds || session.durationSeconds,
            buildSyncDetails(session, runMetrics)
          );
        }
      } else {
        window.history.replaceState({}, document.title, `${window.location.pathname}?cameraSession=${encodeURIComponent(sessionId)}`);
        throw new Error('Batch camera belum menghasilkan data. Batch tetap tersimpan; muat ulang halaman untuk mencoba lagi.');
      }
    } catch (error) {
      notify(error?.message || 'Batch camera gagal diproses.', 'error');
    } finally {
      aiProcessingActive = false;
      cameraImportRunning = false;
      releaseReviewWakeLock();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(importCameraBatch, 180);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && aiProcessingActive) void requestReviewWakeLock();
  });
  window.addEventListener('beforeunload', releaseReviewWakeLock);
})();
