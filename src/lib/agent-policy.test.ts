/**
 * Nibble — ajan politikası testleri
 *
 * Buradaki testlerin tamamı GÜVENLİK testi: `classifyImageSource` "uzak bir
 * adrese istek atmak `files` izni gerektirir" kuralının tek uygulayıcısı.
 * Kural bir dönem regex ile yazılmıştı ve atlatılabiliyordu — tarayıcının URL
 * ayrıştırıcısı ters bölü çizgisini eğik çizgiye çeviriyor, gömülü tab/satır
 * sonu karakterlerini siliyor, yani regex'in "göreli yol" sandığı şeyi
 * tarayıcı uzak bir adrese çözüyordu. Tabloyu bozan bir değişiklik izin
 * duvarında delik açar.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_LIMITS,
  classifyImageSource,
  clampInt,
  DEFAULT_POLICY,
  normalisePolicy,
  RateLimiter,
} from "./agent-policy";
import { MAX_CANVAS_SIDE } from "./types";

/** Testler DOM'suz koşuyor: agent-policy içindeki taban da bu köken */
const SAME_ORIGIN = "http://nibble.localhost";

describe("classifyImageSource: izin duvarı", () => {
  const cases: [string, string][] = [
    // kullanıcının kendi verisi — dışarı istek yok
    ["data:image/png;base64,iVBORw0KGgo=", "allowed"],
    ["blob:http://nibble.localhost/1234", "allowed"],
    // aynı köken
    ["/sprite.png", "allowed"],
    ["sprite.png", "allowed"],
    [`${SAME_ORIGIN}/sprite.png`, "allowed"],
    // uzak adres → izin gerekir
    ["https://evil.example/a.png", "needs-files"],
    ["http://evil.example/a.png", "needs-files"],
    ["//evil.example/a.png", "needs-files"],
    // ATLATMA DENEMELERİ: tarayıcı bunların hepsini http://evil.example'a çözüyor
    ["\\\\evil.example/a.png", "needs-files"],
    ["\\/evil.example/a.png", "needs-files"],
    ["ht\ttp://evil.example/a.png", "needs-files"],
    ["ht\ntp://evil.example/a.png", "needs-files"],
    ["  https://evil.example/a.png  ", "needs-files"],
    ["HTTPS://EVIL.EXAMPLE/a.png", "needs-files"],
    // hiçbir koşulda kabul edilmeyenler
    ["javascript:alert(1)", "rejected"],
    ["data:text/html,<script>alert(1)</script>", "rejected"],
    ["filesystem:http://nibble.localhost/temporary/x", "rejected"],
    ["", "rejected"],
  ];

  for (const [src, expected] of cases) {
    test(`${JSON.stringify(src)} → ${expected}`, () => {
      assert.equal(classifyImageSource(src).kind, expected);
    });
  }

  test("uzak adresin izin kararı ŞEMASIZ yazımda da aynı", () => {
    // "//host" yazımı sayfanın şemasını devralıyor; kararı değiştirmemeli
    assert.equal(classifyImageSource("//evil.example/a.png").kind, "needs-files");
    assert.equal(classifyImageSource("https://evil.example/a.png").kind, "needs-files");
  });
});

describe("normalisePolicy: bozuk ayar güvenli tarafa düşer", () => {
  test("boş/eksik kayıt varsayılana döner", () => {
    assert.deepEqual(normalisePolicy(undefined), DEFAULT_POLICY);
    assert.deepEqual(normalisePolicy({}).scopes, DEFAULT_POLICY.scopes);
  });

  test("yıkıcı ve dosya kapsamları varsayılan KAPALI", () => {
    const p = normalisePolicy({});
    assert.equal(p.scopes.destructive, false);
    assert.equal(p.scopes.files, false);
  });

  test("boolean olmayan değer kapsamı açmıyor", () => {
    const p = normalisePolicy({ scopes: { destructive: "yes" as unknown as boolean } });
    assert.equal(p.scopes.destructive, false, "metin 'yes' izni açtı");
  });

  test("tanınmayan kapsam adı sızmıyor", () => {
    const p = normalisePolicy({ scopes: { root: true } });
    assert.equal((p.scopes as Record<string, boolean>).root, undefined);
  });
});

describe("hız sınırı ve tavanlar", () => {
  test("pencere dolduğunda reddediyor, kayarken tekrar açıyor", () => {
    const rl = new RateLimiter(3, 1000);
    assert.equal(rl.take(0), true);
    assert.equal(rl.take(0), true);
    assert.equal(rl.take(0), true);
    assert.equal(rl.take(0), false, "sınır aşıldı ama geçirdi");
    assert.equal(rl.retryAfterMs(0), 1000);
    assert.equal(rl.take(1001), true, "pencere kaydı ama hâlâ kapalı");
  });

  test("tuval tavanı belge modeliyle aynı sabitten geliyor", () => {
    assert.equal(AGENT_LIMITS.maxCanvasSide, MAX_CANVAS_SIDE);
  });

  test("clampInt sayı olmayanı fallback'e düşürüyor", () => {
    assert.equal(clampInt("abc", 0, 10, 7), 7);
    assert.equal(clampInt(NaN, 0, 10, 7), 7);
    assert.equal(clampInt(Infinity, 0, 10, 7), 7);
    assert.equal(clampInt(99, 0, 10, 7), 10);
    assert.equal(clampInt(-99, 0, 10, 7), 0);
    assert.equal(clampInt(3.9, 0, 10, 7), 3);
  });
});
