/** Nibble — gömülü paletler. Pixel art'çılar renk *rampalarıyla* düşünür, düz swatch ızgarasıyla değil. */

import type { Hex } from "./types";

export interface PaletteDef {
  id: string;
  name: string;
  colors: Hex[];
  /** rampa grupları (satırlar) — UI bunları ayrı sıralar halinde gösterir */
  ramps?: number[][];
}

const s16 = [
  "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57",
  "#ffcd75", "#a7f070", "#38b764", "#257179",
  "#29366f", "#3b5dc9", "#41a6f6", "#73eff7",
  "#f4f4f4", "#94b0c2", "#566c86", "#333c57",
];

export const PALETTES: PaletteDef[] = [
  {
    id: "sweetie-16",
    name: "Sweetie 16",
    colors: s16,
    ramps: [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11],
      [12, 13, 14, 15],
    ],
  },
  {
    id: "pico-8",
    name: "PICO-8",
    colors: [
      "#000000", "#1d2b53", "#7e2553", "#008751",
      "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
      "#ff004d", "#ffa300", "#ffec27", "#00e436",
      "#29adff", "#83769c", "#ff77a8", "#ffccaa",
    ],
    ramps: [
      [0, 1, 5, 6, 7],
      [2, 8, 14, 15],
      [4, 9, 10],
      [3, 11, 12, 13],
    ],
  },
  {
    id: "gameboy",
    name: "Game Boy (DMG)",
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
    ramps: [[0, 1, 2, 3]],
  },
  {
    id: "na16",
    name: "NA16",
    colors: [
      "#8c8fae", "#584563", "#3e2137", "#9a6348",
      "#d79b7d", "#f5edba", "#c0c741", "#647d34",
      "#e4943a", "#9d303b", "#d26471", "#70377f",
      "#7ec4c1", "#34859d", "#17434b", "#1f0e1c",
    ],
    ramps: [
      [15, 2, 1, 0, 5],
      [3, 4, 8, 9, 10],
      [6, 7, 11],
      [14, 13, 12],
    ],
  },
  {
    id: "endesga-32",
    name: "Endesga 32",
    colors: [
      "#be4a2f", "#d77643", "#ead4aa", "#e4a672",
      "#b86f50", "#733e39", "#3e2731", "#a22633",
      "#e43b44", "#f77622", "#feae34", "#fee761",
      "#63c74d", "#3e8948", "#265c42", "#193c3e",
      "#124e89", "#0099db", "#2ce8f5", "#ffffff",
      "#c0cbdc", "#8b9bb4", "#5a6988", "#3a4466",
      "#262b44", "#181425", "#ff0044", "#68386c",
      "#b55088", "#f6757a", "#e8b796", "#c28569",
    ],
    ramps: [
      [6, 5, 4, 0, 1, 3, 2],
      [7, 8, 9, 10, 11],
      [15, 14, 13, 12],
      [16, 17, 18, 19],
      [25, 24, 23, 22, 21, 20],
      [27, 28, 29, 26, 30, 31],
    ],
  },
  {
    id: "vinik24",
    name: "Vinik 24",
    colors: [
      "#000000", "#6f6776", "#9a9a97", "#c5ccb8",
      "#8b5580", "#c38890", "#a593a5", "#666092",
      "#9a4f50", "#c28d75", "#7ca1c0", "#416aa3",
      "#8d6268", "#be955c", "#68aca9", "#387080",
      "#6e6962", "#93a167", "#6eaa78", "#557064",
      "#9d9f7f", "#7e9e99", "#5d6872", "#433455",
    ],
    ramps: [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15],
      [16, 17, 18, 19],
      [20, 21, 22, 23],
    ],
  },
  {
    id: "grayscale-8",
    name: "Gri 8",
    colors: [
      "#000000", "#242424", "#484848", "#6d6d6d",
      "#919191", "#b6b6b6", "#dadada", "#ffffff",
    ],
    ramps: [[0, 1, 2, 3, 4, 5, 6, 7]],
  },
];

/**
 * Kullanıcı paleti elle düzenlediğinde gömülü paletlerden birine artık
 * uymuyor. Bunu "custom" ile işaretliyoruz; seçicide görünsün diye listeye
 * de ekliyoruz ama renkleri projeden okunuyor (burada tutulan boş).
 */
export const CUSTOM_PALETTE_ID = "custom";

export const DEFAULT_PALETTE = PALETTES[0];

export function paletteById(id: string): PaletteDef | undefined {
  return PALETTES.find((p) => p.id === id);
}

/** Palet tanımlı değilse 8'erli otomatik rampa */
export function rampsOf(def: { colors: Hex[]; ramps?: number[][] }): number[][] {
  if (def.ramps) return def.ramps;
  const out: number[][] = [];
  for (let i = 0; i < def.colors.length; i += 8) {
    out.push(Array.from({ length: Math.min(8, def.colors.length - i) }, (_, k) => i + k));
  }
  return out;
}
