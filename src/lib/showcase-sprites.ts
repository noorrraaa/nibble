/**
 * Nibble — tanıtım sayfasındaki örnek sprite'lar ve sahneler
 *
 * ÖNEMLİ: Bunlar resim dosyası DEĞİL. Editörün ajana sunduğu `drawFromText`
 * formatının birebir aynısı — bir karakter bir piksel, "." saydam, legend
 * karakteri renge bağlıyor. Yani sayfa kendi konusunun malzemesiyle boyanmış
 * durumda ve "bir sprite tek çağrıda çizilir" iddiası sayfanın kendisinde
 * kanıtlanıyor.
 *
 * Sahneler (sakura, köpek) 56×32 ve ŞEKİL PRİMİTİFLERİYLE kuruluyor: elips,
 * kalın çizgi, dama deseni ve maskeden türetilen dış hat. Bu boyutta ızgarayı
 * elle yazmak imkânsız — 16 piksellik ilk köpek denemem kahverengi bir kütle
 * gibi okunuyordu; simetri artık matematikten geliyor. Dal, çiçek, torii, köpek gibi
 * zanaat gerektiren parçalar elle çizilmiş karakter ızgaraları olarak
 * `stamp()` ile bindiriliyor. Veri bütünlüğünü showcase-sprites.test.ts
 * doğruluyor (satır uzunlukları, legend kapsaması, boş kare).
 *
 * Küçük nesneler Sweetie-16'dan; sahneler kendi ÖZEL paletini kullanıyor —
 * Sweetie-16'da pembe yok ve editör özel palet destekliyor, dolayısıyla bu da
 * bir özelliğin gösterimi.
 */

export interface SpriteFrame {
  rows: string[];
  /** bu karenin ekranda kalma süresi (ms) */
  ms: number;
  /** yalnızca renk değişen kareler için: satırları kopyalamadan legend'i ez */
  legend?: Record<string, string>;
}

export interface SpriteDef {
  legend: Record<string, string>;
  frames: SpriteFrame[];
  /**
   * Hareket kapalıyken (prefers-reduced-motion) ve ilk render'da gösterilecek
   * kare. Sunucu ile istemci aynı kareyi çizsin diye sabit; yoksa hidrasyon
   * uyuşmazlığı olurdu.
   */
  restIndex: number;
}

/* ────────── ızgara yardımcıları ────────── */

type Grid = string[][];

const grid = (w: number, h: number, ch: string): Grid =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => ch));

const toRows = (g: Grid): string[] => g.map((row) => row.join(""));

/** Elle çizilmiş bir parçayı ızgaraya bindirir; "." saydam sayılır */
function stamp(g: Grid, art: string[], x0: number, y0: number): void {
  art.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      const y = y0 + dy;
      const x = x0 + dx;
      if (g[y]?.[x] !== undefined) g[y][x] = ch;
    }),
  );
}

/**
 * Elle çizilmiş bir parçanın satırlarını en uzun satıra göre "." ile doldurur.
 * Sağdaki boşlukları saymak zorunda kalmıyoruz — 32 karakterlik satırda bir
 * eksik nokta tüm parçayı kaydırıyor ve gözle bulmak dakikalar alıyor.
 */
function art(rows: string[]): string[] {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(w, "."));
}


const put = (g: Grid, x: number, y: number, ch: string): void => {
  if (g[y]?.[x] !== undefined) g[y][x] = ch;
};

/* ────────── şekil primitifleri ────────── */

/**
 * Sahneler artık 56×32. Bu boyutta ızgarayı elle yazmak imkânsız: bir satır
 * 56 karakter ve simetri elde tutulmuyor — ilk denemede 16 piksellik köpek
 * "kahverengi bir kütle" gibi okunuyordu. Çözüm, gövdeleri elips/kutu
 * maskeleriyle kurup dış hattı MASKEDEN TÜRETMEK. Böylece hem çok daha fazla
 * piksel kullanılıyor hem de kafa/kulak/göz simetrisi matematikten geliyor.
 */
type Mask = boolean[][];

const maskNew = (w: number, h: number): Mask =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => false));

/** Dolu elips — yuvarlak gövde, kafa, bulut, çiçek kümesi */
function disk(m: Mask, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (m[y]?.[x] === undefined) continue;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) m[y][x] = true;
    }
  }
}

const put2 = (m: Mask, x: number, y: number): void => {
  if (m[y]?.[x] !== undefined) m[y][x] = true;
};

function box(m: Mask, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (m[y]?.[x] !== undefined) m[y][x] = true;
}

/** Kalın çizgi — dal, gövde, bacak */
function limb(m: Mask, x0: number, y0: number, x1: number, y1: number, r: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    disk(m, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, r, r);
  }
}

const intersect = (a: Mask, b: Mask): Mask =>
  a.map((row, y) => row.map((on, x) => on && b[y]![x]!));

function paint(g: Grid, m: Mask, ch: string): void {
  m.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on && g[y]?.[x] !== undefined) g[y]![x] = ch;
    }),
  );
}

/**
 * Maskenin sınır hücrelerini dış hat rengine çevirir — hat İÇERİDE kalır,
 * yani siluet büyümez. Dış hattı elle çizmek prosedürel şekillerde tek
 * piksellik kaçaklar bırakıyordu; türetmek bunu tamamen bitiriyor.
 */
function outline(g: Grid, m: Mask, ch: string): void {
  const on = (x: number, y: number) => m[y]?.[x] === true;
  m.forEach((row, y) =>
    row.forEach((filled, x) => {
      if (!filled) return;
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))
        g[y]![x] = ch;
    }),
  );
}

/** Bir maskenin dama deseniyle ikinci bir renk kazanması — hacim hissi */
function dither(g: Grid, m: Mask, ch: string, mod: number, rem: number): void {
  m.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on && (x + y) % mod === rem && g[y]?.[x] !== undefined) g[y]![x] = ch;
    }),
  );
}

/* ══════════ maskot: sağa bak · sola bak · ekrana bak ve gülümse ══════════ */

const FACE_LEGEND = {
  D: "#ef7d57", // dış hat — coral
  C: "#ffcd75", // gövde — gold
  M: "#1a1c2c", // göz ve ağız
};

const faceTop = ["....DDDD....", "..DDCCCCDD..", ".DCCCCCCCCD.", "DCCCCCCCCCCD"];
const faceBottom = ["..DDCCCCDD..", "....DDDD...."];

/**
 * Gözler 2×2. Tek hücre genişliğinde denedim, 12 piksellik yüzde dikey çizgi
 * gibi okunuyordu; iki hücre göz olduğunu belli ediyor.
 */
const eyes = {
  right: "DCCCMMCCMMCD",
  left: "DCMMCCMMCCCD",
  centre: "DCCMMCCMMCCD",
};

/**
 * Ağız da bakışla değişiyor. Sadece gözler oynayınca yüz "bakıyor" ama şaşkın
 * DURMUYORDU; küçük yuvarlak bir ağız merak taşıyor ve bakışla aynı yöne
 * kayınca ifade bütünleşiyor.
 */
const mouths = {
  /** şaşkın "o" ağız, bakış yönüne kaymış */
  puzzledRight: ["DCCCCCMMCCCD", ".DCCCCMMCCD."],
  puzzledLeft: ["DCCCMMCCCCCD", ".DCCMMCCCCD."],
  /** öne dönmüş, düz — geçiş karesi */
  neutral: ["DCCCMMMMCCCD", ".DCCCCCCCCD."],
  /** köşeler yukarıda, taban aşağıda */
  smile: ["DCCMCCCCMCCD", ".DCCMMMMCCD."],
};

function face(eye: keyof typeof eyes, mouth: keyof typeof mouths): string[] {
  return [
    ...faceTop,
    eyes[eye],
    eyes[eye],
    "DCCCCCCCCCCD",
    ...mouths[mouth],
    ...faceBottom,
  ];
}

export const MASCOT: SpriteDef = {
  legend: FACE_LEGEND,
  restIndex: 3,
  frames: [
    { rows: face("right", "puzzledRight"), ms: 620 },
    { rows: face("left", "puzzledLeft"), ms: 620 },
    { rows: face("centre", "neutral"), ms: 300 },
    // gülümseme uzun duruyor: döngünün dinlenme noktası burası
    { rows: face("centre", "smile"), ms: 2200 },
  ],
};

/* ══════════ sakura: Fuji, torii ve dökülen çiçekler ══════════ */

const SAKURA_W = 56;
const SAKURA_H = 32;

/**
 * Akşamüstü paleti. Torii vermilyon (#d2452f): hem geleneksel doğru renk hem
 * de mor gökyüzünde okunabilen tek seçenek — ilk denemede koyu siluet olarak
 * çizmiştim ve zeminle aynı değerde kalıp kayboluyordu. Gövde de sıcak kahveye
 * çevrildi; mor tonda bir gövde gökyüzünün içinde eriyordu.
 */
const SAKURA_LEGEND = {
  a: "#1e1a45", // gökyüzü — zirve
  b: "#3a2a66", // gökyüzü — üst orta
  c: "#6b4079", // gökyüzü — alt orta
  d: "#b06277", // gökyüzü — ufka yakın
  e: "#eda07c", // ufuk parıltısı
  F: "#454278", // Fuji — gölgeli yüz
  f: "#575290", // Fuji — ışık alan yüz
  S: "#f0f4fc", // kar
  s: "#b9c5e2", // kar gölgesi
  T: "#d2452f", // torii — vermilyon
  t: "#8f2a1e", // torii — gölge
  K: "#2a2657", // su
  k: "#413a75", // su kırışığı
  l: "#e0937c", // suda ufuk parıltısı
  m: "#9aa2b8", // taş fener
  n: "#5d6479", // taş gölgesi
  L: "#ffd98a", // fener ışığı
  W: "#7a5240", // gövde ve dal
  w: "#4a2f28", // gövde gölgesi
  o: "#9187c4", // Fuji sırt ışığı
  N: "#5a4a66", // ıslak kum
  G: "#1f1834", // kıyı
  g: "#2b2340", // kıyı dokusu
  p: "#ffe3ee", // çiçek — ışık
  q: "#ffa8c8", // çiçek — orta
  r: "#d9547f", // çiçek — gölge
};

/**
 * Torii — kasagi (üst kiriş), shimaki, gakuzuka (orta dikme), nuki (bağ
 * kirişi) ve tabana doğru genişleyen iki hashira. Su içinde duruyor:
 * Itsukushima kuruluşu, sahnenin tanınmasını tek başına sağlıyor.
 */
const TORII = [
  "TTTTTTTTTTTTTTTT",
  "tTTTTTTTTTTTTTTt",
  "..TTTTTTTTTTTT..",
  "...TT..TT..TT...",
  "...Tt..Tt..Tt...",
  "...TT..TT..TT...",
  ".TTTTTTTTTTTTTT.",
  ".tTTTTTTTTTTTTt.",
  "...TT......TT...",
  "...Tt......Tt...",
  "...TT......TT...",
  "...Tt......Tt...",
  "..TTTT....TTTT..",
  "..TTtT....TtTT..",
];

/** Taş fener — kıyıdaki japon işareti */
const LANTERN = [
  "..mmm..",
  "mmmmmmm",
  "nmnnnmn",
  ".mLLLm.",
  ".nLLLn.",
  "..nmn..",
  ".mmmmm.",
];

/**
 * Çiçek kümeleri: [cx, cy, rx, ry]. Tek büyük elips denedim, yapısız pembe bir
 * bulut gibi okunuyordu — ayrı kümeler arasında boşluk bırakmak ve altlarını
 * gölgelemek tepeye hacim veriyor. Soldaki üç küme sahneyi çerçeveliyor;
 * klasik japon kompozisyonu dalı kadrajın içine sokar.
 */
const CLUSTERS: [number, number, number, number][] = [
  [46, 5, 7, 4.5],
  [38, 9, 5.5, 3.5],
  [53, 11, 5, 3.5],
  [44, 13, 5, 3],
  [51, 2, 4.5, 2.5],
  [35, 4, 4, 2.5],
  [31, 12, 3.5, 2.5],
  [3, 1, 5, 3],
  [9, 3, 4, 2.5],
  [14, 0, 3, 2],
  [10, 9, 3, 2],
  [6, 6, 3, 2],
];

function sakuraBase(): Grid {
  const g = grid(SAKURA_W, SAKURA_H, "a");

  /* gökyüzü — beş bant, geçişlerde dama deseni.
     Düz bantlar poster gibi duruyordu; dither pixel art'ın gradyan yapma yolu. */
  const BANDS: [number, string][] = [
    [5, "a"],
    [10, "b"],
    [14, "c"],
    [16, "d"],
    [17, "e"],
  ];
  for (let y = 0; y <= 17; y++) {
    const band = BANDS.find(([until]) => y <= until)?.[1] ?? "e";
    for (let x = 0; x < SAKURA_W; x++) g[y][x] = band;
  }
  for (const [y, from] of [
    [6, "a"],
    [11, "b"],
    [15, "c"],
    [17, "d"],
  ] as const) {
    for (let x = 0; x < SAKURA_W; x++) if ((x + y) % 2 === 0) g[y][x] = from;
  }

  /* ay ve yıldızlar — sol üstteki boşluğu dolduruyor ve ağacın sağdaki
     ağırlığını dengeliyor */
  const moon = maskNew(SAKURA_W, SAKURA_H);
  disk(moon, 27, 3, 2.6, 2.6);
  paint(g, moon, "S");
  dither(g, moon, "s", 3, 1);
  for (const [x, y] of [
    [22, 1], [25, 7], [31, 2], [19, 6], [24, 4], [33, 1],
    [21, 9], [29, 8], [16, 2], [30, 5],
  ] as const)
    put(g, x, y, (x + y) % 2 === 0 ? "S" : "s");

  /* Fuji — apeks (17,3), taban y=17 (su hattı). Kadrajın solundan taşıyor:
     dağın çerçeveye sığmaması onu büyük gösteriyor. */
  const apexX = 17;
  const apexY = 3;
  const slope = (y: number) => Math.round((y - apexY) * 1.2);
  const fuji = maskNew(SAKURA_W, SAKURA_H);
  for (let y = apexY; y <= 17; y++) box(fuji, apexX - slope(y), y, apexX + slope(y), y);
  paint(g, fuji, "F");
  const lit = maskNew(SAKURA_W, SAKURA_H);
  box(lit, apexX, 0, SAKURA_W - 1, SAKURA_H - 1);
  dither(g, intersect(fuji, lit), "f", 2, 0);

  const snow = maskNew(SAKURA_W, SAKURA_H);
  for (let y = apexY; y <= apexY + 4; y++) box(snow, apexX - slope(y), y, apexX + slope(y), y);
  // kar hattı düz bitmesin — dişli kenar
  for (const [x, y] of [[14, 8], [20, 8], [12, 9], [22, 9], [17, 9], [17, 10]] as const)
    put2(snow, x, y);
  paint(g, intersect(fuji, snow), "S");
  dither(g, intersect(fuji, snow), "s", 3, 0);
  /* Sırt ışığı. Dağ gövdesine hangi rengi verirsem gökyüzü bantlarından
     birinin değerine denk geliyor ve o yükseklikte siluet kayboluyordu —
     ilk denemede dağ tamamen görünmez olmuş, karlı zirve havada yüzüyordu.
     Silueti gökyüzünden bağımsız hâle getirmenin yolu kenarı işaretlemek. */
  outline(g, fuji, "o");

  /* su — y 18..25, torii içinde duruyor.
     Dama deseni su gibi okunmuyordu; suyun dili YATAY kesik çizgi. Her satırın
     deseni kaydırılıyor ki çizgiler üst üste binip ızgara oluşturmasın. */
  const lake = maskNew(SAKURA_W, SAKURA_H);
  box(lake, 0, 18, SAKURA_W - 1, 25);
  paint(g, lake, "K");
  for (let y = 18; y <= 25; y++)
    for (let x = 0; x < SAKURA_W; x++) if ((x + y * 3) % 7 < 3) put(g, x, y, "k");
  // ufuk parıltısı — tek sıra, kesikli. Kesiksiz çizgi yol şeridi gibi duruyordu.
  for (let x = 0; x < SAKURA_W; x++) if ((x * 3) % 5 < 3) put(g, x, 18, "l");
  /* Zirvenin sudaki pırıltısı. Gerçek ayna yansıması ekranın altına düşüyor
     (dağ ufuktan çok yukarıda); ressamın yaptığı gibi doğrudan altına
     kırıklı bir parıltı konuyor. */
  for (let y = 18; y <= 21; y++) {
    const half = Math.max(0, 9 - (y - 18) * 2);
    for (let x = apexX - half; x <= apexX + half; x++)
      if ((x + y * 2) % 4 === 0) put(g, x, y, "s");
  }

  /* kıyı */
  const shore = maskNew(SAKURA_W, SAKURA_H);
  box(shore, 0, 26, SAKURA_W - 1, SAKURA_H - 1);
  paint(g, shore, "G");
  dither(g, shore, "g", 4, 0);
  // ıslak kum şeridi. İlk hâli iki sıra ve yoğundu, suyun önünde ahşap bir
  // iskele gibi okunuyordu — seyreltilince kıyı hattı oluyor.
  for (let x = 0; x < SAKURA_W; x++) if ((x * 3) % 4 === 0) put(g, x, 26, "N");

  /* kiraz ağacı — gövde kıyıdan çıkıyor, tepe sağ üste yayılıyor */
  const wood = maskNew(SAKURA_W, SAKURA_H);
  for (let y = 13; y <= 31; y++) {
    const x = 46 + Math.round(Math.sin((y - 13) / 8) * 3);
    box(wood, x - 1, y, x + 1, y);
  }
  box(wood, 43, 30, 51, 31); // kökler
  limb(wood, 47, 16, 36, 10, 1.2); // sola uzanan ana dal
  limb(wood, 47, 14, 54, 8, 1.1); // sağa
  limb(wood, 40, 12, 32, 12, 0.7); // ince uçlar
  limb(wood, 47, 19, 41, 17, 0.7);
  limb(wood, 0, 1, 13, 6, 1.1); // sol üstten çerçeveleyen dal
  limb(wood, 6, 3, 10, 9, 0.6); // aşağı sarkan ince uç
  paint(g, wood, "W");
  dither(g, wood, "w", 3, 1);

  /* çiçek kümeleri */
  const canopy = maskNew(SAKURA_W, SAKURA_H);
  for (const [cx, cy, rx, ry] of CLUSTERS) disk(canopy, cx, cy, rx, ry);
  paint(g, canopy, "q");
  dither(g, canopy, "p", 3, 0); // ışık alan yüzler
  // her kümenin alt yarısı gölgede — hacmi veren şey bu
  const under = maskNew(SAKURA_W, SAKURA_H);
  for (const [cx, cy, rx, ry] of CLUSTERS) disk(under, cx, cy + ry * 0.7, rx * 0.9, ry * 0.6);
  dither(g, intersect(canopy, under), "r", 2, 1);
  // ana dalları çiçeklerin üstüne yeniden ince çiz: yapı görünsün
  const veins = maskNew(SAKURA_W, SAKURA_H);
  limb(veins, 47, 16, 38, 10, 0.5);
  limb(veins, 47, 14, 52, 9, 0.5);
  limb(veins, 2, 3, 10, 4, 0.4);
  paint(g, intersect(veins, canopy), "w");
  // dış çiçekler sert elips kenarını yumuşatıyor
  for (const [x, y] of [
    [28, 7], [30, 14], [26, 11], [55, 6], [51, 15], [42, 17],
    [37, 2], [43, 0], [34, 14], [24, 9], [54, 1], [21, 4],
    [8, 6], [1, 5], [17, 3], [12, 7],
  ] as const)
    put(g, x, y, (x + y) % 2 === 0 ? "p" : "q");

  /* torii suyun içinde, fener kıyıda */
  stamp(g, TORII, 5, 9);
  stamp(g, LANTERN, 3, 25);
  // toriinin sudaki yansıması — direklerin altında, dalgada kesilmiş
  for (const x of [8, 9, 16, 17])
    for (let y = 23; y <= 25; y++) if ((x + y) % 2 === 0) put(g, x, y, "t");

  /* kıyıya düşmüş çiçekler */
  for (const [x, y] of [
    [4, 29], [11, 27], [15, 31], [21, 28], [25, 30],
    [31, 27], [36, 30], [40, 28], [47, 31], [52, 28], [9, 31], [44, 27],
  ] as const)
    put(g, x, y, (x + y) % 3 === 0 ? "p" : "r");

  return g;
}

/**
 * Düşen çiçekler. Konumlar kodla hesaplanıyor: dört kareyi elle yazmak hem
 * hataya açık hem de düşüşün tutarlı olmasını zorlaştırıyordu.
 * y kare başına 2 satır iniyor, x salınıyor.
 */
const PETALS = [
  { x: 20, y: 2, ch: "q" },
  { x: 24, y: 6, ch: "p" },
  { x: 18, y: 15, ch: "r" },
  { x: 29, y: 1, ch: "q" },
  { x: 13, y: 11, ch: "p" },
  { x: 27, y: 19, ch: "q" },
  { x: 33, y: 17, ch: "p" },
  { x: 8, y: 9, ch: "r" },
  { x: 23, y: 12, ch: "p" },
  { x: 15, y: 19, ch: "q" },
  { x: 39, y: 20, ch: "r" },
  { x: 4, y: 16, ch: "q" },
  { x: 11, y: 6, ch: "p" },
  { x: 35, y: 8, ch: "q" },
];
const DRIFT = [0, 1, 0, -1];

function sakuraFrame(f: number): string[] {
  const g = sakuraBase();
  PETALS.forEach((p, i) => {
    // 18 satırlık gökyüzünde dönüyor; su hattına inince başa sarıyor
    const y = (p.y + f * 2) % 18;
    put(g, p.x + DRIFT[(f + i) % 4], y, p.ch);
  });
  return toRows(g);
}

export const SAKURA: SpriteDef = {
  legend: SAKURA_LEGEND,
  restIndex: 0,
  frames: [0, 1, 2, 3].map((f) => ({ rows: sakuraFrame(f), ms: 420 })),
};

/* ══════════ yavru köpek: kır bahçesinde koşuyor ve havlıyor ══════════ */

const PUP_W = 60;
const PUP_H = 40;

const PUPPY_LEGEND = {
  s: "#a8d8f0", // gökyüzü
  W: "#cfe8f5", // bulut gölgesi
  c: "#f7fdff", // bulut
  L: "#ffd23f", // güneş
  h: "#6fae5c", // uzak tepe
  H: "#548f43", // tepe gölgesi
  G: "#6ab04c", // çim
  g: "#4f8f3c", // çim gölgesi
  P: "#f2f6ea", // çit — beyaz kazık
  p: "#c3cdb6", // çit — kiriş ve gölge
  m: "#3d7a2e", // çiçek sapı
  y: "#ffe066", // sarı çiçek
  r: "#ff7a9e", // pembe çiçek
  V: "#a68ae8", // kelebek kanadı
  v: "#4a3080", // kelebek gövdesi
  B: "#e0503a", // top ve tasma
  o: "#1c0f08", // dış hat — siyaha yakın. Koyu kahve dış hat (#3d2517) her
                // şeyi yumuşak/bulanık okutuyordu; "belirgin" olmasını
                // sağlayan şey neredeyse siyah, keskin 1 piksellik hat.
  w: "#f2d8ab", // krem — ağız çevresi, pati, kuyruk ucu
  f: "#cf9247", // tüy — açık ten (karın, bacak)
  F: "#94551f", // tüy — orta
  d: "#5b3016", // tüy — koyu (sırt eyeri, kulak, kafa üstü).
                // d↔f arasındaki büyük değer atlaması referansın keskinliğini
                // veren şey; önceki tonlar birbirine çok yakındı.
  e: "#1c0f08", // göz ve burun — dış hatla aynı
  i: "#ffffff", // göz parıltısı
  t: "#e8607f", // dil
};

/* ─── köpek: elle çizilmiş ───
   Prosedürel elipsler manzarada (dağ, çiçek tepesi, su) doğru araç ama
   karakter için değil: türetilen dış hat kalınlaşıyor, elips sırt çizgisini
   yay yapıyor, dither gölge yerine gürültü üretiyor.

   ÇÖZÜNÜRLÜK belirleyici oldu. Köpeği 24×19 çizdiğimde kafa 10×12 piksele
   sığıyordu ve o alana köpek yüzü girmiyor — tek göz, tek burun, hepsi bu.
   Yüz "bir garip" duruyordu ve haklı bir teşhisti. Şimdi köpek 34×27 ve kafa
   21×20; iki iri göz, kaş, 3 piksellik burun ve ağız için yer var.

   İkinci karar: KAFA ÖNE DÖNÜK, gövde yandan. Yandan bir yüzde tek göz olur
   ve yüz hep yassı okunur. Kafayı kameraya çevirmek simetri kazandırıyor
   (simetri bu boyutta bedava doğruluk) ve gövdeyi yandan bırakmak koşuyu
   korumaya devam ediyor. Referans sprite'larda çok yaygın bir kuruluş. */

/**
 * Kafa — 3/4 ÇEVRİLMİŞ, 19×18. Sağa dönük gövdeye oturuyor, yüz kameraya
 * hafif çevrili: iki göz görünüyor ama burun YANA uzanıyor.
 *
 * Öne tam dönük bir kafa (bir önceki deneme) gövdeye yapıştırılmış bir disk
 * gibi okunuyordu. Referans köpek sprite'larında kafa gövdenin devamı:
 * kafatası arkada, burun önde ve aşağıda, gözler burnun üstünde.
 *
 * Gözlerin yeri KULAĞA göre belirlendi: ilk denemede kulak sol gözü tamamen
 * kapatıyordu ve köpek tek gözlü çıkıyordu. Gözler x=7..14, kulak x=0..5.
 *
 * Gözlerin ÜSTÜNDE açık ten kaş bandı var. Onsuz 3×3 koyu kareler göz değil
 * delik/gözlük gibi okunuyordu — referansta da gözü göz yapan şey çevresindeki
 * açık ton, gözün kendisi değil.
 */
const DOG_HEAD_ART = art([
  ".......oooooo",
  "......odddddo",
  ".....oddddddddo",
  "....oddddddddddo",
  "....odddddddddddo",
  "...oddddddddddddo",
  "...oddddddddddddddo",
  "...oFFFfffFFfffFFFo",
  "...oFFFieeFFieeFFFo",
  "...oFFFeeeFFeeeFFFo",
  "...oFFFFFFFFFFFFFFo",
  "....oFFFFFFwwwwwwwo",
  ".....oFFFFwwwwwweeo",
  "......oFFwwwwwwweeo",
  ".......owwwwwwwwweo",
  "........owweewwwwo",
  ".........owwwwwwo",
  "..........oooooo",
]);

/**
 * Kulak — 6×14, koyu, kafanın yakın tarafından sarkıyor. İç kenarı bir ton
 * açık ki kulak kafanın üstünde ayrı bir hacim olarak okunsun. Uzak kulak
 * kafanın arkasında kalıyor: referansta da tek kulak görünüyor.
 */
const DOG_EAR = art([
  "..ooo",
  ".oddo",
  "oddddo",
  "oddFFo",
  "oddFFo",
  "oddFFo",
  "oddFFo",
  "oddFFo",
  "oddFFo",
  "oddFFo",
  ".oddFo",
  ".oddFo",
  "..oddo",
  "...oo",
]);

/** Havlarken açılan ağız — kapalı ağzın üstüne bindiriliyor */
const MOUTH_OPEN = art([
  "..oooo",
  ".oeeeeo",
  "oeeeeeeo",
  "oetttteo",
  ".oeeeeo",
  "..oooo",
]);

/** Kafa = kafatası + kulak; havlarken ağız açık */
function dogHead(barking: boolean): string[] {
  const g = grid(19, 18, ".");
  stamp(g, DOG_HEAD_ART, 0, 0);
  stamp(g, DOG_EAR, 0, 3);
  if (barking) stamp(g, MOUTH_OPEN, 8, 14);
  return toRows(g);
}

/**
 * Gövde — yandan, 26×12. Uzun ve alçak (oran ~2.2:1), referans köpeklerdeki
 * gibi. Koyu eyer üstte, orta ton yanda, açık ten altta; sınırlar gövdenin
 * eğrisini takip ediyor, kesinlikle düz yatay çizgi değil.
 */
const DOG_BODY = art([
  "......oooooooooooooooo",
  "....odddddddddddddddddo",
  "...oddddddddddddddddddddo",
  "..oddddddddddddddddddddddo",
  ".oddddddddddddddddddddddo",
  ".oFFFFFFFFFFFFFFFFFFFFFFo",
  ".oFFFFFFFFFFFFFFFFFFFFFFo",
  ".oFFFFFFFFFFFFFFFFFFFFFFo",
  "..offffffffffffffffffffo",
  "...offffffffffffffffffo",
  "....offffffffffffffffo",
  "......oooooooooooooo",
]);

/** Kuyruk — ince ve yukarı kıvrık, referanstaki gibi */
const DOG_TAIL = art([
  "..ooo",
  ".oFFo",
  ".oFFo",
  ".oFFo",
  "oFFo",
  "oFFo",
  ".oFFo",
  "..oFFo",
  "...oFFo",
  "....oo",
]);

/**
 * Bir bacak ÇİFTİ — dış hat paylaşımlı tek şekil, 8 geniş.
 * Yakın bacak açık ten, uzak bacak orta ton; ikisi arasında tek dış hat.
 * `up` bir satır kısa: gövdeyi zıplatmadan koşu hissi veriyor.
 */
function legPair(up: boolean): string[] {
  const shaft = Array.from({ length: up ? 3 : 4 }, () => "offfoFFo");
  return art([...shaft, "owwwowwo", "owowoowo", "oooooooo"]);
}

const DOG_W = 34;
const DOG_H = 30;

function dogArt(pose: "runA" | "runB" | "bark"): string[] {
  const g = grid(DOG_W, DOG_H, ".");

  stamp(g, DOG_TAIL, 0, 3);
  stamp(g, DOG_BODY, 0, 12);
  // bacaklar gövdenin ÜSTÜNE: üst satırlarında dış hat yok, o yüzden tüy
  // gövdeye devam ediyor ve karnın kesintisiz yatay alt hattı kalkıyor
  stamp(g, legPair(pose === "runA"), 4, 23);
  stamp(g, legPair(pose === "runB"), 14, 23);
  // kafa en son: gövdenin ön ucunu kapatıp boyun dikişini görünmez yapıyor
  stamp(g, dogHead(pose === "bark"), 15, 0);

  // tasma — boynun dibinde, kafanın hemen arkasında
  for (const [x, y] of [
    [16, 14], [17, 14], [17, 15], [18, 15], [19, 15], [19, 16], [20, 16],
    [21, 16], [21, 17], [22, 17], [23, 17], [23, 18], [24, 18],
  ] as const)
    put(g, x, y, "B");

  return toRows(g);
}

/** Havlama ses çizgileri */
const BARK = art(["...o..o", "..o", ".o...o", "o..o", ".o"]);

/** Top — köpeğin peşinden koştuğu şey */
const BALL = art([
  "..ooo",
  ".oBwBo",
  "oBwBBBo",
  "oBBBBBo",
  "oBBBBBo",
  ".oBBBo",
  "..ooo",
]);

/** Kelebek */
const BUTTERFLY = art([
  ".oo.oo.",
  "oVVoVVo",
  "oVVvVVo",
  ".oVvVo.",
  "..ovo..",
]);

function puppyBase(): Grid {
  const g = grid(PUP_W, PUP_H, "s");

  /* gökyüzü / tepe / çim bantları */
  for (let y = 0; y < PUP_H; y++) {
    const band = y <= 21 ? "s" : y <= 25 ? "h" : "G";
    for (let x = 0; x < PUP_W; x++) g[y][x] = band;
  }
  const hills = maskNew(PUP_W, PUP_H);
  disk(hills, 9, 30, 15, 8);
  disk(hills, 33, 31, 14, 7);
  disk(hills, 54, 30, 13, 7);
  box(hills, 0, 26, PUP_W - 1, PUP_H - 1);
  paint(g, hills, "h");
  dither(g, hills, "H", 5, 0);

  const grass = maskNew(PUP_W, PUP_H);
  box(grass, 0, 26, PUP_W - 1, PUP_H - 1);
  paint(g, grass, "G");
  dither(g, grass, "g", 3, 1);

  /* güneş — ışınlı */
  const sun = maskNew(PUP_W, PUP_H);
  disk(sun, 8, 7, 4, 4);
  paint(g, sun, "L");
  for (const [x, y] of [
    [8, 1], [8, 13], [2, 7], [14, 7], [4, 3], [12, 3], [4, 11], [12, 11],
  ] as const)
    put(g, x, y, "L");

  /* bulutlar */
  const cloud = maskNew(PUP_W, PUP_H);
  disk(cloud, 21, 6, 6, 3);
  disk(cloud, 26, 7, 4.5, 2.4);
  disk(cloud, 17, 7, 3.5, 2);
  disk(cloud, 48, 11, 6, 2.6);
  disk(cloud, 53, 12, 4.5, 2.2);
  disk(cloud, 44, 12, 3.5, 1.8);
  paint(g, cloud, "c");
  const low = maskNew(PUP_W, PUP_H);
  box(low, 0, 8, PUP_W - 1, 14);
  paint(g, intersect(cloud, low), "W");

  /* çit — kirişler önce ve koyu, kazıklar sonra ve beyaz */
  const rails = maskNew(PUP_W, PUP_H);
  box(rails, 0, 20, PUP_W - 1, 21);
  box(rails, 0, 26, PUP_W - 1, 27);
  paint(g, rails, "p");
  const pickets = maskNew(PUP_W, PUP_H);
  for (let x = 1; x < PUP_W; x += 7) {
    box(pickets, x, 17, x + 2, 29);
    put2(pickets, x + 1, 16); // sivri tepe
  }
  paint(g, pickets, "P");
  dither(g, pickets, "p", 4, 3);

  /* ön planda çim yaprakları — çiçeklerden önce, saplarını yutmasın */
  for (let x = 0; x < PUP_W; x++) {
    const h = (x * 7 + ((x * x) % 5)) % 6;
    for (let y = PUP_H - h; y < PUP_H; y++) put(g, x, y, "g");
  }

  /* kır çiçekleri — artık dört taç yapraklı, sapları iki satır */
  for (const [x, y, head] of [
    [3, 33, "y"], [8, 37, "r"], [14, 31, "y"], [19, 36, "r"],
    [25, 33, "y"], [31, 37, "r"], [38, 32, "y"], [44, 36, "r"],
    [50, 31, "y"], [55, 36, "y"], [58, 33, "r"], [34, 30, "r"],
  ] as const) {
    for (let dy = 1; dy <= 3; dy++) put(g, x, y + dy, "m");
    put(g, x, y - 1, head);
    put(g, x, y + 1, head);
    put(g, x - 1, y, head);
    put(g, x + 1, y, head);
    put(g, x, y, head === "y" ? "w" : "y"); // göbek
  }

  /* top ve kelebekler */
  stamp(g, BALL, 51, 30);
  stamp(g, BUTTERFLY, 5, 15);
  stamp(g, BUTTERFLY, 52, 18);

  return g;
}

function puppyFrame(kind: "runA" | "runB" | "bark"): string[] {
  const g = puppyBase();
  // yere basan gölge — köpeği çimin üstüne oturtuyor
  const shadow = maskNew(PUP_W, PUP_H);
  disk(shadow, 29, 37, 14, 1.6);
  dither(g, shadow, "g", 2, 0);
  stamp(g, dogArt(kind), 12, 7);
  if (kind === "bark") stamp(g, BARK, 48, 13);
  return toRows(g);
}

export const PUPPY: SpriteDef = {
  legend: PUPPY_LEGEND,
  restIndex: 2,
  frames: [
    { rows: puppyFrame("runA"), ms: 200 },
    { rows: puppyFrame("runB"), ms: 200 },
    { rows: puppyFrame("bark"), ms: 620 },
    { rows: puppyFrame("runB"), ms: 200 },
  ],
};

/* ══════════ küçük nesneler (Sweetie-16) ══════════ */

export const SLIME: SpriteDef = {
  legend: { G: "#38b764", L: "#a7f070", M: "#1a1c2c", W: "#f4f4f4" },
  restIndex: 0,
  frames: [
    {
      ms: 460,
      rows: [
        "....GGGG....",
        "..GGLLLLGG..",
        ".GLWWLLLLLG.",
        "GLLLLLLLLLLG",
        "GLLMMLLMMLLG",
        "GLLLLLLLLLLG",
        "GLLLLLLLLLLG",
        ".GLLLLLLLLG.",
        "..GGGGGGGG..",
      ],
    },
    {
      // aşağı kayıp yayılıyor — squash
      ms: 240,
      rows: [
        "............",
        "............",
        "...GGGGGG...",
        ".GGLWWLLLGG.",
        "GLLLLLLLLLLG",
        "GLMMLLLLMMLG",
        "GLLLLLLLLLLG",
        "GLLLLLLLLLLG",
        ".GGGGGGGGGG.",
      ],
    },
  ],
};

/**
 * Kalp silueti: iki tepe → tam genişlik → satır satır daralan uç.
 * İlk denemede dış hattı ayrı bir halka olarak çizmiştim, 12 piksellik kalpte
 * iç dolgu için yer kalmıyordu ve şekil bloba dönüyordu. Şimdi dış hat yalnızca
 * gerçek sınır hücrelerinde; x=5,6'daki O'lar kalbin tepe çukurunu veriyor.
 */
const HEART_ROWS = [
  "..OO....OO..",
  ".ORRO..ORRO.",
  "ORHHROORRRRO",
  "ORHRRRRRRRRO",
  "ORRRRRRRRRRO",
  ".ORRRRRRRRO.",
  "..ORRRRRRO..",
  "...ORRRRO...",
  "....ORRO....",
  ".....OO.....",
];

export const HEART: SpriteDef = {
  legend: { O: "#1a1c2c", R: "#b13e53", H: "#ef7d57" },
  restIndex: 0,
  frames: [
    { rows: HEART_ROWS, ms: 720 },
    // satırları kopyalamıyoruz: aynı ızgara, sadece dolgu bir ton açılıyor
    { rows: HEART_ROWS, ms: 200, legend: { O: "#1a1c2c", R: "#ef7d57", H: "#ffcd75" } },
  ],
};

export const SWORD: SpriteDef = {
  legend: {
    O: "#1a1c2c",
    S: "#94b0c2",
    W: "#f4f4f4",
    G: "#ffcd75",
    H: "#566c86",
  },
  restIndex: 0,
  frames: [
    {
      ms: 1000,
      // 10 genişlikte deneyince ince bir çubuk gibi okunuyordu; muhafazayı
      // genişletmek ve tutamağı ayırmak kılıç olduğunu belli ediyor
      rows: [
        ".....OO.....",
        "....OSSO....",
        "....OWSO....",
        "....OWSO....",
        "....OWSO....",
        "....OWSO....",
        "....OWSO....",
        "....OWSO....",
        "....OWSO....",
        ".OOOOGGOOOO.",
        ".OGGGGGGGGO.",
        ".OOOOHHOOOO.",
        "....OHHO....",
        "....OHHO....",
        "....OGGO....",
        ".....OO.....",
      ],
    },
  ],
};

/** Büyük sahneler — geniş kartlar */
export const SCENES = [
  { key: "sakura", sprite: SAKURA },
  { key: "puppy", sprite: PUPPY },
] as const;

/** Küçük nesneler — dar kartlar */
export const OBJECTS = [
  { key: "slime", sprite: SLIME },
  { key: "heart", sprite: HEART },
  { key: "sword", sprite: SWORD },
] as const;

/** Testin gezdiği tam liste */
export const ALL_SHOWCASE = [
  { key: "mascot", sprite: MASCOT },
  ...SCENES,
  ...OBJECTS,
] as const;
