/**
 * 404 — statik export'ta `out/404.html` olur, nginx bilinmeyen her yolda bunu verir.
 * Next.js'in varsayılanı İngilizce "This page could not be found." idi; site
 * Türkçe-önce olduğu için kendi sayfamız. Sunucu bileşeni: JS gerekmez.
 */

import Link from "next/link";

export const metadata = {
  title: "Sayfa bulunamadı | Nibble",
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
