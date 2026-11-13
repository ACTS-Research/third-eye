// The phone's live screen: always horizontal, the preview large and doubling
// as the XY pad, a row of preset buttons, Rotate, Reconnect, the remembered
// room, the picture kept horizontal on the Mac, and scanning the Mac's code
// from inside the page.
//   node tests/phone-screen.mjs

import { benignError, check, failureCount, fakeMacCamera, fakePhoneCamera, launch, phoneCode, showToMac, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  // ------------------------------------------------ with a real (fake) camera
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const source = (id) => mac((key) => window.thirdEye.engine.mod.get(key), id);
  await waitFor(async () => (await status())?.phone.signal === 'open', { label: 'registered', timeout: 20000 });
  const url = await control.locator('#phone-link').getAttribute('href');
  const room = await control.locator('#room-code').textContent();
  const phone = await context.newPage();
  watch(phone, 'phone', errors);
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.goto(url);
  await phone.locator('#start').dispatchEvent('click');
  await control.keyboard.press('1');
  await waitFor(async () => (await status()).phone.media === 'connected' && (await status()).input.state === 'live', { label: 'live', timeout: 30000 });
  const box = (sel) => phone.locator(sel).boundingBox();
  const turn = () => phone.evaluate(() => Number(document.getElementById('root').dataset.turn));
  // Presses a point given in the preview's own terms (0..1 across, 0..1 down),
  // whichever way the live screen is drawn.
  const press = async (lx, ly) => {
    const r = await box('#stage');
    const t = await turn();
    const [u, v] = t === 90 ? [1 - ly, lx] : t === 180 ? [1 - lx, 1 - ly] : t === 270 ? [ly, 1 - lx] : [lx, ly];
    await phone.mouse.move(r.x + u * r.width, r.y + v * r.height);
    await phone.mouse.down();
  };

  console.log('sideways');
  let stage = await box('#stage');
  check('the preview is the largest thing on the screen', stage.width > 844 * 0.5 && stage.height > 390 * 0.65 && Math.abs(stage.width / stage.height - 16 / 9) < 0.05, `${Math.round(stage.width)}×${Math.round(stage.height)} of 844×390`);
  check('the screen is drawn the right way up', (await turn()) === 0);
  await press(0.8, 0.25);
  check('a finger on the preview is the XY pad', await settle(async () => (await source('pad.touch')) === 1 && Math.abs((await source('pad.x')) - 0.8) < 0.03 && Math.abs((await source('pad.y')) - 0.75) < 0.03, 'pad'), `x ${(await source('pad.x')).toFixed(2)}, y ${(await source('pad.y')).toFixed(2)}`);
  check('the dot sits under the finger', await phone.evaluate(() => {
    const d = document.querySelector('.pad-dot');
    return Math.abs(parseFloat(d.style.left) - 80) < 3 && Math.abs(parseFloat(d.style.top) - 25) < 3;
  }));
  await phone.mouse.up();
  check('two rows beside it: triggers, then presets', await settle(() => phone.evaluate(() => {
    const t = document.getElementById('trigs').getBoundingClientRect();
    const p = document.getElementById('presets').getBoundingClientRect();
    const s = document.getElementById('stage').getBoundingClientRect();
    return document.querySelectorAll('.preset').length >= 8 && t.left > s.right && p.top > t.bottom - 1 && [...document.querySelectorAll('.trig')].filter((b) => !b.hidden).length === 2;
  }), 'rows'));
  const names = await phone.locator('.preset span').allTextContents();
  check('the preset buttons carry the Mac\'s preset names', names[1] === 'Tunnel', names.slice(0, 4).join(', '));
  const third = await box('.preset >> nth=2');
  await phone.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
  check('tapping one loads it on the Mac, and it lights up', await settle(async () => (await mac(() => window.thirdEye.store.state.presetIndex)) === 2 && (await phone.evaluate(() => document.querySelector('.preset.on')?.dataset.index)) === '2', 'preset 3'));
  const row = await box('#presets');
  await phone.mouse.move(row.x + row.width - 20, row.y + row.height / 2);
  await phone.mouse.down();
  await phone.mouse.move(row.x + 20, row.y + row.height / 2, { steps: 6 });
  await phone.mouse.up();
  check('dragging the row brings more presets into view without loading one', (await phone.evaluate(() => document.getElementById('presets').scrollLeft)) > 60 && (await mac(() => window.thirdEye.store.state.presetIndex)) === 2);
  await mac(() => {
    const { store } = window.thirdEye;
    store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.map((b) => (b.source === 'trig.3' ? { ...b, action: 'blackout' } : b)) });
  });
  check('a trigger bound to something else comes back as a button', await settle(() => phone.evaluate(() => [...document.querySelectorAll('.trig')].filter((b) => !b.hidden).map((b) => b.textContent).join() === 'Glitch burst,Freeze frame,Blackout'), 'trigger 3'), (await phone.locator('.trig').allTextContents()).join(' | '));

  console.log('rotate');
  await phone.locator('#rotate').dispatchEvent('click');
  check('Rotate turns the screen half a turn', (await turn()) === 180);
  check('and the Mac turns the picture with it', await settle(() => mac(() => window.thirdEye.engine.inputs.turn === 2), 'turn 2'));
  await press(0.8, 0.25);
  check('the pad still reads the same place on the picture', await settle(async () => Math.abs((await source('pad.x')) - 0.8) < 0.03 && Math.abs((await source('pad.y')) - 0.75) < 0.03, 'pad turned'), `x ${(await source('pad.x')).toFixed(2)}, y ${(await source('pad.y')).toFixed(2)}`);
  await phone.mouse.up();
  await phone.locator('#rotate').dispatchEvent('click');
  await settle(() => mac(() => window.thirdEye.engine.inputs.turn === 0), 'turn 0');

  console.log('upright');
  await phone.setViewportSize({ width: 390, height: 844 });
  check('held upright, the screen is drawn on its side so it stays horizontal', await settle(async () => (await turn()) === 90, 'turn 90'));
  stage = await box('#stage');
  check('and the preview is still large', stage.height > 844 * 0.5 && stage.width > 390 * 0.55, `${Math.round(stage.width)}×${Math.round(stage.height)} of 390×844`);
  await press(0.2, 0.9);
  check('the pad follows the turned screen', await settle(async () => Math.abs((await source('pad.x')) - 0.2) < 0.03 && Math.abs((await source('pad.y')) - 0.1) < 0.03, 'pad upright'), `x ${(await source('pad.x')).toFixed(2)}, y ${(await source('pad.y')).toFixed(2)}`);
  await phone.mouse.up();
  // What Safari does when the page is upright: the camera frames arrive
  // upright too. The Mac must lay them back on their side.
  await phone.evaluate(() => window.thirdEyePhone.track.applyConstraints({ width: { exact: 360 }, height: { exact: 640 } }));
  check('upright frames are turned back so the Mac\'s picture stays horizontal', await settle(async () => {
    const s = await status();
    return (await mac(() => window.thirdEye.engine.inputs.turn)) === 1 && s.input.width > s.input.height;
  }, 'turned back', 20000), JSON.stringify(await mac(() => ({ turn: window.thirdEye.engine.inputs.turn, want: window.thirdEye.engine.sensors.turn, video: [window.thirdEye.engine.inputs.feeds.phone.video.videoWidth, window.thirdEye.engine.inputs.feeds.phone.video.videoHeight] }))));
  check('the phone\'s preview is turned the same way', await phone.evaluate(() => document.getElementById('stage').classList.contains('turned') && getComputedStyle(document.getElementById('stage')).getPropertyValue('--turn').trim() === '-90deg'));
  await phone.setViewportSize({ width: 844, height: 390 });

  console.log('reconnecting');
  check('no Reconnect button while live', await phone.locator('#reconnect').isHidden());
  await phone.evaluate(() => window.thirdEyePhone.link.dropConn());
  check('Reconnect appears when the link is down', await settle(async () => !(await phone.locator('#reconnect').isHidden()) && (await phone.locator('#reconnect').textContent()) === 'Reconnect', 'button'));
  await phone.locator('#reconnect').dispatchEvent('click');
  check('and brings the phone back', await settle(async () => (await phone.locator('#state').textContent()).startsWith('LIVE'), 'live again', 25000), await phone.locator('#state').textContent());
  await phone.goto(`${site.url}/phone/`);
  check('opened again with no code, the page remembers the room', (await phone.inputValue('#room-input')) === room, await phone.inputValue('#room-input'));
  await context.close();

  // ----------------------------------- reading the Mac's code inside the page
  console.log('scanning the Mac\'s code from the phone page');
  const context2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context2.grantPermissions(['camera', 'microphone']);
  await fakeMacCamera(context2);
  await fakePhoneCamera(context2);
  const control2 = await context2.newPage();
  watch(control2, 'control', errors);
  await control2.goto(`${site.url}/control/`);
  await waitFor(() => control2.evaluate(() => window.thirdEye.ui.status?.host.role === 'control'), { label: 'hosting' });
  const phone2 = await context2.newPage();
  watch(phone2, 'phone', errors);
  await phone2.setViewportSize({ width: 844, height: 390 });
  await phone2.goto(await control2.locator('#phone-link').getAttribute('href'));
  await phone2.locator('#start').dispatchEvent('click');
  await waitFor(() => phone2.evaluate(() => !!window.thirdEyePhone.link), { label: 'phone started' });
  await control2.evaluate(() => window.thirdEye.ui.pairOffline());
  await waitFor(() => control2.evaluate(() => document.getElementById('offline-qr').style.visibility !== 'hidden' && document.getElementById('offline-link').href.includes('#o=')), { label: 'offer shown' });
  await phone2.locator('#panel-toggle').dispatchEvent('click');
  await phone2.locator('#scan').dispatchEvent('click');
  await phone2.evaluate((picture) => window.__show(picture), await control2.evaluate(() => document.getElementById('offline-qr').toDataURL()));
  check('the phone reads the Mac\'s code through its own camera and shows its code', await settle(() => phone2.evaluate(() => !document.getElementById('pair').hidden && !!window.thirdEyePhone.pairToken), 'phone code', 25000), await phone2.locator('#state').textContent());
  await showToMac(control2, await phoneCode(phone2));
  check('and pairs by code without leaving the page', await settle(async () => {
    const p = (await control2.evaluate(() => window.thirdEye.ui.status)).phone;
    return p.direct && p.phone === 'connected';
  }, 'paired by code', 25000));
  await phone2.evaluate(() => window.thirdEyePhone.link.dropConn());
  check('if that link is lost the bar offers Scan code', await settle(async () => (await phone2.locator('#reconnect').textContent()) === 'Scan code' && !(await phone2.locator('#reconnect').isHidden()), 'scan button'), await phone2.locator('#reconnect').textContent());

  const real = errors.filter((e) => !benignError(e) && !/ERR_TUNNEL_CONNECTION_FAILED|Could not get an ID|Aborting|retrieving ID/.test(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
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
