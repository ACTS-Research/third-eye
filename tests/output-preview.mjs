// The phone's preview showing the Mac's finished picture (a setting in the
// phone's camera panel): the picture comes back on the video call, follows
// Blackout, is only sent while asked for, and gives way to the camera when
// it cannot be shown. Also: camera switches the camera lacks are dimmed, not
// removed.
//   node tests/output-preview.mjs

import { benignError, check, failureCount, launch, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  // A rear camera with a torch and a white-balance lock, and a front camera
  // with neither, as on an iPhone.
  await context.addInitScript(() => {
    if (!location.pathname.includes('/phone/')) return;
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await real(constraints);
      const front = constraints?.video?.facingMode?.ideal === 'user';
      for (const track of stream.getVideoTracks()) {
        const caps = track.getCapabilities.bind(track);
        track.getCapabilities = () => ({ ...caps(), ...(front ? {} : { torch: true, whiteBalanceMode: ['manual', 'continuous'] }) });
        const apply = track.applyConstraints.bind(track);
        track.applyConstraints = (c) => (c?.advanced ? Promise.resolve() : apply(c));
      }
      return stream;
    };
  });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  await waitFor(async () => (await status())?.phone.signal === 'open', { label: 'registered', timeout: 20000 });
  const phone = await context.newPage();
  watch(phone, 'phone', errors);
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.goto(await control.locator('#phone-link').getAttribute('href'));
  await phone.locator('#start').dispatchEvent('click');
  await control.keyboard.press('1');
  await waitFor(async () => (await status()).phone.media === 'connected' && (await status()).input.state === 'live', { label: 'live', timeout: 30000 });

  // What the preview is showing: which stream, its size, and how bright.
  const preview = () => phone.evaluate(() => {
    const video = document.getElementById('self');
    const app = window.thirdEyePhone;
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 27;
    const ctx = c.getContext('2d');
    let mean = -1;
    if (video.videoWidth) {
      ctx.drawImage(video, 0, 0, 48, 27);
      const d = ctx.getImageData(0, 0, 48, 27).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      mean = sum / (48 * 27 * 3);
    }
    return {
      shows: video.srcObject === app.stream ? 'camera' : video.srcObject && video.srcObject === app.link.remote ? 'output' : 'other',
      width: video.videoWidth,
      height: video.videoHeight,
      mean,
      tagged: document.getElementById('stage').classList.contains('output'),
      turn: getComputedStyle(document.getElementById('stage')).getPropertyValue('--turn').trim(),
    };
  });
  const macSends = () => control.evaluate(() => window.thirdEye.engine.returnFeed.on);
  const note = () => phone.locator('#preview-note').textContent();

  console.log('the setting');
  check('the preview shows the camera to begin with', (await preview()).shows === 'camera' && !(await macSends()));
  check('the Mac answered the call with its picture, but is not drawing it', await phone.evaluate(() => !!window.thirdEyePhone.link.remote) && !(await macSends()));
  await phone.locator('#panel-toggle').dispatchEvent('click');
  check('the camera panel has the preview setting, and says what it does', (await phone.locator('#preview-kind').textContent()) === 'Preview: camera' && /effects and Freeze/.test(await note()), await note());
  await phone.locator('#preview-kind').dispatchEvent('click');
  check('switched to Mac output, the Mac starts sending', await settle(macSends, 'mac sends'));
  check('and the preview shows the Mac\'s picture, small', await settle(async () => {
    const p = await preview();
    return p.shows === 'output' && p.width === 480 && p.height === 270 && p.mean > 15 && p.tagged;
  }, 'output shown', 25000), JSON.stringify(await preview()));
  check('the setting is kept', (await phone.evaluate(() => JSON.parse(localStorage.getItem('thirdeye.phone.v1')).preview)) === 'output' && (await phone.locator('#preview-kind').textContent()) === 'Preview: Mac output');
  await phone.locator('#panel-close').dispatchEvent('click');

  console.log('it is the finished picture');
  await control.keyboard.press('Backspace');
  check('Blackout on the Mac blacks the phone\'s preview', await settle(async () => (await preview()).mean >= 0 && (await preview()).mean < 6, 'black', 20000), JSON.stringify(await preview()));
  await control.keyboard.press('Backspace');
  check('and it comes back', await settle(async () => (await preview()).mean > 15, 'back', 20000), JSON.stringify(await preview()));
  await phone.locator('#rotate').dispatchEvent('click');
  check('Rotate turns the picture on the Mac; the preview is not turned a second time', await settle(async () => (await preview()).turn === '0deg' || (await preview()).turn === '-0deg', 'no css turn') && (await phone.evaluate(() => document.getElementById('stage').dataset.turn)) === '90', JSON.stringify(await preview()));
  for (let i = 0; i < 3; i++) await phone.locator('#rotate').dispatchEvent('click');

  console.log('when it cannot be shown');
  await phone.locator('#panel-toggle').dispatchEvent('click');
  await phone.locator('#scan').dispatchEvent('click');
  check('reading a code uses the camera\'s own picture', await settle(async () => (await preview()).shows === 'camera', 'camera for scanning'));
  await phone.locator('#panel-toggle').dispatchEvent('click');
  await phone.locator('#scan').dispatchEvent('click');
  check('and the output returns afterwards', await settle(async () => (await preview()).shows === 'output', 'output again'));
  await control.reload();
  await waitFor(() => control.evaluate(() => !!window.thirdEye?.ui?.status), { label: 'control back', timeout: 20000 });
  check('after a Mac reload the phone asks again and the output comes back', await settle(async () => (await macSends().catch(() => false)) && (await preview()).shows === 'output' && (await preview()).mean > 15, 'after reload', 40000), JSON.stringify(await preview()));

  console.log('back to the camera');
  await phone.locator('#panel-toggle').dispatchEvent('click');
  await phone.locator('#preview-kind').dispatchEvent('click');
  check('the preview shows the camera and the Mac stops sending', await settle(async () => (await preview()).shows === 'camera' && !(await preview()).tagged && !(await macSends()), 'camera again'), JSON.stringify(await preview()));
  await phone.locator('#panel-close').dispatchEvent('click');

  console.log('camera switches the camera does not have');
  const quick = () => phone.evaluate(() => {
    const row = document.getElementById('quick').getBoundingClientRect();
    return {
      torch: { hidden: document.getElementById('quick-torch').hidden, off: document.getElementById('quick-torch').disabled },
      wb: { hidden: document.getElementById('quick-wb').hidden, off: document.getElementById('quick-wb').disabled },
      flip: Math.round(document.getElementById('quick-flip').getBoundingClientRect().width),
      row: Math.round(row.width),
    };
  });
  const rear = await quick();
  check('rear camera: torch and white-balance lock can be used', !rear.torch.off && !rear.wb.off, JSON.stringify(rear));
  await phone.locator('#quick-flip').dispatchEvent('click');
  check('front camera: they are dimmed, still there', await settle(async () => {
    const q = await quick();
    return q.torch.off && q.wb.off && !q.torch.hidden && !q.wb.hidden;
  }, 'dimmed'), JSON.stringify(await quick()));
  check('and nothing in the row has moved', (await quick()).flip === rear.flip && (await quick()).row === rear.row, `${rear.flip} → ${(await quick()).flip}`);

  const real = errors.filter((e) => !benignError(e));
  check('no unexpected errors', real.length === 0, real.slice(0, 3).join(' | '));
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
