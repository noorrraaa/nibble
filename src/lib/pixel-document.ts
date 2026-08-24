/**
 * Nibble — PixelDocument
 *
 * React'ten TAMAMEN bağımsız. Piksel buffer'ları React state'ine girmez;
 * girseydi her fırça hareketinde tüm ağaç yeniden render edilir ve 60fps çizim
 * 5fps'e düşerdi. React sadece metadata bilir, çizim imperatif yapılır.
 */

import {
  composite,
  floodFill,
  getPixel,
  replaceColor,
  setPixel,
  type ClipRect,
} from "./raster";
import {
  fpsToCs,
  type Frame,
  type Hex,
  type LayerMeta,
  type Point,
  type Project,
  type RGBA,
  type Rig,
  uid,
} from "./types";

type Listener = (reason: ChangeReason) => void;
export type ChangeReason = "pixels" | "structure" | "history";

interface PixelDelta {
  kind: "pixels";
  frameId: string;
  layerId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}
type StructDelta =
  | { kind: "frameInsert"; index: number; frame: Frame }
  | { kind: "frameRemove"; index: number; frame: Frame }
  | { kind: "frameMove"; from: number; to: number }
  | { kind: "frameDuration"; index: number; before: number; after: number }
  | {
      kind: "layerInsert";
      index: number;
      layer: LayerMeta;
      cels: Record<string, Uint8ClampedArray>;
    }
  | {
      kind: "layerRemove";
      index: number;
      layer: LayerMeta;
      cels: Record<string, Uint8ClampedArray>;
    }
  | { kind: "layerMove"; from: number; to: number }
  | {
      kind: "layerProps";
      id: string;
      before: Partial<LayerMeta>;
      after: Partial<LayerMeta>;
    }
  | { kind: "palette"; before: Hex[]; after: Hex[] }
  | { kind: "fps"; before: number; after: number }
  /** rig salt metadata ve minik JSON — tam kopya saklamak en basiti */
  | { kind: "rig"; before: Rig | undefined; after: Rig | undefined };

type Delta = PixelDelta | StructDelta;

interface HistoryEntry {
  label: string;
  deltas: Delta[];
  bytes: number;
}

const MAX_HISTORY = 150;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;

export function blankProject(
  width = 32,
  height = 32,
  palette: Hex[] = [],
  name = "Untitled",
): Project {
  const layerId = uid("lyr");
  const frame: Frame = {
    id: uid("frm"),
    durationCs: fpsToCs(10),
    cels: { [layerId]: new Uint8ClampedArray(width * height * 4) },
  };
  return {
    id: uid("prj"),
    name,
    width,
    height,
    palette,
    layers: [{ id: layerId, name: "Layer 1", visible: true, opacity: 1, locked: false }],
    frames: [frame],
    fps: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    schemaVersion: 1,
  };
}

/** Bir buffer'dan dikdörtgen bölge kopyalar */
function crop(
  src: Uint8ClampedArray,
  srcW: number,
  x: number,
  y: number,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * srcW + x) * 4;
    out.set(src.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

/** Dikdörtgen bölgeyi buffer'a yazar */
function blit(
  dst: Uint8ClampedArray,
  dstW: number,
  x: number,
  y: number,
  w: number,
  h: number,
  src: Uint8ClampedArray,
): void {
  for (let row = 0; row < h; row++) {
    dst.set(src.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * dstW + x) * 4);
  }
}

export class PixelDocument {
  project: Project;

  private listeners = new Set<Listener>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  private batchLabel: string | null = null;
  private batchDeltas: Delta[] = [];
  /** batch sırasında dokunulan cel'lerin tam kopyası; endBatch'te farkı alınır */
  private captures = new Map<
    string,
    { frameId: string; layerId: string; before: Uint8ClampedArray }
  >();

  constructor(project?: Project) {
    this.project = project ?? blankProject();
  }

  // ── abonelik ────────────────────────────────────────────────
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit(reason: ChangeReason) {
    this.project.updatedAt = Date.now();
    for (const fn of this.listeners) fn(reason);
  }
  notify(reason: ChangeReason = "pixels") {
    this.emit(reason);
  }

  // ── erişim ──────────────────────────────────────────────────
  get width() {
    return this.project.width;
  }
  get height() {
    return this.project.height;
  }
  get frames() {
    return this.project.frames;
  }
  get layers() {
    return this.project.layers;
  }

  frameAt(i: number): Frame {
    const clamped = Math.max(0, Math.min(i, this.project.frames.length - 1));
    return this.project.frames[clamped];
  }
  cel(frameId: string, layerId: string): Uint8ClampedArray {
    const frame = this.project.frames.find((f) => f.id === frameId);
    if (!frame) throw new Error(`Frame not found: ${frameId}`);
    let c = frame.cels[layerId];
    if (!c) {
      c = new Uint8ClampedArray(this.width * this.height * 4);
      frame.cels[layerId] = c;
    }
    return c;
  }
  layer(id: string): LayerMeta | undefined {
    return this.project.layers.find((l) => l.id === id);
  }

  composite(frameIndex: number, out?: Uint8ClampedArray): Uint8ClampedArray {
    return composite(this.frameAt(frameIndex), this.project.layers, this.width, this.height, out);
  }

  // ── geçmiş (batch) ──────────────────────────────────────────
  beginBatch(label: string) {
    if (this.batchLabel !== null) return; // iç içe batch: dıştaki kazanır
    this.batchLabel = label;
    this.batchDeltas = [];
    this.captures.clear();
  }

  /** Bir cel'e dokunmadan önce çağrılır — tam kopyasını saklar */
  private touch(frameId: string, layerId: string) {
    const key = `${frameId}/${layerId}`;
    if (this.captures.has(key)) return;
    this.captures.set(key, {
      frameId,
      layerId,
      before: this.cel(frameId, layerId).slice(),
    });
  }

  endBatch(): boolean {
    if (this.batchLabel === null) return false;
    const label = this.batchLabel;
    const deltas = this.batchDeltas;
    this.batchLabel = null;
    this.batchDeltas = [];

    const w = this.width;
    const h = this.height;

    // dokunulan her cel için değişimin sınırlayıcı kutusunu bul, sadece onu sakla
    for (const cap of this.captures.values()) {
      const frameExists = this.project.frames.some((f) => f.id === cap.frameId);
      if (!frameExists) continue;
      const after = this.cel(cap.frameId, cap.layerId);
      const before = cap.before;
      if (before.length !== after.length) continue; // boyut değişmiş
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (
            before[i] !== after[i] ||
            before[i + 1] !== after[i + 1] ||
            before[i + 2] !== after[i + 2] ||
            before[i + 3] !== after[i + 3]
          ) {
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x0 === Infinity) continue; // değişmemiş
      const rw = x1 - x0 + 1;
      const rh = y1 - y0 + 1;
      deltas.push({
        kind: "pixels",
        frameId: cap.frameId,
        layerId: cap.layerId,
        x: x0,
        y: y0,
        w: rw,
        h: rh,
        before: crop(before, w, x0, y0, rw, rh),
        after: crop(after, w, x0, y0, rw, rh),
      });
    }
    this.captures.clear();

    if (!deltas.length) return false;
    this.pushHistory({ label, deltas, bytes: estimateBytes(deltas) });
    return true;
  }

  /** Dışarıda açık bir batch var mı — iç içe işlemler buna bakıp kendi açmıyor */
  get batching(): boolean {
    return this.batchLabel !== null;
  }

  /**
   * Tek işlemi otomatik batch'ler.
   *
   * try/finally ŞART: fn() fırlatırsa (ör. bozuk bir kutu yüzünden tampon
   * ayrılamazsa) batch açık kalıyordu ve açık batch geçmişi öldürüyor —
   * o noktadan sonra hiçbir işlem undo yığınına girmiyor, kullanıcı da
   * bunu ancak Ctrl+Z işlemediğinde anlıyor.
   */
  run<T>(label: string, fn: () => T): T {
    const nested = this.batching;
    if (!nested) this.beginBatch(label);
    try {
      return fn();
    } finally {
      if (!nested) {
        this.endBatch();
        this.emit("pixels");
      }
    }
  }

  private pushHistory(entry: HistoryEntry) {
    this.undoStack.push(entry);
    this.redoStack.length = 0;
    let total = this.undoStack.reduce((a, e) => a + e.bytes, 0);
    while (
      this.undoStack.length > MAX_HISTORY ||
      (total > MAX_HISTORY_BYTES && this.undoStack.length > 1)
    ) {
      const dropped = this.undoStack.shift();
      total -= dropped?.bytes ?? 0;
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }
  undoLabel() {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return;
    for (let i = entry.deltas.length - 1; i >= 0; i--) this.applyDelta(entry.deltas[i], true);
    this.redoStack.push(entry);
    this.emit("history");
  }
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return;
    for (const d of entry.deltas) this.applyDelta(d, false);
    this.undoStack.push(entry);
    this.emit("history");
  }

  private applyDelta(d: Delta, revert: boolean) {
    const p = this.project;
    const blank = () => new Uint8ClampedArray(this.width * this.height * 4);
    switch (d.kind) {
      case "pixels": {
        if (!p.frames.some((f) => f.id === d.frameId)) return;
        const cel = this.cel(d.frameId, d.layerId);
        blit(cel, this.width, d.x, d.y, d.w, d.h, revert ? d.before : d.after);
        break;
      }
      case "frameInsert":
        if (revert) p.frames.splice(d.index, 1);
        else p.frames.splice(d.index, 0, d.frame);
        break;
      case "frameRemove":
        if (revert) p.frames.splice(d.index, 0, d.frame);
        else p.frames.splice(d.index, 1);
        break;
      case "frameMove": {
        const [from, to] = revert ? [d.to, d.from] : [d.from, d.to];
        const [f] = p.frames.splice(from, 1);
        p.frames.splice(to, 0, f);
        break;
      }
      case "frameDuration":
        if (p.frames[d.index]) p.frames[d.index].durationCs = revert ? d.before : d.after;
        break;
      case "layerInsert":
        if (revert) {
          p.layers.splice(d.index, 1);
          for (const f of p.frames) delete f.cels[d.layer.id];
        } else {
          p.layers.splice(d.index, 0, d.layer);
          for (const f of p.frames) f.cels[d.layer.id] = d.cels[f.id] ?? blank();
        }
        break;
      case "layerRemove":
        if (revert) {
          p.layers.splice(d.index, 0, d.layer);
          for (const f of p.frames) f.cels[d.layer.id] = d.cels[f.id] ?? blank();
        } else {
          p.layers.splice(d.index, 1);
          for (const f of p.frames) delete f.cels[d.layer.id];
        }
        break;
      case "layerMove": {
        const [from, to] = revert ? [d.to, d.from] : [d.from, d.to];
        const [l] = p.layers.splice(from, 1);
        p.layers.splice(to, 0, l);
        break;
      }
      case "layerProps": {
        const l = this.layer(d.id);
        if (l) Object.assign(l, revert ? d.before : d.after);
        break;
      }
      case "palette":
        p.palette = (revert ? d.before : d.after).slice();
        break;
      case "fps":
        p.fps = revert ? d.before : d.after;
        break;
      case "rig":
        p.rig = revert ? d.before : d.after;
        break;
    }
  }

  private record(d: StructDelta, label: string) {
    this.applyDelta(d, false);
    if (this.batchLabel !== null) {
      this.batchDeltas.push(d);
    } else {
      this.pushHistory({ label, deltas: [d], bytes: estimateBytes([d]) });
    }
  }

  // ── piksel işlemleri ────────────────────────────────────────
  paint(points: Point[], color: RGBA, frameId: string, layerId: string) {
    const layer = this.layer(layerId);
    if (!layer || layer.locked) return;
    this.touch(frameId, layerId);
    const cel = this.cel(frameId, layerId);
    for (const p of points) setPixel(cel, p.x, p.y, this.width, this.height, color);
  }

  erase(points: Point[], frameId: string, layerId: string) {
    this.paint(points, [0, 0, 0, 0], frameId, layerId);
  }

  bucket(
    x: number,
    y: number,
    color: RGBA,
    frameId: string,
    layerId: string,
    // clip: seçim aktifse doldurma seçimin dışına taşmaz
    opts: { contiguous?: boolean; tolerance?: number; clip?: ClipRect } = {},
  ) {
    const layer = this.layer(layerId);
    if (!layer || layer.locked) return;
    this.touch(frameId, layerId);
    const cel = this.cel(frameId, layerId);
    const { contiguous = true, tolerance = 0, clip } = opts;
    if (contiguous) {
      floodFill(cel, this.width, this.height, x, y, color, tolerance, clip);
    } else {
      const target = getPixel(cel, x, y, this.width, this.height);
      replaceColor(cel, this.width, this.height, target, color, tolerance, clip);
    }
  }

  pick(x: number, y: number, frameIndex: number): RGBA {
    const buf = this.composite(frameIndex);
    return getPixel(buf, x, y, this.width, this.height);
  }

  clearCel(frameId: string, layerId: string) {
    const layer = this.layer(layerId);
    if (!layer || layer.locked) return;
    this.touch(frameId, layerId);
    this.cel(frameId, layerId).fill(0);
  }

  /** Ham buffer yazımı (resim içe aktarma, ajan API'si) */
  writeCel(frameId: string, layerId: string, data: Uint8ClampedArray) {
    const layer = this.layer(layerId);
    if (!layer || layer.locked) return;
    this.touch(frameId, layerId);
    this.cel(frameId, layerId).set(data.subarray(0, this.width * this.height * 4));
  }

  /**
   * Bir cel'i doğrudan düzenlemek için genel kapı.
   *
   * Rig bölge işlemleri (öteleme, döndürme, renk değiştirme) buradan geçiyor:
   * touch() çağrıldığı için geçmiş kaydı otomatik oluşuyor ve rig matematiği
   * belge modelinin içine sızmıyor. false dönerse katman kilitli.
   */
  editCel(
    frameId: string,
    layerId: string,
    fn: (cel: Uint8ClampedArray, w: number, h: number) => void,
  ): boolean {
    const layer = this.layer(layerId);
    if (!layer || layer.locked) return false;
    if (!this.project.frames.some((f) => f.id === frameId)) return false;
    this.touch(frameId, layerId);
    fn(this.cel(frameId, layerId), this.width, this.height);
    return true;
  }

  // ── rig (iskelet) ───────────────────────────────────────────
  get rig(): Rig | undefined {
    return this.project.rig;
  }

  /**
   * Rig'i tümüyle değiştirir. Tam kopya saklıyoruz çünkü rig salt metadata:
   * 20 düğümlü bir iskelet birkaç KB JSON, delta hesaplamaya değmez.
   */
  setRig(rig: Rig | undefined, label = "Rig") {
    const before = this.project.rig;
    const after = rig ? (structuredClone(rig) as Rig) : undefined;
    this.record({ kind: "rig", before, after }, label);
    this.emit("structure");
  }

  /** Okuma-değiştirme-yazma kolaylığı; fn kopya üstünde çalışır */
  updateRig(label: string, fn: (rig: Rig) => void) {
    const next = (this.project.rig
      ? (structuredClone(this.project.rig) as Rig)
      : { nodes: [], bones: [] }) satisfies Rig;
    fn(next);
    this.setRig(next, label);
  }

  // ── kare işlemleri ──────────────────────────────────────────
  /**
   * `copyFromIndex` verilmezse sona BOŞ kare, verilirse o karenin KOPYASI
   * hemen arkasına.
   *
   * Aralık dışı bir indeks sona ekleniyor — uydurma bir indeks kaydetmek
   * geri almayı bozuyordu: `splice(100, 0, frame)` diziye sığdırıp sona
   * ekliyor ama geri alırken `splice(100, 1)` HİÇBİR ŞEY silmiyor, yani kare
   * kalıcı oluyordu. Kaydedilen indeks gerçekten eklenen yer olmalı.
   */
  addFrame(copyFromIndex?: number): number {
    const frames = this.project.frames;
    const copyFrom =
      copyFromIndex != null &&
      Number.isInteger(copyFromIndex) &&
      copyFromIndex >= 0 &&
      copyFromIndex < frames.length
        ? copyFromIndex
        : null;
    const src = copyFrom != null ? frames[copyFrom] : null;
    const cels: Record<string, Uint8ClampedArray> = {};
    for (const l of this.project.layers) {
      cels[l.id] = src?.cels[l.id]
        ? src.cels[l.id].slice()
        : new Uint8ClampedArray(this.width * this.height * 4);
    }
    const frame: Frame = { id: uid("frm"), durationCs: fpsToCs(this.project.fps), cels };
    const index = copyFrom != null ? copyFrom + 1 : frames.length;
    this.record({ kind: "frameInsert", index, frame }, "Add frame");
    this.emit("structure");
    return index;
  }

  deleteFrame(index: number): boolean {
    if (this.project.frames.length <= 1) return false;
    const frame = this.project.frames[index];
    if (!frame) return false;
    this.record({ kind: "frameRemove", index, frame }, "Delete frame");
    this.emit("structure");
    return true;
  }

  moveFrame(from: number, to: number) {
    if (from === to) return;
    this.record({ kind: "frameMove", from, to }, "Move frame");
    this.emit("structure");
  }

  setFrameDuration(index: number, cs: number) {
    const f = this.project.frames[index];
    if (!f) return;
    const clamped = Math.max(1, Math.round(cs));
    if (f.durationCs === clamped) return;
    this.record({ kind: "frameDuration", index, before: f.durationCs, after: clamped }, "Duration");
    this.emit("structure");
  }

  /**
   * FPS + tüm kare süreleri TEK adımda.
   *
   * `run()` kullanmak zorunlu, elle beginBatch/endBatch DEĞİL: beginBatch iç
   * içe çağrıya karşı korumalı ama endBatch değil, yani dışarıda açık bir
   * batch varken (ajan `beginBatch("iş")` demişse) buradaki endBatch ONUN
   * batch'ini kapatıyordu. Sonrasındaki çizimler hiçbir geçmiş adımına
   * girmiyor ve kullanıcı ajanın işini Ctrl+Z ile geri alamıyordu.
   */
  setFps(fps: number) {
    if (this.project.fps === fps) return;
    this.run("FPS", () => {
      this.record({ kind: "fps", before: this.project.fps, after: fps }, "FPS");
      const cs = fpsToCs(fps);
      this.project.frames.forEach((f, i) => {
        if (f.durationCs !== cs)
          this.record({ kind: "frameDuration", index: i, before: f.durationCs, after: cs }, "FPS");
      });
    });
    this.emit("structure");
  }

  // ── katman işlemleri ────────────────────────────────────────
  addLayer(name?: string): string {
    const layer: LayerMeta = {
      id: uid("lyr"),
      name: name ?? `Layer ${this.project.layers.length + 1}`,
      visible: true,
      opacity: 1,
      locked: false,
    };
    const cels: Record<string, Uint8ClampedArray> = {};
    for (const f of this.project.frames)
      cels[f.id] = new Uint8ClampedArray(this.width * this.height * 4);
    this.record(
      { kind: "layerInsert", index: this.project.layers.length, layer, cels },
      "Add layer",
    );
    this.emit("structure");
    return layer.id;
  }

  deleteLayer(id: string): boolean {
    if (this.project.layers.length <= 1) return false;
    const index = this.project.layers.findIndex((l) => l.id === id);
    if (index < 0) return false;
    const layer = this.project.layers[index];
    const cels: Record<string, Uint8ClampedArray> = {};
    for (const f of this.project.frames) cels[f.id] = f.cels[id];
    this.record({ kind: "layerRemove", index, layer, cels }, "Delete layer");
    this.emit("structure");
    return true;
  }

  moveLayer(from: number, to: number) {
    if (from === to) return;
    this.record({ kind: "layerMove", from, to }, "Move layer");
    this.emit("structure");
  }

  setLayerProps(id: string, props: Partial<LayerMeta>) {
    const l = this.layer(id);
    if (!l) return;
    const before: Partial<LayerMeta> = {};
    let changed = false;
    for (const k of Object.keys(props) as (keyof LayerMeta)[]) {
      if (l[k] !== props[k]) {
        (before as Record<string, unknown>)[k] = l[k];
        changed = true;
      }
    }
    if (!changed) return;
    this.record({ kind: "layerProps", id, before, after: props }, "Layer settings");
    this.emit("structure");
  }

  // ── palet ───────────────────────────────────────────────────
  setPalette(palette: Hex[]) {
    this.record(
      { kind: "palette", before: this.project.palette.slice(), after: palette.slice() },
      "Palette",
    );
    this.emit("structure");
  }

  /** Tuvali yeniden boyutlandırır (sol-üst hizalı, kırpar veya sıfırla doldurur) */
  resize(w: number, h: number) {
    const ow = this.width;
    const oh = this.height;
    if (w === ow && h === oh) return;
    for (const f of this.project.frames) {
      for (const l of this.project.layers) {
        const old = f.cels[l.id];
        const next = new Uint8ClampedArray(w * h * 4);
        if (old) {
          const cw = Math.min(ow, w);
          const chh = Math.min(oh, h);
          for (let y = 0; y < chh; y++) {
            next.set(old.subarray(y * ow * 4, y * ow * 4 + cw * 4), y * w * 4);
          }
        }
        f.cels[l.id] = next;
      }
    }
    this.project.width = w;
    this.project.height = h;
    this.undoStack.length = 0; // boyut değişimi geçmişi geçersiz kılar
    this.redoStack.length = 0;
    this.captures.clear();
    this.emit("structure");
  }

  replaceProject(project: Project) {
    this.project = project;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.captures.clear();
    this.batchLabel = null;
    this.emit("structure");
  }
}

function estimateBytes(deltas: Delta[]): number {
  let n = 0;
  for (const d of deltas) {
    if (d.kind === "pixels") n += d.before.byteLength + d.after.byteLength;
    else if (d.kind === "frameInsert" || d.kind === "frameRemove")
      n += Object.values(d.frame.cels).reduce((a, c) => a + (c?.byteLength ?? 0), 0);
    else if (d.kind === "layerInsert" || d.kind === "layerRemove")
      n += Object.values(d.cels).reduce((a, c) => a + (c?.byteLength ?? 0), 0);
    else n += 128;
  }
  return n;
}
