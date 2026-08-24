/**
 * Nibble — belge modeli testleri
 *
 * Buradaki testler kullanıcının İŞİNİ KAYBETME senaryolarını kapatıyor:
 * geri alma yanlış şeyi geri alırsa, batch adımları ayrı ayrı yığına
 * girerse, veya "kare ekle" sessizce kopya üretirse kullanıcı bunu ancak
 * bir şey bozulduktan sonra fark eder.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { PixelDocument, blankProject } from "./pixel-document";
import { getPixel, setPixel } from "./raster";
import { paletteToRgb } from "./image-to-pixels";
import {
  FPS_OPTIONS,
  csToFps,
  fpsToCs,
  hexToRgba,
  isHex,
  normaliseHex,
  rgbaToHex,
  type RGBA,
} from "./types";

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];

const make = (w = 8, h = 8) => new PixelDocument(blankProject(w, h, ["#000000"], "t"));
const solid = (doc: PixelDocument, i = 0) => {
  const buf = doc.composite(i);
  let n = 0;
  for (let k = 3; k < buf.length; k += 4) if (buf[k] > 0) n++;
  return n;
};

describe("geçmiş: delta tabanlı geri alma", () => {
  test("tek fırça darbesi geri alınır ve ileri alınır", () => {
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;

    doc.run("Kalem", () => doc.paint([{ x: 2, y: 2 }], RED, f, l));
    assert.equal(solid(doc), 1);

    doc.undo();
    assert.equal(solid(doc), 0, "geri alma pikseli silmedi");

    doc.redo();
    assert.equal(solid(doc), 1, "ileri alma pikseli geri getirmedi");
    assert.deepEqual([...getPixel(doc.composite(0), 2, 2, 8, 8)], RED);
  });

  test("batch içindeki çok adım TEK geçmiş kaydı olur", () => {
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;

    doc.beginBatch("çok adım");
    for (let x = 0; x < 5; x++) doc.paint([{ x, y: 0 }], RED, f, l);
    doc.endBatch();

    assert.equal(solid(doc), 5);
    doc.undo();
    assert.equal(solid(doc), 0, "tek undo hepsini silmeli");
    assert.equal(doc.canUndo(), false, "birden fazla kayıt oluşmuş");
  });

  test("hiçbir şey değişmediyse geçmişe kayıt düşmez", () => {
    const doc = make();
    doc.beginBatch("boş");
    assert.equal(doc.endBatch(), false);
    assert.equal(doc.canUndo(), false);
  });

  test("yeni işlem redo yığınını temizler", () => {
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.run("a", () => doc.paint([{ x: 0, y: 0 }], RED, f, l));
    doc.undo();
    assert.equal(doc.canRedo(), true);
    doc.run("b", () => doc.paint([{ x: 1, y: 1 }], BLUE, f, l));
    assert.equal(doc.canRedo(), false, "redo yığını temizlenmedi");
  });

  test("undoLabel kullanıcıya gösterilecek etiketi verir", () => {
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.run("Kova", () => doc.paint([{ x: 0, y: 0 }], RED, f, l));
    assert.equal(doc.undoLabel(), "Kova");
  });

  test("iç içe run dıştaki batch'i bozmaz — tek adım kalır", () => {
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.run("dış", () => {
      doc.paint([{ x: 0, y: 0 }], RED, f, l);
      doc.run("iç", () => doc.paint([{ x: 1, y: 0 }], RED, f, l));
    });
    doc.undo();
    assert.equal(solid(doc), 0, "iç içe run ayrı kayıt oluşturdu");
  });
});

describe("kilitli katman", () => {
  test("paint kilitli katmana yazmaz", () => {
    const doc = make();
    const l = doc.layers[0].id;
    doc.setLayerProps(l, { locked: true });
    doc.run("x", () => doc.paint([{ x: 1, y: 1 }], RED, doc.frames[0].id, l));
    assert.equal(solid(doc), 0);
  });

  test("editCel kilitli katmanda false döner", () => {
    const doc = make();
    const l = doc.layers[0].id;
    doc.setLayerProps(l, { locked: true });
    const ok = doc.editCel(doc.frames[0].id, l, (cel, w, h) => setPixel(cel, 0, 0, w, h, RED));
    assert.equal(ok, false);
    assert.equal(solid(doc), 0);
  });

  test("editCel olmayan karede false döner", () => {
    const doc = make();
    assert.equal(doc.editCel("yok", doc.layers[0].id, () => {}), false);
  });
});

describe("kareler", () => {
  test("addFrame() BOŞ kare ekler, addFrame(0) KOPYA ekler", () => {
    // bu ikisi bir dönem aynı şeyi yapıyordu; ayrımı test kilitliyor
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.run("seed", () => doc.paint([{ x: 1, y: 1 }], RED, f, l));

    const blankIndex = doc.addFrame();
    assert.equal(solid(doc, blankIndex), 0, "addFrame() kopya üretti");

    const copyIndex = doc.addFrame(0);
    assert.equal(solid(doc, copyIndex), 1, "addFrame(0) kopyalamadı");
  });

  test("addFrame(i) kopyayı hemen i+1'e sokar", () => {
    const doc = make();
    doc.addFrame();
    doc.addFrame();
    assert.equal(doc.frames.length, 3);
    const index = doc.addFrame(0);
    assert.equal(index, 1, "kopya kaynağın hemen ardına gelmedi");
  });

  test("son kare silinemez", () => {
    const doc = make();
    assert.equal(doc.deleteFrame(0), false);
    assert.equal(doc.frames.length, 1);
  });

  test("kare silme geri alınabilir", () => {
    const doc = make();
    doc.addFrame();
    const id = doc.frames[1].id;
    doc.deleteFrame(1);
    assert.equal(doc.frames.length, 1);
    doc.undo();
    assert.equal(doc.frames.length, 2);
    assert.equal(doc.frames[1].id, id, "aynı kare geri gelmedi");
  });

  test("moveFrame sırayı değiştirir ve geri alınabilir", () => {
    const doc = make();
    doc.addFrame();
    doc.addFrame();
    const ids = doc.frames.map((f) => f.id);
    doc.moveFrame(0, 2);
    assert.deepEqual(doc.frames.map((f) => f.id), [ids[1], ids[2], ids[0]]);
    doc.undo();
    assert.deepEqual(doc.frames.map((f) => f.id), ids);
  });

  test("setFps tüm kare sürelerini birlikte günceller", () => {
    const doc = make();
    doc.addFrame();
    doc.setFps(25);
    assert.equal(doc.project.fps, 25);
    for (const f of doc.frames) assert.equal(f.durationCs, 4);
  });
});

describe("katmanlar", () => {
  test("son katman silinemez", () => {
    const doc = make();
    assert.equal(doc.deleteLayer(doc.layers[0].id), false);
  });

  test("katman silme pikselleriyle birlikte geri gelir", () => {
    const doc = make();
    const id = doc.addLayer("üst");
    doc.run("seed", () => doc.paint([{ x: 3, y: 3 }], RED, doc.frames[0].id, id));
    assert.equal(solid(doc), 1);

    doc.deleteLayer(id);
    assert.equal(solid(doc), 0);

    doc.undo();
    assert.equal(solid(doc), 1, "katman geri geldi ama pikselleri gelmedi");
  });

  test("addLayer her kareye cel açar", () => {
    const doc = make();
    doc.addFrame();
    const id = doc.addLayer("yeni");
    for (const f of doc.frames) assert.ok(f.cels[id], "kare cel'siz kaldı");
  });

  test("moveLayer sırayı değiştirir", () => {
    const doc = make();
    const b = doc.addLayer("b");
    const before = doc.layers.map((l) => l.id);
    doc.moveLayer(before.length - 1, 0);
    assert.equal(doc.layers[0].id, b);
  });
});

describe("resize", () => {
  test("sol-üst hizalı kırpar — içerik aynı koordinatta kalır", () => {
    const doc = make(8, 8);
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.run("seed", () => doc.paint([{ x: 1, y: 1 }], RED, f, l));

    doc.resize(4, 4);
    assert.equal(doc.width, 4);
    assert.deepEqual([...getPixel(doc.composite(0), 1, 1, 4, 4)], RED, "içerik kaydı");
  });

  test("küçültme sığmayan pikselleri atar", () => {
    const doc = make(8, 8);
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.run("seed", () => doc.paint([{ x: 7, y: 7 }], RED, f, l));
    doc.resize(4, 4);
    assert.equal(solid(doc), 0);
  });

  test("boyut değişimi geçmişi sıfırlar", () => {
    // eski deltalar yeni buffer boyutuna uymuyor; tutmak bozuk geri alma demek
    const doc = make(8, 8);
    doc.run("seed", () => doc.paint([{ x: 1, y: 1 }], RED, doc.frames[0].id, doc.layers[0].id));
    assert.equal(doc.canUndo(), true);
    doc.resize(6, 6);
    assert.equal(doc.canUndo(), false, "boyut değişiminden sonra geçmiş temizlenmedi");
  });
});

describe("rig deltası", () => {
  test("setRig geri alınabilir", () => {
    const doc = make();
    doc.setRig({ nodes: [{ name: "a", pos: {} }], bones: [] });
    assert.equal(doc.rig!.nodes.length, 1);
    doc.undo();
    assert.equal(doc.rig, undefined);
  });

  test("updateRig kopya üstünde çalışır — dışarıdaki nesne mutasyona uğramaz", () => {
    const doc = make();
    const original = { nodes: [{ name: "a", pos: {} }], bones: [] };
    doc.setRig(original);
    doc.updateRig("ekle", (rig) => rig.nodes.push({ name: "b", pos: {} }));
    assert.equal(original.nodes.length, 1, "çağıranın nesnesi değişti");
    assert.equal(doc.rig!.nodes.length, 2);
  });
});

describe("types: renk ve zamanlama sözleşmeleri", () => {
  test("hex → rgba → hex gidiş dönüş kayıpsız", () => {
    for (const hex of ["#000000", "#ffffff", "#ef7d57", "#73eff7"]) {
      assert.equal(rgbaToHex(hexToRgba(hex)), hex);
    }
  });

  test("3 haneli hex genişletilir", () => {
    assert.deepEqual(hexToRgba("#f0a"), [255, 0, 170, 255]);
  });

  test("8 haneli hex alfayı okur", () => {
    assert.equal(hexToRgba("#ff004480")[3], 128);
  });

  test("bozuk hex çökmez, siyaha düşer", () => {
    assert.deepEqual(hexToRgba("#zzzzzz"), [0, 0, 0, 255]);
  });

  test("ARADAKİ uzunluklar geçersiz — 4/5/7 hane hex değil", () => {
    /**
     * Doğrulama `{3,8}` gibi bir aralıkla yapılınca 4/5/7 hane kabul ediliyor
     * ama hiçbir ayrıştırıcı doğru çözemiyor: "#12345" sessizce yanlış renge
     * dönüşüyordu. Kabul edilen küme tam olarak 3/6/8.
     */
    for (const ok of ["#f0a", "f0a", "#ef7d57", "#ff004480"]) {
      assert.equal(isHex(ok), true, `${ok} reddedildi`);
    }
    for (const bad of ["#12", "#1234", "#12345", "#1234567", "#123456789", "kırmızı", "", 7, null]) {
      assert.equal(isHex(bad), false, `${String(bad)} kabul edildi`);
    }
  });

  test("normaliseHex '#' ekliyor ve küçük harfe çeviriyor", () => {
    // CSS'te "f0a" geçersiz renk; palet doğrudan style'a yazıldığı için
    // swatch bomboş kalıyordu.
    assert.equal(normaliseHex("f0a"), "#f0a");
    assert.equal(normaliseHex("EF7D57"), "#ef7d57");
    assert.equal(normaliseHex(" #Ef7D57 "), "#ef7d57");
    assert.equal(normaliseHex("#ef7d57"), "#ef7d57");
  });

  test("hex ayrıştırma TEK yerden geçiyor — resim aktarma dahil", () => {
    // imageToPixels kendi parseInt'ini kullanıyordu ve 3 haneli hex'i
    // açmadığı için aynı renk iki yerde iki farklı sonuç veriyordu:
    // "#f0a" tuvalde (255,0,170), aktarmada (0,15,10) oluyordu.
    for (const hex of ["#f0a", "#ef7d57", "#73eff7"]) {
      const [r, g, b] = hexToRgba(hex);
      assert.deepEqual(paletteToRgb([hex]), [[r, g, b]], `${hex} iki yerde farklı çözüldü`);
    }
  });

  test("TÜM FPS seçenekleri tam sayı santisaniyeye oturur", () => {
    /**
     * Gerçek değişmez şu: GIF kare süresini TAM SAYI santisaniye tutuyor,
     * yani 100/fps tam sayı olmak zorunda. "fps 100'ün böleni olmalı" diye
     * söylemek yanlış — 12.5 fps 100'ün böleni değil ama 100/12.5 = 8 cs,
     * tam sayı, dolayısıyla GIF'te birebir temsil ediliyor. Test gevşek
     * olmasın diye kesin ifadeyi kullanıyoruz.
     */
    for (const fps of FPS_OPTIONS) {
      assert.ok(Number.isInteger(100 / fps), `${fps} fps → ${100 / fps} cs (tam sayı değil)`);
      const cs = fpsToCs(fps);
      assert.equal(cs, 100 / fps, `${fps} fps yuvarlandı`);
      assert.equal(csToFps(cs), fps, `${fps} fps gidiş dönüşte değişti`);
    }
  });

  test("60 fps GIF'te temsil edilemez — listede olmaması gerekiyor", () => {
    assert.ok(!Number.isInteger(100 / 60));
    assert.ok(!(FPS_OPTIONS as readonly number[]).includes(60));
  });

  test("fpsToCs asla 0 döndürmez", () => {
    assert.ok(fpsToCs(1000) >= 1, "0 gecikme donmuş animasyon demek");
  });
});

/**
 * Denetimde çıkan geri-alma hataları (2026-08-21).
 *
 * Üçü de aynı sınıftan: geçmiş sessizce çalışmıyor. Kullanıcı bunu ancak
 * Ctrl+Z bir şey yapmadığında fark ediyor, o an da işi çoktan gitmiş oluyor.
 */
describe("geçmiş: sessiz kayıp senaryoları", () => {
  test("addFrame(aralık dışı) sona ekler ve geri alınabilir", () => {
    // Eskiden uydurma indeks kaydediliyordu: splice(100,0,x) ekliyor ama
    // splice(100,1) silmiyor, yani kare geri alınamıyordu.
    const doc = make();
    const index = doc.addFrame(99);
    assert.equal(index, 1, "dönen indeks gerçekte eklenen yer değil");
    assert.equal(doc.frames.length, 2);
    doc.undo();
    assert.equal(doc.frames.length, 1, "geri alma kareyi silmedi");
  });

  test("addFrame(aralık dışı) BOŞ kare ekler, kopya değil", () => {
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.run("seed", () => doc.paint([{ x: 1, y: 1 }], RED, f, l));
    assert.equal(solid(doc, doc.addFrame(-1)), 0);
  });

  test("setFps AÇIK bir batch'i kapatmaz", () => {
    // setFps elle beginBatch/endBatch çağırıyordu; beginBatch iç içe çağrıya
    // karşı korumalı ama endBatch değil, yani dıştaki batch'i kapatıyordu ve
    // sonrasındaki çizim hiçbir geçmiş adımına girmiyordu.
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;

    doc.beginBatch("AI: iş");
    doc.setFps(25);
    assert.equal(doc.batching, true, "setFps dıştaki batch'i kapattı");
    doc.paint([{ x: 1, y: 1 }], RED, f, l);
    assert.equal(doc.endBatch(), true, "batch kaydedilmedi");

    assert.equal(solid(doc), 1);
    doc.undo();
    assert.equal(solid(doc), 0, "ajanın çizimi geri alınamadı");
    assert.equal(doc.project.fps, 10, "fps de aynı adımda geri gelmeliydi");
  });

  test("run() içinden istisna çıksa bile batch kapanır", () => {
    // Açık kalan batch geçmişi öldürüyor: o noktadan sonra HİÇBİR işlem
    // undo yığınına girmiyor.
    const doc = make();
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;

    assert.throws(() =>
      doc.run("patlayan iş", () => {
        throw new RangeError("Array buffer allocation failed");
      }),
    );
    assert.equal(doc.batching, false, "istisna batch'i açık bıraktı");

    doc.run("sonraki iş", () => doc.paint([{ x: 2, y: 2 }], BLUE, f, l));
    assert.equal(doc.canUndo(), true, "istisnadan sonra geçmiş ölü");
    doc.undo();
    assert.equal(solid(doc), 0);
  });
});
