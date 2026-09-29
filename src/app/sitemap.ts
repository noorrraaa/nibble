import type { MetadataRoute } from "next";
import { SITEMAP_ROUTES, absoluteUrl, languageAlternates } from "@/lib/seo";

// Statik export: derlemede tek sefer üretilip `out/sitemap.xml` olarak yazılır.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.map((path) => {
    const langs = languageAlternates(path);
    return langs
      ? {
          url: absoluteUrl(path),
          alternates: {
            languages: Object.fromEntries(Object.entries(langs).map(([l, p]) => [l, absoluteUrl(p)])),
          },
        }
      : { url: absoluteUrl(path) };
  });
}
