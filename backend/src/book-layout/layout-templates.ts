export interface TemplateTextSlot {
  placeholder: string;
  /** Default x position (% of spread width) when creating text element */
  x: number;
  /** Default y position (% of spread height) */
  y: number;
  /** Default width (%) */
  w: number;
  /** Default height (%) */
  h: number;
  fontSize: number;
}

export interface LayoutTemplate {
  id: string;
  name: string;
  /** PHOTO = only photo cells, TEXT = only text cells, MIXED = both */
  kind: 'PHOTO' | 'TEXT' | 'MIXED';
  /** Total grid cells (photo + text combined) */
  cells: number;
  /** How many cells are photo slots */
  photoSlots: number;
  /** CSS grid-template-columns */
  columns: string;
  /** CSS grid-template-rows */
  rows: string;
  /** CSS grid-template-areas */
  areas?: string;
  /** Per-cell kind; defaults to all 'photo' if omitted */
  cellKinds?: ('photo' | 'text')[];
  /** Default position/style when auto-creating text elements for text slots */
  textSlots?: TemplateTextSlot[];
  /** Optional padding inside the grid container (e.g. '6%' for margin layouts) */
  gridPadding?: string;
  /** UI grouping label */
  category: string;
}

// Cell names used for CSS grid-area assignment: cell[i] → CELL_NAMES[i]
// Must stay in sync with frontend CELL_NAMES constant
const _CELL_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [

  // ─── 1 фото ──────────────────────────────────────────────────
  {
    id: '1',
    name: '1 фото (на всю)',
    kind: 'PHOTO',
    cells: 1,
    photoSlots: 1,
    columns: '1fr',
    rows: '1fr',
    category: '1 фото',
  },
  {
    id: '1m',
    name: '1 фото (с полями)',
    kind: 'PHOTO',
    cells: 1,
    photoSlots: 1,
    columns: '1fr',
    rows: '1fr',
    gridPadding: '7%',
    category: '1 фото',
  },

  // ─── 2 фото ──────────────────────────────────────────────────
  {
    id: '2h',
    name: '2 горизонтально',
    kind: 'PHOTO',
    cells: 2,
    photoSlots: 2,
    columns: '1fr 1fr',
    rows: '1fr',
    category: '2 фото',
  },
  {
    id: '2v',
    name: '2 вертикально',
    kind: 'PHOTO',
    cells: 2,
    photoSlots: 2,
    columns: '1fr',
    rows: '1fr 1fr',
    category: '2 фото',
  },
  {
    id: '2b',
    name: '1 большое + 1',
    kind: 'PHOTO',
    cells: 2,
    photoSlots: 2,
    columns: '2fr 1fr',
    rows: '1fr',
    category: '2 фото',
  },

  // ─── 3 фото ──────────────────────────────────────────────────
  {
    id: '3r',
    name: '1 большое + 2 справа',
    kind: 'PHOTO',
    cells: 3,
    photoSlots: 3,
    columns: '2fr 1fr',
    rows: '1fr 1fr',
    areas: '"a b" "a c"',
    category: '3 фото',
  },
  {
    id: '3b',
    name: '1 большое + 2 снизу',
    kind: 'PHOTO',
    cells: 3,
    photoSlots: 3,
    columns: '1fr 1fr',
    rows: '2fr 1fr',
    areas: '"a a" "b c"',
    category: '3 фото',
  },
  {
    id: '3h',
    name: '3 в ряд',
    kind: 'PHOTO',
    cells: 3,
    photoSlots: 3,
    columns: '1fr 1fr 1fr',
    rows: '1fr',
    category: '3 фото',
  },
  {
    id: '3v',
    name: '3 столбцом',
    kind: 'PHOTO',
    cells: 3,
    photoSlots: 3,
    columns: '1fr',
    rows: '1fr 1fr 1fr',
    category: '3 фото',
  },

  // ─── 4 фото ──────────────────────────────────────────────────
  {
    id: '4',
    name: '4 фото (2×2)',
    kind: 'PHOTO',
    cells: 4,
    photoSlots: 4,
    columns: '1fr 1fr',
    rows: '1fr 1fr',
    category: '4 фото',
  },
  {
    id: '4t',
    name: '1 большое сверху + 3',
    kind: 'PHOTO',
    cells: 4,
    photoSlots: 4,
    columns: '1fr 1fr 1fr',
    rows: '2fr 1fr',
    areas: '"a a a" "b c d"',
    category: '4 фото',
  },
  {
    id: '4l',
    name: '1 большое слева + 3',
    kind: 'PHOTO',
    cells: 4,
    photoSlots: 4,
    columns: '2fr 1fr',
    rows: '1fr 1fr 1fr',
    areas: '"a b" "a c" "a d"',
    category: '4 фото',
  },
  {
    id: '4s',
    name: '4 в полосе',
    kind: 'PHOTO',
    cells: 4,
    photoSlots: 4,
    columns: '1fr 1fr 1fr 1fr',
    rows: '1fr',
    category: '4 фото',
  },

  // ─── 5 фото ──────────────────────────────────────────────────
  {
    id: '5',
    name: '1 большое + 4 справа',
    kind: 'PHOTO',
    cells: 5,
    photoSlots: 5,
    columns: '2fr 1fr 1fr',
    rows: '1fr 1fr',
    areas: '"a b c" "a d e"',
    category: '5 фото',
  },
  {
    id: '5t',
    name: '1 сверху + 4 снизу',
    kind: 'PHOTO',
    cells: 5,
    photoSlots: 5,
    columns: '1fr 1fr 1fr 1fr',
    rows: '2fr 1fr',
    areas: '"a a a a" "b c d e"',
    category: '5 фото',
  },
  {
    id: '5m',
    name: '5 мозаика (2+3)',
    kind: 'PHOTO',
    cells: 5,
    photoSlots: 5,
    columns: '1fr 1fr 1fr',
    rows: '1fr 1fr',
    areas: '"a a b" "c d e"',
    category: '5 фото',
  },

  // ─── 6 фото ──────────────────────────────────────────────────
  {
    id: '6',
    name: '6 фото (3×2)',
    kind: 'PHOTO',
    cells: 6,
    photoSlots: 6,
    columns: '1fr 1fr 1fr',
    rows: '1fr 1fr',
    category: '6 фото',
  },
  {
    id: '6v',
    name: '6 фото (2×3)',
    kind: 'PHOTO',
    cells: 6,
    photoSlots: 6,
    columns: '1fr 1fr',
    rows: '1fr 1fr 1fr',
    category: '6 фото',
  },
  {
    id: '6b',
    name: '1 большое + 5',
    kind: 'PHOTO',
    cells: 6,
    photoSlots: 6,
    columns: '2fr 1fr 1fr',
    rows: '1fr 1fr 1fr',
    areas: '"a b c" "a d e" "a f ."',
    category: '6 фото',
  },

  // ─── 7 фото ──────────────────────────────────────────────────
  {
    id: '7',
    name: '7 фото',
    kind: 'PHOTO',
    cells: 7,
    photoSlots: 7,
    columns: '1fr 1fr 1fr 1fr',
    rows: '1fr 1fr',
    areas: '"a a b c" "d e f g"',
    category: '7 фото',
  },
  {
    id: '7b',
    name: '7 фото (3+4)',
    kind: 'PHOTO',
    cells: 7,
    photoSlots: 7,
    columns: '1fr 1fr 1fr 1fr',
    rows: '1fr 1fr',
    areas: '"a b c d" "e f g g"',
    category: '7 фото',
  },

  // ─── 8 фото ──────────────────────────────────────────────────
  {
    id: '8',
    name: '8 фото (4×2)',
    kind: 'PHOTO',
    cells: 8,
    photoSlots: 8,
    columns: '1fr 1fr 1fr 1fr',
    rows: '1fr 1fr',
    category: '8 фото',
  },
  {
    id: '8v',
    name: '8 фото (2×4)',
    kind: 'PHOTO',
    cells: 8,
    photoSlots: 8,
    columns: '1fr 1fr',
    rows: '1fr 1fr 1fr 1fr',
    category: '8 фото',
  },
  {
    id: '8t',
    name: '8 фото (3+3+2)',
    kind: 'PHOTO',
    cells: 8,
    photoSlots: 8,
    columns: '1fr 1fr 1fr',
    rows: '1fr 1fr 1fr',
    areas: '"a b c" "d e f" "g g h"',
    category: '8 фото',
  },

  // ─── Смешанные ───────────────────────────────────────────────
  {
    id: 'mx-1b',
    name: '1 фото + текст снизу',
    kind: 'MIXED',
    cells: 2,
    photoSlots: 1,
    columns: '1fr',
    rows: '3fr 1fr',
    areas: '"a" "b"',
    cellKinds: ['photo', 'text'],
    textSlots: [{ placeholder: 'Ваш текст здесь', x: 5, y: 78, w: 90, h: 14, fontSize: 14 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-1t',
    name: 'Текст сверху + 1 фото',
    kind: 'MIXED',
    cells: 2,
    photoSlots: 1,
    columns: '1fr',
    rows: '1fr 3fr',
    areas: '"a" "b"',
    cellKinds: ['text', 'photo'],
    textSlots: [{ placeholder: 'Введите подпись', x: 5, y: 4, w: 90, h: 16, fontSize: 14 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-1r',
    name: '1 фото + текст справа',
    kind: 'MIXED',
    cells: 2,
    photoSlots: 1,
    columns: '3fr 1fr',
    rows: '1fr',
    areas: '"a b"',
    cellKinds: ['photo', 'text'],
    textSlots: [{ placeholder: 'Ваш текст', x: 76, y: 20, w: 20, h: 60, fontSize: 12 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-1l',
    name: 'Текст слева + 1 фото',
    kind: 'MIXED',
    cells: 2,
    photoSlots: 1,
    columns: '1fr 3fr',
    rows: '1fr',
    areas: '"a b"',
    cellKinds: ['text', 'photo'],
    textSlots: [{ placeholder: 'Ваш текст', x: 3, y: 20, w: 22, h: 60, fontSize: 12 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-2b',
    name: '2 фото + текст снизу',
    kind: 'MIXED',
    cells: 3,
    photoSlots: 2,
    columns: '1fr 1fr',
    rows: '3fr 1fr',
    areas: '"a b" "c c"',
    cellKinds: ['photo', 'photo', 'text'],
    textSlots: [{ placeholder: 'Подпись к фото', x: 5, y: 78, w: 90, h: 14, fontSize: 13 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-3b',
    name: '3 фото + текст снизу',
    kind: 'MIXED',
    cells: 4,
    photoSlots: 3,
    columns: '1fr 1fr 1fr',
    rows: '3fr 1fr',
    areas: '"a b c" "d d d"',
    cellKinds: ['photo', 'photo', 'photo', 'text'],
    textSlots: [{ placeholder: 'Подпись', x: 5, y: 79, w: 90, h: 13, fontSize: 13 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-4b',
    name: '4 фото + текст снизу',
    kind: 'MIXED',
    cells: 5,
    photoSlots: 4,
    columns: '1fr 1fr 1fr 1fr',
    rows: '3fr 1fr',
    areas: '"a b c d" "e e e e"',
    cellKinds: ['photo', 'photo', 'photo', 'photo', 'text'],
    textSlots: [{ placeholder: 'Описание', x: 5, y: 79, w: 90, h: 13, fontSize: 12 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-2r',
    name: '2 фото + текст справа',
    kind: 'MIXED',
    cells: 3,
    photoSlots: 2,
    columns: '2fr 1fr',
    rows: '1fr 1fr',
    areas: '"a c" "b c"',
    cellKinds: ['photo', 'photo', 'text'],
    textSlots: [{ placeholder: 'Ваш текст', x: 68, y: 15, w: 28, h: 70, fontSize: 12 }],
    category: 'Смешанные',
  },
  {
    id: 'mx-title',
    name: 'Заголовок + фото',
    kind: 'MIXED',
    cells: 2,
    photoSlots: 1,
    columns: '1fr',
    rows: '1fr 2fr',
    areas: '"a" "b"',
    cellKinds: ['text', 'photo'],
    textSlots: [{ placeholder: 'Заголовок страницы', x: 5, y: 5, w: 90, h: 26, fontSize: 22 }],
    category: 'Смешанные',
  },

  // ─── Текстовые ───────────────────────────────────────────────
  {
    id: 'tx-c',
    name: 'Текст по центру',
    kind: 'TEXT',
    cells: 1,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr',
    cellKinds: ['text'],
    textSlots: [{ placeholder: 'Ваш текст здесь', x: 10, y: 30, w: 80, h: 40, fontSize: 16 }],
    category: 'Текст',
  },
  {
    id: 'tx-t',
    name: 'Текст сверху',
    kind: 'TEXT',
    cells: 1,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr',
    cellKinds: ['text'],
    textSlots: [{ placeholder: 'Ваш текст', x: 10, y: 8, w: 80, h: 30, fontSize: 15 }],
    category: 'Текст',
  },
  {
    id: 'tx-b',
    name: 'Текст снизу',
    kind: 'TEXT',
    cells: 1,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr',
    cellKinds: ['text'],
    textSlots: [{ placeholder: 'Ваш текст', x: 10, y: 62, w: 80, h: 30, fontSize: 15 }],
    category: 'Текст',
  },
  {
    id: 'tx-lg',
    name: 'Крупный заголовок',
    kind: 'TEXT',
    cells: 1,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr',
    cellKinds: ['text'],
    textSlots: [{ placeholder: 'Заголовок', x: 5, y: 25, w: 90, h: 50, fontSize: 32 }],
    category: 'Текст',
  },
  {
    id: 'tx-q',
    name: 'Цитата',
    kind: 'TEXT',
    cells: 1,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr',
    cellKinds: ['text'],
    textSlots: [{ placeholder: '«Ваша цитата или памятный момент»', x: 15, y: 28, w: 70, h: 44, fontSize: 18 }],
    category: 'Текст',
  },
  {
    id: 'tx-2',
    name: '2 колонки текста',
    kind: 'TEXT',
    cells: 2,
    photoSlots: 0,
    columns: '1fr 1fr',
    rows: '1fr',
    cellKinds: ['text', 'text'],
    textSlots: [
      { placeholder: 'Левая колонка', x: 5, y: 15, w: 43, h: 70, fontSize: 13 },
      { placeholder: 'Правая колонка', x: 52, y: 15, w: 43, h: 70, fontSize: 13 },
    ],
    category: 'Текст',
  },
  {
    id: 'tx-title',
    name: 'Заголовок + подзаголовок',
    kind: 'TEXT',
    cells: 2,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr 1fr',
    cellKinds: ['text', 'text'],
    textSlots: [
      { placeholder: 'Заголовок', x: 10, y: 18, w: 80, h: 30, fontSize: 26 },
      { placeholder: 'Подзаголовок или описание', x: 10, y: 55, w: 80, h: 25, fontSize: 14 },
    ],
    category: 'Текст',
  },
  {
    id: 'tx-full',
    name: 'Текст на всю страницу',
    kind: 'TEXT',
    cells: 1,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr',
    cellKinds: ['text'],
    textSlots: [{ placeholder: 'Напишите что угодно…', x: 8, y: 8, w: 84, h: 84, fontSize: 14 }],
    category: 'Текст',
  },

  // ─── Обложка ─────────────────────────────────────────────────
  {
    id: 'cv-1',
    name: 'Обложка: фото + заголовок',
    kind: 'MIXED',
    cells: 2,
    photoSlots: 1,
    columns: '1fr',
    rows: '4fr 1fr',
    areas: '"a" "b"',
    cellKinds: ['photo', 'text'],
    textSlots: [{ placeholder: 'Название книги', x: 5, y: 82, w: 90, h: 14, fontSize: 18 }],
    category: 'Обложка',
  },
  {
    id: 'cv-2',
    name: 'Обложка: фото + боковой заголовок',
    kind: 'MIXED',
    cells: 2,
    photoSlots: 1,
    columns: '1fr 1fr',
    rows: '1fr',
    areas: '"a b"',
    cellKinds: ['photo', 'text'],
    textSlots: [{ placeholder: 'Название книги', x: 54, y: 25, w: 42, h: 50, fontSize: 20 }],
    category: 'Обложка',
  },
  {
    id: 'cv-plain',
    name: 'Обложка: только заголовок',
    kind: 'TEXT',
    cells: 1,
    photoSlots: 0,
    columns: '1fr',
    rows: '1fr',
    cellKinds: ['text'],
    textSlots: [{ placeholder: 'Название вашей книги', x: 10, y: 20, w: 80, h: 60, fontSize: 28 }],
    category: 'Обложка',
  },
];

export const TEMPLATES_BY_ID = Object.fromEntries(
  LAYOUT_TEMPLATES.map((t) => [t.id, t]),
);

export function templateForCount(n: number): LayoutTemplate {
  const map: Record<number, string> = {
    1: '1',
    2: '2h',
    3: '3b',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
  };
  const id = map[n] ?? '8';
  return TEMPLATES_BY_ID[id] ?? LAYOUT_TEMPLATES[LAYOUT_TEMPLATES.length - 1];
}
