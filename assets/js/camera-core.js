(() => {
  'use strict';

  const textEncoder = new TextEncoder();

  function fixedGuideBounds() {
    return { x: 0.08, y: 0.13, width: 0.84, height: 0.74, confidence: 0, method: 'fixed-guide' };
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
      return { ok: false, code: 'resolution', reason: `Resolusi crop terlalu kecil (${width} × ${height}). Dekatkan kamera atau gunakan resolusi lebih tinggi.` };
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

  const api = { fixedGuideBounds, calculateSharpness, averageBrightness, validateImageQuality, buildJpegPdf };
  if (typeof window !== 'undefined') window.MileCameraCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
