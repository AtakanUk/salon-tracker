/**
 * Generates the PWA icons (scissors glyph on dark slate) without any image
 * library: pixels are computed with signed distance functions and written as
 * PNG via zlib. Run: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---- minimal PNG writer -------------------------------------------------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function writePng(file, size, pixels /* RGBA */) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
  console.log(`${file} (${size}x${size})`);
}

// ---- signed distance helpers (coordinates normalised to 0..1) -----------
const smooth = (d, aa) => Math.min(1, Math.max(0, 0.5 - d / aa));
function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const t = Math.min(1, Math.max(0, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  return Math.hypot(apx - abx * t, apy - aby * t);
}
const sdCircleRing = (px, py, cx, cy, r) => Math.abs(Math.hypot(px - cx, py - cy) - r);
function sdRoundRect(px, py, cx, cy, half, radius) {
  const qx = Math.abs(px - cx) - half + radius;
  const qy = Math.abs(py - cy) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

const BG = [15, 23, 42]; // slate-900
const FG = [255, 255, 255];
const ACCENT = [52, 211, 153]; // emerald-400

function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  const aa = 1.5 / size;
  // glyph shrinks a bit inside the maskable safe zone
  const s = maskable ? 0.72 : 0.9;
  const T = (v) => 0.5 + (v - 0.5) * s;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      // background: full square for maskable, rounded square otherwise
      let bgA = maskable ? 1 : smooth(sdRoundRect(u, v, 0.5, 0.5, 0.5, 0.11), aa);

      // scissors: two blades from pivot, two handle rings
      const blade = Math.min(
        sdSegment(u, v, T(0.5), T(0.54), T(0.345), T(0.2)),
        sdSegment(u, v, T(0.5), T(0.54), T(0.655), T(0.2)),
      ) - 0.026 * s;
      const link = Math.min(
        sdSegment(u, v, T(0.5), T(0.54), T(0.395), T(0.66)),
        sdSegment(u, v, T(0.5), T(0.54), T(0.605), T(0.66)),
      ) - 0.02 * s;
      const rings = Math.min(
        sdCircleRing(u, v, T(0.36), T(0.73), 0.095 * s),
        sdCircleRing(u, v, T(0.64), T(0.73), 0.095 * s),
      ) - 0.024 * s;
      const pivot = Math.hypot(u - T(0.5), v - T(0.54)) - 0.045 * s;

      const glyphA = Math.max(smooth(blade, aa), smooth(link, aa), smooth(rings, aa));
      const pivotA = smooth(pivot, aa);

      const i = (y * size + x) * 4;
      let r = BG[0], g = BG[1], b = BG[2];
      r = r + (FG[0] - r) * glyphA;
      g = g + (FG[1] - g) * glyphA;
      b = b + (FG[2] - b) * glyphA;
      r = r + (ACCENT[0] - r) * pivotA;
      g = g + (ACCENT[1] - g) * pivotA;
      b = b + (ACCENT[2] - b) * pivotA;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round(bgA * 255);
    }
  }
  return px;
}

writePng(path.join(outDir, 'icon-192.png'), 192, render(192, { maskable: false }));
writePng(path.join(outDir, 'icon-512.png'), 512, render(512, { maskable: false }));
writePng(path.join(outDir, 'icon-512-maskable.png'), 512, render(512, { maskable: true }));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="11" fill="#0f172a"/>
  <g stroke="#ffffff" stroke-linecap="round" fill="none">
    <path d="M50 54 34.5 20M50 54 65.5 20" stroke-width="5.2"/>
    <path d="M50 54 39.5 66M50 54 60.5 66" stroke-width="4"/>
    <circle cx="36" cy="73" r="9.5" stroke-width="4.8"/>
    <circle cx="64" cy="73" r="9.5" stroke-width="4.8"/>
  </g>
  <circle cx="50" cy="54" r="4.5" fill="#34d399"/>
</svg>`;
writeFileSync(path.join(outDir, 'icon.svg'), svg);
console.log('icon.svg');
