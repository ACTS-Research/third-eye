// Presets a fresh install starts with. They are ordinary presets: edit,
// overwrite or delete them from the control page.

import { defaultLfos, makeEffect, makeMapping } from './state.js';

function scene(effects, mappings = [], lfoRates = []) {
  const chain = effects.map(([type, params, extra], i) => makeEffect(type, { uid: `f${i}${type.slice(0, 3)}`, params, ...extra }));
  const lfos = defaultLfos();
  lfoRates.forEach((spec, i) => Object.assign(lfos[i], spec));
  return {
    chain,
    lfos,
    mappings: mappings.map(([source, index, key, overrides], i) => makeMapping(source, chain[index].uid, key, { id: `m${i}`, ...overrides })),
  };
}

export function factoryPresets() {
  return [
    { name: 'Clean', scene: scene([]) },
    {
      name: 'Tunnel',
      scene: scene(
        [
          ['feedback', { zoom: 1.04, rotate: 0.012, decay: 0.95, hue: 0.006, blend: 0 }],
          ['rgbshift', { amount: 0.006, radial: 1 }],
        ],
        [
          ['phone.roll', 0, 'rotate', { amount: 0.6 }],
          ['pad.x', 0, 'zoom', { amount: 0.5, offset: -0.5 }],
          ['lfo.1', 0, 'hue', { amount: 0.3 }],
        ],
      ),
    },
    {
      name: 'Kaleido',
      scene: scene(
        [
          ['kaleido', { segments: 8, spin: 0.04, zoom: 1.2 }],
          ['hue', { shift: 0, cycle: 0.03, saturation: 1.3 }],
        ],
        [
          ['phone.roll', 0, 'angle', { amount: 0.5 }],
          ['pad.x', 0, 'segments', { mode: 'set', amount: 1, smooth: 0 }],
          ['pad.y', 0, 'zoom', { amount: 0.4, offset: -0.5 }],
        ],
      ),
    },
    {
      name: 'Thermal trails',
      scene: scene(
        [
          ['thermal', { palette: 0, contrast: 1.6 }],
          ['trails', { persistence: 0.93, blend: 0 }],
        ],
        [['lfo.1', 0, 'shift', { amount: 0.15 }]],
        [{ shape: 'drift', rate: 0.3 }],
      ),
    },
    {
      name: 'Slit-scan',
      scene: scene(
        [
          ['delay', { mode: 1, delay: 0, spread: 0.8 }],
          ['levels', { contrast: 1.25, saturation: 1.2 }],
        ],
        [['phone.tiltY', 0, 'spread', { amount: 0.5 }]],
      ),
    },
    {
      name: 'Neon edges',
      scene: scene(
        [
          ['edges', { gain: 3, width: 1.5, glow: 1.1, rainbow: 0.6, background: 0.05 }],
          ['trails', { persistence: 0.85, blend: 0 }],
          ['rgbshift', { amount: 0.004, radial: 0.7 }],
        ],
        [
          ['lfo.2', 0, 'hue', { amount: 0.5 }],
          ['phone.motion', 2, 'amount', { amount: 0.6, smooth: 0.15 }],
        ],
      ),
    },
    {
      name: 'Liquid',
      scene: scene(
        [
          ['displace', { source: 0, amount: 0.05, scale: 4, speed: 0.4 }],
          ['feedback', { zoom: 1.01, rotate: 0, decay: 0.9, hue: 0.01, key: 0.45, blend: 2 }],
        ],
        [
          ['pad.x', 0, 'amount', { amount: 0.6 }],
          ['pad.y', 0, 'scale', { amount: 0.5 }],
        ],
      ),
    },
    {
      name: 'Poster',
      scene: scene([
        ['posterize', { levels: 4, gamma: 0.9, dither: 0.3 }],
        ['levels', { contrast: 1.4, saturation: 1.6 }],
      ]),
    },
    {
      name: 'Horizon lock',
      scene: scene([['orient', { follow: 1, zoom: 1.5, edge: 0 }]]),
    },
  ];
}
