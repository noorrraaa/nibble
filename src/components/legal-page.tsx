/**
 * Hukuki sayfa kabuğu — /gizlilik ve /kvkk. Metin `lib/legal.ts`'ten gelir;
 * burası yalnız çizer. Sunucu bileşeni: statik export'ta düz HTML olarak çıkar,
 * JavaScript'e gerek yok (hukuki metin her koşulda okunabilmeli).
 */

import Link from "next/link";
import { linkSegments, type LegalDoc } from "@/lib/legal";
import { NARDIN_URL } from "@/lib/site";

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

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main style={{ minHeight: "100dvh" }} lang="tr">
      <header className="site-head">
        <div className="wrap head-inner">
          <Link href="/" className="head-home" aria-label="Nibble ana sayfa">
            {MARK}
            <span className="wordmark">NIBBLE</span>
          </Link>
          <span style={{ flex: 1 }} />
          <Link href="/editor/" className="head-link">
            Editör
          </Link>
        </div>
      </header>

      <article className="wrap doc legal">
        <h1 className="doc-title">{doc.title}</h1>
        <p className="hint">Yürürlük tarihi: {doc.effective}</p>
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
          <Link href="/gizlilik/">Gizlilik</Link>
          <Link href="/kvkk/">KVKK</Link>
          <a href={NARDIN_URL}>Nardin</a>
        </div>
      </footer>
    </main>
  );
}
