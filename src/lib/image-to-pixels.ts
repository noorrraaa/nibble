/**
 * Nibble — resim → pixel art
 * Tamamen tarayıcıda: hiçbir şey sunucuya gitmez.
 *
 * Boru hattı: kademeli yarılama → palet seçimi → algısal kuantizasyon
 *             → sıralı (Bayer) dither → yalnız piksel temizliği
 */

import { hexToRgba, rgbaToHex, type Hex, type RGBA } from "./types";

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type RGB = [number, number, number];

/** Medyan kesim — görselden N renkli palet üretir (depth 4 → 16 renk) */
export function medianCut(pixels: RGB[], depth: number): RGB[] {
  if (!pixels.length) return [[0, 0, 0]];
  if (depth === 0) {
    const sum = pixels.reduce<RGB>(
      (a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]],
      [0, 0, 0],
    );
    return [
      [
        Math.round(sum[0] / pixels.length),
        Math.round(sum[1] / pixels.length),
        Math.round(sum[2] / pixels.length),
      ],
    ];
  }
  let channel = 0;
  let widest = -1;
  for (let ch = 0; ch < 3; ch++) {
    let min = 255;
    let max = 0;
    for (const p of pixels) {
      if (p[ch] < min) min = p[ch];
      if (p[ch] > max) max = p[ch];
    }
    if (max - min > widest) {
      widest = max - min;
      channel = ch;
    }
  }
  pixels.sort((a, b) => a[channel] - b[channel]);
  const mid = pixels.length >> 1;
  return medianCut(pixels.slice(0, mid), depth - 1).concat(
    medianCut(pixels.slice(mid), depth - 1),
  );
}

/**
 * Algısal ağırlıklı en yakın renk. Düz Öklid mesafesinden gözle
 * belirgin biçimde iyi sonuç verir (insan gözü yeşile duyarlı).
 */
export function nearestIndex(pal: RGB[], r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i];
    const dr = p[0] - r;
    const dg = p[1] - g;
    const db = p[2] - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Palet hex'lerini RGB'ye çevirir.
 *
 * `hexToRgba`'ya devrediyor çünkü burada bir zamanlar kendi `parseInt`'i vardı
 * ve 3 haneli hex'i açmadığı için aynı renk iki yerde iki farklı sonuç
 * veriyordu ("#f0a" → yanlış RGB). Ayrı dosyada duruyor ki DOM'suz test
 * edilebilsin.
 */
export function paletteToRgb(palette: Hex[]): RGB[] {
  return palette.map((h) => {
    const [r, g, b] = hexToRgba(h);
    return [r, g, b] as RGB;
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi"));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Dosya okunamadı"));
    fr.readAsDataURL(file);
  });
}

export interface ImportOptions {
  /** Hedef tuvalin uzun kenarı */
  size: number;
  /** Sabit palet (hex). Verilmezse görselden otomatik üretilir. */
  palette?: Hex[];
  /** Otomatik palet renk sayısı (2'nin kuvveti) */
  autoColors?: number;
  dither?: boolean;
  /** Beyaz/tek renk arka planı saydama çevir */
  removeBackground?: boolean;
  /** 0..255 — arka plan eşleşme toleransı */
  bgTolerance?: number;
}

export interface ImportResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  palette: Hex[];
}

export function imageToPixels(
  img: HTMLImageElement,
  opts: ImportOptions,
): ImportResult {
  const {
    size,
    palette,
    autoColors = 16,
    dither = true,
    removeBackground = false,
    bgTolerance = 24,
  } = opts;

  // en-boy oranını koru, uzun kenar = size
  const ratio = img.naturalWidth / img.naturalHeight;
  let tw = size;
  let th = size;
  if (ratio > 1) th = Math.max(1, Math.round(size / ratio));
  else if (ratio < 1) tw = Math.max(1, Math.round(size * ratio));

  // kademeli yarılama — kutu ortalaması detayı korur.
  // Tek adımda küçültmek ince detayı yok eder.
  let cur = document.createElement("canvas");
  cur.width = img.naturalWidth;
  cur.height = img.naturalHeight;
  const c0 = cur.getContext("2d", { willReadFrequently: true })!;
  c0.imageSmoothingEnabled = true;
  c0.imageSmoothingQuality = "high";
  c0.drawImage(img, 0, 0);

  while (cur.width / 2 > tw && cur.height / 2 > th) {
    const next = document.createElement("canvas");
    next.width = Math.max(tw, Math.floor(cur.width / 2));
    next.height = Math.max(th, Math.floor(cur.height / 2));
    const cx = next.getContext("2d", { willReadFrequently: true })!;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
  }

  const fin = document.createElement("canvas");
  fin.width = tw;
  fin.height = th;
  const fc = fin.getContext("2d", { willReadFrequently: true })!;
  fc.imageSmoothingEnabled = true;
  fc.imageSmoothingQuality = "high";
  fc.drawImage(cur, 0, 0, tw, th);

  const imageData = fc.getImageData(0, 0, tw, th);
  const d = imageData.data;

  // palet
  let pal: RGB[];
  if (palette && palette.length) {
    pal = paletteToRgb(palette);
  } else {
    const sample: RGB[] = [];
    const pixelCount = tw * th;
    const step = Math.max(1, Math.floor(pixelCount / 6000));
    for (let i = 0; i < pixelCount; i += step) {
      const j = i * 4;
      if (d[j + 3] < 8) continue;
      sample.push([d[j], d[j + 1], d[j + 2]]);
    }
    const depth = Math.max(1, Math.round(Math.log2(Math.max(2, autoColors))));
    pal = medianCut(sample, depth);
    // yinelenenleri ele
    const seen = new Set<string>();
    pal = pal.filter((p) => {
      const k = p.join(",");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Arka plan rengi = köşelerin ÇOĞUNLUĞU.
   *
   * Dört köşe hesaplanıp yalnızca `corners[0]` kullanılıyordu; sol-üst köşesi
   * karakterle dolu bir görselde arka plan hiç kalkmıyordu. Oylama toleranslı
   * (JPEG köşeleri birebir eşit çıkmıyor) ve saydam köşeler sayılmıyor —
   * sayılsaydı RGB'si 0,0,0 olan saydam köşe "arka plan siyah" dedirtip
   * karakterin siyah dış hattını siliyordu.
   */
  let bg: RGB | null = null;
  if (removeBackground) {
    const at = (i: number): { rgb: RGB; a: number } => ({
      rgb: [d[i], d[i + 1], d[i + 2]],
      a: d[i + 3],
    });
    const corners = [
      at(0),
      at((tw - 1) * 4),
      at((th - 1) * tw * 4),
      at((th * tw - 1) * 4),
    ].filter((c) => c.a >= 8);

    let bestVotes = 0;
    for (const c of corners) {
      const votes = corners.filter(
        (o) =>
          Math.abs(o.rgb[0] - c.rgb[0]) <= bgTolerance &&
          Math.abs(o.rgb[1] - c.rgb[1]) <= bgTolerance &&
          Math.abs(o.rgb[2] - c.rgb[2]) <= bgTolerance,
      ).length;
      if (votes > bestVotes) {
        bestVotes = votes;
        bg = c.rgb;
      }
    }
  }

  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const out = new Uint8ClampedArray(tw * th * 4);

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = (y * tw + x) * 4;
      const a = d[i + 3];
      if (a < 8) continue; // zaten saydam

      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      if (
        bg &&
        Math.abs(r - bg[0]) <= bgTolerance &&
        Math.abs(g - bg[1]) <= bgTolerance &&
        Math.abs(b - bg[2]) <= bgTolerance
      ) {
        continue; // arka planı saydam bırak
      }

      if (dither) {
        // sıralı (Bayer) dither: pixel art'ta Floyd-Steinberg'e tercih edilir —
        // deseni düzenli ve "elle yapılmış" görünür, gürültülü değil
        const off = ((BAYER4[y & 3][x & 3] + 0.5) / 16 - 0.5) * 40;
        r = clamp(r + off);
        g = clamp(g + off);
        b = clamp(b + off);
      }

      const c = pal[nearestIndex(pal, r, g, b)];
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }
  }

  cleanOrphans(out, tw, th);

  return {
    data: out,
    width: tw,
    height: th,
    palette: pal.map((p) => rgbaToHex([p[0], p[1], p[2], 255] as RGBA)),
  };
}

/**
 * Yalnız kalan tek piksel temizliği: komşularının hiçbiriyle eşleşmeyen
 * pikseli çoğunluk komşu rengine çevirir. Otomatik dönüşümün "gürültülü"
 * görünmesinin başlıca sebebi bu piksellerdir.
 */
export function cleanOrphans(data: Uint8ClampedArray, w: number, h: number): void {
  const src = data.slice();
  const key = (i: number) =>
    src[i + 3] === 0 ? "t" : `${src[i]},${src[i + 1]},${src[i + 2]}`;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const me = key(i);
      const counts = new Map<string, number>();
      let sameNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = ((y + dy) * w + (x + dx)) * 4;
          const k = key(j);
          if (k === me) sameNeighbors++;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      if (sameNeighbors > 0) continue; // yalnız değil
      let bestKey = me;
      let bestCount = 0;
      for (const [k, c] of counts) {
        if (c > bestCount) {
          bestCount = c;
          bestKey = k;
        }
      }
      if (bestCount < 5 || bestKey === me) continue; // net çoğunluk yoksa dokunma
      if (bestKey === "t") {
        data[i + 3] = 0;
      } else {
        const [r, g, b] = bestKey.split(",").map(Number);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  }
}
