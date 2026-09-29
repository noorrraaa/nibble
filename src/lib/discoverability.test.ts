/**
 * Nibble — ajanların ve arama motorlarının siteyi bulması: llms.txt, JSON-LD,
 * robots.txt'deki yapay zekâ tarayıcıları, simgeler ve manifest.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { AI_CRAWLERS, SITEMAP_ROUTES } from "./seo";
import { NARDIN_URL, SITE_URL } from "./site";
import { jsonLdScript, webApplicationJsonLd } from "./structured-data";

const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const APP = join(ROOT, "src", "app");

const llms = readFileSync(join(PUBLIC, "llms.txt"), "utf8");
const llmsFull = readFileSync(join(PUBLIC, "llms-full.txt"), "utf8");

function links(md: string): string[] {
  return [...md.matchAll(/https:\/\/[^\s)]+/g)].map((m) => m[0].replace(/[.,:]$/, ""));
}

describe("llms.txt (llmstxt.org biçimi)", () => {
  test("H1 + özet alıntısı + bağlantı listeli H2 bölümleri", () => {
    const lines = llms.split("\n");
    assert.equal(lines[0], "# Nibble");
    assert.ok(lines.slice(1).find((l) => l.trim())?.startsWith("> "), "H1'den sonra ilk dolu satır > özet olmalı");
    assert.equal((llms.match(/^# /gm) ?? []).length, 1, "tek H1");
    assert.match(llms, /^## Docs$/m);
    // H2 altındaki bağlantılar [ad](url): açıklama biçiminde
    assert.match(llms, /^- \[[^\]]+\]\(https:\/\/[^)]+\): .+/m);
  });

  test("ajanın ilk adımı ve ürünün özü yazıyor", () => {
    for (const t of [llms, llmsFull]) {
      assert.ok(t.includes("window.nibble.help()"));
      assert.match(t, /IndexedDB/);
      assert.match(t, /free/i);
      assert.match(t, /Cloudflare Web Analytics|cookieless/i);
    }
    assert.ok(llms.includes(`${SITE_URL}/llms-full.txt`), "kısa dosya uzun dosyayı göstermeli");
  });

  test("bağlantılar mutlak ve yalnız bizim adreslerimiz; sayfalar gerçekten var", () => {
    for (const t of [llms, llmsFull]) {
      for (const url of links(t)) {
        assert.ok(url.startsWith(SITE_URL) || url.startsWith(NARDIN_URL), url);
        if (!url.startsWith(SITE_URL)) continue;
        const path = new URL(url).pathname;
        if (path.endsWith(".txt")) {
          assert.ok(existsSync(join(PUBLIC, path)), url);
        } else {
          assert.ok((SITEMAP_ROUTES as readonly string[]).includes(path), url);
        }
      }
    }
    for (const r of SITEMAP_ROUTES) assert.ok(llmsFull.includes(`${SITE_URL}${r}`), r);
  });

  test("uzun dosya izinleri ve sınırları koddaki değerlerle veriyor", () => {
    const policy = readFileSync(join(ROOT, "src", "lib", "agent-policy.ts"), "utf8");
    assert.match(policy, /destructive:\s*false/);
    assert.match(llmsFull, /destructive\s+OFF by default/);
    assert.match(llmsFull, /files\s+OFF by default/);
    assert.match(llmsFull, /5, 10, 12\.5, 20, 25, 50/);
  });

  test("uzun tire yok", () => {
    assert.ok(!llms.includes("—"));
    assert.ok(!llmsFull.includes("—"));
  });
});

describe("JSON-LD (schema.org WebApplication)", () => {
  const data = webApplicationJsonLd();
  const parsed = JSON.parse(jsonLdScript(data)) as Record<string, unknown>;

  test("geçerli JSON ve gidiş dönüş aynı", () => {
    assert.deepEqual(parsed, data);
  });

  test("zorunlu alanlar", () => {
    assert.equal(parsed["@context"], "https://schema.org");
    assert.equal(parsed["@type"], "WebApplication");
    assert.equal(parsed.name, "Nibble");
    assert.equal(parsed.url, `${SITE_URL}/`);
    assert.ok(["DesignApplication", "GraphicsApplication"].includes(parsed.applicationCategory as string));
    assert.equal(parsed.operatingSystem, "Any (web browser)");
    assert.equal(parsed.isAccessibleForFree, true);
    assert.deepEqual(parsed.offers, { "@type": "Offer", price: "0", priceCurrency: "USD" });
    assert.deepEqual(parsed.publisher, { "@type": "Person", name: "Emre Kızak", url: "https://nardin.app" });
    assert.ok(!JSON.stringify(parsed).includes("—"));
  });

  test("< kaçırılıyor: metin script bloğunu erken kapatamaz", () => {
    const out = jsonLdScript({ x: "</script><b>" });
    assert.ok(!out.includes("<"));
    assert.deepEqual(JSON.parse(out), { x: "</script><b>" });
  });

  test("ana sayfa bloğu basıyor", () => {
    const page = readFileSync(join(APP, "page.tsx"), "utf8");
    assert.match(page, /type="application\/ld\+json"/);
    assert.match(page, /jsonLdScript\(webApplicationJsonLd\(\)\)/);
  });
});

describe("robots.txt", () => {
  test("yapay zekâ tarayıcılarının hepsi adıyla listede", () => {
    for (const bot of [
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-User",
      "Claude-SearchBot",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
      "Bingbot",
    ]) {
      assert.ok((AI_CRAWLERS as readonly string[]).includes(bot), bot);
    }
    const robots = readFileSync(join(APP, "robots.ts"), "utf8");
    assert.match(robots, /userAgent: \[\.\.\.AI_CRAWLERS\], allow: "\/"/);
    assert.ok(!/disallow/i.test(robots));
  });
});

describe("simgeler ve manifest", () => {
  const pngSize = (p: string) => {
    const b = readFileSync(p);
    assert.equal(b.subarray(1, 4).toString("ascii"), "PNG", p);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };

  test("favicon.ico gerçek bir ICO (16/32/48)", () => {
    const b = readFileSync(join(APP, "favicon.ico"));
    assert.deepEqual([b.readUInt16LE(0), b.readUInt16LE(2), b.readUInt16LE(4)], [0, 1, 3]);
    assert.deepEqual([b[6], b[22], b[38]], [16, 32, 48]);
  });

  test("apple-icon 180, manifest simgeleri 192 ve 512", () => {
    assert.deepEqual(pngSize(join(APP, "apple-icon.png")), [180, 180]);
    assert.deepEqual(pngSize(join(PUBLIC, "icon-192.png")), [192, 192]);
    assert.deepEqual(pngSize(join(PUBLIC, "icon-512.png")), [512, 512]);
    assert.match(readFileSync(join(APP, "icon.svg"), "utf8"), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  test("manifest'in gösterdiği her simge public/ altında var", () => {
    const m = readFileSync(join(APP, "manifest.ts"), "utf8");
    const srcs = [...m.matchAll(/src: "([^"]+)"/g)].map((x) => x[1]);
    assert.ok(srcs.length >= 2);
    for (const s of srcs) assert.ok(existsSync(join(PUBLIC, s)), s);
    assert.match(m, /start_url: "\/editor\/"/);
  });

  test("nginx manifesti doğru türle ve metni UTF-8 veriyor", () => {
    const conf = readFileSync(join(ROOT, "nginx.conf"), "utf8");
    assert.match(conf, /location = \/manifest\.webmanifest \{\s*types \{ \}\s*default_type application\/manifest\+json;/);
    assert.match(conf, /^\s*charset utf-8;/m);
  });
});
