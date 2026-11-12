// Op-based state sync. Both windows hold a full copy of the state; every
// change is an "op" applied locally and broadcast to the other window.
//
//   { op: 'param',   uid, key, value }        one effect parameter (hot path)
//   { op: 'item',    list, id, patch }        merge into an item of a list
//   { op: 'merge',   key, patch }             merge into a top-level object
//   { op: 'set',     key, value }             replace a top-level list
//   { op: 'scene',   scene, fade, presetIndex }  replace the scene
//   { op: 'presetIndex', index }              which preset is current (after a reorder)
//   { op: 'replace', state }                  full sync (sent in reply to hello)
//
// Transient events (glitch burst etc.) travel beside ops and are not stored.

import { sanitizeActions, sanitizeScene, sanitizeState } from './state.js';
import { debounce, readJSON, writeJSON } from './util.js';

const SESSION_KEY = 'thirdeye.session.v1';

export class Store {
  constructor(bus) {
    this.bus = bus;
    this.listeners = new Set();
    this.eventListeners = new Set();
    this.state = sanitizeState(readJSON(SESSION_KEY, null));
    this.save = debounce(() => writeJSON(SESSION_KEY, this.state), 250);

    bus.on('op', (m) => this.apply(m.op, true));
    bus.on('event', (m) => this.fire(m.name, m.data, true));
    // A newly opened window adopts the state of whichever window is already
    // running, so reloading /control never disturbs a live /output. (When
    // /control hosts the engine itself they share this one Store.)
    bus.on('hello', () => bus.send('op', { op: { op: 'replace', state: this.state } }));
    bus.send('hello');
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEvent(fn) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  dispatch(op) {
    this.apply(op, false);
    this.bus.send('op', { op });
  }

  emit(name, data) {
    this.fire(name, data, false);
    this.bus.send('event', { name, data });
  }

  fire(name, data, remote) {
    for (const fn of this.eventListeners) fn(name, data, remote);
  }

  findEffect(uid) {
    return this.state.chain.find((it) => it.uid === uid);
  }

  apply(op, remote) {
    const s = this.state;
    switch (op.op) {
      case 'param': {
        const item = this.findEffect(op.uid);
        if (!item) return;
        item.params[op.key] = op.value;
        break;
      }
      case 'item': {
        const list = s[op.list];
        if (!Array.isArray(list)) return;
        const idKey = op.list === 'chain' ? 'uid' : 'id';
        const item = list.find((it) => it[idKey] === op.id);
        if (!item) return;
        Object.assign(item, op.patch);
        break;
      }
      case 'merge': {
        if (!s[op.key] || typeof s[op.key] !== 'object') return;
        Object.assign(s[op.key], op.patch);
        break;
      }
      case 'set': {
        if (op.key !== 'actions') return;
        s.actions = sanitizeActions(structuredClone(op.value), []);
        break;
      }
      case 'presetIndex': {
        s.presetIndex = Number.isInteger(op.index) ? op.index : -1;
        break;
      }
      case 'scene': {
        Object.assign(s, sanitizeScene(structuredClone(op.scene)));
        if (Number.isInteger(op.presetIndex)) s.presetIndex = op.presetIndex;
        break;
      }
      case 'replace': {
        this.state = sanitizeState(structuredClone(op.state));
        break;
      }
      default:
        console.warn('[store] unknown op', op);
        return;
    }
    this.save();
    this.lastRemote = remote;
    for (const fn of this.listeners) fn(op, this.state, remote);
  }

  // Convenience wrappers ---------------------------------------------------

  setParam(uid, key, value) {
    this.dispatch({ op: 'param', uid, key, value });
  }

  patchItem(list, id, patch) {
    this.dispatch({ op: 'item', list, id, patch });
  }

  merge(key, patch) {
    this.dispatch({ op: 'merge', key, patch });
  }

  // Structural scene edit (add / remove / reorder): no crossfade.
  setScene(scene) {
    this.dispatch({ op: 'scene', scene, fade: 0 });
  }
}
