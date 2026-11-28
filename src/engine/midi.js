// Web MIDI input. Every control change and note becomes a modulation source
// the first time it is seen:
//   midi.cc.<channel>.<controller>   0..1
//   midi.note.<channel>.<note>       velocity while held, else 0
// Learn mode reports the next control that moves so /control can map it.
//
// The messages of a MIDI clock (pulses, Start, Stop, Continue, Song
// Position) are handed to `onClock` with their time stamp and the name of
// the device they came from; `send` puts bytes out on a named output at a
// given time. What is made of either is in clock.js and tempo.js.

import { isClockMessage } from './clock.js';

export class MidiInput {
  constructor(mod, onLearn) {
    this.mod = mod;
    this.onLearn = onLearn;
    this.access = null;
    this.state = 'off';
    this.error = '';
    this.learning = false;
    this.last = '';
    this.lastAt = 0;
    this.messages = 0;
    this.onClock = null;
    this.handler = (e) => this.handle(e.data, e.timeStamp, e.target?.name);
  }

  // The devices clock can be sent to. (A stand-in device in the tests has none.)
  outputs() {
    return this.access?.outputs ? [...this.access.outputs.values()] : [];
  }

  // Sends `bytes` on the output called `name`, to leave at `at` (the page's
  // clock, ms). Returns false when there is no such output.
  send(name, bytes, at) {
    const out = name && this.outputs().find((o) => o.name === name);
    if (!out) return false;
    try {
      out.send(bytes, at);
      return true;
    } catch (err) {
      this.error = err.message || err.name;
      return false;
    }
  }

  async enable() {
    if (this.access || this.state === 'starting') return;
    if (!navigator.requestMIDIAccess) {
      this.state = 'unsupported';
      return;
    }
    this.state = 'starting';
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.bind();
      this.bind();
      this.state = 'ready';
      this.error = '';
    } catch (err) {
      this.state = 'denied';
      this.error = err.message || err.name;
    }
  }

  disable() {
    if (this.access) {
      for (const input of this.access.inputs.values()) input.onmidimessage = null;
      this.access.onstatechange = null;
    }
    this.access = null;
    this.state = 'off';
    this.learning = false;
  }

  // (Re)attach to every input; called again whenever a device is plugged in.
  bind() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) input.onmidimessage = this.handler;
  }

  handle(data, at, port) {
    if (!data || !data.length) return;
    // System messages: the clock's are one byte long and carry no channel.
    if (data[0] >= 0xf0) {
      if (isClockMessage(data[0])) this.onClock?.(data[0], data, Number.isFinite(at) && at > 0 ? at : performance.now(), port ?? '');
      return;
    }
    if (data.length < 2) return;
    const type = data[0] & 0xf0;
    const channel = (data[0] & 0x0f) + 1;
    let id = null;
    let value = 0;
    if (type === 0xb0) {
      id = `midi.cc.${channel}.${data[1]}`;
      value = data[2] / 127;
    } else if (type === 0x90 || type === 0x80) {
      id = `midi.note.${channel}.${data[1]}`;
      value = type === 0x90 ? data[2] / 127 : 0;
    } else {
      return;
    }
    if (type === 0xb0) this.mod.set(id, value);
    else this.mod.gate(id, value);
    this.messages++;
    this.last = `${id.replace('midi.', '').replaceAll('.', ' ')} = ${value.toFixed(2)}`;
    this.lastAt = performance.now();
    // Learn on a control moving or a key going down, not on a release.
    if (this.learning && (type === 0xb0 || value > 0)) {
      this.learning = false;
      this.onLearn?.(id);
    }
  }

  status() {
    return {
      state: this.state,
      error: this.error,
      inputs: this.access ? [...this.access.inputs.values()].map((i) => i.name) : [],
      outputs: this.outputs().map((o) => o.name),
      learning: this.learning,
      last: this.last,
      active: performance.now() - this.lastAt < 300,
    };
  }
}
