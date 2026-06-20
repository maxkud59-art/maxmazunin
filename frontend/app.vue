<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
const auth = useAuthStore();
auth.hydrate();

// When a JS chunk is 404 (stale cache after deploy), force a full reload once.
// Without this, users get a white screen after deploys.
if (import.meta.client) {
  useRouter().onError((err) => {
    const isChunkError = err?.message && (
      err.message.includes('Failed to fetch') ||
      err.message.includes('Loading chunk') ||
      err.message.includes('Importing a module script failed') ||
      err.message.includes('Unable to preload CSS')
    );
    if (isChunkError && !sessionStorage.getItem('chunk_reload')) {
      sessionStorage.setItem('chunk_reload', '1');
      window.location.reload();
    }
  });
}
</script>

<template>
  <NuxtPage />
</template>
