// MIDI clock, the arithmetic alone (no browser): the speed and the beat read
// from pulses coming in, with wobble, a change of speed, Start, Stop, a Song
// Position and a clock that stops arriving; and the pulses handed over when
// sending, on the app's own beats, with Start on a beat, Stop, a change of
// tempo, a tap, and a page that could not run for a while.
// (The screens and the engine's use of it are in midi-clock.mjs.)
//   node tests/clock.mjs

import { check, failureCount } from './lib.mjs';
import { CONTINUE, ClockIn, ClockOut, POSITION, PPQ, PULSE, START, STOP, isClockMessage } from '../src/engine/clock.js';

const spacing = (bpm) => 60000 / (bpm * PPQ);
// Feeds `count` pulses at `bpm` from time `from`; returns the time after the last.
function feed(clock, bpm, count, from, wobble = () => 0) {
  let t = from;
  for (let i = 0; i < count; i++) {
    clock.message(PULSE, [PULSE], t + wobble(i), 'Drum machine');
    t += spacing(bpm);
  }
  return t;
}

console.log('a clock coming in');
let c = new ClockIn();
check('which messages are a clock', isClockMessage(PULSE) && isClockMessage(START) && isClockMessage(STOP) && isClockMessage(CONTINUE) && isClockMessage(POSITION) && !isClockMessage(0x90) && !isClockMessage(0xb0) && !isClockMessage(0xfe));
check('before any pulse there is no speed', !c.alive(0) && c.bpm === 0);
let t = feed(c, 120, 6, 1000);
check('a few pulses are not yet enough', c.bpm === 0 && !c.alive(t));
t = feed(c, 120, 7, t);
check('half a beat of pulses gives the speed', Math.abs(c.bpm - 120) < 0.01 && c.alive(t), c.bpm.toFixed(3));
check('and names the device', c.port === 'Drum machine');
t = feed(c, 120, 48, t);
check('steady pulses read steady', Math.abs(c.bpm - 120) < 0.01, c.bpm.toFixed(3));

c = new ClockIn();
// Pulses that arrive up to 2 ms early or late (a busy USB bus).
t = feed(c, 126.4, 200, 0, (i) => [1.7, -2, 0.4, -0.9, 2, -1.3][i % 6]);
check('wobble of 2 ms either way still reads within a quarter of a BPM', Math.abs(c.bpm - 126.4) < 0.25, c.bpm.toFixed(2));
c = new ClockIn();
t = feed(c, 290, 300, 0, (i) => (i % 2 ? 2 : -2));
check('even at 290 BPM, where that is half a pulse', Math.abs(c.bpm - 290) < 3, c.bpm.toFixed(2));

c = new ClockIn();
t = feed(c, 100, 60, 0);
t = feed(c, 140, 5, t);
check('a new speed is taken up within a few pulses, not two beats later', Math.abs(c.bpm - 140) < 3, c.bpm.toFixed(2));
t = feed(c, 140, 48, t);
check('and settles on it', Math.abs(c.bpm - 140) < 0.01, c.bpm.toFixed(3));

console.log('where the beat is');
c = new ClockIn();
c.message(START, [START], 0);
t = feed(c, 120, 1, 10);
check('the pulse after Start is the first of beat one', c.ticks === 0 && c.beats(10) === 0 && c.running);
t = feed(c, 120, 24, t);
check('twenty-four pulses on it is one beat', c.ticks === 24 && Math.abs(c.beats(t - spacing(120)) - 1) < 1e-9, String(c.beats(t - spacing(120))));
const lastAt = t - spacing(120);
check('between pulses the beat moves on with the time', Math.abs(c.beats(lastAt + spacing(120) / 2) - (1 + 0.5 / PPQ)) < 1e-9);
check('a late pulse holds it, never past the next pulse', Math.abs(c.beats(lastAt + 300) - (1 + 1 / PPQ)) < 1e-9);
c.message(STOP, [STOP], t);
check('Stop is noted', !c.running);
c.message(CONTINUE, [CONTINUE], t);
t = feed(c, 120, 1, t);
check('Continue carries on from where it was', c.running && c.ticks === 25);
c.message(POSITION, [POSITION, 8, 0], t);
t = feed(c, 120, 1, t);
check('a Song Position puts the next pulse there (sixteenths, six pulses each)', c.ticks === 48 && c.beats(t - spacing(120)) === 2);
c.message(START, [START], t);
t = feed(c, 120, 1, t);
check('Start again is beat one again', c.ticks === 0);

console.log('a clock that stops arriving');
c = new ClockIn();
t = feed(c, 120, 48, 0);
check('alive while pulses come', c.alive(t));
check('not alive once they have stopped for a while', !c.alive(t + 600));
t = feed(c, 90, 6, t + 5000);
check('when it comes back, the old speed is not trusted', c.bpm === 0 && !c.alive(t));
t = feed(c, 90, 12, t);
check('and the new one is read afresh', Math.abs(c.bpm - 90) < 0.01 && c.alive(t), c.bpm.toFixed(3));

console.log('a clock going out');
let sent = [];
const send = (bytes, at) => sent.push({ status: bytes[0], at });
const pulses = () => sent.filter((m) => m.status === PULSE);
let out = new ClockOut();
// The engine calls pump every frame: here every 16 ms for two seconds.
for (let now = 0; now < 2000; now += 16) out.pump(now, 120, 0, send);
const gaps = pulses().slice(1).map((m, i) => m.at - pulses()[i].at);
check('pulses are handed over ahead of time, each with when it is to leave', pulses().length > 0 && sent.every((m, i) => i === 0 || m.at >= sent[i - 1].at) && pulses().at(-1).at >= 2000 - 16);
check('24 to the beat, evenly, whatever the frames did', pulses().length >= 96 && gaps.every((g) => Math.abs(g - spacing(120)) < 1e-6), `${pulses().length} pulses`);
check('on the app\'s own beats', pulses().every((m) => Math.abs(m.at / spacing(120) - Math.round(m.at / spacing(120))) < 1e-6));
check('none is ever handed over twice', new Set(pulses().map((m) => m.at.toFixed(3))).size === pulses().length);
check('no Start unless asked', !sent.some((m) => m.status === START) && !out.started);

sent = [];
out = new ClockOut();
for (let now = 0; now < 300; now += 16) out.pump(now, 120, 0, send);
out.start();
for (let now = 300; now < 1500; now += 16) out.pump(now, 120, 0, send);
const startAt = sent.find((m) => m.status === START)?.at;
const after = sent[sent.findIndex((m) => m.status === START) + 1];
check('Start waits for the next beat and goes just ahead of its pulse', startAt === 499 && after.status === PULSE && after.at === 500 && out.started, String(startAt));
check('once only', sent.filter((m) => m.status === START).length === 1);
out.stop(1500, send);
check('Stop goes at once, and the pulses carry on', sent.at(-1).status === STOP && sent.at(-1).at === 1500 && !out.started);
const before = pulses().length;
for (let now = 1500; now < 1700; now += 16) out.pump(now, 120, 0, send);
check('(they do)', pulses().length > before);
out.stop(1700, send);
check('Stop with nothing started sends nothing', sent.filter((m) => m.status === STOP).length === 1);

sent = [];
out = new ClockOut();
for (let now = 0; now < 1000; now += 16) out.pump(now, 120, 0, send);
for (let now = 1000; now < 2000; now += 16) out.pump(now, 90, 0, send);
let g = pulses().slice(1).map((m, i) => m.at - pulses()[i].at);
check('a change of tempo: the spacing changes, with no two pulses on top of each other', g.every((x) => x > spacing(120) * 0.49) && Math.abs(g.at(-1) - spacing(90)) < 1e-6, `shortest ${Math.min(...g).toFixed(2)} ms`);
sent = [];
out = new ClockOut();
for (let now = 0; now < 1000; now += 16) out.pump(now, 120, 0, send);
// A tap at 1007 ms moves beat one there.
for (let now = 1008; now < 2000; now += 16) out.pump(now, 120, 1007, send);
g = pulses().slice(1).map((m, i) => m.at - pulses()[i].at);
check('a tap moves the pulses onto the new beat, again without a pile-up', g.every((x) => x > spacing(120) * 0.49 && x < spacing(120) * 1.51) && Math.abs(((pulses().at(-1).at - 1007) / spacing(120)) % 1) < 1e-6, `shortest ${Math.min(...g).toFixed(2)}, longest ${Math.max(...g).toFixed(2)} ms`);

sent = [];
out = new ClockOut();
for (let now = 0; now < 500; now += 16) out.pump(now, 120, 0, send);
const held = pulses().length;
// The page could not run for three seconds (a hidden window).
out.pump(3500, 120, 0, send);
check('pulses missed while the page could not run are skipped, not sent in a burst', pulses().length - held <= 9 && pulses().slice(held).every((m) => m.at >= 3500), `${pulses().length - held} after the gap`);
const quiet = sent.length;
out.pump(3516, 0, 0, send);
check('no tempo, no pulses', sent.length === quiet);

console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() ? 1 : 0);
