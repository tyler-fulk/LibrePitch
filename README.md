# LibrePitch

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Free, open-source audio visualizer and editor. Pitch and speed control, Nightcore-style presets, bass and treble EQ, reverb. Visualize music with multiple styles (including a vinyl record). Export to WAV or MP3. No sign-up; everything runs in your browser.

**Live:** [librepitch.com](https://librepitch.com)

## Features

- **Pitch and speed** – Change playback speed and pitch (e.g. Nightcore, Chopped and Screwed). Speed and pitch are linked like a turntable.
- **Presets** – Nightcore, Chopped + Screwed, Normal, Underwater, Telephone, Radio, Spacious, Vinyl.
- **Visualizer** – Bars, Mirror, Line, Waveform, Circular, Bubbles, Particles, Vinyl. Bars and Mirror support adjustable bar count. Color modes: default gradient, custom, cycling palette, or album art colors. Vinyl spins at 33⅓ RPM (scaled by speed) and shows album art in the center when available.
- **Tone** – Bass and treble EQ, low-pass and high-pass filters, reverb (delay or convolution).
- **BPM** – Optional BPM detection (off by default); result scaled by speed.
- **Export** – Download as WAV or MP3 with effects applied. MP3 can include metadata and album art.
- **Privacy** – All processing is client-side. No audio is uploaded. Optional clipping warning when effects are applied.

## Tech

- TypeScript, Vite
- Web Audio API, OfflineAudioContext
- [web-audio-beat-detector](https://github.com/chrisguttandin/web-audio-beat-detector) for BPM
- [lamejs](https://github.com/zhuker/lamejs) for MP3 encode, [mp3tag.js](https://github.com/corbanbrook/mp3tag.js) for ID3
- [Aurora.js](https://github.com/audiocogs/aurora.js) / av for decoding; alac for ALAC (M4A)

## Develop

```bash
npm install
npm run dev
```

Open the URL shown (e.g. http://localhost:5173). Drop or open an audio file to start.

## Build

```bash
npm run build
```

Output is in `dist/`. Serve that folder over HTTPS for full Web Audio support.

### Upload blocked by host (ClamAV false positive)

If your host blocks uploads because of `Html.Exploit.Agent-6802786-0`, build **without** minification and upload that `dist/` instead:

```bash
npm run build:upload
```

Output in `dist/`. The JS files are larger but readable and rarely trigger the false positive. You can [report the false positive to ClamAV](https://www.clamav.net/reports/fp) so future signature updates may fix it for minified builds.

## License

GPLv3. See [LICENSE](LICENSE).
