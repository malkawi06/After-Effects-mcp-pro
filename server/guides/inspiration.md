# Inspiration: learn from references, never copy

Goal: before planning a new piece, study 3–5 strong references to learn **ideas and techniques**: structure, rhythm, transitions, type treatment, colour logic. Never reproduce a specific design, logo, character or footage.

## 0. Brief first, then a reference gallery
Never browse before you have the brief (purpose, audience, format/length, message, mood, brand, fonts, assets, music, liked/hated references). Search with the brief's words, not generic ones.
Then show the user a **gallery of 3–6 references** that match the brief (title, creator, link, one line on what is interesting) and let them pick or react ("like 2, but darker"). Their pick steers the plan. Fonts: `ae_fonts preview` with 3 options from the brief's mood (`ae_fonts install` free OFL families if the installed ones don't fit).

## 1. Recall first (cheap)
`ae_memory search {query: "<brief keywords>"}` → reuse technique cards learned before. If 3+ relevant cards exist, you may skip browsing unless the brief is new territory.

## 2. Browse (in the user's browser)
Search with the brief's keywords (product type, mood, format):

| Source | What to take | How |
|---|---|---|
| prompt-motion.com | The **prompt/skill behind** each Claude-made clip (text) and the result | Use the category filters (Kinetic type, Product UI, Charts, Shapes, Particles…). Open an entry and read its prompt |
| Motionographer (motionographer.com) | Top-tier craft: concepts, transitions, pacing | Read the article text plus watch frames |
| Vimeo Staff Picks (vimeo.com/channels/staffpicks) | Pacing, camera, editing rhythm | Watch or screenshot key moments |
| Dribbble / Behance (search "motion", "logo animation", "kinetic typography") | Styleframes, palettes, type | Shots are short loops, so screenshot them |

Budget: ≤ 5 references, ≤ 3 screenshots each. Text (prompts, articles) beats video when it explains *how*.
If a video can be downloaded legitimately, `ae_reference {path}` gives rhythm, cuts and motion peaks.

## 3. Extract technique cards (save automatically)
For each useful idea: `ae_memory save {kind: "technique", name, tags, source: <URL + creator>, content}` where content is:
```
What: one line (e.g. "Masked word-swap on a fixed baseline")
Why it works: one line (hierarchy, rhythm, surprise…)
In AE: how to build it with AEH/ExtendScript (layers, curves, timings in frames)
Use when: the kind of brief it fits
```
Tags: technique type plus mood (e.g. `transition, mask, kinetic-type, premium`). One card per technique, not per video. Don't save cards that only describe a look ("blue gradient").

## 4. Use in the plan
In the written plan, name each reference and the idea taken from it: "Transition between scenes 2→3: masked wipe (learned from <creator>, <URL>)". Then improve it: adapt to the brief, better easing, sync to the music, and never copy the composition.

The user can review cards with `ae_memory list` or `read {kind: "technique"}` and delete any card.
