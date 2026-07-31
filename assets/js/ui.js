(() => {
  'use strict';

  const modeLabels = {
    KORPORAT: 'Korporat',
    RITEL: 'Ritel',
    PINDAH: 'Barang pindah'
  };

  let reviewCursor = -1;
  let activeExpandedEditor = null;
  let activeExpandedColumnIndex = -1;
  let expandedColumnStyle = null;
  let textMeasureCanvas = null;
  let lastReviewInputCount = 0;
  let mandatoryReviewFocusTimer = null;

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
    return Array.from(document.querySelectorAll('#resultTable tbody tr input[data-review-pending="true"]'));
  }

  function selectReviewMarker(input) {
    const value = String(input.value ?? '');
    const match = /\bPERLU\s+(?:DI\s*)?CEK\b/i.exec(value);
    if (match && typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(match.index, match.index + match[0].length);
      return;
    }
    input.select?.();
  }

  function getExpandedColumnMinimum(input) {
    if (input.classList.contains('val-address')) return 680;
    if (input.classList.contains('val-senderName')) return 520;
    if (input.classList.contains('val-name')) return 480;
    if (input.classList.contains('val-noSurat')) return 460;
    return 380;
  }

  function measureEditorWidth(input) {
    const currentWidth = Math.ceil(input.getBoundingClientRect().width || 0);
    const style = window.getComputedStyle(input);
    textMeasureCanvas ||= document.createElement('canvas');
    const context = textMeasureCanvas.getContext('2d');
    const minimum = getExpandedColumnMinimum(input);

    if (!context) return Math.max(currentWidth, minimum);

    context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const value = input.value || input.placeholder || '';
    const measuredText = context.measureText(value.toUpperCase()).width;
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);

    // Sisakan ruang untuk kursor dan agar ujung teks tidak berhimpitan dengan tepi input.
    return Math.max(currentWidth, Math.ceil(measuredText + padding + border + 72), minimum);
  }

  function ensureExpandedColumnStyle() {
    if (expandedColumnStyle?.isConnected) return expandedColumnStyle;
    expandedColumnStyle = document.createElement('style');
    expandedColumnStyle.id = 'mile-expanded-column-style';
    document.head.appendChild(expandedColumnStyle);
    return expandedColumnStyle;
  }

  function resetExpandedColumnRule() {
    const table = document.getElementById('resultTable');
    table?.classList.remove('is-column-expanded');
    table?.removeAttribute('data-expanded-column');
    if (expandedColumnStyle) expandedColumnStyle.textContent = '';
    activeExpandedColumnIndex = -1;
  }

  function collapseExpandedEditor(input = activeExpandedEditor) {
    if (input) {
      input.classList.remove('is-expanded-editor');
      input.closest('td')?.classList.remove('is-active-editor-cell');
      input.closest('tr')?.classList.remove('has-active-editor');
    }
    resetExpandedColumnRule();
    if (!input || activeExpandedEditor === input) activeExpandedEditor = null;
  }

  function expandTableEditor(input) {
    if (!(input instanceof HTMLInputElement) || !input.matches('#resultTable .table-input')) return;

    if (activeExpandedEditor && activeExpandedEditor !== input) {
      collapseExpandedEditor(activeExpandedEditor);
    }

    const cell = input.closest('td');
    const table = input.closest('table');
    const container = input.closest('.table-container');
    if (!cell || !table) return;

    activeExpandedEditor = input;
    activeExpandedColumnIndex = cell.cellIndex;
    input.classList.add('is-expanded-editor');
    cell.classList.add('is-active-editor-cell');
    input.closest('tr')?.classList.add('has-active-editor');

    const containerWidth = Math.max(container?.clientWidth || window.innerWidth || 900, 420);
    const maximumUsefulWidth = Math.max(420, Math.min(1400, containerWidth - 110));
    const desiredWidth = Math.min(measureEditorWidth(input), maximumUsefulWidth);
    const columnNumber = activeExpandedColumnIndex + 1;
    const style = ensureExpandedColumnStyle();

    // Yang diperlebar adalah seluruh kolom, bukan hanya input. !important diperlukan
    // karena judul tabel lama memiliki width persentase melalui inline style.
    style.textContent = `
      #resultTable.is-column-expanded th:nth-child(${columnNumber}),
      #resultTable.is-column-expanded td:nth-child(${columnNumber}) {
        width: ${desiredWidth}px !important;
        min-width: ${desiredWidth}px !important;
        max-width: ${desiredWidth}px !important;
      }
      #resultTable.is-column-expanded td:nth-child(${columnNumber}) .table-input {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
      }
    `;

    table.classList.add('is-column-expanded');
    table.dataset.expandedColumn = String(columnNumber);

    // Tunggu browser menghitung ulang lebar tabel, kemudian bawa kolom aktif ke tengah viewport.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        input.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    });
  }

  function focusReviewInput(target, options = {}) {
    if (!(target instanceof HTMLInputElement)) return;
    const { smooth = true, select = true } = options;
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center', inline: 'center' });
    window.setTimeout(() => {
      target.focus({ preventScroll: true });
      if (select) selectReviewMarker(target);
    }, smooth ? 260 : 30);
  }

  function applyMandatoryReviewMode(reviewInputCount) {
    const active = reviewInputCount > 0;
    document.body.classList.toggle('is-mandatory-review', active);
    document.querySelector('.preview-card')?.classList.toggle('is-review-required', active);

    // Tidak ada field atau baris yang dikunci. Pengguna bebas mengoreksi dengan tenang;
    // yang dibatasi hanya ekspor sampai seluruh koreksi wajib diselesaikan.
    getDataRows().forEach(row => {
      row.classList.remove('is-review-locked-row');
      row.removeAttribute('aria-disabled');
      if ('inert' in row) row.inert = false;
    });

    const alert = document.getElementById('reviewAlert');
    if (alert) {
      alert.setAttribute('aria-live', active ? 'assertive' : 'polite');
      alert.setAttribute('aria-atomic', 'true');
    }
  }

  function scheduleMandatoryReviewFocus(reviewInputCount) {
    const shouldFocus = reviewInputCount > 0 && lastReviewInputCount === 0;

    if (reviewInputCount === 0 && mandatoryReviewFocusTimer) {
      window.clearTimeout(mandatoryReviewFocusTimer);
      mandatoryReviewFocusTimer = null;
    }

    if (shouldFocus && !mandatoryReviewFocusTimer) {
      mandatoryReviewFocusTimer = window.setTimeout(() => {
        mandatoryReviewFocusTimer = null;
        const target = getReviewInputs()[0];
        if (!target) return;
        document.getElementById('reviewAlert')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        focusReviewInput(target, { smooth: true, select: true });
        showToast('Ada data yang wajib dikoreksi. Selesaikan pengetikan, lalu pindah kolom atau tekan Enter untuk menandainya selesai.', 'error');
      }, 180);
    }

    if (reviewInputCount === 0 && lastReviewInputCount > 0) {
      showToast('Semua bagian yang perlu dicek sudah dikoreksi. Workbook siap diekspor.', 'success');
    }

    lastReviewInputCount = reviewInputCount;
  }

  function refreshReviewState() {
    const rows = getDataRows();
    let reviewRowCount = 0;
    let reviewInputCount = 0;

    rows.forEach(row => {
      const inputs = Array.from(row.querySelectorAll('input'));
      let rowHasReview = false;

      inputs.forEach(input => {
        const needsReview = input.dataset.reviewPending === 'true';
        const isDirty = input.dataset.reviewDirty === 'true';
        input.classList.toggle('needs-review-field', needsReview);
        input.classList.toggle('is-review-dirty', needsReview && isDirty);
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
      reviewAlertTitle.textContent = `${reviewRowCount} baris memiliki ${reviewInputCount} bagian yang wajib dikoreksi`;
    }
    if (nextReviewButton) nextReviewButton.disabled = reviewInputCount === 0;
    if (reviewCursor >= reviewInputCount) reviewCursor = -1;

    applyMandatoryReviewMode(reviewInputCount);
    scheduleMandatoryReviewFocus(reviewInputCount);

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
    focusReviewInput(target, { smooth: true, select: true });
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

    const resultTable = document.getElementById('resultTable');
    resultTable?.addEventListener('input', event => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input) return;

      // Sel tetap berstatus perlu dikoreksi selama pengguna masih mengetik.
      // Tidak ada perpindahan fokus dan tidak ada penguncian setelah satu huruf.
      if (input.dataset.reviewPending === 'true') {
        const changed = String(input.value ?? '').trim() !== String(input.dataset.reviewOriginal ?? '').trim();
        input.dataset.reviewDirty = String(changed);
        input.classList.toggle('is-review-dirty', changed);
      }

      syncDashboard();
      if (input === activeExpandedEditor) expandTableEditor(activeExpandedEditor);
    });

    resultTable?.addEventListener('focusin', event => {
      const input = event.target.closest?.('.table-input');
      if (input) expandTableEditor(input);
    });

    resultTable?.addEventListener('focusout', event => {
      const input = event.target.closest?.('input');
      if (!input) return;
      if (input.matches('.table-input')) collapseExpandedEditor(input);

      if (input.dataset.reviewPending === 'true' && typeof window.commitReviewCorrection === 'function') {
        const result = window.commitReviewCorrection(input);
        if (result?.resolved) {
          input.classList.add('is-review-resolved');
          window.setTimeout(() => input.classList.remove('is-review-resolved'), 900);
          showToast('Perubahan disimpan sebagai koreksi.', 'success');
        }
        syncDashboard();
      }
    });

    resultTable?.addEventListener('keydown', event => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (event.key === 'Escape' && event.target === activeExpandedEditor) {
        collapseExpandedEditor(activeExpandedEditor);
      }
      if (event.key === 'Enter' && input?.dataset.reviewPending === 'true') {
        event.preventDefault();
        const result = typeof window.commitReviewCorrection === 'function'
          ? window.commitReviewCorrection(input)
          : null;
        if (result?.resolved) {
          input.classList.add('is-review-resolved');
          syncDashboard();
          showToast('Perubahan disimpan sebagai koreksi.', 'success');
          input.blur();
          return;
        }
        const message = result?.reason === 'empty'
          ? 'Kolom koreksi tidak boleh kosong.'
          : 'Belum ada perubahan. Edit nilainya terlebih dahulu.';
        showToast(message, 'error');
      }
    });

    window.addEventListener('resize', () => {
      if (activeExpandedEditor) expandTableEditor(activeExpandedEditor);
    });
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
