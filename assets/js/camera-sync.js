(() => {
  'use strict';

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
    return allRows;
  }

  // ——— Save batch results to server ———

  async function saveBatchResults(batchId, captureCount, createdAt) {
    if (!batchId || !/^CAM-/.test(batchId)) return;

    const rows = getAllRows();
    if (!rows.length) return;

    const payload = {
      id: batchId,
      createdAt: createdAt || Date.now(),
      finishedAt: new Date().toISOString(),
      captureCount: captureCount || 0,
      form: getFormValues(),
      rows: rows
    };

    try {
      const response = await fetch(`/api/camera/batch/${encodeURIComponent(batchId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      });
      const result = await response.json();
      if (result?.ok) {
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

  function renderBatchCard(batch) {
    const card = document.createElement('div');
    card.className = 'camera-batch-item';
    card.dataset.batchId = batch.id;

    const templateLabel = batch.templateName && batch.templateName !== 'MANUAL'
      ? batch.templateName.replace(/_/g, ' ')
      : 'Manual';

    card.innerHTML = `
      <div class="camera-batch-item__header">
        <span class="camera-batch-item__icon" aria-hidden="true">📄</span>
        <div class="camera-batch-item__meta">
          <div class="camera-batch-item__title">${batch.rowCount || 0} baris dari ${batch.captureCount || 0} foto</div>
          <div class="camera-batch-item__time"><span>${formatRelativeTime(batch.createdAt)}</span> Template: ${templateLabel}</div>
          <div class="camera-batch-item__expiry"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${formatExpiryTime(batch.expiresAt)}</div>
        </div>
      </div>
      <div class="camera-batch-item__actions">
        <button type="button" class="camera-batch-item__load" data-batch-id="${batch.id}">Muat ke Desktop ▶</button>
        <button type="button" class="camera-batch-item__delete" data-batch-id="${batch.id}" aria-label="Hapus batch">🗑️</button>
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

  // Initialize desktop panel if elements exist
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initDesktopPanel, 300);
  });
})();
