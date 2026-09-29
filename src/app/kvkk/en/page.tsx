import type { Metadata } from "next";
import { LEGAL_ALTERNATES, pageMetadata } from "@/lib/seo";
import LegalPage from "@/components/legal-page";
import { kvkkDocEn } from "@/lib/legal";

/** `/kvkk/`nin İngilizce çevirisi; bağlayıcı olan Türkçe metin. */
export const metadata: Metadata = pageMetadata({
  path: "/kvkk/en/",
  title: "KVKK Privacy Notice | Nibble",
  description:
    "Nibble's notice under Article 10 of Turkish data protection law No. 6698 (KVKK): what data is processed, why, to whom and to which country it is transferred, and your rights.",
  languages: LEGAL_ALTERNATES.kvkk,
  locale: "en_US",
});

export default function KvkkEnPage() {
  return <LegalPage doc={kvkkDocEn()} kind="kvkk" />;
}
