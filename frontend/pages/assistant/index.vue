<script setup lang="ts">
import { navigateTo } from '#app';
// Redirect to first tab
await navigateTo('/assistant/clients', { replace: true });
</script>
