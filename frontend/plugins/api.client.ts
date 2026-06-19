import { apiInstance } from '~/composables/useApi';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  apiInstance.defaults.baseURL = config.public.apiBase as string;
});
