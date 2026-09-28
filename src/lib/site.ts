/**
 * Nibble — sitenin mutlak adresleri TEK yerde.
 *
 * ⚠️ `nardin.app` 2026-09-28 itibarıyla HENÜZ SATIN ALINMADI (portföy kararı:
 * her ürün `<ürün>.nardin.app` alt alan adında). Domain alınıp DNS'e yazılana
 * kadar bu adresler çözülmez; yayından önce `dig +short nibble.nardin.app`.
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
 * Hukuki başvuru adresi. TODO(user): kişisel bir adres kararlaştırılınca yaz.
 * Boşken sayfalar adres yerine "yakında" notu gösterir. ⛔ İş maili ASLA.
 */
export const LEGAL_CONTACT_EMAIL = "thecrimelogs.contact@gmail.com";

/** Metinlerin yürürlük tarihi (sayfada gösterilir). */
export const LEGAL_EFFECTIVE_DATE = "28 Eylül 2026";
