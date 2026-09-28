# NIBBLE — Durum ve Devam Notu

> **2026-09-28 (portföy oturumundan):** ✅ `/gizlilik` + `/kvkk` sayfaları eklendi (metin
> `src/lib/legal.ts`, iddialar koda karşı testli — ağ isteği/çerez/harici betik eklenirse test
> düşer), alt bilgide Gizlilik · KVKK · Nardin. Adres kararı: **`nibble.nardin.app`**
> (`src/lib/site.ts`; ⚠️ `nardin.app` HENÜZ ALINMADI). 🚨 Sprite sheet JSON'u `nibble.app`
> yazıyordu — **bizim değil** (kayıtlı, park) → `SITE_URL`'e bağlandı. 265/265 test · build ·
> tsc · eslint temiz. ⏳ Hukuki iletişim adresi boş (`LEGAL_CONTACT_EMAIL`) — sayfa "yakında" diyor.

**Son güncelleme:** 2026-08-24 (5. oturum) · **Yayına alma başladı: temiz
`next build` koştu, `git init` + ilk commit yapıldı ve repo push'landı
(`noorrraaa/nibble`, main). Kalan: LİSANS + HOST seçimi — ikisi de kullanıcı
kararı (§13).** Proje `~/Desktop/hayat/nibble` altına taşındı.

4. oturum (2026-08-21): repo düzeni + README + dosya dosya güvenlik denetimi —
iki güvenlik açığı, dört sessiz veri/geçmiş hatası ve bir performans gerilemesi
bulundu, doğrulandı, düzeltildi ve testle kilitlendi (§12).

---

## 0. 3. oturumun ilk yarısı: İSKELET (rig) — bitti

Ürünün asıl kozu artık kodda: ajan piksel değil **parça adı** konuşuyor.

**Model.** Bir *parça* = adı olan bir **tutamak** (kare başına konum anahtarı) +
isteğe bağlı bir **kutu** (tutamakla birlikte taşınan piksel dikdörtgeni).
Kemik = iki parça arasında adı olan bir bağ (çizgi + ajanın akıl yürüteceği yapı).

**Neden kemik ağırlıklı deformasyon YOK:** pixel art'ta mesh warp / squash
her zaman çamur üretir. Bilinçli olarak yalnızca öteleme, aynalama ve 90°
katları kayıpsız; keyfi açı en yakın komşu ve ajana "kayıplı" diye söyleniyor.

**Yeni dosyalar**

| Dosya | İş |
|---|---|
| `lib/rig.ts` | saf fonksiyonlar: bölge oku/temizle/yaz, öteleme, aynalama, 90° katları, keyfi açı, tween planı, `describeRig` |
| `lib/rig-ops.ts` | belge üzerindeki işlemler — **arayüz ve ajan API'si aynı kodu kullanıyor**, ayrışma imkânsız |
| `components/rig-panel.tsx` | iskelet modunda palet/araç panellerinin yerine geçen panel |
| `RigOverlay` (canvas-stage içinde) | SVG katman: kemik çizgileri, tutamaklar, kutular, etiketler |

**Belge modeline eklenenler**
- `{ kind: "rig" }` delta → iskelet değişiklikleri de geri alınabiliyor
- `editCel(frameId, layerId, fn)` — genel cel düzenleme kapısı; `touch()`
  çağırdığı için geçmiş kaydı otomatik, rig matematiği belge modeline sızmıyor
- `setRig` / `updateRig` — rig minik JSON olduğu için tam kopya saklanıyor

**Arayüz**
- Araç rayında **R** = iskelet modu (araçlardan çizgiyle ayrı: bu bir araç değil, mod)
- Tutamağı sürükle → parça pikselleriyle birlikte gelir, **tüm sürükleme tek Ctrl+Z**
- Panel: parça listesi (anahtar sayısı + kutu göstergesi), ekle, kutu çiz/kaldır,
  kaydır ◀▲▼▶, aynala/90°/180°, sil, kemikler, ara kare üretimi
- Uzun açıklamalar tooltip'e + yardım penceresine taşındı; panel 236px'e sığıyor

**Ajan API v3** (`help("rig")`)
`definePart · setPartBox · clearPartBox · setPartHandle · movePart · flipPart ·
rotatePart · recolorPart · renamePart · deletePart · defineBone · deleteBone ·
getRig · describeRig · tween`
`describeRig()` hangi parçanın tutamağı/kutusu eksik olduğunu söylüyor;
`contextHint()` boş rig görürse ajana "parçalara isim ver" diyor.

**Bu oturumda bulunup düzeltilen rig hataları**
- Keyfi açı döndürme kutu köşelerini kırpıp içeriği kaybediyordu → hedef kutu
  döndürülmüş sınıra büyütülüyor ve parçanın kutusu da güncelleniyor
- 90°/270° en-boyu takas ediyordu ama parçanın kutusu eski boyutta kalıyordu →
  sonraki taşımada kutu dışı pikseller geride kalırdı
- `tween`'de küçük mesafede ara kareler birbirinin kopyası çıkıyordu → artık
  kaç ara karenin gerçekten farklı olabileceği hesaplanıp söyleniyor
- rig-ops hint'leri iç isimleri (`setNodeRegion`) söylüyordu → ajanın gördüğü
  isimlere çevrildi (`setPartBox`)

**Tarayıcıda uçtan uca doğrulandı:** parça tanımlama, kutu hesabı (mutlak→göreli),
tutamak sürükleyerek taşıma (pikseller geliyor), tek adımda geri al/ileri al,
aynalama, 90° (kayıpsız, piksel sayısı korunuyor), 45° (büyüyen kutu),
`tween` ile ara kare üretimi, IndexedDB'ye kalıcılık.

---

## 1. Önce iyi haber: ortam tuzağı ORTADAN KALKTI

Geçen oturumda "Write tool'un açtığı dizinleri kabuk okuyamıyor (EPERM)" sorunu
vardı ve dev sunucusu 500 veriyordu. **Bu oturumda erişim normale döndü** —
kabuk kökteki tüm dosyaları okudu, `cp`/`mv`/`rm` çalıştı, dev sunucusu ayağa
kalktı. Yeni bir oturumda önce bir `ls` ile teyit et; tekrar bozulursa eski
kural geçerli (yeni dizini önce `mkdir` ile kabuktan aç).

> Uyarı: dev sunucusu çalışırken `next build` çalıştırma. İkisi aynı `.next`
> klasörünü kullanıyor, build dev'in chunk'larını eziyor ve dev 500 vermeye
> başlıyor. Olursa: sunucuyu durdur, `rm -rf .next`, tekrar başlat.

---

## 2. Dizin düzeni (temizlendi)

Kök artık karışık değil — ve 2026-08-21'de repo hazırlığında her şey `nibble/`
altına toplandı, artık **repo kökü `nibble/`**:

```
nibble/                        ← repo kökü
├── README.md                  ← repoya bakan ilk kişi için (EN)
├── README.tr.md               ← Türkçesi
├── .gitignore
├── src/                       ← uygulama
├── public/llms.txt            ← ajanın okuduğu API özeti
└── docs/
    ├── PLAN.md                ← ilk teknik plan (referans)
    ├── DURUM.md               ← bu dosya
    └── landing-concept.html   ← ilk landing konsepti (referans; canlı
                                  landing artık src/app/page.tsx)
```

Kökteki eski kopyalar (`app/ lib/ components/ types/ public/ src/ .next/` ve kök
`package.json · tsconfig.json · next.config.ts`) **silindi**. Dosyalar
`nibble/src/` altına kebab-case adlarla taşındı, import yolları güncellendi.

```
nibble/src/
├── app/         layout · globals.css · page(landing) · editor/ · agent/
├── components/  editor-shell · canvas-stage · panels · timeline · dialogs
│                agent-panel · rig-panel · help · ui · icon
└── lib/         types · raster · pixel-document · palettes · image-to-pixels
                 storage · exporters · apng · rig · rig-ops · selection-ops
                 editor-store · agent-api · agent-policy · i18n
                 + *.test.ts (8 dosya, 257 test)
```

---

## 3. Durum: ÇALIŞIYOR

- `npm test` → **257 test, hepsi geçiyor** (raster · belge · rig · seçim · APNG · sahne verisi · ajan politikası · `.nibble` doğrulama)
- `npx tsc --noEmit` → temiz
- `npm run lint` → temiz (ESLint 9 flat config)
- `next build` → 4 statik sayfa export ediliyor (editor first-load 172 kB)
- `/`, `/editor/`, `/agent/`, `/llms.txt` → 200, konsolda hata/hidrasyon uyarısı yok
- Elle çizim, geri alma, otomatik kayıt (IndexedDB), ajan API'si, iskelet,
  APNG kodlayıcı, sürükle-sırala uçtan uca tarayıcıda test edildi

---

## 4. Bu oturumda düzeltilen gerçek hatalar

| Hata | Neydi |
|---|---|
| i18n derlenmiyordu | `tr: typeof en` yazılmıştı; `as const` yüzünden 143 tip hatası. `Widen<T>` ile literaller `string`'e genişletildi, anahtar yapısı korundu (eksik çeviri hâlâ derleme hatası) |
| `deserializeProject` tip hatası | `Project & {...}` kesişimi `cels` değerini `Uint8ClampedArray & string` yapıyordu → `Omit<Project,"frames">` |
| "Kareyi çoğalt" = "Kare ekle" | İkisi de `addFrame(activeFrame)` çağırıyordu. Artık ekle → boş kare, çoğalt → kopya |
| İmleç merkezli zoom kayıyordu | Yığın merkezden konumlanıyor; `pan - d*(scale-1)` yetmiyor, merkez farkı da düşülmeli |
| Tema düğmesi ilk tıklamada çalışmıyordu | Yerel state hep "dark" başlıyordu, ayardan okunmuyordu |
| Proje adı değişikliği kaybolabiliyordu | `doc.project.name = x` mutasyonu `notify()` çağırmıyordu → otomatik kayıt tetiklenmiyordu |
| Gereksiz render | `const s = useEditor()` tüm store'a abone oluyordu; hepsi alan bazlı seçicilere bölündü |
| Katman opaklığı geçmişi dolduruyordu | Sürükleme boyunca `beginBatch`/`endBatch` — 100 adım yerine 1 |
| Resim aktarımında `resize` geçmiş dışıydı | `run()` içine alındı, tek geri alma adımı |
| Saydamlık daması zoom'a bağlıydı | Piksel ızgarasıyla aynı frekansa oturup gürültü gibi görünüyordu; sabit 16px yapıldı |
| Palet swatch'ları paneli dolduruyordu | Katman paneli ekran dışında kalıyordu; sabit 26px + katmanlar ayrı sabit bölge |

---

## 5. Yeni: ajan güvenlik katmanı (`lib/agent-policy.ts`)

**Dürüst sınır:** tarayıcı ajanı sayfayla aynı JS bağlamında; konsoldan istediğini
çalıştırabilir, bunu tarayıcı içinden kapatmak mümkün değil. Yapılan şey bu
değil — yapılan: sunulan yüzeyi daraltmak, geri dönüşü pahalı olanı izne bağlamak,
her şeyi görünür ve geri alınabilir kılmak.

- **İzin kapsamları:** `draw · animate · layers · palette` açık;
  **`destructive` (boyut/silme/sıfırlama) ve `files` (indirme, uzak URL) kapalı**
- Reddedilen çağrı istisna atmaz — `ok:false + deniedScope` döner ve **alt şeritte
  kullanıcıya "İzin ver / Vazgeç" isteği belirir**
- **Hız sınırı:** 10 sn'de 120 çağrı (kayan pencere)
- **Yük tavanları:** 4096 satır · satır başına 4096 karakter · setPixels'te 250.000 piksel
- **Depolama, ayarlar, diğer projeler API'de hiç yok** — listeleme/silme yolu bilinçli olarak kapalı
- `importImage`: `data:`/`blob:` serbest, `http(s)` → `files` izni
- Kilitli katman ajana da kapalı
- **Ana şalter**: "Bağlantıyı kes" `window.nibble`'ı gerçekten siliyor (test edildi)
- API `Object.freeze`'li, `window.nibble` non-writable

---

## 6. Yeni: arayüz artık kendini anlatıyor

- **İlk kullanım rehberi** — 4 ekran, `tourSeen` ile bir kez
- **Yardım penceresi (`?`)** — ilk beş dakika · araç açıklamaları · kısayol tablosu ·
  "bir şey ters mi görünüyor?" sorun giderme listesi
- **Durum çubuğu** — imleç koordinatı · tuval · yakınlık (tıkla = görünüme sığdır) ·
  aktif katman (kilit/gizli rozetiyle) · kare · aktif aracın tek satırlık tarifi
- **Panel açıklamaları** — her panelin altında ne işe yaradığı
- **Boş tuval yönlendirmesi** — ilk fırça darbesinde kayboluyor
- **Fırça izi** — imlecin altında fırça boyutunda çerçeve
- **Yıkıcı işlemlerde iki aşamalı onay** (tıkla → "Emin misin?")
- **TR/EN dil değiştirici** üst barda; tüm arayüz `useT()` ile bağlandı
- Katman: yeniden adlandırma (çift tık) · sırala ▲▼ · opaklık
- Kare: sırala ◀▶ · kare başına süre (cs)
- 820px altında dikey düzen (araç rayı yatay, paneller altta)

---

## 7. Listenin kalanı da bitti (2026-08-17, aynı oturumun ikinci yarısı)

### APNG dışa aktarım — `lib/apng.ts`, bağımlılık yok

GIF pixel art'ta iki yerde yetersiz: saydamlık 1-bit, renk 256 ile sınırlı.
APNG ikisini de çözüyor. Kendi kodlayıcımızı yazdık.

**Neden tarayıcının PNG'sini yeniden paketlemedik:** canvas'ın ürettiği PNG'yi
parse edip IDAT'ı fdAT'a çevirmek cazip ama tarayıcı bit derinliğini/palet
biçimini kendi seçiyor; kareler arası biçim farkı APNG'yi bozar. Ham tarama
satırlarını kendimiz yazıyoruz: 8 bit, renk tipi 6 (RGBA), filtre 0, her karede
aynı. Sıkıştırma `CompressionStream("deflate")` (tam olarak PNG'nin beklediği
zlib akışı); yoksa "stored" deflate bloklarına düşüyor — dosya büyür ama geçerli
PNG çıkar.

**Doğrulandı:** imza doğru, chunk sırası `IHDR · acTL · fcTL · IDAT · (fcTL ·
fdAT)×n · IEND` (APNG spesifikasyonunun aynısı), tarayıcı 32×32 olarak çözdü, ve
**yarı saydam piksel birebir döndü** (`[255,0,68,128]` → `[255,0,68,128]`).
Aynı karede GIF 3 pikseli tam saydam/opak'a yuvarlamak zorunda kaldı.

WebM yapılmadı, bilinçli: MediaRecorder VP8/VP9 kayıplı sıkıştırma uyguluyor,
pixel art'ta kenarları bulandırıyor. APNG bu ihtiyacı kayıpsız karşılıyor.

### Rig → sprite sheet JSON: Aseprite "slices"

Şans değil, birebir örtüşme: Aseprite slice'ı da adı olan dikdörtgen + kare
başına anahtar + pivot. Parçalar `meta.slices` olarak yazılıyor, yani Aseprite,
Godot ve Unity importer'larının **zaten anladığı** bir şeye dönüşüyor. Kemikler
`meta.nibbleBones` altında fazladan bilgi (standart okuyucular yok sayar).
Doğrulandı: 5 karelik projede pivot'lar bounds'a göreli, doğru.

### Onion skin + rig hayaletleri
Onion skin açıkken komşu karelerin **tutamakları** da hayalet olarak görünüyor
(geçmiş kırmızı, gelecek mavi — piksel onion skin'iyle aynı dil). Poz
anahtarlarken "önceki karede kol neredeydi" sorusunun cevabı.

### Ajanın ikinci imleci
Ajan bir yere dokunduğunda tuvalde o noktada camgöbeği çerçeve + çağrı adı
etiketi beliriyor, 3.2 sn sonra kayboluyor. Yığının içinde konumlanıyor, yani
pan/zoom ile birlikte hareket ediyor. "AI bir şeyler yaptı" hissi yerine
NEREDE yaptığını göstermek.

### Sürükle-sırala
Katmanlar ve kareler artık sürüklenebiliyor (`useDragReorder`, HTML5 DnD —
sürükleme görselini ve Esc ile iptali tarayıcı hallediyor). ▲▼ / ◀▶ düğmeleri
kaldı, klavyeyle gezen kullanıcı sürükleyemez. Katman listesi ekranda ters
gösterildiği için indeks çevirisi arayüzde yapılıyor; belge modelinin arayüzün
sıralamasını bilmesi gerekmiyor. İkisi de sentetik DnD olayıyla doğrulandı.

### Mobil dokunmatik
İki parmak = yakınlaştır + kaydır. **İkinci parmak indiği an ilk parmağın
başlattığı fırça darbesi geri alınıyor** — telefonda tuvali yakınlaştırmak
isterken ekranda nokta bırakmak en can sıkıcı hata.

### Animasyon görünümü (▥)
Ayrı bir düzen yazmadık: aynı şerit, 76px hücreler ve süreler açıkta, onion
skin açıkken hayalet menzili kontrolü. "Animasyon moduna geçmenin" gerçek
faydası kareyi büyütmek ve zamanlamayı göstermek; gerisi aynı editör.

### Odak modu (⛶ / F) — radyal menü YERİNE
Planda "krom-suz çizim modu (radyal araç menüsü, yüzen rampalar)" yazıyordu.
**Radyal menü yapılmadı, bilinçli:** sağ tık ikincil renge bağlı ve radyal menü
o temel etkileşimi ezerdi. Fikrin işe yarayan yarısı yapıldı: odak modunda sağ
panel, zaman şeridi, durum çubuğu ve ajan şeridi gizleniyor, tuval ekranı
kaplıyor, palet altta **yüzen şerit** olarak duruyor.

### `resize()` + rig — hata değildi
Not yanlıştı: `resize` sol-üst hizalı, yani içerik aynı koordinatlarda kalıyor
ve tutamaklar hâlâ doğru pikselleri gösteriyor. Gerçek sorun sadece küçültmede:
tutamak tuval dışında kalırsa fareyle yakalanamıyor. Konumu **kaydırmıyoruz**
(bu pozu bozardı); yerine `describeRig()` ve iskelet paneli ⚠ ile bildiriyor.

---

## 8. Seçim aracı · palet düzenleme · TESTLER (2026-08-17, üçüncü blok)

### Test altyapısı — sıfır yeni bağımlılık, 200 test (bugün 257, bkz §12)

`npm test` → `tsc -p tsconfig.test.json && node --test "test-build/**/*.test.js"`

**Neden derleyip çalıştırıyoruz:** Node 25 TypeScript'i doğrudan çalıştırıyor ama
modül çözümlemesi ESM kurallarında kalıyor, yani `from "./raster"` gibi uzantısız
importları bulamıyor. Kaynağa `.ts` uzantıları serpmek yerine CommonJS'e
derliyoruz — `require()` uzantısız yolu çözüyor. (Not: Node'un test koşucusu
nokta ile başlayan dizinleri atlıyor, o yüzden çıktı `test-build/`; ve dizin
yolunu modül sanıyor, glob açıkça verilmeli.)

| Dosya | Ne test ediyor |
|---|---|
| `raster.test.ts` | bresenham piksel atlamıyor · pixel-perfect L köşesi · elips simetrisi ve tam sayı ızgara · flood fill duvarı geçmiyor · simetri aynası · composite katman semantiği |
| `pixel-document.test.ts` | delta geri alma/ileri alma · batch tek kayıt · kilitli katman · `addFrame()` boş vs `addFrame(0)` kopya · resize sol-üst hizalı ve geçmişi sıfırlıyor · rig deltası |
| `rig.test.ts` | dönüşümler kayıpsız (flipX², rotate90⁴ = özdeşlik, piksel kaybı yok) · 45° kutuyu büyütüyor · **tek geri alma pikselleri VE tutamağı birlikte döndürüyor** · tween sırası doğru |
| `selection-ops.test.ts` | kopyala/kes/yapıştır · üst üste binen taşımada kaynak yenmiyor · **seçim ve rig dönüşümleri bayt bayt aynı** · kova seçime kırpılıyor |
| `apng.test.ts` | imza · chunk sırası · **her chunk'ın CRC32'si bağımsız hesapla doğrulanıyor** · sıra numaraları kesintisiz · **zlib akışı çözülünce tarama satırları birebir dönüyor** |

**Testin bulduğu gerçek hata — kodda değil, dokümantasyonda:** 8 yerde (ajanın
okuduğu metin dahil) "FPS 100'ün böleni olmalı" yazıyordu. Bu 12.5 için yanlış:
12.5 böleni değil ama 100/12.5 = 8 cs, tam sayı, GIF'te birebir temsil ediliyor.
Kesin değişmez şu: **100/fps tam sayı çıkmalı.** Hepsi düzeltildi.

### Seçim aracı (M)

- Kutu sürükle → seç · içinde sürükle → o pikselleri taşı (tüm sürükleme **tek Ctrl+Z**)
- Ctrl+C / X / V · Delete (seçim varsa sadece onun içini temizler) · Ctrl+A · Esc
- Aynala / 90° / 180° · birincil renkle doldur — **rig ile aynı kodu kullanıyor**
- **Seçim aktifken her çizim aracı seçimin içinde kalıyor** (Aseprite davranışı).
  Kalem/silgi/şekiller `expand()` içinde filtreleniyor, kova `floodFill`'e
  `clip` parametresiyle bağlandı.
- Yürüyen karıncalar: her kenarda koyu + 4px kaydırılmış açık dash. Tek renk
  denedim, koyu zeminde koyu dash kaybolup sadece iki kenar görünüyordu.
- **Pano sistem panosu DEĞİL.** `navigator.clipboard` görsel için PNG blob'u
  istiyor: izin diyaloğu + kodla/çöz turu. Uygulama içi pano anında ve kayıpsız;
  karşılığı başka sekmeye yapıştıramamak, onun için dışa aktarım var.

### Palet düzenleme

Açık bir **Düzenle** anahtarı (Alt+tık gibi gizli kombinasyon değil — sağ tık
zaten ikincil renge bağlı ve gizli kombinasyon keşfedilmiyor). Modda: renge
tıkla → hex düzenle, × ile çıkar, "Birincili ekle" ile ekle. Geçersiz hex
reddediliyor, aynı renk iki kez eklenmiyor, palet elle değiştirilince seçici
"Özel"e geçiyor. Değişiklikler projeyle kaydediliyor.

---

## 9. Tam denetim (2026-08-17, son blok) — bulunan hatalar

Kullanıcı "gözden kaçan var mı" diye sorunca baştan sona denetim yapıldı.
Bulunanlar, ciddiyet sırasına göre:

| # | Hata | Neden önemli |
|---|---|---|
| 1 | **Hızlı sürüklemede seçim sessizce kaydolmuyordu** | Sürüklenen dikdörtgen React state'inde tutuluyordu; `pointerdown → move → up` aynı tick'te olursa React henüz render etmemiş oluyor ve `pointerup` `null` okuyup seçimi iptal ediyordu. Dikdörtgen artık REF'te (doğruluk kaynağı), state sadece çizim için. **Aynı yarış rig kutu çiziminde de vardı**, o da düzeltildi. |
| 2 | **Dar ekranda düzen taşıyordu** | `.side`'a `max-height: 46vh` verilmişti ama çocuklarının yüzdeli `max-height`'ı belirsiz yükseklikte çözülemiyor; katman paneli durum çubuğunun ve zaman şeridinin üstüne biniyordu. Dikey bütçe artık `.main`'in kesinleşmiş yüksekliğine göre YÜZDE ile kuruluyor; `.main`'e `overflow:hidden` güvenlik ağı eklendi. Ayrıca telefonda sağ kolon tek kaydırma sütunu (katmanları alta sabitlemek orada yer bırakmıyordu) ve ray yatayken `overflow-x`. |
| 3 | **Odak modu + iskelet modu çıkmaz durum üretiyordu** | Odak modu sağ paneli gizliyor, iskelet paneli tam orada. Banner "iskelet modu açık" diyor ama parça eklenemiyor, kutu çizilemiyor. İkisi artık birbirini dışlıyor. |
| 4 | **Tema tercihi yalnızca editörde geçiyordu** | `/` ve `/agent/` her zaman koyu açılıyordu; editörde bile effect'te uygulandığı için koyu→açık kırpışması vardı. Artık `layout.tsx`'te ilk boyamadan önce çalışan minik bir bootstrap script hem temayı hem dili uyguluyor — kırpışma yok, üç sayfa tutarlı. |
| 5 | **Seçim geçmiş etiketleri sabit Türkçe** | İngilizce arayüzde "Undo: Kes" görünüyordu. Etiket artık çağıran taraftan geliyor (canvas-stage'in yerleşik deseni); ajan İngilizce varsayılanı alıyor. Aynısı "Resim aktar" ve "Delete" için de düzeltildi. |
| 6 | **"Adsız" üç yerde sabitti** | İngilizce kullanıcı "Adsız" adlı proje alıyordu. `t()` ile üretmek SSR'da hidrasyon uyuşmazlığı çıkarırdı, o yüzden ad artık BOŞ ve arayüz yerelleştirilmiş placeholder gösteriyor; dışa aktarımda `safeName()` zaten "nibble"a düşüyor. |
| 7 | **Modal açıkken kısayollar çalışıyordu** | Escape iki kez işleniyordu (diyalog kapanıyor + seçim siliniyor), ve diyalog açıkken B/E/G araç değiştiriyordu. Modal varken editör kısayolları artık inert; Escape'in diyaloğu kapatması korundu. |
| 8 | **Tema düğmesi iki kaynaktan okuyordu** | React state + `data-theme` senkronsuz kalabiliyordu. Artık DOM tek doğruluk kaynağı. |
| 9 | **Boyut değişince eski seçim kalıyordu** | Tuval küçülünce seçim kenarın dışına sarkıyordu. Ajan `resize`, `importImage` ve resim aktarma diyaloğu artık seçimi temizliyor. |
| 10 | Ölü kod | `toggleLang`, `TRANSPARENT`, `AgentApiUninstall` kaldırıldı; `raster.idx` dosya içine alındı; `writePalette`'teki kullanılmayan `label` parametresi silindi. |

**Denetimde temiz çıkanlar:** üç sayfada konsol tamamen sessiz (hata/uyarı/hidrasyon
uyuşmazlığı yok) · açık tema doğru · masaüstü düzeni bozulmadı · `.nibble` rig'i
taşıyor · kullanılmayan export taraması yalnızca tip imzalarını gösterdi.

### ESLint eklendi ve çıkan her şey düzeltildi

Denetimin sonunda ESLint kurulmadığı için hook bağımlılık hatalarının otomatik
yakalanmadığını not etmiştim — 1 ve 8 numaralı hatalar tam olarak o sınıftandı.
`eslint` 9 + `eslint-config-next` 15 kuruldu, flat config (`eslint.config.mjs`)
yazıldı, `npm run lint` eklendi.

İki kural bilinçli olarak ayarlandı:
- `react-hooks/exhaustive-deps` → **uyarı değil HATA.** Uyarıda bıraksak
  gürültüye karışıp yine kaçardı.
- `@typescript-eslint/no-unused-vars` → `_` önekli isimler muaf. Tek kullanım
  yeri bir nesneden alan çıkarmak (`const { ok: _ok, ...rest } = res`); kodu
  bozmak yerine yaygın sözleşmeyi kurala tanıttık.

İlk çalıştırmada 7 sorun çıktı, hepsi düzeltildi:

| Sorun | Düzeltme |
|---|---|
| `onPointerDown` içinde `abortStroke` bağımlılığı eksik | Eklendi. Tuval boyutu değişince eski `abortStroke` yanlış boyutta overlay temizleyebilirdi |
| Marka bağlantısı `<a href="/">` | `<Link>` oldu — tam sayfa yenilemesi yerine istemci gezinmesi (doğrulandı: JS bağlamı korunuyor) |
| `raster.ts` `b1` hiç yeniden atanmıyor | `const` |
| **`theme` state'i artık hiç okunmuyordu** | Tema düzeltmesinde DOM'u tek kaynak yapınca state ölü kalmıştı. Şimdi ikonu (güneş/ay), `aria-pressed`'i ve başlığı besliyor — düğme mevcut temayı gösteriyor |
| `agent-api` destructuring'de `_ok`/`_err` | Kural yapılandırıldı |
| `rig.test.ts` kullanılmayan `Rect` importu | Kaldırıldı |

`npm run lint` artık temiz.

**`npm audit` hakkında dürüst not:** ESLint'in bağımlılık ağacı 3 "high"
uyarısı getirdi (postcss, sharp). İkisi de bu üründe sömürülebilir değil —
postcss yalnızca kendi `globals.css`'imizi derliyor (kullanıcı CSS'i yok),
sharp ise Next'in görsel optimizasyonu ki `images.unoptimized: true` + statik
export ile hiç çağrılmıyor. `npm audit fix --force` **Next 16'ya kırıcı
yükseltme** yapıyor; bilinçli olarak yapılmadı. Next 16'ya geçişte tekrar bak.

---

## 10. Tanıtım sayfası: animasyonlu maskot + örnek galerisi

Sayfada sadece tek statik bir surat vardı; ne animasyon ne örnek galerisi.

**`lib/showcase-sprites.ts`** — dört sprite, hepsi `drawFromText` formatında
satır dizisi (resim dosyası DEĞİL). Sayfanın "bir sprite tek çağrıya sığar"
iddiası böylece sayfanın kendisinde kanıtlanıyor.

- **Maskot (kahraman, 4 kare):** sağa bakar (62cs) → sola bakar (62cs) →
  öne döner (26cs) → **ekrana bakıp gülümser (220cs)**. Döngünün dinlenme
  noktası gülümseme; `restIndex` ile hem ilk render hem `prefers-reduced-motion`
  o kareyi gösteriyor.
- **Slime (2 kare):** uzama / ezilme, aşağı kayarak zıplıyor
- **Kalp (2 kare):** atış için satırları kopyalamıyoruz — aynı ızgara, kare
  bazlı `legend` ezmesiyle dolgu bir ton açılıyor
- **Kılıç (1 kare)**

**`components/pixel-sprite.tsx`** — canvas değil CSS ızgarası: her piksel bir
DOM hücresi, yani sayfa sprite'ı gerçekten kendi malzemesiyle çiziyor.
`setInterval` değil `setTimeout`, çünkü her karenin kendi süresi var.
İlk kare her zaman `restIndex` — sunucu hangi kareyi çizeceğini bilemeyeceği
için duruma bağlı bir başlangıç hidrasyon uyuşmazlığı olurdu.

**Tasarım sırasında düzeltilenler (gözle bakıp iterasyon):**
- Gözler 1 hücre genişken 12 piksellik yüzde dikey çizgi gibi okunuyordu → 2×2
- Kalbin dış hattını ayrı bir halka olarak çizmiştim, iç dolguya yer kalmıyor ve
  şekil bloba dönüyordu → dış hat yalnızca gerçek sınır hücrelerinde
- Kılıç 10 hücre genişken ince bir çubuk gibi okunuyordu → 12 hücre, geniş
  çapraz muhafaza, ayrık tutamak
- Sprite'ları sabit GENİŞLİKLE boyutlamak yanlıştı: 12×9 kalp ile 12×16 kılıç
  yan yana orantısız duruyordu → boyutlama **hücre başına** yapılıyor
- Koyu dış hat (`#1a1c2c`) kart zeminiyle neredeyse aynı değerde olduğu için
  kayboluyordu → sprite kutusuna editördeki **saydamlık daması** konuldu; hem
  kontrast çözüldü hem "bu bir pixel art varlığı" dili sayfaya taşındı
- `.tag` yalnızca `.card .tag` olarak tanımlıydı, galeri başlığında stil
  uygulanmıyordu → bağımsız sınıf

---

## 11. Sahneler: sakura ve yavru köpek

Maskotun **ağzı** da bakışla değişiyor: şaşkın "o" ağız bakış yönüne kayıyor
(sağa bak + sağa kaymış ağız → sola bak + sola kaymış ağız → nötr → gülümseme).
Sadece gözler oynayınca yüz "bakıyor" ama şaşkın *durmuyordu*.

Galeri iki bölüme ayrıldı: **SAHNELER** (her biri kendi satırında, 760px sınırı)
ve **TEK NESNELER**. İkisi de `drawFromText` formatında; sahneler kendi özel
paletini kullanıyor (26 ve 24 renk) — Sweetie-16'da pembe yok ve editör özel
palet destekliyor, dolayısıyla bu da bir özelliğin gösterimi.

### İki ayrı araç: manzara prosedürel, karakter elle

Sakura **56×32**, köpek sahnesi **60×40**. İlk denemeler 32×18 ve 26×16'ydı ve
sonuç kullanıcının deyimiyle "köpek köpeğe benzemiyor bile" oldu. Bu boyutta bir
satır 56 karakter ve simetri elde tutulmuyor. **Manzara** için çözüm şekil
primitifleri:

- gövdeleri **elips / kalın çizgi / kutu maskeleriyle** kurmak,
- dış hattı **maskeden türetmek** (`outline`) — hat içeride kalır, siluet
  büyümez, prosedürel şekillerde tek piksellik kaçak kalmaz,
- hacmi **dama deseniyle** vermek (`dither`),
- bölgesel rengi **maske kesişimiyle** vermek (`intersect`) — kar hattı,
  gölgeli yüz, çim gölgesi hepsi böyle.

**Ama karakter için bu yanlış araç.** Köpeği prosedürel kurmayı denedim ve
kullanıcı referans pixel art köpekler gönderdi; fark net:

| Prosedürel elips | Referans (elle) |
|---|---|
| türetilen dış hat eğimin sığ olduğu yerde 2 piksele kalınlaşıyor | her yerde keskin 1 piksel |
| elips sırt çizgisini yay yapıyor | sırt omuzdan kalçaya iner, düz koşu 5 pikseli geçmez |
| dither gölge gürültü üretiyor | 3-4 net değer bandı |
| bacaklar gövde elipsinin içinde eriyor | bacaklar ayrı ayrı okunuyor |

Köpek bu yüzden **elle** çizildi. Yardımcı: `art()` satırları en uzun satıra
göre "." ile dolduruyor — 24 karakterlik satırda sağdaki boşlukları saymak
zorunda kalmıyoruz ve uzunluk hatası sınıfı ortadan kalkıyor.

Detay (torii, fener, kelebek) da elle çizilmiş ızgara ve `stamp` ile
bindiriliyor. Zanaat gereken yer elle, geometri gereken yer kodla.

### Sakura

Itsukushima kuruluşu: **suyun içinde duran torii**, arkada büyük Fuji, sağdan
ve soldan çerçeveleyen çiçekli dallar, taş fener, ay ve yıldızlar, kodla
animasyonlu düşen çiçekler (4 kare, y kare başına 2 satır iniyor, x salınıyor).

Gözle bakıp düzeltilenler:
- Fuji'ye hangi rengi verdiysem gökyüzü bantlarından birinin değerine denk
  geldi ve o yükseklikte siluet kayboldu — bir denemede dağ tamamen görünmez
  olup karlı zirve havada yüzüyordu → **sırt ışığı** (`outline`), siluet artık
  gökyüzünden bağımsız
- Tek büyük elipslik çiçek tepesi yapısız pembe bir bulut gibi okunuyordu →
  aralarında boşluk olan ayrı kümeler + alt yüzlerde gölge + çiçeklerin üstüne
  yeniden ince çizilen ana dallar
- Torii'yi koyu siluet olarak çizmiştim, zeminle aynı değerde kayboluyordu →
  vermilyon (`#d2452f`), hem geleneksel doğru renk hem tek okunabilir seçenek
- Dama desenli su, su gibi okunmuyordu → suyun dili **yatay kesik çizgi**, her
  satırın deseni kaydırılıyor ki ızgara oluşmasın
- Yansımalar önce kıyıya düşüyordu (su bandı torii'nin tabanında bitiyordu) →
  su 8 satıra çıkarıldı, torii tabanı yukarı alındı

### Yavru köpek

**Son hâli:** 34×30 köpek + 60×40 kır bahçesi. Kafa 3/4 çevrilmiş (19×18),
gövde yandan (26×12); kulak, kuyruk ve bacaklar ayrı parça çünkü kare kare
değişiyorlar. Koşu, hangi bacak çiftinin yerde olduğunun değişmesiyle
(kaldırılan çift bir satır kısa — gövdeyi zıplatmadan, patiler yerde),
havlama açık ağız + dil + ses çizgileriyle.

**On iki yeniden çizim gerekti.** Her turda PNG'ye basıp gözle bakarak
([[pixel-art-iterate-by-rendering]] hafıza notu bu yüzden var); son turlarda
köpeği sahneden kırpıp **12–16× ölçekte piksel ızgarasıyla** basarak — sahne
içinde neyin bozuk olduğunu ayırt etmek imkânsızdı, büyütünce kusurlar
sayılabilir hâle geldi.

1. **3/4 önden, prosedürel** → kahverengi kütle. Dış hat lumplu, dither gürültü.
2. **Yandan, parçalı (kafa+gövde ayrı)** → parçalar birleşmiyor, gövde tahta.
3. **Tek siluet, 19 piksel gövde** → bank / dachshund.
4. **Tek siluet, 15 piksel gövde** → daha iyi ama hâlâ slab.
5. **Kafayı boyunla yukarı taşıdım** → keçi.
6. **Referansı büyütüp okudum** → siluet tuttu, iç hâlâ masa gibiydi.
7. **Gövde içindeki düz yatay renk sınırını kaldırdım** → koyu üst / açık alt
   diye iki bant çizmek gövdeyi masa yapan şeydi. Koyu ton yalnızca sırtta
   ve sınırı MERCEK gibi kavisli olmalı.
8. **Bacakları gövdenin ÜSTÜNE ve AÇILI çizdim** → dikey paralel dört bacak
   ne yapılsa masa okutuyor.
9. **Bir ÇİFT = tek şekil** yaptım. Her bacağı ayrı 4 geniş çizince yarısı
   dış hat oluyordu ("offo": 2 tüy + 2 hat) ve dört bacak koyu sehpa ayağı
   gibi okunuyordu. "offfoFFo" olarak 8 pikselde 5 tüy + 3 hat.
10. **Çözünürlüğü artırdım ve kafayı öne çevirdim** → yüz okunur oldu.
11. **Çözünürlüğü bir kat daha artırdım** (köpek 47×42, kafa 35×26) → detay
    geldi ama hâlâ "belirgin" değildi.
12. **Paleti değiştirdim + kafayı 3/4 çevirdim** → tuttu.

10-11. adımlarda kullanıcının teşhisi doğruydu ("daha fazla nokta mı koymak
gerek acaba"). Köpek 24×19 iken kafa **10×12** piksele sığıyordu ve o alana
köpek yüzü girmiyor: tek göz, tek burun, hepsi bu. Yüz "bir garip" duruyordu
çünkü yüz DEĞİLDİ, yüz yerine geçen birkaç pikseldi.

Sonra bir tur daha çözünürlük artırdım — kullanıcı "piksel sayısı artmalı,
ayrıntı eklenmeli" dedi ve yine haklıydı. Sahne **56×36 → 76×50**, köpek
**35×30 → 47×42**, kafa **21×18 → 35×26**. Bu alanda artık gerçek detay var:

- **5×5 göz**, sol üstünde 2 piksellik beyaz parıltı (3×3'te göz "nokta"ydı)
- gözlerin üstünde koyu **kaş** lekesi
- **5×4 burun**, parıltılı, altında philtrum çizgisi ve dudaklı "V" ağız
- **kulak içi bir ton açık** — tek tonda çizince kulak kafayla birleşip düz
  kütle oluyordu
- **patilerde parmak çizgisi** — patiyi pati yapan detay
- kuyruk 16 satır, kıvrımlı, ucu krem
- sahnede: ışınlı güneş, dört taç yapraklı ve göbekli çiçekler, parıltılı top,
  gövdeli kelebekler, kalın çitli kazıklar

Kafa 35×26'da ve **kafa yapısı**:

- Kafa ÖNE DÖNÜK, gövde yandan. Yandan bir yüzde tek göz olur ve yüz hep
  yassı okunur; kameraya çevirmek simetri kazandırıyor (bu boyutta simetri
  bedava doğruluk) ve gövdeyi yandan bırakmak koşuyu koruyor.
- Kulaklar kafatasından AYRI parça. Tek parça çizdiğimde kulaklar kafayla
  aynı koyu tonda birleşip tek kahverengi kütle oluyordu, yüz içinde
  kayboluyordu. Ayrı çizilince kulağın kendi dış hattı onu yüzden ayırıyor.
  Sağ kulak `mirror()` ile üretiliyor — elle çizince simetri tutmuyordu.
- 3×3 iri gözler, sol üstlerinde parıltı; üstlerinde koyu **kaş** lekesi
  (beagle işareti ve yüze ifade katıyor); burunda parıltı; altında simetrik
  "w" ağız. İlk çizimde ağız yarım piksel kaçıktı — simetri ekseni x=7 ve her
  satır bu eksene göre denetleniyor.
- Kalça ÇİZGİYLE değil TONLA ayrılıyor: tek piksellik bir yay çizmiştim,
  gövdenin ortasında rastgele bir çizik gibi okundu. Arka elips içindeki orta
  ton koyuya çevriliyor, karın açık kalıyor.
- Gövde uzunluğu KAFANIN ÇENESİYLE hizalı; 31 pikselken gövdenin ön ucu
  kafanın sağından plaka gibi taşıyordu.
- **Beyaz göğüs** — beagle'ın en tanınır işareti, ve kafanın altında kalan
  bölgeyi düz bir plakadan kurtaran şey.

### Keskinliği veren şey: dış hat rengi ve ton kontrastı

Kullanıcı bir dachshund referansı gönderip "böyle daha belirgin ve düzgün bir
şey neden yapamıyorsun" dedi. Referansla benim çizimim arasındaki fark şekil
değil, PALET:

| | Bende | Referansta |
|---|---|---|
| Dış hat | koyu kahve `#3d2517` | **siyaha yakın** `#1c0f08` |
| Tüy tonları | `#95521f` → `#f0b878`, birbirine yakın | koyu `#5b3016` → açık ten `#cf9247`, **büyük değer atlaması** |

Koyu kahve dış hat her şeyi yumuşak/bulanık okutuyordu. "Belirgin" olmasını
sağlayan şey neredeyse siyah, keskin 1 piksellik hat + tonlar arasındaki büyük
değer farkı. Bu tek değişiklik, önceki on turdaki şekil düzeltmelerinin
hepsinden fazla iş yaptı.

İkinci karar: **kafa öne tam dönük disk değil, 3/4 çevrilmiş ve gövdenin
devamı.** Öne dönük kafa gövdeye yapıştırılmış bir disk gibi okunuyordu;
referansta kafatası arkada, burun önde ve aşağıda, gözler burnun üstünde.

Üçüncüsü: **gözü göz yapan şey gözün kendisi değil, çevresindeki açık ton.**
3×3 koyu kareler delik/gözlük gibi okunuyordu; üstlerine açık ten kaş bandı
koyunca göz oldu. Kelebek de aynı sebeple okunmuyordu — dış hat verilince
kelebek oldu.

Renk kararları:
- Tüy üç kademeli ama koyu ton sadece sırtta; krem vurgular (ağız, göğüs,
  patiler, kuyruk ucu)
- Uzak bacak çifti orta tonda, yakın çift açık tonda — derinliği veren şey bu
- Göz 2×2 koyu kare olarak "ölü" duruyordu → parıltılı göz, ve kulağın
  **önünde** (kulağı gözün üstüne koyunca yüz kayboluyor)
- **Kahverengi çit** tüyle aynı değerdeydi ve köpeğin gövdesini yutuyordu →
  beyaz kazıklı çit; kirişler önce ve koyu, kazıklar sonra ve beyaz
- Havlarken dil ağzı doldurup çiçek gibi okunuyordu → dil yalnızca alt satırda
- Kuyruk düz dikey çizilince ikinci bir bacak, ayrı parça olarak
  bindirildiğinde havada duran bir boynuz gibi okunuyordu → gövdeyle aynı
  ızgarada, kalçadan yukarı-arkaya çıkan kısa ve kalın kanca

Yardımcı: **`art()`** satırları en uzun satıra göre "." ile dolduruyor. Elle
çizerken sağdaki boşlukları saymak tek başına bir hata sınıfıydı — 24
karakterlik satırda bir eksik nokta tüm parçayı kaydırıyor.

### Oynatıcıda iki mod

`PixelSprite` artık `cell` (piksel başına sabit boyut) ve `fit` (kabı doldur,
en-boy oranı korunur) modlarını ayırıyor. Sabit hücreyle 56 piksellik sahne
kartı taşıyordu. `fit` modunda hücreler arası **boşluk kapatılıyor**: 2px boşluk
küçük sprite'larda kasıtlı ("bunlar piksel" hissi) ama 56 hücre yan yana
gelince resmin beşte birini yiyor, arkadaki dama sızıyor ve renkler açılıyordu.

**`showcase-sprites.test.ts`** veri bütünlüğünü doğruluyor: satır uzunlukları,
tüm karelerin aynı boyutta olması, legend kapsaması, kullanılmayan renk,
pozitif süre, `restIndex` aralığı, karelerin birbirinden farklı olması, boş kare.
Yazım hatasını gözle bulmak dakikalar alıyordu; test hangi sprite'ın hangi
satırında olduğunu söylüyor. Sahne yeniden yazılırken kullanılmayan bir legend
rengini bu test yakaladı.

---

## 12. Repo hazırlığı ve tam güvenlik denetimi (2026-08-21, 4. oturum)

Dosyalar repo düzenine alındı: kök artık `nibble/`, belgeler `docs/` altında
(`PLAN.md`, bu dosya, `landing-concept.html`), `README.md` (EN) + `README.tr.md`
(TR) + `.gitignore` yazıldı. Lisans ve deploy yapılandırması bilinçli olarak
YOK — kullanıcı kendi halledecek. (`git init` 5. oturumda yapıldı, §13.)

Sonra `src/` altındaki 40 dosya tek tek okundu. Bulgular tahminle bırakılmadı:
her biri ya Node'da ya Chrome'da çalıştırılıp doğrulandı, düzeltildi ve
regresyon testi yazıldı (**200 → 257 test**).

### Güvenlik: URL denetimi regex ile yapılamıyor

`classifyImageSource` "uzak adrese istek `files` izni ister" kuralının tek
uygulayıcısı ve regex ile yazılmıştı. Tarayıcının URL ayrıştırıcısı girdiyi
normalize ediyor: **ters bölü çizgisini eğik çizgiye çeviriyor ve gömülü
tab/satır sonu karakterlerini siliyor.** Yani `\\evil.com/a.png` ve
`ht<TAB>tp://evil.com/a.png` regex'e "göreli yol" görünüp `allowed` alıyor
(varsayılan `draw` izni), tarayıcı ise ikisini de `http://evil.com/a.png` diye
çözüyordu — `files` izni olmadan dışarıya istek, URL yoluna veri gömerek tek
yönlü sızdırma kanalı. Karar artık `new URL(src, location.href)` sonucunun
protokolü ve kökeni üstünden veriliyor: ne görüyorsak tarayıcı da onu görüyor.
`agent-policy.test.ts` atlatma denemelerini tablo hâlinde kilitliyor.

### Güvenlik: doğrulanmamış `region` geçmişi öldürüyordu

`definePart` içinde `box` kırpılıyor, `region` doğrudan geçiyordu. `w:100000`
gibi bir kutu depoya giriyor, ilk `movePart` `w*h*4` bayt ayırmaya çalışıyor ve
Chrome ~2 GB üstünde `RangeError` fırlatıyor (ölçüldü). İki kırılma birlikte
geliyordu: istisna `guard()`'dan dışarı çıkıp "reddedilen çağrı ok:false döner"
sözleşmesini bozuyor, ve `run()` try/finally kullanmadığı için batch açık
kalıyordu — **açık batch geçmişi öldürüyor**, o noktadan sonra hiçbir işlem
undo yığınına girmiyor ve kullanıcı bunu ancak Ctrl+Z işlemediğinde anlıyor.
Düzeltme üç katmanlı: `region` da kırpılıyor, `rig-ops` piksel taşıyan her
işlemin önünde kutu tavanını (`MAX_REGION_SIDE = 2048`) denetliyor, `run()`
try/finally oldu ve `guard()` beklenmedik istisnayı `ok:false`'a çeviriyor.

### `setFps` açık batch'i kırıyordu

`beginBatch` iç içe çağrıya karşı korumalı ama `endBatch` değil. `setFps` elle
`beginBatch/endBatch` çağırdığı için dışarıdaki batch'i (ajanın
`beginBatch("iş")`'ini) kapatıyordu; sonrasındaki çizimler tuvale işleniyor ama
**hiçbir geçmiş adımına girmiyordu** — kullanıcı ajanın işini geri alamıyordu.
`setFps` artık `run()` kullanıyor. Kural: batch açan/kapatan hiçbir belge
metodu elle `beginBatch/endBatch` çağırmaz, `run()` çağırır.

### `addFrame(aralık dışı)` geri alınamıyordu

`addFrame(99)` tek kareli projede indeks 100 döndürüyordu; kare gerçekte 1'e
giriyor (`splice` ekleme indeksini kırpıyor) ama geri alırken `splice(100, 1)`
**hiçbir şey silmiyor**. Kaydedilen indeks artık gerçekten eklenen yer, ve ajan
API'si aralık dışı `copyFrom`'u sessizce yutmak yerine hata döndürüyor.

### `.nibble` içe alma güvenilmeyen veriydi

`JSON.parse(...) as Project` dosyanın söylediği her şeye inanıyordu: `layers`
eksik bir dosya ayrıştırmayı geçip tuval çiziminde patlıyor (beyaz ekran),
`width: 100000` yazan bir dosya `composite()`'i w*h*4 bayt ayırmaya zorlayıp
sekmeyi kilitliyordu. `deserializeProject` artık doğruluyor: `schemaVersion`,
boyut tavanı (`MAX_CANVAS_SIDE`, üç kapı da aynı sabitten okuyor), katman/kare
listesi, **her cel'in bayt uzunluğunun `w*h*4` olması**, ve rig'in `region`
tavanı. Onarılabilir alanlar (geçersiz fps, bozuk hex, sahipsiz kemik)
reddedilmiyor, düzeltiliyor — piksel sağlamsa kullanıcı işini kaybetmesin.

### Küçük ama gerçek olanlar

- **İki hex ayrıştırıcısı vardı.** `imageToPixels` kendi `parseInt`'ini
  kullanıyor ve 3 haneli hex'i açmıyordu: palet editöründe `#f0a` yazıp
  "mevcut palet" ile resim aktaran herkes yanlış renk alıyordu. Tek ayrıştırıcı
  (`types.hexToRgba`) + tek doğrulayıcı (`isHex`, yalnızca 3/6/8 hane — eski
  `{3,8}` aralığı 4/5/7'yi kabul ediyordu, hiçbir ayrıştırıcı çözemiyor).
- **`removeBackground` köşe çoğunluğunu hesaplayıp kullanmıyordu** (`corners[0]`).
  Sol-üst köşesi karakterle dolu görselde arka plan hiç kalkmıyordu. Oylama
  toleranslı ve saydam köşeler sayılmıyor — sayılsaydı RGB'si 0,0,0 olan saydam
  köşe "arka plan siyah" dedirtip dış hattı siliyordu.
- **`normaliseRigName` ASCII dışı harfleri siliyordu** (`\w`): "kol üst" →
  `kol_st`, "göz" → `gz`. Arayüz iki dilli, `\p{L}` oldu.
- **`storage.tx()` işlemin tamamlanmasını beklemiyordu**: `request.onsuccess`
  diske işlenmeden ateşleniyor, `onabort` dinlenmiyordu — kota dolduğunda
  kullanıcı "kaydedildi" sanıyor ya da söz sonsuza kadar askıda kalıyordu.
- `api.version` 2'de kalmışken `help()` ve konsol v3 diyordu (tek sabit oldu).
- Ajan `deleteLayer`'ı, silinen katman aktif olmasa bile odağı en üste taşıyordu.
- `raster.line()` NaN/kesirli uç noktada sonsuz döngüye giriyordu (bugün
  ulaşılamıyor; bekçi eklendi).
- `/editor` başlığı tek dilli Türkçeydi, diğer iki sayfa İngilizce.

### Performans: her fare hareketinde tuval N kez birleştiriliyordu

"Piksel verisi React state'ine girmez" kararının amacı 60fps çizim, ama arayüz
onu geri alıyordu: her `doc.notify()`'da (yani her `pointermove`'da) tam
`composite()` çağıran **dört** yer vardı — ana canvas (1), `EmptyCanvasHint`
(1), her `FrameThumb` (kare sayısı kadar), onion skin (2×menzil). 512×512 ve
20 kareli projede tek fare hareketi ≈ 22 tam birleştirme, ~23 MB ayırma,
~5.7M piksel işlemi. Düzeltmeler:

- **Küçük önizlemeler:** `"pixels"` değişimi yalnızca çizilen kareyi
  ilgilendirir; yapı/geçmiş değişimi hepsini. Ajan başka kareye çizerse çağrı
  başına gelen `bump()` (version) hepsini tazeliyor — tarayıcıda ölçüldü:
  aktif olmayan kareye çizim önizlemesini tazeliyor, aktif önizleme boşuna
  değişmiyor, undo geri alıyor.
- **`EmptyCanvasHint`:** `composite()` yerine cel'leri doğrudan tarıyor, sıfır
  ayırma, ilk dolu pikselde çıkıyor.
- **Onion skin:** renklendirilmiş komşu kareler önbellekte, anahtar `version`.
  Komşu kareler darbe boyunca değişmiyor; değişen tek şey aktif kare, o da
  kendi komşusu değil. Bayat hayalet bırakmadığı tarayıcıda ölçüldü.
- Şekil önizlemesi `ImageData`'yı yeniden ayırmıyor, tek tamponu sıfırlıyor.

### Denetimin kendi denetimi (aynı oturum, "double check")

Düzeltmeleri yazdıktan sonra diff kendi başına tarandı ve **dört gerçek kusur
daha** çıktı — üçü yeni yazılan kodda:

- **Palet `#` olmadan depolanabiliyordu.** `isHex` `#`'siz yazımı kabul ediyor,
  ama palet değerleri doğrudan CSS'e yazılıyor ve `background: "f0a"`
  uygulanmıyor: swatch bomboş çıkıyor (tarayıcıda `CSS.supports` ile ölçüldü).
  `normaliseHex` eklendi; ajan `setPalette`'i, `.nibble` paleti ve palet
  editörü aynı normalleştirmeden geçiyor.
- **Dosyadan gelen rig adları normalleştirilmiyordu.** `deleteNode`/`renameNode`
  gelen adı `normaliseRigName`'den geçirip karşılaştırıyor; dosyada "kol üst"
  ham hâlde kalsaydı parça ne silinebilir ne yeniden adlandırılabilir olurdu.
  Adlar normalleşiyor, kemik uçları da aynı dönüşümden geçiyor, çakışan ikinci
  ad düşüyor.
- **"Birincil ekle" palete doğrulamasız yazıyordu** — birincil renk alanı
  serbest metin olduğu için "kırmızı" palete girip projeyle kaydedilebiliyordu.
- **Üçüncü bir hex regex'i** palet editöründe duruyordu (8 haneli alfayı
  reddediyor, ajan tarafı kabul ediyordu). Tek doğrulayıcıya bağlandı.

Ek olarak yazdığım bir test yanlıştı (düğüme `pos` vermemişim, kod onu haklı
olarak atıyordu) — test düzeltildi, kod değil.

**Bilinçli bırakılanlar:** `classifyImageSource` artık `file://` altında göreli
yolu reddediyor (kökeni "null" olan her yol eşleşeceği için gevşetmek yerel
dosya okumaya kapı açardı; statik export zaten `file://`'dan çalışmıyor).
Keyfi açı döndürme kutuyu 2048'in üstüne büyütemiyor (sınırlı, çökme yok).
`exporters`/`image-to-pixels` istisna metinleri Türkçe ve İngilizce arayüzde de
öyle görünüyor — bu dosyalardaki eski davranışla tutarlı, ayrı bir i18n işi.

**Kalan bilinen durum:** `npm audit` hâlâ 3 high (postcss, sharp) — dev
bağımlılığı, bu üründe sömürülebilir değil, düzeltmesi Next 16'ya kırıcı
yükseltme. `next build` 4. oturumda çalıştırılmadı (dev sunucusu açıktı; ikisi aynı
`.next`'i kullanıyor) — **5. oturumda koşuldu ve temiz geçti**, bkz. §13.

---

## 13. Sırada ne kaldı — yayına alma (5. oturum, 2026-08-24)

### İlk iki adım BİTTİ

1. ✅ **Temiz `next build`.** `rm -rf .next` → `npm run build` sırasıyla
   koşuldu (dev sunucusu kapalıydı): `✓ Compiled successfully`, **6 rota
   statik export edildi** (`/`, `/_not-found`, `/agent`, `/editor`), editör
   first-load **175 kB**, hata/uyarı yok. Denetimde 30+ dosya değişmişti,
   build ayrı bir yol olduğu için (statik export + prerender) bu adım şarttı.
   Aynı turda `npm test` **257/257** yeşil.
2. ✅ **`git init` + ilk commit + push.** Repo kökü `nibble/`, dal `main`,
   ilk commit `e04f370` (**56 dosya, +25.709 satır**), remote
   `git@github-kisisel:noorrraaa/nibble.git` → push'landı, ağaç temiz.
   `.gitignore` doğru tuttu: `node_modules/ · .next/ · out/ · test-build/ ·
   *.tsbuildinfo` hiçbiri girmedi. İlk turda commit kimliği global
   ayardan **iş maili** olarak geldi (portföydeki 14 reponun hepsinde aynı
   hata vardı); aynı gün düzeltildi — geçmiş `Emre Kızak
   <emrekizak5@gmail.com>` olarak yeniden yazılıp force-push edildi. İçerik
   değişmedi (ağaç hash'leri birebir aynı), **SHA'lar değişti**. Artık
   `~/Desktop/hayat/` altında açılan her repo kişisel kimliği `~/.gitconfig`
   içindeki `includeIf gitdir:~/Desktop/hayat/` kuralıyla otomatik alıyor.

### 3. adım: LİSANS + HOST — kullanıcı kararı, hâlâ açık

- **Lisans yok.** Repo **private** olduğu için şu an aciliyeti yok
  (kullanıcı 2026-08-24'te teyit etti). Ama repo public'e çevrildiği gün
  lisans dosyasızlık "her hak saklı" demek olur — kimse yasal olarak
  fork/kullanamaz — ve bu, README'deki "free, no account, forever free"
  konumlandırmasıyla çelişir. Yayına çıkarken MIT tek dosya yeter.
- **Host seçilmedi** *(adres 2026-09-28'de kararlaştı: `nibble.nardin.app` — host hâlâ açık)*. Statik export hazır (`out/`). GitHub Pages alt dizinde
  yayınlanırsa `next.config.ts`'e **`basePath` şart**; Vercel/Netlify/Cloudflare
  Pages kökten servis ederse dokunmak gerekmez.

### Ürün listesi (öncelik sırası değil)

1. Seçimi ajan API'sine aç — `select/copy/paste` ajan tarafında yok; parça
   (rig) yaklaşımı onun yerini büyük ölçüde tutuyor ama ad-hoc kırpma yok.
2. Serbest biçimli (lasso) ve renge göre seçim — şu an sadece dikdörtgen.
3. Ajanın imlecini canlı yola bağla — son dokunulan noktayı gösteriyor, uzun
   bir `drawFromText` sırasında adım adım hareket etmiyor.
4. Sprite sheet JSON'unu içe alma (slice dışa aktarımı var, içe alma yok).
   `.nibble` rig'i zaten taşıyor — test edildi.
5. Dokunmatikte iskelet modu — tutamak sürükleme parmakla çalışıyor ama
   tutamaklar 44px dokunma hedefinden küçük.
6. Dışa aktarımı gerçek indirmeyle test et (baytlar doğrulandı, dosya diske
   hiç yazılmadı).
7. `exporters.ts` / `image-to-pixels.ts` istisna metinleri Türkçe ve İngilizce
   arayüzde de Türkçe görünüyor ("PNG üretilemedi", "Görsel yüklenemedi",
   `.nibble` doğrulama sebepleri). Eski davranışla tutarlı ama tek dilli;
   sözlüğe taşınmalı.

### Denetimden kalan bilinçli borç

- `npm audit` 3 high (postcss, sharp) — dev bağımlılığı, bu üründe
  sömürülebilir değil, düzeltmesi Next 16'ya kırıcı yükseltme.
- Ajan `contextHint()` çağrı başına bir tam `composite()` yapıyor. Hız sınırı
  (10 sn'de 120) tavanı tuttuğu için bırakıldı; arayüz tarafındaki asıl
  fan-out düzeltildi (§12).
- Keyfi açı döndürme parça kutusunu 2048'in üstüne büyütemiyor.

---

## 14. Değişmeyen mimari kararlar

| Karar | Gerekçe |
|---|---|
| Backend yok, `output: "export"` | Statik hosting ücretsiz katmanda sınırsıza yakın |
| Üyelik yok | Gir, yap, çık |
| IndexedDB (localStorage değil) | 5MB + string-only sınırı 20 karelik projeyi kaybettirir |
| Katmanlar proje seviyesinde global | Aseprite modeli; "katman 1. karede var 2.'de yok" hatasını imkânsız kılar |
| Piksel verisi React state'ine girmez | Girseydi 60fps çizim 5fps'e düşerdi |
| Delta tabanlı undo/redo | 50 piksellik darbe ≈ 400 byte (snapshot 64KB olurdu) |
| Geçerli FPS = `100/fps`'in TAM SAYI çıktığı değerler | GIF gecikmesi tam sayı santisaniye. "100'ün böleni" demek YANLIŞ: 12.5 böleni değil ama 100/12.5 = 8 cs |
| `ctx.arc()` yasak | Anti-aliasing; tam sayı Bresenham elips |
| Bresenham zorunlu | `pointermove` hızlı harekette piksel atlar |
| Ajan API metinleri İngilizce | Makine yüzeyi; arayüz diliyle değişmesi ajanı şaşırtır. Kullanıcıya görünen her şey TR/EN |
| APNG kendi kodlayıcımız, tarayıcının PNG'si yeniden paketlenmiyor | Tarayıcı bit derinliği/palet biçimini kendi seçer; kareler arası fark APNG'yi bozar |
| WebM yok | MediaRecorder kayıplı sıkıştırma uygular, pixel art kenarlarını bulandırır — APNG kayıpsız karşılıyor |
| Radyal araç menüsü yok | Sağ tık ikincil renge bağlı; radyal menü temel etkileşimi ezerdi. Odak modu + yüzen palet fikrin işe yarayan yarısı |
| Rig deformasyonu yok, sadece öteleme/aynalama/90° | Pixel art'ta mesh warp her zaman çamur üretir |
| Batch açan belge metodu `run()` kullanır, elle `beginBatch/endBatch` ÇAĞIRMAZ | `endBatch` iç içe çağrıya karşı korumasız; dıştaki batch'i kapatıp geçmişi öldürüyor (§12) |
| Ajana açılan her sayı kırpılır; tampona dönüşen alanların ayrıca tavanı var | Doğrulanmamış kutu tarayıcıda `RangeError` üretiyor ve açık batch geçmişi öldürüyor (§12) |
| İzin kararı REGEX ile verilmez, çözülmüş URL üstünden verilir | Tarayıcı ters bölü ve gömülü tab'ı normalize ediyor; regex atlatılabiliyordu (§12) |
| Tek hex ayrıştırıcı (`hexToRgba`) + tek doğrulayıcı (`isHex`) + `normaliseHex` | İkinci ayrıştırıcı 3 haneli hex'i açmıyordu; `#`'siz değer CSS'te geçersiz (§12) |
| `.nibble` güvenilmeyen veri: boyut, cel bayt uzunluğu, rig kutusu doğrulanır | Doğrulanmazsa bozuk dosya sekmeyi kilitliyor ya da beyaz ekran veriyor (§12) |

---

## 15. Çalıştırma

```sh
cd ~/Desktop/hayat/nibble        # repo kökü burası
npm run dev        # http://localhost:3000
npm test           # 257 test (tsc -> CommonJS + node --test)
npm run lint       # eslint 9 + eslint-config-next
npm run typecheck
npm run build      # dev sunucusu KAPALIYKEN
```

**Build ritüeli** (ikisi aynı `.next`'i kullanıyor, sırayı bozmak dev'i
`Cannot find module './833.js'` ile 500'e düşürüyor):

```sh
# dev sunucusunu durdur
rm -rf .next
npm run build      # çıktı: out/
```
