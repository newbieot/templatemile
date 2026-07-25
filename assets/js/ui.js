(() => {
  'use strict';

  const modeLabels = {
    KORPORAT: 'Korporat',
    RITEL: 'Ritel',
    PINDAH: 'Barang pindah'
  };

  function getRowCount() {
    return Array.from(document.querySelectorAll('#resultTable tbody tr'))
      .filter(row => row.querySelector('input')).length;
  }

  function showToast(message, type = 'info') {
    const region = document.getElementById('toastRegion');
    if (!region || !message) return;

    const toast = document.createElement('div');
    toast.className = `toast${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    toast.setAttribute('role', 'status');
    toast.textContent = String(message);
    region.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 220);
    }, 4200);
  }

  window.showToast = showToast;
  window.alert = message => showToast(message, /gagal|wajib|tidak ada|error|format/i.test(String(message)) ? 'error' : 'info');

  function syncDashboard() {
    const rowCount = getRowCount();
    const fileTotal = Array.isArray(uploadedFilesManager) ? uploadedFilesManager.length : 0;
    const mode = document.getElementById('clientMode')?.value || 'KORPORAT';
    const insured = Boolean(document.getElementById('useInsurance')?.checked);

    const recordCount = document.getElementById('recordCount');
    const fileCount = document.getElementById('fileCount');
    const inlineCount = document.getElementById('fileCountInline');
    const modeSummary = document.getElementById('modeSummary');
    const insuranceSummary = document.getElementById('insuranceSummary');
    const exportButton = document.getElementById('exportButton');
    const clearButton = document.getElementById('clearDataButton');
    const status = document.getElementById('workspaceStatus');
    const previewCard = document.querySelector('.preview-card');

    if (recordCount) recordCount.textContent = String(rowCount);
    if (fileCount) fileCount.textContent = String(fileTotal);
    if (inlineCount) inlineCount.textContent = `${fileTotal} berkas`;
    if (modeSummary) modeSummary.textContent = modeLabels[mode] || mode;
    if (insuranceSummary) insuranceSummary.textContent = insured ? 'Aktif' : 'Nonaktif';
    if (exportButton) exportButton.disabled = rowCount === 0;
    if (clearButton) clearButton.disabled = rowCount === 0 && fileTotal === 0;
    if (previewCard) previewCard.classList.toggle('has-data', rowCount > 0);

    if (status) {
      status.classList.remove('is-ready', 'is-busy');
      if (rowCount > 0) {
        status.classList.add('is-ready');
        status.innerHTML = '<span class="status-dot"></span>Siap diperiksa dan diekspor';
      } else if (fileProcessQueue?.length > 0) {
        status.classList.add('is-busy');
        status.innerHTML = '<span class="status-dot"></span>Sedang memproses berkas sumber';
      } else {
        status.innerHTML = '<span class="status-dot"></span>Menunggu berkas sumber';
      }
    }

    const steps = Array.from(document.querySelectorAll('.workflow-step'));
    steps.forEach(step => step.classList.remove('is-active', 'is-complete'));
    if (steps[0]) steps[0].classList.add('is-complete');
    if (fileTotal > 0 || rowCount > 0) {
      if (steps[1]) steps[1].classList.add('is-complete');
      if (steps[2]) steps[2].classList.add(rowCount > 0 ? 'is-active' : '');
    } else if (steps[1]) {
      steps[1].classList.add('is-active');
    }
    if (rowCount > 0 && steps[2]) steps[2].classList.add('is-active');
    if (rowCount > 0 && steps[3]) steps[3].classList.add('is-active');
  }

  const coreUpdateInterface = window.updateInterface;
  window.updateInterface = function enhancedUpdateInterface() {
    coreUpdateInterface.apply(this, arguments);
    syncDashboard();
  };

  const coreHandleFileSelection = window.handleFileSelection;
  window.handleFileSelection = function enhancedHandleFileSelection(files) {
    const allowed = document.body.dataset.acceptPdf === 'true' ? /\.(xlsx|xls|csv|pdf)$/i : /\.(xlsx|xls|csv)$/i;
    const accepted = [];
    const rejected = [];

    Array.from(files || []).forEach(file => {
      if (allowed.test(file.name)) accepted.push(file);
      else rejected.push(file.name);
    });

    if (rejected.length) {
      showToast(`Format tidak didukung dan dilewati: ${rejected.join(', ')}`, 'error');
    }
    if (!accepted.length) return;

    coreHandleFileSelection.call(this, accepted);
    syncDashboard();
  };

  const coreProcessNext = window.processNextInQueue;
  window.processNextInQueue = function enhancedProcessNext() {
    syncDashboard();
    const result = coreProcessNext.apply(this, arguments);
    window.setTimeout(syncDashboard, 0);
    return result;
  };

  window.clearWorkspaceData = function clearWorkspaceData() {
    const count = getRowCount();
    if ((count > 0 || uploadedFilesManager.length > 0) && !window.confirm('Hapus semua berkas yang telah diproses dan seluruh baris tabel?')) return;

    uploadedFilesManager = [];
    fileProcessQueue = [];
    currentWorkbook = null;
    currentFileName = '';
    currentHeaders = [];
    tempExtractedRows = [];
    updateInterface();
    showToast('Workspace telah dibersihkan.', 'success');
  };

  function trackFieldChanges() {
    ['clientMode', 'useInsurance'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => window.setTimeout(syncDashboard, 0));
    });

    document.getElementById('resultTable')?.addEventListener('input', syncDashboard);
  }

  function improveModalFocus() {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        if (getComputedStyle(modal).display !== 'none') {
          const focusable = modal.querySelector('select,input,button');
          if (focusable && !modal.contains(document.activeElement)) focusable.focus({ preventScroll: true });
        }
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => observer.observe(modal, { attributes: true, attributeFilter: ['style'] }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    trackFieldChanges();
    improveModalFocus();
    window.setTimeout(syncDashboard, 0);

    if (typeof XLSX === 'undefined') {
      showToast('Library spreadsheet gagal dimuat. Muat ulang halaman dan periksa koneksi internet.', 'error');
    }
  });
})();
