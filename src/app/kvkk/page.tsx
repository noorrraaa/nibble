import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import LegalPage from "@/components/legal-page";
import { kvkkDoc } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({
  path: "/kvkk/",
  title: "KVKK Aydınlatma Metni | Nibble",
  description:
    "6698 sayılı KVKK m.10 uyarınca Nibble aydınlatma metni: hangi veri işleniyor, neden, kime ve hangi ülkeye aktarılıyor, hakların neler.",
});

export default function KvkkPage() {
  return <LegalPage doc={kvkkDoc()} />;
}
