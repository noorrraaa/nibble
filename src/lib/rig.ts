/**
 * Nibble — rig (iskelet) yardımcıları
 *
 * Buradaki her şey SAF fonksiyon: bir cel buffer'ı alır, üstünde çalışır.
 * Geçmiş kaydı PixelDocument.editCel() tarafından hallediliyor, o yüzden bu
 * dosya belge modelini hiç tanımıyor — test etmesi ve okuması kolay kalsın.
 *
 * Tasarım kararı: rig, kemik ağırlıklı bir deformasyon sistemi DEĞİL.
 * Pixel art'ta keyfi deformasyon (mesh warp) her zaman çamur üretir. Bunun
 * yerine model şu: her düğüm bir dikdörtgen piksel bölgesinin tutamağı, ve
 * yapılan işler ötelemeyle 90° katları — yani kayıpsız olanlar. Keyfi açı da
 * var ama en yakın komşu ile ve ajana "kayıplı" diye söylüyoruz.
 */

import type { Point, RegionTransform, Rig, RigNode, RGBA } from "./types";
import { colorsEqual } from "./raster";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const emptyRig = (): Rig => ({ nodes: [], bones: [] });

export function findNode(rig: Rig | undefined, name: string): RigNode | undefined {
  return rig?.nodes.find((n) => n.name === name);
}

/** Düğümün belirli karedeki tutamak konumu; o karede anahtar yoksa null */
export function nodePos(node: RigNode, frameId: string): Point | null {
  const p = node.pos[frameId];
  return p ? { x: p[0], y: p[1] } : null;
}

/**
 * Karede anahtar yoksa en yakın anahtarlı kareyi kullanır.
 * Kullanıcı her düğümü her karede işaretlemek zorunda kalmasın.
 */
export function nodePosResolved(
  node: RigNode,
  frameIds: string[],
  frameIndex: number,
): Point | null {
  const here = nodePos(node, frameIds[frameIndex]);
  if (here) return here;
  for (let d = 1; d < frameIds.length; d++) {
    const back = frameIds[frameIndex - d];
    if (back && node.pos[back]) return nodePos(node, back);
    const fwd = frameIds[frameIndex + d];
    if (fwd && node.pos[fwd]) return nodePos(node, fwd);
  }
  return null;
}

/** Düğümün bölgesinin mutlak (tuval) dikdörtgeni */
export function regionRect(node: RigNode, at: Point): Rect | null {
  if (!node.region) return null;
  return {
    x: at.x + node.region.dx,
    y: at.y + node.region.dy,
    w: node.region.w,
    h: node.region.h,
  };
}

/** Tuval sınırlarına kırpar; tamamen dışarıdaysa null */
export function clipRect(r: Rect, w: number, h: number): Rect | null {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(w, r.x + r.w);
  const y1 = Math.min(h, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ── bölge piksel işlemleri ────────────────────────────────────

/** Bölgeyi kendi başına bir buffer olarak kopyalar (tuval dışı = saydam) */
export function readRegion(
  cel: Uint8ClampedArray,
  cw: number,
  ch: number,
  r: Rect,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const sy = r.y + y;
    if (sy < 0 || sy >= ch) continue;
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x;
      if (sx < 0 || sx >= cw) continue;
      const from = (sy * cw + sx) * 4;
      const to = (y * r.w + x) * 4;
      out[to] = cel[from];
      out[to + 1] = cel[from + 1];
      out[to + 2] = cel[from + 2];
      out[to + 3] = cel[from + 3];
    }
  }
  return out;
}

export function clearRegion(
  cel: Uint8ClampedArray,
  cw: number,
  ch: number,
  r: Rect,
): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    if (y < 0 || y >= ch) continue;
    const x0 = Math.max(0, r.x);
    const x1 = Math.min(cw, r.x + r.w);
    if (x1 <= x0) continue;
    cel.fill(0, (y * cw + x0) * 4, (y * cw + x1) * 4);
  }
}

/** Saydam olmayan pikselleri yazar (üstüne bindirme) */
export function writeRegion(
  cel: Uint8ClampedArray,
  cw: number,
  ch: number,
  r: Rect,
  src: Uint8ClampedArray,
): void {
  for (let y = 0; y < r.h; y++) {
    const dy = r.y + y;
    if (dy < 0 || dy >= ch) continue;
    for (let x = 0; x < r.w; x++) {
      const dx = r.x + x;
      if (dx < 0 || dx >= cw) continue;
      const from = (y * r.w + x) * 4;
      if (src[from + 3] === 0) continue;
      const to = (dy * cw + dx) * 4;
      cel[to] = src[from];
      cel[to + 1] = src[from + 1];
      cel[to + 2] = src[from + 2];
      cel[to + 3] = src[from + 3];
    }
  }
}

/**
 * Bölgeyi (dx, dy) kadar öteler.
 * Sırası önemli: önce oku, sonra ESKİ yeri temizle, sonra yeni yere yaz.
 * Tersi olsa üst üste binen taşımalarda kaynağı kendi kendine silerdi.
 */
export function moveRegion(
  cel: Uint8ClampedArray,
  cw: number,
  ch: number,
  r: Rect,
  dx: number,
  dy: number,
): void {
  if (dx === 0 && dy === 0) return;
  const buf = readRegion(cel, cw, ch, r);
  clearRegion(cel, cw, ch, r);
  writeRegion(cel, cw, ch, { ...r, x: r.x + dx, y: r.y + dy }, buf);
}

/** Kayıpsız dönüşümler. 90° katlarında bölge kare değilse en/boy yer değiştirir. */
export function transformRegionBuffer(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  op: RegionTransform,
): { data: Uint8ClampedArray; w: number; h: number } {
  const get = (x: number, y: number) => (y * w + x) * 4;
  const swap = op === "rotate90" || op === "rotate270";
  const ow = swap ? h : w;
  const oh = swap ? w : h;
  const out = new Uint8ClampedArray(ow * oh * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let tx: number;
      let ty: number;
      switch (op) {
        case "flipX": tx = w - 1 - x; ty = y; break;
        case "flipY": tx = x; ty = h - 1 - y; break;
        case "rotate90": tx = h - 1 - y; ty = x; break;
        case "rotate180": tx = w - 1 - x; ty = h - 1 - y; break;
        case "rotate270": tx = y; ty = w - 1 - x; break;
      }
      const from = get(x, y);
      const to = (ty * ow + tx) * 4;
      out[to] = src[from];
      out[to + 1] = src[from + 1];
      out[to + 2] = src[from + 2];
      out[to + 3] = src[from + 3];
    }
  }
  return { data: out, w: ow, h: oh };
}

/**
 * Keyfi açı — en yakın komşu, bölge merkezi etrafında.
 *
 * KAYIPLI: pixel art'ta 90° katları dışındaki her döndürme detay bozar.
 *
 * İki tasarım detayı:
 *  1. Ters eşleme (hedefteki her piksel için kaynağı ara) — ileri eşlemede
 *     yuvarlama yüzünden delikler kalır.
 *  2. Hedef kutu BÜYÜTÜLÜR. Aynı boyda döndürseydik 4×4'lük bir deseni 45°
 *     çevirmek köşeleri kırpar ve içerik gerçekten kaybolur; 4×4 için gereken
 *     alan ~5.7×5.7. Dönen içerik sığsın diye sınırı hesaplıyoruz.
 */
export function rotateRegionBuffer(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  degrees: number,
): { data: Uint8ClampedArray; w: number; h: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // döndürülmüş dikdörtgenin eksene hizalı sınırı
  const ow = Math.max(1, Math.ceil(Math.abs(w * cos) + Math.abs(h * sin)));
  const oh = Math.max(1, Math.ceil(Math.abs(w * sin) + Math.abs(h * cos)));
  const out = new Uint8ClampedArray(ow * oh * 4);

  const scx = (w - 1) / 2;
  const scy = (h - 1) / 2;
  const dcx = (ow - 1) / 2;
  const dcy = (oh - 1) / 2;

  // ters dönüş: hedef → kaynak
  const icos = Math.cos(-rad);
  const isin = Math.sin(-rad);

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const ox = x - dcx;
      const oy = y - dcy;
      const sx = Math.round(ox * icos - oy * isin + scx);
      const sy = Math.round(ox * isin + oy * icos + scy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const from = (sy * w + sx) * 4;
      if (src[from + 3] === 0) continue;
      const to = (y * ow + x) * 4;
      out[to] = src[from];
      out[to + 1] = src[from + 1];
      out[to + 2] = src[from + 2];
      out[to + 3] = src[from + 3];
    }
  }
  return { data: out, w: ow, h: oh };
}

/** Bölge içinde renk değiştirir. from verilmezse saydam olmayan HER piksel boyanır. */
export function recolorRegion(
  cel: Uint8ClampedArray,
  cw: number,
  ch: number,
  r: Rect,
  from: RGBA | null,
  to: RGBA,
  tolerance = 0,
): number {
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    if (y < 0 || y >= ch) continue;
    for (let x = r.x; x < r.x + r.w; x++) {
      if (x < 0 || x >= cw) continue;
      const i = (y * cw + x) * 4;
      const px: RGBA = [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]];
      if (from ? !colorsEqual(px, from, tolerance) : px[3] === 0) continue;
      cel[i] = to[0];
      cel[i + 1] = to[1];
      cel[i + 2] = to[2];
      cel[i + 3] = to[3];
      n++;
    }
  }
  return n;
}

// ── ara kare (tween) planı ────────────────────────────────────

export interface TweenStep {
  /** 0..1 arası konum */
  t: number;
  /** düğüm adı -> uygulanacak öteleme (kaynak kareye göre) */
  offsets: Record<string, { dx: number; dy: number }>;
}

/**
 * İki kare arasındaki düğüm konumlarını doğrusal ara değerler.
 * Sadece ÖTELEME üretir — kemik açısına göre deformasyon yok, çünkü pixel
 * art'ta bu her zaman çamur olur. Ajana da bunu açıkça söylüyoruz.
 */
export function planTween(
  rig: Rig,
  fromFrameId: string,
  toFrameId: string,
  count: number,
): TweenStep[] {
  const steps: TweenStep[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const offsets: Record<string, { dx: number; dy: number }> = {};
    for (const node of rig.nodes) {
      const a = node.pos[fromFrameId];
      const b = node.pos[toFrameId];
      if (!a || !b) continue;
      const dx = Math.round((b[0] - a[0]) * t);
      const dy = Math.round((b[1] - a[1]) * t);
      if (dx === 0 && dy === 0) continue;
      offsets[node.name] = { dx, dy };
    }
    steps.push({ t, offsets });
  }
  return steps;
}

/** Ajanın okuyacağı insan/makine dostu özet */
export function describeRig(
  rig: Rig | undefined,
  frameIds: string[],
  frameIndex: number,
  canvas?: { width: number; height: number },
): {
  nodes: {
    name: string;
    at: [number, number] | null;
    region: Rect | null;
    keyframes: number;
    offCanvas: boolean;
  }[];
  bones: { name: string; from: string; to: string; length: number | null }[];
} {
  const r = rig ?? emptyRig();
  const nodes = r.nodes.map((n) => {
    const at = nodePosResolved(n, frameIds, frameIndex);
    // tuval küçültüldüğünde tutamak dışarıda kalabilir: veri kaybolmaz ama
    // fareyle yakalanamaz, o yüzden hem kullanıcıya hem ajana bildiriyoruz
    const offCanvas =
      !!at &&
      !!canvas &&
      (at.x < 0 || at.y < 0 || at.x >= canvas.width || at.y >= canvas.height);
    return {
      name: n.name,
      at: at ? ([at.x, at.y] as [number, number]) : null,
      region: at ? regionRect(n, at) : null,
      keyframes: Object.keys(n.pos).length,
      offCanvas,
    };
  });
  const bones = r.bones.map((b) => {
    const a = findNode(r, b.from);
    const c = findNode(r, b.to);
    const pa = a ? nodePosResolved(a, frameIds, frameIndex) : null;
    const pc = c ? nodePosResolved(c, frameIds, frameIndex) : null;
    return {
      name: b.name,
      from: b.from,
      to: b.to,
      length:
        pa && pc ? Math.round(Math.hypot(pc.x - pa.x, pc.y - pa.y) * 10) / 10 : null,
    };
  });
  return { nodes, bones };
}

/**
 * Düğüm/kemik adı: ajan da kullanıcı da yazacak, o yüzden tek biçim.
 *
 * Harf sınıfı `\w` DEĞİL `\p{L}`: `\w` yalnızca ASCII tanıyor ve arayüz
 * iki dilli olduğu için "kol üst" → `kol_st`, "göz" → `gz` diye sessizce
 * bozuluyordu. Süslü/boşluklu karakterler yine gidiyor (dosya adına ve
 * Aseprite slice adına dönüşüyor), harfler kalıyor.
 */
export function normaliseRigName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_.-]/gu, "")
    .slice(0, 40);
}
