"use client";

/**
 * Nibble — iskelet paneli
 *
 * İskelet modu açıkken palet/araç panellerinin yerine geçiyor. Sebebi basit:
 * 236 pikselde üç panel üst üste sığmıyor, ve rig modundayken zaten fırça
 * ayarlarına bakmıyorsun. Katmanlar panelinde kalıyor çünkü rig işlemleri
 * aktif katmanı hedefliyor.
 */

import { useState } from "react";
import Icon from "./icon";
import { ConfirmButton, PanelHead } from "./ui";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/editor-store";
import { nodePosResolved, regionRect } from "@/lib/rig";
import {
  clearNodeRegion,
  defineBone,
  deleteBone,
  deleteNode,
  moveNode,
  transformNode,
  tweenFrames,
} from "@/lib/rig-ops";
import type { RegionTransform } from "@/lib/types";

export default function RigPanel() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const activeFrame = useEditor((s) => s.activeFrame);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const activeNodeName = useEditor((s) => s.activeNodeName);
  const rigPending = useEditor((s) => s.rigPending);
  const setActiveNode = useEditor((s) => s.setActiveNode);
  const setRigPending = useEditor((s) => s.setRigPending);
  const bump = useEditor((s) => s.bump);
  const showToast = useEditor((s) => s.showToast);
  void version;

  const [newName, setNewName] = useState("");
  const [boneName, setBoneName] = useState("");
  const [boneTo, setBoneTo] = useState("");
  const [tweenCount, setTweenCount] = useState(3);

  const rig = doc.rig;
  const nodes = rig?.nodes ?? [];
  const bones = rig?.bones ?? [];
  const frameIds = doc.frames.map((f) => f.id);

  const active = nodes.find((n) => n.name === activeNodeName) ?? null;
  const activeAt = active ? nodePosResolved(active, frameIds, activeFrame) : null;
  const activeRect = active && activeAt ? regionRect(active, activeAt) : null;

  /** rig-ops sonucunu tek yerde karşıla: hata varsa göster, yoksa render'ı tazele */
  const settle = (res: { ok: boolean; error?: string }, okMsg?: string) => {
    if (!res.ok) {
      showToast(res.error ?? "?");
      return false;
    }
    bump();
    if (okMsg) showToast(okMsg);
    return true;
  };

  const startAdd = () => {
    const name = newName.trim();
    if (!name) {
      showToast(t.rig.nameEmpty);
      return;
    }
    if (nodes.some((n) => n.name === name)) {
      showToast(t.rig.nameTaken);
      return;
    }
    setRigPending("place", name);
    showToast(t.rig.placeFirst);
  };

  const nudge = (dx: number, dy: number) => {
    if (!active) return;
    settle(moveNode(doc, active.name, dx, dy, activeFrame, activeLayerId));
  };

  const transform = (op: RegionTransform) => {
    if (!active) return;
    settle(transformNode(doc, active.name, op, activeFrame, activeLayerId));
  };

  return (
    <div className="panel rig">
      <PanelHead title={t.rig.title} lead={t.rig.lead} />

      {/* ── parça listesi ── */}
      {nodes.length === 0 ? (
        <p className="hint">{t.rig.noNodes}</p>
      ) : (
        <div className="layer-list">
          {nodes.map((n) => {
            const at = nodePosResolved(n, frameIds, activeFrame);
            return (
              <div key={n.name} className="layer" data-active={n.name === activeNodeName}>
                <button className="nm" onClick={() => setActiveNode(n.name)}>
                  {n.name}
                </button>
                <span className="hint" style={{ flex: "none" }}>
                  {Object.keys(n.pos).length} {t.rig.keyframes}
                  {n.region ? " ▪" : ""}
                </span>
                {!at ? (
                  <span className="hint" title={t.rig.placeFirst}>⚠</span>
                ) : (
                  // tuval küçültülmüşse tutamak dışarıda kalabilir: veri
                  // yerinde ama fareyle yakalanamaz, uyarmak gerekiyor
                  (at.x < 0 || at.y < 0 || at.x >= doc.width || at.y >= doc.height) && (
                    <span className="hint warn" title={t.rig.offCanvas}>⚠</span>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <input
          type="text"
          value={newName}
          placeholder={t.rig.namePlaceholder}
          aria-label={t.rig.namePrompt}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startAdd()}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          className={`btn sm${rigPending === "place" ? " active" : ""}`}
          onClick={startAdd}
          title={t.rig.addNode}
        >
          <Icon name="plus" size={11} />
        </button>
      </div>
      {rigPending === "place" && <p className="hint">{t.rig.placeFirst}</p>}

      {/* ── seçili parça ── */}
      {active && (
        <>
          <h4 className="section">
            {t.rig.selected}: {active.name}
          </h4>
          <p className="hint">
            {t.rig.handle} {activeAt ? `${activeAt.x}, ${activeAt.y}` : "-"} ·{" "}
            {activeRect ? `${t.rig.region} ${activeRect.w}×${activeRect.h}` : t.rig.noRegion}
          </p>

          <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            <button
              className={`btn sm${rigPending === "region" ? " active" : ""}`}
              onClick={() => setRigPending(rigPending === "region" ? "none" : "region")}
            >
              {t.rig.setRegion}
            </button>
            {active.region && (
              <button
                className="btn sm"
                onClick={() => settle(clearNodeRegion(doc, active.name))}
              >
                {t.rig.clearRegion}
              </button>
            )}
          </div>
          {rigPending === "region" && <p className="hint">{t.rig.setRegionOn}</p>}

          <div className="row" style={{ gap: 4, marginTop: 10 }}>
            <span className="hint" style={{ flex: 1 }}>
              {t.rig.nudge}
            </span>
            <button className="btn sm" onClick={() => nudge(-1, 0)} aria-label="←">◀</button>
            <button className="btn sm" onClick={() => nudge(0, -1)} aria-label="↑">▲</button>
            <button className="btn sm" onClick={() => nudge(0, 1)} aria-label="↓">▼</button>
            <button className="btn sm" onClick={() => nudge(1, 0)} aria-label="→">▶</button>
          </div>

          <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            <span className="hint" style={{ width: "100%" }} title={t.rig.lossless}>
              {t.rig.transform} · {t.rig.lossless}
            </span>
            <button className="btn sm" disabled={!activeRect} onClick={() => transform("flipX")}>
              {t.rig.flipX}
            </button>
            <button className="btn sm" disabled={!activeRect} onClick={() => transform("flipY")}>
              {t.rig.flipY}
            </button>
            <button className="btn sm" disabled={!activeRect} onClick={() => transform("rotate90")}>
              {t.rig.rotate90}
            </button>
            <button className="btn sm" disabled={!activeRect} onClick={() => transform("rotate180")}>
              {t.rig.rotate180}
            </button>
          </div>


          <div className="row" style={{ marginTop: 8 }}>
            <ConfirmButton
              label={
                <>
                  <Icon name="trash" size={11} /> {t.rig.deleteNode}
                </>
              }
              confirmLabel={t.common.confirm}
              onConfirm={() => {
                if (settle(deleteNode(doc, active.name))) setActiveNode(null);
              }}
            />
          </div>
        </>
      )}

      {/* ── kemikler ── */}
      <h4 className="section" title={t.rig.boneHint}>
        {t.rig.bones}
      </h4>
      <p className="hint" title={t.rig.boneHint}>
        {t.rig.boneHintShort}
      </p>
      {bones.length > 0 && (
        <div className="layer-list" style={{ marginTop: 6 }}>
          {bones.map((b) => (
            <div key={b.name} className="layer">
              <span className="nm" style={{ padding: "3px 2px" }}>
                {b.name}: {b.from} → {b.to}
              </span>
              <button
                className="icon-btn"
                title={t.rig.deleteBone}
                aria-label={t.rig.deleteBone}
                onClick={() => settle(deleteBone(doc, b.name))}
              >
                <Icon name="trash" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      {nodes.length >= 2 && (
        <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          <select
            value={boneTo}
            onChange={(e) => setBoneTo(e.target.value)}
            aria-label={t.rig.addBone}
            style={{ flex: 1, minWidth: 0 }}
          >
            <option value="">{active ? `${active.name} → …` : t.rig.pickTwo}</option>
            {nodes
              .filter((n) => n.name !== activeNodeName)
              .map((n) => (
                <option key={n.name} value={n.name}>
                  {n.name}
                </option>
              ))}
          </select>
          <input
            type="text"
            value={boneName}
            placeholder={t.rig.namePrompt}
            aria-label={t.rig.namePrompt}
            onChange={(e) => setBoneName(e.target.value)}
            style={{ width: 74 }}
          />
          <button
            className="btn sm"
            disabled={!active || !boneTo}
            onClick={() => {
              if (!active || !boneTo) {
                showToast(t.rig.pickTwo);
                return;
              }
              const name = boneName.trim() || `${active.name}-${boneTo}`;
              if (settle(defineBone(doc, name, active.name, boneTo))) {
                setBoneName("");
                setBoneTo("");
              }
            }}
          >
            <Icon name="plus" size={11} />
          </button>
        </div>
      )}

      {/* ── ara kareler ── */}
      <h4 className="section" title={t.rig.tweenLead}>
        {t.rig.tween}
      </h4>
      <p className="hint" title={t.rig.tweenLead}>
        {t.rig.tweenLeadShort}
      </p>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <label className="field" style={{ gap: 5 }}>
          {t.rig.tweenCount}
          <input
            type="number"
            min={1}
            max={24}
            value={tweenCount}
            onChange={(e) => setTweenCount(+e.target.value)}
            style={{ width: 54 }}
          />
        </label>
        <span style={{ flex: 1 }} />
        <button
          className="btn sm"
          disabled={activeFrame >= doc.frames.length - 1 || nodes.length === 0}
          title={
            activeFrame >= doc.frames.length - 1 || nodes.length === 0
              ? t.rig.tweenNeedsTwo
              : `${t.rig.tweenRun}. ${t.rig.tweenLossy}`
          }
          onClick={() => {
            const res = tweenFrames(doc, activeFrame, tweenCount, activeLayerId);
            settle(res, res.ok ? `${res.added} ${t.rig.tweenDone}` : undefined);
          }}
        >
          {t.rig.tweenRun}
        </button>
      </div>
    </div>
  );
}
