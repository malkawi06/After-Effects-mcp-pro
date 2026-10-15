# Audio sync & cutting to music

## Find the beat
`ae_reference {path: "song.mp3", markers: "Main"}` → BPM, beat grid, strong hits, and comp markers labelled 1–4 (beat in bar). Beat period in frames = period × fps. Phrase = 4 bars = 16 beats; big changes land on bar 1 of a phrase.

## Placing animation on beats
- Entrances land ON the beat: the keyframe where the element arrives = beat time. Start the move 6–10 f before.
- Cuts on strong hits (`hits` list) or bar starts; cutting on every beat feels frantic — use every 2nd or 4th beat for calm edits.
- Pulse on every beat (scale expression, works with comp markers):
```js
var m = thisComp.marker, n = m.numKeys ? m.nearestKey(time).index : 0;
if (n && m.key(n).time > time) n--;
var t = n ? time - m.key(n).time : 10, s = 8 * Math.exp(-t * 12);
value.length == 3 ? value + [s, s, 0] : value + [s, s]
```
Apply with `AEH.prop(layer,"ADBE Transform Group/ADBE Scale").expression = "...";` (paste the code as one string).

## Audio-reactive (amplitude)
Select the music layer, then run `app.executeCommand(app.findMenuCommandId("Convert Audio to Keyframes"))` (undo:false). It creates "Audio Amplitude" with sliders; drive properties with
`thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider")` mapped through `linear(x, 0, 30, 100, 130)`.

## Levels
Voice −3…0 dB, SFX −8…−12, music −14…−20 under voice, −8…−10 when alone. Duck music under voice: keyframe `ADBE Audio Levels` down 8–10 dB over 6 f before each line, back up 10 f after.

## SFX timing
Whoosh starts 4–6 f BEFORE the move peaks; impacts/pops exactly on the landing frame; risers end on the hit. Check with ae_review: cyan peaks should sit on white keyframe ticks.

## Voice-over
`ae_tts` (use `ssml:true` with `<prosody rate="-5%" pitch="+5%">` for warmer reads), then `AEH.audio(comp, file, t, 0)`. Leave 0.3–0.5 s of air before the first word.
