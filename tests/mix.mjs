// Input B and the Mix B effect: choosing B from its small view, A and B
// trading places, the effect mixing B in (and passing A through while B is
// off), the bar under the picture, the small live views, Shift + digit, and
// B carrying on when the picture moves to /control.
//   node tests/mix.mjs

import { addEffect, benignError, check, clickBar, failureCount, launch, openSession, pickMenu, startPeerServer, startSite, stopPeerServer, waitFor } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 10000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

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
// Chromium's stand-in camera is a green picture: green well above the rest.
const green = ([r, g, b]) => g > 60 && g > r * 1.6 && g > b * 1.6;
// How much of a small view is not black.
const lit = (page, slot) => page.evaluate((id) => {
  const c = document.querySelector(`#inview-${id} .inview-pic`);
  const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 40) n++;
  return n / (px.length / 4);
}, slot);

try {
  const { control, output } = await openSession(browser, site, peerServer, errors);
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const input = () => mac(() => ({ ...window.thirdEye.store.state.input }));
  const status = () => mac(() => window.thirdEye.ui.status);
  const line = (slot) => control.locator(`#input-${slot} .menu-text`).textContent();
  const mix = () => mac(() => window.thirdEye.store.state.chain.find((it) => it.type === 'mixb')?.mix);
  const picture = () => colour(output);

  console.log('before anything is mixed');
  await control.keyboard.press('3');
  check('input B starts off', (await input()).kindB === '' && (await line('b')) === 'B · off');
  check('the four input buttons have left the lower left', (await control.locator('.panic .inputs').count()) === 0 && (await control.locator('.mixrow').isVisible()));
  check('the bar says there is no Mix B, and does nothing', (await control.locator('#mixbar').textContent()).startsWith('No Mix B') && (await control.locator('#mixbar').getAttribute('aria-disabled')) === 'true');
  check("A's small view shows a picture", await settle(async () => (await lit(control, 'a')) > 0.5, 'view A'), String(await lit(control, 'a')));
  check("B's small view is dark", (await lit(control, 'b')) < 0.02);

  console.log('choosing B');
  await control.locator('#input-b').click();
  const listBox = await control.locator('.menu-list').boundingBox();
  const buttonBox = await control.locator('#input-b').boundingBox();
  check('the list opens downward, under the small view', listBox.y >= buttonBox.y + buttonBox.height - 1, `list at ${listBox.y}, button ends at ${buttonBox.y + buttonBox.height}`);
  check('its choices can be MIDI-mapped', (await control.locator('.menu-list .menu-item[data-value="camera"]').getAttribute('data-midi')) === 'inputB:camera' && (await control.locator('.menu-list .menu-item[data-value=""]').getAttribute('data-midi')) === 'inputB:off');
  check("the source A is using says so", (await control.locator('.menu-list .menu-item[data-value="pattern"]').textContent()).includes('in use by A'));
  await control.locator('.menu-list .menu-item[data-value="pattern"]').click();
  check('and choosing it for B while B is off changes nothing', (await input()).kindB === '' && (await input()).kind === 'pattern');
  await pickMenu(control, '#input-b', 'camera');
  check('B is the Mac camera', (await input()).kindB === 'camera');
  check('the engine reports on B', await settle(async () => (await status()).inputB?.state === 'live', 'B live', 20000), JSON.stringify((await status()).inputB));
  check('the line under B says so', await settle(async () => (await line('b')) === 'B · Local camera · live', 'B line'), await line('b'));
  check("B's small view shows its picture", await settle(async () => (await lit(control, 'b')) > 0.5, 'view B'), String(await lit(control, 'b')));
  check('with no Mix B in the preset the picture is still A alone', !green(await picture()), (await picture()).map((v) => v.toFixed(0)).join(','));

  console.log('the Mix B effect');
  await mac(() => window.thirdEye.ui.setView('edit'));
  await addEffect(control, 'mixb');
  await mac(() => window.thirdEye.ui.setView('perform'));
  check('added at full mix, Fade: the picture is B', await settle(async () => green(await picture()), 'green'), (await picture()).map((v) => v.toFixed(0)).join(','));
  check('the bar names the mode and is full', (await control.locator('#mixbar').textContent()) === 'Fade' && (await control.locator('#mixbar').getAttribute('aria-valuenow')) === '1');
  await clickBar(control, '#mixbar', 0.5);
  check('a click half way along the bar sets the mix to a half', await settle(async () => Math.abs((await mix()) - 0.5) < 0.03, 'half'), String(await mix()));
  const presetWas = await mac(() => window.thirdEye.store.state.presetIndex);
  await control.locator('#mixbar').focus();
  await control.keyboard.press('ArrowLeft');
  check('the arrows move the bar, not the presets', Math.abs((await mix()) - 0.45) < 0.03 && (await mac(() => window.thirdEye.store.state.presetIndex)) === presetWas, String(await mix()));
  await mac(() => document.activeElement.blur());
  await clickBar(control, '#mixbar', 0.001);
  check('at nothing the picture is A again', await settle(async () => (await mix()) === 0 && !green(await picture()), 'A again'));
  await clickBar(control, '#mixbar', 0.999);
  await settle(async () => green(await picture()), 'B again');

  const setMode = (v) => mac((mode) => {
    const { store } = window.thirdEye;
    store.setParam(store.state.chain.find((it) => it.type === 'mixb').uid, 'mode', mode);
  }, v);
  const seen = new Set();
  for (let mode = 0; mode <= 8; mode++) {
    await setMode(mode);
    await settle(() => output.evaluate((m) => [...window.thirdEye.engine.pipeline.cur.instances.values()].some((i) => i.def.id === 'mixb' && i.values.mode === m), mode), `mode ${mode}`);
    seen.add((await picture()).map((v) => Math.round(v / 4)).join(','));
  }
  check('the nine modes draw, and not all alike', seen.size >= 5 && !!(await output.evaluate(() => window.thirdEye.engine.pipeline.programs.get('mixb'))), `${seen.size} different pictures`);
  await setMode(2);
  check('the bar names the new mode', await settle(async () => (await control.locator('#mixbar').textContent()) === 'Screen', 'mode name'));
  await setMode(0);

  console.log('B off, and trading places');
  await pickMenu(control, '#input-b', '');
  check('with B off the effect passes A through', await settle(async () => (await input()).kindB === '' && !green(await picture()), 'A alone'), (await picture()).map((v) => v.toFixed(0)).join(','));
  check('and the bar says B is off', (await control.locator('#mixbar').textContent()) === 'Fade · B is off');
  await control.keyboard.press('Shift+Digit2');
  check('Shift + 2 makes the Mac camera B again', (await input()).kindB === 'camera' && (await settle(async () => green(await picture()), 'green again')));
  await control.keyboard.press('2');
  check("asking A for B's source makes them trade places", (await input()).kind === 'camera' && (await input()).kindB === 'pattern');
  await pickMenu(control, '#input-b', 'camera');
  check('and so does asking B for the source A has', (await input()).kind === 'pattern' && (await input()).kindB === 'camera');
  await control.keyboard.press('Shift+Digit1');
  check('the iPhone can be B', (await input()).kindB === 'phone' && (await settle(async () => (await status()).inputB?.kind === 'phone' && (await status()).inputB.state === 'live', 'phone as B', 20000)), JSON.stringify((await status()).inputB));
  await control.keyboard.press('Shift+Digit2');

  console.log('the picture moves to /control');
  await output.close();
  check('/control takes the picture over with B still on', await settle(async () => (await status())?.host.role === 'control' && (await status()).inputB?.state === 'live', 'B on control', 30000), JSON.stringify((await status())?.inputB));
  check('and the small views keep coming', await settle(async () => (await lit(control, 'b')) > 0.5 && (await lit(control, 'a')) > 0.5, 'views on control'));
  check('the mixed picture is drawn there', await settle(async () => green(await mac(() => {
    const e = window.thirdEye.engine;
    const { gl } = e;
    // The page's own canvas: read one frame's centre straight after a draw.
    e.frame(performance.now());
    const px = new Uint8Array(64 * 36 * 4);
    gl.readPixels((e.canvas.width - 64) / 2, (e.canvas.height - 36) / 2, 64, 36, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const sum = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += px[i + c];
    return sum.map((v) => v / (64 * 36));
  })), 'green on control'));

  check('no unexpected console errors', errors.filter((e) => !benignError(e)).length === 0, errors.filter((e) => !benignError(e)).join(' | '));
} catch (err) {
  check('the suite ran to the end', false, err.stack ?? String(err));
} finally {
  await browser.close();
  await site.close();
  await stopPeerServer(peerServer);
}
console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() ? 1 : 0);
