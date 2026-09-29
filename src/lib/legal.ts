/**
 * Nibble — hukuki metinler (gizlilik + KVKK aydınlatma).
 *
 * Metin VERİ olarak burada, sayfalar yalnız çiziyor: böylece `legal.test.ts`
 * iddiaları koda karşı doğrulayabiliyor. Buradaki her cümle koddan çıkarıldı
 * (2026-09-28, analitik 2026-09-29): projeler IndexedDB'de (`storage.ts`),
 * ayarlar/dil localStorage'da, sunucu yok (`next.config.ts` → statik export),
 * çerez yok, TEK harici betik Cloudflare Web Analytics beacon'ı (kök layout,
 * yalnız üretim; çerezsiz, toplu sayım), `window.nibble` sayfanın İÇİNDE
 * çalışıyor (`agent-api.ts`), `readCanvas` izin istemiyor, http(s) resim içe
 * aktarma "files" izni ister ve varsayılan kapalı (`agent-policy.ts`), dışa
 * aktarma cihaza indiriyor. Barındırma: Türkiye'deki sunucu (IP whois TR,
 * 2026-09-29); host değişirse §3 ve KVKK §5 de değişir.
 *
 * Kod değişirse (yeni bir analitik/betik eklenirse, bir sunucuya kayıt
 * yapılırsa…) bu metin de değişmek ZORUNDA. Test bunun bir kısmını yakalar,
 * hepsini değil.
 */

import { CF_ANALYTICS_INFO_URL, LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER, LEGAL_EFFECTIVE_DATE } from "./site";

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

const LINK_RE = /(https:\/\/[^\s)]+[^\s).,]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** Metni düz parçalar ile bağlantılara böler: https adresleri ve e-postalar tıklanabilir olsun. */
export function linkSegments(text: string): { text: string; href?: string }[] {
  return text
    .split(LINK_RE)
    .map((part, i) =>
      i % 2 === 0 ? { text: part } : { text: part, href: part.startsWith("https://") ? part : `mailto:${part}` },
    )
    .filter((seg) => seg.text !== "");
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
          "Çerez kullanmıyoruz. Ziyaret sayacı da çerez ya da tarayıcı deposu kullanmaz.",
          "Reklam yok, seni tanımaya ya da siteler arasında izlemeye yönelik betik yok, üçüncü taraf yazı tipi yüklenmiyor. Yüklenen tek harici betik 3. bölümdeki ziyaret sayacıdır.",
          "Çizimlerin ve projelerin ziyaret sayacına da girmez; hiçbir yere gönderilmez.",
        ],
      },
      {
        heading: "3. Ziyaret istatistikleri (Cloudflare Web Analytics)",
        paragraphs: [
          "Hangi sayfaların ne kadar kullanıldığını görmek için Cloudflare Web Analytics kullanıyoruz. Çerez kullanmaz, cihazında kimlik bırakmaz ve seni tanımlamaz.",
          "Bir sayfa açıldığında tarayıcın Cloudflare'e şunları gönderir: açılan sayfanın adresi, geldiğin sayfa (yönlendiren), tarayıcı ve işletim sistemi türü, sayfanın yüklenme süresi gibi performans ölçümleri. Ülke, bağlantının IP adresinden çıkarılır. Cloudflare bu hizmette ziyaretçileri IP adresi ya da tarayıcı bilgisi üzerinden izlemediğini belirtir.",
          "Biz yalnız toplu sayıları görürüz (örneğin bir sayfanın bu hafta kaç kez açıldığı, ziyaretlerin hangi ülkelerden geldiği); tek bir kişiye ait kayıt görmeyiz.",
          `Hizmeti sağlayan: Cloudflare, Inc. (ABD). Bu bilgiler yurt dışında işlenir. Ayrıntı: ${CF_ANALYTICS_INFO_URL}`,
          "Bu betiği bir reklam engelleyiciyle ya da tarayıcı ayarıyla engellersen Nibble aynen çalışır.",
        ],
      },
      {
        heading: "4. Sayfayı sunan sunucu",
        paragraphs: [
          "Nibble yalnızca statik dosyalardan oluşur ve Türkiye'deki bir sunucuda barındırılır. Sunucu, her web sitesinde olduğu gibi, erişim sırasında IP adresin, tarayıcı bilgin ve istenen sayfa gibi teknik kayıtları güvenlik ve işletim amacıyla kısa süre tutabilir. Bu kayıtlar çizimlerini içermez.",
        ],
      },
      {
        heading: "5. Yapay zekâ ajanı bağlarsan",
        paragraphs: [
          "Kendi yapay zekâ ajanını (örneğin bir tarayıcı eklentisi) getirirsen, ajan sayfadaki window.nibble arayüzünü senin tarayıcında çağırır. Ajan tuvalini okuyabilir ve bu bilgiyi kendi hizmetine gönderebilir; bu aktarım senin ile o ajanın sağlayıcısı arasındadır ve Nibble'ın bir sunucusu araya girmez.",
          "Ajanın neler yapabileceğini editördeki ajan panelinden sen belirlersin: çizim, animasyon, katman, palet, geri dönüşü olmayan işlemler ve dosya/ağ izinlerini ayrı ayrı açıp kapatabilir, ajan arayüzünü tamamen kapatabilirsin. Geri dönüşü olmayan işlemler ile dosya/ağ izni varsayılan olarak kapalıdır.",
        ],
      },
      {
        heading: "6. Resim içe aktarma ve dışa aktarma",
        bullets: [
          "Cihazından seçtiğin bir resmi piksele dönüştürdüğünde resim hiçbir yere gönderilmez; işlem tarayıcında yapılır.",
          "Dosya/ağ izni açıkken bir ajan resmi bir internet adresinden içe aktarırsa, tarayıcın resmi o adresten indirir ve o sunucu IP adresini görür.",
          "PNG, GIF, APNG ve sprite sheet dosyaları doğrudan cihazına indirilir.",
        ],
      },
      {
        heading: "7. Değişiklikler ve iletişim",
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
          "İşlenebilecek veriler iki türdür. Birincisi, sayfayı barındıran sunucunun erişim sırasında tuttuğu teknik kayıtlar: IP adresi, tarayıcı bilgisi, erişim zamanı ve istenen sayfa.",
          "İkincisi, Cloudflare Web Analytics ile toplanan ve seni tanımlamayan ziyaret bilgileri: açılan sayfanın adresi, yönlendiren sayfa, tarayıcı ve işletim sistemi türü, IP adresinden çıkarılan ülke ve sayfa performans ölçümleri. Çerez kullanılmaz; bu bilgiler bize yalnız toplu sayılar olarak görünür.",
          "Çizimlerin ve projelerin bu verilerin hiçbirine girmez.",
        ],
      },
      {
        heading: "3. İşleme amaçları",
        paragraphs: [
          "Hizmetin güvenli ve kesintisiz sunulması, kötüye kullanımın önlenmesi; sitenin hangi sayfalarının ne kadar kullanıldığının toplu olarak ölçülüp hizmetin geliştirilmesi.",
        ],
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
          "Teknik erişim kayıtları, sayfayı barındıran Türkiye'deki sunucuda tutulur.",
          `Ziyaret istatistikleri, hizmet sağlayıcısı Cloudflare, Inc. (ABD) tarafından işlenir; bu nedenle bu veriler yurt dışına aktarılmış olur (KVKK m.9). Ayrıntı: ${CF_ANALYTICS_INFO_URL}`,
          "Veriler pazarlama ya da reklam amacıyla üçüncü kişilere aktarılmaz, satılmaz.",
          "Kendi yapay zekâ ajanını bağlarsan, ajanın okuduğu tuval bilgisini nereye gönderdiği senin ile o ajanın sağlayıcısı arasındadır; bu aktarımda veri sorumlusu ajan sağlayıcısıdır.",
        ],
      },
      {
        heading: "6. Toplama yöntemi",
        paragraphs: [
          "Teknik kayıtlar, sayfaya eriştiğinde sunucu tarafından; ziyaret istatistikleri, sayfadaki Cloudflare Web Analytics betiği tarafından otomatik yollarla toplanır. Betiği tarayıcında engellersen istatistik toplanmaz ve Nibble aynen çalışır.",
        ],
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
