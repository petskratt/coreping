import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    {
      name: 'github-pages-nojekyll',
      closeBundle() {
        fs.writeFileSync(path.join(root, 'docs/.nojekyll'), '');
      },
    },
  ],
  resolve: {
    alias: {
      serialport: path.join(root, 'src/shims/serialport.js'),
    },
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    sourcemap: false,
  },
});
