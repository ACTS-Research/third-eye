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

// Every page the tests open starts as a browser that has been used before:
// a saved session whose input is the test pattern (a fresh one opens on the
// iPhone, with the splash where the picture will be), and a phone whose
// "check before the show" is switched off (it would wait for GO LIVE).
// tests/start.mjs covers the fresh start; it passes `fresh: true`.
const SEED = () => {
  try {
    if (!localStorage.getItem('thirdeye.session.v1')) localStorage.setItem('thirdeye.session.v1', JSON.stringify({ input: { kind: 'pattern' } }));
    if (!localStorage.getItem('thirdeye.phone.v1')) localStorage.setItem('thirdeye.phone.v1', JSON.stringify({ check: false }));
  } catch {
    /* no storage on this page */
  }
};

export async function launch(extraArgs = [], { fresh = false } = {}) {
  const browser = await launchBrowser(extraArgs);
  if (fresh) return browser;
  const make = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await make(options);
    await context.addInitScript(SEED);
    return context;
  };
  return browser;
}

function launchBrowser(extraArgs) {
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
  // Sideways, the way the live screen is laid out, so positions on the page
  // read as they do on the screen. (tests/phone-screen.mjs covers upright.)
  await phone.setViewportSize({ width: 844, height: 390 });
  watch(phone, 'phone', errors);
  await phone.goto(url);
  if (start) {
    await phone.click('#start');
    await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.phone.phone === 'connected'), { label: 'phone paired', timeout: 20000 });
  }
  return { context, control, output, phone, url };
}

// Stands in for a camera on one kind of page: a video stream showing
// whatever picture __show() last gave it, on a plain background, `size`
// pixels across in a 1280x720 frame.
async function fakeCamera(context, path, size) {
  await context.addInitScript(({ path, size }) => {
    if (!location.pathname.includes(path)) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    let image = null;
    // Every stream handed out, so each can be given its frames by hand. Left
    // to itself a canvas stream gets a frame when the page next presents
    // one, and its timer runs when the browser lets it: in a headless page
    // that is not in front, either can stall for half a minute, and a
    // picture held up to this camera is then simply not seen. A worker's
    // timer is not held back, and requestFrame() does not wait for the page.
    const tracks = new Set();
    const draw = () => {
      ctx.fillStyle = '#3a4652';
      ctx.fillRect(0, 0, 1280, 720);
      if (image) ctx.drawImage(image, (1280 - size) / 2, (720 - size) / 2, size, size);
      for (const track of tracks) {
        if (track.readyState === 'live') track.requestFrame?.();
        else tracks.delete(track);
      }
    };
    try {
      const clock = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 100)'], { type: 'text/javascript' })));
      clock.onmessage = draw;
    } catch {
      setInterval(draw, 100);
    }
    const open = () => {
      const stream = canvas.captureStream(0);
      tracks.add(stream.getVideoTracks()[0]);
      draw();
      return stream;
    };
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
    navigator.mediaDevices.getUserMedia = async (constraints) => (constraints?.video ? open() : real(constraints));
  }, { path, size });
}

// The Mac's camera on /control: the phone's code at about the size it has in
// a 720p webcam frame when the phone is held a hand's length away.
export const fakeMacCamera = (context) => fakeCamera(context, '/control/', 280);
// The phone's camera on /phone, pointed at the Mac's screen.
export const fakePhoneCamera = (context) => fakeCamera(context, '/phone/', 520);

// The picture of the code the phone is showing (a data URL), and holding a
// picture up to the Mac's camera (null takes it away).
export const phoneCode = (phone) => phone.evaluate(() => document.getElementById('pair-qr').toDataURL());
export const showToMac = (control, picture) => control.evaluate((p) => window.__show(p), picture);

export const benignError = (e) => /peerjs|WebSocket|ERR_CONNECTION_REFUSED|Lost connection|server-error|socket/i.test(e);

// ---- the edit screen's own controls (src/control/controls.js) ----

// Adds an effect through the "+ Add effect" menu under the picture.
export const addEffect = (page, type) => page.evaluate((t) => {
  document.getElementById('add-effect').click();
  document.querySelector(`.menu-list .menu-item[data-value="${t}"]`).click();
}, type);

// Clicks a bar slider at a fraction of its width (0 = left end, 1 = right).
export async function clickBar(page, selector, at = 0.5) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width * at, box.y + box.height / 2);
}

// Chooses a value from one of the app's menus: `button` opens it.
export async function pickMenu(page, button, value) {
  // (A menu only opens for a button that is on the screen.)
  await page.locator(button).scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {}); // (or on a screen that is not showing)
  await page.locator(button).dispatchEvent('click');
  await page.locator(`.menu-list .menu-item[data-value="${value}"]`).dispatchEvent('click');
}

// A slider of the effect that is open on the Parameters tab.
export const paramBar = (key) => `#tab-params .param[data-key="${key}"] input.bar`;
