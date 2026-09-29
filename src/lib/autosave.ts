/**
 * Nibble — otomatik kayıt denetleyicisi
 *
 * Neden ayrı bir modül: kayıt mantığı eskiden editor-shell'deki `[doc, t]`
 * effect'inin içindeydi ve telefonda iş kaybettiren üç hata oradaydı:
 *
 * 1. Belge değişince (Yeni, taslak açma, .nibble bırakma, ajan newProject)
 *    effect temizleyicisi bekleyen 2.5 sn'lik kaydı `clearTimeout` ile İPTAL
 *    ediyordu — eski projenin son ≤2.5 sn'si kayboluyordu. Dil değiştirmek de
 *    (`t` bağımlılığı) aynı temizleyiciyi tetikliyordu.
 * 2. Tek kayıt anı "2.5 sn sessizlik" ve "sekme gizlendi" idi. Mobilde
 *    pagehide/visibilitychange sırasında başlatılan async IndexedDB yazımı
 *    çoğu zaman sayfa öldürülünce yarıda kalıyor. Artık işlem BİTİNCE
 *    (fırça kalktı, undo, kare ekleme…) kısa bir gecikmeyle kaydediyoruz;
 *    uzun debounce yalnız işlem SÜRERKEN birleştirme için.
 * 3. Açılışta son proje async yüklenirken boş başlangıç belgesi kaydediliyor
 *    ve lastProjectId'nin üzerine yazılıyordu — sonraki açılışta boş tuval.
 *    Artık `markReady()` çağrılana kadar hiçbir şey diske yazılmıyor.
 *
 * React'e ve IndexedDB'ye bağımlı değil: zamanlayıcı ve kayıt fonksiyonu
 * dışarıdan veriliyor, böylece birim testiyle sahte saatle sınanabiliyor.
 */

import type { Project } from "./types";

/** Denetleyicinin belgeden beklediği tek şey — PixelDocument bunu sağlıyor */
export interface AutosaveDoc<P> {
  project: P;
  /** açık bir batch var mı (fırça darbesi / ajan batch'i sürüyor) */
  readonly batching: boolean;
  subscribe(fn: () => void): () => void;
}

export interface AutosaveScheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface AutosaveOptions<P> {
  /** projeyi diske yazar; hata fırlatırsa proje yeniden "kirli" sayılır */
  persist: (project: P) => Promise<void> | void;
  /** kayıt başarısız olunca (ör. kota dolu) */
  onError?: (err: unknown) => void;
  scheduler?: AutosaveScheduler;
  /**
   * İşlem bittikten sonra bekleme. Kısa, çünkü mobilde sayfa her an
   * öldürülebilir; sıfır değil, çünkü art arda gelen undo/redo'ları tek
   * yazıma birleştirmek istiyoruz.
   */
  settleMs?: number;
  /** İşlem sürerken (batch açıkken) birleştirme süresi */
  idleMs?: number;
}

export const AUTOSAVE_SETTLE_MS = 400;
export const AUTOSAVE_IDLE_MS = 2500;

const defaultScheduler: AutosaveScheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class AutosaveController<P> {
  private doc: AutosaveDoc<P> | null = null;
  /**
   * Kirli olan PROJE nesnesi. Belgeyi değil projeyi izliyoruz: ajanın
   * newProject'i aynı PixelDocument içinde `replaceProject` ile projeyi
   * değiştiriyor — belge aynı kalsa da eski projenin bekleyen kaydı var.
   */
  private project: P | null = null;
  private dirty = false;
  private ready = false;
  private timer: unknown = null;
  private unsubscribe: (() => void) | null = null;

  private readonly persist: (project: P) => Promise<void> | void;
  private readonly onError?: (err: unknown) => void;
  private readonly scheduler: AutosaveScheduler;
  private readonly settleMs: number;
  private readonly idleMs: number;

  constructor(opts: AutosaveOptions<P>) {
    this.persist = opts.persist;
    this.onError = opts.onError;
    this.scheduler = opts.scheduler ?? defaultScheduler;
    this.settleMs = opts.settleMs ?? AUTOSAVE_SETTLE_MS;
    this.idleMs = opts.idleMs ?? AUTOSAVE_IDLE_MS;
  }

  get isDirty(): boolean {
    return this.dirty;
  }
  get isReady(): boolean {
    return this.ready;
  }

  /**
   * Belgeye bağlanır. Önceki belgenin bekleyen kaydı varsa ÖNCE o yazılır —
   * belge değişimi bir kayıp anı değil.
   *
   * `dirty`: yeni belge hemen kaydedilsin mi. Başlangıçtaki dokunulmamış boş
   * belge için false (diske boş proje yazmayalım); Yeni / taslak / .nibble /
   * geri yüklenen belge için true — lastProjectId de ona dönsün.
   */
  attach(doc: AutosaveDoc<P>, opts: { dirty: boolean }): void {
    if (this.doc === doc) return;
    this.flush();
    this.unsubscribe?.();
    this.doc = doc;
    this.project = doc.project;
    this.dirty = opts.dirty;
    this.unsubscribe = doc.subscribe(() => this.onChange());
    if (this.dirty) this.schedule(this.settleMs);
  }

  /** Bekleyeni yazar ve belgeden ayrılır (bileşen sökülürken) */
  detach(): void {
    this.flush();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.doc = null;
    this.project = null;
  }

  /**
   * Açılıştaki geri yükleme bitti (başarılı ya da değil). Bundan önce hiçbir
   * şey diske yazılmaz; bekleyen kirli iş varsa şimdi zamanlanır.
   */
  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    if (this.dirty) this.schedule(this.settleMs);
  }

  /** Bekleyen kaydı hemen yazar. Kirli değilse ya da hazır değilse hiçbir şey yapmaz. */
  flush(): void {
    this.cancelTimer();
    if (!this.ready || !this.dirty || this.project === null) return;
    const project = this.project;
    this.dirty = false;
    let result: Promise<void> | void;
    try {
      result = this.persist(project);
    } catch (err) {
      this.failed(project, err);
      return;
    }
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).catch((err) => this.failed(project, err));
    }
  }

  private failed(project: P, err: unknown) {
    // hâlâ aynı projedeysek kirli say — sonraki değişiklik ya da sekme
    // gizlenmesi yeniden dener. Kendi kendine yeniden zamanlamıyoruz: kota
    // doluysa her 400 ms'de bir hata toast'ı kullanıcıyı boğardı.
    if (this.project === project) this.dirty = true;
    this.onError?.(err);
  }

  private onChange() {
    const doc = this.doc;
    if (!doc) return;
    if (doc.project !== this.project) {
      // aynı belge, yeni proje (replaceProject): eskisini kaybetme
      this.flush();
      this.project = doc.project;
    }
    this.dirty = true;
    // fırça darbesi sürerken her pointermove bildirim gönderiyor; orada
    // kaydetmiyoruz, sadece birleştiriyoruz. Batch kapanınca gelen bildirim
    // "işlem bitti" demek — kısa gecikmeyle yaz.
    this.schedule(doc.batching ? this.idleMs : this.settleMs);
  }

  private schedule(ms: number) {
    this.cancelTimer();
    if (!this.ready) return;
    this.timer = this.scheduler.set(() => {
      this.timer = null;
      this.flush();
    }, ms);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.scheduler.clear(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Projede görünür (alfa > 0) tek bir piksel var mı. "Önceki çizim
 * Taslaklar'da" demeden önce bakıyoruz: dokunulmamış boş tuval kaydedilmiyor,
 * olmayan bir taslağı işaret etmeyelim.
 */
export function projectHasPixels(p: Project): boolean {
  for (const f of p.frames ?? []) {
    for (const cel of Object.values(f.cels ?? {})) {
      if (!cel) continue;
      for (let i = 3; i < cel.length; i += 4) if (cel[i] !== 0) return true;
    }
  }
  return false;
}
