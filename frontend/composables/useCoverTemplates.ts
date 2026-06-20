// Cover template library for the Book Layout module.
// Each CoverTemplate describes the visual style of the book cover (back + spine + front).
// Text slot coordinates are RELATIVE TO THEIR ZONE (0-100%) so they scale correctly
// to any book size. Absolute canvas positions are computed at apply-time.

export interface CoverTextSlot {
  placeholder: string;
  zone: 'front' | 'back';
  relX: number;   // % within zone width (0-100)
  relY: number;   // % of full canvas height (0-100)
  relW: number;   // % of zone width (0-100)
  relH: number;   // % of canvas height (used for h field)
  fontFamily: string;
  fontSize: number;
  color: string;
}

export interface CoverTemplate {
  id: string;
  name: string;
  palette: string;          // category group label
  frontBg: string;          // CSS color for front zone background (shown when no photo / as fallback)
  frontOverlay?: string;    // optional CSS gradient rendered ON TOP of the photo (for overlay templates)
  backBg: string;           // CSS color for back zone background
  spineBg: string;          // CSS color for spine
  hasPhoto: boolean;        // true = photo cell 0 expected on front
  textSlots: CoverTextSlot[];
  spineColor: string;       // spine text color
  spineFont: string;        // spine text font
}

// ─── Helper: generate id-safe slug ──────────────────────────────

// ─── NEUTRAL — айвори, кремовый, серый, белый ─────────────────

const NEUTRAL: CoverTemplate[] = [
  {
    id: 'ct-ivory-classic',
    name: 'Айвори классик',
    palette: 'Нейтральные',
    frontBg: '#f8f5ef',
    backBg: '#f0ece4',
    spineBg: '#c8bfa8',
    hasPhoto: false,
    spineColor: '#3d3428',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваша история', zone: 'front', relX: 10, relY: 38, relW: 80, relH: 8, fontFamily: 'Playfair Display', fontSize: 20, color: '#2c2416' },
      { placeholder: '2024', zone: 'front', relX: 10, relY: 54, relW: 40, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#8a7c6a' },
    ],
  },
  {
    id: 'ct-ivory-editorial',
    name: 'Айвори эдиториал',
    palette: 'Нейтральные',
    frontBg: '#f7f3ec',
    backBg: '#ede9e0',
    spineBg: '#b8ad98',
    hasPhoto: false,
    spineColor: '#3d3428',
    spineFont: 'Cormorant Garamond',
    textSlots: [
      { placeholder: 'ФОТОАЛЬБОМ', zone: 'front', relX: 8, relY: 72, relW: 84, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#6b5e4e' },
      { placeholder: 'Ваше название', zone: 'front', relX: 8, relY: 79, relW: 84, relH: 9, fontFamily: 'Cormorant Garamond', fontSize: 26, color: '#1e1810' },
    ],
  },
  {
    id: 'ct-cream-center',
    name: 'Кремовый центр',
    palette: 'Нейтральные',
    frontBg: '#faf7f2',
    backBg: '#f0ece5',
    spineBg: '#d4c9b8',
    hasPhoto: false,
    spineColor: '#4a4035',
    spineFont: 'Playfair Display',
    textSlots: [
      { placeholder: 'Название книги', zone: 'front', relX: 5, relY: 40, relW: 90, relH: 9, fontFamily: 'Playfair Display', fontSize: 22, color: '#2a2018' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 5, relY: 57, relW: 90, relH: 5, fontFamily: 'Cormorant Garamond', fontSize: 13, color: '#7a6d5e' },
      { placeholder: 'Автор · 2024', zone: 'front', relX: 5, relY: 86, relW: 90, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#a09080' },
    ],
  },
  {
    id: 'ct-beige-minimal',
    name: 'Бежевый минимал',
    palette: 'Нейтральные',
    frontBg: '#f5f0e8',
    backBg: '#ece7dd',
    spineBg: '#c8bda8',
    hasPhoto: false,
    spineColor: '#5a5040',
    spineFont: 'Raleway',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 44, relW: 84, relH: 8, fontFamily: 'Raleway', fontSize: 18, color: '#2e2820' },
    ],
  },
  {
    id: 'ct-warm-grey',
    name: 'Тёплый серый',
    palette: 'Нейтральные',
    frontBg: '#e8e5e0',
    backBg: '#dedad4',
    spineBg: '#b0aba4',
    hasPhoto: false,
    spineColor: '#3c3c3a',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Название', zone: 'front', relX: 8, relY: 35, relW: 84, relH: 11, fontFamily: 'Playfair Display', fontSize: 26, color: '#1e1e1c' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 52, relW: 60, relH: 5, fontFamily: 'Montserrat', fontSize: 10, color: '#6a6660' },
      { placeholder: '2024', zone: 'front', relX: 8, relY: 84, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#9a9590' },
    ],
  },
  {
    id: 'ct-white-clean',
    name: 'Белый чистый',
    palette: 'Нейтральные',
    frontBg: '#ffffff',
    backBg: '#f8f8f8',
    spineBg: '#d0d0d0',
    hasPhoto: false,
    spineColor: '#404040',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 42, relW: 84, relH: 8, fontFamily: 'Montserrat', fontSize: 18, color: '#111111' },
      { placeholder: 'Описание альбома', zone: 'front', relX: 8, relY: 56, relW: 84, relH: 5, fontFamily: 'Montserrat', fontSize: 10, color: '#666666' },
    ],
  },
  {
    id: 'ct-linen-serif',
    name: 'Лён с засечками',
    palette: 'Нейтральные',
    frontBg: '#f2ede4',
    backBg: '#e8e3da',
    spineBg: '#bab5ab',
    hasPhoto: false,
    spineColor: '#4a4540',
    spineFont: 'Cormorant Garamond',
    textSlots: [
      { placeholder: 'Фотокнига', zone: 'front', relX: 10, relY: 12, relW: 80, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#9a9080' },
      { placeholder: 'Ваш\nзаголовок', zone: 'front', relX: 10, relY: 32, relW: 80, relH: 18, fontFamily: 'Cormorant Garamond', fontSize: 34, color: '#1c1810' },
      { placeholder: 'Дата · Место', zone: 'front', relX: 10, relY: 85, relW: 80, relH: 4, fontFamily: 'Cormorant Garamond', fontSize: 12, color: '#7a7060' },
    ],
  },
];

// ─── ПАСТЕЛЬНЫЕ ────────────────────────────────────────────────

const PASTEL: CoverTemplate[] = [
  {
    id: 'ct-powder-rose',
    name: 'Пудровый розовый',
    palette: 'Пастельные',
    frontBg: '#f7e8e8',
    backBg: '#f0dcdc',
    spineBg: '#d4a8a8',
    hasPhoto: false,
    spineColor: '#5a2020',
    spineFont: 'Cormorant Garamond',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 40, relW: 84, relH: 9, fontFamily: 'Cormorant Garamond', fontSize: 24, color: '#4a2828' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 56, relW: 84, relH: 5, fontFamily: 'Raleway', fontSize: 10, color: '#8a6060' },
    ],
  },
  {
    id: 'ct-sage-green',
    name: 'Шалфей',
    palette: 'Пастельные',
    frontBg: '#e8eeea',
    backBg: '#dce4de',
    spineBg: '#a8c0ac',
    hasPhoto: false,
    spineColor: '#2a4030',
    spineFont: 'Raleway',
    textSlots: [
      { placeholder: 'Фотокнига', zone: 'front', relX: 10, relY: 10, relW: 80, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#688070' },
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 10, relY: 42, relW: 80, relH: 9, fontFamily: 'Playfair Display', fontSize: 22, color: '#1e3028' },
      { placeholder: '2024', zone: 'front', relX: 10, relY: 80, relW: 40, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#688070' },
    ],
  },
  {
    id: 'ct-lavender',
    name: 'Лаванда',
    palette: 'Пастельные',
    frontBg: '#ece8f5',
    backBg: '#e4deee',
    spineBg: '#b8a8d8',
    hasPhoto: false,
    spineColor: '#3a2860',
    spineFont: 'Playfair Display',
    textSlots: [
      { placeholder: 'Название', zone: 'front', relX: 8, relY: 38, relW: 84, relH: 10, fontFamily: 'Playfair Display', fontSize: 24, color: '#2c1e50' },
      { placeholder: 'Дата · Место', zone: 'front', relX: 8, relY: 56, relW: 84, relH: 5, fontFamily: 'Raleway', fontSize: 10, color: '#7868a8' },
    ],
  },
  {
    id: 'ct-sky-blue',
    name: 'Голубой',
    palette: 'Пастельные',
    frontBg: '#e8f0f8',
    backBg: '#dce8f2',
    spineBg: '#a8c0d8',
    hasPhoto: false,
    spineColor: '#1a3050',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'ФОТОАЛЬБОМ', zone: 'front', relX: 8, relY: 8, relW: 84, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#4a7090' },
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 40, relW: 84, relH: 9, fontFamily: 'Montserrat', fontSize: 20, color: '#142840' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 56, relW: 70, relH: 5, fontFamily: 'Raleway', fontSize: 10, color: '#5a80a0' },
    ],
  },
  {
    id: 'ct-peach',
    name: 'Персиковый',
    palette: 'Пастельные',
    frontBg: '#faeae0',
    backBg: '#f2ddd0',
    spineBg: '#d4a888',
    hasPhoto: false,
    spineColor: '#5a2a10',
    spineFont: 'Caveat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 42, relW: 84, relH: 9, fontFamily: 'Caveat', fontSize: 26, color: '#4a2010' },
      { placeholder: 'с любовью', zone: 'front', relX: 8, relY: 58, relW: 60, relH: 5, fontFamily: 'Caveat', fontSize: 14, color: '#a06040' },
    ],
  },
  {
    id: 'ct-mint',
    name: 'Мятный',
    palette: 'Пастельные',
    frontBg: '#e4f5f0',
    backBg: '#d8eee8',
    spineBg: '#88c8b8',
    hasPhoto: false,
    spineColor: '#0a3828',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 10, relY: 44, relW: 80, relH: 8, fontFamily: 'Raleway', fontSize: 18, color: '#0c3020' },
      { placeholder: 'Воспоминания', zone: 'front', relX: 10, relY: 59, relW: 80, relH: 5, fontFamily: 'Raleway', fontSize: 11, color: '#3a8878' },
    ],
  },
];

// ─── НАСЫЩЕННЫЕ ─────────────────────────────────────────────────

const SATURATED: CoverTemplate[] = [
  {
    id: 'ct-navy-classic',
    name: 'Тёмно-синий классик',
    palette: 'Насыщенные',
    frontBg: '#1a2844',
    backBg: '#162038',
    spineBg: '#243560',
    hasPhoto: false,
    spineColor: '#c8d8f0',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 38, relW: 84, relH: 10, fontFamily: 'Playfair Display', fontSize: 24, color: '#e8f0f8' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 56, relW: 70, relH: 5, fontFamily: 'Raleway', fontSize: 11, color: '#90a8c8' },
      { placeholder: '2024', zone: 'front', relX: 8, relY: 84, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#708898' },
    ],
  },
  {
    id: 'ct-burgundy',
    name: 'Бордо',
    palette: 'Насыщенные',
    frontBg: '#4a1520',
    backBg: '#3c1018',
    spineBg: '#661828',
    hasPhoto: false,
    spineColor: '#f0d0c0',
    spineFont: 'Cormorant Garamond',
    textSlots: [
      { placeholder: 'Название книги', zone: 'front', relX: 8, relY: 36, relW: 84, relH: 12, fontFamily: 'Cormorant Garamond', fontSize: 30, color: '#f5e8e0' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 55, relW: 84, relH: 5, fontFamily: 'Raleway', fontSize: 11, color: '#d0a090' },
      { placeholder: 'Автор · Год', zone: 'front', relX: 8, relY: 85, relW: 84, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#c09080' },
    ],
  },
  {
    id: 'ct-forest',
    name: 'Лесной зелёный',
    palette: 'Насыщенные',
    frontBg: '#1a3020',
    backBg: '#142818',
    spineBg: '#204030',
    hasPhoto: false,
    spineColor: '#c0d8c0',
    spineFont: 'Raleway',
    textSlots: [
      { placeholder: 'ПРИРОДА', zone: 'front', relX: 10, relY: 10, relW: 80, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#88c090' },
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 10, relY: 40, relW: 80, relH: 10, fontFamily: 'Raleway', fontSize: 22, color: '#e0f0e0' },
      { placeholder: '2024', zone: 'front', relX: 10, relY: 82, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#70a878' },
    ],
  },
  {
    id: 'ct-terracotta',
    name: 'Терракота',
    palette: 'Насыщенные',
    frontBg: '#a83820',
    backBg: '#902e18',
    spineBg: '#c44a2a',
    hasPhoto: false,
    spineColor: '#f8e8d8',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 38, relW: 84, relH: 11, fontFamily: 'Playfair Display', fontSize: 26, color: '#faf0e8' },
      { placeholder: 'Дата · Место', zone: 'front', relX: 8, relY: 57, relW: 84, relH: 5, fontFamily: 'Montserrat', fontSize: 10, color: '#f0c8a8' },
    ],
  },
  {
    id: 'ct-indigo',
    name: 'Индиго',
    palette: 'Насыщенные',
    frontBg: '#2a1858',
    backBg: '#220f48',
    spineBg: '#38228a',
    hasPhoto: false,
    spineColor: '#d0c0f0',
    spineFont: 'Raleway',
    textSlots: [
      { placeholder: 'ФОТОКНИГА', zone: 'front', relX: 8, relY: 8, relW: 84, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#9080d0' },
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 40, relW: 84, relH: 10, fontFamily: 'Raleway', fontSize: 22, color: '#f0e8ff' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 57, relW: 84, relH: 5, fontFamily: 'Raleway', fontSize: 11, color: '#b0a0e0' },
    ],
  },
  {
    id: 'ct-plum',
    name: 'Сливовый',
    palette: 'Насыщенные',
    frontBg: '#3a1840',
    backBg: '#2e1234',
    spineBg: '#52205e',
    hasPhoto: false,
    spineColor: '#e8c0f0',
    spineFont: 'Playfair Display',
    textSlots: [
      { placeholder: 'Название', zone: 'front', relX: 8, relY: 36, relW: 84, relH: 12, fontFamily: 'Cormorant Garamond', fontSize: 30, color: '#f8e0ff' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 56, relW: 84, relH: 5, fontFamily: 'Raleway', fontSize: 10, color: '#c890d8' },
      { placeholder: '2024', zone: 'front', relX: 8, relY: 85, relW: 40, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#a870b8' },
    ],
  },
  {
    id: 'ct-copper',
    name: 'Медный',
    palette: 'Насыщенные',
    frontBg: '#5a3010',
    backBg: '#4a2808',
    spineBg: '#8a5020',
    hasPhoto: false,
    spineColor: '#f8e0c0',
    spineFont: 'Cormorant Garamond',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 40, relW: 84, relH: 11, fontFamily: 'Cormorant Garamond', fontSize: 28, color: '#f8e8d0' },
      { placeholder: 'Дата', zone: 'front', relX: 8, relY: 58, relW: 40, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#d0a070' },
    ],
  },
];

// ─── ТЁМНЫЕ / ГРАФИТ ───────────────────────────────────────────

const DARK: CoverTemplate[] = [
  {
    id: 'ct-charcoal',
    name: 'Графит',
    palette: 'Тёмные',
    frontBg: '#2a2a28',
    backBg: '#222220',
    spineBg: '#383835',
    hasPhoto: false,
    spineColor: '#d0ccc8',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 38, relW: 84, relH: 10, fontFamily: 'Montserrat', fontSize: 22, color: '#f0eeec' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 56, relW: 70, relH: 5, fontFamily: 'Raleway', fontSize: 11, color: '#b0aca8' },
    ],
  },
  {
    id: 'ct-slate-editorial',
    name: 'Тёмный эдиториал',
    palette: 'Тёмные',
    frontBg: '#1e2428',
    backBg: '#18202a',
    spineBg: '#2c3438',
    hasPhoto: false,
    spineColor: '#c0d0d8',
    spineFont: 'Cormorant Garamond',
    textSlots: [
      { placeholder: 'ФОТОАЛЬБОМ', zone: 'front', relX: 8, relY: 70, relW: 84, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#7090a0' },
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 77, relW: 84, relH: 12, fontFamily: 'Cormorant Garamond', fontSize: 30, color: '#e8f0f4' },
    ],
  },
  {
    id: 'ct-darkbrown',
    name: 'Тёмно-коричневый',
    palette: 'Тёмные',
    frontBg: '#1c1410',
    backBg: '#18100c',
    spineBg: '#2e2018',
    hasPhoto: false,
    spineColor: '#e0cca8',
    spineFont: 'Playfair Display',
    textSlots: [
      { placeholder: 'Название книги', zone: 'front', relX: 8, relY: 38, relW: 84, relH: 12, fontFamily: 'Playfair Display', fontSize: 26, color: '#eedfc4' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 58, relW: 84, relH: 5, fontFamily: 'Cormorant Garamond', fontSize: 14, color: '#c0a880' },
      { placeholder: '2024', zone: 'front', relX: 8, relY: 84, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#907858' },
    ],
  },
  {
    id: 'ct-nearblack',
    name: 'Почти чёрный',
    palette: 'Тёмные',
    frontBg: '#111111',
    backBg: '#0e0e0e',
    spineBg: '#1c1c1c',
    hasPhoto: false,
    spineColor: '#e0e0e0',
    spineFont: 'Raleway',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 42, relW: 84, relH: 9, fontFamily: 'Raleway', fontSize: 20, color: '#f0f0f0' },
      { placeholder: 'Год', zone: 'front', relX: 8, relY: 84, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#888888' },
    ],
  },
  {
    id: 'ct-nightblue',
    name: 'Ночной синий',
    palette: 'Тёмные',
    frontBg: '#0c1420',
    backBg: '#0a1018',
    spineBg: '#141c2c',
    hasPhoto: false,
    spineColor: '#a0c0e0',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'ВОСПОМИНАНИЯ', zone: 'front', relX: 8, relY: 10, relW: 84, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#5090b8' },
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 8, relY: 40, relW: 84, relH: 10, fontFamily: 'Playfair Display', fontSize: 24, color: '#d8eaf8' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 8, relY: 58, relW: 70, relH: 5, fontFamily: 'Raleway', fontSize: 11, color: '#6090b0' },
      { placeholder: '2024', zone: 'front', relX: 8, relY: 84, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#405870' },
    ],
  },
];

// ─── ФОТО + ТЕКСТ ──────────────────────────────────────────────

const PHOTO_PLUS: CoverTemplate[] = [
  {
    id: 'ct-photo-bottom-text',
    name: 'Фото + текст снизу',
    palette: 'С фото',
    frontBg: '#1a1a18',
    backBg: '#f0ece4',
    spineBg: '#2a2a28',
    hasPhoto: true,
    spineColor: '#d8d4d0',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 5, relY: 72, relW: 90, relH: 9, fontFamily: 'Playfair Display', fontSize: 22, color: '#f5f2ee' },
      { placeholder: 'Подзаголовок', zone: 'front', relX: 5, relY: 84, relW: 70, relH: 5, fontFamily: 'Raleway', fontSize: 10, color: '#c0b8b0' },
    ],
  },
  {
    id: 'ct-photo-top-title',
    name: 'Фото + заголовок сверху',
    palette: 'С фото',
    frontBg: '#1c1c1c',
    backBg: '#e8e4dc',
    spineBg: '#2c2c2c',
    hasPhoto: true,
    spineColor: '#d0d0d0',
    spineFont: 'Raleway',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 5, relY: 5, relW: 90, relH: 9, fontFamily: 'Montserrat', fontSize: 18, color: '#f0f0f0' },
      { placeholder: 'Год', zone: 'front', relX: 5, relY: 16, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#b0b0b0' },
    ],
  },
  {
    id: 'ct-photo-ivory-frame',
    name: 'Фото в рамке айвори',
    palette: 'С фото',
    frontBg: '#f5f0e8',
    backBg: '#ede8e0',
    spineBg: '#c8c0b0',
    hasPhoto: true,
    spineColor: '#4a4438',
    spineFont: 'Cormorant Garamond',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 5, relY: 72, relW: 90, relH: 9, fontFamily: 'Cormorant Garamond', fontSize: 24, color: '#2a2418' },
      { placeholder: 'Дата', zone: 'front', relX: 5, relY: 85, relW: 50, relH: 4, fontFamily: 'Montserrat', fontSize: 8, color: '#7a7060' },
    ],
  },
  {
    id: 'ct-photo-dark-overlay',
    name: 'Фото + тёмный оверлей',
    palette: 'С фото',
    frontBg: '#111111',
    frontOverlay: 'linear-gradient(to top, rgba(0,0,0,0.78) 38%, rgba(0,0,0,0) 68%)',
    backBg: '#1a1a18',
    spineBg: '#282828',
    hasPhoto: true,
    spineColor: '#d8d8d8',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваш заголовок', zone: 'front', relX: 5, relY: 68, relW: 90, relH: 11, fontFamily: 'Playfair Display', fontSize: 26, color: '#ffffff' },
      { placeholder: 'Подзаголовок · 2024', zone: 'front', relX: 5, relY: 82, relW: 80, relH: 5, fontFamily: 'Raleway', fontSize: 10, color: '#d0d0d0' },
    ],
  },
  {
    id: 'ct-photo-center-caption',
    name: 'Фото + подпись',
    palette: 'С фото',
    frontBg: '#ffffff',
    backBg: '#f8f8f8',
    spineBg: '#e0e0e0',
    hasPhoto: true,
    spineColor: '#606060',
    spineFont: 'Montserrat',
    textSlots: [
      { placeholder: 'Ваше название', zone: 'front', relX: 5, relY: 5, relW: 90, relH: 6, fontFamily: 'Montserrat', fontSize: 12, color: '#222222' },
      { placeholder: 'Год', zone: 'front', relX: 5, relY: 85, relW: 30, relH: 4, fontFamily: 'Montserrat', fontSize: 9, color: '#888888' },
    ],
  },
  {
    id: 'ct-photo-polaroid',
    name: 'Полароид',
    palette: 'С фото',
    frontBg: '#f8f5ee',
    backBg: '#f0ece4',
    spineBg: '#d8d4cc',
    hasPhoto: true,
    spineColor: '#606058',
    spineFont: 'Caveat',
    textSlots: [
      { placeholder: 'Наши воспоминания', zone: 'front', relX: 10, relY: 83, relW: 80, relH: 6, fontFamily: 'Caveat', fontSize: 18, color: '#3a3830' },
    ],
  },
];

// ─── ЭКСПОРТ ────────────────────────────────────────────────────

export const COVER_TEMPLATES: CoverTemplate[] = [
  ...NEUTRAL,
  ...PASTEL,
  ...SATURATED,
  ...DARK,
  ...PHOTO_PLUS,
];

/**
 * Groups cover templates by palette category, preserving declaration order.
 */
export function groupCoverTemplates() {
  const m = new Map<string, CoverTemplate[]>();
  for (const t of COVER_TEMPLATES) {
    if (!m.has(t.palette)) m.set(t.palette, []);
    m.get(t.palette)!.push(t);
  }
  return [...m.entries()].map(([cat, tpls]) => ({ cat, tpls }));
}
