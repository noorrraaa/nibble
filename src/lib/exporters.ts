/** Nibble — dışa aktarım: PNG · GIF · sprite sheet · .nibble proje dosyası */

import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { encodeApng, type ApngStats } from "./apng";
import { nodePosResolved, normaliseRigName, regionRect } from "./rig";
import type { PixelDocument } from "./pixel-document";
import {
  FPS_OPTIONS,
  isHex,
  normaliseHex,
  MAX_CANVAS_SIDE,
  MAX_REGION_SIDE,
  uid,
  type Frame,
  type LayerMeta,
  type Project,
  type Rig,
  type RigBone,
  type RigNode,
} from "./types";

// ── yardımcılar ───────────────────────────────────────────────

function bufferToCanvas(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // ImageData yeni bir buffer ister; slice ile kopyalıyoruz
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  return c;
}

function scaleCanvas(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return src;
  const c = document.createElement("canvas");
  c.width = src.width * scale;
  c.height = src.height * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false; // KRİTİK — pixel art bulanıklaşmamalı
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG üretilemedi"))), "image/png"),
  );
}

const safeName = (s: string) => (s || "nibble").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);

// ── PNG ───────────────────────────────────────────────────────

export async function exportPng(
  doc: PixelDocument,
  frameIndex: number,
  scale = 1,
): Promise<void> {
  const { width, height, name } = doc.project;
  const data = doc.composite(frameIndex);
  const canvas = scaleCanvas(bufferToCanvas(data, width, height), scale);
  const blob = await canvasToBlob(canvas);
  download(blob, `${safeName(name)}_${String(frameIndex + 1).padStart(2, "0")}${scale > 1 ? `@${scale}x` : ""}.png`);
}

// ── GIF ───────────────────────────────────────────────────────

export interface GifStats {
  colors: number;
  quantized: boolean;
  partialAlphaPixels: number;
  bytes: number;
}

/**
 * GIF üç tuzak taşır:
 *  1) Gecikme TAM SAYI santisaniye (1/100s) — 100/fps tam çıkmalı (bkz. types.fpsToCs)
 *  2) Şeffaflık 1-bit — kısmi alfa yok, kullanıcıyı uyarıyoruz
 *  3) 256 renk sınırı — pixel art'ta genelde sorun değil, aşılırsa kuantize ediyoruz
 */
export async function exportGif(doc: PixelDocument): Promise<GifStats> {
  const { width, height, frames, name } = doc.project;

  const composites = frames.map((_, i) => doc.composite(i));

  // kısmi saydamlık tespiti (kullanıcı uyarısı için)
  let partialAlphaPixels = 0;
  for (const buf of composites) {
    for (let i = 3; i < buf.length; i += 4) {
      const a = buf[i];
      if (a > 0 && a < 255) partialAlphaPixels++;
    }
  }

  // pixel art genelde <256 renk kullanır: TAM renkleri koruyalım, kuantize etmeyelim
  const unique = new Map<number, number>(); // packed rgb -> index
  let hasTransparent = false;
  let tooMany = false;
  for (const buf of composites) {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] < 128) {
        hasTransparent = true;
        continue;
      }
      const packed = (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
      if (!unique.has(packed)) {
        if (unique.size >= 255) {
          tooMany = true;
          break;
        }
        unique.set(packed, unique.size);
      }
    }
    if (tooMany) break;
  }

  const gif = GIFEncoder();
  const delayMs = (cs: number) => Math.max(10, Math.round(cs * 10));
  let colorCount = 0;

  if (!tooMany) {
    // TAM eşleşme yolu — renk kaybı yok
    // index 0 saydam olarak ayrılır
    const palette: number[][] = [[0, 0, 0]];
    const lookup = new Map<number, number>();
    for (const [packed] of unique) {
      lookup.set(packed, palette.length);
      palette.push([(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]);
    }
    colorCount = palette.length;

    frames.forEach((frame, fi) => {
      const buf = composites[fi];
      const index = new Uint8Array(width * height);
      for (let p = 0, i = 0; i < buf.length; i += 4, p++) {
        if (buf[i + 3] < 128) {
          index[p] = 0;
          continue;
        }
        index[p] = lookup.get((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]) ?? 0;
      }
      gif.writeFrame(index, width, height, {
        palette: fi === 0 ? palette : undefined,
        delay: delayMs(frame.durationCs),
        transparent: hasTransparent,
        transparentIndex: 0,
        repeat: 0,
        dispose: hasTransparent ? 2 : -1,
      });
    });
  } else {
    // 255'ten fazla renk: gifenc ile kuantize et (alfa destekli format)
    const all = new Uint8ClampedArray(composites.length * width * height * 4);
    composites.forEach((b, i) => all.set(b, i * width * height * 4));
    const palette = quantize(all, 256, { format: "rgba4444", oneBitAlpha: true });
    colorCount = palette.length;

    frames.forEach((frame, fi) => {
      const index = applyPalette(composites[fi], palette, "rgba4444");
      gif.writeFrame(index, width, height, {
        palette: fi === 0 ? palette : undefined,
        delay: delayMs(frame.durationCs),
        transparent: true,
        transparentIndex: 0,
        repeat: 0,
        dispose: 2,
      });
    });
  }

  gif.finish();
  const bytes = gif.bytes();
  download(new Blob([bytes as unknown as BlobPart], { type: "image/gif" }), `${safeName(name)}.gif`);

  return {
    colors: colorCount,
    quantized: tooMany,
    partialAlphaPixels,
    bytes: bytes.length,
  };
}

// ── APNG ──────────────────────────────────────────────────────

/**
 * GIF'in iki sınırı yok: tam RGBA saydamlık ve sınırsız renk.
 * Yumuşak kenarlı ya da 256'dan fazla renkli işlerde doğru seçim bu.
 */
export async function exportApng(doc: PixelDocument): Promise<ApngStats> {
  const { width, height, frames, name } = doc.project;
  const { blob, stats } = await encodeApng(
    frames.map((f, i) => ({ data: doc.composite(i), durationCs: f.durationCs })),
    width,
    height,
  );
  download(blob, `${safeName(name)}.png`);
  return stats;
}

// ── sprite sheet (+ Aseprite uyumlu JSON) ─────────────────────

/**
 * Rig'i Aseprite'ın "slices" yapısına çeviriyor.
 *
 * Bu şans değil, birebir örtüşme: Aseprite slice'ı da adı olan bir dikdörtgen
 * + kare başına anahtar + pivot noktası. Yani parçalarımız Aseprite, Godot ve
 * Unity importer'larının ZATEN anladığı bir şeye dönüşüyor — sprite sheet'i
 * içe alan kişi "head" slice'ını orada bulur.
 */
function rigToSlices(doc: PixelDocument): unknown[] {
  const rig = doc.rig;
  if (!rig?.nodes.length) return [];
  const ids = doc.frames.map((f) => f.id);

  return rig.nodes
    .map((node) => {
      const keys = doc.frames
        .map((_, i) => {
          const at = nodePosResolved(node, ids, i);
          if (!at) return null;
          const r = regionRect(node, at);
          return {
            frame: i,
            // kutusu olmayan parça için 1×1: pivot bilgisi yine taşınsın
            bounds: r
              ? { x: r.x, y: r.y, w: r.w, h: r.h }
              : { x: at.x, y: at.y, w: 1, h: 1 },
            // pivot Aseprite'ta bounds'a GÖRELİ tutulur
            pivot: r ? { x: at.x - r.x, y: at.y - r.y } : { x: 0, y: 0 },
          };
        })
        .filter(Boolean);
      if (!keys.length) return null;
      return { name: node.name, color: "#0000ffff", keys };
    })
    .filter(Boolean) as unknown[];
}

export async function exportSpriteSheet(
  doc: PixelDocument,
  columns?: number,
  scale = 1,
): Promise<void> {
  const { width, height, frames, name } = doc.project;
  const cols = Math.max(1, columns ?? Math.ceil(Math.sqrt(frames.length)));
  const rows = Math.ceil(frames.length / cols);

  const sheet = document.createElement("canvas");
  sheet.width = width * cols;
  sheet.height = height * rows;
  const ctx = sheet.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const jsonFrames: Record<string, unknown> = {};

  frames.forEach((frame, i) => {
    const cx = (i % cols) * width;
    const cy = Math.floor(i / cols) * height;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(doc.composite(i)), width, height),
      cx,
      cy,
    );
    jsonFrames[`${safeName(name)} ${i}.ase`] = {
      frame: { x: cx, y: cy, w: width, h: height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height },
      sourceSize: { w: width, h: height },
      duration: frame.durationCs * 10, // ms
    };
  });

  const out = scaleCanvas(sheet, scale);
  download(await canvasToBlob(out), `${safeName(name)}_sheet.png`);

  // Godot / Unity importer'ları bu formatı doğrudan okur
  const meta = {
    frames: jsonFrames,
    meta: {
      app: "https://nibble.app",
      version: "1.0",
      image: `${safeName(name)}_sheet.png`,
      format: "RGBA8888",
      size: { w: sheet.width, h: sheet.height },
      scale: String(scale),
      frameTags: [],
      layers: doc.project.layers.map((l) => ({
        name: l.name,
        opacity: Math.round(l.opacity * 255),
        blendMode: "normal",
      })),
      slices: rigToSlices(doc),
      // kemikler Aseprite'ta karşılığı olmayan fazladan bilgi; standart
      // okuyucular yok sayar, .nibble'a geri dönerken kaybolmaz
      nibbleBones: doc.rig?.bones ?? [],
    },
  };
  download(
    new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" }),
    `${safeName(name)}_sheet.json`,
  );
}

// ── .nibble proje dosyası ─────────────────────────────────────

function bytesToBase64(bytes: Uint8ClampedArray): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8ClampedArray {
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serializeProject(p: Project): string {
  return JSON.stringify({
    ...p,
    frames: p.frames.map((f) => ({
      id: f.id,
      durationCs: f.durationCs,
      cels: Object.fromEntries(
        Object.entries(f.cels).map(([k, v]) => [k, bytesToBase64(v)]),
      ),
    })),
  });
}

/**
 * `.nibble` DOĞRULAMA.
 *
 * Bu fonksiyonun girdisi kullanıcının bir yerden aldığı dosya, yani
 * GÜVENİLMEYEN veri. Bir dönem `JSON.parse(...) as Project` yazıyordu ve
 * dosyanın yazdığı her şeye inanıyordu: `layers` alanı eksik bir dosya
 * ayrıştırmayı geçip tuval çiziminde patlıyor (beyaz ekran), `width: 100000`
 * yazan bir dosya ise `composite()`'i w*h*4 bayt ayırmaya zorlayıp sekmeyi
 * kilitliyordu. Kod çalıştırma yüzeyi yok ama iş kaybı var, o yüzden
 * şüpheliyi baştan reddediyoruz.
 */
const MAX_FRAMES = 4096;
const MAX_LAYERS = 256;

class NibbleFileError extends Error {}
const reject = (what: string): never => {
  throw new NibbleFileError(`.nibble: ${what}`);
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const sideOf = (v: unknown, label: string): number =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_CANVAS_SIDE
    ? (v as number)
    : reject(`${label} 1..${MAX_CANVAS_SIDE} aralığında bir tam sayı olmalı (${String(v)})`);

export function deserializeProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return reject("geçerli JSON değil");
  }
  if (!isObj(raw)) return reject("beklenen biçim bir nesne");
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)
    return reject(`desteklenmeyen schemaVersion: ${String(raw.schemaVersion)}`);

  const width = sideOf(raw.width, "width");
  const height = sideOf(raw.height, "height");
  const celBytes = width * height * 4;

  if (!Array.isArray(raw.layers) || !raw.layers.length) return reject("katman listesi yok");
  if (raw.layers.length > MAX_LAYERS) return reject(`çok fazla katman (${raw.layers.length})`);
  const layers: LayerMeta[] = raw.layers.map((l, i) => {
    if (!isObj(l) || typeof l.id !== "string" || !l.id) return reject(`katman ${i} bozuk`);
    return {
      id: l.id,
      name: typeof l.name === "string" ? l.name.slice(0, 60) : `Layer ${i + 1}`,
      visible: l.visible !== false,
      opacity: typeof l.opacity === "number" ? Math.max(0, Math.min(1, l.opacity)) : 1,
      locked: l.locked === true,
    };
  });

  if (!Array.isArray(raw.frames) || !raw.frames.length) return reject("kare listesi yok");
  if (raw.frames.length > MAX_FRAMES) return reject(`çok fazla kare (${raw.frames.length})`);
  const frames: Frame[] = raw.frames.map((f, i) => {
    if (!isObj(f) || typeof f.id !== "string" || !f.id) return reject(`kare ${i} bozuk`);
    if (!isObj(f.cels)) return reject(`kare ${i} cel taşımıyor`);
    const cels: Record<string, Uint8ClampedArray> = {};
    for (const [layerId, b64] of Object.entries(f.cels)) {
      if (typeof b64 !== "string") return reject(`kare ${i} / ${layerId} cel'i metin değil`);
      let bytes: Uint8ClampedArray;
      try {
        bytes = base64ToBytes(b64);
      } catch {
        return reject(`kare ${i} / ${layerId} cel'i base64 değil`);
      }
      // Uzunluk KONTROL EDİLMELİ: eksik/fazla bayt tuvalde kayık satırlar ve
      // okurken tanımsız piksel demek — sessizce bozuk bir belge oluşuyor.
      if (bytes.length !== celBytes)
        return reject(
          `kare ${i} / ${layerId} cel boyutu ${bytes.length}, beklenen ${celBytes} (${width}×${height})`,
        );
      cels[layerId] = bytes;
    }
    return {
      id: f.id,
      durationCs:
        typeof f.durationCs === "number" && f.durationCs >= 1
          ? Math.min(1000, Math.round(f.durationCs))
          : 10,
      cels,
    };
  });

  // normaliseHex: dosyadan "f0a" gelirse CSS'te geçersiz renk olup swatch'ı
  // boş bırakıyor — palet doğrudan style'a yazılıyor
  const palette = Array.isArray(raw.palette)
    ? raw.palette.filter(isHex).map(normaliseHex)
    : [];
  const fps =
    typeof raw.fps === "number" && (FPS_OPTIONS as readonly number[]).includes(raw.fps)
      ? raw.fps
      : 10;

  const rig = sanitiseRig(raw.rig);

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid("prj"),
    name: typeof raw.name === "string" ? raw.name.slice(0, 80) : "",
    width,
    height,
    palette,
    layers,
    frames,
    fps,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    schemaVersion: 1,
    ...(rig ? { rig } : {}),
  };
}

/**
 * Rig de dosyadan geliyor ve `region` bir tampon boyutuna dönüşüyor:
 * doğrulanmazsa bozuk bir dosya ilk `movePart`'ta tarayıcıyı tampon
 * ayıramaz duruma sokar. Bozuk düğümü atıyoruz, dosyayı reddetmiyoruz —
 * pikseller sağlamsa kullanıcı işini kaybetmesin.
 */
function sanitiseRig(raw: unknown): Rig | undefined {
  if (!isObj(raw)) return undefined;
  /**
   * Adlar da normalleştirilmek ZORUNDA, sadece kırpılmak değil: `deleteNode` /
   * `renameNode` gelen adı `normaliseRigName`'den geçirip karşılaştırıyor, yani
   * dosyadan "kol üst" diye ham bir ad girerse aranan "kol_üst" ile eşleşmiyor
   * ve parça ne silinebiliyor ne yeniden adlandırılabiliyor.
   */
  const seen = new Set<string>();
  const nodes: RigNode[] = (Array.isArray(raw.nodes) ? raw.nodes : []).flatMap((n) => {
    if (!isObj(n) || typeof n.name !== "string" || !isObj(n.pos)) return [];
    const name = normaliseRigName(n.name);
    // normalleştirme iki adı aynı yere düşürebilir; ikincisi düşer
    if (!name || seen.has(name)) return [];
    seen.add(name);
    const pos: Record<string, [number, number]> = {};
    for (const [frameId, p] of Object.entries(n.pos)) {
      if (Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") {
        pos[frameId] = [Math.round(p[0]), Math.round(p[1])];
      }
    }
    const r = n.region;
    const region =
      isObj(r) &&
      typeof r.w === "number" &&
      typeof r.h === "number" &&
      r.w >= 1 &&
      r.h >= 1 &&
      r.w <= MAX_REGION_SIDE &&
      r.h <= MAX_REGION_SIDE
        ? {
            dx: Math.round(Number(r.dx) || 0),
            dy: Math.round(Number(r.dy) || 0),
            w: Math.round(r.w),
            h: Math.round(r.h),
          }
        : undefined;
    return [{ name, pos, ...(region ? { region } : {}) }];
  });

  // Kemik uçları da aynı normalleştirmeden geçmeli, yoksa düğümler
  // normalleşirken kemikler eşleşmeyip sessizce düşerdi
  const names = new Set(nodes.map((n) => n.name));
  const bones: RigBone[] = (Array.isArray(raw.bones) ? raw.bones : []).flatMap((b) => {
    if (!isObj(b) || typeof b.from !== "string" || typeof b.to !== "string") return [];
    const from = normaliseRigName(b.from);
    const to = normaliseRigName(b.to);
    if (!names.has(from) || !names.has(to) || from === to) return [];
    const name = normaliseRigName(typeof b.name === "string" ? b.name : "") || `${from}-${to}`;
    return [{ name, from, to }];
  });
  return nodes.length || bones.length ? { nodes, bones } : undefined;
}

export function exportProjectFile(p: Project): void {
  download(
    new Blob([serializeProject(p)], { type: "application/json" }),
    `${safeName(p.name)}.nibble`,
  );
}
