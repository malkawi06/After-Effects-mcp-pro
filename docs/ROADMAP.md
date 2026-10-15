# Roadmap

Agreed with the project owner (Mohammad Malkawi), October 2026.

## Who it is for
1. Mohammad's own motion-design work first, tuned to his workflow.
2. Open source on GitHub, so installation and docs must work for anyone.

## How the tool behaves
- **Activates by itself** for any After Effects, motion or video request. The skill has broad Arabic and English triggers, and the core workflow rules live in the MCP server instructions, which every session receives. (Skill loading is decided by the model, so it cannot be guaranteed; the server rules always apply.)
- **Workflow for every project**
  1. Brief.
  2. **Inspiration (automatic):** 3–5 references from prompt-motion.com, Motionographer, Vimeo Staff Picks, Dribbble and Behance (motion), plus technique cards learned earlier.
  3. **Written plan with timing:** scenes, copy, rhythm, the chosen music, and which idea came from which reference.
  4. **Styleframes** rendered in After Effects.
  5. **Approval** from the user.
  6. Build, then `ae_review` and fix until the review is clean.
  7. Show the user, get approval, then final render.

## Inspiration and learning
- The goal is to **learn ideas and techniques, not to copy**.
- Each learned technique is saved **automatically** as a card: what it is, the source, how to build it in AE, and when to use it. The user can list and delete cards.
- The user's personal style is saved **only when he asks**.
- Browsing happens in the browser on the user's computer. From prompt-motion, read the prompt behind each clip, which is cheap and informative. Videos are downloaded and analysed with `ae_reference`.
- Stored through `ae_memory` (kind `technique`, with search), with no new tool, to keep token cost down.

## Music library
- `Documents/AE-Claude/music/` plus an index. Each track records its source, license, BPM, duration, energy, loudness, mood/genre tags and cached beats.
- Royalty-free sources only, downloaded when needed. The license is checked before a track is added; anything non-commercial or no-derivatives is rejected.
- New small tool `ae_music`: `add` (auto-analysed), `search` (mood, BPM, length, energy), `use` (import into a comp and add beat markers).

## Promo video
- 30 s, 16:9, English with one Arabic scene.
- Real screen recording of After Effects being driven by Claude (recorded by the user with OBS / Win+Alt+R), combined with motion graphics built by the tool.
- The style is proposed after the inspiration step. This is the first end-to-end test of the whole system.

## Build order
1. Fix the issues found in the first live run:
   - the edge check misses small text;
   - sound with no visual hit isn't flagged;
   - false motion-blur warnings on nulls and fade solids;
   - `sourceRectAtTime` returns 0 for Arabic text;
   - flattened effect parameter groups.
2. Auto-activation and workflow rules.
3. Music library.
4. Inspiration system.
5. Promo video (end-to-end test).
6. README, repo and release.

After each phase there is a live test on a real After Effects setup, reported before moving on.
