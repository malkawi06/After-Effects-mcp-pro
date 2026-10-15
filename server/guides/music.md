# Music library

Library: `Documents/AE-Claude/music/` (tracks + index.json). Always `ae_music search` first; only look online when nothing fits.

## Finding a track
Pick the mood from the plan (e.g. "cinematic tech, builds up, 30 s"), then browse in the user's browser (built-in browser or Claude in Chrome):

| Source | License | Credit | Notes |
|---|---|---|---|
| Pixabay Music (pixabay.com/music) | Pixabay Content License: commercial OK, no attribution | not required | Some tracks are in YouTube Content ID, so claims can happen even when use is legal. Prefer tracks without the Content ID notice and tell the user |
| Free Music Archive (freemusicarchive.org) | Creative Commons, per track | required for CC BY | Use the License filter. Only **CC BY, CC0 or public domain**. Never NC, ND or "FMA-Limited" (no video) |
| Incompetech (incompetech.com) | CC BY 4.0 | "Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0" | Check the credit line on the track page |

Rules:
- Read the license **on the track page** and pass its exact name to `ae_music add`. If the license is unclear, skip the track.
- Downloads land in the user's Downloads folder. If a site needs a login or a captcha, ask the user to download the file and give you the path.
- Choose length ≥ the piece; trim in AE, never stretch.

## Adding
`ae_music add {path, title, artist, source: <track page URL>, license, tags: [mood, genre, use]}`. Tags in lowercase English: e.g. `cinematic, tech, upbeat, calm, dark, epic, corporate, arabic, lofi, electronic, piano, build-up, logo`.
The tool measures BPM, beats, loudness, energy (low/mid/high) and an 8-part energy curve. You don't hear the music: judge mood from the source's tags and description, and pace from the BPM and curve.

## Using
`ae_music use {id, comp, start, db}` imports the track and drops beat markers (labels 1–4 = beat in bar). Then:
- Cut and land hits on markers; big changes on bar 1 (label "1").
- Use the energy curve: put the reveal where the curve peaks; quiet parts under text-heavy beats.
- Music around −14 dB alone, −18 to −20 dB under voice.
- Fade the last 0.5–1 s (audio levels keyframes), or end on a natural phrase end.
- If the license needs credit, add the credit line the tool returns to the description or end card, and tell the user.
