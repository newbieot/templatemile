(() => {
  'use strict';

  const textEncoder = new TextEncoder();

  function fullscreenLayout({ width, height, orientation, rotation = 90 }) {
    const layoutRotation = orientation === 'landscape' && height > width
      ? (rotation === -90 ? 90 : -90) : 0;
    return {
      rotation: layoutRotation,
      width: layoutRotation ? height : width,
      height: layoutRotation ? width : height
    };
  }

  function previewCaptureRect({ sourceWidth, sourceHeight, rotation = 0, viewWidth, viewHeight, frame, cover = true }) {
    const rotated = Math.abs(rotation) === 90;
    const width = rotated ? sourceHeight : sourceWidth;
    const height = rotated ? sourceWidth : sourceHeight;
    if (!(viewWidth > 0 && viewHeight > 0)) return {
      fullWidth: width, fullHeight: height,
      x: width * frame.x, y: height * frame.y,
      width: width * frame.width, height: height * frame.height
    };
    const fitScale = cover ? Math.max(viewWidth / width, viewHeight / height)
      : Math.min(viewWidth / width, viewHeight / height);
    return {
      fullWidth: width,
      fullHeight: height,
      x: (viewWidth * frame.x - (viewWidth - width * fitScale) / 2) / fitScale,
      y: (viewHeight * frame.y - (viewHeight - height * fitScale) / 2) / fitScale,
      width: viewWidth * frame.width / fitScale,
      height: viewHeight * frame.height / fitScale
    };
  }

  function previewVideoRect({ sourceWidth, sourceHeight, viewWidth, viewHeight }) {
    const scale = Math.min(viewWidth / sourceWidth, viewHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
  }

  function cameraViewPoint({ x, y, width, height, rotation = 0 }) {
    if (rotation === 90) return { x: y, y: width - x };
    if (rotation === -90) return { x: height - y, y: x };
    return { x, y };
  }

  function viewportFrameRatios(frame, layoutRotation = 0) {
    if (layoutRotation === 90) return {
      x: 1 - frame.y - frame.height, y: frame.x,
      width: frame.height, height: frame.width
    };
    if (layoutRotation === -90) return {
      x: frame.y, y: 1 - frame.x - frame.width,
      width: frame.height, height: frame.width
    };
    return { ...frame };
  }

  function previewGuideLayout({ sourceWidth, sourceHeight, viewWidth, viewHeight, layoutRotation = 0, frame }) {
    const video = previewVideoRect({ sourceWidth, sourceHeight, viewWidth, viewHeight });
    const points = [
      { x: video.x, y: video.y },
      { x: video.x + video.width, y: video.y + video.height }
    ].map(point => cameraViewPoint({ ...point, width: viewWidth, height: viewHeight, rotation: layoutRotation }));
    const image = {
      x: Math.min(points[0].x, points[1].x), y: Math.min(points[0].y, points[1].y),
      width: Math.abs(points[1].x - points[0].x), height: Math.abs(points[1].y - points[0].y)
    };
    const uiWidth = layoutRotation ? viewHeight : viewWidth;
    const uiHeight = layoutRotation ? viewWidth : viewHeight;
    const ratio = uiWidth * frame.width / (uiHeight * frame.height);
    const width = Math.min(image.width * frame.width, image.height * frame.height * ratio);
    const height = width / ratio;
    const x = image.x + image.width * (frame.x + frame.width / 2) - width / 2;
    const y = image.y + image.height * (frame.y + frame.height / 2) - height / 2;
    const root = [{ x, y }, { x: x + width, y: y + height }].map(point => cameraViewPoint({
      ...point, width: uiWidth, height: uiHeight, rotation: -layoutRotation
    }));
    return {
      x, y, width, height,
      frame: {
        x: Math.min(root[0].x, root[1].x) / viewWidth,
        y: Math.min(root[0].y, root[1].y) / viewHeight,
        width: Math.abs(root[1].x - root[0].x) / viewWidth,
        height: Math.abs(root[1].y - root[0].y) / viewHeight
      }
    };
  }

  function calculateSharpness(imageData) {
    if (!imageData?.data || imageData.width < 3 || imageData.height < 3) return 0;
    const { data, width, height } = imageData;
    const gray = new Float32Array(width * height);
    for (let pixel = 0; pixel < gray.length; pixel++) {
      const offset = pixel * 4;
      gray[pixel] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    }
    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const i = y * width + x;
        const laplacian = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
        sum += laplacian;
        sumSquares += laplacian * laplacian;
        count++;
      }
    }
    const mean = count ? sum / count : 0;
    return count ? Math.max(0, sumSquares / count - mean * mean) : 0;
  }

  function averageBrightness(imageData) {
    if (!imageData?.data?.length) return 0;
    const { data } = imageData;
    let total = 0;
    let count = 0;
    for (let offset = 0; offset < data.length; offset += 16) {
      total += data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      count++;
    }
    return count ? total / count : 0;
  }

  function validateImageQuality({
    imageData,
    width,
    height,
    minLongSide = 900,
    minShortSide = 450,
    minSharpness = 58,
    minBrightness = 45,
    maxBrightness = 235
  }) {
    const longSide = Math.max(Number(width) || 0, Number(height) || 0);
    const shortSide = Math.min(Number(width) || 0, Number(height) || 0);
    if (longSide < minLongSide || shortSide < minShortSide) {
      return { ok: false, code: 'resolution', reason: `Resolusi foto terlalu kecil (${width} × ${height}). Dekatkan kamera atau gunakan resolusi lebih tinggi.` };
    }
    const brightness = averageBrightness(imageData);
    const sharpness = calculateSharpness(imageData);
    if (brightness < minBrightness) return { ok: false, code: 'dark', reason: 'Foto terlalu gelap. Tambahkan pencahayaan pada label.', brightness, sharpness };
    if (brightness > maxBrightness) return { ok: false, code: 'bright', reason: 'Foto terlalu terang. Kurangi pantulan lampu pada label.', brightness, sharpness };
    if (sharpness < minSharpness) return { ok: false, code: 'blur', reason: 'Foto terdeteksi buram. Tunggu fokus kamera stabil lalu capture ulang.', brightness, sharpness };
    return { ok: true, code: 'ok', brightness, sharpness };
  }

  function encode(value) {
    return textEncoder.encode(value);
  }

  async function buildJpegPdf(captures) {
    if (!Array.isArray(captures) || !captures.length) throw new Error('Belum ada hasil capture untuk diproses.');
    const images = captures.map(capture => ({
      blob: capture.blob,
      width: Math.max(1, Math.round(Number(capture.width) || 1)),
      height: Math.max(1, Math.round(Number(capture.height) || 1))
    }));
    const objectCount = 2 + images.length * 3;
    const pageIds = images.map((_, index) => 3 + index * 3);
    const parts = [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
    const offsets = new Array(objectCount + 1).fill(0);
    let byteLength = parts[0].byteLength;

    const pushPart = part => {
      parts.push(part);
      byteLength += Number(part?.byteLength ?? part?.size ?? 0);
    };
    const pushObject = (id, bodyParts) => {
      offsets[id] = byteLength;
      pushPart(encode(`${id} 0 obj\n`));
      for (const part of bodyParts) pushPart(part);
      pushPart(encode('\nendobj\n'));
    };

    pushObject(1, [encode('<< /Type /Catalog /Pages 2 0 R >>')]);
    pushObject(2, [encode(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`)]);

    images.forEach((image, index) => {
      const pageId = 3 + index * 3;
      const imageId = pageId + 1;
      const contentId = pageId + 2;
      const imageName = `Im${index + 1}`;
      const content = encode(`q\n${image.width} 0 0 ${image.height} 0 0 cm\n/${imageName} Do\nQ\n`);
      pushObject(pageId, [encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${image.width} ${image.height}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)]);
      pushObject(imageId, [
        encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.blob.size} >>\nstream\n`),
        image.blob,
        encode('\nendstream')
      ]);
      pushObject(contentId, [
        encode(`<< /Length ${content.byteLength} >>\nstream\n`),
        content,
        encode('endstream')
      ]);
    });

    const xrefOffset = byteLength;
    let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objectCount; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    pushPart(encode(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }

  const api = { fullscreenLayout, previewCaptureRect, previewVideoRect, previewGuideLayout, cameraViewPoint, viewportFrameRatios, calculateSharpness, averageBrightness, validateImageQuality, buildJpegPdf };
  if (typeof window !== 'undefined') window.MileCameraCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
