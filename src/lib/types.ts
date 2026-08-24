/** Nibble — çekirdek tipler */

export type Hex = string;
export type RGBA = [number, number, number, number];

/**
 * Katmanlar proje seviyesinde global (Aseprite modeli).
 * Kare içine gömseydik "katmanı 1. kareye ekledim ama 2.'de yok" hatası kaçınılmaz olurdu.
 */
export interface LayerMeta {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0..1
  locked: boolean;
}

export interface Frame {
  id: string;
  /** GIF birimi: santisaniye (1/100 s) — tam sayı tutulur */
  durationCs: number;
  /** layerId -> RGBA buffer (width * height * 4) */
  cels: Record<string, Uint8ClampedArray>;
}

/**
 * İskelet (rig) — sprite'ın ANLAMSAL haritası.
 *
 * Amaç şu: bir ajan "sol kolu iki piksel aşağı al" diyebilsin, bunun için
 * 1024 pikseli tek tek hesaplamak zorunda kalmasın. Düğüm bir piksel
 * bölgesinin tutamağıdır; tutamağı sürüklersen bölgenin pikselleri gelir.
 *
 * Konumlar kare BAŞINA tutulur (poz anahtarı), böylece iki kare arasında
 * ara kare üretilebilir.
 */
export interface RigNode {
  name: string;
  /** frameId -> [x, y] — kare başına tutamak konumu */
  pos: Record<string, [number, number]>;
  /** Düğümün sürüklediği piksel dikdörtgeni, tutamağa GÖRELİ */
  region?: { dx: number; dy: number; w: number; h: number };
}
export interface RigBone {
  name: string;
  /** düğüm adı */
  from: string;
  /** düğüm adı */
  to: string;
}
export interface Rig {
  nodes: RigNode[];
  bones: RigBone[];
}

/** Bölgeye uygulanabilen kayıpsız dönüşümler */
export type RegionTransform = "flipX" | "flipY" | "rotate90" | "rotate180" | "rotate270";

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: Hex[];
  layers: LayerMeta[];
  frames: Frame[];
  /** UI kolaylığı; gerçek kaynak frame.durationCs */
  fps: number;
  createdAt: number;
  updatedAt: number;
  schemaVersion: 1;
  rig?: Rig;
}

export type ToolId =
  | "select"
  | "pen"
  | "eraser"
  | "fill"
  | "eyedropper"
  | "line"
  | "rect"
  | "ellipse"
  | "pan";

export type SymmetryMode = "none" | "x" | "y" | "xy";

export interface Point {
  x: number;
  y: number;
}

/**
 * GIF kare süresini TAM SAYI santisaniye tutuyor, yani 100/fps tam çıkmalı.
 * Dikkat: "fps 100'ün böleni olmalı" demek yanlış — 12.5 böleni değil ama
 * 100/12.5 = 8 cs, tam sayı, sorun yok. 60 fps ise 1.67 cs eder ve kayar.
 */
export const FPS_OPTIONS = [5, 10, 12.5, 20, 25, 50] as const;

/**
 * Tuval kenar tavanı. TEK yerde duruyor çünkü üç ayrı kapı aynı sınırı
 * uygulamak zorunda: yeni proje diyaloğu, ajan API'si ve `.nibble` içe alma.
 * Ayrı sabitler yazsaydık dosyadan gelen 100000×100000 bir proje sekmeyi
 * kilitlerdi — sınır sadece elle girilen yerde kalırdı.
 */
export const MAX_CANVAS_SIDE = 512;

/**
 * Rig parça kutusunun kenar tavanı. Tuvalden büyük olabilir (keyfi açı
 * döndürme kutuyu büyütüyor: 512 kenar 45°'de ~725) ama sınırsız olamaz —
 * kutu `w*h*4` baytlık bir tampon ayırıyor ve doğrulanmamış bir kutu
 * tarayıcıda `RangeError: Array buffer allocation failed` üretiyor.
 */
export const MAX_REGION_SIDE = 2048;

export const fpsToCs = (fps: number) => Math.max(1, Math.round(100 / fps));
export const csToFps = (cs: number) => Math.round((100 / cs) * 10) / 10;

let counter = 0;
export function uid(prefix = "id"): string {
  counter = (counter + 1) % 0xffff;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(
    Math.random() * 0xffff,
  ).toString(36)}`;
}

/**
 * Geçerli hex: 3 (#rgb), 6 (#rrggbb) veya 8 (#rrggbbaa) hane.
 *
 * ARADAKİ UZUNLUKLAR GEÇERSİZ ve bunu tek yerden söylemek şart: doğrulama
 * `{3,8}` gibi bir aralıkla yapılırsa 4/5/7 haneli girdi kabul edilir ama
 * hiçbir ayrıştırıcı doğru çözemez — "#12345" sessizce yanlış renge dönüşür.
 */
export function isHex(v: unknown): v is Hex {
  return typeof v === "string" && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}

/**
 * Depoya girmeden önce hex'i tek biçime sokar: `#` önekli, küçük harf.
 *
 * Şart, çünkü palet değerleri doğrudan CSS'e yazılıyor ve `#` OLMADAN geçersiz
 * renk oluyor: `background: "f0a"` uygulanmıyor, swatch bomboş çıkıyor
 * (tarayıcıda ölçüldü). `isHex` `#`'siz yazımı kabul ediyor — ajan da
 * kullanıcının dosyası da öyle gönderebilir — o yüzden normalleştirme
 * doğrulamanın yanında duruyor.
 */
export function normaliseHex(hex: Hex): Hex {
  const h = String(hex ?? "").trim().toLowerCase();
  return h.startsWith("#") ? h : `#${h}`;
}

/**
 * Hex → RGBA. Projedeki TEK hex ayrıştırıcısı.
 * (Resim aktarma kendi `parseInt`'ini kullanıyordu ve 3 haneli hex'i
 * açmadığı için "#f0a" yanlış renk veriyordu. İki ayrıştırıcı = iki davranış.)
 */
export function hexToRgba(hex: Hex): RGBA {
  let h = String(hex ?? "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return [0, 0, 0, 255];
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  if (Number.isNaN(n) || Number.isNaN(a)) return [0, 0, 0, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export function rgbaToHex([r, g, b]: RGBA): Hex {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

