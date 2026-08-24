/** Nibble — piksel seviyesi raster işlemleri (framework'ten bağımsız) */

import type { Frame, LayerMeta, Point, RGBA } from "./types";

const idx = (x: number, y: number, w: number) => (y * w + x) * 4;

export function getPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
): RGBA {
  if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0];
  const i = idx(x, y, w);
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

export function setPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  c: RGBA,
): void {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = idx(x, y, w);
  data[i] = c[0];
  data[i + 1] = c[1];
  data[i + 2] = c[2];
  data[i + 3] = c[3];
}

/**
 * Bresenham. pointermove hızlı harekette piksel atlar; iki nokta arasını
 * doldurmazsan kesikli çizgi oluşur — sıfırdan yazılan her editörün 1 numaralı hatası.
 */
export function line(x0: number, y0: number, x1: number, y1: number): Point[] {
  /**
   * Tam sayı ve sonlu olmak ZORUNDA: döngü "x === x1" ile bitiyor, yani NaN
   * ya da kesirli bir uç noktada asla bitmez ve sekmeyi kilitler. Bugün tüm
   * çağrı yolları tam sayı veriyor (|0, clampInt, işaretçi koordinatı) ama
   * bu fonksiyon ajan girdisine bir gün doğrudan bağlanırsa bedeli donan bir
   * sekme oluyor — bekçi burada dursun.
   */
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1))
    return [];
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);

  const pts: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      if (x === x1) break;
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      if (y === y1) break;
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** Kalın uç — kare veya daire */
export function brushPoints(cx: number, cy: number, size: number, round: boolean): Point[] {
  if (size <= 1) return [{ x: cx, y: cy }];
  const out: Point[] = [];
  const r = (size - 1) / 2;
  const start = -Math.floor(r);
  const end = Math.ceil(r);
  for (let dy = start; dy <= end; dy++) {
    for (let dx = start; dx <= end; dx++) {
      if (round && Math.hypot(dx, dy) > r + 0.35) continue;
      out.push({ x: cx + dx, y: cy + dy });
    }
  }
  return out;
}

/**
 * Pixel-perfect stroke: çapraz çizimde oluşan L şeklindeki çift pikselleri siler.
 * Aseprite'ın imza özelliği; olmayan editör "amatör" damgası yer.
 */
export function pixelPerfect(pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const orthoPrev = prev.x === cur.x || prev.y === cur.y;
    const orthoNext = next.x === cur.x || next.y === cur.y;
    const diagonal =
      Math.abs(prev.x - next.x) === 1 && Math.abs(prev.y - next.y) === 1;
    if (orthoPrev && orthoNext && diagonal) continue; // köşe pikselini at
    out.push(cur);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function colorsEqual(a: RGBA, b: RGBA, tolerance = 0): boolean {
  if (a[3] === 0 && b[3] === 0) return true;
  if (tolerance === 0) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance &&
    Math.abs(a[3] - b[3]) <= tolerance
  );
}

/** Scanline flood fill — özyinelemesiz, yığın taşması yok */
/**
 * `clip` verilirse doldurma o dikdörtgenin dışına taşmaz.
 * Seçim aktifken kova sadece seçimin içini boyasın diye var — Aseprite da
 * böyle davranıyor ve gölgelendirme yaparken tam olarak beklenen şey bu.
 */
export interface ClipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function floodFill(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  fill: RGBA,
  tolerance = 0,
  clip?: ClipRect,
): void {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  // sınırları clip ile kesiştir; clip yoksa tüm tuval
  const cx0 = clip ? Math.max(0, clip.x) : 0;
  const cy0 = clip ? Math.max(0, clip.y) : 0;
  const cx1 = clip ? Math.min(w, clip.x + clip.w) : w;
  const cy1 = clip ? Math.min(h, clip.y + clip.h) : h;
  if (sx < cx0 || sy < cy0 || sx >= cx1 || sy >= cy1) return;

  const target = getPixel(data, sx, sy, w, h);
  if (colorsEqual(target, fill, 0)) return;

  const seen = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  const match = (x: number, y: number) =>
    x >= cx0 &&
    x < cx1 &&
    y >= cy0 &&
    y < cy1 &&
    !seen[y * w + x] &&
    colorsEqual(getPixel(data, x, y, w, h), target, tolerance);

  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    if (y < cy0 || y >= cy1) continue;
    while (x >= cx0 && match(x, y)) x--;
    x++;
    let spanUp = false;
    let spanDown = false;
    while (x < cx1 && match(x, y)) {
      seen[y * w + x] = 1;
      setPixel(data, x, y, w, h, fill);
      const upOk = y > cy0 && match(x, y - 1);
      if (!spanUp && upOk) {
        stack.push(x, y - 1);
        spanUp = true;
      } else if (spanUp && !upOk) spanUp = false;
      const downOk = y < cy1 - 1 && match(x, y + 1);
      if (!spanDown && downOk) {
        stack.push(x, y + 1);
        spanDown = true;
      } else if (spanDown && !downOk) spanDown = false;
      x++;
    }
  }
}

/** Global fill — bitişik olmayan, aynı renkteki her piksel */
export function replaceColor(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  target: RGBA,
  fill: RGBA,
  tolerance = 0,
  clip?: ClipRect,
): void {
  const y0 = clip ? Math.max(0, clip.y) : 0;
  const y1 = clip ? Math.min(h, clip.y + clip.h) : h;
  const x0 = clip ? Math.max(0, clip.x) : 0;
  const x1 = clip ? Math.min(w, clip.x + clip.w) : w;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (colorsEqual(getPixel(data, x, y, w, h), target, tolerance)) {
        setPixel(data, x, y, w, h, fill);
      }
    }
  }
}

export function rectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): Point[] {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const out: Point[] = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const edge = x === xa || x === xb || y === ya || y === yb;
      if (filled || edge) out.push({ x, y });
    }
  }
  return out;
}

/**
 * Tam sayı elips (Bresenham/Zingl).
 * ctx.arc() KULLANILMAZ — anti-aliasing yapar, pixel art'ta kabul edilemez.
 */
export function ellipsePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): Point[] {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);

  const a = xb - xa;
  const b = yb - ya;
  if (a === 0 || b === 0) return line(xa, ya, xb, yb);

  const pts: Point[] = [];
  const b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;

  let left = xa;
  let right = xb;
  let top = ya + ((b + 1) >> 1);
  let bottom = top - b1;

  const aa = 8 * a * a;
  const bb = 8 * b * b;

  do {
    pts.push(
      { x: right, y: top },
      { x: left, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
    );
    const e2 = 2 * err;
    if (e2 <= dy) {
      top++;
      bottom--;
      dy += aa;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      left++;
      right--;
      dx += bb;
      err += dx;
    }
  } while (left <= right);

  while (top - bottom < b) {
    pts.push({ x: left - 1, y: top }, { x: right + 1, y: top });
    top++;
    pts.push({ x: left - 1, y: bottom }, { x: right + 1, y: bottom });
    bottom--;
  }

  if (!filled) return pts;

  // taramalı doldurma: her y için min/max x arasını doldur
  const byRow = new Map<number, [number, number]>();
  for (const p of pts) {
    const cur = byRow.get(p.y);
    if (!cur) byRow.set(p.y, [p.x, p.x]);
    else byRow.set(p.y, [Math.min(cur[0], p.x), Math.max(cur[1], p.x)]);
  }
  const out: Point[] = [];
  for (const [y, [minX, maxX]] of byRow) {
    for (let x = minX; x <= maxX; x++) out.push({ x, y });
  }
  return out;
}

/** Simetri uygulaması — nokta kümesini aynalar */
export function applySymmetry(
  pts: Point[],
  mode: "none" | "x" | "y" | "xy",
  w: number,
  h: number,
): Point[] {
  if (mode === "none") return pts;
  const out = pts.slice();
  const mx = (p: Point) => ({ x: w - 1 - p.x, y: p.y });
  const my = (p: Point) => ({ x: p.x, y: h - 1 - p.y });
  if (mode === "x" || mode === "xy") for (const p of pts) out.push(mx(p));
  if (mode === "y" || mode === "xy") for (const p of pts) out.push(my(p));
  if (mode === "xy") for (const p of pts) out.push(my(mx(p)));
  return out;
}

/** Katmanları tek bir RGBA buffer'a birleştirir (source-over, opaklıklı) */
export function composite(
  frame: Frame,
  layers: LayerMeta[],
  w: number,
  h: number,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const dst = out ?? new Uint8ClampedArray(w * h * 4);
  dst.fill(0);
  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const src = frame.cels[layer.id];
    if (!src) continue;
    const la = layer.opacity;
    for (let i = 0; i < dst.length; i += 4) {
      const sa = (src[i + 3] / 255) * la;
      if (sa <= 0) continue;
      if (sa >= 1) {
        dst[i] = src[i];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[i + 2];
        dst[i + 3] = 255;
        continue;
      }
      const da = dst[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      dst[i] = (src[i] * sa + dst[i] * da * (1 - sa)) / oa;
      dst[i + 1] = (src[i + 1] * sa + dst[i + 1] * da * (1 - sa)) / oa;
      dst[i + 2] = (src[i + 2] * sa + dst[i + 2] * da * (1 - sa)) / oa;
      dst[i + 3] = oa * 255;
    }
  }
  return dst;
}
