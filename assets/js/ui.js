(() => {
  'use strict';

  const modeLabels = {
    KORPORAT: 'Korporat',
    RITEL: 'Ritel',
    PINDAH: 'Barang pindah'
  };

  let reviewCursor = -1;

  function getDataRows() {
    return Array.from(document.querySelectorAll('#resultTable tbody tr'))
      .filter(row => row.querySelector('input'));
  }

  function getRowCount() {
    return getDataRows().length;
  }

  function hasReviewMarker(value) {
    if (typeof window.containsReviewMarker === 'function') {
      return window.containsReviewMarker(value);
    }
    return /\bPERLU\s+(?:DI\s*)?CEK\b/i.test(String(value ?? ''));
  }

  function getReviewInputs() {
    return Array.from(document.querySelectorAll('#resultTable tbody tr input'))
      .filter(input => hasReviewMarker(input.value));
  }

  function refreshReviewState() {
    const rows = getDataRows();
    let reviewRowCount = 0;
    let reviewInputCount = 0;

    rows.forEach(row => {
      const inputs = Array.from(row.querySelectorAll('input'));
      let rowHasReview = false;

      inputs.forEach(input => {
        const needsReview = hasReviewMarker(input.value);
        input.classList.toggle('needs-review-field', needsReview);
        input.closest('td')?.classList.toggle('needs-review-cell', needsReview);
        if (needsReview) {
          rowHasReview = true;
          reviewInputCount += 1;
        }
      });

      row.classList.toggle('needs-review', rowHasReview);
      row.dataset.needsReview = String(rowHasReview);
      const badge = row.querySelector('.review-row-badge');
      if (badge) badge.hidden = !rowHasReview;
      if (rowHasReview) reviewRowCount += 1;
    });

    const reviewCount = document.getElementById('reviewCount');
    const reviewAlert = document.getElementById('reviewAlert');
    const reviewAlertTitle = document.getElementById('reviewAlertTitle');
    const nextReviewButton = document.getElementById('nextReviewButton');

    if (reviewCount) {
      reviewCount.textContent = String(reviewRowCount);
      reviewCount.closest('.summary-item')?.classList.toggle('has-review', reviewRowCount > 0);
    }
    if (reviewAlert) reviewAlert.hidden = reviewRowCount === 0;
    if (reviewAlertTitle && reviewRowCount > 0) {
      reviewAlertTitle.textContent = `${reviewRowCount} baris memiliki ${reviewInputCount} bagian yang perlu dicek`;
    }
    if (nextReviewButton) nextReviewButton.disabled = reviewInputCount === 0;
    if (reviewCursor >= reviewInputCount) reviewCursor = -1;

    return { reviewRowCount, reviewInputCount };
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
  window.refreshReviewState = refreshReviewState;
  window.alert = message => showToast(message, /gagal|wajib|tidak ada|error|format|perlu dicek|koreksi/i.test(String(message)) ? 'error' : 'info');

  window.focusNextReviewIssue = function focusNextReviewIssue() {
    const inputs = getReviewInputs();
    if (!inputs.length) {
      showToast('Semua tanda “perlu dicek” sudah dikoreksi.', 'success');
      return;
    }

    const activeIndex = inputs.indexOf(document.activeElement);
    reviewCursor = activeIndex >= 0 ? (activeIndex + 1) % inputs.length : (reviewCursor + 1) % inputs.length;
    const target = inputs[reviewCursor];
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    window.setTimeout(() => {
      target.focus({ preventScroll: true });
      target.select?.();
    }, 260);
  };

  function syncDashboard() {
    const rowCount = getRowCount();
    const fileTotal = typeof uploadedFilesManager !== 'undefined' && Array.isArray(uploadedFilesManager) ? uploadedFilesManager.length : 0;
    const mode = document.getElementById('clientMode')?.value || 'KORPORAT';
    const insured = Boolean(document.getElementById('useInsurance')?.checked);
    const { reviewRowCount } = refreshReviewState();

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
    if (exportButton) {
      exportButton.disabled = rowCount === 0 || reviewRowCount > 0;
      exportButton.title = reviewRowCount > 0 ? 'Koreksi semua tulisan “perlu dicek” sebelum ekspor.' : '';
    }
    if (clearButton) clearButton.disabled = rowCount === 0 && fileTotal === 0;
    if (previewCard) previewCard.classList.toggle('has-data', rowCount > 0);

    if (status) {
      status.classList.remove('is-ready', 'is-busy', 'is-warning');
      if (reviewRowCount > 0) {
        status.classList.add('is-warning');
        status.innerHTML = `<span class="status-dot"></span>${reviewRowCount} baris perlu dikoreksi`;
      } else if (rowCount > 0) {
        status.classList.add('is-ready');
        status.innerHTML = '<span class="status-dot"></span>Siap diperiksa dan diekspor';
      } else if (typeof fileProcessQueue !== 'undefined' && fileProcessQueue?.length > 0) {
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
    if (rowCount > 0 && reviewRowCount === 0 && steps[3]) steps[3].classList.add('is-active');
  }

  const coreUpdateInterface = window.updateInterface;
  if (typeof coreUpdateInterface === 'function') {
    window.updateInterface = function enhancedUpdateInterface() {
      const result = coreUpdateInterface.apply(this, arguments);
      syncDashboard();
      return result;
    };
  }

  const coreHandleFileSelection = window.handleFileSelection;
  if (typeof coreHandleFileSelection === 'function') {
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
  }

  const coreProcessNext = window.processNextInQueue;
  if (typeof coreProcessNext === 'function') {
    window.processNextInQueue = function enhancedProcessNext() {
      syncDashboard();
      const result = coreProcessNext.apply(this, arguments);
      window.setTimeout(syncDashboard, 0);
      return result;
    };
  }

  window.clearWorkspaceData = function clearWorkspaceData() {
    const count = getRowCount();
    const fileCount = typeof uploadedFilesManager !== 'undefined' && Array.isArray(uploadedFilesManager) ? uploadedFilesManager.length : 0;
    if ((count > 0 || fileCount > 0) && !window.confirm('Hapus semua berkas yang telah diproses dan seluruh baris tabel?')) return;

    if (typeof uploadedFilesManager !== 'undefined') uploadedFilesManager = [];
    if (typeof fileProcessQueue !== 'undefined') fileProcessQueue = [];
    if (typeof currentWorkbook !== 'undefined') currentWorkbook = null;
    if (typeof currentFileName !== 'undefined') currentFileName = '';
    if (typeof currentHeaders !== 'undefined') currentHeaders = [];
    if (typeof tempExtractedRows !== 'undefined') tempExtractedRows = [];
    if (typeof window.updateInterface === 'function') window.updateInterface();
    showToast('Workspace telah dibersihkan.', 'success');
  };

  function trackFieldChanges() {
    ['clientMode', 'corporateTemplate', 'useInsurance'].forEach(id => {
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
