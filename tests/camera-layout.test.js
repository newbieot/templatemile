const assert = require('node:assert/strict');
const { fullscreenLayout, previewCaptureRect, previewVideoRect, previewGuideLayout, cameraViewPoint, viewportFrameRatios } = require('../assets/js/camera-core.js');

const frame = { x: 0.08, y: 0.10, width: 0.84, height: 0.72 };
for (const layoutRotation of [90, -90]) {
  const physicalFrame = viewportFrameRatios(frame, layoutRotation);
  const rootCrop = previewCaptureRect({ sourceWidth: 1440, sourceHeight: 1920, viewWidth: 393, viewHeight: 852, frame: physicalFrame });
  const outputRatio = rootCrop.height / rootCrop.width;
  assert.ok(Math.abs(outputRatio - (852 * frame.width) / (393 * frame.height)) < 1e-10);
  // Rotated UI guide maps onto the unrotated video in viewport coordinates.
  const rootScale = Math.max(393 / 1440, 852 / 1920);
  const offsetX = (393 - 1440 * rootScale) / 2;
  assert.ok(Math.abs(rootCrop.x * rootScale + offsetX - physicalFrame.x * 393) < 1e-8);
  assert.ok(Math.abs(rootCrop.y * rootScale - physicalFrame.y * 852) < 1e-8);
}
assert.deepEqual(viewportFrameRatios(frame), frame);
for (const [sourceWidth, sourceHeight] of [[1920, 1080], [1080, 1920], [1920, 1440], [1440, 1920]]) {
  for (const layoutRotation of [0, -90, 90]) {
    const viewWidth = 393, viewHeight = 852;
    const video = previewVideoRect({ sourceWidth, sourceHeight, viewWidth, viewHeight });
    const guide = previewGuideLayout({ sourceWidth, sourceHeight, viewWidth, viewHeight, layoutRotation, frame });
    const crop = previewCaptureRect({ sourceWidth, sourceHeight, viewWidth, viewHeight, frame: guide.frame, cover: false });
    assert.ok(crop.x >= -1e-8 && crop.y >= -1e-8);
    assert.ok(crop.x + crop.width <= sourceWidth + 1e-8 && crop.y + crop.height <= sourceHeight + 1e-8);
    const rootScale = video.width / sourceWidth;
    assert.ok(Math.abs(crop.x * rootScale + video.x - guide.frame.x * viewWidth) < 1e-8);
    assert.ok(Math.abs(crop.y * rootScale + video.y - guide.frame.y * viewHeight) < 1e-8);
    const targetRatio = (layoutRotation ? viewHeight : viewWidth) * frame.width / ((layoutRotation ? viewWidth : viewHeight) * frame.height);
    assert.ok(Math.abs((layoutRotation ? crop.height / crop.width : crop.width / crop.height) - targetRatio) < 1e-8);
  }
}
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
