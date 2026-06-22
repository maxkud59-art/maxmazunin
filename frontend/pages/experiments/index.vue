<template>
  <div class="p-6 max-w-5xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900">A/B Эксперименты</h1>
      <button @click="showCreate = true" class="btn-primary text-sm">+ Новый эксперимент</button>
    </div>

    <div v-if="loading" class="text-center py-16 text-gray-500">Загрузка...</div>
    <div v-else-if="error" class="text-red-600 py-8">{{ error }}</div>

    <div v-else class="space-y-3">
      <div v-if="!experiments.length" class="text-center py-16 text-gray-400">Нет экспериментов</div>
      <div v-for="exp in experiments" :key="exp.id"
        class="bg-white border rounded-xl p-5 hover:shadow-sm transition cursor-pointer"
        @click="navigateTo(`/experiments/${exp.id}`)">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-gray-900">{{ exp.name }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ exp.stageFrom }} → {{ exp.stageTo }}</div>
          </div>
          <span :class="statusBadge(exp.status)" class="px-3 py-1 rounded-full text-xs font-semibold">
            {{ statusLabel(exp.status) }}
          </span>
        </div>
        <div class="flex gap-4 mt-3 text-sm text-gray-500">
          <span>{{ exp.variants.length }} варианта</span>
          <span>Созрев.: {{ exp.maturationDays }} дн.</span>
          <span>Мин. выборка: {{ exp.minSamplePerVariant }}</span>
          <span>p &lt; {{ exp.pThreshold }}</span>
        </div>
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="showCreate = false">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 class="text-lg font-bold">Новый эксперимент</h2>
        <div>
          <label class="label">Название</label>
          <input v-model="form.name" class="input w-full" placeholder="Скрипт A vs B" />
        </div>
        <div>
          <label class="label">Гипотеза</label>
          <input v-model="form.hypothesis" class="input w-full" placeholder="Скрипт B даст +15% конверсии" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Этап from</label>
            <select v-model="form.stageFrom" class="input w-full">
              <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div>
            <label class="label">Этап to</label>
            <select v-model="form.stageTo" class="input w-full">
              <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="label">Созревание, дней</label>
            <input v-model.number="form.maturationDays" type="number" class="input w-full" />
          </div>
          <div>
            <label class="label">Мин. выборка</label>
            <input v-model.number="form.minSamplePerVariant" type="number" class="input w-full" />
          </div>
          <div>
            <label class="label">p-value &lt;</label>
            <input v-model.number="form.pThreshold" type="number" step="0.01" class="input w-full" />
          </div>
        </div>
        <div>
          <label class="label">Варианты</label>
          <div v-for="(v, i) in form.variants" :key="i" class="flex gap-2 mb-2">
            <input v-model="v.name" class="input flex-1" :placeholder="i === 0 ? 'Control' : 'Вариант ' + (i + 1)" />
            <input v-model="v.scriptRef" class="input w-32" placeholder="script-ref" />
            <label class="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
              <input type="checkbox" v-model="v.isControl" @change="setControl(i)" /> контроль
            </label>
            <button v-if="form.variants.length > 2" @click="form.variants.splice(i, 1)" class="text-red-500 text-sm">✕</button>
          </div>
          <button @click="form.variants.push({ name: '', scriptRef: '', isControl: false })" class="text-indigo-600 text-sm">+ Вариант</button>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button @click="showCreate = false" class="btn-ghost text-sm">Отмена</button>
          <button @click="createExp" :disabled="saving" class="btn-primary text-sm">{{ saving ? '...' : 'Создать' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useNuxtApp, navigateTo } from '#app';

const { $api } = useNuxtApp() as any;

const loading = ref(false);
const error = ref('');
const experiments = ref<any[]>([]);
const showCreate = ref(false);
const saving = ref(false);

const stages = ['CONTACT', 'REPLIED', 'PRICE_SHOWN', 'OBJECTION', 'REBUTTAL', 'ORDERED', 'PREPAID', 'PAID_FULL'];

const form = ref({
  name: '',
  hypothesis: '',
  stageFrom: 'PRICE_SHOWN',
  stageTo: 'PAID_FULL',
  maturationDays: 7,
  minSamplePerVariant: 100,
  pThreshold: 0.05,
  variants: [
    { name: 'Control', scriptRef: '', isControl: true },
    { name: 'Вариант B', scriptRef: '', isControl: false },
  ],
});

function setControl(idx: number) {
  form.value.variants.forEach((v, i) => { v.isControl = i === idx; });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    experiments.value = await $api('/api/experiments');
  } catch (e: any) {
    error.value = e?.data?.message ?? e.message ?? 'Ошибка';
  } finally {
    loading.value = false;
  }
}

async function createExp() {
  saving.value = true;
  try {
    await $api('/api/experiments', { method: 'POST', body: form.value });
    showCreate.value = false;
    await load();
    form.value = { name: '', hypothesis: '', stageFrom: 'PRICE_SHOWN', stageTo: 'PAID_FULL', maturationDays: 7, minSamplePerVariant: 100, pThreshold: 0.05, variants: [{ name: 'Control', scriptRef: '', isControl: true }, { name: 'Вариант B', scriptRef: '', isControl: false }] };
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка создания');
  } finally {
    saving.value = false;
  }
}

function statusBadge(s: string) {
  return { DRAFT: 'bg-gray-100 text-gray-600', RUNNING: 'bg-blue-100 text-blue-700', STOPPED: 'bg-red-100 text-red-600', DECIDED: 'bg-green-100 text-green-700' }[s] ?? 'bg-gray-100 text-gray-600';
}
function statusLabel(s: string) {
  return { DRAFT: 'Черновик', RUNNING: 'Запущен', STOPPED: 'Остановлен', DECIDED: 'Решение принято' }[s] ?? s;
}

onMounted(load);
</script>

<style scoped>
.label { @apply block text-sm font-medium text-gray-700 mb-1; }
.input { @apply border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500; }
.btn-primary { @apply bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition disabled:opacity-50; }
.btn-ghost { @apply text-gray-600 hover:text-gray-900 px-4 py-1.5 rounded-lg hover:bg-gray-100 transition; }
</style>
