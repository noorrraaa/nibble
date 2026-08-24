"use client";

/**
 * Nibble — paylaşılan küçük UI parçaları.
 *
 * Ayrı dosyada duruyorlar çünkü hem paneller hem diyaloglar kullanıyor;
 * tek bir bileşen dosyasında toplasaydık döngüsel import çıkardı.
 */

import { useEffect, useId, useRef, useState } from "react";
import Icon, { type IconName } from "./icon";

/* ────────── modal ────────── */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    // açılınca odağı içeri al — klavyeyle gezenler diyalogda kalsın
    bodyRef.current?.focus();
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`dialog${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          {title}
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={onClose} aria-label={title}>
            ✕
          </button>
        </header>
        <div className="body" ref={bodyRef} tabIndex={-1}>
          {children}
        </div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ────────── açıklamalı panel başlığı ────────── */
export function PanelHead({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <h3>
        {title}
        <span className="grow" />
        {children}
      </h3>
      {lead && <p className="lead">{lead}</p>}
    </>
  );
}

/* ────────── segment seçici ────────── */
export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * İki aşamalı silme düğmesi.
 * Ayrı bir onay diyaloğu açmıyoruz: yıkıcı işlem tek tıkla olmasın diye
 * ikinci tık isteniyor, ama kullanıcıyı modal ile de durdurmuyoruz.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  icon,
  onConfirm,
  className = "btn sm",
  title,
  disabled,
}: {
  label: React.ReactNode;
  confirmLabel: string;
  icon?: IconName;
  onConfirm: () => void;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      className={`${className}${armed ? " danger" : ""}`}
      title={title}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {icon && <Icon name={icon} size={11} />}
      {armed ? confirmLabel : label}
    </button>
  );
}

/**
 * Sürükle-sırala.
 *
 * HTML5 drag-and-drop kullanıyoruz, pointer matematiği değil: tarayıcı
 * sürükleme görselini ve iptali (Esc, dışarı bırakma) kendisi hallediyor.
 * ▲▼ düğmeleri de duruyor — klavyeyle gezen kullanıcı sürükleyemez.
 *
 * `to` HEDEF öğenin indeksi; çağıran taraf kendi dizisine göre yorumluyor
 * (katman listesi ekranda tersten gösteriliyor, bu yüzden çeviri orada).
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragging(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (over !== index) setOver(index);
    },
    onDragLeave: () => {
      if (over === index) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain");
      const from = dragging ?? (raw === "" ? NaN : Number(raw));
      setDragging(null);
      setOver(null);
      if (Number.isFinite(from) && from !== index) onReorder(from, index);
    },
    "data-drag": dragging === index ? "source" : over === index ? "target" : undefined,
  });
}

/* ────────── etiketli kaydırıcı ────────── */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  onDragStart,
  onDragEnd,
  title,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  /** sürükleme boyunca tek geri-alma adımı isteyenler için (bkz. katman opaklığı) */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  title?: string;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id} title={title}>
      {label}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        onPointerDown={onDragStart}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onKeyDown={onDragStart}
        onKeyUp={onDragEnd}
      />
      <b className="num">
        {value}
        {suffix}
      </b>
    </label>
  );
}
