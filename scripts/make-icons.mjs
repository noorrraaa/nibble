// Nibble simgelerini üretir: logo (ısırılmış 4x4 ızgara, globals.css `.mark`) koyu zeminde.
// Bağımlılık yok: PNG'yi zlib ile, ICO'yu PNG gömerek elle yazıyor.
//   node scripts/make-icons.mjs
// Çıktı: src/app/icon.svg, src/app/favicon.ico, src/app/apple-icon.png,
//        public/icon-192.png, public/icon-512.png
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [0x14, 0x16, 0x1f];
const INK = [0xf4, 0xf4, 0xf4];
const CORAL = [0xef, 0x7d, 0x57];

/** Izgara geometrisi, kenar payı `margin` (0..0.5) oranında. */
function layout(size, margin) {
  const g = size * (1 - 2 * margin);
  const gap = (g * 2) / 26;
  const cell = (g - 3 * gap) / 4;
  const o = size * margin;
  const cells = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      cells.push({ x: o + c * (cell + gap), y: o + r * (cell + gap), bite: r === 0 && c === 3 });
  return { cell, border: Math.max(1, (cell * 1.5) / 5), cells };
}

function png(size, margin) {
  const { cell, border, cells } = layout(size, margin);
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) BG.forEach((v, k) => (px[i * 3 + k] = v));
  // Piksel merkezi örnekleme: kenarlar tamsayıya yuvarlanır, bulanıklık yok.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      for (const b of cells) {
        if (cx < b.x || cy < b.y || cx >= b.x + cell || cy >= b.y + cell) continue;
        let col = INK;
        if (b.bite) {
          const inner = cx >= b.x + border && cy >= b.y + border && cx < b.x + cell - border && cy < b.y + cell - border;
          col = inner ? BG : CORAL;
        }
        col.forEach((v, k) => (px[(y * size + x) * 3 + k] = v));
      }
    }
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head[e] = size >= 256 ? 0 : size;
    head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); // renk düzlemi
    head.writeUInt16LE(32, e + 6); // bit/piksel
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

function svg(margin) {
  const size = 32;
  const { cell, border, cells } = layout(size, margin);
  const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const r = (n) => Math.round(n * 100) / 100;
  const rects = cells
    .map((b) =>
      b.bite
        ? `<rect x="${r(b.x + border / 2)}" y="${r(b.y + border / 2)}" width="${r(cell - border)}" height="${r(cell - border)}" fill="none" stroke="${hex(CORAL)}" stroke-width="${r(border)}"/>`
        : `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(cell)}" height="${r(cell)}" fill="${hex(INK)}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" rx="4" fill="${hex(BG)}"/>${rects}</svg>\n`;
}

writeFileSync("src/app/icon.svg", svg(0.12));
writeFileSync(
  "src/app/favicon.ico",
  ico([16, 32, 48].map((size) => ({ size, data: png(size, 0.1) }))),
);
writeFileSync("src/app/apple-icon.png", png(180, 0.18));
// Maskelenebilir simge: içerik ortadaki %80'lik güvenli alanda kalmalı → pay 0.2.
writeFileSync("public/icon-192.png", png(192, 0.2));
writeFileSync("public/icon-512.png", png(512, 0.2));
console.log("simgeler yazıldı");
