/**
 * Nibble — hukuki metin testleri
 *
 * Metin "sunucuya gönderilmez, çerez yok, izleme yok" diyor. Bu iddialar
 * yalnız kod öyle kaldıkça doğru; biri bir fetch, bir analitik betiği ya da
 * bir çerez eklerse metin sessizce YALAN söylemeye başlar ve hiçbir derleme
 * bunu yakalamaz. Aşağıdaki testler kaynak kodu tarayıp iddiayla karşılaştırıyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { contactLine, kvkkDoc, linkSegments, privacyDoc, type LegalDoc } from "./legal";
import {
  CF_ANALYTICS_INFO_URL,
  CF_ANALYTICS_SCRIPT,
  CF_ANALYTICS_TOKEN,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  NARDIN_URL,
  SITE_URL,
} from "./site";

// test-build/<dosya>.js → depo kökü
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function allText(doc: LegalDoc): string {
  return [
    doc.title,
    doc.lede,
    ...doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])]),
  ].join("\n");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const SOURCES = sourceFiles(SRC).map((p) => ({ p, code: readFileSync(p, "utf8") }));

describe("hukuki metin — kimlik ve iletişim", () => {
  test("iş maili hiçbir metinde ve yapılandırmada geçmez", () => {
    for (const doc of [privacyDoc(), kvkkDoc()]) {
      assert.ok(!/dekatechs/i.test(allText(doc)), doc.title);
    }
    assert.ok(!/dekatechs/i.test(LEGAL_CONTACT_EMAIL));
  });

  test("adres yokken uydurmaz, 'yakında' der; verilince adresi basar", () => {
    assert.match(contactLine(""), /yakında/);
    assert.match(contactLine("ornek@ornek.test"), /ornek@ornek\.test/);
    assert.match(allText(privacyDoc("ornek@ornek.test")), /ornek@ornek\.test/);
    assert.match(allText(kvkkDoc("ornek@ornek.test")), /ornek@ornek\.test/);
  });

  test("KVKK m.10'un istediği başlıklar var", () => {
    const t = allText(kvkkDoc());
    for (const h of ["Veri sorumlusunun kimliği", "İşleme amaçları", "Hukuki sebepler", "Aktarım", "m.11"]) {
      assert.ok(t.includes(h), h);
    }
  });
});

describe("hukuki metin — iddialar koda karşı", () => {
  test("'sunucuya gönderilmez' iddiası: kodda harici istek yok", () => {
    // Tek izinli ağ yolu: ajanın "files" izniyle http(s) resim içe aktarması —
    // metin bunu ayrıca söylüyor. fetch/XHR/WebSocket/beacon hiçbir yerde olmamalı.
    const net = /\bfetch\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon/;
    const hits = SOURCES.filter(({ code }) => net.test(code)).map(({ p }) => p);
    assert.deepEqual(hits, [], "ağ isteği eklendiyse gizlilik metnini güncelle");
  });

  test("'çerez yok' iddiası: kod çerez yazmıyor", () => {
    const hits = SOURCES.filter(({ code }) => /document\.cookie/.test(code)).map(({ p }) => p);
    assert.deepEqual(hits, []);
  });

  test("'üçüncü taraf yazı tipi yok, tek harici betik ziyaret sayacı' iddiası", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    assert.ok(!/@import\s+url\(|fonts\.googleapis|@font-face/.test(css));
    // Google yazı tipi/etiket yöneticisi hiçbir yerde yok
    const banned = /next\/font\/google|googletagmanager|gtag\(|next\/script/;
    assert.deepEqual(SOURCES.filter(({ code }) => banned.test(code)).map(({ p }) => p), []);
    // src'li <script> YALNIZ kök layout'ta, o da Cloudflare beacon'ı
    const withSrc = SOURCES.filter(({ code }) => /<script[^>]+src=/.test(code)).map(({ p }) => p);
    assert.deepEqual(withSrc, [join(SRC, "app", "layout.tsx")]);
    const layout = readFileSync(join(SRC, "app", "layout.tsx"), "utf8");
    assert.match(layout, /src=\{CF_ANALYTICS_SCRIPT\}/);
    assert.equal((layout.match(/<script[^>]+src=/g) ?? []).length, 1, "beacon tek sefer yüklenmeli");
    // yalnız üretim derlemesinde
    assert.match(layout, /process\.env\.NODE_ENV === "production"/);
    assert.match(layout, /\{ANALYTICS && \(/);
  });

  test("'dosya/ağ izni varsayılan kapalı' iddiası policy ile aynı", () => {
    const policy = readFileSync(join(SRC, "lib", "agent-policy.ts"), "utf8");
    assert.match(policy, /destructive:\s*false/);
    assert.match(policy, /files:\s*false/);
    assert.match(allText(privacyDoc()), /varsayılan olarak kapalıdır/);
  });
});

describe("adresler", () => {
  test("yer tutucu yabancı domain yok — tek sabit nardin.app altında", () => {
    assert.equal(SITE_URL, "https://nibble.nardin.app");
    assert.equal(NARDIN_URL, "https://nardin.app");
    // nibble.app BİZİM DEĞİL (kayıtlı, park edilmiş) — koda geri girmemeli
    const hits = SOURCES.filter(({ code }) => /https?:\/\/nibble\.app/.test(code)).map(({ p }) => p);
    assert.deepEqual(hits, []);
  });
});

describe("ziyaret sayacı (Cloudflare Web Analytics)", () => {
  test("token ve betik adresi doğru, beacon verisi geçerli JSON", () => {
    assert.equal(CF_ANALYTICS_TOKEN, "47a67e735fc741a98bd12c85dbbacfe2");
    assert.match(CF_ANALYTICS_TOKEN, /^[0-9a-f]{32}$/);
    assert.equal(CF_ANALYTICS_SCRIPT, "https://static.cloudflareinsights.com/beacon.min.js");
    const layout = readFileSync(join(SRC, "app", "layout.tsx"), "utf8");
    assert.match(layout, /data-cf-beacon=\{JSON\.stringify\(\{ token: CF_ANALYTICS_TOKEN \}\)\}/);
  });

  test("CSP beacon'ın kökenine izin veriyor, connect-src https: açık kalıyor", () => {
    const conf = readFileSync(join(ROOT, "security-headers.conf"), "utf8");
    const csp = conf.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? "";
    const dir = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) ?? "";
    assert.ok(dir("script-src").split(" ").includes(new URL(CF_ANALYTICS_SCRIPT).origin), dir("script-src"));
    assert.ok(!dir("script-src").includes("unsafe-eval"));
    assert.ok(dir("connect-src").split(" ").includes("https:"), dir("connect-src"));
  });
});

describe("hukuki metin — analitik eklendikten sonra doğru", () => {
  const privacy = allText(privacyDoc());
  const kvkk = allText(kvkkDoc());

  test("eski yanlış iddialar geri gelmiyor", () => {
    assert.ok(!/Analitik, reklam ya da izleme betiği yok/.test(privacy));
    assert.ok(!/üçüncü taraf yazı tipi veya betik yüklenmiyor/.test(privacy));
    assert.ok(!/İşlenebilecek tek veri/.test(kvkk));
    assert.ok(!/sağlayıcı yurt dışında bulunabilir/.test(kvkk));
  });

  test("gizlilik metni sayacı, topladığını ve sağlayıcıyı söylüyor", () => {
    for (const s of [
      "Cloudflare Web Analytics",
      "Çerez kullanmıyoruz",
      "çerez ya da tarayıcı deposu kullanmaz",
      "seni tanımlamaz",
      "sayfanın adresi",
      "yönlendiren",
      "tarayıcı ve işletim sistemi türü",
      "Ülke",
      "toplu sayıları",
      "Cloudflare, Inc. (ABD)",
      CF_ANALYTICS_INFO_URL,
    ]) {
      assert.ok(privacy.includes(s), s);
    }
  });

  test("KVKK metni yurt dışı aktarımını ve sağlayıcıyı açıkça yazıyor", () => {
    const aktarim = kvkkDoc().sections.find((s) => s.heading.includes("Aktarım"));
    const t = (aktarim?.paragraphs ?? []).join(" ");
    assert.match(t, /Cloudflare, Inc\. \(ABD\)/);
    assert.match(t, /yurt dışına aktarılmış olur \(KVKK m\.9\)/);
    assert.ok(t.includes(CF_ANALYTICS_INFO_URL));
    assert.match(kvkk, /Cloudflare Web Analytics/);
    assert.match(kvkk, /Çerez kullanılmaz/);
  });

  test("çizimler hâlâ tarayıcıdan çıkmıyor diyor", () => {
    assert.match(privacy, /Çizimlerin ve projelerin ziyaret sayacına da girmez/);
    assert.match(kvkk, /Çizimlerin ve projelerin bu verilerin hiçbirine girmez/);
  });

  test("yürürlük tarihi ve iletişim adresi", () => {
    assert.equal(LEGAL_EFFECTIVE_DATE, "29 Eylül 2026");
    assert.equal(privacyDoc().effective, "29 Eylül 2026");
    assert.equal(LEGAL_CONTACT_EMAIL, "thecrimelogs.contact@gmail.com");
    assert.ok(privacy.includes(LEGAL_CONTACT_EMAIL));
    assert.ok(kvkk.includes(LEGAL_CONTACT_EMAIL));
  });

  test("görünen metinde uzun tire yok", () => {
    assert.ok(!privacy.includes("\u2014"));
    assert.ok(!kvkk.includes("\u2014"));
    for (const page of ["gizlilik", "kvkk"]) {
      const src = readFileSync(join(SRC, "app", page, "page.tsx"), "utf8");
      assert.ok(!src.includes("\u2014"), page);
    }
  });
});

describe("hukuki metin — bağlantılar", () => {
  test("https adresi ve e-posta bağlantıya dönüşüyor, noktalama dışarıda kalıyor", () => {
    const segs = linkSegments("Ayrıntı: https://www.cloudflare.com/web-analytics/. Yaz: a.b@c.com.");
    assert.deepEqual(
      segs.filter((s) => s.href).map((s) => [s.text, s.href]),
      [
        ["https://www.cloudflare.com/web-analytics/", "https://www.cloudflare.com/web-analytics/"],
        ["a.b@c.com", "mailto:a.b@c.com"],
      ],
    );
    assert.equal(segs.map((s) => s.text).join(""), "Ayrıntı: https://www.cloudflare.com/web-analytics/. Yaz: a.b@c.com.");
  });

  test("bağlantısız metin tek parça kalıyor", () => {
    assert.deepEqual(linkSegments("düz metin"), [{ text: "düz metin" }]);
  });
});
