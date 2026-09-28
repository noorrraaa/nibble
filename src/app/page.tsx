"use client";

/**
 * Nibble — tanıtım sayfası
 *
 * Sayfa kendi konusunun malzemesiyle çizilmiş: aşağıdaki sprite, editörün
 * ajana sunduğu `drawFromText` formatının AYNISIYLA yazılmış bir karakter
 * ızgarası. Yani "bu site pixel art'ı böyle ifade ediyor" demenin en kısa yolu.
 */

import Link from "next/link";
import SiteLinks from "@/components/site-links";
import PixelSprite from "@/components/pixel-sprite";
import { setLang, useLang, useT } from "@/lib/i18n";
import { DEFAULT_PALETTE } from "@/lib/palettes";
import { MASCOT, OBJECTS, SCENES } from "@/lib/showcase-sprites";

const MARK = (
  <span className="mark" aria-hidden>
    <i /><i /><i /><i className="bite" />
    <i /><i /><i /><i />
    <i /><i /><i /><i />
    <i /><i /><i /><i />
  </span>
);

const PALETTE = DEFAULT_PALETTE.colors;

function Feature({ tag, title, body }: { tag: string; title: string; body: string }) {
  return (
    <div className="card">
      <span className="tag">{tag}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export default function Home() {
  const t = useT();
  const lang = useLang();

  return (
    <main style={{ minHeight: "100dvh" }}>
      <header className="site-head">
        <div className="wrap head-inner">
          {MARK}
          <span className="wordmark">NIBBLE</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={() => setLang(lang === "tr" ? "en" : "tr")}>
            {lang === "tr" ? "EN" : "TR"}
          </button>
          <Link href="/agent/" className="head-link">
            {t.landing.apiLink}
          </Link>
        </div>
      </header>

      <section className="wrap hero">
        <div>
          <h1 className="hero-title">
            {t.landing.heroA}
            <br />
            {t.landing.heroB}
            <br />
            <span style={{ color: "var(--accent)" }}>{t.landing.heroC}</span>
          </h1>

          <p className="hero-lede">{t.landing.lede}</p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/editor/" className="btn primary cta">
              {t.landing.cta}
            </Link>
            <Link href="/agent/" className="btn cta">
              {t.landing.ctaAlt}
            </Link>
          </div>

          <div className="bulletrow">
            {t.landing.bullets.map((b) => (
              <span key={b}>
                <span style={{ color: "var(--green)" }}>▪</span> {b}
              </span>
            ))}
          </div>
        </div>

        <PixelSprite
          sprite={MASCOT}
          cell="clamp(14px, 3.2vw, 23px)"
          label={t.landing.sprites.mascot}
          className="hero-sprite"
        />
      </section>

      <div className="palette-strip" aria-hidden>
        {PALETTE.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>

      {/*
        Galeri: "kendi örneklerimiz". Kritik nokta bunların resim dosyası
        OLMADIĞI — hepsi drawFromText formatında satır dizisi, yani sayfa
        ürünün iddiasını kendi üstünde kanıtlıyor.
      */}
      <section className="wrap showcase">
        <span className="tag">{t.landing.showcaseTag}</span>
        <h2 className="showcase-title">{t.landing.showcaseTitle}</h2>
        <p className="hero-lede">{t.landing.showcaseLead}</p>

        <h3 className="showcase-sub">{t.landing.scenesTitle}</h3>
        <div className="scene-grid">
          {SCENES.map(({ key, sprite }) => (
            <figure key={key} className="showcase-item scene">
              <div className="sprite-box">
                {/* fit: 32 piksel geniş sahne sabit hücreyle kartı taşıyordu */}
                <PixelSprite sprite={sprite} fit label={t.landing.sprites[key]} />
              </div>
              <figcaption>
                {t.landing.sprites[key]}
                <span className="frames">
                  {sprite.frames.length} × {t.common.frames} ·{" "}
                  {sprite.frames.map((f) => `${Math.round(f.ms / 10)}cs`).join(" · ")} ·{" "}
                  {Object.keys(sprite.legend).length} {t.common.colors} ({t.landing.customPalette})
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <h3 className="showcase-sub">{t.landing.objectsTitle}</h3>
        <div className="showcase-grid">
          {OBJECTS.map(({ key, sprite }) => (
            <figure key={key} className="showcase-item">
              <div className="sprite-box">
                <PixelSprite sprite={sprite} cell="11px" label={t.landing.sprites[key]} />
              </div>
              <figcaption>
                {t.landing.sprites[key]}
                {sprite.frames.length > 1 && (
                  <span className="frames">
                    {sprite.frames.map((f) => `${Math.round(f.ms / 10)}cs`).join(" · ")}
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          {t.landing.showcaseNote}
        </p>
      </section>

      <section className="wrap features">
        <Feature tag={t.landing.f1tag} title={t.landing.f1title} body={t.landing.f1body} />
        <Feature tag={t.landing.f2tag} title={t.landing.f2title} body={t.landing.f2body} />
        <Feature tag={t.landing.f3tag} title={t.landing.f3title} body={t.landing.f3body} />
        <Feature tag={t.landing.f4tag} title={t.landing.f4title} body={t.landing.f4body} />
      </section>

      <footer className="site-foot">
        <div className="wrap head-inner">
          {MARK}
          <span>{t.landing.footer}</span>
          <span style={{ flex: 1 }} />
          <SiteLinks />
        </div>
      </footer>
    </main>
  );
}
