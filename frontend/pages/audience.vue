<template>
  <div class="p-6 max-w-6xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900">Аудитории и воронка рекламы</h1>
      <div class="flex gap-3">
        <input v-model="from" type="date" class="input-sm" />
        <input v-model="to" type="date" class="input-sm" />
        <button @click="loadFunnel" class="btn-primary text-sm">Обновить</button>
      </div>
    </div>

    <!-- Funnel -->
    <div class="bg-white rounded-xl border overflow-hidden">
      <div class="px-5 py-4 border-b font-semibold text-gray-800 flex items-center gap-2">
        Воронка
        <span v-if="funnel" class="text-sm font-normal text-gray-500">{{ funnel.total.toLocaleString() }} событий</span>
      </div>
      <div v-if="funnelLoading" class="text-center py-10 text-gray-400">Загрузка...</div>
      <div v-else-if="funnelError" class="px-5 py-4 text-red-600 text-sm">{{ funnelError }}</div>
      <div v-else-if="funnel" class="p-5 space-y-2">
        <div v-for="(s, i) in funnel.stages" :key="s.stage"
          :class="['rounded-lg px-4 py-3 border transition', s.isBiggestDrop ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50']">
          <div class="flex items-center gap-3">
            <!-- Bar -->
            <div class="w-48 bg-gray-200 rounded-full h-3 shrink-0 overflow-hidden">
              <div class="h-3 rounded-full transition-all"
                :class="s.isBiggestDrop ? 'bg-red-400' : 'bg-indigo-500'"
                :style="{ width: (s.convFromTop ?? 0).toFixed(1) + '%' }" />
            </div>
            <!-- Labels -->
            <div class="flex-1 flex items-center gap-4">
              <span :class="stageBadge(s.stage)" class="px-2 py-0.5 rounded text-xs font-semibold w-36 text-center shrink-0">
                {{ stageLabel(s.stage) }}
              </span>
              <span class="font-mono font-bold text-gray-800 w-20 text-right">{{ s.count.toLocaleString() }}</span>
              <span v-if="s.convFromPrev !== null" class="text-sm text-gray-500">
                {{ s.convFromPrev.toFixed(1) }}% от пред.
              </span>
              <span v-if="s.convFromTop !== null" class="text-xs text-gray-400">
                ({{ s.convFromTop.toFixed(1) }}% от старта)
              </span>
              <span v-if="s.isBiggestDrop" class="ml-auto text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded">
                ▼ Главный провал
              </span>
            </div>
          </div>
          <!-- Arrow -->
          <div v-if="i < funnel.stages.length - 1" class="ml-24 mt-1 text-gray-300 text-xs">↓</div>
        </div>
      </div>
    </div>

    <!-- Segments -->
    <div class="bg-white rounded-xl border overflow-hidden">
      <div class="px-5 py-4 border-b font-semibold text-gray-800 flex items-center justify-between">
        Сегменты аудиторий
        <button @click="showCreate = true" class="btn-primary text-sm">+ Создать</button>
      </div>
      <div v-if="segmentsLoading" class="text-center py-10 text-gray-400">Загрузка...</div>
      <div v-else-if="!segments.length" class="text-center py-10 text-gray-400">Нет сегментов</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th class="px-4 py-3 text-left">Ключ / Название</th>
            <th class="px-4 py-3 text-left">Тип</th>
            <th class="px-4 py-3 text-right">Участников</th>
            <th class="px-4 py-3 text-left">VK ID</th>
            <th class="px-4 py-3 text-left">Последний синк</th>
            <th class="px-4 py-3 text-center">Статус</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="seg in segments" :key="seg.id" class="border-t hover:bg-gray-50">
            <td class="px-4 py-3">
              <div class="font-medium text-gray-900">{{ seg.title }}</div>
              <div class="text-xs text-gray-400 font-mono">{{ seg.key }}</div>
            </td>
            <td class="px-4 py-3">
              <span :class="kindBadge(seg.kind)" class="px-2 py-0.5 rounded text-xs font-semibold">{{ seg.kind }}</span>
            </td>
            <td class="px-4 py-3 text-right font-mono">{{ seg.memberCount ?? '—' }}</td>
            <td class="px-4 py-3 text-xs text-gray-500 font-mono">{{ seg.vkSegmentId ?? '—' }}</td>
            <td class="px-4 py-3 text-xs text-gray-500">
              {{ seg.lastSyncedAt ? fmtDate(seg.lastSyncedAt) : '—' }}
            </td>
            <td class="px-4 py-3 text-center">
              <span v-if="seg.lastSync" :class="syncBadge(seg.lastSync.status)" class="px-2 py-0.5 rounded text-xs font-semibold">
                {{ seg.lastSync.status }}
              </span>
              <span v-else class="text-gray-300 text-xs">—</span>
            </td>
            <td class="px-4 py-3 text-right">
              <button @click="sync(seg.id)" :disabled="syncing === seg.id"
                class="text-indigo-600 hover:text-indigo-800 text-xs font-medium disabled:opacity-40">
                {{ syncing === seg.id ? '...' : 'Синх.' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="showCreate = false">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 class="text-lg font-bold">Новый сегмент</h2>
        <div>
          <label class="label">Ключ (уникальный)</label>
          <input v-model="createForm.key" class="input w-full" placeholder="payers" />
        </div>
        <div>
          <label class="label">Название</label>
          <input v-model="createForm.title" class="input w-full" placeholder="Платящие клиенты" />
        </div>
        <div>
          <label class="label">Тип</label>
          <select v-model="createForm.kind" class="input w-full">
            <option value="RETARGET_VK">RETARGET_VK</option>
            <option value="CUSTOM_UPLOAD">CUSTOM_UPLOAD</option>
            <option value="LAL">LAL (похожая аудитория)</option>
          </select>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button @click="showCreate = false" class="btn-ghost text-sm">Отмена</button>
          <button @click="createSegment" :disabled="saving" class="btn-primary text-sm">{{ saving ? '...' : 'Создать' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useNuxtApp } from '#app';

const { $api } = useNuxtApp() as any;

const from = ref('');
const to = ref('');
const funnel = ref<any>(null);
const funnelLoading = ref(false);
const funnelError = ref('');
const segments = ref<any[]>([]);
const segmentsLoading = ref(false);
const syncing = ref<string | null>(null);
const showCreate = ref(false);
const saving = ref(false);
const createForm = ref({ key: '', title: '', kind: 'RETARGET_VK' });

async function loadFunnel() {
  funnelLoading.value = true;
  funnelError.value = '';
  try {
    const params: any = {};
    if (from.value) params.from = from.value;
    if (to.value) params.to = to.value;
    funnel.value = await $api('/api/audience/funnel', { params });
  } catch (e: any) {
    funnelError.value = e?.data?.message ?? e.message ?? 'Ошибка';
  } finally {
    funnelLoading.value = false;
  }
}

async function loadSegments() {
  segmentsLoading.value = true;
  try {
    segments.value = await $api('/api/audience');
  } catch { /* silent */ } finally {
    segmentsLoading.value = false;
  }
}

async function sync(id: string) {
  syncing.value = id;
  try {
    await $api(`/api/audience/${id}/sync`, { method: 'POST' });
    await loadSegments();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка синхронизации');
  } finally {
    syncing.value = null;
  }
}

async function createSegment() {
  saving.value = true;
  try {
    await $api('/api/audience', { method: 'POST', body: createForm.value });
    showCreate.value = false;
    createForm.value = { key: '', title: '', kind: 'RETARGET_VK' };
    await loadSegments();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка создания');
  } finally {
    saving.value = false;
  }
}

function stageLabel(s: string) {
  const m: Record<string, string> = {
    VIDEO_25: 'Видео 25%', VIDEO_50: 'Видео 50%', VIDEO_75: 'Видео 75%', VIDEO_100: 'Видео 100%',
    AD_CLICK: 'Клик по рекламе', DIALOG_ALLOWED: 'Разрешил сообщения',
    FIRST_MESSAGE: 'Первое сообщение', LEAD: 'Заявка', PAYMENT: 'Оплата',
  };
  return m[s] ?? s;
}

function stageBadge(s: string) {
  const m: Record<string, string> = {
    VIDEO_25: 'bg-gray-100 text-gray-600', VIDEO_50: 'bg-gray-100 text-gray-600',
    VIDEO_75: 'bg-blue-100 text-blue-700', VIDEO_100: 'bg-blue-100 text-blue-700',
    AD_CLICK: 'bg-indigo-100 text-indigo-700', DIALOG_ALLOWED: 'bg-purple-100 text-purple-700',
    FIRST_MESSAGE: 'bg-orange-100 text-orange-700', LEAD: 'bg-yellow-100 text-yellow-700',
    PAYMENT: 'bg-green-100 text-green-700',
  };
  return m[s] ?? 'bg-gray-100 text-gray-600';
}

function kindBadge(k: string) {
  return { RETARGET_VK: 'bg-blue-100 text-blue-700', CUSTOM_UPLOAD: 'bg-purple-100 text-purple-700', LAL: 'bg-emerald-100 text-emerald-700' }[k] ?? 'bg-gray-100 text-gray-600';
}

function syncBadge(s: string) {
  return { OK: 'bg-green-100 text-green-700', DRY_RUN: 'bg-gray-100 text-gray-500', ERROR: 'bg-red-100 text-red-600' }[s] ?? 'bg-gray-100 text-gray-600';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

onMounted(() => { loadFunnel(); loadSegments(); });
</script>

<style scoped>
.input-sm { @apply border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500; }
.input { @apply border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500; }
.label { @apply block text-sm font-medium text-gray-700 mb-1; }
.btn-primary { @apply bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition disabled:opacity-50; }
.btn-ghost { @apply text-gray-600 hover:text-gray-900 px-4 py-1.5 rounded-lg hover:bg-gray-100 transition; }
</style>
