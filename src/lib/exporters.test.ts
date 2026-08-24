/**
 * Nibble — `.nibble` dosyası testleri
 *
 * `deserializeProject` GÜVENİLMEYEN veri okuyor: kullanıcının bir yerden
 * indirdiği dosya. Bir dönem `JSON.parse(...) as Project` yazıyordu ve
 * dosyanın söylediği her şeye inanıyordu; eksik alanlı bir dosya ayrıştırmayı
 * geçip tuval çiziminde patlıyor (beyaz ekran), `width: 100000` yazan bir
 * dosya ise sekmeyi kilitliyordu. Testler "şüpheli dosya reddedilir, sağlam
 * dosya birebir geri gelir" sözleşmesini tutuyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { deserializeProject, serializeProject } from "./exporters";
import { blankProject } from "./pixel-document";
import { MAX_CANVAS_SIDE, MAX_REGION_SIDE, type Project } from "./types";

function sample(): Project {
  const p = blankProject(4, 4, ["#1a1c2c", "#ef7d57"], "kedi");
  const cel = p.frames[0].cels[p.layers[0].id];
  cel[0] = 239;
  cel[1] = 125;
  cel[2] = 87;
  cel[3] = 255;
  p.rig = {
    nodes: [{ name: "kafa", pos: { [p.frames[0].id]: [1, 1] }, region: { dx: 0, dy: 0, w: 2, h: 2 } }],
    bones: [],
  };
  return p;
}

/** Dosyayı metin olarak bozup geri veriyoruz — gerçek senaryo bu */
function tamper(p: Project, fn: (raw: Record<string, unknown>) => void): string {
  const raw = JSON.parse(serializeProject(p)) as Record<string, unknown>;
  fn(raw);
  return JSON.stringify(raw);
}

describe(".nibble gidiş-dönüş", () => {
  test("sağlam dosya birebir geri geliyor", () => {
    const p = sample();
    const back = deserializeProject(serializeProject(p));
    assert.equal(back.width, 4);
    assert.equal(back.height, 4);
    assert.equal(back.name, "kedi");
    assert.equal(back.frames.length, 1);
    assert.deepEqual([...back.frames[0].cels[p.layers[0].id].slice(0, 4)], [239, 125, 87, 255]);
    assert.equal(back.rig?.nodes[0].name, "kafa");
    assert.deepEqual(back.rig?.nodes[0].region, { dx: 0, dy: 0, w: 2, h: 2 });
  });

  test("piksel verisi base64'te kayıpsız", () => {
    const p = blankProject(2, 2, [], "t");
    const cel = p.frames[0].cels[p.layers[0].id];
    for (let i = 0; i < cel.length; i++) cel[i] = i % 256;
    const back = deserializeProject(serializeProject(p));
    assert.deepEqual([...back.frames[0].cels[p.layers[0].id]], [...cel]);
  });
});

describe(".nibble doğrulama: bozuk dosya reddediliyor", () => {
  test("JSON değil", () => {
    assert.throws(() => deserializeProject("{bozuk"), /\.nibble/);
  });

  test("nesne değil", () => {
    assert.throws(() => deserializeProject("[1,2,3]"), /\.nibble/);
  });

  test("tuval tavanını aşan boyut — sekmeyi kilitleyen senaryo", () => {
    const p = sample();
    assert.throws(
      () => deserializeProject(tamper(p, (raw) => { raw.width = 100000; })),
      new RegExp(String(MAX_CANVAS_SIDE)),
    );
  });

  test("sıfır / kesirli / metin boyut", () => {
    const p = sample();
    for (const bad of [0, -4, 4.5, "4", null]) {
      assert.throws(() => deserializeProject(tamper(p, (raw) => { raw.height = bad; })));
    }
  });

  test("katman listesi yok", () => {
    const p = sample();
    assert.throws(() => deserializeProject(tamper(p, (raw) => { delete raw.layers; })));
    assert.throws(() => deserializeProject(tamper(p, (raw) => { raw.layers = []; })));
  });

  test("kare listesi yok", () => {
    const p = sample();
    assert.throws(() => deserializeProject(tamper(p, (raw) => { delete raw.frames; })));
  });

  test("cel boyutu tuvalle uyuşmuyor", () => {
    // Kontrol edilmezse belge sessizce bozuluyor: satırlar kayıyor ve
    // okunan pikseller tanımsız çıkıyor.
    const p = sample();
    assert.throws(
      () =>
        deserializeProject(
          tamper(p, (raw) => {
            const frames = raw.frames as { cels: Record<string, string> }[];
            const key = Object.keys(frames[0].cels)[0];
            frames[0].cels[key] = "AAAA";
          }),
        ),
      /cel boyutu/,
    );
  });

  test("cel base64 değil", () => {
    const p = sample();
    assert.throws(() =>
      deserializeProject(
        tamper(p, (raw) => {
          const frames = raw.frames as { cels: Record<string, string> }[];
          const key = Object.keys(frames[0].cels)[0];
          frames[0].cels[key] = "!!! bu base64 değil !!!";
        }),
      ),
    );
  });

  test("desteklenmeyen schemaVersion", () => {
    const p = sample();
    assert.throws(() => deserializeProject(tamper(p, (raw) => { raw.schemaVersion = 99; })));
  });
});

describe(".nibble doğrulama: onarılabilir alanlar reddedilmiyor", () => {
  test("geçersiz fps ve süre makul değere düşüyor — iş kaybedilmiyor", () => {
    const p = sample();
    const back = deserializeProject(
      tamper(p, (raw) => {
        raw.fps = 60; // GIF'te temsil edilemez
        (raw.frames as { durationCs: number }[])[0].durationCs = -5;
      }),
    );
    assert.equal(back.fps, 10);
    assert.ok(back.frames[0].durationCs >= 1);
  });

  test("geçersiz hex palet dışına atılıyor", () => {
    const p = sample();
    const back = deserializeProject(
      tamper(p, (raw) => { raw.palette = ["#ef7d57", "#12345", "kırmızı", 7]; }),
    );
    assert.deepEqual(back.palette, ["#ef7d57"]);
  });

  test("hex '#' ve küçük harfe normalleşiyor — palet doğrudan CSS'e yazılıyor", () => {
    // "f0a" geçerli hex sayılıyor ama CSS'te geçersiz renk: swatch bomboş
    // çıkıyor (tarayıcıda ölçüldü).
    const p = sample();
    const back = deserializeProject(tamper(p, (raw) => { raw.palette = ["f0a", "EF7D57"]; }));
    assert.deepEqual(back.palette, ["#f0a", "#ef7d57"]);
  });

  test("rig adları normalleşiyor — yoksa parça silinemez hâle geliyor", () => {
    // deleteNode/renameNode gelen adı normaliseRigName'den geçirip
    // karşılaştırıyor; depoda ham ad kalırsa hiçbir zaman eşleşmiyor.
    const p = sample();
    const back = deserializeProject(
      tamper(p, (raw) => {
        const rig = raw.rig as { nodes: { name: string }[]; bones: unknown[] };
        rig.nodes[0].name = "kol üst";
        rig.nodes.push({ name: "  göz!! ", pos: {} } as never);
        rig.bones = [{ name: "b 1", from: "kol üst", to: "  göz!! " }];
      }),
    );
    assert.deepEqual(back.rig?.nodes.map((n) => n.name), ["kol_üst", "göz"]);
    assert.deepEqual(back.rig?.bones, [{ name: "b_1", from: "kol_üst", to: "göz" }]);
  });

  test("normalleşince çakışan ikinci ad düşüyor", () => {
    const p = sample();
    const back = deserializeProject(
      tamper(p, (raw) => {
        const rig = raw.rig as { nodes: { name: string }[] };
        rig.nodes[0].name = "kol üst";
        rig.nodes.push({ name: "kol_üst", pos: {} } as never);
      }),
    );
    assert.equal(back.rig?.nodes.length, 1);
  });

  test("tavanı aşan rig kutusu düşürülüyor, düğüm korunuyor", () => {
    // Bu tam olarak ajan tarafındaki açığın dosya hâli: kutu w*h*4 baytlık
    // tampona dönüşüyor, doğrulanmazsa ilk movePart'ta tarayıcı patlıyor.
    const p = sample();
    const back = deserializeProject(
      tamper(p, (raw) => {
        const rig = raw.rig as { nodes: { region: { w: number; h: number } }[] };
        rig.nodes[0].region.w = MAX_REGION_SIDE + 1;
        rig.nodes[0].region.h = MAX_REGION_SIDE + 1;
      }),
    );
    assert.equal(back.rig?.nodes.length, 1, "düğüm gereksiz yere atıldı");
    assert.equal(back.rig?.nodes[0].region, undefined, "dev kutu içeri girdi");
  });

  test("sahipsiz kemik atılıyor", () => {
    const p = sample();
    const back = deserializeProject(
      tamper(p, (raw) => {
        const rig = raw.rig as { bones: unknown[] };
        rig.bones = [{ name: "b", from: "kafa", to: "olmayan_parça" }];
      }),
    );
    assert.deepEqual(back.rig?.bones, []);
  });
});
