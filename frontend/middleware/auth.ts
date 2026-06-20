import { useAuthStore } from '~/stores/auth';

export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore();
  auth.hydrate();
  if (!auth.token) return navigateTo('/login');
});
