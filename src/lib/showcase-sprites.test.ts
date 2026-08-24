/**
 * Nibble — tanıtım sprite'larının bütünlük testi
 *
 * Bu sahneler elle yazılmış karakter ızgaraları: 32 karakterlik bir satırda
 * bir karakter eksik kalırsa tüm sahne kayıyor ve bunu gözle bulmak dakikalar
 * alıyor. Test, veriyi kaynakta doğruluyor — hata mesajı hangi sprite'ın hangi
 * satırında olduğunu söylüyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ALL_SHOWCASE } from "./showcase-sprites";

describe("showcase sprite verisi", () => {
  for (const { key, sprite } of ALL_SHOWCASE) {
    describe(key, () => {
      const first = sprite.frames[0];

      test("en az bir kare var", () => {
        assert.ok(sprite.frames.length > 0);
      });

      test("her karede tüm satırlar eşit uzunlukta", () => {
        for (const [fi, frame] of sprite.frames.entries()) {
          const w = frame.rows[0].length;
          for (const [ri, row] of frame.rows.entries()) {
            assert.equal(row.length, w, `${key} kare ${fi} satır ${ri}: ${row.length} ≠ ${w}`);
          }
        }
      });

      test("tüm kareler aynı boyutta", () => {
        for (const [fi, frame] of sprite.frames.entries()) {
          assert.equal(frame.rows.length, first.rows.length, `${key} kare ${fi} yükseklik`);
          assert.equal(frame.rows[0].length, first.rows[0].length, `${key} kare ${fi} genişlik`);
        }
      });

      test("kullanılan her karakter legend'de tanımlı", () => {
        for (const [fi, frame] of sprite.frames.entries()) {
          const legend = frame.legend ?? sprite.legend;
          for (const [ri, row] of frame.rows.entries()) {
            for (const ch of row) {
              if (ch === "." || ch === " ") continue;
              assert.ok(
                legend[ch],
                `${key} kare ${fi} satır ${ri}: "${ch}" legend'de yok`,
              );
            }
          }
        }
      });

      test("legend'de kullanılmayan renk yok", () => {
        const used = new Set<string>();
        for (const frame of sprite.frames) {
          if (frame.legend) continue; // kare bazlı legend ezmesi ayrı denetlenmez
          for (const row of frame.rows) for (const ch of row) used.add(ch);
        }
        for (const ch of Object.keys(sprite.legend)) {
          assert.ok(used.has(ch), `${key}: legend'deki "${ch}" hiç kullanılmıyor`);
        }
      });

      test("kare süreleri pozitif", () => {
        for (const [fi, frame] of sprite.frames.entries()) {
          assert.ok(frame.ms > 0, `${key} kare ${fi} süresi ${frame.ms}`);
        }
      });

      test("restIndex geçerli aralıkta", () => {
        assert.ok(
          sprite.restIndex >= 0 && sprite.restIndex < sprite.frames.length,
          `${key} restIndex ${sprite.restIndex}`,
        );
      });

      test("kareler birbirinin aynısı değil", () => {
        if (sprite.frames.length < 2) return;
        const seen = new Set<string>();
        for (const frame of sprite.frames) {
          seen.add(frame.rows.join("|") + JSON.stringify(frame.legend ?? null));
        }
        assert.ok(seen.size > 1, `${key}: tüm kareler aynı, animasyon görünmez`);
      });

      test("boş kare yok", () => {
        for (const [fi, frame] of sprite.frames.entries()) {
          const solid = frame.rows.join("").split("").filter((c) => c !== "." && c !== " ").length;
          assert.ok(solid > 0, `${key} kare ${fi} tamamen boş`);
        }
      });
    });
  }
});
