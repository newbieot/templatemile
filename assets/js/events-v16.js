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
  byId('tempoBankSyariahTariff')?.addEventListener('change', () => invoke('handleTempoBankSyariahChange'));
  byId('useInsurance')?.addEventListener('change', () => invoke('updateInterface'));

  const fileInput = byId('excelInput');
  byId('dropzone')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => invoke('handleFileSelection', fileInput.files));

  byId('clearDataButton')?.addEventListener('click', () => invoke('clearWorkspaceData'));
  byId('applyBulkPdfReference')?.addEventListener('click', () => invoke('applyPdfReferenceToAllRows'));
  byId('clearBulkPdfReference')?.addEventListener('click', () => invoke('clearPdfReferenceForAllRows'));
  byId('openOutsideBatamButton')?.addEventListener('click', () => invoke('focusCurrentOutsideBatamIssue'));
  byId('keepOutsideBatamButton')?.addEventListener('click', () => invoke('keepCurrentOutsideBatamIssue'));
  byId('deleteOutsideBatamButton')?.addEventListener('click', () => invoke('deleteCurrentOutsideBatamIssue'));
  byId('openReviewButton')?.addEventListener('click', () => invoke('focusCurrentReviewIssue'));
  byId('completeReviewButton')?.addEventListener('click', () => invoke('confirmActiveReviewCorrection'));
  byId('exportButton')?.addEventListener('click', () => invoke('downloadFinalExcel'));

  document.querySelector('[data-action="skip-mapping"]')?.addEventListener('click', () => invoke('skipCurrentMapping'));
  document.querySelector('[data-action="apply-mapping"]')?.addEventListener('click', () => invoke('applyMappingAndProcess'));
  document.querySelector('[data-action="cancel-weight"]')?.addEventListener('click', () => invoke('cancelWeightInput'));
  document.querySelector('[data-action="save-weight"]')?.addEventListener('click', () => invoke('saveWeightsAndProcess'));

  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'delete-file') invoke('deleteFileFromQueue', button.dataset.fileId);
    else if (action === 'delete-row') invoke('deleteDataRow', button.dataset.fileId, button.dataset.rowId);
    else if (action === 'keep-outside-batam') invoke('keepOutsideBatamRow', button.dataset.fileId, button.dataset.rowId);
    else if (action === 'delete-outside-batam') invoke('deleteOutsideBatamRow', button.dataset.fileId, button.dataset.rowId);
  });
})();
