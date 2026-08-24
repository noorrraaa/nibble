"use client";

/**
 * Nibble — yardım ve ilk kullanım rehberi
 *
 * Editörler yeni gelene acımasızdır: her şey ikon, hiçbir şey yazmıyor.
 * Bu iki bileşen "neyin ne olduğu belli olmuyor" sorununu kapatıyor —
 * biri ilk açılışta bir kez, diğeri her zaman ? düğmesinde.
 */

import { useEffect, useState } from "react";
import Icon, { type IconName } from "./icon";
import { Dialog } from "./ui";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/editor-store";
import { saveSettings } from "@/lib/storage";
import type { ToolId } from "@/lib/types";

const TOOL_ICONS: { id: ToolId; icon: IconName; key: string }[] = [
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

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title={t.help.title} onClose={onClose} wide>
      <p style={{ marginTop: 0 }}>{t.help.intro}</p>

      <h4 className="section">{t.help.basicsTitle}</h4>
      <ol className="bullets numbered">
        {t.help.basics.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ol>

      <h4 className="section">{t.help.toolsTitle}</h4>
      <div className="tool-help">
        {TOOL_ICONS.map((tool) => (
          <div key={tool.id} className="tool-help-row">
            <span className="ic">
              <Icon name={tool.icon} size={15} />
            </span>
            <b>
              {t.tools[tool.id]} <kbd>{tool.key}</kbd>
            </b>
            <span className="hint">{t.toolHelp[tool.id]}</span>
          </div>
        ))}
      </div>

      <h4 className="section">{t.selection.title}</h4>
      <dl className="faq">
        <div>
          <dt>{t.selection.title}</dt>
          <dd>{t.selection.lead}</dd>
        </div>
        <div>
          <dt>{t.selection.clipsDrawing}</dt>
          <dd>{t.selection.clipHint}</dd>
        </div>
      </dl>

      <h4 className="section">{t.help.rigTitle}</h4>
      <dl className="faq">
        {t.help.rig.map(([q, a], i) => (
          <div key={i}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>

      <h4 className="section">{t.help.shortcutsTitle}</h4>
      <div className="keys">
        {t.help.keys.map(([k, d], i) => (
          <div key={i} className="keyrow">
            <kbd>{k}</kbd>
            <span className="hint">{d}</span>
          </div>
        ))}
      </div>

      <h4 className="section">{t.help.stuckTitle}</h4>
      <dl className="faq">
        {t.help.stuck.map(([q, a], i) => (
          <div key={i}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** İlk açılışta bir kez — dört ekran, atlanabilir */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const steps = t.onboarding.steps;
  const last = step >= steps.length - 1;

  const finish = () => {
    saveSettings({ tourSeen: true });
    onClose();
  };

  return (
    <Dialog
      title={t.onboarding.title}
      onClose={finish}
      footer={
        <>
          <button className="btn ghost" onClick={finish}>
            {t.common.skip}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t.common.back}
          </button>
          <button
            className="btn primary"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
          >
            {last ? t.onboarding.start : t.common.next}
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        {t.onboarding.lede}
      </p>
      <div className="tour">
        <span className="tour-n">
          {step + 1} / {steps.length}
        </span>
        <h3>{steps[step][0]}</h3>
        <p>{steps[step][1]}</p>
      </div>
      <div className="tour-dots" aria-hidden>
        {steps.map((_, i) => (
          <i key={i} className={i === step ? "on" : ""} />
        ))}
      </div>
    </Dialog>
  );
}

/**
 * Tuval boşken sahnenin ortasında beliren yönlendirme.
 *
 * Piksel verisi React state'inde olmadığı için doc'a doğrudan abone oluyoruz.
 * İlk fırça darbesinde kaybolur; boş tuval korkusunu kaldırmak için var.
 */
export function EmptyCanvasHint() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const activeFrame = useEditor((s) => s.activeFrame);
  const [empty, setEmpty] = useState(true);

  /**
   * Cel'leri DOĞRUDAN tarıyoruz, `composite()` çağırmıyoruz: birleştirme her
   * seferinde w*h*4 baytlık yeni bir tampon ayırıyor ve bu kontrol her
   * `notify`'da (yani her fare hareketinde) çalışıyor. Doğrudan tarama sıfır
   * ayırma yapıyor ve ilk dolu piksele basınca çıkıyor — dolu tuvalde,
   * ki normal durum bu, neredeyse bedava.
   */
  useEffect(() => {
    const check = () => {
      const frame = doc.project.frames[activeFrame];
      if (!frame) return setEmpty(true);
      for (const layer of doc.layers) {
        if (!layer.visible) continue;
        const cel = frame.cels[layer.id];
        if (!cel) continue;
        for (let i = 3; i < cel.length; i += 4) {
          if (cel[i] > 0) return setEmpty(false);
        }
      }
      setEmpty(true);
    };
    check();
    return doc.subscribe(check);
  }, [doc, activeFrame]);

  if (!empty) return null;
  return (
    <div className="empty-hint" aria-live="polite">
      <p>{t.status.emptyCanvas}</p>
      <p className="sub">{t.status.emptyHint}</p>
    </div>
  );
}
