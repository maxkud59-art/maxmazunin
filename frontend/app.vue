<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
const auth = useAuthStore();
auth.hydrate();
</script>

<template>
  <NuxtPage />
</template>
