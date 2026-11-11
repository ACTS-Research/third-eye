// Offline reload and tap tempo.
//   node tests/offline.mjs

import { benignError, check, failureCount, launch, sleep, startSite, waitFor, watch } from './lib.mjs';

let site = await startSite();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  const output = await context.newPage();
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  const settle = (fn, label, timeout = 8000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  const state = (fn) => output.evaluate(fn);
  const source = (id) => output.evaluate((key) => window.thirdEye.engine.mod.get(key), id);
  await waitFor(() => control.evaluate(() => !!window.thirdEye.ui.status), { label: 'status' });

  console.log('tap tempo');
  check('tempo starts at 120', (await state(() => window.thirdEye.store.state.tempo.bpm)) === 120);
  // Five taps 400 ms apart = 150 BPM. Headless Chromium throttles timers in
  // background pages, so the taps carry explicit timestamps instead of being
  // spaced with setTimeout; they still travel control -> output like real ones.
  await control.evaluate(() => {
    const first = Date.now() - 1600;
    for (let i = 0; i < 5; i++) window.thirdEye.store.emit('tap', { at: first + i * 400 });
  });
  await waitFor(() => state(() => window.thirdEye.engine.tempo.taps.length === 5), { label: 'all taps counted' });
  const bpm = await state(() => window.thirdEye.store.state.tempo.bpm);
  check('five taps 400 ms apart read as 150 BPM', Math.abs(bpm - 150) < 4, `${bpm} BPM, tap gaps ${(await state(() => window.thirdEye.engine.tempo.taps.map((t, i, a) => (i ? Math.round(t - a[i - 1]) : 0)).slice(1))).join(' ')} ms`);
  check('the perform screen shows the tempo', await settle(async () => Math.abs(Number(await control.inputValue('#bpm')) - bpm) < 0.01, 'bpm field'));
  const p1 = await source('tempo.phase');
  check('beat ramp runs', p1 >= 0 && p1 < 1 && (await settle(async () => (await source('tempo.phase')) !== p1, 'phase moves')));
  await control.keyboard.press('t');
  check('the T key taps', await settle(() => state(() => window.thirdEye.engine.tempo.taps.length >= 1 && performance.now() - window.thirdEye.engine.tempo.anchor < 3000), 'key tap'));
  check('the tap button blinks on the beat', await settle(() => control.evaluate(() => document.querySelector('.tap').classList.contains('beat')), 'blink on') && (await settle(() => control.evaluate(() => !document.querySelector('.tap').classList.contains('beat')), 'blink off')));

  await control.evaluate(() => window.thirdEye.store.patchItem('lfos', 'lfo.1', { sync: 1, shape: 'saw' }));
  check('a synced LFO locks to the beat', await settle(() => state(() => {
    const { mod } = window.thirdEye.engine;
    // Ramp shape: value = phase * 2 - 1, and phase must equal the beat ramp.
    return Math.abs((mod.get('lfo.1') + 1) / 2 - mod.get('tempo.phase')) < 1e-6;
  }), 'lfo locked'));
  await control.evaluate(() => window.thirdEye.store.patchItem('lfos', 'lfo.1', { sync: 4 }));
  check('a one-bar LFO follows the bar ramp', await settle(() => state(() => {
    const { mod } = window.thirdEye.engine;
    return Math.abs((mod.get('lfo.1') + 1) / 2 - mod.get('tempo.bar')) < 1e-6;
  }), 'bar locked'));
  await control.fill('#bpm', '90');
  await control.keyboard.press('Enter');
  check('typing a BPM sets the tempo', await settle(() => state(() => window.thirdEye.store.state.tempo.bpm === 90), 'typed bpm'));
  await control.evaluate(() => window.thirdEye.ui.setView('edit'));
  check('LFOs offer tempo sync on the edit screen', (await control.locator('#lfo-panel').textContent()).includes('tempo sync'));

  console.log('offline reload');
  const ready = await settle(() => control.evaluate(() => window.thirdEye.ui.offline === 'ready'), 'service worker ready', 20000);
  check('service worker installs and stores the app', ready, await control.evaluate(() => window.thirdEye.ui.offline ?? 'pending'));
  await waitFor(() => control.evaluate(() => !!navigator.serviceWorker.controller), { label: 'controlled', timeout: 10000 }).catch(() => {});
  const cached = await control.evaluate(async () => (await (await caches.open('third-eye-cam')).keys()).map((r) => new URL(r.url).pathname));
  check('pages, scripts and fonts are in the cache', ['/control/', '/output/', '/phone/'].every((p) => cached.includes(p)) && cached.some((p) => p.endsWith('.woff2')) && cached.some((p) => p.includes('vision.worker')), `${cached.length} files`);
  check('the 42 MB of models are not downloaded up front', !cached.some((p) => p.startsWith('/models/')));

  // The hard case: the server is gone entirely.
  await site.close();
  site = null;
  await sleep(300);
  await output.reload();
  check('/output reloads with the server gone and keeps rendering', await settle(() => output.evaluate(() => window.thirdEye?.engine?.renderFps > 0), 'output offline', 15000));
  check('it comes back with the same state', await state(() => window.thirdEye.store.state.tempo.bpm === 90 && window.thirdEye.store.state.lfos[0].sync === 4));
  await control.reload();
  check('/control reloads offline too', await settle(() => control.evaluate(() => !!window.thirdEye?.ui.status && document.querySelectorAll('.tile').length > 5), 'control offline', 15000));
  check('fonts load from the cache', await control.evaluate(() => document.fonts.ready.then(() => document.fonts.check("800 24px 'Big Shoulders Display'"))));
  const phone = await context.newPage();
  watch(phone, 'phone', errors);
  const opened = await phone.goto(`http://localhost:4173/phone/?room=TEST1`).then((r) => r.ok(), () => false);
  check('/phone opens offline once it has been visited or cached', opened && (await phone.locator('#start').isVisible()));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !benignError(e) && !/ERR_INTERNET_DISCONNECTED|Failed to load resource|ERR_FAILED/i.test(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
  await browser.close();
  await site?.close();
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
