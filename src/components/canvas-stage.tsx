"use client";

/**
 * Nibble — CanvasStage
 *
 * Üç yığılmış canvas, hepsi NATIVE çözünürlükte; ölçekleme CSS ile yapılır
 * (image-rendering: pixelated). Böylece putImageData 1:1 kalır ve büyütme
 * GPU'ya devredilir. Izgara CSS gradient — ayrıca canvas gerekmez.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyCanvasHint } from "./help";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/editor-store";
import { nodePos, nodePosResolved, regionRect, type Rect } from "@/lib/rig";
import { defineNode, moveNode, setNodeRegion } from "@/lib/rig-ops";
import { moveSelection, rectContains, rectFromDrag } from "@/lib/selection-ops";
import {
  applySymmetry,
  brushPoints,
  ellipsePoints,
  line as bresenham,
  pixelPerfect as ppFilter,
  rectPoints,
} from "@/lib/raster";
import { hexToRgba, rgbaToHex, type Point, type RGBA } from "@/lib/types";

export default function CanvasStage() {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const zoom = useEditor((s) => s.zoom);
  const panX = useEditor((s) => s.panX);
  const panY = useEditor((s) => s.panY);
  const fitNonce = useEditor((s) => s.fitNonce);
  const activeFrame = useEditor((s) => s.activeFrame);
  const onionSkin = useEditor((s) => s.onionSkin);
  const onionRange = useEditor((s) => s.onionRange);
  const showGrid = useEditor((s) => s.showGrid);
  const tool = useEditor((s) => s.tool);
  const brushSize = useEditor((s) => s.brushSize);
  const brushRound = useEditor((s) => s.brushRound);
  const cursor = useEditor((s) => s.cursor);
  const rigMode = useEditor((s) => s.rigMode);
  const activeNodeName = useEditor((s) => s.activeNodeName);
  const rigPending = useEditor((s) => s.rigPending);
  const selection = useEditor((s) => s.selection);

  const { width, height } = doc.project;

  // ── çizim ──────────────────────────────────────────────────
  const drawBase = useCallback(() => {
    const cv = baseRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const buf = doc.composite(activeFrame);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(buf), width, height), 0, 0);
  }, [doc, activeFrame, width, height]);

  /**
   * Onion skin ÖNBELLEĞİ.
   *
   * Komşu kareler fırça darbesi boyunca değişmiyor — değişen tek şey AKTİF
   * kare, o da hiçbir zaman kendi komşusu değil. Önbellek olmadan her fare
   * hareketinde her komşu kare için tam birleştirme + tam kopya + yeni bir
   * canvas üretiliyordu; 512×512 ve menzil 2'de tek harekette ~4 MB çöp.
   *
   * Geçerlilik anahtarı `version`: kare ekleme, geri alma, ajan çağrısı ve
   * darbe sonu hepsi `bump()` çağırıyor, yani önbellek tam da bayatlayacağı
   * anda düşüyor.
   */
  const onionCache = useRef(new Map<string, HTMLCanvasElement>());
  const onionCacheVersion = useRef(-1);

  const drawOnion = useCallback(() => {
    const cv = onionRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!onionSkin) return;

    const version = useEditor.getState().version;
    if (onionCacheVersion.current !== version) {
      onionCache.current.clear();
      onionCacheVersion.current = version;
    }

    const total = doc.frames.length;
    for (let d = onionRange; d >= 1; d--) {
      for (const dir of [-1, 1] as const) {
        const i = activeFrame + dir * d;
        if (i < 0 || i >= total) continue;

        const key = `${doc.frames[i].id}|${dir}|${d}|${width}x${height}`;
        let tmp = onionCache.current.get(key);
        if (!tmp) {
          const tinted = new Uint8ClampedArray(doc.composite(i));
          const fade = 0.42 / d;
          for (let p = 0; p < tinted.length; p += 4) {
            if (tinted[p + 3] === 0) continue;
            // geçmiş kareler kırmızıya, gelecek kareler maviye çalar
            if (dir < 0) {
              tinted[p] = Math.min(255, tinted[p] * 0.55 + 200 * 0.45);
              tinted[p + 1] *= 0.45;
              tinted[p + 2] *= 0.45;
            } else {
              tinted[p] *= 0.45;
              tinted[p + 1] *= 0.55;
              tinted[p + 2] = Math.min(255, tinted[p + 2] * 0.55 + 220 * 0.45);
            }
            tinted[p + 3] = tinted[p + 3] * fade;
          }
          tmp = document.createElement("canvas");
          tmp.width = width;
          tmp.height = height;
          tmp.getContext("2d")!.putImageData(new ImageData(tinted, width, height), 0, 0);
          onionCache.current.set(key, tmp);
        }
        ctx.drawImage(tmp, 0, 0);
      }
    }
  }, [doc, activeFrame, onionSkin, onionRange, width, height]);

  const clearOverlay = useCallback(() => {
    const ctx = overlayRef.current?.getContext("2d");
    ctx?.clearRect(0, 0, width, height);
  }, [width, height]);

  // Şekil önizlemesi her fare hareketinde çiziliyor: ImageData'yı her seferinde
  // yeniden üretmek yerine tek tampon tutup sıfırlıyoruz (512×512'de hareket
  // başına 1 MB ayırma farkı).
  const previewBuf = useRef<ImageData | null>(null);

  const drawPreview = useCallback(
    (pts: Point[], color: RGBA) => {
      const ctx = overlayRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (
        !previewBuf.current ||
        previewBuf.current.width !== width ||
        previewBuf.current.height !== height
      ) {
        previewBuf.current = ctx.createImageData(width, height);
      }
      const id = previewBuf.current;
      id.data.fill(0);
      for (const p of pts) {
        if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue;
        const i = (p.y * width + p.x) * 4;
        id.data[i] = color[0];
        id.data[i + 1] = color[1];
        id.data[i + 2] = color[2];
        id.data[i + 3] = color[3] === 0 ? 110 : 190;
      }
      ctx.putImageData(id, 0, 0);
    },
    [width, height],
  );

  // doc değişimlerine abone ol — React state'i değil, imperatif çizim
  useEffect(() => {
    drawBase();
    drawOnion();
    const un = doc.subscribe(() => {
      drawBase();
      drawOnion();
    });
    return un;
  }, [doc, drawBase, drawOnion]);

  useEffect(() => {
    drawBase();
    drawOnion();
  }, [version, activeFrame, drawBase, drawOnion]);

  // ── görünüme sığdır: ilk açılışta ve durum çubuğundaki düğmede ──
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const pad = 64;
    const z = Math.max(
      1,
      Math.min(
        48,
        Math.floor(Math.min((el.clientWidth - pad) / width, (el.clientHeight - pad) / height)),
      ),
    );
    useEditor.getState().setZoom(z || 1);
    useEditor.getState().setPan(0, 0);
  }, [width, height]);

  const fitDoneRef = useRef<string>("");
  useEffect(() => {
    const key = `${doc.project.id}:${width}x${height}`;
    if (fitDoneRef.current === key) return;
    fitDoneRef.current = key;
    fit();
  }, [doc.project.id, width, height, fit]);

  // fitNonce artınca (kullanıcı "görünüme sığdır" dedi) yeniden ortala
  const firstFitNonce = useRef(fitNonce);
  useEffect(() => {
    if (fitNonce === firstFitNonce.current) return;
    fit();
  }, [fitNonce, fit]);

  // ── işaretçi ───────────────────────────────────────────────
  const strokeRef = useRef<{
    active: boolean;
    pointerId: number;
    tool: string;
    button: number;
    color: RGBA;
    start: Point;
    last: Point;
    pts: Point[];
    before: Uint8ClampedArray | null;
    frameId: string;
    layerId: string;
    panStart: { x: number; y: number; px: number; py: number } | null;
  } | null>(null);

  const toPixel = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const cv = baseRef.current!;
      const r = cv.getBoundingClientRect();
      return {
        x: Math.floor((e.clientX - r.left) / zoom),
        y: Math.floor((e.clientY - r.top) / zoom),
      };
    },
    [zoom],
  );

  const expand = useCallback(
    (pts: Point[]): Point[] => {
      const s = useEditor.getState();
      let out: Point[] = [];
      if (s.brushSize <= 1) out = pts;
      else {
        const seen = new Set<number>();
        for (const p of pts) {
          for (const b of brushPoints(p.x, p.y, s.brushSize, s.brushRound)) {
            const k = b.y * 4096 + b.x;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(b);
          }
        }
      }
      const mirrored = applySymmetry(out, s.symmetry, width, height);
      // Seçim aktifken her çizim aracı seçimin içinde kalır (Aseprite davranışı).
      // Kova ayrı: floodFill'e clip olarak geçiyor, aşağıda.
      const sel = s.selection;
      if (!sel) return mirrored;
      return mirrored.filter(
        (p) => p.x >= sel.x && p.y >= sel.y && p.x < sel.x + sel.w && p.y < sel.y + sel.h,
      );
    },
    [width, height],
  );

  const shapePoints = useCallback(
    (t: string, a: Point, b: Point): Point[] => {
      const s = useEditor.getState();
      if (t === "line") return bresenham(a.x, a.y, b.x, b.y);
      if (t === "rect") return rectPoints(a.x, a.y, b.x, b.y, s.shapeFilled);
      if (t === "ellipse") return ellipsePoints(a.x, a.y, b.x, b.y, s.shapeFilled);
      return [];
    },
    [],
  );

  /* ── iskelet modu işaretçisi ──────────────────────────────── */
  // Aynı gerekçe seçimdeki gibi: sürüklenen kutu REF'te, state sadece çizim için
  const rigDragRef = useRef<{
    mode: "move" | "region";
    name: string;
    start: Point;
    last: Point;
    rect: Rect | null;
  } | null>(null);
  const [regionPreview, setRegionPreview] = useState<Rect | null>(null);

  /** Tutamağa yakınlık: zoom'a göre tolerans, küçük zoom'da da yakalanabilsin */
  const hitNode = useCallback(
    (p: Point) => {
      const s = useEditor.getState();
      const rig = s.doc.rig;
      if (!rig?.nodes.length) return null;
      const ids = s.doc.frames.map((f) => f.id);
      const tol = zoom >= 12 ? 1 : 2;

      let best: { name: string; d: number } | null = null;
      for (const n of rig.nodes) {
        const at = nodePosResolved(n, ids, s.activeFrame);
        if (!at) continue;
        const d = Math.max(Math.abs(at.x - p.x), Math.abs(at.y - p.y));
        if (d <= tol && (!best || d < best.d)) best = { name: n.name, d };
      }
      if (best) return best.name;

      // tutamak tutmadıysa kutunun içine tıklamak da parçayı seçsin
      for (const n of rig.nodes) {
        const at = nodePosResolved(n, ids, s.activeFrame);
        if (!at) continue;
        const r = regionRect(n, at);
        if (r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h) return n.name;
      }
      return null;
    },
    [zoom],
  );

  const onRigPointerDown = useCallback(
    (e: React.PointerEvent, p: Point): boolean => {
      const s = useEditor.getState();

      // 1) yeni parçanın tutamağını yerleştir
      if (s.rigPending === "place" && s.rigNewName) {
        const res = defineNode(s.doc, s.rigNewName, p.x, p.y, s.activeFrame);
        if (res.ok) {
          s.setActiveNode(String(res.name ?? s.rigNewName));
          s.setRigPending("none");
          s.bump();
        } else {
          s.showToast(res.error ?? "?");
        }
        return true;
      }

      // 2) seçili parçaya kutu çiz
      if (s.rigPending === "region" && s.activeNodeName) {
        const seed = { x: p.x, y: p.y, w: 1, h: 1 };
        rigDragRef.current = { mode: "region", name: s.activeNodeName, start: p, last: p, rect: seed };
        setRegionPreview(seed);
        return true;
      }

      // 3) tutamağı yakala ve sürükle — pikseller birlikte gelir
      const name = hitNode(p);
      if (!name) return true; // rig modunda boşluğa tıklamak çizmemeli
      s.setActiveNode(name);
      const layer = s.doc.layer(s.activeLayerId);
      if (!layer || layer.locked) {
        s.showToast(t.rig.lockedLayer);
        return true;
      }
      // tek geçmiş adımı: sürükleme boyunca açık batch
      s.doc.beginBatch(`Rig: ${name}`);
      rigDragRef.current = { mode: "move", name, start: p, last: p, rect: null };
      return true;
    },
    [hitNode, t],
  );

  const onRigPointerMove = useCallback((p: Point): boolean => {
    const drag = rigDragRef.current;
    if (!drag) return false;
    const s = useEditor.getState();

    if (drag.mode === "region") {
      const next = {
        x: Math.min(drag.start.x, p.x),
        y: Math.min(drag.start.y, p.y),
        w: Math.abs(p.x - drag.start.x) + 1,
        h: Math.abs(p.y - drag.start.y) + 1,
      };
      drag.rect = next;
      setRegionPreview(next);
      return true;
    }

    const dx = p.x - drag.last.x;
    const dy = p.y - drag.last.y;
    if (dx === 0 && dy === 0) return true;
    drag.last = p;
    moveNode(s.doc, drag.name, dx, dy, s.activeFrame, s.activeLayerId);
    s.doc.notify("pixels");
    s.bump();
    return true;
  }, []);

  const onRigPointerUp = useCallback((): boolean => {
    const drag = rigDragRef.current;
    if (!drag) return false;
    rigDragRef.current = null;
    const s = useEditor.getState();

    if (drag.mode === "region") {
      const r = drag.rect;
      setRegionPreview(null);
      s.setRigPending("none");
      if (r) {
        const res = setNodeRegion(s.doc, drag.name, r, s.activeFrame);
        if (!res.ok) s.showToast(res.error ?? "?");
        else s.bump();
      }
      return true;
    }

    s.doc.endBatch();
    s.doc.notify("pixels");
    s.bump();
    return true;
  }, []);

  /* ── dokunmatik: iki parmak = yakınlaştır + kaydır ─────────────
   *
   * Tek parmak çizmeye devam ediyor (pointer events zaten hallediyor).
   * İkinci parmak indiği an ilk parmağın başlattığı fırça darbesi
   * KAZAYLA atılmış sayılıp geri alınıyor — telefonda tuvali yakınlaştırmak
   * isterken ekrana nokta bırakmak en can sıkıcı hata.
   */
  const touchRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    dist: number;
    zoom: number;
    mid: { x: number; y: number };
    pan: { x: number; y: number };
  } | null>(null);

  const abortStroke = useCallback(() => {
    const st = strokeRef.current;
    if (!st?.active) return;
    strokeRef.current = null;
    const s = useEditor.getState();
    if (st.tool === "pan") return;
    clearOverlay();
    // batch'i kapat, sonra geri al: kazara konan piksel kalmasın
    const recorded = s.doc.endBatch();
    if (recorded) s.doc.undo();
    s.doc.notify("pixels");
    s.bump();
  }, [clearOverlay]);

  /* ── seçim aracı ───────────────────────────────────────────── */
  /**
   * DİKKAT: sürüklenen dikdörtgen REF'te tutuluyor, state'te değil.
   * State'i doğruluk kaynağı yapsaydık hızlı bir sürüklemede (pointerdown →
   * move → up aynı tick'te) React henüz yeniden render etmemiş olur ve
   * pointerup eski (null) değeri okuyup seçimi sessizce iptal ederdi.
   * State yalnızca ekrana çizmek için var.
   */
  const selDragRef = useRef<{
    mode: "define" | "move";
    start: Point;
    last: Point;
    rect: Rect | null;
  } | null>(null);
  const [selPreview, setSelPreview] = useState<Rect | null>(null);

  const onSelectPointerDown = useCallback((p: Point): boolean => {
    const s = useEditor.getState();
    // mevcut seçimin İÇİNE basmak taşıma, dışına basmak yeni seçim
    if (s.selection && rectContains(s.selection, p.x, p.y)) {
      const layer = s.doc.layer(s.activeLayerId);
      if (!layer || layer.locked) {
        s.showToast(t.selection.lockedLayer);
        return true;
      }
      s.doc.beginBatch(t.selection.title);
      selDragRef.current = { mode: "move", start: p, last: p, rect: s.selection };
      return true;
    }
    const seed = { x: p.x, y: p.y, w: 1, h: 1 };
    selDragRef.current = { mode: "define", start: p, last: p, rect: seed };
    setSelPreview(seed);
    return true;
  }, [t]);

  const onSelectPointerMove = useCallback((p: Point): boolean => {
    const drag = selDragRef.current;
    if (!drag) return false;
    const s = useEditor.getState();

    if (drag.mode === "define") {
      const next = rectFromDrag(drag.start, p);
      drag.rect = next;
      setSelPreview(next);
      return true;
    }

    const dx = p.x - drag.last.x;
    const dy = p.y - drag.last.y;
    if (dx === 0 && dy === 0) return true;
    drag.last = p;
    if (s.selection) {
      const res = moveSelection(s.doc, s.selection, dx, dy, s.activeFrame, s.activeLayerId);
      if (res.rect) s.setSelection(res.rect);
      s.doc.notify("pixels");
      s.bump();
    }
    return true;
  }, []);

  const onSelectPointerUp = useCallback((): boolean => {
    const drag = selDragRef.current;
    if (!drag) return false;
    selDragRef.current = null;
    const s = useEditor.getState();

    if (drag.mode === "define") {
      const r = drag.rect;
      setSelPreview(null);
      // 1×1 seçim = "boşluğa tıkladım", seçimi kaldır
      s.setSelection(r && (r.w > 1 || r.h > 1) ? r : null);
      return true;
    }

    s.doc.endBatch();
    s.doc.notify("pixels");
    s.bump();
    return true;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const s = useEditor.getState();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      if (e.pointerType === "touch") {
        touchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touchRef.current.size === 2) {
          abortStroke();
          rigDragRef.current = null;
          const [a, b] = [...touchRef.current.values()];
          pinchRef.current = {
            dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
            zoom: s.zoom,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            pan: { x: s.panX, y: s.panY },
          };
          return;
        }
        if (touchRef.current.size > 2) return;
      }

      const p = toPixel(e);

      // iskelet modu çizim yerine tutamak sürükler
      if (s.rigMode && e.button !== 1) {
        if (onRigPointerDown(e, p)) return;
      }

      // seçim aracı da çizmez
      if (!s.rigMode && s.tool === "select" && e.button !== 1 && !e.altKey) {
        if (onSelectPointerDown(p)) return;
      }

      // orta tuş veya Pan aracı → kaydırma (Space basılıysa store'da quickPanTool set edilir)
      const wantsPan = s.tool === "pan" || s.quickPanTool === "pan" || e.button === 1;

      if (wantsPan) {
        strokeRef.current = {
          active: true,
          pointerId: e.pointerId,
          tool: "pan",
          button: e.button,
          color: [0, 0, 0, 0],
          start: p,
          last: p,
          pts: [],
          before: null,
          frameId: "",
          layerId: "",
          panStart: { x: e.clientX, y: e.clientY, px: s.panX, py: s.panY },
        };
        return;
      }

      // Alt = geçici damlalık (herhangi bir araçtan)
      const effectiveTool = e.altKey ? "eyedropper" : s.tool;

      if (effectiveTool === "eyedropper") {
        const c = s.doc.pick(p.x, p.y, s.activeFrame);
        if (c[3] > 0) {
          if (e.button === 2) s.setSecondary(rgbaToHex(c));
          else s.setPrimary(rgbaToHex(c));
        }
        return;
      }

      const frame = s.doc.project.frames[s.activeFrame];
      const layer = s.doc.layer(s.activeLayerId);
      if (!frame || !layer) return;
      if (layer.locked) {
        s.showToast(t.layers.lockedToast);
        return;
      }

      const colorHex = e.button === 2 ? s.secondary : s.primary;
      const color: RGBA = effectiveTool === "eraser" ? [0, 0, 0, 0] : hexToRgba(colorHex);

      if (effectiveTool === "fill") {
        s.doc.run(t.tools.fill, () =>
          s.doc.bucket(p.x, p.y, color, frame.id, layer.id, {
            contiguous: s.contiguousFill,
            tolerance: s.tolerance,
            clip: s.selection ?? undefined,
          }),
        );
        s.bump();
        return;
      }

      // geçmiş etiketi kullanıcıya "Geri al: Kalem" diye görünüyor → çevrilmeli
      s.doc.beginBatch(t.tools[effectiveTool as keyof typeof t.tools] ?? effectiveTool);

      const cel = s.doc.cel(frame.id, layer.id);
      strokeRef.current = {
        active: true,
        pointerId: e.pointerId,
        tool: effectiveTool,
        button: e.button,
        color,
        start: p,
        last: p,
        pts: [p],
        before: cel.slice(),
        frameId: frame.id,
        layerId: layer.id,
        panStart: null,
      };

      if (effectiveTool === "pen" || effectiveTool === "eraser") {
        s.doc.paint(expand([p]), color, frame.id, layer.id);
        s.doc.notify("pixels");
      } else {
        drawPreview(expand(shapePoints(effectiveTool, p, p)), color);
      }
    },
    [
      toPixel,
      expand,
      shapePoints,
      drawPreview,
      t,
      onRigPointerDown,
      onSelectPointerDown,
      abortStroke,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = strokeRef.current;
      const s = useEditor.getState();

      if (e.pointerType === "touch" && touchRef.current.has(e.pointerId)) {
        touchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pinch = pinchRef.current;
        if (pinch && touchRef.current.size >= 2) {
          const [a, b] = [...touchRef.current.values()];
          const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          s.setZoom(pinch.zoom * (dist / pinch.dist));
          s.setPan(
            pinch.pan.x + (mid.x - pinch.mid.x),
            pinch.pan.y + (mid.y - pinch.mid.y),
          );
          return;
        }
      }

      const here = toPixel(e);

      // durum çubuğu için imleç konumu — çizim olmasa da güncellenir
      s.setCursor(here);

      if (s.rigMode && onRigPointerMove(here)) return;
      if (s.tool === "select" && onSelectPointerMove(here)) return;
      if (!st?.active) return;

      if (st.tool === "pan" && st.panStart) {
        s.setPan(
          st.panStart.px + (e.clientX - st.panStart.x),
          st.panStart.py + (e.clientY - st.panStart.y),
        );
        return;
      }

      const p = toPixel(e);
      if (p.x === st.last.x && p.y === st.last.y) return;

      if (st.tool === "pen" || st.tool === "eraser") {
        // Bresenham şart: pointermove hızlı harekette piksel atlar
        const seg = bresenham(st.last.x, st.last.y, p.x, p.y);
        for (let i = 1; i < seg.length; i++) st.pts.push(seg[i]);
        st.last = p;

        // pixel-perfect bir noktayı SONRADAN eleyebildiği için
        // fırça öncesi durumdan yeniden çiziyoruz (32×32'de mikrosaniyeler)
        const cel = s.doc.cel(st.frameId, st.layerId);
        if (st.before) cel.set(st.before);
        const path = s.pixelPerfect && s.brushSize <= 1 ? ppFilter(st.pts) : st.pts;
        s.doc.paint(expand(path), st.color, st.frameId, st.layerId);
        s.doc.notify("pixels");
      } else {
        st.last = p;
        drawPreview(expand(shapePoints(st.tool, st.start, p)), st.color);
      }
    },
    [toPixel, expand, shapePoints, drawPreview, onRigPointerMove, onSelectPointerMove],
  );

  const finishStroke = useCallback(() => {
    if (onRigPointerUp()) return;
    if (onSelectPointerUp()) return;
    const st = strokeRef.current;
    if (!st?.active) return;
    strokeRef.current = null;
    const s = useEditor.getState();

    if (st.tool === "pan") return;

    if (st.tool === "line" || st.tool === "rect" || st.tool === "ellipse") {
      s.doc.paint(
        expand(shapePoints(st.tool, st.start, st.last)),
        st.color,
        st.frameId,
        st.layerId,
      );
      clearOverlay();
    }
    s.doc.endBatch();
    s.doc.notify("pixels");
    s.bump();
  }, [expand, shapePoints, clearOverlay, onRigPointerUp, onSelectPointerUp]);

  /** Dokunmatik jest sürüyorsa fırça darbesini bitirmiyoruz */
  const finishPointer = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") {
        touchRef.current.delete(e.pointerId);
        if (touchRef.current.size < 2) pinchRef.current = null;
        // hâlâ ekranda parmak varsa jest devam ediyor
        if (touchRef.current.size > 0) return;
      }
      finishStroke();
    },
    [finishStroke],
  );

  // ── tekerlek: ctrl/cmd = imleç merkezli zoom, düz = kaydırma ─
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const s = useEditor.getState();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const cv = baseRef.current;
        if (!cv) return;
        const r = cv.getBoundingClientRect();
        const next = Math.max(1, Math.min(64, s.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const scale = next / s.zoom;
        if (scale === 1) return;

        /**
         * Yığın merkezden konumlanıyor (left:50% + translate(-50%,-50%)), yani
         * büyüme sol-üstten değil ORTADAN oluyor. Sadece `pan - d*(scale-1)`
         * yazarsak imleç sabit kalmaz, tuval her tekerlek adımında kayar.
         * Doğrusu merkez farkını da düşmek:
         *   pan' = pan - (scale-1) * (d - boyut/2)
         */
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        const w = s.doc.width * s.zoom;
        const h = s.doc.height * s.zoom;
        s.setPan(
          s.panX - (scale - 1) * (dx - w / 2),
          s.panY - (scale - 1) * (dy - h / 2),
        );
        s.setZoom(next);
      } else {
        e.preventDefault();
        s.setPan(s.panX - e.deltaX, s.panY - e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const px = width * zoom;
  const py = height * zoom;
  const gridOn = showGrid && zoom >= 8;

  // fırça izi: nereye basacağını GÖSTERİR. Büyük fırçada tahmin etmek imkânsız.
  const showBrushCursor =
    cursor &&
    zoom >= 4 &&
    (tool === "pen" || tool === "eraser" || tool === "line" || tool === "rect" || tool === "ellipse");
  const half = Math.floor(brushSize / 2);

  return (
    <div className="stage-wrap" ref={containerRef}>
      <div
        ref={stackRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) translate(${panX}px, ${panY}px)`,
          width: px,
          height: py,
          /**
           * Saydamlık damasının boyu zoom'dan BAĞIMSIZ (Aseprite de böyle yapar).
           * Zoom'a bağlasaydık piksel ızgarasıyla aynı frekansa oturur ve ikisi
           * birbirine karışıp gürültü gibi görünürdü.
           */
          backgroundImage:
            "linear-gradient(45deg, rgba(148,176,194,.13) 25%, transparent 25%, transparent 75%, rgba(148,176,194,.13) 75%), linear-gradient(45deg, rgba(148,176,194,.13) 25%, transparent 25%, transparent 75%, rgba(148,176,194,.13) 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 8px 8px",
          boxShadow: "0 0 0 1px var(--line)",
          touchAction: "none",
          cursor: rigMode
            ? rigPending === "none"
              ? "grab"
              : "crosshair"
            : tool === "select"
              ? selection && cursor && rectContains(selection, cursor.x, cursor.y)
                ? "move"
                : "crosshair"
            : tool === "pan"
              ? "grab"
              : "crosshair",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={() => useEditor.getState().setCursor(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas
          ref={onionRef}
          width={width}
          height={height}
          style={{
            position: "absolute",
            inset: 0,
            width: px,
            height: py,
            imageRendering: "pixelated",
            pointerEvents: "none",
          }}
        />
        <canvas
          ref={baseRef}
          width={width}
          height={height}
          style={{
            position: "absolute",
            inset: 0,
            width: px,
            height: py,
            imageRendering: "pixelated",
          }}
        />
        <canvas
          ref={overlayRef}
          width={width}
          height={height}
          style={{
            position: "absolute",
            inset: 0,
            width: px,
            height: py,
            imageRendering: "pixelated",
            pointerEvents: "none",
          }}
        />
        {gridOn && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage:
                "linear-gradient(to right, rgba(148,176,194,.20) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,176,194,.20) 1px, transparent 1px)",
              backgroundSize: `${zoom}px ${zoom}px`,
            }}
          />
        )}
        <AgentCursor zoom={zoom} />
        {(selection || selPreview) && (
          <div
            aria-hidden
            className={`marquee${selPreview ? " drawing" : ""}`}
            style={{
              left: (selPreview ?? selection!).x * zoom,
              top: (selPreview ?? selection!).y * zoom,
              width: (selPreview ?? selection!).w * zoom,
              height: (selPreview ?? selection!).h * zoom,
            }}
          />
        )}
        {rigMode && (
          <RigOverlay
            zoom={zoom}
            width={width}
            height={height}
            preview={regionPreview}
            activeName={activeNodeName}
          />
        )}
        {showBrushCursor && !rigMode && (
          <div
            aria-hidden
            className="brush-cursor"
            style={{
              left: (cursor.x - half) * zoom,
              top: (cursor.y - half) * zoom,
              width: brushSize * zoom,
              height: brushSize * zoom,
              borderRadius: brushSize > 2 && brushRound ? "50%" : 0,
            }}
          />
        )}
      </div>
      {!rigMode && <EmptyCanvasHint />}
      {rigMode && <p className="rig-banner">{t.rig.modeOn}</p>}
    </div>
  );
}

/**
 * Ajanın ikinci imleci — Ortak Mod'daki görsel eş-varlık.
 *
 * Yığının İÇİNDE, tuval koordinatlarında konumlanıyor; pan/zoom ile birlikte
 * hareket etsin. Birkaç saniye sonra kendi kendine kayboluyor, yoksa ekranda
 * kalıcı çöp olur.
 */
function AgentCursor({ zoom }: { zoom: number }) {
  const cursor = useEditor((s) => s.agentCursor);
  const setAgentCursor = useEditor((s) => s.setAgentCursor);

  useEffect(() => {
    if (!cursor) return;
    const timer = setTimeout(() => setAgentCursor(null), 3200);
    return () => clearTimeout(timer);
  }, [cursor, setAgentCursor]);

  if (!cursor) return null;
  return (
    <div
      className="agent-cursor"
      style={{ left: cursor.x * zoom, top: cursor.y * zoom, width: zoom, height: zoom }}
      aria-hidden
    >
      <span>{cursor.label}</span>
    </div>
  );
}

/**
 * İskelet katmanı — SVG, canvas değil.
 *
 * Sebep: düğüm ve kemikler EKRAN ölçeğinde ince çizgi olmalı (1 piksel tuval
 * hücresi 20px olduğunda kemik çizgisi 20px kalın olmasın). SVG'yi ölçekli
 * viewBox ile değil, doğrudan ekran koordinatlarında çiziyoruz.
 */
function RigOverlay({
  zoom,
  width,
  height,
  preview,
  activeName,
}: {
  zoom: number;
  width: number;
  height: number;
  preview: Rect | null;
  activeName: string | null;
}) {
  const doc = useEditor((s) => s.doc);
  const version = useEditor((s) => s.version);
  const activeFrame = useEditor((s) => s.activeFrame);
  void version;

  const onionSkin = useEditor((s) => s.onionSkin);
  const onionRange = useEditor((s) => s.onionRange);

  const rig = doc.rig;
  const ids = doc.frames.map((f) => f.id);
  // tuval hücresinin ortası: piksel indeksinin merkezine denk gelsin
  const c = (v: number) => (v + 0.5) * zoom;

  /**
   * Onion skin açıkken komşu karelerin TUTAMAKLARI da hayalet olarak görünür.
   * Poz anahtarlarken "önceki karede kol neredeydi" sorusunun cevabı bu;
   * yoksa kullanıcı kareler arasında ileri geri gidip aklında tutmak zorunda.
   */
  const ghosts: { x: number; y: number; dir: number }[] = [];
  if (onionSkin && rig?.nodes.length) {
    for (let d = 1; d <= onionRange; d++) {
      for (const dir of [-1, 1] as const) {
        const fi = activeFrame + dir * d;
        if (fi < 0 || fi >= ids.length) continue;
        for (const n of rig.nodes) {
          const at = nodePos(n, ids[fi]);
          if (at) ghosts.push({ x: at.x, y: at.y, dir });
        }
      }
    }
  }

  const placed = (rig?.nodes ?? [])
    .map((n) => ({ node: n, at: nodePosResolved(n, ids, activeFrame) }))
    .filter((v): v is { node: (typeof v)["node"]; at: Point } => v.at !== null);
  const posOf = (name: string) => placed.find((p) => p.node.name === name)?.at ?? null;

  return (
    <svg
      className="rig-overlay"
      width={width * zoom}
      height={height * zoom}
      aria-hidden
    >
      {/* hayaletler en altta */}
      {ghosts.map((g, i) => (
        <rect
          key={`ghost-${i}`}
          x={g.x * zoom}
          y={g.y * zoom}
          width={zoom}
          height={zoom}
          className={`rig-ghost ${g.dir < 0 ? "past" : "future"}`}
        />
      ))}

      {/* kemikler en altta — düğümler üstünü kapatmasın */}
      {(rig?.bones ?? []).map((b) => {
        const a = posOf(b.from);
        const z = posOf(b.to);
        if (!a || !z) return null;
        return (
          <line
            key={b.name}
            x1={c(a.x)}
            y1={c(a.y)}
            x2={c(z.x)}
            y2={c(z.y)}
            className="rig-bone"
          />
        );
      })}

      {placed.map(({ node, at }) => {
        const r = regionRect(node, at);
        const on = node.name === activeName;
        return (
          <g key={node.name} className={on ? "rig-node on" : "rig-node"}>
            {r && (
              <rect
                x={r.x * zoom}
                y={r.y * zoom}
                width={r.w * zoom}
                height={r.h * zoom}
                className="rig-region"
              />
            )}
            <rect
              x={at.x * zoom}
              y={at.y * zoom}
              width={zoom}
              height={zoom}
              className="rig-handle"
            />
            <text x={c(at.x) + zoom * 0.7} y={c(at.y) - zoom * 0.4} className="rig-label">
              {node.name}
            </text>
          </g>
        );
      })}

      {preview && (
        <rect
          x={preview.x * zoom}
          y={preview.y * zoom}
          width={preview.w * zoom}
          height={preview.h * zoom}
          className="rig-preview"
        />
      )}
    </svg>
  );
}
