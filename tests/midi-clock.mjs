// MIDI clock in the app, with /control making the picture and stand-in
// devices: Setup's Clock row (Off, Follow, Send), following a clock (the
// speed read, the perform screen's EXT tile and figure, Tap switched off,
// Start putting the beat on one, Stop, the clock no longer arriving, a
// named device), and sending one (pulses on the output at the show's tempo,
// Start on a beat from the button and the K key, Stop, a change of tempo,
// switching off, a device that is not there).
// (The arithmetic alone is in clock.mjs.)
//   node tests/midi-clock.mjs

import { benignError, check, failureCount, launch, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 10000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await context.grantPermissions(['camera', 'microphone', 'midi']);
  // Headless Chromium has no MIDI backend: one stand-in device to hear, and
  // one to send to, which keeps what it is sent and when it is to leave.
  await context.addInitScript(() => {
    const input = { name: 'Drum machine', onmidimessage: null };
    window.__midiInput = input;
    window.__sent = [];
    const output = { name: 'Synth', send: (bytes, at) => window.__sent.push({ status: bytes[0], at }) };
    navigator.requestMIDIAccess = async () => ({ inputs: new Map([['1', input]]), outputs: new Map([['2', output]]), onstatechange: null });
    // A clock at `bpm`: every pulse carries the exact time it was due, so
    // the speed is exact whatever this page's timers do.
    window.__clock = (bpm) => {
      clearInterval(window.__clockTimer);
      if (!bpm) return;
      const spacing = 60000 / (bpm * 24);
      let next = performance.now();
      window.__clockTimer = setInterval(() => {
        for (; next <= performance.now(); next += spacing) input.onmidimessage?.({ data: new Uint8Array([0xf8]), timeStamp: next, target: input });
      }, 5);
    };
    window.__say = (status) => input.onmidimessage?.({ data: new Uint8Array([status]), timeStamp: performance.now(), target: input });
  });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.renderFps > 0), { label: 'local engine', timeout: 20000 });

  const mac = (fn, arg) => control.evaluate(fn, arg);
  const clock = () => mac(() => window.thirdEye.ui.status?.clock ?? null);
  const note = () => control.locator('#clock-note').textContent();
  const says = () => control.locator('#clock-say').textContent();
  const mode = (name) => control.locator(`.clock-mode button[data-value="${name}"]`);
  const view = (name) => mac((v) => window.thirdEye.ui.setView(v), name);
  const ownTempo = () => mac(() => window.thirdEye.store.state.tempo.bpm);
  const sent = (status) => mac((s) => window.__sent.filter((m) => s === undefined || m.status === s), status);

  console.log('Setup: the Clock row');
  await view('setup');
  check('it starts Off, and says the tempo is the show\'s own', (await mode('off').getAttribute('aria-checked')) === 'true' && (await note()).includes("the show's own") && (await control.locator('#clock-follow').isHidden()) && (await control.locator('#clock-send').isHidden()), await note());
  await mode('follow').click();
  check('Follow switches MIDI on and shows where from and the offset', (await settle(() => mac(() => window.thirdEye.store.state.midi.enabled && window.thirdEye.store.state.midi.clock === 'follow'), 'follow')) && (await control.locator('#clock-follow').isVisible()) && (await control.locator('#clock-send').isHidden()));
  check('with no clock arriving it says so, and the show\'s tempo carries on', await settle(async () => (await note()).startsWith('No clock arriving') && (await note()).includes('(120)'), 'none yet'), await note());

  console.log('following a clock');
  await mac(() => window.__clock(126.4));
  check('the speed is read from the pulses', await settle(async () => {
    const c = await clock();
    return c?.alive && Math.abs(c.bpm - 126.4) <= 0.2 && c.port === 'Drum machine';
  }, 'speed'), JSON.stringify(await clock()));
  check('Setup says what it follows and how fast', await settle(async () => /^Following Drum machine · 126\.\d BPM\./.test(await note()), 'following line'), await note());
  check('the show\'s own tempo is not touched', (await ownTempo()) === 120 && (await mac(() => window.thirdEye.ui.presets.live.bpm)) === 120);
  check('the engine runs at the clock\'s speed', Math.abs((await mac(() => window.thirdEye.engine.tempo.bpm)) - 126.4) <= 0.2);
  await view('perform');
  check('on the perform screen the tile reads EXT and cannot be tapped', await settle(async () => (await control.locator('.tap').textContent()) === 'Ext' && (await control.locator('.tap').isDisabled()) && (await control.locator('.tap').evaluate((n) => n.classList.contains('ext'))), 'ext tile'), await control.locator('.tap').textContent());
  check('the figure is the incoming tempo and cannot be typed over', await settle(async () => Math.abs(Number(await control.inputValue('#bpm')) - 126.4) <= 0.2 && (await control.locator('#bpm').evaluate((n) => n.readOnly && n.classList.contains('ext'))), 'ext figure'), await control.inputValue('#bpm'));
  check('under it, which clock', (await says()).startsWith('Ext clock · Drum machine'), await says());
  check('the tile still blinks on the beat', await settle(() => control.evaluate(() => document.querySelector('.tap').classList.contains('beat')), 'blink on') && (await settle(() => control.evaluate(() => !document.querySelector('.tap').classList.contains('beat')), 'blink off')));
  await control.keyboard.press('t');
  await control.keyboard.press('t');
  check('the T key does nothing meanwhile', (await mac(() => window.thirdEye.engine.tempo.taps.length)) === 0 && (await ownTempo()) === 120);
  await settle(() => mac(() => window.thirdEye.engine.tempo.clockIn.ticks > 60), 'some beats in');
  await mac(() => window.__say(0xfa));
  check('Start puts the beat on one', await settle(() => mac(() => window.thirdEye.engine.tempo.clockIn.ticks < 48), 'restart'), String(await mac(() => window.thirdEye.engine.tempo.clockIn.ticks)));
  await mac(() => window.__say(0xfc));
  check('Stop at the other end is said, and the pulses are still followed', (await settle(async () => (await says()).endsWith('· stopped'), 'stopped')) && (await clock()).alive, await says());
  await mac(() => window.__say(0xfb));
  check('Continue clears it', await settle(async () => !(await says()).includes('stopped'), 'continued'), await says());

  console.log('a clock that stops arriving');
  const beatBefore = await mac(() => window.thirdEye.engine.tempo.beats(performance.now()));
  await mac(() => window.__clock(0));
  check('it says NO CLOCK', await settle(async () => (await says()).startsWith('No clock'), 'no clock'), await says());
  check('Tap is back, and the figure is the show\'s own again', await settle(async () => (await control.locator('.tap').textContent()) === 'TTap' && !(await control.locator('.tap').isDisabled()) && Number(await control.inputValue('#bpm')) === 120 && !(await control.locator('#bpm').evaluate((n) => n.readOnly)), 'tap back'), `${await control.locator('.tap').textContent()} ${await control.inputValue('#bpm')}`);
  const beatAfter = await mac(() => window.thirdEye.engine.tempo.beats(performance.now()));
  check('the beat carries on from where the clock had got to, without jumping back', beatAfter >= beatBefore && beatAfter - beatBefore < 60, `${beatBefore.toFixed(2)} → ${beatAfter.toFixed(2)}`);
  await mac(() => window.thirdEye.store.merge('midi', { clockIn: 'Some other box' }));
  await mac(() => window.__clock(100));
  await new Promise((r) => setTimeout(r, 1200));
  check('a clock from a device that was not chosen is not followed', !(await clock()).alive && (await mac(() => performance.now() - window.thirdEye.engine.tempo.clockIn.lastAt > 1000)));
  await view('setup');
  check('a chosen device that is not connected stays in the menu, marked', (await control.locator('#clock-in').textContent()).includes('Some other box (not connected)'), await control.locator('#clock-in').textContent());
  await mac(() => window.thirdEye.store.merge('midi', { clockIn: 'Drum machine' }));
  check('from the chosen device it is', await settle(async () => (await clock()).alive && Math.abs((await clock()).bpm - 100) <= 0.2, 'named'), JSON.stringify(await clock()));
  await mac(() => window.__clock(0));

  console.log('sending a clock');
  await mode('send').click();
  check('Send shows where to and Start, and takes the first output', (await settle(() => mac(() => window.thirdEye.store.state.midi.clock === 'send' && window.thirdEye.store.state.midi.clockOut === 'Synth'), 'send')) && (await control.locator('#clock-send').isVisible()) && (await control.locator('#clock-follow').isHidden()) && (await control.locator('#clock-run-setup').textContent()) === 'Start');
  check('Setup says what is going out', await settle(async () => (await note()) === "Sending 120 BPM, the show's tempo, to Synth · not started.", 'sending line'), await note());
  check('pulses go out', await settle(async () => (await sent(0xf8)).length > 60, 'pulses'));
  const spacing = (list) => list.slice(1).map((m, i) => m.at - list[i].at);
  const even = (list, want) => spacing(list).every((g) => Math.abs(g - want) < 0.01);
  const last = async (n) => (await sent(0xf8)).slice(-n);
  check('24 to the beat at the show\'s tempo, each with the time it is to leave', even(await last(40), 60000 / (120 * 24)), spacing(await last(6)).map((g) => g.toFixed(3)).join(' '));
  check('handed over ahead of time, not late', await mac(() => window.__sent.at(-1).at > performance.now() - 50));
  check('nothing but pulses until Start', (await sent()).every((m) => m.status === 0xf8));
  await view('perform');
  check('the perform screen has Start under the tempo, and Tap as usual', (await control.locator('#clock-run').isVisible()) && (await control.locator('#clock-run').textContent()) === 'Start clock' && (await control.locator('#clock-run').getAttribute('data-midi')) === 'clockRun' && (await says()) === 'to Synth' && !(await control.locator('.tap').isDisabled()));
  await control.click('#clock-run');
  check('Start goes out once, just ahead of a pulse', await settle(async () => (await sent(0xfa)).length === 1, 'start sent'));
  const around = await mac(() => {
    const i = window.__sent.findIndex((m) => m.status === 0xfa);
    const { anchor } = window.thirdEye.engine.tempo;
    const beat = 60000 / window.thirdEye.store.state.tempo.bpm;
    const next = window.__sent[i + 1];
    return { gap: next.at - window.__sent[i].at, next: next.status, onBeat: Math.abs(((next.at - anchor) / beat) - Math.round((next.at - anchor) / beat)) };
  });
  check('and that pulse is one of the app\'s own beats', around.next === 0xf8 && Math.abs(around.gap - 1) < 0.001 && around.onBeat < 1e-6, JSON.stringify(around));
  check('the button now reads Stop clock', await settle(async () => (await control.locator('#clock-run').textContent()) === 'Stop clock', 'stop label'));
  await control.keyboard.press('k');
  check('K sends Stop, and the pulses carry on', (await settle(async () => (await sent(0xfc)).length === 1, 'stop sent')) && (await settle(async () => (await control.locator('#clock-run').textContent()) === 'Start clock', 'start label')));
  const had = (await sent(0xf8)).length;
  check('(they do)', await settle(async () => (await sent(0xf8)).length > had + 24, 'more pulses'));
  await control.fill('#bpm', '90');
  await control.locator('#bpm').press('Enter');
  await control.locator('#bpm').blur();
  await settle(() => mac(() => window.thirdEye.store.state.tempo.bpm === 90), 'typed');
  const mark = (await sent(0xf8)).length;
  await settle(async () => (await sent(0xf8)).length > mark + 60, 'pulses at 90');
  check('a typed tempo changes the spacing of the pulses', even(await last(30), 60000 / (90 * 24)), spacing(await last(4)).map((g) => g.toFixed(3)).join(' '));
  check('with never two pulses on top of each other', spacing(await sent(0xf8)).every((g) => g > 10));
  await control.keyboard.press('k');
  await settle(async () => (await sent(0xfa)).length === 2, 'started again');
  await view('setup');
  check('Setup\'s button follows', await settle(async () => (await control.locator('#clock-run-setup').textContent()) === 'Stop' && (await note()).endsWith('· started.'), 'setup stop'), await note());
  await mode('off').click();
  check('switched Off while started, the other end is told to stop', await settle(async () => (await sent(0xfc)).length === 2 && (await sent()).at(-1).status === 0xfc, 'stop on off'));
  const quiet = (await sent()).length;
  await new Promise((r) => setTimeout(r, 700));
  check('and nothing more goes out', (await sent()).length === quiet);
  await mac(() => window.thirdEye.store.merge('midi', { clockOut: 'Unplugged box' }));
  await mode('send').click();
  check('a device that is not connected is said, and nothing is sent', (await settle(async () => (await note()).startsWith('Unplugged box is not connected'), 'missing')) && (await sent()).length === quiet, await note());
  check('and it stays in the menu, marked', (await control.locator('#clock-out').textContent()).includes('Unplugged box (not connected)'), await control.locator('#clock-out').textContent());
  await mode('off').click();

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
