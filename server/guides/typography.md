# Typography & kinetic type

## Sizes at 1080p (scale for other formats)
Hero word 180–320 px · headline 90–140 · body/subtitle 44–64 · captions ≥ 40 (mobile). Line length ≤ 40 chars. Leading 1.0–1.15× for display, 1.3× for body. Tracking −10…−30 for big display, 0…+50 for small caps labels.

## Pairing
One family in 2 weights is safest (Bold + Regular). Contrast pairs: geometric sans display + humanist sans body. Check availability: `AEH.catalog("fonts", "montserrat|inter|poppins")`.

## Presets (AEH.textAnim)
`rise` (default entrance) · `drop` · `pop` (playful) · `blur` (premium/cinematic) · `fade` · `typewriter` (tech/UI) · `tracking` (titles: wide → tight). Use `by: "word"` for sentences, `"line"` for paragraphs, `"char"` for single words. Duration ≈ 0.4 s + 0.03 s per char, capped at 1.2 s.

## Patterns
- **Word-by-word sentence**: one text layer, `textAnim(t, "rise", {by: "word", dur: 0.9})`; hold ≥ 1 s per 3 words; exit with `fade` by line, 30 % faster.
- **Stomp / slam**: per word layers; scale 140→100 in 4 f ("snap") + 2 f position shake (hold keys ±6 px) + a hit sound.
- **Title tracking-in**: `textAnim(t, "tracking", {amount: 400, dur: 1.4, curve: "expo"})` + slow push on the layer (scale 100→104 over the hold).
- **Typewriter + cursor**: `textAnim(t, "typewriter", {dur: n*0.05})`; cursor = thin rect with `AEH.expr(opacityProp, "blink", {freq: 2})` positioned with sourceRectAtTime.
- **Wave**: animator with Position 3D [0,-40,0] and an Expression Selector (`ADBE Text Expressible Selector`, amount expression `Math.sin(time*6 - textIndex*0.6)*100`).
- **Highlight a word**: separate text layer for the word or a rect shape behind it sized from `sourceRectAtTime` + 20 px padding, drawn on with scale X 0→100 ("expo").
- **Counter**: Source Text expression `Math.round(linear(time, 0.5, 2, 0, 1250)).toLocaleString()`.

## Auto-sized background box
On a rect shape's Size: `var r = thisComp.layer("Title").sourceRectAtTime(time,false); [r.width+60, r.height+30]`; on its Position: `var l = thisComp.layer("Title"), r = l.sourceRectAtTime(time,false); l.toComp([r.left+r.width/2, r.top+r.height/2])`.

## Arabic / RTL
Arabic needs After Effects' **South Asian and Middle Eastern** text engine (Preferences → Type) or letters won't join — ask the user to switch it if Arabic renders disconnected. Right-align and set paragraph direction RTL in the Paragraph panel (or `td.direction = ParagraphDirection.RIGHT_TO_LEFT` where the scripting API supports it; wrap in try). Use fonts with Arabic glyphs (e.g. "Tajawal", "Cairo", "IBMPlexSansArabic", "SegoeUI"). Animate Arabic by word or line, not by character (per-character animators break joining).

## Readability checks
Contrast ≥ 4.5:1 against the background; nothing inside the outer 5 % (ae_review flags edges); no word on screen < 0.6 s; never animate two text blocks at once.
