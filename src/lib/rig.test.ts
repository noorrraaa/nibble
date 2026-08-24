/**
 * Nibble — rig testleri
 *
 * Hem saf matematik (rig.ts) hem belge üzerindeki işlemler (rig-ops.ts).
 * rig-ops testleri özellikle GERİ ALMA sözleşmesini kontrol ediyor: bir
 * sürükleme tek adım olmalı, ve geri alma pikselleri VE tutamağı birlikte
 * eski haline döndürmeli. İkisi ayrışırsa iskelet ile piksel birbirinden
 * kopar ve kullanıcı bunu ancak kaydettikten sonra fark eder.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  clipRect,
  emptyRig,
  moveRegion,
  nodePos,
  nodePosResolved,
  normaliseRigName,
  planTween,
  readRegion,
  recolorRegion,
  regionRect,
  rotateRegionBuffer,
  transformRegionBuffer,
  writeRegion,
} from "./rig";
import {
  defineNode,
  deleteBone,
  defineBone,
  moveNode,
  rotateNode,
  setNodePos,
  setNodeRegion,
  transformNode,
  tweenFrames,
} from "./rig-ops";
import { PixelDocument, blankProject } from "./pixel-document";
import { getPixel, setPixel } from "./raster";
import { MAX_REGION_SIDE, type RGBA, type RigNode } from "./types";

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];

/** w×h buffer, her pikselin R kanalı sırasını taşıyor → dönüşümler izlenebilir */
function numbered(w: number, h: number) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = i + 1;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}
const reds = (buf: Uint8ClampedArray) =>
  Array.from({ length: buf.length / 4 }, (_, i) => buf[i * 4]);

describe("transformRegionBuffer — kayıpsızlık", () => {
  test("flipX iki kez uygulanınca özdeşlik", () => {
    const src = numbered(4, 3);
    const once = transformRegionBuffer(src, 4, 3, "flipX");
    const twice = transformRegionBuffer(once.data, once.w, once.h, "flipX");
    assert.deepEqual(reds(twice.data), reds(src));
  });

  test("flipY iki kez uygulanınca özdeşlik", () => {
    const src = numbered(4, 3);
    const once = transformRegionBuffer(src, 4, 3, "flipY");
    const twice = transformRegionBuffer(once.data, once.w, once.h, "flipY");
    assert.deepEqual(reds(twice.data), reds(src));
  });

  test("rotate90 dört kez uygulanınca özdeşlik", () => {
    const src = numbered(4, 3);
    let cur: { data: Uint8ClampedArray; w: number; h: number } = { data: src, w: 4, h: 3 };
    for (let i = 0; i < 4; i++) {
      cur = transformRegionBuffer(cur.data, cur.w, cur.h, "rotate90");
    }
    assert.equal(cur.w, 4);
    assert.equal(cur.h, 3);
    assert.deepEqual(reds(cur.data), reds(src));
  });

  test("rotate90 kare olmayan bölgede en/boyu takas eder", () => {
    const out = transformRegionBuffer(numbered(5, 2), 5, 2, "rotate90");
    assert.equal(out.w, 2);
    assert.equal(out.h, 5);
  });

  test("rotate180 = flipX + flipY", () => {
    const src = numbered(4, 3);
    const direct = transformRegionBuffer(src, 4, 3, "rotate180");
    const a = transformRegionBuffer(src, 4, 3, "flipX");
    const b = transformRegionBuffer(a.data, a.w, a.h, "flipY");
    assert.deepEqual(reds(direct.data), reds(b.data));
  });

  test("hiçbir dönüşüm piksel KAYBETMEZ", () => {
    const src = numbered(4, 3);
    for (const op of ["flipX", "flipY", "rotate90", "rotate180", "rotate270"] as const) {
      const out = transformRegionBuffer(src, 4, 3, op);
      assert.deepEqual(reds(out.data).sort((x, y) => x - y), reds(src).sort((x, y) => x - y), op);
    }
  });
});

describe("rotateRegionBuffer — keyfi açı", () => {
  test("45° kutuyu döndürülmüş sınıra BÜYÜTÜR", () => {
    // aynı boyda döndürseydik köşeler kırpılır ve içerik gerçekten kaybolurdu
    const out = rotateRegionBuffer(numbered(4, 4), 4, 4, 45);
    assert.ok(out.w > 4 && out.h > 4, `büyümedi: ${out.w}×${out.h}`);
    assert.equal(out.w, Math.ceil(4 * Math.cos(Math.PI / 4) + 4 * Math.sin(Math.PI / 4)));
  });

  test("0° içeriği ve boyutu korur", () => {
    const src = numbered(3, 3);
    const out = rotateRegionBuffer(src, 3, 3, 0);
    assert.equal(out.w, 3);
    assert.equal(out.h, 3);
    assert.deepEqual(reds(out.data), reds(src));
  });

  test("saydam pikseller hedefe yazılmaz", () => {
    const src = new Uint8ClampedArray(2 * 2 * 4); // tamamen saydam
    const out = rotateRegionBuffer(src, 2, 2, 30);
    assert.ok([...out.data].every((v) => v === 0), "saydam kaynak opak çıktı üretti");
  });
});

describe("bölge okuma / yazma / taşıma", () => {
  test("moveRegion üst üste binen taşımada kaynağını yemez", () => {
    // önce oku → sonra eski yeri temizle → sonra yaz sırası bozulursa
    // 1 piksel sağa taşıma tüm bölgeyi siler
    const w = 6;
    const h = 1;
    const cel = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < 3; x++) setPixel(cel, x, 0, w, h, RED);

    moveRegion(cel, w, h, { x: 0, y: 0, w: 3, h: 1 }, 1, 0);

    assert.equal(getPixel(cel, 0, 0, w, h)[3], 0, "eski başlangıç temizlenmedi");
    for (let x = 1; x <= 3; x++) {
      assert.equal(getPixel(cel, x, 0, w, h)[3], 255, `${x} taşınmadı`);
    }
  });

  test("tuval dışına taşınan pikseller sessizce düşer, çökme olmaz", () => {
    const cel = new Uint8ClampedArray(4 * 4 * 4);
    setPixel(cel, 0, 0, 4, 4, RED);
    assert.doesNotThrow(() =>
      moveRegion(cel, 4, 4, { x: 0, y: 0, w: 2, h: 2 }, -10, -10),
    );
  });

  test("readRegion tuval dışını saydam okur", () => {
    const cel = new Uint8ClampedArray(2 * 2 * 4);
    setPixel(cel, 0, 0, 2, 2, RED);
    const out = readRegion(cel, 2, 2, { x: -1, y: -1, w: 3, h: 3 });
    // merkezde (0,0) olmalı, kenarlar saydam
    assert.equal(out[(1 * 3 + 1) * 4 + 3], 255);
    assert.equal(out[0 * 4 + 3], 0);
  });

  test("writeRegion saydam kaynak pikselini üstüne yazmaz", () => {
    const w = 2;
    const h = 1;
    const cel = new Uint8ClampedArray(w * h * 4);
    setPixel(cel, 0, 0, w, h, RED);
    const src = new Uint8ClampedArray(w * h * 4); // hepsi saydam
    writeRegion(cel, w, h, { x: 0, y: 0, w, h }, src);
    assert.deepEqual([...getPixel(cel, 0, 0, w, h)], RED, "saydam kaynak altını sildi");
  });

  test("clipRect tamamen dışarıdaki bölgeye null döner", () => {
    assert.equal(clipRect({ x: -9, y: -9, w: 2, h: 2 }, 8, 8), null);
    assert.deepEqual(clipRect({ x: -1, y: -1, w: 3, h: 3 }, 8, 8), {
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
  });
});

describe("recolorRegion", () => {
  const build = () => {
    const cel = new Uint8ClampedArray(3 * 1 * 4);
    setPixel(cel, 0, 0, 3, 1, RED);
    setPixel(cel, 1, 0, 3, 1, BLUE);
    return cel;
  };

  test("from verilirse sadece o rengi değiştirir", () => {
    const cel = build();
    const n = recolorRegion(cel, 3, 1, { x: 0, y: 0, w: 3, h: 1 }, RED, BLUE, 0);
    assert.equal(n, 1);
    assert.deepEqual([...getPixel(cel, 1, 0, 3, 1)], BLUE);
  });

  test("from null ise saydam olmayan HER pikseli boyar, saydamı bırakır", () => {
    const cel = build();
    const n = recolorRegion(cel, 3, 1, { x: 0, y: 0, w: 3, h: 1 }, null, RED, 0);
    assert.equal(n, 2, "saydam piksel de boyandı");
    assert.equal(getPixel(cel, 2, 0, 3, 1)[3], 0);
  });
});

describe("nodePosResolved", () => {
  const node: RigNode = { name: "n", pos: { f0: [1, 2] } };

  test("anahtar varsa onu verir", () => {
    assert.deepEqual(nodePosResolved(node, ["f0", "f1"], 0), { x: 1, y: 2 });
  });

  test("anahtarsız karede en yakın anahtarlı kareye düşer", () => {
    // kullanıcı her düğümü her karede işaretlemek zorunda kalmamalı
    assert.deepEqual(nodePosResolved(node, ["f0", "f1", "f2"], 2), { x: 1, y: 2 });
  });

  test("hiç anahtar yoksa null", () => {
    assert.equal(nodePosResolved({ name: "x", pos: {} }, ["f0"], 0), null);
  });

  test("nodePos yalnızca o karenin anahtarını verir, düşmez", () => {
    assert.equal(nodePos(node, "f1"), null);
  });
});

describe("regionRect", () => {
  test("göreli kutuyu mutlak koordinata çevirir", () => {
    const node: RigNode = { name: "n", pos: {}, region: { dx: -2, dy: -1, w: 5, h: 3 } };
    assert.deepEqual(regionRect(node, { x: 10, y: 10 }), { x: 8, y: 9, w: 5, h: 3 });
  });

  test("kutusu olmayan düğümde null", () => {
    assert.equal(regionRect({ name: "n", pos: {} }, { x: 0, y: 0 }), null);
  });
});

describe("planTween", () => {
  const rig = {
    nodes: [{ name: "leg", pos: { a: [0, 0] as [number, number], b: [0, 9] as [number, number] } }],
    bones: [],
  };

  test("istenen sayıda adım üretir", () => {
    assert.equal(planTween(rig, "a", "b", 3).length, 3);
  });

  test("ötelemeler tek yönde ve monoton artar", () => {
    const steps = planTween(rig, "a", "b", 3);
    const dys = steps.map((s) => s.offsets.leg.dy);
    assert.deepEqual(dys, [2, 5, 7]);
    for (let i = 1; i < dys.length; i++) assert.ok(dys[i] >= dys[i - 1]);
  });

  test("aynı konumdaki düğüm için öteleme üretmez", () => {
    const still = { nodes: [{ name: "s", pos: { a: [3, 3] as [number, number], b: [3, 3] as [number, number] } }], bones: [] };
    assert.deepEqual(planTween(still, "a", "b", 2)[0].offsets, {});
  });

  test("iki karede de anahtarı olmayan düğüm atlanır", () => {
    const partial = { nodes: [{ name: "p", pos: { a: [0, 0] as [number, number] } }], bones: [] };
    assert.deepEqual(planTween(partial, "a", "b", 2)[0].offsets, {});
  });
});

describe("normaliseRigName", () => {
  test("boşlukları alt çizgiye çevirir", () => {
    assert.equal(normaliseRigName("  sol  kol "), "sol_kol");
  });
  test("tehlikeli karakterleri atar", () => {
    assert.equal(normaliseRigName("kafa<>/\\|?*"), "kafa");
  });
  test("nokta ve tireyi korur", () => {
    assert.equal(normaliseRigName("arm.upper-L"), "arm.upper-L");
  });
  test("40 karakterde keser", () => {
    assert.equal(normaliseRigName("a".repeat(80)).length, 40);
  });
  test("ASCII olmayan HARFLERİ korur — arayüz iki dilli", () => {
    // `\w` yalnızca ASCII tanıdığı için "kol üst" → "kol_st", "göz" → "gz"
    // diye sessizce bozuluyordu.
    assert.equal(normaliseRigName("kol üst"), "kol_üst");
    assert.equal(normaliseRigName("göz"), "göz");
    assert.equal(normaliseRigName("sağ_şın"), "sağ_şın");
    assert.equal(normaliseRigName("çene"), "çene");
  });
  test("harf olmayan süsler yine gidiyor", () => {
    assert.equal(normaliseRigName("kafa#1!"), "kafa1");
  });
  test("emptyRig boş ama geçerli", () => {
    assert.deepEqual(emptyRig(), { nodes: [], bones: [] });
  });
});

/* ────────── belge üzerindeki işlemler ────────── */

function docWithBlock() {
  const doc = new PixelDocument(blankProject(16, 16, [], "t"));
  const layerId = doc.layers[0].id;
  const frameId = doc.frames[0].id;
  // (4,4)-(6,6) arası 3×3 blok
  doc.run("seed", () => {
    doc.editCel(frameId, layerId, (cel, w, h) => {
      for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) setPixel(cel, x, y, w, h, RED);
    });
  });
  return { doc, layerId, frameId };
}
const filled = (doc: PixelDocument, frameIndex = 0) => {
  const buf = doc.composite(frameIndex);
  let n = 0;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) n++;
  return n;
};

describe("rig-ops: tanımlama", () => {
  test("defineNode aynı adı iki kez kabul etmez", () => {
    const { doc } = docWithBlock();
    assert.equal(defineNode(doc, "head", 5, 5, 0).ok, true);
    assert.equal(defineNode(doc, "head", 8, 8, 0).ok, false);
  });

  test("ad normalize edilir ve boş ad reddedilir", () => {
    const { doc } = docWithBlock();
    const res = defineNode(doc, "  sol kol ", 5, 5, 0);
    assert.equal(res.name, "sol_kol");
    assert.equal(defineNode(doc, "<<<>>>", 1, 1, 0).ok, false);
  });

  test("setNodeRegion mutlak kutuyu tutamağa göreli saklar", () => {
    const { doc } = docWithBlock();
    defineNode(doc, "b", 5, 5, 0);
    setNodeRegion(doc, "b", { x: 4, y: 4, w: 3, h: 3 }, 0);
    assert.deepEqual(doc.rig!.nodes[0].region, { dx: -1, dy: -1, w: 3, h: 3 });
  });

  test("defineBone aynı parçayı kendine bağlamaz", () => {
    const { doc } = docWithBlock();
    defineNode(doc, "a", 2, 2, 0);
    assert.equal(defineBone(doc, "x", "a", "a").ok, false);
  });

  test("parça silinince sahipsiz kemik kalmaz", () => {
    const { doc } = docWithBlock();
    defineNode(doc, "a", 2, 2, 0);
    defineNode(doc, "b", 6, 6, 0);
    defineBone(doc, "link", "a", "b");
    assert.equal(doc.rig!.bones.length, 1);
    // deleteNode rig-ops'tan; burada doğrudan kemik silmeyi de sınıyoruz
    assert.equal(deleteBone(doc, "link").ok, true);
    assert.equal(doc.rig!.bones.length, 0);
  });
});

describe("rig-ops: taşıma ve geri alma sözleşmesi", () => {
  test("movePart pikselleri taşır ve piksel sayısı korunur", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    const before = filled(doc);

    assert.equal(moveNode(doc, "blk", 3, 0, 0, layerId).ok, true);

    assert.equal(filled(doc), before, "taşırken piksel kaybı");
    assert.equal(getPixel(doc.composite(0), 4, 5, 16, 16)[3], 0, "eski yer temizlenmedi");
    assert.equal(getPixel(doc.composite(0), 7, 5, 16, 16)[3], 255, "yeni yere gelmedi");
  });

  test("TEK geri alma pikselleri VE tutamağı birlikte döndürür", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    const frameId = doc.frames[0].id;

    moveNode(doc, "blk", 4, 2, 0, layerId);
    assert.deepEqual(doc.rig!.nodes[0].pos[frameId], [9, 7]);
    assert.equal(getPixel(doc.composite(0), 8, 6, 16, 16)[3], 255);

    doc.undo();

    assert.deepEqual(doc.rig!.nodes[0].pos[frameId], [5, 5], "tutamak geri gelmedi");
    assert.equal(getPixel(doc.composite(0), 4, 4, 16, 16)[3], 255, "pikseller geri gelmedi");
    assert.equal(getPixel(doc.composite(0), 8, 6, 16, 16)[3], 0, "yeni yer temizlenmedi");
  });

  test("setNodePos tutamağı taşır ama pikselleri BIRAKMAZ", () => {
    const { doc } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    setNodePos(doc, "blk", 12, 12, 0);
    assert.equal(getPixel(doc.composite(0), 4, 4, 16, 16)[3], 255, "pikseller taşındı");
  });

  test("kutusu olmayan parçada movePart sadece tutamağı taşır ve uyarır", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "handleOnly", 2, 2, 0);
    const res = moveNode(doc, "handleOnly", 3, 3, 0, layerId);
    assert.equal(res.ok, true);
    assert.equal(res.pixelsMoved, false);
    assert.match(String(res.hint), /setPartBox/);
  });

  test("kilitli katman reddedilir", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    doc.setLayerProps(layerId, { locked: true });
    const res = moveNode(doc, "blk", 1, 0, 0, layerId);
    assert.equal(res.ok, false);
    assert.match(String(res.error), /locked/i);
  });

  test("olmayan parça net hata verir", () => {
    const { doc, layerId } = docWithBlock();
    assert.match(String(moveNode(doc, "yok", 1, 1, 0, layerId).error), /No part named/);
  });
});

describe("rig-ops: dönüşümler kutuyu günceller", () => {
  test("rotate90 kare olmayan kutuda en/boyu takas eder VE kutuyu güncellenir", () => {
    // güncellenmezse bir sonraki taşımada kutu dışı pikseller geride kalır
    const doc = new PixelDocument(blankProject(16, 16, [], "t"));
    const layerId = doc.layers[0].id;
    const frameId = doc.frames[0].id;
    doc.run("seed", () =>
      doc.editCel(frameId, layerId, (cel, w, h) => {
        for (let x = 4; x < 9; x++) setPixel(cel, x, 4, w, h, RED); // 5×1
      }),
    );
    defineNode(doc, "bar", 4, 4, 0);
    setNodeRegion(doc, "bar", { x: 4, y: 4, w: 5, h: 1 }, 0);

    const res = transformNode(doc, "bar", "rotate90", 0, layerId);
    assert.equal(res.ok, true);
    const region = doc.rig!.nodes[0].region!;
    assert.equal(region.w, 1, "kutu genişliği güncellenmedi");
    assert.equal(region.h, 5, "kutu yüksekliği güncellenmedi");
  });

  test("45° döndürme kutuyu büyütür ve bunu bildirir", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    const res = rotateNode(doc, "blk", 45, 0, layerId);
    assert.equal(res.ok, true);
    assert.equal(res.lossless, false);
    assert.ok(doc.rig!.nodes[0].region!.w > 3, "kutu büyümedi");
  });

  test("90° katları kayıpsız işaretlenir", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    assert.equal(rotateNode(doc, "blk", 180, 0, layerId).lossless, true);
  });

  test("kutusu olmayan parça dönüştürülemez", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "h", 5, 5, 0);
    assert.equal(transformNode(doc, "h", "flipX", 0, layerId).ok, false);
  });
});

describe("rig-ops: tween", () => {
  function twoPoses() {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    doc.addFrame(0); // kare 1 = kopya
    setNodePos(doc, "blk", 5, 13, 1);
    return { doc, layerId };
  }

  test("ara kareleri DOĞRU SIRAYA yerleştirir", () => {
    // addFrame(copyFrom) her zaman copyFrom+1'e yazıyor; rig-ops adımları
    // ters sırada ekliyor. Sıra bozulursa animasyon geri geri oynar.
    const { doc, layerId } = twoPoses();
    const res = tweenFrames(doc, 0, 3, layerId);
    assert.equal(res.ok, true);
    assert.equal(doc.frames.length, 5, "kare sayısı yanlış");

    const ids = doc.frames.map((f) => f.id);
    const ys = ids.slice(1, 4).map((id) => doc.rig!.nodes[0].pos[id]?.[1]);
    for (let i = 1; i < ys.length; i++) {
      assert.ok(ys[i]! >= ys[i - 1]!, `sıra bozuk: ${ys.join(",")}`);
    }
  });

  test("sonraki kare yoksa açık hata verir", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    assert.match(String(tweenFrames(doc, 0, 2, layerId).error), /frame after/i);
  });

  test("iki karede de anahtarı olan parça yoksa reddeder", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    doc.addFrame(0);
    const res = tweenFrames(doc, 0, 2, layerId);
    assert.equal(res.ok, false);
    assert.match(String(res.error), /nothing to interpolate/i);
  });

  test("mesafe kısaysa kaç ara karenin farklı olabileceğini söyler", () => {
    const { doc, layerId } = docWithBlock();
    defineNode(doc, "blk", 5, 5, 0);
    setNodeRegion(doc, "blk", { x: 4, y: 4, w: 3, h: 3 }, 0);
    doc.addFrame(0);
    setNodePos(doc, "blk", 5, 7, 1); // sadece 2 piksel yol
    const res = tweenFrames(doc, 0, 4, layerId);
    assert.equal(res.ok, true);
    assert.equal(res.distinctPossible, 1);
    assert.match(String(res.hint), /hold frames/i);
  });

  test("tween TEK geri alma adımıdır", () => {
    const { doc, layerId } = twoPoses();
    const before = doc.frames.length;
    tweenFrames(doc, 0, 3, layerId);
    assert.equal(doc.frames.length, before + 3);
    doc.undo();
    assert.equal(doc.frames.length, before, "tek undo tüm ara kareleri silmeli");
  });
});

/**
 * Kutu tavanı — GÜVENLİK testi.
 *
 * Bölge işlemleri `w*h*4` baytlık bir tampon ayırıyor. Kutu doğrulanmadan
 * geçtiğinde (ajan `definePart({region})` ile doğrudan yazabiliyordu) tarayıcı
 * `RangeError: Array buffer allocation failed` fırlatıyor; istisna API
 * sözleşmesini bozuyor ve açık kalan batch geçmişi öldürüyordu.
 */
describe("rig-ops: kutu tavanı", () => {
  test("tavanı aşan kutu tanımlanamıyor", () => {
    const doc = new PixelDocument(blankProject(8, 8, ["#000000"], "t"));
    const res = defineNode(doc, "kol", 2, 2, 0, {
      dx: 0,
      dy: 0,
      w: MAX_REGION_SIDE + 1,
      h: MAX_REGION_SIDE + 1,
    });
    assert.equal(res.ok, false, "dev kutu depoya girdi");
    assert.match(String(res.error), /larger than/i);
    assert.equal(doc.rig, undefined, "reddedilen tanım rig'i kirletti");
  });

  test("setNodeRegion de tavanı uyguluyor", () => {
    const doc = new PixelDocument(blankProject(8, 8, ["#000000"], "t"));
    defineNode(doc, "kol", 2, 2, 0);
    const res = setNodeRegion(doc, "kol", { x: 0, y: 0, w: 99999, h: 99999 }, 0);
    assert.equal(res.ok, false);
    assert.equal(doc.rig?.nodes[0].region, undefined);
  });

  test("kutu ondalık/negatif verilse de tam sayı ve en az 1×1 oluyor", () => {
    const doc = new PixelDocument(blankProject(8, 8, ["#000000"], "t"));
    const res = defineNode(doc, "kol", 2, 2, 0, { dx: 1.6, dy: -0.4, w: 0, h: 2.7 });
    assert.equal(res.ok, true);
    assert.deepEqual(doc.rig?.nodes[0].region, { dx: 2, dy: 0, w: 1, h: 3 });
  });

  test("makul kutu hâlâ çalışıyor — tavan işi engellemiyor", () => {
    const doc = new PixelDocument(blankProject(8, 8, ["#000000"], "t"));
    const res = defineNode(doc, "kol", 2, 2, 0, { dx: 0, dy: 0, w: 4, h: 4 });
    assert.equal(res.ok, true);
    assert.deepEqual(doc.rig?.nodes[0].region, { dx: 0, dy: 0, w: 4, h: 4 });
  });
});
