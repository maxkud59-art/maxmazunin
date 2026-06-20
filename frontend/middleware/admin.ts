import { useAuthStore } from '~/stores/auth';

export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore();
  if (!auth.isAdmin) return navigateTo('/');
});
