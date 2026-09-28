import type { Metadata } from "next";
import LegalPage from "@/components/legal-page";
import { kvkkDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni — Nibble",
  description: "6698 sayılı KVKK m.10 uyarınca Nibble aydınlatma metni.",
};

export default function KvkkPage() {
  return <LegalPage doc={kvkkDoc()} />;
}
