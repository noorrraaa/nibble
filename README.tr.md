<!-- English: README.md -->

# Nibble

**Yapay zekâ ajanlarının gerçekten kullanabildiği pixel art & animasyon editörü — ücretsiz, üyeliksiz, sunucusuz.**

Nibble tamamen tarayıcıda çalışır. Backend yok, kayıt yok, yükleme yok, ücretli
paket yok. Çalışman kendi tarayıcında (IndexedDB) durur ve hiçbir yere gitmez.
Sitenin ölçtüğü tek şey ziyaret sayısı: çerezsiz Cloudflare Web Analytics (toplu
sayım, kimlik yok; bkz. `/gizlilik/`,
İngilizce çevirisi `/privacy/`).

> 1 nibble = 4 bit = 16 değer = pixel art'ın klasik 16 renkli paleti.

## Fikir: AI bize bağlanır, biz AI'a değil

Diğer AI pixel art araçları sana üretim satar: prompt yazarsın, onların sunucusu
model çağrısını öder, bu yüzden senden para almak zorundadırlar. Nibble bunu
tersine çeviriyor.

**Kendi** tarayıcı ajanını getiriyorsun — Claude in Chrome ya da sayfada
JavaScript çalıştırabilen herhangi bir şey — ve Nibble ona bir çizim API'si
uzatıyor:

```js
window.nibble.help()      // el sıkışma: arayüz Co-op moduna geçer
```

Ajan senin kullandığın araçlarla çiziyor. Nibble hiçbir model çağrısı ödemediği
için sonsuza kadar ücretsiz kalabiliyor. `public/llms.txt` ajanın ilk okuduğu
özet; `/agent/` ise insanın da okuyabildiği tam referans.

```js
nibble.usePalette("sweetie-16")
nibble.beginBatch("zıplayan slime")          // tek Ctrl+Z hepsini geri alır
nibble.drawFromText({
  rows: ["..DDDD..", ".DLLLLD.", "DLWLLWLD", ".DDLLDD."],
  legend: { D: 7, L: 6, W: 12 },             // palet indisi veya "#ff0044"
  x: 12, y: 10,
})
nibble.addFrame({ copyFrom: 0 })
nibble.setFps(10)
nibble.endBatch()
nibble.readCanvas()                          // yazdığı formatın aynısını döndürür
```

### İskelet (rig): parçaya ad ver, adıyla oynat

Her kare için sprite'ı yeniden çizmek animasyonun en pahalı yolu. Bir kez bir
piksel kütlesine ad veriyorsun, sonra piksel değil parça konuşuyorsun:

```js
nibble.definePart({ name: "sol_bacak", x: 12, y: 24, box: { x: 10, y: 22, w: 5, h: 8 } })
nibble.movePart("sol_bacak", 0, -2)
nibble.tween({ count: 2 })                   // yalnızca öteleme — bilinçli
```

**Kemik ağırlıklı deformasyon YOK.** Mesh warp pixel art'ı çamura çeviriyor; bu
yüzden sadece öteleme, aynalama ve 90°'nin katları var — bunlar kayıpsız. Rig
parçaları Aseprite "slice"ı olarak dışa aktarılıyor, yani verdiğin adlar
dışa aktarımda korunuyor.

## Ajan senin sayfanda çalışıyor — o yüzden yüzey dar

Tarayıcı ajanı sayfanın JavaScript bağlamını paylaşır; gerçek bir sandbox mümkün
değil ve öyleymiş gibi yapmak dürüst olmaz. Nibble bunun yerine şunu yapıyor:

- **API yalnızca çizimi açıyor.** Kayıtlı projelerin, depolaman, ayarların ve
  herhangi bir dosya sistemi erişimi API'de hiç yok. Ajan diğer işlerini
  listeleyemez, açamaz, silemez.
- **Kapsamlı izinler.** `draw`, `animate`, `layers`, `palette` açık;
  **`destructive` (resize, newProject, silme…) ve `files` (indirme, URL'den
  görsel yükleme) varsayılan KAPALI.**
- **Reddedilen çağrı bir hata değil, bir cevap.**
  `{ ok: false, deniedScope, hint }` döner ve editör sana onaylayabileceğin bir
  izin isteği gösterir.
- **Her şeyin bir tavanı var**: 10 saniyede 120 çağrı, 512×512 tuval, parça
  kutusu başına 2048×2048, çağrı başına 250 000 piksel, `drawFromText` başına
  4096 satır.
- **Uzak görsel denetimi kalıba değil ÇÖZÜLMÜŞ adrese bakıyor** — şemayı
  gizlemek adresi yine uzak kökene çözdüğü için `files` izni gerekiyor.
- **"Bağlantıyı kes" gerçekten `window.nibble`'ı siliyor.**
- Her ajan çağrısı tek bir geri-al adımı ve canlı bir şerit ne yaptığını
  anlık gösteriyor.

## Neler var

| | |
|---|---|
| Çizim | kalem, silgi, çizgi, dikdörtgen, elips (tam sayı Bresenham — anti-aliasing yok), doldurma, renk seçici, dikdörtgen seçim + kes/kopyala/yapıştır |
| Animasyon | kareler, zaman çizelgesi, onion skin, odak modu (`F`), 5 / 10 / 12.5 / 20 / 25 / 50 fps oynatma |
| Yapı | proje seviyesinde global katmanlar (Aseprite modeli), rig parçaları ve kemikler, rig hayaletleri |
| Renk | Sweetie-16 ve arkadaşları, düzenlenebilir paletler, projeye özel palet |
| İçe alma | görsel → piksel (palete indirgeyerek) |
| Dışa aktarma | PNG, animasyonlu GIF, **kayıpsız animasyonlu APNG** (kendi kodlayıcımız), sprite sheet + Godot ve Unity'nin okuduğu Aseprite uyumlu JSON, `.nibble` proje dosyası |
| Geri al | delta tabanlı geçmiş — 50 piksellik darbe ~400 byte, 64 KB'lık snapshot değil |
| Dosya | `.nibble` dosyaları içe alınırken doğrulanıyor: bozuk ya da kötü niyetli dosya editörü kırmak yerine gerekçesiyle reddediliyor |
| Diğer | IndexedDB depolama, çift dilli arayüz (TR / EN), dokunmatik desteği, klavye öncelikli |

## Çalıştırma

```sh
npm install
npm run dev          # http://localhost:3000
npm test             # 294 test, test kütüphanesi bağımlılığı yok
npm run lint
npm run typecheck
npm run build        # statik export → out/   (önce `npm run dev`'i kapat: aynı .next)
```

`out/` düz statik dosyalar — herhangi bir ücretsiz statik host servis eder.

## Dizin düzeni

```
src/
├── app/         landing (/) · editör (/editor/) · ajan referansı (/agent/)
├── components/  editor-shell · canvas-stage · panels · timeline · dialogs
│                agent-panel · rig-panel · help · ui · icon · pixel-sprite
└── lib/         raster · pixel-document · rig · rig-ops · selection-ops
                 exporters · apng · image-to-pixels · palettes · storage
                 editor-store · agent-api · agent-policy · i18n · showcase-sprites
docs/            PLAN.md · DURUM.md · landing-concept.html
public/          llms.txt (ajanın ilk okuduğu) · llms-full.txt (tam başvuru) · simgeler, og.png
```

Testler kodun yanında `*.test.ts` olarak duruyor ve TypeScript derlemesinden
sonra `node --test` ile koşuyor — Jest yok, Vitest yok, sıfır ek bağımlılık.
294 test var ve en değerlileri sıkıcı olanlar: geri-alma sözleşmesi, APNG bayt
düzeni, `.nibble` doğrulaması ve izin duvarının URL tablosu.

## Bilinçli kararlardan birkaçı

- Piksel verisi React state'ine hiç girmiyor. Girseydi 60 fps çizim 5 fps olurdu.
- `ctx.arc()` yasak: anti-aliasing yapıyor. Elipsler tam sayı Bresenham.
- Geçerli fps değerleri tam olarak `100/fps`'in tam sayı santisaniye çıktığı
  değerler — GIF kare gecikmesini bu birimde saklıyor. `setFps(60)` 50'ye
  yuvarlıyor ve bunu söylüyor.
- WebM dışa aktarım yok: `MediaRecorder` kayıplı sıkıştırıyor ve piksel
  kenarlarını bulandırıyor. APNG bunu kayıpsız karşılıyor.
- APNG kodlayıcısı tarayıcının PNG çıktısını yeniden paketlemiyor — tarayıcı bit
  derinliğini ve palet biçimini kendi seçiyor, kareler arasındaki fark akışı
  bozuyor.

Bu kararların uzun gerekçeleri `docs/DURUM.md` içinde.

## Stack

Next.js 15 (statik export) · TypeScript · Zustand · Canvas 2D · `gifenc`.
Sonuncusu React ve Next dışındaki tek çalışma zamanı bağımlılığı.
