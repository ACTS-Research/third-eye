// Phase 3 test: all effects, the sensor/touch data channel, the modulation
// matrix, trigger actions, presets and crossfade.
//   node tests/modulation.mjs

import { benignError, check, failureCount, launch, openSession, outputStats, sleep, startPeerServer, startSite, stopPeerServer, waitFor } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];

try {
  const { control, output, phone } = await openSession(browser, site, peerServer, errors);
  const source = (id) => output.evaluate((key) => window.thirdEye.engine.mod.get(key), id);
  const state = (fn) => output.evaluate(fn);
  const settle = (fn, label, timeout = 6000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

  console.log('effects');
  const effects = await output.evaluate(() => [...window.thirdEye.engine.pipeline.programs.keys()]);
  check('all 12 effects compiled', effects.length === 12, effects.join(', '));
  await control.keyboard.press('3'); // test pattern
  // Each effect alone must change the picture compared with a clean chain.
  const setChain = (types) => control.evaluate(async (list) => {
    const { store } = window.thirdEye;
    const picker = document.querySelector('#col-chain select');
    store.setScene({ chain: [], mappings: [], lfos: store.state.lfos });
    for (const type of list) {
      picker.value = type;
      [...document.querySelectorAll('#col-chain button')].find((b) => b.textContent === 'Add effect').click();
    }
  }, types);
  await control.keyboard.press(' '); // freeze the pattern so only the effect differs
  await setChain([]);
  await sleep(700);
  const clean = (await outputStats(output)).hash;
  const dead = [];
  for (const type of effects) {
    await setChain([type]);
    const changed = await settle(async () => (await outputStats(output)).hash !== clean, type, 3000);
    if (!changed) dead.push(type);
  }
  check('every effect alters the picture', dead.length === 0, dead.length ? `no change from: ${dead.join(', ')}` : '');
  await control.keyboard.press(' ');
  await setChain(effects);
  await sleep(600);
  check('all 12 chained render without error', (await outputStats(output)).mean >= 0 && !(await state(() => window.thirdEye.engine.renderErrorLogged)));
  check('chain editor shows 12 cards', (await control.locator('.fx').count()) === 12);

  console.log('sensor channel');
  const channel = await phone.evaluate(() => {
    const ch = window.thirdEyePhone.link.sensorChannel;
    return { ordered: ch.ordered, maxRetransmits: ch.maxRetransmits, negotiated: ch.negotiated, state: ch.readyState };
  });
  check('sensor channel is unordered with no retransmits', channel.ordered === false && channel.maxRetransmits === 0 && channel.state === 'open', JSON.stringify(channel));
  const hz = await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.sensors?.hz > 20 && window.thirdEye.ui.status.sensors.hz), { label: 'sensor rate' });
  check('sensor packets arrive', true, `${hz.toFixed(0)} Hz in this sandbox (target 60)`);

  // Phone upright in portrait, rolled 30 degrees anticlockwise.
  await phone.evaluate(() => {
    window.__sim = setInterval(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 90, beta: 60, gamma: -30 }));
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
        acceleration: { x: 0.2, y: 0.1, z: 0 },
        accelerationIncludingGravity: { x: 0, y: -9.8, z: 0 },
        rotationRate: { alpha: 90, beta: 0, gamma: -180 },
        interval: 16,
      }));
    }, 16);
  });
  await settle(async () => Math.abs(await source('phone.yaw')) > 0.1, 'orientation');
  const roll = await source('phone.roll');
  const pitch = await source('phone.pitch');
  const yaw = await source('phone.yaw');
  check('orientation becomes roll / pitch / yaw', roll > 0.05 && roll < 0.3 && pitch > 0.1 && Math.abs(yaw - 0.5) < 0.01, `roll ${roll.toFixed(3)}, pitch ${pitch.toFixed(3)}, yaw ${yaw.toFixed(3)}`);
  check('rotation rate becomes spin', Math.abs((await source('phone.spinZ')) - 0.25) < 0.01 && Math.abs((await source('phone.spinY')) + 0.5) < 0.01);
  check('uPhone follows the roll', await settle(() => state(() => Math.abs(window.thirdEye.engine.sensors.angles[0] - window.thirdEye.engine.sensors.target[0]) < 0.01), 'angles'));

  check('no shake while still', (await source('phone.shake')) < 0.2);
  await phone.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 25, y: 5, z: 0 }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 16 }));
    }
    clearInterval(window.__sim);
    window.__shake = setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 25, y: 5, z: 0 }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 16 })), 16);
  });
  check('shake detector fires', await settle(async () => (await source('phone.shake')) > 0.5, 'shake'));
  await phone.evaluate(() => clearInterval(window.__shake));

  console.log('touch');
  const pad = await phone.locator('.pad').boundingBox();
  await phone.mouse.move(pad.x + pad.width * 0.8, pad.y + pad.height * 0.25);
  await phone.mouse.down();
  await settle(async () => (await source('pad.touch')) === 1, 'pad down');
  const px = await source('pad.x');
  const py = await source('pad.y');
  check('XY pad position arrives', Math.abs(px - 0.8) < 0.03 && Math.abs(py - 0.75) < 0.03, `x ${px.toFixed(2)}, y ${py.toFixed(2)}`);
  await phone.mouse.up();
  check('pad release clears the gate, keeps the position', (await settle(async () => (await source('pad.touch')) === 0, 'pad up')) && Math.abs((await source('pad.x')) - 0.8) < 0.03);

  const labels = await phone.locator('.trig').allTextContents();
  check('trigger buttons are labelled with their actions', labels[0] === 'Glitch burst' && labels[3] === 'Next preset', labels.join(' | '));

  console.log('mappings');
  await setChain(['feedback']);
  // Touch a parameter, then add a mapping: it should target that parameter.
  const slider = control.locator('.fx').first().locator('.tp-sldv_t').nth(1);
  const box = await slider.boundingBox();
  await control.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await control.click('text=Add mapping');
  await sleep(200);
  let mapping = await state(() => window.thirdEye.store.state.mappings[0]);
  check('"Add mapping" targets the last touched parameter', mapping?.key === 'zoom' && mapping.source === 'pad.x', JSON.stringify(mapping));
  await control.evaluate((id) => window.thirdEye.store.patchItem('mappings', id, { mode: 'set', amount: 1, smooth: 0 }), mapping.id);
  const resolved = () => state(() => {
    const { pipeline } = window.thirdEye.engine;
    return [...pipeline.cur.instances.values()][0].values.zoom;
  });
  await phone.mouse.move(pad.x + pad.width * 0.999, pad.y + pad.height * 0.5);
  await phone.mouse.down();
  check('pad at the right drives zoom to its maximum', await settle(async () => (await resolved()) > 1.24, 'zoom max'), `zoom ${(await resolved()).toFixed(3)}`);
  await phone.mouse.move(pad.x + 1, pad.y + pad.height * 0.5);
  check('pad at the left drives zoom to its minimum', await settle(async () => (await resolved()) < 0.81, 'zoom min'), `zoom ${(await resolved()).toFixed(3)}`);
  await phone.mouse.up();
  check('base value untouched by modulation', await state(() => Math.abs(window.thirdEye.store.state.chain[0].params.zoom - 1.03) < 0.2));
  await control.evaluate((id) => window.thirdEye.store.patchItem('mappings', id, { source: 'lfo.4', mode: 'add', amount: 0.3 }), mapping.id);
  // (Headless Chromium starves background pages of frames, so poll.)
  await settle(async () => (await source('lfo.4')) !== 0, 'lfo running');
  const z1 = await resolved();
  check('LFO modulates a parameter', await settle(async () => Math.abs((await resolved()) - z1) > 0.02, 'lfo moved zoom'), `from ${z1.toFixed(3)} to ${(await resolved()).toFixed(3)}`);
  check('source meters update on control', await control.evaluate(() => [...document.querySelectorAll('.meter .bar i')].some((i) => parseFloat(i.style.width) > 0)));

  console.log('triggers and presets');
  const presetCount = await control.locator('.preset-list button').count();
  check('factory presets listed', presetCount >= 8, `${presetCount} presets`);
  const trig = (n) => phone.locator('.trig').nth(n - 1).boundingBox();
  const t4 = await trig(4);
  await control.evaluate(() => window.thirdEye.store.merge('globals', { fadeTime: 1.5 }));
  await phone.mouse.click(t4.x + t4.width / 2, t4.y + t4.height / 2);
  check('trigger 4 steps to the next preset', await settle(() => state(() => window.thirdEye.store.state.presetIndex === 0), 'preset 0'), JSON.stringify(await state(() => ({ index: window.thirdEye.store.state.presetIndex, counts: window.thirdEye.engine.sensors.counts, trig4: window.thirdEye.engine.mod.get('trig.4'), chain: window.thirdEye.store.state.chain.map((c) => c.type) }))));
  await phone.mouse.click(t4.x + t4.width / 2, t4.y + t4.height / 2);
  check('crossfade runs two chains at once', await settle(() => state(() => !!window.thirdEye.engine.pipeline.prev && window.thirdEye.store.state.presetIndex === 1), 'crossfade'));
  check('crossfade finishes and frees the old chain', await settle(() => state(() => window.thirdEye.engine.pipeline.prev === null), 'fade done', 8000));
  check('preset brought its mappings', await state(() => window.thirdEye.store.state.mappings.length === 3 && window.thirdEye.store.state.chain[0].type === 'feedback'));
  check('control highlights the active preset', (await control.locator('.preset-list button.on').textContent()).includes('Tunnel'));

  const t2 = await trig(2);
  await phone.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2);
  await phone.mouse.down();
  check('held trigger freezes while down', await settle(() => state(() => window.thirdEye.store.state.globals.freeze === true), 'freeze on'));
  await phone.mouse.up();
  check('and releases on up', await settle(() => state(() => window.thirdEye.store.state.globals.freeze === false), 'freeze off'));

  await control.keyboard.press(']');
  check('] key loads the next preset', await settle(() => state(() => window.thirdEye.store.state.presetIndex === 2), 'key preset'));
  await control.fill('#presets-panel input[type=text]', 'My look');
  await control.click('text=Save new');
  check('saving adds a preset', await settle(async () => (await control.locator('.preset-list button').count()) === presetCount + 1, 'saved'));
  check('saved preset is in localStorage', await control.evaluate(() => JSON.parse(localStorage.getItem('thirdeye.presets.v1')).at(-1).name === 'My look'));

  const [download] = await Promise.all([control.waitForEvent('download'), control.click('#presets-panel >> text=Export')]);
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  check('export produces a preset file', exported.format === 'third-eye-cam-presets' && exported.presets.length === presetCount + 1);
  exported.presets = [{ name: 'Imported', scene: { chain: [{ type: 'thermal', params: { contrast: 99 } }, { type: 'nope' }], mappings: [{ source: 'pad.x', fx: 'missing', key: 'zoom' }] } }];
  await control.setInputFiles('#presets-panel input[type=file]', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  check('import adds presets', await settle(async () => (await control.locator('.preset-list button').count()) === presetCount + 2, 'imported'));
  await control.locator('.preset-list button').last().click();
  check('imported preset is sanitised (unknown effect dropped, value clamped)', await settle(() => state(() => {
    const s = window.thirdEye.store.state;
    return s.chain.length === 1 && s.chain[0].type === 'thermal' && s.chain[0].params.contrast === 4 && s.mappings.length === 0;
  }), 'import applied', 8000));

  console.log('persistence');
  await output.reload();
  await waitFor(() => output.evaluate(() => window.thirdEye?.engine?.renderFps > 0), { label: 'output back' });
  check('output reload keeps the scene and reattaches sensors', await settle(async () => (await state(() => window.thirdEye.store.state.chain[0]?.type === 'thermal')) && (await control.evaluate(() => window.thirdEye.ui.status?.sensors?.live)), 'sensors back', 30000));

  if (process.env.SHOTS) {
    await control.screenshot({ path: `${process.env.SHOTS}/control3.png`, fullPage: true });
    await phone.screenshot({ path: `${process.env.SHOTS}/phone3.png` });
    await output.screenshot({ path: `${process.env.SHOTS}/output3.png` });
  }
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
