/**
 * 404 — statik export'ta `out/404.html` olur, nginx bilinmeyen her yolda bunu verir.
 * Next.js'in varsayılanı İngilizce "This page could not be found." idi; site
 * Türkçe-önce olduğu için kendi sayfamız. Sunucu bileşeni: JS gerekmez.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { OG_IMAGE, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sayfa bulunamadı | Nibble",
  // Kök layout ana sayfanın kanonik adresini ve kartını taşıyor; 404 onları miras almasın.
  alternates: { canonical: null },
  openGraph: { siteName: SITE_NAME, title: "Sayfa bulunamadı | Nibble", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: "Sayfa bulunamadı | Nibble", images: [OG_IMAGE.url] },
};

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh" }} lang="tr">
      <article className="wrap doc legal">
        <h1 className="doc-title">Bu sayfa yok</h1>
        <p className="hero-lede">
          Aradığın adres taşınmış ya da hiç olmamış olabilir. Çizimlerin yerinde:
          onlar bu tarayıcıda duruyor, adresle ilgisi yok.
        </p>
        <p>
          <Link href="/">Ana sayfaya dön</Link> · <Link href="/editor/">Editörü aç</Link>
        </p>
        <p className="hint" lang="en">
          Page not found. <Link href="/">Back to home</Link>
        </p>
      </article>
    </main>
  );
}
