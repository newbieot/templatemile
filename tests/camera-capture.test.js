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

const detection = cameraCore.detectDocumentBounds(syntheticDocument());
assert.equal(detection.method, 'background');
assert.ok(detection.confidence >= 0.58, `confidence ${detection.confidence}`);
assert.ok(detection.x < 0.2 && detection.x > 0.08, `x ${detection.x}`);
assert.ok(detection.y < 0.2 && detection.y > 0.05, `y ${detection.y}`);
assert.ok(detection.width > 0.65 && detection.width < 0.9, `width ${detection.width}`);
assert.ok(detection.height > 0.65 && detection.height < 0.9, `height ${detection.height}`);
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
  assert.match(cameraHtml, /<option value="glm-5\.3-flashx" selected>GLM 5\.3 FlashX \(Default\)<\/option>/);
  assert.match(cameraHtml, /<option value="glm-5\.3">GLM 5\.3/);
  assert.match(cameraHtml, /<option value="glm-5\.3-flash">GLM 5\.3 Flash/);
  assert.match(cameraHtml, /<option value="gemini-3\.8-flash">Gemini 3\.8 Flash<\/option>/);
  assert.match(cameraHtml, /<option value="gemini-3\.7-flash">Gemini 3\.7 Flash<\/option>/);
  assert.match(cameraRuntime, /facingMode: \{ ideal: 'environment' \}/);
  assert.match(cameraRuntime, /requestFullscreen/);
  assert.match(cameraRuntime, /orientationchange/);
  assert.match(cameraRuntime, /await ensureSession\(\);/);
  assert.match(cameraRuntime, /guideFallback: useGuideFallback/);
  assert.doesNotMatch(cameraRuntime, /validateImageQuality/);
  assert.doesNotMatch(cameraHtml, /Start Capture Session/);
  assert.doesNotMatch(cameraRuntime, /Foto kurang jelas, silakan ulangi capture\./);
  assert.match(cameraHtml, /captureButtonFullscreen/);
  assert.match(cameraHtml, /finishCaptureButtonFullscreen/);
  assert.match(cameraHtml, /id="cameraFlash"/);
  assert.match(cameraHtml, /id="cameraHudToast"/);
  assert.match(cameraRuntime, /playShutterSound/);
  assert.match(cameraRuntime, /showHudToast/);
  assert.match(cameraRuntime, /setFinishDisabled/);
  assert.match(cameraCss, /\.camera-stage\.is-fullscreen/);
  assert.match(cameraCss, /\.camera-flash/);
  assert.match(cameraCss, /\.camera-hud-toast/);
  assert.match(cameraCss, /\.camera-fullscreen-finish/);
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
  assert.match(worker, /url\.pathname === '\/review'/);

  const cameraImport = fs.readFileSync(path.join(root, 'assets/js/camera-import-v2.js'), 'utf8');
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
  assert.match(cameraSync, /saveBatchResults/);
  assert.match(cameraSync, /fetchAndRenderBatches/);
  assert.match(cameraSync, /loadBatchToDesktop/);
  assert.match(cameraSync, /\/api\/camera\/batch\//);
  assert.match(cameraSync, /\/api\/camera\/batches/);
  assert.match(cameraSync, /MileCameraSync/);
  assert.match(cameraImport, /MileCameraSync/);
  assert.match(reviewHtml, /camera-sync\.js/);

  // Desktop batch modal
  const appHtml = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  assert.match(appHtml, /id="cameraLogsModal"/);
  assert.match(appHtml, /id="openCameraLogsBtn"/);
  assert.match(appHtml, /id="cameraBatchesList"/);
  assert.match(appHtml, /camera-sync\.js/);

  // Worker camera batch endpoints
  assert.match(worker, /handleCameraBatchSave/);
  assert.match(worker, /handleCameraBatchList/);
  assert.match(worker, /handleCameraBatchGet/);
  assert.match(worker, /handleCameraBatchDelete/);
  assert.match(worker, /validCameraBatchId/);
  assert.match(worker, /CAMERA_BATCH_TTL_MS/);
  assert.match(worker, /\/api\/camera\/batches/);

  console.log('PASS camera-capture: fullscreen, capture feedback, auto crop, direct JPEG finish tanpa PDF, protected review, server sync 72h & desktop batch panel');
}

runAsyncAssertions().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
