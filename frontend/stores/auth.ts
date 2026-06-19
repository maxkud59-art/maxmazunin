import { defineStore } from 'pinia';

interface Me { id: string; email: string; role: 'ADMIN' | 'USER' }

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null as string | null,
    user: null as Me | null,
  }),

  getters: {
    isAuthenticated: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'ADMIN',
  },

  actions: {
    setToken(token: string) {
      this.token = token;
      if (typeof window !== 'undefined') localStorage.setItem('auth_token', token);
    },

    setUser(user: Me) { this.user = user; },

    logout() {
      this.token = null;
      this.user = null;
      if (typeof window !== 'undefined') localStorage.removeItem('auth_token');
    },

    hydrate() {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('auth_token');
        if (token) this.token = token;
      }
    },
  },
});
