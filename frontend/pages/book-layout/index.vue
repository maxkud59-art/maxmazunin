<script setup lang="ts">
import { BookIcon, Plus, Trash2, ExternalLink, ArrowLeft, Check } from 'lucide-vue-next';
import { useBookLayout, BOOK_SIZES, type BookProjectSummary } from '~/composables/useBookLayout';

definePageMeta({ middleware: ['auth'] });

const api = useBookLayout();

const projects = ref<BookProjectSummary[]>([]);
const loading = ref(true);
const loadError = ref('');
const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');

const newTitle = ref('');
const newSize = ref<string>('S20x20');
const newMode = ref<'manual' | 'ai'>('manual');

onMounted(loadProjects);

async function loadProjects() {
  loading.value = true;
  loadError.value = '';
  try {
    projects.value = await api.listProjects();
  } catch (e: any) {
    loadError.value = e?.data?.message ?? 'Не удалось загрузить проекты';
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  newTitle.value = '';
  newSize.value = 'S20x20';
  newMode.value = 'manual';
  createError.value = '';
  showCreate.value = true;
}

async function createProject() {
  if (!newTitle.value.trim()) { createError.value = 'Введите название'; return; }
  creating.value = true;
  createError.value = '';
  try {
    const proj = await api.createProject(newTitle.value.trim(), newSize.value);
    const query = newMode.value === 'ai' ? '?ai=1' : '';
    await navigateTo(`/book-layout/${proj.id}${query}`);
  } catch (e: any) {
    createError.value = e?.data?.message ?? 'Ошибка создания';
    creating.value = false;
  }
}

async function deleteProject(id: string, title: string, ev: MouseEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!confirm(`Удалить проект «${title}»?`)) return;
  try {
    await api.deleteProject(id);
    projects.value = projects.value.filter((p) => p.id !== id);
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка удаления');
  }
}

function copyLink(token: string, ev: MouseEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  const url = `${window.location.origin}/book-layout/share/${token}`;
  navigator.clipboard?.writeText(url).then(() => alert('Ссылка скопирована'));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' });
}

const sizeLabel = (s: string) => BOOK_SIZES.find((b) => b.value === s)?.label ?? s;
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="border-b px-4 py-3 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="max-w-5xl mx-auto flex items-center gap-3">
        <NuxtLink to="/" class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft class="w-4 h-4" />
          <span class="hidden sm:inline">Кабинет</span>
        </NuxtLink>
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <BookIcon class="w-5 h-5 text-primary shrink-0" />
          <h1 class="font-bold text-lg tracking-tight truncate">Авто-макет книг</h1>
        </div>
        <button
          type="button"
          class="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-sm font-medium hover:opacity-90 active:scale-95 transition-all shadow-sm shrink-0"
          @click="openCreate"
        >
          <Plus class="w-4 h-4" />
          Создать
        </button>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-8">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-16">
        <div class="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="text-center py-16 space-y-4">
        <p class="text-destructive">{{ loadError }}</p>
        <button class="px-4 py-2 rounded-xl border hover:bg-secondary transition-colors text-sm" @click="loadProjects">Повторить</button>
      </div>

      <!-- Empty state -->
      <div v-else-if="!projects.length" class="text-center py-20">
        <div class="text-6xl mb-4 opacity-30">📖</div>
        <h2 class="text-xl font-semibold mb-2">Нет проектов</h2>
        <p class="text-muted-foreground mb-6 text-sm">Создайте первый макет фотокниги</p>
        <button
          type="button"
          class="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:opacity-90 transition-all mx-auto"
          @click="openCreate"
        >
          <Plus class="w-4 h-4" />
          Создать проект
        </button>
      </div>

      <!-- Project grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="proj in projects"
          :key="proj.id"
          class="bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group"
        >
          <NuxtLink :to="`/book-layout/${proj.id}`" class="block">
            <div class="bg-gradient-to-br from-secondary to-secondary/40 aspect-video flex items-center justify-center relative overflow-hidden">
              <img
                v-if="proj.coverThumbUrl"
                :src="proj.coverThumbUrl"
                class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }"
              />
              <BookIcon v-else class="w-12 h-12 text-muted-foreground/30" />
              <span class="absolute bottom-2 right-2 text-xs bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded-full font-medium">
                {{ sizeLabel(proj.size) }}
              </span>
            </div>
          </NuxtLink>

          <div class="p-4">
            <div class="flex items-start justify-between gap-2 mb-1">
              <NuxtLink :to="`/book-layout/${proj.id}`" class="font-semibold text-sm hover:text-primary transition-colors line-clamp-2 leading-tight flex-1 min-w-0">
                {{ proj.title }}
              </NuxtLink>
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 -m-1 opacity-0 group-hover:opacity-100"
                title="Удалить"
                @click="deleteProject(proj.id, proj.title, $event)"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>

            <div class="text-xs text-muted-foreground space-y-0.5 mt-1.5">
              <div>{{ proj._count.photos }} фото · {{ proj._count.spreads }} разворотов</div>
              <div v-if="proj.orderNumber" class="font-medium text-foreground">Заказ: {{ proj.orderNumber }}</div>
              <div>{{ formatDate(proj.updatedAt) }}</div>
            </div>

            <div class="flex items-center gap-2 mt-3">
              <NuxtLink
                :to="`/book-layout/${proj.id}`"
                class="flex-1 text-center py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all"
              >
                Открыть →
              </NuxtLink>
              <button
                type="button"
                class="p-2 rounded-xl border hover:bg-secondary transition-colors text-muted-foreground"
                title="Скопировать ссылку"
                @click="copyLink(proj.shareToken, $event)"
              >
                <ExternalLink class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Create modal -->
    <Transition name="modal">
      <div
        v-if="showCreate"
        class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
        style="background: rgba(0,0,0,0.55); backdrop-filter: blur(4px)"
        @mousedown.self="showCreate = false"
      >
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b">
            <h2 class="font-bold text-base">Новый проект</h2>
            <button type="button" class="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground" @click="showCreate = false">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M13 1L1 13M1 1l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>

          <div class="p-5 space-y-4">
            <div>
              <label class="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Название</label>
              <input
                v-model="newTitle"
                placeholder="Например: Свадьба 2025"
                class="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 placeholder:text-muted-foreground transition-all"
                autofocus
                @keydown.enter="createProject"
              />
            </div>

            <div>
              <label class="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Размер книги</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="size in BOOK_SIZES"
                  :key="size.value"
                  type="button"
                  class="relative px-3 py-3 rounded-xl border-2 text-left transition-all"
                  :class="newSize === size.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-secondary/50'"
                  @click.stop="newSize = size.value"
                >
                  <Check
                    v-if="newSize === size.value"
                    class="absolute top-2 right-2 w-3.5 h-3.5 text-primary"
                  />
                  <div class="font-bold text-sm" :class="newSize === size.value ? 'text-foreground' : 'text-foreground/80'">
                    {{ size.value.replace('S', '').replace('x', '×') }}
                  </div>
                  <div class="text-[11px] text-muted-foreground mt-0.5">
                    {{ size.label.includes('(') ? size.label.split('(')[1].replace(')', '') : '' }}
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label class="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Способ сборки</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="relative px-3 py-3 rounded-xl border-2 text-left transition-all"
                  :class="newMode === 'manual'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-secondary/50'"
                  @click="newMode = 'manual'"
                >
                  <Check v-if="newMode === 'manual'" class="absolute top-2 right-2 w-3.5 h-3.5 text-primary" />
                  <div class="font-bold text-sm">✋ Вручную</div>
                  <div class="text-[11px] text-muted-foreground mt-0.5">Сам расставлю фото</div>
                </button>
                <button
                  type="button"
                  class="relative px-3 py-3 rounded-xl border-2 text-left transition-all"
                  :class="newMode === 'ai'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-secondary/50'"
                  @click="newMode = 'ai'"
                >
                  <Check v-if="newMode === 'ai'" class="absolute top-2 right-2 w-3.5 h-3.5 text-primary" />
                  <div class="font-bold text-sm">✨ С ИИ</div>
                  <div class="text-[11px] text-muted-foreground mt-0.5">Авто-расстановка</div>
                </button>
              </div>
            </div>

            <p v-if="createError" class="text-sm text-destructive font-medium">{{ createError }}</p>
          </div>

          <div class="flex gap-2 px-5 pb-5">
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-secondary transition-colors"
              @click="showCreate = false"
            >
              Отмена
            </button>
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
              :disabled="creating || !newTitle.trim()"
              @click="createProject"
            >
              {{ creating ? 'Создаём…' : (newMode === 'ai' ? 'Создать и собрать →' : 'Создать') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active > div, .modal-leave-active > div { transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
.modal-enter-from > div { transform: translateY(20px) scale(0.96); }
.modal-leave-to > div { transform: translateY(8px) scale(0.97); }
</style>
