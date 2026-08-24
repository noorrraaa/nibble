import type { NextConfig } from "next";

/**
 * Backend yok — tamamen statik export.
 * Vercel / Cloudflare Pages / GitHub Pages ücretsiz katmanında çalışır.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
