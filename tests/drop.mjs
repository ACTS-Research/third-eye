// "If a source drops": what the picture does by itself when a phone stops
// sending. Hold (as before), fade to black, fade to a stand-by source and
// back when the phone returns, input B easing out of the mix, the settings
// under Setup → Input, and the alert.
//   node tests/drop.mjs

import { benignError, check, failureCount, launch, openSession, pickMenu, startPeerServer, startSite, stopPeerServer, waitFor } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

// Mean colour of the finished picture, read from the small preview buffer.
const colour = (page) => page.evaluate(() => {
  const { gl, pipeline } = window.thirdEye.engine;
  const { w, h } = pipeline.preview;
  const px = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, pipeline.preview.fbo);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const sum = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += px[i + c];
  return sum.map((v) => v / (w * h));
});
// Chromium's stand-in camera (the phone's picture here) is green.
const green = ([r, g, b]) => g > 60 && g > r * 1.6 && g > b * 1.6;
const dark = ([r, g, b]) => r + g + b < 12;

try {
  const { control, output, phone } = await openSession(browser, site, peerServer, errors);
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const status = () => mac(() => window.thirdEye.ui.status);
  const picture = () => colour(output);
  const say = async () => (await picture()).map((v) => v.toFixed(0)).join(',');
  const set = (patch) => mac((p) => window.thirdEye.store.merge('input', p), patch);
  // The phone stops sending without leaving: its camera off holds the
  // picture on the Mac exactly as a phone in the background does.
  const cameraOff = () => phone.evaluate(() => window.thirdEyePhone.link.send({ t: 'hold', on: true }));
  const cameraOn = () => phone.evaluate(() => window.thirdEyePhone.link.send({ t: 'hold', on: false }));

  await mac(() => {
    const { store } = window.thirdEye;
    store.setScene({ chain: [], mappings: [], lfos: store.state.lfos, macros: [] });
  });
  await control.keyboard.press('1');
  await settle(async () => (await status()).input.state === 'live' && green(await picture()), 'phone live', 25000);
  check('the phone is the picture', green(await picture()), await say());

  console.log('the settings');
  await mac(() => window.thirdEye.ui.setView('setup'));
  check('held by default, as before', (await mac(() => window.thirdEye.store.state.input.dropA)) === 'hold' && (await control.locator('#drop-a .menu-text').textContent()) === 'Hold its last frame');
  await pickMenu(control, '#drop-a', 'black');
  check('Setup → Input sets what input A does', (await mac(() => window.thirdEye.store.state.input.dropA)) === 'black');
  await pickMenu(control, '#drop-b', 'out');
  check('and what input B does', (await mac(() => window.thirdEye.store.state.input.dropB)) === 'out');
  await set({ dropA: 'hold', dropB: 'hold', dropAfter: 1, dropFade: 0.3 });
  await mac(() => window.thirdEye.ui.setView('perform'));

  console.log('hold');
  await cameraOff();
  await settle(async () => (await status()).input.state === 'paused', 'paused');
  await new Promise((r) => setTimeout(r, 3000));
  check('the last frame stays up for as long as the phone is gone', green(await picture()) && (await status()).input.standby === 0, await say());
  await cameraOn();
  await settle(async () => (await status()).input.state === 'live', 'live again');

  console.log('fade to black');
  await set({ dropA: 'black' });
  check('nothing happens while the phone is sending', green(await picture()) && (await status()).input.standby === 0);
  await cameraOff();
  check('a moment after it stops the picture goes to black', await settle(async () => dark(await picture()) && (await status()).input.standby === 1, 'black', 12000), await say());
  check('the Mac says why', await settle(async () => (await control.locator('#alerts').textContent()).includes('iPhone has stopped sending'), 'alert'), await control.locator('#alerts').textContent());
  await cameraOn();
  check('and comes back by itself when the phone returns', await settle(async () => green(await picture()) && (await status()).input.standby === 0, 'back', 12000), await say());
  check('the alert clears', await settle(async () => !(await control.locator('#alerts').textContent()).includes('stopped sending'), 'alert gone'));

  console.log('fade to a stand-by source');
  await set({ dropA: 'pattern' });
  await cameraOff();
  check('the test pattern stands in', await settle(async () => {
    const c = await picture();
    return !green(c) && !dark(c) && (await status()).input.standby === 1;
  }, 'pattern', 12000), await say());
  await cameraOn();
  await settle(async () => green(await picture()), 'back from pattern', 12000);

  console.log('a newly chosen source gets its full wait');
  await set({ dropA: 'black', dropAfter: 6 });
  await control.keyboard.press('4');
  await control.keyboard.press('1');
  await new Promise((r) => setTimeout(r, 1500));
  check('switching inputs does not trip it', (await status()).input.standby === 0 && green(await picture()), await say());
  await set({ dropAfter: 1 });

  console.log('input B');
  // A is the test pattern, B the phone, mixed in fully.
  await control.keyboard.press('4');
  await control.keyboard.press('Shift+Digit1');
  await mac(() => {
    const { store } = window.thirdEye;
    document.querySelector('#mixbar').dispatchEvent(new PointerEvent('pointerdown', { clientX: 1e5, pointerId: 1, bubbles: true }));
    return store.state.chain.length;
  });
  check('the phone as B, mixed in, is the picture', await settle(async () => green(await picture()), 'B in', 15000), await say());
  await set({ dropB: 'hold' });
  await cameraOff();
  await new Promise((r) => setTimeout(r, 3000));
  check('held: B stays in the mix, frozen', green(await picture()) && (await status()).inputB.standby === 0, await say());
  await cameraOn();
  await settle(async () => (await status()).inputB.state === 'live', 'B live');
  await set({ dropB: 'out' });
  await cameraOff();
  check('eased out: the picture goes to A alone', await settle(async () => !green(await picture()) && (await status()).inputB.standby === 1, 'B out', 12000), await say());
  check('and the Mac says so', await settle(async () => (await control.locator('#alerts').textContent()).includes('input B is out of the mix'), 'alert B'), await control.locator('#alerts').textContent());
  await cameraOn();
  check('B comes back into the mix when the phone returns', await settle(async () => green(await picture()) && (await status()).inputB.standby === 0, 'B back', 12000), await say());

  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  check('the suite ran to the end', false, err.stack ?? String(err));
} finally {
  await browser.close();
  await site.close();
  await stopPeerServer(peerServer);
}
console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() ? 1 : 0);
