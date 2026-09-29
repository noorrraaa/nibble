import type { Metadata, Viewport } from "next";
import "./globals.css";
import { pageMetadata } from "@/lib/seo";
import { CF_ANALYTICS_SCRIPT, CF_ANALYTICS_TOKEN, SITE_URL } from "@/lib/site";

/**
 * Ana sayfanın üst bilgisi burada (sayfa "use client" olduğu için metadata veremiyor).
 * Kanonik adres ve kart `pageMetadata` ile; alt sayfalar kendilerininkini veriyor.
 */
const home = pageMetadata({
  path: "/",
  title: "Nibble | pixel art & animation editor",
  description:
    "Free pixel art and animation editor that runs in your browser. No account, no server. AI agents can connect and draw beside you.",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...home,
  keywords: [
    "pixel art",
    "pixel art editor",
    "animation",
    "GIF",
    "sprite",
    "free",
    "AI",
    "piksel",
    "animasyon",
  ],
  openGraph: {
    ...home.openGraph,
    description: "No account, no server, free. AI agents connect to the site and draw beside you.",
  },
  other: { "ai-tools": "/llms.txt" },
  // Simgeler: src/app/icon.svg + favicon.ico + apple-icon.png, manifest: src/app/manifest.ts.
  // Next bağlantılarını dosyalardan kendisi basıyor (scripts/make-icons.mjs üretiyor).
};

/**
 * Cloudflare Web Analytics: çerezsiz, kimliksiz, toplu sayım (gizlilik metni §3).
 * Yalnız üretim derlemesinde; `npm run dev` ziyaretleri sayılmaz.
 * CSP'de script-src'ye static.cloudflareinsights.com eklendi (security-headers.conf).
 */
const ANALYTICS = process.env.NODE_ENV === "production";

export const viewport: Viewport = {
  themeColor: "#14161f",
  width: "device-width",
  initialScale: 1,
};

/**
 * Tema ve dili İLK BOYAMADAN ÖNCE uygulayan minik script.
 *
 * İki sorunu birlikte çözüyor:
 *  1. Tema tercihi yalnızca editörde uygulanıyordu (üst bardaki düğme
 *     `data-theme`'i orada set ediyor); `/` ve `/agent/` her zaman koyu açılıyordu.
 *  2. Editörde bile tercih bir effect'te uygulandığı için koyu→açık geçişi
 *     gözle görülür bir kırpışma yapıyordu.
 *
 * React'ten önce çalıştığı için kırpışma yok. `suppressHydrationWarning`
 * zaten <html>'de: script'in yazdığı öznitelikler hidrasyonu bozmuyor.
 * Ayarlar okunamazsa (özel mod) sessizce koyu temada kalıyor.
 */
const THEME_BOOTSTRAP = `(function(){try{
var s=JSON.parse(localStorage.getItem("nibble.settings.v1")||"{}");
if(s.theme==="light"||s.theme==="dark")document.documentElement.setAttribute("data-theme",s.theme);
var l=localStorage.getItem("nibble.lang");
if(l!=="tr"&&l!=="en")l=(navigator.language||"").toLowerCase().indexOf("tr")===0?"tr":"en";
document.documentElement.lang=l;
}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        {ANALYTICS && (
          <script
            defer
            src={CF_ANALYTICS_SCRIPT}
            data-cf-beacon={JSON.stringify({ token: CF_ANALYTICS_TOKEN })}
          />
        )}
      </body>
    </html>
  );
}
