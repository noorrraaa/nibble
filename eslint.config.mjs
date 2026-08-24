import { FlatCompat } from "@eslint/eslintrc";

/**
 * Nibble — ESLint 9 flat config
 *
 * Neden eklendi: tip denetimi ve 146 test kapsamın çoğunu tutuyor ama React
 * hook bağımlılık hatalarını yakalamıyor. Denetimde çıkan iki hata (sürükleme
 * dikdörtgenini state'te tutmak, temayı iki kaynakta tutmak) tam olarak
 * `react-hooks` kurallarının gördüğü sınıftandı.
 *
 * FlatCompat gerekiyor: eslint-config-next hâlâ eskiden kalma (eslintrc)
 * biçiminde yayınlanıyor, flat config'e onunla köprülüyoruz.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      // tsconfig.test.json'un ürettiği derleme çıktısı — kaynak değil
      "test-build/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      /**
       * Hook bağımlılıkları UYARI değil HATA.
       * Bu projede tam olarak bu sınıftan iki hata çıktı; uyarı seviyesinde
       * bırakırsak gürültüye karışıp yine kaçar.
       */
      "react-hooks/exhaustive-deps": "error",

      /**
       * `_` önekli isimler KASITLI olarak kullanılmıyor demektir.
       * Tek yeri: bir nesneden alan çıkarmak için destructuring
       * (`const { ok: _ok, ...rest } = res`). Kodu bozup yeniden yazmak
       * yerine yaygın sözleşmeyi kurala tanıtıyoruz.
       */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];
