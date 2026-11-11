// MediaPipe Tasks in a worker, so inference never blocks the render loop.
// The main thread sends one small frame at a time and gets back plain
// numbers (future modulation sources) plus, optionally, a person mask.

import { FaceLandmarker, FilesetResolver, GestureRecognizer, HandLandmarker, ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';

// The library loads its WASM glue script once per task and consumes the
// factory it leaves on `self`. In an ES-module worker a second import() of
// the same URL is a cached no-op, so every task after the first would find no
// factory. This hook (the library calls self.import when it exists) keeps the
// factory from the first load and hands it out again, with no extra fetch.
let moduleFactory = null;
self.import = async (url) => {
  if (!moduleFactory) {
    await import(/* @vite-ignore */ url);
    moduleFactory = self.ModuleFactory;
  } else {
    self.ModuleFactory = moduleFactory;
  }
};

let root = '';
let filesetPromise = null;
let wantDelegate = 'GPU';
let want = { face: false, hands: false, gesture: false, pose: false, segment: false };
const tasks = {}; // name -> { instance, state, error, delegate }
let configuring = Promise.resolve();

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

const SPECS = {
  face: {
    model: 'face_landmarker.task',
    create: (fs, baseOptions) =>
      FaceLandmarker.createFromOptions(fs, {
        baseOptions,
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
  },
  hands: {
    model: 'hand_landmarker.task',
    create: (fs, baseOptions) => HandLandmarker.createFromOptions(fs, { baseOptions, runningMode: 'VIDEO', numHands: 2 }),
  },
  gesture: {
    model: 'gesture_recognizer.task',
    create: (fs, baseOptions) => GestureRecognizer.createFromOptions(fs, { baseOptions, runningMode: 'VIDEO', numHands: 2 }),
  },
  pose: {
    model: 'pose_landmarker_lite.task',
    create: (fs, baseOptions) => PoseLandmarker.createFromOptions(fs, { baseOptions, runningMode: 'VIDEO', numPoses: 1 }),
  },
  segment: {
    model: 'selfie_multiclass_256x256.tflite',
    create: (fs, baseOptions) =>
      ImageSegmenter.createFromOptions(fs, { baseOptions, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false }),
  },
};

function report() {
  const features = {};
  for (const name of Object.keys(SPECS)) {
    const t = tasks[name];
    features[name] = t ? { state: t.state, error: t.error ?? '', delegate: t.delegate ?? '' } : { state: 'off', error: '', delegate: '' };
  }
  // The gesture recognizer already tracks hands; no second model is loaded.
  if (want.hands && want.gesture && tasks.gesture) features.hands = { ...features.gesture };
  postMessage({ t: 'status', features });
}

async function load(name) {
  const spec = SPECS[name];
  const task = (tasks[name] = { instance: null, state: 'loading' });
  report();
  try {
    filesetPromise ??= FilesetResolver.forVisionTasks(`${root}mediapipe/wasm`, true);
    const fileset = await filesetPromise;
    const modelAssetPath = `${root}models/${spec.model}`;
    const head = await fetch(modelAssetPath, { method: 'HEAD' });
    if (!head.ok) throw new Error(`model file missing (${spec.model}) — run "npm run assets"`);
    try {
      task.instance = await spec.create(fileset, { modelAssetPath, delegate: wantDelegate });
      task.delegate = wantDelegate;
    } catch (err) {
      if (wantDelegate !== 'GPU') throw err;
      // No usable GPU path in this worker: fall back to WASM on the CPU.
      task.instance = await spec.create(fileset, { modelAssetPath, delegate: 'CPU' });
      task.delegate = 'CPU';
    }
    task.state = 'ready';
  } catch (err) {
    task.state = 'error';
    task.error = String(err?.message ?? err);
  }
  report();
}

function unload(name) {
  try {
    tasks[name]?.instance?.close();
  } catch {
    /* already closed */
  }
  delete tasks[name];
}

async function configure(msg) {
  root = msg.root;
  if (msg.delegate !== wantDelegate) {
    wantDelegate = msg.delegate;
    for (const name of Object.keys(tasks)) unload(name);
  }
  want = msg.features;
  const needed = { ...want, hands: want.hands && !want.gesture };
  for (const name of Object.keys(SPECS)) {
    if (!needed[name] && tasks[name]) unload(name);
  }
  for (const name of Object.keys(SPECS)) {
    if (needed[name] && !tasks[name]) await load(name);
  }
  report();
}

const ready = (name) => tasks[name]?.state === 'ready';

// ------------------------------------------------------------ extraction ---

const BLENDSHAPES = {
  jawOpen: ['jawOpen'],
  smile: ['mouthSmileLeft', 'mouthSmileRight'],
  pucker: ['mouthPucker'],
  browUp: ['browInnerUp', 'browOuterUpLeft', 'browOuterUpRight'],
  browDown: ['browDownLeft', 'browDownRight'],
  blinkLeft: ['eyeBlinkLeft'],
  blinkRight: ['eyeBlinkRight'],
  eyeWide: ['eyeWideLeft', 'eyeWideRight'],
  cheekPuff: ['cheekPuff'],
};

function faceValues(result, aspect) {
  const lm = result.faceLandmarks?.[0];
  if (!lm) return { 'face.present': 0 };
  const out = { 'face.present': 1 };
  const nose = lm[1];
  out['face.x'] = clamp(nose.x);
  out['face.y'] = clamp(1 - nose.y);
  out['face.size'] = clamp(Math.hypot((lm[454].x - lm[234].x) * aspect, lm[454].y - lm[234].y) / aspect * 2);

  const shapes = result.faceBlendshapes?.[0]?.categories;
  if (shapes) {
    const score = Object.fromEntries(shapes.map((c) => [c.categoryName, c.score]));
    for (const [key, names] of Object.entries(BLENDSHAPES)) {
      out[`face.${key}`] = clamp(names.reduce((sum, n) => sum + (score[n] ?? 0), 0) / names.length);
    }
  }

  const m = result.facialTransformationMatrixes?.[0]?.data;
  if (m) {
    // Column-major rotation, decomposed as yaw (Y) * pitch (X) * roll (Z).
    const half = Math.PI / 2;
    out['face.yaw'] = clamp(Math.atan2(m[8], m[10]) / half, -1, 1);
    out['face.pitch'] = clamp(Math.asin(clamp(-m[9], -1, 1)) / half, -1, 1);
    out['face.roll'] = clamp(Math.atan2(m[1], m[5]) / half, -1, 1);
  }
  return out;
}

function handValues(hands, aspect) {
  if (!hands?.length) return { 'hand.present': 0 };
  const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const palm = (h) => ({ x: (h[0].x + h[5].x + h[17].x) / 3, y: (h[0].y + h[5].y + h[17].y) / 3 });
  const h = hands[0];
  const centre = palm(h);
  const size = dist(h[0], h[9]) || 1e-3;
  // A straight finger reaches about twice as far from the wrist as its knuckle.
  const fingers = [[5, 8], [9, 12], [13, 16], [17, 20]];
  const open = fingers.reduce((sum, [mcp, tip]) => sum + clamp((dist(h[tip], h[0]) / (dist(h[mcp], h[0]) || 1e-3) - 1.1) / 0.8), 0) / fingers.length;
  const out = {
    'hand.present': 1,
    'hand.x': clamp(centre.x),
    'hand.y': clamp(1 - centre.y),
    'hand.pinch': clamp(1 - (dist(h[4], h[8]) / size - 0.15) / 0.85),
    'hand.open': open,
    'hand.roll': clamp(Math.atan2((h[9].x - h[0].x) * aspect, -(h[9].y - h[0].y)) / Math.PI, -1, 1),
  };
  if (hands.length > 1) out['hand.distance'] = clamp(dist(centre, palm(hands[1])) / aspect);
  return out;
}

const GESTURES = {
  Closed_Fist: 'gesture.fist',
  Open_Palm: 'gesture.palm',
  Pointing_Up: 'gesture.point',
  Thumb_Down: 'gesture.thumbDown',
  Thumb_Up: 'gesture.thumbUp',
  Victory: 'gesture.victory',
  ILoveYou: 'gesture.love',
};

function gestureValues(gestures) {
  const out = Object.fromEntries(Object.values(GESTURES).map((id) => [id, 0]));
  for (const hand of gestures ?? []) {
    const top = hand[0];
    const id = top && GESTURES[top.categoryName];
    if (id) out[id] = Math.max(out[id], top.score);
  }
  return out;
}

function poseValues(landmarks, aspect) {
  const p = landmarks?.[0];
  if (!p) return { 'pose.present': 0 };
  const seen = (i) => (p[i].visibility ?? 1) > 0.5;
  if (!seen(11) || !seen(12)) return { 'pose.present': 0 };
  const [ls, rs, lw, rw, lh, rh] = [p[11], p[12], p[15], p[16], p[23], p[24]];
  const mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const width = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y) || 1e-3;
  const torso = seen(23) && seen(24) ? Math.hypot((mid.x - (lh.x + rh.x) / 2) * aspect, mid.y - (lh.y + rh.y) / 2) : width * 1.4;
  const out = {
    'pose.present': 1,
    'pose.x': clamp(mid.x),
    'pose.y': clamp(1 - mid.y),
    'pose.size': clamp((width / aspect) * 2.5),
    'pose.lean': clamp(Math.atan2(ls.y - rs.y, (ls.x - rs.x) * aspect) / (Math.PI / 4), -1, 1),
  };
  // Hand height relative to the body: 0.5 at shoulder level, 1 high above.
  if (seen(15)) {
    out['pose.leftHandX'] = clamp(lw.x);
    out['pose.leftHandY'] = clamp((ls.y - lw.y) / torso * 0.5 + 0.5);
  }
  if (seen(16)) {
    out['pose.rightHandX'] = clamp(rw.x);
    out['pose.rightHandY'] = clamp((rs.y - rw.y) / torso * 0.5 + 0.5);
  }
  if (seen(15) && seen(16)) out['pose.armSpan'] = clamp(Math.hypot((lw.x - rw.x) * aspect, lw.y - rw.y) / (width * 4));
  return out;
}

// -------------------------------------------------------------- per frame ---

function process(bitmap) {
  const started = performance.now();
  const aspect = bitmap.width / bitmap.height;
  const values = {};
  const out = { t: 'result', values, mask: null, error: '' };
  const transfer = [];
  try {
    if (ready('face')) Object.assign(values, faceValues(tasks.face.instance.detectForVideo(bitmap, performance.now()), aspect));
    if (ready('gesture')) {
      const r = tasks.gesture.instance.recognizeForVideo(bitmap, performance.now());
      Object.assign(values, gestureValues(r.gestures));
      if (want.hands) Object.assign(values, handValues(r.landmarks, aspect));
    } else if (ready('hands')) {
      Object.assign(values, handValues(tasks.hands.instance.detectForVideo(bitmap, performance.now()).landmarks, aspect));
    }
    if (ready('pose')) Object.assign(values, poseValues(tasks.pose.instance.detectForVideo(bitmap, performance.now()).landmarks, aspect));
    if (ready('segment')) {
      tasks.segment.instance.segmentForVideo(bitmap, performance.now(), (result) => {
        // Mask 0 is "background"; everything else is some part of a person.
        const mask = result.confidenceMasks[0];
        const { width, height } = mask;
        const background = mask.getAsFloat32Array();
        const data = new Uint8Array(width * height);
        let person = 0;
        // Rows are written bottom-up to match the GL texture orientation.
        for (let y = 0; y < height; y++) {
          const src = y * width;
          const dst = (height - 1 - y) * width;
          for (let x = 0; x < width; x++) {
            const v = 1 - background[src + x];
            person += v;
            data[dst + x] = v * 255;
          }
        }
        values['seg.coverage'] = clamp(person / (width * height));
        out.mask = { width, height, data };
        transfer.push(data.buffer);
      });
    }
  } catch (err) {
    out.error = String(err?.message ?? err);
  }
  bitmap.close();
  out.ms = performance.now() - started;
  postMessage(out, transfer);
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.t === 'config') {
    // Serialise: a second config waits for the first to finish loading.
    configuring = configuring.then(() => configure(msg)).catch((err) => console.error('[vision]', err));
  } else if (msg.t === 'frame') {
    process(msg.bitmap);
  }
};
