/**
 * Nibble — otomatik kayıt testleri
 *
 * Telefonda iş kaybettiren hataların kilidi: belge değişince bekleyen kayıt
 * iptal edilmemeli, açılıştaki geri yükleme bitmeden hiçbir şey yazılmamalı,
 * dokunulmamış boş tuval diske düşmemeli. Gerçek PixelDocument ile ve sahte
 * saatle çalışıyor — setTimeout beklemiyoruz.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  AUTOSAVE_IDLE_MS,
  AUTOSAVE_SETTLE_MS,
  AutosaveController,
  projectHasPixels,
  type AutosaveScheduler,
} from "./autosave";
import { PixelDocument, blankProject } from "./pixel-document";
import { setPixel } from "./raster";
import type { Project, RGBA } from "./types";

const RED: RGBA = [255, 0, 0, 255];

/** Elle ilerletilen saat */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const scheduler: AutosaveScheduler = {
    set(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clear(h) {
      timers.delete(h as number);
    },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of timers) if (e[1].at <= until && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = until;
  };
  return { scheduler, advance, pending: () => timers.size };
}

function setup() {
  const clock = fakeClock();
  const saved: Project[] = [];
  const ctl = new AutosaveController<Project>({
    persist: (p) => {
      saved.push(p);
    },
    scheduler: clock.scheduler,
  });
  return { clock, saved, ctl };
}

/** Kullanıcının bir fırça darbesi: pointerdown → pointermove'lar → pointerup */
function stroke(doc: PixelDocument, x: number) {
  const f = doc.frames[0].id;
  const l = doc.layers[0].id;
  doc.beginBatch("Kalem");
  doc.notify("pixels");
  setPixel(doc.cel(f, l), x, 0, doc.width, doc.height, RED);
  doc.notify("pixels");
  doc.endBatch();
  doc.notify("pixels");
}

describe("otomatik kayıt — belge değişimi", () => {
  test("belge değişince bekleyen kayıt İPTAL edilmez, eski proje yazılır", () => {
    const { clock, saved, ctl } = setup();
    ctl.markReady();
    const a = new PixelDocument(blankProject(8, 8));
    ctl.attach(a, { dirty: false });
    // darbe sürerken (batch açık) bildirim: uzun birleştirme zamanlayıcısı
    a.beginBatch("Kalem");
    a.notify("pixels");
    clock.advance(100);
    assert.equal(saved.length, 0);

    const b = new PixelDocument(blankProject(16, 16));
    ctl.attach(b, { dirty: true });
    assert.equal(saved.length, 1, "eski proje belge değişiminde hemen yazılmalı");
    assert.equal(saved[0], a.project);

    clock.advance(AUTOSAVE_SETTLE_MS);
    assert.equal(saved.length, 2);
    assert.equal(saved[1], b.project, "yeni belge de kısa süre sonra kaydedilir");
  });

  test("kirli değilken belge değişimi gereksiz yazım yapmaz", () => {
    const { saved, ctl } = setup();
    ctl.markReady();
    ctl.attach(new PixelDocument(blankProject(8, 8)), { dirty: false });
    ctl.attach(new PixelDocument(blankProject(8, 8)), { dirty: false });
    assert.equal(saved.length, 0);
  });

  test("aynı belge yeniden bağlanırsa (dil değişimi vb.) bekleyen kayıt düşmez", () => {
    const { clock, saved, ctl } = setup();
    ctl.markReady();
    const a = new PixelDocument(blankProject(8, 8));
    ctl.attach(a, { dirty: false });
    stroke(a, 1);
    ctl.attach(a, { dirty: false });
    clock.advance(AUTOSAVE_SETTLE_MS);
    assert.equal(saved.length, 1);
    assert.equal(ctl.isDirty, false);
  });

  test("ajan newProject: aynı belgede replaceProject eski projeyi önce yazar", () => {
    const { saved, ctl } = setup();
    ctl.markReady();
    const doc = new PixelDocument(blankProject(8, 8));
    ctl.attach(doc, { dirty: false });
    stroke(doc, 2);
    const old = doc.project;
    doc.replaceProject(blankProject(32, 32));
    assert.equal(saved.length, 1);
    assert.equal(saved[0], old);
  });

  test("detach (sökülme) bekleyeni yazar", () => {
    const { saved, ctl } = setup();
    ctl.markReady();
    const doc = new PixelDocument(blankProject(8, 8));
    ctl.attach(doc, { dirty: false });
    stroke(doc, 0);
    ctl.detach();
    assert.equal(saved.length, 1);
  });
});

describe("otomatik kayıt — açılıştaki geri yükleme", () => {
  test("markReady'den önce hiçbir şey yazılmaz — ne zamanlayıcı ne flush", () => {
    const { clock, saved, ctl } = setup();
    const blank = new PixelDocument(blankProject(8, 8));
    ctl.attach(blank, { dirty: false });
    stroke(blank, 3);
    clock.advance(AUTOSAVE_IDLE_MS * 10);
    ctl.flush(); // sekme gizlendi
    assert.equal(saved.length, 0);
    assert.equal(clock.pending(), 0);

    // geri yüklenen belge gelir, eski boş belge yazılmadan bırakılır
    const restored = new PixelDocument(blankProject(16, 16));
    ctl.attach(restored, { dirty: true });
    assert.equal(saved.length, 0);

    ctl.markReady();
    clock.advance(AUTOSAVE_SETTLE_MS);
    assert.deepEqual(saved, [restored.project]);
  });

  test("dokunulmamış boş başlangıç belgesi hazır olunca da yazılmaz", () => {
    const { clock, saved, ctl } = setup();
    ctl.attach(new PixelDocument(blankProject(8, 8)), { dirty: false });
    ctl.markReady();
    clock.advance(AUTOSAVE_IDLE_MS * 10);
    ctl.flush();
    assert.equal(saved.length, 0);
  });

  test("geri yükleme başarısızsa, beklerken çizilen iş hazır olunca yazılır", () => {
    const { clock, saved, ctl } = setup();
    const blank = new PixelDocument(blankProject(8, 8));
    ctl.attach(blank, { dirty: false });
    stroke(blank, 4);
    ctl.markReady();
    clock.advance(AUTOSAVE_SETTLE_MS);
    assert.deepEqual(saved, [blank.project]);
  });
});

describe("otomatik kayıt — zamanlama", () => {
  test("işlem bitince kısa gecikmeyle yazar, darbe sürerken yazmaz", () => {
    const { clock, saved, ctl } = setup();
    ctl.markReady();
    const doc = new PixelDocument(blankProject(8, 8));
    ctl.attach(doc, { dirty: false });
    const f = doc.frames[0].id;
    const l = doc.layers[0].id;
    doc.beginBatch("Kalem");
    for (let i = 0; i < 20; i++) {
      setPixel(doc.cel(f, l), i % 8, 1, doc.width, doc.height, RED);
      doc.notify("pixels");
      clock.advance(100); // uzun darbe: 2 sn boyunca pointermove
    }
    assert.equal(saved.length, 0, "darbe sürerken her pointermove'da yazmamalı");
    doc.endBatch();
    doc.notify("pixels");
    clock.advance(AUTOSAVE_SETTLE_MS - 1);
    assert.equal(saved.length, 0);
    clock.advance(1);
    assert.equal(saved.length, 1);
  });

  test("art arda işlemler tek yazıma birleşir", () => {
    const { clock, saved, ctl } = setup();
    ctl.markReady();
    const doc = new PixelDocument(blankProject(8, 8));
    ctl.attach(doc, { dirty: false });
    stroke(doc, 0);
    clock.advance(100);
    doc.undo();
    clock.advance(100);
    doc.redo();
    clock.advance(AUTOSAVE_SETTLE_MS);
    assert.equal(saved.length, 1);
  });

  test("kayıt başarısızsa proje kirli kalır, sonraki flush yeniden dener", async () => {
    const clock = fakeClock();
    let fail = true;
    const saved: Project[] = [];
    const errors: unknown[] = [];
    const ctl = new AutosaveController<Project>({
      persist: async (p) => {
        if (fail) throw new Error("kota dolu");
        saved.push(p);
      },
      onError: (e) => errors.push(e),
      scheduler: clock.scheduler,
    });
    ctl.markReady();
    const doc = new PixelDocument(blankProject(8, 8));
    ctl.attach(doc, { dirty: false });
    stroke(doc, 0);
    clock.advance(AUTOSAVE_SETTLE_MS);
    await new Promise((r) => setImmediate(r));
    assert.equal(errors.length, 1);
    assert.equal(ctl.isDirty, true);
    assert.equal(clock.pending(), 0, "kendi kendine yeniden denemez (toast yağmuru olmasın)");
    fail = false;
    ctl.flush();
    await new Promise((r) => setImmediate(r));
    assert.equal(saved.length, 1);
    assert.equal(ctl.isDirty, false);
  });
});

describe("projectHasPixels", () => {
  test("boş proje false, tek görünür piksel true", () => {
    const doc = new PixelDocument(blankProject(4, 4));
    assert.equal(projectHasPixels(doc.project), false);
    stroke(doc, 1);
    assert.equal(projectHasPixels(doc.project), true);
  });
});
