// The output window is optional. With none, /control hosts the engine and
// its monitor is the live picture; an output window that opens takes the
// engine over, and /control takes it back when that window goes. Real WebRTC
// against a local PeerServer, so the phone's reconnects are covered too.
//   node tests/handover.mjs

import { benignError, check, failureCount, launch, outputStats, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];

const status = (control) => control.evaluate(() => window.thirdEye.ui.status);
const waitStatus = (control, pred, label, timeout = 20000) =>
  waitFor(async () => {
    const s = await status(control);
    return s && pred(s) ? s : null;
  }, { label, timeout });
const hostedBy = (control, role, label = `${role} hosting`) => waitStatus(control, (s) => s.host.role === role && s.renderFps > 0, label);
const phoneLive = (control, label) => waitStatus(control, (s) => s.phone.phone === 'connected' && s.phone.media === 'connected' && s.input.state === 'live', label, 30000);
const alertKeys = (control) => control.evaluate(() => [...document.querySelectorAll('#alerts [role=alert]')].map((n) => n.dataset.key));
const pill = (control) => control.locator('#out-pill').textContent();
// How many engines in this browser hold (or are trying for) the room code.
const linksOpen = async (pages) => {
  let n = 0;
  for (const p of pages) n += await p.evaluate(() => (window.thirdEye?.engine?.link.peer ? 1 : 0)).catch(() => 0);
  return n;
};

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);

  console.log('no output window');
  let s = await hostedBy(control, 'control', 'control page hosting');
  check('the control page renders by itself', true, `${s.renderFps.toFixed(0)} fps, ${s.width}x${s.height}`);
  check('it renders at 1280x720', s.width === 1280 && s.height === 720);
  // (Its colour follows the frame rate, which means nothing in the sandbox.)
  check('top bar says the output is off', /Output off/i.test(await pill(control)), await pill(control));
  // The small readback picture is only rendered for a control page in
  // another window; the test reads it, so pretend one is watching.
  await control.evaluate(() => {
    window.thirdEye.engine.remoteControlSeenAt = Infinity;
  });
  await waitFor(async () => (await outputStats(control)).mean > 0, { label: 'readback rendered' });
  check('the monitor is the live canvas', await control.evaluate(() => document.querySelector('#view-perform .monitor #stage')?.offsetParent != null));
  check('nothing covers the monitor', await control.evaluate(() => document.querySelector('.monitor-note').hidden));
  check('no alert about the output', !(await alertKeys(control)).some((k) => k.startsWith('output')));
  const a = await outputStats(control);
  const moving = await waitFor(async () => (await outputStats(control)).hash !== a.hash, { label: 'picture animating' }).then(() => true, () => false);
  check('the picture is not black and is animating', a.mean > 10 && moving, `mean ${a.mean.toFixed(1)}`);
  await control.keyboard.press('b');
  const black = await waitFor(async () => (await outputStats(control)).mean === 0, { label: 'blackout', timeout: 4000 }).then(() => true, () => false);
  await control.keyboard.press('b');
  check('blackout key works with no output window', black);
  await control.evaluate(() => window.thirdEye.ui.setView('edit'));
  check('the canvas follows to the Edit screen', await control.evaluate(() => document.querySelector('.edit-monitor #stage')?.offsetParent != null));
  await control.evaluate(() => window.thirdEye.ui.setView('setup'));
  s = await waitStatus(control, (st) => st.renderFps > 0, 'rendering on setup');
  check('it keeps rendering on the Setup screen', true);
  await control.evaluate(() => window.thirdEye.ui.setView('perform'));

  console.log('phone pairs with the control page');
  await waitStatus(control, (st) => st.phone.signal === 'open', 'host registered');
  const room = await control.locator('#room-code').textContent();
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(await control.locator('#phone-link').getAttribute('href'));
  await phone.click('#start');
  await control.keyboard.press('1');
  s = await phoneLive(control, 'phone video on control');
  check('phone video is live with no output window', s.host.role === 'control', `${s.input.width}x${s.input.height}`);
  check('pairing steps say the picture runs on this page', (await control.evaluate(() => document.querySelector('#pairing-pop .steps li').textContent)).includes('on this page'));

  console.log('opening the output hands the engine over');
  await control.evaluate(() => {
    window.thirdEye.ui.setView('edit');
    const t = window.thirdEye;
    t.starts = 0;
    const start = t.engine.start.bind(t.engine);
    t.engine.start = () => {
      t.starts++;
      start();
    };
  });
  await control.selectOption('#col-chain select', 'kaleido');
  await control.click('text=Add effect');
  await control.evaluate(() => window.thirdEye.ui.setView('perform'));
  const chain = await control.evaluate(() => window.thirdEye.store.state.chain.map((c) => c.type).join());
  await control.keyboard.press('r');
  await waitStatus(control, (st) => st.recording.active, 'recording on control');

  let output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  watch(output, 'output', errors);
  const t0 = Date.now();
  await output.goto(`${site.url}/output/`);
  s = await hostedBy(control, 'output', 'output hosting');
  check('the output window now hosts the engine', !(await output.evaluate(() => window.thirdEye.standby)), `${s.width}x${s.height}`);
  check('the control page stopped its engine', await control.evaluate(() => !window.thirdEye.engine.running));
  check('only one engine holds the room code', (await linksOpen([control, output])) === 1);
  check('the recording was stopped and kept', await waitFor(() => control.evaluate(() => !window.thirdEye.engine.recorder.active && window.thirdEye.engine.recorder.finished === 1), { label: 'recording closed' }).then(() => true, () => false));
  check('room code kept', (await output.evaluate(() => window.thirdEye.store.state.net.room)) === room && (await control.locator('#room-code').textContent()) === room);
  check('state kept', (await output.evaluate(() => window.thirdEye.store.state.chain.map((c) => c.type).join())) === chain, chain);
  s = await phoneLive(control, 'phone back on the output');
  check('the phone reconnected to the output by itself', s.host.role === 'output', `${((Date.now() - t0) / 1000).toFixed(1)} s after opening (headless)`);
  check('top bar shows the output', /^Output \d+ fps/i.test(await pill(control)), await pill(control));
  check('the monitor is the readback again', await control.evaluate(() => !document.getElementById('stage') && document.getElementById('preview').offsetParent != null));
  check('the readback arrives', await waitFor(() => control.evaluate(() => {
    const c = document.getElementById('preview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return d.some((v, i) => i % 4 !== 3 && v > 20);
  }), { label: 'readback' }).then(() => true, () => false));
  check('the pairing step names the output window', (await control.evaluate(() => document.querySelector('#pairing-pop .steps li').textContent)).includes('output window'));

  console.log('a second control tab');
  const control2 = await context.newPage();
  watch(control2, 'control2', errors);
  await control2.goto(`${site.url}/control/`);
  await hostedBy(control2, 'output', 'second control sees the output');
  check('a second control tab starts no engine', await control2.evaluate(() => !window.thirdEye.engine));
  await control2.close();

  console.log('an output reload does not bounce');
  const reloaded = async (how, label) => {
    const before = await output.evaluate(() => window.thirdEye.engine.host.id);
    await how();
    await waitStatus(control, (st) => st.host.role === 'output' && st.host.id !== before && st.renderFps > 0, `${label}: new output`);
    check(`${label}: the control page did not start its engine in between`, (await control.evaluate(() => window.thirdEye.starts)) === 0);
    await phoneLive(control, `${label}: phone back`);
    check(`${label}: the phone reconnected`, true);
  };
  await reloaded(() => control.click('#output-panel h2 button', { force: true }).catch(() => control.evaluate(() => window.thirdEye.bus.send('output', { cmd: 'reload' }))), 'reload from the control page');
  await reloaded(() => output.reload(), 'reload in the output window');
  check('no alert about the output after reloads', !(await alertKeys(control)).some((k) => k.startsWith('output')));

  console.log('an output that stops drawing is not taken for gone');
  await output.evaluate(() => cancelAnimationFrame(window.thirdEye.engine.raf));
  await waitFor(async () => (await alertKeys(control)).includes('output-stalled'), { label: 'not-drawing alert', timeout: 15000 });
  check('the control page says the output is not drawing', await waitFor(async () => /not drawing/i.test(await pill(control)), { label: 'pill' }).then(() => true, () => false), await pill(control));
  check('and does not start its own engine', (await control.evaluate(() => window.thirdEye.starts)) === 0 && (await linksOpen([control, output])) === 1);
  await output.evaluate(() => {
    const e = window.thirdEye.engine;
    e.running = false;
    e.start();
  });
  check('the alert clears when it draws again', await waitFor(async () => !(await alertKeys(control)).includes('output-stalled'), { label: 'alert cleared' }).then(() => true, () => false));
  await hostedBy(control, 'output', 'output drawing again');

  console.log('closing the output hands the engine back');
  const t1 = Date.now();
  await control.evaluate(() => window.thirdEye.bus.send('output', { cmd: 'close' }));
  s = await hostedBy(control, 'control', 'control hosting again');
  check('the control page hosts again', (await control.evaluate(() => window.thirdEye.starts)) === 1, `${((Date.now() - t1) / 1000).toFixed(1)} s after closing (headless)`);
  check('room code kept', (await control.locator('#room-code').textContent()) === room);
  check('a closed output raises no alert', !(await alertKeys(control)).some((k) => k.startsWith('output')));
  check('the monitor is the live canvas again', await control.evaluate(() => document.querySelector('#view-perform .monitor #stage')?.offsetParent != null));
  s = await phoneLive(control, 'phone back on control');
  check('the phone reconnected to the control page', s.host.role === 'control');
  await output.close().catch(() => {});

  console.log('an output that vanishes without warning');
  output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  await output.goto(`${site.url}/output/`);
  await hostedBy(control, 'output', 'output hosting again');
  // No goodbye and no answers: as if the window had crashed.
  await output.evaluate(() => {
    const t = window.thirdEye;
    cancelAnimationFrame(t.engine.raf);
    t.engine.link.shutdown();
    t.bus.send = () => {};
  });
  s = await hostedBy(control, 'control', 'control took over');
  check('the control page takes over', true);
  check('and says the output stopped, with a way to reopen it', (await alertKeys(control)).includes('output') && (await control.locator('#alerts [data-key=output] .act').textContent()).includes('Open output window'));
  await phoneLive(control, 'phone back after the drop');
  check('the phone reconnected', true);

  const real = errors.filter((e) => !benignError(e));
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  check(`run completed (${err.message})`, false);
} finally {
  await browser.close();
  await stopPeerServer(peerServer);
  await site.close();
}

const failed = failureCount();
console.log(failed ? `\n${failed} check(s) failed` : '\nall handover checks passed');
process.exit(failed ? 1 : 0);
