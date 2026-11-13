// Shared helpers for the headless smoke tests.

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

export async function startSite({ port = 4173 } = {}) {
  if (!process.env.SKIP_BUILD) {
    // Same preparation `npm run build` does: MediaPipe runtime and models.
    execFileSync('node', [join(import.meta.dirname, '../scripts/fetch-models.mjs')], { stdio: 'inherit' });
    await build({ logLevel: 'warn' });
  }
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

// Local PeerServer so pairing works without the public PeerJS cloud.
export async function startPeerServer(port = 9200) {
  const { PeerServer } = await import('peer');
  return new Promise((resolve) => {
    PeerServer({ port, host: '127.0.0.1', path: '/' }, (server) => {
      // Upgraded WebSockets are not closed by server.close(); track them.
      server.sockets = new Set();
      server.on('connection', (socket) => {
        server.sockets.add(socket);
        socket.on('close', () => server.sockets.delete(socket));
      });
      server.signalUrl = `ws://127.0.0.1:${port}/`;
      resolve(server);
    });
  });
}

export function stopPeerServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    for (const socket of server.sockets) socket.destroy();
  });
}

// Opens /control, /output and a paired /phone in one browser context.
export async function openSession(browser, site, peerServer, errors, { start = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone', 'accelerometer', 'gyroscope', 'magnetometer']);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((signal) => window.thirdEye.store.merge('net', { signal }), peerServer.signalUrl);
  const output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.phone.signal === 'open'), { label: 'host signaling', timeout: 20000 });
  const url = await control.locator('#phone-link').getAttribute('href');
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(url);
  if (start) {
    await phone.click('#start');
    await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.phone.phone === 'connected'), { label: 'phone paired', timeout: 20000 });
  }
  return { context, control, output, phone, url };
}

// Stands in for the Mac's camera on /control: a video stream showing
// whatever picture showToMac() last gave it, on a plain background. The
// phone's code is drawn at about the size it has in a 720p webcam frame when
// the phone is held a hand's length away.
export async function fakeMacCamera(context) {
  await context.addInitScript(() => {
    if (!location.pathname.includes('/control/')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    let image = null;
    setInterval(() => {
      ctx.fillStyle = '#3a4652';
      ctx.fillRect(0, 0, 1280, 720);
      if (image) ctx.drawImage(image, 500, 220, 280, 280);
    }, 100);
    window.__show = (dataUrl) => {
      if (!dataUrl) {
        image = null;
        return;
      }
      const img = new Image();
      img.onload = () => {
        image = img;
      };
      img.src = dataUrl;
    };
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => (constraints?.video ? canvas.captureStream(15) : real(constraints));
  });
}

// The picture of the code the phone is showing (a data URL), and holding a
// picture up to the Mac's camera (null takes it away).
export const phoneCode = (phone) => phone.evaluate(() => document.getElementById('pair-qr').toDataURL());
export const showToMac = (control, picture) => control.evaluate((p) => window.__show(p), picture);

export const benignError = (e) => /peerjs|WebSocket|ERR_CONNECTION_REFUSED|Lost connection|server-error|socket/i.test(e);
