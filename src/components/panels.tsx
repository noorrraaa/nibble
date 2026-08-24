"use client";

/**
 * Nibble — sağ kolon panelleri: Palet · Araç · Katmanlar
 *
 * Hepsi alan bazlı seçicilerle store'a abone. Tüm store'a abone olsalardı
 * (`useEditor()`) her fırça darbesinde ve her kaydırma pikselinde yeniden
 * render edilirlerdi.
 */

import { useRef, useState } from "react";
import Icon from "./icon";
import { ConfirmButton, PanelHead, Segmented, Slider, useDragReorder } from "./ui";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/editor-store";
import { CUSTOM_PALETTE_ID, PALETTES, paletteById, rampsOf } from "@/lib/palettes";
import { saveSettings } from "@/lib/storage";
import {
  clearSelection,
  copySelection,
  cutSelection,
  fillSelection,
  pasteClip,
  transformSelection,
  type SelResult,
} from "@/lib/selection-ops";
import {
  hexToRgba,
  isHex,
  normaliseHex,
  type RegionTransform,
  type SymmetryMode,
} from "@/lib/types";

/* ────────── palet ────────── */
export function PalettePanel() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const primary = useEditor((s) => s.primary);
  const secondary = useEditor((s) => s.secondary);
  const paletteId = useEditor((s) => s.paletteId);
  const setPrimary = useEditor((s) => s.setPrimary);
  const setSecondary = useEditor((s) => s.setSecondary);
  const swap = useEditor((s) => s.swapColors);
  const setPaletteId = useEditor((s) => s.setPaletteId);
  const bump = useEditor((s) => s.bump);
  const showToast = useEditor((s) => s.showToast);
  void version; // palet doc'ta yaşıyor; version değişince yeniden okunsun

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ index: number; value: string } | null>(null);

  const colors = doc.project.palette;
  const def = paletteById(paletteId);
  const ramps = def && def.colors.length === colors.length ? rampsOf(def) : rampsOf({ colors });

  /**
   * Palet düzenleme ayrı bir MODA bağlı.
   * Alternatifi Alt+tık / sağ tık gibi gizli kombinasyonlardı; sağ tık zaten
   * ikincil renge bağlı ve gizli kombinasyon keşfedilmiyor. Açık bir "düzenle"
   * anahtarı hem görünür hem kazara silmeyi engelliyor.
   */
  const writePalette = (next: string[]) => {
    doc.setPalette(next);
    setPaletteId(CUSTOM_PALETTE_ID);
    bump();
  };

  const addColor = () => {
    // Birincil renk alanı serbest metin (kullanıcı yazarken engellenmemeli),
    // ama palete GİRERKEN doğrulanmak zorunda: geçersiz bir değer CSS'te
    // uygulanmıyor ve swatch bomboş çıkıyor, üstelik projeyle kaydediliyor.
    if (!isHex(primary)) {
      showToast(t.palette.badHex);
      return;
    }
    const hex = normaliseHex(primary);
    if (colors.some((c) => normaliseHex(c) === hex)) {
      showToast(t.palette.alreadyThere);
      return;
    }
    writePalette([...colors, hex]);
  };

  const removeColor = (index: number) => {
    if (colors.length <= 1) return;
    writePalette(colors.filter((_, i) => i !== index));
  };

  const commitDraft = () => {
    if (!draft) return;
    // isHex + normaliseHex: burada üçüncü bir hex regex'i vardı. Ayrı
    // doğrulayıcılar ayrı davranıyor (bu 8 haneli alfayı reddediyordu,
    // ajan tarafı kabul ediyordu) ve o fark tam olarak hata sınıfı.
    if (!isHex(draft.value)) {
      showToast(t.palette.badHex);
      setDraft(null);
      return;
    }
    const next = colors.slice();
    next[draft.index] = normaliseHex(draft.value);
    writePalette(next);
    setDraft(null);
  };

  return (
    <div className="panel">
      <PanelHead title={t.palette.title} lead={t.palette.lead}>
        <button
          className={`btn sm${editing ? " active" : ""}`}
          aria-pressed={editing}
          onClick={() => {
            setEditing(!editing);
            setDraft(null);
          }}
          title={t.palette.editHint}
        >
          {editing ? t.common.done : t.palette.edit}
        </button>
      </PanelHead>

      <div className="row" style={{ marginBottom: 10 }}>
        <div className="colorpair" title={t.palette.pairTitle}>
          <i className="p" style={{ background: primary }} />
          <i className="s" style={{ background: secondary }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="btn sm" onClick={swap} title={t.palette.swapTitle}>
            <Icon name="swap" size={12} /> {t.palette.swap}
          </button>
          <input
            type="text"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            spellCheck={false}
            aria-label={t.palette.primaryLabel}
          />
        </div>
      </div>

      <select
        value={paletteId}
        aria-label={t.dialogs.paletteLabel}
        onChange={(e) => {
          const d = paletteById(e.target.value);
          if (!d) return;
          setPaletteId(d.id);
          doc.setPalette(d.colors);
          setPrimary(d.colors[Math.min(2, d.colors.length - 1)]);
          setSecondary(d.colors[d.colors.length - 1]);
          bump();
          saveSettings({ paletteId: d.id });
        }}
        style={{ width: "100%", marginBottom: 10 }}
      >
        {paletteId === CUSTOM_PALETTE_ID && (
          <option value={CUSTOM_PALETTE_ID}>
            {t.palette.custom} · {colors.length}
          </option>
        )}
        {PALETTES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.colors.length}
          </option>
        ))}
      </select>

      {/* düzenleme modunda rampa gruplaması bozulmasın diye düz ızgaraya geçiyoruz */}
      <div className="swatches">
        {(editing ? [colors.map((_, i) => i)] : ramps).map((ramp, i) => (
          <div className="ramp" key={i}>
            {ramp.map((ci) => {
              const c = colors[ci];
              if (!c) return null;
              if (editing) {
                return (
                  <span className="sw-edit" key={ci}>
                    <button
                      className="sw"
                      style={{ background: c }}
                      aria-label={`${t.common.rename} ${c}`}
                      title={`${c} — ${t.palette.editHint}`}
                      onClick={() => setDraft({ index: ci, value: c })}
                    />
                    <button
                      className="rm"
                      aria-label={`${t.common.delete} ${c}`}
                      title={t.palette.removeColor}
                      disabled={colors.length <= 1}
                      onClick={() => removeColor(ci)}
                    >
                      ×
                    </button>
                  </span>
                );
              }
              return (
                <button
                  key={ci}
                  className="sw"
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
              );
            })}
          </div>
        ))}
      </div>

      {editing && (
        <>
          {draft && (
            <div className="row" style={{ marginTop: 8 }}>
              <i
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  background: draft.value,
                  border: "1px solid var(--line)",
                  flex: "none",
                }}
              />
              <input
                type="text"
                autoFocus
                value={draft.value}
                aria-label={t.palette.editHint}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDraft();
                  if (e.key === "Escape") setDraft(null);
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
          )}
          <div className="row" style={{ marginTop: 8, gap: 4 }}>
            <button className="btn sm" onClick={addColor} title={t.palette.addColorHint}>
              <Icon name="plus" size={11} /> {t.palette.addColor}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {t.palette.editLead}
          </p>
        </>
      )}

      {!editing && (
        <p className="hint" style={{ marginTop: 8 }}>
          {t.palette.rampsHint}
        </p>
      )}
    </div>
  );
}

/* ────────── araç ayarları ────────── */
export function ToolOptions() {
  const t = useT();
  const tool = useEditor((s) => s.tool);
  const brushSize = useEditor((s) => s.brushSize);
  const brushRound = useEditor((s) => s.brushRound);
  const pixelPerfect = useEditor((s) => s.pixelPerfect);
  const symmetry = useEditor((s) => s.symmetry);
  const shapeFilled = useEditor((s) => s.shapeFilled);
  const contiguousFill = useEditor((s) => s.contiguousFill);
  const tolerance = useEditor((s) => s.tolerance);
  const patch = useEditor((s) => s.patch);

  const isShape = tool === "rect" || tool === "ellipse";
  const paints = tool === "pen" || tool === "eraser" || tool === "line" || isShape;

  // seçim aracının kendi paneli var; fırça ayarları orada anlamsız
  if (tool === "select") return <SelectionPanel />;

  return (
    <div className="panel">
      <PanelHead title={`${t.toolOpts.title} · ${t.tools[tool]}`} lead={t.toolHelp[tool]} />

      {paints && (
        <>
          <Slider
            label={t.toolOpts.size}
            value={brushSize}
            min={1}
            max={16}
            onChange={(v) => patch({ brushSize: v })}
          />
          <div className="row">
            <Segmented
              label={t.toolOpts.size}
              value={brushRound}
              onChange={(v) => patch({ brushRound: v })}
              options={[
                { value: false, label: t.toolOpts.square },
                { value: true, label: t.toolOpts.round },
              ]}
            />
          </div>
        </>
      )}

      {(tool === "pen" || tool === "eraser") && (
        <>
          <div className="row">
            <label className="field">
              <input
                type="checkbox"
                checked={pixelPerfect}
                onChange={(e) => patch({ pixelPerfect: e.target.checked })}
              />
              {t.toolOpts.pixelPerfect}
            </label>
          </div>
          <p className="hint">{t.toolOpts.pixelPerfectHint}</p>
        </>
      )}

      {paints && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="hint" style={{ flex: 1 }}>
              {t.toolOpts.symmetry}
            </span>
            <Segmented
              label={t.toolOpts.symmetry}
              value={symmetry}
              onChange={(v) => patch({ symmetry: v as SymmetryMode })}
              options={(["none", "x", "y", "xy"] as const).map((m) => ({
                value: m as SymmetryMode,
                label: m === "none" ? t.toolOpts.none : m,
              }))}
            />
          </div>
          <p className="hint">{t.toolOpts.symmetryHint}</p>
        </>
      )}

      {isShape && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="hint" style={{ flex: 1 }}>
            {t.toolOpts.shape}
          </span>
          <Segmented
            label={t.toolOpts.shape}
            value={shapeFilled}
            onChange={(v) => patch({ shapeFilled: v })}
            options={[
              { value: false, label: t.toolOpts.hollow },
              { value: true, label: t.toolOpts.filled },
            ]}
          />
        </div>
      )}

      {tool === "fill" && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <Segmented
              label={t.toolOpts.contiguous}
              value={contiguousFill}
              onChange={(v) => patch({ contiguousFill: v })}
              options={[
                { value: true, label: t.toolOpts.contiguous },
                { value: false, label: t.toolOpts.global },
              ]}
            />
          </div>
          <p className="hint">{t.toolOpts.contiguousHint}</p>
          <Slider
            label={t.toolOpts.tolerance}
            value={tolerance}
            min={0}
            max={128}
            onChange={(v) => patch({ tolerance: v })}
          />
          <p className="hint">{t.toolOpts.toleranceHint}</p>
        </>
      )}
    </div>
  );
}

/* ────────── seçim ────────── */
function SelectionPanel() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const selection = useEditor((s) => s.selection);
  const clipboard = useEditor((s) => s.clipboard);
  const activeFrame = useEditor((s) => s.activeFrame);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const primary = useEditor((s) => s.primary);
  const setSelection = useEditor((s) => s.setSelection);
  const setClipboard = useEditor((s) => s.setClipboard);
  const bump = useEditor((s) => s.bump);
  const showToast = useEditor((s) => s.showToast);
  void version;

  /** selection-ops sonucunu tek yerde karşıla */
  const settle = (res: SelResult, okMsg?: string) => {
    if (!res.ok) {
      showToast(res.error ?? "?");
      return;
    }
    if (res.rect) setSelection(res.rect);
    if (res.clip) setClipboard(res.clip);
    bump();
    if (okMsg) showToast(okMsg);
  };

  return (
    <div className="panel">
      <PanelHead title={t.selection.title} lead={t.selection.lead} />

      {!selection ? (
        <p className="hint">{t.selection.none}</p>
      ) : (
        <>
          <p className="hint">
            {t.selection.size} {selection.w}×{selection.h} · {t.selection.at} {selection.x},
            {selection.y}
          </p>

          <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            <button
              className="btn sm"
              onClick={() =>
                settle(
                  copySelection(doc, selection, activeFrame, activeLayerId),
                  t.selection.copiedToast,
                )
              }
            >
              {t.selection.copy}
            </button>
            <button
              className="btn sm"
              onClick={() =>
                settle(
                  cutSelection(doc, selection, activeFrame, activeLayerId, t.selection.cut),
                  t.selection.cutToast,
                )
              }
            >
              {t.selection.cut}
            </button>
            <button
              className="btn sm"
              onClick={() => settle(clearSelection(doc, selection, activeFrame, activeLayerId, t.selection.clear))}
            >
              {t.selection.clear}
            </button>
          </div>

          <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            <span className="hint" style={{ width: "100%" }} title={t.selection.lossless}>
              {t.selection.lossless}
            </span>
            {(
              [
                ["flipX", t.selection.flipX],
                ["flipY", t.selection.flipY],
                ["rotate90", t.selection.rotate90],
                ["rotate180", t.selection.rotate180],
              ] as [RegionTransform, string][]
            ).map(([op, label]) => (
              <button
                key={op}
                className="btn sm"
                onClick={() =>
                  settle(
                    transformSelection(doc, selection, op, activeFrame, activeLayerId, label),
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            <button
              className="btn sm"
              onClick={() =>
                settle(
                  fillSelection(
                    doc,
                    selection,
                    hexToRgba(primary),
                    activeFrame,
                    activeLayerId,
                    t.selection.fill,
                  ),
                )
              }
            >
              <i
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  background: primary,
                  border: "1px solid rgba(0,0,0,.4)",
                  display: "inline-block",
                }}
              />
              {t.selection.fill}
            </button>
            <button className="btn sm" onClick={() => setSelection(null)}>
              {t.selection.deselect}
            </button>
          </div>
        </>
      )}

      <div className="row" style={{ gap: 4, marginTop: 10, flexWrap: "wrap" }}>
        <button
          className="btn sm"
          onClick={() => setSelection({ x: 0, y: 0, w: doc.width, h: doc.height })}
        >
          {t.selection.selectAll}
        </button>
        <button
          className="btn sm"
          disabled={!clipboard}
          title={clipboard ? t.selection.paste : t.selection.clipboardEmpty}
          onClick={() => {
            if (!clipboard) return;
            settle(
              pasteClip(
                doc,
                clipboard,
                activeFrame,
                activeLayerId,
                selection ? { x: selection.x, y: selection.y } : undefined,
                t.selection.paste,
              ),
              t.selection.pastedToast,
            );
          }}
        >
          {t.selection.paste}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        {t.selection.clipsDrawing}
      </p>
      <p className="hint" style={{ marginTop: 6 }}>
        {t.selection.clipHint}
      </p>
    </div>
  );
}

/* ────────── katmanlar ────────── */
export function LayersPanel() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const setActiveLayer = useEditor((s) => s.setActiveLayer);
  const bump = useEditor((s) => s.bump);
  const showToast = useEditor((s) => s.showToast);
  const [renaming, setRenaming] = useState<string | null>(null);
  const opacityDrag = useRef(false);
  void version;

  // proje dizisinde 0 = en alt katman; listede üst = önde olsun diye ters çeviriyoruz
  const ordered = [...doc.layers].reverse();
  const activeIndex = doc.layers.findIndex((l) => l.id === activeLayerId);
  const active = doc.layers[activeIndex];

  const move = (dir: 1 | -1) => {
    const to = activeIndex + dir;
    if (to < 0 || to >= doc.layers.length) return;
    doc.moveLayer(activeIndex, to);
    bump();
  };

  /**
   * Liste ekranda TERS gösteriliyor (üstteki = önde), moveLayer ise proje
   * dizisi indeksi bekliyor. Çeviriyi burada yapıyoruz, belge modelinin
   * arayüzün sıralamasını bilmesi gerekmiyor.
   */
  const dragProps = useDragReorder((from, to) => {
    const last = doc.layers.length - 1;
    doc.moveLayer(last - from, last - to);
    bump();
  });

  return (
    <div className="panel">
      <PanelHead title={t.layers.title} lead={t.layers.lead}>
        <button
          className="btn sm"
          title={t.layers.add}
          aria-label={t.layers.add}
          onClick={() => {
            setActiveLayer(doc.addLayer());
            bump();
          }}
        >
          <Icon name="plus" size={11} />
        </button>
      </PanelHead>

      <div className="layer-list">
        {ordered.map((l, di) => (
          <div
            key={l.id}
            className="layer"
            data-active={l.id === activeLayerId}
            title={t.layers.dragHint}
            {...dragProps(di)}
          >
            <button
              className="icon-btn"
              title={l.visible ? t.layers.hide : t.layers.show}
              aria-label={l.visible ? t.layers.hide : t.layers.show}
              aria-pressed={l.visible}
              onClick={() => {
                doc.setLayerProps(l.id, { visible: !l.visible });
                bump();
              }}
            >
              <Icon name={l.visible ? "eye" : "eyeOff"} size={13} />
            </button>

            {renaming === l.id ? (
              <input
                className="rename"
                autoFocus
                defaultValue={l.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== l.name) {
                    doc.setLayerProps(l.id, { name: v.slice(0, 60) });
                    bump();
                  }
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <button
                className="nm"
                onClick={() => setActiveLayer(l.id)}
                onDoubleClick={() => {
                  setActiveLayer(l.id);
                  setRenaming(l.id);
                }}
                title={t.layers.renameHint}
              >
                {l.name}
                {!l.visible && <span className="tagoff"> ({t.common.off})</span>}
              </button>
            )}

            <button
              className="icon-btn"
              title={l.locked ? t.layers.unlock : t.layers.lock}
              aria-label={l.locked ? t.layers.unlock : t.layers.lock}
              aria-pressed={l.locked}
              onClick={() => {
                doc.setLayerProps(l.id, { locked: !l.locked });
                bump();
              }}
            >
              <Icon name={l.locked ? "lock" : "unlock"} size={12} />
            </button>
          </div>
        ))}
      </div>

      {active && (
        <div className="row" style={{ marginTop: 8, gap: 4 }}>
          <button
            className="btn sm"
            title={t.layers.up}
            aria-label={t.layers.up}
            disabled={activeIndex >= doc.layers.length - 1}
            onClick={() => move(1)}
          >
            ▲
          </button>
          <button
            className="btn sm"
            title={t.layers.down}
            aria-label={t.layers.down}
            disabled={activeIndex <= 0}
            onClick={() => move(-1)}
          >
            ▼
          </button>
          <span className="grow" style={{ flex: 1 }} />
          {doc.layers.length > 1 && (
            <ConfirmButton
              label={<Icon name="trash" size={11} />}
              confirmLabel={t.common.confirm}
              title={t.layers.confirmDelete}
              onConfirm={() => {
                if (doc.deleteLayer(activeLayerId)) {
                  setActiveLayer(doc.layers[doc.layers.length - 1].id);
                  bump();
                  showToast(t.layers.deletedToast);
                }
              }}
            />
          )}
        </div>
      )}

      {active && (
        <Slider
          label={t.layers.opacity}
          value={Math.round(active.opacity * 100)}
          min={0}
          max={100}
          suffix="%"
          // Sürükleme boyunca beginBatch/endBatch: yoksa 100 adımlık geçmiş
          // üretir ve kullanıcının gerçek çizim adımlarını yığından atar.
          onDragStart={() => {
            if (!opacityDrag.current) {
              opacityDrag.current = true;
              doc.beginBatch(t.layers.opacity);
            }
          }}
          onDragEnd={() => {
            if (opacityDrag.current) {
              opacityDrag.current = false;
              doc.endBatch();
              bump();
            }
          }}
          onChange={(v) => {
            doc.setLayerProps(active.id, { opacity: v / 100 });
            bump();
          }}
        />
      )}
    </div>
  );
}
