# Transitions (30 fps timings)

Rule: a transition lasts 8–18 f, peaks in speed mid-way (curve "expo" or "snap"), and hides the cut under motion blur or a shape. Sync it to a sound hit.

## Whip pan / slide push (8–12 f)
Outgoing and incoming layers move together across the frame; the speed hides the cut.
```js
var c = AEH.comp(), a = AEH.layer(c, "Scene A"), b = AEH.layer(c, "Scene B"), t = 2, d = 10 * c.frameDuration;
AEH.anim(AEH.prop(a, "ADBE Transform Group/ADBE Position"), [[t, [960, 540]], [t + d, [-960, 540]]], "expo");
AEH.anim(AEH.prop(b, "ADBE Transform Group/ADBE Position"), [[t, [2880, 540]], [t + d, [960, 540]]], "expo");
a.motionBlur = b.motionBlur = true; c.motionBlur = true; c.shutterAngle = 360;
```
Extra smear: `AEH.fx(layer, "ADBE Motion Blur", {"Direction": 90, "Blur Length": 0})` and keyframe Blur Length 0→120→0 across the move.
Per-layer shutter without touching the comp: Transform effect `ADBE Geometry2` (animate its Position; param 10 = "Use Composition's Shutter Angle" set 0, param 11 = Shutter Angle 360 — verify with AEH.prop's child list).

## Punch-in / zoom cut (6–10 f)
Scale the outgoing 100→120 with "in", cut, incoming 85→100 with "out"; add Gaussian Blur (`ADBE Gaussian Blur 2`, "Blurriness" 0→25) on both sides.

## Shape wipe (12–18 f)
A brand-colour rectangle sweeps across, covering the cut at its midpoint.
```js
var r = AEH.shape(c, "rect", { size: [2400, 1400], fill: "#FF6A3D", name: "Wipe" });
AEH.anim(AEH.prop(r, "ADBE Transform Group/ADBE Position"), [[t - 0.25, [-1300, 540]], [t + 0.25, [3220, 540]]], "expo");
AEH.prop(r, "ADBE Transform Group/ADBE Rotate Z").setValue(-12);
```
Stack 2–3 wipes in different colours staggered 2 f for a layered look.

## Mask / matte reveal
Track matte (AE 2023+): `fill.setTrackMatte(shapeLayer, TrackMatteType.ALPHA)`; older AE: put the matte directly above and set `layer.trackMatteType = TrackMatteType.ALPHA`. Animate the matte (scale, drawOn, position) instead of the content.

## Effect wipes
- Linear: `ADBE Linear Wipe` → "Transition Completion" 0→100, "Wipe Angle", "Feather" 50–200.
- Radial/clock: `ADBE Radial Wipe` → "Transition Completion", "Start Angle", "Feather".
- Luma (organic): `ADBE Gradient Wipe` → "Transition Completion", "Transition Softness" 20–50, "Gradient Layer" (a fractal-noise precomp).
- Iris: ellipse shape scaled 0→2500 % as alpha matte.

## Glitch cut (4–6 f, use sparingly)
Hold-interpolated position jitter (`AEH.curve(prop, "hold")`) + `ADBE Turbulent Displace` amount spikes + a 1–2 f RGB offset (duplicate layer, Tint/Fill R and B, offset ±12 px, Screen blend).

## Checklist
Motion blur on; ease is "expo"/"snap", never linear; the cut frame is hidden (blur, wipe or matte at 100 %); sound starts on the frame the move peaks; ae_review shows one tall orange bar exactly at the cut.
