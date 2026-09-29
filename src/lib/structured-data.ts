/**
 * Nibble — ana sayfanın JSON-LD yapısal verisi (schema.org WebApplication).
 *
 * Arama motorları ve yapay zekâ tarayıcıları ürünü bu bloktan tanıyor: ne olduğu,
 * ücretsiz olduğu, hangi platformda çalıştığı, kimin yayımladığı. Veri burada,
 * `structured-data.test.ts` geçerli JSON olduğunu ve iddiaların doğru kaldığını kilitliyor.
 */

import { LEGAL_CONTROLLER, NARDIN_URL, SITE_URL } from "./site";

export function webApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Nibble",
    url: `${SITE_URL}/`,
    description:
      "Free pixel art and animation editor that runs entirely in the browser. No account, no server: " +
      "drawings stay in the browser's IndexedDB. Your own AI agent can connect through window.nibble and draw beside you.",
    applicationCategory: "DesignApplication",
    applicationSubCategory: "GraphicsApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript and a modern browser with IndexedDB.",
    inLanguage: ["en", "tr"],
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Pencil, eraser, line, rectangle, ellipse, flood fill, colour picker, selection",
      "Frames, timeline, onion skin, playback",
      "Project-global layers, rig parts and bones",
      "Export PNG, animated GIF, lossless APNG, sprite sheet with Aseprite-compatible JSON",
      "Agent API (window.nibble) with scoped permissions",
    ],
    image: `${SITE_URL}/og.png`,
    publisher: { "@type": "Person", name: LEGAL_CONTROLLER, url: NARDIN_URL },
    author: { "@type": "Person", name: LEGAL_CONTROLLER, url: NARDIN_URL },
  };
}

/**
 * `<script type="application/ld+json">` içine güvenle basılacak metin: `<` kaçırılır,
 * böylece metin içindeki bir "</script>" bloğu erken kapatamaz.
 */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
