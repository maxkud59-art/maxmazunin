<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useNuxtApp } from '#app';

const props = defineProps<{
  conversationId: string;
}>();

const { $api } = useNuxtApp() as any;

const loading = ref(false);
const coaching = ref(false);
const panel = ref<any>(null);
const actions = ref<any[]>([]);
const slaTrackers = ref<any[]>([]);
const notes = ref<any[]>([]);
const newNote = ref('');
const savingNote = ref(false);
const stageChanging = ref(false);

const LIFECYCLE_STAGES = [
  { value: 'NEW_LEAD', label: 'Новый лид' },
  { value: 'PRICE_SENT', label: 'Цена отправлена' },
  { value: 'OFORMLENO', label: 'Оформлено' },
  { value: 'IN_PRODUCTION', label: 'В производстве' },
  { value: 'READY_TO_SHIP', label: 'Готово к отправке' },
  { value: 'SHIPPED', label: 'Отправлено' },
  { value: 'DELIVERED', label: 'Доставлено' },
  { value: 'OPLACHENO', label: 'Оплачено' },
  { value: 'CLOSED_LOST', label: 'Закрыт (потеря)' },
];

const ACTION_LABELS: Record<string, string> = {
  SUGGEST_REPLY: 'Предложение ответа',
  SUGGEST_STAGE_CHANGE: 'Предложение смены стадии',
  SUGGEST_FOLLOWUP: 'Follow-up',
  RISK_ALERT: 'Риск',
};

async function load() {
  loading.value = true;
  try {
    const [p, a, s, n] = await Promise.all([
      $api(`/api/ai-assistant/conversations/${props.conversationId}/panel`),
      $api(`/api/ai-assistant/conversations/${props.conversationId}/actions`),
      $api(`/api/ai-assistant/conversations/${props.conversationId}/sla`),
      $api(`/api/ai-assistant/conversations/${props.conversationId}/notes`),
    ]);
    panel.value = p;
    actions.value = a;
    slaTrackers.value = s;
    notes.value = n;
  } catch (e: any) {
    console.error('AiAssistantPanel load error', e);
  } finally {
    loading.value = false;
  }
}

async function requestCoach() {
  coaching.value = true;
  try {
    await $api(`/api/ai-assistant/conversations/${props.conversationId}/coach`, { method: 'POST' });
    await load();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка запроса AI-совета');
  } finally {
    coaching.value = false;
  }
}

async function reviewAction(actionId: string, decision: 'APPROVED' | 'REJECTED') {
  try {
    await $api(`/api/ai-assistant/actions/${actionId}/review`, {
      method: 'PATCH',
      body: { decision },
    });
    await load();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка');
  }
}

async function setStage(stage: string) {
  stageChanging.value = true;
  try {
    await $api(`/api/ai-assistant/conversations/${props.conversationId}/stage`, {
      method: 'PATCH',
      body: { stage },
    });
    await load();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка смены стадии');
  } finally {
    stageChanging.value = false;
  }
}

async function addNote() {
  if (!newNote.value.trim()) return;
  savingNote.value = true;
  try {
    await $api(`/api/ai-assistant/conversations/${props.conversationId}/notes`, {
      method: 'POST',
      body: { body: newNote.value },
    });
    newNote.value = '';
    await load();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка сохранения заметки');
  } finally {
    savingNote.value = false;
  }
}

function stageLabel(v: string) {
  return LIFECYCLE_STAGES.find(s => s.value === v)?.label ?? v;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

watch(() => props.conversationId, load, { immediate: false });
onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">Загрузка...</div>

    <template v-else-if="panel">
      <!-- Стадия + SLA -->
      <div class="bg-white rounded-xl border p-4 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="font-semibold text-gray-800">Жизненный цикл</div>
          <div class="flex items-center gap-2 flex-wrap">
            <AiAssistantSlaBadge
              v-for="t in slaTrackers.filter(t => !t.closedAt)"
              :key="t.id"
              :deadlineAt="t.deadlineAt"
              :isBreached="t.isBreached"
              :closedAt="t.closedAt"
            />
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in LIFECYCLE_STAGES"
            :key="s.value"
            :disabled="stageChanging"
            @click="setStage(s.value)"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition',
              panel.lifecycleStage === s.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-400',
            ]"
          >
            {{ s.label }}
          </button>
        </div>

        <p v-if="panel.lifecycleStage" class="text-xs text-gray-500">
          Текущая стадия: <b>{{ stageLabel(panel.lifecycleStage) }}</b>
          <span v-if="panel.assignedManagerId"> · Менеджер: {{ panel.assignedManagerId }}</span>
        </p>
      </div>

      <!-- AI-советы -->
      <div class="bg-white rounded-xl border p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="font-semibold text-gray-800">AI-советы</div>
          <button
            :disabled="coaching"
            @click="requestCoach"
            class="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {{ coaching ? '...' : '✨ Получить совет' }}
          </button>
        </div>

        <div v-if="!actions.length" class="text-sm text-gray-400">
          Нет ожидающих предложений. Нажмите «Получить совет» для анализа диалога.
        </div>

        <div v-for="action in actions" :key="action.id"
          :class="[
            'rounded-lg border p-3 space-y-2',
            action.type === 'RISK_ALERT' ? 'border-red-200 bg-red-50' : 'border-blue-100 bg-blue-50',
          ]"
        >
          <div class="flex items-center justify-between gap-2">
            <span :class="[
              'text-xs font-semibold px-2 py-0.5 rounded',
              action.type === 'RISK_ALERT' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700',
            ]">
              {{ ACTION_LABELS[action.type] ?? action.type }}
            </span>
            <span class="text-xs text-gray-400">{{ fmtDate(action.createdAt) }}</span>
          </div>
          <p class="text-sm text-gray-800">{{ action.payload?.text ?? action.payload?.alert ?? JSON.stringify(action.payload) }}</p>
          <p v-if="action.reasoning" class="text-xs text-gray-500 italic">{{ action.reasoning }}</p>
          <div class="flex gap-2">
            <button
              @click="reviewAction(action.id, 'APPROVED')"
              class="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Принять
            </button>
            <button
              @click="reviewAction(action.id, 'REJECTED')"
              class="px-3 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Отклонить
            </button>
          </div>
        </div>
      </div>

      <!-- Внутренние заметки -->
      <div class="bg-white rounded-xl border p-4 space-y-3">
        <div class="font-semibold text-gray-800">Внутренние заметки</div>

        <div class="flex gap-2">
          <input
            v-model="newNote"
            @keydown.enter.prevent="addNote"
            placeholder="Заметка (только для менеджеров)"
            class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            :disabled="savingNote || !newNote.trim()"
            @click="addNote"
            class="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {{ savingNote ? '...' : 'Добавить' }}
          </button>
        </div>

        <div v-if="!notes.length" class="text-sm text-gray-400">Нет заметок</div>

        <div v-for="note in notes" :key="note.id" class="text-sm border-t pt-2">
          <div class="text-xs text-gray-400 mb-1">{{ fmtDate(note.createdAt) }}</div>
          <p class="text-gray-800 whitespace-pre-wrap">{{ note.body }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
