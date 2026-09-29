"use client";

/**
 * Alt bilgi bağlantıları: hukuki sayfalar + Nardin (ürünleri sergileyen site).
 * Arayüz İngilizceyse İngilizce çevirilere (`/privacy/`, `/kvkk/en/`) gider;
 * Türkçe asıllar dil bağlantısıyla her zaman erişilebilir.
 */

import Link from "next/link";
import { useLang, useT } from "@/lib/i18n";
import { LEGAL_ALTERNATES } from "@/lib/seo";
import { NARDIN_URL } from "@/lib/site";

export default function SiteLinks() {
  const t = useT();
  const lang = useLang();
  return (
    <nav className="foot-links" aria-label={t.landing.footNav}>
      <Link href={LEGAL_ALTERNATES.privacy[lang]}>{t.landing.footPrivacy}</Link>
      <Link href={LEGAL_ALTERNATES.kvkk[lang]}>{t.landing.footKvkk}</Link>
      <a href={NARDIN_URL}>Nardin</a>
    </nav>
  );
}
