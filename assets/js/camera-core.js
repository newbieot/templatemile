(() => {
  'use strict';

  const textEncoder = new TextEncoder();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function normalizeBounds(bounds, width, height, padding = 0) {
    const x1 = clamp(bounds.x1 - padding, 0, width - 1);
    const y1 = clamp(bounds.y1 - padding, 0, height - 1);
    const x2 = clamp(bounds.x2 + padding, x1 + 1, width);
    const y2 = clamp(bounds.y2 + padding, y1 + 1, height);
    return {
      x: x1 / width,
      y: y1 / height,
      width: (x2 - x1) / width,
      height: (y2 - y1) / height
    };
  }

  function detectByBackground(data, width, height) {
    const red = [];
    const green = [];
    const blue = [];
    const distances = [];
    const border = Math.max(2, Math.round(Math.min(width, height) * 0.035));
    const step = Math.max(1, Math.floor(Math.min(width, height) / 120));

    const sample = (x, y) => {
      const offset = (y * width + x) * 4;
      red.push(data[offset]);
      green.push(data[offset + 1]);
      blue.push(data[offset + 2]);
    };

    for (let x = 0; x < width; x += step) {
      for (let y = 0; y < border; y += step) sample(x, y);
      for (let y = height - border; y < height; y += step) sample(x, y);
    }
    for (let y = border; y < height - border; y += step) {
      for (let x = 0; x < border; x += step) sample(x, y);
      for (let x = width - border; x < width; x += step) sample(x, y);
    }

    const background = [median(red), median(green), median(blue)];
    for (let index = 0; index < red.length; index++) {
      const dr = red[index] - background[0];
      const dg = green[index] - background[1];
      const db = blue[index] - background[2];
      distances.push(Math.sqrt(dr * dr + dg * dg + db * db));
    }
    const distanceMedian = median(distances);
    const distanceMad = median(distances.map(value => Math.abs(value - distanceMedian)));
    const threshold = clamp(distanceMedian + Math.max(18, distanceMad * 4.5), 24, 105);
    const mask = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        const dr = data[offset] - background[0];
        const dg = data[offset + 1] - background[1];
        const db = data[offset + 2] - background[2];
        if (Math.sqrt(dr * dr + dg * dg + db * db) >= threshold) mask[pixel] = 1;
      }
    }

    const visited = new Uint8Array(mask.length);
    const totalPixels = width * height;
    let best = null;

    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let cursor = 0;
      let count = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      while (cursor < queue.length) {
        const pixel = queue[cursor++];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        count++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] || !mask[neighbor]) continue;
          const neighborX = neighbor % width;
          if (Math.abs(neighborX - x) > 1) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const boxArea = boxWidth * boxHeight;
      const areaRatio = boxArea / totalPixels;
      const fillRatio = count / Math.max(1, boxArea);
      const centerX = (minX + maxX) / 2 / width;
      const centerY = (minY + maxY) / 2 / height;
      const centerPenalty = Math.abs(centerX - 0.5) + Math.abs(centerY - 0.5);
      const aspect = boxWidth / Math.max(1, boxHeight);
      if (areaRatio < 0.045 || areaRatio > 0.94 || fillRatio < 0.24 || aspect < 0.35 || aspect > 4.5) continue;

      const score = areaRatio * (0.55 + Math.min(fillRatio, 0.9)) * (1.2 - Math.min(centerPenalty, 0.75));
      if (!best || score > best.score) {
        best = { x1: minX, y1: minY, x2: maxX + 1, y2: maxY + 1, score, fillRatio, areaRatio };
      }
    }

    if (!best) return null;
    const confidence = clamp(0.35 + best.fillRatio * 0.42 + Math.min(best.areaRatio, 0.55) * 0.35, 0, 0.98);
    return {
      ...normalizeBounds(best, width, height, Math.round(Math.min(width, height) * 0.025)),
      confidence,
      method: 'background'
    };
  }

  function smoothProjection(values, radius = 3) {
    return values.map((_, index) => {
      let total = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const value = values[index + offset];
        if (Number.isFinite(value)) {
          total += value;
          count++;
        }
      }
      return count ? total / count : 0;
    });
  }

  function strongestIndex(values, startRatio, endRatio) {
    const start = Math.max(1, Math.floor(values.length * startRatio));
    const end = Math.min(values.length - 2, Math.ceil(values.length * endRatio));
    let bestIndex = start;
    let bestValue = -1;
    for (let index = start; index <= end; index++) {
      if (values[index] > bestValue) {
        bestIndex = index;
        bestValue = values[index];
      }
    }
    return { index: bestIndex, value: bestValue };
  }

  function detectByEdges(data, width, height) {
    const gray = new Float32Array(width * height);
    for (let pixel = 0; pixel < gray.length; pixel++) {
      const offset = pixel * 4;
      gray[pixel] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    }

    const vertical = new Float32Array(width);
    const horizontal = new Float32Array(height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1]
          + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
        const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
          + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
        const magnitude = Math.abs(gx) + Math.abs(gy);
        if (magnitude < 55) continue;
        vertical[x] += Math.abs(gx);
        horizontal[y] += Math.abs(gy);
      }
    }

    const verticalSmooth = smoothProjection(Array.from(vertical), 3);
    const horizontalSmooth = smoothProjection(Array.from(horizontal), 3);
    const left = strongestIndex(verticalSmooth, 0.035, 0.46);
    const right = strongestIndex(verticalSmooth, 0.54, 0.965);
    const top = strongestIndex(horizontalSmooth, 0.035, 0.47);
    const bottom = strongestIndex(horizontalSmooth, 0.53, 0.965);
    const boxWidth = right.index - left.index;
    const boxHeight = bottom.index - top.index;
    const areaRatio = boxWidth * boxHeight / Math.max(1, width * height);
    if (boxWidth < width * 0.22 || boxHeight < height * 0.2 || areaRatio > 0.94) return null;

    const averageVertical = verticalSmooth.reduce((sum, value) => sum + value, 0) / Math.max(1, width);
    const averageHorizontal = horizontalSmooth.reduce((sum, value) => sum + value, 0) / Math.max(1, height);
    const edgeStrength = (
      left.value / Math.max(1, averageVertical)
      + right.value / Math.max(1, averageVertical)
      + top.value / Math.max(1, averageHorizontal)
      + bottom.value / Math.max(1, averageHorizontal)
    ) / 4;
    const confidence = clamp(0.24 + Math.min(edgeStrength / 12, 0.52) + Math.min(areaRatio, 0.55) * 0.2, 0, 0.9);
    return {
      ...normalizeBounds({ x1: left.index, y1: top.index, x2: right.index + 1, y2: bottom.index + 1 }, width, height, Math.round(Math.min(width, height) * 0.025)),
      confidence,
      method: 'edges'
    };
  }

  function fixedGuideBounds() {
    return { x: 0.08, y: 0.13, width: 0.84, height: 0.74, confidence: 0, method: 'fixed-guide' };
  }

  function detectDocumentBounds(imageData) {
    if (!imageData?.data || !imageData.width || !imageData.height) return fixedGuideBounds();
    const background = detectByBackground(imageData.data, imageData.width, imageData.height);
    if (background && background.confidence >= 0.58) return background;
    const edges = detectByEdges(imageData.data, imageData.width, imageData.height);
    if (edges && edges.confidence >= 0.42) return edges;
    return background || edges || fixedGuideBounds();
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

  const api = { detectDocumentBounds, fixedGuideBounds, calculateSharpness, averageBrightness, validateImageQuality, buildJpegPdf };
  if (typeof window !== 'undefined') window.MileCameraCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
