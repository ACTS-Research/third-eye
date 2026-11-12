# Handoff

## 2026-11-12

**Where things stand.** Everything planned is built and live on GitHub Pages
from `main`, and it pairs and streams with a real iPhone on home Wi-Fi and on
the iPhone's Personal Hotspot. This session added recording, codec choice, a
real-latency measurement, self-healing pairing (one output per browser,
automatic new room code, a five-step connection checklist) and a control
page that no longer jumps or overlaps.

**Next step.** With the working setup, run Measure real latency (Setup →
Status) once per codec and at 720p60 versus 720p30, with the phone pointed at
the output. It has only ever seen a simulated camera.

**Decisions only you can make.**

- Decide whether to allow a relay (TURN) fallback for networks that block
  the direct phone-to-Mac link. Home Wi-Fi and the hotspot do not need it; a
  coffee-shop network failed and was not retried after the pairing fixes, so
  whether it needs one is unconfirmed. A relay costs latency and depends on
  someone's server.
- Decide whether to run your own pairing server instead of the public PeerJS
  one. The public one works; it comes with no guarantees.
- Pick the default recording format. It is WebM because Chrome writes it to
  disk every second; MP4 opens in more players but is written in large pieces.
- Say whether the board cover should stay the design prototype
  (`screenshots/third-eye-current.png`) or become a capture of the real app.
- Delete the old `claude/affectionate-gates-x6ngzx` branch and its Pages
  deployment rule when you no longer want them. Nothing deploys from it.

**Never run on real hardware (all unconfirmed).**

- Measure real latency against a projector, and whether H.264 beats VP8 / VP9.
- Recordings longer than a few seconds.
- MIDI map mode with a physical controller.
- Fullscreen placement on a second display, and 60 fps at projector size.
- MediaPipe features on the Mac's GPU.
- The direction of Rotate / Counter-rotate (set `follow` to -1 if it doubles).

**Known rough edges.**

- Several alerts at once stack over the top of the page.
- Below about 1000 px wide, the top bar only has room for the output readout.
- The first reload after a deploy can still show the previous version for a
  few seconds; the control page warns when the two windows differ.

**Branch.** Work is on `main`, which is the default branch and the one that
deploys. Nothing is waiting to be merged.

**How to check a change.** `npm test` runs nine headless suites. They use a
fake camera and microphone, so they do not replace a run on the real devices.
