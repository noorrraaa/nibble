"use client";

/** Nibble — Yeni proje · Resim aktarma · Taslaklar · Dışa aktarım diyalogları */

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./icon";
import { Dialog, Segmented, Slider } from "./ui";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/editor-store";
import { blankProject, PixelDocument } from "@/lib/pixel-document";
import {
  exportApng,
  exportGif,
  exportPng,
  exportProjectFile,
  exportSpriteSheet,
} from "@/lib/exporters";
import { fileToDataUrl, imageToPixels, loadImage } from "@/lib/image-to-pixels";
import { PALETTES, paletteById } from "@/lib/palettes";
import { MAX_CANVAS_SIDE } from "@/lib/types";
import {
  clearAllData,
  deleteProject,
  formatBytes,
  listProjects,
  loadProject,
  saveSettings,
  storageEstimate,
  type ProjectSummary,
} from "@/lib/storage";

/* ────────── yeni proje ────────── */
export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const paletteId = useEditor((s) => s.paletteId);
  const setDoc = useEditor((s) => s.setDoc);
  const setPaletteId = useEditor((s) => s.setPaletteId);
  const setPrimary = useEditor((s) => s.setPrimary);

  const [w, setW] = useState(32);
  const [h, setH] = useState(32);
  const [pid, setPid] = useState(paletteId);
  const [name, setName] = useState("");

  const create = () => {
    const pal = paletteById(pid) ?? PALETTES[0];
    const doc = new PixelDocument(
      blankProject(
        Math.max(1, Math.min(MAX_CANVAS_SIDE, w || 1)),
        Math.max(1, Math.min(MAX_CANVAS_SIDE, h || 1)),
        pal.colors,
        name.trim(),
      ),
    );
    setDoc(doc);
    setPaletteId(pal.id);
    setPrimary(pal.colors[Math.min(2, pal.colors.length - 1)]);
    onClose();
  };

  return (
    <Dialog
      title={t.dialogs.newTitle}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn primary" onClick={create}>
            {t.common.create}
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          {t.dialogs.name}
          <input
            type="text"
            value={name}
            placeholder={t.dialogs.untitled}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />
        </label>
      </div>

      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {[16, 32, 64, 128].map((n) => (
          <button
            key={n}
            className={`btn${w === n && h === n ? " active" : ""}`}
            aria-pressed={w === n && h === n}
            onClick={() => {
              setW(n);
              setH(n);
            }}
          >
            {n}×{n}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field">
          {t.dialogs.width}
          <input
            type="number"
            min={1}
            max={MAX_CANVAS_SIDE}
            value={w}
            onChange={(e) => setW(+e.target.value)}
            style={{ width: 70 }}
          />
        </label>
        <label className="field">
          {t.dialogs.height}
          <input
            type="number"
            min={1}
            max={MAX_CANVAS_SIDE}
            value={h}
            onChange={(e) => setH(+e.target.value)}
            style={{ width: 70 }}
          />
        </label>
      </div>

      <label className="field">
        {t.dialogs.paletteLabel}
        <select value={pid} onChange={(e) => setPid(e.target.value)} style={{ flex: 1 }}>
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.colors.length}
            </option>
          ))}
        </select>
      </label>

      <p className="hint" style={{ marginTop: 12 }}>
        {t.dialogs.presetHint}
      </p>
      <p className="hint" style={{ marginTop: 8, color: "var(--gold)" }}>
        {t.dialogs.replaceWarn}
      </p>
    </Dialog>
  );
}

/* ────────── resimden pixel art ────────── */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const activeFrame = useEditor((s) => s.activeFrame);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const bump = useEditor((s) => s.bump);
  const showToast = useEditor((s) => s.showToast);
  const setSelection = useEditor((s) => s.setSelection);
  const primary = useEditor((s) => s.primary);
  const setPrimary = useEditor((s) => s.setPrimary);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [size, setSize] = useState(64);
  const [mode, setMode] = useState<string>("auto");
  const [dither, setDither] = useState(true);
  const [removeBg, setRemoveBg] = useState(false);
  const [over, setOver] = useState(false);
  const outRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ w: number; h: number; colors: number } | null>(null);

  const paletteFor = useCallback(
    () =>
      mode === "auto"
        ? undefined
        : mode === "current"
          ? doc.project.palette
          : paletteById(mode)?.colors,
    [mode, doc],
  );

  const render = useCallback(() => {
    if (!img) return;
    const res = imageToPixels(img, {
      size,
      palette: paletteFor(),
      dither,
      removeBackground: removeBg,
    });
    const cv = outRef.current;
    if (cv) {
      cv.width = res.width;
      cv.height = res.height;
      cv.getContext("2d")!.putImageData(
        new ImageData(new Uint8ClampedArray(res.data), res.width, res.height),
        0,
        0,
      );
    }
    setResult({ w: res.width, h: res.height, colors: res.palette.length });
  }, [img, size, dither, removeBg, paletteFor]);

  useEffect(() => {
    render();
  }, [render]);

  const take = async (file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = await fileToDataUrl(file);
    setSrcUrl(url);
    setImg(await loadImage(url));
  };

  const apply = () => {
    if (!img) return;
    const res = imageToPixels(img, {
      size,
      palette: paletteFor(),
      dither,
      removeBackground: removeBg,
    });
    const frame = doc.project.frames[activeFrame];
    if (!frame) return; // kare listesi altımızdan değişmişse (ajan sildi vb.)
    // resize + writeCel TEK geçmiş adımı olsun diye run() içinde
    doc.run(t.dialogs.importedToast, () => {
      if (res.width !== doc.width || res.height !== doc.height) {
        doc.resize(res.width, res.height);
        setSelection(null); // eski seçim yeni tuvalde geçersiz
      }
      doc.writeCel(frame.id, activeLayerId, res.data);
    });
    if (mode === "auto") {
      doc.setPalette(res.palette);
      setPrimary(res.palette[Math.floor(res.palette.length / 2)] ?? primary);
    }
    bump();
    showToast(`${t.dialogs.importedToast}: ${res.width}×${res.height}, ${res.palette.length} ${t.common.colors}`);
    onClose();
  };

  return (
    <Dialog
      title={t.dialogs.importTitle}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn primary" disabled={!img} onClick={apply}>
            {t.dialogs.toCanvas}
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <span className="hint">{t.dialogs.size}</span>
        <Segmented
          label={t.dialogs.size}
          value={size}
          onChange={setSize}
          options={[16, 32, 64, 128].map((n) => ({ value: n, label: String(n) }))}
        />
        <span className="hint" style={{ marginLeft: 8 }}>
          {t.dialogs.dither}
        </span>
        <Segmented
          label={t.dialogs.dither}
          value={dither}
          onChange={setDither}
          options={[
            { value: true, label: t.dialogs.on },
            { value: false, label: t.dialogs.off },
          ]}
        />
      </div>

      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          {t.dialogs.paletteLabel}
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ flex: 1 }}>
            <option value="auto">{t.dialogs.autoPalette}</option>
            <option value="current">{t.dialogs.currentPalette}</option>
            {PALETTES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <input
            type="checkbox"
            checked={removeBg}
            onChange={(e) => setRemoveBg(e.target.checked)}
          />
          {t.dialogs.removeBg}
        </label>
      </div>

      <div className="grid-2">
        <div
          className={`drop ${over ? "over" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files[0]);
          }}
        >
          {srcUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={srcUrl} alt={t.dialogs.source} />
          ) : (
            <p>{t.dialogs.dragDrop}</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void take(e.target.files?.[0])}
          />
        </div>
        <div className="drop" style={{ cursor: "default" }}>
          {img ? <canvas ref={outRef} /> : <p>{t.dialogs.result}</p>}
        </div>
      </div>

      {result && (
        <p className="hint" style={{ marginTop: 10 }}>
          {result.w}×{result.h} · {result.colors} {t.common.colors}. {t.dialogs.convertHint}
        </p>
      )}
    </Dialog>
  );
}

/* ────────── taslaklar / depolama ────────── */
export function StorageDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const setDoc = useEditor((s) => s.setDoc);
  const showToast = useEditor((s) => s.showToast);

  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async () => {
    setItems(await listProjects().catch(() => []));
    setEst(await storageEstimate());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pct = est && est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;

  return (
    <Dialog
      title={t.dialogs.storageTitle}
      onClose={onClose}
      footer={
        confirming ? (
          <>
            <button className="btn" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </button>
            <button
              className="btn primary danger"
              onClick={async () => {
                await clearAllData();
                await refresh();
                setConfirming(false);
                showToast(t.dialogs.clearedToast);
              }}
            >
              {t.dialogs.confirmClear}
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => setConfirming(true)}>
            <Icon name="trash" size={11} /> {t.dialogs.clearAll}
          </button>
        )
      }
    >
      <p className="hint" style={{ marginBottom: 12 }}>
        {t.dialogs.storageHint}
        {est && (
          <>
            {" "}
            {t.dialogs.used}: <b>{formatBytes(est.usage)}</b>
            {est.quota ? ` / ${formatBytes(est.quota)} (%${pct.toFixed(1)})` : ""}
          </>
        )}
      </p>
      {pct > 80 && (
        <p className="hint" style={{ color: "var(--gold)", marginBottom: 12 }}>
          {t.dialogs.storageWarn}
        </p>
      )}

      {items.length === 0 ? (
        <p className="hint">{t.dialogs.noDrafts}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((p) => (
            <div key={p.id} className="row draft-row">
              <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--mono)", fontSize: 12 }}>
                {p.name || t.dialogs.untitled}{" "}
                <span className="hint">
                  {p.width}×{p.height} · {p.frameCount} {t.common.frames} · {formatBytes(p.bytes)}
                </span>
              </span>
              <button
                className="btn sm"
                onClick={async () => {
                  const proj = await loadProject(p.id);
                  if (!proj) return;
                  setDoc(new PixelDocument(proj));
                  saveSettings({ lastProjectId: proj.id });
                  onClose();
                }}
              >
                {t.common.open}
              </button>
              <button
                className="btn sm"
                aria-label={t.common.delete}
                title={t.common.delete}
                onClick={async () => {
                  await deleteProject(p.id);
                  void refresh();
                }}
              >
                <Icon name="trash" size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ────────── dışa aktarım ────────── */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const activeFrame = useEditor((s) => s.activeFrame);
  const showToast = useEditor((s) => s.showToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [scale, setScale] = useState(4);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      const stats = (await fn()) as
        | { partialAlphaPixels?: number; colors?: number; quantized?: boolean }
        | undefined;
      if (stats?.partialAlphaPixels) {
        showToast(`${stats.partialAlphaPixels} ${t.dialogs.gifPartial}`);
      } else if (stats?.quantized) {
        showToast(t.dialogs.gifQuantized);
      } else {
        showToast(t.dialogs.downloaded);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.dialogs.exportFailed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog title={t.dialogs.exportTitle} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Slider
          label={t.dialogs.pngScale}
          value={scale}
          min={1}
          max={16}
          suffix="×"
          onChange={setScale}
        />
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => void run("png", () => exportPng(doc, activeFrame, scale))}
        >
          <Icon name="download" size={12} /> {t.dialogs.pngFrame} ({doc.width * scale}×
          {doc.height * scale})
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => void run("gif", () => exportGif(doc))}
        >
          <Icon name="download" size={12} /> {t.dialogs.gifLabel} · {doc.frames.length}{" "}
          {t.common.frames} @ {doc.project.fps} fps
        </button>
        <button
          className="btn"
          disabled={!!busy}
          title={t.dialogs.apngHint}
          onClick={() => void run("apng", () => exportApng(doc))}
        >
          <Icon name="download" size={12} /> {t.dialogs.apngLabel}
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => void run("sheet", () => exportSpriteSheet(doc, undefined, 1))}
        >
          <Icon name="download" size={12} /> {t.dialogs.sheetLabel}
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => {
            exportProjectFile(doc.project);
            showToast(t.dialogs.savedProject);
          }}
        >
          <Icon name="download" size={12} /> {t.dialogs.projectFile}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 14 }}>
        {t.dialogs.exportHint}
      </p>
      <p className="hint" style={{ marginTop: 8 }}>
        {t.dialogs.apngHint}
      </p>
    </Dialog>
  );
}
