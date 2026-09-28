const assert = require('node:assert/strict');
const { fullscreenLayout, previewCaptureRect, cameraViewPoint } = require('../assets/js/camera-core.js');

const frame = { x: 0.08, y: 0.10, width: 0.84, height: 0.72 };
for (const direction of [-90, 90]) {
  const layout = fullscreenLayout({ width: 393, height: 852, orientation: 'landscape', rotation: direction });
  assert.deepEqual(layout, { width: 852, height: 393, rotation: -direction });
  // Every virtual corner maps inside the locked portrait viewport in both directions.
  for (const x of [0, 393]) for (const y of [0, 852]) {
    const point = cameraViewPoint({ x, y, width: 393, height: 852, rotation: layout.rotation });
    assert.ok(point.x >= 0 && point.x <= layout.width);
    assert.ok(point.y >= 0 && point.y <= layout.height);
  }
  for (const [sourceWidth, sourceHeight, rotation] of [[1920, 1440, 0], [1440, 1920, direction]]) {
    const crop = previewCaptureRect({ sourceWidth, sourceHeight, rotation, viewWidth: layout.width, viewHeight: layout.height, frame });
    assert.ok(crop.x >= 0 && crop.y >= 0);
    assert.ok(crop.x + crop.width <= crop.fullWidth);
    assert.ok(crop.y + crop.height <= crop.fullHeight);
    assert.ok(Math.abs(crop.width / crop.height - layout.width * frame.width / (layout.height * frame.height)) < 1e-10);
    // Source rectangle must project onto the exact dashed guide in the cover preview.
    const scale = Math.max(layout.width / crop.fullWidth, layout.height / crop.fullHeight);
    const offsetX = (layout.width - crop.fullWidth * scale) / 2;
    const offsetY = (layout.height - crop.fullHeight * scale) / 2;
    assert.ok(Math.abs(crop.x * scale + offsetX - layout.width * frame.x) < 1e-8);
    assert.ok(Math.abs(crop.y * scale + offsetY - layout.height * frame.y) < 1e-8);
  }
}
assert.deepEqual(fullscreenLayout({ width: 852, height: 393, orientation: 'landscape' }), { rotation: 0, width: 852, height: 393 });
assert.deepEqual(fullscreenLayout({ width: 393, height: 852, orientation: 'portrait' }), { rotation: 0, width: 393, height: 852 });
const portraitCrop = previewCaptureRect({ sourceWidth: 1920, sourceHeight: 1440, viewWidth: 393, viewHeight: 852, frame: { x: 0.06, y: 0.12, width: 0.88, height: 0.72 } });
assert.ok(Math.abs(portraitCrop.width / portraitCrop.height - (393 * 0.88) / (852 * 0.72)) < 1e-10);
console.log('PASS camera-layout: locked portrait, both landscape directions, exact preview crop, tap coordinates, and normal rotation');
