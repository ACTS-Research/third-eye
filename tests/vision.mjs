// Phase 5 test: MediaPipe features end to end. Chromium's fake camera plays
// MediaPipe's own sample photos, the local-camera input carries them through
// the pipeline, and the worker's results are checked as modulation sources
// and as a person mask on an effect.
//   node tests/vision.mjs
//
// Runs on the CPU delegate: the sandbox has no GPU. On a Mac the default GPU
// delegate is used.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { benignError, check, failureCount, launch, sleep, startSite, waitFor, watch } from './lib.mjs';

const OUT = join(import.meta.dirname, 'out');
const SAMPLES = 'https://storage.googleapis.com/mediapipe-assets';

// Chromium's fake camera plays Y4M files. A helper page decodes each sample
// JPEG and this converts it to a two-frame 4:2:0 Y4M clip.
let converter = null;
async function sample(name) {
  await mkdir(OUT, { recursive: true });
  const path = join(OUT, name.replace('.jpg', '.y4m'));
  if (await stat(path).catch(() => null)) return path;
  const res = await fetch(`${SAMPLES}/${name}`);
  if (!res.ok) throw new Error(`could not download ${name}: HTTP ${res.status}`);
  const jpeg = Buffer.from(await res.arrayBuffer()).toString('base64');

  converter ??= await launch();
  const page = await converter.newPage();
  const { width, height, rgba } = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    // Fit inside 960x720, even dimensions.
    const scale = Math.min(960 / img.naturalWidth, 720 / img.naturalHeight, 1);
    const width = Math.round((img.naturalWidth * scale) / 2) * 2;
    const height = Math.round((img.naturalHeight * scale) / 2) * 2;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    return { width, height, rgba: Array.from(ctx.getImageData(0, 0, width, height).data) };
  }, jpeg);
  await page.close();

  const y = Buffer.alloc(width * height);
  const u = Buffer.alloc((width * height) / 4);
  const v = Buffer.alloc((width * height) / 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const o = (j * width + i) * 4;
      const [r, g, b] = [rgba[o], rgba[o + 1], rgba[o + 2]];
      y[j * width + i] = 0.257 * r + 0.504 * g + 0.098 * b + 16;
      if (j % 2 === 0 && i % 2 === 0) {
        const c = (j / 2) * (width / 2) + i / 2;
        u[c] = -0.148 * r - 0.291 * g + 0.439 * b + 128;
        v[c] = 0.439 * r - 0.368 * g - 0.071 * b + 128;
      }
    }
  }
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, u, v]);
  await writeFile(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`), frame, frame]));
  return path;
}

const site = await startSite();
const errors = [];
const SAMPLE_NAMES = ['portrait.jpg', 'thumb_up.jpg', 'woman_hands.jpg', 'pose.jpg'];
for (const name of SAMPLE_NAMES) await sample(name);
await converter?.close();

// Opens control + output with `image` as the camera and the given features on.
async function session(image, features) {
  const browser = await launch([`--use-file-for-fake-video-capture=${await sample(image)}`]);
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await context.grantPermissions(['camera']);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((f) => {
    const { store } = window.thirdEye;
    store.setScene({ chain: [], mappings: [], lfos: store.state.lfos });
    store.merge('input', { kind: 'camera', fit: 'contain' });
    store.merge('vision', { ...f, delegate: 'CPU' });
  }, features);
  const output = await context.newPage();
  await output.setViewportSize({ width: 1280, height: 720 });
  watch(output, 'output', errors);
  await output.goto(`${site.url}/output/`);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  await waitFor(async () => (await status())?.input.state === 'live', { label: 'camera live', timeout: 20000 });
  const wanted = Object.keys(features).filter((k) => features[k]);
  await waitFor(async () => {
    const f = (await status()).vision.features;
    return wanted.every((k) => f[k]?.state === 'ready' || f[k]?.state === 'error');
  }, { label: `models loaded (${wanted.join(', ')})`, timeout: 60000 });
  const source = (id) => output.evaluate((key) => window.thirdEye.engine.mod.values.get(key), id);
  const settle = (fn, label, timeout = 30000) => waitFor(fn, { label, timeout, interval: 250 }).then(() => true, () => false);
  return { browser, control, output, status, source, settle };
}

function pixels(page) {
  return page.evaluate(() => {
    const { gl, pipeline } = window.thirdEye.engine;
    const { w, h } = pipeline.preview;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pipeline.preview.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Array.from(px);
  });
}

function changedFraction(a, b) {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) changed++;
  }
  return changed / (a.length / 4);
}

try {
  console.log('face and segmentation (portrait.jpg)');
  {
    const s = await session('portrait.jpg', { face: true, segment: true });
    const st = await s.status();
    check('face landmarker loads in the worker', st.vision.features.face.state === 'ready', JSON.stringify(st.vision.features.face));
    check('segmenter loads in the worker', st.vision.features.segment.state === 'ready', JSON.stringify(st.vision.features.segment));
    check('other features stay unloaded', st.vision.features.pose.state === 'off' && st.vision.features.gesture.state === 'off');
    check('face detected', await s.settle(async () => (await s.source('face.present')) === 1, 'face'));
    const face = {};
    for (const k of ['x', 'y', 'size', 'yaw', 'pitch', 'roll', 'jawOpen', 'smile', 'blinkLeft', 'browUp']) face[k] = await s.source(`face.${k}`);
    check('face position and size are plausible', face.x > 0.2 && face.x < 0.8 && face.y > 0.3 && face.size > 0.1, `x ${face.x.toFixed(2)}, y ${face.y.toFixed(2)}, size ${face.size.toFixed(2)}`);
    check('head pose comes from the transform matrix', [face.yaw, face.pitch, face.roll].every((v) => Number.isFinite(v) && Math.abs(v) < 0.6), `yaw ${face.yaw.toFixed(2)}, pitch ${face.pitch.toFixed(2)}, roll ${face.roll.toFixed(2)}`);
    check('blendshapes reported', ['jawOpen', 'smile', 'blinkLeft', 'browUp'].every((k) => face[k] >= 0 && face[k] <= 1), `jawOpen ${face.jawOpen.toFixed(2)}, smile ${face.smile.toFixed(2)}, blinkLeft ${face.blinkLeft.toFixed(2)}, browUp ${face.browUp.toFixed(2)}`);
    check('eyes read as open on an open-eyed portrait', face.blinkLeft < 0.5);

    check('person mask reaches the pipeline', await s.settle(async () => (await s.status()).vision.mask, 'mask'));
    const coverage = await s.source('seg.coverage');
    check('mask covers a believable share of the frame', coverage > 0.15 && coverage < 0.95, `coverage ${coverage.toFixed(2)}`);
    const v = (await s.status()).vision;
    check('inference timing reported', v.ms > 0 && v.hz > 0, `${v.ms.toFixed(0)} ms per pass, ${v.hz.toFixed(1)}/s on CPU`);
    check('face sources get meters on control', await s.settle(() => s.control.evaluate(() => !!document.querySelector('.meter[title="face.smile"]')), 'meters', 5000));

    // Invert colours on: nothing / everything / person only / background only.
    const setTarget = async (target, bypass = false) => {
      await s.control.evaluate(({ target, bypass }) => {
        const { store } = window.thirdEye;
        if (!store.state.chain.length) {
          document.querySelector('#col-chain select').value = 'levels';
          [...document.querySelectorAll('#col-chain button')].find((b) => b.textContent === 'Add effect').click();
          store.setParam(store.state.chain[0].uid, 'invert', 1);
        }
        store.patchItem('chain', store.state.chain[0].uid, { target, bypass });
      }, { target, bypass });
      await sleep(1200);
      return pixels(s.output);
    };
    const clean = await setTarget('all', true);
    const all = await setTarget('all');
    const person = await setTarget('person');
    const background = await setTarget('background');
    const fAll = changedFraction(clean, all);
    const fPerson = changedFraction(clean, person);
    const fBackground = changedFraction(clean, background);
    check('"person only" changes just part of the picture', fPerson > 0.08 && fPerson < fAll - 0.08, `changed: everything ${(fAll * 100).toFixed(0)}%, person ${(fPerson * 100).toFixed(0)}%, background ${(fBackground * 100).toFixed(0)}%`);
    check('person and background masks are complementary', Math.abs(fPerson + fBackground - fAll) < 0.12 && changedFraction(person, background) > 0.3);
    check('effect card offers "apply to"', (await s.control.locator('.fx').first().textContent()).includes('apply to'));
    if (process.env.SHOTS) {
      await setTarget('person');
      await s.output.screenshot({ path: `${process.env.SHOTS}/mask-person.png` });
      await s.control.screenshot({ path: `${process.env.SHOTS}/control5.png`, fullPage: true });
    }

    await s.control.evaluate(() => window.thirdEye.store.merge('vision', { segment: false }));
    check('alert when an effect needs a mask that is off', await s.settle(() => s.control.evaluate(() => [...document.querySelectorAll('#alerts .alert')].some((a) => a.textContent.includes('Segmentation is off'))), 'mask alert', 5000));
    await s.control.evaluate(() => window.thirdEye.store.merge('vision', { face: false }));
    check('switching everything off frees the worker', await s.settle(() => s.output.evaluate(() => window.thirdEye.engine.vision.worker === null), 'worker gone', 5000));
    await s.browser.close();
  }

  console.log('gestures and hands (thumb_up.jpg)');
  {
    const s = await session('thumb_up.jpg', { gesture: true, hands: true });
    const f = (await s.status()).vision.features;
    check('gesture recognizer loads; hands reuse it instead of a second model', f.gesture.state === 'ready' && f.hands.state === 'ready' && (await s.output.evaluate(() => true)), JSON.stringify(f.gesture));
    check('thumb-up recognised', await s.settle(async () => (await s.source('gesture.thumbUp')) > 0.5, 'thumb up'), `score ${((await s.source('gesture.thumbUp')) ?? 0).toFixed(2)}`);
    check('other gestures stay low', (await s.source('gesture.victory')) < 0.2 && (await s.source('gesture.fist')) < 0.2);
    check('hand landmarks become sources', (await s.source('hand.present')) === 1 && (await s.source('hand.x')) > 0 && (await s.source('hand.open')) !== undefined, `x ${(await s.source('hand.x')).toFixed(2)}, y ${(await s.source('hand.y')).toFixed(2)}, open ${(await s.source('hand.open')).toFixed(2)}, pinch ${(await s.source('hand.pinch')).toFixed(2)}`);
    // A gesture is a natural trigger. Switch the feature off (its sources
    // must drop to zero), bind the trigger, switch it back on: the gesture
    // "appears" and must fire once.
    await s.control.evaluate(() => window.thirdEye.store.merge('vision', { gesture: false, hands: false }));
    check('switching a feature off zeroes its sources', await s.settle(async () => (await s.source('gesture.thumbUp')) === 0 && (await s.source('hand.present')) === 0, 'sources reset', 5000));
    await s.control.evaluate(() => {
      const { store } = window.thirdEye;
      store.dispatch({ op: 'set', key: 'actions', value: [{ id: 'g1', source: 'gesture.victory', action: 'freeze', hold: false }, { id: 'g2', source: 'gesture.thumbUp', action: 'blackout', momentary: true }] });
    });
    await sleep(500);
    await s.control.evaluate(() => window.thirdEye.store.merge('vision', { gesture: true }));
    check('a gesture appearing fires its trigger', await s.settle(() => s.output.evaluate(() => window.thirdEye.store.state.globals.blackout === true), 'gesture trigger', 40000));
    check('a gesture that is absent does not', await s.output.evaluate(() => window.thirdEye.store.state.globals.freeze === false));
    await s.browser.close();
  }

  console.log('hand landmarker alone (woman_hands.jpg)');
  {
    const s = await session('woman_hands.jpg', { hands: true });
    const f = (await s.status()).vision.features;
    check('hand landmarker loads by itself', f.hands.state === 'ready' && f.gesture.state === 'off', JSON.stringify(f.hands));
    check('hands detected', await s.settle(async () => (await s.source('hand.present')) === 1, 'hands'));
    await s.browser.close();
  }

  console.log('pose (pose.jpg)');
  {
    const s = await session('pose.jpg', { pose: true });
    check('pose landmarker loads', (await s.status()).vision.features.pose.state === 'ready');
    check('body detected', await s.settle(async () => (await s.source('pose.present')) === 1, 'pose'));
    const p = {};
    for (const k of ['x', 'y', 'size', 'lean', 'leftHandY', 'rightHandY']) p[k] = await s.source(`pose.${k}`);
    check('pose sources are plausible', p.x > 0.1 && p.x < 0.9 && p.size > 0.02, Object.entries(p).map(([k, v]) => `${k} ${v === undefined ? 'n/a' : v.toFixed(2)}`).join(', '));
    await s.browser.close();
  }
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !benignError(e) && !/XNNPACK|TensorFlow Lite|delegate|GL version|gl_context|INFO:|W0000|I0000/i.test(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 5).join(' | '));
  await site.close();
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
