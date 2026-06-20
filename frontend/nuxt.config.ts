import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  ssr: false,

  spaLoadingTemplate: 'app/spa-loading-template.html',

  devtools: { enabled: true },

  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
    },
  },

  modules: ['@pinia/nuxt'],

  vite: {
    plugins: [tailwindcss()],
  },

  css: ['~/assets/css/tailwind.css'],

  components: [
    { path: '~/components', pathPrefix: true },
  ],

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001',
    },
  },

  compatibilityDate: '2024-11-01',
});
