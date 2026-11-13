// The phone's live screen in both layouts (on its side and upright): the
// horizontal preview that is also the XY pad, the triggers, six presets, the
// camera icons, the bare zoom bar, latching Freeze, Rotate, upright frames
// staying upright on the Mac, messages that leave the preview alone,
// Reconnect, the remembered room, and scanning the Mac's code in the page.
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
  // An iPhone's camera offers zoom, a torch and a white-balance lock; the
  // test browser's does not, so say it does.
  await context.addInitScript(() => {
    if (!location.pathname.includes('/phone/')) return;
    const caps = MediaStreamTrack.prototype.getCapabilities;
    MediaStreamTrack.prototype.getCapabilities = function () {
      return { ...caps.call(this), zoom: { min: 1, max: 5, step: 0.1 }, torch: true, whiteBalanceMode: ['manual', 'continuous'] };
    };
    const apply = MediaStreamTrack.prototype.applyConstraints;
    MediaStreamTrack.prototype.applyConstraints = function (c) {
      return c?.advanced ? Promise.resolve() : apply.call(this, c);
    };
  });
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
  // Presses a point on the preview, 0..1 across and 0..1 down.
  const press = async (lx, ly) => {
    const r = await box('#stage');
    await phone.mouse.move(r.x + lx * r.width, r.y + ly * r.height);
    await phone.mouse.down();
  };
  // Where the pieces of the screen sit, for checking each layout.
  const places = () => phone.evaluate(() => {
    const r = (sel) => {
      const b = document.querySelector(sel)?.getBoundingClientRect();
      return b ? { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height } : null;
    };
    const presets = [...document.querySelectorAll('.preset')].map((b) => b.getBoundingClientRect()).map((b) => ({ l: b.left, t: b.top }));
    const trigs = [...document.querySelectorAll('.trig')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect()).map((b) => ({ l: b.left, t: b.top, r: b.right, b: b.bottom }));
    return { stage: r('#stage'), zoom: r('#zoom .fader'), quick: r('#quick'), bank: r('#presets'), presets, trigs, numbers: [...document.querySelectorAll('.preset b')].map((n) => n.textContent).join('') };
  });

  console.log('on its side');
  let at = await places();
  check('the preview is the largest thing on the screen, and horizontal', at.stage.w > 844 * 0.5 && at.stage.h > 390 * 0.65 && Math.abs(at.stage.w / at.stage.h - 16 / 9) < 0.05, `${Math.round(at.stage.w)}×${Math.round(at.stage.h)} of 844×390`);
  await press(0.8, 0.25);
  check('a finger on the preview is the XY pad', await settle(async () => (await source('pad.touch')) === 1 && Math.abs((await source('pad.x')) - 0.8) < 0.03 && Math.abs((await source('pad.y')) - 0.75) < 0.03, 'pad'), `x ${(await source('pad.x')).toFixed(2)}, y ${(await source('pad.y')).toFixed(2)}`);
  check('the dot sits under the finger', await phone.evaluate(() => {
    const d = document.querySelector('.pad-dot');
    return Math.abs(parseFloat(d.style.left) - 80) < 3 && Math.abs(parseFloat(d.style.top) - 25) < 3;
  }));
  await phone.mouse.up();
  await settle(() => phone.evaluate(() => document.querySelectorAll('.preset:not(:disabled)').length === 6), 'presets');
  at = await places();
  check('beside it: two triggers side by side, six presets under them', at.trigs.length === 2 && at.trigs[0].l > at.stage.r && at.trigs[1].l > at.trigs[0].r - 1 && Math.abs(at.trigs[0].t - at.trigs[1].t) < 2 && at.bank.t > at.trigs[0].b - 1);
  check('the presets are numbered across then down, three to a row', at.numbers === '123456' && at.presets[1].l > at.presets[0].l && at.presets[2].l > at.presets[1].l && at.presets[3].t > at.presets[0].t && Math.abs(at.presets[3].l - at.presets[0].l) < 2);
  check('all six are on screen, and there is no button for more', (await phone.locator('.bank-next').count()) === 0 && at.presets.length === 6 && (await phone.evaluate(() => document.getElementById('presets').scrollWidth <= document.getElementById('presets').clientWidth + 1)));
  check('under the presets: flip, torch and white-balance lock, as icons', await phone.evaluate(() => ['quick-flip', 'quick-torch', 'quick-wb'].every((id) => {
    const b = document.getElementById(id);
    return !b.hidden && b.querySelector('svg') && !b.textContent.trim() && b.getAttribute('aria-label');
  })) && at.quick.t > at.bank.b - 1);
  check('zoom is a bare bar the full height of the right edge', at.zoom && at.zoom.l > at.trigs[1].r - 1 && at.zoom.h > at.stage.h * 0.9 && (await phone.evaluate(() => document.getElementById('zoom').textContent.trim() === '')), at.zoom ? `${Math.round(at.zoom.w)}×${Math.round(at.zoom.h)}` : 'no zoom');
  const names = await phone.locator('.preset .pname').allTextContents();
  check('the preset buttons carry the Mac\'s preset names', names[1] === 'Tunnel', names.slice(0, 4).join(', '));
  const third = await box('.preset >> nth=2');
  await phone.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
  check('tapping one loads it on the Mac, and it lights up', await settle(async () => (await mac(() => window.thirdEye.store.state.presetIndex)) === 2 && (await phone.evaluate(() => document.querySelector('.preset.on')?.dataset.index)) === '2', 'preset 3'));
  const freezeBox = await box('.trig >> nth=1');
  await phone.mouse.click(freezeBox.x + freezeBox.width / 2, freezeBox.y + freezeBox.height / 2);
  check('Freeze latches: one tap freezes, and the button stays lit', await settle(async () => (await mac(() => window.thirdEye.store.state.globals.freeze)) === true && (await phone.evaluate(() => document.querySelectorAll('.trig')[1].classList.contains('on'))), 'frozen'));
  check('the picture really is frozen on the Mac', await mac(() => window.thirdEye.engine.pipeline && window.thirdEye.store.state.globals.freeze === true));
  await phone.mouse.click(freezeBox.x + freezeBox.width / 2, freezeBox.y + freezeBox.height / 2);
  check('a second tap releases it', await settle(async () => (await mac(() => window.thirdEye.store.state.globals.freeze)) === false, 'released'));
  // Settings saved before this change had Freeze on "hold", under a name
  // that is no longer read: such a session must still give a switch.
  await mac(() => {
    const { store } = window.thirdEye;
    store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.map((b) => (b.source === 'trig.2' ? { ...b, momentary: true } : b)) });
  });
  await phone.mouse.click(freezeBox.x + freezeBox.width / 2, freezeBox.y + freezeBox.height / 2);
  check('a session saved with the old hold setting still latches', await settle(async () => (await mac(() => window.thirdEye.store.state.globals.freeze)) === true, 'frozen again'));
  await phone.mouse.click(freezeBox.x + freezeBox.width / 2, freezeBox.y + freezeBox.height / 2);
  await settle(async () => (await mac(() => window.thirdEye.store.state.globals.freeze)) === false, 'released again');
  await mac(() => {
    const { store } = window.thirdEye;
    store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.map((b) => (b.source === 'trig.3' ? { ...b, action: 'blackout' } : b)) });
  });
  check('a trigger bound to something else comes back as a button', await settle(() => phone.evaluate(() => [...document.querySelectorAll('.trig')].filter((b) => !b.hidden).map((b) => b.textContent).join() === 'Glitch burst,Freeze frame,Blackout'), 'trigger 3'), (await phone.locator('.trig').allTextContents()).join(' | '));
  await mac(() => {
    const { store } = window.thirdEye;
    store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.map((b) => (b.source === 'trig.3' ? { ...b, action: 'presetPrev' } : b)) });
  });
  const before = await box('#stage');
  await phone.evaluate(() => {
    document.getElementById('note').textContent = 'Could not keep the screen awake. Set Auto-Lock to Never in iOS Settings → Display & Brightness.';
  });
  const during = await box('#stage');
  check('a message lies over the status line and takes nothing from the preview', before.width === during.width && before.height === during.height && before.y === during.y && (await phone.evaluate(() => {
    const n = document.getElementById('note').getBoundingClientRect();
    const b = document.getElementById('bar').getBoundingClientRect();
    return n.top >= b.top - 1 && n.bottom <= b.bottom + 1;
  })));
  await phone.evaluate(() => {
    document.getElementById('note').textContent = '';
  });

  console.log('rotate');
  await phone.locator('#rotate').dispatchEvent('click');
  check('Rotate turns the picture a quarter turn, in the preview and on the Mac', (await phone.evaluate(() => document.getElementById('stage').dataset.turn)) === '90' && (await settle(() => mac(() => window.thirdEye.engine.inputs.turn === 1), 'turn 1')));
  await press(0.8, 0.25);
  check('the pad still reads the same place on the picture', await settle(async () => Math.abs((await source('pad.x')) - 0.8) < 0.03 && Math.abs((await source('pad.y')) - 0.75) < 0.03, 'pad turned'), `x ${(await source('pad.x')).toFixed(2)}, y ${(await source('pad.y')).toFixed(2)}`);
  await phone.mouse.up();
  for (let i = 0; i < 3; i++) await phone.locator('#rotate').dispatchEvent('click');
  check('four presses bring it back', await settle(() => mac(() => window.thirdEye.engine.inputs.turn === 0), 'turn 0'));

  console.log('upright');
  await phone.setViewportSize({ width: 390, height: 844 });
  await settle(() => phone.evaluate(() => document.getElementById('root').classList.contains('upright')), 'upright layout');
  at = await places();
  check('held upright, the preview is still horizontal, across the top', at.stage.w > 390 * 0.9 && Math.abs(at.stage.w / at.stage.h - 16 / 9) < 0.05 && at.stage.t < 120, `${Math.round(at.stage.w)}×${Math.round(at.stage.h)} of 390×844`);
  check('the presets are numbered across then down, two to a row', at.numbers === '123456' && at.presets[1].l > at.presets[0].l && Math.abs(at.presets[1].t - at.presets[0].t) < 2 && at.presets[2].t > at.presets[0].t && Math.abs(at.presets[2].l - at.presets[0].l) < 2 && at.presets[4].t > at.presets[2].t);
  check('glitch and freeze are stacked beside them, with zoom to their right', at.trigs[0].l > at.presets[1].l && at.trigs[1].t > at.trigs[0].b - 1 && Math.abs(at.trigs[0].l - at.trigs[1].l) < 2 && at.zoom.l > at.trigs[0].r - 1 && at.zoom.t >= at.stage.b - 1 && (await phone.evaluate(() => document.getElementById('zoom').textContent.trim() === '')));
  check('everything reads upright: nothing on the screen is drawn turned', await phone.evaluate(() => [...document.querySelectorAll('#root, #root *')].every((n) => n.id === 'self' || !/rotate|matrix\((?!1, 0, 0, 1)/.test(getComputedStyle(n).transform))));
  await press(0.2, 0.9);
  check('the pad works on the horizontal preview', await settle(async () => Math.abs((await source('pad.x')) - 0.2) < 0.03 && Math.abs((await source('pad.y')) - 0.1) < 0.03, 'pad upright'), `x ${(await source('pad.x')).toFixed(2)}, y ${(await source('pad.y')).toFixed(2)}`);
  await phone.mouse.up();
  // What Safari does when the page is upright: the camera frames arrive
  // upright. Nothing is turned; the Mac shows the middle band of them, the
  // world the right way up, and the phone's preview shows the same band.
  await phone.evaluate(() => window.thirdEyePhone.track.applyConstraints({ width: { exact: 360 }, height: { exact: 640 } }));
  check('upright frames are not laid on their side on the Mac', await settle(async () => {
    const s = await status();
    return s.input.height > s.input.width && (await mac(() => window.thirdEye.engine.inputs.turn)) === 0;
  }, 'upright frames', 20000), JSON.stringify(await mac(() => ({ turn: window.thirdEye.engine.inputs.turn, video: [window.thirdEye.engine.inputs.feeds.phone.video.videoWidth, window.thirdEye.engine.inputs.feeds.phone.video.videoHeight] }))));
  check('the Mac fills its horizontal picture from them (Fill)', await settle(() => mac(() => window.thirdEye.store.state.input.fit === 'cover' && window.thirdEye.engine.pipeline.fitScale('cover')[1] < 1), 'fill'));
  check('the phone\'s preview shows the same horizontal band, not a tall picture', await phone.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    const video = document.getElementById('self');
    return video.videoHeight > video.videoWidth && stage.width > stage.height && getComputedStyle(video).objectFit === 'cover' && !document.getElementById('stage').classList.contains('turned');
  }));
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
