/**
 * Nibble — seçim işlemleri testleri
 *
 * Seçim, rig ile aynı bölge primitiflerini kullanıyor. Buradaki testler
 * ikisinin AYNI sonucu vermeye devam ettiğini de kontrol ediyor: kopya kod
 * yazılırsa (veya biri değişip diğeri kalırsa) test kırılır.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  clearSelection,
  copySelection,
  cutSelection,
  fillSelection,
  moveSelection,
  pasteClip,
  rectContains,
  rectFromDrag,
  transformSelection,
} from "./selection-ops";
import { transformNode, defineNode, setNodeRegion } from "./rig-ops";
import { PixelDocument, blankProject } from "./pixel-document";
import { floodFill, getPixel, setPixel } from "./raster";
import type { RGBA } from "./types";

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

function doc16() {
  const doc = new PixelDocument(blankProject(16, 16, [], "t"));
  return { doc, layerId: doc.layers[0].id, frameId: doc.frames[0].id };
}

/** (x0,y0)-(x1,y1) kapsayıcı dikdörtgeni boya */
function paintBox(
  doc: PixelDocument,
  layerId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGBA = RED,
) {
  doc.run("seed", () =>
    doc.editCel(doc.frames[0].id, layerId, (cel, w, h) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPixel(cel, x, y, w, h, color);
    }),
  );
}
const at = (doc: PixelDocument, x: number, y: number) => [...getPixel(doc.composite(0), x, y, 16, 16)];
const solid = (doc: PixelDocument) => {
  const buf = doc.composite(0);
  let n = 0;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) n++;
  return n;
};

describe("rectFromDrag / rectContains", () => {
  test("ters sürükleme de normalize edilir", () => {
    assert.deepEqual(rectFromDrag({ x: 5, y: 5 }, { x: 2, y: 3 }), { x: 2, y: 3, w: 4, h: 3 });
  });

  test("tek piksel sürükleme 1×1 verir", () => {
    assert.deepEqual(rectFromDrag({ x: 4, y: 4 }, { x: 4, y: 4 }), { x: 4, y: 4, w: 1, h: 1 });
  });

  test("rectContains kenarları doğru sayar", () => {
    const r = { x: 2, y: 2, w: 3, h: 3 }; // 2..4
    assert.ok(rectContains(r, 2, 2));
    assert.ok(rectContains(r, 4, 4));
    assert.ok(!rectContains(r, 5, 4));
    assert.ok(!rectContains(r, 1, 2));
  });
});

describe("kopyala / kes / yapıştır", () => {
  test("kopyalama kaynağı DEĞİŞTİRMEZ", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 2, 2, 4, 4);
    const before = solid(doc);
    const res = copySelection(doc, { x: 2, y: 2, w: 3, h: 3 }, 0, layerId);
    assert.equal(res.ok, true);
    assert.equal(res.clip!.w, 3);
    assert.equal(solid(doc), before, "kopyalama tuvali değiştirdi");
  });

  test("kesme kaynağı temizler ama panoyu doldurur", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 2, 2, 4, 4);
    const res = cutSelection(doc, { x: 2, y: 2, w: 3, h: 3 }, 0, layerId);
    assert.equal(res.ok, true);
    assert.equal(solid(doc), 0, "kesilen alan temizlenmedi");
    // pano içeriği hâlâ dolu
    let opaque = 0;
    for (let i = 3; i < res.clip!.data.length; i += 4) if (res.clip!.data[i] > 0) opaque++;
    assert.equal(opaque, 9);
  });

  test("yapıştırma verilen noktaya yazar ve yeni seçimi döndürür", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 0, 0, 1, 1);
    const clip = copySelection(doc, { x: 0, y: 0, w: 2, h: 2 }, 0, layerId).clip!;

    const res = pasteClip(doc, clip, 0, layerId, { x: 10, y: 10 });
    assert.deepEqual(res.rect, { x: 10, y: 10, w: 2, h: 2 });
    assert.deepEqual(at(doc, 10, 10), RED);
    assert.deepEqual(at(doc, 0, 0), RED, "kaynak silindi");
  });

  test("konum verilmezse tuvalin ortasına yapıştırır", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 0, 0, 3, 3);
    const clip = copySelection(doc, { x: 0, y: 0, w: 4, h: 4 }, 0, layerId).clip!;
    const res = pasteClip(doc, clip, 0, layerId);
    assert.deepEqual(res.rect, { x: 6, y: 6, w: 4, h: 4 });
  });

  test("yapıştırma saydam pikselleri üstüne yazmaz", () => {
    const { doc, layerId } = doc16();
    // hedefte mavi bir piksel var, panoda o konumda saydam
    paintBox(doc, layerId, 5, 5, 5, 5, BLUE);
    const clip = { w: 2, h: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]) };
    pasteClip(doc, clip, 0, layerId, { x: 4, y: 5 });
    assert.deepEqual(at(doc, 4, 5), RED, "opak piksel yazılmadı");
    assert.deepEqual(at(doc, 5, 5), BLUE, "saydam piksel altını sildi");
  });

  test("yapıştırma tek geri alma adımı", () => {
    const { doc, layerId } = doc16();
    const clip = { w: 2, h: 2, data: new Uint8ClampedArray(16).fill(255) };
    pasteClip(doc, clip, 0, layerId, { x: 3, y: 3 });
    assert.equal(solid(doc), 4);
    doc.undo();
    assert.equal(solid(doc), 0);
  });

  test("kilitli katmanda kesme ve yapıştırma reddedilir", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 2, 2, 3, 3);
    doc.setLayerProps(layerId, { locked: true });
    assert.equal(cutSelection(doc, { x: 2, y: 2, w: 2, h: 2 }, 0, layerId).ok, false);
    assert.equal(
      pasteClip(doc, { w: 1, h: 1, data: new Uint8ClampedArray(4).fill(255) }, 0, layerId).ok,
      false,
    );
  });

  test("tuval dışındaki seçim kopyalanamaz", () => {
    const { doc, layerId } = doc16();
    assert.equal(copySelection(doc, { x: 40, y: 40, w: 2, h: 2 }, 0, layerId).ok, false);
  });
});

describe("taşıma ve silme", () => {
  test("moveSelection içeriği taşır ve yeni dikdörtgeni döndürür", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 2, 2, 3, 3);
    doc.beginBatch("taşı");
    const res = moveSelection(doc, { x: 2, y: 2, w: 2, h: 2 }, 5, 1, 0, layerId);
    doc.endBatch();
    assert.deepEqual(res.rect, { x: 7, y: 3, w: 2, h: 2 });
    assert.deepEqual(at(doc, 7, 3), RED);
    assert.deepEqual(at(doc, 2, 2), CLEAR);
  });

  test("üst üste binen taşımada kaynak yenmiyor", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 2, 2, 4, 2);
    doc.beginBatch("taşı");
    moveSelection(doc, { x: 2, y: 2, w: 3, h: 1 }, 1, 0, 0, layerId);
    doc.endBatch();
    assert.equal(solid(doc), 3, "piksel kaybı var");
  });

  test("clearSelection sadece seçimin içini siler", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 0, 0, 5, 5); // 36 piksel
    clearSelection(doc, { x: 0, y: 0, w: 3, h: 3 }, 0, layerId);
    assert.equal(solid(doc), 36 - 9);
    assert.deepEqual(at(doc, 4, 4), RED, "seçim dışı silindi");
  });

  test("fillSelection seçimi düz renkle doldurur", () => {
    const { doc, layerId } = doc16();
    fillSelection(doc, { x: 1, y: 1, w: 2, h: 2 }, BLUE, 0, layerId);
    assert.deepEqual(at(doc, 1, 1), BLUE);
    assert.deepEqual(at(doc, 3, 3), CLEAR);
  });

  test("fillSelection saydam renkle silme olarak da çalışır", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 0, 0, 3, 3);
    fillSelection(doc, { x: 0, y: 0, w: 2, h: 2 }, CLEAR, 0, layerId);
    assert.equal(solid(doc), 16 - 4);
  });
});

describe("dönüşümler rig ile AYNI sonucu verir", () => {
  test("seçimde flipX, rig'de flipX ile birebir aynı", () => {
    // ikisi rig.ts'teki transformRegionBuffer'ı paylaşıyor; ayrışırsa burada kırılır
    const box = { x: 2, y: 2, w: 4, h: 3 };

    const a = doc16();
    paintBox(a.doc, a.layerId, 2, 2, 3, 4); // asimetrik desen
    transformSelection(a.doc, box, "flipX", 0, a.layerId);

    const b = doc16();
    paintBox(b.doc, b.layerId, 2, 2, 3, 4);
    defineNode(b.doc, "p", 2, 2, 0);
    setNodeRegion(b.doc, "p", box, 0);
    transformNode(b.doc, "p", "flipX", 0, b.layerId);

    assert.deepEqual([...a.doc.composite(0)], [...b.doc.composite(0)]);
  });

  test("rotate90 kare olmayan seçimde en/boyu takas eder", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 2, 2, 6, 2); // 5×1
    const res = transformSelection(doc, { x: 2, y: 2, w: 5, h: 1 }, "rotate90", 0, layerId);
    assert.equal(res.rect!.w, 1);
    assert.equal(res.rect!.h, 5);
  });

  test("flipX iki kez uygulanınca tuval eski haline döner", () => {
    const { doc, layerId } = doc16();
    paintBox(doc, layerId, 2, 2, 5, 4);
    const before = [...doc.composite(0)];
    const box = { x: 2, y: 2, w: 4, h: 3 };
    transformSelection(doc, box, "flipX", 0, layerId);
    transformSelection(doc, box, "flipX", 0, layerId);
    assert.deepEqual([...doc.composite(0)], before);
  });
});

describe("kova seçime kırpılıyor", () => {
  test("clip verilince doldurma seçimin dışına taşmaz", () => {
    // seçim aktifken kova sadece seçimin içini boyamalı (Aseprite davranışı)
    const w = 8;
    const h = 4;
    const cel = new Uint8ClampedArray(w * h * 4);

    floodFill(cel, w, h, 0, 0, RED, 0, { x: 0, y: 0, w: 3, h: 2 });

    assert.equal(getPixel(cel, 0, 0, w, h)[3], 255, "seçim içi boyanmadı");
    assert.equal(getPixel(cel, 2, 1, w, h)[3], 255, "seçim içi köşe boyanmadı");
    assert.equal(getPixel(cel, 3, 0, w, h)[3], 0, "seçim dışına taştı (x)");
    assert.equal(getPixel(cel, 0, 2, w, h)[3], 0, "seçim dışına taştı (y)");
  });

  test("clip dışından başlatılan doldurma hiçbir şey yapmaz", () => {
    const w = 8;
    const h = 4;
    const cel = new Uint8ClampedArray(w * h * 4);
    floodFill(cel, w, h, 7, 3, RED, 0, { x: 0, y: 0, w: 2, h: 2 });
    assert.ok([...cel].every((v) => v === 0), "clip dışından boyama sızdı");
  });

  test("clip verilmezse eski davranış: tüm tuval", () => {
    const w = 4;
    const h = 4;
    const cel = new Uint8ClampedArray(w * h * 4);
    floodFill(cel, w, h, 0, 0, RED, 0);
    assert.equal(getPixel(cel, 3, 3, w, h)[3], 255);
  });
});
