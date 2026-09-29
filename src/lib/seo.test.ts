import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SITEMAP_ROUTES, absoluteUrl, canonicalPath, pageMetadata } from "./seo";
import { SITE_URL } from "./site";

// test-build/ altından proje köküne
const ROOT = join(__dirname, "..");
const APP = join(ROOT, "src", "app");

test("site haritasındaki her yol gerçek bir sayfa ve kendi kanonik adresini veriyor", () => {
  for (const route of SITEMAP_ROUTES) {
    const dir = join(APP, ...route.split("/").filter(Boolean));
    assert.ok(existsSync(join(dir, "page.tsx")), `${route} sayfası yok`);
    if (route === "/") continue; // ana sayfa "use client"; üst bilgisi kök layout'ta
    const own = ["page.tsx", "layout.tsx"].map((f) => join(dir, f)).filter(existsSync);
    assert.ok(
      own.some((f) => readFileSync(f, "utf8").includes(`path: "${route}"`)),
      `${route} kendi kanonik adresini vermiyor (kök layout'un "/" adresini miras alır)`,
    );
  }
});

test("404 sayfası ana sayfanın kanonik adresini miras almıyor", () => {
  const src = readFileSync(join(APP, "not-found.tsx"), "utf8");
  assert.match(src, /canonical:\s*null/);
});

test("mutlak adresler SITE_URL'den üretiliyor", () => {
  assert.equal(absoluteUrl("/sitemap.xml"), `${SITE_URL}/sitemap.xml`);
  assert.equal(canonicalPath("/agent"), "/agent/");
});

test("sayfa üst bilgisi kanonik adres, 1200x630 OG resmi ve büyük Twitter kartı veriyor", () => {
  const m = pageMetadata({ path: "/editor", title: "T", description: "D" });
  assert.equal(m.alternates?.canonical, "/editor/");
  const og = m.openGraph as { url?: string; images?: { width: number; height: number }[] };
  assert.equal(og.url, "/editor/");
  assert.deepEqual([og.images?.[0].width, og.images?.[0].height], [1200, 630]);
  assert.equal((m.twitter as { card?: string }).card, "summary_large_image");
});

test("OG resmi public/ altında gerçekten var ve 1200x630 PNG", () => {
  const buf = readFileSync(join(ROOT, "public", "og.png"));
  assert.equal(buf.subarray(1, 4).toString("ascii"), "PNG");
  assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [1200, 630]);
});
