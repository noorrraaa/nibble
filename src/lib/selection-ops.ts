/**
 * Nibble — seçim işlemleri
 *
 * Rig ile aynı bölge primitiflerini (rig.ts) kullanıyor: readRegion,
 * clearRegion, writeRegion, moveRegion, transformRegionBuffer. İkinci bir
 * kopya yazmak yerine paylaşmak, "seçimde döndürme rig'dekinden farklı sonuç
 * veriyor" hatasını baştan imkânsız kılıyor.
 *
 * Fark şu: rig'de bölgenin bir ADI ve tutamağı var, burada geçici bir
 * dikdörtgen var. Matematik aynı.
 *
 * GEÇMİŞ ETİKETLERİ: kullanıcı bunları "Geri al: X" olarak görüyor, yani
 * çevrilmeleri gerekiyor. Bu dosya React'i tanımıyor (Node'da test ediliyor),
 * o yüzden etiketi ÇAĞIRAN veriyor — canvas-stage'in beginBatch(t.tools[...])
 * ile kurduğu desenin aynısı. Ajan parametre geçmiyor, İngilizce varsayılanı
 * alıyor; ajanın yüzeyi zaten İngilizce.
 */

import type { PixelDocument } from "./pixel-document";
import {
  clearRegion,
  clipRect,
  moveRegion,
  readRegion,
  transformRegionBuffer,
  writeRegion,
  type Rect,
} from "./rig";
import type { RegionTransform, RGBA } from "./types";

/** Panoda tutulan parça. Sistem panosu değil: bkz. copy() yorumu. */
export interface Clip {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export interface SelResult {
  ok: boolean;
  error?: string;
  rect?: Rect;
  clip?: Clip;
}

const fail = (error: string): SelResult => ({ ok: false, error });

/** Sürükleme uçlarından normalize dikdörtgen (ters sürükleme de çalışsın) */
export function rectFromDrag(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x) + 1,
    h: Math.abs(b.y - a.y) + 1,
  };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

function usable(doc: PixelDocument, frameIndex: number, layerId: string) {
  const frame = doc.project.frames[frameIndex];
  if (!frame) return null;
  const layer = doc.layer(layerId);
  if (!layer || layer.locked) return null;
  return frame;
}

/**
 * Kopyala.
 *
 * Sistem panosunu KULLANMIYORUZ. `navigator.clipboard.write` görsel için
 * PNG blob'u istiyor; bu hem izin diyaloğu açıyor hem de piksel verisini
 * kodlayıp çözmeyi gerektiriyor. Uygulama içi pano hem anında hem kayıpsız.
 * Karşılığı: başka sekmeye yapıştırılamıyor — dışa aktarım onun için var.
 */
export function copySelection(
  doc: PixelDocument,
  rect: Rect,
  frameIndex: number,
  layerId: string,
): SelResult {
  const frame = doc.project.frames[frameIndex];
  if (!frame) return fail("No such frame");
  const cel = doc.cel(frame.id, layerId);
  const clipped = clipRect(rect, doc.width, doc.height);
  if (!clipped) return fail("Selection is outside the canvas");
  return {
    ok: true,
    clip: {
      w: clipped.w,
      h: clipped.h,
      data: readRegion(cel, doc.width, doc.height, clipped),
    },
    rect: clipped,
  };
}

export function cutSelection(
  doc: PixelDocument,
  rect: Rect,
  frameIndex: number,
  layerId: string,
  label = "Cut",
): SelResult {
  const copied = copySelection(doc, rect, frameIndex, layerId);
  if (!copied.ok) return copied;
  const frame = usable(doc, frameIndex, layerId);
  if (!frame) return fail("Layer is locked");
  doc.run(label, () => {
    doc.editCel(frame.id, layerId, (cel, w, h) => clearRegion(cel, w, h, copied.rect!));
  });
  return copied;
}

export function clearSelection(
  doc: PixelDocument,
  rect: Rect,
  frameIndex: number,
  layerId: string,
  label = "Delete",
): SelResult {
  const frame = usable(doc, frameIndex, layerId);
  if (!frame) return fail("Layer is locked");
  const clipped = clipRect(rect, doc.width, doc.height);
  if (!clipped) return fail("Selection is outside the canvas");
  doc.run(label, () => {
    doc.editCel(frame.id, layerId, (cel, w, h) => clearRegion(cel, w, h, clipped));
  });
  return { ok: true, rect: clipped };
}

/**
 * Yapıştır. Hedef: seçim varsa onun sol-üstü, yoksa tuvalin ortası.
 * Yapıştırılan alan yeni seçim olur — kullanıcı hemen sürükleyip yerleştirsin.
 */
export function pasteClip(
  doc: PixelDocument,
  clip: Clip,
  frameIndex: number,
  layerId: string,
  at?: { x: number; y: number },
  label = "Paste",
): SelResult {
  const frame = usable(doc, frameIndex, layerId);
  if (!frame) return fail("Layer is locked");
  const x = at ? at.x : Math.floor((doc.width - clip.w) / 2);
  const y = at ? at.y : Math.floor((doc.height - clip.h) / 2);
  const rect: Rect = { x, y, w: clip.w, h: clip.h };
  doc.run(label, () => {
    doc.editCel(frame.id, layerId, (cel, w, h) => writeRegion(cel, w, h, rect, clip.data));
  });
  return { ok: true, rect };
}

/** Seçim içeriğini öteler. Sürükleme boyunca tek batch'te çağrılır. */
export function moveSelection(
  doc: PixelDocument,
  rect: Rect,
  dx: number,
  dy: number,
  frameIndex: number,
  layerId: string,
): SelResult {
  const frame = usable(doc, frameIndex, layerId);
  if (!frame) return fail("Layer is locked");
  if (dx === 0 && dy === 0) return { ok: true, rect };
  doc.editCel(frame.id, layerId, (cel, w, h) => moveRegion(cel, w, h, rect, dx, dy));
  return { ok: true, rect: { ...rect, x: rect.x + dx, y: rect.y + dy } };
}

/**
 * Seçimi aynala / 90° döndür — rig ile AYNI kod.
 * 90° katlarında en/boy takas olduğu için seçim dikdörtgeni de güncellenir.
 */
export function transformSelection(
  doc: PixelDocument,
  rect: Rect,
  op: RegionTransform,
  frameIndex: number,
  layerId: string,
  label?: string,
): SelResult {
  const frame = usable(doc, frameIndex, layerId);
  if (!frame) return fail("Layer is locked");
  let next: Rect = rect;
  doc.run(label ?? `Selection: ${op}`, () => {
    doc.editCel(frame.id, layerId, (cel, w, h) => {
      const src = readRegion(cel, w, h, rect);
      const res = transformRegionBuffer(src, rect.w, rect.h, op);
      clearRegion(cel, w, h, rect);
      next = {
        x: Math.round(rect.x + rect.w / 2 - res.w / 2),
        y: Math.round(rect.y + rect.h / 2 - res.h / 2),
        w: res.w,
        h: res.h,
      };
      writeRegion(cel, w, h, next, res.data);
    });
  });
  return { ok: true, rect: next };
}

/** Seçimi tek renkle doldurur (saydam dahil — silmek için de kullanılır) */
export function fillSelection(
  doc: PixelDocument,
  rect: Rect,
  color: RGBA,
  frameIndex: number,
  layerId: string,
  label = "Fill",
): SelResult {
  const frame = usable(doc, frameIndex, layerId);
  if (!frame) return fail("Layer is locked");
  const clipped = clipRect(rect, doc.width, doc.height);
  if (!clipped) return fail("Selection is outside the canvas");
  doc.run(label, () => {
    doc.editCel(frame.id, layerId, (cel, w) => {
      for (let y = clipped.y; y < clipped.y + clipped.h; y++) {
        for (let x = clipped.x; x < clipped.x + clipped.w; x++) {
          const i = (y * w + x) * 4;
          cel[i] = color[0];
          cel[i + 1] = color[1];
          cel[i + 2] = color[2];
          cel[i + 3] = color[3];
        }
      }
    });
  });
  return { ok: true, rect: clipped };
}
