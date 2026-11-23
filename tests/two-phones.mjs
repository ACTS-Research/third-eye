// A second iPhone: its own tab in the pairing pop-over and its own room
// code, pairing beside the first without disturbing it, the Phone B readout,
// iPhone B as a source for input A or B, its sensors as sources of their
// own, its buttons working like the first phone's, either phone dropping
// alone, both following the picture to /control, and switching it off.
//   node tests/two-phones.mjs

import { benignError, check, failureCount, launch, openSession, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const { context, control, output, phone } = await openSession(browser, site, peerServer, errors);
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const status = () => mac(() => window.thirdEye.ui.status);
  const net = () => mac(() => ({ ...window.thirdEye.store.state.net }));
  const input = () => mac(() => ({ ...window.thirdEye.store.state.input }));
  const paired = async (key) => (await status())?.[key]?.phone === 'connected';
  // Reads from whichever window hosts the engine.
  let host = output;
  const engine = (fn) => host.evaluate(fn);

  console.log('one phone, as before');
  check('no second phone is asked for', (await net()).second === false && (await status()).phoneB === null && (await control.locator('#phone-pill').textContent()).startsWith('Phone:') && (await control.locator('#phone-b-pill').count()) === 0);
  check('and no second room code is registered', await engine(() => window.thirdEye.engine.linkB.stopped && !window.thirdEye.engine.linkB.peer));
  check('the second phone has no sources listed yet', await engine(() => !window.thirdEye.engine.mod.values.has('phoneB.motion')));

  console.log('the second tab');
  await control.locator('#phone-pill').click();
  check('the pairing pop-over has a tab for each phone', (await control.locator('#pair-tab-a').textContent()) === 'iPhone · paired' && (await control.locator('#pair-tab-b').textContent()).startsWith('iPhone B'));
  const room = (await net()).room;
  // A look at the second tab switches the second phone on; closing the
  // pop-over with none paired switches it off again.
  await control.locator('#pair-tab-b').click();
  check('a look at the second tab switches the second phone on', (await net()).second === true);
  await control.keyboard.press('Escape');
  check('and closing the pop-over with none paired switches it off again', await settle(async () => (await net()).second === false && (await control.locator('#phone-pill').textContent()).startsWith('Phone:'), 'off again'), await control.locator('#phone-pill').textContent());
  await control.locator('#phone-pill').click();
  await control.locator('#pair-tab-b').click();
  check('opening the second tab switches the second phone on', (await net()).second === true);
  check('it shows the second phone its own room code', (await control.locator('#pairing-pop .pop-code').textContent()) === `${room}-B` && (await mac(() => window.thirdEye.ui.phoneLinkB())).includes(`room=${room}B`));
  check('the one readout now names both phones', await settle(async () => (await control.locator('#phone-pill').textContent()) === 'Phones: A live · B not paired', 'pill'), await control.locator('#phone-pill').textContent());
  check('the first phone is not disturbed', await paired('phone'));
  const sessionA = await phone.evaluate(() => document.getElementById('state').textContent);

  console.log('pairing it');
  const phoneB = await context.newPage();
  await phoneB.setViewportSize({ width: 844, height: 390 });
  watch(phoneB, 'phone B', errors);
  await phoneB.goto(await mac(() => window.thirdEye.ui.phoneLinkB()));
  await phoneB.click('#start');
  check('the second phone pairs', await settle(() => paired('phoneB'), 'phone B paired', 30000), JSON.stringify((await status()).phoneB));
  check('and streams', await settle(async () => (await status()).phoneB.media === 'connected', 'B media', 20000));
  check('the first phone stayed paired throughout', (await paired('phone')) && sessionA.startsWith('LIVE') && (await phone.evaluate(() => document.getElementById('state').textContent)).startsWith('LIVE'), await phone.evaluate(() => document.getElementById('state').textContent));
  check('its tab and its readout say so', await settle(async () => (await control.locator('#pair-tab-b').textContent()) === 'iPhone B · paired' && (await control.locator('#phone-pill').textContent()) === 'Phones: A live · B live', 'tab'), await control.locator('#phone-pill').textContent());
  check('its own screen says it is phone B', await settle(async () => (await phoneB.locator('#room-label').textContent()) === `PHONE B · ${room}B`, 'label'), await phoneB.locator('#room-label').textContent());
  check('and the first phone\'s does not', (await phone.locator('#room-label').textContent()) === room);
  await control.keyboard.press('Escape');

  console.log('iPhone B as a source');
  await control.keyboard.press('2');
  check('key 2 makes iPhone B input A', (await input()).kind === 'phone2' && (await settle(async () => (await status()).input.kind === 'phone2' && (await status()).input.state === 'live', 'A live', 20000)), JSON.stringify((await status()).input));
  await control.keyboard.press('Shift+Digit1');
  check('with the first iPhone as B, both are live at once', (await input()).kindB === 'phone' && (await settle(async () => (await status()).inputB?.state === 'live' && (await status()).input.state === 'live', 'both live', 20000)), JSON.stringify((await status()).inputB));
  check('both feeds are bringing frames', await settle(() => engine(() => {
    const f = window.thirdEye.engine.inputs.feeds;
    return f.phone.frames > 3 && f.phone2.frames > 3;
  }), 'frames'));
  await control.keyboard.press('1');
  check('asking A for the first iPhone makes them trade places', (await input()).kind === 'phone' && (await input()).kindB === 'phone2');
  await control.locator('#input-b').hover();
  check('the strip has an icon for it', (await control.locator('#inview-b .inview-icon[data-kind="phone2"]').getAttribute('aria-pressed')) === 'true' && (await control.locator('#inview-b .inview-icon[data-kind="phone2"]').getAttribute('data-midi')) === 'inputB:phone2');
  await control.mouse.move(5, 5);

  console.log('controlling from it');
  check('its sensors arrive', await settle(async () => (await status()).sensorsB.live && (await status()).sensors.live, 'sensors B'));
  check('as sources of their own', await settle(() => engine(() => window.thirdEye.engine.mod.values.has('phoneB.motion') && window.thirdEye.engine.mod.values.has('padB.x')), 'sources'));
  check('it has the preset buttons and the trigger labels', await settle(async () => (await phoneB.locator('#presets .preset').count()) === 6 && (await phoneB.locator('.trig').nth(1).textContent()).length > 0, 'B buttons'));
  const freeze = () => mac(() => window.thirdEye.store.state.globals.freeze);
  const press = async (page, selector) => {
    const b = await page.locator(selector).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  await press(phoneB, '.trig >> nth=1');
  check('its Freeze button freezes', await settle(async () => (await freeze()) === true, 'freeze from B'));
  check('and lights on both phones', await settle(async () => (await phone.evaluate(() => document.querySelectorAll('.trig')[1].classList.contains('on'))) && (await phoneB.evaluate(() => document.querySelectorAll('.trig')[1].classList.contains('on'))), 'lit'));
  // (Both phones' buttons are one trigger: a press that lands while the
  // other phone's is still down is the same press. Wait for B to let go.)
  await settle(() => engine(() => !window.thirdEye.engine.sensorsB.shown[1] && !((window.thirdEye.engine.sensorsB.held >> 1) & 1)), 'B released');
  await press(phone, '.trig >> nth=1');
  check('the first phone releases it', await settle(async () => (await freeze()) === false, 'release from A'));
  await press(phoneB, '.preset >> nth=2');
  check('a preset button on it loads the preset', await settle(async () => (await mac(() => window.thirdEye.store.state.presetIndex)) === 2, 'preset from B'));

  console.log('the picture moves to /control');
  await output.close();
  host = control;
  check('both phones follow by themselves', await settle(async () => (await status())?.host.role === 'control' && (await paired('phone')) && (await paired('phoneB')), 'both on control', 45000), JSON.stringify({ a: (await status())?.phone.phone, b: (await status())?.phoneB?.phone }));
  check('and both pictures come back', await settle(async () => (await status()).input.state === 'live' && (await status()).inputB?.state === 'live', 'both live on control', 30000), JSON.stringify([(await status()).input, (await status()).inputB]));

  console.log('one drops, the other stays');
  await phone.close();
  check('the first phone going leaves the second paired', await settle(async () => !(await paired('phone')), 'A gone', 20000) && (await paired('phoneB')) && (await status()).inputB.state === 'live');

  console.log('switching it off');
  await control.locator('#phone-pill').click();
  check('the readout opens the pop-over at the phone that needs a look', (await control.locator('#pair-tab-a').getAttribute('aria-selected')) === 'true');
  await control.locator('#pair-tab-b').click();
  check('and the other phone is its tab', (await control.locator('#pair-tab-b').getAttribute('aria-selected')) === 'true' && (await control.locator('#pair-stop-b').isVisible()));
  check('Pair without internet is not offered for it yet', await control.locator('#pairing-pop .pair-offline').isHidden());
  await control.locator('#pair-stop-b').click();
  check('Stop using iPhone B lets go of it', (await net()).second === false && (await settle(async () => (await status()).phoneB === null && (await control.locator('#phone-pill').textContent()).startsWith('Phone:'), 'B off')));
  check('and of its room code', await settle(() => engine(() => window.thirdEye.engine.linkB.stopped && !window.thirdEye.engine.linkB.peer), 'released'));
  check('the second phone sees the Mac go', await settle(async () => !(await phoneB.evaluate(() => document.getElementById('state').textContent)).startsWith('LIVE'), 'B notices', 30000), await phoneB.evaluate(() => document.getElementById('state').textContent));

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
