# Third Eye Cam

A live video instrument. An iPhone streams its camera over WebRTC to a Mac
running Chrome, where a WebGL2 effects chain processes it and sends the result
to a fullscreen window on a second display.

Work in progress — see the phases in the commit history. Full documentation
lands with the final phase.

```bash
npm install
npm run dev        # http://localhost:5173/control/
npm run build      # static site in dist/
npm run test:smoke # headless check of the pipeline (needs Playwright's Chromium)
```
