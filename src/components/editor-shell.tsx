"use client";

/**
 * Nibble — editör kabuğu
 *
 * Üst bar · araç rayı · sahne · sağ paneller · zaman şeridi · durum çubuğu ·
 * ajan şeridi. Buradaki her bileşen store'a ALAN BAZLI abone; tek bir
 * `useEditor()` çağrısı tüm ağacı her fırça darbesinde render ettirirdi.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CanvasStage from "./canvas-stage";
import Icon, { type IconName } from "./icon";
import Timeline from "./timeline";
import { LayersPanel, PalettePanel, ToolOptions } from "./panels";
import RigPanel from "./rig-panel";
import { AgentDialog, AgentTicker } from "./agent-panel";
import { HelpDialog, Onboarding } from "./help";
import { ExportDialog, ImportDialog, NewProjectDialog, StorageDialog } from "./dialogs";
import { installAgentApi } from "@/lib/agent-api";
import { AutosaveController } from "@/lib/autosave";
import {
  clearSelection,
  copySelection,
  cutSelection,
  pasteClip,
} from "@/lib/selection-ops";
import { normalisePolicy } from "@/lib/agent-policy";
import { useEditor } from "@/lib/editor-store";
import { deserializeProject } from "@/lib/exporters";
import { setLang, useLang, useT } from "@/lib/i18n";
import { PixelDocument } from "@/lib/pixel-document";
import {
  loadProject,
  loadSettings,
  requestPersist,
  saveProject,
  saveSettings,
} from "@/lib/storage";
import type { Project, ToolId } from "@/lib/types";

type DialogId = "new" | "import" | "storage" | "agent" | "export" | "help" | "tour";

const TOOLS: { id: ToolId; icon: IconName; key: string }[] = [
  { id: "select", icon: "select", key: "M" },
  { id: "pen", icon: "pen", key: "B" },
  { id: "eraser", icon: "eraser", key: "E" },
  { id: "fill", icon: "fill", key: "G" },
  { id: "eyedropper", icon: "eyedropper", key: "I" },
  { id: "line", icon: "line", key: "L" },
  { id: "rect", icon: "rect", key: "U" },
  { id: "ellipse", icon: "ellipse", key: "O" },
  { id: "pan", icon: "pan", key: "H" },
];

/* ────────── araç rayı ────────── */
function ToolRail({ onHelp }: { onHelp: () => void }) {
  const t = useT();
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const rigMode = useEditor((s) => s.rigMode);
  const setRigMode = useEditor((s) => s.setRigMode);
  return (
    <div className="rail">
      {TOOLS.map((x) => (
        <button
          key={x.id}
          className="tool"
          aria-pressed={tool === x.id}
          aria-label={t.tools[x.id]}
          title={`${t.tools[x.id]} (${x.key}): ${t.toolHelp[x.id]}`}
          onClick={() => setTool(x.id)}
        >
          <Icon name={x.icon} />
          <span className="kbd">{x.key}</span>
        </button>
      ))}
      {/*
        İskelet ayrı bir "araç" değil, bir MOD — o yüzden araçlardan çizgiyle
        ayrılıyor. Araçların arasına koysaydık "kalem yerine iskelet seçtim"
        gibi okunurdu; iskelet çizim yapmaz, parçaları taşır.
      */}
      <span className="rail-sep" />
      <button
        className="tool"
        aria-pressed={rigMode}
        title={`${t.rig.mode} (R): ${t.rig.lead}`}
        aria-label={t.rig.mode}
        onClick={() => setRigMode(!rigMode)}
      >
        <Icon name="rig" />
        <span className="kbd">R</span>
      </button>
      <span style={{ flex: 1 }} />
      <button className="tool" title={t.top.help} aria-label={t.top.help} onClick={onHelp}>
        <Icon name="help" />
      </button>
    </div>
  );
}

/* ────────── üst bar ────────── */
function TopBar({ open }: { open: (d: DialogId) => void }) {
  const t = useT();
  const lang = useLang();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const bump = useEditor((s) => s.bump);
  const focusMode = useEditor((s) => s.focusMode);
  const setFocusMode = useEditor((s) => s.setFocusMode);
  const [name, setName] = useState(doc.project.name);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  void version;

  useEffect(() => setName(doc.project.name), [doc]);

  // tema tercihi ayarlardan gelir; yoksa koyu. State'i senkron tutmazsak
  // ilk tıklama "zaten açık olan"ı seçer ve hiçbir şey değişmez.
  useEffect(() => {
    setTheme(loadSettings().theme === "light" ? "light" : "dark");
  }, []);

  const undoLabel = doc.undoLabel();

  return (
    <div className="topbar">
      <Link className="brand" href="/" title={t.top.home}>
        <span className="mark" aria-hidden>
          <i />
          <i />
          <i />
          <i className="bite" />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        NIBBLE
      </Link>

      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          doc.project.name = e.target.value;
          // notify olmadan otomatik kayıt tetiklenmez ve ad değişikliği kaybolur
          doc.notify("structure");
        }}
        placeholder={t.dialogs.untitled}
        style={{ width: 130 }}
        aria-label={t.top.projectName}
        title={t.top.projectName}
      />

      <button className="btn" onClick={() => open("new")}>
        {t.top.new}
      </button>
      <button className="btn" onClick={() => open("import")} title={t.dialogs.importTitle}>
        <Icon name="image" size={12} /> {t.top.image}
      </button>
      <button className="btn" onClick={() => open("storage")} title={t.dialogs.storageTitle}>
        <Icon name="folder" size={12} /> {t.top.drafts}
      </button>

      <span style={{ flex: 1 }} />

      <button
        className="btn"
        disabled={!doc.canUndo()}
        onClick={() => {
          doc.undo();
          bump();
        }}
        aria-label={t.top.undo}
        title={
          doc.canUndo()
            ? `${t.top.undo}${undoLabel ? `: ${undoLabel}` : ""} (Ctrl+Z)`
            : t.top.nothingToUndo
        }
      >
        <Icon name="undo" size={13} />
      </button>
      <button
        className="btn"
        disabled={!doc.canRedo()}
        onClick={() => {
          doc.redo();
          bump();
        }}
        aria-label={t.top.redo}
        title={doc.canRedo() ? `${t.top.redo} (Ctrl+Shift+Z)` : t.top.nothingToRedo}
      >
        <Icon name="redo" size={13} />
      </button>

      <button
        className="btn"
        onClick={() => setLang(lang === "tr" ? "en" : "tr")}
        title={t.meta.switch}
        aria-label={t.meta.switch}
      >
        {lang === "tr" ? "EN" : "TR"}
      </button>

      <button
        className="btn"
        onClick={() => {
          /**
           * Sonraki temayı DOM'dan okuyoruz, React state'inden değil.
           * State'e güvenirsek iki kaynak (state + data-theme) senkronsuz
           * kalabiliyor: aynı tick'te iki tıklama ya da temayı başka bir yerden
           * değiştirmek state'i eskitir ve düğme yanlış yöne basar.
           * data-theme tek doğruluk kaynağı; state sadece ikon için.
           */
          const current = document.documentElement.getAttribute("data-theme");
          const next = current === "light" ? "dark" : "light";
          document.documentElement.setAttribute("data-theme", next);
          setTheme(next);
          saveSettings({ theme: next });
        }}
        title={`${t.common.theme}: ${theme === "light" ? t.common.light : t.common.dark}`}
        aria-label={t.common.theme}
        aria-pressed={theme === "light"}
      >
        {/* ikon MEVCUT temayı gösteriyor — düğmenin ne yapacağını başlık söylüyor */}
        <Icon name={theme === "light" ? "sun" : "moon"} size={13} />
      </button>

      <button
        className={`btn${focusMode ? " active" : ""}`}
        aria-pressed={focusMode}
        onClick={() => setFocusMode(!focusMode)}
        title={focusMode ? t.top.focusOff : t.top.focus}
        aria-label={focusMode ? t.top.focusOff : t.top.focus}
      >
        ⛶
      </button>

      <button className="btn" onClick={() => open("help")} title={t.top.help} aria-label={t.top.help}>
        <Icon name="help" size={13} />
      </button>

      <button className="btn primary" onClick={() => open("export")}>
        <Icon name="download" size={12} /> {t.top.export}
      </button>
    </div>
  );
}

/**
 * Odak modunun yüzen palet şeridi.
 *
 * Planın "yüzen rampalar" fikri: paneller gizliyken renk seçmenin bir yolu
 * kalmalı. Radyal menü yapmadık — sağ tık ikincil renge bağlı ve radyal menü
 * o temel etkileşimi ezerdi; şerit aynı işi kırmadan yapıyor.
 */
function FloatingPalette() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const primary = useEditor((s) => s.primary);
  const secondary = useEditor((s) => s.secondary);
  const setPrimary = useEditor((s) => s.setPrimary);
  const setSecondary = useEditor((s) => s.setSecondary);
  const swap = useEditor((s) => s.swapColors);
  void version;

  return (
    <div className="floating-palette" title={t.palette.pairTitle}>
      <button className="pair" onClick={swap} title={t.palette.swapTitle} aria-label={t.palette.swap}>
        <i style={{ background: primary }} />
        <i style={{ background: secondary }} />
      </button>
      <div className="strip">
        {doc.project.palette.map((c, i) => (
          <button
            key={`${c}-${i}`}
            style={{ background: c }}
            aria-pressed={c.toLowerCase() === primary.toLowerCase()}
            aria-label={c}
            title={c}
            onClick={() => setPrimary(c)}
            onContextMenu={(e) => {
              e.preventDefault();
              setSecondary(c);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ────────── durum çubuğu ────────── */
function StatusBar() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const zoom = useEditor((s) => s.zoom);
  const cursor = useEditor((s) => s.cursor);
  const tool = useEditor((s) => s.tool);
  const rigMode = useEditor((s) => s.rigMode);
  const activeFrame = useEditor((s) => s.activeFrame);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const requestFit = useEditor((s) => s.requestFit);
  void version;

  const layer = doc.layer(activeLayerId);
  const inside =
    cursor && cursor.x >= 0 && cursor.y >= 0 && cursor.x < doc.width && cursor.y < doc.height;

  return (
    <div className="statusbar">
      <span className="pos">
        {cursor ? (inside ? `${cursor.x}, ${cursor.y}` : t.status.outside) : "-"}
      </span>
      <span className="vrule" />
      <span>
        {t.status.canvas} {doc.width}×{doc.height}
      </span>
      <span className="vrule" />
      <button className="linkish" onClick={requestFit} title={t.status.fit}>
        {t.status.zoom} {Math.round(zoom * 100)}%
      </button>
      <span className="vrule" />
      <span>
        {t.status.layer} <b>{layer?.name ?? "-"}</b>
        {layer?.locked ? " 🔒" : ""}
        {layer && !layer.visible ? ` (${t.common.off})` : ""}
      </span>
      <span className="vrule" />
      <span>
        {t.status.frame} {activeFrame + 1}/{doc.frames.length}
      </span>
      <span style={{ flex: 1 }} />
      <span className="tip">{rigMode ? t.rig.modeOn : t.toolHelp[tool]}</span>
    </div>
  );
}

/* ────────── ana bileşen ────────── */
export default function Editor() {
  const t = useT();
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const toast = useEditor((s) => s.toast);
  const playing = useEditor((s) => s.playing);
  const doc = useEditor((s) => s.doc);
  const rigMode = useEditor((s) => s.rigMode);
  const focusMode = useEditor((s) => s.focusMode);
  const agentEnabled = useEditor((s) => s.agentPolicy.enabled);
  const agentPolicy = useEditor((s) => s.agentPolicy);

  const close = useCallback(() => setDialog(null), []);

  /**
   * Ajan API'si yalnızca izin verildiğinde kurulur. Kullanıcı "bağlantıyı kes"
   * derse effect temizleyicisi window.nibble'ı gerçekten siler — şalter
   * kozmetik değil.
   */
  useEffect(() => {
    if (!agentEnabled) return;
    return installAgentApi();
  }, [agentEnabled]);

  // izinler değiştikçe diske yaz
  useEffect(() => {
    saveSettings({ agentPolicy: { enabled: agentPolicy.enabled, scopes: agentPolicy.scopes } });
  }, [agentPolicy]);

  /**
   * Otomatik kayıt denetleyicisi bileşen ömrü boyunca TEK — belge başına
   * yeniden kurulmuyor. Eskiden `[doc, t]` effect'i her belge değişiminde (ve
   * dil değişiminde) bekleyen kaydı iptal ediyordu; ayrıntı lib/autosave.ts.
   */
  const [initialDoc] = useState(() => useEditor.getState().doc);
  // hata mesajı güncel dilde çıksın ama dil değişimi kaydediciyi yeniden kurmasın
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [autosave] = useState(
    () =>
      new AutosaveController<Project>({
        persist: async (project) => {
          // lastProjectId senkron (localStorage) ve IndexedDB yazımından ÖNCE:
          // sayfa yazım sırasında öldürülse bile doğru projeyi işaret etsin
          // (projenin önceki kaydı zaten orada)
          saveSettings({ lastProjectId: project.id });
          await saveProject(project);
        },
        onError: () => useEditor.getState().showToast(tRef.current.dialogs.saveFailed),
      }),
  );

  // ilk açılış: kalıcı depolama izni, ayarlar, son proje, rehber
  useEffect(() => {
    void requestPersist();
    const st = loadSettings();
    if (st.theme === "light") document.documentElement.setAttribute("data-theme", "light");

    useEditor.getState().patch({
      ...(st.onionSkin ? { onionSkin: true } : {}),
      ...(typeof st.showGrid === "boolean" ? { showGrid: st.showGrid } : {}),
    });
    useEditor.getState().setAgentPolicy(normalisePolicy(st.agentPolicy));

    // Geri yükleme bitene kadar (başarılı ya da değil) otomatik kayıt diske
    // yazmıyor: yoksa yükleme sürerken boş başlangıç belgesi kaydedilip
    // lastProjectId'nin üzerine yazılıyordu ve sonraki açılışta tuval boştu.
    let cancelled = false;
    if (st.lastProjectId) {
      loadProject(st.lastProjectId)
        .then((p) => {
          if (cancelled) return;
          if (p && p.frames?.length) useEditor.getState().setDoc(new PixelDocument(p));
        })
        .catch(() => {
          /* okunamadı — boş tuvalle devam, kullanıcı çizince kaydedilir */
        })
        .finally(() => {
          if (!cancelled) autosave.markReady();
        });
    } else {
      autosave.markReady();
    }
    if (!st.tourSeen) setDialog("tour");
    return () => {
      cancelled = true;
    };
  }, [autosave]);

  // Belge değişince denetleyiciyi ona bağla — önceki belgenin bekleyen kaydı
  // bağlanmadan ÖNCE yazılır. Başlangıçtaki dokunulmamış boş belge kirli
  // sayılmıyor (diske boş proje yazılmasın); diğer her belge (Yeni, taslak,
  // .nibble, geri yüklenen) hemen kaydedilir ve lastProjectId ona döner.
  useEffect(() => {
    autosave.attach(doc, { dirty: doc !== initialDoc });
  }, [autosave, doc, initialDoc]);

  // sekme gizlenince / sayfa kapanırken bekleyeni hemen yaz; sökülürken de
  useEffect(() => {
    const flush = () => autosave.flush();
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      autosave.detach();
    };
  }, [autosave]);

  // oynatma döngüsü
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const s = useEditor.getState();
      acc += now - last;
      last = now;
      const dur = Math.max(20, (s.doc.frames[s.activeFrame]?.durationCs ?? 10) * 10);
      if (acc >= dur) {
        acc = 0;
        s.patch({ activeFrame: (s.activeFrame + 1) % s.doc.frames.length });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // toast otomatik kapanış
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useEditor.getState().showToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  // klavye kısayolları — Aseprite uyumlu (kas hafızası önemli)
  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      /**
       * Modal açıkken editör kısayolları çalışmasın.
       * Escape iki kez işleniyordu: Dialog kendi dinleyicisiyle kapanıyor, bu
       * dinleyici de aynı tuşla seçimi siliyordu (aynı hedefteki iki dinleyici
       * arasında stopPropagation işe yaramaz). Ayrıca diyalog açıkken B/E/G
       * ile araç değişmesi de istenmeyen bir davranış.
       */
      if (document.querySelector(".scrim")) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.doc.redo();
        else s.doc.undo();
        s.bump();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.doc.redo();
        s.bump();
        return;
      }

      // ── seçim kısayolları ──
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        s.setSelection({ x: 0, y: 0, w: s.doc.width, h: s.doc.height });
        s.setTool("select");
        return;
      }
      if (mod && ["c", "x", "v"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === "v") {
          if (!s.clipboard) {
            s.showToast(t.selection.clipboardEmpty);
            return;
          }
          const res = pasteClip(
            s.doc,
            s.clipboard,
            s.activeFrame,
            s.activeLayerId,
            s.selection ? { x: s.selection.x, y: s.selection.y } : undefined,
            t.selection.paste,
          );
          if (res.ok && res.rect) {
            s.setSelection(res.rect);
            s.setTool("select");
            s.bump();
            s.showToast(t.selection.pastedToast);
          } else s.showToast(res.error ?? "?");
          return;
        }
        if (!s.selection) {
          s.showToast(t.selection.none);
          return;
        }
        const res =
          k === "c"
            ? copySelection(s.doc, s.selection, s.activeFrame, s.activeLayerId)
            : cutSelection(s.doc, s.selection, s.activeFrame, s.activeLayerId, t.selection.cut);
        if (res.ok && res.clip) {
          s.setClipboard(res.clip);
          s.bump();
          s.showToast(k === "c" ? t.selection.copiedToast : t.selection.cutToast);
        } else s.showToast(res.error ?? "?");
        return;
      }
      if (mod) return;

      if (e.key === "Escape" && s.selection) {
        s.setSelection(null);
        return;
      }

      switch (e.key) {
        case "b": case "B": s.setTool("pen"); break;
        case "e": case "E": s.setTool("eraser"); break;
        case "g": case "G": s.setTool("fill"); break;
        case "i": case "I": s.setTool("eyedropper"); break;
        case "l": case "L": s.setTool("line"); break;
        case "u": case "U": s.setTool("rect"); break;
        case "o": case "O": s.setTool("ellipse"); break;
        case "h": case "H": s.setTool("pan"); break;
        case "m": case "M": s.setTool("select"); break;
        case "x": case "X": s.swapColors(); break;
        case "r": case "R": s.setRigMode(!s.rigMode); break;
        case "f": case "F": s.setFocusMode(!s.focusMode); break;
        case "?": setDialog((d) => (d === "help" ? null : "help")); break;
        case ",": e.preventDefault(); s.setActiveFrame(s.activeFrame - 1); break;
        case ".": e.preventDefault(); s.setActiveFrame(s.activeFrame + 1); break;
        case "+": case "=": s.setZoom(s.zoom * 1.25); break;
        case "-": case "_": s.setZoom(s.zoom / 1.25); break;
        case "Enter": e.preventDefault(); s.togglePlay(); break;
        case " ":
          e.preventDefault();
          if (s.quickPanTool !== "pan") s.patch({ quickPanTool: "pan" });
          break;
        case "Delete": case "Backspace": {
          // seçim varsa sadece onun içini temizle — tüm kareyi silmek sürpriz olurdu
          if (s.selection) {
            const res = clearSelection(
              s.doc,
              s.selection,
              s.activeFrame,
              s.activeLayerId,
              t.selection.clear,
            );
            if (!res.ok) s.showToast(res.error ?? "?");
            s.bump();
            break;
          }
          const frame = s.doc.project.frames[s.activeFrame];
          if (frame) {
            s.doc.run(t.common.delete, () => s.doc.clearCel(frame.id, s.activeLayerId));
            s.bump();
          }
          break;
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") useEditor.getState().patch({ quickPanTool: null });
    };
    // pencere odağı kaçarsa Space basılı kalmasın
    const blur = () => useEditor.getState().patch({ quickPanTool: null });

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [t]);

  // .nibble dosyasını sürükle-bırak ile aç
  useEffect(() => {
    const onDrop = async (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (f.name.endsWith(".nibble")) {
        e.preventDefault();
        try {
          // deserializeProject artık doğruluyor ve neyin bozuk olduğunu
          // söylüyor; mesajı gösteriyoruz — "dışa aktarım başarısız" demek
          // hem yanlış hem de kullanıcıya hiçbir şey anlatmıyordu
          const p = deserializeProject(await f.text());
          useEditor.getState().setDoc(new PixelDocument(p));
          useEditor.getState().showToast(`${p.name || f.name} ✓`);
        } catch (err) {
          const why = err instanceof Error ? err.message : "";
          useEditor.getState().showToast(`${t.dialogs.fileBroken}${why ? `: ${why}` : ""}`);
        }
      } else if (f.type.startsWith("image/")) {
        // görsel bırakıldıysa dönüştürücüyü aç — kullanıcı ne yapacağını sormasın
        e.preventDefault();
        setDialog("import");
      }
    };
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", onDrop);
    };
  }, [t]);

  return (
    <div className={`app${focusMode ? " focus" : ""}`}>
      {/* Ekran okuyucu ve tarayıcılar için sayfa başlığı; görsel başlık üst bardaki logo. */}
      <h1 className="sr-only">Nibble pixel art editor</h1>
      <TopBar open={setDialog} />
      <div className="main">
        <ToolRail onHelp={() => setDialog("help")} />
        <CanvasStage />
        {/*
          Katmanlar kendi bölgesinde duruyor: hepsini tek akışa koyduğumuzda
          palet + araç ayarları ekranı doldurup katman listesini görünmez
          yapıyordu ve "çiziyorum ama bir şey çıkmıyor" hatasının kaynağı
          (gizli/kilitli katman) tam da orada görünüyor.
        */}
        {!focusMode && (
        <div className="side">
          <div className="side-scroll">
            {rigMode ? (
              <RigPanel />
            ) : (
              <>
                <PalettePanel />
                <ToolOptions />
              </>
            )}
          </div>
          <LayersPanel />
        </div>
        )}
      </div>
      {focusMode ? (
        <FloatingPalette />
      ) : (
        <>
          <StatusBar />
          <Timeline />
          <AgentTicker onOpen={() => setDialog("agent")} />
        </>
      )}

      {dialog === "new" && <NewProjectDialog onClose={close} />}
      {dialog === "import" && <ImportDialog onClose={close} />}
      {dialog === "storage" && <StorageDialog onClose={close} />}
      {dialog === "agent" && <AgentDialog onClose={close} />}
      {dialog === "export" && <ExportDialog onClose={close} />}
      {dialog === "help" && <HelpDialog onClose={close} />}
      {dialog === "tour" && <Onboarding onClose={close} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
