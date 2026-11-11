// Phase 4 test: Web MIDI handling with learn mode, and audio analysis from
// Chromium's fake microphone (a beep roughly once a second).
//   node tests/midi-audio.mjs

import { benignError, check, failureCount, launch, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await context.grantPermissions(['camera', 'microphone', 'midi']);
  // Headless Chromium has no MIDI backend (requestMIDIAccess never settles),
  // so stand in a fake device. Messages go through its onmidimessage, the
  // same path a real controller uses.
  await context.addInitScript(() => {
    const input = { name: 'Fake Controller', onmidimessage: null };
    window.__midiInput = input;
    navigator.requestMIDIAccess = async () => ({ inputs: new Map([['1', input]]), onstatechange: null });
  });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  const output = await context.newPage();
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  await waitFor(() => control.evaluate(() => !!window.thirdEye.ui.status), { label: 'status' });

  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const source = (id) => output.evaluate((key) => window.thirdEye.engine.mod.get(key), id);
  const settle = (fn, label, timeout = 8000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  const midi = (bytes) => output.evaluate((b) => window.__midiInput.onmidimessage({ data: new Uint8Array(b) }), bytes);
  // Headless Chromium starves background pages of frames; where a step needs
  // the engine to have looked at the last message, wait for two frames.
  const frames = () => output.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  console.log('audio');
  await control.evaluate(() => window.thirdEye.ui.setView('setup'));
  await control.click('text=Enable audio');
  check('audio analysis starts in the output window', await settle(async () => (await status()).audio.state === 'live', 'audio live'), (await status()).audio.label);
  check('level follows the signal', await settle(async () => (await source('audio.level')) > 0.05, 'level'));
  check('a band responds', await settle(async () => (await source('audio.mid')) > 0.05, 'mid band'));
  check('beat detector fires on the beeps', await settle(async () => (await status()).audio.beats >= 2, 'beats', 12000), `${(await status()).audio.beats} beats`);
  check('beat pulse decays between hits', await settle(async () => (await source('audio.beat')) < 0.2, 'beat decay'));
  check('audio meters appear on control', await control.evaluate(() => !!document.querySelector('.meter[title="audio.level"]')));
  // Polled from here rather than timed inside the page: headless Chromium
  // gives a background page too few frames for a fixed window to be fair.
  const peak = async (ms) => {
    let top = 0;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      top = Math.max(top, await source('audio.level'));
      await new Promise((r) => setTimeout(r, 60));
    }
    return top;
  };
  await control.evaluate(() => window.thirdEye.store.merge('audio', { gain: 0.2 }));
  await new Promise((r) => setTimeout(r, 500));
  const quiet = await peak(3000);
  await control.evaluate(() => window.thirdEye.store.merge('audio', { gain: 4 }));
  const loudEnough = await settle(async () => (await source('audio.level')) > Math.max(0.9, quiet * 2), 'louder', 12000);
  check('gain scales the level', loudEnough && quiet < 0.5, `peak ${quiet.toFixed(3)} at 0.2x, reaches ${(await peak(1500)).toFixed(3)} at 4x`);
  await control.click('text=Audio on');
  check('disabling audio releases the microphone', await settle(async () => (await status()).audio.state === 'off' && (await output.evaluate(() => window.thirdEye.engine.audio.stream === null)), 'audio off'));

  console.log('midi');
  await control.click('text=Enable MIDI');
  const ready = await settle(async () => (await status()).midi.state === 'ready', 'midi state');
  const midiState = (await status()).midi;
  check('MIDI opens in the output window and binds the device', ready && midiState.inputs[0] === 'Fake Controller', `state: ${midiState.state}, inputs: ${midiState.inputs.join(', ')}`);

  await midi([0xb0, 74, 64]);
  check('CC becomes a 0..1 source', Math.abs((await source('midi.cc.1.74')) - 64 / 127) < 1e-6);
  await midi([0x92, 36, 127]);
  check('note on becomes a gate on its channel', (await source('midi.note.3.36')) === 1);
  await midi([0x82, 36, 0]);
  check('a release is held until a frame has seen the press', (await source('midi.note.3.36')) === 1);
  await frames();
  check('note off then closes the gate', (await source('midi.note.3.36')) === 0);
  check('MIDI sources get meters on control', await settle(() => control.evaluate(() => !!document.querySelector('.meter[title="midi.cc.1.74"]')), 'midi meter'));

  // MIDI map mode: every mappable control is outlined; click one, then
  // move a knob or press a pad.
  const armed = () => waitFor(() => output.evaluate(() => window.thirdEye.engine.midi.learning), { label: 'learn armed' });
  const hint = () => control.locator('#map-hint').textContent();
  await control.evaluate(() => window.thirdEye.ui.setView('edit'));
  await control.click('#midi-map-toggle');
  check('map mode outlines the controls', await control.evaluate(() => document.body.classList.contains('midi-map')) && (await control.locator('#map-hint').isVisible()));

  // An effect parameter: touching its slider arms it.
  const slider = control.locator('.fx').first().locator('.tp-sldv_t').nth(2); // feedback rotate
  const box = await slider.boundingBox();
  await control.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  check('touching a parameter arms it by name', (await hint()).includes('rotate'), await hint());
  await armed();
  await midi([0xb0, 21, 127]);
  check('knob is mapped to the touched parameter', await settle(() => output.evaluate(() => {
    const m = window.thirdEye.store.state.mappings.find((x) => x.source === 'midi.cc.1.21');
    return m && m.key === 'rotate' && m.mode === 'set';
  }), 'mapping'));
  const rotate = () => output.evaluate(() => [...window.thirdEye.engine.pipeline.cur.instances.values()][0].values.rotate);
  check('knob at maximum drives the parameter to its maximum', await settle(async () => Math.abs((await rotate()) - 0.2) < 0.005, 'max'), `rotate ${(await rotate()).toFixed(3)}`);
  await midi([0xb0, 21, 0]);
  check('knob at minimum drives it to its minimum', await settle(async () => Math.abs((await rotate()) + 0.2) < 0.005, 'min'), `rotate ${(await rotate()).toFixed(3)}`);
  check('learn disarms after one control', await output.evaluate(() => window.thirdEye.engine.midi.learning === false));

  // A panic button: clicking it in map mode selects it, it does not fire.
  await control.evaluate(() => window.thirdEye.ui.setView('perform'));
  await control.click('.big.blackout');
  check('clicking a control in map mode does not trigger it', await output.evaluate(() => window.thirdEye.store.state.globals.blackout === false));
  await armed();
  await midi([0x99, 40, 100]);
  check('pad is bound to blackout', await settle(() => output.evaluate(() => window.thirdEye.store.state.actions.some((b) => b.source === 'midi.note.10.40' && b.action === 'blackout')), 'binding'));
  check('the control shows what is mapped to it', await settle(() => control.evaluate(() => document.querySelector('.big.blackout').dataset.midiLabel === 'Ch 10 note 40'), 'label'), await control.evaluate(() => document.querySelector('.big.blackout').dataset.midiLabel ?? ''));
  await midi([0x89, 40, 0]);
  await frames();
  // A tap far shorter than a frame: press and release back to back.
  await midi([0x99, 40, 100]);
  await midi([0x89, 40, 0]);
  check('a very quick pad tap still fires blackout', await settle(() => output.evaluate(() => window.thirdEye.store.state.globals.blackout === true), 'blackout'));
  await frames();
  await midi([0x99, 40, 100]);
  await midi([0x89, 40, 0]);
  check('and a second tap releases it', await settle(() => output.evaluate(() => window.thirdEye.store.state.globals.blackout === false), 'blackout off'));
  await frames();

  // A preset tile.
  await control.locator('.tile .load').nth(2).click();
  check('a preset tile can be armed without loading it', (await hint()).includes('Preset 3') && (await output.evaluate(() => window.thirdEye.store.state.presetIndex)) !== 2, await hint());
  await armed();
  await midi([0x99, 41, 100]);
  await settle(() => output.evaluate(() => window.thirdEye.store.state.actions.some((b) => b.action === 'preset:2')), 'preset binding');
  await midi([0x89, 41, 0]);
  await frames();
  await midi([0x99, 41, 100]);
  check('MIDI pad loads its preset', await settle(() => output.evaluate(() => window.thirdEye.store.state.presetIndex === 2), 'preset loaded'));
  await midi([0x89, 41, 0]);

  // A perform fader: the knob moves the parameter itself, so the screen follows.
  await settle(() => control.evaluate(() => document.querySelectorAll('.fader').length > 0 && window.thirdEye.store.state.presetIndex === 2), 'faders');
  await control.locator('.fader').first().click();
  await armed();
  await midi([0xb0, 22, 64]);
  await settle(() => output.evaluate(() => window.thirdEye.store.state.actions.some((b) => b.action === 'macro:0' && b.source === 'midi.cc.1.22')), 'fader binding');
  await settle(() => output.evaluate(() => window.thirdEye.engine.mod.faderSeen.size > 0), 'engine saw the binding');
  await midi([0xb0, 22, 127]);
  check('MIDI knob drives fader 1 to the top', await settle(() => control.evaluate(() => parseFloat(document.querySelector('.fader .fill').style.height) > 99), 'fader max'), await control.evaluate(() => `${document.querySelector('.fader .name').textContent} = ${document.querySelector('.fader .val').textContent}`));
  await midi([0xb0, 22, 0]);
  check('and to the bottom', await settle(() => control.evaluate(() => parseFloat(document.querySelector('.fader .fill').style.height) < 1), 'fader min'), await control.evaluate(() => `${document.querySelector('.fader .name').textContent} = ${document.querySelector('.fader .val').textContent}`));

  // Clearing and leaving.
  await control.click('.big.blackout');
  await armed();
  await control.keyboard.press('Delete');
  check('Delete clears a mapping', await settle(() => output.evaluate(() => !window.thirdEye.store.state.actions.some((b) => b.action === 'blackout' && b.source.startsWith('midi.'))), 'cleared'));
  await control.keyboard.press('Escape');
  check('Esc leaves map mode', await control.evaluate(() => !document.body.classList.contains('midi-map')) && (await control.locator('#map-hint').isHidden()));
  await control.click('.big.blackout');
  check('controls work normally again', await settle(() => output.evaluate(() => window.thirdEye.store.state.globals.blackout === true), 'normal click'));
  await control.keyboard.press('b');

  // A mapped knob that has not moved since loading must leave the value alone.
  await control.evaluate(() => {
    const s = window.thirdEye.store;
    const fx = s.state.chain[0];
    s.setScene({
      chain: s.state.chain,
      lfos: s.state.lfos,
      macros: [],
      mappings: [{ id: 't1', source: 'midi.cc.1.21', fx: fx.uid, key: 'zoom', amount: 1, offset: 0, smooth: 0, invert: false, mode: 'set', enabled: true }],
    });
  });
  const zoom = () => output.evaluate(() => [...window.thirdEye.engine.pipeline.cur.instances.values()][0].values.zoom);
  check('a mapped knob at zero holds its parameter at minimum', await settle(async () => (await zoom()) === 0.25, 'held at min'), `zoom ${await zoom()}`);
  await output.reload();
  await waitFor(() => output.evaluate(() => window.thirdEye?.engine?.renderFps > 0 && window.thirdEye.engine.midi.state === 'ready'), { label: 'output back' });
  const base = await output.evaluate(() => window.thirdEye.store.state.chain[0].params.zoom);
  await new Promise((r) => setTimeout(r, 500));
  check('after a reload an untouched knob leaves its parameter at the dialled value', (await zoom()) === base && base > 0.25, `zoom ${await zoom()}, dialled ${base}`);

  if (process.env.SHOTS) await control.screenshot({ path: `${process.env.SHOTS}/control4.png`, fullPage: true });
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !benignError(e));
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
