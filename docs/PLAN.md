# NIBBLE — Teknik Plan

> AI ajanların kullanabildiği, backend'siz, üyeliksiz, ücretsiz pixel art & animasyon editörü.

**Durum:** UYGULANDI. Bu dosya 2026-08-15'teki ilk teknik plan, tarihsel
referans olarak duruyor — bugünkü durum, sapmalar ve gerekçeler için
`docs/DURUM.md`'ye bak. Plandaki her faz bitti; plandan bilinçli sapmalar
(radyal menü yok, WebM yok, kemik deformasyonu yok, sistem panosu yok)
DURUM.md §14'te gerekçeleriyle yazılı.
**Tarih:** 2026-08-15 (plan) · son durum notu 2026-08-21
**Stack:** Next.js 15 (static export) + TypeScript + Zustand + Canvas 2D
**Landing page konsepti:** `docs/landing-concept.html` (ilk konsept; canlı landing `src/app/page.tsx`)

## Marka

**Nibble** — 1 nibble = 4 bit = tam 16 değer = pixel art'ın klasik 16 renkli paleti. İçeriden bir referans; bilen anlar, bilmeyen için de kısa ve dostça.

**Logo:** 4×4 ızgara (16 hücre = 16 renk = 1 nibble), sağ üst hücre "ısırılmış" (boş, accent renkte çerçeveli). Aynı anda bir piksel, bir palet, bir byte diyagramı ve bir ısırık izi. Saf CSS/SVG — 16×16 favicon'da bile birebir okunur, çünkü zaten piksel.

**Palet:** Sweetie-16 türevi (gerçek, sevilen bir pixel art paleti). Site kendi konusunun malzemesiyle boyanmış olur.

**Tipografi:** Monospace (ızgara/makine — başlıklar, veri, etiketler) + serif (okuma — gövde metni). Gerilim kasıtlı.

---

## 1. Kararlar ve kısıtlar

| Karar | Değer | Gerekçe |
|---|---|---|
| Backend | **Yok** | Sunucu maliyeti = 0. Statik hosting (Vercel/Cloudflare Pages/GitHub Pages) ücretsiz katmanda sınırsıza yakın. |
| Üyelik / auth | **Yok** | Gir, yap, çık. Sürtünme sıfır. |
| Veritabanı | **Yok** — tarayıcı depolaması | IndexedDB (proje verisi) + localStorage (ayarlar) |
| Ücretlendirme | **Tamamen ücretsiz** | Maliyet kalemi olmadığı için sürdürülebilir |
| AI maliyeti | **Bize sıfır** | AI bizi çağırır, biz AI'ı çağırmayız (bkz. §11) |
| Ürün tipi | Tek kişilik editör | Ortak canvas yok |

### Neden Next.js (backend yokken)?

Next.js `output: 'export'` ile tamamen statik build üretir — sunucu gerekmez. Vite'a göre tek avantajı: **landing page + dokümantasyon sayfaları için SEO**. Ücretsiz ve reklamsız bir araç için tek dağıtım kanalı organik arama olacak; "free pixel art animation editor" araması için düzgün render edilmiş statik sayfalar önemli. Ayrıca §11'deki `/llms.txt` ve `/agent` doküman sayfaları da buradan gelir.

---

## 2. Mimari

```
┌──────────────────────── Tarayıcı ────────────────────────┐
│                                                          │
│   React (UI katmanı)          Zustand (UI state)         │
│   toolbar / palet / timeline  aktif araç, zoom, renk     │
│         │                            │                   │
│         └──────────┬─────────────────┘                   │
│                    ▼                                     │
│         PixelDocument (plain TS, React dışı)             │
│         Uint8ClampedArray'ler + event emitter            │
│                    │                                     │
│         ┌──────────┼──────────┬────────────┐             │
│         ▼          ▼          ▼            ▼             │
│    Renderer     History    Storage    window.nibble    │
│    (canvas)    (undo/redo) (IndexedDB)  (AJAN API'si)    │
│                                              ▲           │
└──────────────────────────────────────────────┼───────────┘
                                               │
                              Claude in Chrome / AI ajan
```

**Tek kural:** Piksel verisi asla React state'ine girmez. React sadece metadata'yı (frame sayısı, aktif araç, palet) bilir; çizim imperatif olarak canvas'a yapılır.

---

## 3. Veri modeli

```ts
type Hex = `#${string}`

interface Project {
  id: string                    // nanoid
  name: string
  width: number                 // 8..512
  height: number
  palette: Hex[]                // maks 256
  frames: Frame[]
  fps: number
  createdAt: number
  updatedAt: number
  schemaVersion: 1              // migration için
}

interface Frame {
  id: string
  layers: Layer[]
  durationCs: number            // santisaniye (GIF birimi) — bkz §10
}

interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number               // 0..1
  locked: boolean
  data: Uint8ClampedArray       // width * height * 4 (RGBA)
}
```

**Neden RGBA typed array, indexed color değil?** Indexed (palet indeksi başına 1 byte) 4× daha küçük ve palet değişimini bedava yapar — ama alfa kanalını, AI'dan gelen keyfi renkleri ve katman opaklığını karmaşıklaştırır. RGBA ile 128×128 bir katman 64KB; 20 frame × 3 katman ≈ 4MB. Modern cihazlar için sorunsuz. İleride bellek sorun olursa indexed mod eklenebilir.

---

## 4. Depolama — "taslakları temizle" akışı

| Ne | Nerede | Neden |
|---|---|---|
| Proje verisi (frame'ler, katmanlar) | **IndexedDB** (`idb` paketi) | Yüzlerce MB kapasite, Blob/TypedArray'i doğrudan saklar, base64 şişkinliği yok |
| Ayarlar (tema, son araç, favori paletler, onion skin tercihi) | **localStorage** | Küçük, senkron okuma yeterli |

> **Not:** Sadece localStorage kullanmak mümkün değil — 5MB sınırı ve string-only kısıtı yüzünden 20 frame'lik bir proje kotayı patlatır ve kullanıcı çalışmasını kaybeder. IndexedDB de tamamen tarayıcıda, sunucusuz ve "temizle" ile silinebilir; kullanıcı açısından fark yok.

**Otomatik kayıt:** 3 saniyelik debounce + `visibilitychange` (sekme gizlenince) + `beforeunload`.

**Depolama paneli** (Ayarlar → Depolama):
- `navigator.storage.estimate()` ile kullanılan/kalan alan göstergesi
- Proje listesi: ad, boyut, son düzenleme, tek tek sil
- **"Tüm taslakları temizle"** → onay diyaloğu → `indexedDB.deleteDatabase()` + `localStorage.clear()`
- Kota %80'i geçince uyarı bandı: "Depolama doluyor, eski taslakları temizle"

**Kalıcılık isteği:** İlk kayıtta `navigator.storage.persist()` çağrılır — tarayıcının veriyi otomatik temizlemesini engeller. Reddedilirse kullanıcıya "projelerini `.pxproj` olarak dışa aktar" önerisi gösterilir.

**Dosya formatı (`.pxproj`):** `fflate` ile zip → `project.json` (metadata) + `frames/{i}_{layer}.png`. Taşınabilir, insan tarafından açılabilir, sıkışık.

---

## 5. Render mimarisi

Üst üste yığılmış DOM canvas katmanları — imleç hareketi piksel yeniden çizimi tetiklemez:

```
5. overlay    → fırça önizleme, seçim (marching ants)
4. grid       → sadece zoom > 8 iken çizilir
3. onion      → önceki/sonraki frame'ler, kırmızı/mavi tint
2. composite  → asıl pikseller (putImageData)
1. checker    → şeffaflık dama deseni (CSS)
```

**Ölçekleme:**
```ts
const buffer = new OffscreenCanvas(w, h)       // native çözünürlük
buffer.getContext('2d').putImageData(composited, 0, 0)

display.imageSmoothingEnabled = false           // KRİTİK
display.drawImage(buffer, 0, 0, w * zoom, h * zoom)
```

**Dirty-rect optimizasyonu:** Sadece değişen sınırlayıcı kutu yeniden `putImageData` edilir. 128×128'de tam redraw zaten <1ms; 512×512'de kritik hale gelir.

---

## 6. Girdi işleme

- **Pointer Events** (Mouse Events değil) → tablet, stylus, dokunmatik desteği bedava gelir
- `setPointerCapture` → canvas dışına sürüklerken çizim kopmaz
- `evt.pressure` → basınca duyarlı fırça (opsiyonel)

**Koordinat dönüşümü:**
```ts
const px = Math.floor((e.clientX - rect.left) / zoom + panX)
const py = Math.floor((e.clientY - rect.top) / zoom + panY)
```

**Bresenham zorunlu:** `pointermove` olayları hızlı harekette piksel atlar. Son nokta ile yeni nokta arasını Bresenham ile doldurmazsan kesikli çizgiler oluşur — bu, sıfırdan yazılan her pixel editöründe yapılan bir numaralı hata.

---

## 7. Undo / Redo

**Delta tabanlı komut deseni** (snapshot değil):

```ts
interface PixelDelta {
  type: 'pixels'
  frameId: string
  layerId: string
  rect: { x: number; y: number; w: number; h: number }
  before: Uint8ClampedArray     // sadece değişen bölge
  after: Uint8ClampedArray
}

interface StructuralDelta {
  type: 'structure'
  before: ProjectSnapshot        // frame ekleme/silme gibi nadir işlemler
  after: ProjectSnapshot
}
```

50 piksellik bir fırça darbesi ≈ 400 byte (tam snapshot 64KB olurdu). Geçmiş 200 adımla veya 50MB ile sınırlanır.

**Batch:** `history.beginBatch(label)` / `endBatch()` — bir fırça darbesi (pointerdown→pointerup) tek undo adımıdır. AI'ın yaptığı toplu değişiklik de tek adımdır (bkz §11).

---

## 8. State yönetimi

İki ayrı katman — bu ayrım projenin performans belkemiği:

**`useEditorStore`** (Zustand, React'e bağlı):
`activeTool`, `primaryColor`, `secondaryColor`, `palette`, `zoom`, `pan`, `activeFrameIndex`, `activeLayerId`, `onionSkin`, `isPlaying`, `frameCount`

**`PixelDocument`** (düz TS sınıfı, React dışı):
Gerçek `Frame[]` verisini tutar, mutasyonları uygular, `EventTarget` üzerinden `pixelschanged` / `structurechanged` yayar. Renderer bu olayları dinler ve imperatif çizer.

> **Tuzak:** Piksel buffer'larını React state'ine koymak. `setState` her fırça hareketinde tüm ağacı yeniden render eder → 60fps çizim 5fps'e düşer. Bu hatayı yapan her hobi pixel editörü aynı duvara toslar.

---

## 9. Araçlar (Faz 1)

| Araç | Kısayol | Not |
|---|---|---|
| Kalem | `B` | Boyut 1..N, kare/daire uç |
| Silgi | `E` | |
| Kova (flood fill) | `G` | Scanline algoritması; bitişik/global toggle, tolerans |
| Damlalık | `I` / `Alt` basılı | Herhangi bir araçtan Alt ile geçici erişim |
| Çizgi | `L` | Bresenham |
| Dikdörtgen | `U` | Dolu/boş |
| Elips | `U` ×2 | **Midpoint circle** — `ctx.arc()` değil (anti-aliasing yapar) |
| Seçim | `M` | Dikdörtgen + sihirli değnek, taşı/kopyala/yapıştır |
| Pan | `Space` basılı | |
| Zoom | `Ctrl + tekerlek`, `+`/`-` | İmleç merkezli |

**İki fark yaratan özellik:**

1. **Pixel-perfect stroke** — Aseprite'ın imzası. Çapraz çizimde oluşan L şeklindeki çift pikselleri otomatik siler. Bunu yapmayan bir editör "amatör" damgası yer.
2. **Simetri modu** — Dikey/yatay/dörtlü ayna. Karakter sprite'ı çizmenin süresini yarıya indirir.

**Kısayollar Aseprite ile birebir uyumlu olmalı.** Pixel art topluluğunun kas hafızası var; farklı bir şema öğrenme yükü değil, terk etme sebebi.

---

## 10. Animasyon ve dışa aktarım

### Timeline
- Küçük önizleme (thumbnail) şeridi — her frame küçük canvas'a render edilip cache'lenir, düzenlemede invalidate olur
- Oynat/duraklat, döngü, fps kontrolü, frame başına süre override
- **Onion skin:** N önceki (kırmızı tint) / N sonraki (mavi tint), ayarlanabilir opaklık
- Frame işlemleri: ekle, çoğalt, sil, sürükle-sırala, kopyala/yapıştır

### GIF dışa aktarımı — `gifenc`

Web Worker içinde çalışır, UI donmaz.

**Üç tuzak:**

1. **Gecikme birimi santisaniye (1/100s).** 60fps → 1.67cs → yuvarlanır ve animasyon bozulur. Çözüm: fps seçimini 100'ün bölenlerine kilitle → **10, 12.5, 20, 25, 50 fps**. Veri modelinde `durationCs` (integer) tutulur, `fps` sadece UI kolaylığıdır.
2. **Şeffaflık 1-bit.** GIF kısmi alfa desteklemez. Yarı saydam piksel varsa dışa aktarımda uyarı göster: "N piksel kısmi saydam — GIF'te tam saydam veya tam opak olacak."
3. **256 renk sınırı.** Pixel art'ta genelde sorun değil ama palet dışı AI çıktısı geldiyse kuantizasyon gerekir.

### Diğer formatlar

| Format | Kütüphane | Not |
|---|---|---|
| PNG (tek frame) | native canvas | 1×/2×/4×/8× nearest-neighbor ölçek |
| Sprite sheet | native canvas | Ayarlanabilir sütun/satır + **Aseprite-uyumlu JSON** metadata → Godot/Unity importer'ları doğrudan okur |
| APNG | `upng-js` | Tam alfa + 8-bit renk. GIF'in üstün alternatifi. Faz 1.1 |
| WebM | `MediaRecorder` | Bedava, native. Faz 1.1 |

---

## 11. AI Ajan Katmanı ★

**Bu bölüm ürünün farkı.** Diğer her şey Piskel'in de yaptığı şey.

### Model: AI bizi çağırır

Klasik yaklaşım "site → AI API → görsel al". Bu bize token maliyeti bindirir ve ücretsizliği imkânsız kılar.

Bizim yaklaşımımız tersine: **kullanıcı kendi AI ajanını getirir** (Claude in Chrome, Comet, herhangi bir agentic browser) ve biz o ajana editörü kullandıracak araçları sunarız.

```
Kullanıcı: "Claude, pixelforge.app'te 8 karelik bir yürüyüş
            döngüsü çiz, sweetie-16 paletiyle"
      ↓
Claude (tarayıcı eklentisi) → sitemizi açar
      ↓
window.nibble.help()  →  API'yi kendi keşfeder
      ↓
window.nibble.usePalette('sweetie-16')
window.nibble.drawFromText({ rows: [...], legend: {...} })
window.nibble.addFrame(); ... ×8
window.nibble.readCanvas()  →  ne çizdiğini görür, düzeltir
window.nibble.exportGif()
```

**Sonuç:** bize AI maliyeti sıfır. Kullanıcı zaten ödediği aboneliği kullanır. Site sonsuza kadar ücretsiz kalabilir.

### Neden bu, ekran görüntüsü + tıklamadan iyi?

Bir ajanın 32×32 canvas'ta tek tek piksel tıklaması 1024 eylem demektir — pratikte imkânsız. Programatik API ile aynı iş **tek çağrıda** biter. Dahası, LLM'ler karakter ızgarası üretmekte iyidir; bu formatı onların doğal düşünme biçimine uyarlıyoruz.

### API yüzeyi — `window.nibble`

```ts
// ── Sorgulama ─────────────────────────────────────────
help(): string                      // Tüm API dokümanı — ajan kendini eğitir
getState(): {
  width, height, frameCount, activeFrame, fps,
  palette: Hex[], layers: {id, name, visible}[]
}
readCanvas(frame?): {
  width, height,
  legend: Record<string, Hex | 'transparent'>,
  rows: string[]                    // her karakter bir piksel
}

// ── Çizim ─────────────────────────────────────────────
setPixels(pixels: {x,y,c}[]): void          // toplu — tek çağrıda yüzlerce
drawFromText(opts: {
  rows: string[]                    // ["..AA..", ".AAAA.", "AABBAA"]
  legend: Record<string, number|Hex> // {"A": 3, "B": "#ff0044"}
  x?: number, y?: number             // origin (varsayılan 0,0)
  frame?: number, layer?: string
}): void
fill(x, y, color): void
clearFrame(frame?): void

// ── Palet ─────────────────────────────────────────────
getPalette(): Hex[]
setPalette(colors: Hex[]): void
usePalette(name: string): void      // 'sweetie-16', 'pico-8', 'endesga-32', ...
listPalettes(): string[]

// ── Animasyon ─────────────────────────────────────────
addFrame(opts?: {copyFrom?: number}): number
duplicateFrame(i: number): number
deleteFrame(i: number): void
setActiveFrame(i: number): void
setFps(fps: 10|12.5|20|25|50): void
play() / pause(): void

// ── Dışa aktarım ──────────────────────────────────────
exportGif(): Promise<void>          // indirmeyi tetikler
exportPng(opts?: {scale?: number}): Promise<void>
exportSpriteSheet(opts?: {columns?: number}): Promise<void>

// ── Geçmiş ────────────────────────────────────────────
beginBatch(label: string): void     // "AI: yürüyüş döngüsü"
endBatch(): void
undo() / redo(): void
```

### `readCanvas` / `drawFromText` formatı

Aynı format hem okuma hem yazma için kullanılır — kapalı döngü:

```js
window.nibble.readCanvas()
// {
//   width: 12, height: 8,
//   legend: { ".": "transparent", "A": "#5d275d", "B": "#ef7d57" },
//   rows: [
//     "............",
//     "....AAAA....",
//     "...ABBBBA...",
//     "...ABBBBA...",
//     "....AAAA....",
//     "............",
//     "............",
//     "............"
//   ]
// }
```

Ajan çizdiğini **okuyabildiği** için ekran görüntüsü almadan kendini düzeltebilir. Bu, token maliyetini ve hata oranını dramatik biçimde düşürür.

### Keşfedilebilirlik — ajan API'yi nasıl bulur?

Dört kanal, hepsi gerekli:

1. **`/llms.txt`** — site kökünde, AI ajanlar için okunabilir doküman (yükselen standart)
2. **`/agent` sayfası** — insan+ajan okunabilir tam API referansı
3. **Konsol banner'ı** — `console.info("PixelForge Agent API v1 — window.nibble.help()")`. Konsol okuyan ajanlar anında görür.
4. **UI'da "AI Modu" paneli** — kullanıcıya kopyalanabilir hazır prompt verir:
   > *"Bu sayfada `window.nibble` API'si var. `window.nibble.help()` çağırarak başla."*

Ayrıca `<meta name="ai-tools" content="/llms.txt">` etiketi.

### AI eylemlerinin UX'i

- **Tek undo adımı:** Ajanın yaptığı tüm değişiklik `beginBatch`/`endBatch` ile sarılır. Kullanıcı tek `Ctrl+Z` ile AI'ın yaptığını geri alır. Bu şart — yoksa 200 adımlık undo çöplüğü oluşur.
- **Canlı görsel geri bildirim:** Ajan çizerken canvas gerçek zamanlı güncellenir; kullanıcı olan biteni izler.
- **AI eylem günlüğü:** Panelde "AI 3 frame ekledi, 412 piksel boyadı" gibi özet — şeffaflık.
- **Kilit:** Kullanıcı istemezse "AI erişimini kapat" toggle'ı — `window.nibble` kaldırılır.

### Güvenlik

API yüzeyi bilinçli olarak dar: sadece **mevcut belgedeki canvas verisini** okur/yazar. Ağ erişimi yok, dosya sistemi yok, başka origin'e erişim yok. Ajan zaten kullanıcının kendi tarayıcısında, kullanıcının izniyle çalışıyor. En kötü senaryo: kullanıcı çizimini bozar → `Ctrl+Z`.

---

## 12. Resim → pixel art dönüştürücü

Yeni gelenin en büyük engeli boş 64×64 tuvalin karşısında donmak. Bir fotoğraftan başlamak o eşiği kaldırır. Tamamı tarayıcıda çalışır — mimariye sıfır maliyetle oturur. *(Landing page'de çalışan bir demosu var.)*

**Boru hattı:**

1. **Kare kırpma** — merkezden, en kısa kenara göre
2. **Kademeli yarılama** — hedefin 2 katına inene kadar canvas'ı yarı yarıya küçült. Kutu ortalaması detayı korur; tek adımda nearest-neighbor yapmak detayı öldürür.
3. **Palet seçimi** — sabit palet (sweetie-16, Game Boy, kullanıcının kendi paleti) **veya** medyan kesim ile görselden otomatik N renk üret
4. **Kuantizasyon** — algısal ağırlıklı RGB mesafesi (0.30·R² + 0.59·G² + 0.11·B²); düz Öklid mesafesinden gözle belirgin biçimde iyi
5. **Sıralı (Bayer 4×4) dither** — opsiyonel. Pixel art'ta Floyd-Steinberg'e tercih edilir: deseni düzenli ve "elle yapılmış" görünür, gürültülü değil.
6. **Temizlik** — yalnız kalan tek piksel eleme, kenar netleştirme

**Dürüst sınır:** Otomatik dönüşüm iyi bir *başlangıç*, bitmiş iş değil. Çıktı doğrudan düzenlenebilir tuvale gelir çünkü asıl iş oradan sonra başlar. Bunu ürün içinde gizlememek gerekir — pixel art topluluğu "AI/otomatik çıktıyı sanat diye satmak"a karşı hassas.

**Ajan tarafı:** `nibble.importImage(dataUrl, {size, palette, dither})` — ajan da bir görseli içeri alabilir.

---

## 13. İskelet & etiket katmanı (Rig) ★

**Her AI çizim aracının kör noktası:** "sol kolu kaldır" dendiğinde AI hangi piksellerin sol kol olduğunu bilemez. Rig, insan ile AI arasında **ortak bir uzamsal sözlük** kurar.

### Yapı

```ts
interface Rig {
  nodes: Record<string, [x: number, y: number][]>   // kare başına konum
  bones: { name: string; from: string; to: string }[]
  regions: Record<string, RegionDef>                 // isimlendirilmiş piksel kümesi
}

type RegionDef =
  | { type: 'pixels'; frameId: string; layerId: string; mask: Uint8Array }
  | { type: 'color'; paletteIndex: number; withinBone?: string }
```

- **Düğüm (node):** isimli nokta — `omuz_sol`, `el_sag`, `kafa`
- **Kemik (bone):** iki düğüm arası isimli segment — `kol_sol`
- **Bölge (region):** isimli piksel kümesi — `sac`, `pantolon`

Rig **projeye** aittir (karakterin iskeleti), düğüm konumları **kare başına** tutulur (poz). Ayrı katman — piksellere dokunmaz, dışa aktarımda yer almaz.

### Arayüz — Rig Modu

Üçüncü mod (Çizim / Animasyon / Rig). Tuval %40 opaklığa düşer, rig katmanı öne geçer:
- Tıkla → düğüm koy → satır içi isim girişi (piksel merkezine snap)
- Düğümden düğüme sürükle → kemik oluştur → isimlendir
- Sağ tık bir bölgeye → flood select → "bölge olarak isimlendir"

### Ajan API'si

```ts
nibble.rig.list()                          // tüm isimlendirilmiş yapılar + ölçüler
nibble.rig.get(name)                       // {type, coords, kapsadığı pikseller}
nibble.rig.addNode(name, x, y)
nibble.rig.addBone(name, fromNode, toNode)
nibble.rig.addRegion(name, def)

nibble.transform(name, {dx, dy})           // "sol kolu 3px yukarı"
nibble.rotate(name, {pivot, degrees})      // "kolu omuzdan 15° döndür"
nibble.recolor(name, {to})                 // "saçı sarıya"
nibble.mirror(name, axis)

nibble.critique(name?)                     // "doğru mu?" — ölçülmüş gözlem paketi
```

### `critique()` — "bak, doğru yer mi?"

Geometrik analizi **site yapar**, AI'a *gözlem* olarak sunar. AI tahmin etmez, ölçülmüş veriyle konuşur:

```js
nibble.critique("kol_sol")
// { observations: [
//     "kol_sol ile govde arası 55° — omuz eklemi için doğal aralıkta",
//     "el_sol düğümünde 2 piksel var, kol kopuk değil",
//     "uyarı: kol_sag hâlâ 90°, duruş asimetrik — kasıtlı mı?"
//   ] }
```

### Asıl ödül: otomatik ara kareler

Düğümlerin kare başına konumu tutulunca iskelet bir **poz anahtarı** olur:

1. Kullanıcı kare 1'i çizer ve rig'ler
2. Kare 8'de sadece düğümleri sürükler — 30 saniyelik iş
3. AI aradaki 6 kareyi **kemik açılarını interpole ederek** üretir

Kare tutarlılığı AI animasyonunun en zor problemi. Piksellerden tahmin etmek yerine iskeletten türetmek onu *yapısal olarak* çözer. Rakiplerin ücretli sattığı şey budur.

### AI olmadan da değerli

`sac` bölgesini seçip palet denemek, `kol_sol`'u pozu bozmadan taşımak, `kol_sag`'a aynalamak. Rig opsiyoneldir — hiç açmadan da Nibble tam bir editördür.

---

## 14. Ajan el sıkışması ve Ortak Mod

**Site ajanı nasıl "algılar"?** Davranışsal el sıkışma: `window.nibble.help()` (veya herhangi bir `window.nibble.*` çağrısı) **el sıkışmanın kendisidir.** İnsan kullanıcı konsoldan bunu çağırmaz.

`navigator.webdriver` gibi sinyaller güvenilmez ve gereksiz — API çağrısı zaten kesin bir sinyal.

**El sıkışma sonrası:**
- Arayüz **Ortak Mod**'a geçer: canvas kenarında hafif bir parıltı, ikinci bir imleç (AI'ın imleci) belirir
- Altta canlı **eylem şeridi** açılır (terminal görünümlü, chat kutusu değil): `▸ drawFromText 12×8 @ (4,6) · 96px`
- Kullanıcı isterse tek tuşla kapatır → `window.nibble` kaldırılır

**Site ajanı yönlendirir — üç mekanizma:**

1. **Duruma duyarlı `help()`** — sadece API listesi değil, anlık öneri:
   `hint: "Boş canvas. drawFromText ile tek çağrıda sprite çiz."`
2. **Aşamalı açılım** — `help()` konu listesi döner, `help('animation')` derine iner. Ajanın bağlamı şişmez.
3. **Her dönüş değerinde `hint`** — ajan yanlış yola saparsa site düzeltir:
   `{ ok: true, painted: 412, hint: "Pikselleri tek tek yollama, setPixels ile toplu gönder." }`

Site pasif bir tuval değil, aktif bir eğitmen.

**Toplu geri alma:** Ajanın tüm değişikliği `beginBatch`/`endBatch` ile sarılır → kullanıcı tek `Ctrl+Z` ile AI'ın yaptığını geri alır. Şart; yoksa 200 adımlık undo çöplüğü oluşur.

---

## 15. Klasör yapısı

```
pixelforge/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # landing (SEO)
│   ├── editor/page.tsx           # editör ('use client')
│   ├── agent/page.tsx            # ajan API dokümanı
│   └── robots.ts
├── public/
│   └── llms.txt
├── components/
│   ├── canvas/
│   │   ├── CanvasStage.tsx       # katmanlı canvas + pointer
│   │   ├── PixelRenderer.ts      # imperatif çizim döngüsü
│   │   ├── OnionSkin.ts
│   │   ├── RigOverlay.tsx        # düğüm/kemik çizimi (Rig Modu)
│   │   └── GridOverlay.ts
│   ├── modes/
│   │   ├── DrawMode.tsx          # krom-suz: radyal araç menüsü, yüzen rampalar
│   │   ├── AnimateMode.tsx       # film şeridi düzeni
│   │   └── RigMode.tsx           # tuval soluk, iskelet önde
│   ├── toolbar/  palette/  timeline/  layers/
│   └── panels/
│       ├── AgentPanel.tsx        # "AI Modu" + hazır prompt
│       ├── AgentTicker.tsx       # canlı eylem şeridi (Ortak Mod)
│       ├── ImportPanel.tsx       # resim → pixel art
│       └── StoragePanel.tsx      # "taslakları temizle"
├── lib/
│   ├── core/
│   │   ├── PixelDocument.ts      # veri modeli + mutasyonlar
│   │   ├── History.ts            # delta undo/redo
│   │   ├── Composite.ts          # katman birleştirme
│   │   └── types.ts
│   ├── tools/
│   │   ├── bresenham.ts  fill.ts  shapes.ts  select.ts
│   │   └── pixelPerfect.ts
│   ├── color/
│   │   ├── palettes.ts           # gömülü Lospec paletleri + rampa gruplama
│   │   ├── quantize.ts           # medyan kesim + algısal en yakın renk
│   │   └── dither.ts             # Bayer 4×4
│   ├── import/
│   │   └── imageToPixels.ts      # kademeli küçültme → kuantize → temizlik
│   ├── rig/
│   │   ├── model.ts              # düğüm / kemik / bölge
│   │   ├── transform.ts          # taşı / döndür / renklendir / aynala
│   │   ├── critique.ts           # geometrik gözlem üretimi
│   │   └── tween.ts              # kemik interpolasyonu → ara kareler
│   ├── export/
│   │   ├── gif.worker.ts         # gifenc
│   │   ├── png.ts  spritesheet.ts
│   ├── storage/
│   │   ├── db.ts                 # idb wrapper
│   │   └── fileFormat.ts         # .pxproj zip
│   ├── agent/
│   │   ├── api.ts                # window.nibble implementasyonu
│   │   └── docs.ts               # help() metni (tek kaynak)
│   └── store/editorStore.ts      # zustand (sadece UI state)
└── next.config.ts                # output: 'export'
```

---

## 16. Bağımlılıklar

| Paket | Amaç | Neden bu |
|---|---|---|
| `next` `react` `typescript` | temel | statik export |
| `zustand` | UI state | React dışı store'a izin verir; Redux ağırlığı yok |
| `gifenc` | GIF encode | modern, hızlı, küçük; `gif.js` bakımsız |
| `fflate` | `.pxproj` zip | en hızlı saf-JS zip |
| `idb` | IndexedDB | ham IDB API'si acı verici |
| `upng-js` | APNG (Faz 1.1) | |
| `tailwindcss` | stil | |
| `@radix-ui/*` | dialog, slider, dropdown | erişilebilirlik bedava |
| `lucide-react` | ikon | |

**Toplam bundle hedefi:** < 250KB gzip (editör sayfası).

---

## 17. Yol haritası

| # | Milestone | Çıktı |
|---|---|---|
| M0 | Kurulum + veri modeli | Boş canvas render oluyor, zoom/pan çalışıyor |
| M1 | Çizim | Kalem, silgi, Bresenham. **Çizebiliyorsun.** |
| M2 | Undo/redo | Delta geçmiş, batch. *(Erken yapılmalı — sonra eklemek acı)* |
| M3 | Araçlar + palet | Kova, şekiller, damlalık, pixel-perfect, simetri, renk rampaları |
| M4 | Katmanlar | Ekle/sil/sırala/gizle/opaklık |
| M5 | Kareler + film şeridi | Animasyon Modu, onion skin, oynatma |
| M6 | Dışa aktarım | PNG + GIF (worker) + sprite sheet + Aseprite JSON |
| M7 | Depolama | IndexedDB otomatik kayıt, proje listesi, "taslakları temizle" |
| M8 | **Dönüştürücü** | Resim → pixel art (§12). Onboarding'in kilit parçası |
| M9 | Cila | Kısayollar (Aseprite uyumlu), boş durumlar, mobil uyarısı, landing page |
| — | **Faz 1 tamam — yayınlanabilir ürün** | |
| M10 | **Ajan API'si** | `window.nibble`, `help()`, `/llms.txt`, `/agent` |
| M11 | **El sıkışma + Ortak Mod** | Algılama, ikinci imleç, eylem şeridi, batch undo (§14) |
| M12 | **Rig Modu** | Düğüm/kemik/bölge çizimi, isimlendirme (§13) |
| M13 | **Rig + AI** | `transform` / `rotate` / `recolor` / `critique` |
| M14 | **Otomatik ara kareler** | Poz anahtarlarından kemik interpolasyonu — asıl ödül |
| M15 | Topluluk | Galeri, paylaşılabilir link (URL'de sıkıştırılmış proje) |

---

## 18. Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| **Depolama kotası** — kullanıcı işini kaybeder | Yüksek | `storage.persist()`, kota uyarısı, otomatik `.pxproj` dışa aktarım hatırlatması |
| **Ajan API'si kullanılmaz** — kimse denemez | Yüksek | Panelde tek tıkla kopyalanan hazır prompt + landing page'de demo GIF |
| **Tarayıcı ajanı ekosistemi henüz küçük** | Orta | API tarayıcı ajanı olmadan da değerli: kullanıcı konsola kendi script'ini yazabilir; ileride BYOK modu (bkz §16) |
| **Mobil deneyim** | Orta | Faz 1 masaüstü öncelikli. Mobilde açıkça "masaüstü öner" bandı — kötü mobil deneyim sunmaktansa dürüst ol |
| **Pixel art topluluğunun AI'a mesafesi** | Orta | AI opsiyonel ve kapatılabilir. Editör AI olmadan da tam işlevli. Konumlandırma: "AI'lı editör" değil, "AI da kullanabilen editör" |
| **Büyük canvas performansı (512×512+)** | Düşük | Dirty-rect, gerekirse indexed renk modu |
| **Rig kapsam kayması** — iskelet sistemi tek başına bir ürün büyüklüğünde | Yüksek | Faz 1'e **sadece tip tanımı** girer. M12'de en dar haliyle çıkar: düğüm + kemik + `transform`. Bölge, `critique` ve ara kare üretimi ayrı milestone'lar. |
| **Dönüştürücü çıktısının "AI slop" algısı** | Orta | Ürün içinde açıkça "başlangıç noktası" olarak konumlandırılır; çıktı doğrudan düzenlenebilir tuvale düşer, bitmiş iş olarak sunulmaz |

---

## 19. Ek — Opsiyonel BYOK modu (Faz 3+)

Tarayıcı ajanı olmayan kullanıcılar için: kendi Anthropic API anahtarını yapıştırma seçeneği. Anahtar localStorage'da kalır, çağrı doğrudan tarayıcıdan yapılır — **bize yine maliyet yok**.

Bu modda Claude'un uygun kullanımları (görsel üretimi değil, yapısal işler):

| İş | Model | Neden |
|---|---|---|
| Doğal dilden palet üretimi ("gün batımı çölü, 16 renk") | `claude-haiku-4-5` | Basit, hızlı, ucuz ($1/$5 per MTok) |
| Doğal dil düzenleme komutu → API çağrısı ("kılıcı büyüt") | `claude-sonnet-5` | Tool use ile `window.nibble` çağrılarına çevirir |
| Animasyon keyframe planlama ("6 karelik yürüyüş: her karenin pozunu tarif et") | `claude-sonnet-5` | Yapısal akıl yürütme |
| Karmaşık sprite kompozisyonu | `claude-opus-5` | En yetenekli ($5/$25) |

**Doğru beklenti:** Claude görsel üretmez. Bu işlerde Claude'un rolü *yapısal* — palet üretimi, komut yorumlama, kare planlama. Piksel üretimi ya `drawFromText` ile Claude'un kendi karakter ızgarası çıktısından gelir (küçük sprite'lar için şaşırtıcı derecede iyi), ya da ayrı bir görsel modeliyle (Retro Diffusion gibi pixel-native) yapılır.

> Tarayıcıdan doğrudan Anthropic API çağrısı için özel bir izin başlığı gerekiyor — implementasyon öncesi güncel dokümandan doğrulanmalı.

---

## Açık sorular (kod yazmadan önce netleşmeli)

1. **Varsayılan canvas boyutu?** Öneri: 32×32 (sprite standardı), preset 16/32/64/128, serbest 8–512.
2. **Katmanlar Faz 1'e girsin mi?** Öneri: **evet ama minimal** — M4'te temel ekle/sil/gizle. Sonradan eklemek veri modelini kırar.
3. **Rig veri modeli Faz 1'de yer alsın mı?** Öneri: **evet, sadece tip tanımları.** Rig Modu M12'de gelir ama `Project` tipinde `rig?: Rig` alanı baştan bulunsun — sonradan eklemek şema migration'ı gerektirir.
4. **Alan adı?** `nibble.app` / `nibble.art` / `getnibble.com` — müsaitlik kontrol edilmeli. İsim kısa olduğu için çakışma riski var.
5. **İki mod mu üç mü?** Landing'de Çizim + Animasyon + Rig olarak üç mod anlatıldı. Faz 1'de sadece ilk ikisi çıkar; Rig üçüncü mod olarak sonradan eklenir.
