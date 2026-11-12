// Phase 1 smoke test: /control alone, then /control and /output in one
// browser, test pattern through the effects chain, BroadcastChannel sync in
// both directions, and back to /control alone.
//   npm run test:smoke

import { check, failureCount, launch, outputStats, sleep, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);

  console.log('control without output');
  check('chain cards rendered', (await control.locator('.fx').count()) === 2);
  const alone = await waitFor(() => control.evaluate(() => {
    const st = window.thirdEye.ui.status;
    return st?.host.role === 'control' && st.renderFps > 0 ? st : null;
  }), { label: 'control renders by itself' });
  check('control renders the picture itself', alone.input.kind === 'pattern' && alone.input.state === 'live', `${alone.width}x${alone.height}`);
  check('output reported off', /Output off/i.test(await control.locator('#pills .pill').first().textContent()));
  // The readback is only rendered for a control page in another window;
  // outputStats reads it, so pretend one is watching.
  await control.evaluate(() => {
    window.thirdEye.engine.remoteControlSeenAt = Infinity;
  });
  await waitFor(async () => (await outputStats(control)).mean > 10, { label: 'picture on control' });
  await control.evaluate(() => {
    const ext = window.thirdEye.engine.gl.getExtension('WEBGL_lose_context');
    window.__ext = ext;
    ext.loseContext();
  });
  await sleep(300);
  await control.evaluate(() => window.__ext.restoreContext());
  check('control recovers from a lost GL context', await waitFor(async () => (await outputStats(control)).mean > 10, { label: 'context back', timeout: 5000 }).then(() => true, () => false));

  const output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  await waitFor(() => output.evaluate(() => !!window.thirdEye?.engine?.renderFps), { label: 'render fps' });

  console.log('render');
  const status = await waitFor(() => control.evaluate(() => (window.thirdEye.ui.status?.host.role === 'output' ? window.thirdEye.ui.status : null)), { label: 'status on control' });
  check('the output window took the engine over', await control.evaluate(() => !window.thirdEye.engine.running));
  check('status reaches control', !!status, `${status.renderFps.toFixed(0)} fps, ${status.width}x${status.height}`);
  check('canvas matches viewport', status.width === 1280 && status.height === 720);
  check('input is the live test pattern', status.input.kind === 'pattern' && status.input.state === 'live');
  const a = await outputStats(output);
  await sleep(400);
  const b = await outputStats(output);
  check('output is not black', a.mean > 10, `mean ${a.mean.toFixed(1)}`);
  check('output is animating', a.hash !== b.hash);
  check('output knows a control page is watching', await (async () => {
    return output.evaluate(() => performance.now() - window.thirdEye.engine.controlSeenAt < 3000);
  })());
  check('preview reaches control', await control.evaluate(() => {
    const c = document.getElementById('preview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return d.some((v, i) => i % 4 !== 3 && v > 20);
  }));

  console.log('control -> output');
  await control.evaluate(() => window.thirdEye.ui.setView('edit'));
  await control.selectOption('#col-chain select', 'kaleido');
  await control.click('text=Add effect');
  await waitFor(() => output.evaluate(() => window.thirdEye.store.state.chain.length === 3), { label: 'effect added on output' });
  check('added effect reaches output', true);
  check('effect instance created', await output.evaluate(() => window.thirdEye.engine.pipeline.cur.instances.size === 3));

  // Drag a Tweakpane slider and confirm the value arrives.
  const before = await output.evaluate(() => window.thirdEye.store.state.chain[0].params.zoom);
  const slider = control.locator('.fx').first().locator('.tp-sldv_t').nth(1);
  const box = await slider.boundingBox();
  await control.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await sleep(200);
  const after = await output.evaluate(() => window.thirdEye.store.state.chain[0].params.zoom);
  check('slider drag reaches output', after !== before && after > 1.15, `zoom ${before} -> ${after}`);

  await control.locator('.fx').nth(2).locator('button[title="Move earlier"]').click();
  await sleep(200);
  check('reorder reaches output', await output.evaluate(() => window.thirdEye.store.state.chain[1].type === 'kaleido'));
  check('feedback buffers kept across reorder', await output.evaluate(() => {
    const { pipeline } = window.thirdEye.engine;
    const uid = window.thirdEye.store.state.chain[0].uid;
    return !!pipeline.cur.instances.get(uid)?.own;
  }));

  await control.locator('.fx').nth(1).locator('text=Bypass').click();
  await sleep(150);
  check('bypass reaches output', await output.evaluate(() => window.thirdEye.store.state.chain[1].bypass === true));

  console.log('keys');
  const settle = (pred, label) => waitFor(async () => pred(await outputStats(output)), { label, timeout: 4000 }).then(() => true, () => false);
  await control.keyboard.press('b');
  check('blackout key blacks the output', await settle((st) => st.mean === 0, 'black'));
  await control.keyboard.press('b');
  check('blackout releases', await settle((st) => st.mean > 10, 'picture back'));

  await control.keyboard.press('x');
  await control.keyboard.press(' ');
  await sleep(1000);
  const f1 = await outputStats(output);
  await sleep(400);
  const f2 = await outputStats(output);
  check('freeze holds the frame', f1.hash === f2.hash);
  await control.keyboard.press(' ');
  await control.keyboard.press('x');

  await output.keyboard.press('b');
  await sleep(200);
  check('key in output reaches control', await control.evaluate(() => document.querySelector('.big.blackout').classList.contains('on')));
  await output.keyboard.press('b');

  console.log('video file input');
  // Record a short clip in the page, then load it through the file picker.
  const clip = await control.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    let n = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = `hsl(${(n += 20) % 360} 90% 50%)`;
      ctx.fillRect(0, 0, 320, 240);
    }, 40);
    const recorder = new MediaRecorder(canvas.captureStream(25), { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (recorder.onstop = r));
    recorder.start();
    await new Promise((r) => setTimeout(r, 1500));
    recorder.stop();
    await done;
    clearInterval(timer);
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    return Array.from(bytes);
  });
  await control.setInputFiles('#input-panel input[type=file]', { name: 'clip.webm', mimeType: 'video/webm', buffer: Buffer.from(clip) });
  const fileLive = await waitFor(() => control.evaluate(() => {
    const st = window.thirdEye.ui.status;
    return st?.input.kind === 'file' && st.input.state === 'live' && st.input.width === 320 ? st : null;
  }), { label: 'video file live', timeout: 8000 }).catch(() => null);
  check('local video file plays through the pipeline', !!fileLive, fileLive ? `${fileLive.input.width}x${fileLive.input.height}` : 'not live');
  check('file name shown on control', (await control.locator('#input-panel').textContent()).includes('clip.webm'));
  await control.keyboard.press('3');

  console.log('resilience');
  await output.setViewportSize({ width: 960, height: 540 });
  await waitFor(() => output.evaluate(() => window.thirdEye.engine.canvas.width === 960), { label: 'resize' });
  check('resize follows the window', true);

  await control.reload();
  await waitFor(() => control.evaluate(() => window.thirdEye?.store.state.chain.length === 3), { label: 'control adopts output state' });
  check('reloaded control adopts live state', true);
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.host.role === 'output'), { label: 'status after control reload' });
  check('reloaded control leaves the engine with the output', await control.evaluate(() => !window.thirdEye.engine));

  await output.evaluate(() => {
    const ext = window.thirdEye.engine.gl.getExtension('WEBGL_lose_context');
    window.__ext = ext;
    ext.loseContext();
  });
  await sleep(300);
  await output.evaluate(() => window.__ext.restoreContext());
  await sleep(800);
  check('recovers from a lost GL context', (await outputStats(output)).mean > 10);

  await output.reload();
  await waitFor(() => output.evaluate(() => window.thirdEye?.engine?.renderFps > 0), { label: 'output back after reload' });
  check('reloaded output resumes with the same chain', await output.evaluate(() => window.thirdEye.store.state.chain.length === 3));

  console.log('output closed');
  // A video file picked while the output was open goes to the control page's
  // own engine when the picture comes back to it.
  await control.setInputFiles('#input-panel input[type=file]', { name: 'clip.webm', mimeType: 'video/webm', buffer: Buffer.from(clip) });
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.input.kind === 'file' && window.thirdEye.ui.status.input.state === 'live'), { label: 'file live on output', timeout: 8000 });
  await output.close({ runBeforeUnload: true });
  const back = await waitFor(() => control.evaluate(() => {
    const st = window.thirdEye.ui.status;
    return st?.host.role === 'control' && st.input.kind === 'file' && st.input.state === 'live' && st.input.width === 320 ? st : null;
  }), { label: 'file live on control', timeout: 15000 }).catch(() => null);
  check('closing the output brings the picture, and the video file, back to control', !!back);
  check('same chain on control', await control.evaluate(() => window.thirdEye.store.state.chain.length === 3));

  // The sandbox cannot reach the public PeerJS server; that noise is expected.
  const real = errors.filter((e) => !/peerjs|WebSocket|Lost connection/i.test(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
  if (process.env.SHOTS) {
    await control.screenshot({ path: `${process.env.SHOTS}/control.png` });
    await output.screenshot({ path: `${process.env.SHOTS}/output.png` });
  }
} finally {
  await browser.close();
  await site.close();
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
