const assert = require('node:assert/strict');
const photo = require('../assets/js/camera-photo.js');

assert.equal(photo.PHOTO_MAX_SIDE, 1280);
assert.equal(photo.PHOTO_MAX_PIXELS, 1280 * 720);
assert.equal(photo.DEFAULT_IMAGE_MAX_BYTES, 120 * 1000);
assert.deepEqual(photo.previewConstraints(), {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 1280 },
  frameRate: { ideal: 24, max: 30 },
  advanced: [{ focusMode: 'continuous' }, { zoom: 1 }]
});
assert.equal(photo.fileExtension(new Blob(['jpeg'], { type: 'image/jpeg' })), 'jpg');
assert.equal(photo.fileExtension(new Blob(['old draft'], { type: 'image/webp' })), 'webp', 'Existing local drafts keep their matching extension');

async function run() {
  const calls = [];
  const canvas = { width: 1280, height: 720, toBlob(callback, type, quality) {
    calls.push({ type, quality });
    callback(new Blob([new Uint8Array(quality > 0.74 ? 150_000 : 118_000)], { type }));
  } };
  const encoded = await photo.encodeImage(canvas);
  assert.deepEqual(calls, [
    { type: 'image/jpeg', quality: 0.84 },
    { type: 'image/jpeg', quality: 0.74 }
  ]);
  assert.equal(encoded.blob.size, 118_000);
  assert.equal(encoded.quality, 0.74);
  assert.equal(encoded.type, 'image/jpeg');
  assert.equal(encoded.width, 1280);
  assert.equal(encoded.height, 720);
  assert.equal(photo.fileExtension(encoded.blob), 'jpg');

  await assert.rejects(photo.encodeImage({ width: 1280, height: 720, toBlob(callback, type) {
    callback(new Blob([new Uint8Array(121_000)], { type }));
  } }), /120 KB/);
  console.log('PASS camera-photo: 720p JPEG capture and strict 120 KB image limit');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
