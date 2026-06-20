<script setup lang="ts">
import { BookIcon, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-vue-next';
import { useBookLayout, BOOK_SIZES, type BookProjectFull, type LayoutTemplate } from '~/composables/useBookLayout';

// No auth required for share view
const route = useRoute();
const api = useBookLayout();

const project = ref<BookProjectFull | null>(null);
const templates = ref<LayoutTemplate[]>([]);
const currentIndex = ref(0);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const [proj, tpls] = await Promise.all([
      api.getProjectByToken(route.params.token as string),
      api.getTemplates(),
    ]);
    project.value = proj;
    templates.value = tpls;
  } catch {
    error.value = 'Проект не найден или ссылка устарела';
  } finally {
    loading.value = false;
  }
});

const currentSpread = computed(() => project.value?.spreads[currentIndex.value] ?? null);
const currentTemplate = computed(() => templates.value.find((t) => t.id === currentSpread.value?.templateId) ?? null);
const spreadRatio = computed(() => {
  const size = project.value?.size;
  const s = BOOK_SIZES.find((b) => b.value === size);
  return currentSpread.value?.kind === 'COVER' ? (s?.pageRatio ?? 1) : (s?.spreadRatio ?? 2);
});
const cellNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const cellCount = computed(() => currentTemplate.value?.cells ?? 1);
function placementByCell(i: number) {
  return currentSpread.value?.placements.find((p) => p.cellIndex === i) ?? null;
}
function gridStyle() {
  const t = currentTemplate.value;
  if (!t) return {};
  const s: Record<string, string> = {
    display: 'grid',
    'grid-template-columns': t.columns,
    'grid-template-rows': t.rows,
    gap: '3px',
    width: '100%',
    height: '100%',
  };
  if (t.areas) s['grid-template-areas'] = t.areas;
  return s;
}
function cellStyle(i: number) {
  return currentTemplate.value?.areas ? { 'grid-area': cellNames[i] } : {};
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <header class="border-b px-4 py-3 flex items-center gap-3">
      <BookIcon class="w-5 h-5 text-primary" />
      <h1 class="font-bold">{{ project?.title ?? 'Макет книги' }}</h1>
      <span v-if="project?.orderNumber" class="text-xs text-muted-foreground ml-auto">Заказ: {{ project.orderNumber }}</span>
      <span v-if="project?.size" class="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full ml-auto">
        {{ BOOK_SIZES.find((b) => b.value === project!.size)?.label }}
      </span>
    </header>

    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
    <div v-else-if="error" class="flex-1 flex items-center justify-center text-muted-foreground">{{ error }}</div>

    <main v-else class="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <!-- Navigation -->
      <div class="flex items-center gap-3">
        <button class="p-1.5 rounded-full hover:bg-secondary disabled:opacity-30 transition-colors" :disabled="currentIndex === 0" @click="currentIndex--">
          <ChevronLeft class="w-5 h-5" />
        </button>
        <span class="text-sm font-medium text-muted-foreground">
          {{ currentSpread?.kind === 'COVER' ? '📖 Обложка' : `Разворот ${currentIndex}/${(project?.spreads.length ?? 1) - 1}` }}
        </span>
        <button class="p-1.5 rounded-full hover:bg-secondary disabled:opacity-30 transition-colors" :disabled="currentIndex >= (project?.spreads.length ?? 1) - 1" @click="currentIndex++">
          <ChevronRight class="w-5 h-5" />
        </button>
      </div>

      <!-- Canvas (read-only) -->
      <div class="relative bg-white shadow-xl rounded-sm overflow-hidden w-full" style="max-width: min(680px, 100%)" :style="{ aspectRatio: String(spreadRatio) }">
        <div class="absolute inset-0" :style="gridStyle()">
          <div
            v-for="i in cellCount"
            :key="i - 1"
            class="relative overflow-hidden"
            :class="placementByCell(i - 1) ? '' : 'bg-gray-100'"
            :style="cellStyle(i - 1)"
          >
            <img v-if="placementByCell(i - 1)" :src="placementByCell(i - 1)!.photo.thumbUrl" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center text-gray-300">
              <ImageIcon class="w-8 h-8" />
            </div>
          </div>
        </div>
        <!-- Text elements -->
        <div
          v-for="text in (currentSpread?.textElements ?? [])"
          :key="text.id"
          class="absolute pointer-events-none"
          :style="{ left: text.x + '%', top: text.y + '%', fontSize: text.fontSize + 'px', fontFamily: text.fontFamily, color: text.color }"
        >
          {{ text.text }}
        </div>
      </div>

      <!-- Spread thumbnails -->
      <div class="flex items-center gap-2 flex-wrap justify-center">
        <button
          v-for="(s, i) in (project?.spreads ?? [])"
          :key="s.id"
          class="px-2.5 py-1 rounded-xl text-xs font-medium transition-all"
          :class="currentIndex === i ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'"
          @click="currentIndex = i"
        >
          {{ s.kind === 'COVER' ? 'Обл.' : i }}
        </button>
      </div>
    </main>
  </div>
</template>
