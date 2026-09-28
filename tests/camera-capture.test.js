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

function syntheticLabelWithCornerDistractor(width = 360, height = 640) {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x1, y1, x2, y2, color) => {
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }
    }
  };
  paint(0, 0, width, height, [120, 82, 58]);
  paint(18, 210, 342, 630, [128, 92, 66]);
  paint(0, 0, 214, 205, [18, 86, 116]);
  paint(70, 390, 286, 474, [214, 214, 208]);
  for (let line = 0; line < 6; line++) {
    paint(84, 403 + line * 10, 255 - line * 7, 407 + line * 10, [45, 47, 50]);
  }
  return { data, width, height };
}

const detection = cameraCore.detectDocumentBounds(syntheticDocument());
assert.equal(detection.method, 'background');
assert.ok(detection.confidence >= 0.58, `confidence ${detection.confidence}`);
assert.ok(detection.x < 0.2 && detection.x > 0.08, `x ${detection.x}`);
assert.ok(detection.y < 0.2 && detection.y > 0.05, `y ${detection.y}`);
assert.ok(detection.width > 0.65 && detection.width < 0.9, `width ${detection.width}`);
assert.ok(detection.height > 0.65 && detection.height < 0.9, `height ${detection.height}`);
const labelDetection = cameraCore.detectDocumentBounds(syntheticLabelWithCornerDistractor());
assert.equal(labelDetection.method, 'light-label');
assert.ok(labelDetection.x > 0.12 && labelDetection.x < 0.25, `label x ${labelDetection.x}`);
assert.ok(labelDetection.y > 0.52 && labelDetection.y < 0.7, `label y ${labelDetection.y}`);
assert.ok(labelDetection.width > 0.5 && labelDetection.width < 0.72, `label width ${labelDetection.width}`);
assert.ok(labelDetection.height > 0.1 && labelDetection.height < 0.2, `label height ${labelDetection.height}`);
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
  const cameraCss = fs.readFileSync(path.join(root, 'assets/css/camera.css'), 'utf8');
  const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
  assert.match(cameraRuntime, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(cameraHtml, /Finish Capturing/);
  assert.match(cameraHtml, /15 gambar per gelombang diproses sebagai 3 kelompok paralel × 5 tanpa R2/);
  assert.match(cameraHtml, /<option value="gemini-3\.8-flash" selected>Gemini 3\.8 Flash \(Default\)<\/option>/);
  assert.match(cameraHtml, /<option value="gemini-3\.7-flash">Gemini 3\.7 Flash \(Fallback\)<\/option>/);
  assert.match(cameraHtml, /<option value="glm-5\.3-flashx">GLM 5\.3 FlashX<\/option>/);
  assert.match(cameraHtml, /<option value="glm-5\.3">GLM 5\.3/);
  assert.match(cameraHtml, /<option value="glm-5\.3-flash">GLM 5\.3 Flash/);
  assert.match(cameraRuntime, /facingMode: \{ ideal: 'environment' \}/);
  assert.match(cameraRuntime, /requestFullscreen/);
  assert.match(cameraRuntime, /orientationchange/);
  assert.match(cameraRuntime, /await ensureSession\(\);/);
  assert.match(cameraRuntime, /guideFallback: useGuideFallback/);
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
  assert.match(cameraCss, /\.camera-flash/);
  assert.match(cameraCss, /\.camera-hud-toast/);
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
  assert.match(cameraRuntime, /if \(stream\) startCamera\(\);/);
  assert.match(cameraRuntime, /captureId:/);
  assert.match(cameraRuntime, /sessionId,/);
  assert.match(cameraRuntime, /timestamp,/);
  assert.match(cameraHtml, /camera-action-dock/);
  assert.match(cameraHtml, /id="finishCaptureButton"/);
  assert.match(cameraHtml, /id="enterFullscreenButton"/);
  assert.match(cameraCss, /\.camera-action-dock/);
  assert.match(cameraRuntime, /inputFormat: 'direct-jpeg'/);
  assert.match(cameraRuntime, /const images = captures\.map/);
  assert.doesNotMatch(cameraRuntime, /await core\.buildJpegPdf\(captures\)/);
  assert.match(cameraRuntime, /window\.location\.assign\(`\/review\?cameraSession=\${encodeURIComponent\(sessionId\)}`\);/);

  const reviewHtml = fs.readFileSync(path.join(root, 'review.html'), 'utf8');
  assert.match(reviewHtml, /assets\/css\/review\.css/);
  assert.match(reviewHtml, /ai-pdf-beta-r2\.js/);
  assert.match(reviewHtml, /camera-import-v2\.js/);
  assert.match(reviewHtml, /15 gambar diproses sebagai 3 kelompok paralel × 5 langsung tanpa R2/);
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
  assert.doesNotMatch(appIntro, /PDF|Excel|CSV/i);
  assert.match(appHtml, /Gunakan HP untuk foto sampul atau label alamat/);
  assert.match(appHtml, /Ambil Foto di HP/);
  assert.match(appHtml, /data-primary-source="camera"/);
  assert.match(appHtml, /class="panel-card upload-card" hidden aria-hidden="true"/);
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

  console.log('PASS camera-capture: fullscreen, capture feedback, auto crop, direct JPEG finish tanpa PDF, protected review, server sync 72h & desktop batch panel');
}

runAsyncAssertions().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
