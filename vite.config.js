import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // 移植先(静的 / WordPress等)を選ばないよう相対パスでビルド
  base: './',
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        walkthrough: resolve(import.meta.dirname, 'walkthrough.html'),
      },
    },
  },
});
