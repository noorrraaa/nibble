/**
 * Hukuki sayfa kabuğu: /gizlilik, /kvkk (Türkçe, asıl) ve /privacy, /kvkk/en
 * (İngilizce çeviri). Metin `lib/legal.ts`'ten gelir;
 * burası yalnız çizer. Sunucu bileşeni: statik export'ta düz HTML olarak çıkar,
 * JavaScript'e gerek yok (hukuki metin her koşulda okunabilmeli).
 */

import Link from "next/link";
import { linkSegments, type LegalDoc, type LegalLang } from "@/lib/legal";
import { LEGAL_ALTERNATES } from "@/lib/seo";
import { NARDIN_URL } from "@/lib/site";

/** Kabuğun kendi metinleri; hukuki metnin dili neyse o. */
const CHROME: Record<
  LegalLang,
  { home: string; editor: string; effective: string; privacy: string; kvkk: string; other: LegalLang; otherName: string }
> = {
  tr: {
    home: "Nibble ana sayfa",
    editor: "Editör",
    effective: "Yürürlük tarihi",
    privacy: "Gizlilik",
    kvkk: "KVKK",
    other: "en",
    otherName: "English",
  },
  en: {
    home: "Nibble home",
    editor: "Editor",
    effective: "Effective date",
    privacy: "Privacy",
    kvkk: "KVKK notice",
    other: "tr",
    otherName: "Türkçe",
  },
};

const MARK = (
  <span className="mark" aria-hidden>
    <i /><i /><i /><i className="bite" />
    <i /><i /><i /><i />
    <i /><i /><i /><i />
    <i /><i /><i /><i />
  </span>
);

/** Metindeki https adreslerini ve e-postaları tıklanabilir yapar (bölme `legal.ts`'de, testli). */
function linkify(text: string): React.ReactNode[] {
  return linkSegments(text).map((seg, i) =>
    seg.href ? (
      <a key={i} href={seg.href} rel={seg.href.startsWith("https://") ? "noopener" : undefined}>
        {seg.text}
      </a>
    ) : (
      seg.text
    ),
  );
}

export default function LegalPage({ doc, kind }: { doc: LegalDoc; kind: keyof typeof LEGAL_ALTERNATES }) {
  const c = CHROME[doc.lang];
  const alt = LEGAL_ALTERNATES[kind][c.other];
  const links = { privacy: LEGAL_ALTERNATES.privacy[doc.lang], kvkk: LEGAL_ALTERNATES.kvkk[doc.lang] };
  return (
    <main style={{ minHeight: "100dvh" }} lang={doc.lang}>
      <header className="site-head">
        <div className="wrap head-inner">
          <Link href="/" className="head-home" aria-label={c.home}>
            {MARK}
            <span className="wordmark">NIBBLE</span>
          </Link>
          <span style={{ flex: 1 }} />
          <Link href={alt} className="head-link" hrefLang={c.other} lang={c.other}>
            {c.otherName}
          </Link>
          <Link href="/editor/" className="head-link">
            {c.editor}
          </Link>
        </div>
      </header>

      <article className="wrap doc legal">
        <h1 className="doc-title">{doc.title}</h1>
        <p className="hint">
          {c.effective}: {doc.effective}
        </p>
        {doc.translationNote && <p className="hint legal-note">{doc.translationNote}</p>}
        <p className="hero-lede">{doc.lede}</p>

        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="doc-h2">{s.heading}</h2>
            {s.paragraphs?.map((p, i) => (
              <p key={i} className="legal-p">
                {linkify(p)}
              </p>
            ))}
            {s.bullets && (
              <ul className="bullets">
                {s.bullets.map((b, i) => (
                  <li key={i}>{linkify(b)}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>

      <footer className="site-foot">
        <div className="wrap head-inner foot-links">
          {MARK}
          <Link href={links.privacy}>{c.privacy}</Link>
          <Link href={links.kvkk}>{c.kvkk}</Link>
          <a href={NARDIN_URL}>Nardin</a>
        </div>
      </footer>
    </main>
  );
}
