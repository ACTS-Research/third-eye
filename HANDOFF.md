# Handoff

## 2026-11-28 (end of the seventh session, 24 to 28 November)

**Where things stand.** Everything is live on GitHub Pages from `main`:
stage 3 of the effects plan (Time with up to 8 s of memory, Scan, the
"driven by" menu, segmentation switching itself on for the body, the
presets Time wake and Relief), named shows with a tempo each and a backup
to a folder, the network warning on the starting screen, Glitch renamed
Blink with new keys (B Blink, Delete Blackout, Space Freeze), the logo mark
in a narrow window and a narrow top bar that keeps the CHECK number. The
owner has seen Time and Scan on the real Mac ("they work and look good");
nothing else from this session has been tried on real devices.

**Next step.** On the real iPhone and Mac, the checklist below; then build
MIDI mappings per show, as decided (see "MIDI per show" further down).

**Decisions only you can make.**

- Use Chrome for the Mac's control page.
- On the real devices: does the code in the starting screen's camera scan,
  and are the two openings (Mac and phone) timed right? Try pairing once on
  campus or venue Wi-Fi: does the starting screen say the phone can't reach
  the Mac, and the top bar `PHONE: USE HOTSPOT`?
- Try a Motion source on a slider (Mod → Motion A → Overall): lively enough
  or too jumpy? Does Gravity pour toward the room's floor when you roll the
  phone?
- Scan at 300 lines with a high lift is the heaviest setting: say whether
  it stays smooth on your Mac. Say whether Time's reach of 8 s makes a hitch
  when you change preset.
- Setup → Preset library → Bring back deleted factory presets: brings back
  Thermal trails and adds Time wake and Relief.
- Setup → Preset library → Show backup → Choose a backup folder… once. Say
  whether Chrome asks again in each new session.
- Try the new keys (B Blink, Delete Blackout, Space Freeze); they can still
  change.
- Read the side session's report on a desktop macOS version with free and
  paid tiers ("Third Eye: history and a desktop macOS version", in your
  session list) and say which way to go.
- Blink: is 1% of a slider's travel the right cut-off for a move too small
  to keep, and should any factory preset come with a blink of its own?
- Say whether the Kaleido factory preset should get its slow colour cycling
  back (an LFO on Tone's hue).
- Say go for step 5 of the signal loss plan (quality stepping down by
  itself, an alert when the Mac changes network, full alerts for the second
  phone), or change its order.
- Choose what the picture does when a phone drops: Setup → Input → If a
  source drops (it holds the last frame until you choose).
- Smaller, still open from before: a network line in Before the show; the
  Parameters bars' width; two phones on the hotspot again; a Mix B added by
  dragging the bar saved into the preset; Pair without internet for the
  second phone; MP4 once in Setup → Recordings; restyling the phone's
  Quality menu; when to try depth.

**MIDI per show (decided 28 November, not built).** MIDI mappings belong to
a show. A new show inherits the mappings of the show that was live; a show
can import the mappings of another show. Today the MIDI buttons (pads and
keys mapped to actions such as Blink, Next, a preset) are global action
bindings in `state.actions` with `midi.*` sources; MIDI on a slider is a
modulation mapping inside the preset's scene, so it already moves with the
preset. The build: keep the `midi.*` action bindings in the show
(`presets.js` shows data), swap them in and out of `state.actions` when a
show goes live (the engine reads `state.actions`, so it needs no change),
inherit on New show, and an "Import MIDI from…" choice in the Show menu.
Phone triggers and other non-MIDI bindings stay global. Needs a mock-up of
the menu choice first.

**The narrow top bar (28 November).** Under 1000 px: the CHECK flag never
shrinks (`#check-flag`), the view buttons and REC are slimmer (REC still
fits a recording's time), the output readout gives way before the phone's.
The two longest phone readings are shorter: `no pairing server`, `code in
use elsewhere`. Rules at the end of `control.css`.

**Seventh session, in short** (details in the sections below):
Time and Scan with "driven by" (stage 3); the Scan lines slider from 1; the
mark in place of the name in a narrow window; the network warning (A3 on
the starting screen, A1 strip elsewhere, R1 wording, no alert strip fading
whole any more); named shows (S1b) with tempo and a folder backup; Glitch
renamed Blink in the screens and the code, with a migration for saved data;
new keys. Mock-ups: `design/conn-warning/`, `design/shows/`.

## 2026-11-24 (end of the sixth session, 22 to 24 November)

**Where things stand.** Everything is live on GitHub Pages from `main`:
stage 2 of the effects plan (the motion map, Motion, Gravity, Motion A / B
as modulation sources), Glitch as a jump of chosen sliders, a reordered
top bar, a new starting screen on the Mac and an opening on the phone, and
both screens saying so when a network keeps the phone and the Mac apart.
The owner has used Motion, Gravity, Glitch and the top bar on the real Mac
and scanned test codes in every palette with the iPhone; the two openings,
the real code on the new starting screen and the blocked-network message
have not been seen on real devices.

**Next step.** On the real iPhone and Mac: open the app in a new tab, scan
the code in the camera, tap START. Then stage 3 of the effects plan (Time
and Scan).

**Decisions only you can make.**

- Use Chrome for the Mac's control page. Your last screenshot was Safari,
  which the page is not built or tested for.
- If the top bar still reads "Phones: A … · B …": click it, open the
  iPhone B tab, press Stop using iPhone B.
- Open `/control` in a new tab with no phone paired and scan the code in
  the camera with the iPhone. Say whether it scans and whether the
  opening's timing is right.
- On the iPhone, tap START and watch the opening: say whether the camera's
  picture shows inside the camera shape as the noise clears, and whether it
  is too long.
- Next time you are on campus or venue Wi-Fi, try pairing there once and
  say whether both screens tell you to use the hotspot.
- Press Setup → Preset library → Bring back deleted factory presets to get
  Thermal trails back (the factory version; changes you had made to it are
  gone).
- Try a Motion source on a slider (Mod → Motion A → Overall) and say
  whether it is lively enough or too jumpy. Say whether Gravity pours
  toward the room's floor when you roll the phone.
- Glitch: say whether 1% of a slider's travel is the right cut-off for a
  move too small to keep, and whether any factory preset should come with
  a glitch of its own (none does).
- Say whether you want a network line in Before the show (a partial
  self-test of the Wi-Fi; see "A network that keeps devices apart").
- Say whether the bars on the Parameters tab are too narrow for drawing a
  modulation's range (about 100 px in a 1440-wide window). If so: shorten
  "Fader" to a mark, or widen that column.
- Say whether the Kaleido factory preset should get its slow colour
  cycling back (an LFO on Tone's hue). Tone has no cycle control.
- Try two phones again on the hotspot and say whether the first still gets
  kicked off when the second starts.
- Choose what the picture does when a phone drops: Setup → Input → If a
  source drops. It holds the last frame until you choose.
- Say go for step 5 of the signal loss plan (quality stepping down by
  itself, an alert when the Mac changes network, full alerts for the second
  phone), or change its order.
- Say when to try depth (distance from the camera, by a second model) on
  your Mac. You said yes to one trial, later.
- Say whether a Mix B added by dragging the bar should be saved into the
  preset by itself. For now it lasts until the preset is loaded again.
- Say whether Pair without internet is still wanted for the second phone.
- Recording: your Mac remembers WebM from before; choose MP4 once in Setup →
  Recordings. The first time a recording saves itself, allow Chrome to
  download several files.
- Say whether the phone's Quality menu should be restyled.
- Tick **hold** again on any trigger that had it: settings saved before 13
  November are no longer read.

**Seen on the real devices, 23 November.** Motion works well; Gravity
works well ("quite beautiful images"). The owner deleted the Thermal trails
preset meaning to delete an effect: the preset's buttons sat above the
effect's panel. Now: Duplicate, Revert and Delete preset sit straight after
the preset's name, Delete says "the whole preset" when it asks, and Setup →
Preset library → Bring back deleted factory presets returns a lost factory
preset as it was made (`missingFactory` in `presets.js`). A bypassed block
no longer strikes its number out, and a block's name sits mid-block. The
edit screen lost its "← Perform" button (Perform at the top right does
that) and the "In: iPhone" block at the start of the chain row; Revert
reads `Revert 3`; Fade in drops to a second line whole in a narrow window;
the Parameters column is at least 440 px so a slider's number is never
cut.

**Glitch (built 23 November).** Mock-ups:
https://claude.ai/artifact/NFZ8AUPkcXGMBQKWwnkCkR, sources in
`design/glitch/project/`. G3 (capture) with the K4 mark, chosen because it
shows nothing until a preset uses it.

- **What it is.** `state.glitch` = `{ attack, release, scatter, hold, jumps:
  [{ fx, key, to }] }`, part of the scene, so a preset stores it
  (`defaultGlitch`, `sanitizeScene`, `sceneOf` in `state.js`). It is
  changed with `store.merge('glitch', …)`, not `setScene`, so dragging a
  bar on the tab does not rebuild the panels.
- **The engine** (`engine/glitch.js`, `GlitchJump`): one envelope for all
  jumps, applied in `Engine.resolve` after modulation, along each slider's
  bar travel (so curved sliders move as a hand would); a menu or switch is
  simply the other choice while the envelope is above zero. `trigger()`
  returns false when the preset has no jumps and the engine then tears the
  picture as before (`glitchStart`).
- **Hold needs the button coming up.** Whatever sends the `glitch` event
  sends `glitch-end` after it (action `glitchEnd`): the G key on keyup and
  on window blur (`keys.js`), a trigger falling (`modulation.js`), and a
  button through `pressGlitch()` in `glitch-panel.js` (pointer down / up;
  a keyboard click is down and up at once). A new way to fire Glitch must
  do the same, or a glitch set to hold never lets go.
- **Capture** (`glitch-panel.js`): `ui.glitchCapture` holds the chain as it
  was. While it is set the edit screen does not autosave, `ui.openedScene`
  answers with that chain (so the existing "changed" marks show what will
  become a jump), and Revert does nothing. Keep diffs the chain against
  it, restores it, then merges the jumps. Leaving the edit screen cancels;
  loading another preset drops it.
- **The mark** is `bar().setJump(to, tell)` in `controls.js`: a pointer and
  a small figure added to the bar's field only when there is a jump,
  placed with the CSS variable `--jump`. `markJumps` in `chain.js` sets
  them.
- **Wording, after the owner tried it (23 November):** the band reads
  "Glitch settings", its button "Save glitch"; the tab is plain "Glitch"
  with no count; "Recapture"; attack, release, scatter and hold explain
  themselves in tooltips.
- **Also 23 November:** a slider moved by less than 1% of its bar's
  travel while capturing is not kept (`TINY` in `glitch-panel.js`; travel,
  not value, so on a curved slider a small figure can still be a real
  move); the list of jumps shows names only, the figures in a tooltip.
- **Not done:** typing a landing value; a mark on the chain row's blocks;
  jumps for factory presets; the perform screen saying whether the live
  preset has its own glitch.

**Small things, 23 November.** Number boxes have no stepper arrows (the
browser draws them white; the arrow keys still step). Hold on a trigger's
row is the app's own switch. Setup's panels: the fold state was already
remembered (`thirdeye.folded`); a browser with none saved now starts with
only Before the show and Phone open, and an alert's "Go to …" unfolds the
panel it points at. The tests seed the old open set (`SEED` in
`tests/lib.mjs`).

**The top bar (built 23 November).** Mock-ups at
https://claude.ai/artifact/AAaBFVwkb1QsSUDMoS2mLB (sources in
`design/top-bar/project/`); the owner chose A, M1, R1, P1 and one phone
readout. Order: readouts, Perform / Edit / Setup, MIDI map (a five-pin
socket), the palette (a half disc), REC in the corner (`control/index.html`).
REC's ring is `#rec::before`; recording, its text is the time alone.
`status.js` has one phone readout: `Phones: A live · B not paired` while
`net.second` is on, opening the pop-over at the phone in the worse state.
`phone-panel.js` switches `net.second` off again when the pop-over closes
and no second phone has ever paired (`thirdeye.secondKept` in
localStorage, set on first pairing, cleared by Stop using iPhone B).
The output readout shows the frame rate only when it is low (50 or
under) and for the first six seconds of a recording.
Next: the starting screen (the owner's concern is the look of the mark and
of the QR code).

**The starting screen (built 23 November).** Mock-ups at
https://claude.ai/artifact/7MxqJ1CZhbWHzKod3deScy (sources in
`design/start2/project/`; `Frames` and `Play` are what was built).
`src/control/code-mark.js` draws the camera of the mark solid in `--ink`
with the pairing code in it as one SVG path (dark squares on the colour),
and plays the opening: outline and shut eye, open, a blink on which the
camera turns solid, noise in the code's own squares over the whole camera,
the noise settling into the code (times in `T`, 2.9 s). `perform.js` plays
it once per tab session (`thirdeye.opened` in sessionStorage); a lost
link, a new room code or a reload shows the code at once, and reduced
motion skips it. Under the code: the instruction, the room code, a line on
the pairing server's state (the Mac hears nothing between a phone's scan
and its START, so there is no "scanned" to show), the three ways on, and a
pointer for a second iPhone. The owner scanned test codes in all six
palettes with the iPhone's Camera app, at dimmer 100% and (square) 25%:
all read, so the code follows the palette and the dimmer. The test page
(`/qr-test/`) was removed once it had answered that. The pop-over behind
the phone readout still draws the plain black-on-white code (`qr.js`).
The phone's start screen (F3 of three prototypes on the same canvas):
its start screen stays calm, and the opening is what START does
(`src/phone/opening.js`, called at the end of `start()` in
`phone/main.js`): the mark blinks and turns solid, noise fills the camera
while the phone's camera and the link come up (at least 0.9 s of noise, at
most 3 s: `T.least`, `T.most`), and the noise clears to the camera's own
picture, masked to the camera's shape, before the overlay fades. It lies
over the check before the show or the live screen, which start underneath
as before. Not after Resume, not when pairing by code, not with reduced
motion, and `prefs.opening: false` switches it off (the tests seed that,
as they seed the check off). The shapes and the noise both openings share
are in `src/shared/camera-shape.js`. Not seen on a real iPhone: the masked
video in Safari, and how long the noise really lasts on a real link. Also
not done: the real code on the Mac's new screen has not been scanned by
the iPhone, only test codes drawn the same way.

**Tests, 24 November.** All twenty-seven suites passed in one full run
before the last push, `modulation` and `midi-audio` among them (both had
failed in the sandbox the day before, on the commit before as well).

**Stage 3: Time and Scan (built 24 November, seventh session).** The
owner's choices: reach up to 8 s; the body switches segmentation on by
itself; two new factory presets.

- **Time** is the old `delay` effect, renamed (the id stays `delay`, so
  saved presets keep it and get reach 1 s and "driven by: Itself", which is
  how they looked). `uses.history` is now 256 frames at most 512 wide
  (about 150 MB while Time is in a chain; twice that during a crossfade
  between two presets that both use it). `History.push` in `pipeline.js`
  stores a frame only as often as `reach / 256` needs, never more than
  once a drawn frame, measures the real gap between stored frames, and
  sets `span` (`uHistorySpan`): the layers, back from the newest, that
  cover the reach. `past()` in `delay.js` reads over `span`, not the whole
  ring. A new Time fills all 256 layers on its first frame.
- **Scan** (`src/effects/scan.js`): for each point, the lines whose base is
  close enough below to reach it are tried nearest first; the first that
  covers the point is drawn, and a nearer line risen above the point hides
  the ones behind (the horizon method). At most 96 lines are looked at per
  point (`MAX_REACH`); 300 lines with full lift is the heavy case. Its own
  brightness is read from `uTexMip` (uses.mips) at lod 1. Never run on a
  real GPU.
- **Driven by** (`src/effects/drive.js`, `driveAt()` in `common.glsl.js`):
  an effect with `uses.drive` gets `uTexB` (black while B is off), the
  motion map and `uBody`. Motion means input A's map, its wake (`g`). The
  runner asks for the motion map when a live effect is driven by Motion
  (`Runner.drivenBy`).
- **The body**: `BodyMap` in `pipeline.js` keeps the mask softened (five
  taps) and eased (`BODY_EASE_S`, 0.15 s), in the mask's own space,
  only while something is driven by it; with no fresh mask it eases to
  nobody. `Pipeline.wantsBody` → `Engine.followBody` → `visionSettings()`
  adds `segment: true` without touching Setup's switch, and keeps it 10 s
  after the last user (`BODY_LINGER_MS`) so stepping presets does not
  reload the model. Status carries `vision.forBody`; Setup → Vision's badge
  reads "on for the body", and the "Apply to … Segmentation is off" alert
  is quiet meanwhile. Stage 4's soften and delay controls are still to
  come; this easing is fixed.
- **Factory presets** Time wake (Time driven by Motion, reach 3 s, pad X
  on reach) and Relief (Scan with Blur / Glow, pad Y on lift), appended as
  `fac9` and `fac10` so the others keep their ids. An existing browser gets
  them from Bring back deleted factory presets.
- **Tests:** `time-scan.mjs` is new (twenty-eight suites); `modulation`
  counts seventeen effects, `control-ui` eleven factory presets.
- **The full run before the push (24 November):** twenty-three of
  twenty-eight passed, `time-scan` among them. `offline` (a crashed page),
  `phone` (the room-code checks), `modulation` (its effects checks passed,
  all seventeen; then the phone's sensor channel never opened),
  `midi-audio` (audio analysis not starting) and `keep-paired` (the phone
  stuck on "Connecting…") failed alone too, and failed the same way on the
  commit before (9e7ab69), run the same hour. `keep-paired` passed once on
  the commit before earlier in the session, then failed twice there: the
  sandbox's links got slower as the session went on.

**Glitch is called Blink (24 November, the owner's choice: it matches the
app), in the code too.** `state.blink`, the `blink` / `blinkEnd` actions,
the `blink` / `blink-end` events, `data-midi="blink"`, `blink-panel.js`
(`pressBlink`, `ui.blinkCapture`, `#blink-*` ids), `engine/blink.js`
(`BlinkJump`), the tear `uBlink` / `BLINK_MS`, `tests/blink.mjs`. Saved
data under the old name is read as Blink: `sanitizeScene` takes
`scene.glitch` when there is no `scene.blink`, `sanitizeActions` turns
action `glitch` into `blink` (MIDI pads are action bindings too). Keys,
also the owner's choice: **B** is Blink, **Delete** (Backspace or
forward-delete) is Blackout, Space stays Freeze. Older notes below say
Glitch, `glitch-panel.js`, the G key.
`tests/blink.mjs` now records the slider every frame inside the page to
see the throw (`window.__seen`): in the sandbox a look from the test took
up to 1.7 s, so with a 3 s release it often first looked when the sliders
were already coming back (two runs in three failed so). Full run before
the push: the usual sandbox failures (`keep-paired`, `midi-audio`,
`modulation`, `offline`, `phone`, `edit-screen`'s drag, `standalone`),
and `offline-pair-online` once (passed alone, as before the rename).

**Shows (built 24 November, seventh session).** Mock-ups
https://claude.ai/artifact/UqABtQiTWntLoBmj77HSkH (`design/shows/`); the
owner chose S1b (the Show menu below the tiles), no step count after the
name, a tempo per show, and a backup to a folder of their choosing (not
Downloads, which cannot overwrite).

- **Data** (`presets.js`): `{ live, shows: [{ id, name, bpm, steps }] }` in
  `thirdeye.shows.v1`. A browser with none gets one show, `show1` "My
  show", holding what was in `thirdeye.order.v1` (left in place, no longer
  written). `bpm` null means the show leaves the tempo alone. There is
  always at least one show: deleting the last one empties it.
- **The model** (`preset-model.js`): `shows`, `live`, `makeLive` (its
  tempo, the order from the top), `newShow`, `renameShow` (a name already
  taken gets a number), `duplicateShow`, `deleteShow`, `addShow`,
  `mergePresets`. A `tempo` merge while a show is live writes its `bpm`.
  Deleting a preset takes its steps out of every show.
- **The strip** (`strip.js`): `#strip-order` is the show's name (disabled
  while it has no steps), `#strip-all`; under the tiles `.strip-foot` with
  the action `menu()` `#show-menu` (opens upward by itself, there being no
  room below), `#save-show` and the hidden `#show-file` input. Rename and
  New use `prompt()`, Delete `confirm()`.
- **Files.** A show file (`exportShow` / `parseShowFile`, format
  `third-eye-cam-show`) holds the show and only the presets it uses, WITH
  their ids, so opening it where they already are finds them; a preset
  whose id is here but whose content differs is asked about once
  (`confirm`). The library file (`exportPresets`) is version 2: every show
  by place in the file, plus `order` (the live show) for old browsers;
  importing it adds its shows beside yours, not live, and a version 1 file
  with a running order gives a show called "Imported show".
- **Backup** (`show-backup.js`, `ui.backup`): File System Access. The
  folder handle is kept in IndexedDB (`thirdeye` / `handles` /
  `show-backup`); each show is `<name>.thirdeye-show.json` there,
  rewritten `quietMs` (30 s) after the live show last changed (its text as
  `exportShow` gives it; unchanged text is not written). States: `none`,
  `on`, `ask` (Chrome wants a click again: `allow()`), `error`,
  `unsupported`. Shown in Setup → Preset library → Show backup, in Before
  the show (a CHECK line until a folder is chosen, so the CHECK count in
  the top bar is one higher until then), and as an alert while a change
  waits for the OK. Runs in `/control` only: a show edited with
  `/control` closed is not possible anyway. A renamed show leaves its old
  file in the folder.
- **Tests:** `running-order.mjs` covers all of it, the folder with a
  stand-in handle (`window.showDirectoryPicker` replaced in the page).
- **Not done:** MIDI mappings per show (the owner: maybe later); a show's
  own triggers.
- **Tests before the push (24 November):** in the full run, besides the
  suites that fail on the commit before too (`keep-paired`, `midi-audio`,
  `modulation`, `offline`, `phone`, `edit-screen`'s drag, `standalone`'s
  "the output opened them instead"), `offline-pair-online` and `vision`
  failed once and passed alone; `offline-pair` passed alone.

**A network that keeps devices apart (built 24 November).** The owner's
worry: on venue or campus Wi-Fi the code scans, START works, and then
nothing happens on either screen. A page cannot test for this alone (it
takes the two devices trying each other), but the failed attempt is
visible: the phone's request reaches the Mac through the pairing server
before the direct link is tried. `PhoneLink.acceptData` (`remote.js`)
notes each such knock; `status().blocked` is true once knocks have gone on
for 8 s with no link open (`KNOCK_BLOCKED_MS`), and is forgotten 25 s after
the last. On the phone `HostLink.unopened` counts attempts that never
opened while the Mac is registered; `state.blocked` after the first (about
nine seconds). Shown as: an alert on `/control`, `Phone: cannot get
through` in the readout, a line on the starting screen; on the phone the
band `CAN'T REACH THE MAC` and the check's link row. All name the iPhone's
Personal Hotspot as the way out, and the phone keeps retrying. The
starting screen also says it up front ("Venue or campus Wi-Fi? …"). Not
built: a network line in Before the show (a self-test of the pairing
server, outbound traffic and the kind of NAT; partial, and an OK would not
promise devices can reach each other). Never seen on a real isolating
network: `tests/blocked.mjs` forces the phone's links to relay-only.

**A narrow window (23 November).** Under 1000 px wide the perform screen
is one column. It used to put the four panic buttons first, each the full
width, which pushed the picture (and the starting screen's code) below the
fold; the owner met this in a 984 px window. Now the picture comes first,
then the panic buttons as one row (the last block of `control.css`). The
owner was using Safari on the Mac for that screenshot: the control page is
only built and tested for Chrome.

**Settled in the sixth session.** The logo is fine for now. The
segmentation timing on the owner's Mac is not needed: the app will run on
several machines, so the body-mask effects of stage 4 are to be built to
tolerate a slow mask (soften, delay) instead of being tuned to one figure.
Glitch comes after stage 2. No mock-ups for Motion and Gravity (their
controls are the generated sliders).

**Stage 2, what to try** (Motion and Gravity have been seen working; the
notes stay for tuning).

- Motion: add it alone, wave a hand. A still room should be black; if it
  sparkles, sensitivity is too high for the camera's grain (the floor is
  in `MOTION_FRAG`, `engine/motion.js`: `change - 0.012`). Then **rest:
  Held picture**, and **show: What is still** with it.
- Gravity: add it alone, roll the phone. "Down" follows `uPhone.x` the same
  way Rotate / Counter-rotate does, and that direction has never been
  confirmed; if it is mirrored, negate `uPhone.x` in `gravity.js`.
- A Motion source: Mod on any slider → Motion A → Overall. The readings are
  shaped in `MotionSources.read` (a square root of the share of the picture
  that moves, times four).

**Settled in the fifth session.** Logo: H3 (outline camera, horizontal eye, line
2.7, the iris a ring in the same line) for the icon; H4 for the moving mark
(noise ten times a second, quick blinks at uneven gaps over twenty seconds,
the noise dimming and softening slightly at each blink, no wandering
iris). Effects: merge into fewer, deeper effects; all four identity effects
(Time, Motion, Scan, Gravity); the order below; the third-eye anchor, yes;
a depth trial, yes, later. Tone's tint colours on two rainbow bars (T1).
Bypass: the number is the switch (B1), no dot on the block, "bypassed"
under the name. "Changed" means since the edit screen was opened.
Modulation is set on the slider (N1): the arrow opens the menu with None
and More settings fixed at the top, then "In use", then every source; the
name on the button arms range mode, and the handle shows only then. The
paired phone's place is held for thirty seconds across a closed link.

**The effects plan** (approved 22 November; stage 1 is built).

1. *Done.* Curved slider ranges; Blur / Glow; Noise; Tone.
2. *Done, 22 November.* The motion map, built once and shared (a frame compared with the last,
   in the shader, no model): the Motion effect (only what moves, or only
   what is still), Gravity (the picture drifts toward real "down" as the
   phone tilts, and is dragged along with movement), and motion as
   modulation sources (overall, left / right / top / bottom), for A and B.
3. Time (longer memory than 64 frames; input B, or movement, chooses how
   far back each pixel looks) and Scan (brightness lifts the scan lines
   into relief), with a "driven by" menu on the deep effects: itself,
   input B, motion, the body.
4. Two sources: "input A, delayed" as a source for B; body, motion and
   body-part keys in Mix B; hair / skin / face / clothes in "Apply to"
   (the segmentation model already gives them; only person / background is
   used), with soften and delay for the mask.
5. Anchors: a centre or position control follows a tracked point (face,
   a hand, body centre, the fastest-moving point), the third eye (between
   the brows) first; two hands as an aperture onto B.

Still to merge under "fewer, deeper": Thermal and Posterize into a Colour
Map with the owner's own colours; Trails into Feedback, with a "grow"
control that blurs or sharpens inside the loop; Kaleidoscope and Edge Glow
simplified (seven controls each). Not recommended: object detection.
Cross-feedback between A and B: later, if at all.

**Built in the sixth session, not yet tried on real hardware.** Glitch,
all of it. The
Motion sources on a slider; which way Gravity pours when the phone is
rolled; the last round of edit screen changes; Bring back deleted factory
presets.

**Built in the fifth session, not yet tried on real hardware.**

- The moving mark in Safari on the iPhone (SVG animation of a filter's
  seed); the icon at 16 px in a real tab.
- Blur / Glow at 60 fps, above all with an output window on a large
  display; how the curved sliders feel under a hand, a fader and a MIDI
  knob; a saved preset with Contrast / Brightness or Hue Shift becoming
  Tone.
- The pinned top of the source menu. (Drawing a modulation's range on a
  bar and the number as a bypass switch: confirmed by the owner.)
- The paired phone keeping its place through a reload with another phone
  waiting on the same code.

**Built in the fourth session, not yet tried on real hardware.**

- Input B and Mix B: two real pictures mixed, the iPhone as A or B, 60 fps
  with two live videos, each of the nine modes.
- The strip under the picture: the rollover on the source icons with a
  real trackpad, the first drag of the bar, the mode grid.
- A second iPhone: tried once on the hotspot on 16 November (it worked; the
  first phone was kicked off and came back). Not since.
- Keep what is paired: a second phone scanning the first one's code being
  turned away; the room code holding; a link held through a short break.
- If a source drops: each choice, with a real phone going out of range or
  to the background, and whether three seconds is the right wait.
- The phone's band and Resume: out of range and back, the phone locked,
  the page reloaded; whether the band reads at arm's length.
- Start screens and checks: the splash's code scanned from where you
  stand; whether iOS reports "the screen may lock" in Low Power Mode;
  whether the Mac stays awake with a phone paired.
- Recordings landing in Downloads by themselves.
- From the session before: the running order, the rebuilt edit screen's
  LFOs tab and tempo sync, Setup's own menus, Preview: Mac output.

**When you are next in the studio.** Open the output window before the
show, then: measure real latency fullscreen on the projector at 720p · 60 (so
far only against the Mac's own screen: 200 ms at 30 fps, 167 ms at 60), check
the Latency line reads close to it, move the Dim strip with the phone paired
to see the phone follow, and cover or minimise the output window for a few
seconds to see `/control` say it is not drawing (it must not take the picture
over).

**Branch.** Work is on `main`, the default branch and the one that deploys.
Nothing is waiting to be merged; everything is pushed (checked 28 November:
`main` is the only branch on GitHub, and local `main` and `origin/main` are
the same commit). A cloud session starts on a temporary local branch: switch
to `main` (`git checkout -B main origin/main`) before committing, and push
`main` only.

**Mock-ups and the plan.** All private to the owner on claude.ai; their
sources are in `design/` (`design/README.md` says which option of each was
built).

- The starting screen, the two openings and the phone's start (sixth
  session): https://claude.ai/artifact/7MxqJ1CZhbWHzKod3deScy
- The top bar: https://claude.ai/artifact/AAaBFVwkb1QsSUDMoS2mLB
- Glitch: https://claude.ai/artifact/NFZ8AUPkcXGMBQKWwnkCkR
- The logo, round 4: https://claude.ai/artifact/E6D3gZSjwHWBqA6rbMSN6m
- Tone's colour controls: https://claude.ai/artifact/LQquh24inx3yagJ4bcuwUi
- Bypass, change marks and modulation on the edit screen:
  https://claude.ai/artifact/1DVQ6Ag15uNCUn4eKtHVeU
- Signal loss plan: https://claude.ai/artifact/PqZU5qNH73BYugN5Y2TZiH
- Start screens and checks: https://claude.ai/artifact/N87fpc4XRa3ZSzKKChNwLi
- The phone when the link is down: https://claude.ai/artifact/VMB991eaoBVQQPhwQJ9Bak
- A second iPhone: https://claude.ai/artifact/Ee4tdXfFVVeuFct1gv7JH9
- Input B and mixing, and the strip: https://claude.ai/artifact/4yrzjrjTVfZ4qgMexUNNn3
- Running order: https://claude.ai/artifact/SiD1F7P89JLwXeC31BKhz4
- Edit screen, slider styles and tempo sync: https://claude.ai/artifact/UEbbvKGUHsQo7CxCWFUVDT
- Icons: https://claude.ai/artifact/PTAr6DCd26vjPQTYy43Nmo

**What is backed up, and what is not.** The code, tests, docs, screenshots,
the plan and every mock-up's source are on GitHub in `main` (the three
canvases of the sixth session are in `design/glitch/`, `design/top-bar/`
and `design/start2/`, each under `project/`). Your presets,
running order and settings are not: they live in your browser on the Mac
(Setup → Preset library → Export presets). Recordings now save to your
Downloads folder as they stop; a copy also stays in the browser until
deleted under Setup → Recordings.

### Seen on the real iPhone and Mac in the fourth session

- 16 November: the owner's Mac was still showing the layout from before the
  session an hour after it was deployed (a screenshot showed the numbered
  input buttons). A reload, sometimes two, or closing every tab of the app,
  brings the new version.
- 16 November: two iPhones with the Mac on the first one's hotspot. The
  second phone paired from its own tab and read PHONE B, and worked; the
  first phone was kicked off as it did, and reconnected. Cause not known
  (the hotspot stumbling is the likeliest). Not tried again since "keep
  what is paired" was built.
- The owner reports no longer needing Pair without internet: any Wi-Fi on
  the phone and the Mac on the phone's hotspot has been working.
- Nothing else built in this session has been seen on real devices.

### Seen on the real iPhone and Mac in the third session

- Normal pairing and streaming with the Mac on the iPhone's hotspot (the
  phone on cellular): works.
- University Wi-Fi: the Mac could not reach the public pairing server.
- The owner reported "it works" after Pair without internet shipped, with
  the phone live; which route was used was not said.
- The rebuilt phone screen draws correctly in Safari, the Mac's preset names
  and trigger labels arrive, and the iPhone's camera offers zoom, torch and a
  white-balance lock.
- The screen wake lock was refused on the owner's iPhone (the message
  appeared; the battery was low, so Low Power Mode is a guess).
- The first rebuild's sideways picture was rejected (see below). Freeze from
  the phone was reported not working twice; the fix that followed (every tap
  its own press) is not yet confirmed.
- 14 November: on the hotspot (phone on 5G) the upright phone screen showed
  its six presets, triggers, icons and zoom bar; the preview showed the
  Mac's screen on its side, cause not yet known (see the first decision).
- 14 November: after the reconnect changes the owner said reconnecting
  "works better", and later that pairing "seems to work fine".
- 15 November: the owner used the rebuilt edit screen on the Mac (in a blue
  palette) and asked for the LFOs tab and picture buttons that followed.
- The iPhone's camera offers a web page no exposure or focus controls (the
  settings panel was empty apart from Quality and Camera).

### Sixth session (22 November), in short

- **The motion map** is `src/engine/motion.js`. `MotionMap` (one for input
  A, one for B, owned by the pipeline) keeps a 320-wide grey copy of the
  last two frames and a map: r = movement now, g = the same with a wake,
  b / a = a rough direction (brightness change against the gradient, read
  a quarter-size so fast movement registers). It is refreshed in
  `Pipeline.render` only when an effect with `uses: { motion: true }` is
  in a chain being drawn, or `ctx.motion` asks (the engine's
  `wantMotion()`: a mapping or trigger whose source starts `motionA.` /
  `motionB.`). It is refreshed when the input has a new frame, and after
  100 ms without one so that a frozen picture reads as still; after half a
  second unread it starts again from nothing.
- **Effects read it** as `uMotion` / `uMotionB` through `motionAt()`
  (`common.glsl.js`).
- **An effect's alpha is now its own.** The footer writes `wet.a`, not 1,
  so an effect with `uses.prev` can keep a value in `uPrev`'s alpha:
  Motion keeps how recently each point moved there. Every other effect
  returns 1 or passes its input's alpha on, and the final pass writes 1.
  If a later effect ever needs alpha to mean something, this is where to
  look.
- **The sources** are `MotionSources` in the same file: the map averaged
  to 16×9 in the shader, read back without waiting, summed per half in
  script. They are `lazy` in `sources.js`, so they are in every source
  menu but only get a meter under Setup → Sources once one is in use. A
  side nobody maps reads zero.
- **Tests.** `modulation` counts sixteen effects and has a `motion`
  section. `glitch` is new: twenty-six suites. On 23 November the sandbox
  was slow again: in the full run before Glitch was pushed, `mix`,
  `keep-paired` and `phone` each failed once or twice and then passed
  alone, and passed on the commit before; `modulation` (the phone's sensor
  channel never opening after the sixteen-effect chain) and `midi-audio`
  (audio analysis not starting, then a crashed page) failed every time,
  on the commit before Glitch as well. Both passed the day before.

### Fifth session (21 to 22 November), in short

- **Logo.** `scripts/make-icons.mjs` draws the icon; `src/shared/mark.js`
  is its moving form, animated with SVG's own `<animate>` (nothing in CSS,
  no timer), and still for anyone who asks for reduced motion. Sources of
  the eleven boards in `design/logo/`.
- **Curved sliders.** An effect parameter may carry `curve` (with `center`
  or `from: 'max'`): see `paramValue` / `paramUnit` in
  `src/effects/index.js`. Stored values, typed values and shaders stay in
  the parameter's own units; only positions are curved, and everything
  that turns a position into a value goes through those two functions (the
  bar's `scale`, perform faders in `macros.js`, modulation and MIDI in
  `modulation.js`). The two ends are exactly min and max.
- **Tone** replaces `levels` and `hue`; `renamed()` in `state.js` turns a
  saved one into Tone. A parameter with `look: 'hue'` gets a rainbow bar.
- **Blur / Glow** reads `uTexMip`: `uses: { mips: true }` gives an effect a
  copy of its input, at most 640 wide, with every mip level
  (`EffectInstance.mips` in `pipeline.js`). Five reads for the round blur,
  nine more along a line for the streak.
- **Noise** uses an integer hash (`flakes`); the shared `hash21` shows a
  weave on a grid of cells.
- **The edit screen** (`chain.js`, `controls.js`): the block's number is
  the bypass switch; `bar()` gained `setLive` (the hatched band; the
  engine sends each moved slider's position as `mods` with `sources`),
  `setWas` (the mark where a value was) and `setRange` (range mode: a drag
  sets a modulation's amount, never the value). `menu()` gained pinned and
  disabled choices and `mark` for an action menu. `ui.openedScene()` is
  what Revert goes back to.
- **Keep what is paired:** `PhoneLink.holdsAgainst` no longer needs the
  paired phone's link to be open, only that it was heard from in the last
  thirty seconds; the id is cleared on a new room code and on a deliberate
  shutdown. Not done: carrying the id across a move of the picture between
  windows (the new engine starts with none, so a phone waiting on the same
  code could get in first at that moment).
- **Tests.** Still twenty-five suites. `modulation` draws its all-effects
  chain at the app's 50% resolution and then lightens the chain (software
  graphics could no longer draw it at full size; the commit before stalls
  at the same check). Mix B is left out of its "every effect alters the
  picture" loop: with input B off it changes nothing, and the check only
  passed by reading a frame left by the effect before. `midi-audio` sends
  a press and its release in one step. `edit-screen` gained checks for the
  switch, the marks and range mode.

### Fourth session (16 to 21 November), in short

Each of these has its own section further down ("Input B and Mix B",
"Signal loss plan", "A second iPhone").

- **Input B and Mix B.** A second input, mixed in by an effect in the chain;
  nine modes.
- **The strip under the picture.** Two small live views, source icons on
  rollover, the mix bar, the mode grid. Rebuilt once after the owner tried
  the first version.
- **A second iPhone,** under its own room code, as a fifth source and a
  second controller. The keys moved: 1 iPhone, 2 iPhone B, 3 camera, 4
  pattern, 5 file.
- **Signal loss plan,** steps 1 to 4 of 5: a paired phone keeps its place
  and its room code; a stand-by when a source drops; the band and Resume on
  the phone; the Mac's splash, both checks before the show.
- **Recordings** are MP4 by default, named `ThirdEyeCam_` and the date, and
  save to Downloads as they stop.
- **Suites added:** `mix`, `two-phones`, `keep-paired`, `drop`, `link-down`,
  `start`. Twenty-five in all.
- **Test failures met on the way, all traced:** hard-coded counts (effects,
  readouts); checks that MP4 as the default had made a matter of luck;
  `offline-pair` waiting too short a time for a closed phone page to be
  noticed; a lost trigger press when two phones press at once (a real
  limit, see "A second iPhone"); the new Setup panel making the page jump
  (fixed in the app); a menu opened while off the screen (fixed in the
  app). None was skipped or loosened in what it checks.

### Third session (13 to 16 November), in short

- **Optional output window.** The engine moves between windows; `/control`
  hosts it when no output is open. Details below.
- **Pair without internet.** QR code both ways, no server; the picture moves
  between windows without a new scan. jsQR added with the owner's approval.
- **The phone's live screen.** Rebuilt twice in one evening; what stands is
  below.
- **Top bar.** Each readout is a button with its own job: output opens the
  output window, phone shows pairing. The input readout was taken out on 14
  November at the owner's suggestion (it repeated the input buttons); the
  input's state is now the line under those buttons on the perform screen,
  and a click on it goes to Setup → Input.
- **Icon.** Option D2 (a compact camera with an upright eye), eye a little
  right of centre; `scripts/make-icons.mjs` draws it. The sheet with all
  three rounds is in `design/third-eye-icons.html` and at
  https://claude.ai/artifact/PTAr6DCd26vjPQTYy43Nmo (private to the owner).
- **Fixed on the way:** a video call left open on the Mac when the phone link
  was shut down (PeerJS skips connections on destroy); two quick taps on a
  trigger read as one press.
- **Two mistakes worth knowing about.** A function was deleted with a
  scripted edit and went live for about fifteen minutes because only four
  suites had finished; and a rename the owner had stopped was pushed because
  it was sitting uncommitted. Both are now rules under "Working in the cloud
  sandbox".
- **Running order** (14 November). Steps that point at presets, on the
  preset strip; the phone's six buttons follow it.
- **Reconnecting** (14 November). The phone's scanner reads either code, the
  phone notices a silent Mac, the Mac keeps its room code for 75 seconds.
- **Preview: Mac output** on the phone (14 November), normal pairing only.
- **Edit screen rebuilt** (15 November) as mock-up C with the app's own
  sliders, menus and picture buttons; Tweakpane removed; Setup followed.
- **Small things:** the pairing pop-over closes once paired; modulation
  meters say what they move; input button 4 opens the file picker; the
  person mask no longer flickers on a slow machine.
- **The cloud sandbox got slower during the session** and several suites
  began failing on timing alone. Each was traced before being touched: the
  stand-in camera, the smoke test's clip, and four checks that sampled once
  now wait for the state they test. None was skipped or loosened in what it
  checks. If a suite fails, run it again alone before believing it, and
  compare against the previous commit before blaming a change.
- **Suites added:** `handover`, `standalone`, `offline-pair`,
  `offline-pair-online`, `offline-handover`, `phone-screen`, `running-order`,
  `reconnect`, `output-preview`, `edit-screen`.

### Pair without internet (built 2026-11-13)

- **What travels** is in the header of `src/shared/direct.js`: the Mac's
  offer, slimmed, phrase-swapped and compressed, in the pairing link after
  the `#`; the phone's half as a 108-character token. The Mac never sees the
  phone's real answer: it rebuilds one from its own offer plus the token.
  The offer carries no addresses of the Mac's, on purpose: the Mac makes the
  first move, and a phone with nothing to try cannot time out while its code
  is being shown.
- **A direct link fills the same slots** as a PeerJS one (`conn`, `call`) on
  both sides, through `DirectConn` / `DirectCall`. One RTCPeerConnection
  carries video, the message channel (negotiated, id 1) and the sensor
  channel (id 42).
- **The phone keeps direct links in reserve** (`pendings` in
  `src/phone/link.js`) and switches to one when the Mac's engine first
  speaks on it (`host`).
- **Introductions** move the picture without a re-scan: the window that
  reaches the phone relays another window's offer to it and the answer back
  (`PhoneLink.relay`, bus `intro` / `intro-answer`). An opening output is
  told `engine-hold`, gets introduced, then says `engine-take`. While an
  output hosts, `/control` keeps a link in reserve (`keepSpare` in
  `host.js`), so closing or crashing the output needs no handshake.
- **A phone page opened from the code pairs by code only** (`directFirst`
  in `src/phone/link.js`) until the link is up or the operator taps Hide the
  code. Without that, a reachable pairing server wins the race and the phone
  never shows its code.
- **The dialog never shows an earlier attempt's code**: it blanks the code
  until the engine's fresh offer arrives.
- **The dialog** is `src/control/offline-pair.js`. The Mac's camera reads the
  phone's code with `BarcodeDetector` where Chrome has one, and with the
  bundled jsQR library (added 2026-11-13 with the owner's approval; loaded
  only when the dialog opens) whenever that finds nothing. The tests give
  `/control` a stand-in camera showing a picture of the phone's code
  (`fakeMacCamera` in `tests/lib.mjs`), read by jsQR.

### The phone's live screen (rebuilt 2026-11-13)

Twice. The first attempt kept the screen horizontal by drawing it on its
side when the phone was upright and laid upright camera frames on their side
on the Mac. The owner rejected that on the iPhone: the picture must stay the
right way up. What stands now:

- **Two real layouts**, chosen by how the page is turned (`#root.upright`,
  set in `layout()` in `src/phone/main.js`; the rest is `phone.css`). Nothing
  on the live screen is drawn turned.
- **The picture is always horizontal and the world always upright.** Upright
  camera frames are not turned: the Mac's Fill takes their middle band and
  the preview (`object-fit: cover` in a 16:9 box) shows the same band. Do not
  bring back turning frames to "use the whole sensor".
- **Rotate is the only turn**: quarter turns of the picture, sent as `P.TURN`
  and applied in the source shader (`uTurn`); vision sees the turned picture.
  `P.SCREEN` carries which way is up in the picture as shown, for roll.
- **The preview is the XY pad.** Six preset buttons come from the Mac
  (`presets` message; `preset` back); no banks, no scrolling. Triggers bound
  to previous / next preset are hidden while the presets are shown.
- **Every tap is its own press** (`queued` / `shown` in
  `src/engine/phone-sensors.js`): two taps that reach the engine between two
  frames used to read as one long press, so the second tap on Freeze did
  nothing. Keep that if you touch the trigger path.
- **Trigger "hold" is stored as `hold`**, not `momentary` as before
  2026-11-13. The old name is ignored on purpose, so no stored session and no
  stale window can bring the old default (Freeze on hold) back.
- **Sliders are the `fader`** in `src/phone/widgets.js`; zoom is a bare one.
  Flip, torch and the white-balance lock are icon buttons under the presets.
- **Messages lie over the status line** for a few seconds (`setNote`); they
  must never take room from the preview.
- **The phone asks for its state** (`hello`) when its link opens; the Mac
  answers with labels, presets, codec and palette (`greetPhone`).
- **Reconnect** redials (`HostLink.restart`). It reads **Scan code** for a
  phone paired by code, or when the pairing server says nothing is
  registered under the room (`state.notFound`), and then reads a code on the
  Mac inside the page (jsQR, loaded on demand): the Pair-without-internet
  offer, or the ordinary pairing link (`joinRoom` → `HostLink.setRoom`).
- **The phone does not trust the browser about a dead link** (added 14
  November after the owner kept having to close the page and scan again;
  which failure they hit is not known). `HostLink.tick` counts silence: the
  Mac answers a ping a second, and ten seconds with nothing heard (six at first; raised on 15 November after
  a busy Mac page was seen to trip it in a test) drops the
  link and starts signaling over too. Two data connections in a row that
  never open also restart signaling. Time the page spent asleep is not
  counted (`awake`, and the gap check at the top of `tick`). A direct link is
  only dropped for silence when the pairing server can be reached.
- **`tests/offline-pair.mjs` and slow machines.** From 14 November the
  check "a code read twenty seconds later still pairs" failed about one run
  in two in the cloud sandbox. Traced: once the phone's code reaches the
  Mac's reader the app pairs in about 0.3 s every time; what crawls is the
  sandbox (the Mac page's draw loop at 0 to 6 frames a second while it reads
  a camera, decodes video and draws with software graphics), and the test's
  stand-in camera, which left to itself can go half a minute without
  delivering a frame. The stand-in camera (`fakeCamera` in `lib.mjs`) now
  pushes its frames from a worker's clock, and that one check waits up to a
  minute. Not settled: the suite passed 4 runs in 4 on the code from before
  the reconnect change and failed about half the time after it, and no
  cause was found in the code. If Pair without internet feels slower on the
  real phone and Mac than it did, start there.
- **`tests/vision.mjs` and slow machines.** A person mask is fresh for 1.5 s
  (`MASK_FRESH_MS`); in the cloud sandbox a segmentation pass takes about a
  second on the CPU and sometimes longer, so a picture read at the wrong
  moment has no mask. The mask test now reads a picture drawn just after a
  mask arrived. It failed two runs in three before that, on older code too.
- **The phone's preview can show the Mac's output** (14 November; a setting
  in the phone's camera panel, off by default). `engine/return-feed.js`
  copies the finished frame to a 480-wide canvas about 15 times a second,
  only while a phone has asked (`{ t: 'preview', on }`); `PhoneLink.acceptCall`
  answers the phone's call with that canvas's stream, so nothing new is
  negotiated. On the phone `HostLink.remote` is that stream and
  `syncPreview` in `main.js` decides what the preview shows. Not done: a
  phone paired without internet (the direct handshake is receive-only on the
  Mac's side; its codes would have to change), and a phone with its camera
  off (PeerJS will not make a call without a stream to send).
- **The Mac holds on to its room code for 75 seconds** when it reads as
  taken (`ROOM_TAKEN_MS` in `remote.js`), because a registration left by a
  reload clears within a minute and a new code strands the phone.

### Second session (2026-11-12), in short

- Latency measured on the real phone; 720p · 60 is the phone's default; the
  Latency estimate allows one camera frame; a stray flash is named apart.
- Dim strip under the palettes (25 %–100 %), carried to the phone by the QR
  link and live while paired; palette changes now reach the phone live too.
- Alert strips: compact, an × on each, a fix button where there is one
  (Show pairing, Show QR code, Reload both pages, Go to a Setup panel); the
  room-code strip now clears once the phone pairs.
- Fader column: no overlaps in short windows, names whole; modulation shown
  as a hatched band instead of a dashed line.
- Fixed: the phone page went black (a CSS variable loop between the dimmer
  and the phone's own `--dim`). That also hid START and broke pairing tests
  in the field; after the fix the hotspot route works.

### Optional output window (built 2026-11-12, third session)

Plan A as approved: the engine moves between windows. The phone reconnects
at each switch (1.5–2.5 s in the headless tests) and a recording in progress
stops.

- **Who hosts** is decided in `src/control/host.js`; the header comment there
  lists the states and the bus messages. In short: `/control` asks
  `engine-who` on load and starts its own engine if nobody answers; an output
  window claims with `output-ping` (the hosting `/control` stops and answers
  `engine-released`); a host says `engine-gone` as its page closes; a quiet
  host is probed with `engine-who` before it is taken for gone, because a
  window Chrome has stopped drawing sends no status but still answers.
- **One `Engine` object per page**, started and stopped (`engine.start()`,
  `engine.stop()`), never rebuilt. A stopped engine holds no room code, no
  devices and no recording, and ignores the store; `start()` takes everything
  from the store again (`resync()`).
- **The bus loops back** in `/control` (`createBus({ loopback: true })`), so
  the engine and the UI talk in one window. Store traffic (`op`, `event`,
  `hello`) is never looped back.
- **The monitor** on `/control` is the engine's own canvas (`#stage`) while
  it hosts, moved between the Perform and Edit screens; otherwise the small
  readback (`canvas.readback`). In `/control` the engine renders at a fixed
  1280×720.
- **The phone learns the picture moved** from a `host` message carrying a
  session id (new at every `engine.start()`), and calls again at once
  (`onHostSession` in `src/phone/link.js`).

---

## For whoever picks this up

Read `README.md` for what the app does and how it is used. This section is
what the README does not say.

### The name

The app is called **Third Eye Cam**. A rename to "3rdEyeCam" was started on
2026-11-13 and the owner stopped it ("leave it as it was for now"). Do not
rename anything unless asked.

### Shape of the code

Three static pages built by Vite, no framework.

| Path | What lives there |
| --- | --- |
| `src/engine/` | Everything live: the motion map and its modulation sources (`motion.js`), the WebGL2 pipeline (`pipeline.js`, with the stand-by picture and the small input views), inputs (`inputs.js`: input A, input B and two spare slots over one set of feeds), the host side of the phone link (`remote.js`), the small copy of the output sent back to the phone (`return-feed.js`), modulation, MIDI, audio, tempo, vision worker, recorder, latency probe. `engine.js` ties them together and owns the frame loop. It runs in `/output` while an output window is open, otherwise in `/control`. Sixth session: `blink.js` (Blink, once Glitch: a jump of chosen sliders) |
| `src/control/` | The operator's page. `main.js` mounts three screens: `perform.js` (+ `strip.js`, the strip of presets and the running order), `edit.js` (+ `chain.js` the chain row and Parameters tab, `mod-panel.js` the Modulation tab, `controls.js` the app's own bar slider, menu, switch and row of picture buttons), and the Setup panels. `host.js` decides which window hosts the engine and owns the monitor canvas. `midi-map.js` is map mode; `status.js` owns the top-bar readouts and alerts; `check-panel.js` is Before the show and keeps the Mac awake; `phone-panel.js` the pairing pop-over with a tab for each phone; `record-panel.js` saves recordings to Downloads. Sixth session: `blink-panel.js` (the Blink tab and capture), `code-mark.js` (the starting screen's camera holding the pairing code, and its opening) |
| `src/phone/` | The iPhone page: `main.js`, `link.js` (reconnect watchdog, direct links), `sensors.js` (motion, the XY pad, triggers, presets), `camera-controls.js`, `orient.js` (page angle, the Rotate turn), `widgets.js` (the fader), `opening.js` (what START plays) |
| `src/shared/` | State and protocol used by more than one page: `state.js` (the state document and its sanitisers), `store.js` (op-based sync over BroadcastChannel), `presets.js` (presets, each with a permanent id, and the running order: `loadOrder`, `orderView`, `applyStep`, `stepShow`), `actions.js`, `keys.js`, `macros.js`, `net.js`, `sdp.js`, `direct.js` (pairing with no server), `qr.js`, `sources.js`, `mark.js` (the animated mark on the splash and the phone's start screen), `palette.js` + `theme.css` + `look.js` (palette and dimmer, kept in this browser's storage; the engine forwards them to the phone), `camera-shape.js` (the camera of the mark and the squared noise both openings draw in it) |
| `src/effects/` | One file per effect (`mixb.js` mixes input B in; `delay.js` is Time); `index.js` is the registry, `common.glsl.js` the shared GLSL, `drive.js` the "driven by" menu |
| `src/sw.js` | Service worker template; `vite.config.js` fills in the file list |
| `scripts/` | `fetch-models.mjs` (MediaPipe models, run before dev and build), `session-screenshot.mjs` (the board screenshot), `make-icons.mjs` (the tab and Home Screen icon: the logo of 22 November, `design/logo/`) |
| `design/` | Mock-ups shown to the owner, not part of the site: `third-eye-icons.html`, `logo/`, `tone/`, `edit-marks/`, `running-order/`, `edit-screen/`, `mix/`, `phone2/`. `design/README.md` says which option of each was built. Sixth session: `glitch/`, `top-bar/`, `start2/` |
| `tests/` | Twenty-eight headless suites and `lib.mjs` |

### Rules that are easy to break

- **No `<select>`, no plain `<input type=range>` and no third-party controls
  anywhere on `/control`.** (The phone page keeps its one system menu.) Sliders
  are `bar()` and menus are `menu()` from `src/control/controls.js` (Tweakpane
  was removed on 15 November). A `menu()` list is appended to `<body>` and
  must stop key events itself: the page's shortcuts (arrows step presets,
  Space freezes) listen on `window`. It follows its button on scroll instead
  of closing, because clicking a half-hidden button scrolls it into view
  first. `choice()` is a row of picture buttons (LFO shape, tempo sync).
  One trap: `.panel button.grow` is styled tall for big wrapped buttons, so a
  `menu()` given `grow` needs the `.panel button.menu.grow` override.
- **A step of a show points at a preset by id, never by place.**
  Presets are still addressed by index everywhere else (`presetIndex`,
  `preset:3`), so anything that creates a preset must give it an id
  (`snapshotPreset` does; `loadPresets` mints and saves ids for old data).
  Where the order is at lives in the shared state (`order: { cue, off }`),
  not in `/control`, because the engine steps it with `/control` closed. A
  `scene` op with `cue` moves the order; one with `offList` (a preset loaded
  by hand, via `applyPreset`) leaves it where it was and marks it off.
  Shows live in `thirdeye.shows.v1` (`loadShows` / `saveShows` in
  `presets.js`); `loadOrder()` is the live show's steps, so everything that
  walks "the order" (actions, the engine, the phone's six buttons) follows
  the live show without knowing shows exist. Making a show live resets
  `order` to `{ cue: -1, off: false }`.
- **Whichever window hosts the engine owns everything live**: video, the
  phone connection, MIDI, audio, vision, recording. The output window hosts
  it when open, `/control` otherwise. Only one engine may run per browser:
  two would fight over the room code. With the output open, `/control` only
  edits state and shows what the output reports, so it can be reloaded
  mid-show.
- **Whatever fires Blink must also say when it lets go.** A blink set to
  hold lasts until `blink-end` (action `blinkEnd`): the B key sends it on
  keyup and on window blur, a trigger when it falls, a button through
  `pressBlink()`. A new way to fire Blink that sends only `blink` leaves
  a held blink thrown for good.
- **Blink is changed with `store.merge('blink', …)`,** never `setScene`:
  a scene op rebuilds the panels under the bar being dragged.
- **An effect's alpha is its own.** The footer in `common.glsl.js` writes
  `wet.a`; Motion keeps its memory there through `uPrev`. Do not put the
  `1.0` back.
- **The openings play once and never hold anything up.** The Mac's plays
  once per tab session and only on the starting screen; the phone's lies
  over screens that have already started underneath. Neither may gate the
  picture, the link or a reload mid-show.
- **Anything the engine listens for must work while it is stopped.** Guard
  new store, bus and window listeners in `engine.js` with `this.running`,
  and release new devices in `stop()`.
- **A message between the engine and the control UI goes over the bus**, not
  by direct call, so it works in both modes. A page never gets a storage
  event for its own change: `/control` calls `ui.lookChanged()` for the
  palette and dimmer.
- **A direct link must survive every signaling retry.** `PhoneLink.open()`
  tears down only PeerJS connections (`destroy({ keepDirect: true })`), and
  the phone never drops a direct link for being slow, only for being dead.
- **Do not put the Mac's addresses back into the offer**, and do not make
  the phone wait on anything before it shows its code (see above).
- **Close a PeerJS connection yourself before destroying its peer.**
  `peer.destroy()` skips every other connection (it removes them from the
  list it is looping over); `PhoneLink.destroy()` works around it.
- **State changes are ops.** Go through `store.dispatch` / `merge` /
  `patchItem` / `setScene`; both windows apply the same op. A new top-level
  state key needs a default in `defaultState()` and a line in
  `sanitizeState()`, or it is dropped on load.
- **A scene is what a preset stores**: `chain`, `mappings`, `lfos`, `macros`.
  Triggers (`actions`), tempo, network and device settings are global.
- **Nothing is ever drawn on the output** except the picture (and the idle
  hint before fullscreen). Status goes to `/control`. Nothing may cover the
  monitor on `/control` either, except the operator's own "Monitor off".
- **The phone is never tethered.** The owner rules out a cable between the
  phone and the Mac (2026-11-12): it defeats the purpose. Do not propose USB
  as the answer to a network problem.
- **Nothing may be fetched from a third party at run time.** Fonts, the
  MediaPipe runtime and models are all served from the site.
- **Keep `--ink` a plain colour.** The dimmer sets it from script
  (`palette.js`). Do not make it depend on another CSS variable: the phone's
  stylesheet defines its own `--dim`, and a loop blanks every ink colour.
  `tests/control-ui.mjs` checks the phone page is really inked.
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

- **A fresh container has no packages installed:** run `npm ci` before the
  first suite, or every suite fails at once on a missing `playwright`.
- **To run every suite,** loop over them in one background command, each
  under `timeout` with `SKIP_BUILD=1` after one build, writing a log each
  and a line per result; twenty-eight take about fifty minutes. A suite
  that fails in the full run and passes alone is not thereby innocent:
  read which check failed.
- **Write commit messages to a file** and use `git commit -F`: one with
  quotation marks in it broke the shell.
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
- **`outputStats()` in the tests reads the small readback**, which an engine
  only renders for a control page in another window. To read it on
  `/control` itself, set `engine.remoteControlSeenAt = Infinity` first.
- **To stage statuses on `/control`** (`tests/layout.mjs`), close the output,
  wait for `/control` to host, then `engine.stop()`; otherwise live status
  replaces the staged one.
- **A stop hook asks for anything uncommitted to be committed and pushed.**
  Before obeying, be sure you know where every change came from: run
  `git status` at the start of a turn, and if a change is not yours and not
  asked for in the conversation you can see, ask the owner instead of
  pushing. Every push is live.
- **Run all the suites before a push that touches `engine.js`, `remote.js`,
  `host.js` or the phone's `link.js`**, not only the ones that seem related.
  After removing code with a scripted edit, search for callers of everything
  it removed.
- **The sandbox's graphics are software** and got slower again on 22
  November. A blur that is nothing to a real GPU can starve every page
  here: time a new shader in a small output window before blaming a hang
  on logic. To tell a sandbox failure from your own, set your changes
  aside (`git stash -u`), build, run the one suite on the last commit,
  and bring them back (`git stash pop`, build again). On 22 November
  `midi-audio` crashed in its audio part and `phone` failed two room-code
  checks on the previous commit too, then passed later the same day.
- **A scratch test file** (`tests/_look.mjs` and the like) is the quick way
  to look at an effect: open `/output` at 640×360, set a chain straight
  into the store with full default params, screenshot the page. Delete it
  before committing.
- **This Chromium has no MIDI backend** (`requestMIDIAccess` never settles);
  the MIDI test stubs a device.
- Deleting a remote branch and changing repository settings are not possible
  from the cloud session.

### Things outside this repo

- The three design directions the redesign came from are on a design canvas:
  https://claude.ai/artifact/4bRZEX1Xp89CPKQF79ozx6 (private to the owner).
  Direction C, "Darkroom", was chosen. Its source is not in the repo.
- The later mock-ups (icons, running order, edit screen) are on claude.ai
  too, with their sources in `design/`; `design/README.md` has the links.
- Presets and recordings live in the owner's browser storage. Nothing here
  backs them up.

### Known rough edges

- Several alerts at once stack over the top of the page; they are compact
  and each can be closed with its ×.
- Below about 1000 px wide the top bar is tight: the phone readout is cut
  short before anything else gives way.
- The first reload after a deploy can show the previous version for a few
  seconds; `/control` warns when its version and the output's differ.
- An early screenshot showed the output at 30 fps rather than 60; it read 60
  later. Never explained (Low Power Mode is a guess).
- MP4 recording holds most of the file back until recording stops.
- One `control-ui` check ("it says what is wrong and what to try") is
  timing-dependent and occasionally fails; it passes on a rerun. So does
  "the output flashes black and white during the test" in `record-latency`.
- `offline-pair`'s "the link is lost: the Mac says so" failed in three of
  four full runs on 16 and 17 November and passed every time run alone. A
  closed phone page does not always tell the Mac it is going, and the Mac
  then only learns when Chromium gives the link up, up to half a minute
  later. The check now waits fifty seconds, not twenty. On real devices
  this means the "link to the phone was lost" alert for a phone paired
  without internet can be that slow to appear.
- In the sandbox a busy output can go quiet for two seconds, and `/control`
  then shows "not drawing" for a moment. Not seen to matter; on a real Mac
  it should only appear for a window that is really hidden.

### Never run on real hardware (all unconfirmed)

- **From the sixth session:** the Mac's starting screen with the real
  pairing code in the camera (test codes drawn the same way scanned in
  every palette), and its opening at full speed; the phone's opening, above
  all the camera picture masked to the camera's shape in Safari; the
  message on both screens when a network keeps the devices apart; the
  Motion A / B sources on a slider; which way Gravity's "down" turns; Glitch
  held by a phone trigger or a MIDI pad; the top bar's icons at the Mac's
  real size and the frame rate appearing only when low; the narrow-window
  layout in Chrome on the Mac; Bring back deleted factory presets.

- **The phone's screen as it now stands:** the upright layout, the preview's
  band matching the Mac's, Freeze with quick taps, Rotate, the three camera
  icons, messages over the status line.
- **Pair without internet, every step:** Safari answering the offer, the
  Mac's real camera reading the phone's real screen, the rebuilt answer
  being accepted between Chrome and Safari, a Mac-made network carrying it,
  the phone following the picture between windows, scanning the Mac's code
  from inside the phone page. Whether iOS still has the phone page saved
  after a week.
- **No output window:** the monitor holding 60 fps; the phone reconnecting
  when the output opens or closes, and how long it takes; a covered or
  minimised output being reported as not drawing; audio, MIDI and recording
  on `/control`.
- **From earlier sessions:** real latency against a projector (only the
  Mac's own screen so far, H.264 only); whether H.264 beats VP8 / VP9; the
  corrected Latency estimate and the stray-flash note; the dimmer on the
  iPhone; Reload both pages after a real deploy; recordings longer than a
  few seconds; MIDI map with a physical controller; fullscreen placement on
  a second display; MediaPipe on the Mac's GPU; the direction of Rotate /
  Counter-rotate. Tap tempo and offline reload have not been reported on
  either way.

### Ideas raised and not started

Step 5 of the signal loss plan (quality stepping down and up by itself, an
alert when the Mac changes network, a quiet "no internet" mark, alerts for
the second phone); making the new link before breaking the old one (plan,
scenario 4); input B's brightness as a modulation source (its motion is
done: Motion B); a network line in Before the show (a partial self-test
of the Wi-Fi); typing a glitch's landing value; a glitch for some factory
presets; a mark on the chain row for effects that take part in the glitch;
the opening with the room code in squares (prototype F2); Pair without
internet for the
second phone; picture controls on the Mac that hold across presets; saving
a Mix B added from the perform screen into the preset; a folder of the
owner's choosing for recordings; several named running orders, and steps
timed against an audio track (on hold); a local program on the Mac that
serves the pages and the pairing itself; a larger XY pad in place of the
phone's six buttons; tempo from the audio beat; a native wrapper for a
true Syphon output; a MIDI mapping for the dimmer. Not wanted: a pairing
server of the owner's own; the Mac-output preview on a phone paired
without internet.

### Input B and Mix B (built 2026-11-16)

Stage 1 of the advice on blending inputs. Stage 2 (a second iPhone) and "an
image as a control signal" are not started; see the end of this section.

- **Two slots, one set of feeds.** `InputManager` (`src/engine/inputs.js`) is
  input A itself and has `b`, a second `Slot` with its own texture. State:
  `input.kind` and `input.kindB` (`''` = off). The two are never the same
  source, because a feed's "new frame" flag is taken by whichever slot
  uploads it: the `input` and `inputB` actions make A and B trade places
  instead (`src/shared/actions.js`). Change inputs through those actions,
  never with `store.merge('input', { kind })`.
- **B is drawn only while it is on** (`Pipeline.updateSource(…, true)` into
  `srcB`), fitted and mirrored like A. Vision, the latency estimate and the
  top-bar readouts still watch A only.
- **Mix B is an ordinary effect** (`src/effects/mixb.js`) with
  `uses: { inputB: true }`: it gets `uTexB`, and the runner skips it while B
  has no picture, so A passes through. Its mix is the effect's own wet / dry
  (`mixLabel` renames the slider), which is why pinning, mapping, presets
  and Apply to all work with no new code.
- **The strip under the picture** (`perform.js`, "inputs and the mix"; the
  second version, after the owner found the first too tall, cropped and
  unable to fade in a preset without Mix B). One 54 px row: view A, the bar,
  view B, the mode button. Mock-up S3 with the mode button right of B
  (`design/mix/StripModes.dc.html`, layout R).
  - The bar moves the `mix` of `mixItem(state)` (`actions.js`): the first
    Mix B that is not bypassed. With none, the first drag adds one at the
    start of the chain (`setScene`). That is not saved into the preset: only
    the edit screen autosaves.
  - Source icons slide out beside a view on hover, focus, or a click on the
    view; `body.midi-map` shows them all. They carry `data-midi`.
  - Pointing at an icon sends `peek` on the bus; the engine then draws that
    source into the view's half of the strip (`Pipeline.drawThumb`, through
    the spare `inputs.peek` slot when neither A nor B has it). It never
    opens a device: `status.sources` says which sources have a picture, and
    the view shows the name of one that has not.
  - The small views are one 192×54 strip (A left, B right) the engine reads
    back about five times a second and sends as `thumbs`, so they work in
    both hosting modes. `Readback` in `pipeline.js` is the shared
    non-blocking readback (the monitor image uses it too).
  - **Everything that pops up from the strip opens upward**, over the
    picture: the owner's choice (16 November), and the one allowed exception
    to "nothing covers the monitor". The mode grid stays open until a click
    elsewhere or Esc.
- **Modes are a grid** on both screens: `grid: true` on the parameter makes
  `chain.js` use `choice()`; the perform grid runs the `mixMode:N` action,
  which is MIDI-mappable.
- **Not done:** a hatched "moved by modulation" band on the bar; a second
  video file; saving a Mix B added from the perform screen into the preset.

### Signal loss plan (steps 1 to 4 built, 17 to 21 November)

The plan is `design/signal-loss-plan.html`: nineteen scenarios and a build
order of five steps. Built so far, step 1, "keep what is paired":

- **A paired phone keeps its place.** Each phone page keeps an id
  (`prefs.device`) and sends it as PeerJS `metadata` on its data connection
  and its call. `PhoneLink.holdsAgainst(device)` (`remote.js`) turns away a
  different id while the paired phone has been heard from in the last
  thirty seconds (`holdMs`): the newcomer gets `{ t: 'busy', second }` and
  is closed; its page says so (`state.busy`). The same id, a page that sends
  none (an old cached phone page), and a direct link are always let in. Do
  not go back to "the newest connection wins": two phones on one code then
  push each other out in turn.
- **The room code is not changed under a phone.** `onRoomTaken` in
  `engine.js` keeps the code when a phone has paired in this browser in the
  last twelve hours (`thirdeye.pairedAt` in localStorage, shared by the
  windows), sets a notice, and leaves New room code to the operator.
- **The phone holds on to a link it could not make again.** In
  `HostLink.tick` and `isBad` (`phone/link.js`), with no pairing server
  (`canRedial` false) a silent or `disconnected` link is kept; only
  `failed` or `closed` ends it. With a server it redials as before.
- **If a source drops** (step 2). `input.dropA` (`hold`, `black`, `b` or a
  source) and `input.dropB` (`hold`, `out`), with `dropAfter` and
  `dropFade`. `Engine.dropped` counts a slot's source as gone when its feed
  has sent nothing usable for `dropAfter` seconds (a gated feed, as when
  the phone's page is hidden, counts as gone; the pattern never does; a
  newly chosen source starts its wait afresh). `updateCover` fades
  `cover.a` / `cover.b`. The pipeline draws the stand-by over input A's
  last frame in `chainSource` (through the spare `inputs.standby` slot when
  the source is not A's or B's), and scales Mix B by `ctx.bLevel`. Nothing
  is drawn or uploaded for it while nothing has dropped.
- **The band and Resume** (step 3; mock-up L1,
  https://claude.ai/artifact/VMB991eaoBVQQPhwQJ9Bak, sources in
  `design/link-down/`). `downInfo(state)` in `phone/main.js` decides what
  the band says and which button it offers; `showDown` draws it. `#down`
  sits inside `#stage` (the XY pad) and stops its own taps reaching the
  pad. `#reconnect` moved from the bar into the band: it is only there
  when a tap is needed, or after eight seconds of retrying
  (`RETRY_BUTTON_AFTER_S`). Resume: `prefs.liveAt` is refreshed every ten
  seconds while live; within five minutes of it the page opens on
  `#resume`. Tests that reload a live phone page click `#resume-go`, not
  `#start`.
- **Start screens and the checks** (step 4; mock-ups
  https://claude.ai/artifact/N87fpc4XRa3ZSzKKChNwLi, sources in
  `design/start/`: M1 as revised by the owner, P1, and the Mac's check).
  - A fresh state opens on the iPhone (`input.kind: 'phone'` in
    `defaultState`). The splash is `#splash` in the perform monitor
    (`perform.js`), shown while the input is the iPhone, none is paired and
    the input has never had a frame. The owner asked for it: with "Monitor
    off" it is the second thing allowed over the monitor. No name on it,
    by the owner's choice; the mark small above a large code.
  - The mark is `src/shared/mark.js` (inline SVG, animated by CSS). It
    repeats the shapes of `public/icon.svg`: change both when the logo is
    redrawn.
  - `src/control/check-panel.js`: Before the show, its `CHECK n` flag in
    the top bar, and the screen wake lock that keeps the Mac awake while a
    phone is paired. Its list has a fixed height so Setup does not jump.
    It cannot tell whether Chrome is blocking downloads: it only reports
    the Save to Downloads switch.
  - Phone: `runCheck` in `phone/main.js` after START (not after Resume, not
    when pairing by code). `prefs.check` switches it off; `prefs.youDay`
    keeps the two reminders to once a day.
  - **Every test but `start.mjs` begins from a used browser**: `launch()`
    in `tests/lib.mjs` seeds a saved session on the test pattern and the
    phone's check off, because the suites were written for that start.
    `launch([], { fresh: true })` gives a browser that has never opened
    the app.
- Not done from scenario 4: making the new link before breaking the old one
  when the server can be reached. The phone still drops a link after ten
  seconds of silence and dials again.

### A second iPhone (first half built 2026-11-16)

Mock-ups: https://claude.ai/artifact/Ee4tdXfFVVeuFct1gv7JH9 (P1, a tab for
each phone, was built; iPhone B is key 2). Sources in `design/phone2/`.

- **The second phone is another room.** It pairs under `roomB(room)`
  (`net.js`): the room code with a B after it, shown as `PSAQ2-B`. To the
  phone it is simply a room, so its page, its reconnecting and its typed
  code needed no changes. The only thing it is told is `second: true` in
  the `config` message, to label itself PHONE B.
- **Two `PhoneLink`s in the engine** (`link`, `linkB`, both in `links`),
  each with its own feed (`feeds.phone`, `feeds.phone2`) and its own
  `PhoneSensors` (`sensors`, `sensorsB` with tag `B`: sources `phoneB.*`,
  `padB.*`, lazy so they are listed once the phone reports). Neither link
  knows of the other. `linkB` is only open while `net.second` is on
  (`Engine.refreshLinks`); opening the iPhone B tab turns it on, Stop using
  iPhone B turns it off.
- **Triggers are shared**: `PhoneSensors` no longer writes `trig.N`; the
  engine ORs the two phones' `shown` each frame. So a press on one phone
  while the same button is down on the other is not a second press. Presets, labels, look and
  config go to both (`sendPhones`). The Mac-output preview runs while
  either phone asks (`link.wantsPreview`).
- **`phone2` is a fifth source**, second in `INPUT_KINDS`, so the keys moved:
  1 iPhone, 2 iPhone B, 3 camera, 4 pattern, 5 file. Each phone's Rotate
  turns its own frames (`inputs.turns`). Vision, the latency estimate and
  uPhone still follow input A and the first phone.
- **When the picture moves between windows** both links shut down and open
  again in the other window; each phone finds the Mac again by itself
  through the pairing server.
- **Not built (the second half):** Pair without internet for the second
  phone (`pair-offer` / `pair-answer` / `intro` on the bus, `keepSpare` in
  `host.js` and `offline-pair.js` all speak of one phone: give them a
  `phone` field and use `linkB`); alerts for the second phone going silent
  or into the background (only its readout says so); the Setup → Phone
  panel, which shows the first phone only.

Still to come:

- **An image as a control signal** (the owner said yes): B's brightness or
  motion, whole or by region, as modulation sources.

### Prompt to start a new session

Paste this as the first message. Replace the bracketed part of the last
paragraph with what you found on the devices, or delete it. Change the task it names when that one is done.

```
You are picking up Third Eye Cam (repo ACTS-Research/third-eye, branch main):
a live video instrument that runs in the browser. An iPhone's camera streams
over WebRTC into a WebGL2 effects chain on a Mac, which shows the result on
its own page or on a second display.

Switch to main first (git checkout -B main origin/main) and run npm ci.
Read CLAUDE.md, then HANDOFF.md, then README.md before doing anything. The
handoff says where things stand, what has not yet been tried on the real
iPhone and Mac, the decisions that are mine to make, the rules that are easy
to break, and how to work in the cloud sandbox (it is slow: read that part
before trusting or distrusting a failing test).

How I work:
- Before writing code, tell me in a few lines how you will do it and what
  will change for me, and wait for my go. A small change I have asked for
  outright can simply be done.
- For anything that changes how a screen looks or works, show me mock-ups
  first (two or three options on a design canvas) and let me choose. For
  anything that moves, make the mock-up play.
- When I ask you to "consider and advise", give me your recommendation and
  wait; do not build.
- Work on main and push to main. After each push, check that the "Build and
  deploy to GitHub Pages" run succeeded.
- Run the test suites that cover what you change (one at a time, or in the
  background), and all of them before a push that touches engine.js,
  remote.js, host.js or the phone's link.js. Do not push until they pass,
  or until you have shown that a failure also happens on the commit before.
  A hook will keep asking you to push uncommitted work: hold it until then.
- Tell me plainly what you could not verify on real hardware. You cannot
  reach the deployed site, the public pairing server or my devices.
- Write to me in plain language, short, with what I need to do or decide
  first.
- When I say "wrap up", follow CLAUDE.md.

Start by telling me, in a few lines, where things stand and what is waiting
on me (from the top of HANDOFF.md). Then:

This session: MIDI mappings per show, as decided in HANDOFF.md ("MIDI
per show"). Tell me your approach first and wait for my go.
<Add what you found on the real iPhone and Mac: the code in the starting
screen's camera and the two openings; pairing on campus or venue Wi-Fi;
a Motion source on a slider; which way Gravity pours; Scan at 300 lines;
shows and the backup folder; the new keys. And what you decided after the
side session's report on a desktop macOS version.>
```
