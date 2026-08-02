(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const invoke = (name, ...args) => {
    const fn = window[name];
    if (typeof fn === 'function') return fn(...args);
    console.error(`Fungsi ${name} belum tersedia.`);
  };

  byId('clientMode')?.addEventListener('change', () => invoke('handleModeChange'));
  byId('corporateTemplate')?.addEventListener('change', () => invoke('handleTemplateChange'));
  byId('useInsurance')?.addEventListener('change', () => invoke('updateInterface'));

  const fileInput = byId('excelInput');
  byId('dropzone')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => invoke('handleFileSelection', fileInput.files));

  byId('clearDataButton')?.addEventListener('click', () => invoke('clearWorkspaceData'));
  byId('applyBulkPdfReference')?.addEventListener('click', () => invoke('applyPdfReferenceToAllRows'));
  byId('clearBulkPdfReference')?.addEventListener('click', () => invoke('clearPdfReferenceForAllRows'));
  byId('openReviewButton')?.addEventListener('click', () => invoke('focusCurrentReviewIssue'));
  byId('completeReviewButton')?.addEventListener('click', () => invoke('confirmActiveReviewCorrection'));
  byId('exportButton')?.addEventListener('click', () => invoke('downloadFinalExcel'));

  document.querySelector('[data-action="skip-mapping"]')?.addEventListener('click', () => invoke('skipCurrentMapping'));
  document.querySelector('[data-action="apply-mapping"]')?.addEventListener('click', () => invoke('applyMappingAndProcess'));
  document.querySelector('[data-action="cancel-weight"]')?.addEventListener('click', () => invoke('cancelWeightInput'));
  document.querySelector('[data-action="save-weight"]')?.addEventListener('click', () => invoke('saveWeightsAndProcess'));
})();
