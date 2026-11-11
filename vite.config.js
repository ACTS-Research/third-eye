import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';

const root = import.meta.dirname;
const https = !!process.env.HTTPS;

export default defineConfig({
  // Relative base so the same build works at any path (GitHub Pages project
  // sites live under /<repo>/).
  base: './',
  plugins: https ? [basicSsl()] : [],
  server: { host: https },
  // The vision worker is an ES module in dev and in the build alike.
  worker: { format: 'es' },
  // Pre-bundle up front so the dev server never reloads a page mid-session
  // because it "discovered" a dependency late.
  optimizeDeps: { include: ['tweakpane', 'peerjs', 'qrcode-generator', '@mediapipe/tasks-vision'] },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        control: resolve(root, 'control/index.html'),
        output: resolve(root, 'output/index.html'),
        phone: resolve(root, 'phone/index.html'),
      },
    },
  },
});
