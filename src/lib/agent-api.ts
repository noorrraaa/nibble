/**
 * Nibble — Ajan API'si (window.nibble)
 *
 * Model: AI bize bağlanır, biz AI'a değil. Kullanıcı kendi tarayıcı ajanını
 * (Claude in Chrome vb.) getirir; bize token maliyeti çıkmaz, site ücretsiz kalır.
 *
 * Bir ajanın 32×32 tuvalde tek tek piksel tıklaması 1024 eylem demektir —
 * pratikte imkânsız. drawFromText ile aynı iş TEK çağrıda biter.
 *
 * GÜVENLİK: her çağrı guard()'dan geçer — izin kapsamı, hız sınırı, yük tavanı.
 * Gerekçeler ve dürüst sınırlar agent-policy.ts başında yazılı.
 *
 * DİL: kullanıcıya görünen her şey TR/EN; bu dosyadaki metinler ajanın okuduğu
 * makine yüzeyi olduğu için İngilizce — modeller İngilizce API metnini en iyi
 * şekilde işliyor ve arayüz diliyle değişmesi ajanı şaşırtır.
 */

import {
  AGENT_LIMITS,
  classifyImageSource,
  clampInt,
  RateLimiter,
  type AgentScope,
} from "./agent-policy";
import { exportApng, exportGif, exportPng, exportSpriteSheet } from "./exporters";
import { imageToPixels, loadImage } from "./image-to-pixels";
import { PALETTES, paletteById } from "./palettes";
import { describeRig } from "./rig";
import {
  clearNodeRegion as clearPartBox,
  defineBone as defineBoneOp,
  defineNode as definePart,
  deleteBone as deleteBoneOp,
  deleteNode as deletePart,
  moveNode as movePart,
  recolorNode as recolorPart,
  renameNode as renamePart,
  rotateNode as rotatePart,
  setNodePos as setPartHandle,
  setNodeRegion as setPartBox,
  transformNode as transformPart,
  tweenFrames,
  type OpResult,
} from "./rig-ops";
import { getPixel } from "./raster";
import { useEditor } from "./editor-store";
import {
  FPS_OPTIONS,
  hexToRgba,
  isHex,
  normaliseHex,
  rgbaToHex,
  type Hex,
  type RGBA,
} from "./types";
import { blankProject } from "./pixel-document";

const CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+=<>?@";

/**
 * Ajan API sürümü. TEK yerde: `version` alanı 2'de kalmışken help() ve konsol
 * "v3" diyordu, yani sürümü programatik okuyan bir ajan yanlış cevap alıyordu.
 */
export const API_VERSION = 3;

interface Ok {
  ok: true;
  hint?: string;
  [k: string]: unknown;
}
interface Fail {
  ok: false;
  error: string;
  hint?: string;
  deniedScope?: AgentScope;
  retryAfterMs?: number;
}
type Result = Ok | Fail;

const fail = (error: string, hint?: string): Fail => ({ ok: false, error, hint });

const SCOPE_LABEL: Record<AgentScope, string> = {
  draw: "draw",
  animate: "animate",
  layers: "layers",
  palette: "palette",
  destructive: "destructive",
  files: "files",
};

export function installAgentApi(): () => void {
  if (typeof window === "undefined") return () => {};

  const st = () => useEditor.getState();
  const doc = () => st().doc;
  const limiter = new RateLimiter();

  let handshaken = false;
  function handshake(call: string) {
    const s = st();
    if (!handshaken) {
      handshaken = true;
      s.setAgentConnected(true);
      s.pushAgentLog("agent connected — Co-op Mode on");
    }
    s.pushAgentLog(call);
  }

  /**
   * Her çağrının tek kapısı. Sırayla: ana şalter → hız sınırı → izin kapsamı.
   * Reddedilen çağrı istisna fırlatmaz; ajan ok:false görüp kendini düzeltsin.
   */
  function guard<T>(
    scope: AgentScope | null,
    call: string,
    fn: () => T,
  ): T | Fail {
    const s = st();

    if (!s.agentPolicy.enabled) {
      return {
        ok: false,
        error: "Agent access is switched off by the user.",
        hint: "Ask the user to re-enable agents from the Agent panel in the editor.",
      };
    }

    if (!limiter.take()) {
      const retryAfterMs = limiter.retryAfterMs();
      s.pushAgentLog(`${call} — rate limited`, true);
      return {
        ok: false,
        error: `Rate limit: max ${AGENT_LIMITS.callsPerWindow} calls per ${AGENT_LIMITS.windowMs / 1000}s.`,
        hint: "Batch your work — drawFromText draws a whole sprite in one call.",
        retryAfterMs,
      };
    }

    if (scope && !s.agentPolicy.scopes[scope]) {
      handshake(`${call} — denied (${SCOPE_LABEL[scope]})`);
      st().pushAgentLog(`denied: ${SCOPE_LABEL[scope]}`, true);
      st().requestAgentScope(scope, call);
      return {
        ok: false,
        error: `Permission "${SCOPE_LABEL[scope]}" is not granted.`,
        hint: "The user has been shown a request in the editor. Ask them to allow it, then retry. Do not try to work around this.",
        deniedScope: scope,
      };
    }

    handshake(call);

    /**
     * Son kapı: beklenmedik bir istisna ajana FIRLATILMAZ.
     * API'nin sözleşmesi "her çağrı bir cevap döner"; içeriden gelen bir
     * hatanın (bozuk girdi, tampon ayrılamaması) bunu bozması ajanı kör
     * bırakıyor ve kullanıcı da tuvalde yarım iş görüyor.
     */
    try {
      return fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      st().pushAgentLog(`${call} — failed: ${message}`, true);
      return {
        ok: false,
        error: message,
        hint: "The call was rejected before finishing. Check your arguments — nothing was left half-applied.",
      };
    }
  }

  /**
   * async metodlar için kapı: geçerse null, geçmezse Fail.
   * (guard() sarmalayamıyoruz çünkü await'ten önce izni ölçmek gerekiyor.)
   */
  function checkGate(scope: AgentScope | null, call: string): Fail | null {
    const r = guard<null>(scope, call, () => null);
    return r === null ? null : r;
  }

  /**
   * rig-ops sonucunu ajan sözleşmesine çevirir.
   * rig-ops arayüzle paylaşıldığı için kendi OpResult'ını döndürüyor;
   * burada Result'a çevirip store'u tazeliyoruz.
   */
  function rigOp(res: OpResult): Result {
    if (!res.ok) {
      return { ok: false, error: res.error ?? "Rig operation failed", hint: res.hint };
    }
    st().bump();
    const { ok: _ok, error: _err, ...rest } = res;
    return { ok: true, ...rest };
  }

  /**
   * Ajanın dokunduğu yeri tuvalde işaretler. "AI bir şeyler yaptı" hissi
   * yerine NEREDE yaptığını göstermek güveni değiştiriyor.
   */
  function markAgent(x: number, y: number, label: string) {
    st().setAgentCursor({ x: Math.round(x), y: Math.round(y), label });
  }

  /**
   * Ajanın tüm değişikliği TEK undo adımı olur — yoksa 200 adımlık çöplük oluşur.
   *
   * "Açık batch var mı" sorusunu belgeye soruyoruz, burada yerel bir bayrak
   * tutmuyoruz: iki kaynak (yerel bayrak + belgenin durumu) ayrışabiliyor
   * (newProject belgeyi sıfırlıyor, bayrak açık kalıyordu) ve ayrıştığı anda
   * çizimler geçmişe hiç girmiyor.
   */
  function withBatch<T>(label: string, fn: () => T): T {
    const d = doc();
    if (d.batching) return fn();
    d.beginBatch(label);
    const out = fn();
    d.endBatch();
    d.notify("pixels");
    st().bump();
    return out;
  }

  function resolveColor(c: number | string | null | undefined): RGBA | null {
    if (c === null || c === undefined) return null;
    if (typeof c === "number") {
      const pal = doc().project.palette;
      const hex = pal[c];
      if (!hex) return null;
      return hexToRgba(hex);
    }
    const s = String(c).trim().toLowerCase();
    if (s === "transparent" || s === "none" || s === ".") return [0, 0, 0, 0];
    if (isHex(s)) return hexToRgba(s);
    return null;
  }

  function targets(frame?: number, layer?: string) {
    const s = st();
    const d = s.doc;
    const fi = frame ?? s.activeFrame;
    const f = d.project.frames[fi];
    if (!f) return null;
    const layerId = layer ?? s.activeLayerId;
    if (!d.layer(layerId)) return null;
    return { d, frameId: f.id, layerId, frameIndex: fi };
  }

  /** Kilitli katman ajana da kapalı — kullanıcı kilidi bir sebeple attı */
  function lockedCheck(layerId: string): Fail | null {
    const l = doc().layer(layerId);
    if (!l) return fail(`Layer not found: ${layerId}`);
    if (l.locked)
      return fail(
        `Layer "${l.name}" is locked by the user.`,
        "Draw on another layer, or ask the user to unlock it.",
      );
    return null;
  }

  function stateSummary() {
    const s = st();
    const d = s.doc;
    const p = d.project;
    const buf = d.composite(s.activeFrame);
    let filled = 0;
    for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) filled++;
    return {
      name: p.name,
      canvas: `${p.width}×${p.height}`,
      width: p.width,
      height: p.height,
      frameCount: p.frames.length,
      activeFrame: s.activeFrame,
      fps: p.fps,
      layers: p.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
      })),
      activeLayerId: s.activeLayerId,
      palette: p.palette,
      filledPixels: filled,
      emptyCanvas: filled === 0,
      rigParts: (d.rig?.nodes ?? []).map((n) => n.name),
      permissions: { ...s.agentPolicy.scopes },
    };
  }

  function contextHint(): string {
    const s = stateSummary();
    if (s.emptyCanvas)
      return `Empty ${s.canvas} canvas. Draw the whole sprite with one drawFromText call — do not send pixels one at a time.`;
    if (s.frameCount === 1)
      return s.rigParts.length
        ? `Frame 0 has content and ${s.rigParts.length} named parts (${s.rigParts.join(", ")}). addFrame({ copyFrom: 0 }) then movePart(...) is the fast way to animate.`
        : `Frame 0 has content. help("rig") shows how to name parts so you can move them by name instead of redrawing — that is the cheapest way to animate.`;
    if (s.rigParts.length)
      return `${s.frameCount} frames, parts: ${s.rigParts.join(", ")}. tween({ count }) fills in-betweens from the handle positions.`;
    return `${s.frameCount} frames. exportGif() downloads the animation (needs the "files" permission).`;
  }

  const TOPICS: Record<string, string> = {
    drawing: `
DRAWING  — permission: "draw"
  drawFromText({ rows, legend, x?, y?, frame?, layer? })
    rows   : string[] — one character per pixel, "." is transparent
    legend : { "A": 3 } (palette index) or { "A": "#ff0044" }
    x, y   : top-left corner (default 0,0)
    → THE PREFERRED METHOD. One sprite = one call.

  setPixels([{ x, y, c }, ...])   c = palette index | hex | "transparent"
    → Bulk. Never call it once per pixel; send hundreds in one array.

  fill(x, y, c, { contiguous?, tolerance? })   flood fill
  clearFrame(frame?)                           clear every layer of a frame
  readCanvas(frame?)  → { width, height, legend, rows }
    → Exactly the format you write. Read back what you drew and correct
      yourself; no screenshots needed.

  Limits: ${AGENT_LIMITS.maxRows} rows, ${AGENT_LIMITS.maxRowLength} chars per row,
  ${AGENT_LIMITS.maxPixels} pixels per setPixels call.`,

    animation: `
ANIMATION  — permission: "animate"
  addFrame({ copyFrom? })  → new frame index (blank unless copyFrom is given)
  duplicateFrame(i)        → index of the copy
  setActiveFrame(i)
  setFrameDuration(i, centiseconds)
  setFps(fps)   valid: ${FPS_OPTIONS.join(", ")}
    → GIF delay is in centiseconds (1/100 s), so fps must divide 100.
      Ask for 60 and it rounds to 50.
  play() / pause()
  deleteFrame(i)   — permission: "destructive"

  Typical flow: draw frame 0 → addFrame({ copyFrom: 0 }) → change it → repeat → exportGif()`,

    palette: `
PALETTE  — permission: "palette"
  getPalette()            → hex[]        (no permission needed)
  listPalettes()          → ${PALETTES.map((p) => p.id).join(", ")}
  setPalette(["#..", ...])
  usePalette(id)          load a built-in palette
    → Palette indices work in a legend: legend { "A": 3 } = colour 3 of the palette.`,

    export: `
EXPORT  — permission: "files"  (off by default; the user must allow it)
  exportGif()                       → downloads the animation (256 colours, 1-bit alpha)
  exportApng()                      → lossless animation, full RGBA transparency
  exportPng({ scale?, frame? })     → single frame
  exportSpriteSheet({ columns? })   → PNG + Aseprite-compatible JSON
    → Rig parts are written into the JSON as Aseprite "slices" (name + per-frame
      bounds + pivot), so Godot/Unity importers see your named parts.`,

    project: `
PROJECT
  addLayer(name?) / setLayer(id, { visible?, opacity?, locked?, name? })  — "layers"
  importImage(dataUrlOrUrl, { size?, palette?, dither?, removeBackground? })
    → data: and blob: sources are always allowed; http(s) URLs need "files".
  undo() / redo()
  beginBatch(label) / endBatch()
    → Everything between them becomes ONE undo step. Use it for multi-step work
      so the user can undo you with a single Ctrl+Z.

  Destructive — permission: "destructive", off by default:
  newProject({ width, height, palette? }) · resize(w, h) · deleteFrame(i) · deleteLayer(id)`,

    rig: `
RIG — name the parts, then move them by name  — permission: "draw"

  This is the highest-leverage part of the API. Instead of recomputing pixels,
  name a chunk of the sprite once and then say what should happen to it.

  A part = a named HANDLE (a point, keyed per frame) plus an optional BOX
  (a rectangle of pixels that travels with the handle).

  definePart({ name, x, y, box?: { x, y, w, h } })
  setPartBox(name, { x, y, w, h })      attach pixels to an existing part
  clearPartBox(name)                    handle only from now on
  setPartHandle(name, x, y)             move the handle, LEAVE pixels behind
                                        (this is how you key a pose)
  movePart(name, dx, dy, { allLayers? })  move handle AND pixels — one undo step
  flipPart(name, "x" | "y")             lossless
  rotatePart(name, degrees)             90° multiples lossless; other angles are
                                        nearest-neighbour and lose detail
  recolorPart(name, { to, from?, tolerance? })
                                        from omitted = repaint every solid pixel
  deletePart(name) / renamePart(from, to)
  defineBone({ name, from, to }) / deleteBone(name)
                                        a bone is a named link between two parts;
                                        it draws a line and records what is
                                        attached to what
  getRig() / describeRig()              describeRig() also tells you which parts
                                        are missing a handle or a box

  tween({ from?, count, allLayers? })   — permission: "animate"
    Interpolates handle positions between a frame and the next one and inserts
    "count" in-between frames, translating each part's pixels.
    NOTE: allLayers defaults to TRUE here — an in-between frame with only one
    layer moved would look broken. movePart defaults to false (this layer only).
    TRANSLATION ONLY — no squashing or bending, because deforming pixel art
    turns it to mud. Expect to touch up the in-betweens by hand.

  Typical walk cycle:
    definePart({ name: "left_leg", x: 12, y: 24, box: { x: 10, y: 22, w: 5, h: 8 } })
    definePart({ name: "right_leg", x: 20, y: 24, box: { x: 18, y: 22, w: 5, h: 8 } })
    addFrame({ copyFrom: 0 })
    movePart("left_leg", 0, -2)
    movePart("right_leg", 0, 2)
    setActiveFrame(0); tween({ count: 2 })`,

    permissions: `
PERMISSIONS
  getPermissions() → { enabled, scopes }
  The user owns these switches. draw / animate / layers / palette are on by
  default; destructive and files are off. A denied call returns
  ok:false with deniedScope set, and the editor shows the user a request.
  Retry after they allow it. Never attempt to bypass a denial — the site is
  designed so the user stays in control, and everything you do is one Ctrl+Z
  away from being undone anyway.`,
  };

  const api = {
    /** help(), konsol başlığı, /agent sayfası ve llms.txt ile AYNI olmalı */
    version: API_VERSION,

    // ── keşif (izin gerekmez) ──
    help(topic?: string): unknown {
      return guard(null, topic ? `help("${topic}")` : "help()", () => {
        if (topic && TOPICS[topic]) {
          return { topic, doc: TOPICS[topic].trim(), state: stateSummary() };
        }
        return {
          name: "Nibble Agent API",
          version: API_VERSION,
          state: stateSummary(),
          topics: Object.keys(TOPICS),
          quickstart: [
            'nibble.usePalette("sweetie-16")',
            'nibble.drawFromText({ rows: ["..AA..", ".AAAA.", "AABBAA"], legend: { A: 3, B: 7 }, x: 4, y: 6 })',
            "nibble.addFrame({ copyFrom: 0 })",
            'nibble.definePart({ name: "head", x: 16, y: 8, box: { x: 10, y: 3, w: 12, h: 10 } })',
            'nibble.movePart("head", 0, -1)',
            "nibble.readCanvas()",
          ],
          rules: [
            "Never send pixels one by one — use drawFromText or setPixels in bulk.",
            "Wrap multi-step work in beginBatch(label) / endBatch().",
            "Call readCanvas() to see what you drew; no screenshots needed.",
            "Some calls need permission from the user. A denial is an answer, not an obstacle to route around.",
            'To animate, name the moving parts once with definePart() and then movePart() them — see help("rig"). Redrawing a whole sprite per frame is the slow way.',
          ],
          permissions: { ...st().agentPolicy.scopes },
          hint: contextHint(),
          more: 'help("drawing") | help("animation") | help("rig") | help("palette") | help("export") | help("project") | help("permissions")',
        };
      });
    },

    getState() {
      return guard(null, "getState()", () => ({ ok: true as const, ...stateSummary() }));
    },

    getPermissions() {
      return guard(null, "getPermissions()", () => {
        const p = st().agentPolicy;
        return {
          ok: true as const,
          enabled: p.enabled,
          scopes: { ...p.scopes },
          hint: "Scopes that are false will reject calls. Ask the user to enable them in the editor's Agent panel.",
        };
      });
    },

    describe() {
      return guard(null, "describe()", () => {
        const s = stateSummary();
        const observations: string[] = [];
        if (s.emptyCanvas) observations.push("The active frame is completely empty.");
        if (s.frameCount > 1) observations.push(`${s.frameCount} frames at ${s.fps} fps.`);
        if (s.layers.some((l) => !l.visible))
          observations.push("A layer is hidden — it will not appear in exports.");
        if (s.layers.some((l) => l.locked))
          observations.push("A layer is locked — you cannot draw on it.");
        return { ok: true as const, ...s, observations, hint: contextHint() };
      });
    },

    readCanvas(frame?: number): Result {
      return guard(null, `readCanvas(${frame ?? ""})`, (): Result => {
        const s = st();
        const d = s.doc;
        const fi = frame ?? s.activeFrame;
        if (!d.project.frames[fi]) return fail(`No frame ${fi}`);
        const buf = d.composite(fi);
        const { width, height } = d.project;

        const legend: Record<string, string> = { ".": "transparent" };
        const map = new Map<string, string>();
        const rows: string[] = [];
        let next = 0;

        for (let y = 0; y < height; y++) {
          let row = "";
          for (let x = 0; x < width; x++) {
            const c = getPixel(buf, x, y, width, height);
            if (c[3] === 0) {
              row += ".";
              continue;
            }
            const hex = rgbaToHex(c);
            let ch = map.get(hex);
            if (!ch) {
              if (next >= CHARS.length) {
                ch = "?";
              } else {
                ch = CHARS[next++];
                map.set(hex, ch);
                legend[ch] = hex;
              }
            }
            row += ch;
          }
          rows.push(row);
        }
        return { ok: true, width, height, frame: fi, legend, rows };
      }) as Result;
    },

    // ── çizim ──
    drawFromText(opts: {
      rows: string[];
      legend: Record<string, number | string>;
      x?: number;
      y?: number;
      frame?: number;
      layer?: string;
    }): Result {
      return guard("draw", `drawFromText(${opts?.rows?.length ?? 0} rows)`, (): Result => {
        if (!Array.isArray(opts?.rows) || !opts.rows.length)
          return fail("rows is empty", 'Example: rows: ["..AA..", ".AAAA."]');
        if (opts.rows.length > AGENT_LIMITS.maxRows)
          return fail(`Too many rows (max ${AGENT_LIMITS.maxRows})`);
        if (opts.rows.some((r) => typeof r !== "string" || r.length > AGENT_LIMITS.maxRowLength))
          return fail(`Every row must be a string of at most ${AGENT_LIMITS.maxRowLength} characters`);

        const legendEntries = Object.entries(opts.legend ?? {});
        if (legendEntries.length > AGENT_LIMITS.maxLegendEntries)
          return fail(`Legend too large (max ${AGENT_LIMITS.maxLegendEntries} entries)`);

        const t = targets(opts.frame, opts.layer);
        if (!t) return fail("Frame or layer not found");
        const locked = lockedCheck(t.layerId);
        if (locked) return locked;

        const ox = clampInt(opts.x ?? 0, -4096, 4096, 0);
        const oy = clampInt(opts.y ?? 0, -4096, 4096, 0);
        const legend: Record<string, RGBA> = {};
        for (const [k, v] of legendEntries) {
          const c = resolveColor(v);
          if (!c)
            return fail(
              `Could not resolve legend colour "${k}": ${String(v)}`,
              "Expected a palette index (number) or #rrggbb",
            );
          legend[k] = c;
        }

        const { width, height } = t.d.project;
        let painted = 0;
        let outOfBounds = 0;

        withBatch("AI: drawFromText", () => {
          // renge göre grupla → renk başına tek paint çağrısı (buffer'a tek dokunuş)
          const byChar = new Map<string, { x: number; y: number }[]>();
          opts.rows.forEach((row, ry) => {
            [...row].forEach((ch, rx) => {
              if (ch === "." || ch === " ") return;
              if (!legend[ch]) return;
              const px = ox + rx;
              const py = oy + ry;
              if (px < 0 || py < 0 || px >= width || py >= height) {
                outOfBounds++;
                return;
              }
              const list = byChar.get(ch) ?? [];
              list.push({ x: px, y: py });
              byChar.set(ch, list);
            });
          });
          for (const [ch, pts] of byChar) {
            t.d.paint(pts, legend[ch], t.frameId, t.layerId);
            painted += pts.length;
          }
        });

        markAgent(ox + (opts.rows[0]?.length ?? 1) / 2, oy + opts.rows.length / 2, "drawFromText");

        const hints: string[] = [];
        if (outOfBounds)
          hints.push(`${outOfBounds} pixels fell outside the ${width}×${height} canvas.`);
        hints.push(contextHint());
        return { ok: true, painted, outOfBounds, hint: hints.join(" ") };
      }) as Result;
    },

    setPixels(
      pixels: { x: number; y: number; c: number | string }[],
      frame?: number,
      layer?: string,
    ): Result {
      return guard("draw", `setPixels(${pixels?.length ?? 0})`, (): Result => {
        if (!Array.isArray(pixels)) return fail("pixels must be an array");
        if (pixels.length > AGENT_LIMITS.maxPixels)
          return fail(`Too many pixels (max ${AGENT_LIMITS.maxPixels} per call)`);
        const t = targets(frame, layer);
        if (!t) return fail("Frame or layer not found");
        const locked = lockedCheck(t.layerId);
        if (locked) return locked;

        let painted = 0;
        if (pixels.length) markAgent(pixels[0]?.x ?? 0, pixels[0]?.y ?? 0, "setPixels");
        withBatch("AI: setPixels", () => {
          // renge göre grupla — 10.000 tek tek paint çağrısı yerine renk başına bir tane
          const byColor = new Map<string, { c: RGBA; pts: { x: number; y: number }[] }>();
          for (const p of pixels) {
            const c = resolveColor(p?.c);
            if (!c) continue;
            const key = c.join(",");
            const slot = byColor.get(key) ?? { c, pts: [] };
            slot.pts.push({ x: p.x | 0, y: p.y | 0 });
            byColor.set(key, slot);
          }
          for (const { c, pts } of byColor.values()) {
            t.d.paint(pts, c, t.frameId, t.layerId);
            painted += pts.length;
          }
        });
        return {
          ok: true,
          painted,
          hint:
            pixels.length < 5
              ? "Fine for a few pixels, but drawFromText is far more efficient for real sprites."
              : contextHint(),
        };
      }) as Result;
    },

    fill(
      x: number,
      y: number,
      c: number | string,
      opts?: { contiguous?: boolean; tolerance?: number },
    ): Result {
      return guard("draw", `fill(${x},${y})`, (): Result => {
        const t = targets();
        if (!t) return fail("Frame or layer not found");
        const locked = lockedCheck(t.layerId);
        if (locked) return locked;
        const color = resolveColor(c);
        if (!color) return fail(`Could not resolve colour: ${String(c)}`);
        markAgent(x, y, "fill");
        withBatch("AI: fill", () =>
          t.d.bucket(x | 0, y | 0, color, t.frameId, t.layerId, {
            contiguous: opts?.contiguous ?? true,
            tolerance: clampInt(opts?.tolerance ?? 0, 0, 255, 0),
          }),
        );
        return { ok: true, hint: contextHint() };
      }) as Result;
    },

    clearFrame(frame?: number): Result {
      return guard("draw", `clearFrame(${frame ?? ""})`, (): Result => {
        const t = targets(frame);
        if (!t) return fail("Frame not found");
        withBatch("AI: clearFrame", () => {
          for (const l of t.d.layers) if (!l.locked) t.d.clearCel(t.frameId, l.id);
        });
        return { ok: true, hint: "Locked layers were left untouched." };
      }) as Result;
    },

    // ── palet ──
    getPalette() {
      return guard(null, "getPalette()", () => ({
        ok: true as const,
        palette: doc().project.palette,
      }));
    },
    listPalettes() {
      return guard(null, "listPalettes()", () => ({
        ok: true as const,
        palettes: PALETTES.map((p) => ({ id: p.id, name: p.name, colors: p.colors.length })),
      }));
    },
    setPalette(colors: Hex[]): Result {
      return guard("palette", `setPalette(${colors?.length ?? 0})`, (): Result => {
        if (!Array.isArray(colors) || !colors.length) return fail("Expected an array of colours");
        if (colors.length > AGENT_LIMITS.maxPaletteColors)
          return fail(`Too many colours (max ${AGENT_LIMITS.maxPaletteColors})`);
        // isHex: yalnızca 3/6/8 hane. Eski `{3,8}` aralığı 4/5/7 haneyi de
        // kabul ediyordu ve hiçbir ayrıştırıcı onları doğru çözemiyor —
        // "#12345" sessizce yanlış renge dönüşüyordu.
        // normaliseHex: palet doğrudan CSS'e yazılıyor, `#`'siz "f0a" geçersiz
        // renk olup swatch'ı boş bırakıyor.
        const clean = colors.filter(isHex).map(normaliseHex);
        if (!clean.length)
          return fail(
            "No valid colours in the array",
            "Use #rgb, #rrggbb or #rrggbbaa — other lengths are not valid hex.",
          );
        doc().setPalette(clean);
        st().bump();
        return { ok: true, count: clean.length };
      }) as Result;
    },
    usePalette(id: string): Result {
      return guard("palette", `usePalette("${id}")`, (): Result => {
        const def = paletteById(id);
        if (!def)
          return fail(`No such palette: ${id}`, `Valid: ${PALETTES.map((p) => p.id).join(", ")}`);
        doc().setPalette(def.colors);
        st().setPaletteId(def.id);
        st().bump();
        return {
          ok: true,
          palette: def.colors,
          hint: "You can now use indices in a legend: { A: 3 }",
        };
      }) as Result;
    },

    // ── animasyon ──
    addFrame(opts?: { copyFrom?: number }): Result {
      return guard("animate", "addFrame()", (): Result => {
        const d = doc();
        // Aralık dışı copyFrom'u sessizce yutmuyoruz: eskiden dönen indeks
        // gerçekte eklenen yerle uyuşmuyordu ve ajan olmayan bir kareyi
        // hedeflemeye çalışıyordu.
        if (opts?.copyFrom !== undefined && !d.frames[opts.copyFrom])
          return fail(
            `No frame ${opts.copyFrom} to copy from (there are ${d.frames.length})`,
            "Pass an existing frame index, or omit copyFrom for a blank frame.",
          );
        // copyFrom verilmediyse BOŞ kare — duplicateFrame'den farkı bu
        const index = d.addFrame(opts?.copyFrom);
        st().setActiveFrame(index);
        st().bump();
        return {
          ok: true,
          index,
          frameCount: d.frames.length,
          hint:
            opts?.copyFrom === undefined
              ? "Blank frame added and made active. Pass { copyFrom: n } to start from a copy instead."
              : "Copied frame is now active. Draw your changes here.",
        };
      }) as Result;
    },
    duplicateFrame(i: number): Result {
      return guard("animate", `duplicateFrame(${i})`, (): Result => {
        const d = doc();
        if (!d.frames[i]) return fail(`No frame ${i}`);
        const index = d.addFrame(i);
        st().setActiveFrame(index);
        st().bump();
        return { ok: true, index };
      }) as Result;
    },
    setActiveFrame(i: number): Result {
      return guard("animate", `setActiveFrame(${i})`, (): Result => {
        if (!doc().frames[i]) return fail(`No frame ${i}`);
        st().setActiveFrame(i);
        return { ok: true, activeFrame: i };
      }) as Result;
    },
    setFrameDuration(i: number, centiseconds: number): Result {
      return guard("animate", `setFrameDuration(${i})`, (): Result => {
        if (!doc().frames[i]) return fail(`No frame ${i}`);
        doc().setFrameDuration(i, clampInt(centiseconds, 1, 1000, 10));
        st().bump();
        return { ok: true, hint: "Duration is in centiseconds (1/100 s), the GIF unit." };
      }) as Result;
    },
    setFps(fps: number): Result {
      return guard("animate", `setFps(${fps})`, (): Result => {
        const valid = FPS_OPTIONS as readonly number[];
        const chosen = valid.includes(fps)
          ? fps
          : valid.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
        doc().setFps(chosen);
        st().bump();
        return {
          ok: true,
          fps: chosen,
          hint:
            chosen !== fps
              ? `${fps} fps cannot be expressed exactly in a GIF (delays are centiseconds), rounded to ${chosen}.`
              : undefined,
        };
      }) as Result;
    },
    play(): Result {
      return guard("animate", "play()", (): Result => {
        st().patch({ playing: true });
        return { ok: true };
      }) as Result;
    },
    pause(): Result {
      return guard("animate", "pause()", (): Result => {
        st().patch({ playing: false });
        return { ok: true };
      }) as Result;
    },

    // ── katman ──
    addLayer(name?: string): Result {
      return guard("layers", "addLayer()", (): Result => {
        const clean = typeof name === "string" ? name.slice(0, 60) : undefined;
        const id = doc().addLayer(clean);
        st().setActiveLayer(id);
        st().bump();
        return { ok: true, id };
      }) as Result;
    },
    setLayer(
      id: string,
      props: { visible?: boolean; opacity?: number; locked?: boolean; name?: string },
    ): Result {
      return guard("layers", "setLayer()", (): Result => {
        if (!doc().layer(id)) return fail(`No such layer: ${id}`);
        doc().setLayerProps(id, {
          ...(typeof props?.visible === "boolean" ? { visible: props.visible } : {}),
          ...(typeof props?.locked === "boolean" ? { locked: props.locked } : {}),
          ...(typeof props?.opacity === "number"
            ? { opacity: Math.max(0, Math.min(1, props.opacity)) }
            : {}),
          ...(typeof props?.name === "string" ? { name: props.name.slice(0, 60) } : {}),
        });
        st().bump();
        return { ok: true };
      }) as Result;
    },

    // ── yıkıcı (varsayılan kapalı) ──
    deleteFrame(i: number): Result {
      return guard("destructive", `deleteFrame(${i})`, (): Result => {
        const d = doc();
        if (!d.deleteFrame(i)) return fail("Could not delete (the last frame must stay)");
        st().setActiveFrame(Math.min(i, d.frames.length - 1));
        st().bump();
        return { ok: true, frameCount: d.frames.length };
      }) as Result;
    },
    deleteLayer(id: string): Result {
      return guard("destructive", "deleteLayer()", (): Result => {
        // aktif katmanı yalnızca SİLİNEN o ise değiştiriyoruz; eskiden her
        // silmede odak en üste kayıyor ve kullanıcı başka katmana çiziyordu
        const wasActive = st().activeLayerId === id;
        if (!doc().deleteLayer(id)) return fail("Could not delete (the last layer must stay)");
        if (wasActive) st().setActiveLayer(doc().layers[doc().layers.length - 1].id);
        st().bump();
        return { ok: true };
      }) as Result;
    },
    newProject(opts?: { width?: number; height?: number; palette?: Hex[]; name?: string }): Result {
      return guard("destructive", "newProject()", (): Result => {
        const max = AGENT_LIMITS.maxCanvasSide;
        const w = clampInt(opts?.width ?? 32, 1, max, 32);
        const h = clampInt(opts?.height ?? 32, 1, max, 32);
        const s = st();
        const p = blankProject(
          w,
          h,
          Array.isArray(opts?.palette) && opts.palette.length
            ? opts.palette
            : s.doc.project.palette,
          typeof opts?.name === "string" ? opts.name.slice(0, 80) : "Untitled",
        );
        s.doc.replaceProject(p);
        s.patch({ activeFrame: 0, activeLayerId: p.layers[0].id });
        s.bump();
        return { ok: true, canvas: `${w}×${h}` };
      }) as Result;
    },
    resize(width: number, height: number): Result {
      return guard("destructive", `resize(${width},${height})`, (): Result => {
        const max = AGENT_LIMITS.maxCanvasSide;
        const w = clampInt(width, 1, max, 32);
        const h = clampInt(height, 1, max, 32);
        doc().resize(w, h);
        // eski seçim yeni tuvale göre anlamsız (kenar dışında kalabilir)
        st().setSelection(null);
        st().bump();
        return { ok: true, canvas: `${w}×${h}`, hint: "Resizing clears the undo history." };
      }) as Result;
    },

    // ── görsel içe aktarma ──
    async importImage(
      src: string,
      opts?: { size?: number; palette?: Hex[]; dither?: boolean; removeBackground?: boolean },
    ): Promise<Result> {
      const verdict = classifyImageSource(src);
      if (verdict.kind === "rejected") {
        st().pushAgentLog(`importImage — rejected: ${verdict.reason}`, true);
        return fail(verdict.reason, "Only data:image/*, blob: and same-origin paths are accepted.");
      }
      // uzak URL dış dünyaya istek demek → "files" izni gerekir
      const scope: AgentScope | null = verdict.kind === "needs-files" ? "files" : "draw";

      const gate = checkGate(scope, "importImage()");
      if (gate) return gate;

      try {
        const img = await loadImage(src);
        const d = doc();
        const size = clampInt(
          opts?.size ?? Math.max(d.width, d.height),
          1,
          AGENT_LIMITS.maxCanvasSide,
          64,
        );
        const res = imageToPixels(img, {
          size,
          palette: opts?.palette,
          dither: opts?.dither ?? true,
          removeBackground: opts?.removeBackground ?? false,
        });
        if (res.width !== d.width || res.height !== d.height) {
          if (!st().agentPolicy.scopes.destructive) {
            return fail(
              `The image needs a ${res.width}×${res.height} canvas but the project is ${d.width}×${d.height}, and resizing needs the "destructive" permission.`,
              "Pass { size } that matches the current canvas, or ask the user to allow destructive actions.",
            );
          }
          d.resize(res.width, res.height);
          st().setSelection(null);
        }
        const t = targets();
        if (!t) return fail("No target layer");
        const locked = lockedCheck(t.layerId);
        if (locked) return locked;
        withBatch("AI: importImage", () => t.d.writeCel(t.frameId, t.layerId, res.data));
        if (!opts?.palette && st().agentPolicy.scopes.palette) d.setPalette(res.palette);
        st().bump();
        return {
          ok: true,
          canvas: `${res.width}×${res.height}`,
          colors: res.palette.length,
          hint: "Automatic conversion is a starting point — expect to clean it up by hand.",
        };
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Could not import the image");
      }
    },

    // ── geçmiş ──
    beginBatch(label = "AI"): Result {
      return guard("draw", `beginBatch("${String(label).slice(0, 60)}")`, (): Result => {
        doc().beginBatch(String(label).slice(0, 60));
        return { ok: true, hint: "Remember endBatch() — otherwise the changes never reach history." };
      }) as Result;
    },
    endBatch(): Result {
      return guard("draw", "endBatch()", (): Result => {
        const d = doc();
        d.endBatch();
        d.notify("pixels");
        st().bump();
        return { ok: true, hint: "The user can undo this whole block with one Ctrl+Z." };
      }) as Result;
    },
    undo(): Result {
      return guard("draw", "undo()", (): Result => {
        doc().undo();
        st().bump();
        return { ok: true };
      }) as Result;
    },
    redo(): Result {
      return guard("draw", "redo()", (): Result => {
        doc().redo();
        st().bump();
        return { ok: true };
      }) as Result;
    },

    /* ── iskelet (rig) ───────────────────────────────────────
     *
     * Bu bölüm ürünün asıl kozu: ajan "sol kolu iki piksel aşağı al"
     * diyebiliyor, 1024 pikseli tek tek hesaplamak zorunda kalmıyor.
     * Bir parça = adı olan tutamak + (isteğe bağlı) piksel kutusu.
     */
    getRig() {
      return guard(null, "getRig()", () => ({
        ok: true as const,
        rig: doc().rig ?? { nodes: [], bones: [] },
      }));
    },

    describeRig() {
      return guard(null, "describeRig()", () => {
        const d = doc();
        const info = describeRig(
          d.rig,
          d.frames.map((f) => f.id),
          st().activeFrame,
          { width: d.width, height: d.height },
        );
        const unplaced = info.nodes.filter((n) => !n.at).map((n) => n.name);
        const outside = info.nodes.filter((n) => n.offCanvas).map((n) => n.name);
        const boxless = info.nodes.filter((n) => n.at && !n.region).map((n) => n.name);
        return {
          ok: true as const,
          ...info,
          frame: st().activeFrame,
          hint: outside.length
            ? `These parts sit outside the ${d.width}×${d.height} canvas and cannot be grabbed: ${outside.join(", ")}. Their data is intact — setPartHandle() them back inside.`
            : !info.nodes.length
            ? 'No parts defined yet. definePart({ name: "head", x, y, region }) names a chunk of the sprite so you can move it by name instead of by pixel.'
            : boxless.length
              ? `These parts have no box, so movePart only moves the handle: ${boxless.join(", ")}. Give them one with setPartBox().`
              : unplaced.length
                ? `These parts have no handle on this frame: ${unplaced.join(", ")}.`
                : "Every part is placed and boxed. movePart / flipPart / rotatePart / recolorPart all work by name.",
        };
      });
    },

    definePart(opts: {
      name: string;
      x: number;
      y: number;
      region?: { dx: number; dy: number; w: number; h: number };
      box?: { x: number; y: number; w: number; h: number };
    }): Result {
      return guard("draw", `definePart("${opts?.name ?? ""}")`, (): Result => {
        if (!opts?.name) return fail("name is required");
        const max = AGENT_LIMITS.maxCanvasSide;
        const x = clampInt(opts.x, -max, max, 0);
        const y = clampInt(opts.y, -max, max, 0);
        // hem göreli (region) hem mutlak (box) kabul ediyoruz — ajan hangisini
        // düşünüyorsa onu yazsın, dönüşümü biz yapalım
        // İKİSİ DE kırpılır. Bir dönem yalnızca `box` kırpılıyordu ve `region`
        // doğrudan geçtiği için {w:100000,h:100000} gibi bir kutu depoya
        // giriyordu; ilk movePart'ta tarayıcı tampon ayıramayıp istisna
        // fırlatıyor ve açık kalan batch geçmişi öldürüyordu.
        const region = opts.region
          ? {
              dx: clampInt(opts.region.dx, -max, max, 0),
              dy: clampInt(opts.region.dy, -max, max, 0),
              w: clampInt(opts.region.w, 1, max, 1),
              h: clampInt(opts.region.h, 1, max, 1),
            }
          : opts.box
            ? {
                dx: Math.round(opts.box.x - x),
                dy: Math.round(opts.box.y - y),
                w: clampInt(opts.box.w, 1, max, 1),
                h: clampInt(opts.box.h, 1, max, 1),
              }
            : undefined;
        return rigOp(definePart(doc(), opts.name, x, y, st().activeFrame, region));
      }) as Result;
    },

    deletePart(name: string): Result {
      return guard("draw", `deletePart("${name}")`, () =>
        rigOp(deletePart(doc(), name)),
      ) as Result;
    },

    renamePart(from: string, to: string): Result {
      return guard("draw", `renamePart("${from}")`, () =>
        rigOp(renamePart(doc(), from, to)),
      ) as Result;
    },

    /** Sadece tutamak — pikseller yerinde kalır. Poz anahtarı koymak için. */
    setPartHandle(name: string, x: number, y: number): Result {
      return guard("draw", `setPartHandle("${name}")`, () => {
        const max = AGENT_LIMITS.maxCanvasSide;
        return rigOp(
          setPartHandle(
            doc(),
            name,
            clampInt(x, -max, max, 0),
            clampInt(y, -max, max, 0),
            st().activeFrame,
          ),
        );
      }) as Result;
    },

    setPartBox(name: string, box: { x: number; y: number; w: number; h: number }): Result {
      return guard("draw", `setPartBox("${name}")`, (): Result => {
        if (!box) return fail("box is required: { x, y, w, h }");
        const max = AGENT_LIMITS.maxCanvasSide;
        return rigOp(
          setPartBox(
            doc(),
            name,
            {
              x: clampInt(box.x, -max, max, 0),
              y: clampInt(box.y, -max, max, 0),
              w: clampInt(box.w, 1, max, 1),
              h: clampInt(box.h, 1, max, 1),
            },
            st().activeFrame,
          ),
        );
      }) as Result;
    },

    clearPartBox(name: string): Result {
      return guard("draw", `clearPartBox("${name}")`, () =>
        rigOp(clearPartBox(doc(), name)),
      ) as Result;
    },

    /** Tutamağı VE kutusunun pikselini birlikte taşır — tek undo adımı */
    movePart(name: string, dx: number, dy: number, opts?: { allLayers?: boolean }): Result {
      return guard("draw", `movePart("${name}", ${dx}, ${dy})`, () => {
        const max = AGENT_LIMITS.maxCanvasSide;
        const s = st();
        const res = rigOp(
          movePart(
            doc(),
            name,
            clampInt(dx, -max, max, 0),
            clampInt(dy, -max, max, 0),
            s.activeFrame,
            s.activeLayerId,
            opts?.allLayers === true,
          ),
        );
        const at = (res as { at?: [number, number] }).at;
        if (at) markAgent(at[0], at[1], `movePart ${name}`);
        return res;
      }) as Result;
    },

    flipPart(name: string, axis: "x" | "y" = "x"): Result {
      return guard("draw", `flipPart("${name}", "${axis}")`, () => {
        const s = st();
        return rigOp(
          transformPart(
            doc(),
            name,
            axis === "y" ? "flipY" : "flipX",
            s.activeFrame,
            s.activeLayerId,
          ),
        );
      }) as Result;
    },

    rotatePart(name: string, degrees: number): Result {
      return guard("draw", `rotatePart("${name}", ${degrees})`, () => {
        const s = st();
        return rigOp(
          rotatePart(doc(), name, clampInt(degrees, -360, 360, 0), s.activeFrame, s.activeLayerId),
        );
      }) as Result;
    },

    recolorPart(
      name: string,
      opts: { to: number | string; from?: number | string | null; tolerance?: number },
    ): Result {
      return guard("draw", `recolorPart("${name}")`, (): Result => {
        if (!opts || opts.to === undefined) return fail("opts.to is required");
        const to = resolveColor(opts.to);
        if (!to) return fail(`Could not resolve colour: ${String(opts.to)}`);
        const from =
          opts.from === undefined || opts.from === null ? null : resolveColor(opts.from);
        if (opts.from !== undefined && opts.from !== null && !from)
          return fail(`Could not resolve colour: ${String(opts.from)}`);
        const s = st();
        return rigOp(
          recolorPart(
            doc(),
            name,
            from,
            to,
            s.activeFrame,
            s.activeLayerId,
            clampInt(opts.tolerance ?? 0, 0, 255, 0),
          ),
        );
      }) as Result;
    },

    defineBone(opts: { name: string; from: string; to: string }): Result {
      return guard("draw", `defineBone("${opts?.name ?? ""}")`, (): Result => {
        if (!opts?.from || !opts?.to) return fail("from and to part names are required");
        return rigOp(
          defineBoneOp(doc(), opts.name || `${opts.from}-${opts.to}`, opts.from, opts.to),
        );
      }) as Result;
    },

    deleteBone(name: string): Result {
      return guard("draw", `deleteBone("${name}")`, () =>
        rigOp(deleteBoneOp(doc(), name)),
      ) as Result;
    },

    /** Bu kare ile bir sonrakinin arasına ara kareler üretir */
    tween(opts?: { from?: number; count?: number; allLayers?: boolean }): Result {
      return guard("animate", `tween(${opts?.count ?? 3})`, () => {
        const s = st();
        return rigOp(
          tweenFrames(
            doc(),
            opts?.from ?? s.activeFrame,
            clampInt(opts?.count ?? 3, 1, 24, 3),
            s.activeLayerId,
            opts?.allLayers !== false,
          ),
        );
      }) as Result;
    },

    // ── dışa aktarım (dosya iner → "files" izni) ──
    async exportGif(): Promise<Result> {
      const gate = checkGate("files", "exportGif()");
      if (gate) return gate;
      try {
        const stats = await exportGif(doc());
        return {
          ok: true,
          ...stats,
          hint: stats.partialAlphaPixels
            ? `${stats.partialAlphaPixels} pixels were partly transparent; GIF only supports 1-bit alpha so they were snapped to fully solid or fully clear.`
            : undefined,
        };
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Could not build the GIF");
      }
    },
    async exportPng(opts?: { scale?: number; frame?: number }): Promise<Result> {
      const gate = checkGate("files", "exportPng()");
      if (gate) return gate;
      try {
        await exportPng(doc(), opts?.frame ?? st().activeFrame, clampInt(opts?.scale ?? 1, 1, 32, 1));
        return { ok: true };
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Could not export the PNG");
      }
    },
    async exportApng(): Promise<Result> {
      const gate = checkGate("files", "exportApng()");
      if (gate) return gate;
      try {
        const stats = await exportApng(doc());
        return {
          ok: true,
          ...stats,
          hint: "APNG keeps full RGBA transparency and every colour — no 256-colour or 1-bit alpha limit like GIF.",
        };
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Could not build the APNG");
      }
    },
    async exportSpriteSheet(opts?: { columns?: number; scale?: number }): Promise<Result> {
      const gate = checkGate("files", "exportSpriteSheet()");
      if (gate) return gate;
      try {
        await exportSpriteSheet(
          doc(),
          opts?.columns ? clampInt(opts.columns, 1, 256, 8) : undefined,
          clampInt(opts?.scale ?? 1, 1, 32, 1),
        );
        return { ok: true, hint: "PNG + Aseprite-compatible JSON downloaded (Godot/Unity read it directly)." };
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Could not export the sprite sheet");
      }
    },
  };

  // Donduruyoruz: sayfadaki başka bir script metodları sessizce değiştiremesin.
  Object.freeze(api);
  Object.defineProperty(window, "nibble", {
    value: api,
    writable: false,
    configurable: true, // kullanıcı bağlantıyı kesince silebilmeliyiz
    enumerable: true,
  });

  console.info(
    `%cNibble Agent API v${API_VERSION}%c  —  start with window.nibble.help()`,
    "background:#ef7d57;color:#1a1c2c;padding:2px 6px;font-weight:bold",
    "color:#94b0c2",
  );

  return () => {
    limiter.reset();
    try {
      delete (window as unknown as Record<string, unknown>).nibble;
    } catch {
      /* tanımlanamıyorsa zaten yok */
    }
  };
}
