<script setup lang="ts">
import {
  ArrowLeft, Plus, Trash2, Wand2, RotateCcw, RotateCw, Type,
  ChevronLeft, ChevronRight, Save, Loader2, Image as ImageIcon, Copy,
  Check, X, ZoomIn, Move, LayoutGrid, Sparkles, MoreHorizontal,
  Upload, ArrowLeftRight, HelpCircle, BookOpen, Ruler, Palette,
} from 'lucide-vue-next';
import {
  useBookLayout, BOOK_SIZES,
  type BookProjectFull, type BookPhoto, type BookSpread, type BookTextElement, type LayoutTemplate,
  type BookPlacement, type PhotoQuality, type TemplateTextSlot,
} from '~/composables/useBookLayout';
import { COVER_TEMPLATES, groupCoverTemplates, type CoverTemplate } from '~/composables/useCoverTemplates';

definePageMeta({ middleware: ['auth'] });

useHead({
  link: [{
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@400;600&family=Raleway:wght@400;600&family=Caveat:wght@400;600&family=Cormorant+Garamond:ital,wght@0,400;1,400&display=swap',
  }],
});

const route = useRoute();
const router = useRouter();
const apiCalls = useBookLayout();
const runtimeConfig = useRuntimeConfig();

// ─── Tutorial steps ───────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    icon: '📷',
    title: 'Добавьте фото',
    body: 'Нажмите «Добавить фото» в галерее снизу или кнопку со стрелкой вверху. Фото загружаются в галерею проекта — оттуда их можно расставить по страницам.',
  },
  {
    icon: '📐',
    title: 'Выберите шаблон страницы',
    body: 'Во вкладке «Шаблоны» выберите компоновку: 1 большое фото, сетка 2×2, панорама и др. Каждому развороту — свой шаблон.',
  },
  {
    icon: '✋',
    title: 'Расставьте фото',
    body: 'Нажмите фото в галерее — появится синяя рамка. Затем нажмите ячейку разворота. На десктопе можно перетащить. Нажмите «+» в пустой ячейке для быстрой вставки.',
  },
  {
    icon: '✏️',
    title: 'Редактируйте фото',
    body: 'Нажмите на фото в ячейке разворота: можно повернуть, приблизить, сдвинуть кадрирование, заменить или убрать фото.',
  },
  {
    icon: '💾',
    title: 'Сохраните проект',
    body: 'Кнопка сохранения (дискета) вверху справа. Макет автоматически сохраняется после каждого изменения. Перед закрытием страницы вас предупредят, если есть несохранённые правки.',
  },
];

// ─── Core state ───────────────────────────────────────────────
const project = ref<BookProjectFull | null>(null);
const photos = ref<BookPhoto[]>([]);
const spreads = ref<BookSpread[]>([]);
const templates = ref<LayoutTemplate[]>([]);
const currentIndex = ref(0);

const loading = ref(true);
const loadError = ref('');
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const hasUnsaved = ref(false);
const viewMode = ref<'spread' | 'overview'>('spread');

// ─── Mobile tabs ──────────────────────────────────────────────
type MTab = 'gallery' | 'templates' | 'ai' | 'more';
const mobileTab = ref<MTab>('gallery');
const templateSubTab = ref<'photo' | 'text'>('photo');
const photoSort = ref<'date' | 'name'>('date');

// ─── Onboarding ───────────────────────────────────────────────
const showTutorial = ref(false);
const tutorialStep = ref(0);

function checkTutorial() {
  if (!localStorage.getItem('blTutorialSeen')) {
    showTutorial.value = true;
    tutorialStep.value = 0;
  }
}
function closeTutorial() {
  showTutorial.value = false;
  localStorage.setItem('blTutorialSeen', '1');
}
function tutorialNext() {
  if (tutorialStep.value < TUTORIAL_STEPS.length - 1) tutorialStep.value++;
  else closeTutorial();
}
function tutorialPrev() {
  if (tutorialStep.value > 0) tutorialStep.value--;
}

// ─── Upload state ─────────────────────────────────────────────
interface UploadItem { id: string; file: File; progress: number; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }
const showUploadPanel = ref(false);
const uploadItems = ref<UploadItem[]>([]);
const uploadPaused = ref(false);
const uploadAborted = ref(false);
const pendingUploadFiles = ref<File[]>([]);
const uploadXHRs: XMLHttpRequest[] = [];
const fileInputEl = ref<HTMLInputElement | null>(null);

// ─── Photo interaction ────────────────────────────────────────
const selectedPhotoId = ref<string | null>(null);  // tap-to-place (from gallery)
const dragPhotoId = ref<string | null>(null);
const dragFromCell = ref<number | null>(null);      // null = from gallery
const dragOverCell = ref<number | null>(null);

// ─── Cell picker (tap "+" or replace) ────────────────────────
const showCellPicker = ref(false);
const pickerCellIndex = ref<number | null>(null);
const replacingMode = ref(false);

// ─── AI assembly modal ────────────────────────────────────────
const showAiModal = ref(false);
const aiStage = ref(0);
const aiError = ref('');
const AI_STAGES = [
  { icon: '📷', label: 'Загружаю данные…', pct: 10 },
  { icon: '🔍', label: 'Анализирую снимки…', pct: 40 },
  { icon: '📐', label: 'Расставляю по шаблонам…', pct: 75 },
  { icon: '✅', label: 'Готово!', pct: 100 },
];

// ─── Photo edit modal ─────────────────────────────────────────
const showPhotoEdit = ref(false);
const editCellIndex = ref<number | null>(null);
const editRotation = ref(0);
const editScale = ref(1);
const editPanX = ref(50);
const editPanY = ref(50);

// ─── Photo quality & enhance ──────────────────────────────────
const photoQuality = ref<PhotoQuality | null>(null);
const photoQualityLoading = ref(false);
const photoEnhancing = ref(false);
const enhanceProgress = ref(0);    // 0-100
const enhanceMessage = ref('');    // human-readable status
const showEnhancedPreview = ref(false); // toggle before/after

// ─── Text edit modal ──────────────────────────────────────────
const showTextEdit = ref(false);
const editingTextId = ref<string | null>(null); // null = new
const textEditValue = ref('');
const textEditFont = ref('Montserrat');
const textEditSize = ref(18);
const textEditColor = ref('#1a1a1a');
const pendingTextSlotHint = ref<TemplateTextSlot | null>(null);

const FONTS = ['Montserrat', 'Playfair Display', 'Raleway', 'Caveat', 'Cormorant Garamond', 'Arial', 'Georgia'];
const SIZE_PRESETS = [{ label: 'S', px: 11 }, { label: 'M', px: 16 }, { label: 'L', px: 22 }, { label: 'XL', px: 32 }];
const COLOR_PRESETS = [{ label: 'Тёмный', hex: '#1a1a1a' }, { label: 'Белый', hex: '#ffffff' }, { label: 'Серый', hex: '#888' }];

// ─── Save timer ───────────────────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;

const CELL_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// ─── Computed ─────────────────────────────────────────────────
const currentSpread = computed((): BookSpread | null => spreads.value[currentIndex.value] ?? null);
const currentTemplate = computed((): LayoutTemplate | null =>
  templates.value.find((t) => t.id === currentSpread.value?.templateId) ?? null,
);
// ─── Cover canvas geometry ────────────────────────────────────
// Physical page dimensions per book size (mm). Cover = back + spine + front.
const COVER_SPINE_MM = 12; // default spine width; ~80-page book
const COVER_BLEED_MM = 3;  // bleed zone outside trim
const COVER_SAFE_MM  = 5;  // safe zone inside trim

const coverPageDims = computed(() => {
  const map: Record<string, { w: number; h: number }> = {
    S20x20: { w: 200, h: 200 },
    S20x30: { w: 200, h: 300 },
    S25x25: { w: 250, h: 250 },
    S30x30: { w: 300, h: 300 },
  };
  return map[project.value?.size ?? 'S20x20'] ?? map['S20x20'];
});

const coverTotalW = computed(() => 2 * coverPageDims.value.w + COVER_SPINE_MM);
const coverTotalH = computed(() => coverPageDims.value.h);
const coverCanvasRatio = computed(() => coverTotalW.value / coverTotalH.value);

// Zone widths as % of total cover canvas
const coverBackPct   = computed(() => (coverPageDims.value.w / coverTotalW.value) * 100);
const coverSpinePct  = computed(() => (COVER_SPINE_MM / coverTotalW.value) * 100);
const coverFrontPct  = computed(() => (coverPageDims.value.w / coverTotalW.value) * 100);
const coverFrontLeft = computed(() => coverBackPct.value + coverSpinePct.value);

// Guide positions (% of canvas)
const coverGuideBleedX = computed(() => (COVER_BLEED_MM / coverTotalW.value) * 100);
const coverGuideBleedY = computed(() => (COVER_BLEED_MM / coverTotalH.value) * 100);
const coverGuideSafeX  = computed(() => (COVER_SAFE_MM  / coverTotalW.value) * 100);
const coverGuideSafeY  = computed(() => (COVER_SAFE_MM  / coverTotalH.value) * 100);

// Toggle for guide overlay
const showGuides = ref(true);

// Spine text (persisted as a text element on the cover spread, identified by x<0 sentinel)
const spineText = computed(() => {
  if (!currentSpread.value || currentSpread.value.kind !== 'COVER') return null;
  return currentSpread.value.textElements.find((t) => t.x < 0) ?? null;
});

function getOrCreateSpineText() {
  if (!currentSpread.value) return;
  if (spineText.value) {
    openEditText(spineText.value);
    return;
  }
  // Create a sentinel text element: x=-1 means spine text
  editingTextId.value = null;
  textEditValue.value = project.value?.title ?? '';
  textEditFont.value = 'Montserrat';
  textEditSize.value = 10;
  textEditColor.value = '#ffffff';
  pendingTextSlotHint.value = { placeholder: 'Корешок', x: -1, y: 10, w: 80, h: 80, fontSize: 10 };
  showTextEdit.value = true;
}

const spreadRatio = computed((): number => {
  const bs = BOOK_SIZES.find((b) => b.value === project.value?.size);
  if (!bs) return 2;
  if (currentSpread.value?.kind === 'COVER') return coverCanvasRatio.value;
  return bs.spreadRatio;
});

function spreadAspectRatioOf(s: BookSpread): number {
  const bs = BOOK_SIZES.find((b) => b.value === project.value?.size);
  if (!bs) return 2;
  if (s.kind === 'COVER') return coverCanvasRatio.value;
  return bs.spreadRatio;
}

const cellCount = computed(() => currentTemplate.value?.cells ?? 1);

// ─── Cover template library ───────────────────────────────────
const activeCoverTemplate = computed((): CoverTemplate | null => {
  if (!currentSpread.value || currentSpread.value.kind !== 'COVER') return null;
  return COVER_TEMPLATES.find((t) => t.id === currentSpread.value!.templateId) ?? null;
});

const groupedCoverTemplates = computed(() => groupCoverTemplates());

function applyCoverTemplate(tpl: CoverTemplate) {
  if (!currentSpread.value || currentSpread.value.kind !== 'COVER') return;

  const backW = coverBackPct.value;
  const frontStart = coverFrontLeft.value;
  const frontW = coverFrontPct.value;

  // Preserve existing spine text (x=-1 sentinel) and update its style
  const existingSpine = currentSpread.value.textElements.find((t) => t.x < 0);
  const updatedSpine = existingSpine
    ? { ...existingSpine, fontFamily: tpl.spineFont, color: tpl.spineColor }
    : null;

  // Build new text elements from template text slots
  const newTexts = tpl.textSlots.map((slot, i) => {
    const zoneStart = slot.zone === 'front' ? frontStart : 0;
    const zoneW = slot.zone === 'front' ? frontW : backW;
    return {
      id: `tpl_${Date.now()}_${i}`,
      spreadId: currentSpread.value!.id,
      text: slot.placeholder,
      fontFamily: slot.fontFamily,
      fontSize: slot.fontSize,
      color: slot.color,
      x: zoneStart + (slot.relX / 100) * zoneW,
      y: slot.relY,
      w: (slot.relW / 100) * zoneW,
      h: slot.relH,
    };
  });

  currentSpread.value.templateId = tpl.id;
  currentSpread.value.textElements = [
    ...(updatedSpine ? [updatedSpine] : []),
    ...newTexts,
  ];
  // Photos (placements) are preserved as-is

  debounceAutoSave();
}

// ─── Travelbook cover generation ─────────────────────────────
const TRAVELBOOK_LOCATIONS = [
  'Австрия','Аргентина','Армения','Бали','Барселона','Берлин','Вьетнам','Гавайи','Германия',
  'Греция','Грузия','Дубай','Доломиты','Доминикана','Египет','Израиль','Индия','Индонезия',
  'Иран','Исландия','Испания','Италия','Камбоджа','Канада','Карибы','Каир','Киото','Кипр',
  'Куба','Лондон','Мальдивы','Маврикий','Марокко','Мексика','Москва','Непал','Нью-Йорк',
  'Норвегия','ОАЭ','Осака','Патагония','Перу','Португалия','Рим','Россия','Санкт-Петербург',
  'Сейшелы','Сингапур','Стамбул','Таиланд','Токио','Турция','Финляндия','Франция','Хорватия',
  'Черногория','Чили','Швейцария','Швеция','Шри-Ланка','Япония','Занзибар','Гонконг','Шанхай',
];

const TRAVELBOOK_STYLES = [
  { id: 'минимал',  label: 'Минимал',  bg: '#f5f0e8', text: '#2c2416' },
  { id: 'закат',   label: 'Закат',    bg: '#ee5f28', text: '#fff0b0' },
  { id: 'ночь',    label: 'Ночь',     bg: '#12204a', text: '#d4b458' },
  { id: 'пастель', label: 'Пастель',  bg: '#dde2f0', text: '#5c5080' },
  { id: 'тропики', label: 'Тропики', bg: '#0ebcd6', text: '#f89460' },
];

const tbOpen    = ref(false);
const tbLocation = ref('Италия');
const tbStyle    = ref('минимал');
const tbTitle    = ref('');
const tbSubtitle = ref('');
const tbJobId    = ref('');
const tbStatus   = ref<'idle' | 'generating' | 'done' | 'error'>('idle');
const tbProgress = ref(0);
const tbMessage  = ref('');
const tbError    = ref('');
const tbResultReady = ref(false);
let   tbPollTimer: ReturnType<typeof setTimeout> | null = null;

watch(tbOpen, (open) => {
  if (open && !tbTitle.value) {
    tbTitle.value = project.value?.title ?? '';
  }
});

async function tbGenerate() {
  if (!project.value) return;
  tbStatus.value  = 'generating';
  tbProgress.value = 0;
  tbMessage.value  = 'Запуск...';
  tbError.value    = '';
  tbResultReady.value = false;

  try {
    const { jobId } = await apiCalls.startCoverGeneration(project.value.id, {
      location: tbLocation.value,
      style:    tbStyle.value,
      bookSize: project.value.size,
    });
    tbJobId.value = jobId;
    tbPollStatus();
  } catch (e: any) {
    tbStatus.value = 'error';
    tbError.value  = e?.data?.message ?? 'Ошибка запуска генерации';
  }
}

function tbPollStatus() {
  if (tbPollTimer) clearTimeout(tbPollTimer);
  tbPollTimer = setTimeout(async () => {
    try {
      const s = await apiCalls.getCoverStatus(tbJobId.value);
      tbProgress.value = s.progress;
      tbMessage.value  = s.message;
      if (s.status === 'done') {
        tbStatus.value = 'done';
        tbResultReady.value = true;
      } else if (s.status === 'error') {
        tbStatus.value = 'error';
        tbError.value  = s.message;
      } else {
        tbPollStatus();
      }
    } catch {
      tbPollStatus();
    }
  }, 800);
}

async function tbApply() {
  if (!project.value || !tbJobId.value) return;
  tbStatus.value = 'generating';
  tbMessage.value = 'Применяю обложку...';
  try {
    const updatedSpread = await apiCalls.applyCoverResult(project.value.id, {
      jobId:    tbJobId.value,
      title:    tbTitle.value,
      subtitle: tbSubtitle.value,
      style:    tbStyle.value,
    });
    // Refresh the COVER spread in local state
    const idx = spreads.value.findIndex((s) => s.kind === 'COVER');
    if (idx >= 0) spreads.value[idx] = updatedSpread as any;
    tbStatus.value = 'idle';
    tbResultReady.value = false;
    tbJobId.value = '';
    // Close panel
    tbOpen.value = false;
    debounceAutoSave();
  } catch (e: any) {
    tbStatus.value = 'error';
    tbError.value  = e?.data?.message ?? 'Ошибка применения';
  }
}

function tbReset() {
  tbStatus.value = 'idle';
  tbResultReady.value = false;
  tbJobId.value = '';
  tbError.value = '';
}

const usedPhotoIds = computed(() => {
  const ids = new Set<string>();
  spreads.value.forEach((s) => s.placements.forEach((p) => ids.add(p.photoId)));
  return ids;
});

const sortedPhotos = computed(() => {
  const ps = [...photos.value];
  if (photoSort.value === 'date') {
    ps.sort((a, b) => {
      const da = a.takenAt ? +new Date(a.takenAt) : +new Date(a.uploadedAt);
      const db = b.takenAt ? +new Date(b.takenAt) : +new Date(b.uploadedAt);
      return da - db;
    });
  } else {
    ps.sort((a, b) => a.fileName.localeCompare(b.fileName));
  }
  return ps;
});

const uploadDone = computed(() => uploadItems.value.filter((i) => i.status === 'done').length);
const uploadError = computed(() => uploadItems.value.filter((i) => i.status === 'error').length);
const uploadTotal = computed(() => uploadItems.value.length);
const uploadOverallProgress = computed(() => {
  if (!uploadItems.value.length) return 0;
  return Math.round(uploadItems.value.reduce((s, i) => s + i.progress, 0) / uploadItems.value.length);
});

function groupByCategory(list: LayoutTemplate[]) {
  const m = new Map<string, LayoutTemplate[]>();
  for (const t of list) {
    if (!m.has(t.category)) m.set(t.category, []);
    m.get(t.category)!.push(t);
  }
  return [...m.entries()].map(([cat, tpls]) => ({ cat, tpls }));
}
const groupedPhotoTemplates = computed(() =>
  groupByCategory(templates.value.filter((t) => t.kind === 'PHOTO')),
);
const groupedTextTemplates = computed(() =>
  groupByCategory(templates.value.filter((t) => t.kind === 'TEXT' || t.kind === 'MIXED')),
);

// ─── Init ─────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const [proj, tpls] = await Promise.all([
      apiCalls.getProject(route.params.id as string),
      apiCalls.getTemplates(),
    ]);
    project.value = proj;
    photos.value = proj.photos;
    spreads.value = proj.spreads;
    templates.value = tpls;
  } catch (e: any) {
    loadError.value = e?.data?.message ?? e?.message ?? 'Не удалось загрузить проект';
  } finally {
    loading.value = false;
    if (!loadError.value) {
      checkTutorial();
      if (route.query.ai === '1') {
        mobileTab.value = 'ai';
      }
    }
  }
});

// Warn on unsaved changes
onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  if (savedTimer) clearTimeout(savedTimer);
});

// Warn before browser navigation
if (process.client) {
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsaved.value) { e.preventDefault(); e.returnValue = ''; }
  });
}

// ─── Helpers ──────────────────────────────────────────────────
function placementByCell(i: number): BookPlacement | null {
  return currentSpread.value?.placements.find((p) => p.cellIndex === i) ?? null;
}

function gridStyle() {
  const t = currentTemplate.value;
  if (!t) return { display: 'grid' };
  const s: Record<string, string> = {
    display: 'grid',
    'grid-template-columns': t.columns,
    'grid-template-rows': t.rows,
    gap: '2px',
    width: '100%',
    height: '100%',
  };
  if (t.areas) s['grid-template-areas'] = t.areas;
  return s;
}

function cellStyle(i: number) {
  const t = currentTemplate.value;
  if (!t?.areas) return {};
  return { 'grid-area': CELL_NAMES[i] };
}

function photoImgStyle(p: BookPlacement) {
  const parts: string[] = [];
  if (p.rotation) parts.push(`rotate(${p.rotation}deg)`);
  if (p.scale && p.scale !== 1) parts.push(`scale(${p.scale})`);
  return {
    objectPosition: `${p.panX ?? 50}% ${p.panY ?? 50}%`,
    transform: parts.length ? parts.join(' ') : undefined,
    transformOrigin: 'center',
  };
}

// ─── Navigation ───────────────────────────────────────────────
function prevSpread() { if (currentIndex.value > 0) currentIndex.value--; }
function nextSpread() { if (currentIndex.value < spreads.value.length - 1) currentIndex.value++; }

async function addSpread() {
  try {
    const spread = await apiCalls.addSpread(project.value!.id);
    spreads.value.push(spread);
    currentIndex.value = spreads.value.length - 1;
    viewMode.value = 'spread';
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); }
}

async function removeCurrentSpread() {
  if (currentSpread.value?.kind === 'COVER') return;
  if (!confirm('Удалить этот разворот?')) return;
  try {
    await apiCalls.deleteSpread(currentSpread.value!.id);
    spreads.value.splice(currentIndex.value, 1);
    if (currentIndex.value >= spreads.value.length) currentIndex.value = spreads.value.length - 1;
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); }
}

// ─── Save ──────────────────────────────────────────────────────
function debounceAutoSave() {
  hasUnsaved.value = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrentSpread, 2000);
}

async function saveCurrentSpread() {
  if (!currentSpread.value) return;
  saveStatus.value = 'saving';
  if (savedTimer) clearTimeout(savedTimer);
  try {
    const saved = await apiCalls.saveSpread(currentSpread.value.id, {
      templateId: currentSpread.value.templateId ?? undefined,
      placements: currentSpread.value.placements.map((p) => ({
        photoId: p.photoId,
        cellIndex: p.cellIndex,
        rotation: p.rotation,
        scale: p.scale,
        panX: p.panX,
        panY: p.panY,
      })),
      textElements: currentSpread.value.textElements.map(({ id: _id, spreadId: _s, ...rest }) => rest),
    });
    const idx = spreads.value.findIndex((s) => s.id === saved.id);
    if (idx >= 0) spreads.value[idx] = saved;
    saveStatus.value = 'saved';
    hasUnsaved.value = false;
    savedTimer = setTimeout(() => { saveStatus.value = 'idle'; }, 2500);
  } catch {
    saveStatus.value = 'error';
  }
}

// ─── Cell-kind helpers ────────────────────────────────────────
function cellKind(i: number): 'photo' | 'text' {
  const t = currentTemplate.value;
  if (!t?.cellKinds) return 'photo';
  return t.cellKinds[i] ?? 'photo';
}

function textSlotIndex(cellIndex: number): number {
  const t = currentTemplate.value;
  if (!t?.cellKinds) return -1;
  let count = 0;
  for (let j = 0; j < cellIndex; j++) {
    if ((t.cellKinds[j] ?? 'photo') === 'text') count++;
  }
  return count;
}

function textElementForSlot(slotIdx: number): BookTextElement | null {
  return currentSpread.value?.textElements?.[slotIdx] ?? null;
}

function onTextCellClick(cellIndex: number) {
  if (!currentSpread.value) return;
  const slotIdx = textSlotIndex(cellIndex);
  const existing = textElementForSlot(slotIdx);
  if (existing) {
    openEditText(existing);
  } else {
    // Use template slot defaults if available
    const hint: TemplateTextSlot | undefined = currentTemplate.value?.textSlots?.[slotIdx];
    editingTextId.value = null;
    textEditValue.value = '';
    textEditFont.value = 'Montserrat';
    textEditSize.value = hint?.fontSize ?? 16;
    textEditColor.value = '#1a1a1a';
    // Store slot hint for saveTextEdit to use
    pendingTextSlotHint.value = hint ?? null;
    showTextEdit.value = true;
  }
}

// ─── Template selection ────────────────────────────────────────
function selectTemplate(tplId: string) {
  if (!currentSpread.value) return;
  if (currentSpread.value.templateId === tplId) return;

  const newTpl = templates.value.find((t) => t.id === tplId);
  if (!newTpl) return;

  // Photo cell indices for new template (in order)
  const newPhotoCells = newTpl.cellKinds
    ? newTpl.cellKinds.map((k, i) => (k === 'photo' ? i : -1)).filter((i) => i >= 0)
    : Array.from({ length: newTpl.cells }, (_, i) => i);

  // Remap existing photo placements by order to new photo cell indices
  const existingByOrder = [...currentSpread.value.placements].sort((a, b) => a.cellIndex - b.cellIndex);
  const newPlacements = existingByOrder.slice(0, newPhotoCells.length).map((p, i) => ({
    ...p,
    cellIndex: newPhotoCells[i],
  }));

  currentSpread.value.templateId = tplId;
  currentSpread.value.placements = newPlacements;

  // If switching to a TEXT template, clear text elements and apply slot defaults
  // (don't auto-create text elements – user will click to add)

  debounceAutoSave();
}

// ─── Upload ────────────────────────────────────────────────────
function openFilePicker() {
  if (fileInputEl.value) { fileInputEl.value.value = ''; fileInputEl.value.click(); }
}

async function onFilesSelected(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!files.length) return;
  if (fileInputEl.value) fileInputEl.value.value = '';
  pendingUploadFiles.value = files;
  startUpload(files);
}

async function startUpload(files: File[]) {
  uploadPaused.value = false;
  uploadAborted.value = false;
  uploadXHRs.length = 0;
  uploadItems.value = files.map((f, i) => ({
    id: String(i), file: f, progress: 0, status: 'pending',
  }));
  showUploadPanel.value = true;

  const queue = [...uploadItems.value];
  const MAX_C = 3;

  async function worker() {
    while (queue.length > 0 && !uploadAborted.value) {
      while (uploadPaused.value && !uploadAborted.value) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (uploadAborted.value) break;
      const item = queue.shift()!;
      item.status = 'uploading';
      try {
        const photo = await uploadSingleFile(item.file, (pct) => { item.progress = pct; });
        photos.value.push(photo);
        item.status = 'done';
        item.progress = 100;
      } catch (err: any) {
        item.status = 'error';
        item.error = err?.message ?? 'Ошибка';
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_C, files.length) }, worker));
  if (!uploadAborted.value) {
    await new Promise((r) => setTimeout(r, 1200));
    showUploadPanel.value = false;
    mobileTab.value = 'gallery';
  }
}

function uploadSingleFile(file: File, onProgress: (pct: number) => void): Promise<BookPhoto> {
  const apiBase = runtimeConfig.public.apiBase as string;
  const token = localStorage.getItem('auth_token') ?? '';
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    uploadXHRs.push(xhr);
    const fd = new FormData();
    fd.append('files', file);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve((JSON.parse(xhr.responseText) as BookPhoto[])[0]); }
        catch { reject(new Error('Ошибка ответа')); }
      } else { reject(new Error(`HTTP ${xhr.status}`)); }
    };
    xhr.onerror = () => reject(new Error('Ошибка сети'));
    xhr.open('POST', `${apiBase}/api/book-layout/projects/${project.value!.id}/photos`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(fd);
  });
}

function abortUpload() {
  uploadAborted.value = true;
  uploadXHRs.forEach((x) => { try { x.abort(); } catch {} });
  showUploadPanel.value = false;
}

// ─── Remove photo ─────────────────────────────────────────────
async function removePhoto(photoId: string, ev?: Event) {
  ev?.stopPropagation();
  if (!confirm('Удалить фото из проекта?')) return;
  try {
    await apiCalls.deletePhoto(photoId);
    photos.value = photos.value.filter((p) => p.id !== photoId);
    spreads.value.forEach((s) => { s.placements = s.placements.filter((p) => p.photoId !== photoId); });
    if (selectedPhotoId.value === photoId) selectedPhotoId.value = null;
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); }
}

// ─── Photo placement (tap-to-place from gallery) ───────────────
function onGalleryPhotoClick(photoId: string) {
  selectedPhotoId.value = selectedPhotoId.value === photoId ? null : photoId;
}

function makeNewPlacement(photoId: string, cellIndex: number, spread: BookSpread): BookPlacement {
  const photo = photos.value.find((p) => p.id === photoId)!;
  return { id: '', spreadId: spread.id, photoId, photo, cellIndex, rotation: 0, scale: 1, panX: 50, panY: 50, z: 0 };
}

function onCellClick(cellIndex: number) {
  if (!currentSpread.value) return;

  // Text cells always go to text editing
  if (cellKind(cellIndex) === 'text') {
    onTextCellClick(cellIndex);
    return;
  }

  const existing = placementByCell(cellIndex);

  // Tap-to-place from gallery
  if (selectedPhotoId.value) {
    currentSpread.value.placements = currentSpread.value.placements.filter(
      (p) => p.cellIndex !== cellIndex && p.photoId !== selectedPhotoId.value,
    );
    currentSpread.value.placements.push(makeNewPlacement(selectedPhotoId.value, cellIndex, currentSpread.value));
    selectedPhotoId.value = null;
    debounceAutoSave();
    return;
  }

  if (existing) {
    openPhotoEdit(cellIndex);
  } else {
    openCellPicker(cellIndex, false);
  }
}

// ─── Desktop DnD ──────────────────────────────────────────────
function onDragStartGallery(photoId: string, e: DragEvent) {
  dragPhotoId.value = photoId;
  dragFromCell.value = null;
  e.dataTransfer!.effectAllowed = 'copy';
}

function onDragStartCell(cellIndex: number, e: DragEvent) {
  const p = placementByCell(cellIndex);
  if (!p) return;
  dragPhotoId.value = p.photoId;
  dragFromCell.value = cellIndex;
  e.dataTransfer!.effectAllowed = 'move';
}

function onDragOver(cellIndex: number, e: DragEvent) {
  e.preventDefault();
  dragOverCell.value = cellIndex;
}
function onDragLeave() { dragOverCell.value = null; }

function onDrop(targetCell: number) {
  const pid = dragPhotoId.value;
  const fromCell = dragFromCell.value;
  dragPhotoId.value = null;
  dragFromCell.value = null;
  dragOverCell.value = null;
  if (!pid || !currentSpread.value) return;

  if (fromCell !== null && fromCell !== targetCell) {
    // Swap between cells
    const existingInTarget = placementByCell(targetCell);
    const movingPl = placementByCell(fromCell);
    if (!movingPl) return;
    currentSpread.value.placements = currentSpread.value.placements.filter(
      (p) => p.cellIndex !== fromCell && p.cellIndex !== targetCell,
    );
    currentSpread.value.placements.push({ ...movingPl, cellIndex: targetCell });
    if (existingInTarget) {
      currentSpread.value.placements.push({ ...existingInTarget, cellIndex: fromCell });
    }
  } else if (fromCell === null) {
    // From gallery
    currentSpread.value.placements = currentSpread.value.placements.filter(
      (p) => p.cellIndex !== targetCell && p.photoId !== pid,
    );
    const photo = photos.value.find((p) => p.id === pid);
    if (!photo) return;
    currentSpread.value.placements.push({ id: '', spreadId: currentSpread.value.id, photoId: pid, photo, cellIndex: targetCell, rotation: 0, scale: 1, panX: 50, panY: 50, z: 0 });
  }
  debounceAutoSave();
}

// ─── Cell picker (tap "+" or replace) ────────────────────────
function openCellPicker(cellIndex: number, replacing: boolean) {
  pickerCellIndex.value = cellIndex;
  replacingMode.value = replacing;
  showCellPicker.value = true;
}

function onPickerPhotoSelect(photoId: string) {
  const cellIndex = pickerCellIndex.value;
  if (cellIndex === null || !currentSpread.value) return;
  currentSpread.value.placements = currentSpread.value.placements.filter(
    (p) => p.cellIndex !== cellIndex && p.photoId !== photoId,
  );
  const photo = photos.value.find((p) => p.id === photoId)!;
  currentSpread.value.placements.push(makeNewPlacement(photoId, cellIndex, currentSpread.value));
  showCellPicker.value = false;
  debounceAutoSave();
  if (replacingMode.value) showPhotoEdit.value = false;
}

// ─── Photo edit modal ─────────────────────────────────────────
function openPhotoEdit(cellIndex: number) {
  const p = placementByCell(cellIndex);
  if (!p) return;
  editCellIndex.value = cellIndex;
  editRotation.value = p.rotation;
  editScale.value = p.scale ?? 1;
  editPanX.value = p.panX ?? 50;
  editPanY.value = p.panY ?? 50;
  photoQuality.value = null;
  showEnhancedPreview.value = p.photo?.useEnhanced ?? false;
  showPhotoEdit.value = true;
  loadPhotoQuality();
}

async function loadPhotoQuality() {
  if (!currentSpread.value?.templateId || editCellIndex.value === null || !project.value) return;
  const pl = placementByCell(editCellIndex.value);
  if (!pl || !pl.photoId) return;
  photoQualityLoading.value = true;
  try {
    photoQuality.value = await apiCalls.getPhotoQuality(
      pl.photoId,
      project.value.size,
      currentSpread.value.templateId,
      editCellIndex.value,
    );
  } catch { /* non-critical — don't block the modal */ }
  finally { photoQualityLoading.value = false; }
}

async function enhanceCurrentPhoto() {
  const pl = placementByCell(editCellIndex.value!);
  if (!pl) return;
  photoEnhancing.value = true;
  enhanceProgress.value = 0;
  enhanceMessage.value = 'Запуск AI-улучшения…';

  try {
    // Start async job with cell context so service targets correct print DPI
    const { jobId } = await apiCalls.enhancePhotoStart(pl.photoId, {
      bookSize: project.value?.size,
      templateId: currentSpread.value?.templateId ?? undefined,
      cellIndex: editCellIndex.value ?? undefined,
    });

    // Poll until done (max 180 seconds)
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await apiCalls.getEnhanceJobStatus(pl.photoId, jobId);
      enhanceProgress.value = status.progress ?? 0;
      enhanceMessage.value = status.message ?? '';

      if (status.status === 'done') {
        if (status.photo) {
          syncUpdatedPhoto(status.photo);
          showEnhancedPreview.value = true;
          photoQuality.value = null;
          loadPhotoQuality();
        }
        break;
      }
      if (status.status === 'error') {
        throw new Error(status.error ?? status.message ?? 'Ошибка AI-улучшения');
      }
    }
  } catch (e: any) {
    alert(e?.data?.message ?? e?.message ?? 'Ошибка улучшения');
  } finally {
    photoEnhancing.value = false;
    enhanceProgress.value = 0;
    enhanceMessage.value = '';
  }
}

async function applyEnhancement(apply: boolean) {
  const pl = placementByCell(editCellIndex.value!);
  if (!pl) return;
  try {
    const updated = await apiCalls.applyEnhancement(pl.photoId, apply);
    syncUpdatedPhoto(updated);
    showEnhancedPreview.value = apply;
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); }
}

function syncUpdatedPhoto(updated: BookPhoto) {
  const idx = photos.value.findIndex((p) => p.id === updated.id);
  if (idx >= 0) photos.value[idx] = updated;
  spreads.value.forEach((s) => {
    s.placements.forEach((pl) => {
      if (pl.photoId === updated.id) pl.photo = updated;
    });
  });
}

const currentEditPhoto = computed((): BookPhoto | null => {
  if (editCellIndex.value === null) return null;
  return placementByCell(editCellIndex.value)?.photo ?? null;
});

function applyPhotoEdit() {
  if (editCellIndex.value === null || !currentSpread.value) return;
  const p = placementByCell(editCellIndex.value);
  if (!p) return;
  p.rotation = editRotation.value;
  p.scale = editScale.value;
  p.panX = editPanX.value;
  p.panY = editPanY.value;
  debounceAutoSave();
  showPhotoEdit.value = false;
}

function rotateEdit(deg: number) {
  editRotation.value = (editRotation.value + deg + 360) % 360;
}

function removeFromEditCell() {
  if (editCellIndex.value === null || !currentSpread.value) return;
  currentSpread.value.placements = currentSpread.value.placements.filter(
    (p) => p.cellIndex !== editCellIndex.value,
  );
  debounceAutoSave();
  showPhotoEdit.value = false;
}

function replaceInCell() {
  openCellPicker(editCellIndex.value!, true);
}

// Preview style in edit modal
const editPreviewStyle = computed(() => ({
  objectPosition: `${editPanX.value}% ${editPanY.value}%`,
  transform: editRotation.value || editScale.value !== 1
    ? `rotate(${editRotation.value}deg) scale(${editScale.value})`
    : undefined,
  transformOrigin: 'center',
}));

// Active preview URL: show enhanced thumb when toggled
const editPreviewUrl = computed((): string | null => {
  const photo = currentEditPhoto.value;
  if (!photo) return null;
  if (showEnhancedPreview.value && photo.enhancedThumbUrl) return photo.enhancedThumbUrl;
  return photo.originalThumbUrl ?? photo.thumbUrl;
});

// Quality level → CSS color class
const qualityColorClass = computed(() => {
  const c = photoQuality.value?.levelColor;
  if (c === 'green') return 'text-green-600';
  if (c === 'yellow') return 'text-yellow-600';
  return 'text-red-600';
});

const qualityBarClass = computed(() => {
  const c = photoQuality.value?.levelColor;
  if (c === 'green') return 'bg-green-500';
  if (c === 'yellow') return 'bg-yellow-500';
  return 'bg-red-500';
});

const qualityBarWidth = computed(() => {
  const dpi = photoQuality.value?.effectiveDpi ?? 0;
  return Math.min(100, Math.round((dpi / 300) * 100)) + '%';
});

// ─── Text edit modal ──────────────────────────────────────────
function openAddText() {
  editingTextId.value = null;
  textEditValue.value = '';
  textEditFont.value = 'Montserrat';
  textEditSize.value = 18;
  textEditColor.value = '#1a1a1a';
  pendingTextSlotHint.value = null;
  showTextEdit.value = true;
}

function openEditText(txt: BookTextElement) {
  editingTextId.value = txt.id;
  textEditValue.value = txt.text;
  textEditFont.value = txt.fontFamily;
  textEditSize.value = txt.fontSize;
  textEditColor.value = txt.color;
  showTextEdit.value = true;
}

function saveTextEdit() {
  if (!currentSpread.value) { showTextEdit.value = false; return; }
  const val = textEditValue.value.trim();
  if (!val) { showTextEdit.value = false; return; }

  if (editingTextId.value) {
    const t = currentSpread.value.textElements.find((t) => t.id === editingTextId.value);
    if (t) {
      t.text = val;
      t.fontFamily = textEditFont.value;
      t.fontSize = textEditSize.value;
      t.color = textEditColor.value;
    }
  } else {
    const hint = pendingTextSlotHint.value;
    currentSpread.value.textElements.push({
      id: `new_${Date.now()}`,
      spreadId: currentSpread.value.id,
      text: val,
      fontFamily: textEditFont.value,
      fontSize: textEditSize.value,
      color: textEditColor.value,
      x: hint?.x ?? 10, y: hint?.y ?? 82, w: hint?.w ?? 80, h: hint?.h ?? 8,
    });
    pendingTextSlotHint.value = null;
  }
  debounceAutoSave();
  showTextEdit.value = false;
}

function deleteText(id: string) {
  if (!currentSpread.value) return;
  currentSpread.value.textElements = currentSpread.value.textElements.filter((t) => t.id !== id);
  debounceAutoSave();
}

// ─── Auto-layout with animated progress ───────────────────────
const autoLayoutRunning = ref(false); // kept for desktop sidebar button state

async function runAutoLayout() {
  if (!photos.value.length) { alert('Сначала добавьте фото в галерею'); return; }
  showAiModal.value = true;
  aiStage.value = 0;
  aiError.value = '';
  autoLayoutRunning.value = true;

  // Animate stages in parallel with the API call
  const t1 = setTimeout(() => { aiStage.value = 1; }, 600);
  const t2 = setTimeout(() => { aiStage.value = 2; }, 1400);

  try {
    const updated = await apiCalls.autoLayout(project.value!.id);
    clearTimeout(t1); clearTimeout(t2);
    aiStage.value = Math.max(aiStage.value, 2);
    await new Promise((r) => setTimeout(r, 350));
    aiStage.value = 3;
    spreads.value = updated.spreads;
    photos.value = updated.photos;
    currentIndex.value = 1;
    viewMode.value = 'spread';
    await new Promise((r) => setTimeout(r, 900));
    showAiModal.value = false;
  } catch (e: any) {
    clearTimeout(t1); clearTimeout(t2);
    aiError.value = e?.data?.message ?? 'Ошибка авто-расстановки';
  } finally {
    autoLayoutRunning.value = false;
  }
}
function closeAiModal() {
  showAiModal.value = false;
  autoLayoutRunning.value = false;
}

// ─── More tab actions ──────────────────────────────────────────
function clearCurrentSpread() {
  if (!currentSpread.value || !confirm('Убрать все фото с этого разворота?')) return;
  currentSpread.value.placements = [];
  debounceAutoSave();
}

// ─── Title / order number ──────────────────────────────────────
const editingTitle = ref(false);
const titleInput = ref('');
const editingOrderNum = ref(false);
const orderNumInput = ref('');

watch(() => project.value, (p) => {
  if (p) { titleInput.value = p.title; orderNumInput.value = p.orderNumber ?? ''; }
}, { immediate: true });

async function saveTitle() {
  editingTitle.value = false;
  if (!project.value || titleInput.value.trim() === project.value.title) return;
  try {
    await apiCalls.updateProject(project.value.id, { title: titleInput.value.trim() });
    project.value.title = titleInput.value.trim();
  } catch { /* non-critical */ }
}

async function saveOrderNum() {
  editingOrderNum.value = false;
  if (!project.value) return;
  try {
    await apiCalls.updateProject(project.value.id, { orderNumber: orderNumInput.value.trim() || null });
    project.value.orderNumber = orderNumInput.value.trim() || null;
  } catch { /* non-critical */ }
}

// ─── Share ────────────────────────────────────────────────────
function copyShareLink() {
  if (!project.value) return;
  const url = `${window.location.origin}/book-layout/share/${project.value.shareToken}`;
  navigator.clipboard?.writeText(url).then(() => alert('Ссылка скопирована!'));
}

async function deleteProject() {
  if (!project.value || !confirm(`Удалить проект «${project.value.title}»? Это нельзя отменить.`)) return;
  try {
    await apiCalls.deleteProject(project.value.id);
    await router.push('/book-layout');
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); }
}
</script>

<template>
  <div class="flex flex-col bg-background" style="height: 100dvh">

    <!-- ── Loading ───────────────────────────────────────────── -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <!-- ── Error ─────────────────────────────────────────────── -->
    <div v-else-if="loadError" class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p class="text-destructive font-medium">{{ loadError }}</p>
      <NuxtLink to="/book-layout" class="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm hover:bg-secondary transition-colors">
        <ArrowLeft class="w-4 h-4" /> К проектам
      </NuxtLink>
    </div>

    <!-- ── Main Editor ───────────────────────────────────────── -->
    <template v-else-if="project">
      <!-- ░ TOOLBAR ░ -->
      <header class="shrink-0 h-12 border-b bg-background/95 backdrop-blur-sm flex items-center gap-1.5 px-2">
        <NuxtLink to="/book-layout" class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1">
          <ArrowLeft class="w-4 h-4" />
        </NuxtLink>

        <!-- Title edit -->
        <div class="flex-1 min-w-0 flex items-center gap-1">
          <input
            v-if="editingTitle"
            v-model="titleInput"
            class="border rounded-lg px-2 py-1 text-sm font-semibold bg-secondary/40 outline-none focus:ring-1 focus:ring-primary/30 min-w-0 w-full max-w-[170px]"
            autofocus
            @blur="saveTitle"
            @keydown.enter="saveTitle"
            @keydown.escape="editingTitle = false"
          />
          <button
            v-else
            class="font-semibold text-sm truncate hover:text-primary transition-colors min-w-0 max-w-[150px]"
            @click="editingTitle = true"
          >{{ project.title }}</button>

          <input
            v-if="editingOrderNum"
            v-model="orderNumInput"
            placeholder="№ заказа"
            class="border rounded-lg px-2 py-1 text-xs bg-secondary/40 outline-none focus:ring-1 focus:ring-primary/30 w-20 ml-1"
            @blur="saveOrderNum"
            @keydown.enter="saveOrderNum"
          />
          <span
            v-else-if="project.orderNumber"
            class="text-xs text-muted-foreground shrink-0 ml-1 cursor-pointer"
            @click="editingOrderNum = true"
          >#{{ project.orderNumber }}</span>
          <button
            v-else
            class="text-xs text-muted-foreground/40 hover:text-muted-foreground ml-1 shrink-0"
            @click="editingOrderNum = true"
          >+№</button>
        </div>

        <!-- Right actions -->
        <div class="flex items-center gap-1 shrink-0">
          <!-- Save status -->
          <span class="text-xs w-6 flex items-center justify-center">
            <Check v-if="saveStatus === 'saved'" class="w-3.5 h-3.5 text-green-600" />
            <Loader2 v-else-if="saveStatus === 'saving'" class="w-3.5 h-3.5 text-muted-foreground animate-spin" />
            <span v-else-if="saveStatus === 'error'" class="text-destructive text-[11px] font-bold">!</span>
          </span>

          <button
            type="button"
            class="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
            title="Справка"
            @click="showTutorial = true; tutorialStep = 0"
          >
            <HelpCircle class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
            title="Поделиться"
            @click="copyShareLink"
          >
            <Copy class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
            :disabled="saveStatus === 'saving'"
            @click="saveCurrentSpread"
          >
            <Save class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">{{ saveStatus === 'saving' ? 'Сохр…' : 'Сохранить' }}</span>
          </button>
        </div>
      </header>

      <!-- ░ BODY ░ -->
      <div class="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

        <!-- ══ DESKTOP: Gallery sidebar ══════════════════════ -->
        <aside class="hidden md:flex flex-col border-r shrink-0 bg-background" style="width: 190px">
          <div class="shrink-0 px-3 py-2 border-b flex items-center justify-between">
            <span class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Галерея ({{ photos.length }})
            </span>
            <button type="button" class="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground" @click="openFilePicker" title="Добавить фото">
              <Upload class="w-3.5 h-3.5" />
            </button>
          </div>
          <input ref="fileInputEl" type="file" multiple accept="image/*" class="hidden" @change="onFilesSelected" />

          <!-- Sort -->
          <div class="shrink-0 flex border-b">
            <button
              v-for="s in [{ val: 'date', lbl: 'По дате' }, { val: 'name', lbl: 'По имени' }]"
              :key="s.val"
              type="button"
              class="flex-1 py-1.5 text-[10px] font-semibold transition-colors"
              :class="photoSort === s.val ? 'text-primary border-b-2 border-primary -mb-px' : 'text-muted-foreground hover:text-foreground'"
              @click="photoSort = (s.val as 'date' | 'name')"
            >{{ s.lbl }}</button>
          </div>

          <!-- Selection hint -->
          <div v-if="selectedPhotoId" class="shrink-0 px-2 py-1.5 bg-primary/10 text-primary text-[11px] text-center font-medium border-b">
            ↓ Нажми на ячейку разворота
          </div>

          <div class="flex-1 overflow-y-auto min-h-0 p-1.5 grid grid-cols-2 gap-1.5 content-start">
            <!-- Photos -->
            <div
              v-for="photo in sortedPhotos"
              :key="photo.id"
              class="relative aspect-square rounded-lg overflow-hidden bg-secondary cursor-pointer select-none ring-offset-background transition-all"
              :class="selectedPhotoId === photo.id ? 'ring-2 ring-primary ring-offset-1' : 'hover:ring-1 hover:ring-primary/40'"
              draggable="true"
              @dragstart="onDragStartGallery(photo.id, $event)"
              @click="onGalleryPhotoClick(photo.id)"
            >
              <img :src="photo.thumbUrl" class="w-full h-full object-cover" draggable="false" />
              <!-- Used badge -->
              <div v-if="usedPhotoIds.has(photo.id)" class="absolute top-0.5 left-0.5 w-4 h-4 bg-primary/80 rounded-full flex items-center justify-center">
                <Check class="w-2.5 h-2.5 text-white" />
              </div>
              <!-- Date -->
              <div v-if="photo.takenAt" class="absolute bottom-0 inset-x-0 px-0.5 py-0.5 bg-black/50 text-white text-[8px] text-center truncate">
                {{ new Date(photo.takenAt).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}
              </div>
              <!-- Selected overlay -->
              <div v-if="selectedPhotoId === photo.id" class="absolute inset-0 bg-primary/20 flex items-center justify-center">
                <Check class="w-5 h-5 text-primary drop-shadow" />
              </div>
              <!-- Delete on hover -->
              <button
                type="button"
                class="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 hover:opacity-100 transition-opacity"
                @click="removePhoto(photo.id, $event)"
              ><X class="w-2.5 h-2.5" /></button>
            </div>

            <!-- Add more button -->
            <button
              type="button"
              class="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              @click="openFilePicker"
            >
              <Plus class="w-5 h-5" />
            </button>
          </div>

          <!-- Auto-layout -->
          <div class="shrink-0 p-2 border-t">
            <button
              type="button"
              class="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
              :disabled="autoLayoutRunning || !photos.length"
              @click="runAutoLayout"
            >
              <Loader2 v-if="autoLayoutRunning" class="w-3.5 h-3.5 animate-spin" />
              <Sparkles v-else class="w-3.5 h-3.5" />
              {{ autoLayoutRunning ? 'Расставляю…' : 'Собрать с ИИ' }}
            </button>
          </div>
        </aside>

        <!-- ══ CENTER: Canvas area ═════════════════════════════ -->
        <main class="flex-1 min-w-0 flex flex-col min-h-0 bg-secondary/20">
          <div class="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-start md:justify-center gap-3 p-3 sm:p-4">

            <!-- View mode + nav -->
            <div class="shrink-0 flex items-center gap-2 w-full max-w-[680px]">
              <!-- View mode toggle -->
              <div class="flex rounded-xl overflow-hidden border text-xs font-medium">
                <button
                  type="button"
                  class="px-2.5 py-1.5 transition-colors"
                  :class="viewMode === 'spread' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'"
                  @click="viewMode = 'spread'"
                >Разворот</button>
                <button
                  type="button"
                  class="px-2.5 py-1.5 transition-colors"
                  :class="viewMode === 'overview' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'"
                  @click="viewMode = 'overview'"
                >Страницы</button>
              </div>

              <div class="flex-1" />

              <!-- Spread nav (only in spread mode) -->
              <div v-if="viewMode === 'spread'" class="flex items-center gap-1.5">
                <button type="button" class="p-1.5 rounded-full hover:bg-secondary disabled:opacity-30" :disabled="currentIndex === 0" @click="prevSpread">
                  <ChevronLeft class="w-4 h-4" />
                </button>
                <span class="text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[70px] text-center">
                  {{ currentSpread?.kind === 'COVER' ? '📖 Обложка' : `Стр. ${currentIndex}/${spreads.length - 1}` }}
                </span>
                <button type="button" class="p-1.5 rounded-full hover:bg-secondary disabled:opacity-30" :disabled="currentIndex >= spreads.length - 1" @click="nextSpread">
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Mobile: selected photo hint -->
            <div
              v-if="selectedPhotoId && viewMode === 'spread'"
              class="md:hidden shrink-0 px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-full border border-primary/20"
            >
              Нажми ячейку разворота для размещения фото
            </div>

            <!-- ░ SPREAD VIEW ░ -->
            <template v-if="viewMode === 'spread' && currentSpread">

              <!-- ── COVER: 3-zone canvas (back | spine | front) ── -->
              <template v-if="currentSpread.kind === 'COVER'">
                <div
                  class="relative bg-white shadow-xl rounded-sm overflow-hidden w-full shrink-0"
                  style="max-width: min(920px, 100%)"
                  :style="{ aspectRatio: String(coverCanvasRatio) }"
                >
                  <!-- BACK ZONE -->
                  <div
                    class="absolute inset-y-0 overflow-hidden"
                    :style="{ left: '0%', width: coverBackPct + '%' }"
                  >
                    <div class="absolute inset-0" :style="{ background: activeCoverTemplate?.backBg ?? '#f4f4f5' }" />
                    <div
                      class="absolute inset-0 cursor-pointer transition-all"
                      :class="dragOverCell === 10 ? 'ring-2 ring-primary ring-inset' : ''"
                      data-cell-index="10"
                      @click="onCellClick(10)"
                      @dragover.prevent="onDragOver(10, $event)"
                      @dragleave="onDragLeave()"
                      @drop.prevent="onDrop(10)"
                    >
                      <template v-if="placementByCell(10)">
                        <img
                          :src="placementByCell(10)!.photo.thumbUrl"
                          class="absolute inset-0 w-full h-full object-cover select-none"
                          :style="photoImgStyle(placementByCell(10)!)"
                          draggable="true"
                          @dragstart="onDragStartCell(10, $event)"
                        />
                        <div class="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center bg-black/20">
                          <span class="text-white text-[10px] font-medium bg-black/40 px-2 py-0.5 rounded-full">Нажмите</span>
                        </div>
                      </template>
                      <template v-else>
                        <div class="w-full h-full flex flex-col items-center justify-center gap-1 select-none pointer-events-none">
                          <Plus class="w-5 h-5 transition-colors" :class="selectedPhotoId ? 'text-primary' : 'text-gray-300'" />
                          <span class="text-[9px] text-gray-300">Задняя</span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- SPINE ZONE -->
                  <div
                    class="absolute inset-y-0 cursor-pointer flex items-center justify-center overflow-hidden"
                    :style="{ left: coverBackPct + '%', width: coverSpinePct + '%', background: activeCoverTemplate?.spineBg ?? '#27272a' }"
                    @click.stop="getOrCreateSpineText()"
                  >
                    <template v-if="spineText">
                      <span
                        class="select-none"
                        style="writing-mode: vertical-lr; transform: rotate(180deg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-height: 90%; font-size: 7px; line-height: 1.2"
                        :style="{ fontFamily: spineText.fontFamily, color: spineText.color ?? activeCoverTemplate?.spineColor ?? '#ffffff' }"
                      >{{ spineText.text }}</span>
                    </template>
                    <template v-else>
                      <Type class="w-2 h-2 shrink-0" :style="{ color: (activeCoverTemplate?.spineColor ?? '#ffffff') + '4d' }" />
                    </template>
                  </div>

                  <!-- FRONT ZONE -->
                  <div
                    class="absolute inset-y-0 overflow-hidden"
                    :style="{ left: coverFrontLeft + '%', width: coverFrontPct + '%' }"
                  >
                    <div class="absolute inset-0" :style="{ background: activeCoverTemplate?.frontBg ?? '#f4f4f5' }" />
                    <div
                      class="absolute inset-0 cursor-pointer transition-all"
                      :class="dragOverCell === 0 ? 'ring-2 ring-primary ring-inset' : ''"
                      data-cell-index="0"
                      @click="onCellClick(0)"
                      @dragover.prevent="onDragOver(0, $event)"
                      @dragleave="onDragLeave()"
                      @drop.prevent="onDrop(0)"
                    >
                      <template v-if="placementByCell(0)">
                        <img
                          :src="placementByCell(0)!.photo.thumbUrl"
                          class="absolute inset-0 w-full h-full object-cover select-none"
                          :style="photoImgStyle(placementByCell(0)!)"
                          draggable="true"
                          @dragstart="onDragStartCell(0, $event)"
                        />
                        <!-- Template gradient overlay rendered on top of photo -->
                        <div
                          v-if="activeCoverTemplate?.frontOverlay"
                          class="absolute inset-0 pointer-events-none"
                          :style="{ background: activeCoverTemplate.frontOverlay }"
                        />
                        <div class="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center bg-black/20">
                          <span class="text-white text-[10px] font-medium bg-black/40 px-2 py-0.5 rounded-full">Нажмите</span>
                        </div>
                      </template>
                      <template v-else>
                        <div class="w-full h-full flex flex-col items-center justify-center gap-1 select-none pointer-events-none">
                          <Plus class="w-5 h-5 transition-colors" :class="selectedPhotoId ? 'text-primary' : 'text-gray-300'" />
                          <span class="text-[9px]" :style="{ color: activeCoverTemplate ? activeCoverTemplate.frontBg.startsWith('#') && parseInt(activeCoverTemplate.frontBg.slice(1), 16) < 0x808080 ? '#d4d4d8' : '#a1a1aa' : '#d4d4d8' }">Лицевая</span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- TEXT OVERLAYS (non-spine, x >= 0) -->
                  <div
                    v-for="txt in (currentSpread.textElements ?? []).filter(t => t.x >= 0)"
                    :key="txt.id"
                    class="absolute select-none cursor-pointer z-10 hover:outline hover:outline-1 hover:outline-primary/40"
                    :style="{ left: txt.x + '%', top: txt.y + '%', width: txt.w + '%' }"
                    @click.stop="openEditText(txt)"
                  >
                    <span
                      class="block px-0.5 py-0.5"
                      :style="{ fontFamily: txt.fontFamily, fontSize: txt.fontSize + 'px', color: txt.color, lineHeight: 1.3 }"
                    >{{ txt.text }}</span>
                  </div>

                  <!-- GUIDES OVERLAY -->
                  <div v-if="showGuides" class="absolute inset-0 pointer-events-none z-20">
                    <!-- Bleed frame (red solid) -->
                    <div
                      class="absolute border border-red-500/60"
                      :style="{
                        left: coverGuideBleedX + '%', top: coverGuideBleedY + '%',
                        right: coverGuideBleedX + '%', bottom: coverGuideBleedY + '%',
                      }"
                    />
                    <!-- Safe zone frame (red dashed) -->
                    <div
                      class="absolute border border-dashed border-red-400/50"
                      :style="{
                        left: coverGuideSafeX + '%', top: coverGuideSafeY + '%',
                        right: coverGuideSafeX + '%', bottom: coverGuideSafeY + '%',
                      }"
                    />
                    <!-- Spine left boundary -->
                    <div class="absolute top-0 bottom-0 w-px bg-gray-400/60" :style="{ left: coverBackPct + '%' }" />
                    <!-- Spine right boundary -->
                    <div class="absolute top-0 bottom-0 w-px bg-gray-400/60" :style="{ left: coverFrontLeft + '%' }" />
                    <!-- Guide legend -->
                    <div class="absolute top-1 left-1 flex flex-col gap-0.5">
                      <div class="flex items-center gap-1">
                        <div class="w-4 h-px bg-red-500/70" />
                        <span class="text-[7px] text-red-500/80 font-medium">bleed 3мм</span>
                      </div>
                      <div class="flex items-center gap-1">
                        <div class="w-4 h-px border-t border-dashed border-red-400/60" />
                        <span class="text-[7px] text-red-400/70 font-medium">safe 5мм</span>
                      </div>
                    </div>
                    <!-- Zone labels -->
                    <div class="absolute bottom-1 flex w-full px-1 justify-between">
                      <span
                        class="text-[7px] text-gray-500/70 font-medium"
                        :style="{ width: coverBackPct + '%', textAlign: 'center' }"
                      >ЗАДНЯЯ</span>
                      <span
                        class="text-[7px] text-gray-300/70 font-medium"
                        :style="{ width: coverSpinePct + '%', textAlign: 'center' }"
                      />
                      <span
                        class="text-[7px] text-gray-500/70 font-medium"
                        :style="{ width: coverFrontPct + '%', textAlign: 'center' }"
                      >ЛИЦЕВАЯ</span>
                    </div>
                  </div>
                </div>

                <!-- Cover actions row -->
                <div class="shrink-0 flex items-center gap-2 flex-wrap justify-center w-full" style="max-width: min(920px, 100%)">
                  <button
                    type="button"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all"
                    :class="showGuides ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-secondary border-transparent text-muted-foreground'"
                    @click="showGuides = !showGuides"
                  >
                    <Ruler class="w-3 h-3" />
                    {{ showGuides ? 'Направляющие вкл.' : 'Направляющие выкл.' }}
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border bg-secondary border-transparent text-muted-foreground hover:text-foreground transition-all"
                    @click="getOrCreateSpineText()"
                  >
                    <Type class="w-3 h-3" />
                    Текст корешка
                  </button>
                </div>
              </template>

              <!-- ── REGULAR SPREAD canvas ── -->
              <div
                v-else
                class="relative bg-white shadow-xl rounded-sm overflow-hidden w-full shrink-0"
                style="max-width: min(680px, 100%)"
                :style="{ aspectRatio: String(spreadRatio) }"
              >
                <!-- Photo/text grid -->
                <div
                  class="absolute inset-0"
                  :style="{ ...gridStyle(), padding: currentTemplate?.gridPadding ?? undefined }"
                >
                  <div
                    v-for="i in cellCount"
                    :key="i - 1"
                    class="relative overflow-hidden transition-all duration-100"
                    :class="[
                      cellKind(i - 1) === 'text' ? 'cursor-pointer' : (
                        dragOverCell === i - 1 ? 'ring-2 ring-primary ring-inset brightness-90' : (
                          !placementByCell(i - 1) ? (selectedPhotoId ? 'bg-primary/5 cursor-pointer' : 'bg-gray-100 border border-dashed border-gray-200') : 'cursor-pointer'
                        )
                      ),
                    ]"
                    :style="cellStyle(i - 1)"
                    :data-cell-index="i - 1"
                    @click="onCellClick(i - 1)"
                    @dragover="cellKind(i - 1) === 'photo' ? onDragOver(i - 1, $event) : undefined"
                    @dragleave="cellKind(i - 1) === 'photo' ? onDragLeave() : undefined"
                    @drop.prevent="cellKind(i - 1) === 'photo' ? onDrop(i - 1) : undefined"
                  >
                    <!-- TEXT CELL -->
                    <template v-if="cellKind(i - 1) === 'text'">
                      <div class="w-full h-full flex flex-col items-center justify-center bg-amber-50/70 hover:bg-amber-50 transition-colors select-none gap-1 p-2">
                        <template v-if="textElementForSlot(textSlotIndex(i - 1))">
                          <span
                            class="text-center leading-snug line-clamp-4 pointer-events-none"
                            :style="{
                              fontFamily: textElementForSlot(textSlotIndex(i - 1))!.fontFamily,
                              fontSize: Math.min(textElementForSlot(textSlotIndex(i - 1))!.fontSize, 14) + 'px',
                              color: textElementForSlot(textSlotIndex(i - 1))!.color,
                            }"
                          >{{ textElementForSlot(textSlotIndex(i - 1))!.text }}</span>
                        </template>
                        <template v-else>
                          <Type class="w-4 h-4 text-amber-400/70 shrink-0" />
                          <span class="text-[10px] text-amber-600/60 text-center leading-tight">
                            {{ currentTemplate?.textSlots?.[textSlotIndex(i - 1)]?.placeholder ?? 'Текст' }}
                          </span>
                        </template>
                      </div>
                    </template>

                    <!-- PHOTO CELL -->
                    <template v-else>
                      <template v-if="placementByCell(i - 1)">
                        <img
                          :src="placementByCell(i - 1)!.photo.thumbUrl"
                          class="absolute inset-0 w-full h-full object-cover select-none"
                          :style="photoImgStyle(placementByCell(i - 1)!)"
                          draggable="true"
                          @dragstart="onDragStartCell(i - 1, $event)"
                        />
                        <div class="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center bg-black/20">
                          <span class="text-white text-[10px] font-medium bg-black/40 px-2 py-0.5 rounded-full">Нажмите</span>
                        </div>
                      </template>
                      <template v-else>
                        <div class="w-full h-full flex items-center justify-center select-none pointer-events-none">
                          <Plus
                            class="w-6 h-6 transition-colors"
                            :class="selectedPhotoId ? 'text-primary opacity-70' : 'text-gray-300'"
                          />
                        </div>
                      </template>
                    </template>
                  </div>
                </div>

                <!-- Text overlays -->
                <div
                  v-for="txt in (currentSpread.textElements ?? [])"
                  :key="txt.id"
                  class="absolute select-none cursor-pointer z-10 hover:outline hover:outline-1 hover:outline-primary/40"
                  :style="{ left: txt.x + '%', top: txt.y + '%', width: txt.w + '%' }"
                  @click.stop="openEditText(txt)"
                >
                  <span
                    class="block px-0.5 py-0.5"
                    :style="{ fontFamily: txt.fontFamily, fontSize: txt.fontSize + 'px', color: txt.color, lineHeight: 1.3 }"
                  >{{ txt.text }}</span>
                </div>
              </div>

              <!-- Spread mini-nav -->
              <div class="shrink-0 flex items-center gap-1.5 flex-wrap justify-center max-w-[680px] w-full">
                <button
                  v-for="(s, i) in spreads"
                  :key="s.id"
                  type="button"
                  class="px-2 py-1 rounded-xl text-xs font-medium transition-all"
                  :class="currentIndex === i ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'"
                  @click="currentIndex = i"
                >{{ s.kind === 'COVER' ? 'Обл.' : i }}</button>
                <button type="button" class="p-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors" title="Добавить разворот" @click="addSpread">
                  <Plus class="w-3.5 h-3.5" />
                </button>
                <button
                  v-if="currentSpread?.kind === 'SPREAD'"
                  type="button"
                  class="p-1.5 rounded-xl bg-secondary hover:bg-destructive hover:text-destructive-foreground text-secondary-foreground transition-colors"
                  title="Удалить разворот"
                  @click="removeCurrentSpread"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </template>

            <!-- ░ OVERVIEW MODE ░ -->
            <div v-else-if="viewMode === 'overview'" class="w-full max-w-[680px]">
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                <div
                  v-for="(s, i) in spreads"
                  :key="s.id"
                  class="cursor-pointer group"
                  :class="s.kind === 'COVER' ? 'col-span-2 sm:col-span-2' : ''"
                  @click="currentIndex = i; viewMode = 'spread'"
                >
                  <div
                    class="bg-white shadow-sm rounded border-2 transition-all overflow-hidden relative"
                    :class="currentIndex === i ? 'border-primary' : 'border-transparent group-hover:border-primary/40'"
                    :style="{ aspectRatio: String(spreadAspectRatioOf(s)) }"
                  >
                    <!-- COVER overview: show back+spine+front zones -->
                    <template v-if="s.kind === 'COVER'">
                      <!-- back zone -->
                      <div class="absolute inset-y-0 overflow-hidden"
                        :style="{ left: '0%', width: coverBackPct + '%', background: activeCoverTemplate?.backBg ?? '#f4f4f5' }">
                        <img
                          v-if="s.placements.find(p => p.cellIndex === 10)"
                          :src="s.placements.find(p => p.cellIndex === 10)!.photo.thumbUrl"
                          class="w-full h-full object-cover"
                        />
                        <div v-else class="w-full h-full flex items-center justify-center">
                          <ImageIcon class="w-3 h-3 text-gray-300 opacity-50" />
                        </div>
                      </div>
                      <!-- spine -->
                      <div class="absolute inset-y-0"
                        :style="{ left: coverBackPct + '%', width: coverSpinePct + '%', background: activeCoverTemplate?.spineBg ?? '#3f3f46' }" />
                      <!-- front zone -->
                      <div class="absolute inset-y-0 overflow-hidden"
                        :style="{ left: coverFrontLeft + '%', width: coverFrontPct + '%', background: activeCoverTemplate?.frontBg ?? '#f4f4f5' }">
                        <img
                          v-if="s.placements.find(p => p.cellIndex === 0)"
                          :src="s.placements.find(p => p.cellIndex === 0)!.photo.thumbUrl"
                          class="w-full h-full object-cover"
                        />
                        <div v-if="activeCoverTemplate?.frontOverlay && s.placements.find(p => p.cellIndex === 0)"
                          class="absolute inset-0" :style="{ background: activeCoverTemplate.frontOverlay }" />
                        <div v-else-if="!s.placements.find(p => p.cellIndex === 0)" class="w-full h-full flex items-center justify-center">
                          <ImageIcon class="w-3 h-3 text-gray-300 opacity-50" />
                        </div>
                      </div>
                    </template>

                    <!-- REGULAR spread overview -->
                    <template v-else>
                      <div
                        class="absolute inset-0 gap-[1px]"
                        :style="{
                          display: 'grid',
                          gridTemplateColumns: (templates.find(t => t.id === s.templateId) ?? templates[0])?.columns ?? '1fr',
                          gridTemplateRows: (templates.find(t => t.id === s.templateId))?.rows ?? '1fr',
                          gridTemplateAreas: (templates.find(t => t.id === s.templateId))?.areas,
                          padding: (templates.find(t => t.id === s.templateId))?.gridPadding ?? undefined,
                        }"
                      >
                        <template v-for="(pl) in s.placements.slice(0, 8)" :key="pl.id">
                          <div
                            class="bg-secondary relative overflow-hidden"
                            :style="(templates.find(t => t.id === s.templateId))?.areas ? { gridArea: CELL_NAMES[pl.cellIndex] } : {}"
                          >
                            <img :src="pl.photo.thumbUrl" class="w-full h-full object-cover" />
                          </div>
                        </template>
                        <div v-if="!s.placements.length" class="absolute inset-0 flex items-center justify-center">
                          <ImageIcon class="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                    </template>
                  </div>
                  <p class="text-[10px] text-center mt-1 font-medium" :class="currentIndex === i ? 'text-primary' : 'text-muted-foreground'">
                    {{ s.kind === 'COVER' ? 'Обложка' : `Стр. ${i}` }}
                  </p>
                </div>
                <!-- Add spread in overview -->
                <button type="button" class="flex flex-col items-center gap-1 group" @click="addSpread">
                  <div
                    class="border-2 border-dashed rounded flex items-center justify-center text-muted-foreground group-hover:border-primary/40 group-hover:text-primary transition-colors w-full"
                    :style="{ aspectRatio: String(spreadRatio) }"
                  >
                    <Plus class="w-5 h-5" />
                  </div>
                  <p class="text-[10px] text-muted-foreground">Добавить</p>
                </button>
              </div>
            </div>
          </div>

          <!-- ══ MOBILE: Tab bar ══════════════════════════════ -->
          <div class="md:hidden shrink-0 border-t flex bg-background">
            <button
              v-for="tab in [
                { id: 'gallery' as const, label: 'Галерея', icon: ImageIcon },
                { id: 'templates' as const, label: 'Шаблоны', icon: LayoutGrid },
                { id: 'ai' as const, label: 'ИИ', icon: Sparkles },
                { id: 'more' as const, label: 'Ещё', icon: MoreHorizontal },
              ]"
              :key="tab.id"
              type="button"
              class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors"
              :class="mobileTab === tab.id ? 'text-primary border-t-2 border-primary -mt-px bg-primary/5' : 'text-muted-foreground'"
              @click="mobileTab = tab.id"
            >
              <component :is="tab.icon" class="w-4 h-4" />
              {{ tab.label }}
            </button>
          </div>

          <!-- ══ MOBILE: Tab content ══════════════════════════ -->
          <div class="md:hidden shrink-0 border-t bg-background overflow-y-auto" style="max-height: 38dvh">
            <!-- GALLERY TAB -->
            <div v-if="mobileTab === 'gallery'" class="p-2 space-y-2">
              <div class="flex items-center gap-2">
                <button type="button"
                  class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
                  @click="openFilePicker"
                >
                  <Upload class="w-3.5 h-3.5" /> Добавить фото
                </button>
                <div class="flex rounded-xl overflow-hidden border text-[10px]">
                  <button type="button" class="px-2 py-1.5 transition-colors" :class="photoSort === 'date' ? 'bg-secondary' : 'hover:bg-secondary/50 text-muted-foreground'" @click="photoSort = 'date'">Дата</button>
                  <button type="button" class="px-2 py-1.5 transition-colors" :class="photoSort === 'name' ? 'bg-secondary' : 'hover:bg-secondary/50 text-muted-foreground'" @click="photoSort = 'name'">Имя</button>
                </div>
              </div>

              <div v-if="selectedPhotoId" class="px-2 py-1.5 bg-primary/10 text-primary text-[11px] font-medium rounded-lg text-center border border-primary/20">
                ✓ Выбрано — нажми ячейку разворота выше
              </div>

              <div v-if="!photos.length" class="py-6 text-center text-muted-foreground text-xs">
                Фото не добавлены — нажмите «Добавить фото»
              </div>
              <div v-else class="grid grid-cols-5 gap-1.5">
                <div
                  v-for="photo in sortedPhotos"
                  :key="photo.id"
                  class="relative aspect-square rounded-lg overflow-hidden bg-secondary cursor-pointer select-none ring-offset-background transition-all"
                  :class="selectedPhotoId === photo.id ? 'ring-2 ring-primary ring-offset-1' : 'hover:ring-1 hover:ring-primary/40'"
                  @click="onGalleryPhotoClick(photo.id)"
                >
                  <img :src="photo.thumbUrl" class="w-full h-full object-cover" draggable="false" />
                  <div v-if="usedPhotoIds.has(photo.id)" class="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-primary/80 rounded-full flex items-center justify-center">
                    <Check class="w-2 h-2 text-white" />
                  </div>
                  <div v-if="selectedPhotoId === photo.id" class="absolute inset-0 bg-primary/25 flex items-center justify-center">
                    <Check class="w-4 h-4 text-primary" />
                  </div>
                </div>
              </div>
            </div>

            <!-- TEMPLATES TAB -->
            <div v-else-if="mobileTab === 'templates'" class="flex flex-col min-h-0 overflow-hidden">

              <!-- ─ COVER SPREAD: cover templates ─ -->
              <template v-if="currentSpread?.kind === 'COVER'">
                <div class="shrink-0 px-3 py-1.5 border-b flex items-center gap-1.5">
                  <Palette class="w-3.5 h-3.5 text-muted-foreground" />
                  <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Стиль обложки</span>
                </div>
                <div class="flex-1 overflow-y-auto min-h-0 py-2 space-y-3">
                  <div v-for="group in groupedCoverTemplates" :key="group.cat" class="px-2">
                    <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{{ group.cat }}</p>
                    <div class="flex gap-1.5 overflow-x-auto pb-1">
                      <button
                        v-for="tpl in group.tpls"
                        :key="tpl.id"
                        type="button"
                        class="shrink-0 border-2 rounded-xl overflow-hidden transition-all"
                        :class="currentSpread?.templateId === tpl.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'"
                        style="width: 80px; aspect-ratio: 1.37"
                        :title="tpl.name"
                        @click="applyCoverTemplate(tpl)"
                      >
                        <!-- Cover thumbnail: back | spine | front -->
                        <div class="w-full h-full flex">
                          <div class="h-full relative overflow-hidden shrink-0" :style="{ width: '34%', background: tpl.backBg }">
                            <div v-for="slot in tpl.textSlots.filter(s => s.zone === 'back')" :key="slot.placeholder"
                              class="absolute rounded-full" style="height: 1.5px"
                              :style="{ background: slot.color + 'aa', top: slot.relY + '%', left: '8%', width: '80%' }" />
                          </div>
                          <div class="h-full shrink-0" :style="{ width: '3%', background: tpl.spineBg }" />
                          <div class="h-full relative overflow-hidden flex-1" :style="{ background: tpl.frontBg }">
                            <div v-if="tpl.hasPhoto" class="absolute inset-1 rounded-sm" style="background: rgba(128,128,128,0.28)" />
                            <div v-if="tpl.frontOverlay" class="absolute inset-0" :style="{ background: tpl.frontOverlay }" />
                            <div v-for="slot in tpl.textSlots.filter(s => s.zone === 'front')" :key="slot.placeholder"
                              class="absolute rounded-full"
                              :style="{ background: slot.color + 'bb', top: slot.relY + '%', left: (slot.relX * 0.88) + '%', width: (slot.relW * 0.88) + '%', height: Math.max(1, slot.fontSize / 20) + 'px' }" />
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <!-- ✈ Travelbook generator section -->
                  <div class="px-2 border-t pt-2">
                    <button
                      type="button"
                      class="w-full flex items-center justify-between py-2 px-3 rounded-xl border text-xs font-semibold hover:bg-secondary transition-colors"
                      @click="tbOpen = !tbOpen"
                    >
                      <span class="flex items-center gap-1.5">✈ Тревелбук</span>
                      <span class="text-muted-foreground">{{ tbOpen ? '▲' : '▼' }}</span>
                    </button>
                    <div v-if="tbOpen" class="mt-2 space-y-2">
                      <!-- Location -->
                      <div>
                        <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Место</label>
                        <select v-model="tbLocation" class="w-full border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30">
                          <option v-for="loc in TRAVELBOOK_LOCATIONS" :key="loc" :value="loc">{{ loc }}</option>
                        </select>
                      </div>
                      <!-- Title / subtitle -->
                      <div>
                        <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Заголовок</label>
                        <input v-model="tbTitle" :placeholder="tbLocation" class="w-full border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Подзаголовок</label>
                        <input v-model="tbSubtitle" placeholder="Например: Лето 2025" class="w-full border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                      </div>
                      <!-- Style presets -->
                      <div>
                        <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Стиль</label>
                        <div class="flex flex-wrap gap-1">
                          <button
                            v-for="s in TRAVELBOOK_STYLES" :key="s.id"
                            type="button"
                            class="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium transition-all"
                            :class="tbStyle === s.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'"
                            @click="tbStyle = s.id"
                          >
                            <span class="w-3 h-3 rounded-full shrink-0" :style="{ background: s.bg, border: '1px solid #0002' }" />
                            {{ s.label }}
                          </button>
                        </div>
                      </div>
                      <!-- Generate / result -->
                      <div v-if="tbStatus === 'idle' || tbStatus === 'error'" class="space-y-1.5">
                        <p v-if="tbError" class="text-[10px] text-destructive">{{ tbError }}</p>
                        <button
                          type="button"
                          class="w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
                          @click="tbGenerate"
                        >
                          {{ tbStatus === 'error' ? 'Повторить' : '✨ Сгенерировать' }}
                        </button>
                      </div>
                      <div v-else-if="tbStatus === 'generating'" class="space-y-1.5">
                        <div class="flex items-center gap-2">
                          <div class="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                            <div class="h-full bg-primary transition-all duration-500 rounded-full" :style="{ width: tbProgress + '%' }" />
                          </div>
                          <span class="text-[10px] text-muted-foreground shrink-0">{{ tbProgress }}%</span>
                        </div>
                        <p class="text-[10px] text-muted-foreground">{{ tbMessage }}</p>
                      </div>
                      <div v-else-if="tbStatus === 'done' && tbResultReady" class="space-y-1.5">
                        <p class="text-[10px] text-muted-foreground">{{ tbMessage }}</p>
                        <div class="flex gap-1.5">
                          <button
                            type="button"
                            class="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all"
                            @click="tbApply"
                          >Применить</button>
                          <button
                            type="button"
                            class="py-2 px-3 rounded-xl border text-xs hover:bg-secondary transition-all"
                            @click="tbReset(); tbGenerate()"
                          >↺</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Spine text + text list -->
                  <div class="px-2 border-t pt-2 space-y-1.5">
                    <button type="button"
                      class="w-full flex items-center gap-2 py-2 px-3 rounded-xl border text-xs hover:bg-secondary transition-colors"
                      @click="getOrCreateSpineText()"
                    >
                      <Type class="w-3.5 h-3.5 text-muted-foreground" />
                      Текст корешка
                    </button>
                    <div v-if="currentSpread?.textElements.filter(t => t.x >= 0).length" class="space-y-1">
                      <div v-for="t in currentSpread.textElements.filter(te => te.x >= 0)" :key="t.id" class="flex items-center gap-2 group">
                        <button type="button" class="flex-1 text-xs truncate text-left py-1 px-2 rounded-lg hover:bg-secondary transition-colors"
                          :style="{ fontFamily: t.fontFamily, color: t.color }"
                          @click="openEditText(t)"
                        >{{ t.text }}</button>
                        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all p-1" @click="deleteText(t.id)">
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p class="text-[10px] text-muted-foreground">Пустые текстовые поля не идут в печать.</p>
                  </div>
                </div>
              </template>

              <!-- ─ REGULAR SPREAD: photo/text subtabs ─ -->
              <template v-else>
              <!-- Subtab switcher -->
              <div class="shrink-0 flex border-b">
                <button
                  v-for="st in [{ id: 'photo', label: 'Фото' }, { id: 'text', label: 'Текст' }] as const"
                  :key="st.id"
                  type="button"
                  class="flex-1 py-1.5 text-xs font-semibold transition-colors"
                  :class="templateSubTab === st.id ? 'text-primary border-b-2 border-primary -mb-px' : 'text-muted-foreground'"
                  @click="templateSubTab = st.id"
                >{{ st.label }}</button>
              </div>

              <div class="flex-1 overflow-y-auto min-h-0 py-2 space-y-3">
                <!-- PHOTO sub-tab: categories with horizontal strips -->
                <template v-if="templateSubTab === 'photo'">
                  <div v-for="group in groupedPhotoTemplates" :key="group.cat" class="px-2">
                    <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{{ group.cat }}</p>
                    <div class="flex gap-1.5 overflow-x-auto pb-1">
                      <button
                        v-for="tpl in group.tpls"
                        :key="tpl.id"
                        type="button"
                        class="shrink-0 border-2 rounded-xl overflow-hidden transition-all"
                        :class="currentSpread?.templateId === tpl.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'"
                        style="width: 72px; aspect-ratio: 4/3"
                        :title="tpl.name"
                        @click="selectTemplate(tpl.id)"
                      >
                        <div
                          class="w-full h-full"
                          :style="{
                            display: 'grid',
                            gridTemplateColumns: tpl.columns,
                            gridTemplateRows: tpl.rows,
                            gridTemplateAreas: tpl.areas,
                            gap: '1px',
                            padding: tpl.gridPadding ? '8%' : '2px',
                          }"
                        >
                          <div
                            v-for="ci in tpl.cells"
                            :key="ci"
                            class="rounded-sm"
                            :class="(tpl.cellKinds?.[ci - 1] ?? 'photo') === 'text' ? 'bg-amber-100 border border-amber-200/60' : 'bg-zinc-200'"
                            :style="tpl.areas ? { gridArea: CELL_NAMES[ci - 1] } : {}"
                          />
                        </div>
                      </button>
                    </div>
                  </div>
                </template>

                <!-- TEXT sub-tab: mixed + text templates + free text -->
                <template v-else>
                  <div v-for="group in groupedTextTemplates" :key="group.cat" class="px-2">
                    <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{{ group.cat }}</p>
                    <div class="flex gap-1.5 overflow-x-auto pb-1">
                      <button
                        v-for="tpl in group.tpls"
                        :key="tpl.id"
                        type="button"
                        class="shrink-0 border-2 rounded-xl overflow-hidden transition-all"
                        :class="currentSpread?.templateId === tpl.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'"
                        style="width: 72px; aspect-ratio: 4/3"
                        :title="tpl.name"
                        @click="selectTemplate(tpl.id)"
                      >
                        <div
                          class="w-full h-full"
                          :style="{
                            display: 'grid',
                            gridTemplateColumns: tpl.columns,
                            gridTemplateRows: tpl.rows,
                            gridTemplateAreas: tpl.areas,
                            gap: '1px',
                            padding: '2px',
                          }"
                        >
                          <div
                            v-for="ci in tpl.cells"
                            :key="ci"
                            class="rounded-sm flex flex-col items-stretch justify-center gap-px overflow-hidden p-px"
                            :class="(tpl.cellKinds?.[ci - 1] ?? 'photo') === 'text' ? 'bg-amber-100 border border-amber-200/60' : 'bg-zinc-200'"
                            :style="tpl.areas ? { gridArea: CELL_NAMES[ci - 1] } : {}"
                          >
                            <template v-if="(tpl.cellKinds?.[ci - 1] ?? 'photo') === 'text'">
                              <div class="h-px bg-amber-400/60 rounded-full" />
                              <div class="h-px bg-amber-400/40 rounded-full w-3/4" />
                            </template>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <!-- Free text button + existing text list -->
                  <div class="px-2 border-t pt-2 space-y-1.5">
                    <button
                      type="button"
                      class="w-full flex items-center gap-2 py-2 px-3 rounded-xl border text-xs hover:bg-secondary transition-colors"
                      @click="openAddText"
                    >
                      <Type class="w-3.5 h-3.5 text-muted-foreground" />
                      Добавить свободный текст
                    </button>
                    <div v-if="currentSpread?.textElements.length" class="space-y-1">
                      <div v-for="t in currentSpread.textElements" :key="t.id" class="flex items-center gap-2 group">
                        <button type="button" class="flex-1 text-xs truncate text-left py-1 px-2 rounded-lg hover:bg-secondary transition-colors"
                          :style="{ fontFamily: t.fontFamily, color: t.color }"
                          @click="openEditText(t)"
                        >{{ t.text }}</button>
                        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all p-1" @click="deleteText(t.id)">
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p class="text-[10px] text-muted-foreground">Пустые текстовые поля не идут в печать.</p>
                  </div>
                </template>
              </div>
              </template><!-- /v-else regular spread -->
            </div>

            <!-- AI TAB -->
            <div v-else-if="mobileTab === 'ai'" class="p-4 space-y-3">
              <div class="flex items-start gap-3">
                <Sparkles class="w-8 h-8 text-primary shrink-0 mt-0.5" />
                <div>
                  <p class="font-semibold text-sm">Авто-расстановка с ИИ</p>
                  <p class="text-xs text-muted-foreground mt-0.5">Фото расставятся по страницам в хронологическом порядке (по дате съёмки из EXIF). Не более 8 фото на разворот.</p>
                </div>
              </div>
              <button
                type="button"
                class="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
                :disabled="autoLayoutRunning || !photos.length"
                @click="runAutoLayout"
              >
                <Loader2 v-if="autoLayoutRunning" class="w-4 h-4 animate-spin" />
                <Sparkles v-else class="w-4 h-4" />
                {{ autoLayoutRunning ? 'Расставляю…' : 'Собрать с ИИ' }}
              </button>
              <p v-if="!photos.length" class="text-xs text-center text-muted-foreground">Сначала добавьте фото</p>
            </div>

            <!-- MORE TAB -->
            <div v-else-if="mobileTab === 'more'" class="p-2 space-y-1.5">
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm text-left"
                @click="openAddText"
              >
                <Type class="w-4 h-4 text-muted-foreground shrink-0" />
                Добавить текст
              </button>
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm text-left"
                @click="clearCurrentSpread"
              >
                <X class="w-4 h-4 text-muted-foreground shrink-0" />
                Очистить разворот
              </button>
              <button
                v-if="currentSpread?.kind === 'SPREAD'"
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-destructive hover:text-destructive-foreground transition-colors text-sm text-left"
                @click="removeCurrentSpread"
              >
                <Trash2 class="w-4 h-4 shrink-0" />
                Удалить этот разворот
              </button>
              <div class="border-t my-1" />
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm text-left"
                @click="copyShareLink"
              >
                <Copy class="w-4 h-4 text-muted-foreground shrink-0" />
                Скопировать ссылку
              </button>
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-destructive hover:text-destructive-foreground transition-colors text-sm text-left"
                @click="deleteProject"
              >
                <Trash2 class="w-4 h-4 shrink-0" />
                Удалить проект
              </button>
            </div>
          </div>

          <!-- ══ DESKTOP RIGHT PANEL (templates + text) ═══════ -->
          <!-- Visible via position inside main on md+ -->
        </main>

        <!-- ══ DESKTOP: Right panel (templates + text) ════════ -->
        <aside class="hidden md:flex flex-col border-l shrink-0 bg-background" style="width: 185px">

          <!-- ─ COVER SPREAD: cover template library ─────────── -->
          <template v-if="currentSpread?.kind === 'COVER'">
            <div class="shrink-0 px-2 py-1.5 border-b flex items-center gap-1.5">
              <Palette class="w-3 h-3 text-muted-foreground" />
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Стиль обложки</p>
            </div>
            <div class="overflow-y-auto flex-1 min-h-0 py-2 space-y-3">
              <div v-for="group in groupedCoverTemplates" :key="group.cat" class="px-1.5">
                <p class="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-0.5">{{ group.cat }}</p>
                <div class="flex gap-1 overflow-x-auto pb-1">
                  <button
                    v-for="tpl in group.tpls"
                    :key="tpl.id"
                    type="button"
                    class="shrink-0 border-2 rounded-lg overflow-hidden transition-all"
                    :class="currentSpread?.templateId === tpl.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'"
                    style="width: 68px; aspect-ratio: 1.37"
                    :title="tpl.name"
                    @click="applyCoverTemplate(tpl)"
                  >
                    <!-- Cover thumbnail: back | spine | front -->
                    <div class="w-full h-full flex">
                      <div class="h-full relative overflow-hidden shrink-0" :style="{ width: '34%', background: tpl.backBg }">
                        <div v-for="slot in tpl.textSlots.filter(s => s.zone === 'back')" :key="slot.placeholder"
                          class="absolute rounded-full" style="height: 1.5px"
                          :style="{ background: slot.color + 'aa', top: slot.relY + '%', left: '8%', width: '80%' }" />
                      </div>
                      <div class="h-full shrink-0" :style="{ width: '3%', background: tpl.spineBg }" />
                      <div class="h-full relative overflow-hidden flex-1" :style="{ background: tpl.frontBg }">
                        <div v-if="tpl.hasPhoto" class="absolute inset-1 rounded-sm" style="background: rgba(128,128,128,0.28)" />
                        <div v-if="tpl.frontOverlay" class="absolute inset-0" :style="{ background: tpl.frontOverlay }" />
                        <div v-for="slot in tpl.textSlots.filter(s => s.zone === 'front')" :key="slot.placeholder"
                          class="absolute rounded-full"
                          :style="{ background: slot.color + 'bb', top: slot.relY + '%', left: (slot.relX * 0.88) + '%', width: (slot.relW * 0.88) + '%', height: Math.max(1, slot.fontSize / 20) + 'px' }" />
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- ✈ Travelbook generator (desktop aside) -->
              <div class="px-1.5 border-t pt-2">
                <button
                  type="button"
                  class="w-full flex items-center justify-between py-1.5 px-2 rounded-xl border text-[11px] font-semibold hover:bg-secondary transition-colors"
                  @click="tbOpen = !tbOpen"
                >
                  <span>✈ Тревелбук</span>
                  <span class="text-muted-foreground text-[9px]">{{ tbOpen ? '▲' : '▼' }}</span>
                </button>
                <div v-if="tbOpen" class="mt-1.5 space-y-1.5">
                  <div>
                    <label class="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 block">Место</label>
                    <select v-model="tbLocation" class="w-full border rounded-lg px-1.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-primary/30">
                      <option v-for="loc in TRAVELBOOK_LOCATIONS" :key="loc" :value="loc">{{ loc }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 block">Заголовок</label>
                    <input v-model="tbTitle" :placeholder="tbLocation" class="w-full border rounded-lg px-1.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label class="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 block">Подзаголовок</label>
                    <input v-model="tbSubtitle" placeholder="Лето 2025" class="w-full border rounded-lg px-1.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label class="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 block">Стиль</label>
                    <div class="flex flex-wrap gap-0.5">
                      <button
                        v-for="s in TRAVELBOOK_STYLES" :key="s.id"
                        type="button"
                        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg border text-[9px] font-medium transition-all"
                        :class="tbStyle === s.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'"
                        @click="tbStyle = s.id"
                      >
                        <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: s.bg, border: '1px solid #0002' }" />
                        {{ s.label }}
                      </button>
                    </div>
                  </div>
                  <div v-if="tbStatus === 'idle' || tbStatus === 'error'" class="space-y-1">
                    <p v-if="tbError" class="text-[9px] text-destructive">{{ tbError }}</p>
                    <button type="button"
                      class="w-full py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-all"
                      @click="tbGenerate"
                    >{{ tbStatus === 'error' ? 'Повторить' : '✨ Сгенерировать' }}</button>
                  </div>
                  <div v-else-if="tbStatus === 'generating'" class="space-y-1">
                    <div class="flex items-center gap-1">
                      <div class="flex-1 bg-secondary rounded-full h-1 overflow-hidden">
                        <div class="h-full bg-primary transition-all duration-500 rounded-full" :style="{ width: tbProgress + '%' }" />
                      </div>
                      <span class="text-[9px] text-muted-foreground shrink-0">{{ tbProgress }}%</span>
                    </div>
                    <p class="text-[9px] text-muted-foreground">{{ tbMessage }}</p>
                  </div>
                  <div v-else-if="tbStatus === 'done' && tbResultReady" class="space-y-1">
                    <p class="text-[9px] text-muted-foreground">{{ tbMessage }}</p>
                    <div class="flex gap-1">
                      <button type="button"
                        class="flex-1 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-all"
                        @click="tbApply"
                      >Применить</button>
                      <button type="button"
                        class="py-1.5 px-2 rounded-xl border text-[11px] hover:bg-secondary transition-all"
                        @click="tbReset(); tbGenerate()"
                      >↺</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Spine text + text elements -->
              <div class="px-1.5 border-t pt-2 space-y-1.5">
                <button type="button"
                  class="w-full flex items-center gap-1 py-1.5 rounded-xl border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors justify-center"
                  @click="getOrCreateSpineText()"
                >
                  <Type class="w-3 h-3" /> Текст корешка
                </button>
                <div v-if="currentSpread?.textElements.filter(t => t.x >= 0).length" class="space-y-1 border-t pt-1.5">
                  <div v-for="t in currentSpread.textElements.filter(te => te.x >= 0)" :key="t.id" class="flex items-center gap-1 group">
                    <button type="button" class="flex-1 text-[11px] truncate text-left hover:text-primary transition-colors" :style="{ fontFamily: t.fontFamily, color: t.color }" @click="openEditText(t)">
                      {{ t.text }}
                    </button>
                    <button type="button" class="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 transition-all" @click="deleteText(t.id)">
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p class="text-[9px] text-muted-foreground leading-tight">Пустые поля не идут в финал/печать.</p>
              </div>

              <!-- Danger actions -->
              <div class="px-1.5 border-t pt-2 space-y-0.5">
                <button type="button" class="w-full text-[11px] text-muted-foreground hover:text-destructive py-1.5 flex items-center justify-center gap-1 hover:bg-secondary/50 rounded-xl transition-colors" @click="clearCurrentSpread">
                  <X class="w-3 h-3" /> Очистить обложку
                </button>
                <button type="button" class="w-full text-[11px] text-muted-foreground hover:text-destructive py-1.5 flex items-center justify-center gap-1 hover:bg-secondary/50 rounded-xl transition-colors" @click="deleteProject">
                  <Trash2 class="w-3 h-3" /> Удалить проект
                </button>
              </div>
            </div>
          </template>

          <!-- ─ REGULAR SPREAD: photo/text layout templates ──── -->
          <template v-else>
            <!-- Subtabs -->
            <div class="shrink-0 flex border-b">
              <button
                v-for="st in [{ id: 'photo', label: 'Фото', icon: LayoutGrid }, { id: 'text', label: 'Текст', icon: Type }] as const"
                :key="st.id"
                type="button"
                class="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors"
                :class="templateSubTab === st.id ? 'text-primary border-b-2 border-primary -mb-px' : 'text-muted-foreground hover:text-foreground'"
                @click="templateSubTab = st.id"
              >
                <component :is="st.icon" class="w-3 h-3" />
                {{ st.label }}
              </button>
            </div>

            <!-- PHOTO tab: grouped horizontal strips -->
            <div v-if="templateSubTab === 'photo'" class="overflow-y-auto flex-1 min-h-0 py-2 space-y-3">
              <div v-for="group in groupedPhotoTemplates" :key="group.cat" class="px-1.5">
                <p class="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-0.5">{{ group.cat }}</p>
                <div class="flex gap-1 overflow-x-auto pb-1">
                  <button
                    v-for="tpl in group.tpls"
                    :key="tpl.id"
                    type="button"
                    class="shrink-0 border-2 rounded-lg overflow-hidden transition-all"
                    :class="currentSpread?.templateId === tpl.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'"
                    style="width: 56px; aspect-ratio: 4/3"
                    :title="tpl.name"
                    @click="selectTemplate(tpl.id)"
                  >
                    <div
                      class="w-full h-full"
                      :style="{
                        display: 'grid',
                        gridTemplateColumns: tpl.columns,
                        gridTemplateRows: tpl.rows,
                        gridTemplateAreas: tpl.areas,
                        gap: '1px',
                        padding: tpl.gridPadding ? '8%' : '1.5px',
                      }"
                    >
                      <div
                        v-for="ci in tpl.cells"
                        :key="ci"
                        class="rounded-sm"
                        :class="(tpl.cellKinds?.[ci - 1] ?? 'photo') === 'text' ? 'bg-amber-100 border border-amber-200/60' : 'bg-zinc-200'"
                        :style="tpl.areas ? { gridArea: CELL_NAMES[ci - 1] } : {}"
                      />
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- TEXT tab: mixed/text template strips + free text + element list -->
            <div v-else class="overflow-y-auto flex-1 min-h-0 py-2 space-y-3">
              <div v-for="group in groupedTextTemplates" :key="group.cat" class="px-1.5">
                <p class="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-0.5">{{ group.cat }}</p>
                <div class="flex gap-1 overflow-x-auto pb-1">
                  <button
                    v-for="tpl in group.tpls"
                    :key="tpl.id"
                    type="button"
                    class="shrink-0 border-2 rounded-lg overflow-hidden transition-all"
                    :class="currentSpread?.templateId === tpl.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'"
                    style="width: 56px; aspect-ratio: 4/3"
                    :title="tpl.name"
                    @click="selectTemplate(tpl.id)"
                  >
                    <div
                      class="w-full h-full"
                      :style="{
                        display: 'grid',
                        gridTemplateColumns: tpl.columns,
                        gridTemplateRows: tpl.rows,
                        gridTemplateAreas: tpl.areas,
                        gap: '1px',
                        padding: '1.5px',
                      }"
                    >
                      <div
                        v-for="ci in tpl.cells"
                        :key="ci"
                        class="rounded-sm flex flex-col items-stretch justify-center gap-px overflow-hidden p-px"
                        :class="(tpl.cellKinds?.[ci - 1] ?? 'photo') === 'text' ? 'bg-amber-100 border border-amber-200/60' : 'bg-zinc-200'"
                        :style="tpl.areas ? { gridArea: CELL_NAMES[ci - 1] } : {}"
                      >
                        <template v-if="(tpl.cellKinds?.[ci - 1] ?? 'photo') === 'text'">
                          <div class="h-px bg-amber-400/60 rounded-full" />
                          <div class="h-px bg-amber-400/30 rounded-full w-3/4" />
                        </template>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Free text + element list -->
              <div class="px-1.5 border-t pt-2 space-y-1.5">
                <button
                  type="button"
                  class="w-full flex items-center gap-1 py-1.5 rounded-xl border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors justify-center"
                  @click="openAddText"
                >
                  <Type class="w-3 h-3" /> Свободный текст
                </button>
                <div v-if="currentSpread?.textElements.length" class="space-y-1 border-t pt-1.5">
                  <div v-for="t in currentSpread.textElements" :key="t.id" class="flex items-center gap-1 group">
                    <button type="button" class="flex-1 text-[11px] truncate text-left hover:text-primary transition-colors" :style="{ fontFamily: t.fontFamily, color: t.color }" @click="openEditText(t)">
                      {{ t.text }}
                    </button>
                    <button type="button" class="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 transition-all" @click="deleteText(t.id)">
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p class="text-[9px] text-muted-foreground leading-tight">Пустые поля не идут в финал/печать.</p>
              </div>

              <!-- Danger actions -->
              <div class="px-1.5 border-t pt-2 space-y-0.5">
                <button type="button" class="w-full text-[11px] text-muted-foreground hover:text-destructive py-1.5 flex items-center justify-center gap-1 hover:bg-secondary/50 rounded-xl transition-colors" @click="clearCurrentSpread">
                  <X class="w-3 h-3" /> Очистить разворот
                </button>
                <button type="button" class="w-full text-[11px] text-muted-foreground hover:text-destructive py-1.5 flex items-center justify-center gap-1 hover:bg-secondary/50 rounded-xl transition-colors" @click="deleteProject">
                  <Trash2 class="w-3 h-3" /> Удалить проект
                </button>
              </div>
            </div>
          </template>
        </aside>
      </div>
    </template>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- MODALS                                                  -->
    <!-- ════════════════════════════════════════════════════════ -->

    <!-- ░ TUTORIAL MODAL ░ -->
    <Transition name="modal">
      <div v-if="showTutorial" class="fixed inset-0 z-[70] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(4px)">
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b">
            <span class="text-xs text-muted-foreground font-medium">{{ tutorialStep + 1 }} из {{ TUTORIAL_STEPS.length }}</span>
            <div class="flex gap-1">
              <span
                v-for="i in TUTORIAL_STEPS.length"
                :key="i"
                class="w-2 h-2 rounded-full transition-colors"
                :class="i - 1 === tutorialStep ? 'bg-primary' : 'bg-secondary'"
              />
            </div>
            <button type="button" class="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors" @click="closeTutorial">
              <X class="w-4 h-4" />
            </button>
          </div>
          <!-- Content -->
          <div class="px-6 py-6 text-center space-y-3">
            <div class="text-4xl">{{ TUTORIAL_STEPS[tutorialStep].icon }}</div>
            <h3 class="font-bold text-lg">{{ TUTORIAL_STEPS[tutorialStep].title }}</h3>
            <p class="text-muted-foreground text-sm leading-relaxed">{{ TUTORIAL_STEPS[tutorialStep].body }}</p>
          </div>
          <!-- Actions -->
          <div class="flex gap-2 px-5 pb-5">
            <button type="button" class="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-secondary transition-colors" :class="tutorialStep === 0 ? 'opacity-0 pointer-events-none' : ''" @click="tutorialPrev">Назад</button>
            <button type="button" class="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all" @click="tutorialNext">
              {{ tutorialStep < TUTORIAL_STEPS.length - 1 ? 'Далее →' : 'Начать собирать 📖' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ░ UPLOAD PANEL ░ -->
    <Transition name="modal">
      <div v-if="showUploadPanel" class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" style="background: rgba(0,0,0,0.5); backdrop-filter: blur(4px)">
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h3 class="font-bold text-base">Загрузка фото</h3>
              <p class="text-xs text-muted-foreground mt-0.5">{{ uploadDone }} из {{ uploadTotal }} загружено</p>
            </div>
            <button type="button" class="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors" @click="abortUpload">
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Overall progress bar -->
          <div class="px-5 pt-4 pb-2">
            <div class="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{{ uploadOverallProgress }}%</span>
              <span>{{ uploadError > 0 ? `${uploadError} ошибок` : (uploadPaused ? 'Пауза' : 'Загружаю…') }}</span>
            </div>
            <div class="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                class="h-full bg-primary rounded-full transition-all duration-300"
                :style="{ width: uploadOverallProgress + '%' }"
              />
            </div>
          </div>

          <!-- Per-file list -->
          <div class="px-5 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
            <div
              v-for="item in uploadItems"
              :key="item.id"
              class="flex items-center gap-2"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between text-xs mb-0.5">
                  <span class="truncate font-medium">{{ item.file.name }}</span>
                  <span class="shrink-0 ml-2" :class="item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'">
                    {{ item.status === 'done' ? '✓' : item.status === 'error' ? '✗' : item.progress + '%' }}
                  </span>
                </div>
                <div class="h-1 bg-secondary rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="item.status === 'error' ? 'bg-destructive' : item.status === 'done' ? 'bg-green-500' : 'bg-primary'"
                    :style="{ width: item.progress + '%' }"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Controls -->
          <div class="flex gap-2 px-5 pb-5">
            <button
              type="button"
              class="flex-1 py-2 rounded-xl border text-sm font-medium hover:bg-secondary transition-colors"
              @click="uploadPaused = !uploadPaused"
            >{{ uploadPaused ? '▶ Продолжить' : '⏸ Пауза' }}</button>
            <button type="button" class="px-4 py-2 rounded-xl border text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors" @click="abortUpload">Отмена</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ░ CELL PICKER MODAL ░ -->
    <Transition name="modal">
      <div
        v-if="showCellPicker"
        class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
        style="background: rgba(0,0,0,0.5); backdrop-filter: blur(4px)"
        @mousedown.self="showCellPicker = false"
      >
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b">
            <h3 class="font-bold text-base">{{ replacingMode ? 'Заменить фото' : 'Выбрать фото' }}</h3>
            <button type="button" class="p-1 rounded-lg hover:bg-secondary text-muted-foreground" @click="showCellPicker = false">
              <X class="w-4 h-4" />
            </button>
          </div>
          <!-- Upload option -->
          <div class="px-4 pt-3 pb-2">
            <button
              type="button"
              class="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              @click="showCellPicker = false; openFilePicker()"
            >
              <Upload class="w-4 h-4" /> Загрузить с устройства
            </button>
          </div>
          <!-- Photo grid from gallery -->
          <div v-if="photos.length" class="px-4 pb-4">
            <p class="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wide">Из галереи</p>
            <div class="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
              <button
                v-for="photo in sortedPhotos"
                :key="photo.id"
                type="button"
                class="aspect-square rounded-lg overflow-hidden bg-secondary hover:ring-2 hover:ring-primary transition-all"
                @click="onPickerPhotoSelect(photo.id)"
              >
                <img :src="photo.thumbUrl" class="w-full h-full object-cover" />
              </button>
            </div>
          </div>
          <div v-else class="px-4 pb-4 text-center text-sm text-muted-foreground py-3">
            В галерее нет фото. Загрузите с устройства.
          </div>
        </div>
      </div>
    </Transition>

    <!-- ░ AI ASSEMBLY MODAL ░ -->
    <Transition name="modal">
      <div v-if="showAiModal" class="fixed inset-0 z-[70] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(4px)">
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden">
          <div class="px-6 pt-6 pb-4 text-center space-y-4">
            <div class="text-4xl">{{ AI_STAGES[aiStage]?.icon }}</div>
            <h3 class="font-bold text-lg">Собрать с ИИ</h3>

            <!-- Stages list -->
            <div class="space-y-2 text-left">
              <div
                v-for="(stage, i) in AI_STAGES"
                :key="i"
                class="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all"
                :class="i === aiStage ? 'bg-primary/10 text-primary font-semibold' : i < aiStage ? 'text-muted-foreground' : 'text-muted-foreground/40'"
              >
                <span class="text-base">{{ stage.icon }}</span>
                <span class="text-sm">{{ stage.label }}</span>
                <Check v-if="i < aiStage" class="ml-auto w-4 h-4 text-green-500 shrink-0" />
                <Loader2 v-else-if="i === aiStage && aiStage < 3 && !aiError" class="ml-auto w-4 h-4 animate-spin shrink-0" />
              </div>
            </div>

            <!-- Overall progress bar -->
            <div class="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div class="h-full bg-primary rounded-full transition-all duration-500" :style="{ width: AI_STAGES[aiStage]?.pct + '%' }" />
            </div>

            <!-- Error state -->
            <p v-if="aiError" class="text-sm text-destructive font-medium">{{ aiError }}</p>
          </div>
          <div class="px-6 pb-6">
            <button type="button" class="w-full py-2.5 rounded-xl border text-sm font-medium hover:bg-secondary transition-colors" @click="closeAiModal">
              {{ aiError ? 'Закрыть' : 'Отмена' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ░ PHOTO EDIT MODAL ░ -->
    <Transition name="modal">
      <div
        v-if="showPhotoEdit && editCellIndex !== null && placementByCell(editCellIndex)"
        class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
        style="background: rgba(0,0,0,0.55); backdrop-filter: blur(4px)"
        @mousedown.self="applyPhotoEdit"
      >
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden max-h-[95dvh] flex flex-col">
          <div class="shrink-0 flex items-center justify-between px-5 py-4 border-b">
            <h3 class="font-bold text-base">Редактировать фото</h3>
            <button type="button" class="p-1 rounded-lg hover:bg-secondary text-muted-foreground" @click="applyPhotoEdit">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="overflow-y-auto flex-1 min-h-0">
            <!-- Preview with before/after toggle -->
            <div class="px-5 pt-4">
              <div class="w-full aspect-video bg-black rounded-xl overflow-hidden relative">
                <img
                  v-if="editPreviewUrl"
                  :src="editPreviewUrl"
                  class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                  :style="editPreviewStyle"
                />
                <!-- Enhanced badge -->
                <div
                  v-if="currentEditPhoto?.enhancedThumbUrl"
                  class="absolute top-2 right-2 flex gap-1"
                >
                  <button
                    type="button"
                    class="px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all border"
                    :class="!showEnhancedPreview ? 'bg-black/60 text-white border-white/20' : 'bg-black/30 text-white/50 border-transparent'"
                    @click="showEnhancedPreview = false"
                  >До</button>
                  <button
                    type="button"
                    class="px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all border"
                    :class="showEnhancedPreview ? 'bg-primary text-primary-foreground border-primary' : 'bg-black/30 text-white/50 border-transparent'"
                    @click="showEnhancedPreview = true"
                  >После</button>
                </div>
              </div>

              <!-- Photo info -->
              <div v-if="currentEditPhoto && currentEditPhoto.width > 0" class="mt-2 flex gap-3 text-[11px] text-muted-foreground">
                <span>📐 {{ currentEditPhoto.width }}×{{ currentEditPhoto.height }} пикс.</span>
                <span v-if="currentEditPhoto.takenAt">📅 {{ new Date(currentEditPhoto.takenAt).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
                <span class="truncate max-w-[100px]" :title="currentEditPhoto.fileName">📁 {{ currentEditPhoto.fileName }}</span>
              </div>
            </div>

            <!-- Quality indicator -->
            <div class="px-5 mt-3">
              <div v-if="photoQualityLoading" class="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 class="w-3 h-3 animate-spin" /> Оценка качества…
              </div>
              <div v-else-if="photoQuality" class="rounded-xl border p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Качество печати</span>
                  <span class="text-xs font-bold" :class="qualityColorClass">{{ photoQuality.levelLabel }}</span>
                </div>
                <!-- DPI bar -->
                <div class="h-2 bg-secondary rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500" :class="qualityBarClass" :style="{ width: qualityBarWidth }" />
                </div>
                <div class="flex justify-between text-[10px] text-muted-foreground">
                  <span>{{ photoQuality.effectiveDpi }} DPI</span>
                  <span>Рекомендуется 300 DPI</span>
                </div>
                <!-- Dimensions -->
                <div class="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Размер вашего фото: {{ photoQuality.photoPixels.w }}×{{ photoQuality.photoPixels.h }} пикс.</div>
                  <div>Рекомендуется для этой ячейки: {{ photoQuality.requiredPixels.w }}×{{ photoQuality.requiredPixels.h }} пикс. ({{ photoQuality.cellCm.w.toFixed(1) }}×{{ photoQuality.cellCm.h.toFixed(1) }} см)</div>
                </div>
                <!-- Recommendation -->
                <p class="text-[11px] leading-relaxed" :class="qualityColorClass">{{ photoQuality.recommendation }}</p>
              </div>
            </div>

            <!-- Controls -->
            <div class="px-5 py-4 space-y-3">
              <!-- Rotation -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground w-16 shrink-0">Поворот</span>
                <div class="flex gap-1.5">
                  <button type="button" class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs hover:bg-secondary transition-colors" @click="rotateEdit(-90)">
                    <RotateCcw class="w-3.5 h-3.5" /> −90°
                  </button>
                  <button type="button" class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs hover:bg-secondary transition-colors" @click="rotateEdit(90)">
                    <RotateCw class="w-3.5 h-3.5" /> +90°
                  </button>
                </div>
                <span class="text-xs text-muted-foreground ml-auto">{{ editRotation }}°</span>
              </div>

              <!-- Scale -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground w-16 shrink-0">Масштаб</span>
                <input v-model.number="editScale" type="range" min="1" max="2.5" step="0.05" class="flex-1 accent-primary h-1.5" />
                <span class="text-xs text-muted-foreground w-8 text-right shrink-0">{{ editScale.toFixed(1) }}×</span>
              </div>

              <!-- Pan X -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground w-16 shrink-0">Сдвиг ←→</span>
                <input v-model.number="editPanX" type="range" min="0" max="100" step="1" class="flex-1 accent-primary h-1.5" />
              </div>

              <!-- Pan Y -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground w-16 shrink-0">Сдвиг ↑↓</span>
                <input v-model.number="editPanY" type="range" min="0" max="100" step="1" class="flex-1 accent-primary h-1.5" />
              </div>

              <!-- Enhance section -->
              <div class="border-t pt-3 space-y-2">
                <!-- Progress bar (visible during enhancing) -->
                <div v-if="photoEnhancing" class="space-y-1.5">
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="text-muted-foreground">{{ enhanceMessage || 'AI обрабатывает…' }}</span>
                    <span class="text-primary font-semibold">{{ enhanceProgress }}%</span>
                  </div>
                  <div class="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      class="h-full bg-primary rounded-full transition-all duration-500"
                      :style="{ width: enhanceProgress + '%' }"
                    />
                  </div>
                  <p class="text-[9px] text-muted-foreground">
                    Апскейл до {{ photoQuality ? `${photoQuality.requiredPixels.w}×${photoQuality.requiredPixels.h} пикс. (300 DPI)` : '300 DPI для этой ячейки' }}
                    + восстановление лиц. 2–7 мин.
                  </p>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold hover:bg-secondary transition-all disabled:opacity-40"
                    :disabled="photoEnhancing"
                    @click="enhanceCurrentPhoto"
                  >
                    <Loader2 v-if="photoEnhancing" class="w-3.5 h-3.5 animate-spin" />
                    <Sparkles v-else class="w-3.5 h-3.5 text-primary" />
                    {{ photoEnhancing ? 'Идёт улучшение…' : (currentEditPhoto?.enhancedThumbUrl ? 'Улучшить снова' : `AI Улучшить до печати${photoQuality ? ` → ${photoQuality.requiredPixels.w}×${photoQuality.requiredPixels.h}` : ''}`) }}
                  </button>

                  <!-- Apply/revert toggle if enhanced version exists -->
                  <template v-if="currentEditPhoto?.enhancedThumbUrl && !photoEnhancing">
                    <button
                      v-if="!currentEditPhoto?.useEnhanced"
                      type="button"
                      class="flex-1 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all"
                      @click="applyEnhancement(true)"
                    >✓ Применить</button>
                    <button
                      v-else
                      type="button"
                      class="flex-1 py-2 rounded-xl border text-xs font-semibold hover:bg-secondary transition-all"
                      @click="applyEnhancement(false)"
                    >↩ Откатить</button>
                  </template>
                </div>
                <p v-if="!photoEnhancing" class="text-[10px] text-muted-foreground">
                  <template v-if="currentEditPhoto?.enhancedThumbUrl">
                    Улучшенная версия готова. Оригинал сохранён.
                  </template>
                  <template v-else>
                    ИИ апскейлит до 300 DPI для этой ячейки
                    <template v-if="photoQuality"> ({{ photoQuality.requiredPixels.w }}×{{ photoQuality.requiredPixels.h }} пикс.)</template>
                    и восстановит лица. Оригинал не удаляется.
                  </template>
                </p>
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="shrink-0 flex gap-2 px-5 pb-5 pt-2 border-t">
            <button type="button" class="px-3 py-2.5 rounded-xl border text-sm text-muted-foreground hover:bg-secondary transition-colors" @click="replaceInCell">
              <ArrowLeftRight class="w-3.5 h-3.5" />
            </button>
            <button type="button" class="px-3 py-2.5 rounded-xl border text-sm text-destructive hover:bg-destructive/10 transition-colors" @click="removeFromEditCell">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
            <button type="button" class="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all" @click="applyPhotoEdit">
              Применить
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ░ TEXT EDIT MODAL ░ -->
    <Transition name="modal">
      <div
        v-if="showTextEdit"
        class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
        style="background: rgba(0,0,0,0.55); backdrop-filter: blur(4px)"
        @mousedown.self="showTextEdit = false"
      >
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b">
            <h3 class="font-bold text-base">{{ editingTextId ? 'Редактировать подпись' : 'Добавить подпись' }}</h3>
            <button type="button" class="p-1 rounded-lg hover:bg-secondary text-muted-foreground" @click="showTextEdit = false">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="px-5 py-4 space-y-3">
            <!-- Text input -->
            <textarea
              v-model="textEditValue"
              placeholder="Введите текст подписи…"
              rows="2"
              class="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/30 resize-none placeholder:text-muted-foreground"
              :style="{ fontFamily: textEditFont, fontSize: textEditSize + 'px', color: textEditColor }"
              autofocus
            />

            <!-- Size presets -->
            <div>
              <label class="text-xs text-muted-foreground font-medium mb-1.5 block">Размер</label>
              <div class="flex gap-1.5">
                <button
                  v-for="sp in SIZE_PRESETS"
                  :key="sp.label"
                  type="button"
                  class="flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all"
                  :class="textEditSize === sp.px ? 'border-primary bg-primary/5 text-primary' : 'hover:border-primary/40'"
                  @click="textEditSize = sp.px"
                >{{ sp.label }}</button>
              </div>
            </div>

            <!-- Color presets -->
            <div>
              <label class="text-xs text-muted-foreground font-medium mb-1.5 block">Цвет</label>
              <div class="flex items-center gap-1.5">
                <button
                  v-for="cp in COLOR_PRESETS"
                  :key="cp.hex"
                  type="button"
                  class="flex-1 py-1.5 rounded-xl border text-xs transition-all"
                  :class="textEditColor === cp.hex ? 'border-primary bg-primary/5' : 'hover:border-primary/40'"
                  :style="{ color: cp.hex === '#ffffff' ? '#1a1a1a' : cp.hex }"
                  @click="textEditColor = cp.hex"
                >{{ cp.label }}</button>
                <input v-model="textEditColor" type="color" class="w-9 h-8 border rounded cursor-pointer shrink-0" />
              </div>
            </div>

            <!-- Font -->
            <div>
              <label class="text-xs text-muted-foreground font-medium mb-1.5 block">Шрифт</label>
              <select
                v-model="textEditFont"
                class="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option v-for="f in FONTS" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>

            <p class="text-[10px] text-muted-foreground">Пустые подписи и спецсимволы не идут в финальный макет.</p>
          </div>

          <div class="flex gap-2 px-5 pb-5">
            <button
              v-if="editingTextId"
              type="button"
              class="px-3 py-2.5 rounded-xl border text-destructive hover:bg-destructive/10 transition-colors text-sm"
              @click="deleteText(editingTextId); showTextEdit = false"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
            <button type="button" class="flex-1 py-2.5 rounded-xl border text-sm hover:bg-secondary transition-colors" @click="showTextEdit = false">Отмена</button>
            <button type="button" class="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all" @click="saveTextEdit">Сохранить</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
[data-cell-index] { min-height: 0; min-width: 0; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active > div, .modal-leave-active > div { transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
.modal-enter-from > div { transform: translateY(16px) scale(0.97); }
.modal-leave-to > div { transform: translateY(8px) scale(0.98); }
</style>
