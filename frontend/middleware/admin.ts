import { useAuthStore } from '~/stores/auth';

export default defineNuxtRouteMiddleware(() => {
  if (process.server) return;
  const auth = useAuthStore();
  if (!auth.isAdmin) return navigateTo('/');
});
