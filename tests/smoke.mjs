// Phase 1 smoke test: /control and /output in one browser, test pattern
// through the effects chain, BroadcastChannel sync in both directions.
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
  check('output reported closed', (await control.locator('#pills .pill').first().textContent()).includes('closed'));

  const output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  await waitFor(() => output.evaluate(() => !!window.thirdEye?.engine?.renderFps), { label: 'render fps' });

  console.log('render');
  const status = await waitFor(() => control.evaluate(() => window.thirdEye.ui.status), { label: 'status on control' });
  check('status reaches control', !!status, `${status.renderFps.toFixed(0)} fps, ${status.width}x${status.height}`);
  check('canvas matches viewport', status.width === 1280 && status.height === 720);
  check('input is the live test pattern', status.input.kind === 'pattern' && status.input.state === 'live');
  const a = await outputStats(output);
  await sleep(400);
  const b = await outputStats(output);
  check('output is not black', a.mean > 10, `mean ${a.mean.toFixed(1)}`);
  check('output is animating', a.hash !== b.hash);
  check('preview reaches control', await control.evaluate(() => {
    const c = document.getElementById('preview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return d.some((v, i) => i % 4 !== 3 && v > 20);
  }));

  console.log('control -> output');
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
  check('key in output reaches control', await control.evaluate(() => document.querySelector('.transport .danger').classList.contains('on')));
  await output.keyboard.press('b');

  console.log('resilience');
  await output.setViewportSize({ width: 960, height: 540 });
  await waitFor(() => output.evaluate(() => window.thirdEye.engine.canvas.width === 960), { label: 'resize' });
  check('resize follows the window', true);

  await control.reload();
  await waitFor(() => control.evaluate(() => window.thirdEye?.store.state.chain.length === 3), { label: 'control adopts output state' });
  check('reloaded control adopts live state', true);

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
