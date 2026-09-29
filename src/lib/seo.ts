import type { Metadata } from "next";
import { SITE_URL } from "./site";

/**
 * Sayfa başına kanonik adres + Open Graph + Twitter kartı.
 *
 * Adresler GÖRELİ; kök layout'taki `metadataBase` (SITE_URL) onları mutlak yapar,
 * domain yine yalnız `site.ts`'de durur.
 *
 * Neden her sayfada ayrı: Next üst bilgiyi anahtar anahtar birleştirir; bir sayfa
 * `openGraph` verirse layout'takinin TAMAMI (resim dahil) düşer. Kanonik adres de
 * layout'a konmaz, yoksa 404 dahil her sayfa kendini ana sayfa ilan eder.
 *
 * Başlık/açıklama dili: sayfa başlıkları bilinçli olarak İngilizce (global arama;
 * docs/DURUM.md "/editor başlığı tek dilli Türkçeydi"). Hukuki sayfalar iki dilli:
 * Türkçe asıl (`/gizlilik/`, `/kvkk/`), İngilizce çeviri (`/privacy/`, `/kvkk/en/`);
 * her biri `hreflang` ile diğerini gösterir (`LEGAL_ALTERNATES`).
 * Kart metni sayfanın kendi başlığını tekrar eder; OG görselinde yazı dili yok.
 */
export const SITE_NAME = "Nibble";

export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Nibble",
} as const;

/** `trailingSlash: true` ile çalışıyoruz: kanonik adres de eğik çizgiyle biter. */
export function canonicalPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.endsWith("/") ? p : `${p}/`;
}

export function pageMetadata(opts: {
  path: string;
  title: string;
  description: string;
  /** hreflang karşılıkları, ör. `{ tr: "/gizlilik/", en: "/privacy/" }` (sayfanın kendisi dahil). */
  languages?: Record<string, string>;
  /** Open Graph yereli, ör. "tr_TR". */
  locale?: string;
}): Metadata {
  const url = canonicalPath(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: opts.languages ? { canonical: url, languages: opts.languages } : { canonical: url },
    openGraph: {
      type: "website",
      url,
      ...(opts.locale ? { locale: opts.locale } : {}),
      siteName: SITE_NAME,
      title: opts.title,
      description: opts.description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [OG_IMAGE.url],
    },
  };
}

/**
 * Site haritasındaki sayfalar. `src/app` altına sayfa eklenince buraya da yaz;
 * `seo.test.ts` iki listeyi karşılaştırıyor.
 */
export const SITEMAP_ROUTES = [
  "/",
  "/editor/",
  "/agent/",
  "/gizlilik/",
  "/privacy/",
  "/kvkk/",
  "/kvkk/en/",
] as const;

/**
 * Hukuki sayfaların dil karşılıkları. Türkçe asıl, İngilizce çeviri. Sayfaların
 * üst bilgisi (hreflang), site haritası ve dil bağlantıları buradan okur.
 */
export const LEGAL_ALTERNATES = {
  privacy: { tr: "/gizlilik/", en: "/privacy/" },
  kvkk: { tr: "/kvkk/", en: "/kvkk/en/" },
} as const;

/** Bir yolun hreflang karşılıkları (hukuki sayfa değilse undefined). */
export function languageAlternates(path: string): Record<string, string> | undefined {
  const p = canonicalPath(path);
  return Object.values(LEGAL_ALTERNATES).find((alt) => alt.tr === p || alt.en === p);
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * robots.txt'de adıyla izin verilen yapay zekâ tarayıcıları. Arama (OAI-SearchBot,
 * Claude-SearchBot, PerplexityBot), kullanıcı adına anlık okuma (ChatGPT-User,
 * Claude-User, Perplexity-User) ve eğitim (GPTBot, ClaudeBot, Google-Extended,
 * Applebot-Extended, CCBot) ayrı ajanlar; hepsine açık.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bingbot",
] as const;
