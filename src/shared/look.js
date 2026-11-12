// The look of the operator's pages: palette and dimmer. A preference of this
// browser, not show state, so it lives in localStorage. /control writes it;
// the engine (same browser) reads it and passes it to the phone. No CSS here, so
// the output can import it without pulling in the theme.

export const LOOK_KEYS = { palette: 'thirdeye.palette', dim: 'thirdeye.dim' };
export const DIM_MIN = 25; // the bottom of the dimmer: a quarter of the light

export function clampDim(value) {
  if (value === null || value === undefined || value === '') return 100;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(DIM_MIN, n)) : 100;
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private window
  }
}

export function readLook() {
  return { palette: read(LOOK_KEYS.palette) || 'darkroom', dim: clampDim(read(LOOK_KEYS.dim)) };
}
