/**
 * Nibble — hukuki metinler (gizlilik + KVKK aydınlatma).
 *
 * Metin VERİ olarak burada, sayfalar yalnız çiziyor: böylece `legal.test.ts`
 * iddiaları koda karşı doğrulayabiliyor. Buradaki her cümle koddan çıkarıldı
 * (2026-09-28): projeler IndexedDB'de (`storage.ts`), ayarlar/dil localStorage'da,
 * sunucu yok (`next.config.ts` → statik export), çerez/analitik/üçüncü taraf
 * betik yok, `window.nibble` sayfanın İÇİNDE çalışıyor (`agent-api.ts`),
 * `readCanvas` izin istemiyor, http(s) resim içe aktarma "files" izni ister ve
 * varsayılan kapalı (`agent-policy.ts`), dışa aktarma cihaza indiriyor.
 *
 * Kod değişirse (analitik eklenirse, bir sunucuya kayıt yapılırsa…) bu metin
 * de değişmek ZORUNDA — test bunun bir kısmını yakalar, hepsini değil.
 */

import { LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER, LEGAL_EFFECTIVE_DATE } from "./site";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  title: string;
  lede: string;
  effective: string;
  sections: LegalSection[];
}

/** Başvuru satırı: adres yoksa uydurmak yerine açıkça "yakında" der. */
export function contactLine(email: string = LEGAL_CONTACT_EMAIL): string {
  const e = email.trim();
  return e
    ? `Soruların ve taleplerin için: ${e}`
    : "Başvuru için iletişim adresi yakında bu sayfada yayımlanacak.";
}

export function privacyDoc(email: string = LEGAL_CONTACT_EMAIL): LegalDoc {
  return {
    title: "Gizlilik Politikası",
    lede:
      "Nibble tarayıcında çalışan bir pixel art ve animasyon editörü. Üyelik yok, hesap yok, " +
      "sunucumuz yok: çizimlerin kendi cihazında kalır.",
    effective: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: "1. Ne tutuluyor, nerede?",
        bullets: [
          "Projelerin (kareler, katmanlar, palet, parçalar) tarayıcının IndexedDB deposunda, yalnızca bu cihazda tutulur.",
          "Ayarların (tema, dil gibi) tarayıcının yerel deposunda (localStorage) tutulur.",
          "Bunların hiçbiri bize gönderilmez. Tarayıcı verilerini silersen ya da başka bir cihaz veya tarayıcı kullanırsan projelerini orada göremezsin; yedek için projeni dışa aktar.",
        ],
      },
      {
        heading: "2. Neleri toplamıyoruz?",
        bullets: [
          "Hesap, ad, e-posta ya da telefon numarası istemiyoruz.",
          "Çerez kullanmıyoruz.",
          "Analitik, reklam ya da izleme betiği yok; üçüncü taraf yazı tipi veya betik yüklenmiyor.",
        ],
      },
      {
        heading: "3. Sayfayı sunan sunucu",
        paragraphs: [
          "Nibble yalnızca statik dosyalardan oluşur. Sayfayı barındıran hizmet, her web sitesinde olduğu gibi, erişim sırasında IP adresin, tarayıcı bilgin ve istenen sayfa gibi teknik kayıtları güvenlik ve işletim amacıyla kısa süre tutabilir. Bu kayıtlar çizimlerini içermez.",
        ],
      },
      {
        heading: "4. Yapay zekâ ajanı bağlarsan",
        paragraphs: [
          "Kendi yapay zekâ ajanını (örneğin bir tarayıcı eklentisi) getirirsen, ajan sayfadaki window.nibble arayüzünü senin tarayıcında çağırır. Ajan tuvalini okuyabilir ve bu bilgiyi kendi hizmetine gönderebilir; bu aktarım senin ile o ajanın sağlayıcısı arasındadır ve Nibble'ın bir sunucusu araya girmez.",
          "Ajanın neler yapabileceğini editördeki ajan panelinden sen belirlersin: çizim, animasyon, katman, palet, geri dönüşü olmayan işlemler ve dosya/ağ izinlerini ayrı ayrı açıp kapatabilir, ajan arayüzünü tamamen kapatabilirsin. Geri dönüşü olmayan işlemler ile dosya/ağ izni varsayılan olarak kapalıdır.",
        ],
      },
      {
        heading: "5. Resim içe aktarma ve dışa aktarma",
        bullets: [
          "Cihazından seçtiğin bir resmi piksele dönüştürdüğünde resim hiçbir yere gönderilmez; işlem tarayıcında yapılır.",
          "Dosya/ağ izni açıkken bir ajan resmi bir internet adresinden içe aktarırsa, tarayıcın resmi o adresten indirir ve o sunucu IP adresini görür.",
          "PNG, GIF, APNG ve sprite sheet dosyaları doğrudan cihazına indirilir.",
        ],
      },
      {
        heading: "6. Değişiklikler ve iletişim",
        paragraphs: [
          "Bu metni değiştirirsek güncel hâli bu sayfada, yürürlük tarihiyle yayımlanır.",
          `Veri sorumlusu: ${LEGAL_CONTROLLER}. ${contactLine(email)}`,
        ],
      },
    ],
  };
}

export function kvkkDoc(email: string = LEGAL_CONTACT_EMAIL): LegalDoc {
  return {
    title: "KVKK Aydınlatma Metni",
    lede:
      "6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi uyarınca, Nibble'ı kullanırken " +
      "kişisel verilerinin nasıl işlendiğini aşağıda açıklıyoruz.",
    effective: LEGAL_EFFECTIVE_DATE,
    sections: [
      {
        heading: "1. Veri sorumlusunun kimliği",
        paragraphs: [`Veri sorumlusu: ${LEGAL_CONTROLLER} (bireysel geliştirici).`],
      },
      {
        heading: "2. İşlenen kişisel veriler",
        paragraphs: [
          "Nibble kendi sunucusunda kişisel veri işlemez: projelerin ve ayarların yalnızca kendi cihazında, tarayıcının deposunda tutulur ve bize ulaşmaz. Hesap açılmaz; ad, e-posta ya da telefon istenmez.",
          "İşlenebilecek tek veri, sayfayı barındıran hizmetin erişim sırasında tuttuğu teknik kayıtlardır: IP adresi, tarayıcı bilgisi, erişim zamanı ve istenen sayfa.",
        ],
      },
      {
        heading: "3. İşleme amaçları",
        paragraphs: ["Hizmetin güvenli ve kesintisiz sunulması, kötüye kullanımın önlenmesi."],
      },
      {
        heading: "4. Hukuki sebepler",
        paragraphs: [
          "KVKK m.5/2-f: temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati.",
        ],
      },
      {
        heading: "5. Aktarım",
        paragraphs: [
          "Teknik erişim kayıtları, sayfayı barındıran hizmet sağlayıcısında tutulur; sağlayıcı yurt dışında bulunabilir ve bu durumda kayıtlar yurt dışına aktarılmış olur (KVKK m.9). Veriler pazarlama amacıyla üçüncü kişilere aktarılmaz.",
          "Kendi yapay zekâ ajanını bağlarsan, ajanın okuduğu tuval bilgisini nereye gönderdiği senin ile o ajanın sağlayıcısı arasındadır; bu aktarımda veri sorumlusu ajan sağlayıcısıdır.",
        ],
      },
      {
        heading: "6. Toplama yöntemi",
        paragraphs: ["Teknik kayıtlar, sayfaya eriştiğinde barındırma hizmeti tarafından otomatik olarak oluşturulur."],
      },
      {
        heading: "7. Hakların (KVKK m.11)",
        bullets: [
          "Kişisel verinin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme,",
          "işlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme,",
          "yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,",
          "eksik veya yanlış işlenmişse düzeltilmesini, şartları varsa silinmesini isteme,",
          "münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhine bir sonuç çıkmasına itiraz etme,",
          "kanuna aykırı işleme sebebiyle zarara uğrarsan zararın giderilmesini talep etme.",
        ],
      },
      {
        heading: "8. Başvuru",
        paragraphs: [contactLine(email)],
      },
    ],
  };
}
