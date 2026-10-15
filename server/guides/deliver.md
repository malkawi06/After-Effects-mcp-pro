# Delivery & pre-flight

## Pre-flight (run before ae_render)
1. `ae_review` → zero checks reported (edges, empty frames, expression errors, motion blur, missing footage).
2. Work area = the intended range (`comp.workAreaStart/workAreaDuration`); comp duration has no trailing black.
3. Fonts: all text layers use installed fonts (`AEH.catalog("fonts", name)`).
4. Audio: voice peaks ≈ −3 dB, nothing clipping; music ducked under voice.
5. Safe areas: important content inside 90 % (title) / 95 % (action); 1080×1920 social: keep 250 px clear at top and 340 px at bottom for UI overlays.
6. `ae_checkpoint create "pre-render"` on user projects.

## Platform specs
| Platform | Size | Notes |
|---|---|---|
| YouTube / web | 1920×1080, 30 or 60 fps | H.264 |
| Reels / TikTok / Shorts | 1080×1920 | ≤ 60 s typical, captions inside safe zone |
| Instagram feed | 1080×1350 (4:5) or 1080×1080 | |
| LinkedIn / X | 1920×1080 or 1080×1080 | silent autoplay → burned-in captions |
| Presentation loop | 1920×1080 | seamless: last frame matches first |

Make variants by duplicating the comp and changing `comp.width/height`, then re-centering (`AEH.layers(c,"all")` + reposition) — never stretch.

## Rendering
- `ae_render` → H.264 MP4 in the background (aerender), the default for sharing.
- Other formats: `AEH.catalog("templates")` lists render/output templates (e.g. a "with Alpha" ProRes/QuickTime template for overlays). Queue via `app.project.renderQueue.items.add(comp)` + `outputModule(1).applyTemplate(name)` in ae_run_jsx (undo:false), then `ae_render` is not used — tell the user to press Render, or use aerender with `-OMtemplate`.
- GIF: render MP4, then convert outside AE (ffmpeg palettegen) — AE has no good GIF output.

## Templates (Essential Graphics)
Expose properties for editors: `prop.addToMotionGraphicsTemplate(comp)` (or `addToMotionGraphicsTemplateAs(comp, "Title text")`), then `comp.exportAsMotionGraphicsTemplate(true, "C:/path/name.mogrt")`. Keep a "Controls" null with sliders/colour controls driving the design via expressions.

## Hand-off
Name layers meaningfully, colour-label by role, precompose scenes, delete unused items only with permission (`Reduce Project` is not undoable — avoid unless asked), save, then tell the user the output path and length.
