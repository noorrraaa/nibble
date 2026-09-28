"use client";

/** Alt bilgi bağlantıları: hukuki sayfalar + Nardin (ürünleri sergileyen site). */

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { NARDIN_URL } from "@/lib/site";

export default function SiteLinks() {
  const t = useT();
  return (
    <nav className="foot-links" aria-label={t.landing.footNav}>
      <Link href="/gizlilik/">{t.landing.footPrivacy}</Link>
      <Link href="/kvkk/">KVKK</Link>
      <a href={NARDIN_URL}>Nardin</a>
    </nav>
  );
}
