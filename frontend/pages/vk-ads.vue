<script setup lang="ts">
import { Bar } from 'vue-chartjs';
import { getVkAds } from '~/app/api/generated/vk-ads/vk-ads';
import type { HourlyStatDto, HourProfileItemDto, VkCabinetDto } from '~/app/api/generated/maxmazuninRuPersonalCabinetAPI.schemas';

definePageMeta({ middleware: ['auth'] });

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function todayMsk(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}
function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null) return '—';
  return n.toFixed(digits);
}
function padHour(h: number): string {
  return String(h).padStart(2, '0') + ':00';
}

// ─── Состояние ────────────────────────────────────────────────────────────────

const { vkAdsControllerGetCabinets, vkAdsControllerGetHourly, vkAdsControllerGetHourProfile, vkAdsControllerPoll } = getVkAds();

const cabinets = ref<VkCabinetDto[]>([]);
const selectedCabinetId = ref<string>('');
const selectedDate = ref<string>(todayMsk());

const hourly = ref<HourlyStatDto[]>([]);
const hourlyLoading = ref(false);

// Профиль: 30 дней назад до вчера
const profileFrom = ref<string>(
  new Date(Date.now() + 3 * 3_600_000 - 30 * 86_400_000).toISOString().slice(0, 10),
);
const profileTo = ref<string>(
  new Date(Date.now() + 3 * 3_600_000 - 86_400_000).toISOString().slice(0, 10),
);
const profile = ref<HourProfileItemDto[]>([]);
const profileLoading = ref(false);

const polling = ref(false);
const pollMsg = ref('');

// ─── Загрузка данных ──────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    cabinets.value = await vkAdsControllerGetCabinets();
    const active = cabinets.value.find((c) => c.isActive) ?? cabinets.value[0];
    if (active) selectedCabinetId.value = active.id ?? '';
  } catch (e: any) {
    console.error('Cabinets load error:', e);
  }
  await loadHourly();
  await loadProfile();
});

watch([selectedCabinetId, selectedDate], () => loadHourly());
watch([selectedCabinetId, profileFrom, profileTo], () => loadProfile());

async function loadHourly() {
  if (!selectedCabinetId.value) return;
  hourlyLoading.value = true;
  try {
    hourly.value = await vkAdsControllerGetHourly({ cabinetId: selectedCabinetId.value, date: selectedDate.value });
  } catch (e) {
    console.error('Hourly load error:', e);
  } finally {
    hourlyLoading.value = false;
  }
}

async function loadProfile() {
  if (!selectedCabinetId.value) return;
  profileLoading.value = true;
  try {
    profile.value = await vkAdsControllerGetHourProfile({ cabinetId: selectedCabinetId.value, from: profileFrom.value, to: profileTo.value });
  } catch (e) {
    console.error('Profile load error:', e);
  } finally {
    profileLoading.value = false;
  }
}

async function doPoll() {
  polling.value = true;
  pollMsg.value = '';
  try {
    const results = await vkAdsControllerPoll();
    const total = results.reduce((s, r) => s + (r.snapshots ?? 0), 0);
    pollMsg.value = `Готово: ${total} снимков`;
    await loadHourly();
    await loadProfile();
  } catch (e: any) {
    pollMsg.value = `Ошибка: ${e.message}`;
  } finally {
    polling.value = false;
  }
}

// ─── Производные ─────────────────────────────────────────────────────────────

const cheapestHourIndex = computed(() => {
  const data = hourly.value.filter((h) => h.hasData && (h.cpl ?? 0) > 0);
  if (!data.length) return -1;
  const min = Math.min(...data.map((h) => h.cpl!));
  return hourly.value.findIndex((h) => h.cpl === min && h.hasData);
});

const hourlyChartData = computed(() => ({
  labels: hourly.value.map((h) => padHour(h.hourMsk ?? 0)),
  datasets: [
    {
      label: 'CPL ₽',
      data: hourly.value.map((h) => (h.hasData && h.cpl != null ? +h.cpl.toFixed(2) : null)),
      backgroundColor: hourly.value.map((_, i) =>
        i === cheapestHourIndex.value ? '#16a34a' : 'rgba(99,102,241,0.7)',
      ),
      borderRadius: 4,
    },
  ],
}));

const profileCheapestIndex = computed(() => {
  const data = profile.value.filter((p) => (p.avgCpl ?? 0) > 0);
  if (!data.length) return -1;
  const min = Math.min(...data.map((p) => p.avgCpl!));
  return profile.value.findIndex((p) => p.avgCpl === min);
});

const profileChartData = computed(() => ({
  labels: profile.value.map((p) => padHour(p.hourMsk ?? 0)),
  datasets: [
    {
      label: 'Avg CPL ₽',
      data: profile.value.map((p) => (p.avgCpl != null ? +p.avgCpl.toFixed(2) : null)),
      backgroundColor: profile.value.map((_, i) =>
        i === profileCheapestIndex.value ? '#16a34a' : 'rgba(251,146,60,0.7)',
      ),
      borderRadius: 4,
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true } },
} as const;
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="border-b px-6 py-4 flex items-center gap-4">
      <NuxtLink to="/" class="text-sm text-muted-foreground hover:underline">← Кабинет</NuxtLink>
      <span class="font-bold text-lg">VK Ads</span>
      <span class="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">аналитика</span>
    </header>

    <main class="max-w-5xl mx-auto px-6 py-8 space-y-10">

      <!-- Фильтры -->
      <div class="flex flex-wrap gap-4 items-end">
        <div>
          <label class="text-xs text-muted-foreground block mb-1">Кабинет</label>
          <select v-model="selectedCabinetId" class="border rounded px-3 py-1.5 text-sm bg-background">
            <option v-for="c in cabinets" :key="c.id" :value="c.id">
              {{ c.title }}{{ c.isActive ? ' ✓' : '' }}
            </option>
          </select>
        </div>

        <div>
          <label class="text-xs text-muted-foreground block mb-1">Дата (МСК)</label>
          <input v-model="selectedDate" type="date" class="border rounded px-3 py-1.5 text-sm bg-background" />
        </div>

        <button
          class="px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
          :disabled="polling"
          @click="doPoll"
        >
          {{ polling ? 'Сбор данных…' : '↻ Обновить сейчас' }}
        </button>
        <span v-if="pollMsg" class="text-xs text-muted-foreground">{{ pollMsg }}</span>
      </div>

      <!-- Сегодня по часам: таблица -->
      <section>
        <h2 class="text-lg font-semibold mb-4">
          Сегодня по часам
          <span v-if="hourlyLoading" class="text-xs text-muted-foreground font-normal ml-2">загрузка…</span>
        </h2>

        <div class="overflow-x-auto rounded-xl border">
          <table class="w-full text-sm">
            <thead class="bg-muted text-muted-foreground">
              <tr>
                <th class="text-left px-3 py-2 font-medium">Час МСК</th>
                <th class="text-right px-3 py-2 font-medium">Показы</th>
                <th class="text-right px-3 py-2 font-medium">Клики</th>
                <th class="text-right px-3 py-2 font-medium">Расход ₽</th>
                <th class="text-right px-3 py-2 font-medium">Лиды</th>
                <th class="text-right px-3 py-2 font-medium">CPL ₽</th>
                <th class="text-right px-3 py-2 font-medium">CPM ₽</th>
                <th class="text-right px-3 py-2 font-medium">CPC ₽</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in hourly"
                :key="row.hourStartUtc"
                class="border-t"
                :class="{
                  'bg-green-50 font-semibold': i === cheapestHourIndex,
                  'opacity-40': !row.hasData,
                  'italic text-muted-foreground': row.isPreliminary,
                }"
              >
                <td class="px-3 py-1.5">
                  {{ padHour(row.hourMsk ?? 0) }}
                  <span v-if="row.isPreliminary" class="text-xs text-amber-500 ml-1">~</span>
                  <span v-if="i === cheapestHourIndex" class="text-xs text-green-600 ml-1">★ дешевле</span>
                </td>
                <td class="text-right px-3 py-1.5">{{ row.hasData ? row.impressionsDelta?.toLocaleString('ru') : '—' }}</td>
                <td class="text-right px-3 py-1.5">{{ row.hasData ? row.clicksDelta?.toLocaleString('ru') : '—' }}</td>
                <td class="text-right px-3 py-1.5">{{ row.hasData ? fmt(row.spendDelta) : '—' }}</td>
                <td class="text-right px-3 py-1.5">{{ row.hasData ? row.leadsDelta : '—' }}</td>
                <td class="text-right px-3 py-1.5">{{ row.hasData ? fmt(row.cpl) : '—' }}</td>
                <td class="text-right px-3 py-1.5">{{ row.hasData ? fmt(row.cpm) : '—' }}</td>
                <td class="text-right px-3 py-1.5">{{ row.hasData ? fmt(row.cpc) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="text-xs text-muted-foreground mt-2">~ предварительные данные (VK корректирует последние 2 ч)</p>
      </section>

      <!-- Сегодня по часам: график CPL -->
      <section>
        <h2 class="text-lg font-semibold mb-4">CPL по часам МСК</h2>
        <ClientOnly>
          <div style="height:280px">
            <Bar :data="hourlyChartData" :options="chartOptions" />
          </div>
          <template #fallback><div class="h-64 bg-muted rounded animate-pulse" /></template>
        </ClientOnly>
        <p class="text-xs text-green-600 mt-1" v-if="cheapestHourIndex >= 0">
          Самый дешёвый час: {{ padHour(hourly[cheapestHourIndex]?.hourMsk ?? 0) }} —
          CPL {{ fmt(hourly[cheapestHourIndex]?.cpl) }} ₽
        </p>
      </section>

      <!-- Профиль часа суток -->
      <section>
        <div class="flex flex-wrap gap-4 items-end mb-4">
          <h2 class="text-lg font-semibold">Профиль часа суток</h2>
          <div>
            <label class="text-xs text-muted-foreground block mb-1">С (МСК)</label>
            <input v-model="profileFrom" type="date" class="border rounded px-3 py-1.5 text-sm bg-background" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground block mb-1">По (МСК)</label>
            <input v-model="profileTo" type="date" class="border rounded px-3 py-1.5 text-sm bg-background" />
          </div>
          <span v-if="profileLoading" class="text-xs text-muted-foreground">загрузка…</span>
        </div>

        <ClientOnly>
          <div style="height:280px">
            <Bar :data="profileChartData" :options="chartOptions" />
          </div>
          <template #fallback><div class="h-64 bg-muted rounded animate-pulse" /></template>
        </ClientOnly>
        <p class="text-xs text-green-600 mt-1" v-if="profileCheapestIndex >= 0">
          Оптимальный час: {{ padHour(profile[profileCheapestIndex]?.hourMsk ?? 0) }} —
          средний CPL {{ fmt(profile[profileCheapestIndex]?.avgCpl) }} ₽
          ({{ profile[profileCheapestIndex]?.daysCount }} дней данных)
        </p>

        <!-- Таблица профиля -->
        <div class="overflow-x-auto rounded-xl border mt-6">
          <table class="w-full text-sm">
            <thead class="bg-muted text-muted-foreground">
              <tr>
                <th class="text-left px-3 py-2 font-medium">Час МСК</th>
                <th class="text-right px-3 py-2 font-medium">Дней</th>
                <th class="text-right px-3 py-2 font-medium">Расход ₽</th>
                <th class="text-right px-3 py-2 font-medium">Лиды</th>
                <th class="text-right px-3 py-2 font-medium">Avg CPL ₽</th>
                <th class="text-right px-3 py-2 font-medium">Avg CPM ₽</th>
                <th class="text-right px-3 py-2 font-medium">Avg CPC ₽</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in profile"
                :key="row.hourMsk"
                class="border-t"
                :class="{ 'bg-green-50 font-semibold': i === profileCheapestIndex }"
              >
                <td class="px-3 py-1.5">
                  {{ padHour(row.hourMsk ?? 0) }}
                  <span v-if="i === profileCheapestIndex" class="text-xs text-green-600 ml-1">★</span>
                </td>
                <td class="text-right px-3 py-1.5">{{ row.daysCount }}</td>
                <td class="text-right px-3 py-1.5">{{ fmt(row.totalSpend) }}</td>
                <td class="text-right px-3 py-1.5">{{ row.totalLeads }}</td>
                <td class="text-right px-3 py-1.5">{{ fmt(row.avgCpl) }}</td>
                <td class="text-right px-3 py-1.5">{{ fmt(row.avgCpm) }}</td>
                <td class="text-right px-3 py-1.5">{{ fmt(row.avgCpc) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>
