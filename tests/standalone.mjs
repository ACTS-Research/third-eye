// Everything live, with no output window at all: /control hosts the engine,
// so recording, the latency measurement, audio, MIDI and the phone's palette
// all run on the control page. The same features are tested with an output
// window in record-latency.mjs, midi-audio.mjs and phone.mjs.
//   node tests/standalone.mjs

import { benignError, check, failureCount, launch, outputStats, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];

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
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const settle = (fn, label, timeout = 10000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  const source = (id) => control.evaluate((key) => window.thirdEye.engine.mod.get(key), id);
  await waitFor(async () => (await status())?.phone.signal === 'open', { label: 'control hosting and registered', timeout: 20000 });
  check('the control page hosts the engine', (await status()).host.role === 'control');
  // outputStats reads the small readback, which is only rendered for a
  // control page in another window; pretend one is watching.
  await control.evaluate(() => {
    window.thirdEye.engine.remoteControlSeenAt = Infinity;
  });

  console.log('phone');
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(await control.locator('#phone-link').getAttribute('href'));
  await phone.click('#start');
  await control.keyboard.press('1');
  await waitFor(async () => {
    const s = await status();
    return s.phone.media === 'connected' && s.input.state === 'live';
  }, { label: 'phone live', timeout: 30000 });
  check('the phone streams to the control page', true);
  // No storage event reaches the page that makes the change, so the control
  // page has to tell its own engine: use the real controls.
  const look = () => phone.evaluate(() => `${document.documentElement.dataset.palette ?? 'darkroom'} ${(document.documentElement.dataset.dim ?? '100') + '%'}`);
  await control.click('#palette > button');
  await control.click('#palette-menu button[aria-label="Palette: Ice"]');
  check('the phone follows a palette picked on the control page', await settle(async () => (await look()).startsWith('ice'), 'palette'), await look());
  await control.click('#palette > button');
  await control.locator('#dimmer').press('Home');
  check('and the dimmer', await settle(async () => (await look()) === 'ice 25%', 'dim'), await look());
  await control.locator('#dimmer').press('End');
  await control.keyboard.press('Escape');

  console.log('recording');
  await control.keyboard.press('r');
  check('R records on the control page', await settle(async () => (await status()).recording.active, 'recording'), (await status()).recording.error);
  check('data reaches the file', await settle(async () => (await status()).recording.bytes > 20000, 'bytes', 20000));
  const name = (await status()).recording.name;
  await control.click('#rec');
  await settle(async () => (await status()).recording.finished === 1, 'stopped');
  check('the recording is 1280x720 and plays back', await control.evaluate(async (file) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('recordings');
    const f = await (await dir.getFileHandle(file)).getFile();
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(f);
    await new Promise((resolve, reject) => {
      v.onloadeddata = resolve;
      v.onerror = () => reject(new Error('decode error'));
      setTimeout(() => reject(new Error('timeout')), 8000);
    });
    return `${v.videoWidth}x${v.videoHeight}`;
  }, name).catch((e) => e.message) === '1280x720', name);

  console.log('latency measurement');
  // No projector here: stand in for the camera seeing the flash 150 ms late.
  await control.evaluate(() => {
    const p = window.thirdEye.engine.probe;
    p.sample = () => (p.state === 'running' && p.phase === 'flash' && p.lastNow >= p.flashAt + 150 ? 0.9 : 0.05);
  });
  await control.evaluate(() => window.thirdEye.ui.setView('setup'));
  await control.click('#latency-test');
  await waitFor(async () => (await status()).latencyTest.state === 'running', { label: 'measurement started' });
  let sawBlack = false;
  await waitFor(async () => {
    if ((await outputStats(control)).mean === 0) sawBlack = true;
    return (await status()).latencyTest.state !== 'running';
  }, { label: 'measurement', timeout: 30000, interval: 60 });
  const t = (await status()).latencyTest;
  check('the measurement runs on the monitor and completes', sawBlack && t.state === 'done' && t.ms >= 150, `${t.ms?.toFixed(0)} ms (${t.message})`);

  console.log('audio and MIDI');
  await control.click('text=Enable audio');
  check('audio analysis starts on the control page', await settle(async () => (await status()).audio.state === 'live', 'audio live'), (await status()).audio.state);
  check('level follows the signal', await settle(async () => (await source('audio.level')) > 0.05, 'level'));
  await control.click('text=Enable MIDI');
  check('MIDI opens on the control page', await settle(async () => (await status()).midi.state === 'ready' && (await status()).midi.inputs[0] === 'Fake Controller', 'midi'));
  await control.evaluate(() => window.__midiInput.onmidimessage({ data: new Uint8Array([0xb0, 74, 64]) }));
  check('a knob becomes a source', Math.abs((await source('midi.cc.1.74')) - 64 / 127) < 1e-6);
  // Map mode: the learn request and its answer both stay inside this page.
  await control.evaluate(() => window.thirdEye.ui.setView('perform'));
  await control.keyboard.press('m');
  await control.click('.big.blackout');
  await control.evaluate(() => window.__midiInput.onmidimessage({ data: new Uint8Array([0x90, 40, 127]) }));
  check('MIDI map learns a pad on the control page', await settle(() => control.evaluate(() => window.thirdEye.store.state.actions.some((b) => b.source === 'midi.note.1.40' && b.action === 'blackout')), 'learned'), JSON.stringify(await control.evaluate(() => window.thirdEye.store.state.actions.filter((b) => b.source.startsWith('midi')))));
  await control.keyboard.press('Escape');

  console.log('opening an output releases the devices');
  const output = await context.newPage();
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  await waitFor(async () => (await status())?.host.role === 'output', { label: 'output hosting', timeout: 15000 });
  check('the control page let go of the microphone, MIDI and the room code', await control.evaluate(() => {
    const e = window.thirdEye.engine;
    return !e.running && e.audio.stream === null && e.midi.access === null && e.link.peer === null && window.__midiInput.onmidimessage === null;
  }));
  check('the output opened them instead', await settle(async () => (await status()).audio.state !== 'off' && (await status()).midi.state === 'ready', 'devices on output'), `${(await status()).audio.state}, ${(await status()).midi.state}`);

  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
  await site.close();
  await stopPeerServer(peerServer);
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
