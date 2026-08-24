/**
 * Nibble — APNG kodlayıcı (bağımlılık yok)
 *
 * NEDEN GEREKLİ: GIF pixel art için iki yerde yetersiz — saydamlık 1-bit
 * (yumuşak kenar yok) ve 256 renk sınırı var. APNG ikisini de çözer: tam
 * RGBA, sınırsız renk, kayıpsız. Tarayıcılar ve Discord/Twitter APNG'yi
 * oynatıyor, oyun motorları da PNG olarak okuyabiliyor.
 *
 * TARAYICININ PNG'sini YENİDEN PAKETLEMİYORUZ. Canvas'ın ürettiği PNG'yi
 * parse edip IDAT'ı fdAT'a çevirmek cazip görünüyor ama tarayıcı bit derinliği
 * veya palet biçimini kendi kafasına göre seçebiliyor; kareler arasında farklı
 * biçim çıkarsa APNG bozulur. O yüzden ham tarama satırlarını kendimiz yazıyoruz:
 * bit derinliği 8, renk tipi 6 (RGBA), filtre 0. Her karede aynı.
 *
 * Sıkıştırma `CompressionStream("deflate")` ile — bu tam olarak PNG'nin
 * beklediği zlib akışı. Yoksa "stored" (sıkıştırmasız) deflate bloklarına
 * düşüyoruz: dosya büyük olur ama geçerli PNG çıkar, hiç çıkmamasından iyi.
 */

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ── CRC32 (PNG chunk'ları için zorunlu) ─────────────────────── */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ── adler32 (zlib akışının kuyruğu) ─────────────────────────── */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // 5552: a ve b'nin 32 bit'i aşmadan gidebildiği en uzun blok
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(i + 5552, bytes.length);
    for (; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/* ── chunk yazımı ────────────────────────────────────────────── */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // CRC tip + veri üstünden hesaplanır, uzunluk dahil DEĞİL
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Sıkıştırmasız ("stored") deflate akışı — CompressionStream yoksa yedek.
 * Blok başına en fazla 65535 bayt, son blokta BFINAL=1.
 */
function storedDeflate(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  let p = 0;
  out[p++] = 0x78; // zlib: deflate, 32K pencere
  out[p++] = 0x01; // FCHECK, sıkıştırma seviyesi yok
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535;
    const len = Math.min(65535, raw.length - start);
    out[p++] = i === blocks - 1 ? 1 : 0; // BFINAL
    out[p++] = len & 0xff;
    out[p++] = (len >>> 8) & 0xff;
    out[p++] = ~len & 0xff;
    out[p++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), p);
    p += len;
  }
  const ad = adler32(raw);
  out[p++] = (ad >>> 24) & 0xff;
  out[p++] = (ad >>> 16) & 0xff;
  out[p++] = (ad >>> 8) & 0xff;
  out[p++] = ad & 0xff;
  return out.subarray(0, p);
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return storedDeflate(raw);
  try {
    const cs = new CompressionStream("deflate"); // "deflate" = zlib sarmalı
    const writer = cs.writable.getWriter();
    // BufferSource, SharedArrayBuffer destekli Uint8Array'i kabul etmiyor;
    // tampon zaten bize ait, yeniden sarmalamak yeterli
    void writer.write(new Uint8Array(raw));
    void writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return storedDeflate(raw);
  }
}

/**
 * RGBA buffer → PNG tarama satırları.
 * Her satırın başına filtre baytı (0 = None) gelir. Pixel art'ta gelişmiş
 * filtreler kazanç sağlamıyor; büyük düz renk alanlarını deflate hallediyor.
 */
function rawScanlines(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const stride = w * 4;
  const out = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    out[y * (stride + 1)] = 0;
    out.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return out;
}

function be32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}

export interface ApngFrame {
  data: Uint8ClampedArray;
  /** santisaniye — GIF ile aynı birim, APNG kesir olarak yazıyor */
  durationCs: number;
}

export interface ApngStats {
  frames: number;
  bytes: number;
  compressed: boolean;
}

/**
 * Kareleri tek bir APNG'ye paketler.
 *
 * dispose_op = 1 (BACKGROUND): kare çizilmeden önce alan saydama çekilir.
 * blend_op  = 0 (SOURCE): kare olduğu gibi yazılır, alttakiyle harmanlanmaz.
 * İkisi birlikte "her kare bağımsız tam kare" demek — bizim modelimiz bu.
 */
export async function encodeApng(
  frames: ApngFrame[],
  width: number,
  height: number,
  loops = 0,
): Promise<{ blob: Blob; stats: ApngStats }> {
  if (!frames.length) throw new Error("APNG needs at least one frame");

  const parts: Uint8Array[] = [SIGNATURE];

  // IHDR
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // renk tipi: truecolour + alfa
  ihdr[10] = 0; // sıkıştırma: deflate
  ihdr[11] = 0; // filtre yöntemi
  ihdr[12] = 0; // interlace yok
  parts.push(chunk("IHDR", ihdr));

  // acTL — IDAT'tan ÖNCE gelmek zorunda
  const actl = new Uint8Array(8);
  const av = new DataView(actl.buffer);
  av.setUint32(0, frames.length);
  av.setUint32(4, loops);
  parts.push(chunk("acTL", actl));

  let seq = 0;
  let compressed = true;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];

    // fcTL — her kare için, IDAT/fdAT'tan önce
    const fctl = new Uint8Array(26);
    const fv = new DataView(fctl.buffer);
    fv.setUint32(0, seq++);
    fv.setUint32(4, width);
    fv.setUint32(8, height);
    fv.setUint32(12, 0); // x_offset
    fv.setUint32(16, 0); // y_offset
    fv.setUint16(20, Math.max(1, Math.round(f.durationCs))); // delay_num
    fv.setUint16(22, 100); // delay_den → santisaniye
    fctl[24] = 1; // dispose_op = BACKGROUND
    fctl[25] = 0; // blend_op = SOURCE
    parts.push(chunk("fcTL", fctl));

    const raw = rawScanlines(f.data, width, height);
    const z = await deflate(raw);
    if (z.length >= raw.length) compressed = false;

    if (i === 0) {
      // ilk kare normal IDAT — APNG'yi tanımayan okuyucu bunu görür
      parts.push(chunk("IDAT", z));
    } else {
      // fdAT = 4 bayt sıra numarası + zlib akışı
      const fdat = new Uint8Array(4 + z.length);
      fdat.set(be32(seq++), 0);
      fdat.set(z, 4);
      parts.push(chunk("fdAT", fdat));
    }
  }

  parts.push(chunk("IEND", new Uint8Array(0)));

  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }

  return {
    blob: new Blob([out as unknown as BlobPart], { type: "image/apng" }),
    stats: { frames: frames.length, bytes: out.length, compressed },
  };
}
