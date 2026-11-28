// MIDI and audio inputs. Permission prompts are raised here, on the
// operator's screen; the engine then opens the devices without prompting.

import { runAction } from '../shared/actions.js';
import { CLOCK_OFFSET_MS } from '../shared/state.js';
import { el } from '../shared/util.js';
import { bar, choice, menu } from './controls.js';

// The audio input that is the paired iPhone's microphone (engine/audio.js).
const PHONE = 'phone';

export function mountIoPanel(root, ui) {
  const { store, bus } = ui;

  // ---------------------------------------------------------------- MIDI --
  const midiToggle = el('button', { text: 'Enable MIDI', onclick: () => (store.state.midi.enabled ? store.merge('midi', { enabled: false }) : enableMidi()) });
  const midiNote = el('div', { class: 'dim small keep-2', id: 'midi-note' });

  // Asks for MIDI access on this page (so the prompt is never on the
  // projector), then lets the engine open the devices. Resolves true on success.
  async function enableMidi() {
    if (store.state.midi.enabled) return true;
    if (!navigator.requestMIDIAccess) {
      midiNote.textContent = 'This browser has no Web MIDI. Use Chrome.';
      return false;
    }
    try {
      await navigator.requestMIDIAccess({ sysex: false });
      store.merge('midi', { enabled: true });
      return true;
    } catch {
      midiNote.textContent = 'MIDI access was denied in the browser.';
      return false;
    }
  }
  ui.enableMidi = enableMidi;

  // ---------------------------------------------------------- MIDI clock --
  // Off, Follow or Send (mock-up K1, design/midi-clock/): one choice, so the
  // app can never be set to follow the clock it is sending. Each shows only
  // what it needs: where from and an offset, or where to and Start.
  let ins = [];
  let outs = [];
  const setMidi = (patch) => store.merge('midi', patch);
  const clockMode = choice({
    label: 'MIDI clock',
    cls: 'clock-mode',
    value: store.state.midi.clock,
    options: [
      { value: 'off', text: 'Off', label: "Off: the tempo is the show's own" },
      { value: 'follow', text: 'Follow', label: 'Follow: another device sets the tempo' },
      { value: 'send', text: 'Send', label: 'Send: this app sets the tempo for others' },
    ],
    onChange: async (mode) => {
      // The first output is taken when none has been chosen yet.
      setMidi({ clock: mode, ...(mode === 'send' && !store.state.midi.clockOut && outs[0] ? { clockOut: outs[0] } : {}) });
      if (mode !== 'off') await enableMidi();
    },
  });
  // A device that was chosen and is not plugged in stays in its menu.
  const withChosen = (names, chosen) => (chosen && !names.includes(chosen) ? [...names, chosen] : names);
  const named = (names, name) => ({ value: name, label: names.includes(name) ? name : `${name} (not connected)` });
  const clockFrom = menu({
    label: 'Follow the clock from',
    id: 'clock-in',
    cls: 'grow',
    options: () => [{ value: '', label: 'Any input' }, ...withChosen(ins, store.state.midi.clockIn).map((n) => named(ins, n))],
    value: store.state.midi.clockIn,
    onChange: (v) => setMidi({ clockIn: v }),
  });
  const clockTo = menu({
    label: 'Send the clock to',
    id: 'clock-out',
    cls: 'grow',
    options: () => [...(store.state.midi.clockOut ? [] : [{ value: '', label: outs.length ? 'Choose a device…' : 'No MIDI output found' }]), ...withChosen(outs, store.state.midi.clockOut).map((n) => named(outs, n))],
    value: store.state.midi.clockOut,
    onChange: (v) => setMidi({ clockOut: v }),
  });
  const clockRun = el('button', { id: 'clock-run-setup', 'data-midi': 'clockRun', text: 'Start', title: 'Start tells a sequencer at the other end to begin, on the next beat; Stop tells it to stop. K does the same.', onclick: () => runAction(store, 'clockRun') });
  const clockOffset = bar({
    label: 'Clock offset',
    min: -CLOCK_OFFSET_MS,
    max: CLOCK_OFFSET_MS,
    step: 1,
    value: store.state.midi.clockOffset,
    reset: 0,
    unit: ' ms',
    onInput: (v) => setMidi({ clockOffset: v }),
  });
  const followRows = el('div', { class: 'clock-rows', id: 'clock-follow' }, [
    el('div', { class: 'row' }, [el('span', { class: 'dim small clock-label', text: 'From' }), clockFrom.node]),
    el('div', { class: 'row', title: 'Moves the beat earlier or later, to sit on the music' }, [el('span', { class: 'dim small clock-label', text: 'Offset' }), clockOffset.node]),
  ]);
  const sendRows = el('div', { class: 'clock-rows', id: 'clock-send' }, [el('div', { class: 'row' }, [el('span', { class: 'dim small clock-label', text: 'To' }), clockTo.node, clockRun])]);
  const clockNote = el('div', { class: 'dim small keep-2', id: 'clock-note', role: 'status' });

  // What the clock is doing, in words.
  function clockLine(status) {
    const { midi, tempo } = store.state;
    const clock = status?.clock;
    if (midi.clock === 'off') return "The tempo is the show's own: tapped or typed.";
    if (!midi.enabled) return 'MIDI is off: switch it on above.';
    if (!clock) return '';
    if (midi.clock === 'follow') {
      if (!clock.alive) return `No clock arriving${midi.clockIn ? ` from ${midi.clockIn}` : ''}. The show's own tempo (${tempo.bpm}) carries on until one does.`;
      return `Following ${clock.port || 'a clock'} · ${clock.bpm.toFixed(1)} BPM${clock.running ? '' : ' · stopped at the other end'}. The show's own tempo (${tempo.bpm}) is kept, and takes over if the clock stops arriving.`;
    }
    if (clock.out === 'none') return outs.length ? 'Choose a device to send to.' : 'No MIDI output found. Plug the device in; it is picked up automatically.';
    if (clock.out === 'missing') return `${midi.clockOut} is not connected. The clock goes out again when it is.`;
    return `Sending ${tempo.bpm} BPM, the show's tempo, to ${midi.clockOut} · ${clock.started ? 'started' : clock.starting ? 'starting on the next beat' : 'not started'}.`;
  }
  function syncClock(status) {
    const { midi } = store.state;
    clockMode.set(midi.clock);
    followRows.hidden = midi.clock !== 'follow';
    sendRows.hidden = midi.clock !== 'send';
    clockFrom.set(midi.clockIn);
    clockTo.set(midi.clockOut);
    clockOffset.set(midi.clockOffset);
    const going = !!(status?.clock?.started || status?.clock?.starting);
    clockRun.textContent = going ? 'Stop' : 'Start';
    clockRun.classList.toggle('on', going);
    clockNote.textContent = clockLine(status);
  }

  // --------------------------------------------------------------- audio --
  const audioToggle = el('button', { text: 'Enable audio', onclick: toggleAudio });
  let devices = [];
  const device = menu({
    label: 'Audio input',
    cls: 'grow',
    // (The iPhone: its microphone, sent with its picture while "Send sound"
    // is on in the phone's settings. Listened to, never played.)
    options: () => [{ value: '', label: 'Default input' }, { value: PHONE, label: 'iPhone (its microphone)' }, ...devices.map((d) => ({ value: d.deviceId, label: d.label }))],
    value: store.state.audio.deviceId === PHONE ? PHONE : '',
    onChange: (v) => store.merge('audio', { deviceId: v }),
  });
  const gain = bar({ label: 'Input gain', min: 0.2, max: 8, step: 0.1, value: store.state.audio.gain, reset: 1, onInput: (v) => store.merge('audio', { gain: v }) });
  const sens = bar({ label: 'Beat threshold', min: 1.1, max: 4, step: 0.05, value: store.state.audio.sensitivity, reset: 1.6, onInput: (v) => store.merge('audio', { sensitivity: v }) });
  const audioNote = el('div', { class: 'dim small keep-2', id: 'audio-note' });

  async function listDevices() {
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.label);
      devices = inputs;
      const wanted = store.state.audio.deviceId;
      device.set(wanted === PHONE || inputs.some((d) => d.deviceId === wanted) ? wanted : '');
    } catch {
      /* no device access yet */
    }
  }

  async function toggleAudio() {
    if (store.state.audio.enabled) {
      store.merge('audio', { enabled: false });
      return;
    }
    // (The iPhone's sound needs none of the Mac's microphones.)
    if (store.state.audio.deviceId === PHONE) {
      store.merge('audio', { enabled: true });
      return;
    }
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of probe.getTracks()) track.stop();
      await listDevices();
      store.merge('audio', { enabled: true });
    } catch (err) {
      audioNote.textContent = err.name === 'NotAllowedError' ? 'Microphone access was denied in the browser.' : `Audio error: ${err.message}`;
    }
  }
  navigator.mediaDevices?.addEventListener?.('devicechange', listDevices);

  // What is known of the phone's sound as it arrives: how it is coded, and
  // roughly how far behind the phone it is heard here (half the link's round
  // trip, the time it is held to even out the network, and about 30 ms for
  // the phone to take it and pack it).
  function soundLine(stats) {
    // (`stats`: the phone's status, which carries its link's figures.)
    const sound = stats?.sound;
    if (!sound) return '';
    const behind = sound.heldMs === undefined ? '' : ` · about ${Math.round((stats.rttMs ?? 0) / 2 + sound.heldMs + 30)} ms behind`;
    // (Not mono or stereo: the link names two channels whatever it carries.)
    return ` · ${sound.codec || 'sound'}${sound.kbps ? ` ${Math.round(sound.kbps)} kb/s` : ''}${behind}`;
  }

  // -------------------------------------------------------------- status --
  const sync = () => {
    const { midi, audio } = store.state;
    midiToggle.classList.toggle('on', midi.enabled);
    midiToggle.textContent = midi.enabled ? 'MIDI on' : 'Enable MIDI';
    syncClock(ui.status);
    audioToggle.classList.toggle('on', audio.enabled);
    audioToggle.textContent = audio.enabled ? 'Audio on' : 'Enable audio';
    gain.set(audio.gain);
    sens.set(audio.sensitivity);
    if (audio.deviceId === PHONE || devices.some((d) => d.deviceId === audio.deviceId)) device.set(audio.deviceId);
  };
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && (op.key === 'midi' || op.key === 'audio'))) sync();
  });

  ui.onStatus((status) => {
    if (!status) return;
    const m = status.midi;
    ins = store.state.midi.enabled ? (m.inputs ?? []) : [];
    outs = store.state.midi.enabled ? (m.outputs ?? []) : [];
    syncClock(status);
    if (store.state.midi.enabled) {
      if (m.state === 'ready') midiNote.textContent = m.inputs.length ? `${m.inputs.join(', ')}${m.last ? ` — last: ${m.last}` : ''}` : 'No MIDI device connected. Plug one in; it is picked up automatically.';
      else if (m.state === 'denied') midiNote.textContent = `MIDI unavailable${status.host?.role === 'output' ? ' in the output window' : ''}: ${m.error}`;
      else if (m.state === 'unsupported') midiNote.textContent = 'This browser has no Web MIDI.';
    } else {
      midiNote.textContent = 'To assign knobs, faders and pads, use MIDI map at the top right.';
    }
    const a = status.audio;
    if (!store.state.audio.enabled) audioNote.textContent = '';
    else if (a.state === 'waiting') audioNote.textContent = status.phone?.phone === 'connected' ? 'The iPhone is not sending sound. On the phone: the settings button, then Send sound.' : 'Waiting for the iPhone: its sound comes with its picture, once Send sound is on in its settings.';
    else if (a.state === 'live' && store.state.audio.deviceId === PHONE) audioNote.textContent = `Listening: iPhone${soundLine(status.phone)}`;
    else if (a.state === 'live') audioNote.textContent = `Listening: ${a.label}`;
    else if (a.state === 'error') audioNote.textContent = a.error;
    else if (a.state === 'lost') audioNote.textContent = 'Audio device disconnected.';
    ui.setAlert('audio', store.state.audio.enabled && a.state === 'suspended' ? `Audio analysis is waiting: click ${status.host?.role === 'output' ? 'the output window' : 'anywhere on this page'} once to start it` : null);
  });

  root.append(
    el('div', { class: 'panel', id: 'io-panel' }, [
      el('h2', { text: 'MIDI and audio' }),
      el('div', { class: 'row wrap' }, [midiToggle]),
      midiNote,
      el('div', { class: 'row clock-head' }, [el('b', { class: 'clock-label', text: 'Clock' }), clockMode.node]),
      followRows,
      sendRows,
      clockNote,
      el('div', { class: 'row', style: 'margin-top:10px' }, [audioToggle, device.node]),
      el('div', { class: 'row' }, [el('span', { class: 'dim small', style: 'width:104px;flex-shrink:0', text: 'Input gain' }), gain.node]),
      el('div', { class: 'row' }, [el('span', { class: 'dim small', style: 'width:104px;flex-shrink:0', text: 'Beat threshold' }), sens.node]),
      audioNote,
    ]),
  );
  listDevices();
  sync();
}
