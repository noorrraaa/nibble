/**
 * Nibble — Ajan politikası (izin kapsamları + hız sınırı + yük tavanları)
 *
 * DÜRÜST SINIR: Bir tarayıcı ajanı sayfayla aynı JS bağlamında çalışır, yani
 * teorik olarak konsoldan istediği kodu çalıştırabilir. Bunu tarayıcı içinden
 * kapatmanın yolu yok. Bu dosyanın amacı farklı ve gerçekçi:
 *
 *   1. Ajana SUNULAN yüzeyi asgari tutmak — depolama, ayarlar, diğer projeler
 *      ve dosya sistemi API'nin parçası bile değil.
 *   2. Geri döndürülemez işleri (boyut değiştirme, silme, proje sıfırlama) ve
 *      dışarı çıkan işleri (indirme, uzak URL yükleme) kullanıcı açıkça izin
 *      verene kadar reddetmek.
 *   3. Kaçak bir döngünün tuvali doldurmasını hız sınırı ve yük tavanlarıyla
 *      engellemek.
 *   4. Yapılan her şeyi görünür kılmak (eylem şeridi) ve tek Ctrl+Z ile geri
 *      alınabilir tutmak.
 *
 * Yani: "ajan bir şey bozarsa kullanıcı bunu görür ve tek tuşla geri alır".
 */

import type { Settings } from "./storage";
import { MAX_CANVAS_SIDE, MAX_REGION_SIDE } from "./types";

export type AgentScope =
  | "draw"
  | "animate"
  | "layers"
  | "palette"
  | "destructive"
  | "files";

/** UI bu sırayla gösterir; yıkıcı olanlar sonda */
export const AGENT_SCOPES: AgentScope[] = [
  "draw",
  "animate",
  "layers",
  "palette",
  "destructive",
  "files",
];

export interface AgentPolicy {
  /** Ana şalter — kapalıyken window.nibble tamamen kaldırılır */
  enabled: boolean;
  scopes: Record<AgentScope, boolean>;
}

/**
 * Varsayılan: çizim/animasyon/katman/palet açık (ajanın işi bu),
 * yıkıcı ve dosya-ağ kapalı (geri dönüşü pahalı olan bunlar).
 */
export const DEFAULT_POLICY: AgentPolicy = {
  enabled: true,
  scopes: {
    draw: true,
    animate: true,
    layers: true,
    palette: true,
    destructive: false,
    files: false,
  },
};

export const AGENT_LIMITS = {
  /** kayan pencerede izin verilen çağrı sayısı */
  callsPerWindow: 120,
  windowMs: 10_000,
  /** drawFromText */
  maxRows: 4096,
  maxRowLength: 4096,
  maxLegendEntries: 512,
  /** setPixels */
  maxPixels: 250_000,
  /** setPalette */
  maxPaletteColors: 1024,
  /** eylem şeridinde tutulan kayıt sayısı */
  maxLogEntries: 60,
  /** tuval kenar uzunluğu tavanı — belge modeli ve dosya içe alma da aynısını uygular */
  maxCanvasSide: MAX_CANVAS_SIDE,
  /** parça kutusu kenar tavanı — gerekçesi types.MAX_REGION_SIDE'da */
  maxRegionSide: MAX_REGION_SIDE,
} as const;

/** Ayarlardan gelen serbest biçimli veriyi güvenli politikaya sabitler */
export function normalisePolicy(raw: Settings["agentPolicy"]): AgentPolicy {
  const scopes = { ...DEFAULT_POLICY.scopes };
  const given = raw?.scopes;
  if (given && typeof given === "object") {
    for (const key of AGENT_SCOPES) {
      if (typeof given[key] === "boolean") scopes[key] = given[key];
    }
  }
  return {
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_POLICY.enabled,
    scopes,
  };
}

/**
 * Kayan pencere hız sınırı. Sayaç değil dizi: pencere dolduğunda eski
 * damgalar düşer, böylece "10 saniyede 120" gerçekten 10 saniyeye yayılır.
 */
export class RateLimiter {
  private stamps: number[] = [];

  // Tipler açıkça `number`: AGENT_LIMITS `as const` olduğu için varsayılandan
  // çıkarım 120/10000 LİTERALLERİNİ dayatıyor ve sınıf test edilemez oluyor.
  constructor(
    private readonly limit: number = AGENT_LIMITS.callsPerWindow,
    private readonly windowMs: number = AGENT_LIMITS.windowMs,
  ) {}

  /** true = geçebilir */
  take(now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    while (this.stamps.length && this.stamps[0] < cutoff) this.stamps.shift();
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }

  /** Sınır aşıldıysa kaç ms sonra tekrar denenebilir */
  retryAfterMs(now = Date.now()): number {
    if (!this.stamps.length) return 0;
    return Math.max(0, this.stamps[0] + this.windowMs - now);
  }

  reset() {
    this.stamps = [];
  }
}

/**
 * importImage için URL denetimi.
 *
 * data: ve blob: kullanıcının kendi verisidir, dışarı istek çıkmaz → serbest.
 * Aynı köken → serbest. Uzak http(s) dış dünyaya istek demektir; hem izleme
 * hem (URL yoluna veri gömerek) sızdırma yüzeyi → "files" izni gerekir.
 * Diğer şemalar (javascript:, filesystem: …) her koşulda reddedilir.
 *
 * DİKKAT — bu kararı REGEX ile vermek yetmiyor, bir kez öyle yazıldı ve
 * atlatılabiliyordu. Tarayıcının URL ayrıştırıcısı girdiyi normalize ediyor:
 * ters bölü çizgileri eğik çizgiye çeviriyor ve gömülü tab/satır sonu
 * karakterlerini siliyor. Yani `\\evil.com/a.png` ve `ht<TAB>tp://evil.com`
 * regex'e "göreli yol" gibi görünüyor ama tarayıcı ikisini de
 * `http://evil.com/a.png` diye çözüyordu — "files" izni olmadan dışarıya
 * istek. Bu yüzden kararı `new URL()` sonucunun üstünden veriyoruz: ne
 * görürsek tarayıcı da onu görüyor.
 */
export type UrlVerdict =
  | { kind: "allowed" }
  | { kind: "needs-files" }
  | { kind: "rejected"; reason: string };

/** Testler DOM'suz koştuğu için sayfa kökeni yoksa tarafsız bir taban kullanıyoruz */
const FALLBACK_BASE = "http://nibble.localhost/";

export function classifyImageSource(src: string): UrlVerdict {
  const s = String(src ?? "").trim();
  if (!s) return { kind: "rejected", reason: "Boş kaynak" };

  const base = typeof location !== "undefined" && location.href ? location.href : FALLBACK_BASE;

  let url: URL;
  let baseOrigin: string;
  try {
    url = new URL(s, base);
    baseOrigin = new URL(base).origin;
  } catch {
    return { kind: "rejected", reason: "URL çözümlenemedi" };
  }

  const scheme = url.protocol.toLowerCase();

  if (scheme === "data:") {
    return /^data:image\//i.test(url.href)
      ? { kind: "allowed" }
      : { kind: "rejected", reason: "Yalnızca data:image/* kabul edilir" };
  }
  if (scheme === "blob:") return { kind: "allowed" };
  if (scheme === "http:" || scheme === "https:") {
    return url.origin === baseOrigin ? { kind: "allowed" } : { kind: "needs-files" };
  }
  return { kind: "rejected", reason: "Desteklenmeyen URL şeması" };
}

/** Sayı girdilerini sessizce kırpmak yerine açıkça sınırlar */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
