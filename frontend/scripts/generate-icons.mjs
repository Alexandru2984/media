import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const iconsRoot = resolve(frontendRoot, 'public', 'icons');
const supersampling = 4;
const gradientStart = [56, 189, 248];
const gradientEnd = [37, 99, 235];
const logo = [
  [16, 46], [16, 18], [24, 18], [32, 29], [40, 18], [48, 18],
  [48, 46], [40, 46], [40, 30], [32, 40], [24, 30], [24, 46],
].map(([x, y]) => [x / 64, y / 64]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    const crosses = currentY > y !== previousY > y;
    if (crosses && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) {
      inside = !inside;
    }
  }
  return inside;
}

function insideRoundedSquare(x, y) {
  const radius = 18 / 64;
  if ((x >= radius && x <= 1 - radius) || (y >= radius && y <= 1 - radius)) return true;
  const centerX = x < radius ? radius : 1 - radius;
  const centerY = y < radius ? radius : 1 - radius;
  return (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2;
}

function gradientColor(x, y) {
  const startX = 8 / 64;
  const startY = 6 / 64;
  const deltaX = 48 / 64;
  const deltaY = 52 / 64;
  const projection = ((x - startX) * deltaX + (y - startY) * deltaY) / (deltaX ** 2 + deltaY ** 2);
  const position = Math.max(0, Math.min(1, projection));
  return gradientStart.map((channel, index) => channel + (gradientEnd[index] - channel) * position);
}

function renderIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const sampleCount = supersampling ** 2;

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;

      for (let sampleY = 0; sampleY < supersampling; sampleY += 1) {
        for (let sampleX = 0; sampleX < supersampling; sampleX += 1) {
          const x = (pixelX + (sampleX + 0.5) / supersampling) / size;
          const y = (pixelY + (sampleY + 0.5) / supersampling) / size;
          if (!maskable && !insideRoundedSquare(x, y)) continue;

          const color = pointInPolygon(x, y, logo) ? [255, 255, 255] : gradientColor(x, y);
          red += color[0];
          green += color[1];
          blue += color[2];
          covered += 1;
        }
      }

      const offset = (pixelY * size + pixelX) * 4;
      if (covered > 0) {
        pixels[offset] = Math.round(red / covered);
        pixels[offset + 1] = Math.round(green / covered);
        pixels[offset + 2] = Math.round(blue / covered);
      }
      pixels[offset + 3] = Math.round((covered / sampleCount) * 255);
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row += 1) {
    const rowOffset = row * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, row * size * 4, (row + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

await mkdir(iconsRoot, { recursive: true });
await Promise.all([
  writeFile(resolve(iconsRoot, 'icon-192.png'), renderIcon(192)),
  writeFile(resolve(iconsRoot, 'icon-512.png'), renderIcon(512)),
  writeFile(resolve(iconsRoot, 'icon-maskable-512.png'), renderIcon(512, { maskable: true })),
  writeFile(resolve(iconsRoot, 'apple-touch-icon.png'), renderIcon(180)),
]);

console.log('Generated deterministic Media icons (180, 192, 512, and maskable 512).');
