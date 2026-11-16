// Input B and the Mix B effect: the strip under the picture (small views,
// source icons that slide out, looking at a source without choosing it,
// the bar that adds Mix B on its first drag, the grid of modes), A and B
// trading places, B off passing A through, Shift + digit, and B carrying on
// when the picture moves to /control.
//   node tests/mix.mjs

import { benignError, check, clickBar, failureCount, launch, openSession, startPeerServer, startSite, stopPeerServer, waitFor } from './lib.mjs';

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
  const line = (slot) => control.locator(`#input-${slot}`).getAttribute('data-caption');
  const mix = () => mac(() => window.thirdEye.store.state.chain.find((it) => it.type === 'mixb')?.mix);
  const picture = () => colour(output);
  const icon = (slot, kind) => control.locator(`#inview-${slot} .inview-icon[data-kind="${kind}"]`);
  const choose = (slot, kind) => icon(slot, kind).dispatchEvent('click');
  const tipText = () => control.locator('.strip-tip').textContent();
  const stripTop = async () => (await control.locator('.mixrow').boundingBox()).y;

  console.log('before anything is mixed');
  await control.keyboard.press('3');
  check('input B starts off', (await input()).kindB === '' && (await line('b')) === 'B · off');
  check('the strip is one slim row under the picture', (await control.locator('.panic .inputs').count()) === 0 && (await control.locator('.mixrow').boundingBox()).height <= 72, `${(await control.locator('.mixrow').boundingBox()).height} px`);
  check('the bar invites a drag and the mode waits for it', (await control.locator('#mixbar').textContent()) === 'Drag to mix B in' && (await control.locator('#mix-mode').isDisabled()));
  check("A's small view shows a picture", await settle(async () => (await lit(control, 'a')) > 0.5, 'view A'), String(await lit(control, 'a')));
  check('and the whole of it, not a crop', await control.evaluate(() => getComputedStyle(document.querySelector('#inview-a .inview-pic')).objectFit === 'contain'));
  check("B's small view is dark", (await lit(control, 'b')) < 0.02);

  console.log('choosing B');
  check('the source icons are away until the pointer is on a view', await icon('b', 'camera').isHidden());
  await control.locator('#input-b').hover();
  check('pointing at the view brings its four icons out', (await icon('b', 'camera').isVisible()) && (await control.locator('#inview-b .inview-icon').count()) === 4);
  check('the view says what it is showing, above the strip', (await tipText()) === 'B · off' && (await control.locator('.strip-tip').boundingBox()).y + (await control.locator('.strip-tip').boundingBox()).height <= (await stripTop()) + 1);
  await icon('b', 'pattern').hover();
  check("the source A is using says so", (await tipText()).includes('in use by A'), await tipText());
  check('its icons can be MIDI-mapped', (await icon('b', 'camera').getAttribute('data-midi')) === 'inputB:camera' && (await icon('a', 'phone').getAttribute('data-midi')) === 'input:phone');
  await icon('b', 'pattern').click();
  check('and choosing it for B while B is off changes nothing', (await input()).kindB === '' && (await input()).kind === 'pattern');
  await icon('b', 'camera').hover();
  check('a source that is not running says why it has no preview', (await tipText()).includes('starts when chosen') && (await control.locator('#inview-b .inview-note').textContent()) === 'Local camera', await tipText());
  await icon('b', 'camera').click();
  check('a click makes the Mac camera B', (await input()).kindB === 'camera' && (await icon('b', 'camera').getAttribute('aria-pressed')) === 'true');
  check('the engine reports on B', await settle(async () => (await status()).inputB?.state === 'live', 'B live', 20000), JSON.stringify((await status()).inputB));
  check('the view says so', await settle(async () => (await line('b')) === 'B · Local camera · live', 'B line'), await line('b'));
  check("B's small view shows its picture", await settle(async () => (await lit(control, 'b')) > 0.5, 'view B'), String(await lit(control, 'b')));
  check('with no Mix B in the preset the picture is still A alone', !green(await picture()), (await picture()).map((v) => v.toFixed(0)).join(','));

  console.log('looking without choosing');
  await icon('b', 'camera').click();
  await settle(async () => (await input()).kindB === '' && (await lit(control, 'b')) < 0.02, 'B off again');
  check("clicking B's lit icon turns B off", (await input()).kindB === '');
  await control.mouse.move(5, 5);
  await control.locator('#input-b').hover();
  await icon('b', 'camera').hover();
  check('pointing at a running source shows it in the small view', await settle(async () => (await lit(control, 'b')) > 0.5, 'peek'), String(await lit(control, 'b')));
  check('without choosing it', (await input()).kindB === '' && (await control.locator('#inview-b .inview-tag').textContent()) === 'B?' && (await tipText()).includes('ready'), await tipText());
  await control.mouse.move(5, 5);
  check('and the view goes back when the pointer leaves', await settle(async () => (await lit(control, 'b')) < 0.02 && (await control.locator('#inview-b .inview-tag').textContent()) === 'B', 'peek over'));
  await choose('b', 'camera');
  await settle(async () => (await status()).inputB?.state === 'live', 'B live again', 20000);

  console.log('the bar and the mode');
  const chainWas = await mac(() => window.thirdEye.store.state.chain.length);
  await clickBar(control, '#mixbar', 0.999);
  check('the first drag adds Mix B in front of the chain, as a fade', await mac((n) => {
    const { chain } = window.thirdEye.store.state;
    return chain.length === n + 1 && chain[0].type === 'mixb' && chain[0].params.mode === 0 && chain[0].mix === 1;
  }, chainWas));
  await mac(() => {
    // Mix B alone, so the picture is B and nothing else.
    const { store } = window.thirdEye;
    store.setScene({ ...JSON.parse(JSON.stringify({ chain: [store.state.chain[0]], mappings: [], lfos: store.state.lfos, macros: [] })) });
  });
  check('at full mix the picture is B', await settle(async () => green(await picture()), 'green'), (await picture()).map((v) => v.toFixed(0)).join(','));
  check('the mode button names the mode', (await control.locator('#mix-mode .mixmode-text').textContent()) === 'Fade' && (await control.locator('#mix-mode').isEnabled()));
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

  await control.locator('#mix-mode').click();
  const gridBox = await control.locator('#mix-modes').boundingBox();
  check('the mode button opens a grid of nine, upward', (await control.locator('#mix-modes button').count()) === 9 && gridBox.y + gridBox.height <= (await stripTop()) + 1, `grid ends at ${gridBox.y + gridBox.height}, strip starts at ${await stripTop()}`);
  await control.locator('#mix-modes button[data-value="2"]').click();
  check('a click sets the mode, and the grid stays open for the next', await settle(async () => (await control.locator('#mix-mode .mixmode-text').textContent()) === 'Screen', 'screen') && (await control.locator('#mix-modes').isVisible()) && (await control.locator('#mix-modes button[data-value="2"]').getAttribute('aria-pressed')) === 'true');
  check('each mode can be MIDI-mapped', (await control.locator('#mix-modes button[data-value="4"]').getAttribute('data-midi')) === 'mixMode:4');
  await control.keyboard.press('Escape');
  check('Esc closes it', await control.locator('#mix-modes').isHidden());
  await mac(() => window.thirdEye.ui.setView('edit'));
  check('the edit screen has the same grid', (await control.locator('#tab-params .mode-grid button').count()) === 9 && (await control.locator('#tab-params .mode-grid button[aria-checked="true"]').textContent()) === 'Screen');
  await control.locator('#tab-params .mode-grid button[data-value="0"]').click();
  await mac(() => window.thirdEye.ui.setView('perform'));
  check('and a click there reaches the perform screen', (await control.locator('#mix-mode .mixmode-text').textContent()) === 'Fade');

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
  await setMode(0);

  console.log('B off, and trading places');
  await choose('b', 'camera');
  check('with B off the effect passes A through', await settle(async () => (await input()).kindB === '' && !green(await picture()), 'A alone'), (await picture()).map((v) => v.toFixed(0)).join(','));
  check('and the bar says B is off', (await control.locator('#mixbar').textContent()) === 'B is off');
  await control.keyboard.press('Shift+Digit2');
  check('Shift + 2 makes the Mac camera B again', (await input()).kindB === 'camera' && (await settle(async () => green(await picture()), 'green again')));
  await control.keyboard.press('2');
  check("asking A for B's source makes them trade places", (await input()).kind === 'camera' && (await input()).kindB === 'pattern');
  await choose('b', 'camera');
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
