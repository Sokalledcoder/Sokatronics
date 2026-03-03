# Sokatronics

Early-stage 3D audio visualizer built with **Three.js** and the **Web Audio API** using **Vanilla JavaScript**.

This version is focused on a clean baseline: upload a track, play it, and watch a reactive particle scene in real time.  
It is intentionally simple for now and ready to expand.

## What It Does

- Renders a rotating 3D particle field that reacts to live frequency data.
- Supports local audio file upload and playback controls.
- Includes a glassmorphism-style HUD inspired by Boris dashboard aesthetics.
- Adapts visual quality based on hardware performance (with manual override controls).

## Current Features (v0.2)

- Audio upload (`mp3`, `wav`, `ogg`, and common browser-supported formats)
- Play/Pause
- Seek timeline + `-10s / +10s` jump controls
- Volume + mute
- Playback rate selector
- Loop toggle
- Live low/mid/high activity meters
- Quality mode: `AUTO`, `LOW`, `MEDIUM`, `HIGH`
- Particle tuning: density, point size, palette presets

## Tech Stack

- [Vite](https://vitejs.dev/)
- [Three.js](https://threejs.org/)
- Web Audio API
- Vanilla JavaScript (ES modules)

## Quick Start

```bash
npm install
npm run dev
```

Open:

- `http://127.0.0.1:4173/` (if started on port 4173), or
- the local URL shown by Vite in terminal.

## Build

```bash
npm run build
```

## Branching / Platform Note

This repository is currently maintained on the **`linux`** branch for Linux-side development, separate from the Windows-side workflow.

## Next Expansion Ideas

- Post-processing effects (bloom, trails, distortion)
- Multiple scene modes and camera presets
- Preset save/load for visual tuning
- Better mobile-specific optimization profile

