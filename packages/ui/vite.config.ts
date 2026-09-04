import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so `ruleprint build` output works from any sub-path (GitHub Pages).
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
