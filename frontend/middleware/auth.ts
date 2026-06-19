export default defineNuxtRouteMiddleware(() => {
  if (process.server) return;
  const token = localStorage.getItem('auth_token');
  if (!token) return navigateTo('/login');
});
