(() => {
  'use strict';

  const modeLabels = {
    KORPORAT: 'Korporat',
    RITEL: 'Ritel',
    PINDAH: 'Barang pindah'
  };

  // Kalender operasional Pengadilan Negeri Batam.
  // Sumber 2026: SKB 3 Menteri Nomor 1497/2025, 2/2025, dan 5/2025.
  // Libur nasional dan cuti bersama sama-sama diperlakukan sebagai hari non-operasional.
  const pnBatamNonWorkingDays = Object.freeze({
    '2026-01-01': 'Tahun Baru 2026 Masehi',
    '2026-01-16': 'Isra Mikraj Nabi Muhammad SAW',
    '2026-02-16': 'Cuti bersama Tahun Baru Imlek',
    '2026-02-17': 'Tahun Baru Imlek 2577 Kongzili',
    '2026-03-18': 'Cuti bersama Hari Suci Nyepi',
    '2026-03-19': 'Hari Suci Nyepi',
    '2026-03-20': 'Cuti bersama Idulfitri 1447 H',
    '2026-03-21': 'Idulfitri 1447 H',
    '2026-03-22': 'Idulfitri 1447 H',
    '2026-03-23': 'Cuti bersama Idulfitri 1447 H',
    '2026-03-24': 'Cuti bersama Idulfitri 1447 H',
    '2026-04-03': 'Wafat Yesus Kristus',
    '2026-04-05': 'Kebangkitan Yesus Kristus (Paskah)',
    '2026-05-01': 'Hari Buruh Internasional',
    '2026-05-14': 'Kenaikan Yesus Kristus',
    '2026-05-15': 'Cuti bersama Kenaikan Yesus Kristus',
    '2026-05-27': 'Iduladha 1447 H',
    '2026-05-28': 'Cuti bersama Iduladha 1447 H',
    '2026-05-31': 'Hari Raya Waisak 2570 BE',
    '2026-06-01': 'Hari Lahir Pancasila',
    '2026-06-16': '1 Muharam 1448 H',
    '2026-08-17': 'Proklamasi Kemerdekaan',
    '2026-08-25': 'Maulid Nabi Muhammad SAW',
    '2026-12-24': 'Cuti bersama Kelahiran Yesus Kristus',
    '2026-12-25': 'Kelahiran Yesus Kristus'
  });

  const pnBatamConfiguredYears = new Set(['2026']);
  let lastPnBatamCalendarDate = '';

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

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addLocalDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12, 0, 0, 0);
  }

  function formatIndonesianDate(date) {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function getPnBatamServiceDecision(date = new Date()) {
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    const tomorrow = addLocalDays(localDate, 1);
    const dateKey = localDateKey(localDate);
    const tomorrowKey = localDateKey(tomorrow);
    const weekday = localDate.getDay();
    const calendarConfigured = pnBatamConfiguredYears.has(String(localDate.getFullYear()));

    let code = weekday >= 1 && weekday <= 4 ? 'PE' : 'PKH';
    let reason = weekday >= 1 && weekday <= 4
      ? 'Senin–Kamis menggunakan PE.'
      : weekday === 5
        ? 'Hari Jumat menggunakan PKH.'
        : 'Akhir pekan menggunakan PKH.';

    if (pnBatamNonWorkingDays[dateKey]) {
      code = 'PKH';
      reason = `Hari ini merupakan ${pnBatamNonWorkingDays[dateKey]}.`;
    } else if (pnBatamNonWorkingDays[tomorrowKey]) {
      code = 'PKH';
      reason = `H-1 ${pnBatamNonWorkingDays[tomorrowKey]} (${formatIndonesianDate(tomorrow)}).`;
    }

    if (!calendarConfigured) {
      reason += ` Kalender libur ${localDate.getFullYear()} belum dikonfigurasi; aturan hari kerja tetap diterapkan.`;
    }

    return {
      code,
      reason,
      dateKey,
      dateLabel: formatIndonesianDate(localDate),
      calendarConfigured,
      holidayToday: pnBatamNonWorkingDays[dateKey] || '',
      holidayTomorrow: pnBatamNonWorkingDays[tomorrowKey] || ''
    };
  }

  function isPnBatamSelected() {
    return document.getElementById('clientMode')?.value === 'KORPORAT'
      && document.getElementById('corporateTemplate')?.value === 'PN_BATAM';
  }

  function getPnBatamServiceHint() {
    const serviceSelect = document.getElementById('serviceCode');
    const formGroup = serviceSelect?.closest('.form-group');
    if (!formGroup) return null;

    let hint = document.getElementById('pnBatamServiceHint');
    if (!hint) {
      hint = document.createElement('span');
      hint.id = 'pnBatamServiceHint';
      hint.className = 'field-hint';
      hint.setAttribute('aria-live', 'polite');
      formGroup.appendChild(hint);
    }
    return hint;
  }

  function applyPnBatamServiceDefault({ force = false, announce = false } = {}) {
    const serviceSelect = document.getElementById('serviceCode');
    const hint = getPnBatamServiceHint();
    if (!serviceSelect) return null;

    const active = isPnBatamSelected();
    if (hint) hint.hidden = !active;
    if (!active) {
      serviceSelect.removeAttribute('title');
      serviceSelect.dataset.pnBatamActive = 'false';
      return null;
    }

    const decision = getPnBatamServiceDecision(new Date());
    const calendarDateChanged = serviceSelect.dataset.pnBatamAutoDate !== decision.dateKey;
    const manuallyOverridden = serviceSelect.dataset.pnBatamManualOverride === 'true';

    if (force || calendarDateChanged || !manuallyOverridden) {
      serviceSelect.value = decision.code;
      serviceSelect.dataset.pnBatamManualOverride = 'false';
      serviceSelect.dataset.pnBatamAutoDate = decision.dateKey;
    }

    serviceSelect.dataset.pnBatamActive = 'true';
    serviceSelect.title = `Default otomatis PN Batam: ${decision.code}. ${decision.reason}`;
    if (hint) {
      hint.textContent = `Default otomatis PN Batam: ${decision.code} — ${decision.reason}`;
    }

    lastPnBatamCalendarDate = decision.dateKey;
    if (announce) showToast(`Kode layanan PN Batam otomatis ${decision.code}. ${decision.reason}`, 'success');
    return decision;
  }

  window.getPnBatamServiceDecision = getPnBatamServiceDecision;
  window.applyPnBatamServiceDefault = applyPnBatamServiceDefault;

  const coreHandleTemplateChange = window.handleTemplateChange;
  if (typeof coreHandleTemplateChange === 'function') {
    window.handleTemplateChange = function enhancedHandleTemplateChange() {
      const result = coreHandleTemplateChange.apply(this, arguments);
      applyPnBatamServiceDefault({ force: true });
      return result;
    };
  }

  const coreHandleModeChange = window.handleModeChange;
  if (typeof coreHandleModeChange === 'function') {
    window.handleModeChange = function enhancedHandleModeChange() {
      const result = coreHandleModeChange.apply(this, arguments);
      applyPnBatamServiceDefault({ force: true });
      return result;
    };
  }

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

    document.getElementById('corporateTemplate')?.addEventListener('change', () => {
      window.setTimeout(() => applyPnBatamServiceDefault({ force: true }), 0);
    });

    document.getElementById('clientMode')?.addEventListener('change', () => {
      window.setTimeout(() => applyPnBatamServiceDefault({ force: true }), 0);
    });

    document.getElementById('serviceCode')?.addEventListener('change', event => {
      if (isPnBatamSelected() && event.isTrusted) {
        event.currentTarget.dataset.pnBatamManualOverride = 'true';
      }
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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isPnBatamSelected()) return;
    const todayKey = localDateKey(new Date());
    if (todayKey !== lastPnBatamCalendarDate) {
      applyPnBatamServiceDefault({ force: true, announce: true });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    trackFieldChanges();
    improveModalFocus();
    applyPnBatamServiceDefault({ force: true });
    window.setTimeout(syncDashboard, 0);

    if (typeof XLSX === 'undefined') {
      showToast('Library spreadsheet gagal dimuat. Muat ulang halaman dan periksa koneksi internet.', 'error');
    }
  });
})();
