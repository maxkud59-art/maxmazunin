import { defineConfig } from 'orval';

export default defineConfig({
  'cabinet-api': {
    input: {
      // Первая генерация — из локального snapshot.
      // После запуска бэка: target: 'http://localhost:3001/api/docs-json'
      target: './openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './app/api/generated',
      client: 'axios',
      override: {
        mutator: {
          path: './composables/useApi.ts',
          name: 'useApiInstance',
        },
      },
      clean: true,
    },
  },
});
