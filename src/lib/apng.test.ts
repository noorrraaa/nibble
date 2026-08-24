/**
 * Nibble — APNG kodlayıcı testleri
 *
 * Bu dosya elle yazılmış bir binary format kodlayıcısını test ediyor: CRC32,
 * adler32, chunk sıralaması, zlib akışı. Böyle kodda bir bit kayması sessizce
 * bozuk dosya üretir ve kullanıcı bunu ancak Discord'a atınca fark eder.
 * O yüzden testler baytları TEK TEK doğruluyor, "hata atmadı"yı değil.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { encodeApng } from "./apng";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Testin kendi bağımsız CRC32'si — kodlayıcının tablosunu kopyalamıyoruz */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface Chunk {
  type: string;
  data: Uint8Array;
  declaredCrc: number;
  computedCrc: number;
}

function parse(bytes: Uint8Array): { sig: number[]; chunks: Chunk[] } {
  const sig = [...bytes.subarray(0, 8)];
  const chunks: Chunk[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  while (p < bytes.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + len);
    chunks.push({
      type,
      data,
      declaredCrc: view.getUint32(p + 8 + len),
      computedCrc: crc32(bytes.subarray(p + 4, p + 8 + len)),
    });
    p += 12 + len;
  }
  return { sig, chunks };
}

/** Dolu, öngörülebilir bir kare üret */
function frame(w: number, h: number, seed: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 7 + seed) & 255;
    data[i * 4 + 1] = (i * 13 + seed) & 255;
    data[i * 4 + 2] = (i * 29 + seed) & 255;
    // yarı saydam pikseller de olsun: APNG'nin GIF'ten farkı burada
    data[i * 4 + 3] = i % 5 === 0 ? 128 : 255;
  }
  return { data, durationCs: 10 + seed };
}

async function encoded(w = 6, h = 4, count = 3) {
  const frames = Array.from({ length: count }, (_, i) => frame(w, h, i));
  const { blob, stats } = await encodeApng(frames, w, h);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), stats, frames, blob };
}

describe("encodeApng — dosya iskeleti", () => {
  test("PNG imzası doğru", async () => {
    const { bytes } = await encoded();
    assert.deepEqual([...bytes.subarray(0, 8)], SIGNATURE);
  });

  test("chunk sırası APNG spesifikasyonuna uygun", async () => {
    const { chunks } = parse((await encoded(6, 4, 3)).bytes);
    assert.deepEqual(
      chunks.map((c) => c.type),
      ["IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "fcTL", "fdAT", "IEND"],
    );
  });

  test("acTL, IDAT'tan ÖNCE gelmek zorunda", async () => {
    const { chunks } = parse((await encoded()).bytes);
    const types = chunks.map((c) => c.type);
    assert.ok(types.indexOf("acTL") < types.indexOf("IDAT"));
  });

  test("her chunk'ın CRC32'si doğru", async () => {
    const { chunks } = parse((await encoded()).bytes);
    for (const c of chunks) {
      assert.equal(c.declaredCrc, c.computedCrc, `${c.type} CRC uyuşmuyor`);
    }
  });

  test("IHDR: 8 bit derinlik, renk tipi 6 (RGBA), interlace yok", async () => {
    const { chunks } = parse((await encoded(9, 5, 1)).bytes);
    const ihdr = chunks[0];
    const v = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
    assert.equal(v.getUint32(0), 9, "genişlik");
    assert.equal(v.getUint32(4), 5, "yükseklik");
    assert.equal(ihdr.data[8], 8, "bit derinliği");
    assert.equal(ihdr.data[9], 6, "renk tipi RGBA olmalı");
    assert.equal(ihdr.data[12], 0, "interlace kapalı olmalı");
  });

  test("acTL kare sayısını ve sonsuz döngüyü bildirir", async () => {
    const { chunks } = parse((await encoded(4, 4, 5)).bytes);
    const actl = chunks.find((c) => c.type === "acTL")!;
    const v = new DataView(actl.data.buffer, actl.data.byteOffset, actl.data.byteLength);
    assert.equal(v.getUint32(0), 5, "num_frames");
    assert.equal(v.getUint32(4), 0, "num_plays = 0 → sonsuz");
  });
});

describe("encodeApng — sıra numaraları ve zamanlama", () => {
  test("fcTL/fdAT sıra numaraları 0'dan başlayıp KESİNTİSİZ artar", async () => {
    // APNG okuyucuları boşluk görürse dosyayı reddediyor
    const { chunks } = parse((await encoded(4, 4, 4)).bytes);
    const seqs: number[] = [];
    for (const c of chunks) {
      if (c.type === "fcTL" || c.type === "fdAT") {
        seqs.push(new DataView(c.data.buffer, c.data.byteOffset, 4).getUint32(0));
      }
    }
    assert.deepEqual(seqs, [0, 1, 2, 3, 4, 5, 6]);
  });

  test("kare süresi santisaniye kesri olarak yazılır", async () => {
    const w = 4;
    const h = 4;
    const { blob } = await encodeApng(
      [
        { data: new Uint8ClampedArray(w * h * 4), durationCs: 7 },
        { data: new Uint8ClampedArray(w * h * 4), durationCs: 25 },
      ],
      w,
      h,
    );
    const { chunks } = parse(new Uint8Array(await blob.arrayBuffer()));
    const fctls = chunks.filter((c) => c.type === "fcTL");
    const delay = (c: Chunk) => {
      const v = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
      return [v.getUint16(20), v.getUint16(22)];
    };
    assert.deepEqual(delay(fctls[0]), [7, 100]);
    assert.deepEqual(delay(fctls[1]), [25, 100]);
  });

  test("dispose=BACKGROUND, blend=SOURCE — her kare bağımsız tam kare", async () => {
    const { chunks } = parse((await encoded()).bytes);
    for (const c of chunks.filter((x) => x.type === "fcTL")) {
      assert.equal(c.data[24], 1, "dispose_op BACKGROUND olmalı");
      assert.equal(c.data[25], 0, "blend_op SOURCE olmalı");
    }
  });

  test("süre 0 verilirse en az 1 cs'e yükseltilir", async () => {
    const { blob } = await encodeApng([{ data: new Uint8ClampedArray(16), durationCs: 0 }], 2, 2);
    const { chunks } = parse(new Uint8Array(await blob.arrayBuffer()));
    const fctl = chunks.find((c) => c.type === "fcTL")!;
    const v = new DataView(fctl.data.buffer, fctl.data.byteOffset, fctl.data.byteLength);
    assert.equal(v.getUint16(20), 1, "0 gecikme donmuş animasyon demek");
  });
});

describe("encodeApng — piksel verisi kayıpsız", () => {
  test("zlib akışı çözüldüğünde tarama satırları BİREBİR geri gelir", async () => {
    // Asıl iddia bu: APNG kayıpsız. Filtre baytı + RGBA satırları aynen dönmeli.
    const w = 5;
    const h = 3;
    const f = frame(w, h, 2);
    const { blob } = await encodeApng([f], w, h);
    const { chunks } = parse(new Uint8Array(await blob.arrayBuffer()));
    const idat = chunks.find((c) => c.type === "IDAT")!;

    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    void writer.write(new Uint8Array(idat.data));
    void writer.close();
    const raw = new Uint8Array(await new Response(ds.readable).arrayBuffer());

    const stride = w * 4;
    assert.equal(raw.length, h * (stride + 1), "tarama satırı uzunluğu yanlış");
    for (let y = 0; y < h; y++) {
      assert.equal(raw[y * (stride + 1)], 0, "filtre baytı 0 (None) olmalı");
      const got = [...raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)];
      const want = [...f.data.subarray(y * stride, (y + 1) * stride)];
      assert.deepEqual(got, want, `${y}. satır bozuldu`);
    }
  });

  test("yarı saydam alfa korunur — GIF'in yapamadığı şey", async () => {
    const w = 2;
    const h = 1;
    const data = new Uint8ClampedArray([255, 0, 68, 128, 0, 0, 0, 0]);
    const { blob } = await encodeApng([{ data, durationCs: 10 }], w, h);
    const { chunks } = parse(new Uint8Array(await blob.arrayBuffer()));
    const idat = chunks.find((c) => c.type === "IDAT")!;
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    void writer.write(new Uint8Array(idat.data));
    void writer.close();
    const raw = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    assert.deepEqual([...raw.subarray(1, 9)], [255, 0, 68, 128, 0, 0, 0, 0]);
  });
});

describe("encodeApng — sınır durumları", () => {
  test("karesiz çağrı açık hata verir", async () => {
    await assert.rejects(() => encodeApng([], 4, 4), /at least one frame/i);
  });

  test("tek kare de geçerli dosya üretir (acTL + IDAT, fdAT yok)", async () => {
    const { chunks } = parse((await encoded(4, 4, 1)).bytes);
    assert.deepEqual(
      chunks.map((c) => c.type),
      ["IHDR", "acTL", "fcTL", "IDAT", "IEND"],
    );
  });

  test("stats gerçek boyutu ve sıkıştırma durumunu bildirir", async () => {
    const { bytes, stats } = await encoded(8, 8, 2);
    assert.equal(stats.frames, 2);
    assert.equal(stats.bytes, bytes.length);
    assert.equal(typeof stats.compressed, "boolean");
  });

  test("1×1 tuval çökmez", async () => {
    const { chunks } = parse(
      (await (async () => {
        const { blob } = await encodeApng(
          [{ data: new Uint8ClampedArray([1, 2, 3, 4]), durationCs: 10 }],
          1,
          1,
        );
        return new Uint8Array(await blob.arrayBuffer());
      })()),
    );
    assert.ok(chunks.some((c) => c.type === "IEND"));
  });
});
