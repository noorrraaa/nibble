import type { Metadata } from "next";
import { LEGAL_ALTERNATES, pageMetadata } from "@/lib/seo";
import LegalPage from "@/components/legal-page";
import { privacyDocEn } from "@/lib/legal";

/** `/gizlilik/`in İngilizce çevirisi; bağlayıcı olan Türkçe metin. */
export const metadata: Metadata = pageMetadata({
  path: "/privacy/",
  title: "Privacy Policy | Nibble",
  description:
    "In Nibble your drawings stay on your device: no account, no server, no cookies. Only cookieless, aggregate visit counts.",
  languages: LEGAL_ALTERNATES.privacy,
  locale: "en_US",
});

export default function PrivacyEnPage() {
  return <LegalPage doc={privacyDocEn()} kind="privacy" />;
}
