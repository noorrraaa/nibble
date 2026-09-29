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

import {
  CF_ANALYTICS_INFO_URL,
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTROLLER,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_EFFECTIVE_DATE_EN,
} from "./site";

export type LegalLang = "tr" | "en";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  lang: LegalLang;
  title: string;
  lede: string;
  effective: string;
  /** Yalnız çevirilerde: Türkçe metnin esas olduğunu söyleyen not. */
  translationNote?: string;
  sections: LegalSection[];
}

/**
 * İngilizce çevirilerin başındaki not. Bağlayıcı olan Türkçe metin; çeviri
 * yalnız kolaylık için (içerik farkı yok, `legal.test.ts` eşleşmeyi kilitliyor).
 */
export const TRANSLATION_NOTE_EN =
  "This is a translation provided for convenience; the Turkish version prevails in case of conflict.";

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

/** `contactLine`'ın İngilizcesi; aynı kural: adres yoksa uydurmaz. */
export function contactLineEn(email: string = LEGAL_CONTACT_EMAIL): string {
  const e = email.trim();
  return e
    ? `For questions and requests: ${e}`
    : "A contact address for requests will be published on this page soon.";
}

export function privacyDoc(email: string = LEGAL_CONTACT_EMAIL): LegalDoc {
  return {
    lang: "tr",
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
    lang: "tr",
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

/* ------------------------------------------------------------------ */
/* İngilizce çeviriler (UI İngilizce olan kullanıcılar için).          */
/* Yalnız çeviri: bölüm sayısı, madde sayısı, adresler ve tarih        */
/* Türkçe metinle birebir; bir tarafı değiştiren ötekini de değiştirir. */
/* ------------------------------------------------------------------ */

export function privacyDocEn(email: string = LEGAL_CONTACT_EMAIL): LegalDoc {
  return {
    lang: "en",
    title: "Privacy Policy",
    lede:
      "Nibble is a pixel art and animation editor that runs in your browser. No sign-up, no account, " +
      "no server of ours: your drawings stay on your own device.",
    effective: LEGAL_EFFECTIVE_DATE_EN,
    translationNote: TRANSLATION_NOTE_EN,
    sections: [
      {
        heading: "1. What is stored, and where?",
        bullets: [
          "Your projects (frames, layers, palette, parts) are stored in your browser's IndexedDB storage, on this device only.",
          "Your settings (such as theme and language) are stored in your browser's local storage (localStorage).",
          "None of this is sent to us. If you clear your browser data or use another device or browser, you will not see your projects there; to keep a backup, export your project.",
        ],
      },
      {
        heading: "2. What we do not collect",
        bullets: [
          "We do not ask for an account, name, email address or phone number.",
          "We do not use cookies. The visit counter does not use cookies or browser storage either.",
          "No ads, no scripts that aim to identify you or track you across sites, and no third-party fonts are loaded. The only external script loaded is the visit counter described in section 3.",
          "Your drawings and projects are not part of the visit counter either; they are not sent anywhere.",
        ],
      },
      {
        heading: "3. Visit statistics (Cloudflare Web Analytics)",
        paragraphs: [
          "We use Cloudflare Web Analytics to see which pages are used and how much. It does not use cookies, leaves no identifier on your device and does not identify you.",
          "When a page opens, your browser sends Cloudflare the following: the address of the page opened, the page you came from (referrer), your browser and operating system type, and performance measurements such as how long the page took to load. The country is derived from the IP address of the connection. Cloudflare states that in this service it does not track visitors by IP address or browser information.",
          "We only see aggregate counts (for example, how many times a page was opened this week, which countries visits came from); we do not see records belonging to any single person.",
          `Provided by: Cloudflare, Inc. (USA). This information is processed abroad. Details: ${CF_ANALYTICS_INFO_URL}`,
          "If you block this script with an ad blocker or a browser setting, Nibble works exactly the same.",
        ],
      },
      {
        heading: "4. The server that delivers the page",
        paragraphs: [
          "Nibble consists only of static files and is hosted on a server in Turkey. As with any website, the server may briefly keep technical logs made during access, such as your IP address, browser information and the page requested, for security and operational purposes. These logs do not contain your drawings.",
        ],
      },
      {
        heading: "5. If you connect an AI agent",
        paragraphs: [
          "If you bring your own AI agent (for example, a browser extension), the agent calls the window.nibble interface on the page, in your browser. The agent can read your canvas and may send that information to its own service; that transfer is between you and the agent's provider, and no Nibble server is involved.",
          "You decide what the agent can do from the agent panel in the editor: you can switch drawing, animation, layers, palette, irreversible actions and file/network permissions on and off one by one, or turn off the agent interface entirely. Irreversible actions and file/network permission are off by default.",
        ],
      },
      {
        heading: "6. Importing and exporting images",
        bullets: [
          "When you convert an image chosen from your device into pixels, the image is not sent anywhere; the processing happens in your browser.",
          "If, with file/network permission on, an agent imports an image from an internet address, your browser downloads the image from that address and that server sees your IP address.",
          "PNG, GIF, APNG and sprite sheet files are downloaded directly to your device.",
        ],
      },
      {
        heading: "7. Changes and contact",
        paragraphs: [
          "If we change this text, the current version will be published on this page with its effective date.",
          `Data controller: ${LEGAL_CONTROLLER}. ${contactLineEn(email)}`,
        ],
      },
    ],
  };
}

export function kvkkDocEn(email: string = LEGAL_CONTACT_EMAIL): LegalDoc {
  return {
    lang: "en",
    title: "KVKK Privacy Notice",
    lede:
      "Pursuant to Article 10 of the Turkish Personal Data Protection Law No. 6698 (KVKK), we explain below " +
      "how your personal data is processed when you use Nibble.",
    effective: LEGAL_EFFECTIVE_DATE_EN,
    translationNote: TRANSLATION_NOTE_EN,
    sections: [
      {
        heading: "1. Identity of the data controller",
        paragraphs: [`Data controller: ${LEGAL_CONTROLLER} (individual developer).`],
      },
      {
        heading: "2. Personal data processed",
        paragraphs: [
          "Nibble does not process personal data on its own server: your projects and settings are kept only on your own device, in your browser's storage, and do not reach us. No account is created; no name, email address or phone number is requested.",
          "The data that may be processed is of two kinds. The first is the technical logs kept by the server hosting the page during access: IP address, browser information, time of access and the page requested.",
          "The second is visit information collected with Cloudflare Web Analytics that does not identify you: the address of the page opened, the referring page, browser and operating system type, the country derived from the IP address, and page performance measurements. No cookies are used; this information is visible to us only as aggregate counts.",
          "Your drawings and projects are not part of any of this data.",
        ],
      },
      {
        heading: "3. Purposes of processing",
        paragraphs: [
          "Delivering the service securely and without interruption and preventing misuse; measuring in aggregate which pages of the site are used and how much, in order to improve the service.",
        ],
      },
      {
        heading: "4. Legal grounds",
        paragraphs: [
          "KVKK Art. 5/2-f: the legitimate interest of the data controller, provided that it does not harm your fundamental rights and freedoms.",
        ],
      },
      {
        heading: "5. Transfer",
        paragraphs: [
          "Technical access logs are kept on the server in Turkey that hosts the page.",
          `Visit statistics are processed by the service provider Cloudflare, Inc. (USA); this data is therefore transferred abroad (KVKK Art. 9). Details: ${CF_ANALYTICS_INFO_URL}`,
          "Data is not transferred to third parties for marketing or advertising purposes and is not sold.",
          "If you connect your own AI agent, where the agent sends the canvas information it reads is between you and that agent's provider; for that transfer, the agent's provider is the data controller.",
        ],
      },
      {
        heading: "6. Method of collection",
        paragraphs: [
          "Technical logs are collected by the server when you access the page, and visit statistics by the Cloudflare Web Analytics script on the page, through automated means. If you block the script in your browser, no statistics are collected and Nibble works exactly the same.",
        ],
      },
      {
        heading: "7. Your rights (KVKK Art. 11)",
        bullets: [
          "To learn whether your personal data is processed and, if so, to request information about it,",
          "to learn the purpose of processing and whether it is used in line with that purpose,",
          "to know the third parties in Turkey or abroad to whom it is transferred,",
          "to request its correction if it is incomplete or inaccurate and, where the conditions are met, its deletion,",
          "to object to a result against you arising from analysis exclusively by automated systems,",
          "to claim compensation if you suffer damage due to unlawful processing.",
        ],
      },
      {
        heading: "8. Application",
        paragraphs: [contactLineEn(email)],
      },
    ],
  };
}
