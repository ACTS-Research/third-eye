// The phone's sound as a control signal (a test of the idea, 28 November
// 2026): "Send sound" in the phone's settings sends its microphone with its
// picture; "iPhone" as the Mac's audio input then reads level, bands and
// the beat from it. Nothing is played. /control makes the picture here, and
// Chromium's stand-in microphone beeps about once a second.
//   node tests/phone-sound.mjs

import { benignError, check, failureCount, launch, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await context.grantPermissions(['camera', 'microphone']);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const source = (id) => mac((key) => window.thirdEye.engine.mod.get(key), id);
  const note = () => control.locator('#audio-note').textContent();
  await waitFor(async () => (await status())?.phone.signal === 'open', { label: 'control hosting and registered', timeout: 20000 });

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(await control.locator('#phone-link').getAttribute('href'));
  await phone.click('#start');
  await control.keyboard.press('1');
  const live = () => waitFor(async () => {
    const s = await status();
    return s.phone.media === 'connected' && s.input.state === 'live';
  }, { label: 'phone live', timeout: 30000 });
  await live();
  const tracks = () => mac(() => {
    const stream = window.thirdEye.engine.inputs.feeds.phone.video.srcObject;
    return stream ? `${stream.getVideoTracks().length} picture, ${stream.getAudioTracks().length} sound` : 'none';
  });

  console.log('before the phone sends sound');
  check('the phone sends its picture and no sound', (await tracks()) === '1 picture, 0 sound', await tracks());
  check('Send sound is off on the phone to begin with', (await phone.locator('#sound-pref').textContent()) === 'Send sound: off');
  await mac(() => window.thirdEye.ui.setView('setup'));
  await control.locator('#io-panel .menu[aria-label="Audio input"]').click();
  await control.locator('.menu-list .menu-item', { hasText: 'iPhone (its microphone)' }).click();
  await control.click('text=Enable audio');
  check('with iPhone chosen and none arriving, the Mac says what to do on the phone', await settle(async () => (await status()).audio.state === 'waiting' && (await note()).includes('Send sound'), 'waiting'), await note());
  check('and nothing is read', (await source('audio.level')) === 0);

  console.log('Send sound');
  await phone.locator('#panel-toggle').dispatchEvent('click');
  await phone.locator('#sound-pref').dispatchEvent('click');
  check('the phone says it is on', await settle(async () => (await phone.locator('#sound-pref').textContent()) === 'Send sound: on' && (await phone.evaluate(() => JSON.parse(localStorage.getItem('thirdeye.phone.v1')).sound === true)), 'pref on'));
  check('the call is placed again with sound in it, and the picture comes back', (await settle(async () => (await tracks()) === '1 picture, 1 sound', 'sound track', 30000)) && (await live().then(() => true, () => false)), await tracks());
  // Chrome starts audio only in a window that has been clicked.
  await control.click('#audio-note');
  check('the Mac listens to the iPhone', await settle(async () => (await status()).audio.state === 'live' && (await status()).audio.label === 'iPhone', 'live', 20000), JSON.stringify((await status()).audio));
  check('the level follows the phone\'s microphone', await settle(async () => (await source('audio.level')) > 0.05, 'level', 20000), String(await source('audio.level')));
  check('a band responds', await settle(async () => (await source('audio.mid')) > 0.05, 'band', 20000));
  check('Setup says what is arriving', await settle(async () => /^Listening: iPhone · /.test(await note()), 'line', 20000), await note());
  check('nothing is played on the Mac: the phone\'s stream sits in a muted player', await mac(() => window.thirdEye.engine.inputs.feeds.phone.video.muted === true && !document.querySelector('audio')));
  check('the phone\'s own preview is muted too', await phone.evaluate(() => document.getElementById('self').muted === true));

  console.log('the camera restarts, the sound does not');
  const before = await mac(() => window.thirdEye.engine.inputs.feeds.phone.video.srcObject.getAudioTracks()[0].id);
  await phone.locator('#quick-flip').dispatchEvent('click');
  await new Promise((r) => setTimeout(r, 1500));
  await live();
  check('flipping the camera keeps the same sound arriving', (await mac(() => window.thirdEye.engine.inputs.feeds.phone.video.srcObject.getAudioTracks()[0]?.id)) === before && (await mac(() => window.thirdEye.engine.inputs.feeds.phone.video.srcObject.getAudioTracks()[0]?.readyState)) === 'live' && (await settle(async () => (await source('audio.level')) > 0.05, 'level after flip', 20000)));

  console.log('switching it off');
  await phone.locator('#sound-pref').dispatchEvent('click');
  check('the sound stops arriving and the Mac goes back to waiting', (await settle(async () => (await tracks()) === '1 picture, 0 sound', 'no sound track', 30000)) && (await settle(async () => (await status()).audio.state === 'waiting', 'waiting again', 20000)), `${await tracks()} ${(await status()).audio.state}`);
  check('the sources fall to nothing', await settle(async () => (await source('audio.level')) === 0, 'silent'));
  check('the phone has let its microphone go', await phone.evaluate(() => JSON.parse(localStorage.getItem('thirdeye.phone.v1')).sound === false));
  await live();
  check('and the picture is still live', true);
  await control.locator('#io-panel .menu[aria-label="Audio input"]').click();
  await control.locator('.menu-list .menu-item', { hasText: 'Default input' }).click();
  check('back on the Mac\'s own input, it listens to that', await settle(async () => (await status()).audio.state === 'live' && (await status()).audio.label !== 'iPhone', 'own input', 20000), JSON.stringify((await status()).audio));

  const real = errors.filter((e) => !benignError(e));
  check('no errors in any window', real.length === 0, real.slice(0, 3).join(' | '));
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
