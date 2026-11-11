// Shared helpers for the headless smoke tests.

import { chromium } from 'playwright';
import { build, preview } from 'vite';

export async function startSite({ port = 4173 } = {}) {
  if (!process.env.SKIP_BUILD) await build({ logLevel: 'warn' });
  const server = await preview({ preview: { port, strictPort: true }, logLevel: 'warn' });
  return { url: `http://localhost:${port}`, close: () => server.close() };
}

export async function launch(extraArgs = []) {
  return chromium.launch({
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      ...extraArgs,
    ],
  });
}

// Collects console errors and page crashes so a test can assert none happened.
export function watch(page, name, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${name}] ${msg.text()}`);
    if (process.env.VERBOSE) console.log(`  [${name}:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${name}] ${err.message}`));
}

let failures = 0;
export function check(label, ok, detail = '') {
  if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
export const failureCount = () => failures;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 10000, interval = 100, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
    await sleep(interval);
  }
}

// Reads the output's final image (the small preview buffer) from /output and
// returns simple statistics about it.
export function outputStats(page) {
  return page.evaluate(() => {
    const { gl, pipeline } = window.thirdEye.engine;
    const { w, h } = pipeline.preview;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pipeline.preview.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let sum = 0;
    let hash = 0;
    for (let i = 0; i < px.length; i += 4) {
      sum += px[i] + px[i + 1] + px[i + 2];
      hash = (hash * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) >>> 0;
    }
    return { mean: sum / (w * h * 3), hash };
  });
}
