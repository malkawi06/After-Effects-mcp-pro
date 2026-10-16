# Changelog

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
