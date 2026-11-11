// Presets: named scenes in localStorage, shared by /control and /output so a
// trigger on the phone can step through them even with /control closed.

import { factoryPresets } from './factory-presets.js';
import { sanitizeScene, sceneOf } from './state.js';
import { readJSON, writeJSON } from './util.js';

const KEY = 'thirdeye.presets.v1';
const FILE_TAG = 'third-eye-cam-presets';

export const MAX_FADE = 30;

// A preset: { name, fade (seconds to crossfade in; null = the default), scene }.
function clean(list) {
  return list
    .filter((p) => p && typeof p === 'object' && p.scene)
    .map((p) => {
      const fade = Number(p.fade);
      return {
        name: String(p.name ?? 'Untitled').slice(0, 60),
        fade: p.fade !== null && p.fade !== undefined && Number.isFinite(fade) ? Math.min(MAX_FADE, Math.max(0, fade)) : null,
        scene: sanitizeScene(p.scene),
      };
    });
}

export function loadPresets() {
  const stored = readJSON(KEY, null);
  return clean(Array.isArray(stored) ? stored : factoryPresets());
}

export function savePresets(list) {
  writeJSON(KEY, list);
}

export function resetPresets() {
  savePresets(factoryPresets());
}

// Loads a preset into the live state, crossfading over the preset's own
// fade-in time (or `fade` seconds when given).
export function applyPreset(store, index, fade) {
  const list = loadPresets();
  if (!list.length) return;
  const i = ((index % list.length) + list.length) % list.length;
  store.dispatch({ op: 'scene', scene: list[i].scene, fade: fade ?? list[i].fade ?? store.state.globals.fadeTime, presetIndex: i });
}

export function stepPreset(store, direction) {
  const current = store.state.presetIndex;
  applyPreset(store, current < 0 ? (direction > 0 ? 0 : -1) : current + direction);
}

export function snapshotPreset(store, name, fade = null) {
  return { name, fade, scene: sceneOf(store.state) };
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
