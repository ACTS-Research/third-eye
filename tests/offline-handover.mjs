// A phone paired without the pairing server, and the picture moving between
// windows. There is no server to rebuild the link through, so the window
// that has the phone introduces the other one to it; no code is scanned
// again. Companion to offline-pair.mjs (pairing) and handover.mjs (the same
// moves with a pairing server).
//   node tests/offline-handover.mjs

import { benignError, check, failureCount, launch, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  await context.addInitScript(() => {
    window.__codes = [];
    window.BarcodeDetector = class {
      async detect() {
        return window.__codes.map((rawValue) => ({ rawValue }));
      }
    };
  });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const settle = (fn, label, timeout = 20000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  // The phone linked directly and its video live, with `role` hosting.
  const live = (role, label) => settle(async () => {
    const s = await status();
    return s?.host.role === role && s.phone.direct && s.phone.phone === 'connected' && s.phone.media === 'connected' && s.input.state === 'live';
  }, label, 30000);
  await waitFor(async () => (await status())?.host.role === 'control', { label: 'control hosting' });

  console.log('pair without the pairing server');
  await control.evaluate(() => window.thirdEye.ui.pairOffline());
  await waitFor(() => control.evaluate(() => document.getElementById('offline-link').href.includes('#o=')), { label: 'offer shown' });
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(await control.locator('#offline-link').getAttribute('href'));
  await phone.locator('#start').dispatchEvent('click');
  await waitFor(() => phone.evaluate(() => !!window.thirdEyePhone.pairToken), { label: 'phone shows its code' });
  await control.evaluate((c) => {
    window.__codes = [c];
  }, await phone.evaluate(() => `3EYE.${window.thirdEyePhone.pairToken}`));
  await control.keyboard.press('1');
  check('paired and streaming to the control page', await live('control', 'paired'));
  await control.evaluate(() => {
    window.__codes = [];
  });
  // From here on the phone must never be asked for a code again.
  const noRescan = async () => (await phone.evaluate(() => document.getElementById('pair').hidden)) && (await control.evaluate(() => document.getElementById('offline-pair').hidden)) && !(await control.evaluate(() => [...document.querySelectorAll('#alerts [role=alert]')].some((n) => n.dataset.key === 'direct-lost')));

  console.log('opening the output');
  let output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  watch(output, 'output', errors);
  const t0 = Date.now();
  await output.goto(`${site.url}/output/`);
  check('the output takes over and the phone follows, with no code scanned', (await live('output', 'output live')) && (await noRescan()), `${((Date.now() - t0) / 1000).toFixed(1)} s (headless)`);
  check('the control page stopped its engine', await control.evaluate(() => !window.thirdEye.engine.running));
  check('the phone says LIVE again', await settle(async () => (await phone.locator('#state').textContent()).startsWith('LIVE'), 'phone live'), await phone.locator('#state').textContent());
  check('the control page keeps a link to the phone in reserve', await settle(() => control.evaluate(() => window.thirdEye.engine.link.spareReady), 'spare'));

  console.log('reloading the output');
  const before = await output.evaluate(() => window.thirdEye.engine.host.id);
  await output.reload();
  await waitFor(async () => {
    const s = await status();
    return s?.host.role === 'output' && s.host.id !== before;
  }, { label: 'output back', timeout: 20000 });
  check('the reloaded output gets the phone back, with no code scanned', (await live('output', 'output live again')) && (await noRescan()));
  check('the control page has a link in reserve again', await settle(() => control.evaluate(() => window.thirdEye.engine.link.spareReady), 'spare again'));

  console.log('closing the output');
  const t1 = Date.now();
  await output.close();
  check('the picture and the phone come back to the control page, with no code scanned', (await live('control', 'control live')) && (await noRescan()), `${((Date.now() - t1) / 1000).toFixed(1)} s (headless)`);

  console.log('an output that vanishes');
  output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  await output.goto(`${site.url}/output/`);
  check('a new output takes over again', await live('output', 'output live, second time'));
  await settle(() => control.evaluate(() => window.thirdEye.engine.link.spareReady), 'spare before the crash');
  await output.evaluate(() => {
    const t = window.thirdEye;
    cancelAnimationFrame(t.engine.raf);
    t.engine.link.shutdown();
    t.bus.send = () => {};
  });
  check('the control page takes the picture and the phone back', await live('control', 'control live after the crash'));
  check('still no code to scan', await phone.evaluate(() => document.getElementById('pair').hidden) && !(await control.evaluate(() => [...document.querySelectorAll('#alerts [role=alert]')].some((n) => n.dataset.key === 'direct-lost'))));

  const real = errors.filter((e) => !benignError(e) && !/ERR_TUNNEL_CONNECTION_FAILED|Could not get an ID|Aborting|retrieving ID/.test(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
  await site.close();
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
