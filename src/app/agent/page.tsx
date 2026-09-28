"use client";

/**
 * Nibble — /agent
 *
 * İki okuyucusu var ve ikisi de önemli: API'yi merak eden insan, ve sayfayı
 * okuyup ne yapabileceğini anlamaya çalışan ajan. Bu yüzden hem TR/EN
 * anlatım hem de olduğu gibi kopyalanabilir kod blokları var.
 */

import Link from "next/link";
import SiteLinks from "@/components/site-links";
import { setLang, useLang, useT } from "@/lib/i18n";
import { AGENT_LIMITS, AGENT_SCOPES, DEFAULT_POLICY } from "@/lib/agent-policy";
import { DEFAULT_PALETTE } from "@/lib/palettes";

const MARK = (
  <span className="mark" aria-hidden>
    <i /><i /><i /><i className="bite" />
    <i /><i /><i /><i />
    <i /><i /><i /><i />
    <i /><i /><i /><i />
  </span>
);

const FLOW = `// 1: el sıkışma / handshake
await nibble.help()

// 2: palet / palette
nibble.usePalette("sweetie-16")

// 3: tek çağrıda bir sprite / a whole sprite in one call
nibble.drawFromText({
  rows: [
    "..AAAA..",
    ".AABBAA.",
    "AABBBBAA",
    "AABBBBAA",
    ".AABBAA.",
    "..AAAA..",
  ],
  legend: { A: 3, B: 4 },
  x: 12, y: 12,
})

// 4: animasyon / animation
nibble.addFrame({ copyFrom: 0 })
nibble.setPixels([{ x: 12, y: 11, c: 3 }])
nibble.setFps(10)

// 5: ne çizdiğini oku / read back what you drew
nibble.readCanvas()`;

const RIG_FLOW = `// bir parçaya isim ver / name a part: tutamak + piksel kutusu
nibble.definePart({
  name: "left_leg",
  x: 12, y: 24,                            // tutamak / handle
  box: { x: 10, y: 22, w: 5, h: 8 },       // taşınacak pikseller / pixels it carries
})

// artık piksel değil PARÇA konuşuyorsun / now you speak in parts
nibble.movePart("left_leg", 0, -2)         // tutamak + pikseller
nibble.flipPart("left_leg", "x")           // kayıpsız / lossless
nibble.recolorPart("left_leg", { to: "#b13e53" })

// poz anahtarla, aradakileri Nibble üretsin / key the poses, let Nibble fill in
nibble.addFrame({ copyFrom: 0 })
nibble.movePart("left_leg", 0, -3)
nibble.setActiveFrame(0)
nibble.tween({ count: 2 })

nibble.describeRig()   // hangi parçanın kutusu/tutamağı eksik, söyler`;

const REFERENCE: [string, string][] = [
  ["help(topic?)", "API + canvas state + a hint for what to do next"],
  ["getState() · describe()", "Canvas, frames, layers, palette, parts, permissions"],
  ["getPermissions()", "What you are currently allowed to do"],
  ["readCanvas(frame?)", "Reads back rows + legend, in the same format you write"],
  ["drawFromText({rows, legend, x, y})", "Draw a whole sprite in one call"],
  ["setPixels([{x, y, c}])", "Bulk pixel writes"],
  ["fill(x, y, c, opts?)", "Flood fill"],
  ["clearFrame(frame?)", "Clears unlocked layers of a frame"],
  ["addFrame({copyFrom?}) · duplicateFrame(i)", "New frame (blank, or a copy)"],
  ["setActiveFrame(i) · setFrameDuration(i, cs)", "Navigate / time frames"],
  ["setFps(n) · play() · pause()", "Playback (fps must divide 100)"],
  ["addLayer(name?) · setLayer(id, props)", "Layer create / visibility / lock / rename"],
  ["getPalette() · setPalette([]) · usePalette(id)", "Colour palette"],
  ["definePart({name, x, y, box?})", "Name a part: a handle plus the pixels it carries"],
  ["setPartBox(name, box) · clearPartBox(name)", "Attach or detach the pixel box"],
  ["setPartHandle(name, x, y)", "Move the handle only. This is how you key a pose"],
  ["movePart(name, dx, dy, opts?)", "Move handle AND pixels in one undo step"],
  ["flipPart(name, axis) · rotatePart(name, deg)", "90° multiples lossless, other angles are not"],
  ["recolorPart(name, {to, from?, tolerance?})", "Repaint just that part"],
  ["renamePart(a, b) · deletePart(name)", "Edit the part list"],
  ["defineBone({name, from, to}) · deleteBone(name)", "Named link between two parts"],
  ["getRig() · describeRig()", "The skeleton, and what is still missing from it"],
  ["tween({from?, count})", "In-between frames from the handle positions"],
  ["importImage(src, opts?)", "Image → pixel art (data:/blob: free, http(s) needs files)"],
  ["beginBatch(label) · endBatch()", "Group everything into one undo step"],
  ["undo() · redo()", "History"],
  ["exportGif() · exportPng()", "Downloads (needs the files permission)"],
  ["exportApng()", "Lossless animation: full RGBA alpha, no 256-colour limit"],
  ["exportSpriteSheet()", "PNG + Aseprite JSON; rig parts become Aseprite \"slices\""],
  ["resize(w, h) · newProject() · deleteFrame(i) · deleteLayer(id)", "Destructive, off by default"],
];

export default function AgentPage() {
  const t = useT();
  const lang = useLang();

  return (
    <main style={{ minHeight: "100dvh" }}>
      <header className="site-head">
        <div className="wrap head-inner">
          <Link href="/" className="brand">
            {MARK}
            NIBBLE
          </Link>
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={() => setLang(lang === "tr" ? "en" : "tr")}>
            {lang === "tr" ? "EN" : "TR"}
          </button>
          <Link href="/editor/" className="head-link">
            {t.agentPage.openEditor}
          </Link>
        </div>
      </header>

      <section className="wrap doc">
        <h1 className="doc-title">{t.agentPage.title}</h1>
        <p className="hero-lede">{t.agentPage.lede}</p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <Link href="/editor/" className="btn primary cta">
            {t.agentPage.openEditor}
          </Link>
        </div>

        <div className="palette-strip thin" aria-hidden>
          {DEFAULT_PALETTE.colors.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>

        <h2 className="doc-h2">{t.agentPage.rulesTitle}</h2>
        <ol className="bullets numbered">
          {t.agentPage.rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>

        <h2 className="doc-h2">{t.agentPage.flowTitle}</h2>
        <pre className="code">{FLOW}</pre>

        <h2 className="doc-h2">
          {t.rig.title}: {lang === "tr" ? "parça adıyla konuş" : "speak in part names"}
        </h2>
        <p className="hero-lede" style={{ fontSize: 16, marginBottom: 16 }}>
          {lang === "tr"
            ? "Bir sprite'ı kare kare yeniden çizmek bir ajan için en pahalı yol. Bunun yerine parçalara bir kez isim ver: bundan sonra “sol bacağı iki piksel yukarı al” tek çağrı. Tutamakları poz olarak anahtarlarsan aradaki kareleri Nibble üretir."
            : "Redrawing a sprite frame by frame is the most expensive thing an agent can do. Name the parts once instead, and “move the left leg up two pixels” becomes a single call. Key the handles as poses and Nibble fills in the frames between them."}
        </p>
        <pre className="code">{RIG_FLOW}</pre>
        <p className="hint" style={{ marginTop: 8 }}>
          {t.rig.tweenLossy}
        </p>

        <h2 className="doc-h2">{t.agent.permTitle}</h2>
        <p className="hint" style={{ marginBottom: 10 }}>
          {t.agent.permLead}
        </p>
        <div className="perms">
          {AGENT_SCOPES.map((scope) => {
            const on = DEFAULT_POLICY.scopes[scope];
            return (
              <div key={scope} className={`perm${on ? "" : " risky"}`}>
                <span className="perm-body">
                  <b>
                    {t.agent.perms[scope]}{" "}
                    <span className="hint">
                      · {lang === "tr" ? "varsayılan" : "default"}: {on ? t.common.on : t.common.off}
                    </span>
                  </b>
                  <span className="hint">{t.agent.perms[`${scope}Desc`]}</span>
                </span>
              </div>
            );
          })}
        </div>

        <h2 className="doc-h2">{t.agentPage.limitsTitle}</h2>
        <ul className="bullets">
          {t.agentPage.limits.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 8 }}>
          rate limit: {AGENT_LIMITS.callsPerWindow} / {AGENT_LIMITS.windowMs / 1000}s ·
          rows ≤ {AGENT_LIMITS.maxRows} · setPixels ≤ {AGENT_LIMITS.maxPixels} ·
          canvas ≤ {AGENT_LIMITS.maxCanvasSide}px · part box ≤ {AGENT_LIMITS.maxRegionSide}px
        </p>

        <h2 className="doc-h2">{t.agentPage.refTitle}</h2>
        <div className="ref">
          {REFERENCE.map(([sig, desc]) => (
            <div key={sig} className="refrow">
              <code>{sig}</code>
              <span className="hint">{desc}</span>
            </div>
          ))}
        </div>

        <h2 className="doc-h2">{t.agent.safetyTitle}</h2>
        <ul className="bullets">
          {t.agent.safety.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
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
