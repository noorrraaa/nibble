"use client";

/** Nibble — sade 16×16 ikon seti (bağımlılık yok) */

export type IconName =
  | "pen"
  | "eraser"
  | "fill"
  | "eyedropper"
  | "line"
  | "rect"
  | "ellipse"
  | "pan"
  | "undo"
  | "redo"
  | "play"
  | "pause"
  | "plus"
  | "copy"
  | "trash"
  | "eye"
  | "eyeOff"
  | "lock"
  | "unlock"
  | "download"
  | "image"
  | "folder"
  | "help"
  | "grid"
  | "onion"
  | "swap"
  | "sun"
  | "moon"
  | "rig"
  | "select";

const P: Record<IconName, React.ReactNode> = {
  pen: <path d="M2 14l1-3.5L10.5 3 13 5.5 5.5 13 2 14z" />,
  eraser: <path d="M3 12l6-6 4 4-3 3H4l-1-1zM9 14h5" />,
  fill: <path d="M3 8l5-5 5 5-5 5-5-5zM13 11c1 1.5 1 3-.5 3s-1.5-1.5-.5-3z" />,
  eyedropper: <path d="M11 2l3 3-6 6-3 1 1-3 5-7zM3 13l2 0 0 2-2 0z" />,
  line: <path d="M3 13L13 3" />,
  rect: <path d="M2.5 3.5h11v9h-11z" />,
  ellipse: <ellipse cx="8" cy="8" rx="5.5" ry="4.5" />,
  pan: <path d="M8 2v12M2 8h12M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />,
  undo: <path d="M6 4L2.5 7.5 6 11M2.5 7.5H10a3.5 3.5 0 010 7H7" />,
  redo: <path d="M10 4l3.5 3.5L10 11M13.5 7.5H6a3.5 3.5 0 000 7h3" />,
  play: <path d="M4 3l9 5-9 5z" />,
  pause: <path d="M5 3h2v10H5zM9 3h2v10H9z" />,
  plus: <path d="M8 3v10M3 8h10" />,
  copy: <path d="M5.5 2.5h8v8h-8zM2.5 5.5v8h8" />,
  trash: <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6L11.5 4" />,
  eye: <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8zM8 6a2 2 0 100 4 2 2 0 000-4z" />,
  eyeOff: <path d="M2 2l12 12M6 4.2A7.6 7.6 0 018 4c4.5 0 7 4 7 4a12 12 0 01-2.4 2.8M4.3 5.4A12 12 0 001 8s2.5 4.5 7 4.5a7.7 7.7 0 002.3-.34" />,
  lock: <path d="M4.5 7V5a3.5 3.5 0 017 0v2M3.5 7h9v6.5h-9z" />,
  unlock: <path d="M4.5 7V5a3.5 3.5 0 016.9-.9M3.5 7h9v6.5h-9z" />,
  download: <path d="M8 2v8M4.5 7L8 10.5 11.5 7M2.5 13.5h11" />,
  image: <path d="M2.5 3.5h11v9h-11zM2.5 10l3-3 2.5 2.5L11 6l2.5 2.5M6 6a.9.9 0 100 .1z" />,
  folder: <path d="M2 4.5h4.5l1.2 1.5H14v7.5H2z" />,
  help: <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.3 6.2A1.8 1.8 0 019.7 7c0 1.2-1.7 1.4-1.7 2.6M8 12h.01" />,
  grid: <path d="M2 6h12M2 10h12M6 2v12M10 2v12" />,
  onion: <path d="M4.5 3.5h7v7h-7zM6.5 5.5h7v7h-7z" />,
  swap: <path d="M3 5h8L9 3M13 11H5l2 2" />,
  sun: <path d="M8 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1" />,
  moon: <path d="M13.2 9.6A5.6 5.6 0 016.4 2.8a5.8 5.8 0 106.8 6.8z" />,
  // seçim: kesikli dikdörtgen (yürüyen karıncaların statik hali)
  select: <path d="M2 2.5h3M7 2.5h2M11 2.5h3M13.5 4v3M13.5 9v2M11 13.5h3M7 13.5h2M2 13.5h3M2.5 11v-2M2.5 7V4" />,
  // iskelet: iki eklem + aralarındaki kemik, üçüncü eklem dallanma
  rig: (
    <>
      <path d="M4 3.5l4.5 4M8.5 7.5L12.5 12.5M8.5 7.5L4 12" />
      <circle cx="3.5" cy="3" r="1.6" />
      <circle cx="9" cy="7.5" r="1.6" />
      <circle cx="13" cy="13" r="1.4" />
      <circle cx="3.5" cy="12.5" r="1.4" />
    </>
  ),
};

export default function Icon({
  name,
  size = 16,
  filled = false,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
}) {
  const solid = filled || name === "play" || name === "pause" || name === "fill" || name === "pen";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={solid ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={solid ? 0 : 1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}
