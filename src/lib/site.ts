/**
 * Nibble — sitenin mutlak adresleri TEK yerde.
 *
 * Portföy kararı: her ürün `<ürün>.nardin.app` alt alan adında. 2026-09-29'da
 * `dig +short nibble.nardin.app` çözülüyor ve site canlı (ERISIM.md).
 *
 * Neden burada: dışa aktarılan sprite sheet JSON'u uzun süre bir yer tutucu adres
 * (`nibble.app` alan adı) yazıyordu — o alan adı BİZİM DEĞİL (kayıtlı, park edilmiş). Yer tutucu domain
 * sessizce yabancı bir siteye link verir; tek sabit + test bunu kilitler.
 */
export const SITE_URL = "https://nibble.nardin.app";

/** Ürünleri sergileyen kişisel site. */
export const NARDIN_URL = "https://nardin.app";

/** Hukuki metinlerin veri sorumlusu. */
export const LEGAL_CONTROLLER = "Emre Kızak";

/**
 * Hukuki başvuru adresi (kişisel; kullanıcı 2026-09-28'de seçti).
 * Boşken sayfalar adres yerine "yakında" notu gösterir. ⛔ İş maili ASLA.
 */
export const LEGAL_CONTACT_EMAIL = "thecrimelogs.contact@gmail.com";

/** Metinlerin yürürlük tarihi (sayfada gösterilir). */
export const LEGAL_EFFECTIVE_DATE = "29 Eylül 2026";

/**
 * Cloudflare Web Analytics (çerezsiz, kimlik yok, toplu sayım). Bu token GİZLİ
 * DEĞİL: her sayfanın HTML'inde zaten görünür. Yalnız üretim derlemesinde,
 * kök layout'ta tek sefer yüklenir. Değişirse gizlilik/KVKK metni de değişir
 * (`legal.ts`), `legal.test.ts` ikisini birlikte kilitliyor.
 */
export const CF_ANALYTICS_TOKEN = "47a67e735fc741a98bd12c85dbbacfe2";
export const CF_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";
export const CF_ANALYTICS_INFO_URL = "https://www.cloudflare.com/web-analytics/";
