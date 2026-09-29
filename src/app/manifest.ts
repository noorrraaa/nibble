import type { MetadataRoute } from "next";

// Statik export: derlemede `out/manifest.webmanifest` olarak yazılır.
export const dynamic = "force-static";

/** Ana ekrana ekleme için asgari manifest. Renkler globals.css koyu temasıyla aynı. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nibble: pixel art & animation editor",
    short_name: "Nibble",
    description: "Free pixel art and animation editor that runs in your browser. No account, no server.",
    start_url: "/editor/",
    scope: "/",
    display: "standalone",
    background_color: "#14161f",
    theme_color: "#14161f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
