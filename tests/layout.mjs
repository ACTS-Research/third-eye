// Layout: nothing overlaps at any window width, and nothing moves when the
// numbers and messages on screen change.
//   node tests/layout.mjs

import { benignError, check, failureCount, launch, sleep, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const WIDTHS = [900, 1024, 1180, 1280, 1440, 1728];
const VIEWS = ['perform', 'edit', 'setup'];

// Positions of everything that should stay put, as "x,y,w,h" strings.
const snapshot = (page) => page.evaluate(() => {
  const out = {};
  const pick = (name, nodes) => [...nodes].forEach((n, i) => {
    if (n.offsetParent === null) return;
    const r = n.getBoundingClientRect();
    out[`${name}${i}`] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v)).join(',');
  });
  pick('nav', document.querySelectorAll('#views button, #rec, #midi-map-toggle, #palette'));
  pick('view', document.querySelectorAll('.view:not([hidden])'));
  pick('big', document.querySelectorAll('.big, .tap, .inputs'));
  pick('monitor', document.querySelectorAll('.monitor, .edit-monitor'));
  pick('faders', document.querySelectorAll('.faders, .fader'));
  pick('strip', document.querySelectorAll('.strip, .tile'));
  pick('panel', document.querySelectorAll('.panel'));
  pick('fx', document.querySelectorAll('.fx, .edit-head > *'));
  return out;
});

const diff = (a, b) => Object.keys(a).filter((k) => b[k] !== undefined && a[k] !== b[k]).map((k) => `${k}: ${a[k]} -> ${b[k]}`);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((signal) => window.thirdEye.store.merge('net', { signal }), peerServer.signalUrl);
  const output = await context.newPage();
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.phone.signal === 'open'), { label: 'ready', timeout: 20000 });
  await control.locator('.tile .load').nth(1).click();
  await sleep(1500);

  console.log('no overlaps, at every width');
  for (const width of WIDTHS) {
    await control.setViewportSize({ width, height: 900 });
    for (const view of VIEWS) {
      await control.evaluate((v) => window.thirdEye.ui.setView(v), view);
      await sleep(150);
      const problems = await control.evaluate(() => {
        const found = [];
        const top = document.getElementById('top').getBoundingClientRect();
        if (Math.round(top.height) !== 48) found.push(`header is ${Math.round(top.height)}px tall`);
        for (const n of document.querySelectorAll('#top > *')) {
          const r = n.getBoundingClientRect();
          if (r.width && (r.top < top.top - 1 || r.bottom > top.bottom + 1)) found.push(`${n.id || n.className} leaves the header`);
          if (r.right > window.innerWidth + 1) found.push(`${n.id || n.className} runs off the right edge`);
        }
        const boxes = [...document.querySelectorAll('.view:not([hidden]) .panel, .view:not([hidden]) .fx, .view:not([hidden]) .big, .view:not([hidden]) .tile, .view:not([hidden]) .fader, .view:not([hidden]) .edit-monitor')]
          .filter((n) => n.offsetParent !== null)
          .map((n) => ({ name: n.id || n.className.split(' ')[0], r: n.getBoundingClientRect() }));
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].r;
            const b = boxes[j].r;
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 2 && h > 2) found.push(`${boxes[i].name} overlaps ${boxes[j].name}`);
          }
        }
        // Text spilling out of its own box.
        for (const n of document.querySelectorAll('.view:not([hidden]) button, .view:not([hidden]) .panel > h2')) {
          if (n.offsetParent !== null && n.scrollWidth > n.clientWidth + 2) found.push(`text overflows "${n.textContent.trim().slice(0, 24)}"`);
        }
        return [...new Set(found)];
      });
      check(`${width}px ${view}`, problems.length === 0, problems.slice(0, 4).join('; '));
      if (process.env.SHOTS && (width === 900 || width === 1280)) await control.screenshot({ path: `${process.env.SHOTS}/layout-${width}-${view}.png` });
    }
  }

  console.log('nothing moves when the information changes');
  await control.setViewportSize({ width: 1280, height: 800 });
  // The worst case for every message on the page, and the output going away.
  const variants = await control.evaluate(() => {
    const real = structuredClone(window.thirdEye.ui.status);
    const trouble = structuredClone(real);
    trouble.renderFps = 7.4;
    trouble.worstFrameMs = 1234;
    trouble.build = 'something-else';
    trouble.input = { kind: 'phone', state: 'stalled', width: 1920, height: 1080, fps: 0 };
    trouble.latency = { ms: 1432.2, measured: false };
    trouble.phone = { ...real.phone, signal: 'disconnected', error: 'network', phone: 'none', media: 'none', notice: 'Room code ABCDE was in use somewhere else, so a new one was made. Scan the QR code again.' };
    trouble.camera = { state: 'error', error: 'Camera permission needed — click "Find cameras" on the control page', label: '' };
    trouble.midi = { ...real.midi, state: 'denied', error: 'SecurityError: permission denied by system' };
    trouble.audio = { ...real.audio, state: 'error', error: 'Microphone permission needed — enable audio on the control page' };
    trouble.recording = { active: true, name: 'third-eye-2026-11-12-0101-01.webm', seconds: 5999, bytes: 12.3e9, finished: real.recording.finished, error: 'Recording stopped: the disk is full' };
    trouble.latencyTest = { state: 'failed', ms: null, message: 'Only 1 of 5 flashes were seen. Point the phone at the output so it fills most of the frame, and dim other light.' };
    const streaming = structuredClone(real);
    streaming.phone = { ...real.phone, phone: 'connected', media: 'connected', route: 'direct (LAN)', rttMs: 5, kbps: 14000, codec: 'H264', jitterBufferMs: 34, info: { controllerOnly: false, hidden: false } };
    streaming.input = { kind: 'phone', state: 'live', width: 1280, height: 720, fps: 30 };
    streaming.latency = { ms: 145, measured: false };
    streaming.latencyTest = { state: 'done', ms: 166.7, message: '5 of 5 flashes seen, 167–200 ms; 2 strays at 817, 1017 ms left out' };
    streaming.sensors = { live: true, hz: 60, orientation: true, motion: true };
    return { real, trouble, streaming };
  });
  const show = (status) => control.evaluate((s) => {
    const { ui } = window.thirdEye;
    ui.status = s;
    ui.statusAt = s ? performance.now() + 1e9 : -Infinity; // hold this state against live updates
    for (const fn of ui.statusListeners) fn(s);
  }, status);
  // Stop live status from replacing the staged ones.
  await output.close();
  await sleep(300);
  for (const view of VIEWS) {
    await control.evaluate((v) => window.thirdEye.ui.setView(v), view);
    await show(variants.streaming);
    await sleep(200);
    const calm = await snapshot(control);
    await show(variants.trouble);
    await control.evaluate(() => window.thirdEye.store.merge('globals', { blackout: true, freeze: true }));
    await sleep(200);
    const loud = await snapshot(control);
    await control.evaluate(() => window.thirdEye.store.merge('globals', { blackout: false, freeze: false }));
    await show(null);
    await sleep(200);
    const closed = await snapshot(control);
    const moved = [...diff(calm, loud), ...diff(calm, closed)];
    check(`${view}: same layout when streaming, in trouble, and with the output closed`, moved.length === 0, moved.slice(0, 5).join('; '));
    if (process.env.SHOTS) {
      await show(variants.trouble);
      await sleep(100);
      await control.screenshot({ path: `${process.env.SHOTS}/layout-trouble-${view}.png` });
    }
  }

  console.log('palette pop-over');
  await control.evaluate(() => window.thirdEye.ui.setView('perform'));
  check('one dot in the bar, choices hidden', (await control.locator('#palette > button').count()) === 1 && (await control.locator('#palette-menu').isHidden()));
  await control.click('#palette > button');
  check('clicking the dot opens the six palettes', await control.locator('#palette-menu').isVisible() && (await control.locator('#palette-menu button').count()) === 6);
  await control.click('#palette-menu >> text=Ice');
  check('choosing one applies it and closes the menu', (await control.evaluate(() => document.documentElement.dataset.palette)) === 'ice' && (await control.locator('#palette-menu').isHidden()));
  await control.click('#palette > button');
  await control.keyboard.press('Escape');
  check('Esc closes it', await control.locator('#palette-menu').isHidden());
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
  await browser.close();
  await site.close();
  await stopPeerServer(peerServer);
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
