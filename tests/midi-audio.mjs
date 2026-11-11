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

  console.log('audio');
  await control.click('text=Enable audio');
  check('audio analysis starts in the output window', await settle(async () => (await status()).audio.state === 'live', 'audio live'), (await status()).audio.label);
  check('level follows the signal', await settle(async () => (await source('audio.level')) > 0.05, 'level'));
  check('a band responds', await settle(async () => (await source('audio.mid')) > 0.05, 'mid band'));
  check('beat detector fires on the beeps', await settle(async () => (await status()).audio.beats >= 2, 'beats', 12000), `${(await status()).audio.beats} beats`);
  check('beat pulse decays between hits', await settle(async () => (await source('audio.beat')) < 0.2, 'beat decay'));
  check('audio meters appear on control', await control.evaluate(() => !!document.querySelector('.meter[title="audio.level"]')));
  await control.evaluate(() => window.thirdEye.store.merge('audio', { gain: 0.2 }));
  const quiet = await output.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      peak = Math.max(peak, window.thirdEye.engine.mod.get('audio.level'));
    }
    return peak;
  });
  await control.evaluate(() => window.thirdEye.store.merge('audio', { gain: 4 }));
  const loud = await output.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      peak = Math.max(peak, window.thirdEye.engine.mod.get('audio.level'));
    }
    return peak;
  });
  check('gain scales the level', loud > quiet * 2, `peak ${quiet.toFixed(3)} at 0.2x, ${loud.toFixed(3)} at 4x`);
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
  check('note off closes the gate', (await source('midi.note.3.36')) === 0);
  check('MIDI sources get meters on control', await settle(() => control.evaluate(() => !!document.querySelector('.meter[title="midi.cc.1.74"]')), 'midi meter'));

  // Learn: touch a parameter, arm learn, move a knob.
  const slider = control.locator('.fx').first().locator('.tp-sldv_t').nth(2); // feedback rotate
  const box = await slider.boundingBox();
  await control.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await control.click('text=Learn → parameter');
  check('learn prompt names the target', (await control.locator('#midi-note').textContent()).includes('rotate'), await control.locator('#midi-note').textContent());
  await waitFor(() => output.evaluate(() => window.thirdEye.engine.midi.learning), { label: 'learn armed' });
  await midi([0xb0, 21, 127]);
  check('learn creates a mapping to the touched parameter', await settle(() => output.evaluate(() => {
    const m = window.thirdEye.store.state.mappings.find((x) => x.source === 'midi.cc.1.21');
    return m && m.key === 'rotate' && m.mode === 'set';
  }), 'mapping'));
  const rotate = () => output.evaluate(() => [...window.thirdEye.engine.pipeline.cur.instances.values()][0].values.rotate);
  check('knob at maximum drives the parameter to its maximum', await settle(async () => Math.abs((await rotate()) - 0.2) < 0.005, 'max'), `rotate ${(await rotate()).toFixed(3)}`);
  await midi([0xb0, 21, 0]);
  check('knob at minimum drives it to its minimum', await settle(async () => Math.abs((await rotate()) + 0.2) < 0.005, 'min'), `rotate ${(await rotate()).toFixed(3)}`);
  check('learn disarms after one control', await output.evaluate(() => window.thirdEye.engine.midi.learning === false));

  await control.click('text=Learn → trigger');
  await waitFor(() => output.evaluate(() => window.thirdEye.engine.midi.learning), { label: 'learn armed' });
  await midi([0x99, 40, 100]);
  check('learn → trigger adds a binding', await settle(() => output.evaluate(() => window.thirdEye.store.state.actions.some((b) => b.source === 'midi.note.10.40')), 'binding'));
  await midi([0x89, 40, 0]);
  await control.evaluate(() => {
    const s = window.thirdEye.store;
    s.dispatch({ op: 'set', key: 'actions', value: s.state.actions.map((b) => (b.source === 'midi.note.10.40' ? { ...b, action: 'blackout' } : b)) });
  });
  await new Promise((r) => setTimeout(r, 300));
  await midi([0x99, 40, 100]);
  check('MIDI pad fires its action', await settle(() => output.evaluate(() => window.thirdEye.store.state.globals.blackout === true), 'blackout'));
  await midi([0x89, 40, 0]);

  // A mapped knob that has not moved since loading must leave the value alone.
  await output.reload();
  await waitFor(() => output.evaluate(() => window.thirdEye?.engine?.renderFps > 0 && window.thirdEye.engine.midi.state === 'ready'), { label: 'output back' });
  const base = await output.evaluate(() => window.thirdEye.store.state.chain[0].params.rotate);
  await new Promise((r) => setTimeout(r, 500));
  check('untouched MIDI mapping does not move its parameter after a reload', Math.abs((await rotate()) - base) < 1e-6, `rotate ${(await rotate()).toFixed(3)}, dialled ${base.toFixed(3)}`);

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
