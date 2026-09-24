// @ts-nocheck -- Vite executes this build script directly; application code remains strictly typed.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

function standaloneHtml() {
  return {
    name: 'standalone-html',
    apply: 'build',
    closeBundle() {
      const outputFile = resolve(projectRoot, 'dist/index.html');
      let html = readFileSync(outputFile, 'utf8');

      html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_tag, source) => {
        const scriptPath = resolve(projectRoot, 'dist', source.replace(/^\.\//, ''));
        const script = readFileSync(scriptPath, 'utf8').replace(/<\/script/gi, '<\\/script');
        return `<script type="module">${script}</script>`;
      });
      html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_tag, source) => {
        const stylePath = resolve(projectRoot, 'dist', source.replace(/^\.\//, ''));
        const style = readFileSync(stylePath, 'utf8').replace(/<\/style/gi, '<\\/style');
        return `<style>${style}</style>`;
      });

      writeFileSync(outputFile, html);
      copyFileSync(outputFile, resolve(projectRoot, '产品工作台-直接打开.html'));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), standaloneHtml()],
  server: { port: 5173 },
});
