const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cameraCore = require(path.join(root, 'assets/js/camera-core.js'));
const pdfjs = require(path.join(root, 'assets/vendor/pdfjs/pdf.min.js'));
pdfjs.GlobalWorkerOptions.workerSrc = path.join(root, 'assets/vendor/pdfjs/pdf.worker.min.js');

function syntheticDocument(width = 320, height = 180) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    data[offset] = 30;
    data[offset + 1] = 38;
    data[offset + 2] = 52;
    data[offset + 3] = 255;
  }
  for (let y = 28; y < 154; y++) {
    for (let x = 48; x < 274; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = 238;
      data[offset + 1] = 238;
      data[offset + 2] = 232;
    }
  }
  for (let line = 0; line < 8; line++) {
    const y = 58 + line * 9;
    for (let x = 82; x < 238 - line * 4; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = 35;
      data[offset + 1] = 35;
      data[offset + 2] = 35;
    }
  }
  return { data, width, height };
}

assert.equal(cameraCore.fixedGuideBounds, undefined);
assert.equal(cameraCore.detectDocumentBounds, undefined);
assert.ok(cameraCore.calculateSharpness(syntheticDocument()) > 58);
assert.equal(cameraCore.validateImageQuality({ imageData: syntheticDocument(), width: 1200, height: 800 }).ok, true);

const flatFrame = value => {
  const width = 120;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { data, width, height };
};
assert.equal(cameraCore.validateImageQuality({ imageData: flatFrame(20), width: 1200, height: 800 }).code, 'dark');
assert.equal(cameraCore.validateImageQuality({ imageData: flatFrame(250), width: 1200, height: 800 }).code, 'bright');
assert.equal(cameraCore.validateImageQuality({ imageData: flatFrame(128), width: 1200, height: 800 }).code, 'blur');
assert.equal(cameraCore.validateImageQuality({ imageData: syntheticDocument(), width: 640, height: 360 }).code, 'resolution');

async function runAsyncAssertions() {
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  const pdf = await cameraCore.buildJpegPdf([
    { blob: jpeg, width: 1200, height: 800 },
    { blob: jpeg, width: 800, height: 1200 }
  ]);
  assert.equal(pdf.type, 'application/pdf');
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /\/Count 2/);
  assert.equal((text.match(/\/Subtype \/Image/g) || []).length, 2);
  assert.equal((text.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.match(text, /xref\n0 9\n/);
  assert.match(text, /startxref\n\d+\n%%EOF/);
  const parsedPdf = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
  assert.equal(parsedPdf.numPages, 2);
  await parsedPdf.destroy();

  const cameraHtml = fs.readFileSync(path.join(root, 'camera.html'), 'utf8');
  const cameraRuntime = fs.readFileSync(path.join(root, 'assets/js/camera.js'), 'utf8');
  const cameraCoreSource = fs.readFileSync(path.join(root, 'assets/js/camera-core.js'), 'utf8');
  const cameraCss = fs.readFileSync(path.join(root, 'assets/css/camera.css'), 'utf8');
  const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
  const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
  assert.match(cameraRuntime, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(cameraHtml, /Finish Capturing/);
  assert.match(cameraHtml, /id="deviceNameSetup" hidden/);
  assert.match(cameraHtml, /id="cameraPreviewFullscreenButton"/);
  assert.doesNotMatch(cameraHtml, /id="aiModelSelect"|Model AI \(Vision\)/);
  assert.doesNotMatch(cameraHtml, /id="cameraDevice"|<label for="cameraDevice">Kamera<\/label>/);
  assert.match(cameraRuntime, /const DEFAULT_AI_MODEL = 'gemini-3\.8-flash'/);
  assert.match(cameraRuntime, /DEVICE_NAME_STORAGE_KEY = 'mile_camera_device_name'/);
  assert.match(cameraRuntime, /deviceNameSetup\.hidden = Boolean\(savedDeviceName\)/);
  assert.doesNotMatch(cameraRuntime, /enumerateDevices|populateCameras/);
  assert.match(cameraRuntime, /facingMode: \{ ideal: 'environment' \}/);
  assert.doesNotMatch(cameraRuntime, /aspectRatio: \{ ideal:/);
  const cameraPhoto = fs.readFileSync(path.join(root, 'assets/js/camera-photo.js'), 'utf8');
  assert.match(cameraPhoto, /advanced: \[\{ focusMode: 'continuous' \}, \{ zoom: 1 \}\]/);
  assert.match(cameraRuntime, /capabilities\.zoom/);
  assert.match(cameraRuntime, /const FOCUS_RESET_DELAY_MS = 650/);
  assert.match(cameraRuntime, /function focusCameraAt/);
  assert.match(cameraRuntime, /function enableContinuousAutofocus/);
  assert.match(cameraRuntime, /function scheduleContinuousAutofocus/);
  assert.match(cameraRuntime, /track\.addEventListener\?\.\('unmute'/);
  assert.match(cameraRuntime, /data-autofocus', 'continuous'/);
  assert.match(cameraRuntime, /focusMode: requestedMode/);
  assert.match(cameraRuntime, /addEventListener\('pointerdown', focusCameraAt\)/);
  assert.match(cameraHtml, /id="cameraFocusIndicator"/);
  assert.doesNotMatch(cameraHtml, /id="captureFrameGuide"/);
  assert.match(cameraCss, /\.camera-focus-indicator/);
  assert.doesNotMatch(cameraCss, /\.camera-frame-guide/);
  assert.match(cameraCss, /\.camera-stage video\{[^}]*object-fit:contain/);
  assert.doesNotMatch(cameraCss, /\.camera-stage video\{[^}]*object-fit:cover/);
  assert.doesNotMatch(cameraRuntime, /videoDisplayRect/);
  assert.match(cameraRuntime, /requestFullscreen/);
  assert.match(cameraRuntime, /cameraPreviewFullscreenButton/);
  assert.doesNotMatch(cameraRuntime, /requestCameraFullscreen/);
  const startCameraSource = cameraRuntime.slice(
    cameraRuntime.indexOf('async function startCamera()'),
    cameraRuntime.indexOf('async function requestWakeLock()')
  );
  assert.ok(startCameraSource.indexOf('enterFullscreenMode();') < startCameraSource.indexOf('await draftRestorePromise;'));
  assert.match(cameraRuntime, /orientationchange/);
  assert.match(cameraRuntime, /matchMedia\?\.\('\(orientation: landscape\)'\)/);
  assert.match(cameraRuntime, /dataset\.cameraOrientation/);
  assert.match(cameraRuntime, /dataset\.frameOrientation/);
  assert.match(cameraRuntime, /dataset\.previewRotation/);
  assert.match(cameraRuntime, /function currentCaptureRotation/);
  assert.doesNotMatch(cameraRuntime, /captureFrameRatios|cropWidth|cropX|captureFrameGuide/);
  assert.match(cameraRuntime, /outputContext\.rotate\(captureRotation \* Math\.PI \/ 180\)/);
  assert.match(cameraRuntime, /orientationSyncTimer/);
  assert.match(cameraRuntime, /startPhysicalOrientationTracking/);
  assert.match(cameraRuntime, /DeviceMotionEvent/);
  assert.match(cameraRuntime, /accelerationIncludingGravity/);
  assert.match(cameraRuntime, /orientationCandidateCount < 3/);
  assert.match(cameraRuntime, /dataset\.orientationSource/);
  assert.match(cameraRuntime, /stage\.dataset\.previewRotation = '0'/);
  assert.doesNotMatch(cameraRuntime, /core\.previewGuideLayout/);
  assert.match(cameraHtml, /<video[^>]*id="cameraPreview"[^>]*><\/video>\s*<div class="camera-view"/);
  assert.doesNotMatch(cameraCss, /camera-video-rotation/);
  assert.match(headers, /accelerometer=\(self\)/);
  assert.match(headers, /gyroscope=\(self\)/);
  assert.match(cameraRuntime, /scheduleContinuousAutofocus\(stream\?\.getVideoTracks/);
  assert.match(cameraCss, /is-fullscreen\[data-orientation="landscape"\]/);
  assert.match(cameraCss, /camera-view-rotation/);
  assert.match(cameraCss, /camera-stage\.is-fullscreen video\{[^}]*object-fit:contain;transform:none/);
  assert.match(cameraRuntime, /ensureSession\(\);/);
  assert.doesNotMatch(cameraRuntime, /await ensureSession\(\);/);
  assert.match(cameraPhoto, /frameRate: \{ ideal: 24, max: 30 \}/);
  assert.match(cameraRuntime, /const MAX_IMAGE_BYTES = 120 \* 1000/);
  assert.match(cameraRuntime, /const OUTPUT_MAX_SIDE = 1280/);
  assert.match(cameraRuntime, /const OUTPUT_MAX_PIXELS = 1280 \* 720/);
  assert.doesNotMatch(cameraRuntime, /LOW_END_OUTPUT_MAX_SIDE/);
  assert.match(cameraHtml, /camera-photo\.js/);
  assert.match(cameraRuntime, /photo\.previewConstraints\(\)/);
  assert.doesNotMatch(cameraRuntime, /stillCamera|ImageCapture|crop/);
  assert.match(cameraPhoto, /const PHOTO_MAX_SIDE = 1280/);
  assert.match(cameraPhoto, /const PHOTO_MAX_PIXELS = 1280 \* 720/);
  assert.match(cameraPhoto, /'image\/jpeg', quality/);
  assert.match(cameraRuntime, /drawImage\(video, 0, 0, sourceWidth, sourceHeight, 0, 0, renderWidth, renderHeight\)/);
  assert.doesNotMatch(cameraRuntime, /scheduleLiveDetection/);
  assert.doesNotMatch(cameraRuntime, /detectDocumentBounds/);
  assert.doesNotMatch(cameraRuntime, /cameraAnalysisCanvas/);
  assert.doesNotMatch(cameraRuntime, /fixedGuideBounds|renderFixedGuide|cropBounds/);
  assert.doesNotMatch(cameraHtml, /id="cropGuide"|id="cropStatus"/);
  assert.doesNotMatch(cameraCss, /\.crop-guide|\.crop-status/);
  assert.match(cameraRuntime, /drawImage\(video, 0, 0, sourceWidth, sourceHeight, 0, 0, renderWidth, renderHeight\)/);
  assert.doesNotMatch(cameraRuntime, /sourceCanvas\.getContext\('2d'\)\.drawImage\(video/);
  assert.doesNotMatch(cameraRuntime, /yieldForPaint/);
  assert.match(cameraRuntime, /const MAX_PENDING_CAPTURE_FRAMES = constrainedDevice \? 3 : 5/);
  assert.match(cameraRuntime, /pendingCaptureQueue\.push\(/);
  assert.match(cameraRuntime, /void processCaptureQueue\(\)/);
  const shutterHandlerSource = cameraRuntime.slice(
    cameraRuntime.indexOf('function captureImage()'),
    cameraRuntime.indexOf('async function processCaptureQueue()')
  );
  assert.doesNotMatch(shutterHandlerSource, /if \(captureBusy/);
  assert.doesNotMatch(shutterHandlerSource, /setCaptureDisabled\(true\)/);
  assert.match(cameraRuntime, /setCaptureDisabled\(!stream \|\| !sessionId \|\| finalizingBatch \|\| galleryOpen \|\| captures\.length \+ pendingCaptureCount >= MAX_CAPTURES\)/);
  assert.match(cameraRuntime, /DRAFT_SAVE_DELAY_MS = 2400/);
  assert.match(cameraRuntime, /requestIdleCallback/);
  assert.match(cameraRuntime, /cancelScheduledDraftSave/);
  assert.doesNotMatch(cameraCoreSource, /detectByBackground|detectByEdges|detectDocumentBounds/);
  assert.doesNotMatch(cameraRuntime, /detection:/);
  assert.match(cameraRuntime, /validateImageQuality/);
  assert.doesNotMatch(cameraHtml, /Start Capture Session/);
  assert.doesNotMatch(cameraRuntime, /Foto kurang jelas, silakan ulangi capture\./);
  assert.match(cameraHtml, /captureButtonFullscreen/);
  assert.match(cameraHtml, /finishCaptureButtonFullscreen/);
  assert.match(cameraHtml, /reviewCapturesButtonFullscreen/);
  assert.match(cameraHtml, /id="cameraCaptureGallery"/);
  assert.match(cameraHtml, /id="deleteCaptureFromGallery"/);
  assert.match(cameraHtml, /id="retakeCaptureFromGallery"/);
  assert.match(cameraHtml, /id="continueCaptureFromGallery"/);
  assert.match(cameraHtml, /id="cameraFlash"/);
  assert.match(cameraHtml, /id="cameraHudToast"/);
  assert.match(cameraRuntime, /playShutterSound/);
  assert.match(cameraRuntime, /showHudToast/);
  assert.match(cameraRuntime, /setFinishDisabled/);
  assert.match(cameraCss, /\.camera-stage\.is-fullscreen/);
  assert.match(cameraCss, /\.camera-open-button\{[^}]*linear-gradient/);
  assert.match(cameraCss, /\.camera-preview-fullscreen/);
  assert.match(cameraCss, /\.camera-flash/);
  assert.match(cameraCss, /\.camera-hud-toast/);
  assert.doesNotMatch(cameraCss, /will-change:left,top,width,height/);
  assert.doesNotMatch(cameraRuntime, /GUIDE_ANIMATION_MS|GUIDE_FRAME_MS|liveDetection/);
  assert.match(cameraRuntime, /camera-low-power/);
  assert.match(cameraRuntime, /const width = Math\.min\(240, canvas\.width\)/);
  assert.doesNotMatch(cameraRuntime, /Math\.pow\(1 - progress, 3\)/);
  assert.doesNotMatch(cameraCss, /0 0 0 999px/);
  assert.match(cameraCss, /camera-low-power \.camera-hud-toast/);
  assert.match(cameraCss, /\.camera-fullscreen-finish/);
  assert.match(cameraCss, /camera-capture-button--fullscreen\{flex:1 1 auto;min-width:0;min-height:64px/);
  assert.match(cameraCss, /camera-fullscreen-finish\{flex:0 0 92px;width:92px;min-height:48px;align-self:flex-end/);
  assert.match(cameraCss, /camera-fullscreen-bottom-dock\{display:none;[^{]*grid-template-columns:minmax\(0,1fr\) 92px/);
  assert.match(cameraCss, /camera-fullscreen-bottom-dock\{display:grid!important\}/);
  assert.match(cameraCss, /\.camera-capture-gallery/);
  assert.match(cameraCss, /env\(safe-area-inset-bottom\)/);
  assert.match(cameraRuntime, /function openCaptureGallery/);
  assert.match(cameraRuntime, /function retakeCaptureFromGallery/);
  assert.match(cameraRuntime, /retakeSlotIndex/);
  assert.match(cameraRuntime, /createThumbnailBlob/);
  assert.match(cameraRuntime, /queueDraftSave/);
  assert.match(cameraRuntime, /restoreLatestDraft/);
  assert.doesNotMatch(cameraRuntime, /if \(stream\) startCamera\(\);/);
  assert.match(cameraRuntime, /captureId:/);
  assert.match(cameraRuntime, /sessionId,/);
  assert.match(cameraRuntime, /timestamp,/);
  assert.match(cameraHtml, /camera-action-dock/);
  assert.match(cameraHtml, /id="finishCaptureButton"/);
  assert.doesNotMatch(cameraHtml, /id="enterFullscreenButton"/);
  assert.match(cameraHtml, /id="cameraPreviewFullscreenButton"/);
  assert.match(cameraCss, /\.camera-action-dock/);
  assert.match(cameraRuntime, /inputFormat: 'direct-image'/);
  assert.match(cameraRuntime, /const images = captures\.map/);
  assert.doesNotMatch(cameraRuntime, /await core\.buildJpegPdf\(captures\)/);
  assert.match(cameraRuntime, /window\.location\.assign\(`\/review\?cameraSession=\${encodeURIComponent\(sessionId\)}`\);/);

  const reviewHtml = fs.readFileSync(path.join(root, 'review.html'), 'utf8');
  assert.match(reviewHtml, /assets\/css\/review\.css/);
  assert.match(reviewHtml, /ai-pdf-beta-r2\.js/);
  assert.match(reviewHtml, /camera-import-v2\.js/);
  assert.match(reviewHtml, /Foto diproses per 7 gambar\/request, hingga 7 permintaan paralel/);
  assert.match(reviewHtml, /id="aiProgressModal"/);
  assert.match(reviewHtml, /id="aiProgressStep"/);
  assert.match(reviewHtml, /id="aiProgressMessage"/);
  assert.match(reviewHtml, /id="aiTransferStatus"/);
  assert.match(reviewHtml, /id="resultTable"/);
  assert.match(reviewHtml, /id="corporateTemplate"/);
  assert.match(reviewHtml, /vendor-loader\.js/);
  assert.doesNotMatch(reviewHtml, /<script src="\/assets\/vendor\/sheetjs\/xlsx\.full\.min\.js/);
  assert.doesNotMatch(reviewHtml, /<script src="\/assets\/vendor\/pdfjs\/pdf\.min\.js/);
  const vendorLoader = fs.readFileSync(path.join(root, 'assets/js/vendor-loader.js'), 'utf8');
  assert.match(vendorLoader, /loadSheetJs/);
  assert.match(vendorLoader, /loadPdfJs/);
  assert.match(worker, /url\.pathname === '\/review'/);

  const cameraImport = fs.readFileSync(path.join(root, 'assets/js/camera-import-v2.js'), 'utf8');
  const aiBeta = fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8');
  assert.match(cameraImport, /activateCameraMode/);
  assert.match(cameraImport, /camera-session-banner/);
  assert.match(cameraImport, /camera-mode/);
  assert.match(cameraImport, /startsWith\('\/review'\)/);
  assert.match(cameraImport, /window\.location\.replace\(`\/review\?cameraSession=/);
  assert.match(cameraImport, /ai\.processCameraImages\(session\.images/);
  assert.match(cameraImport, /Compatibility path untuk sesi lama/);
  assert.match(cameraImport, /let reviewWakeLock = null/);
  assert.match(cameraImport, /navigator\.wakeLock\.request\('screen'\)/);
  assert.match(cameraImport, /aiProcessingActive/);
  assert.match(cameraImport, /cameraImportRunning/);
  assert.match(cameraImport, /visibilitychange/);
  const directProcessIndex = cameraImport.indexOf('const runMetrics = await ai.processCameraImages');
  const directCleanIndex = cameraImport.indexOf('const reviewUrl =', directProcessIndex);
  assert.ok(directProcessIndex >= 0 && directCleanIndex > directProcessIndex, 'URL sesi harus dipertahankan sampai AI selesai');

  const reviewCss = fs.readFileSync(path.join(root, 'assets/css/review.css'), 'utf8');
  assert.match(reviewCss, /\.camera-session-banner/);
  assert.match(reviewCss, /#resultTable tbody tr\.outside-batam/);
  assert.match(reviewCss, /#resultTable tbody tr\.needs-review/);

  // Camera sync to server
  const cameraSync = fs.readFileSync(path.join(root, 'assets/js/camera-sync.js'), 'utf8');
  const appCore = fs.readFileSync(path.join(root, 'assets/js/app-core.js'), 'utf8');
  const uiRuntime = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
  assert.match(cameraSync, /saveBatchResults/);
  assert.match(cameraSync, /fetchAndRenderBatches/);
  assert.match(cameraSync, /loadBatchToDesktop/);
  assert.match(cameraSync, /\/api\/camera\/batch\//);
  assert.match(cameraSync, /\/api\/camera\/batches/);
  assert.match(cameraSync, /MileCameraSync/);
  assert.match(cameraSync, /function summarizeRows/);
  assert.match(cameraSync, /function escapeHtml/);
  assert.match(cameraSync, /camera-batch-item__stats/);
  assert.match(cameraSync, /Perlu dicek/);
  assert.match(cameraSync, /reviewFieldCount/);
  assert.match(cameraSync, /Luar Batam/);
  assert.match(cameraSync, /Waktu proses AI/);
  assert.match(cameraSync, /Rincian \$\{chunkTimings\.length\} kelompok AI/);
  assert.match(cameraSync, /chunkTimings: normalizeChunkTimings/);
  assert.match(cameraSync, /requestStartOffsetMs/);
  assert.match(cameraSync, /requestEndOffsetMs/);
  assert.match(cameraSync, /upstreamMs/);
  assert.match(cameraSync, /requestId/);
  assert.match(cameraSync, /Skema AI/);
  assert.match(cameraSync, /Layanan \/ tarif/);
  assert.match(cameraImport, /MileCameraSync/);
  assert.match(reviewHtml, /camera-sync\.js/);

  // Metadata keraguan AI harus tetap menjadi koreksi wajib setelah dimuat ke desktop.
  assert.match(appCore, /const reviewFieldAliases/);
  assert.match(appCore, /nama_penerima: 'name'/);
  assert.match(appCore, /alamat_penerima: 'address'/);
  assert.match(appCore, /nomor_hp: 'phone'/);
  assert.match(appCore, /nomor_surat: 'noSurat'/);
  assert.match(appCore, /hydrateAIReviewState\(row\)/);
  assert.match(appCore, /row\.needsVerification \? inferLegacyReviewFields\(row\)/);
  assert.match(appCore, /data-review-requires-change/);
  assert.match(appCore, /Perbaiki nilai yang salah atau konfirmasi nilai yang sudah benar/);
  assert.match(uiRuntime, /reviewRequiresChange !== 'false'/);
  assert.match(uiRuntime, /Konfirmasi benar & lanjut/);

  // Desktop batch modal
  const appHtml = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const appIntro = appHtml.slice(appHtml.indexOf('<section class="intro-shell"'), appHtml.indexOf('<section class="workspace-grid"'));
  const normalizeFooter = (html) => {
    const footer = html.match(/<footer class="dashboard-footer">[\s\S]*?<\/footer>/);
    assert.ok(footer, 'footer utama harus tersedia');
    return footer[0].replace(/\s+/g, ' ').trim();
  };
  assert.equal(normalizeFooter(cameraHtml), normalizeFooter(appHtml));
  assert.equal(normalizeFooter(reviewHtml), normalizeFooter(appHtml));
  assert.doesNotMatch(cameraHtml, /Â|â/);
  assert.match(reviewCss, /\.dashboard-footer/);
  assert.match(reviewCss, /@media \(max-width: 430px\)/);
  assert.doesNotMatch(appHtml, /Coba versi Beta/);
  assert.doesNotMatch(appHtml, /href="\/beta"/);
  assert.match(appIntro, /unggah PDF/i);
  assert.match(appHtml, /Gunakan HP untuk foto sampul atau label alamat/);
  assert.match(appHtml, /Ambil Foto di HP/);
  assert.match(appHtml, /data-accept-pdf="true"/);
  assert.match(appHtml, /data-primary-source="hybrid"/);
  assert.match(appHtml, /data-pdf-default-model="gemini-3\.8-flash"/);
  assert.match(appHtml, /class="panel-card upload-card" id="uploadSource"/);
  assert.match(appHtml, /accept="\.pdf,\.xlsx,\.xls,\.csv"/);
  assert.match(appHtml, /PDF maksimal 80 MB \/ 300 halaman/);
  assert.match(appHtml, /Gemini 3\.8 Flash · Default/);
  assert.match(appHtml, /langsung tanpa R2/);
  assert.match(appHtml, /<script src="\/assets\/js\/ai-pdf-beta-r2\.js/);
  assert.doesNotMatch(appHtml, /<script src="\/assets\/vendor\/pdfjs\/pdf\.min\.js/);
  assert.doesNotMatch(appHtml, /<script src="\/assets\/js\/ai-pdf-v16-19\.js/);
  assert.match(cameraImport, /source: 'Camera AI'/);
  assert.doesNotMatch(cameraImport, /source: 'AI PDF'/);
  assert.match(aiBeta, /source: directCameraInput \? 'Camera AI' : 'AI PDF'/);
  assert.match(appHtml, /id="cameraLogsModal"/);
  assert.match(appHtml, /id="openCameraLogsBtn"/);
  assert.match(appHtml, /id="cameraBatchesList"/);
  assert.match(appHtml, /camera-sync\.js/);
  assert.match(appHtml, /Detail perangkat, waktu, model AI, kualitas hasil/);

  const appCss = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
  assert.match(appCss, /\.camera-batch-item__stats/);
  assert.match(appCss, /\.camera-batch-item__details/);
  assert.match(appCss, /\.camera-batch-stat--review/);
  assert.match(appCss, /\.camera-batch-stat--outside/);

  // Worker camera batch endpoints
  assert.match(worker, /handleCameraBatchSave/);
  assert.match(worker, /handleCameraBatchList/);
  assert.match(worker, /handleCameraBatchGet/);
  assert.match(worker, /handleCameraBatchDelete/);
  assert.match(worker, /validCameraBatchId/);
  assert.match(worker, /CAMERA_BATCH_TTL_MS/);
  assert.match(worker, /captureDurationSeconds/);
  assert.match(worker, /outsideBatamCount/);
  assert.match(worker, /reviewFieldCount/);
  assert.match(worker, /cleanCount/);
  assert.match(worker, /sanitizeCameraChunkTimings/);
  assert.match(worker, /customerId: result\.form\?\.customerId/);
  assert.match(worker, /\/api\/camera\/batches/);

  console.log('PASS camera-capture: fullscreen, autofocus kontinu, rotasi, foto JPEG penuh 720p, protected review, server sync 72h & desktop batch panel');
}

runAsyncAssertions().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
