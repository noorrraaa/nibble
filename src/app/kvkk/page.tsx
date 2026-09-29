import type { Metadata } from "next";
import { LEGAL_ALTERNATES, pageMetadata } from "@/lib/seo";
import LegalPage from "@/components/legal-page";
import { kvkkDoc } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({
  path: "/kvkk/",
  title: "KVKK Aydınlatma Metni | Nibble",
  description:
    "6698 sayılı KVKK m.10 uyarınca Nibble aydınlatma metni: hangi veri işleniyor, neden, kime ve hangi ülkeye aktarılıyor, hakların neler.",
  languages: LEGAL_ALTERNATES.kvkk,
  locale: "tr_TR",
});

export default function KvkkPage() {
  return <LegalPage doc={kvkkDoc()} kind="kvkk" />;
}
