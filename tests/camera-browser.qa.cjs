const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MILE_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.wrangler'), { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/review') { res.setHeader('content-type', 'text/html'); return res.end('<title>QA Review</title>'); }
  if (pathname === '/api/auth/me') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ authenticated: true, user: { email: 'qa-local@example.test' } })); }
  const file = path.join(root, pathname === '/camera' ? 'camera.html' : pathname);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const mode of ['native-portrait', 'native-landscape', 'fallback', 'tiny', 'native-failure', 'jpeg-fallback']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => {
      localStorage.setItem('mile_camera_device_name', 'QA local');
      Element.prototype.requestFullscreen = async function () {};
      if (mode === 'jpeg-fallback') {
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
          return toBlob.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality);
        };
      }
      window.qaRequests = []; window.qaPhotoCalls = 0;
      function paint(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#adbc9e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#183924'; ctx.fillRect(0, 0, canvas.width * .07, canvas.height);
        ctx.fillStyle = '#92391c'; ctx.fillRect(canvas.width * .93, 0, canvas.width * .07, canvas.height);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(canvas.width * .32, canvas.height * .34, canvas.width * .37, canvas.height * .32);
        ctx.fillStyle = '#111111'; ctx.font = `${canvas.width * .024}px sans-serif`;
        ['KEPADA: LABEL QA', 'BATAM 29400', '0123456789 ABCDEFG'].forEach((text, index) => ctx.fillText(text, canvas.width * .33, canvas.height * (.42 + index * .05)));
      }
      const high = document.createElement('canvas');
      high.width = mode === 'native-portrait' ? 3072 : 4096;
      high.height = mode === 'native-portrait' ? 4096 : 3072;
      paint(high);
      if (mode.startsWith('native')) {
        window.ImageCapture = class {
          getPhotoCapabilities() { return Promise.resolve({ imageWidth: { max: high.width }, imageHeight: { max: high.height } }); }
          takePhoto(settings) {
            window.qaPhotoCalls++;
            window.qaPhotoSettings = settings;
            if (mode === 'native-failure') return Promise.reject(new Error('Native unsupported on track'));
            return new Promise(resolve => high.toBlob(resolve, 'image/jpeg', .97));
          }
        };
      } else window.ImageCapture = undefined;
      navigator.mediaDevices.getUserMedia = async constraints => {
        window.qaRequests.push(constraints);
        const canvas = document.createElement('canvas');
        const portrait = mode === 'native-portrait' || mode === 'tiny';
        canvas.width = mode === 'tiny' ? 480 : portrait ? 1080 : constraints.video.width.ideal;
        canvas.height = mode === 'tiny' ? 640 : portrait ? 1440 : constraints.video.height.ideal;
        paint(canvas);
        const stream = canvas.captureStream(24);
        const drawTimer = setInterval(() => paint(canvas), 120);
        stream.getTracks()[0].addEventListener('ended', () => clearInterval(drawTimer));
        return stream;
      };
      window.qaMotion = (x, y = 0) => {
        for (let i = 0; i < 3; i++) {
          const event = new Event('devicemotion');
          Object.defineProperty(event, 'accelerationIncludingGravity', { value: { x, y, z: 0 } });
          dispatchEvent(event);
        }
      };
    }, mode);
    await page.goto(`http://127.0.0.1:${server.address().port}/camera`);
    await page.getByRole('button', { name: /Open Camera/ }).click();
    await page.waitForFunction(() => document.querySelector('#cameraStage').classList.contains('is-active'));
    const request = await page.evaluate(() => window.qaRequests[0]);
    assert.ok(request.video.width.ideal >= 1920 && request.video.height.ideal >= 1440);
    const directions = mode === 'tiny' ? [0] : [0, 9.8, -9.8];
    for (const direction of directions) {
      await page.evaluate(x => window.qaMotion(x, x ? 0 : 9.8), direction);
      await page.waitForFunction(expected => document.querySelector('#cameraStage').dataset.layoutRotation === expected, direction > 0 ? '90' : direction < 0 ? '-90' : '0');
      const geometry = await page.evaluate(direction => {
        const stage = document.querySelector('#cameraStage');
        const video = document.querySelector('#cameraPreview');
        const guide = document.querySelector('#captureFrameGuide').getBoundingClientRect();
        const root = stage.getBoundingClientRect();
        const scale = Math.min(root.width / video.videoWidth, root.height / video.videoHeight);
        const visible = { x: root.x + (root.width - video.videoWidth * scale) / 2, y: root.y + (root.height - video.videoHeight * scale) / 2, width: video.videoWidth * scale, height: video.videoHeight * scale };
        return { transform: getComputedStyle(video).transform, fit: getComputedStyle(video).objectFit, parent: video.parentElement.id, guide: { x: guide.x, y: guide.y, width: guide.width, height: guide.height }, visible, ratio: document.querySelector('#cameraView').clientWidth * (direction ? .84 : .88) / (document.querySelector('#cameraView').clientHeight * .72) };
      }, direction);
      assert.equal(geometry.transform, 'none'); assert.equal(geometry.fit, 'contain'); assert.equal(geometry.parent, 'cameraStage');
      const g = geometry.guide, v = geometry.visible;
      assert.ok(g.x >= v.x - 1 && g.y >= v.y - 1 && g.x + g.width <= v.x + v.width + 1 && g.y + g.height <= v.y + v.height + 1, 'Guide outside real image');
      await page.locator('#captureButtonFullscreen').click();
      await page.waitForFunction(() => !document.querySelector('#captureButtonFullscreen').disabled);
      if (mode === 'tiny') {
        assert.ok(await page.locator('#reviewCapturesButtonFullscreen').isDisabled());
        assert.match(await page.locator('#cameraMessage').textContent(), /terlalu kecil/);
        continue;
      }
      await page.locator('#reviewCapturesButtonFullscreen').click();
      await page.locator('#cameraCaptureGallery').waitFor({ state: 'visible' });
      const dimensions = await page.locator('#cameraGalleryImage').evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
      assert.ok(Math.max(dimensions.width, dimensions.height) >= 900);
      if (mode.startsWith('native') && mode !== 'native-failure') assert.ok(Math.max(dimensions.width, dimensions.height) >= 1700);
      assert.ok(Math.abs(dimensions.width / dimensions.height - geometry.ratio) < .015, 'Saved photo does not match guide');
      console.log('PASS', mode, 'motion', direction, 'photo', JSON.stringify(dimensions), 'preview unrotated/unzoomed');
      await page.locator('#closeCaptureGallery').click();
      await page.locator('#cameraCaptureGallery').waitFor({ state: 'hidden' });
    }
    if (mode !== 'tiny') {
      const nativeCalls = await page.evaluate(() => window.qaPhotoCalls);
      if (mode.startsWith('native') && mode !== 'native-failure') assert.equal(nativeCalls, 3);
      if (mode === 'native-failure') assert.equal(nativeCalls, 1);
      if (mode === 'native-portrait') await page.screenshot({ path: path.join(root, '.wrangler', 'qa-quality-landscape-controls.png') });
      await page.locator('#finishCaptureButtonFullscreen').click();
      await page.waitForURL('**/review?cameraSession=*');
      const stored = await page.evaluate(async () => new Promise((resolve, reject) => {
        const request = indexedDB.open('mile-camera-capture-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; if (!db.objectStoreNames.length) { db.close(); return resolve([]); } const read = db.transaction(db.objectStoreNames[0]).objectStore(db.objectStoreNames[0]).getAll(); read.onsuccess = () => { resolve(read.result.map(item => ({ ...item, images: item.images?.map(({ blob, ...image }) => ({ ...image, byteSize: blob.size, blobType: blob.type })) }))); db.close(); }; };
      }));
      assert.equal(stored.length, 1);
      assert.equal(stored[0].images.length, 3);
      for (const image of stored[0].images) {
        assert.ok(image.encodingQuality >= .86 && image.encodingQuality <= .94);
        assert.ok(image.byteSize <= 2 * 1024 * 1024 && image.byteSize > 0);
        assert.equal(image.blobType, mode === 'jpeg-fallback' ? 'image/jpeg' : 'image/webp');
        assert.equal(image.imageFormat, image.blobType);
        assert.match(image.fileName, mode === 'jpeg-fallback' ? /\.jpg$/ : /\.webp$/);
        assert.equal(image.resolutionSource, mode.startsWith('native') && mode !== 'native-failure' ? 'native-photo' : 'video-frame');
        assert.ok(Math.max(image.width, image.height) >= 900);
      }
      console.log('PASS Finish', mode, 'to Review; native calls', nativeCalls, 'original images persisted', stored[0].images.map(image => `${image.width}x${image.height}/${image.byteSize} B`).join(', '));
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
