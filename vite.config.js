import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';

const root = import.meta.dirname;
const https = !!process.env.HTTPS;

// Emits sw.js at the site root with the list of built files to store for
// offline use. Files from public/ (the MediaPipe runtime and models) are not
// listed: they are large and optional, and are stored on first use instead.
function serviceWorker() {
  return {
    name: 'third-eye-service-worker',
    apply: 'build',
    // After Vite has added the HTML pages to the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((name) => !name.endsWith('.map') && !name.endsWith('.woff')).sort();
      // Each page is also reachable by its folder URL.
      const pages = files.filter((f) => f.endsWith('index.html')).map((f) => f.replace(/index\.html$/, ''));
      const list = [...new Set([...files, ...pages])].map((f) => f || './');
      const version = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 12);
      const source = readFileSync(resolve(root, 'src/sw.js'), 'utf8')
        .replace('__PRECACHE__', JSON.stringify(list))
        .replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at any path (GitHub Pages project
  // sites live under /<repo>/).
  base: './',
  // Stamped into both Mac pages so /control can tell when /output is older.
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  plugins: [serviceWorker(), ...(https ? [basicSsl()] : [])],
  server: { host: https },
  // The vision worker is an ES module in dev and in the build alike.
  worker: { format: 'es' },
  // Pre-bundle up front so the dev server never reloads a page mid-session
  // because it "discovered" a dependency late.
  optimizeDeps: { include: ['tweakpane', 'peerjs', 'qrcode-generator', 'jsqr', '@mediapipe/tasks-vision'] },
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
