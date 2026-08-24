/**
 * Nibble — rig işlemleri (belge üzerinde)
 *
 * Bu dosya AYNI ZAMANDA hem arayüzün hem ajan API'sinin kullandığı yer.
 * İkisi kendi kopyasını yazsaydı kaçınılmaz olarak ayrışırlar ve "ajan
 * yaptığında farklı sonuç veriyor" hatası çıkardı.
 *
 * Hata metinleri İngilizce: ajan bunları okuyor. Arayüz tarafında zaten
 * ön kontrol yapıldığı için kullanıcı bunları nadiren görür.
 */

import type { PixelDocument } from "./pixel-document";
import {
  clipRect,
  emptyRig,
  findNode,
  nodePosResolved,
  normaliseRigName,
  planTween,
  readRegion,
  clearRegion,
  writeRegion,
  moveRegion,
  recolorRegion,
  regionRect,
  rotateRegionBuffer,
  transformRegionBuffer,
  type Rect,
} from "./rig";
import { MAX_REGION_SIDE, type Frame, type LayerMeta, type RegionTransform, type RGBA } from "./types";

export interface OpResult {
  ok: boolean;
  error?: string;
  hint?: string;
  [k: string]: unknown;
}

const ok = (extra: Record<string, unknown> = {}): OpResult => ({ ok: true, ...extra });
const err = (error: string, hint?: string): OpResult => ({ ok: false, error, hint });

/**
 * Ortak ön kontrol: kare + katman + kilit.
 * Etiketli birleşim (`ok`) kullanıyoruz — `"error" in t` ile daraltma
 * TS'te diğer üyeye `error?: unknown` ekliyor ve tip daralmıyor.
 */
type TargetCheck =
  | { ok: false; error: string }
  | { ok: true; frame: Frame; layer: LayerMeta };

function target(doc: PixelDocument, frameIndex: number, layerId: string): TargetCheck {
  const frame = doc.project.frames[frameIndex];
  if (!frame) return { ok: false, error: `No frame ${frameIndex}` };
  const layer = doc.layer(layerId);
  if (!layer) return { ok: false, error: `No layer ${layerId}` };
  if (layer.locked) return { ok: false, error: `Layer "${layer.name}" is locked` };
  return { ok: true, frame, layer };
}

function frameIds(doc: PixelDocument): string[] {
  return doc.project.frames.map((f) => f.id);
}

/**
 * Kutu tavanı denetimi — piksel taşıyan her işlemin ÖNÜNDE.
 *
 * Bölge işlemleri `w*h*4` baytlık bir tampon ayırıyor. Kutu doğrulanmadan
 * geçtiğinde (ajan `definePart({region})` ile doğrudan yazabiliyordu) tarayıcı
 * `RangeError: Array buffer allocation failed` fırlatıyor; istisna API
 * sözleşmesini ("reddedilen çağrı ok:false döner") bozuyor ve açık kalan
 * batch geçmişi öldürüyordu. Burada erken ve DÜZGÜN reddediyoruz.
 */
function regionTooBig(rect: Rect | null): OpResult | null {
  if (!rect) return null;
  if (rect.w > MAX_REGION_SIDE || rect.h > MAX_REGION_SIDE) {
    return err(
      `The part's box is ${rect.w}×${rect.h}, larger than the ${MAX_REGION_SIDE}×${MAX_REGION_SIDE} limit`,
      "Give it a box that fits the canvas with setPartBox().",
    );
  }
  return null;
}

/** Düğümün bu karede etkilediği mutlak dikdörtgen (yoksa null) */
function resolvedRect(
  doc: PixelDocument,
  name: string,
  frameIndex: number,
): { at: { x: number; y: number }; rect: Rect | null } | null {
  const node = findNode(doc.rig, name);
  if (!node) return null;
  const at = nodePosResolved(node, frameIds(doc), frameIndex);
  if (!at) return null;
  return { at, rect: regionRect(node, at) };
}

// ── tanımlama ─────────────────────────────────────────────────

export function defineNode(
  doc: PixelDocument,
  rawName: string,
  x: number,
  y: number,
  frameIndex: number,
  region?: { dx: number; dy: number; w: number; h: number },
): OpResult {
  const name = normaliseRigName(rawName);
  if (!name) return err("A part needs a name (letters, digits, _ . -)");
  if (findNode(doc.rig, name)) return err(`A part named "${name}" already exists`);
  const frame = doc.project.frames[frameIndex];
  if (!frame) return err(`No frame ${frameIndex}`);

  // kutu buradan da girebiliyor (ajan doğrudan `region` yazabilir): tam sayıya
  // çek, en az 1×1 yap ve tavanı burada uygula — depoya bozuk kutu girmesin
  let box: { dx: number; dy: number; w: number; h: number } | undefined;
  if (region) {
    box = {
      dx: Math.round(region.dx) || 0,
      dy: Math.round(region.dy) || 0,
      w: Math.max(1, Math.round(region.w) || 1),
      h: Math.max(1, Math.round(region.h) || 1),
    };
    const tooBig = regionTooBig({ x: 0, y: 0, w: box.w, h: box.h });
    if (tooBig) return tooBig;
  }

  doc.updateRig(`Rig: ${name}`, (rig) => {
    rig.nodes.push({
      name,
      pos: { [frame.id]: [Math.round(x), Math.round(y)] },
      ...(box ? { region: box } : {}),
    });
  });
  return ok({
    name,
    hint: "Give it a box with setPartBox() so movePart() carries its pixels.",
  });
}

export function deleteNode(doc: PixelDocument, rawName: string): OpResult {
  const name = normaliseRigName(rawName);
  if (!findNode(doc.rig, name)) return err(`No part named "${name}"`);
  doc.updateRig(`Rig: −${name}`, (rig) => {
    rig.nodes = rig.nodes.filter((n) => n.name !== name);
    // sahipsiz kemik bırakmayalım
    rig.bones = rig.bones.filter((b) => b.from !== name && b.to !== name);
  });
  return ok();
}

export function renameNode(doc: PixelDocument, from: string, to: string): OpResult {
  const a = normaliseRigName(from);
  const b = normaliseRigName(to);
  if (!b) return err("The new name is empty");
  if (!findNode(doc.rig, a)) return err(`No part named "${a}"`);
  if (a !== b && findNode(doc.rig, b)) return err(`A part named "${b}" already exists`);
  doc.updateRig(`Rig: ${b}`, (rig) => {
    for (const n of rig.nodes) if (n.name === a) n.name = b;
    for (const bone of rig.bones) {
      if (bone.from === a) bone.from = b;
      if (bone.to === a) bone.to = b;
    }
  });
  return ok({ name: b });
}

/** Tutamağı taşır ama pikselleri BIRAKMAZ — poz anahtarı koymak için */
export function setNodePos(
  doc: PixelDocument,
  rawName: string,
  x: number,
  y: number,
  frameIndex: number,
): OpResult {
  const name = normaliseRigName(rawName);
  if (!findNode(doc.rig, name)) return err(`No part named "${name}"`);
  const frame = doc.project.frames[frameIndex];
  if (!frame) return err(`No frame ${frameIndex}`);
  doc.updateRig(`Rig: ${name}`, (rig) => {
    const n = rig.nodes.find((v) => v.name === name);
    if (n) n.pos[frame.id] = [Math.round(x), Math.round(y)];
  });
  return ok({
    hint: "Only the handle moved — this is how you key a pose. Use movePart() if you wanted the pixels to follow.",
  });
}

export function setNodeRegion(
  doc: PixelDocument,
  rawName: string,
  rect: Rect,
  frameIndex: number,
): OpResult {
  const name = normaliseRigName(rawName);
  const node = findNode(doc.rig, name);
  if (!node) return err(`No part named "${name}"`);
  const at = nodePosResolved(node, frameIds(doc), frameIndex);
  if (!at) return err(`Part "${name}" has no handle on any frame`);
  if (rect.w < 1 || rect.h < 1) return err("The box must be at least 1×1");
  const tooBig = regionTooBig(rect);
  if (tooBig) return tooBig;

  doc.updateRig(`Rig: ${name}`, (rig) => {
    const n = rig.nodes.find((v) => v.name === name);
    if (n) {
      n.region = {
        dx: Math.round(rect.x - at.x),
        dy: Math.round(rect.y - at.y),
        w: Math.round(rect.w),
        h: Math.round(rect.h),
      };
    }
  });
  return ok({ region: rect });
}

export function clearNodeRegion(doc: PixelDocument, rawName: string): OpResult {
  const name = normaliseRigName(rawName);
  if (!findNode(doc.rig, name)) return err(`No part named "${name}"`);
  doc.updateRig(`Rig: ${name}`, (rig) => {
    const n = rig.nodes.find((v) => v.name === name);
    if (n) delete n.region;
  });
  return ok();
}

export function defineBone(
  doc: PixelDocument,
  rawName: string,
  from: string,
  to: string,
): OpResult {
  const name = normaliseRigName(rawName);
  const a = normaliseRigName(from);
  const b = normaliseRigName(to);
  if (!name) return err("A bone needs a name");
  if (a === b) return err("A bone needs two different parts");
  if (!findNode(doc.rig, a)) return err(`No part named "${a}"`);
  if (!findNode(doc.rig, b)) return err(`No part named "${b}"`);
  if (doc.rig?.bones.some((v) => v.name === name))
    return err(`A bone named "${name}" already exists`);
  doc.updateRig(`Rig: ${name}`, (rig) => {
    rig.bones.push({ name, from: a, to: b });
  });
  return ok({ name });
}

export function deleteBone(doc: PixelDocument, rawName: string): OpResult {
  const name = normaliseRigName(rawName);
  if (!doc.rig?.bones.some((b) => b.name === name)) return err(`No bone named "${name}"`);
  doc.updateRig(`Rig: −${name}`, (rig) => {
    rig.bones = rig.bones.filter((b) => b.name !== name);
  });
  return ok();
}

// ── piksel taşıyan işlemler ───────────────────────────────────

/**
 * Tutamağı ve (varsa) bölgesinin PİKSELLERİNİ birlikte taşır.
 * Tek geçmiş adımı: kullanıcı tek Ctrl+Z ile geri alsın.
 */
export function moveNode(
  doc: PixelDocument,
  rawName: string,
  dx: number,
  dy: number,
  frameIndex: number,
  layerId: string,
  allLayers = false,
): OpResult {
  const name = normaliseRigName(rawName);
  const node = findNode(doc.rig, name);
  if (!node) return err(`No part named "${name}"`);
  const t = target(doc, frameIndex, layerId);
  if (!t.ok) return err(t.error);
  const at = nodePosResolved(node, frameIds(doc), frameIndex);
  if (!at) return err(`Part "${name}" has no handle on any frame`);
  const ddx = Math.round(dx);
  const ddy = Math.round(dy);
  if (ddx === 0 && ddy === 0) return ok({ moved: 0 });

  const rect = regionRect(node, at);
  const tooBig = regionTooBig(rect);
  if (tooBig) return tooBig;
  const layerIds = allLayers
    ? doc.layers.filter((l) => !l.locked).map((l) => l.id)
    : [layerId];

  doc.run(`Rig: ${name}`, () => {
    if (rect) {
      for (const lid of layerIds) {
        doc.editCel(t.frame.id, lid, (cel, w, h) => {
          moveRegion(cel, w, h, rect, ddx, ddy);
        });
      }
    }
    doc.updateRig(`Rig: ${name}`, (rig) => {
      const n = rig.nodes.find((v) => v.name === name);
      if (n) n.pos[t.frame.id] = [at.x + ddx, at.y + ddy];
    });
  });

  return ok({
    at: [at.x + ddx, at.y + ddy],
    pixelsMoved: !!rect,
    hint: rect
      ? undefined
      : `"${name}" has no box, so only the handle moved. Call setPartBox() to attach pixels.`,
  });
}

/** Kayıpsız dönüşüm (aynalama / 90° katları) */
export function transformNode(
  doc: PixelDocument,
  rawName: string,
  op: RegionTransform,
  frameIndex: number,
  layerId: string,
): OpResult {
  const name = normaliseRigName(rawName);
  const info = resolvedRect(doc, name, frameIndex);
  if (!info) return err(`No part named "${name}", or it has no handle`);
  if (!info.rect) return err(`Part "${name}" has no box — nothing to transform`);
  const tooBig = regionTooBig(info.rect);
  if (tooBig) return tooBig;
  const t = target(doc, frameIndex, layerId);
  if (!t.ok) return err(t.error);

  const rect = info.rect;
  let dest: Rect = rect;
  doc.run(`Rig: ${name} ${op}`, () => {
    doc.editCel(t.frame.id, layerId, (cel, w, h) => {
      const src = readRegion(cel, w, h, rect);
      const res = transformRegionBuffer(src, rect.w, rect.h, op);
      clearRegion(cel, w, h, rect);
      // 90°/270° en-boyu takas eder; sonucu aynı merkeze oturt
      dest = {
        x: Math.round(rect.x + rect.w / 2 - res.w / 2),
        y: Math.round(rect.y + rect.h / 2 - res.h / 2),
        w: res.w,
        h: res.h,
      };
      writeRegion(cel, w, h, dest, res.data);
    });
    // kutu döndüyse parçanın kutusu da dönmeli; yoksa bir sonraki taşımada
    // kutunun dışında kalan pikseller geride kalır
    if (dest.w !== rect.w || dest.h !== rect.h) {
      setNodeRegion(doc, name, dest, frameIndex);
    }
  });
  return ok({ lossless: true, box: dest });
}

/** Keyfi açı — kayıplı, ajana açıkça söylüyoruz */
export function rotateNode(
  doc: PixelDocument,
  rawName: string,
  degrees: number,
  frameIndex: number,
  layerId: string,
): OpResult {
  const name = normaliseRigName(rawName);
  const info = resolvedRect(doc, name, frameIndex);
  if (!info) return err(`No part named "${name}", or it has no handle`);
  if (!info.rect) return err(`Part "${name}" has no box — nothing to rotate`);
  const tooBig = regionTooBig(info.rect);
  if (tooBig) return tooBig;
  const t = target(doc, frameIndex, layerId);
  if (!t.ok) return err(t.error);

  const deg = ((degrees % 360) + 360) % 360;
  if (deg % 90 === 0) {
    const map: Record<number, RegionTransform | null> = {
      0: null,
      90: "rotate90",
      180: "rotate180",
      270: "rotate270",
    };
    const op = map[deg];
    if (!op) return ok({ rotated: 0 });
    return transformNode(doc, name, op, frameIndex, layerId);
  }

  const rect = info.rect;
  let grown: Rect = rect;
  doc.run(`Rig: ${name} ${deg}°`, () => {
    doc.editCel(t.frame.id, layerId, (cel, w, h) => {
      const src = readRegion(cel, w, h, rect);
      const res = rotateRegionBuffer(src, rect.w, rect.h, deg);
      clearRegion(cel, w, h, rect);
      // dönen içerik büyüdü: aynı merkezde, yeni boyutta yaz
      grown = {
        x: Math.round(rect.x + rect.w / 2 - res.w / 2),
        y: Math.round(rect.y + rect.h / 2 - res.h / 2),
        w: res.w,
        h: res.h,
      };
      writeRegion(cel, w, h, grown, res.data);
    });
    // kutu büyüdüyse parçanın kutusunu da büyüt, yoksa sonraki taşımada
    // dışarıda kalan pikseller geride kalır
    if (grown.w !== rect.w || grown.h !== rect.h) {
      setNodeRegion(doc, name, grown, frameIndex);
    }
  });
  return ok({
    lossless: false,
    box: grown,
    hint: "Nearest-neighbour rotation loses detail, and the part's box grew to fit the rotated shape. Multiples of 90° are lossless; for other angles expect to clean up by hand.",
  });
}


export function recolorNode(
  doc: PixelDocument,
  rawName: string,
  from: RGBA | null,
  to: RGBA,
  frameIndex: number,
  layerId: string,
  tolerance = 0,
): OpResult {
  const name = normaliseRigName(rawName);
  const info = resolvedRect(doc, name, frameIndex);
  if (!info) return err(`No part named "${name}", or it has no handle`);
  if (!info.rect) return err(`Part "${name}" has no box — nothing to recolour`);
  const tooBig = regionTooBig(info.rect);
  if (tooBig) return tooBig;
  const t = target(doc, frameIndex, layerId);
  if (!t.ok) return err(t.error);

  const rect = info.rect;
  let changed = 0;
  doc.run(`Rig: ${name}`, () => {
    doc.editCel(t.frame.id, layerId, (cel, w, h) => {
      const clipped = clipRect(rect, w, h);
      if (!clipped) return;
      changed = recolorRegion(cel, w, h, clipped, from, to, tolerance);
    });
  });
  return ok({
    changed,
    hint: changed === 0 ? "Nothing matched. Check the source colour, or pass from:null to repaint every solid pixel." : undefined,
  });
}

// ── ara kare üretimi ──────────────────────────────────────────

/**
 * fromIndex ile fromIndex+1 arasına `count` kare ekler.
 *
 * Sıra hilesi: addFrame(copyFrom) her zaman copyFrom+1'e yerleştiriyor.
 * Adımları TERS sırada eklersek doğru sıra çıkıyor (son adım en içte kalır).
 */
export function tweenFrames(
  doc: PixelDocument,
  fromIndex: number,
  count: number,
  layerId: string,
  allLayers = true,
): OpResult {
  const frames = doc.project.frames;
  const a = frames[fromIndex];
  const b = frames[fromIndex + 1];
  if (!a || !b) return err("Need a frame after this one to interpolate towards");
  const n = Math.max(1, Math.min(24, Math.round(count)));
  const rig = doc.rig ?? emptyRig();

  const steps = planTween(rig, a.id, b.id, n);
  const movable = new Set(steps.flatMap((s) => Object.keys(s.offsets)));

  /**
   * Piksel ızgarası tam sayı: 2 piksellik bir mesafeye 3 ara kare istersen
   * yuvarlama sonucu birbirinin kopyası kareler çıkar. Sessizce kırpmıyoruz
   * (kullanıcı zamanlama için "bekleme karesi" isteyebilir) ama söylüyoruz.
   */
  let travel = 0;
  for (const node of rig.nodes) {
    const pa = node.pos[a.id];
    const pb = node.pos[b.id];
    if (!pa || !pb) continue;
    travel = Math.max(travel, Math.abs(pb[0] - pa[0]), Math.abs(pb[1] - pa[1]));
  }
  const distinct = Math.max(0, travel - 1);
  if (!movable.size) {
    return err(
      "No part has a handle on both frames, so there is nothing to interpolate",
      "Key the pose first: setPartHandle() on this frame and on the next one, then tween().",
    );
  }

  const layerIds = allLayers
    ? doc.layers.filter((l) => !l.locked).map((l) => l.id)
    : [layerId];

  doc.run(`Tween ×${n}`, () => {
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      const newIndex = doc.addFrame(fromIndex);
      const newFrame = doc.project.frames[newIndex];
      if (!newFrame) continue;

      for (const [nodeName, off] of Object.entries(step.offsets)) {
        const node = findNode(doc.rig, nodeName);
        if (!node) continue;
        const base = node.pos[a.id];
        if (!base) continue;
        const at = { x: base[0], y: base[1] };
        const rect = regionRect(node, at);
        // tavanı aşan kutu (ör. eski/bozuk bir dosyadan gelmiş) atlanır,
        // ara kare yine üretilir — tampon ayırıp patlamaktan iyi
        if (rect && !regionTooBig(rect)) {
          for (const lid of layerIds) {
            doc.editCel(newFrame.id, lid, (cel, w, h) => {
              moveRegion(cel, w, h, rect, off.dx, off.dy);
            });
          }
        }
        doc.updateRig("Tween", (r) => {
          const target = r.nodes.find((v) => v.name === nodeName);
          if (target) target.pos[newFrame.id] = [at.x + off.dx, at.y + off.dy];
        });
      }
    }
  });

  const notes = [
    "Translation only — no squashing or bending, because deforming pixel art turns it to mud. Clean up the in-betweens by hand where it matters.",
  ];
  if (n > distinct) {
    notes.push(
      distinct === 0
        ? `The parts only travel ${travel}px, so every in-between lands on the same pixels. Move the pose further apart, or use these as hold frames.`
        : `The parts travel ${travel}px, so at most ${distinct} in-betweens can differ; the rest are duplicates you can use as hold frames.`,
    );
  }

  return ok({
    added: n,
    parts: [...movable],
    distinctPossible: distinct,
    hint: notes.join(" "),
  });
}
