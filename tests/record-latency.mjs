// Recording the output, the latency measurement, and codec preference.
//   node tests/record-latency.mjs

import { benignError, check, failureCount, launch, openSession, outputStats, sleep, startPeerServer, startSite, stopPeerServer, waitFor } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];

try {
  const { control, output } = await openSession(browser, site, peerServer, errors);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const settle = (fn, label, timeout = 10000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

  console.log('recording');
  check('REC is offered in the top bar and is MIDI-mappable', (await control.locator('#rec').textContent()) === 'REC' && (await control.locator('#rec').getAttribute('data-midi')) === 'record');
  await control.keyboard.press('r');
  check('R starts recording', await settle(async () => (await status()).recording.active, 'recording'), (await status()).recording.error);
  check('WebM data reaches the file while still recording', await settle(async () => (await status()).recording.bytes > 20000, 'bytes', 20000), `${(await status()).recording.bytes} bytes after ${(await status()).recording.seconds.toFixed(0)} s`);
  check('the button shows the elapsed time, and the size on hover', /REC \d\d:\d\d/.test(await control.locator('#rec').textContent()) && /MB/.test(await control.locator('#rec').getAttribute('title')), await control.locator('#rec').textContent());
  const name = (await status()).recording.name;
  await control.click('#rec');
  check('REC stops it', await settle(async () => {
    const r = (await status()).recording;
    return !r.active && r.finished === 1;
  }, 'stopped'));
  await control.evaluate(() => window.thirdEye.ui.setView('setup'));
  check('the recording is listed on the setup screen', await settle(async () => (await control.locator('.recording').count()) === 1 && (await control.locator('.recording').textContent()).includes(name), 'listed'), name);
  const head = await control.evaluate(async (file) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('recordings');
    const f = await (await dir.getFileHandle(file)).getFile();
    return { size: f.size, bytes: [...new Uint8Array(await f.slice(0, 12).arrayBuffer())] };
  }, name);
  const isWebm = head.bytes[0] === 0x1a && head.bytes[1] === 0x45 && head.bytes[2] === 0xdf && head.bytes[3] === 0xa3;
  const isMp4 = String.fromCharCode(...head.bytes.slice(4, 8)) === 'ftyp';
  check('the file is a real video container', head.size > 20000 && (isWebm || isMp4), `${name}, ${head.size} bytes, ${isMp4 ? 'MP4' : isWebm ? 'WebM' : 'unknown'}`);
  check('it plays back', await control.evaluate(async (file) => {
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
    return v.videoWidth === 1280 && v.videoHeight === 720;
  }, name).catch((e) => e.message) === true);
  const [download] = await Promise.all([control.waitForEvent('download'), control.click('.recording >> text=Save to disk')]);
  check('Save to disk downloads it', download.suggestedFilename() === name);
  control.once('dialog', (d) => d.accept());
  await control.click('.recording >> text=Delete');
  check('Delete removes it', await settle(async () => (await control.locator('.recording').count()) === 0, 'deleted'));

  // MP4 on request.
  await control.selectOption('#record-panel select', 'mp4');
  await control.keyboard.press('r');
  await settle(async () => (await status()).recording.active, 'mp4 recording');
  await sleep(2500);
  const mp4 = (await status()).recording.name;
  await control.keyboard.press('r');
  await settle(async () => (await status()).recording.finished === 2, 'mp4 stopped', 20000);
  const mp4Head = await control.evaluate(async (file) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('recordings');
    const f = await (await dir.getFileHandle(file)).getFile();
    return { size: f.size, tag: String.fromCharCode(...new Uint8Array(await f.slice(4, 8).arrayBuffer())) };
  }, mp4);
  check('MP4 can be chosen instead', mp4.endsWith('.mp4') && mp4Head.tag === 'ftyp' && mp4Head.size > 20000, `${mp4}, ${mp4Head.size} bytes`);
  await control.selectOption('#record-panel select', 'webm');

  console.log('latency measurement');
  await control.keyboard.press('3');
  await control.click('#latency-test');
  check('refuses to measure on the test pattern', await settle(async () => (await control.locator('#latency-note').textContent()).includes('Select the phone or a camera'), 'refused'));
  await control.keyboard.press('1');
  await waitFor(async () => (await status()).input.state === 'live', { label: 'phone live', timeout: 20000 });
  // No projector here: stand in for the camera seeing the flash 150 ms late.
  await output.evaluate(() => {
    const p = window.thirdEye.engine.probe;
    p.sample = () => (p.state === 'running' && p.phase === 'flash' && p.lastNow >= p.flashAt + 150 ? 0.9 : 0.05);
  });
  await control.click('#latency-test');
  await waitFor(async () => (await status()).latencyTest.state === 'running', { label: 'measurement started' });
  let sawBlack = false;
  let sawWhite = false;
  await waitFor(async () => {
    const m = (await outputStats(output)).mean;
    if (m === 0) sawBlack = true;
    if (m > 250) sawWhite = true;
    return (await status()).latencyTest.state !== 'running';
  }, { label: 'measurement', timeout: 30000, interval: 60 });
  const t = (await status()).latencyTest;
  check('the output flashes black and white during the test', sawBlack && sawWhite);
  check('the live run completes with all flashes seen', t.state === 'done' && t.ms >= 150, `${t.ms?.toFixed(0)} ms (${t.message}); frames in this sandbox are hundreds of ms apart, so this number is coarse`);
  // Accuracy, with the sandbox's slow frames taken out: step the same probe
  // at an exact 60 Hz and have the "camera" answer 150 ms after each flash.
  const exact = await output.evaluate(() => {
    const p = window.thirdEye.engine.probe;
    p.state = 'idle';
    p.start();
    for (let now = 1000; p.state === 'running' && now < 60000; now += 1000 / 60) p.frame(now, 1000 / 60);
    return p.status();
  });
  check('at 60 Hz a 150 ms loop measures within one frame of 150 ms', exact.state === 'done' && exact.ms >= 150 && exact.ms < 167, `${exact.ms?.toFixed(1)} ms (${exact.message})`);
  // One flash arriving 800 ms late (as seen on a real iPhone) must not set the
  // result, and is named on its own instead of stretching the range.
  const stray = await output.evaluate(() => {
    const p = window.thirdEye.engine.probe;
    const sample = p.sample;
    p.sample = () => (p.state === 'running' && p.phase === 'flash' && p.lastNow >= p.flashAt + (p.trial === 3 ? 800 : 150) ? 0.9 : 0.05);
    p.state = 'idle';
    p.start();
    for (let now = 1000; p.state === 'running' && now < 60000; now += 1000 / 60) p.frame(now, 1000 / 60);
    p.sample = sample;
    return p.status();
  });
  check('a single late flash is called a stray and does not move the result', stray.state === 'done' && stray.ms < 167 && /one stray at 8\d\d ms/.test(stray.message) && !/–8\d\d/.test(stray.message), `${stray.ms?.toFixed(1)} ms (${stray.message})`);
  await sleep(700);
  check('the result is shown on the setup screen', (await control.locator('#latency-note').textContent()).includes('Measured'));
  check('the picture returns afterwards', await settle(async () => {
    const m = (await outputStats(output)).mean;
    return m > 3 && m < 250;
  }, 'picture back'));

  console.log('codec preference');
  const first = (await waitFor(async () => (await status()).phone.codec, { label: 'codec', timeout: 15000 }));
  check('pairing works with H.264 preferred, falling back when the browser lacks it', !!first, `in use: ${first} (this Chromium build has no H.264)`);
  await control.selectOption('#codec', 'vp9');
  check('choosing VP9 renegotiates to VP9', await settle(async () => (await status()).phone.codec === 'VP9' && (await status()).input.state === 'live', 'vp9', 30000), (await status()).phone.codec);
  await control.selectOption('#codec', 'vp8');
  check('choosing VP8 renegotiates to VP8', await settle(async () => (await status()).phone.codec === 'VP8' && (await status()).input.state === 'live', 'vp8', 30000), (await status()).phone.codec);
  check('status shows the codec in use', await settle(() => control.evaluate(() => window.thirdEye.ui.statusRows.stream.textContent.startsWith('VP8')), 'stream row', 15000), await control.evaluate(() => window.thirdEye.ui.statusRows.stream.textContent));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
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
