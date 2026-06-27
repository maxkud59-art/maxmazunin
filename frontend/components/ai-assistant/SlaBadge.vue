<script setup lang="ts">
const props = defineProps<{
  deadlineAt: string;
  isBreached: boolean;
  closedAt?: string | null;
}>();

const label = computed(() => {
  if (props.closedAt) return 'Закрыт';
  if (props.isBreached) return 'Просрочен';
  const diff = new Date(props.deadlineAt).getTime() - Date.now();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 0) return 'Просрочен';
  if (hours < 1) return `< 1 ч`;
  return `${hours} ч`;
});

const cls = computed(() => {
  if (props.closedAt) return 'bg-gray-100 text-gray-500';
  if (props.isBreached) return 'bg-red-100 text-red-700 animate-pulse';
  const diff = new Date(props.deadlineAt).getTime() - Date.now();
  const hours = diff / 3600_000;
  if (hours < 2) return 'bg-orange-100 text-orange-700';
  return 'bg-green-100 text-green-700';
});
</script>

<template>
  <span :class="['px-2 py-0.5 rounded text-xs font-semibold', cls]">
    SLA {{ label }}
  </span>
</template>
