// Stage 3 of the effects plan: Time (a longer memory, and how far back each
// point looks chosen by the "driven by" menu), Scan (scan lines lifted into
// relief), and segmentation switching itself on for an effect driven by the
// body. /control alone hosts the engine; the picture is the test pattern.
//   node tests/time-scan.mjs

import { addEffect, benignError, check, failureCount, launch, outputStats, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await waitFor(() => control.evaluate(() => window.thirdEye.engine?.running), { label: 'control hosting', timeout: 20000 });
  // outputStats reads the small readback; pretend a control page is watching.
  await control.evaluate(() => {
    window.thirdEye.engine.remoteControlSeenAt = Infinity;
    window.thirdEye.store.merge('globals', { renderScale: 0.5 });
  });
  const settle = (fn, label, timeout = 10000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  const setChain = (chain) => control.evaluate((c) => {
    const { store } = window.thirdEye;
    store.setScene({ chain: c.map(([type, params], i) => ({ uid: `t${i}${type}`, type, params, mix: 1, bypass: false, target: 'all' })), mappings: [], lfos: store.state.lfos });
  }, chain);
  const inst = () => control.evaluate(() => {
    const p = window.thirdEye.engine.pipeline;
    const i = [...p.cur.instances.values()][0];
    return i && { span: i.history?.span, frames: i.history?.frames, gap: i.history?.gap, motion: p.cur.usesMotion(), body: p.wantsBody };
  });
  const errored = () => control.evaluate(() => window.thirdEye.engine.renderErrorLogged);

  console.log('Time');
  await setChain([]);
  await control.waitForTimeout(800);
  const clean = (await outputStats(control)).hash;
  for (const reach of [1, 4, 8]) {
    await setChain([['delay', { reach, spread: 1 }]]);
    // The span follows the frames really stored: give it time to settle.
    const ok = await settle(async () => {
      const i = await inst();
      if (!i?.span) return false;
      const every = Math.max(reach / i.frames, i.gap);
      const covered = i.span * every;
      return i.span <= i.frames && Math.abs(covered - reach) < reach * 0.15 && (i.span === i.frames || reach / every <= i.frames + 1);
    }, `reach ${reach}`, 15000);
    const i = await inst();
    check(`reach ${reach} s: the frames in use cover ${reach} s`, ok, JSON.stringify(i));
  }
  check('256 frames are kept', (await inst()).frames === 256);
  check('Time changes the picture', await settle(async () => (await outputStats(control)).hash !== clean, 'time differs'));
  for (const [drive, name] of [[1, 'Input B'], [2, 'Motion'], [3, 'The body']]) {
    await setChain([['delay', { reach: 2, spread: 1, drive }]]);
    await control.waitForTimeout(400);
    check(`Time driven by ${name} draws`, !(await errored()) && (await outputStats(control)).mean > 1);
  }
  await setChain([['delay', { reach: 2, spread: 1, drive: 2 }]]);
  check('driven by Motion, the motion map is made', await settle(async () => (await inst())?.motion === true, 'motion wanted'));
  await setChain([['delay', { reach: 2, spread: 1, drive: 0 }]]);
  check('driven by Itself, it is not', await settle(async () => (await inst())?.motion === false, 'motion not wanted'));

  console.log('the edit screen');
  await control.evaluate(() => window.thirdEye.store.setScene({ chain: [], mappings: [], lfos: window.thirdEye.store.state.lfos }));
  await control.evaluate(() => window.thirdEye.ui.setView('edit'));
  await addEffect(control, 'delay');
  const rows = async () => control.locator('#tab-params .param').evaluateAll((els) => els.map((e) => e.dataset.key));
  check('Time shows reach, delay, spread, driven by and shape', await settle(async () => {
    const r = await rows();
    return ['reach', 'delay', 'spread', 'drive', 'mode'].every((k) => r.includes(k));
  }, 'time rows'), (await rows()).join(', '));
  check('the menu reads "driven by"', (await control.locator('#tab-params .param[data-key="drive"]').textContent()).includes('driven by'));
  await addEffect(control, 'scan');
  check('Scan shows its sliders and driven by', await settle(async () => {
    const r = await rows();
    return ['lines', 'lift', 'thickness', 'drive', 'between', 'colour', 'direction'].every((k) => r.includes(k));
  }, 'scan rows'), (await rows()).join(', '));
  check('the effect menu names them Time and Scan', await control.evaluate(() => {
    document.getElementById('add-effect').click();
    const names = [...document.querySelectorAll('.menu-list .menu-item')].map((e) => e.textContent);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return names.includes('Time') && names.includes('Scan') && !names.some((n) => n.includes('Slit-scan'));
  }));
  await control.keyboard.press('Escape');

  console.log('Scan');
  for (const [drive, name] of [[0, 'Itself'], [1, 'Input B'], [2, 'Motion'], [3, 'The body']]) {
    await setChain([['scan', { drive, between: 1 }]]);
    const changed = await settle(async () => (await outputStats(control)).hash !== clean, `scan ${name}`);
    check(`Scan driven by ${name} draws lines over the picture`, changed && !(await errored()));
  }
  await setChain([['scan', { direction: 1, lift: -0.8, lines: 300 }]]);
  check('Scan down, pushed down, 300 lines', await settle(async () => (await outputStats(control)).hash !== clean, 'scan down') && !(await errored()));
  // Lift 0 is plain scan lines; with lift the lines move.
  await setChain([['scan', { lift: 0 }]]);
  await control.waitForTimeout(600);
  const flat = (await outputStats(control)).hash;
  await control.keyboard.press(' '); // freeze, so only the lift differs
  await setChain([['scan', { lift: 0 }]]);
  await control.waitForTimeout(600);
  const flatFrozen = (await outputStats(control)).hash;
  await setChain([['scan', { lift: 0.8 }]]);
  check('lift raises the lines', await settle(async () => (await outputStats(control)).hash !== flatFrozen, 'lifted'), String(flat));
  await control.keyboard.press(' ');

  console.log('the body');
  const vision = () => control.evaluate(() => ({ segmenting: window.thirdEye.engine.vision.segmenting, forBody: window.thirdEye.engine.forBody, setup: window.thirdEye.store.state.vision.segment, status: window.thirdEye.ui.status?.vision?.forBody }));
  check('segmentation is off to start with', (await vision()).segmenting === false);
  await setChain([['scan', { drive: 3 }]]);
  check('driven by the body, segmentation switches itself on', await settle(async () => {
    const v = await vision();
    return v.segmenting && v.forBody && !v.setup;
  }, 'segmenting'), JSON.stringify(await vision()));
  // (The badge reads "loading…" until the model is up, then "on for the body".)
  const badge = () => control.locator('#vision-panel button', { hasText: 'Segmentation' }).locator('span').textContent();
  check('Setup → Vision says it is on, its own switch still off', await settle(async () => (await vision()).status === true && (await badge()).trim() !== '', 'badge') && !(await control.locator('#vision-panel button', { hasText: 'Segmentation' }).evaluate((b) => b.classList.contains('on'))), await badge());
  await control.evaluate(() => {
    const { store } = window.thirdEye;
    store.setScene({ chain: store.state.chain.map((it) => ({ ...it, bypass: true })), mappings: [], lfos: store.state.lfos });
  });
  check('bypassed, it stays on a while (no reload on a quick change)', await control.waitForTimeout(2000).then(vision).then((v) => v.segmenting));
  check('and goes off by itself after about ten seconds', await settle(async () => !(await vision()).segmenting, 'segmentation off', 25000), JSON.stringify(await vision()));
  await control.evaluate(() => window.thirdEye.store.merge('vision', { segment: true }));
  await setChain([['delay', { drive: 3 }]]);
  await setChain([]);
  check('switched on in Setup, it is left on', await control.waitForTimeout(12000).then(vision).then((v) => v.segmenting && !v.forBody));
  await control.evaluate(() => window.thirdEye.store.merge('vision', { segment: false }));

  check('no errors on the page', errors.filter((e) => !benignError(e)).length === 0, errors.join('\n'));
} catch (err) {
  console.error(err);
  check('suite ran to the end', false, err.message);
} finally {
  await browser.close();
  await site.close();
}

console.log(`\n${failureCount()} check(s) failed`);
process.exit(failureCount() ? 1 : 0);
