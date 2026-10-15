# Camera & 3D

## Setup
```js
var c = AEH.comp();
var L = AEH.layers(c, /^(BG|Title|Card)/); for (var i = 0; i < L.length; i++) L[i].threeDLayer = true;
var cam = c.layers.addCamera("Cam", [c.width / 2, c.height / 2]);
// focal length -> zoom: zoom = compWidth * focal / 36 (36 mm film width)
AEH.prop(cam, "ADBE Camera Options Group/ADBE Camera Zoom").setValue(c.width * 50 / 36);
var rig = c.layers.addNull(); rig.name = "Cam Rig"; rig.threeDLayer = true; cam.parent = rig;
```
Animate the **rig null**, not the camera: dolly = rig Z position, truck = X, pedestal = Y, orbit = rig "ADBE Rotate Y" around the subject (put the null at the subject's position first, then parent).

## Depth & parallax
Spread layers in Z (BG +1500, mid 0, foreground −400). Scale far layers up (s = 100 × (zoom + z)/zoom) so they still fill the frame. A slow 2–4 s dolly of 200–400 px gives parallax without nausea.

## Depth of field
`AEH.prop(cam, "ADBE Camera Options Group/ADBE Camera Depth of Field").setValue(1)`, focus distance = camera-to-subject distance (`ADBE Camera Focus Distance`), aperture (`ADBE Camera Aperture`) 30–80 for a soft background. Rack focus: keyframe focus distance between two subjects over 12–20 f, "smooth".

## Moves that read as cinematic
- **Push-in**: Z +250 over 3 s, curve "smooth" (or linear for a constant drift).
- **Orbit reveal**: rig Y rotation −25° → 0° over 1.5 s, "out".
- **Handheld**: `AEH.expr(rigPosition, "wiggle", {freq: 0.7, amp: 6})` + rotation wiggle (0.5, 0.6). Subtle!
- **Crash zoom**: zoom ×1.6 in 6 f, "snap", with motion blur.

## Lights & shadows
`var l = c.layers.addLight("Key", [960, 300]); l.lightType = LightType.SPOT;` Intensity 80–120 %, add an Ambient light at 20–30 %. Shadows: light "Casts Shadows" on, layers' material option "Casts Shadows" on, and a receiving layer behind. Keep it to one key + ambient unless the user asks for more.

## Gotchas
3D layers need motion blur too. Text in 3D: enable per-character 3D only if rotating characters. Parenting to a camera rig keeps world transforms; set positions before parenting. Renderer (Classic vs Advanced 3D) is per-comp: `c.renderer` — keep the comp's current one unless the user asks.
