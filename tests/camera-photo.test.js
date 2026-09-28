const assert = require('node:assert/strict');
const photo = require('../assets/js/camera-photo.js');
const core = require('../assets/js/camera-core.js');

assert.equal(photo.supportsStillCapture(undefined), false);
assert.deepEqual(photo.previewConstraints(false).width, { ideal: 2560, max: 4096 });
assert.deepEqual(photo.previewConstraints(false).height, { ideal: 1920, max: 4096 });
assert.deepEqual(photo.previewConstraints(true).width, { ideal: 1920, max: 4096 });
assert.deepEqual(photo.previewConstraints(true).height, { ideal: 1440, max: 4096 });
assert.deepEqual(photo.photoSettings({ imageWidth: { max: 8000, min: 320 }, imageHeight: { max: 6000, min: 240 } }), { imageWidth: 4096, imageHeight: 3072 });
assert.deepEqual(photo.photoSettings({ imageWidth: { max: 2560 }, imageHeight: { max: 1920 } }), { imageWidth: 2560, imageHeight: 1920 });
assert.equal(photo.photoSettings({}), null);
assert.equal(photo.photoSettings({ imageWidth: { min: 8000, max: 8000 }, imageHeight: { min: 6000, max: 6000 } }), null);

for (const [previewWidth, previewHeight, photoWidth, photoHeight, rotation] of [
  [1920, 1080, 4096, 3072, 0], [1080, 1920, 3072, 4096, 90], [1080, 1920, 3072, 4096, -90],
  [1920, 1440, 4032, 3024, 0], [480, 640, 3024, 4032, 0]
]) {
  for (const [viewWidth, viewHeight] of [[393, 852], [852, 393]]) {
    const previewCrop = core.previewCaptureRect({ sourceWidth: previewWidth, sourceHeight: previewHeight, rotation, viewWidth, viewHeight, frame: { x: .06, y: .12, width: .88, height: .72 } });
    const mapped = photo.mapPreviewCrop(previewCrop, photoWidth, photoHeight, rotation);
    assert.ok(mapped.width > previewCrop.width && mapped.height > previewCrop.height);
    assert.ok(mapped.x >= 0 && mapped.y >= 0);
    assert.ok(mapped.x + mapped.width <= mapped.fullWidth + 1e-8);
    assert.ok(mapped.y + mapped.height <= mapped.fullHeight + 1e-8);
    assert.ok(Math.abs(mapped.width / mapped.height - previewCrop.width / previewCrop.height) < 1e-8);
  }
}

async function run() {
  const track = { readyState: 'live' };
  let shotCount = 0;
  let closedCount = 0;
  let requestedSettings;
  class NativeCamera {
    getPhotoCapabilities() { return Promise.resolve({ imageWidth: { max: 4096 }, imageHeight: { max: 3072 } }); }
    takePhoto(settings) { shotCount++; requestedSettings = settings; return Promise.resolve(new Blob(['photo'])); }
  }
  const decode = async () => ({ source: {}, width: 4096, height: 3072, close() { closedCount++; } });
  const camera = photo.createStillCamera(track, { ImageCaptureClass: NativeCamera, decode });
  const source = await camera.take(1920, 1080);
  assert.equal(source.width, 4096);
  assert.equal(shotCount, 1);
  assert.deepEqual(requestedSettings, { imageWidth: 4096, imageHeight: 3072 });
  source.close();
  assert.equal(closedCount, 1);
  assert.equal(camera.available, true);

  assert.equal(await camera.take(1080, 1920), null, 'Mismatched photo orientation must fall back safely');
  assert.equal(closedCount, 2);
  assert.equal(camera.available, false);
  assert.equal(await camera.take(1920, 1080), null);
  assert.equal(shotCount, 2, 'Broken native path should not run again on every capture');

  class ThrowingCamera extends NativeCamera { takePhoto() { throw new Error('not supported'); } }
  assert.equal(await photo.createStillCamera(track, { ImageCaptureClass: ThrowingCamera, decode }).take(1920, 1080), null);
  class HangingCamera extends NativeCamera { takePhoto() { return new Promise(() => {}); } }
  const timedCamera = photo.createStillCamera(track, { ImageCaptureClass: HangingCamera, decode, captureTimeoutMs: 15 });
  assert.equal(await timedCamera.take(1920, 1080), null);
  assert.equal(timedCamera.available, false);
  class NoCapabilities extends NativeCamera { getPhotoCapabilities() { return new Promise(() => {}); } }
  assert.equal(await photo.createStillCamera(track, { ImageCaptureClass: NoCapabilities, decode, capabilityTimeoutMs: 15 }).take(1920, 1080), null);
  assert.equal(photo.createStillCamera(track, { ImageCaptureClass: null }), null);
  assert.equal(await photo.createStillCamera({ readyState: 'ended' }, { ImageCaptureClass: NativeCamera, decode }).take(1920, 1080), null);

  const qualities = [];
  const canvas = { width: 4096, height: 3072, toBlob(callback, type, quality) {
    qualities.push(quality);
    callback(new Blob([new Uint8Array(quality > .90 ? 110 : 90)], { type }));
  } };
  const encoded = await photo.encodeImage(canvas, 100);
  assert.deepEqual(qualities, [.94, .92, .90]);
  assert.equal(encoded.quality, .90);
  assert.equal(encoded.type, 'image/webp');
  assert.equal(photo.fileExtension(encoded.blob), 'webp');
  assert.equal(photo.fileExtension(new Blob(['jpeg'], { type: 'image/jpeg' })), 'jpg');
  assert.equal(canvas.width, 4096);
  assert.equal(canvas.height, 3072);
  const fallbackCalls = [];
  const fallback = await photo.encodeImage({ toBlob(callback, type, quality) {
    fallbackCalls.push(type);
    callback(new Blob(['image'], { type: type === 'image/webp' ? 'image/png' : type }));
  } });
  assert.deepEqual(fallbackCalls, ['image/webp', 'image/jpeg']);
  assert.equal(fallback.blob.type, 'image/jpeg');
  await assert.rejects(photo.encodeImage({ toBlob(callback, type) { callback(new Blob(['too large'], { type })); } }, 1), /melebihi 2 MB/);
  console.log('PASS camera-photo: high-resolution stills, WebP / JPEG fallback, crop, timeout, no fake upscaling, quality floor');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
