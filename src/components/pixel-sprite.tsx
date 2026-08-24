"use client";

/**
 * Nibble — sprite oynatıcı
 *
 * Canvas değil CSS ızgarası kullanıyor: sayfa sprite'ı gerçekten "kendi
 * malzemesiyle" çiziyor, her piksel bir DOM hücresi. 12×11 = 132 hücre ve
 * saniyede en fazla 4 kare değişiyor — React'in diff'i için önemsiz bir yük,
 * karşılığında canvas kurulumu ve ölçekleme derdi yok.
 *
 * Hidrasyon: ilk kare HER ZAMAN `restIndex`. Sunucu hangi kareyi çizeceğini
 * bilemediği için rastgele/duruma bağlı bir başlangıç uyuşmazlık çıkarırdı.
 */

import { useEffect, useState } from "react";
import type { SpriteDef } from "@/lib/showcase-sprites";

/** Hareketi azalt tercihi — animasyonu tamamen durdurup dinlenme karesinde bırakır */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function PixelSprite({
  sprite,
  cell,
  fit,
  label,
  className,
}: {
  sprite: SpriteDef;
  /**
   * Piksel başına CSS boyutu. Toplam genişlik yerine hücre boyutu alıyoruz:
   * galeride 12×9 kalp ve 12×16 kılıç yan yana dururken sabit genişlik
   * verirsek kılıcın pikselleri küçülüp orantısız görünüyordu. Hücre sabit
   * olunca hepsi aynı "çözünürlükte" okunuyor.
   */
  cell?: string;
  /**
   * Sahneler için: sprite kabın genişliğini doldurur, en-boy oranı korunur.
   * Sabit hücreyle 32 piksel geniş sakura sahnesi kartı taşıyordu; sahnelerde
   * ölçek kaba göre, küçük nesnelerde hücreye göre doğru davranış.
   */
  fit?: boolean;
  label: string;
  className?: string;
}) {
  const [index, setIndex] = useState(sprite.restIndex);
  const reduced = usePrefersReducedMotion();

  const frame = sprite.frames[index] ?? sprite.frames[sprite.restIndex];
  const cols = frame.rows[0]?.length ?? 1;
  const rows = frame.rows.length;

  useEffect(() => {
    if (reduced || sprite.frames.length < 2) return;
    // setTimeout, setInterval değil: her karenin kendi süresi var
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % sprite.frames.length),
      frame.ms,
    );
    return () => clearTimeout(timer);
  }, [index, frame.ms, reduced, sprite.frames.length]);

  const legend = frame.legend ?? sprite.legend;

  return (
    <div
      className={`pixel-sprite${fit ? " fit" : ""}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={label}
      style={
        fit
          ? {
              width: "100%",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              // satırlar da 1fr: yüksekliği çocuğun aspect-ratio'suna
              // bırakmak yuvarlama farkı bırakıyor, satırları bölmek tam oturuyor
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              aspectRatio: `${cols} / ${rows}`,
            }
          : { gridTemplateColumns: `repeat(${cols}, ${cell})`, gridAutoRows: cell }
      }
    >
      {frame.rows.flatMap((row, y) =>
        [...row].map((ch, x) => (
          <i
            key={`${x}-${y}`}
            style={ch === "." || ch === " " ? undefined : { background: legend[ch] }}
          />
        )),
      )}
    </div>
  );
}
