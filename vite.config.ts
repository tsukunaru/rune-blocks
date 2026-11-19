import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    legacy({
      targets: ['Android >= 5', 'iOS >= 9', 'Chrome >= 49', 'Safari >= 9'],
    }),
  ],
  build: {
    sourcemap: false,
  },
});
