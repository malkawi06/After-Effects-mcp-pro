# Expressions cookbook (JavaScript engine)

Set with `prop.expression = "..."` or `AEH.expr(prop, preset, opts)`. After setting, ae_review reports any expression errors. Keep expressions short; prefer keyframes for designed motion and expressions for systems (loops, follow, reactive).

| Need | Expression |
|---|---|
| Organic drift | `wiggle(1.5, 12)` |
| Wiggle only X | `[wiggle(2,20)[0], value[1]]` |
| Loop keyframes | `loopOut("cycle")` · `loopOut("pingpong")` · `loopOut("offset")` (keeps accumulating) |
| Constant spin | `value + time * 90` |
| Overshoot after keys | `AEH.expr(prop, "bounce", {amp: .06, freq: 3, decay: 6})` |
| Follow with delay | `thisComp.layer("Leader").transform.position.valueAtTime(time - framesToTime(3))` |
| Delay chain by index | `var d = (index - 1) * framesToTime(2); thisComp.layer("Leader").transform.position.valueAtTime(time - d)` |
| Map a range | `linear(time, 0.5, 1.5, 0, 100)` · `ease(time, 0.5, 1.5, 0, 100)` |
| Blink | `Math.round(time * 2) % 2 == 0 ? 100 : 0` |
| Stepped / stop-motion | `posterizeTime(8); value` |
| Random but stable | `seedRandom(index, true); random(-20, 20)` |
| Counter (Source Text) | `Math.round(linear(time, 0, 2, 0, 1250)).toLocaleString()` |
| Squash & stretch | `var s = Math.sin(time*8)*Math.exp(-time*4)*10; [value[0]+s, value[1]-s]` |
| Face the camera | `lookAt(thisComp.activeCamera.toWorld([0,0,0]), position)` on Orientation |
| Box from text size | `var r = thisComp.layer("T").sourceRectAtTime(time,false); [r.width+40, r.height+20]` |
| Slider control | `effect("Speed")("Slider")` (add with `AEH.fx(l, "ADBE Slider Control", {})` then rename the effect) |

## Rules
- Return a value of the property's dimension: Position 2D → `[x, y]`, 3D → `[x, y, z]`, Opacity → number.
- `value` = the keyframed/static value; build on it so the user can still adjust.
- Use `framesToTime()` for frame-based offsets so it survives fps changes.
- Heavy expressions (sampleImage, long loops over layers) slow previews — avoid in templates.
- To bake: `app.executeCommand(app.findMenuCommandId("Convert Expression to Keyframes"))` with the property selected.
