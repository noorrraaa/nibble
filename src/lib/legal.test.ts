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

import { contactLine, kvkkDoc, privacyDoc, type LegalDoc } from "./legal";
import { LEGAL_CONTACT_EMAIL, NARDIN_URL, SITE_URL } from "./site";

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

  test("'üçüncü taraf betik/yazı tipi yok' iddiası: harici kaynak yüklenmiyor", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    assert.ok(!/@import\s+url\(|fonts\.googleapis|@font-face/.test(css));
    const ext = /<script[^>]+src=|next\/font\/google|googletagmanager|gtag\(/;
    const hits = SOURCES.filter(({ code }) => ext.test(code)).map(({ p }) => p);
    assert.deepEqual(hits, []);
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
