# Changelog

## 1.6.0
Security:
- Raw ExtendScript (`ae_run_jsx`) is off by default in the panel; the user turns it on explicitly.
- Render and output paths must be inside `Documents/AE-Claude`; other files are never overwritten.
Lessons from building the CONTROL THE MOTION promo (56 s, 1080p60) entirely through the tool.
- `ae_music`: SFX `motion` filter (transition, impact, reveal, ui) and a default level per motion type (impact -10, transition -12, reveal -14, ui -16 dB).
- `ae_music`: SFX library. `sfx: true` (automatic under 2 s) stores the sound's hit point (loudest 10 ms window); `use` places that hit exactly on `start`. Tag by motion type (whoosh, impact, riser, click…).
- `ae_fonts`: on Windows, new fonts are loaded into the running session (AddFontResource + WM_FONTCHANGE), so no logout is needed.
- `ae_preview`: up to 120 s per frame for heavy 3D/DOF frames, with an actionable error instead of a bare timeout.
- `ae_review` checks: layers that exceed the 30,000 px limit at their largest scale (renders go black past it), CC Radial Blur (stalls renders), blur on adjustment layers without CC RepeTile (transparent edges), nearly coplanar 3D siblings with different orientation, 2D text under 3D layers.

## 1.5.0
Hardening pass against an engineering checklist (inspection, discovery, security, rendering, observability).
- `ae_inspect`: `layer` (name, index or `#id`) for one layer in depth (transform values, keyframes with values and interpolation, effect parameters, text style, expression errors); `offset` / `limit` paging; the project view lists missing footage and render-queue size, with file names instead of full paths.
- Stable layer ids: `AEH.layer(comp, "#123")` uses AE's `Layer.id` and errors if it no longer exists (no silent fallback to a name).
- `ae_status`: capabilities (server/panel/host versions, raw JSX, read-only, layer ids, UI screenshots, TTS) and a warning when the panel, host script and server versions differ.
- Tool annotations (read-only / destructive / network) on every tool.
- Structured log `Documents/AE-Claude/logs/server.jsonl`: tool, duration, ok, error kind; never arguments or project content; rotated at 1 MB.
- Render: `verified` after done (size + MP4 header), `cancel` in `ae_render_status`, `cancelled` state.
- Output paths must be absolute with the right extension (.mp4 / .aep / .wav / .png).
- Panel: constant-time token compare; status reports the panel switches.
- docs/ARCHITECTURE.md: data flow, tool classes, security model, caching rules, test types.

## 1.4.0
- **Music sync engine** (`rhythm.js`): per-beat kick/snare strength, cut pulse (every 2 beats above ~115 BPM), quiet/mid/loud sections, drops and breaks snapped to the real hit. Tested on a phonk track: drop and break found within one frame of a hand measurement.
- `ae_music use`: rhythm map in the reply, typed markers (pulse hits, DROP, BREAK, sections), `drop_at` / `offset` to trim the track.
- `ae_review`: sync score — every cut (layer in-points, inside precomps up to 3 levels) and coordinated moment (3+ keys on a frame) vs the beat hits (±2 frames); off-beat and too-fast cuts listed; beat hits and cuts drawn on the strip. `ignore` hides intentional checks.
- `ae_preview {ui: true}`: screenshot of the After Effects window (Windows PrintWindow / macOS screencapture), `save_to` keeps the PNG.
- `ae_fonts`: list, install Google Fonts (OFL only, GitHub API, per-user install), preview options side by side.
- AEH: `resetComp`, `charBox`, `pivot`; `layer()` accepts a RegExp.
- `ae_status` warns when Caps Lock is on (AE stops refreshing its viewer). Timeout message explains how to split heavy scripts.
- Workflow: reference gallery and font choice in the brief; sync rules in the server instructions and the audio-sync guide.

## 1.3.1
- Workflow: a brief step comes first. Claude asks about purpose, audience, format, message, mood, brand, assets, music and references before searching for inspiration.
- `ae_music add` takes `url`: the server downloads the track itself (https on pixabay.com, freemusicarchive.org or incompetech.com only, audio files only, ≤ 60 MB). The license is checked before downloading. Browser downloads are no longer needed.

## 1.3.0
- Agreed workflow built in: inspiration → music → timed plan → styleframes → approval → build/review → approval → render. Broad English/Arabic triggers so the tools are used for any AE request.
- `ae_music`: royalty-free music library (add with license check, search by mood/BPM/length/energy, use with beat markers and credit line).
- `ae_memory`: technique cards learned from references (saved automatically) and word search across cards, lessons and recipes.
- Guides: `inspiration` (prompt-motion, Motionographer, Vimeo Staff Picks, Dribbble, Behance), `music` (sources and licenses).
- Review: title-safe check from real layer bounds; sound effects with no visual hit; motion-blur warnings only for spatial motion.
- AEH: `fxParam` for flattened effect groups; text measurement retries on first font use.

## 1.2.0
- `ae_checkpoint`: project snapshots and safe revert.
- `ae_reference` on audio (WAV/MP3): BPM, beat grid, strong hits, optional beat markers.
- `ae_review` `reference`: side-by-side comparison with layout similarity, motion-rhythm correlation and colours.
- `ae_guide`: seven on-demand expert cookbooks.
- `ae_run_jsx` `save_as`: keep a successful script as a recipe (only when asked).
- AEH: `layers` (selected / all / regex), `catalog` (fonts, presets, templates), `applyPreset`; wrong property paths list the valid children.
- Review checks expression errors.
- Panel: read-only mode; rejects browser-origin and non-JSON requests.
- Fix: ExtendScript mis-parses chained ternaries (wrong ease dimensions, text justification, text-animator "based on").
- Leaner tool schemas: 12 tools in 1,088 tokens (was 10 in 1,251).

## 1.1.0
- AEH motion library: named easing curves, text animation presets, shapes, draw-on, gradient backgrounds, effects by name, expression presets, stagger, markers, audio, recipes.
- `ae_review`: frame grid + motion/keyframe/audio timeline + automatic QA checks (fade-aware motion analysis).
- `ae_reference`: analyse reference images and videos.
- `ae_memory`: opt-in lessons, style notes and reusable recipes.
- Token optimisation: compact responses, slimmer `ae_inspect`, right-sized images, shorter tool definitions.
- macOS aerender path.

## 1.0.0
- CEP panel with token-protected localhost bridge.
- Tools: status, run_jsx, inspect, preview, render (background aerender), render_status, tts.
