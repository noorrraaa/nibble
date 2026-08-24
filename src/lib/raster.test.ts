/**
 * Nibble — raster matematiği testleri
 *
 * Buradaki her test bir HATA SINIFINI bekliyor, "fonksiyon çalışıyor mu"yu
 * değil. Örneğin bresenham testi piksel atlamayı arıyor — sıfırdan yazılan
 * her pixel art editörünün 1 numaralı hatası bu.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applySymmetry,
  brushPoints,
  colorsEqual,
  composite,
  ellipsePoints,
  floodFill,
  getPixel,
  line,
  pixelPerfect,
  rectPoints,
  setPixel,
} from "./raster";
import { hexToRgba, type Frame, type LayerMeta, type Point, type RGBA } from "./types";

const key = (p: Point) => `${p.x},${p.y}`;
const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];

function blank(w: number, h: number) {
  return new Uint8ClampedArray(w * h * 4);
}

describe("line (bresenham)", () => {
  test("uç noktaları içerir", () => {
    const pts = line(2, 3, 9, 7);
    assert.deepEqual(pts[0], { x: 2, y: 3 });
    assert.deepEqual(pts.at(-1), { x: 9, y: 7 });
  });

  test("HİÇ piksel atlamıyor — her adım 8-komşu", () => {
    // pointermove hızlı harekette atlama üretir; bresenham bunu kapatmalı
    for (const [x0, y0, x1, y1] of [
      [0, 0, 40, 3],
      [0, 0, 3, 40],
      [10, 10, -10, -30],
      [5, 5, 5, 5],
    ]) {
      const pts = line(x0, y0, x1, y1);
      for (let i = 1; i < pts.length; i++) {
        const dx = Math.abs(pts[i].x - pts[i - 1].x);
        const dy = Math.abs(pts[i].y - pts[i - 1].y);
        assert.ok(dx <= 1 && dy <= 1, `atlama var: ${key(pts[i - 1])} → ${key(pts[i])}`);
        assert.ok(dx + dy > 0, "aynı piksel iki kez");
      }
    }
  });

  test("tek noktalı çizgi tek piksel", () => {
    assert.equal(line(4, 4, 4, 4).length, 1);
  });
});

describe("pixelPerfect", () => {
  test("çapraz merdivendeki L köşesini eler", () => {
    // (0,0) → (1,0) → (1,1) üçlüsünde ortadaki köşe pikseli fazladır
    const pts = pixelPerfect([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    assert.equal(pts.length, 2, "L köşesi elenmedi");
    assert.ok(!pts.some((p) => p.x === 1 && p.y === 0));
  });

  test("düz çizgiye dokunmaz", () => {
    const straight = line(0, 0, 6, 0);
    assert.equal(pixelPerfect(straight).length, straight.length);
  });

  test("45° çizgide eleme yapmaz — köşe yok", () => {
    const diag = line(0, 0, 6, 6);
    assert.equal(pixelPerfect(diag).length, diag.length);
  });
});

describe("ellipsePoints", () => {
  test("tam sayı ızgarada kalır ve sınırı aşmaz", () => {
    const pts = ellipsePoints(2, 3, 11, 9, false);
    assert.ok(pts.length > 0);
    for (const p of pts) {
      assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), "kesirli koordinat");
      assert.ok(p.x >= 2 && p.x <= 11 && p.y >= 3 && p.y <= 9, `sınır dışı: ${key(p)}`);
    }
  });

  test("x ve y eksenlerine göre simetrik", () => {
    // ctx.arc() yerine bresenham kullanmanın gözle görülür karşılığı bu
    const x0 = 0;
    const x1 = 10;
    const y0 = 0;
    const y1 = 8;
    const set = new Set(ellipsePoints(x0, y0, x1, y1, false).map(key));
    for (const s of set) {
      const [x, y] = s.split(",").map(Number);
      assert.ok(set.has(key({ x: x1 - (x - x0), y })), `x aynası eksik: ${s}`);
      assert.ok(set.has(key({ x, y: y1 - (y - y0) })), `y aynası eksik: ${s}`);
    }
  });

  test("dolu elips boş olandan kesinlikle daha çok piksel içerir", () => {
    const hollow = ellipsePoints(0, 0, 12, 10, false).length;
    const filled = ellipsePoints(0, 0, 12, 10, true).length;
    assert.ok(filled > hollow, `dolu=${filled} boş=${hollow}`);
  });
});

describe("rectPoints", () => {
  test("boş dikdörtgen sadece çerçeve", () => {
    const pts = rectPoints(0, 0, 4, 4, false);
    // 5×5 çerçeve = 16 piksel
    assert.equal(new Set(pts.map(key)).size, 16);
  });

  test("dolu dikdörtgen tüm alan", () => {
    const pts = rectPoints(0, 0, 4, 4, true);
    assert.equal(new Set(pts.map(key)).size, 25);
  });

  test("ters sürüklemede de aynı sonuç", () => {
    const a = new Set(rectPoints(1, 1, 5, 4, true).map(key));
    const b = new Set(rectPoints(5, 4, 1, 1, true).map(key));
    assert.deepEqual([...a].sort(), [...b].sort());
  });
});

describe("floodFill", () => {
  test("duvarı geçmez", () => {
    const w = 7;
    const h = 5;
    const buf = blank(w, h);
    // x=3 sütununa dikey duvar
    for (let y = 0; y < h; y++) setPixel(buf, 3, y, w, h, BLUE);

    floodFill(buf, w, h, 0, 0, RED, 0);

    // sol taraf kırmızı
    assert.ok(colorsEqual(getPixel(buf, 0, 0, w, h), RED));
    assert.ok(colorsEqual(getPixel(buf, 2, 4, w, h), RED));
    // duvar mavi kaldı
    assert.ok(colorsEqual(getPixel(buf, 3, 2, w, h), BLUE));
    // sağ taraf DOKUNULMADI
    assert.ok(colorsEqual(getPixel(buf, 4, 0, w, h), [0, 0, 0, 0]));
    assert.ok(colorsEqual(getPixel(buf, 6, 4, w, h), [0, 0, 0, 0]));
  });

  test("tuval dışından başlatmak çökmez", () => {
    const buf = blank(4, 4);
    assert.doesNotThrow(() => floodFill(buf, 4, 4, -1, 99, RED, 0));
  });
});

describe("brushPoints", () => {
  test("boyut 1 tek piksel", () => {
    assert.equal(brushPoints(5, 5, 1, false).length, 1);
  });

  test("kare uç boyut² kadar piksel", () => {
    assert.equal(new Set(brushPoints(9, 9, 4, false).map(key)).size, 16);
  });

  test("daire uç kareden az piksel kaplar", () => {
    const sq = new Set(brushPoints(9, 9, 6, false).map(key)).size;
    const rd = new Set(brushPoints(9, 9, 6, true).map(key)).size;
    assert.ok(rd < sq, `daire=${rd} kare=${sq}`);
  });
});

describe("applySymmetry", () => {
  const pts = [{ x: 1, y: 2 }];

  test("none hiçbir şey eklemez", () => {
    assert.equal(applySymmetry(pts, "none", 10, 10).length, 1);
  });

  test("x aynası x → w-1-x", () => {
    const out = applySymmetry(pts, "x", 10, 10).map(key);
    assert.ok(out.includes("1,2"));
    assert.ok(out.includes("8,2"));
  });

  test("y aynası y → h-1-y", () => {
    const out = applySymmetry(pts, "y", 10, 10).map(key);
    assert.ok(out.includes("1,7"));
  });

  test("xy dört kopya üretir", () => {
    assert.equal(new Set(applySymmetry(pts, "xy", 10, 10).map(key)).size, 4);
  });
});

describe("composite", () => {
  const w = 2;
  const h = 1;

  function frameWith(cels: Record<string, Uint8ClampedArray>): Frame {
    return { id: "f", durationCs: 10, cels };
  }
  const layer = (id: string, over: Partial<LayerMeta> = {}): LayerMeta => ({
    id,
    name: id,
    visible: true,
    opacity: 1,
    locked: false,
    ...over,
  });

  test("gizli katman çıktıya girmez", () => {
    const bottom = blank(w, h);
    setPixel(bottom, 0, 0, w, h, RED);
    const top = blank(w, h);
    setPixel(top, 0, 0, w, h, BLUE);

    const out = composite(
      frameWith({ a: bottom, b: top }),
      [layer("a"), layer("b", { visible: false })],
      w,
      h,
    );
    assert.ok(colorsEqual(getPixel(out, 0, 0, w, h), RED), "gizli katman üstü kapattı");
  });

  test("üst katman alttakini kapatır", () => {
    const bottom = blank(w, h);
    setPixel(bottom, 0, 0, w, h, RED);
    const top = blank(w, h);
    setPixel(top, 0, 0, w, h, BLUE);

    const out = composite(frameWith({ a: bottom, b: top }), [layer("a"), layer("b")], w, h);
    assert.ok(colorsEqual(getPixel(out, 0, 0, w, h), BLUE));
  });

  test("opaklık 0 katmanı görünmez yapar", () => {
    const bottom = blank(w, h);
    setPixel(bottom, 0, 0, w, h, RED);
    const top = blank(w, h);
    setPixel(top, 0, 0, w, h, BLUE);

    const out = composite(
      frameWith({ a: bottom, b: top }),
      [layer("a"), layer("b", { opacity: 0 })],
      w,
      h,
    );
    assert.ok(colorsEqual(getPixel(out, 0, 0, w, h), RED));
  });
});

describe("colorsEqual + hexToRgba", () => {
  test("tolerans yakın tonları yakalar", () => {
    const a = hexToRgba("#404040");
    const b = hexToRgba("#454545");
    assert.ok(!colorsEqual(a, b, 0));
    assert.ok(colorsEqual(a, b, 16));
  });

  test("saydam ile opak asla eşit değil", () => {
    assert.ok(!colorsEqual([0, 0, 0, 0], [0, 0, 0, 255], 200));
  });
});
