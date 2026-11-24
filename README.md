# Third Eye Cam

A live video instrument. An iPhone streams its camera over WebRTC to a Mac
running Chrome, where a WebGL2 effects chain processes it. The picture shows
on the control page itself, and, when you open the output window, fullscreen
on a second display (projector or TV). The phone is also the controller: its
motion sensors, an XY pad and four trigger buttons modulate the effects.

Built for live performance: once the output window is open it keeps rendering
whatever else fails, and every failure is reported on the operator's screen
only.

```
 iPhone Safari (/phone)                     Mac Chrome
 ┌──────────────────────┐    WebRTC     ┌──────────────────────────────┐
 │ camera ──────────────┼──── video ───▶│ the engine                   │
 │ tilt, shake, XY pad, │               │   input → effects → picture  │
 │ triggers ────────────┼─ data 60 Hz ─▶│                              │
 └──────────────────────┘               │ runs in /output while an     │
                                        │ output window is open        │
                                        │   (second display)           │
                                        │        ▲ BroadcastChannel    │
                                        │ otherwise in /control        │
                                        │   (laptop screen: chain,     │
                                        │   mappings, presets, monitor)│
                                        └──────────────────────────────┘
```

One engine runs per browser. It does everything live: the render loop, the
phone link, MIDI, audio, vision and recording. With no output window it runs
in `/control` and the monitor there is the picture. Opening the output window
moves it there; closing that window moves it back.

## Contents

- [Setup](#setup)
- [Running a show](#running-a-show)
- [Pairing the phone](#pairing-the-phone)
- [Pairing without internet](#pairing-without-internet)
- [Show networking](#show-networking)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Inputs](#inputs)
- [Effects](#effects)
- [Modulation, triggers and presets](#modulation-triggers-and-presets)
- [MIDI, audio and vision](#midi-audio-and-vision)
- [What happens when things go wrong](#what-happens-when-things-go-wrong)
- [Writing your own shader](#writing-your-own-shader)
- [Recording](#recording)
- [Latency](#latency)
- [Sending the output to other software](#sending-the-output-to-other-software-syphon-ndi)
- [Icon](#icon)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [Self-hosting the signaling server](#self-hosting-the-signaling-server)
- [Tests](#tests)
- [What has and has not been verified](#what-has-and-has-not-been-verified)

## Setup

Requirements: Node 20.11 or newer, Chrome on the Mac, Safari on the iPhone
(iOS 16.4 or newer for the screen wake lock).

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5173/control/>. The first run downloads the
MediaPipe models (about 42 MB) into `public/models/`; later runs reuse them.

The phone page needs **HTTPS** (iOS will not give a camera or motion sensors
to a plain-HTTP page), so for anything involving the phone use either:

- the deployed site (see [Deploying to GitHub Pages](#deploying-to-github-pages)), or
- a local HTTPS dev server reachable from the phone:

  ```bash
  npm run dev:https
  ```

  Open `https://<the Mac's IP>:5173/control/` on the Mac and accept the
  self-signed certificate warning there, and again on the phone the first
  time it opens the pairing link.

Other commands:

```bash
npm run build
```

```bash
npm run preview
```

## Running a show

`/control` has three screens, switched at the top right:

| Screen | For |
| --- | --- |
| **Perform** | The show: panic buttons, the monitor, the inputs and the mix bar under it, eight faders for the live preset, and the strip of presets and the running order |
| **Edit** | One preset. At the left the picture, with the effects chain as a row of buttons under it and the faders as the perform screen will show them. At the right five tabs: **Parameters** (the open effect's controls), **Faders**, **Modulation**, **LFOs** and **Glitch** |
| **Setup** | Everything done once beforehand: output window, inputs, pairing, MIDI, audio, vision, triggers, preset files. Each panel folds on a click of its title and stays as you left it; a browser that has never opened the app starts with only **Before the show** and **Phone** open |

1. On the Mac open `/control` in Chrome. That is enough to play: the picture
   runs on the page and the monitor on the Perform screen shows it live. The
   top bar reads `Output off`.
2. Pair the phone ([below](#pairing-the-phone)) and press `1` to select it.
3. Click a preset on the strip, or **Edit** one.
4. For a projector or second screen, open the output window: click `Output
   off` in the top bar, or **Setup → Output → Open output window**. Under
   **Setup → Output**, **Find displays** lets you pick the projector first, so
   the window opens on it. Click the window once (or press `F`) to go
   fullscreen. Without the permission, drag the window to the projector
   yourself and press `F`.

**Open the output window before the show, not during it.** Opening or closing
it moves the picture between the two windows: the phone reconnects by itself
in a few seconds (it needs the pairing server for that), and a recording in
progress stops.

The two readouts at the top left are also buttons, each with its own job:
the output readout opens the output window, and the phone readout shows the
QR code and the connection steps. Under the picture on the perform screen
is one slim strip: a small live view of input A, the mix bar, a small live
view of input B, and the mode of the mix (see [Inputs](#inputs)). Point at a
view and a line above the strip says which source it is and what it is doing
(`A · iPhone · live`, `B · off`), and its four source icons slide out beside
it: iPhone, iPhone B, local camera, test pattern, video file (and, for B,
Off). Point at an icon to see
that source in the small view without choosing it (a source that is not
running shows its name instead); click to choose it. Choosing **Video file** with no file loaded opens the file picker
straight away (the same picker as **Setup → Input → Load video file…**).
Everything that pops up from the strip opens upward, over the picture, for
that moment only; none of it is ever on the output or in a recording.

The top bar reads left to right: what is happening (the output, the
phone, a `CHECK` flag when something needs a look), then where you are
(**Perform**, **Edit**, **Setup**), then two tools as icons (the five-pin
socket is **MIDI map**, the half-filled disc is colour and the dimmer), and
**REC** alone in the corner. While recording, REC's ring fills, the button
blinks and it shows the time. The output readout says only `Output off` or
`Output on` while all is well; the frame rate joins it when it is low
(`Output on · 38 fps`) and for the first seconds of a recording. The exact
figure is always under **Setup → Status**.

The half-filled disc at the top right opens the interface palettes (red, amber,
bone, lime, ice, magenta). All are a single ink on black so the laptop does
not light the stage. The **Dim** strip under them turns the whole page down,
from full to a quarter of the light: drag it, use the arrow keys, or
double-click for full. The phone opens in the same palette and dimmer, and
follows any change while it is paired.

The output window shows only the picture. A small "click for fullscreen" hint
appears while it is windowed and fades after four seconds; nothing is ever
drawn over the picture in fullscreen.

While the output window is open, `/control` is only a remote control. You
can reload or even close it during a show; `/output` keeps running with the
current state and a reopened `/control` picks that state up. If `/output`
itself is reloaded it restores the last state from local storage and the phone
reconnects by itself; `/control` waits for it rather than taking the picture
over in between.

With no output window, `/control` is the show: reloading it restarts the
picture and the phone reconnects, and a `/control` tab that is minimised or
hidden behind another tab stops drawing.

Keep the output window visible. Chrome stops drawing windows that are
minimised or completely covered; `/control` then says the output is not
drawing.

Two `/control` tabs can be open at once. Only one hosts the picture; the
other shows a small copy of it.

## Pairing the phone

**Starting up.** A browser that has never opened the app opens the control
page on the iPhone input, and until a phone pairs the place where the
picture will be shows the camera of the mark, solid in the interface's
colour, with the pairing code inside it; under it what to do, the room
code, a line on how far pairing has got, and three ways on without a phone
(the Mac camera, the test pattern, a video file). The code is dark squares
on the interface's colour, not black on white: it puts no white block on a
dark stage, follows the palette and the dimmer, and scans in all six
palettes down to the dimmest setting (tried with an iPhone's Camera app on
23 November 2026). The plain black-and-white code is still behind the
phone readout. When a session starts, the screen opens with a short
animation (under three seconds): the mark with its eye shut, the eye
opening, a blink on which the camera turns solid, noise in the code's own
squares, and the noise settling into the code. It plays once per session;
after a lost link, a new room code or a reload the code is simply there.
Anyone who has asked their system for less motion gets the code at once. It gives way to the picture when a phone pairs, and is only ever on
the control page: never on the output, never in a recording. (After that the
page opens on whichever input you last used.)

**Before the show.** **Setup → Before the show** lists what the page can
check: that the Mac will stay awake (the page asks Chrome to keep it awake
while a phone is paired), the phone's link, the frame rate, whether a
stand-by is set for a dropped phone, and whether recordings save by
themselves. A line reads `OK`, or `CHECK` with what to do and a button that
goes there, or `YOU` for what the page cannot see. A `CHECK n` flag in the
top bar counts the lines that need a look.

On the phone, **START** is followed by the same kind of check: camera,
motion, the link to the Mac, and whether iOS will keep the screen awake
(it will not in Low Power Mode). If every line passes it goes to the live
screen by itself; if one reads `CHECK`, or on the first run of the day (when
it reminds you to silence calls and keep Safari in front), it waits for **GO
LIVE**. It can be switched off in the phone's camera settings (**Check
before the show**), and Resume skips it.

1. **Setup → Phone** on `/control` shows a QR code and a five-character room
   code. (So does a click on the phone status in the top bar.) The output
   window does not need to be open.
2. Point the iPhone's camera app at the QR code and open the link in Safari,
   or open `/phone` by hand and type the room code.
3. Tap **START**. iOS asks for the camera, then for motion and orientation
   access. Allow both. The mark then blinks, turns solid and fills with
   noise while the camera and the link come up, and the noise clears to
   what the camera sees, in the camera's shape, before the live screen
   takes over (between about one and four seconds; not after **RESUME**,
   and not for anyone who has asked their phone for less motion).
4. The phone shows `LIVE — streaming to Mac`; `/control` shows
   `Phone: streaming`.

If it does not get that far, click the phone status in the top bar of
`/control`. (Opened to pair a phone, the pop-over closes by itself a moment
after the phone has paired; opened with a phone already paired, it stays.)
The pop-over shows the QR code and room code again, and lists the
connection as five steps (picture running, pairing server reached, phone
found, video link, picture arriving) with the one it is stuck at marked. It also has
**Restart output** and **New room code**.

**When the Mac is not receiving.** A band appears along the foot of the
phone's preview, the preview goes grey and the edge of the screen pulses.
The band says what is wrong in large letters (`MAC NOT ANSWERING`, `NO
NETWORK`, `MAC NOT FOUND`, `CAMERA STOPPED`, `NO VIDEO LINK`), then whether
the phone is getting itself back (`Retrying by itself · 12 s`) or what you
must do, and shows a button only when a tap is needed: **Scan code** when
the Mac must be scanned again, **Try again** for the camera, and
**Reconnect** once retrying has gone on for eight seconds. The triggers,
presets and zoom do not move, and the camera stays in view so the shot can
be kept framed.

**Reopening the page mid-show.** If the phone's page was live in the last
five minutes and is reloaded or reopened, it opens on one screen-sized
**RESUME** button: one tap carries on in the same room with the same camera
and settings. (iOS requires a tap before a page may read the motion
sensors.) **Another room…** gives the ordinary start screen, as does a
pairing link for a different room.

**A paired phone keeps its place.** If another phone scans the same code
while one is paired and answering, the newcomer is turned away ("This Mac
already has an iPhone", with a pointer to the iPhone B code when that is
on) and the paired phone never notices. The paired phone itself may redial
or reload at any time: its place is kept through the moment its link is
closed. Another phone can only take the place once the paired one has been
silent for thirty seconds (so when you swap phones on purpose, the new one
may wait up to that long, or press **New room code**). Likewise the room code is
never changed under a phone: if the code reads as in use somewhere else
after a phone has paired on it (in the last twelve hours, in this browser),
the Mac keeps trying it and says so, and **New room code** is yours to
press. And a phone that cannot reach the pairing server holds on to the
link it has, even a silent one, rather than drop it and be left with no way
to dial again.

**A second iPhone.** The pop-over has a tab for each phone: two clicks from
anywhere (the phone readout, then the **iPhone B** tab). Scan the code on
that tab with the second phone (or type its room code, the first phone's
with a B after it: `PSAQ2-B`). Opening the tab switches the second phone on
so its code can be scanned at once; if none has paired when the pop-over
closes, it is switched off again, so a look at the tab leaves nothing
behind. Once a second phone has paired it stays on until **Stop using
iPhone B**. Each phone has its own connection, so one dropping or
reconnecting does not disturb the other. There is one phone readout in the
top bar: with two phones in use it names both (`Phones: A live · B live`),
and a click opens the pop-over at whichever needs a look. The second
phone's picture is the source **iPhone B** (key `2`): choose it for input A
or B like any other, so the two phones can be mixed with **Mix B**. Its
screen is the same as the first phone's, marked `PHONE B`; its preset
buttons and its four triggers do what the first phone's do, and its tilt,
motion and touch pad are modulation sources of their own (**Phone B**,
**Touch B**), listed once it has paired. Pair without internet is not yet
available for the second phone. Two 720p · 60 streams need about 10 Mbit/s
between the phones and the Mac; on the first iPhone's Personal Hotspot the
second phone's video goes through the first phone's radio, so try 720p · 30
on it there.

The picture the Mac shows is always horizontal, and so is the preview on the
phone. The page lays itself out for how the phone is held:

- **On its side:** the preview on the left, as large as it will go; beside it
  the triggers, six presets and three camera icons; zoom down the right edge.
- **Upright:** the preview across the top; under it the six presets (1 2 / 3 4
  / 5 6) with the camera icons, the triggers stacked beside them, and zoom on
  the right.

Held upright, the iPhone's camera frames are upright too. Nothing is laid on
its side: the Mac fills its horizontal picture from the middle band of the
frame (with **Fill**, the default under Setup → Input), the world stays the
right way up, and the preview shows that same band. Hold the phone on its side
to use the whole sensor.

| On the screen | What it does |
| --- | --- |
| The preview | The picture the Mac shows. It is also the XY pad: a finger on the picture moves the dot, giving two modulation sources plus "pad touched" |
| Triggers | Labelled with whatever action they are bound to. **Freeze** is a switch, as on the control page: tap to freeze, tap again to release, and the button stays lit meanwhile. A trigger bound to previous or next preset is left out: the preset buttons do that job |
| The six buttons | With a running order on the Mac, its steps: the live one lit, the one Next would load dashed. A show of more than six steps moves through the buttons as it goes: they show the step before the live one, the live one (second button) and the four after it, each with its own step number, so the next step is always the third button. Without a running order, the first six presets, the live one lit; later presets are loaded from the Mac. Tap to load one |
| The three icons | Flip between the front and rear camera; torch; lock the white balance. Torch and the lock are dimmed when the camera in use does not offer them (the front camera has no torch), so the row never changes shape |
| Zoom | The bare bar down the right, when the camera offers zoom |
| Rotate (the circling arrow, top right) | Turns the picture a quarter turn, on the Mac and in the preview, each time it is pressed |
| Camera (top right) | Opens the settings panel: Quality (360p / 720p / 1080p at 30 or 60 fps, default 720p · 60), Camera on / off, **Preview: camera / Mac output**, any exposure and focus controls the camera reports (an iPhone in Safari reports none, and the panel says so), and **Scan the Mac's code** |
| Preview: Mac output | The preview shows the Mac's finished picture instead of the camera: effects, Freeze and Blackout as the audience sees them. The Mac sends it back small (480 pixels wide, 15 pictures a second, at most 500 kbit/s) on the video call the phone already has, and only while a phone asks for it. It runs a moment behind the camera, because the picture has been to the Mac and back. It needs the camera on, and is not available on a phone paired without internet; the preview then shows the camera and the panel says why. The setting is remembered |
| **Reconnect** | In the band at the foot of the preview (see "When the Mac is not receiving"), once the phone has been retrying for eight seconds. It redials. It reads **Scan code** instead when the phone was paired by code, or when no Mac is found under the phone's room code (the code may have changed): it then reads a code on the Mac's screen through the camera, without leaving the page. Either code works: the ordinary pairing code (click **Phone** in the Mac's top bar) or the one from Pair without internet. While it is reading, the instruction lies along the foot of the preview and the status line stays readable; it stops by itself if the link comes back |
| By itself | The phone redials whenever the link drops, and also when the Mac has said nothing for ten seconds, whatever the browser reports about the connection. After a Mac reload it is back in a few seconds with no tap |

A message (a camera that refused a setting, a screen that will not stay awake)
lies over the top line for a few seconds and goes; it never takes room from
the preview. Tap it to dismiss it sooner.

Camera off means controller only: sensors and touch keep working and the
output holds the last frame.

**Coming back.** The phone remembers the last room it joined, so opening
the phone page again (from a bookmark, or the Home Screen) fills the room
code in; tap START. There is no need to scan the QR code again unless the
room code has changed.

Tick **Controller only** before START to join without ever opening the camera.

Keep Safari in front. iOS stops the camera when the page goes to the
background; when it comes back the phone shows a full-screen red warning and
restarts the stream, and `/control` shows an alert for as long as the page is
hidden. The page requests a screen wake lock; if that fails it says so, and
you should set Auto-Lock to Never.

## Pairing without internet

Normal pairing sends a small handshake through a pairing server on the
internet. When that server cannot be reached (no signal, a network that
blocks it), pair by QR code in both directions instead. Nothing leaves the
room; the phone and the Mac only have to be on the same local network.

1. Put both on one network. The easiest is the iPhone's Personal Hotspot,
   joined from the Mac. Leave mobile data on: turning it off switches the
   hotspot off too. The hotspot only has to exist; it does not matter how
   weak the signal is. The alternative is a closed network made by the Mac
   (see below). The same hint is on the **How?** tooltip in the dialog.
2. On `/control`, click **Pair without internet** (under the QR code in
   **Setup → Phone**, or in the pop-over behind the phone readout). The Mac's
   camera switches on; allow it the first time.
3. Scan the large code with the iPhone's camera, open the link and tap
   **START**. The phone now shows a code of its own.
4. Hold the phone up to the camera above the Mac's screen until it is read.
   The dialog closes by itself and the phone shows `LIVE`.

This works whether or not the internet is there, so it can be tried on a
working hotspot. A phone opened from this code waits for the Mac to read its
code even if the pairing server happens to be reachable; **Hide the code** on
the phone gives up and lets normal pairing take over.

After that everything is the same as with normal pairing, including opening
and closing the output window: the window that has the phone introduces the
other one to it, so no code is scanned again.

**A closed network from the Mac.** Apple removed "Create Network…" from the
Wi-Fi menu; Internet Sharing is what is left, and despite its name it can
make a Wi-Fi network with no internet behind it:

1. **System Settings → General → Sharing → Internet Sharing** (click the ⓘ).
2. Set **Share your connection from** to anything other than Wi-Fi, for
   example Thunderbolt Bridge with nothing plugged in. While Wi-Fi is the
   source it is not offered as a destination.
3. Under **To devices using**, switch on **Wi-Fi**. **Wi-Fi Options…** sets
   the network's name and password.
4. Turn **Internet Sharing** on and join that network from the iPhone. The
   phone will say it has no internet; that is expected.

The Mac's Wi-Fi is then busy being the network, so the Mac is offline until
you turn Internet Sharing off again. A small travel router does the same job
without tying up the Mac.

**Pairing by code again** does not need the Camera app: on the phone, tap
**Scan code** in the top line (or **Camera → Scan the Mac's code**) and point
it at the code on the Mac. The phone reads it through the camera it already
has open.

What is different:

- **If the link is lost completely** (the phone left the network, Safari was
  closed), nothing can rebuild it by itself. `/control` says so, with **Pair
  without internet** on the strip; scan both ways again. A short dropout
  recovers by itself.
- **The phone needs its saved copy of the page**, since it cannot download
  it. Open the phone page once while online beforehand; its start screen then
  reads "Saved on this phone". iOS can discard that copy after about a week
  without use.
- **The codec is fixed when you pair.** Changing **Codec** afterwards takes
  effect at the next pairing.
- **The Mac reads the phone's code with its camera**, using Chrome's own
  barcode reader where there is one and the bundled
  [jsQR](https://github.com/cozmo/jsQR) library (Apache-2.0) otherwise.

## Show networking

Only the handshake goes through a server (the public PeerJS cloud by
default). Video and sensor data go **directly** between the phone and the Mac.
No TURN relay is configured on purpose: if the two devices cannot reach each
other directly, pairing fails visibly rather than silently routing your show
through the internet. `/control` shows the route (`direct (LAN)`), round-trip
time, bitrate and jitter buffer under **Status**.

The phone is meant to move freely, so the link is wireless. With no usable
internet at all, the same networks work with
[Pair without internet](#pairing-without-internet). Recommended, in order:

1. **iPhone Personal Hotspot over Wi-Fi.** The Mac joins the phone's hotspot.
   On the iPhone, leave Wi-Fi on (the hotspot uses it), turn **Auto-Join**
   off for the venue's network so the phone does not hop onto it, switch on
   **Settings → Personal Hotspot → Allow Others to Join**, and keep that
   screen open until the Mac has joined. Once it has, the phone uses mobile
   data for its own internet by itself. Leave "Maximize Compatibility" off so
   the hotspot uses 5 GHz. This works even where the venue Wi-Fi does not: at
   a coffee shop, the Mac on the hotspot and the same iPhone paired and
   streamed. Check a website loads on the Mac before opening `/control`.
2. **Your own router.** A small travel router on a clear 5 GHz channel, placed
   near the stage, with only the phone and the Mac on it. It needs an internet
   uplink for the handshake unless you
   [self-host signaling](#self-hosting-the-signaling-server).

A USB cable between the phone and the Mac (Personal Hotspot, **USB Only**)
also works and is immune to the room's radio traffic, but it tethers the
phone; keep it for testing at a desk.

**Avoid venue Wi-Fi.** Guest networks usually isolate clients from each other
(pairing then cannot work at all; both screens say so when it happens, and
the starting screen says it up front), sit behind captive portals, and get
congested the moment the audience arrives.

After one visit online, both Mac pages and the phone page reload with no
internet at all: the site is stored in the browser (**Setup → Status →
Offline** says `ready`). MediaPipe models are the exception; each is stored
the first time its feature is switched on, so turn on the ones you plan to use
once before the show.

Once the phone is paired and the pages are loaded, the internet can go away:
the stream continues without the signaling server. The server is needed again
only to *re*-pair after the peer-to-peer link itself has broken, so load
everything and pair before doors open. All code, the MediaPipe runtime and its
models are served from the site itself; nothing is fetched from a CDN.

For the lowest latency: use 720p · 60 (the default), keep the phone close to
the access point, and close other tabs on the Mac.

## Keyboard shortcuts

They work in both `/control` and `/output` (not while typing in a text field).

| Key | Action |
| --- | --- |
| `B` | Blackout (panic). Press again to return |
| `Space` | Freeze frame: holds the current input frame; effects keep running on it |
| `X` | Bypass all effects |
| `G` | Glitch: throws the sliders the live preset has chosen and lets them come back; with none chosen, tears the picture for a moment |
| `]` or `→` | Next step of the running order, with crossfade; next preset when there is no running order |
| `[` or `←` | Previous step, or previous preset |
| `1` | Input: iPhone |
| `2` | Input: iPhone B (the second iPhone) |
| `3` | Input: local camera |
| `4` | Input: test pattern |
| `5` | Input: video file |
| `Shift` + `1`–`5` | The same five sources, for input B |
| `R` | Record the output on / off |
| `T` | Tap tempo |
| `I` | Cycle to the next input |
| `E` | Edit screen on / off (in the control window) |
| `M` | MIDI map mode on / off (in the control window); `Esc` also leaves it |
| `F` | Fullscreen on / off (in the output window) |

## Inputs

There are five sources and two inputs. **Input A** is what the effects
chain starts from, and what face, hand and person tracking watch. **Input
B** is a second picture that the **Mix B** effect mixes in; it is off until
you choose a source for it. Both are chosen from the icons beside the small
views under the picture on the perform screen (or `1`–`5` for A, `Shift` +
`1`–`5` for B)
and configured under **Setup → Input**. They can be switched live; while a
newly chosen source has no frame yet, the previous picture stays up.

A and B never show the same source: ask one for the source the other has
and they trade places. So one iPhone, and the one video file, can feed A or
B, not both.

**Mixing.** The bar between the two small views mixes B in, in any preset.
It belongs to an effect in the chain, **Mix B**: if the preset has none, the
first drag of the bar adds one, a plain fade in front of every other effect
(to keep it in the preset, open Edit, or save a new preset). Its **mix** is
how much of B comes in: drag the bar, pin it as a fader, map it to MIDI, or
have tilt, an LFO or the audio level move it like any other slider. The
button at the right of the strip names the **mode** and opens all nine as a
grid; the grid stays open while you try them, and closes on a click
elsewhere or `Esc`. The same grid is in Mix B's panel under Edit. Effects
before Mix B in the chain treat A alone; effects after it treat the mixed
picture, so drag Mix B along the chain under Edit to choose. **Apply to**
limits the mix to the person or to the background. With B off, Mix B passes
A through.

| Mode | What it does |
| --- | --- |
| Fade | A plain crossfade from A to B |
| Add, Screen, Multiply, Difference | The two pictures combined, as in a video mixer or a paint program |
| Bright key | B shows where B is brighter than **level**; **softness** blurs the edge |
| Colour key | B shows except where it is the **key colour** (0.33 is green); **level** is how far from that colour still counts |
| Wipe | An edge across the picture at **level**, turned by **angle**: B on one side, A on the other |
| B pushes A | B is not seen: its brightness pushes A's pixels along **angle**, as far as **level** |

The sources:

- **iPhone** — the WebRTC stream. Primary input.
- **iPhone B** — a second iPhone, paired from its own tab (see
  [Pairing the phone](#pairing-the-phone)).

- **Local camera** — any camera Chrome can see. Click **Find cameras** once
  to grant permission and list them. An iPhone used through Continuity Camera
  appears here under its own name: a cable-free backup that needs no pairing.
- **Test pattern** — generated on the GPU; needs nothing.
- **Video file** — **Load video file…** picks a local file, which loops. It is
  held in memory, so pick it again after restarting the browser.

**Fill / Fit / Stretch** and **Mirror** apply to every video input.

**If a source drops.** A phone can lose its link, and iOS stops its camera
whenever Safari leaves the front. Under **Setup → Input → If a source
drops** you choose what the picture does by itself when that happens,
because the phone cannot tell the Mac anything over a link that is down:

- **Input A:** hold its last frame (the default, and what always happened
  before), fade to black, fade to input B, or fade to another source (the
  test pattern, the video file, the Mac camera, the other iPhone). Effects
  keep running on whatever stands in.
- **Input B:** hold its last frame, or ease B out of the mix so the picture
  is A alone.
- **Wait** is how long the source must be gone first (3 s to start with), and
  **Fade** how long the change takes. When the source sends again the
  picture fades back by itself.

An alert on the control page says which source stopped. A stand-by source
must already be running to show a picture: the video file loaded, the other
phone paired. A source that has none gives black.

## Effects

The chain belongs to a preset and is edited on the **Edit** screen. It is an
ordered list. Each effect can be added, removed, moved,
bypassed, and blended with its input (**wet / dry**). Click an effect's name
to fold its card.

| Effect | Notes |
| --- | --- |
| Video Feedback | Zoom / rotate / shift / decay of its own previous output; four blend modes. Each runs from nothing at all to violent: zoom from half to double on every frame, rotate up to a quarter turn a frame, decay from none to never fading |
| Trails | Lighten, smear, add or darken persistence |
| Time | Each point of the picture looks some way into the past. **reach** is how far back the oldest picture is, from 1 to 8 seconds (256 past pictures, a little softer than the live one). **delay** is how far back every point looks at least, **spread** how much further back the driver sends it (to the left: the other way round). **driven by** chooses what decides (see below); with **Itself**, **shape** does: the whole frame at once, down, across, from the centre, or the picture's own brightness (slit-scan). (Called Time Delay / Slit-scan before 24 November 2026; presets that used it look as they did) |
| Scan | The picture as scan lines, each lifted into relief by what drives it (to start with, its own brightness), like a landscape seen from the front: a nearer line that rises hides the ones behind. **lines** is how many, **lift** how high (to the left, pushed down), **thickness** of the gap between two lines; **between** fills the gaps with black, the picture dimmed, or the picture; **colour** is the picture's own or white; **direction** runs the lines across or down |
| Kaleidoscope / Mirror | Segments, spin, or plain left/right, top/bottom and quad mirrors |
| Rotate / Counter-rotate | Follows the phone's roll: `follow` 1 keeps the horizon level, -1 doubles the roll |
| Pixel Displacement | Driven by noise, or by the picture's own brightness or colour |
| RGB Offset | Linear or radial channel split |
| Edge Glow | Sobel edges with a halo, tint and direction-based rainbow |
| Posterize | Levels, gamma, dither, pixelate |
| False Colour / Thermal | Five palettes, banding, cycling |
| Tone | Brightness, contrast and colour in one place. **exposure** runs from an eighth of the light to eight times. **contrast** leaves the picture alone mid-slider; to the left it flattens to grey and then turns over into a negative. **saturation** and **hue** as usual. The **tint** gives the dark parts one colour (**shadows**) and the bright parts another (**highlights**), each chosen on a bar of the colour circle; **tint** is how much of the picture's own colour they replace. (This replaced Contrast / Brightness and Hue Shift on 22 November 2026; a saved preset that used either now has Tone, set to match) |
| Blur / Glow | One wide blur, used three ways. **size** runs from a pixel or two to a third of the picture. **soften** to the right gives the picture over to the blur; to the left it sharpens, and at the far left haloes. **glow** adds the blurred highlights back over the picture. **stretch** turns the blur into a streak along **angle** |
| Noise | Video static that takes the picture over speck by speck: **amount** from a little grain to nothing but static, **grain** from single pixels to large blocks, **speed** from frozen to changing every frame, **colour** from black-and-white to coloured, and **bite** for where it eats first (right: the bright parts; left: the dark) |
| Motion | Shows only what moves, or only what is still (**show**). **sensitivity** is how little movement counts, **softness** the edge, **memory** how long a point that moved goes on counting. **rest** is what fills the remainder: black, the picture as it last was there (so movement paints the picture in, or, showing what is still, people who move never appear), or the picture dimmed. **movement of** chooses whose movement decides: input A's or input B's |
| Gravity | The picture keeps what it showed and lets it fall. **pull** is how fast; "down" is real down when a phone is paired (roll the phone and it pours the other way; point it at the floor and it stops), turned by **angle**, and the foot of the picture when none is. **drag** lets movement in the picture carry it along, **hold** is how long what has fallen stays, **spread** widens it as it goes, and **blend** chooses what falls: everything (Pour), the bright parts, or the dark parts |
| Mix B | Mixes input B in: nine modes (see [Inputs](#inputs)) |

**Driven by.** Time and Scan have a **driven by** menu: what decides how
much they do at each point. **Itself** is the effect's own choice (Time's
shape, Scan's brightness). **Input B** is input B's brightness: where B is
bright, Time looks further back and Scan's lines rise (with B off, nothing
is driven). **Motion** is movement in input A: whatever moves runs late in
Time and leaves a wake, and lifts Scan's lines. **The body** is the person:
the segmentation mask, softened and eased so that a slow model does not
make the picture step. Choosing it switches segmentation on by itself while
the preset is live (Setup → Vision then reads "on for the body"), and off
again about ten seconds after no live effect uses it; switched on in Setup,
it stays on. The body needs a camera picture: on the test pattern there is
nobody.

Motion and Gravity read the **motion map**: a small picture of where the
input is moving, made by comparing each frame with the one before. It is
made once a frame however many effects read it, and not at all in a preset
that does not use it. It sees change, not objects: a light switched on
counts as movement, and so does the whole picture when the camera moves.

**Apply to** (on every effect) limits it to the person or to the background.
That needs **Segmentation** switched on under Setup → Vision.

**Editing the chain.** Under the picture on the Edit screen the chain reads
left to right: each effect, then **+ Add effect**. Click an effect
to open its controls on the **Parameters** tab; drag its button to move it
(or use ← → beside its name), and **Bypass** or **✕** there to skip or remove
it. The number on an effect's button is also its switch: click the number to
bypass the effect without opening it, and again to bring it back; a bypassed
effect is drawn dashed, with "bypassed" under its name. While you edit, anything
you have changed since opening the screen is marked: a dot by the slider's
name and a mark on its bar where the value was, and **Revert** shows how many
sliders it would put back (`Revert 3`). A slider that something moves shows where it is
at this moment as a hatched band on its bar, as the perform faders do.
Each slider is a bar: click or drag to set it, type an exact number in
the box beside it, double-click to return to the default. Many bars are
curved so that the whole of their travel is useful: fine around the value
where little happens (the middle, for a control that goes both ways) and
extreme at the ends. Faders, MIDI knobs and modulation follow the same
curve, so a source sweeps a control the way a hand on the bar would. The
number beside the bar is always the real value. The two buttons on
a slider's row are **Fader**, which puts it on the perform screen, and
**Mod**, which has something move it by itself (both below).

The picture is rendered at the output window's pixel size and follows resizes
and display scaling. **Setup → Output → Full res / 75% / 50%** lowers the internal
resolution if the GPU is struggling.

## Modulation, triggers and presets

**Sources.** Every external signal is a number, either 0..1 or -1..1:

| Group | Sources |
| --- | --- |
| Phone | roll, pitch, yaw, tilt left/right, tilt forward/back, spin rate ×3, motion, shake |
| Phone B, Touch B | the same, and pad X, pad Y, pad touched, from the second iPhone (its triggers are the same four triggers) |
| Touch | pad X, pad Y, pad touched, triggers 1–4 |
| LFO | four oscillators: sine, triangle, ramp, square, random steps, drift; free-running or locked to the tempo |
| Tempo | beat pulse, beat ramp, bar ramp |
| Audio | level, bass, mid, high, beat |
| Motion A, Motion B | movement in input A's picture, and in input B's: overall, left half, right half, top half, bottom half, and where the movement is (left to right, bottom to top). Listed under **Setup → Sources** once a preset uses one |
| MIDI | every CC and note, created the first time it is seen |
| Face / Hand / Gesture / Pose / Segment | see [vision](#midi-audio-and-vision) |

**Setup → Sources** shows them all moving live; the perform screen shows the
ones the live preset uses.

**Modulation.** It is set where the slider is. The arrow beside a slider's
**Mod** button opens a menu of what can move it: **None** at the top, the
sources already **In use** in this preset, then every source. Choose one and
the slider is in range mode: draw on its bar how far it is to be moved (to
the right pushes it up, to the left pulls it down; the slider's own value
stays where it is). Click the button, press `Esc` or click elsewhere when
done. Afterwards the button names the source, and a click on it brings
range mode back. **More settings →** in the same menu opens the
**Modulation** tab on that slider's box, for the rest. Each box there is one
source moving one slider (`Phone · Roll → 1 Video Feedback · rotate`), with
a thin meter showing the source live. **Source** and **Slider** are menus,
so a box can be re-aimed; **Amount** (-1..1 of the slider's range) and
**Smoothing** are
always there, and **More** opens **Offset**, **Invert** and how it is
applied: *added to the dialled value* or *replaces the value* (the source
sweeps the whole range). The switch turns one off without removing it; ✕
removes it. A preset can have any number, and one slider can be moved by
more than one source. **+ Add modulation** on the tab aims at the slider
touched last. Wet / dry can be moved too.

**LFOs.** The fourth tab holds the four LFOs. Each has a meter showing what
it is doing, its **shape** as a row of small pictures (sine, triangle, ramp
up, square, random steps, drift), **tempo sync**, and **rate**. Tempo sync
is a row of buttons: **Free**, then one cycle every 4, 2 or 1 bars (a
numbered bar) or every 2, 1, ½ or ¼ beats (a half, quarter, eighth or
sixteenth note); each says what it is when the pointer rests on it. The rate
only counts while the LFO runs free; locked to the tempo it is dimmed.

**Glitch.** `G`, the Glitch button and any trigger bound to Glitch do one
thing, and each preset says what: a sudden move of sliders you choose, to
places you choose, and back. It is set on the **Glitch** tab of the Edit
screen.

- **Capture a glitch.** Press it, then move any sliders, in any effect of
  the preset, until the picture is the glitch you want; menus and switches
  count too. Press **Save glitch**. Every control you moved becomes a jump
  (a slider nudged by less than a hundredth of its bar is left out) (where
  it is → where you left it) and all of them go back to where they were.
  **Cancel** puts them back and keeps nothing. Nothing is saved into the
  preset while you are capturing. **Recapture** starts from the glitch
  as it stands.
- Point at **attack**, **release** or **scatter** for a line on what it
  does. **attack** is how long the sliders take to get there (0 to start with:
  at once), **release** how long they take to come back (a third of a
  second to start with). With **hold** on they stay thrown for as long as
  the key, button or trigger is down, and come back when it is let go.
- **scatter** lets each press land a little differently around the places
  you chose: at 0 it is the same every time.
- The tab lists the jumps by name, each with a ✕ (point at one for its
  figures). On the **Parameters** tab a slider
  that has a jump carries a small pointer on the top edge of its bar where
  it lands, and the landing value under its number: drag the pointer to
  move the landing place, double-click it to remove the jump. A slider with
  no jump shows nothing.
- A slider that modulation is moving can jump too: it leaves from wherever
  it is at that moment.
- A preset with no jumps keeps the old Glitch: the picture tears into
  shifted bands for under half a second.

**Triggers.** Any source rising through its halfway point can fire an action:
blackout, freeze, bypass, next / previous preset, next input, glitch burst.
With **hold** ticked, blackout / freeze / bypass stay on only while the
trigger is held. (Hold settings saved before 13 November 2026 are no longer
read: every trigger is a switch until you tick hold for it again.) Defaults: phone buttons 1–4 are glitch, freeze (a switch,
as on the control page: tap on, tap off, and the phone's button stays lit),
previous preset, next preset. Triggers are global; they do not change with
presets, so "next preset" keeps working whatever preset you land on.

**Presets** are the tiles along the bottom of the perform screen. Each one
stores a chain, its mappings, its LFO settings and its pinned faders, plus:

- **A name** and **a fade-in time**, set on its Edit screen. Loading a preset
  crossfades over that time: both chains run and are blended, so the change is
  smooth even between unrelated effects. Presets without their own time use
  **Setup → Preset library → Default fade**.
- **An Edit screen** (the **Edit** button on the tile). Everything changed
  there is saved into the preset as you go; **Revert** restores it to how it
  was when the screen was opened. **Duplicate** and **Delete preset** are
  beside the name too; Delete preset removes the whole preset and asks
  first. (To take one effect out, use ✕ on the Parameters tab.)
- **A position.** Drag a tile to reorder; `[` and `]` step through in that
  order.

**Save as new preset** keeps whatever is live as a new preset. A set of
factory presets is installed on first run. **Setup → Preset library** exports
every preset to one JSON file, **Bring back deleted factory presets** adds
any factory preset that is no longer in your list (as it was made; nothing
of yours is changed; it is also how a browser that already had the app gets
factory presets added later, such as **Time wake** and **Relief** of
24 November 2026), and **Import presets** imports such files (added at the end;
unknown effects are dropped and out-of-range values clamped). Presets live in
the browser's local storage; export them to keep a copy.

**The running order** is a list of steps for a show. Each step points at a
preset, so one preset can come round as often as the show needs, and editing
the preset changes every step that uses it. It is optional: with no steps the
strip is the plain preset strip and none of this applies.

- **Build it.** On a preset tile, **+** adds that preset to the end of the
  running order. From the first step on, the strip has a switch: **Running
  order** and **All presets**.
- **Arrange it.** In Running order, drag a step to move it and **×** to take it
  out (the preset is kept). **Note** opens the step's note (a line of text
  shown on the tile) and a fade time of its own; left blank, the step uses
  its preset's.
- **Play it.** **Next** and **Prev** (`]` and `[`, a MIDI pad, a phone trigger)
  walk the steps and stop at either end. The live step is lit and the one
  Next will load has a dashed outline; the line at the right of the strip
  says the same in words, with the next step's note.
- **Leave it and come back.** Load any preset by hand (from All presets, a
  MIDI pad, or the Edit screen) and the running order keeps its place: the
  step you left is marked **Return**, and Next or Prev goes back to it.
- **Keep it.** There is one running order. It lives in the browser's local
  storage beside the presets, and **Export presets** writes it into the same
  file. Importing a file that has one asks before replacing yours.

**Tempo.** Tap `T` (or the **Tap** button, or a MIDI pad mapped to it) in
time, at least twice; the last eight taps are averaged, and the button blinks
on the beat. A single tap just moves the downbeat. The BPM can also be typed
next to the button. Each LFO has a **tempo sync** setting on the Edit screen
(from a quarter of a beat to four bars); the Tempo sources can be mapped like
any other, and the beat pulse works as a trigger. The tempo is global, not
per preset.

**Faders.** The perform screen shows up to eight faders for the live preset.
By default they are picked automatically: the eight places are shared out
between the effects in the chain (two effects get four each, three get three
each), and each effect gives its first sliders, in the order they appear on
the Edit screen; menus and switches are skipped. On the Edit screen,
**Fader** on a slider's row chooses it instead; the **Faders** tab lists the
chosen ones in order, with ↑ ↓ to rearrange and ✕ to take one off, and the
row of small faders under the picture shows the result. Under the faders,
each modulation source the preset uses has a meter, with what it is moving
written under it (`→ 1 Video Feedback · rotate`). Dragging a fader changes
the parameter for now without altering the saved preset; double-click resets
it. When modulation moves a fader's parameter, a hatched band runs from the
fader's setting to where the parameter is right now: stripes above the fill
when it is pushed up, dark stripes cut into the fill when it is pulled down.

## MIDI, audio and vision

All three are off until enabled, and all permission prompts appear on
`/control`, never on the projector. They run wherever the picture runs, and
move with it when the output window opens or closes.

**MIDI.** Click the five-pin socket at the top right (**MIDI map**; or press `M`). Every control
that can be mapped is outlined:

- the panic buttons, the source icons of inputs A and B and the nine mix
  modes (all shown while map mode is on, or open), previous / next preset
- every preset tile (a pad per preset; the pad stays with the slot) and every
  step of the running order (a pad per step number)
- the eight perform faders (the knob moves the parameter itself, so the
  on-screen fader follows the hardware, whatever preset is live)
- any effect parameter: on the Edit screen, touch its slider

Click one, then move a knob or press a pad. The control shows what is mapped
to it. Click a control and press `Delete` to clear it; `Esc` leaves map mode.
Everything mapped this way is also listed under **Setup → Triggers and MIDI
controls**, where a pad can be given any other action.

Devices plugged in later are picked up automatically. A mapped knob that has
not been touched since the page loaded leaves its parameter alone.

**Audio.** Under **Setup**, **Enable audio**, choose the input, and set **Input gain** so the
level meter moves without sitting at maximum. **Beat threshold** is how far
above the recent average a hit must rise to count. If `/control` says audio
analysis is waiting, click the output window once (the message says which
window): Chrome only starts audio processing in a window that has been
clicked.

**Vision (MediaPipe).** Under **Setup**, five independent features, each off by default
because each costs GPU and CPU time:

| Feature | Sources it adds |
| --- | --- |
| Face | seen, position, size, turn / nod / tilt, mouth open, smile, pucker, brows up / down, blink left / right, eyes wide, cheek puff |
| Hands | seen, position, pinch, openness, rotation, two-hand distance |
| Gestures | fist, open palm, pointing up, thumb up / down, victory, I-love-you |
| Body pose | seen, position, size, shoulder lean, each hand's position and height, arm span |
| Segmentation | person coverage, plus the mask behind **Apply to** on effects |

Inference runs in a worker on a 480-pixel-wide copy of the input, so it never
blocks rendering; it simply produces results as fast as it can (the panel
shows milliseconds per pass). With Hands and Gestures both on, one model
serves both. The test pattern has nothing to detect: use a camera or a video
file.

## What happens when things go wrong

Problems show as strips across the top of `/control`. A strip with a fix is
a button that says where it goes (**Show pairing**, **Show QR code**,
**Reload both pages**, **Go to Input**, **Go to Recording**, **Go to
Vision**). Every strip has an **×** on the right; a closed strip stays closed
until its message changes or the problem clears and comes back. Strips about
a passing state (a stall, a recovering graphics context) remove themselves.

| Event | Behaviour |
| --- | --- |
| Phone stream stalls or drops | The picture holds the last frame. `/control` shows a red alert. Phone and Mac each retry on their own until the stream is back |
| Phone camera flips or restarts | Last frame is held; no black flash |
| Safari goes to the background | `/control` alert while hidden; red warning on the phone when it returns; stream resumes |
| The network keeps the phone and the Mac apart (many venue, campus and guest networks do) | Both reach the pairing server, so the code scans and START works, but no link between them will open. After about ten seconds each screen says so: the Mac shows an alert, `Phone: cannot get through` in the top bar and a line on the starting screen; the phone's band reads `CAN'T REACH THE MAC` with what to do. The way out is the iPhone's Personal Hotspot: turn it on, join it from the Mac's Wi-Fi menu. The phone keeps retrying and connects by itself once it can. (The page cannot test this before a phone tries: one device alone cannot tell.) |
| Pairing server unreachable | A paired phone keeps streaming. Both sides keep retrying; the top bar says so. To pair anyway, use [Pair without internet](#pairing-without-internet) |
| A phone paired without internet drops off completely | `/control` says the link was lost, with **Pair without internet** on the strip. Scan both ways again |
| Room code reads as taken | Usually the Mac's own registration left behind by a reload or a dropped network; the pairing server clears it within a minute and the phone then reconnects by itself. The Mac keeps trying for 75 seconds. Only if the code is still taken then (another computer has it) does it move to a new code; `/control` says to scan again, and the phone's **Scan code** button reads the new one |
| The output window is closed | The picture returns to `/control` after about two seconds; the phone reconnects by itself. The top bar reads `Output off`; no alert |
| The output window crashes or is killed | The same, and `/control` says the output stopped without warning, with **Open output window** on the strip |
| The output window is minimised or covered | Chrome stops drawing it. `/control` says the output is not drawing and leaves the picture with it; bring the window back into view |
| A second output window is opened | It stays idle with a message; the running one is untouched |
| Not sure which window has the phone | **Restart output** closes every output window in this browser and opens one fresh one |
| A newer version of the app was deployed | `/control` says so, and warns if the output window is on a different version. **Reload both pages** reloads the output in place (it stays on its display but leaves fullscreen) and then `/control` |
| `/control` reloaded or closed | With the output window open: `/output` unaffected. With none: the picture restarts with the page and the phone reconnects |
| `/output` reloaded | Restores the last state; the phone reconnects by itself. `/control` waits for it |
| Internet drops, then a page is reloaded | The page loads from the browser's stored copy. Pairing a phone again still needs the signaling server |
| Local camera unplugged | Last frame held; reopened automatically when it returns |
| Graphics context lost | Pipeline is rebuilt in place; the phone link stays up |
| Everything is on fire | `B` |

## Writing your own shader

Each effect is one file in `src/effects/`. The control UI and the uniforms
are generated from `params`; you only write the fragment body.

```js
// src/effects/wobble.js
export default {
  id: 'wobble',
  name: 'Wobble',
  params: {
    amount: { min: 0, max: 0.1, default: 0.02, step: 0.001 },
    speed: { min: 0, max: 10, default: 2, step: 0.01 },
    axis: { options: { Horizontal: 0, Vertical: 1 }, default: 0 },
    flip: { type: 'bool', default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  float w = sin(uv.y * 20.0 + uTime * speed) * amount;
  vec2 d = axis < 0.5 ? vec2(w, 0.0) : vec2(0.0, w);
  if (flip > 0.5) d = -d;
  return texture(uTex, mirrorUv(uv + d));
}
`,
};
```

Then add it to the list in `src/effects/index.js`. That is all: it appears in
the **Add effect** menu, its sliders are generated, and every parameter can be
modulated.

- Every parameter arrives as `uniform float <name>` (option lists and
  checkboxes too, as numbers). Avoid GLSL built-in names such as `mix`.
- `uv` is 0..1 with (0,0) at the bottom-left. Return the processed colour;
  wet / dry and person / background masking happen after `effect()` returns.
- Built-ins (`src/effects/common.glsl.js`): `uTex` (input), `uResolution`,
  `uTime`, `uPhone` (roll, pitch, yaw in radians), and helpers `luma`, `rot2`,
  `mirrorUv`, `inFrame`, `rgb2hsv`, `hsv2rgb`, `hueRotate`, `hash21`,
  `noise2`, `ASPECT`, `PI`, `TAU`.
- `uses: { prev: true }` gives the effect its own previous output as `uPrev`
  (see `feedback.js`, `trails.js`).
- `uses: { history: { frames, maxWidth } }` gives a ring buffer of past input
  frames as `uHistory` (see `delay.js`).
- `uses: { motion: true }` gives the motion maps of inputs A and B as
  `uMotion` and `uMotionB`. Read one with `motionAt(uMotion, uv)`: `.x` is
  movement now (0 to 1), `.y` the same with a short wake, `.zw` roughly which
  way it is going (see `motion.js`, `gravity.js`). An effect with
  `uses.prev` may also keep a value of its own in the alpha of what it
  returns, and read it back from `uPrev`.
- `uses: { inputB: true }` gives input B as `uTexB`, fitted like A; the
  effect is skipped while B is off (see `mixb.js`). `mixLabel` renames the
  effect's wet / dry slider.

A shader that fails to compile is reported in the console of the window
drawing the picture and that effect is skipped; the rest of the chain keeps
running.

## Recording

**REC** in the top bar (or `R`, or a MIDI pad mapped to it) records exactly
what the output shows, at the output's size, with the audio input if that is
switched on. The button shows elapsed time and file size while it runs.

With no output window the picture is rendered, and recorded, at 1280×720
whatever the size of the monitor on the page. Opening or closing the output
window stops a recording; what was recorded up to then is kept.

Each recording is named `ThirdEyeCam_` with the date and the time it began
(`ThirdEyeCam_2026-11-17_14-55-45.mp4`) and is saved to the **Downloads**
folder the moment it stops (the folder Chrome downloads to: Chrome →
Settings → Downloads). The control page does the saving, so keep it open
while recording. The first time, Chrome may ask to allow this site to
download several files: allow it. **Setup → Recordings** has the switch
(**Save to Downloads when a recording stops**, on to start with).

While it records, the file is written inside the browser's own storage, so
nothing is held in memory and nothing needs choosing mid-show; that copy
stays, listed under **Setup → Recordings**, until you **Delete** it there.
**Save to disk** downloads it again. A web page cannot write straight into
a folder of your choosing without asking for it each time it is opened.

Two formats: **MP4** (the default) opens in most players, but Chrome writes
it in large pieces, so if the browser dies mid-recording most of it can be
lost; **WebM** reaches the file every second, so a crash loses at most the
last second. WebM plays in Chrome and VLC, not in QuickTime.

Recording costs GPU and CPU. The first readout in the top bar shows the
frame rate as a recording starts, and whenever it is low: if it shows one
while you record, lower **Setup → Output** resolution.

## Latency

Three things to tune, all under **Setup**:

- **Codec** (Phone panel). H.264 is preferred by default because the iPhone
  encodes it and the Mac decodes it in hardware; VP8, VP9 and the browser's
  own choice are there to compare. Changing it restarts the phone's video for
  a moment. **Status → Stream** shows the codec actually in use and, when
  Chrome reports it, whether decoding is in hardware.
- **Quality** (on the phone). 720p · 60, the default, halves the time
  between frames compared with 720p · 30, at a higher bitrate and more heat
  on the phone. The phone remembers the last quality chosen on it.
- **Network.** See [Show networking](#show-networking).

To see what a change really did, use **Status → Measure real latency**. Point
the phone at the projected output so it fills most of the frame and click it:
the output goes black and flashes white five times, and the Mac times how
long each flash takes to come back through the camera. The result is the
whole loop the audience sees (projector, camera, phone, network, Mac), which
the **Latency** line above it can only estimate. Run it before the show, not
during: it takes over the output for about ten seconds. With no output window
it flashes the monitor on the Perform screen instead; that measures the
laptop's screen, not a projector.

The result is the median of the five flashes. A flash that comes back far
later than the others (a camera hiccup or a frozen frame) is named as a
stray and left out of the range; if strays turn up on every run, look for
dropped frames.

Measured on a real iPhone over home Wi-Fi with H.264, the phone pointed at
the output in a window on the Mac's screen (no projector):

| Phone quality | Frames arriving | Measured | Estimate then (Latency line) |
| --- | --- | --- | --- |
| 720p · 30 | 26 fps | 200 ms (167–217) | ≈ 160 ms |
| 720p · 60 | 54 fps | 167 ms (one stray at 817) | ≈ 152 ms |

The network round trip was 8–14 ms, so nearly all of the delay is the camera,
encoding, decoding and display. A projector adds its own lag on top; a game
or low-latency picture mode helps. The estimate now allows one camera frame
for capture; worked out from these runs it would have read about 198 and
170 ms, but it has not been seen on the phone since the change.

## Sending the output to other software (Syphon, NDI)

A web page cannot publish a Syphon or NDI source: browsers have no access to
those frameworks. The output window is an ordinary Chrome window, though, so
the usual route is to capture it:

- Most VJ and mapping software can take a window or a display as an input
  (VDMX window inputs, OBS window capture, screen-capture sources in
  MadMapper and Resolume).
- Utilities exist that republish a chosen window as a Syphon source.
- Or give the output window its own display and capture that with a capture
  card on a second machine.

Capture adds a little latency and depends on the window staying visible. A
native wrapper (an Electron build with a Syphon add-on) would be the way to a
true Syphon server; it is not part of this project yet.

## Icon

The browser-tab and Home Screen icon is a compact camera drawn in outline
with a horizontal eye in the same line, in the app's red on its black.
`scripts/make-icons.mjs` draws it and writes the files in `public/`
(`icon.svg`, `icon-32.png`, `icon-180.png`, `icon-512.png`); change the
drawing there and run it again. The mark on the phone's start screen is the
same drawing in motion (`src/shared/mark.js`): light video noise inside the
camera, and an eye that blinks now and then. The Mac's starting screen
draws the same camera solid, with the pairing code in it
(`src/control/code-mark.js`); the camera's outline for both is in
`src/shared/camera-shape.js`. Change all three when the logo is redrawn.

```bash
node scripts/make-icons.mjs
```

The mock-ups are kept in `design/` (`design/README.md` says what each is).
The logo options of 22 November are in `design/logo/`; the earlier icon
options are in `design/third-eye-icons.html` (open the file in a browser).

## Deploying to GitHub Pages

`.github/workflows/pages.yml` builds on every push and deploys from the
repository's default branch.

One-time step: in the repository on GitHub, **Settings → Pages → Build and
deployment → Source: GitHub Actions**. Until that is set, the build job passes
and the deploy job fails with "Ensure GitHub Pages has been enabled".

The site is then at `https://<owner>.github.io/<repo>/`. It is fully static
and uses relative paths, so it works from any path or any other static host.
GitHub Pages serves HTTPS, which the phone page requires.

## Self-hosting the signaling server

The public PeerJS server is shared and offers no guarantees. To remove that
dependency, run your own [PeerServer](https://github.com/peers/peerjs-server)
and enter its address under **Phone → Link and signaling** on `/control`, for
example `wss://192.168.8.10:9000/`. The address travels to the phone inside
the QR code.

Because the phone page is served over HTTPS it can only reach a `wss://`
server, so PeerServer must be started with a TLS certificate the iPhone
trusts (`peerjs --port 9000 --sslkey key.pem --sslcert cert.pem`), for
example one made with [mkcert](https://github.com/FiloSottile/mkcert) whose
root certificate is installed on the phone. An API key other than the default
can be appended as `?key=…`.

With signaling on your own router the system needs no internet at all once
the pages are loaded.

## Tests

The tests drive the real pages in headless Chromium. They need Playwright's
Chromium; the vision test also downloads a few sample photos.

```bash
npm test
```

| File | Covers |
| --- | --- |
| `tests/smoke.mjs` | Pipeline with no output window and with one, control ↔ output sync, keys, resize, reloads, lost GL context in either window, a video file following the picture back to `/control` |
| `tests/handover.mjs` | The optional output window, with real WebRTC: `/control` renders alone and the phone pairs with it; opening the output hands over (state and room code kept, recording stopped, one engine only, phone reconnects); an output reload does not bounce; an output that stops drawing is not taken for gone; closing it hands back; one that vanishes raises the alert |
| `tests/offline-pair.mjs` | Pairing with no pairing server, by QR code both ways: the dialog and its network tooltip, the size of both codes, the phone's code read from a camera picture, video, sensors and palette over the direct link, camera off and on, a stale code, a lost link and its alert, a code read twenty seconds late |
| `tests/offline-pair-online.mjs` | The same pairing while the pairing server can be reached: the phone still shows its code and waits; Hide the code falls back to normal pairing and the Mac's dialog closes |
| `tests/offline-handover.mjs` | A phone paired that way while the output window opens, reloads, closes and vanishes: the phone follows each time with no code scanned again |
| `tests/standalone.mjs` | With no output window at all: recording, the latency measurement, audio, MIDI and MIDI map, palette and dimmer reaching the phone; opening an output releases the microphone and MIDI |
| `tests/layout.mjs` | No overlaps at six window widths on every screen; the fader column (names whole, nothing overlapping) for every factory preset at five window sizes; nothing moves when the information changes; alert strips (fix buttons, ×, closing and returning); the palette pop-over |
| `tests/control-ui.mjs` | The three screens, the live monitor and the `Output off` readout that opens the output, palettes and the dimmer (and that the phone page is really inked), perform faders and the modulation band, preset editing, fades, reordering, the pop-out output, Reload both pages |
| `tests/offline.mjs` | Reloading every page with the server gone; tap tempo and tempo-synced LFOs |
| `tests/phone.mjs` | Real WebRTC against a local PeerServer: pairing, live video, palette and dimmer following live, the room-code strip clearing once the phone pairs, hold on stall, every reconnect path, a second output window, a taken room code, Restart output, local camera |
| `tests/record-latency.mjs` | Recording to WebM and MP4, saving and deleting; the latency measurement, including a stray late flash; switching codec |
| `tests/phone-screen.mjs` | The phone's live screen in both layouts: the horizontal preview that is also the XY pad, triggers, six presets numbered across then down, the camera icons, the bare zoom bar, Freeze as a switch (including two quick taps and a session saved with the old hold setting), Rotate, upright frames staying upright on the Mac, messages that leave the preview alone, Reconnect, the remembered room, scanning the Mac's code inside the page |
| `tests/running-order.mjs` | The running order: building it with +, Next and Prev, the same preset twice, going off the list and returning, notes and fades, dragging and removing steps, deleting a preset that steps use, the phone's six buttons following it, the export file, stepping with `/control` closed and with no output window |
| `tests/reconnect.mjs` | Getting the phone back without closing its page: a Mac that stops answering, a Mac reload, scanning that stops when the link returns, the ordinary pairing code read inside the page, a changed room code, Reconnect by hand |
| `tests/output-preview.mjs` | The phone's preview showing the Mac's finished picture: the setting, the picture following Blackout, Rotate not applied twice, the camera taking over while a code is read, a Mac reload, switching back; torch and white-balance lock dimmed on a camera without them |
| `tests/edit-screen.mjs` | The edit screen's own controls: the bar slider (click, typed value, double-click reset), the app's menus by mouse and keyboard without the page's shortcuts firing, a menu whose button scrolls into view, the chain row (add, drag, remove, bypass), modulation boxes and their extra settings, LFOs, autosave, a narrow window |
| `tests/glitch.mjs` | Glitch: the tab, tearing when a preset has no jumps, capturing (Keep, Cancel, nothing saved meanwhile, a capture left open), the pointer on a slider's bar (shown, dragged, removed), firing it with attack and release, hold by key and by button, scatter |
| `tests/blocked.mjs` | A network that keeps devices apart: a phone whose links cannot open while the pairing server works; the Mac's alert, readout and starting-screen line, the phone's band, both naming the hotspot as the way out; pairing by itself once the links can open |
| `tests/mix.mjs` | Input B and Mix B: the strip under the picture (uncropped small views, source icons that slide out, looking at a source without choosing it, tooltips and the mode grid opening upward), the bar adding Mix B on its first drag, the nine modes on both screens, A and B trading places, B off passing A through, the iPhone as B, B carrying on when the picture moves to `/control` |
| `tests/two-phones.mjs` | A second iPhone: its tab and room code, pairing beside the first without disturbing it, the Phone B readout, iPhone B as input A or B with both live, its sensors as their own sources, its triggers and preset buttons, both phones following the picture to `/control`, one dropping alone, Stop using iPhone B |
| `tests/keep-paired.mjs` | Keeping what is paired: a second phone on the same code is turned away and told why while the paired one carries on; the paired phone redials and reloads freely; a phone with no pairing server holds a silent link and carries on when the Mac answers; a taken room code is kept under a paired phone |
| `tests/drop.mjs` | If a source drops: hold, fade to black, fade to a stand-by source and back when the phone returns, a newly chosen source getting its full wait, input B easing out of the mix and returning, the settings and the alert |
| `tests/link-down.mjs` | The phone when the Mac is not receiving: the band at the foot of the preview in both layouts (what is wrong, retrying with the time, a button only when needed and large enough), the grey preview and pulsing edge, the pad and the controls left alone, the phone returning by itself; the Resume screen and when it is not offered |
| `tests/start.mjs` | A browser that has never opened the app: the Mac opening on the iPhone input with the splash where the picture will be (the opening playing once, the camera holding a code that reads as the pairing link, in another colour and dimmed too), the Before the show check and its flag, the phone's start screen and its check after START. the opening that START plays. (Every other suite starts from a saved session on the test pattern with the phone's check and opening off: `launch()` in `lib.mjs`) |
| `tests/modulation.mjs` | All effects, sensor channel, simulated motion, touch, mappings, the motion map (built only when read, its modulation sources, the Motion and Gravity effects), triggers, presets, crossfade |
| `tests/time-scan.mjs` | Time's reach (the frames in use cover 1, 4 and 8 seconds), Time and Scan with each choice of **driven by**, the motion map made only when Motion drives, the edit screen's rows and names, Scan's lift and direction, segmentation switching itself on for the body and off ten seconds after, and left alone when switched on in Setup |
| `tests/midi-audio.mjs` | Audio analysis on Chromium's fake microphone; MIDI through a stand-in device, MIDI map mode for buttons, presets, faders and parameters |
| `tests/vision.mjs` | Each MediaPipe feature on sample photos; person / background masking |

## What has and has not been verified

**On real devices** (a Mac, an iPhone, home Wi-Fi and the iPhone's Personal
Hotspot): pairing by QR code through the public PeerJS server, live video
into the effects chain over a direct link with H.264, the control screens,
the output window, and Measure real latency with H.264 at 30 and 60 fps
against the Mac's own screen (see [Latency](#latency)). At a coffee shop the
Mac on the iPhone's hotspot works (the iPhone itself on the shop's Wi-Fi);
the Mac and the phone both on the shop's Wi-Fi do not. On a university
network the Mac could not reach the public pairing server at all. The
iPhone's camera offers zoom, a torch and a white-balance lock (and no
exposure or focus controls), and the phone's rebuilt screen draws correctly
in Safari, upright included. After the reconnect changes of 14 November the
phone was reported to reconnect better. The rebuilt edit screen was used on
the Mac on 15 November, before its LFOs tab was added. On 16 November two
iPhones were paired at once with the Mac on the first one's hotspot: the
second worked, and the first was dropped as it joined and reconnected by
itself (before "a paired phone keeps its place" was built). The same day the
Mac was seen still running the previous version an hour after a deploy,
until it was reloaded. Nothing else from 16 to 21 November (input B and Mix
B, the strip under the picture, the stand-by for a dropped source, the
phone's band and Resume, the start screens and checks, recordings saving
themselves) has been seen on real devices.

On 22 November the owner tried the new effects (Tone, Blur / Glow, Noise and
the wider slider ranges) on the Mac with the iPhone as input and reported
that they work well, and later that drawing a modulation's range on a
slider and the number on an effect's button as its bypass switch work well
too.

On 23 and 24 November the owner used Motion and Gravity with the iPhone as
input ("work well"), captured and fired a glitch on the Mac, used the new
top bar and the reworked edit screen, and scanned test codes drawn like the
starting screen's (dark squares on each of the six palette colours, at the
dimmer's brightest and dimmest) with the iPhone's Camera app: every one
read. One of those sessions was in Safari on the Mac, in a window under
1000 pixels wide; the control page is built and tested for Chrome.

**Only in headless Chromium**, with a fake camera and microphone: everything
else. Check these the first time you use them:

- **The Mac's starting screen and the phone's opening** (23 November): the
  real pairing code inside the camera scanned by the iPhone (only test
  codes drawn the same way have been); both openings at a true 60 frames a
  second; on the phone, the camera picture shown inside the camera's shape
  as the noise clears, in Safari.
- **The top bar** (23 November): the frame rate appearing in the output
  readout only when it is low (the test machine is never above 50), and
  the second iPhone switching itself off after a look at its tab.
- **A network that keeps devices apart** (24 November): the message on both
  screens has only been seen with a stand-in phone whose links were made
  unable to open. Try it once on a real venue or campus network.
- **Glitch as a jump** (23 November): held by a phone trigger or a MIDI
  pad (the owner has captured and fired one with the mouse and the G key;
  the tests do the same).
- **The Motion sources, and Gravity's "down"** (22 November): Motion and
  Gravity themselves have been used with a real camera. Still to find out:
  how the Motion A / B sources read on a slider with a person in a lit
  room; whether Gravity pours toward the room's floor when the phone is
  rolled (if it pours upward or sideways, set **angle**, and say so).
- **From 22 November:** the moving mark on the iPhone's start screen in
  Safari; the frame rate with Blur / Glow on a large output; a paired
  phone keeping its place through a reload while another phone waits on
  the same code.

- **Input B and Mix B** (16 November): two real pictures mixed, the iPhone
  as A or B beside the Mac's camera, and whether the Mac holds 60 fps with
  two live videos. The tests mix the test pattern, Chromium's stand-in
  camera and a stand-in phone.
- **A second iPhone** (16 November): two real iPhones streaming at once, the
  frame rate and the Wi-Fi with both, the second phone on the first one's
  hotspot, and Safari on the second phone reconnecting. The tests pair two
  stand-in phones.
- **A closed network made by the Mac** with Internet Sharing and no internet
  behind it. The steps are from how macOS is known to behave; they have not
  been tried on your Mac.
- **Pair without internet**, all of it: Safari answering the Mac's code, the
  Mac's real camera reading the phone's real screen (the tests show jsQR a
  clean picture of the code), the link forming on a hotspot or a Mac-made
  network, and the phone following the picture between windows. Only Chromium talking to
  Chromium has been tried.
- **The phone's screen**, on a real iPhone: the preview showing the same
  band of an upright frame that the Mac shows (on 14 November the preview
  showed the Mac's screen on its side; whether Rotate or the iPhone's
  orientation lock was the cause is not known), Freeze as a switch, Rotate,
  the camera icons dimmed on the front camera, **Preview: Mac output** and
  how far it lags, and **Scan code** reading the Mac's ordinary QR code.
- **The running order**: building and stepping it on the Mac, and the
  phone's six buttons following a show of more than six steps.
- **The edit screen's LFOs tab** (shape pictures, note-value tempo sync),
  dragging effects to reorder, and **the Setup screen's menus and bars**.
- **Running with no output window, and moving the picture** by opening and
  closing it: that the iPhone reconnects by itself each time and how long it
  takes (1.5–2.5 s in the tests), that the monitor on `/control` holds 60 fps,
  and that a covered or minimised output is reported as not drawing rather
  than taken over.
- **Measure real latency** through a projector, and with VP8 or VP9. It
  has only been run against the Mac's screen, with H.264.
- Recordings longer than a few seconds.
- MIDI map with a physical controller.
- Fullscreen placement on a projector through the Window Management
  permission, and 60 fps at the projector's resolution.
- MediaPipe on the GPU. The tests use the CPU path. If a feature reports an
  error, switch Setup → Vision to **Run on CPU**.
- The direction of **Rotate / Counter-rotate**. If the picture turns twice as
  far instead of staying level, set `follow` to -1.
- Which camera controls appear on the phone. That depends on what the
  iPhone's camera reports; an empty list is not an error.
- Tap tempo, offline reload and the motion sensors and touch controls on the
  phone have not been reported on either way.
