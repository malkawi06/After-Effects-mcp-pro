# Changelog

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
