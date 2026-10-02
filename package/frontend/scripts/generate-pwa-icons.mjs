// One-off placeholder PWA icon generator (no external image deps).
// Produces solid-color square PNGs at standard PWA sizes; replace with real branded artwork later.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT_DIR = new URL('../public/icons/', import.meta.url);
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const BG = [0x00, 0x60, 0xaa, 0xff]; // brand blue, matches --inverse-primary
const MARK = [0xff, 0xff, 0xff, 0xff]; // white accent square

function crc32(buf) {
  let c;
  const table =
    crc32.table ??
    (crc32.table = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[n] = c >>> 0;
      }
      return t;
    })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildPng(size) {
  const inset = Math.round(size * 0.28);
  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // no filter
    const inMarkY = y >= inset && y < size - inset;
    for (let x = 0; x < size; x++) {
      const inMarkX = x >= inset && x < size - inset;
      const px = inMarkX && inMarkY ? MARK : BG;
      const offset = rowStart + 1 + x * 4;
      raw[offset] = px[0];
      raw[offset + 1] = px[1];
      raw[offset + 2] = px[2];
      raw[offset + 3] = px[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`icon-${size}x${size}.png`, OUT_DIR), buildPng(size));
}
console.log(`Generated ${SIZES.length} placeholder icons in public/icons/`);
