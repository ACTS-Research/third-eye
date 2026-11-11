// MIDI and audio inputs. Permission prompts are raised here, on the
// operator's screen; /output then opens the devices without prompting.

import { EFFECT_BY_ID } from '../effects/index.js';
import { sourceLabel } from '../shared/sources.js';
import { makeActionBinding } from '../shared/state.js';
import { el } from '../shared/util.js';

export function mountIoPanel(root, ui) {
  const { store, bus } = ui;

  // ---------------------------------------------------------------- MIDI --
  let learnMode = null; // 'param' | 'trigger' | null
  const midiToggle = el('button', { text: 'Enable MIDI', onclick: toggleMidi });
  const learnParam = el('button', { text: 'Learn → parameter', onclick: () => setLearn(learnMode === 'param' ? null : 'param') });
  const learnTrigger = el('button', { text: 'Learn → trigger', onclick: () => setLearn(learnMode === 'trigger' ? null : 'trigger') });
  const midiNote = el('div', { class: 'dim small', id: 'midi-note' });

  async function toggleMidi() {
    if (store.state.midi.enabled) {
      setLearn(null);
      store.merge('midi', { enabled: false });
      return;
    }
    if (!navigator.requestMIDIAccess) {
      midiNote.textContent = 'This browser has no Web MIDI.';
      return;
    }
    try {
      await navigator.requestMIDIAccess({ sysex: false });
      store.merge('midi', { enabled: true });
    } catch {
      midiNote.textContent = 'MIDI access was denied in the browser.';
    }
  }

  function touchedLabel() {
    const t = ui.lastTouched;
    const i = t ? store.state.chain.findIndex((it) => it.uid === t.uid) : -1;
    if (i < 0) return null;
    return `${i + 1} ${EFFECT_BY_ID[store.state.chain[i].type].name} · ${t.key === 'mix' ? 'wet / dry' : t.key}`;
  }

  function setLearn(mode) {
    learnMode = mode;
    bus.send('midi', { cmd: 'learn', on: !!mode });
    learnParam.classList.toggle('on', mode === 'param');
    learnTrigger.classList.toggle('on', mode === 'trigger');
    if (mode === 'param') {
      const target = touchedLabel();
      midiNote.textContent = target ? `Move a knob or fader to control: ${target}` : 'Touch a parameter slider first, then move a knob or fader.';
    } else if (mode === 'trigger') {
      midiNote.textContent = 'Press a pad or key to add it as a trigger.';
    }
  }

  bus.on('midi-learned', (m) => {
    if (!learnMode) return;
    if (learnMode === 'param') {
      // The control takes over the parameter's whole range.
      const mapping = ui.addMapping?.(m.source, { mode: 'set', amount: 1, smooth: 0.03 });
      midiNote.textContent = mapping ? `${sourceLabel(m.source)} now controls ${touchedLabel() ?? 'the first parameter'}.` : 'Add an effect first.';
    } else {
      store.dispatch({ op: 'set', key: 'actions', value: [...store.state.actions, makeActionBinding(m.source, 'glitch')] });
      midiNote.textContent = `${sourceLabel(m.source)} added under Triggers — pick its action there.`;
    }
    learnMode = null;
    learnParam.classList.remove('on');
    learnTrigger.classList.remove('on');
  });

  // --------------------------------------------------------------- audio --
  const audioToggle = el('button', { text: 'Enable audio', onclick: toggleAudio });
  const device = el('select', { class: 'grow', onchange: () => store.merge('audio', { deviceId: device.value }) });
  const gain = el('input', { type: 'range', min: '0.2', max: '8', step: '0.1', class: 'grow', oninput: () => store.merge('audio', { gain: Number(gain.value) }) });
  const sens = el('input', { type: 'range', min: '1.1', max: '4', step: '0.05', class: 'grow', oninput: () => store.merge('audio', { sensitivity: Number(sens.value) }) });
  const audioNote = el('div', { class: 'dim small', id: 'audio-note' });

  async function listDevices() {
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.label);
      device.replaceChildren(el('option', { value: '', text: 'Default input' }));
      for (const d of inputs) device.append(el('option', { value: d.deviceId, text: d.label }));
      const wanted = store.state.audio.deviceId;
      device.value = inputs.some((d) => d.deviceId === wanted) ? wanted : '';
    } catch {
      /* no device access yet */
    }
  }

  async function toggleAudio() {
    if (store.state.audio.enabled) {
      store.merge('audio', { enabled: false });
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

  // -------------------------------------------------------------- status --
  const sync = () => {
    const { midi, audio } = store.state;
    midiToggle.classList.toggle('on', midi.enabled);
    midiToggle.textContent = midi.enabled ? 'MIDI on' : 'Enable MIDI';
    learnParam.disabled = !midi.enabled;
    learnTrigger.disabled = !midi.enabled;
    audioToggle.classList.toggle('on', audio.enabled);
    audioToggle.textContent = audio.enabled ? 'Audio on' : 'Enable audio';
    gain.value = String(audio.gain);
    sens.value = String(audio.sensitivity);
    if ([...device.options].some((o) => o.value === audio.deviceId)) device.value = audio.deviceId;
  };
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && (op.key === 'midi' || op.key === 'audio'))) sync();
  });

  ui.onStatus((status) => {
    if (!status) return;
    const m = status.midi;
    if (!learnMode && store.state.midi.enabled) {
      if (m.state === 'ready') midiNote.textContent = m.inputs.length ? `${m.inputs.join(', ')}${m.last ? ` — last: ${m.last}` : ''}` : 'No MIDI device connected. Plug one in; it is picked up automatically.';
      else if (m.state === 'denied') midiNote.textContent = `MIDI unavailable in the output window: ${m.error}`;
      else if (m.state === 'unsupported') midiNote.textContent = 'This browser has no Web MIDI.';
    } else if (!store.state.midi.enabled && !learnMode) {
      midiNote.textContent = '';
    }
    const a = status.audio;
    if (!store.state.audio.enabled) audioNote.textContent = '';
    else if (a.state === 'live') audioNote.textContent = `Listening: ${a.label}`;
    else if (a.state === 'error') audioNote.textContent = a.error;
    else if (a.state === 'lost') audioNote.textContent = 'Audio device disconnected.';
    ui.setAlert('audio', store.state.audio.enabled && a.state === 'suspended' ? 'Audio analysis is waiting: click the output window once to start it' : null);
  });

  root.append(
    el('div', { class: 'panel', id: 'io-panel' }, [
      el('h2', { text: 'MIDI and audio' }),
      el('div', { class: 'row wrap' }, [midiToggle, learnParam, learnTrigger]),
      midiNote,
      el('div', { class: 'row', style: 'margin-top:10px' }, [audioToggle, device]),
      el('div', { class: 'row' }, [el('span', { class: 'dim small', style: 'width:92px', text: 'Input gain' }), gain]),
      el('div', { class: 'row' }, [el('span', { class: 'dim small', style: 'width:92px', text: 'Beat threshold' }), sens]),
      audioNote,
    ]),
  );
  listDevices();
  sync();
}
