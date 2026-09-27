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
  let activeReviewEditor = null;
  let lastOutsideBatamCount = 0;

  function getDataRows() {
    return Array.from(document.querySelectorAll('#resultTable tbody tr'))
      .filter(row => row.querySelector('input'));
  }

  function getRowCount() {
    return getDataRows().length;
  }

  function getOutsideBatamRows() {
    return getDataRows().filter(row => row.dataset.outsideBatamPending === 'true');
  }

  function getOutsideBatamLocation(row) {
    const rowNumber = String(row?.dataset?.rowNumber || row?.querySelector?.('.row-number-cell')?.textContent || '?').trim();
    const address = String(row?.querySelector?.('.val-address')?.value || '').trim();
    return { rowNumber, address, label: `No. ${rowNumber}` };
  }

  function getCurrentOutsideBatamRow() {
    return getOutsideBatamRows()[0] || null;
  }

  function hasReviewMarker(value) {
    if (typeof window.containsReviewMarker === 'function') {
      return window.containsReviewMarker(value);
    }
    return /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(String(value ?? ''));
  }

  function getReviewInputs() {
    return Array.from(document.querySelectorAll('#resultTable tbody tr input[data-review-pending="true"]'));
  }

  const reviewFieldLabels = [
    ['val-noSurat', 'No Ref/Surat'],
    ['val-name', 'Nama Penerima'],
    ['val-address', 'Alamat'],
    ['val-phone', 'Nomor HP'],
    ['val-cw', 'Berat'],
    ['val-p', 'Panjang'],
    ['val-l', 'Lebar'],
    ['val-t', 'Tinggi'],
    ['val-ins-harga', 'Nilai Barang']
  ];

  function getReviewLocation(input) {
    const row = input?.closest?.('tr');
    const rowNumber = String(row?.dataset?.rowNumber || row?.querySelector?.('.row-number-cell')?.textContent || '?').trim();
    const field = reviewFieldLabels.find(([className]) => input?.classList?.contains(className))?.[1] || 'Data';
    const reason = String(input?.dataset?.reviewReason || '').trim();
    const sourcePage = Number(input?.dataset?.reviewSourcePage || 0) || 0;
    return { rowNumber, field, reason, sourcePage, label: `No. ${rowNumber} · ${field}${sourcePage ? ` · Sumber ${sourcePage}` : ''}` };
  }

  function getPendingReviewRowNumbers() {
    return Array.from(new Set(getReviewInputs().map(input => getReviewLocation(input).rowNumber))).filter(Boolean);
  }

  function selectReviewMarker(input) {
    const value = String(input.value ?? '');
    const match = /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.exec(value);
    if (match && typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(match.index, match.index + match[0].length);
      return;
    }
    input.select?.();
  }

  function getExpandedColumnMinimum(input) {
    if (input.classList.contains('val-address')) return 680;
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
    if (window.innerWidth <= 768) return;
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

  function applyMandatoryReviewMode(reviewInputCount, outsideBatamCount = 0) {
    const active = reviewInputCount > 0;
    const outsideActive = outsideBatamCount > 0;
    document.body.classList.toggle('is-mandatory-review', active);
    document.body.classList.toggle('is-mandatory-outside-batam', outsideActive);
    document.querySelector('.preview-card')?.classList.toggle('is-review-required', active || outsideActive);

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
        activeReviewEditor = target;
        focusReviewInput(target, { smooth: true, select: true });
        updateReviewActionState();
        showToast(`Koreksi ${getReviewLocation(target).label} sampai selesai, lalu klik tombol centang.`, 'error');
      }, 180);
    }

    if (reviewInputCount === 0 && lastReviewInputCount > 0) {
      activeReviewEditor = null;
      updateReviewActionState();
      showToast('Semua bagian yang perlu dicek sudah dikoreksi. Workbook siap diekspor.', 'success');
    }

    lastReviewInputCount = reviewInputCount;
  }

  function refreshOutsideBatamState() {
    const rows = getOutsideBatamRows();
    const count = rows.length;
    const summary = document.getElementById('outsideBatamCount');
    const alert = document.getElementById('outsideBatamAlert');
    const title = document.getElementById('outsideBatamAlertTitle');
    const hint = document.getElementById('outsideBatamActionHint');
    const locationBadge = document.getElementById('outsideBatamLocationBadge');
    const openButton = document.getElementById('openOutsideBatamButton');
    const keepButton = document.getElementById('keepOutsideBatamButton');
    const deleteButton = document.getElementById('deleteOutsideBatamButton');
    const current = rows[0] || null;

    if (summary) {
      summary.textContent = String(count);
      summary.closest('.summary-item')?.classList.toggle('has-outside', count > 0);
    }
    if (alert) alert.hidden = count === 0;

    if (current) {
      const locations = rows.map(row => getOutsideBatamLocation(row).rowNumber);
      const visible = locations.slice(0, 8).join(', ');
      const remaining = Math.max(0, locations.length - 8);
      const currentInfo = getOutsideBatamLocation(current);
      if (title) title.textContent = `Alamat luar Kota Batam terdeteksi pada No. ${visible}${remaining ? ` dan ${remaining} nomor lainnya` : ''}`;
      if (locationBadge) { locationBadge.textContent = currentInfo.label; locationBadge.hidden = false; }
      if (hint) hint.textContent = `${currentInfo.label}: “${currentInfo.address || '(alamat kosong)'}”. Alamat wajib diperbaiki hingga jelas menunjukkan Kota Batam, lalu simpan koreksinya. Hapus baris jika tujuan memang di luar Kota Batam.`;
      if (openButton) openButton.textContent = `Buka alamat ${currentInfo.label}`;
      if (keepButton) keepButton.textContent = 'Simpan alamat yang sudah diperbaiki';
      if (keepButton) keepButton.disabled = false;
      if (deleteButton) deleteButton.disabled = false;
    } else {
      if (locationBadge) locationBadge.hidden = true;
      if (openButton) openButton.textContent = 'Buka alamat';
      if (keepButton) keepButton.disabled = true;
      if (deleteButton) deleteButton.disabled = true;
    }

    if (count > 0 && lastOutsideBatamCount === 0) {
      window.setTimeout(() => {
        if (!getCurrentOutsideBatamRow()) return;
        document.getElementById('outsideBatamAlert')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        showToast('Alamat luar Kota Batam terdeteksi. Perbaiki alamat sampai valid untuk Batam atau hapus barisnya.', 'error');
      }, 120);
    } else if (count === 0 && lastOutsideBatamCount > 0) {
      showToast('Semua keputusan alamat luar Kota Batam sudah diselesaikan.', 'success');
    }
    lastOutsideBatamCount = count;
    return { outsideBatamCount: count };
  }

  function refreshReviewState() {
    const rows = getDataRows();
    let reviewRowCount = 0;
    let reviewInputCount = 0;

    rows.forEach(row => {
      const inputs = Array.from(row.querySelectorAll('input'));
      let rowHasReview = false;

      inputs.forEach(input => {
        // Sinkronkan kembali status dengan isi aktual. Frasa "perlu dicek" selalu
        // memenangkan status lama sehingga sorotan dan kewajiban koreksi tidak hilang.
        if (typeof window.syncManagedRowFromInput === 'function') {
          window.syncManagedRowFromInput(input);
        }
        const markerStillPresent = typeof window.containsReviewMarker === 'function'
          ? window.containsReviewMarker(input.value)
          : /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(String(input.value ?? ''));
        if (markerStillPresent) input.dataset.reviewPending = 'true';

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
    const openReviewButton = document.getElementById('openReviewButton');
    const locationBadge = document.getElementById('reviewLocationBadge');

    if (reviewCount) {
      reviewCount.textContent = String(reviewRowCount);
      reviewCount.closest('.summary-item')?.classList.toggle('has-review', reviewRowCount > 0);
    }
    if (reviewAlert) reviewAlert.hidden = reviewRowCount === 0;
    if (reviewAlertTitle && reviewRowCount > 0) {
      const numbers = getPendingReviewRowNumbers();
      const visible = numbers.slice(0, 8).join(', ');
      const remaining = Math.max(0, numbers.length - 8);
      reviewAlertTitle.textContent = `Wajib diperiksa pada No. ${visible}${remaining ? ` dan ${remaining} nomor lainnya` : ''}`;
    }
    if (openReviewButton) {
      openReviewButton.disabled = reviewInputCount === 0;
      const first = getReviewInputs()[0];
      openReviewButton.textContent = first ? `Buka ${getReviewLocation(first).label}` : 'Buka koreksi';
    }
    if (locationBadge && !getActivePendingReviewInput()) locationBadge.hidden = true;
    updateReviewActionState();
    if (reviewCursor >= reviewInputCount) reviewCursor = -1;

    applyMandatoryReviewMode(reviewInputCount, getOutsideBatamRows().length);
    scheduleMandatoryReviewFocus(reviewInputCount);

    return { reviewRowCount, reviewInputCount };
  }

  function getActivePendingReviewInput() {
    if (activeReviewEditor?.isConnected && activeReviewEditor.dataset.reviewPending === 'true') {
      return activeReviewEditor;
    }
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && focused.dataset.reviewPending === 'true') {
      activeReviewEditor = focused;
      return focused;
    }
    return null;
  }

  function updateReviewActionState() {
    const button = document.getElementById('completeReviewButton');
    const hint = document.getElementById('reviewActionHint');
    const locationBadge = document.getElementById('reviewLocationBadge');
    const active = getActivePendingReviewInput();

    document.querySelectorAll('#resultTable .is-active-review-editor').forEach(input => {
      if (input !== active) input.classList.remove('is-active-review-editor');
    });

    if (!active) {
      if (button) {
        button.disabled = true;
        button.textContent = '✓ Tandai selesai & lanjut';
      }
      if (hint) hint.textContent = 'Pilih bagian bertanda kuning. Nomor urutnya akan selalu ditampilkan di sini dan pada kolom NO yang tetap terlihat.';
      if (locationBadge) locationBadge.hidden = true;
      return;
    }

    active.classList.add('is-active-review-editor');
    const location = getReviewLocation(active);
    if (locationBadge) { locationBadge.textContent = location.label; locationBadge.hidden = false; }
    const currentValue = String(active.value ?? '').trim();
    const originalValue = String(active.dataset.reviewOriginal ?? '').trim();
    const requiresChange = active.dataset.reviewRequiresChange !== 'false';
    const changed = currentValue !== '' && currentValue !== originalValue;
    const markerStillPresent = typeof window.containsReviewMarker === 'function'
      ? window.containsReviewMarker(currentValue)
      : /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(currentValue);
    const canConfirm = currentValue !== '' && !markerStillPresent && (changed || !requiresChange);
    active.dataset.reviewDirty = String(changed);
    active.classList.toggle('is-review-dirty', changed);

    if (button) {
      button.disabled = !canConfirm;
      if (!currentValue) button.textContent = 'Isi koreksi dahulu';
      else if (!changed && requiresChange) button.textContent = 'Ubah teks terlebih dahulu';
      else if (markerStillPresent) button.textContent = 'Hapus “perlu dicek” dahulu';
      else if (!changed) button.textContent = '✓ Konfirmasi benar & lanjut';
      else button.textContent = '✓ Simpan koreksi & lanjut';
    }
    if (hint) {
      if (!currentValue) {
        hint.textContent = `${location.label}: kolom tidak boleh kosong. Masukkan hasil koreksi yang benar.`;
      } else if (!changed && requiresChange) {
        hint.textContent = `${location.label}: silakan ubah teks yang meragukan. Mengetik tidak akan memindahkan fokus.`;
      } else if (markerStillPresent) {
        hint.textContent = `${location.label}: frasa “perlu dicek” masih ada. Ganti atau hapus frasa tersebut terlebih dahulu.`;
      } else if (!changed) {
        hint.textContent = `${location.label}: ${location.reason || 'AI meminta bagian ini diperiksa.'} Jika sudah benar, klik konfirmasi.`;
      } else {
        hint.textContent = `${location.label}: perubahan siap disimpan. Klik tombol untuk menandai selesai dan lanjut.`;
      }
    }
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
  window.refreshOutsideBatamState = refreshOutsideBatamState;
  window.refreshReviewState = refreshReviewState;
  window.updateReviewActionState = updateReviewActionState;
  window.alert = message => showToast(message, /gagal|wajib|tidak ada|error|format|perlu dicek|koreksi/i.test(String(message)) ? 'error' : 'info');

  window.focusCurrentOutsideBatamIssue = function focusCurrentOutsideBatamIssue() {
    const row = getCurrentOutsideBatamRow();
    if (!row) return showToast('Tidak ada lagi alamat luar Kota Batam yang menunggu keputusan.', 'success');
    row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    window.setTimeout(() => {
      const addressInput = row.querySelector('.val-address');
      addressInput?.focus({ preventScroll: true });
      addressInput?.select?.();
    }, 260);
  };

  window.keepCurrentOutsideBatamIssue = function keepCurrentOutsideBatamIssue() {
    const row = getCurrentOutsideBatamRow();
    if (!row) return showToast('Tidak ada alamat luar Kota Batam yang menunggu keputusan.', 'success');
    if (typeof window.keepOutsideBatamRow !== 'function') return showToast('Fungsi keputusan alamat belum tersedia.', 'error');
    window.keepOutsideBatamRow(row.dataset.fileId, row.dataset.rowId);
  };

  window.deleteCurrentOutsideBatamIssue = function deleteCurrentOutsideBatamIssue() {
    const row = getCurrentOutsideBatamRow();
    if (!row) return showToast('Tidak ada alamat luar Kota Batam yang menunggu keputusan.', 'success');
    if (typeof window.deleteOutsideBatamRow !== 'function') return showToast('Fungsi hapus alamat belum tersedia.', 'error');
    window.deleteOutsideBatamRow(row.dataset.fileId, row.dataset.rowId);
  };

  window.focusCurrentReviewIssue = function focusCurrentReviewIssue() {
    const inputs = getReviewInputs();
    if (!inputs.length) {
      showToast('Semua tanda “perlu dicek” sudah dikoreksi.', 'success');
      return;
    }

    const current = getActivePendingReviewInput();
    const target = current || inputs[0];
    activeReviewEditor = target;
    reviewCursor = inputs.indexOf(target);
    focusReviewInput(target, { smooth: true, select: !current });
    updateReviewActionState();
  };

  window.confirmActiveReviewCorrection = function confirmActiveReviewCorrection() {
    const input = getActivePendingReviewInput();
    if (!input) {
      showToast('Pilih terlebih dahulu bagian bertanda “perlu dicek”.', 'error');
      window.focusCurrentReviewIssue();
      return;
    }

    const before = getReviewInputs();
    const currentIndex = Math.max(0, before.indexOf(input));
    const currentValue = String(input.value ?? '').trim();
    const originalValue = String(input.dataset.reviewOriginal ?? '').trim();
    const requiresChange = input.dataset.reviewRequiresChange !== 'false';

    if (!currentValue) {
      showToast('Kolom koreksi tidak boleh kosong.', 'error');
      input.focus();
      return;
    }
    if (currentValue === originalValue && requiresChange) {
      showToast('Belum ada perubahan. Selesaikan koreksinya terlebih dahulu.', 'error');
      input.focus();
      return;
    }
    const markerStillPresent = typeof window.containsReviewMarker === 'function'
      ? window.containsReviewMarker(currentValue)
      : /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(currentValue);
    if (markerStillPresent) {
      showToast('Koreksi belum selesai. Ganti atau hapus seluruh frasa “perlu dicek”, lalu klik centang.', 'error');
      input.focus();
      selectReviewMarker(input);
      updateReviewActionState();
      return;
    }

    const result = typeof window.commitReviewCorrection === 'function'
      ? window.commitReviewCorrection(input)
      : null;
    if (!result?.resolved) {
      const message = result?.reason === 'marker-remains'
        ? 'Koreksi belum selesai karena frasa “perlu dicek” masih ada.'
        : 'Koreksi belum dapat ditandai selesai. Periksa kembali isinya.';
      showToast(message, 'error');
      input.focus();
      return;
    }

    input.classList.add('is-review-resolved');
    input.classList.remove('is-active-review-editor');
    window.setTimeout(() => input.classList.remove('is-review-resolved'), 900);
    activeReviewEditor = null;
    syncDashboard();

    const remaining = getReviewInputs();
    if (!remaining.length) {
      collapseExpandedEditor(input);
      showToast('Koreksi disimpan. Semua bagian sudah selesai.', 'success');
      updateReviewActionState();
      return;
    }

    const next = remaining[Math.min(currentIndex, remaining.length - 1)];
    activeReviewEditor = next;
    reviewCursor = remaining.indexOf(next);
    showToast(`Koreksi disimpan. Lanjut ke ${getReviewLocation(next).label}.`, 'success');
    focusReviewInput(next, { smooth: true, select: true });
    updateReviewActionState();
  };

  function syncDashboard() {
    const rowCount = getRowCount();
    const fileTotal = typeof uploadedFilesManager !== 'undefined' && Array.isArray(uploadedFilesManager) ? uploadedFilesManager.length : 0;
    const mode = document.getElementById('clientMode')?.value || 'KORPORAT';
    const insured = Boolean(document.getElementById('useInsurance')?.checked);
    const { outsideBatamCount } = refreshOutsideBatamState();
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
    const cameraPrimary = document.body.dataset.primarySource === 'camera';

    if (recordCount) recordCount.textContent = String(rowCount);
    if (fileCount) fileCount.textContent = String(fileTotal);
    if (inlineCount) inlineCount.textContent = `${fileTotal} berkas`;
    if (modeSummary) modeSummary.textContent = modeLabels[mode] || mode;
    if (insuranceSummary) insuranceSummary.textContent = insured ? 'Aktif' : 'Nonaktif';
    if (exportButton) {
      exportButton.disabled = rowCount === 0 || outsideBatamCount > 0 || reviewRowCount > 0;
      exportButton.title = outsideBatamCount > 0
        ? 'Perbaiki atau hapus semua alamat luar Kota Batam sebelum ekspor.'
        : reviewRowCount > 0
          ? 'Koreksi semua teks “perlu dicek” sebelum ekspor.'
          : '';
    }
    if (clearButton) clearButton.disabled = rowCount === 0 && fileTotal === 0;
    if (previewCard) previewCard.classList.toggle('has-data', rowCount > 0);

    if (status) {
      status.classList.remove('is-ready', 'is-busy', 'is-warning');
      if (outsideBatamCount > 0) {
        status.classList.add('is-warning');
        const nums = getOutsideBatamRows().slice(0, 4).map(row => getOutsideBatamLocation(row).rowNumber).join(', ');
        status.innerHTML = `<span class="status-dot"></span>Keputusan alamat luar Batam No. ${nums}${outsideBatamCount > 4 ? '…' : ''}`;
      } else if (reviewRowCount > 0) {
        status.classList.add('is-warning');
        const nums = getPendingReviewRowNumbers().slice(0, 4).join(', ');
        status.innerHTML = `<span class="status-dot"></span>Koreksi teks No. ${nums}${reviewRowCount > 4 ? '…' : ''}`;
      } else if (rowCount > 0) {
        status.classList.add('is-ready');
        status.innerHTML = '<span class="status-dot"></span>Siap diperiksa dan diekspor';
      } else if (typeof fileProcessQueue !== 'undefined' && fileProcessQueue?.length > 0) {
        status.classList.add('is-busy');
        status.innerHTML = `<span class="status-dot"></span>${cameraPrimary ? 'Sedang memproses hasil capture HP' : 'Sedang memproses berkas sumber'}`;
      } else {
        status.innerHTML = `<span class="status-dot"></span>${cameraPrimary ? 'Menunggu hasil capture HP' : 'Menunggu berkas sumber'}`;
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
    if (rowCount > 0 && outsideBatamCount === 0 && reviewRowCount === 0 && steps[3]) steps[3].classList.add('is-active');
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
    try { sessionStorage.removeItem('mile_camera_active'); } catch (_) {}
    document.body.classList.remove('camera-mode');
    document.getElementById('cameraSessionBanner')?.remove();
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

      // Mengetik hanya mengubah isi dan indikator visual. Status koreksi tidak pernah
      // diselesaikan otomatis melalui input, blur, Enter, atau perpindahan kolom.
      if (input.dataset.reviewPending === 'true') {
        activeReviewEditor = input;
        const changed = String(input.value ?? '').trim() !== String(input.dataset.reviewOriginal ?? '').trim();
        input.dataset.reviewDirty = String(changed);
        input.classList.toggle('is-review-dirty', changed);
        updateReviewActionState();
      }

      syncDashboard();
      if (input === activeExpandedEditor) expandTableEditor(activeExpandedEditor);
    });

    resultTable?.addEventListener('focusin', event => {
      const input = event.target.closest?.('.table-input');
      if (!input) return;
      expandTableEditor(input);
      if (input.dataset.reviewPending === 'true') {
        activeReviewEditor = input;
        updateReviewActionState();
      }
    });

    resultTable?.addEventListener('focusout', event => {
      const input = event.target.closest?.('input');
      if (!input) return;
      if (input.matches('.table-input')) collapseExpandedEditor(input);
      // Sengaja tidak ada commit di sini. Pengguna wajib menekan tombol centang.
      updateReviewActionState();
    });

    resultTable?.addEventListener('keydown', event => {
      if (event.key === 'Escape' && event.target === activeExpandedEditor) {
        collapseExpandedEditor(activeExpandedEditor);
      }
      // Enter tidak menyelesaikan koreksi dan tidak memindahkan fokus.
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.dataset.reviewPending === 'true') {
        event.preventDefault();
        updateReviewActionState();
        showToast('Setelah koreksi selesai, klik tombol centang “Tandai selesai & lanjut”.', 'info');
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

    if (typeof XLSX === 'undefined' && !document.body.classList.contains('camera-mode')) {
      showToast('Library spreadsheet gagal dimuat. Muat ulang halaman dan periksa koneksi internet.', 'error');
    }
  });
})();
