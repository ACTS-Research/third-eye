// Glitch as a jump of chosen sliders: the Glitch tab, capturing a glitch
// (move sliders, Keep), the pointer on a slider's bar, firing it (attack,
// release, hold, scatter), and the old tearing for a preset with no jumps.
//   node tests/glitch.mjs

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
  const glitch = () => state(() => window.thirdEye.store.state.glitch);
  const param = (key) => state((k) => window.thirdEye.store.state.chain[0].params[k], key);
  // What the shader is given for a slider of the first effect, this frame.
  const live = (key) => state((k) => [...window.thirdEye.engine.pipeline.cur.instances.values()][0].values[k], key);
  const tearAt = () => state(() => window.thirdEye.engine.glitchStart);
  const saved = () => state(() => window.thirdEye.ui.presets.list[1].scene);

  // Preset 2, Tunnel: Video Feedback (decay 0.95, shiftX 0) then RGB Offset.
  await control.locator('.tile .edit').nth(1).click();
  await waitFor(() => control.locator('#tab-params .fx-head').isVisible(), { label: 'edit screen' });

  console.log('a preset with no jumps');
  check('the Blink tab is there, with no count', (await control.locator('button[data-tab=glitch]').textContent()) === 'Blink');
  check('no slider shows anything of Glitch', (await control.locator('.jump-notch, .jump-to').count()) === 0);
  const t0 = await tearAt();
  await control.keyboard.press('g');
  check('Glitch tears the picture, as before', await settle(async () => (await tearAt()) > t0, 'tear'));
  await control.click('button[data-tab=glitch]');
  check('the tab says so and offers to capture', (await control.locator('#glitch-capture').textContent()) === 'Capture a blink' && (await control.locator('#glitch-panel').textContent()).includes('tears the picture'));
  check('attack, release and scatter each say what they do', (await control.locator('#glitch-panel .param[data-key=attack]').getAttribute('title')).length > 10 && (await control.locator('#glitch-panel .param[data-key=release]').getAttribute('title')).length > 10 && (await control.locator('#glitch-panel .param[data-key=scatter]').getAttribute('title')).length > 10);
  check('the hold switch stands clear of everything else on its row', await control.evaluate(() => { const r = document.querySelector('#glitch-panel .param[data-key=hold]'); const b = r.querySelector('.switch').getBoundingClientRect(); return [...r.children].every((c) => c.classList.contains('switch') || c.getBoundingClientRect().right <= b.left + 1 || c.getBoundingClientRect().left >= b.right - 1); }));
  check('attack is instant and release a third of a second to start with', (await glitch()).attack === 0 && (await glitch()).release === 0.33 && (await glitch()).hold === false);

  console.log('capturing');
  const decay = await param('decay');
  await control.click('#glitch-capture');
  check('Capture opens the Parameters tab under a band that says what to do', (await control.locator('#glitch-band').isVisible()) && (await control.locator('#tab-params').isVisible()) && (await control.locator('#glitch-band').textContent()).includes('Blink settings') && (await control.locator('#glitch-keep').textContent()) === 'Save blink');
  await clickBar(control, paramBar('decay'), 0.2);
  await clickBar(control, paramBar('shiftX'), 0.95);
  check('each slider moved counts as a jump, and is marked as changed', await settle(async () => (await control.locator('#glitch-keep').getAttribute('data-jumps')) === '2' && (await control.locator('#tab-params .param label.changed').count()) === 2, 'count'), await control.locator('#glitch-keep').getAttribute('data-jumps'));
  // A brush of a slider (under a hundredth of its bar) is not a jump.
  await control.evaluate(() => window.thirdEye.store.setParam(window.thirdEye.store.state.chain[0].uid, 'key', 0.355));
  check('a slider barely nudged is left out', await settle(async () => (await control.locator('#glitch-keep').getAttribute('data-jumps')) === '2', 'tiny'), await control.locator('#glitch-keep').getAttribute('data-jumps'));
  const landed = { decay: await param('decay'), shiftX: await param('shiftX') };
  await sleep(700);
  check('nothing is saved into the preset while capturing', (await saved()).chain[0].params.decay === decay);
  await control.click('#glitch-keep');
  check('Save glitch puts the sliders back', await settle(async () => (await param('decay')) === decay && (await param('shiftX')) === 0, 'back'), `${await param('decay')} ${await param('shiftX')}`);
  let g = await glitch();
  check('and keeps where they were as the jumps', g.jumps.length === 2 && g.jumps.find((j) => j.key === 'decay').to === landed.decay && g.jumps.find((j) => j.key === 'shiftX').to === landed.shiftX, JSON.stringify(g.jumps));
  check('the tab lists them', (await control.locator('button[data-tab=glitch]').textContent()) === 'Blink' && (await control.locator('#glitch-capture').textContent()) === 'Recapture' && (await control.locator('.glitch-jump').count()) === 2 && (await control.locator('.glitch-jump').first().textContent()).includes('1 Video Feedback · decay') && !(await control.locator('.glitch-jumps').textContent()).includes('→'), await control.locator('.glitch-jumps').textContent());
  check('the jumps are saved in the preset, the sliders as they were', await settle(async () => (await saved()).glitch.jumps.length === 2 && (await saved()).chain[0].params.decay === decay, 'saved'));

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
  g = await glitch();
  check('dragging the pointer moves the landing place, not the slider', g.jumps.find((j) => j.key === 'shiftX').to < -0.1 && (await param('shiftX')) === 0, JSON.stringify(g.jumps));

  console.log('firing it');
  await control.evaluate(() => window.thirdEye.store.merge('glitch', { release: 3 }));
  const t1 = await tearAt();
  await control.keyboard.press('g');
  check('Glitch throws the sliders to where they land', await settle(async () => Math.abs((await live('decay')) - landed.decay) < 0.2 * Math.abs(decay - landed.decay), 'thrown', 3000), `decay ${await live('decay')}`);
  check('and does not tear the picture as well', (await tearAt()) === t1);
  check('they come back over the release', await settle(async () => Math.abs((await live('decay')) - decay) < 1e-6, 'returned', 8000), `decay ${await live('decay')}`);
  check('the preset\'s own values were never changed', (await param('decay')) === decay);
  // Hold: thrown for as long as the key is down.
  await control.evaluate(() => window.thirdEye.store.merge('glitch', { release: 0.1, hold: true }));
  await control.keyboard.down('g');
  await sleep(900);
  check('with hold on it stays thrown while G is down', Math.abs((await live('decay')) - landed.decay) < 1e-6, `decay ${await live('decay')}`);
  await control.keyboard.up('g');
  check('and returns when G comes up', await settle(async () => Math.abs((await live('decay')) - decay) < 1e-6, 'released', 4000));
  // The same for the Try button on the tab, pressed with the pointer.
  await control.click('button[data-tab=glitch]');
  const tryBox = await control.locator('#glitch-try').boundingBox();
  await control.mouse.move(tryBox.x + 10, tryBox.y + 10);
  await control.mouse.down();
  check('Try it fires it, held for as long as the button is', await settle(async () => Math.abs((await live('decay')) - landed.decay) < 1e-6, 'try', 3000));
  await control.mouse.up();
  check('and lets go with the button', await settle(async () => Math.abs((await live('decay')) - decay) < 1e-6, 'try released', 4000));
  // Scatter: presses land in different places.
  await control.evaluate(() => window.thirdEye.store.merge('glitch', { scatter: 0.5, hold: true }));
  const lands = new Set();
  for (let i = 0; i < 4; i++) {
    await control.keyboard.down('g');
    await sleep(400);
    lands.add((await live('decay')).toFixed(4));
    await control.keyboard.up('g');
    await sleep(400);
  }
  check('with scatter each press lands somewhere else', lands.size > 1, [...lands].join(' '));
  await control.evaluate(() => window.thirdEye.store.merge('glitch', { scatter: 0, hold: false, release: 0.33 }));

  console.log('changing it');
  await control.click('#glitch-capture');
  check('Recapture starts from the glitch as it stands', (await param('decay')) === landed.decay && (await control.locator('#glitch-keep').getAttribute('data-jumps')) === '2', await control.locator('#glitch-keep').getAttribute('data-jumps'));
  await clickBar(control, paramBar('hue'), 0.9);
  await control.click('#glitch-cancel');
  check('Cancel puts everything back and keeps the glitch as it was', (await param('decay')) === decay && (await glitch()).jumps.length === 2 && !(await control.locator('#glitch-band').isVisible()));
  await control.click('button[data-tab=glitch]');
  await control.locator('.glitch-jump').first().locator('button.icon').click();
  check('✕ on a jump removes that one', await settle(async () => (await glitch()).jumps.length === 1 && (await control.locator('.glitch-jump').count()) === 1, 'removed'));
  await control.click('button[data-tab=params]');
  await control.locator('#tab-params .jump-notch').dblclick();
  check('a double-click on the pointer removes the last', await settle(async () => (await glitch()).jumps.length === 0 && (await control.locator('.jump-notch, .jump-to').count()) === 0, 'none'));
  // A capture left open when another preset is loaded is dropped.
  await control.click('button[data-tab=glitch]');
  await control.click('#glitch-capture');
  await clickBar(control, paramBar('decay'), 0.3);
  await control.evaluate(() => window.thirdEye.ui.setView('perform'));
  check('leaving the edit screen ends a capture and puts the sliders back', (await param('decay')) === decay && (await state(() => window.thirdEye.ui.glitchCapture)) === null);
  await sleep(600);
  check('and nothing of it reached the preset', (await saved()).chain[0].params.decay === decay && (await saved()).glitch.jumps.length === 0);

  console.log('other presets');
  await control.locator('.tile .load').nth(2).click();
  check('each preset has its own glitch', await settle(async () => (await glitch()).jumps.length === 0 && (await state(() => window.thirdEye.store.state.presetIndex)) === 2, 'preset 3'));
  check('nothing raised a render error', !(await state(() => window.thirdEye.engine.renderErrorLogged)));
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
