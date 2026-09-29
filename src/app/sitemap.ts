import type { MetadataRoute } from "next";
import { SITEMAP_ROUTES, absoluteUrl } from "@/lib/seo";

// Statik export: derlemede tek sefer üretilip `out/sitemap.xml` olarak yazılır.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.map((path) => ({ url: absoluteUrl(path) }));
}
