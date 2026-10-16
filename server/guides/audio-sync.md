# Audio sync & cutting to music (top priority)

## 1. Read the music before planning
`ae_music use {id, comp, drop_at: 9.6}` (or `ae_reference {path}` for a file) returns the **rhythm map**:
- **Cut pulse** — how often a cut may happen. Above ~115 BPM it is every 2 beats.
- **Sections** — quiet / mid / loud spans, in comp time.
- **Drops / Breaks** — where the energy jumps in or falls away.
- **Pulse hits** — the strongest beats (K = kick, S = snare/clap, K+S = both, `!` = very strong).
It also drops typed comp markers (pulse hits, DROP, BREAK, quiet/mid/loud). `drop_at` trims the track so its first drop lands where the story needs it; `offset` trims by seconds.

## 2. Plan the timing on the map, not on a BPM grid
- **Every cut and every big move lands on a pulse hit.** Write the plan as a table: scene → hit time → what lands there.
- **Quiet sections:** long, smooth moves (`smooth` / `out`, one full pulse or more), holds, slow pushes; no cut faster than the cut pulse; no slams or shakes.
- **Loud sections:** cuts on pulse hits; secondary hits (a punch-in, a word) on the beats in between. Never faster than one beat.
- **Drop:** the biggest change of the piece (cut, flash, colour flip) on the drop's frame.
- **Break:** land a statement on its first hit, then hold or drift; build back into the return.
- Entrances: the arrival frame = the hit (an ease-out entrance starts on the hit; an ease-in move ends on it).
- Text needs time: ≥ 1 pulse on screen for 3 words; numbers that count up should finish on a hit.

## 3. Verify, then fix
`ae_review` scores every cut (layer in-point, also inside precomps) and every coordinated moment (3+ keyframes on one frame) against the beat hits (±2 frames), and lists off-beat and too-fast items. The strip shows beat hits (red = pulse, grey = other beats) and cuts (yellow) under the frames. Fix every item it lists before showing the user. Intentional exceptions: say why.

## Pulse expression (optional)
```js
var m = thisComp.marker, n = m.numKeys ? m.nearestKey(time).index : 0;
if (n && m.key(n).time > time) n--;
var t = n ? time - m.key(n).time : 10, s = 8 * Math.exp(-t * 12);
value.length == 3 ? value + [s, s, 0] : value + [s, s]
```

## Audio-reactive (amplitude)
Select the music layer, then `app.executeCommand(app.findMenuCommandId("Convert Audio to Keyframes"))` (undo:false); drive props with `thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider")` through `linear(x, 0, 30, 100, 130)`.

## Levels
Voice −3…0 dB, SFX −8…−12, music −14…−20 under voice, −2…−8 when alone. Duck under voice: −8…−10 dB over 6 f before each line, back 10 f after. Fade the last 0.5 s.

## SFX & voice
Whoosh starts 4–6 f before the move peaks; impacts on the landing frame; risers end on the hit. `ae_tts` (`ssml:true`, `<prosody rate="-5%">`), then `AEH.audio(comp, file, t, 0)`; leave 0.3–0.5 s before the first word.
