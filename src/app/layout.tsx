import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nibble | pixel art & animation editor",
  description:
    "Free pixel art and animation editor that runs in your browser. No account, no server. AI agents can connect and draw beside you.",
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
    title: "Nibble | pixel art & animation editor",
    description:
      "No account, no server, free. AI agents connect to the site and draw beside you.",
    type: "website",
  },
  other: { "ai-tools": "/llms.txt" },
};

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
      <body>{children}</body>
    </html>
  );
}
