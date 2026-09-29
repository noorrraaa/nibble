import type { MetadataRoute } from "next";
import { AI_CRAWLERS, absoluteUrl } from "@/lib/seo";

// Statik export: derlemede tek sefer üretilip `out/robots.txt` olarak yazılır.
export const dynamic = "force-static";

/**
 * Herkese açık; yapay zekâ tarayıcılarına AYRICA ve açıkça izin veriliyor
 * (bazı tarayıcılar yalnız kendi adını arıyor, `*` kuralını yeterli saymıyor).
 * Ürünün amacı ajanların onu bulup kullanması: engellemek için bir sebep yok.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: [...AI_CRAWLERS], allow: "/" }, { userAgent: "*", allow: "/" }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
