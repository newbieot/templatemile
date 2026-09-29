(() => {
  'use strict';

  const CAMERA_FORM_FIELD_IDS = new Set([
    'clientMode', 'corporateTemplate', 'customerId', 'senderName', 'senderPhone',
    'senderAddress', 'serviceCode', 'tariffCode', 'itemType', 'useInsurance'
  ]);
  let latestCameraBatchPayload = null;
  let cameraBatchSaveQueue = Promise.resolve(false);
  let cameraBatchResyncTimer = 0;

  /**
   * camera-sync.js — Sinkronisasi hasil form kamera ke server (R2)
   *
   * Dua fungsi utama:
   * 1. saveBatchResults()  — Dipanggil dari review page setelah AI selesai memproses.
   *    Mengumpulkan data form + baris hasil ekstraksi, POST ke /api/camera/batch/:id
   * 2. Desktop batch panel — Fetch daftar batch, tampilkan kartu, dan load data ke
   *    uploadedFilesManager saat user klik "Proses" di desktop.
   */

  function getFormValues() {
    const val = id => {
      const el = document.getElementById(id);
      if (!el) return '';
      if (el.type === 'checkbox') return el.checked;
      return el.value || '';
    };
    return {
      clientMode: val('clientMode'),
      corporateTemplate: val('corporateTemplate'),
      customerId: val('customerId'),
      senderName: val('senderName'),
      senderPhone: val('senderPhone'),
      senderAddress: val('senderAddress'),
      serviceCode: val('serviceCode'),
      tariffCode: val('tariffCode'),
      itemType: val('itemType'),
      useInsurance: val('useInsurance')
    };
  }

  function setFormValues(form) {
    if (!form || typeof form !== 'object') return;
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else {
        el.value = value || '';
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('clientMode', form.clientMode);
    // Delay template setting so clientMode change handler finishes first
    setTimeout(() => {
      set('corporateTemplate', form.corporateTemplate);
      setTimeout(() => {
        set('customerId', form.customerId);
        set('senderName', form.senderName);
        set('senderPhone', form.senderPhone);
        set('senderAddress', form.senderAddress);
        set('serviceCode', form.serviceCode);
        set('tariffCode', form.tariffCode);
        set('itemType', form.itemType);
        set('useInsurance', form.useInsurance);
      }, 80);
    }, 80);
  }

  function getAllRows() {
    const core = window.__mileCore;
    if (!core) return [];
    const files = core.uploadedFilesManager || [];
    const allRows = [];
    files.forEach(file => {
      (file.rows || []).forEach(row => allRows.push(row));
    });
    if (!allRows.length && Array.isArray(core.tempExtractedRows)) {
      core.tempExtractedRows.forEach(row => allRows.push(row));
    }
    return allRows;
  }

  function summarizeRows(rows) {
    let reviewCount = 0;
    let outsideBatamCount = 0;
    let cleanCount = 0;
    rows.forEach(row => {
      const reviewFields = row?.aiReviewFields || row?.reviewFields || [];
      const needsReview = (Array.isArray(reviewFields) && reviewFields.length > 0) || Boolean(row?.needsVerification);
      const outsideBatam = Boolean(row?.outsideBatam || row?.outOfTown);
      if (needsReview) reviewCount++;
      if (outsideBatam) outsideBatamCount++;
      if (!needsReview && !outsideBatam) cleanCount++;
    });
    return {
      reviewCount,
      outsideBatamCount,
      cleanCount
    };
  }

  function normalizeChunkTimings(value) {
    return (Array.isArray(value) ? value : []).slice(0, 60).map((item, index) => ({
      group: Math.max(1, Number(item?.group) || index + 1),
      start: Math.max(1, Number(item?.start) || 1),
      end: Math.max(1, Number(item?.end) || Number(item?.start) || 1),
      inputBytes: Math.max(0, Number(item?.inputBytes) || 0),
      encodedBytes: Math.max(0, Number(item?.encodedBytes) || 0),
      prepareMs: Math.max(0, Number(item?.prepareMs) || 0),
      encodeMs: Math.max(0, Number(item?.encodeMs) || 0),
      uploadMs: Math.max(0, Number(item?.uploadMs) || 0),
      waitMs: Math.max(0, Number(item?.waitMs) || 0),
      totalMs: Math.max(0, Number(item?.totalMs) || 0),
      auditMs: Math.max(0, Number(item?.auditMs) || 0),
      auditPages: Math.max(0, Number(item?.auditPages) || 0),
      rows: Math.max(0, Number(item?.rows) || 0),
      attempts: Math.max(0, Number(item?.attempts) || 0),
      retries: Math.max(0, Number(item?.retries) || 0),
      structuredFallbacks: Math.max(0, Number(item?.structuredFallbacks) || 0),
      reasoningFallbacks: Math.max(0, Number(item?.reasoningFallbacks) || 0),
      requestStartOffsetMs: Math.max(0, Number(item?.requestStartOffsetMs) || 0),
      requestEndOffsetMs: Math.max(0, Number(item?.requestEndOffsetMs) || 0),
      model: String(item?.model || ''),
      fallbackFrom: String(item?.fallbackFrom || ''),
      errorStatus: Math.max(0, Number(item?.errorStatus) || 0),
      upstreamMs: Math.max(0, Number(item?.upstreamMs) || 0),
      requestId: String(item?.requestId || ''),
      status: String(item?.status || '')
    }));
  }

  function persistCameraBatch(payload) {
    const request = async () => {
      const response = await fetch(`/api/camera/batch/${encodeURIComponent(payload.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      });
      const result = await response.json();
      return Boolean(result?.ok);
    };

    // Penulisan dibuat berurutan agar respons simpan yang lebih lama tidak dapat
    // menimpa pilihan template atau koreksi pengguna yang lebih baru.
    cameraBatchSaveQueue = cameraBatchSaveQueue.catch(() => false).then(request);
    return cameraBatchSaveQueue;
  }

  function scheduleCameraBatchResync() {
    if (!latestCameraBatchPayload || !window.location.pathname.startsWith('/review')) return;
    window.clearTimeout(cameraBatchResyncTimer);
    cameraBatchResyncTimer = window.setTimeout(async () => {
      const rows = getAllRows();
      if (!rows.length || !latestCameraBatchPayload) return;
      const rowSummary = summarizeRows(rows);
      const payload = {
        ...latestCameraBatchPayload,
        form: getFormValues(),
        rows,
        reviewCount: rowSummary.reviewCount,
        outsideBatamCount: rowSummary.outsideBatamCount,
        cleanCount: rowSummary.cleanCount
      };
      latestCameraBatchPayload = payload;
      try {
        await persistCameraBatch(payload);
      } catch (_) {
        // Simpan awal tetap tersedia. Perubahan berikutnya akan mencoba sinkronisasi lagi.
      }
    }, 650);
  }

  // ——— Save batch results to server ———

  async function saveBatchResults(batchId, captureCount, createdAt, deviceName, durationSeconds, details = {}) {
    if (!batchId || !/^CAM-/.test(batchId)) return;

    const rows = getAllRows();
    if (!rows.length) return;
    const rowSummary = summarizeRows(rows);
    const form = getFormValues();
    const processingDurationSeconds = Number(details.processingDurationSeconds || durationSeconds || 0);

    const payload = {
      id: batchId,
      createdAt: createdAt || Date.now(),
      startedAt: details.startedAt || '',
      captureFinishedAt: details.captureFinishedAt || '',
      finishedAt: new Date().toISOString(),
      captureCount: captureCount || 0,
      deviceName: deviceName || 'Kamera HP',
      durationSeconds: processingDurationSeconds,
      captureDurationSeconds: Number(details.captureDurationSeconds || 0),
      processingDurationSeconds,
      totalDurationSeconds: Number(details.totalDurationSeconds || 0),
      model: details.model || document.getElementById('aiModel')?.value || 'deepseek-v4.1-flash',
      chunkSize: Number(details.chunkSize || 7),
      concurrency: Number(details.concurrency || 3),
      chunkTimings: normalizeChunkTimings(details.chunkTimings),
      reviewCount: Number.isFinite(Number(details.reviewCount)) ? Number(details.reviewCount) : rowSummary.reviewCount,
      outsideBatamCount: Number.isFinite(Number(details.outsideBatamCount)) ? Number(details.outsideBatamCount) : rowSummary.outsideBatamCount,
      cleanCount: rowSummary.cleanCount,
      form,
      rows: rows
    };

    latestCameraBatchPayload = payload;
    try {
      const saved = await persistCameraBatch(payload);
      if (saved) {
        if (typeof window.showToast === 'function') {
          window.showToast(`Batch ${batchId} tersimpan di server (3 hari). Bisa dibuka di desktop.`, 'success');
        }
        return true;
      }
    } catch (_) {}
    return false;
  }

  // ——— Desktop batch panel ———

  function formatRelativeTime(timestamp) {
    const diff = Date.now() - Number(timestamp);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Baru saja';
    if (mins < 60) return `${mins} menit lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} jam lalu`;
    const days = Math.floor(hours / 24);
    return `${days} hari lalu`;
  }

  function formatExpiryTime(expiresAt) {
    const remaining = Number(expiresAt) - Date.now();
    if (remaining <= 0) return 'Kedaluwarsa';
    const hours = Math.floor(remaining / 3600000);
    if (hours < 1) return 'Kurang dari 1 jam lagi';
    if (hours < 24) return `${hours} jam lagi`;
    const days = Math.floor(hours / 24);
    return `${days} hari ${hours % 24} jam lagi`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(value) {
    const date = new Date(typeof value === 'number' || /^\d+$/.test(String(value || '')) ? Number(value) : value);
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function formatDuration(seconds) {
    const value = Number(seconds || 0);
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value < 60) return `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })} detik`;
    const minutes = Math.floor(value / 60);
    const remainder = Math.round(value % 60);
    return `${minutes} menit ${remainder} detik`;
  }

  function formatMilliseconds(milliseconds) {
    const value = Math.max(0, Number(milliseconds) || 0);
    if (!value) return '—';
    if (value < 1000) return `${Math.round(value)} ms`;
    return formatDuration(value / 1000);
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (!value) return '—';
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
  }

  function formatModel(model) {
    const labels = {
      'gemini-3.8-flash': 'Gemini 3.8 Flash',
      'gemini-3.7-flash': 'Gemini 3.7 Flash',
      'glm-5.3-flashx': 'GLM 5.3 FlashX',
      'glm-5.3': 'GLM 5.3',
      'glm-5.3-flash': 'GLM 5.3 Flash'
    };
    return String(model || '').split('->').map(value => labels[value.trim()] || value.trim()).filter(Boolean).join(' → ') || '—';
  }

  function renderBatchCard(batch) {
    const card = document.createElement('div');
    card.className = 'camera-batch-item';
    card.dataset.batchId = batch.id;

    const templateLabel = batch.templateName && batch.templateName !== 'MANUAL'
      ? batch.templateName.replace(/_/g, ' ')
      : 'Manual';
    const captureCount = Number(batch.captureCount || 0);
    const rowCount = Number(batch.rowCount || 0);
    const reviewCount = Number(batch.reviewCount || 0);
    const reviewFieldCount = Number(batch.reviewFieldCount || reviewCount || 0);
    const outsideBatamCount = Number(batch.outsideBatamCount || 0);
    const cleanCount = Number(batch.cleanCount || Math.max(0, rowCount - reviewCount - outsideBatamCount));
    const processingSeconds = Number(batch.durationSeconds || 0);
    const secondsPerRow = rowCount > 0 && processingSeconds > 0 ? processingSeconds / rowCount : 0;
    const deviceName = batch.deviceName || 'Kamera HP';
    const statusLabel = batch.status === 'complete' ? 'Selesai' : (batch.status || 'Tersimpan');
    const itemLabel = batch.itemType === 'PAKET' ? 'Paket' : 'Dokumen';
    const processScheme = batch.chunkSize && batch.concurrency
      ? `${batch.concurrency} jalur × ${batch.chunkSize} gambar`
      : '—';
    const chunkTimings = normalizeChunkTimings(batch.chunkTimings);
    const chunkTimingHtml = chunkTimings.length ? `
      <details class="camera-batch-timings">
        <summary>Rincian ${chunkTimings.length} kelompok AI</summary>
        <div class="camera-batch-timings__list">
          ${chunkTimings.map(timing => `
            <div class="camera-batch-timing">
              <strong>Kelompok ${timing.group} · Foto ${timing.start}–${timing.end}</strong>
              <span>${escapeHtml(formatModel(timing.model))}${timing.fallbackFrom ? ` · fallback dari ${escapeHtml(formatModel(timing.fallbackFrom))}` : ''}</span>
              <span>Persiapan ${escapeHtml(formatMilliseconds(timing.prepareMs))} · encode ${escapeHtml(formatMilliseconds(timing.encodeMs))}</span>
              <span>Upload ${escapeHtml(formatMilliseconds(timing.uploadMs))} · tunggu AI ${escapeHtml(formatMilliseconds(timing.waitMs))}</span>
              <span>Total ${escapeHtml(formatMilliseconds(timing.prepareMs + timing.totalMs + timing.auditMs))} · ${timing.rows} hasil · ${escapeHtml(formatBytes(timing.inputBytes))}</span>
              <span>${timing.attempts} percobaan · ${timing.retries} retry${timing.structuredFallbacks ? ` · fallback schema ${timing.structuredFallbacks}` : ''}${timing.reasoningFallbacks ? ` · fallback reasoning ${timing.reasoningFallbacks}` : ''}${timing.auditPages ? ` · audit ${timing.auditPages} foto` : ''}</span>
              <span>Timeline +${escapeHtml(formatMilliseconds(timing.requestStartOffsetMs))} → +${escapeHtml(formatMilliseconds(timing.requestEndOffsetMs))}${timing.upstreamMs ? ` · upstream ${escapeHtml(formatMilliseconds(timing.upstreamMs))}` : ''}</span>
              ${timing.errorStatus || timing.requestId ? `<span>${timing.errorStatus ? `HTTP ${timing.errorStatus}` : 'Respons akhir'}${timing.requestId ? ` · ID ${escapeHtml(timing.requestId)}` : ''}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </details>` : '';

    card.innerHTML = `
      <div class="camera-batch-item__topbar">
        <div class="camera-batch-item__header">
          <span class="camera-batch-item__icon" aria-hidden="true">📱</span>
          <div class="camera-batch-item__meta">
            <div class="camera-batch-item__title">${escapeHtml(deviceName)}</div>
            <div class="camera-batch-item__id">${escapeHtml(batch.id)}</div>
          </div>
        </div>
        <div class="camera-batch-item__badges">
          <span class="camera-batch-badge camera-batch-badge--success">${escapeHtml(statusLabel)}</span>
          <span class="camera-batch-badge">${escapeHtml(formatModel(batch.model))}</span>
          <span class="camera-batch-badge">${escapeHtml(templateLabel)}</span>
        </div>
      </div>

      <div class="camera-batch-item__stats" aria-label="Ringkasan batch">
        <div class="camera-batch-stat"><span>Foto</span><strong>${captureCount}</strong></div>
        <div class="camera-batch-stat"><span>Hasil</span><strong>${rowCount}</strong></div>
        <div class="camera-batch-stat camera-batch-stat--clean"><span>Bersih</span><strong>${cleanCount}</strong></div>
        <div class="camera-batch-stat camera-batch-stat--review" title="${reviewFieldCount} kolom perlu diperiksa"><span>Baris Perlu dicek</span><strong>${reviewCount}</strong><small>${reviewFieldCount} kolom</small></div>
        <div class="camera-batch-stat camera-batch-stat--outside"><span>Luar Batam</span><strong>${outsideBatamCount}</strong></div>
      </div>

      <dl class="camera-batch-item__details">
        <div><dt>Mulai capture</dt><dd>${escapeHtml(formatDateTime(batch.startedAt || batch.createdAt))}</dd></div>
        <div><dt>Selesai capture</dt><dd>${escapeHtml(formatDateTime(batch.captureFinishedAt || batch.createdAt))}</dd></div>
        <div><dt>Selesai AI</dt><dd>${escapeHtml(formatDateTime(batch.finishedAt || batch.savedAt))}</dd></div>
        <div><dt>Waktu capture</dt><dd>${escapeHtml(formatDuration(batch.captureDurationSeconds))}</dd></div>
        <div><dt>Waktu proses AI</dt><dd>${escapeHtml(formatDuration(processingSeconds))}</dd></div>
        <div><dt>Total sesi</dt><dd>${escapeHtml(formatDuration(batch.totalDurationSeconds))}</dd></div>
        <div><dt>Kecepatan</dt><dd>${secondsPerRow ? `${secondsPerRow.toLocaleString('id-ID', { maximumFractionDigits: 2 })} detik/data` : '—'}</dd></div>
        <div><dt>Skema AI</dt><dd>${escapeHtml(processScheme)}</dd></div>
        <div><dt>Pelanggan</dt><dd>${escapeHtml(batch.customerId || '—')}</dd></div>
        <div><dt>Layanan / tarif</dt><dd>${escapeHtml([batch.serviceCode, batch.tariffCode].filter(Boolean).join(' / ') || '—')}</dd></div>
        <div><dt>Jenis kiriman</dt><dd>${escapeHtml(itemLabel)}${batch.useInsurance ? ' · Asuransi' : ''}</dd></div>
        <div><dt>Disimpan server</dt><dd>${escapeHtml(formatDateTime(batch.savedAt))}</dd></div>
      </dl>

      ${chunkTimingHtml}

      <div class="camera-batch-item__footer">
        <div class="camera-batch-item__time">
          <span>${escapeHtml(formatRelativeTime(batch.createdAt))}</span>
          <span class="camera-batch-item__expiry">Kedaluwarsa ${escapeHtml(formatExpiryTime(batch.expiresAt))}</span>
        </div>
        <div class="camera-batch-item__actions">
          <button type="button" class="camera-batch-item__load" data-batch-id="${escapeHtml(batch.id)}">Muat ke Desktop ▶</button>
          <button type="button" class="camera-batch-item__delete" data-batch-id="${escapeHtml(batch.id)}" aria-label="Hapus batch ${escapeHtml(batch.id)}">🗑️</button>
        </div>
      </div>
    `;
    return card;
  }

  async function fetchAndRenderBatches() {
    const list = document.getElementById('cameraBatchesList');
    const badge = document.getElementById('cameraLogBadge');
    const btn = document.getElementById('openCameraLogsBtn');

    try {
      const response = await fetch('/api/camera/batches', { credentials: 'same-origin' });
      const data = await response.json();
      if (!data?.ok || !Array.isArray(data.batches) || !data.batches.length) {
        if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b;font-size:0.8rem">Tidak ada log kamera terbaru.</div>';
        if (badge) {
          badge.textContent = '0';
          badge.hidden = true;
        }
        if (btn) btn.hidden = true;
        return;
      }

      if (list) {
        list.innerHTML = '';
        data.batches.forEach(batch => list.appendChild(renderBatchCard(batch)));
      }
      
      if (badge) {
        badge.textContent = data.batches.length;
        badge.hidden = false;
      }
      if (btn) btn.hidden = false;
    } catch (_) {
      // ignore
    }
  }

  async function loadBatchToDesktop(batchId) {
    const core = window.__mileCore;
    if (!core) {
      if (typeof window.showToast === 'function') window.showToast('Core belum siap. Muat ulang halaman.', 'error');
      return;
    }

    const loadBtn = document.querySelector(`.camera-batch-item__load[data-batch-id="${batchId}"]`);
    if (loadBtn) {
      loadBtn.disabled = true;
      loadBtn.textContent = 'Memuat…';
    }

    try {
      const response = await fetch(`/api/camera/batch/${encodeURIComponent(batchId)}`, { credentials: 'same-origin' });
      const data = await response.json();
      if (!data?.ok || !data.batch) {
        throw new Error(data?.error?.message || 'Batch tidak ditemukan.');
      }

      const batch = data.batch;
      if (!Array.isArray(batch.rows) || !batch.rows.length) {
        throw new Error('Batch tidak berisi data baris.');
      }

      // Set form values
      setFormValues(batch.form);

      // Inject rows into uploadedFilesManager
      const fileEntry = {
        id: Date.now(),
        name: `camera-${batchId}.pdf`,
        source: 'camera-sync',
        rows: batch.rows
      };

      // Use core's internal methods
      core.uploadedFilesManager.push(fileEntry);
      core.updateInterface();

      let outsideCount = 0;
      let reviewCount = 0;
      
      if (typeof window.getPendingOutsideBatamCount === 'function') {
        outsideCount = window.getPendingOutsideBatamCount();
      }
      if (typeof window.getPendingReviewCount === 'function') {
        reviewCount = window.getPendingReviewCount();
      }

      if (typeof window.showToast === 'function') {
        if (outsideCount > 0 || reviewCount > 0) {
          window.showToast(`${batch.rows.length} baris dimuat. Terdapat ${outsideCount} luar kota & ${reviewCount} perlu dicek!`, 'warning');
          // Tampilkan alert tegas sesuai kebiasaan desktop di file upload manual
          setTimeout(() => {
            let msg = `Perhatian:\nData dari kamera berhasil dimuat, namun masih ada data yang perlu dikoreksi:\n`;
            if (outsideCount > 0) msg += `- ${outsideCount} alamat terdeteksi di luar Kota Batam\n`;
            if (reviewCount > 0) msg += `- ${reviewCount} bagian teks bertuliskan "perlu dicek"\n`;
            msg += `\nMohon perbaiki baris yang berwarna merah sebelum melakukan ekspor.`;
            alert(msg);
          }, 100);
        } else {
          window.showToast(`${batch.rows.length} baris dari kamera HP dimuat. Semua data aman.`, 'success');
        }
      }

      // Scroll to results section
      const resultsSection = document.querySelector('.preview-column') || document.getElementById('resultTable');
      if (resultsSection) resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
      if (typeof window.showToast === 'function') {
        window.showToast(error?.message || 'Gagal memuat batch.', 'error');
      }
    } finally {
      if (loadBtn) {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Muat ke Desktop ▶';
      }
    }
  }

  async function deleteBatch(batchId) {
    if (!confirm(`Hapus batch ${batchId}? Data akan dihapus dari server.`)) return;

    try {
      await fetch(`/api/camera/batch/${encodeURIComponent(batchId)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      const card = document.querySelector(`.camera-batch-item[data-batch-id="${batchId}"]`);
      if (card) card.remove();

      const list = document.getElementById('cameraBatchesList');
      const badge = document.getElementById('cameraLogBadge');
      if (list && !list.children.length) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b;font-size:0.8rem">Tidak ada log kamera terbaru.</div>';
        if (badge) {
          badge.textContent = '0';
          badge.hidden = true;
        }
        const btn = document.getElementById('openCameraLogsBtn');
        if (btn) btn.hidden = true;
        
        // Auto-close modal if empty
        const modal = document.getElementById('cameraLogsModal');
        if (modal) modal.style.display = 'none';
      } else if (badge && list) {
        badge.textContent = list.querySelectorAll('.camera-batch-item').length;
      }

      if (typeof window.showToast === 'function') {
        window.showToast('Log berhasil dihapus.', 'success');
      }
    } catch (_) {
      if (typeof window.showToast === 'function') {
        window.showToast('Gagal menghapus log.', 'error');
      }
    }
  }

  // ——— Event delegation ———

  function initDesktopPanel() {
    const list = document.getElementById('cameraBatchesList');
    const openBtn = document.getElementById('openCameraLogsBtn');
    const closeBtn = document.getElementById('closeCameraLogsBtn');
    const modal = document.getElementById('cameraLogsModal');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        fetchAndRenderBatches(); // Refresh on open
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    if (list) {
      list.addEventListener('click', event => {
        const loadBtn = event.target.closest('.camera-batch-item__load');
        if (loadBtn) {
          if (modal) modal.style.display = 'none';
          loadBatchToDesktop(loadBtn.dataset.batchId);
          return;
        }
        const deleteBtn = event.target.closest('.camera-batch-item__delete');
        if (deleteBtn) {
          deleteBatch(deleteBtn.dataset.batchId);
        }
      });
    }

    // Initial fetch
    fetchAndRenderBatches();

    // Auto-refresh every 60 seconds
    setInterval(fetchAndRenderBatches, 60000);
  }

  // ——— Public API ———

  window.MileCameraSync = {
    saveBatchResults,
    fetchAndRenderBatches,
    loadBatchToDesktop,
    deleteBatch
  };

  document.addEventListener('change', event => {
    if (CAMERA_FORM_FIELD_IDS.has(event.target?.id)) scheduleCameraBatchResync();
    else if (event.target?.closest?.('#resultTable')) scheduleCameraBatchResync();
  });

  // Initialize desktop panel if elements exist
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initDesktopPanel, 300);
  });
})();
