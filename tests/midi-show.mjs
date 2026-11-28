// A show's own MIDI controls, as the operator meets them: the alert when a
// controller is plugged in and nothing is mapped, the strip of MIDI map
// naming the show, its Set up menu (the standard layout by two gestures, a
// copy of another show's, Clear all), the pads and knobs then working, the
// Show menu's way in, and Setup's two lists. /control makes the picture
// here, so the stand-in controller's messages are seen at once.
// (The data underneath is covered in running-order.mjs.)
//   node tests/midi-show.mjs

import { benignError, check, failureCount, launch, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 10000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await context.grantPermissions(['camera', 'microphone', 'midi']);
  // Headless Chromium has no MIDI backend; stand in a fake device.
  await context.addInitScript(() => {
    const input = { name: 'Fake Controller', onmidimessage: null };
    window.__midiInput = input;
    navigator.requestMIDIAccess = async () => ({ inputs: new Map([['1', input]]), onstatechange: null });
  });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.renderFps > 0), { label: 'local engine', timeout: 20000 });

  const mac = (fn, arg) => control.evaluate(fn, arg);
  const midi = (bytes) => mac((b) => window.__midiInput.onmidimessage({ data: new Uint8Array(b) }), bytes);
  const frames = () => mac(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const listening = () => waitFor(() => mac(() => window.thirdEye.engine.midi.learning), { label: 'listening for a control' });
  const bound = () => mac(() => window.thirdEye.store.state.actions.filter((b) => b.source.startsWith('midi.')).map((b) => `${b.source}>${b.action}`).join());
  const count = async () => ((await bound()) ? (await bound()).split(',').length : 0);
  const stored = (name) => mac((n) => (JSON.parse(localStorage.getItem('thirdeye.shows.v1')).shows.find((x) => x.name === n)?.midi ?? []).map((b) => `${b.source}>${b.action}`).join(), name);
  const mapOn = () => mac(() => document.body.classList.contains('midi-map'));
  const tag = () => control.locator('#map-hint .map-show').textContent();
  const hint = () => control.locator('#map-hint .map-text').textContent();
  const says = (text, label) => settle(async () => (await hint()).includes(text), label);
  const setUp = async (text) => {
    await control.click('#map-setup');
    await control.locator('.menu-list .menu-item', { hasText: text }).first().click();
  };
  const label = (selector) => control.locator(selector).first().getAttribute('data-midi-label');
  const alertText = () => mac(() => document.querySelector('#alerts [data-key="midi-empty"]')?.textContent ?? '');
  const STANDARD = [
    ...[0, 1, 2, 3].map((i) => `midi.cc.1.${21 + i}>macro:${i}`),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `midi.note.10.${36 + i}>step:${i}`),
  ].join();

  console.log('a controller with nothing mapped');
  await mac(() => window.thirdEye.ui.setView('setup'));
  check('with MIDI off nothing is said', (await alertText()) === '');
  await control.click('text=Enable MIDI');
  check('once it is on, an alert names the controller and the show', await settle(async () => (await alertText()).includes('Fake Controller is connected') && (await alertText()).includes('My show'), 'alert'), await alertText());
  await control.locator('#alerts [data-key="midi-empty"] .go').click();
  check('its button opens MIDI map, and the alert goes', (await mapOn()) && (await settle(async () => (await alertText()) === '', 'alert gone')));
  check('the strip names the show whose controls these are', (await tag()) === 'MIDI map · My show', await tag());

  console.log('the standard layout, by two gestures');
  await setUp('Standard layout');
  check('it asks for the first knob, and offers to skip or cancel', (await says('1 of 2', 'first')) && (await control.locator('#map-hint .map-skip').isVisible()) && (await control.locator('#map-hint .map-cancel').isVisible()) && (await control.locator('#map-setup').isHidden()), await hint());
  await listening();
  await midi([0x99, 36, 100]);
  check('a pad pressed instead is named as a mistake, and it asks again', await says('That was a pad. Standard layout, 1 of 2', 'pad first'), await hint());
  await midi([0x89, 36, 0]);
  await listening();
  await midi([0xb0, 21, 10]);
  check('a knob moved: it asks for the first pad', await says('2 of 2', 'second'), await hint());
  await listening();
  await midi([0xb0, 21, 20]);
  await listening();
  check('the same knob still turning is not a mistake', !(await hint()).includes('That was'), await hint());
  await midi([0xb0, 30, 5]);
  check('another knob is', await says('That was a knob, or a pad not sending notes (on an LPD8: press PAD). Standard layout, 2 of 2', 'knob second'), await hint());
  await listening();
  check('nothing is mapped until both are answered', (await bound()) === '');
  await midi([0x99, 36, 100]);
  check('a pad pressed: four faders and eight scene pads, counted up from the two', await settle(async () => (await bound()) === STANDARD, 'layout'), await bound());
  await midi([0x89, 36, 0]);
  check('it says what it set, on the perform screen', (await says('Standard layout set: 4 faders, 8 pads.', 'set')) && (await mac(() => window.thirdEye.ui.view === 'perform')) && (await control.locator('#map-setup').isVisible()), await hint());
  check('each fader shows its knob, and with no steps in the show each pad is on the preset it loads', (await label('[data-midi="macro:0"]')) === 'Ch 1 CC 21' && (await label('[data-midi="macro:3"]')) === 'Ch 1 CC 24' && (await label('[data-midi="preset:0"]')) === 'Ch 10 note 36' && (await label('[data-midi="preset:7"]')) === 'Ch 10 note 43' && (await label('.big.blackout')) === null, `${await label('[data-midi="macro:0"]')} | ${await label('[data-midi="preset:0"]')} | ${await label('[data-midi="preset:7"]')}`);
  check('and the layout is stored in the show', (await stored('My show')) === STANDARD);

  console.log('the pads and knobs work');
  await control.keyboard.press('Escape');
  check('Esc leaves MIDI map', !(await mapOn()) && (await control.locator('#map-hint').isHidden()));
  await frames();
  const preset = () => mac(() => window.thirdEye.store.state.presetIndex);
  await midi([0x99, 37, 127]);
  check('with no steps in the show, the second pad loads the second preset', await settle(async () => (await preset()) === 1, 'pad 2'), String(await preset()));
  await midi([0x89, 37, 0]);
  await frames();
  await midi([0x99, 43, 20]);
  check('a pad struck lightly still fires (the eighth: preset 8)', await settle(async () => (await preset()) === 7, 'soft pad'), String(await preset()));
  await midi([0x89, 43, 0]);
  const before = await mac(() => JSON.stringify(window.thirdEye.store.state.chain));
  await midi([0xb0, 21, 0]);
  await frames();
  await midi([0xb0, 21, 127]);
  check('the first knob moves the first fader', await settle(() => mac((was) => JSON.stringify(window.thirdEye.store.state.chain) !== was, before), 'fader moved'));
  // Steps in the show: the same pads now load those.
  await mac(() => {
    const { presets } = window.thirdEye.ui;
    presets.addStep(4);
    presets.addStep(2);
  });
  await frames();
  await midi([0x99, 36, 100]);
  check('with steps in the show, the first pad loads step 1', await settle(() => mac(() => window.thirdEye.store.state.order.cue === 0 && window.thirdEye.store.state.presetIndex === 4), 'step 1'), JSON.stringify(await mac(() => window.thirdEye.store.state.order)));
  await midi([0x89, 36, 0]);
  await frames();
  await midi([0x99, 37, 100]);
  check('and the second, step 2', await settle(() => mac(() => window.thirdEye.store.state.order.cue === 1 && window.thirdEye.store.state.presetIndex === 2), 'step 2'));
  await midi([0x89, 37, 0]);
  await midi([0x99, 40, 100]);
  await frames();
  await frames();
  check('a pad beyond the last step does nothing', await mac(() => window.thirdEye.store.state.order.cue === 1 && window.thirdEye.store.state.presetIndex === 2));
  await midi([0x89, 40, 0]);
  await control.keyboard.press('m');
  check('the pads are now marked on the show\'s steps', (await settle(async () => (await label('[data-midi="step:0"]')) === 'Ch 10 note 36' && (await label('[data-midi="step:1"]')) === 'Ch 10 note 37', 'step labels')), `${await label('[data-midi="step:0"]')}`);
  await control.keyboard.press('Escape');

  console.log('another show');
  await mac(() => window.thirdEye.ui.presets.newShow('Second'));
  await control.click('#show-menu');
  await control.locator('.menu-list .menu-item', { hasText: 'MIDI controls' }).first().click();
  check('the Show menu has a way in, and the strip names the new show', (await mapOn()) && (await tag()) === 'MIDI map · Second', await tag());
  check('a new show starts with the same controls', (await bound()) === STANDARD);
  let asked = '';
  control.once('dialog', (d) => {
    asked = d.message();
    d.accept();
  });
  await setUp('Clear all');
  check('Clear all asks, then clears this show only', (await settle(async () => (await bound()) === '', 'cleared')) && asked.includes('Clear the 12 controls of Second') && (await stored('My show')) === STANDARD && (await stored('Second')) === '', asked);
  check('and the tiles lose their labels', (await label('[data-midi="preset:0"]')) === null && (await label('[data-midi="macro:0"]')) === null);
  await control.click('#map-setup');
  check('the menu lists the other show with what it has', (await control.locator('.menu-list .menu-item', { hasText: 'My show · 12 controls' }).count()) === 1 && (await control.locator('.menu-list .menu-item.disabled', { hasText: 'Clear all' }).count()) === 1, await control.locator('.menu-list').textContent());
  await control.keyboard.press('Escape');
  check('Esc with the menu open closes the menu, not MIDI map', (await control.locator('.menu-list').count()) === 0 && (await mapOn()));
  await setUp('My show');
  check('copying into a show with none asks nothing', (await settle(async () => (await bound()) === STANDARD, 'copied')) && (await says('12 controls copied from My show.', 'copied line')), await hint());
  // One control mapped by hand, as before: click it, press a pad.
  await control.click('.big.blackout');
  await listening();
  await midi([0x90, 50, 127]);
  check('a control mapped by hand is added (Blackout is not in the layout)', await settle(async () => (await bound()).includes('midi.note.1.50>blackout') && (await count()) === 13, 'by hand'), await bound());
  await midi([0x80, 50, 0]);
  check('that is this show\'s alone', (await stored('My show')) === STANDARD && (await stored('Second')).includes('midi.note.1.50>blackout'));
  asked = '';
  control.once('dialog', (d) => {
    asked = d.message();
    d.accept();
  });
  await setUp('My show');
  check('copying over controls asks first, saying what goes', (await settle(async () => (await bound()) === STANDARD, 'copied again')) && asked.includes('Replace the 13 controls of Second with the 12 controls of My show'), asked);
  await setUp('Standard layout');
  await says('1 of 2', 'again');
  await control.keyboard.press('Escape');
  check('Esc cancels the standard layout and stays in MIDI map', (await says('cancelled: nothing was changed', 'cancelled')) && (await mapOn()) && (await bound()) === STANDARD && (await control.locator('#map-setup').isVisible()), await hint());
  await setUp('Standard layout');
  await says('1 of 2', 'once more');
  await control.click('#map-hint .map-skip');
  await says('2 of 2', 'skipped');
  await listening();
  await midi([0x90, 60, 100]);
  check('with the knobs skipped only the pads are set anew; the faders stay', await settle(async () => {
    const now = await bound();
    return now.includes('midi.cc.1.21>macro:0') && now.includes('midi.note.1.60>step:0') && now.includes('midi.note.1.67>step:7') && !now.includes('midi.note.10.') && (await count()) === 12;
  }, 'pads only'), await bound());
  await midi([0x80, 60, 0]);
  check('and it says so', await says('Standard layout set: 8 pads.', 'pads line'), await hint());
  await control.keyboard.press('Escape');

  console.log('Setup: two lists');
  await mac(() => window.thirdEye.ui.setView('setup'));
  const rows = (id) => control.locator(`#${id} .binding`).count();
  check('the triggers in one, this show\'s MIDI controls in the other, under its name', (await rows('trigger-list')) === 4 && (await rows('midi-list')) === 12 && (await control.locator('#midi-list-show').textContent()) === 'Second', `${await rows('trigger-list')} and ${await rows('midi-list')}`);
  await mac(() => {
    const { presets } = window.thirdEye.ui;
    presets.makeLive(presets.shows.find((x) => x.name === 'My show').id);
  });
  check('another show going live swaps the second list and its name', await settle(async () => (await control.locator('#midi-list-show').textContent()) === 'My show' && (await bound()) === STANDARD && (await rows('midi-list')) === 12 && (await rows('trigger-list')) === 4, 'swapped'));
  await mac(() => window.thirdEye.ui.presets.newShow('Bare'));
  await mac(() => {
    const { store } = window.thirdEye;
    store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.filter((b) => !b.source.startsWith('midi.')) });
  });
  check('a show with none says so', await settle(async () => (await rows('midi-list')) === 0 && (await control.locator('#midi-list-note').textContent()).startsWith('None in this show.'), 'none'), await control.locator('#midi-list-note').textContent());
  check('and the alert is back, naming it', await settle(async () => (await alertText()).includes('nothing in Bare is mapped'), 'alert back'), await alertText());
  await control.locator('#alerts [data-key="midi-empty"] .close').click();
  await frames();
  check('closed, it stays closed', (await alertText()) === '');

  console.log('a knob on the mix of A and B');
  const mixOf = () => mac(() => window.thirdEye.store.state.chain.find((it) => it.type === 'mixb')?.mix ?? null);
  await mac(() => window.thirdEye.ui.setView('perform'));
  await control.keyboard.press('m');
  check('in MIDI map the mix bar under the picture is one of the controls', (await mapOn()) && (await control.locator('#mixbar').getAttribute('data-midi')) === 'mix');
  await control.click('#mixbar');
  check('clicked, it waits for a knob, by name', await says('Mix A / B: now move a knob', 'armed'), await hint());
  await listening();
  await midi([0xb0, 30, 64]);
  check('a knob turned is put on it', await settle(async () => (await bound()) === 'midi.cc.1.30>mix', 'mix bound'), await bound());
  check('and the bar shows which', (await label('#mixbar')) === 'Ch 1 CC 30');
  await control.keyboard.press('Escape');
  check('mapping it did not touch the preset', (await mixOf()) === null);
  await frames();
  await midi([0xb0, 30, 127]);
  check('turned in a preset with no Mix B, the knob adds one, as the bar does, and sets it', await settle(async () => (await mixOf()) === 1, 'mix added'), String(await mixOf()));
  await midi([0xb0, 30, 32]);
  check('and from then on it moves the mix', await settle(async () => Math.abs((await mixOf()) - 0.25) < 0.01, 'mix moved'), String(await mixOf()));
  check('the bar on the screen follows the knob', await settle(async () => Math.abs(Number(await control.locator('#mixbar').getAttribute('aria-valuenow')) - 0.25) < 0.01, 'bar follows'), await control.locator('#mixbar').getAttribute('aria-valuenow'));
  await midi([0xb0, 30, 0]);
  check('all the way down is input A alone', await settle(async () => (await mixOf()) === 0, 'mix zero'));

  const real = errors.filter((e) => !benignError(e));
  check('no errors in the window', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  console.log(`  FAIL ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stopPeerServer(peerServer);
  await site.close();
}

console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() || process.exitCode ? 1 : 0);
