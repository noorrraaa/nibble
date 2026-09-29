<!-- Türkçe: README.tr.md -->

# Nibble

**A pixel art & animation editor that AI agents can actually use — free, no account, no server.**

Nibble runs entirely in your browser. There is no backend, no sign-up, no upload
and no paid tier. Your work lives in your own browser (IndexedDB) and never
leaves it. The only thing the site measures is visits, with cookieless
Cloudflare Web Analytics (aggregate counts, no identification; see `/privacy/`,
Turkish original `/gizlilik/`).

> 1 nibble = 4 bits = 16 values = the classic 16-colour pixel art palette.

## The idea: the AI connects to us, not the other way around

Every other AI pixel art tool sells you generation: you type a prompt, their
server pays for a model call, so they have to charge you. Nibble inverts it.

You bring **your own** browser agent — Claude in Chrome, or anything else that
can run JavaScript on the page — and Nibble hands it a drawing API:

```js
window.nibble.help()      // the handshake: the UI switches to Co-op Mode
```

The agent draws with the same tools you do. Nibble pays for no inference, so it
can stay free forever. `public/llms.txt` is the summary the agent reads;
`/agent/` is the full reference, readable by humans too.

```js
nibble.usePalette("sweetie-16")
nibble.beginBatch("bouncing slime")          // one Ctrl+Z undoes the whole thing
nibble.drawFromText({
  rows: ["..DDDD..", ".DLLLLD.", "DLWLLWLD", ".DDLLDD."],
  legend: { D: 7, L: 6, W: 12 },             // palette index or "#ff0044"
  x: 12, y: 10,
})
nibble.addFrame({ copyFrom: 0 })
nibble.setFps(10)
nibble.endBatch()
nibble.readCanvas()                          // same format it writes — self-checking
```

### The rig: name the parts, move them by name

Redrawing a sprite once per frame is the most expensive way to animate. Name a
chunk of pixels once, then speak in parts:

```js
nibble.definePart({ name: "left_leg", x: 12, y: 24, box: { x: 10, y: 22, w: 5, h: 8 } })
nibble.movePart("left_leg", 0, -2)
nibble.tween({ count: 2 })                   // translation only, on purpose
```

There is **no bone-weighted deformation**. Mesh warping turns pixel art to mud,
so only translation, mirroring and 90° rotations are offered — those are
lossless. Rig parts are exported as Aseprite "slices", so the names survive.

## The agent runs in your page — so the surface is narrow

A browser agent shares the page's JavaScript context; a real sandbox is not
possible, and pretending otherwise would be dishonest. What Nibble does instead:

- **The API exposes only drawing.** Your saved projects, storage, settings and
  any file system access are simply not in it. An agent cannot list, open or
  delete your other work.
- **Scoped permissions.** `draw`, `animate`, `layers`, `palette` are on;
  **`destructive` (resize, newProject, delete…) and `files` (downloads, loading
  images from a URL) are off by default.**
- **A denied call is an answer, not an error.** It returns
  `{ ok: false, deniedScope, hint }` and the editor shows you a request you can
  approve or ignore.
- **Ceilings on everything**: 120 calls / 10s, 512×512 canvas, 2048×2048 per
  part box, 250 000 pixels per call, 4096 rows per `drawFromText`.
- **The remote-image check runs on the resolved URL**, not on a pattern — a
  disguised scheme still resolves to a remote origin, so it still needs `files`.
- **"Disconnect" really deletes `window.nibble`.**
- Every agent call is one undo step, and a live ticker shows you what it did.

## Features

| | |
|---|---|
| Drawing | pencil, eraser, line, rectangle, ellipse (integer Bresenham — no anti-aliasing), flood fill, colour picker, rectangular selection with cut/copy/paste |
| Animation | frames, timeline, onion skin, focus mode (`F`), playback at 5 / 10 / 12.5 / 20 / 25 / 50 fps |
| Structure | project-global layers (the Aseprite model), rig parts & bones, rig ghosts |
| Colour | Sweetie-16 and friends, editable palettes, per-project palette |
| Import | image → pixels (quantised to the palette) |
| Export | PNG, animated GIF, **lossless animated APNG** (own encoder), sprite sheet + Aseprite-compatible JSON that Godot and Unity read, `.nibble` project file |
| Undo | delta-based history — a 50-pixel stroke costs ~400 bytes, not a 64 KB snapshot |
| Files | `.nibble` project files are validated on import: a corrupt or hostile file is rejected with a reason instead of breaking the editor |
| Other | IndexedDB storage, bilingual UI (TR / EN), touch support, keyboard-first |

## Run it

```sh
npm install
npm run dev          # http://localhost:3000
npm test             # 294 tests, no test framework dependency
npm run lint
npm run typecheck
npm run build        # static export → out/   (stop `npm run dev` first: same .next)
```

`out/` is plain static files — any free static host serves it.

## Layout

```
src/
├── app/         landing (/) · editor (/editor/) · agent reference (/agent/)
├── components/  editor-shell · canvas-stage · panels · timeline · dialogs
│                agent-panel · rig-panel · help · ui · icon · pixel-sprite
└── lib/         raster · pixel-document · rig · rig-ops · selection-ops
                 exporters · apng · image-to-pixels · palettes · storage
                 editor-store · agent-api · agent-policy · i18n · showcase-sprites
docs/            PLAN.md · DURUM.md · landing-concept.html
public/          llms.txt (what an agent reads first) · llms-full.txt (full reference) · icons, og.png
```

Tests sit next to the code as `*.test.ts` and run on `node --test` after a
TypeScript compile — no Jest, no Vitest, zero extra dependencies. 294 of them,
and the ones that matter most are the boring ones: the undo contract, APNG byte
layout, `.nibble` file validation, and the permission wall's URL table.

## Notes on some deliberate decisions

- Pixel data never enters React state. If it did, 60 fps drawing would become 5.
- `ctx.arc()` is banned: it anti-aliases. Ellipses are integer Bresenham.
- Valid fps values are exactly those where `100/fps` is a whole number of
  centiseconds — the unit GIF stores frame delay in. `setFps(60)` rounds to 50
  and says so.
- No WebM export: `MediaRecorder` compresses lossily and smears pixel edges.
  APNG covers it losslessly.
- The APNG encoder does not repackage the browser's PNG output — the browser
  picks its own bit depth and palette format, and the difference between frames
  would corrupt the stream.

The long-form reasoning behind these lives in `docs/DURUM.md`.

## Stack

Next.js 15 (static export) · TypeScript · Zustand · Canvas 2D · `gifenc`.
That last one is the only runtime dependency that is not React or Next.
