"use client";

/**
 * Nibble — zaman şeridi (kareler)
 *
 * Küçük önizlemeler doc'a doğrudan abone: piksel verisi React state'ine
 * girmediği için yeniden çizimi kendimiz tetiklemek zorundayız.
 */

import { useEffect, useRef, useState } from "react";
import Icon from "./icon";
import { ConfirmButton, useDragReorder } from "./ui";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/editor-store";
import { saveSettings } from "@/lib/storage";
import { FPS_OPTIONS, csToFps } from "@/lib/types";

/**
 * Küçük önizleme.
 *
 * PERFORMANS — buradaki filtre kritik: her önizleme her `notify`'da yeniden
 * birleştirme yapıyordu, yani 20 kareli bir projede TEK fare hareketi 20 tam
 * `composite()` demekti (512×512'de ~20 MB ayırma ve ~5M piksel işlemi).
 * "Piksel verisi React state'ine girmez" kararının amacı tam olarak buydu ve
 * arayüz onu geri alıyordu.
 *
 * Kural: "pixels" değişimi yalnızca ÇİZİLEN kareyi ilgilendirir. Yapı ve
 * geçmiş değişimleri (kare ekleme/sıralama, geri alma) hepsini ilgilendirir.
 * Ajan başka bir kareye çizerse çağrı başına bir `bump()` geliyor ve `version`
 * üstünden hepsi tazeleniyor — yani bayat önizleme kalmıyor.
 */
function FrameThumb({ index, cell, active }: { index: number; cell: number; active: boolean }) {
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(
    () => doc.subscribe((reason) => { if (reason !== "pixels" || active) setTick((t) => t + 1); }),
    [doc, active],
  );

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { width, height } = doc.project;
    if (!doc.project.frames[index]) return;
    const buf = doc.composite(index);
    cv.getContext("2d")!.putImageData(
      new ImageData(new Uint8ClampedArray(buf), width, height),
      0,
      0,
    );
  }, [doc, index, tick, version]);

  const { width, height } = doc.project;
  const scale = cell / Math.max(width, height);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
    />
  );
}

export default function Timeline() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const activeFrame = useEditor((s) => s.activeFrame);
  const playing = useEditor((s) => s.playing);
  const onionSkin = useEditor((s) => s.onionSkin);
  const showGrid = useEditor((s) => s.showGrid);
  const patch = useEditor((s) => s.patch);
  const bump = useEditor((s) => s.bump);
  const setActiveFrame = useEditor((s) => s.setActiveFrame);
  const togglePlay = useEditor((s) => s.togglePlay);
  const showToast = useEditor((s) => s.showToast);
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  const onionRange = useEditor((s) => s.onionRange);
  void version;

  /**
   * Animasyon görünümü: aynı şerit, büyük hücreler ve süreler açıkta.
   * Ayrı bir düzen yazmadık — kareyi büyütmek ve zamanlamayı göstermek
   * "animasyon moduna geçmenin" gerçek faydası; geri kalanı aynı editör.
   */
  const animate = mode === "animate";
  const cell = animate ? 76 : 44;

  const frames = doc.frames;
  const fps = doc.project.fps;
  const current = frames[activeFrame];

  // aktif kare her zaman görünsün — , / . ile gezerken şerit kaymalı
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeFrame, frames.length]);

  const dragProps = useDragReorder((from, to) => {
    doc.moveFrame(from, to);
    setActiveFrame(to);
    bump();
  });

  const move = (dir: 1 | -1) => {
    const to = activeFrame + dir;
    if (to < 0 || to >= frames.length) return;
    doc.moveFrame(activeFrame, to);
    setActiveFrame(to);
    bump();
  };

  return (
    <div className={`bottom${animate ? " animate" : ""}`}>
      <div className="timeline">
        <button
          className="btn"
          onClick={togglePlay}
          title={playing ? t.timeline.pause : t.timeline.play}
          aria-label={playing ? t.timeline.pause : t.timeline.play}
        >
          <Icon name={playing ? "pause" : "play"} size={13} />
        </button>

        <label className="field" style={{ gap: 5 }}>
          {t.timeline.fps}
          <select
            value={fps}
            onChange={(e) => {
              doc.setFps(+e.target.value);
              bump();
            }}
          >
            {FPS_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`btn${onionSkin ? " active" : ""}`}
          aria-pressed={onionSkin}
          onClick={() => {
            patch({ onionSkin: !onionSkin });
            saveSettings({ onionSkin: !onionSkin });
          }}
          title={t.timeline.onion}
          aria-label={t.timeline.onion}
        >
          <Icon name="onion" size={13} />
        </button>
        <button
          className={`btn${showGrid ? " active" : ""}`}
          aria-pressed={showGrid}
          onClick={() => {
            patch({ showGrid: !showGrid });
            saveSettings({ showGrid: !showGrid });
          }}
          title={t.timeline.grid}
          aria-label={t.timeline.grid}
        >
          <Icon name="grid" size={13} />
        </button>

        <button
          className={`btn${animate ? " active" : ""}`}
          aria-pressed={animate}
          onClick={() => setMode(animate ? "draw" : "animate")}
          title={animate ? t.timeline.drawMode : t.timeline.animateMode}
        >
          {animate ? "▤" : "▥"}
        </button>

        {animate && onionSkin && (
          <label className="field" style={{ gap: 5 }} title={t.timeline.onionRange}>
            {t.timeline.onionRange}
            <input
              type="number"
              min={1}
              max={4}
              value={onionRange}
              onChange={(e) => patch({ onionRange: Math.max(1, Math.min(4, +e.target.value)) })}
              style={{ width: 44 }}
            />
          </label>
        )}

        <span className="vrule" />

        <div className="frames" ref={stripRef}>
          {frames.map((f, i) => (
            <button
              key={f.id}
              className="frame-cell"
              data-active={i === activeFrame}
              aria-pressed={i === activeFrame}
              onClick={() => setActiveFrame(i)}
              title={`${t.timeline.frame} ${i + 1} · ${csToFps(f.durationCs)} fps · ${t.timeline.dragHint}`}
              {...dragProps(i)}
            >
              <FrameThumb index={i} cell={cell} active={i === activeFrame} />
              <span className="n">{i + 1}</span>
              {animate && <span className="cs">{f.durationCs}cs</span>}
            </button>
          ))}
        </div>

        <span className="vrule" />

        <div className="row" style={{ gap: 4 }}>
          <button
            className="btn sm"
            title={t.timeline.moveLeft}
            aria-label={t.timeline.moveLeft}
            disabled={activeFrame <= 0}
            onClick={() => move(-1)}
          >
            ◀
          </button>
          <button
            className="btn sm"
            title={t.timeline.moveRight}
            aria-label={t.timeline.moveRight}
            disabled={activeFrame >= frames.length - 1}
            onClick={() => move(1)}
          >
            ▶
          </button>
          <button
            className="btn sm"
            title={t.timeline.addFrame}
            aria-label={t.timeline.addFrame}
            onClick={() => {
              // copyFrom YOK → boş kare. Çoğaltma ayrı düğme.
              const i = doc.addFrame();
              setActiveFrame(i);
              bump();
            }}
          >
            <Icon name="plus" size={11} />
          </button>
          <button
            className="btn sm"
            title={t.timeline.dupFrame}
            aria-label={t.timeline.dupFrame}
            onClick={() => {
              const i = doc.addFrame(activeFrame);
              setActiveFrame(i);
              bump();
            }}
          >
            <Icon name="copy" size={11} />
          </button>
          <ConfirmButton
            label={<Icon name="trash" size={11} />}
            confirmLabel={t.common.confirm}
            title={t.timeline.confirmDelete}
            disabled={frames.length <= 1}
            onConfirm={() => {
              if (doc.deleteFrame(activeFrame)) {
                setActiveFrame(Math.min(activeFrame, doc.frames.length - 1));
                bump();
                showToast(t.timeline.deletedToast);
              }
            }}
          />
        </div>

        {current && (
          <label className="field" style={{ gap: 5 }} title={t.timeline.duration}>
            {t.timeline.duration}
            <input
              type="number"
              min={1}
              max={1000}
              value={current.durationCs}
              onChange={(e) => {
                doc.setFrameDuration(activeFrame, +e.target.value);
                bump();
              }}
              style={{ width: 56 }}
            />
            <span className="hint">cs</span>
          </label>
        )}
      </div>
    </div>
  );
}
