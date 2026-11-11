// Puts the MediaPipe runtime and models under public/ so they ship with the
// site and nothing is fetched from a third party at show time.
//
//   public/mediapipe/wasm/   copied from node_modules/@mediapipe/tasks-vision
//   public/models/           downloaded once, verified by SHA-256
//
// Runs automatically before `npm run dev` and `npm run build`. Files that are
// already present and intact are left alone.

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://storage.googleapis.com/mediapipe-models';

// Versioned URLs (…/1/…), not "latest", so a build is reproducible.
const MODELS = [
  ['face_landmarker.task', 'face_landmarker/face_landmarker/float16/1/face_landmarker.task', '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'],
  ['hand_landmarker.task', 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'],
  ['gesture_recognizer.task', 'gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task', '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482'],
  ['pose_landmarker_lite.task', 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'],
  ['selfie_multiclass_256x256.tflite', 'image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite', 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0'],
];

// The worker is an ES module, so only the module flavour of the runtime ships.
const WASM = ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm'];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const exists = (path) => stat(path).then(() => true, () => false);

async function copyWasm() {
  const from = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
  const to = join(root, 'public/mediapipe/wasm');
  await mkdir(to, { recursive: true });
  for (const name of WASM) {
    const [src, dst] = [join(from, name), join(to, name)];
    const same = (await exists(dst)) && (await stat(dst)).size === (await stat(src)).size;
    if (!same) await copyFile(src, dst);
  }
}

async function fetchModel([name, path, hash]) {
  const dst = join(root, 'public/models', name);
  if ((await exists(dst)) && sha256(await readFile(dst)) === hash) return 'ok';
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = sha256(data);
  if (got !== hash) throw new Error(`${name}: checksum mismatch (got ${got})`);
  await writeFile(`${dst}.part`, data);
  await rename(`${dst}.part`, dst);
  return `downloaded ${(data.length / 1e6).toFixed(1)} MB`;
}

await copyWasm();
await mkdir(join(root, 'public/models'), { recursive: true });

let failed = 0;
for (const model of MODELS) {
  try {
    const result = await fetchModel(model);
    if (result !== 'ok') console.log(`[models] ${model[0]}: ${result}`);
  } catch (err) {
    failed++;
    console.error(`[models] ${err.message}`);
  }
}

if (failed) {
  console.error(`[models] ${failed} model file(s) missing. Vision features that need them will report an error.`);
  // A dev server can still be useful offline; a build must not ship incomplete.
  if (process.argv.includes('--strict')) process.exit(1);
}
