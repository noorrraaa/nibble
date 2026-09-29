import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import LegalPage from "@/components/legal-page";
import { privacyDoc } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({
  path: "/gizlilik/",
  title: "Gizlilik Politikası | Nibble",
  description: "Nibble'da çizimlerin cihazında kalır: hesap yok, sunucu yok, çerez ve izleme yok.",
});

export default function PrivacyPage() {
  return <LegalPage doc={privacyDoc()} />;
}
