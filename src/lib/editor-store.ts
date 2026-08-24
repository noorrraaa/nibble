/**
 * Nibble — UI state (Zustand)
 *
 * DİKKAT: Piksel buffer'ları BURAYA GİRMEZ. Burada sadece metadata var.
 * Gerçek veri PixelDocument'te, React dışında yaşar.
 */

"use client";

import { create } from "zustand";
import { PixelDocument, blankProject } from "./pixel-document";
import { DEFAULT_PALETTE } from "./palettes";
import {
  AGENT_LIMITS,
  DEFAULT_POLICY,
  type AgentPolicy,
  type AgentScope,
} from "./agent-policy";
import type { Hex, Point, SymmetryMode, ToolId } from "./types";

export type EditorMode = "draw" | "animate";

export interface AgentLogEntry {
  id: number;
  text: string;
  at: number;
  /** reddedilen çağrı — şeritte kırmızı görünür */
  denied?: boolean;
}

/** Ajan izin verilmeyen bir şey istediğinde UI'da beliren istek */
export interface AgentRequest {
  id: number;
  scope: AgentScope;
  call: string;
  at: number;
}

interface EditorState {
  doc: PixelDocument;
  /** doc yapısı değiştiğinde artar — React'i yeniden render ettirir */
  version: number;

  mode: EditorMode;
  tool: ToolId;
  quickPanTool: ToolId | null;

  primary: Hex;
  secondary: Hex;
  paletteId: string;

  brushSize: number;
  brushRound: boolean;
  pixelPerfect: boolean;
  symmetry: SymmetryMode;
  shapeFilled: boolean;
  contiguousFill: boolean;
  tolerance: number;

  zoom: number;
  panX: number;
  panY: number;
  /** durum çubuğu için imlecin tuval koordinatı */
  cursor: Point | null;
  /** "görünüme sığdır" isteği — artınca CanvasStage yeniden ortalar */
  fitNonce: number;

  /**
   * İskelet modu. Açıkken tuval üstündeki işaretçi çizim yapmaz; tutamak
   * sürükler. Ayrı bir "araç" yapmadık çünkü rig çizim araçlarıyla aynı
   * kategoride değil — bir katman değil, sprite'ın anlamsal haritası.
   */
  /**
   * Seçim dikdörtgeni (tuval koordinatı) ve uygulama içi pano.
   * Pano sistem panosu DEĞİL — gerekçe selection-ops.copySelection'da.
   */
  selection: { x: number; y: number; w: number; h: number } | null;
  clipboard: { w: number; h: number; data: Uint8ClampedArray } | null;

  /**
   * Odak modu: sağ panel, zaman şeridi ve durum çubuğu gizlenir, tuval
   * ekranı kaplar, palet yüzen bir şerit olarak altta durur. Planın
   * "krom-suz çizim modu" fikri — ama radyal menü YOK, çünkü sağ tık
   * ikincil renge bağlı ve radyal menü onu ezerdi.
   */
  focusMode: boolean;
  rigMode: boolean;
  activeNodeName: string | null;
  /** tuvaldeki bir sonraki tıklamanın ne anlama geldiği */
  rigPending: "none" | "place" | "region";
  /** yerleştirilmeyi bekleyen yeni parça adı */
  rigNewName: string | null;

  activeFrame: number;
  activeLayerId: string;

  onionSkin: boolean;
  onionRange: number;
  showGrid: boolean;
  playing: boolean;

  agentConnected: boolean;
  /**
   * Ajanın en son nereye dokunduğu — Ortak Mod'da tuvalde işaretlenir.
   * "AI bir şeyler yaptı" hissi yerine NEREDE yaptığını göstermek için.
   */
  agentCursor: { x: number; y: number; label: string; at: number } | null;
  agentPolicy: AgentPolicy;
  agentLog: AgentLogEntry[];
  agentRequest: AgentRequest | null;

  toast: string | null;

  // ── eylemler ──
  bump: () => void;
  setDoc: (doc: PixelDocument) => void;
  setMode: (m: EditorMode) => void;
  setTool: (t: ToolId) => void;
  setPrimary: (c: Hex) => void;
  setSecondary: (c: Hex) => void;
  swapColors: () => void;
  setPaletteId: (id: string) => void;
  patch: (p: Partial<EditorState>) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  setCursor: (p: Point | null) => void;
  requestFit: () => void;
  setSelection: (r: { x: number; y: number; w: number; h: number } | null) => void;
  setClipboard: (c: { w: number; h: number; data: Uint8ClampedArray } | null) => void;
  setFocusMode: (on: boolean) => void;
  setRigMode: (on: boolean) => void;
  setActiveNode: (name: string | null) => void;
  setRigPending: (mode: "none" | "place" | "region", newName?: string | null) => void;
  setActiveFrame: (i: number) => void;
  setActiveLayer: (id: string) => void;
  togglePlay: () => void;

  pushAgentLog: (text: string, denied?: boolean) => void;
  setAgentConnected: (v: boolean) => void;
  setAgentCursor: (c: { x: number; y: number; label: string } | null) => void;
  setAgentPolicy: (p: AgentPolicy) => void;
  setAgentScope: (scope: AgentScope, on: boolean) => void;
  setAgentEnabled: (on: boolean) => void;
  requestAgentScope: (scope: AgentScope, call: string) => void;
  clearAgentRequest: () => void;

  showToast: (msg: string | null) => void;
}

let logSeq = 0;
let reqSeq = 0;

/**
 * Başlangıç belgesinin adı BOŞ.
 * Buraya `t()` ile yerelleştirilmiş bir ad koysaydık SSR "tr" döndürür, İngilizce
 * istemci hidrasyonda farklı değer görür ve uyuşmazlık çıkardı. Boş ad + üst
 * bardaki yerelleştirilmiş placeholder ikisini de çözüyor; dışa aktarımda
 * safeName() zaten "nibble"a düşüyor.
 */
function makeInitialDoc(): PixelDocument {
  return new PixelDocument(blankProject(32, 32, DEFAULT_PALETTE.colors, ""));
}

const initialDoc = makeInitialDoc();

export const useEditor = create<EditorState>((set, get) => ({
  doc: initialDoc,
  version: 0,

  mode: "draw",
  tool: "pen",
  quickPanTool: null,

  primary: DEFAULT_PALETTE.colors[2],
  secondary: DEFAULT_PALETTE.colors[12],
  paletteId: DEFAULT_PALETTE.id,

  brushSize: 1,
  brushRound: false,
  pixelPerfect: true,
  symmetry: "none",
  shapeFilled: false,
  contiguousFill: true,
  tolerance: 0,

  zoom: 12,
  panX: 0,
  panY: 0,
  cursor: null,
  fitNonce: 0,

  selection: null,
  clipboard: null,
  focusMode: false,
  rigMode: false,
  activeNodeName: null,
  rigPending: "none",
  rigNewName: null,

  activeFrame: 0,
  activeLayerId: initialDoc.layers[0].id,

  onionSkin: false,
  onionRange: 1,
  showGrid: true,
  playing: false,

  agentConnected: false,
  agentCursor: null,
  agentPolicy: DEFAULT_POLICY,
  agentLog: [],
  agentRequest: null,

  toast: null,

  bump: () => set((s) => ({ version: s.version + 1 })),

  setDoc: (doc) =>
    set((s) => ({
      doc,
      version: s.version + 1,
      activeFrame: 0,
      activeLayerId: doc.layers[0]?.id ?? "",
      playing: false,
      // yeni belgede eski seçim anlamsız (hatta boyut dışında olabilir)
      selection: null,
    })),

  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool }),
  setPrimary: (primary) => set({ primary }),
  setSecondary: (secondary) => set({ secondary }),
  swapColors: () => set((s) => ({ primary: s.secondary, secondary: s.primary })),
  setPaletteId: (paletteId) => set({ paletteId }),
  patch: (p) => set(p as Partial<EditorState>),

  setZoom: (z) => set({ zoom: Math.max(1, Math.min(64, z)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),

  setSelection: (selection) => set({ selection }),
  setClipboard: (clipboard) => set({ clipboard }),
  /**
   * Odak modu ile iskelet modu BİRBİRİNİ DIŞLIYOR.
   * İkisi birlikte açıkken çıkmaz bir durum oluşuyordu: odak modu sağ paneli
   * gizliyor, ama iskelet paneli tam orada — banner "iskelet modu açık" diyor
   * ve kullanıcı parça ekleyemiyor, kutu çizemiyor, ara kare üretemiyor.
   * Odak modu "sadece çiz", iskelet modu "yapıyı düzenle"; aynı anda anlamlı değil.
   */
  setFocusMode: (focusMode) =>
    set(focusMode ? { focusMode: true, rigMode: false, rigPending: "none", rigNewName: null } : { focusMode: false }),

  // moddan çıkarken bekleyen işi de temizle — yarım kalmış "kutu çiz" kalmasın
  setRigMode: (on) =>
    set(
      on
        ? { rigMode: true, focusMode: false }
        : { rigMode: false, rigPending: "none", rigNewName: null },
    ),
  setActiveNode: (activeNodeName) => set({ activeNodeName }),
  setRigPending: (rigPending, newName = null) =>
    set({ rigPending, rigNewName: rigPending === "place" ? newName : null }),

  // aynı pikselde tekrar set etmeyiz — çizim sırasında gereksiz render olmasın
  setCursor: (p) =>
    set((s) => {
      const c = s.cursor;
      if (p === null) return c === null ? {} : { cursor: null };
      if (c && c.x === p.x && c.y === p.y) return {};
      return { cursor: p };
    }),

  setActiveFrame: (i) => {
    const { doc } = get();
    const max = doc.frames.length - 1;
    set({ activeFrame: Math.max(0, Math.min(i, max)) });
  },
  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),

  pushAgentLog: (text, denied) =>
    set((s) => ({
      agentLog: [
        ...s.agentLog.slice(-(AGENT_LIMITS.maxLogEntries - 1)),
        { id: ++logSeq, text, at: Date.now(), denied },
      ],
    })),
  setAgentConnected: (agentConnected) => set({ agentConnected }),
  setAgentCursor: (c) => set({ agentCursor: c ? { ...c, at: Date.now() } : null }),
  setAgentPolicy: (agentPolicy) => set({ agentPolicy }),
  setAgentScope: (scope, on) =>
    set((s) => ({
      agentPolicy: { ...s.agentPolicy, scopes: { ...s.agentPolicy.scopes, [scope]: on } },
      agentRequest: s.agentRequest?.scope === scope ? null : s.agentRequest,
    })),
  setAgentEnabled: (on) =>
    set((s) => ({
      agentPolicy: { ...s.agentPolicy, enabled: on },
      agentConnected: on ? s.agentConnected : false,
      agentRequest: on ? s.agentRequest : null,
      agentCursor: on ? s.agentCursor : null,
    })),

  // aynı kapsam için üst üste istek gelirse tek satır kalsın
  requestAgentScope: (scope, call) =>
    set((s) =>
      s.agentRequest?.scope === scope
        ? {}
        : { agentRequest: { id: ++reqSeq, scope, call, at: Date.now() } },
    ),
  clearAgentRequest: () => set({ agentRequest: null }),

  showToast: (toast) => set({ toast }),
}));
