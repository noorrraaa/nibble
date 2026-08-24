/**
 * Nibble — depolama
 *
 * Proje verisi IndexedDB'de: yüzlerce MB kapasite, typed array'i DOĞRUDAN saklar.
 * localStorage kullanılamaz — 5MB sınırı ve string-only kısıtı yüzünden 20 karelik
 * bir proje kotayı patlatır ve kullanıcı işini kaybeder.
 * localStorage sadece küçük ayarlar için.
 */

import type { Project } from "./types";

const DB_NAME = "nibble";
const DB_VERSION = 1;
const STORE = "projects";
const SETTINGS_KEY = "nibble.settings.v1";

export interface ProjectSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  frameCount: number;
  updatedAt: number;
  bytes: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB kullanılamıyor"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB açılamadı"));
  });
  return dbPromise;
}

/**
 * İşlemin TAMAMLANMASINI bekliyoruz, isteğin başarısını değil.
 *
 * `request.onsuccess` yazma işlemi diske işlenmeden önce ateşleniyor: kota
 * dolduğunda işlem sonradan iptal ediliyor ve söz çözülmüş olduğu için
 * kullanıcı "kaydedildi" sanıyordu. `onabort`/`onerror` dinlenmediği için de
 * söz sonsuza kadar askıda kalabiliyordu — otomatik kayıt sessizce ölürdü.
 */
function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        let result: T;
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => {
          result = req.result;
        };
        req.onerror = () => reject(req.error ?? new Error("IndexedDB isteği başarısız"));
        t.oncomplete = () => resolve(result);
        t.onabort = () =>
          reject(t.error ?? new Error("IndexedDB işlemi iptal edildi (kota dolu olabilir)"));
        t.onerror = () => reject(t.error ?? new Error("IndexedDB işlemi başarısız"));
      }),
  );
}

export async function saveProject(project: Project): Promise<void> {
  await tx("readwrite", (s) => s.put(project));
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return tx<Project | undefined>("readonly", (s) => s.get(id));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<Project[]>("readonly", (s) => s.getAll());
  return all
    .map((p) => ({
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      frameCount: p.frames?.length ?? 0,
      updatedAt: p.updatedAt,
      bytes: estimateProjectBytes(p),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

/** "Taslakları temizle" — her şeyi siler */
export async function clearAllData(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* özel mod / kota */
  }
}

export function estimateProjectBytes(p: Project): number {
  let n = 0;
  for (const f of p.frames ?? []) {
    for (const cel of Object.values(f.cels ?? {})) n += cel?.byteLength ?? 0;
  }
  return n;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

/**
 * Tarayıcının veriyi otomatik temizlemesini engellemeyi dener.
 * Reddedilirse kullanıcıya dışa aktarım önerilir.
 */
export async function requestPersist(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ── ayarlar (localStorage) ────────────────────────────────────
export interface Settings {
  lastProjectId?: string;
  paletteId?: string;
  theme?: "light" | "dark";
  onionSkin?: boolean;
  showGrid?: boolean;
  /** ilk kullanım rehberi gösterildi mi */
  tourSeen?: boolean;
  /**
   * Ajan izinleri. Serbest biçimli okunur (eski/bozuk kayıt olabilir),
   * normalisePolicy() ile güvenli hale getirilir.
   */
  agentPolicy?: {
    enabled?: boolean;
    scopes?: Partial<Record<string, boolean>>;
  };
}

export function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Settings;
  } catch {
    return {};
  }
}

export function saveSettings(patch: Partial<Settings>): void {
  try {
    const next = { ...loadSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* kota dolu / özel mod — sessiz geç */
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
