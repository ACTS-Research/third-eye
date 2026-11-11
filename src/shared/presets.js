// Presets: named scenes in localStorage, shared by /control and /output so a
// trigger on the phone can step through them even with /control closed.

import { factoryPresets } from './factory-presets.js';
import { sanitizeScene, sceneOf } from './state.js';
import { readJSON, writeJSON } from './util.js';

const KEY = 'thirdeye.presets.v1';
const FILE_TAG = 'third-eye-cam-presets';

function clean(list) {
  return list
    .filter((p) => p && typeof p === 'object' && p.scene)
    .map((p) => ({ name: String(p.name ?? 'Untitled').slice(0, 60), scene: sanitizeScene(p.scene) }));
}

export function loadPresets() {
  const stored = readJSON(KEY, null);
  return Array.isArray(stored) ? clean(stored) : factoryPresets();
}

export function savePresets(list) {
  writeJSON(KEY, list);
}

export function resetPresets() {
  savePresets(factoryPresets());
}

// Loads a preset into the live state. `fade` (seconds) defaults to the
// crossfade time set on the control page.
export function applyPreset(store, index, fade) {
  const list = loadPresets();
  if (!list.length) return;
  const i = ((index % list.length) + list.length) % list.length;
  store.dispatch({ op: 'scene', scene: list[i].scene, fade: fade ?? store.state.globals.fadeTime, presetIndex: i });
}

export function stepPreset(store, direction) {
  const current = store.state.presetIndex;
  applyPreset(store, current < 0 ? (direction > 0 ? 0 : -1) : current + direction);
}

export function snapshotPreset(store, name) {
  return { name, scene: sceneOf(store.state) };
}

export function exportPresets(list) {
  return JSON.stringify({ format: FILE_TAG, version: 1, presets: list }, null, 2);
}

// Accepts an export file or a bare array of presets. Throws on anything else.
export function parsePresetFile(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data?.presets;
  if (!Array.isArray(list)) throw new Error('This file does not contain presets.');
  const presets = clean(list);
  if (!presets.length) throw new Error('No usable presets in this file.');
  return presets;
}
