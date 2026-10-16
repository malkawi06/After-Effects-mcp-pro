# Architecture

```
Claude (Desktop / Code)
  │  MCP over stdio (@modelcontextprotocol/sdk)
  ▼
MCP server  server/src/index.js  (Node ≥ 18, bundled with esbuild into the .mcpb)
  │  · 14 tools, zod schemas, tool annotations, compact JSON replies
  │  · pure analysis modules: rhythm.js (beats, sections, sync score), image/WAV/MP3 helpers
  │  · OS helpers: aerender jobs, TTS, window screenshot, Caps Lock, font install
  │  · structured log: Documents/AE-Claude/logs/server.jsonl
  │  HTTP POST 127.0.0.1:47811/call  {fn, args}  + x-token (from ~/.ae-claude-bridge.json)
  ▼
CEP panel  panel/main.js  (Node inside After Effects)
  │  · rejects browser requests (Origin/Referer), wrong token (constant-time), non-JSON, bodies > 8 MB
  │  · read-only switch, raw-ExtendScript switch, call log
  │  · serialises every call (ExtendScript is single-threaded)
  │  evalScript("__aeb.call(fn, args)")
  ▼
ExtendScript host  panel/host/host.jsx  (ES3)
  · dispatcher fns: status, runJsx (one undo group), inspect, frames, audit, refFrames, renderPrep, addMarkers, checkpoint, removeItems
  · AEH library used by runJsx code (comp, layer, anim, text, shape, pivot, charBox, resetComp …)
  ▼
Adobe After Effects (DOM)            aerender (separate process for renders)
```

## Tools

| Tool | Class | Side effects |
|---|---|---|
| `ae_status` | read-only | none. Returns versions, capabilities (raw JSX allowed, read-only, layer ids, UI screenshots, TTS) and warnings (Caps Lock, version mismatch) |
| `ae_inspect` | read-only | none. Project / comp (paged) / one layer in depth |
| `ae_preview` | read-only | temp PNGs, deleted after; `ui` screenshots the AE window |
| `ae_review` | read-only* | *adds two temporary Point Controls per layer for the title-safe check and removes them in the same call |
| `ae_reference` | reversible | imports the reference, reads frames, removes the import; `markers` writes comp markers |
| `ae_run_jsx` | destructive | arbitrary ExtendScript in one undo group (Ctrl+Z reverts it). Can be disabled in the panel |
| `ae_render` | destructive | saves the project, overwrites the output file, starts aerender. Long-running: job id |
| `ae_render_status` | job control | `cancel` kills the render |
| `ae_checkpoint` | destructive (`revert`) | revert first saves a safety snapshot of the current state |
| `ae_music` | network + destructive (`remove`) | downloads only from allow-listed hosts, license checked before download |
| `ae_fonts` | network | installs OFL fonts per user (no admin); preview creates and removes a temp comp |
| `ae_memory` | destructive (`delete`) | knowledge files in Documents/AE-Claude/knowledge |
| `ae_tts` | writes a WAV | OS voices only |
| `ae_guide` | read-only | static text |

## Security model

- Bridge reachable only on 127.0.0.1 with a random 48-hex token; browser requests are refused.
- Raw ExtendScript is the main power and the main risk: the panel can switch it off, and read-only mode blocks every write call.
- Downloads: https only, allow-listed hosts (pixabay.com, freemusicarchive.org, incompetech.com, raw.githubusercontent.com via the GitHub API for fonts), content checked by magic bytes and size.
- Output paths from the model must be absolute with the expected extension (`.mp4`, `.aep`, `.wav`, `.png`) and inside `Documents/AE-Claude`. Files outside that folder are never overwritten.
- Raw ExtendScript is off until the user ticks the panel switch; the switch is stored per user, not per project.
- Logs contain tool name, timing, result and error kind, never arguments or project content.
- Limitation: `ae_run_jsx` code is not sandboxed. ExtendScript has file and system access, so the panel switches are the control, not prompt rules.
- Recipes saved with `save_as` run only through `AEH.recipe`, which is inside `ae_run_jsx`. They get no extra power, so the raw ExtendScript switch covers them too.
- Text to speech passes its text through environment variables, never the PowerShell command line, so it cannot inject commands.

### Threat model (short)

| Threat | Example | Control | Status |
|---|---|---|---|
| Prompt injection from a file or page | A downloaded note tells Claude to run code | Raw ExtendScript off by default; user ticks it on | Covered |
| Other local programs calling the bridge | A web page or app sends requests to 127.0.0.1 | Random token, timing-safe compare, browser requests refused | Covered |
| Overwriting user files through outputs | `output` set to a project file | Paths limited to `Documents/AE-Claude` | Covered |
| Malicious download as a track | A music URL returns a script | https only, allow-listed hosts, magic bytes, size limit | Covered |
| Token read by other local users | Token file readable by others | Token stored in the user profile file | Partly: depends on OS file permissions |
| Malicious code run by a recipe on disk | A file written into the recipes folder | Recipes only run inside a call the user allowed | Partly: a file-level signature is not implemented |
| Harm from the code the model writes | Deleting layers or the project | Checkpoints before risky edits | Partly: not forced yet |

## State and caching

- No project state is cached in the server. Every inspect reads live from After Effects.
- The rhythm analysis is cached per audio file, keyed by path + size + mtime (a changed file is re-analysed).
- Layer ids (`#id` in `AEH.layer` / `ae_inspect layer`) are AE's own `Layer.id` on versions that have it. A missing id raises an error and never falls back to a name. On older AE versions `layerIds` in `ae_status` is false, and names/indices are used.
- Render jobs live in memory while the server runs.

## Reliability

- One bridge call = one ExtendScript evaluation = one undo group. A failed call throws, and the undo group closes, so Ctrl+Z reverts the partial change.
- Timeout 55 s (the client's limit is 60 s). On timeout the script may still be running; the error says to check `ae_status` before retrying, so work isn't duplicated.
- Render states: running → done (+ `verified`: size and MP4 header) | failed (+ aerender log tail) | cancelled. "done" means aerender exited 0 and the file exists. `verified` is a container check, not a decode or quality check.

## Tests

- `npm test`: end-to-end tests of the bundled server against a mock bridge (`test/e2e.mjs`), plus the panel (`test/panel.cjs`) and the host library on an ExtendScript stub (`test/host.cjs`). These are **mocked**: they prove the protocol, schemas, analysis and error paths, not After Effects behaviour.
- Real After Effects checks are done live on AE 26.3 (Windows) and reported per release in CHANGELOG.md.
- `npm run bench`: token counts of tool definitions, instructions and typical replies, measured with `@anthropic-ai/tokenizer`, which is close to but not exact for current models.
