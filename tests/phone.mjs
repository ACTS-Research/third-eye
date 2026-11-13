// Phase 2 test: real WebRTC between a /phone page (Chromium's fake camera)
// and /output, through a local PeerServer. Covers pairing, live video into
// the pipeline, last-frame hold, and every reconnect path.
//   node tests/phone.mjs

import { check, failureCount, launch, outputStats, sleep, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
let peerServer = await startPeerServer();
const browser = await launch();
const errors = [];

const outStatus = (control) => control.evaluate(() => window.thirdEye.ui.status);
const waitStatus = (control, pred, label, timeout = 20000) =>
  waitFor(async () => {
    const s = await outStatus(control);
    return s && pred(s) ? s : null;
  }, { label, timeout });

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);

  let output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);

  console.log('pairing');
  await waitStatus(control, (s) => s.phone.signal === 'open', 'host registered with signaling');
  check('host registered with the signaling server', true);
  const url = await control.locator('#phone-link').getAttribute('href');
  const room = await control.locator('#room-code').textContent();
  check('pairing link carries the room code', url.includes(`room=${room}`) && url.includes('/phone/'), url);
  check('QR code drawn', await control.evaluate(() => {
    const c = document.getElementById('qr');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++;
    return dark > 1000;
  }));

  let phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(url);
  check('room code prefilled from the link', (await phone.inputValue('#room-input')) === room);
  await phone.click('#start');
  await control.keyboard.press('1');

  let s = await waitStatus(control, (st) => st.phone.media === 'connected' && st.input.state === 'live' && st.input.fps > 5, 'phone video live');
  check('phone video is live in the pipeline', true, `${s.input.width}x${s.input.height} @ ${s.input.fps.toFixed(0)} fps`);
  check('phone reported as paired', s.phone.phone === 'connected');
  s = await waitStatus(control, (st) => st.latency && st.phone.rttMs !== undefined && st.phone.kbps > 0, 'stats');
  check('latency and link stats reported', true, `latency ${s.latency.measured ? '' : '~'}${s.latency.ms.toFixed(0)} ms, ${s.phone.route}, ${s.phone.codec}, ${s.phone.kbps.toFixed(0)} kbps`);
  check('media is direct, not relayed', s.phone.route !== 'relayed', s.phone.route);
  check('output shows the phone picture', (await outputStats(output)).mean > 5);
  check('phone shows LIVE', (await phone.locator('#state').textContent()).startsWith('LIVE'));
  // Palette and dimmer changed on the Mac reach a paired phone without a rescan.
  const look = () => phone.evaluate(() => `${document.documentElement.dataset.palette ?? 'darkroom'} ${(document.documentElement.dataset.dim ?? '100') + '%'}`);
  await control.evaluate(() => {
    localStorage.setItem('thirdeye.palette', 'ice');
    localStorage.setItem('thirdeye.dim', '40');
  });
  check('the phone follows the palette and dimmer live', await waitFor(async () => (await look()) === 'ice 40%', { label: 'look', timeout: 8000 }).then(() => true, () => false), await look());
  await control.evaluate(() => {
    localStorage.setItem('thirdeye.palette', 'darkroom');
    localStorage.setItem('thirdeye.dim', '100');
  });
  check('and back', await waitFor(async () => (await look()) === 'darkroom 100%', { label: 'look back', timeout: 8000 }).then(() => true, () => false), await look());

  await control.locator('#pills .pill').nth(2).click();
  const stepText = await control.locator('#pairing-pop .steps').textContent();
  check('pairing pop-over shows every connection step as done', (await control.locator('#pairing-pop .steps li.done').count()) === 5 && stepText.includes('direct'), stepText);
  await control.keyboard.press('Escape');

  console.log('phone controls');
  // Flip, quality and camera on / off live in the camera panel.
  await phone.locator('#panel-toggle').dispatchEvent('click');
  await phone.selectOption('#tools select', '360p30');
  s = await waitStatus(control, (st) => st.input.width === 640 && st.input.state === 'live', 'quality change');
  check('quality preset changes the stream', true, `${s.input.width}x${s.input.height}`);
  // A flip must never put a black frame on the output.
  await control.keyboard.press('x');
  let darkest = 255;
  const sampler = setInterval(async () => {
    try {
      darkest = Math.min(darkest, (await outputStats(output)).mean);
    } catch { /* page busy */ }
  }, 60);
  await phone.click('text=Flip');
  await sleep(2500);
  clearInterval(sampler);
  await control.keyboard.press('x');
  check('no black flash during a camera flip', darkest > 5, `darkest frame mean ${darkest.toFixed(1)}`);
  await waitStatus(control, (st) => st.input.state === 'live' && st.phone.info?.facing === 'user', 'flip');
  check('flip keeps the stream alive', true);
  const caps = await phone.evaluate(() => ({
    sliders: document.querySelectorAll('#adjust .fader, #zoom .fader').length,
    reported: Object.keys(window.thirdEyePhone.track.getCapabilities()).filter((k) => ['zoom', 'torch', 'exposureCompensation', 'focusDistance'].includes(k)),
  }));
  check('camera controls match reported capabilities', caps.sliders === caps.reported.filter((k) => k !== 'torch').length, `capabilities: ${caps.reported.join(', ') || 'none'}; sliders: ${caps.sliders}`);

  await phone.click('#tools button:has-text("Camera on")');
  await waitStatus(control, (st) => st.input.state === 'paused' && st.phone.info?.controllerOnly, 'controller only');
  check('controller-only stops the camera, link stays up', await phone.evaluate(() => window.thirdEyePhone.stream === null));
  // Effects keep animating on a held input, so compare with them bypassed.
  await control.keyboard.press('x');
  await sleep(1200);
  const held1 = await outputStats(output);
  await sleep(500);
  const held2 = await outputStats(output);
  check('output holds the last frame meanwhile', held1.mean > 5 && held1.hash === held2.hash);
  await control.keyboard.press('x');
  await phone.click('#tools button:has-text("Camera off")');
  await waitStatus(control, (st) => st.input.state === 'live', 'camera back');
  check('camera resumes from controller-only', true);

  console.log('visibility');
  await phone.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden ?? false });
    window.__hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => control.evaluate(() => !!document.querySelector('#alerts .alert.bad')?.textContent.includes('background')), { label: 'control alert' });
  check('control warns when the phone page is hidden', true);
  check('output never shows status', await output.evaluate(() => document.body.innerText.trim() === '' || document.getElementById('hint').classList.contains('hidden')));
  await phone.evaluate(() => {
    window.__hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check('phone shows the loud warning on return', await phone.locator('#warning').isVisible());
  await phone.click('#warning-ok');

  console.log('stall and reconnect');
  await phone.close();
  s = await waitStatus(control, (st) => st.input.state === 'stalled', 'stall detected');
  check('stall detected', true);
  await control.locator('#pills .pill').nth(2).click();
  check('with the phone gone, the pop-over points at the step that broke', await waitFor(async () => (await control.locator('#pairing-pop .steps li.stuck').textContent()).includes('Phone found the Mac'), { label: 'stuck step', timeout: 15000 }).then(() => true, () => false), await control.locator('#pairing-pop .steps li.stuck').textContent());
  await control.keyboard.press('Escape');
  check('stall alert on control', await control.evaluate(() => [...document.querySelectorAll('#alerts .alert')].some((a) => a.textContent.includes('holding the last frame'))));
  await control.keyboard.press('x');
  await sleep(1200);
  const h1 = await outputStats(output);
  await sleep(500);
  const h2 = await outputStats(output);
  check('last frame held on stall', h1.mean > 5 && h1.hash === h2.hash);
  await control.keyboard.press('x');
  // As after a taken room code: the "scan again" notice is up while no phone is paired.
  await output.evaluate(() => {
    window.thirdEye.engine.link.notice = 'Room code TEST1 was in use somewhere else, so a new one was made. Scan the QR code again.';
  });
  check('the room-code strip shows while no phone is paired', await waitFor(() => control.locator('#alerts .alert[data-key="room"]').count().then((n) => n === 1), { label: 'room strip' }).then(() => true, () => false));

  phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(url);
  await phone.click('#start');
  await waitStatus(control, (st) => st.input.state === 'live', 'phone rejoined');
  check('phone rejoins after a reload', true);
  check('the room-code strip goes away once the phone pairs', await waitFor(() => control.locator('#alerts .alert[data-key="room"]').count().then((n) => n === 0), { label: 'room strip gone' }).then(() => true, () => false));

  await output.reload();
  await waitFor(() => output.evaluate(() => window.thirdEye?.engine.inputs.feeds.phone.frames > 3), { label: 'frames after output reload', timeout: 30000 });
  await waitStatus(control, (st) => st.phone.media === 'connected' && st.input.state === 'live', 'reconnect after output reload', 30000);
  check('phone reconnects by itself after /output reloads', true);

  // Signaling goes away: the paired stream must keep flowing.
  await stopPeerServer(peerServer);
  await sleep(100);
  s = await waitStatus(control, (st) => st.phone.signal !== 'open', 'signaling loss noticed', 30000);
  const framesNow = () => output.evaluate(() => window.thirdEye.engine.inputs.feeds.phone.frames);
  const n1 = await framesNow();
  await sleep(4000);
  const n2 = await framesNow();
  s = await outStatus(control);
  check('stream survives loss of the signaling server', s.input.state === 'live' && n2 - n1 > 8, `signal: ${s.phone.signal}, ${n2 - n1} frames in 4 s with the server down`);
  peerServer = await startPeerServer();
  await waitStatus(control, (st) => st.phone.signal === 'open', 'signaling back', 30000);
  check('host re-registers when signaling returns', true);

  console.log('two output windows');
  // A second /output on the same room must be told plainly why it is idle,
  // and must not disturb the first one.
  const second = await context.newPage();
  watch(second, 'output2', errors);
  await second.goto(`${site.url}/output/`);
  check('a second output window in the same browser stands by instead of starting', await waitFor(() => second.evaluate(() => window.thirdEye?.standby === true && !document.getElementById('standby').hidden), { label: 'standby', timeout: 10000 }).then(() => true, () => false));
  await sleep(1500);
  check('the first output keeps the phone', await output.evaluate(() => window.thirdEye.engine.link.status(performance.now()).phone === 'connected'));

  // The room held from somewhere this browser cannot see (another computer,
  // or a stale registration): a separate browser context plays that part.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto(`${site.url}/output/`);
  await waitFor(() => stranger.evaluate(() => !!window.thirdEye?.store), { label: 'stranger up' });
  await stranger.evaluate(({ room, signal }) => window.thirdEye.store.merge('net', { room, signal }), { room, signal: peerServer.signalUrl });
  const moved = await waitFor(() => stranger.evaluate((taken) => {
    const st = window.thirdEye.engine.link.status(performance.now());
    return window.thirdEye.store.state.net.room !== taken && st.signal === 'open' ? st.notice : null;
  }, room), { label: 'new room', timeout: 40000 }).catch(() => null);
  check('an output that finds its room taken elsewhere moves to a new code and says so', !!moved && moved.includes(room), moved ?? 'still stuck');
  check('the output that had the room is untouched', await output.evaluate(() => window.thirdEye.engine.link.status(performance.now()).phone === 'connected'));
  await other.close();

  // "Restart output": every output window goes, one new one opens and gets
  // the room. The first output here was opened by hand, so it cannot close
  // itself and is blanked instead.
  await control.evaluate(() => window.thirdEye.ui.setView('setup'));
  const [fresh] = await Promise.all([context.waitForEvent('page'), control.click('#restart-output')]);
  watch(fresh, 'output3', errors);
  check('old output windows are closed or blanked, the idle one included', await waitFor(() => second.isClosed() || second.url() === 'about:blank', { label: 'second gone' }).then(() => true, () => false) && (await waitFor(() => output.isClosed() || output.url() === 'about:blank', { label: 'first gone' }).then(() => true, () => false)));
  check('one new output opens and takes the room', await waitFor(() => fresh.evaluate(() => window.thirdEye?.engine.link.status(performance.now()).signal === 'open'), { label: 'fresh registered', timeout: 30000 }).then(() => true, () => false));
  s = await waitStatus(control, (st) => st.phone.media === 'connected' && st.input.state === 'live', 'phone on the new output', 40000);
  check('the phone finds the new output by itself', true);
  output = fresh;

  console.log('local camera');
  await control.evaluate(() => window.thirdEye.ui.setView('setup'));
  await control.click('text=Find cameras');
  await control.keyboard.press('2');
  s = await waitStatus(control, (st) => st.input.kind === 'camera' && st.input.state === 'live', 'local camera live');
  check('local camera feeds the pipeline', true, `${s.camera.label} ${s.input.width}x${s.input.height}`);
  check('camera list populated', (await control.locator('#input-panel select').nth(1).locator('option').count()) > 1);
  await control.keyboard.press('1');
  await waitStatus(control, (st) => st.input.kind === 'phone' && st.input.state === 'live', 'back to phone');
  check('switching back to the phone is live', true);

  const benign = (e) => /peerjs|WebSocket|ERR_CONNECTION_REFUSED|Lost connection|server-error|socket/i.test(e);
  const real = errors.filter((e) => !benign(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
  if (process.env.SHOTS) {
    await control.screenshot({ path: `${process.env.SHOTS}/control2.png` });
    await phone.screenshot({ path: `${process.env.SHOTS}/phone.png` });
  }
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
