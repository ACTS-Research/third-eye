// Blink as a jump of chosen sliders: the Blink tab, capturing a blink
// (move sliders, Keep), the pointer on a slider's bar, firing it (attack,
// release, hold, scatter), and the old tearing for a preset with no jumps.
//   node tests/blink.mjs

import { check, clickBar, failureCount, launch, paramBar, sleep, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 6000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.renderFps > 0), { label: 'engine', timeout: 20000 });
  const state = (fn, arg) => control.evaluate(fn, arg);
  const blink = () => state(() => window.thirdEye.store.state.blink);
  const param = (key) => state((k) => window.thirdEye.store.state.chain[0].params[k], key);
  // What the shader is given for a slider of the first effect, this frame.
  const live = (key) => state((k) => [...window.thirdEye.engine.pipeline.cur.instances.values()][0].values[k], key);
  const tearAt = () => state(() => window.thirdEye.engine.blinkStart);
  const saved = () => state(() => window.thirdEye.ui.presets.list[1].scene);

  // Preset 2, Tunnel: Video Feedback (decay 0.95, shiftX 0) then RGB Offset.
  await control.locator('.tile .edit').nth(1).click();
  await waitFor(() => control.locator('#tab-params .fx-head').isVisible(), { label: 'edit screen' });

  console.log('a preset with no jumps');
  check('the Blink tab is there, with no count', (await control.locator('button[data-tab=blink]').textContent()) === 'Blink');
  check('no slider shows anything of Blink', (await control.locator('.jump-notch, .jump-to').count()) === 0);
  const t0 = await tearAt();
  await control.keyboard.press('b');
  check('Blink tears the picture, as before', await settle(async () => (await tearAt()) > t0, 'tear'));
  await control.click('button[data-tab=blink]');
  check('the tab says so and offers to capture', (await control.locator('#blink-capture').textContent()) === 'Capture a blink' && (await control.locator('#blink-panel').textContent()).includes('tears the picture'));
  check('attack, release and scatter each say what they do', (await control.locator('#blink-panel .param[data-key=attack]').getAttribute('title')).length > 10 && (await control.locator('#blink-panel .param[data-key=release]').getAttribute('title')).length > 10 && (await control.locator('#blink-panel .param[data-key=scatter]').getAttribute('title')).length > 10);
  check('the hold switch stands clear of everything else on its row', await control.evaluate(() => { const r = document.querySelector('#blink-panel .param[data-key=hold]'); const b = r.querySelector('.switch').getBoundingClientRect(); return [...r.children].every((c) => c.classList.contains('switch') || c.getBoundingClientRect().right <= b.left + 1 || c.getBoundingClientRect().left >= b.right - 1); }));
  check('attack is instant and release a third of a second to start with', (await blink()).attack === 0 && (await blink()).release === 0.33 && (await blink()).hold === false);

  console.log('capturing');
  const decay = await param('decay');
  await control.click('#blink-capture');
  check('Capture opens the Parameters tab under a band that says what to do', (await control.locator('#blink-band').isVisible()) && (await control.locator('#tab-params').isVisible()) && (await control.locator('#blink-band').textContent()).includes('Blink settings') && (await control.locator('#blink-keep').textContent()) === 'Save blink');
  await clickBar(control, paramBar('decay'), 0.2);
  await clickBar(control, paramBar('shiftX'), 0.95);
  check('each slider moved counts as a jump, and is marked as changed', await settle(async () => (await control.locator('#blink-keep').getAttribute('data-jumps')) === '2' && (await control.locator('#tab-params .param label.changed').count()) === 2, 'count'), await control.locator('#blink-keep').getAttribute('data-jumps'));
  // A brush of a slider (under a hundredth of its bar) is not a jump.
  await control.evaluate(() => window.thirdEye.store.setParam(window.thirdEye.store.state.chain[0].uid, 'key', 0.355));
  check('a slider barely nudged is left out', await settle(async () => (await control.locator('#blink-keep').getAttribute('data-jumps')) === '2', 'tiny'), await control.locator('#blink-keep').getAttribute('data-jumps'));
  const landed = { decay: await param('decay'), shiftX: await param('shiftX') };
  await sleep(700);
  check('nothing is saved into the preset while capturing', (await saved()).chain[0].params.decay === decay);
  await control.click('#blink-keep');
  check('Save blink puts the sliders back', await settle(async () => (await param('decay')) === decay && (await param('shiftX')) === 0, 'back'), `${await param('decay')} ${await param('shiftX')}`);
  let g = await blink();
  check('and keeps where they were as the jumps', g.jumps.length === 2 && g.jumps.find((j) => j.key === 'decay').to === landed.decay && g.jumps.find((j) => j.key === 'shiftX').to === landed.shiftX, JSON.stringify(g.jumps));
  check('the tab lists them', (await control.locator('button[data-tab=blink]').textContent()) === 'Blink' && (await control.locator('#blink-capture').textContent()) === 'Recapture' && (await control.locator('.blink-jump').count()) === 2 && (await control.locator('.blink-jump').first().textContent()).includes('1 Video Feedback · decay') && !(await control.locator('.blink-jumps').textContent()).includes('→'), await control.locator('.blink-jumps').textContent());
  check('the jumps are saved in the preset, the sliders as they were', await settle(async () => (await saved()).blink.jumps.length === 2 && (await saved()).chain[0].params.decay === decay, 'saved'));

  console.log('the pointer on the bar');
  await control.click('button[data-tab=params]');
  check('a slider with a jump has a pointer on its bar and the landing value under its number', (await control.locator('#tab-params .param[data-key=decay] .jump-notch').isVisible()) && (await control.locator('#tab-params .param[data-key=decay] .jump-to').textContent()) === `→ ${landed.decay.toFixed(3)}`, await control.locator('#tab-params .param[data-key=decay] .jump-to').textContent());
  check('a slider without one has neither', (await control.locator('#tab-params .param[data-key=zoom] .jump-notch').count()) === 0 && (await control.locator('.jump-notch').count()) === 2);
  check('the pointer sits over the landing place on the bar', await state(() => {
    const row = document.querySelector('#tab-params .param[data-key=shiftX]');
    const bar = row.querySelector('input.bar').getBoundingClientRect();
    const n = row.querySelector('.jump-notch').getBoundingClientRect();
    const at = (n.left + n.width / 2 - bar.left) / bar.width;
    return Math.abs(at - 0.95) < 0.03 && n.bottom <= bar.top + 6;
  }));
  // Drag the pointer of shiftX to the left end of its bar.
  const notch = await control.locator('#tab-params .param[data-key=shiftX] .jump-notch').boundingBox();
  const bar = await control.locator(paramBar('shiftX')).boundingBox();
  await control.mouse.move(notch.x + notch.width / 2, notch.y + notch.height / 2);
  await control.mouse.down();
  await control.mouse.move(bar.x + bar.width * 0.1, notch.y + notch.height / 2, { steps: 4 });
  await control.mouse.up();
  g = await blink();
  check('dragging the pointer moves the landing place, not the slider', g.jumps.find((j) => j.key === 'shiftX').to < -0.1 && (await param('shiftX')) === 0, JSON.stringify(g.jumps));

  console.log('firing it');
  await control.evaluate(() => window.thirdEye.store.merge('blink', { release: 3 }));
  // The page records the slider every frame: a page slow to answer (the
  // sandbox can take over a second per look) would otherwise first look
  // when the sliders are already on their way back.
  await control.evaluate(() => {
    window.__seen = [];
    const tick = () => {
      window.__seen.push([...window.thirdEye.engine.pipeline.cur.instances.values()][0].values.decay);
      if (window.__seen.length < 3000) requestAnimationFrame(tick);
    };
    tick();
  });
  const t1 = await tearAt();
  await control.keyboard.press('b');
  const nearest = () => control.evaluate((to) => Math.min(...window.__seen.map((v) => Math.abs(v - to))), landed.decay);
  check('Blink throws the sliders to where they land', await settle(async () => (await nearest()) < 0.2 * Math.abs(decay - landed.decay), 'thrown', 5000), `nearest ${await nearest()}`);
  check('and does not tear the picture as well', (await tearAt()) === t1);
  check('they come back over the release', await settle(async () => Math.abs((await live('decay')) - decay) < 1e-6, 'returned', 20000), `decay ${await live('decay')}`);
  check('the preset\'s own values were never changed', (await param('decay')) === decay);
  // Hold: thrown for as long as the key is down.
  await control.evaluate(() => window.thirdEye.store.merge('blink', { release: 0.1, hold: true }));
  await control.keyboard.down('b');
  await sleep(900);
  check('with hold on it stays thrown while B is down', Math.abs((await live('decay')) - landed.decay) < 1e-6, `decay ${await live('decay')}`);
  await control.keyboard.up('b');
  check('and returns when B comes up', await settle(async () => Math.abs((await live('decay')) - decay) < 1e-6, 'released', 4000));
  // The same for the Try button on the tab, pressed with the pointer.
  await control.click('button[data-tab=blink]');
  const tryBox = await control.locator('#blink-try').boundingBox();
  await control.mouse.move(tryBox.x + 10, tryBox.y + 10);
  await control.mouse.down();
  check('Try it fires it, held for as long as the button is', await settle(async () => Math.abs((await live('decay')) - landed.decay) < 1e-6, 'try', 3000));
  await control.mouse.up();
  check('and lets go with the button', await settle(async () => Math.abs((await live('decay')) - decay) < 1e-6, 'try released', 4000));
  // Scatter: presses land in different places.
  await control.evaluate(() => window.thirdEye.store.merge('blink', { scatter: 0.5, hold: true }));
  const lands = new Set();
  for (let i = 0; i < 4; i++) {
    await control.keyboard.down('b');
    await sleep(400);
    lands.add((await live('decay')).toFixed(4));
    await control.keyboard.up('b');
    await sleep(400);
  }
  check('with scatter each press lands somewhere else', lands.size > 1, [...lands].join(' '));
  await control.evaluate(() => window.thirdEye.store.merge('blink', { scatter: 0, hold: false, release: 0.33 }));

  console.log('changing it');
  await control.click('#blink-capture');
  check('Recapture starts from the blink as it stands', (await param('decay')) === landed.decay && (await control.locator('#blink-keep').getAttribute('data-jumps')) === '2', await control.locator('#blink-keep').getAttribute('data-jumps'));
  await clickBar(control, paramBar('hue'), 0.9);
  await control.click('#blink-cancel');
  check('Cancel puts everything back and keeps the blink as it was', (await param('decay')) === decay && (await blink()).jumps.length === 2 && !(await control.locator('#blink-band').isVisible()));
  await control.click('button[data-tab=blink]');
  await control.locator('.blink-jump').first().locator('button.icon').click();
  check('✕ on a jump removes that one', await settle(async () => (await blink()).jumps.length === 1 && (await control.locator('.blink-jump').count()) === 1, 'removed'));
  await control.click('button[data-tab=params]');
  await control.locator('#tab-params .jump-notch').dblclick();
  check('a double-click on the pointer removes the last', await settle(async () => (await blink()).jumps.length === 0 && (await control.locator('.jump-notch, .jump-to').count()) === 0, 'none'));
  // A capture left open when another preset is loaded is dropped.
  await control.click('button[data-tab=blink]');
  await control.click('#blink-capture');
  await clickBar(control, paramBar('decay'), 0.3);
  await control.evaluate(() => window.thirdEye.ui.setView('perform'));
  check('leaving the edit screen ends a capture and puts the sliders back', (await param('decay')) === decay && (await state(() => window.thirdEye.ui.blinkCapture)) === null);
  await sleep(600);
  check('and nothing of it reached the preset', (await saved()).chain[0].params.decay === decay && (await saved()).blink.jumps.length === 0);

  console.log('other presets');
  await control.locator('.tile .load').nth(2).click();
  check('each preset has its own blink', await settle(async () => (await blink()).jumps.length === 0 && (await state(() => window.thirdEye.store.state.presetIndex)) === 2, 'preset 3'));
  check('nothing raised a render error', !(await state(() => window.thirdEye.engine.renderErrorLogged)));

  console.log('the keys');
  await control.keyboard.press('Backspace');
  check('delete is Blackout', await settle(() => state(() => window.thirdEye.store.state.globals.blackout === true), 'blackout on'));
  await control.keyboard.press('Delete');
  check('and again, off (forward-delete too)', await settle(() => state(() => window.thirdEye.store.state.globals.blackout === false), 'blackout off'));
  check('the buttons say so', (await control.locator('.panic .blackout span').textContent()) === '⌫' && (await control.locator('.panic [data-midi="blink"] span').textContent()) === 'B');

  console.log('saved under its old name');
  // Presets, a session and triggers saved before 24 November 2026 call it
  // `glitch`: they must come back as Blink.
  const old = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await old.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    const scene = { chain: [{ uid: 'a1', type: 'feedback', params: { decay: 0.9 }, mix: 1, bypass: false, target: 'all' }], mappings: [], lfos: [], macros: [], glitch: { attack: 0.2, release: 0.5, scatter: 0, hold: true, jumps: [{ fx: 'a1', key: 'decay', to: 0.5 }] } };
    localStorage.setItem('thirdeye.presets.v1', JSON.stringify([{ id: 'old01', name: 'Old one', fade: null, scene }]));
    localStorage.setItem('thirdeye.session.v1', JSON.stringify({ input: { kind: 'pattern' }, ...scene, actions: [{ id: 'x1', source: 'trig.1', action: 'glitch', hold: false }, { id: 'x2', source: 'midi.note.36', action: 'glitch', hold: true }] }));
  });
  const page = await old.newPage();
  watch(page, 'old', errors);
  await page.goto(`${site.url}/control/`);
  await waitFor(() => page.evaluate(() => !!window.thirdEye?.ui?.presets), { label: 'old control' });
  const got = await page.evaluate(() => ({ actions: window.thirdEye.store.state.actions.map((a) => a.action), live: window.thirdEye.store.state.blink, preset: window.thirdEye.ui.presets.list[0].scene.blink }));
  check('a trigger or MIDI pad set to Glitch is set to Blink', got.actions.join() === 'blink,blink', got.actions.join());
  check('the session\'s blink came back', got.live?.jumps?.length === 1 && got.live.hold === true && got.live.attack === 0.2, JSON.stringify(got.live));
  check('and a saved preset\'s', got.preset?.jumps?.length === 1 && got.preset.jumps[0].to === 0.5, JSON.stringify(got.preset));
  await old.close();
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !/peerjs|WebSocket|ERR_CONNECTION_REFUSED|Lost connection|server-error|socket/i.test(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
  await browser.close();
  await site.close();
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
