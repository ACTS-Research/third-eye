# Handoff

## 2026-11-12

**Where things stand.** Everything planned is built and live on GitHub Pages
from `main`, and it pairs and streams with a real iPhone on home Wi-Fi and on
the iPhone's Personal Hotspot. The control page is the "Darkroom" redesign
(Perform / Edit / Setup) with MIDI map, recording, tap tempo, offline reload
and self-healing pairing.

**Latency, measured on the real phone** (H.264, home Wi-Fi, output in a
window on the Mac's screen): 200 ms at 720p · 30, 167 ms at 720p · 60, with
one stray flash at 817 ms. So 720p · 60 is now the phone's default, the
Latency estimate allows one camera frame for capture, and the result line
names a stray flash instead of folding it into the range. Numbers are in the
README under Latency.

**Next step.** Run Measure real latency once more with the output fullscreen
on the projector at 720p · 60, to see what the projector adds. Check that the
Latency line now reads close to the measured number, and whether a stray
flash shows up again.

**Decisions only you can make.**

- Decide whether to allow a relay (TURN) fallback for networks that block
  the direct phone-to-Mac link. Home Wi-Fi and the hotspot do not need it. A
  coffee-shop network failed and was not retried after the pairing fixes, so
  whether it needs one is unconfirmed. A relay costs latency and depends on
  someone's server.
- Decide whether to run your own pairing server instead of the public PeerJS
  one. The public one works; it comes with no guarantees.
- Pick the default recording format. It is WebM because Chrome writes it to
  disk every second; MP4 opens in more players but is written in large pieces.
- Say whether the board cover should stay the design prototype
  (`screenshots/third-eye-current.png`) or become a capture of the real app.
- Delete the branch `claude/affectionate-gates-x6ngzx` on GitHub (Branches
  page, trash icon) and its rule under Settings → Environments →
  `github-pages`. It is fully contained in `main`; the cloud session could
  not delete it.
- Export your presets (Setup → Preset library → Export presets) if you care
  about them. They live only in your browser, not in this repo.

**Branch.** Work is on `main`, the default branch and the one that deploys.
Nothing is waiting to be merged.

---

## For whoever picks this up

Read `README.md` for what the app does and how it is used. This section is
what the README does not say.

### Shape of the code

Three static pages built by Vite, no framework. About 7,800 lines in `src/`.

| Path | What lives there |
| --- | --- |
| `src/engine/` | Everything that runs in `/output`: the WebGL2 pipeline (`pipeline.js`), inputs, the host side of the phone link (`remote.js`), modulation, MIDI, audio, tempo, vision worker, recorder, latency probe. `engine.js` ties them together and owns the frame loop |
| `src/control/` | The operator's page. `main.js` mounts three screens: `perform.js`, `edit.js` (+ `chain.js`, `mod-panel.js`), and the Setup panels. `midi-map.js` is map mode; `status.js` owns the top-bar readouts and alerts |
| `src/phone/` | The iPhone page: `main.js`, `link.js` (reconnect watchdog), `sensors.js`, `camera-controls.js` |
| `src/shared/` | State and protocol used by more than one page: `state.js` (the state document and its sanitisers), `store.js` (op-based sync over BroadcastChannel), `presets.js`, `actions.js`, `keys.js`, `macros.js`, `net.js`, `sdp.js`, `sources.js`, `palette.js` + `theme.css` + `look.js` (palette and dimmer, kept in this browser's storage; `/output` forwards them to the phone) |
| `src/effects/` | One file per effect; `index.js` is the registry, `common.glsl.js` the shared GLSL |
| `src/sw.js` | Service worker template; `vite.config.js` fills in the file list |
| `scripts/` | `fetch-models.mjs` (MediaPipe models, run before dev and build), `session-screenshot.mjs` (the board screenshot) |
| `tests/` | Nine headless suites and `lib.mjs` |

### Rules that are easy to break

- **`/output` owns everything live.** Video, the phone connection, MIDI,
  audio and vision all run there. `/control` only edits state and shows what
  the output reports, so it can be reloaded mid-show. Do not move live work
  into `/control`.
- **State changes are ops.** Go through `store.dispatch` / `merge` /
  `patchItem` / `setScene`; both windows apply the same op. A new top-level
  state key needs a default in `defaultState()` and a line in
  `sanitizeState()`, or it is dropped on load.
- **A scene is what a preset stores**: `chain`, `mappings`, `lfos`, `macros`.
  Triggers (`actions`), tempo, network and device settings are global.
- **Nothing is ever drawn on the output** except the picture (and the idle
  hint before fullscreen). Status goes to `/control`.
- **Nothing may be fetched from a third party at run time.** Fonts, the
  MediaPipe runtime and models are all served from the site.
- **The control page must not jump.** Text that comes and goes gets a
  reserved height (`keep-1` … `keep-6` in `control.css`); alerts float.
  `tests/layout.mjs` enforces this.
- **An alert with a fix passes an action** (`ui.setAlert(key, text, level,
  ui.alertTo.…)`): pairing, QR code, reload both pages, or a Setup panel by
  id. Every alert gets an × automatically.
- **Anything a performer can press should carry `data-midi="<action>"`** so
  MIDI map mode picks it up.
- **The phone must release its video sender before stopping a camera track**
  (`link.detach()`), or the Mac receives a black frame.
- Copy on the pages is plain and says what to do; see the existing messages.

### Working in the cloud sandbox

- **Push straight to `main`** (the owner's instruction). Every push deploys;
  check the "Build and deploy to GitHub Pages" run afterwards.
- **The deployed site and the public PeerJS server cannot be reached from the
  sandbox.** Pairing is tested against a local PeerServer (`tests/lib.mjs`).
- **Run suites one at a time with a timeout under two minutes**, or in the
  background; `tests/vision.mjs` takes several minutes. `SKIP_BUILD=1` reuses
  `dist/`. Do not rebuild while a suite is running.
- **Headless Chromium starves background pages**: frames arrive hundreds of
  milliseconds apart and timers are throttled to about one a second. Tests
  must poll for a condition, never sleep and sample. Low fps readings in
  sandbox screenshots mean nothing.
- **This Chromium has no MIDI backend** (`requestMIDIAccess` never settles);
  the MIDI test stubs a device.
- Deleting a remote branch and changing repository settings are not possible
  from the cloud session.

### Things outside this repo

- The three design directions the redesign came from are on a design canvas:
  https://claude.ai/artifact/4bRZEX1Xp89CPKQF79ozx6 (private to the owner).
  Direction C, "Darkroom", was chosen.
- Presets and recordings live in the owner's browser storage.

### Known rough edges

- Several alerts at once stack over the top of the page. Each can be closed with its ×.
- Below about 1000 px wide the top bar only has room for the output readout.
- The first reload after a deploy can show the previous version for a few
  seconds; `/control` warns when its version and the output's differ.
- An early screenshot showed the output at 30 fps rather than 60; it read 60
  later. Never explained (Low Power Mode is a guess).
- MP4 recording holds most of the file back until recording stops.

### Never run on real hardware (all unconfirmed)

Measure real latency against a projector (only the Mac's own screen so
far, H.264 only); the dimmer on the iPhone, live and from the QR link; whether H.264 beats VP8 / VP9; the corrected Latency
estimate and the stray-flash note on the result line;
recordings longer than a few seconds; MIDI map with a physical controller;
fullscreen placement on a second display; MediaPipe on the Mac's GPU; the
direction of Rotate / Counter-rotate. Tap tempo, offline reload, and the
phone's sensors and touch controls have not been reported on either way.

### Ideas raised and not started

Relay fallback; own pairing server; a cue list beyond per-preset fade and
order; tempo from the audio beat; a native wrapper for a true Syphon output.

### Prompt to start a new session

```
You are picking up Third Eye Cam (repo ACTS-Research/third-eye, branch main).
Read CLAUDE.md, then HANDOFF.md, then README.md before doing anything; the
handoff says where things stand, the rules that are easy to break, and how
to work in the cloud sandbox. Work on main and push to main. After each
push, check that the "Build and deploy to GitHub Pages" run succeeded. Run
the test suites that cover what you change (one at a time, under two
minutes each, or in the background) and tell me plainly what you could not
verify on real hardware. When I say "wrap up", follow CLAUDE.md.

First, tell me in a few lines what you understand the current state and the
next step to be, then wait for what I want to do.
```
