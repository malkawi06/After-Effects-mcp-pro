# Setup & usage guide

This guide takes you from zero to Claude working inside After Effects, and covers daily use, updating and troubleshooting.

After Effects MCP Pro has two parts that must both be installed:

| Part | Where it runs | What it does |
|---|---|---|
| **Claude Bridge panel** (`panel/`) | Inside After Effects (CEP extension) | Receives commands on `127.0.0.1` and runs them in AE |
| **MCP server** (`after-effects-mcp-pro.mcpb`) | Inside Claude Desktop (or any MCP client) | Gives Claude the 12 `ae_*` tools and does the analysis, rendering and TTS |

---

## 1. Requirements

- Adobe After Effects **2022 or later** (tested on 2026 / 26.3)
- **Windows 10/11** (macOS: the code supports it, but it is untested)
- **Claude Desktop** (recommended), or Claude Code / any MCP client together with Node.js 18+
- About 5 minutes

## 2. Install the panel

### Option A: installer script (recommended)

1. Download the repo: **Code → Download ZIP** and extract it, or run
   ```bash
   git clone https://github.com/malkawi06/After-Effects-mcp-pro
   ```
2. Open PowerShell in the repo folder and run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File install\install-windows.ps1
   ```
   On macOS, run `sh install/install-macos.sh`.

The script:
- copies `panel/` to `%APPDATA%\Adobe\CEP\extensions\ClaudeBridge` (macOS: `~/Library/Application Support/Adobe/CEP/extensions/ClaudeBridge`);
- sets `PlayerDebugMode = 1` for CSXS 10–12 in **your user** registry (HKCU, no admin needed). After Effects only loads unsigned panels when this is set.

### Option B: manual

1. Copy the `panel` folder to `%APPDATA%\Adobe\CEP\extensions\` and rename it `ClaudeBridge`.
2. Double-click `install\enable-cep-panels.reg` and accept the prompts.

## 3. Prepare After Effects (one time)

1. **Edit → Preferences → Scripting & Expressions** (macOS: *After Effects → Settings*).
2. Tick **Allow Scripts to Write Files and Access Network**. The bridge needs it to save preview frames.
3. **Restart After Effects.**

## 4. Install the MCP server in Claude Desktop

1. Download `after-effects-mcp-pro.mcpb` from the [Releases](https://github.com/malkawi06/After-Effects-mcp-pro/releases) page.
2. Install it in either of these ways:
   - double-click the file and press **Install**, or
   - Claude Desktop → **Settings → Extensions → Install Extension…** → choose the file.
3. If you had an older After Effects MCP installed, **turn it off** on the same page so the tools don't clash.

It runs on Claude Desktop's built-in Node, so nothing else needs installing.

<details>
<summary>Using Claude Code or another MCP client instead</summary>

```bash
cd server
npm install
npm run build
```
Then add this to your client's MCP config:
```json
{
  "mcpServers": {
    "after-effects-mcp-pro": {
      "command": "node",
      "args": ["C:/path/to/After-Effects-mcp-pro/server/dist/server/index.js"]
    }
  }
}
```
</details>

## 5. Run it

1. **Open After Effects.** The bridge starts automatically in the background.
2. To see it, go to **Window → Extensions → Claude Bridge**. Dock the panel anywhere.

   | Panel element | Meaning |
   |---|---|
   | 🟢 *Listening on 127.0.0.1:47811* | Ready |
   | 🔴 dot or an error | Not running (see Troubleshooting) |
   | **Allow Claude to run raw ExtendScript** | Untick to block arbitrary code. Inspection, preview and review keep working |
   | **Read-only** | Claude can look but not change anything |
   | Log | Every call, its duration, errors, and the first line of any code |

3. **In Claude**, start with:
   > "Check the After Effects connection."

   Claude calls `ae_status` and replies with your AE version and project. You're ready.

## 6. Everyday use

Talk to Claude normally. Examples:

| You say | Claude does |
|---|---|
| "Make a 5-second logo sting with my logo `C:\brand\logo.png`, dark and premium, with a whoosh." | Builds the comp, reviews it visually, fixes it, renders an MP4 |
| "Open my comp *Intro* and make the easing feel more professional." | Takes a checkpoint, inspects, edits only what's needed, reviews |
| "Here's a reference: `C:\refs\promo.mp4`. Rebuild it with my text." | Analyses the reference, builds, compares side by side |
| "Sync these titles to `C:\music\track.mp3`." | Detects the BPM and beats, adds markers, animates on the beats |
| "Add an English voice-over saying 'Welcome to Space Apps'." | Generates the voice with Windows TTS and places it |
| "Render it for Instagram Reels." | Makes a 1080×1920 version and renders it |
| "That looked great, save it as a recipe called `logo-pop`." | Saves it. Saving happens only when you ask |
| "Undo everything you did today." | Reverts to a checkpoint (your current state is kept as a safety checkpoint) |

**Where files go:** `Documents\AE-Claude\`
- `renders\`: MP4 outputs
- `audio\`: generated voice-overs
- `checkpoints\`: project snapshots
- `knowledge\`: lessons, style and recipes you asked to save
- `projects\`: untitled projects Claude had to save before rendering

## 7. Updating

1. Pull or download the new version, then run the installer script again. It overwrites the panel.
2. Install the new `.mcpb` in Claude Desktop. It replaces the old one.
3. Restart After Effects.

## 8. Uninstall

- Claude Desktop → Settings → Extensions → remove *After Effects MCP Pro*.
- Delete `%APPDATA%\Adobe\CEP\extensions\ClaudeBridge`.
- Optional: delete `Documents\AE-Claude` and `%USERPROFILE%\.ae-claude-bridge.json`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **Claude Bridge is missing from Window → Extensions** | The panel isn't in the CEP folder, or `PlayerDebugMode` isn't set. Run the installer again, then **fully restart** AE. |
| Panel shows a red dot or *Server error: EADDRINUSE* | Another AE instance (or an old panel) is using port 47811. Close the other AE instances and restart. |
| Claude says *Cannot reach the Claude Bridge panel* | AE isn't open, or the panel crashed. Open Window → Extensions → Claude Bridge, check for the green dot, then retry. |
| *bad token* | The panel was reinstalled while Claude Desktop kept running. Restart Claude Desktop. |
| *did not answer within 55s / modal dialog is open* | A dialog in AE is waiting (Welcome screen, Crash Repair, Save prompt, an error). Close it in AE and retry. |
| *Raw ExtendScript is disabled* | Tick **Allow Claude to run raw ExtendScript** in the panel. |
| *read-only mode* | Untick **Read-only** in the panel. |
| Preview or review fails: *Frame was not written* | Enable **Allow Scripts to Write Files and Access Network** (step 3) and restart AE. |
| Render fails: *No H.264 output module template* | Your AE has no H.264 template. Ask Claude to list templates (`AEH.catalog("templates")`) and render with another one. |
| Arabic letters appear disconnected | Preferences → Type → Text Engine: **South Asian and Middle Eastern**, then restart AE. |
| TTS voice not found | Ask Claude to run `ae_tts` with `voice: "list"` and pick an installed voice. Extra voices: Windows Settings → Time & Language → Speech. |
| AE shows *Crash Repair Options* on start | AE was force-closed last time. Press **Continue**. |
| Something went wrong in a project | Ask Claude to *list checkpoints* and revert, or use Edit → Undo. Each Claude step is a single undo. |

Still stuck? Open an [issue](https://github.com/malkawi06/After-Effects-mcp-pro/issues) with the panel log (copy it from the panel) and your AE version.

## Security notes

- The bridge listens **only on 127.0.0.1**. It needs a random 48-character token stored in `%USERPROFILE%\.ae-claude-bridge.json`. It rejects requests that come from web browsers and anything that isn't JSON.
- ExtendScript runs with After Effects' permissions, including file access. Keep **Allow raw ExtendScript** on only while you work with Claude, or use **Read-only** to let Claude look without changing anything.
- `PlayerDebugMode` lets unsigned CEP panels load. It affects every unsigned panel, not just this one.
