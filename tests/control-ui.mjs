// The control page itself: the three screens, palettes, perform faders,
// per-preset editing (name, fade, autosave, revert), reordering, and the
// pop-out output window.
//   node tests/control-ui.mjs

import { benignError, check, failureCount, launch, sleep, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  const settle = (fn, label, timeout = 8000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  const view = (name) => control.evaluate((v) => window.thirdEye.ui.setView(v), name);
  const stored = () => control.evaluate(() => JSON.parse(localStorage.getItem('thirdeye.presets.v1') ?? 'null'));
  const names = () => control.locator('.tile:not(.new) .name').allTextContents();

  console.log('screens and the pop-out output');
  check('opens on the perform screen', await control.locator('#view-perform').isVisible() && (await control.locator('#view-setup').isHidden()));
  check('says the output window is closed and offers to open it', (await control.locator('.monitor-note').textContent()).includes('Output window is closed'));
  const [output] = await Promise.all([context.waitForEvent('page'), control.click('.monitor-note button')]);
  watch(output, 'output', errors);
  await output.waitForLoadState();
  check('the output opens as a separate window', output.url().endsWith('/output/'));
  check('the note clears once the output is running', await settle(() => control.locator('.monitor-note').isHidden(), 'note hidden', 15000));
  const state = (fn) => output.evaluate(fn);
  check('monitor shows the output', await settle(() => control.evaluate(() => {
    const c = document.getElementById('preview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return d.some((v, i) => i % 4 !== 3 && v > 30);
  }), 'monitor'));
  await control.click('#views button[data-view=setup]');
  check('setup screen holds pairing and devices', await control.locator('#phone-panel').isVisible() && (await control.locator('#view-perform').isHidden()));
  await control.keyboard.press('e');
  check('E opens the edit screen', await control.locator('#col-chain').isVisible());
  await control.keyboard.press('e');
  check('and returns to perform', await control.locator('#view-perform').isVisible());

  console.log('pairing details from the top bar');
  // The sandbox cannot reach the public pairing server: the same situation
  // as a network that blocks it.
  check('an unreachable pairing server is reported as such', await settle(async () => (await control.locator('#pills .pill').nth(2).textContent()).includes('unreachable'), 'unreachable', 25000), await control.locator('#pills .pill').nth(2).textContent());
  await control.locator('#pills .pill').nth(2).click();
  check('clicking the phone status opens the QR code and room code below it', await control.locator('#pairing-pop').isVisible() && (await control.locator('.pop-code').textContent()).length === 5 && (await control.evaluate(() => {
    const c = document.querySelector('#pairing-pop canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++;
    return dark > 1000;
  })));
  check('it says what is wrong and what to try', (await control.locator('#pairing-pop').textContent()).includes('Personal Hotspot'));
  if (process.env.SHOTS) await control.screenshot({ path: `${process.env.SHOTS}/pairing-pop.png` });
  await control.keyboard.press('Escape');
  check('Esc closes it', await control.locator('#pairing-pop').isHidden());
  await control.locator('#pills .pill').nth(1).click();
  check('the input status opens it too', await control.locator('#pairing-pop').isVisible());
  await control.click('#pairing-pop >> text=Close');

  console.log('palettes');
  const ink = () => control.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
  const red = await ink();
  await control.click('#palette > button');
  await control.click('#palette-menu button[aria-label="Palette: Amber"]');
  check('picking a palette re-inks the page', (await ink()) === '#ffb347' && red === '#ff6b5e', `${red} -> ${await ink()}`);
  check('the pairing link carries the palette', (await control.locator('#phone-link').getAttribute('href')).includes('pal=amber'));
  const phone = await context.newPage();
  await phone.goto(await control.locator('#phone-link').getAttribute('href'));
  check('the phone page opens in the same palette', (await phone.evaluate(() => document.documentElement.dataset.palette)) === 'amber');
  // The phone's own stylesheet builds on the theme; a loop between them once
  // blanked every ink colour on the phone (black text, no START button).
  const phoneInk = () => phone.evaluate(() => ({ text: getComputedStyle(document.body).color, start: getComputedStyle(document.getElementById('start')).backgroundColor }));
  check('the phone page is actually inked', (await phoneInk()).text === 'rgb(255, 179, 71)' && (await phoneInk()).start === 'rgb(255, 179, 71)', JSON.stringify(await phoneInk()));
  await phone.goto(`${site.url}/phone/?room=ABCDE`);
  check('and in the default palette at full brightness', (await phoneInk()).text === 'rgb(255, 107, 94)' && (await phoneInk()).start === 'rgb(255, 107, 94)', JSON.stringify(await phoneInk()));
  await phone.close();
  await control.reload();
  check('the palette is remembered', await settle(async () => (await ink()) === '#ffb347', 'palette restored'));
  await control.click('#palette > button');
  await control.click('#palette-menu button[aria-label="Palette: Darkroom red"]');

  console.log('dimmer');
  const dot = () => control.evaluate(() => getComputedStyle(document.querySelector('#palette > button')).backgroundColor);
  const full = await dot();
  await control.click('#palette > button');
  const strip = control.locator('#dimmer');
  check('the dimmer sits under the palettes and reads 100 %', (await strip.isVisible()) && (await strip.getAttribute('aria-valuenow')) === '100' && (await strip.textContent()).includes('100%'));
  const stripBox = await strip.boundingBox();
  await control.mouse.move(stripBox.x + stripBox.width * 0.6, stripBox.y + stripBox.height / 2);
  await control.mouse.down();
  await control.mouse.move(stripBox.x - 40, stripBox.y + stripBox.height / 2, { steps: 4 });
  await control.mouse.up();
  check('dragging past the left end stops at 25 %', (await strip.getAttribute('aria-valuenow')) === '25', await strip.getAttribute('aria-valuenow'));
  check('the menu stays open while dimming', await control.locator('#palette-menu').isVisible());
  check('the page dims', (await dot()) !== full, `${full} -> ${await dot()}`);
  check('the pairing link carries the dimmer', (await control.locator('#phone-link').getAttribute('href')).includes('dim=25'));
  const dimPhone = await context.newPage();
  await dimPhone.goto(await control.locator('#phone-link').getAttribute('href'));
  check('the phone page opens dimmed', (await dimPhone.evaluate(() => document.documentElement.dataset.dim)) === '25' && (await dimPhone.evaluate(() => /^#[0-9a-f]{6}$/.test(document.documentElement.style.getPropertyValue('--ink')))));
  await dimPhone.close();
  await control.reload();
  check('the dimmer is remembered', await settle(async () => (await control.locator('#dimmer').getAttribute('aria-valuenow')) === '25', 'dim restored'));
  await control.click('#palette > button');
  await control.locator('#dimmer').focus();
  await control.keyboard.press('ArrowRight');
  check('arrow keys step it by 5', (await control.locator('#dimmer').getAttribute('aria-valuenow')) === '30');
  await control.locator('#dimmer').dblclick();
  check('double-click returns to full', (await control.locator('#dimmer').getAttribute('aria-valuenow')) === '100' && (await dot()) === full);
  check('at full the link carries no dimmer', !(await control.locator('#phone-link').getAttribute('href')).includes('dim='));
  await control.keyboard.press('Escape');

  console.log('presets: load, fade, edit');
  check('factory presets on the strip', (await names()).length === 9, (await names()).join(', '));
  await control.locator('.tile .edit').nth(1).click();
  check('Edit opens that preset and makes it live', (await control.evaluate(() => window.thirdEye.ui.view)) === 'edit' && (await settle(() => state(() => window.thirdEye.store.state.presetIndex === 1), 'preset live')));
  check('name and fade are shown', (await control.inputValue('.edit-head input[type=text]')) === 'Tunnel' && (await control.inputValue('#preset-fade')) === '2');
  await control.fill('.edit-head input[type=text]', 'Vortex');
  await control.fill('#preset-fade', '0.6');
  check('rename and fade are stored on the preset', await settle(async () => {
    const p = (await stored())?.[1];
    return p?.name === 'Vortex' && p.fade === 0.6;
  }, 'stored'));

  // Change a parameter: it must be saved into the preset without asking.
  const slider = control.locator('.fx').first().locator('.tp-sldv_t').nth(1); // zoom
  const box = await slider.boundingBox();
  await control.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  check('edits on this screen save into the preset', await settle(async () => (await stored())[1].scene.chain[0].params.zoom > 1.15, 'autosaved'), `zoom ${(await stored())[1].scene.chain[0].params.zoom}`);
  await control.click('text=Revert');
  check('Revert restores the preset as it was when opened', await settle(async () => {
    const p = (await stored())[1];
    return p.name === 'Tunnel' && p.scene.chain[0].params.zoom === 1.04 && (await state(() => window.thirdEye.store.state.chain[0].params.zoom === 1.04));
  }, 'reverted'));
  await control.fill('.edit-head input[type=text]', 'Vortex');
  await control.fill('#preset-fade', '0.6');
  await control.click('text=← Perform');
  check('the strip shows the new name', (await names())[1] === 'Vortex');

  await control.locator('.tile .load').nth(0).click();
  await settle(() => state(() => window.thirdEye.store.state.presetIndex === 0 && !window.thirdEye.engine.pipeline.fade), 'on preset 1', 6000);
  await control.locator('.tile .load').nth(1).click();
  const fadeMs = await waitFor(() => state(() => window.thirdEye.engine.pipeline.fade?.duration), { label: 'fade started' }).catch(() => null);
  check('a preset crossfades in over its own fade time', fadeMs === 600, `${fadeMs} ms`);
  await settle(() => state(() => !window.thirdEye.engine.pipeline.fade), 'fade done');

  console.log('perform faders');
  const faderCount = await control.locator('.fader').count();
  check('faders show the first parameters of the chain', faderCount === 7 && (await control.locator('.fader .name').first().textContent()) === 'zoom', `${faderCount} faders`);
  // A modulated fader shows a hatched band from its setting to the live value.
  const band = await waitFor(() => control.evaluate(() => {
    for (const f of document.querySelectorAll('.fader')) {
      const live = f.querySelector('.live');
      if (live.hidden) continue;
      const fill = f.querySelector('.fill').getBoundingClientRect();
      const r = live.getBoundingClientRect();
      const dir = live.classList.contains('up') ? 'up' : live.classList.contains('down') ? 'down' : '';
      const edge = dir === 'up' ? r.bottom : r.top; // the band's end that should sit on the top of the fill
      return { name: f.querySelector('.name').textContent, dir, h: r.height, gap: Math.abs(edge - fill.top) };
    }
    return null;
  }), { label: 'modulation band', timeout: 15000 }).catch(() => null);
  check('a modulated fader shows a band from its setting to the live value', !!band && band.dir && band.h > 0 && band.gap < 2, JSON.stringify(band));
  const track = await control.locator('.fader .track').first().boundingBox();
  await control.mouse.move(track.x + track.width / 2, track.y + track.height * 0.5);
  await control.mouse.down();
  await control.mouse.move(track.x + track.width / 2, track.y + 2, { steps: 4 });
  await control.mouse.up();
  check('dragging a fader moves the parameter on the output', await settle(() => state(() => window.thirdEye.store.state.chain[0].params.zoom > 1.2), 'fader drag'), `zoom ${await state(() => window.thirdEye.store.state.chain[0].params.zoom)}`);
  check('perform tweaks are not saved into the preset', (await stored())[1].scene.chain[0].params.zoom === 1.04);
  await control.locator('.fader').first().dblclick();
  check('double-click resets a fader to the default', await settle(() => state(() => window.thirdEye.store.state.chain[0].params.zoom === 1.03), 'reset'));

  await view('edit');
  await control.selectOption('#faders-panel select >> nth=0', { label: '2 RGB Offset · amount' });
  await control.selectOption('#faders-panel select >> nth=1', { label: '1 Video Feedback · wet / dry' });
  check('pinned faders are saved with the preset', await settle(async () => (await stored())[1].scene.macros?.length === 2, 'macros stored'));
  await view('perform');
  check('the perform screen shows only the pinned faders', (await control.locator('.fader .name').allTextContents()).join(',') === 'amount,wet / dry', (await control.locator('.fader .name').allTextContents()).join(','));

  console.log('presets: reorder, duplicate, delete');
  await control.locator('.tile').nth(1).dragTo(control.locator('.tile').nth(4));
  check('dragging a tile reorders the presets', await settle(async () => (await names())[4] === 'Vortex' && (await names())[1] === 'Kaleido', 'reordered'), (await names()).join(', '));
  check('the order is stored', (await stored()).map((p) => p.name)[4] === 'Vortex');
  check('the live preset is still marked after the move', await settle(async () => (await control.locator('.tile.on .name').textContent()) === 'Vortex' && (await state(() => window.thirdEye.store.state.presetIndex)) === 4, 'current follows'));

  await control.locator('.tile .edit').nth(4).click();
  await control.click('text=Duplicate');
  check('Duplicate adds a copy after the preset', await settle(async () => (await names())[5] === 'Vortex copy' && (await stored())[5].fade === 0.6, 'duplicated'), (await names()).join(', '));
  control.once('dialog', (d) => d.accept());
  await control.click('text=Delete');
  check('Delete removes it and returns to perform', await settle(async () => (await names()).length === 9 && !(await names()).includes('Vortex copy') && (await control.evaluate(() => window.thirdEye.ui.view)) === 'perform', 'deleted'));

  await view('setup');
  const options = await control.locator('#actions-panel .binding select >> nth=1').locator('option').allTextContents();
  check('triggers can target presets, inputs and faders', options.includes('Preset 5: Vortex') && options.includes('Input: Local camera') && options.includes('Fader 1 (continuous)'));

  check('output never shows any interface', await output.evaluate(() => document.body.innerText.trim() === '' || document.getElementById('hint').classList.contains('hidden') || document.body.innerText.includes('fullscreen')));
  if (process.env.SHOTS) {
    await view('perform');
    await sleep(1500);
    await control.screenshot({ path: `${process.env.SHOTS}/ui-perform.png` });
  }

  console.log('new version strip');
  await output.evaluate(() => { window.beforeReload = true; });
  await control.evaluate(() => { window.beforeReload = true; });
  await control.evaluate(() => window.thirdEye.ui.setAlert('update', 'A newer version of the app has been downloaded. Reloading exits fullscreen.', 'warn', window.thirdEye.ui.alertTo.reload));
  await control.locator('#alerts .alert[data-key="update"] .go').click();
  const reloaded = (page) => waitFor(() => page.evaluate(() => !window.beforeReload && !!window.thirdEye).catch(() => false), { label: 'reloaded', timeout: 15000 }).then(() => true, () => false);
  check('"Reload both pages" reloads the output window and this page', (await reloaded(output)) && (await reloaded(control)));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
  await browser.close();
  await site.close();
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
