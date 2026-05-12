import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Copies classic <script src> and <link href> references that aren't part of
// the Vite module graph into dist/. Needed during Phase 2 Tasks 3–8 while
// frontend/src/*.js files are still IIFE; once Tasks 4–8 convert them to
// modules and Task 9 removes them from index.html, this plugin only carries
// frontend/lib/ (if still vendored) and frontend/src/yaml-autocomplete.css
// (until Task 10 imports it from main.js).
function copyClassicAssets() {
  return {
    name: 'copy-classic-assets',
    apply: 'build',
    closeBundle() {
      const copies = [
        { from: 'frontend/src', to: 'frontend/dist/src', exts: ['.js', '.css'] },
        { from: 'frontend/lib', to: 'frontend/dist/lib', exts: ['.js', '.css'] },
      ];
      for (const { from, to, exts } of copies) {
        if (!existsSync(from)) continue;
        mkdirSync(to, { recursive: true });
        for (const file of readdirSync(from)) {
          const src = join(from, file);
          if (!statSync(src).isFile()) continue;
          if (!exts.some(e => file.endsWith(e))) continue;
          copyFileSync(src, join(to, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [copyClassicAssets()],
  root: 'frontend',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
