// End-to-end test of the bundled MCP server against a mock Claude Bridge panel.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "aec-home-"));
const TOKEN = "t0k";
const fakeAerender = path.join(HOME, "aerender.sh");
fs.writeFileSync(fakeAerender, `#!/bin/sh
out=""; while [ $# -gt 0 ]; do [ "$1" = "-output" ] && out="$2"; shift; done
for i in 1 2 3; do echo "PROGRESS:  0:00:00:0$i ($i): 0 Seconds"; sleep 0.2; done
echo fake > "$out"`);
fs.chmodSync(fakeAerender, 0o755);

const handlers = {
  status: () => ({ aeVersion: "26.3", activeComp: "Main", dirty: true }),
  runJsx: (a) => (a.code === "boom" ? { __err: "Error: boom", line: 3 } : a.undoName === "Add music" ? { comp: "Main", layer: "x" } : { echoed: a.code, undo: a.undo ?? true }),
  inspect: (a) => ({ comp: a.comp ?? null, layer: a.layer ?? null, limit: a.limit ?? null }),
  frames: (a) => {
    const frames = a.times.map((t, i) => {
      const png = new PNG({ width: 320, height: 180 });
      for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
        const ox = 20 + Math.round(i * i * 4), p = (y * 320 + x) * 4, inSq = x >= ox && x < ox + 40 && y >= 70 && y < 110;
        png.data[p] = png.data[p + 1] = png.data[p + 2] = inSq ? 255 : 20; png.data[p + 3] = 255;
      }
      fs.mkdirSync(a.dir, { recursive: true });
      const f = path.join(a.dir, `f${i}.png`);
      fs.writeFileSync(f, PNG.sync.write(png));
      return { time: t, file: f };
    });
    return { comp: "Main", width: 320, height: 180, duration: 4, frames };
  },
  audit: () => auditMusic ? { comp: "Main", duration: 8, frameRate: 30, width: 320, height: 180, issues: ["Comp motion blur switch is off while layers move"], keyTimes: [0.5, 1.5],
    audio: [{ name: "click.wav", file: CLICK, startTime: 0, inPoint: 0, outPoint: 8, levels: [0, 0] }], cuts: [0.5, 1.5, 2.5, 3.2, 3.3], moments: [4.5] } : ({ comp: "Main", duration: 4, frameRate: 30, width: 320, height: 180, issues: ["Comp motion blur switch is off while layers move"],
    keyTimes: [0.1, 0.9, 1.75, 2.2], audio: [{ name: "hello.wav", file: WAV, startTime: 0.4, inPoint: 0.4, outPoint: 1.4, levels: [0, 0] }] }),
  refFrames: (a) => { const n = a.count || 6; const r = handlers.frames({ times: Array.from({ length: n }, (_, i) => +((i + 0.5) * 2.4 / n).toFixed(2)), dir: a.dir }); return { name: "ref.mp4", width: 320, height: 180, duration: 2.4, frameRate: 30, hasAudio: false, frames: r.frames, removeIds: [7, 8] }; },
  removeItems: (a) => { removed = a.ids; return true; },
  checkpoint: (a) => (a.action === "list" ? { checkpoints: ["x__1__a.aep"] } : a.action === "create" ? { created: "x__1__" + a.name + ".aep", saveAs: a.saveAs } : { reverted: a.id, safetyCheckpoint: "x__2__before-revert.aep" }),
  addMarkers: (a) => { markers = a; return { comp: a.comp, markers: a.times.length }; },
  renderPrep: () => ({ project: "/x.aep", comp: "Main", duration: 0.1, frameRate: 30, aerender: fakeAerender, h264Template: "H.264 - Match Render Settings - 15 Mbps" }),
};
const calls = [];
let removed = null, markers = null, auditMusic = false;
// 8 s, 120 BPM click track (44.1 kHz mono 16-bit): 50 ms 880 Hz blips every 0.5 s
const CLICK = path.join(HOME, "click.wav");
{ const rate = 44100, n = rate * 8, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / rate, ph = t % 0.5; b.writeInt16LE(ph < 0.05 ? Math.round(24000 * Math.sin(2 * Math.PI * 880 * t) * (1 - ph / 0.05)) : 0, 44 + i * 2); }
  fs.writeFileSync(CLICK, b); }
// 1 s, 16-bit mono WAV: silence then a 440 Hz burst at 0.3–0.6 s
const WAV = path.join(HOME, "hello.wav");
{ const rate = 8000, n = rate, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(i > 0.3 * rate && i < 0.6 * rate ? Math.round(20000 * Math.sin(i / rate * 2 * Math.PI * 440)) : 0, 44 + i * 2);
  fs.writeFileSync(WAV, b); }
const REFIMG = path.join(HOME, "ref.png"); { const png = new PNG({ width: 64, height: 32 }); png.data.fill(200); fs.writeFileSync(REFIMG, PNG.sync.write(png)); }
const REFVID = path.join(HOME, "ref.mp4"); fs.writeFileSync(REFVID, "x");
const mock = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    if (req.headers["x-token"] !== TOKEN) { res.writeHead(401); return res.end('{"ok":false,"error":"bad token"}'); }
    const { fn, args } = JSON.parse(b); calls.push(fn);
    const r = handlers[fn](args);
    res.end(JSON.stringify(r && r.__err ? { ok: false, error: r.__err, line: r.line } : { ok: true, result: r }));
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
fs.writeFileSync(path.join(HOME, ".ae-claude-bridge.json"), JSON.stringify({ port: mock.address().port, token: TOKEN }));

const client = new Client({ name: "test", version: "1" });
await client.connect(new StdioClientTransport({ command: "node", args: [process.argv[2]], env: { ...process.env, HOME, USERPROFILE: HOME } }));
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); if (!cond) process.exitCode = 1; };

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
check("tools listed", tools.join() === "ae_checkpoint,ae_fonts,ae_guide,ae_inspect,ae_memory,ae_music,ae_preview,ae_reference,ae_render,ae_render_status,ae_review,ae_run_jsx,ae_status,ae_tts", tools.join());
check("instructions", (client.getInstructions() || "").includes("textAnim") && client.getInstructions().includes("WAIT for") && client.getInstructions().includes("افتر"));

let r = await client.callTool({ name: "ae_status", arguments: {} });
check("status", r.content[0].text.includes("26.3"));
{ const st = JSON.parse(r.content[0].text);
  check("status: capabilities + version-mismatch warning", st.capabilities?.server === "1.6.0" && /Version mismatch/.test((st.warnings || []).join()), r.content[0].text); }
{ const lt = (await client.listTools()).tools, an = Object.fromEntries(lt.map((t) => [t.name, t.annotations || {}]));
  check("annotations: read-only vs destructive", an.ae_inspect.readOnlyHint === true && an.ae_run_jsx.destructiveHint === true && an.ae_music.openWorldHint === true); }
r = await client.callTool({ name: "ae_run_jsx", arguments: { code: "1+1", undo: false } });
check("run_jsx ok", JSON.parse(r.content[0].text).undo === false);
r = await client.callTool({ name: "ae_run_jsx", arguments: { code: "boom" } });
check("run_jsx error surfaces", r.isError && r.content[0].text === "Error: boom (line 3)", r.content[0].text);
r = await client.callTool({ name: "ae_preview", arguments: { count: 5 } });
const img = r.content.find((c) => c.type === "image");
check("preview image", img && img.mimeType === "image/jpeg" && Buffer.from(img.data, "base64").length > 1000, r.content[1]?.text);
r = await client.callTool({ name: "ae_preview", arguments: { times: [1.5] } });
check("preview single", r.content[0].type === "image");
r = await client.callTool({ name: "ae_render", arguments: { wait_seconds: 10 } });
const job = JSON.parse(r.content[0].text);
check("render done", job.status === "done" && job.progress === "3/3 frames" && fs.existsSync(job.output), r.content[0].text);
check("render output verified (fake file is not an MP4)", /not a valid MP4/.test(job.verified || ""), r.content[0].text);
r = await client.callTool({ name: "ae_render", arguments: { output: "relative/out.mp4", wait_seconds: 0 } });
check("render rejects relative output path", r.isError && /absolute \.mp4/.test(r.content[0].text), r.content[0].text);
r = await client.callTool({ name: "ae_render", arguments: { output: path.join(HOME, "outside.mp4"), wait_seconds: 0 } });
check("render rejects output outside Documents/AE-Claude", r.isError && /inside/.test(r.content[0].text), r.content[0].text);
fs.mkdirSync(path.join(HOME, "Documents/AE-Claude"), { recursive: true });
r = await client.callTool({ name: "ae_render", arguments: { output: path.join(HOME, "Documents/AE-Claude/slow.mp4"), wait_seconds: 0 } });
{ const j2 = JSON.parse(r.content[0].text);
  r = await client.callTool({ name: "ae_render_status", arguments: { job_id: j2.job_id, cancel: true } });
  check("render cancel", JSON.parse(r.content[0].text).status === "cancelled", r.content[0].text); }
r = await client.callTool({ name: "ae_inspect", arguments: { comp: "Main", layer: "#12", limit: 5 } });
check("inspect passes layer/limit to the bridge", JSON.parse(r.content[0].text).layer === "#12", r.content[0].text);
r = await client.callTool({ name: "ae_render_status", arguments: { job_id: job.job_id } });
check("render status", JSON.parse(r.content[0].text).status === "done");
r = await client.callTool({ name: "ae_tts", arguments: { text: "hi" } });
check("tts unsupported on linux -> clean error", r.isError, r.content[0].text);

r = await client.callTool({ name: "ae_review", arguments: { samples: 8 } });
const rv = r.content.find((c) => c.type === "text")?.text || "";
fs.writeFileSync(path.join(HOME, "review.jpg"), Buffer.from(r.content[0].data || "", "base64"));
check("review image+report", r.content[0].type === "image" && rv.includes("Motion:") && rv.includes("loudest around") && rv.includes("motion blur"), "\n" + rv);
const m = rv.match(/loudest around ([\d.]+)s/); check("audio peak placed on timeline (~0.85s)", m && Math.abs(Number(m[1]) - 0.85) < 0.2, m && m[1]);
r = await client.callTool({ name: "ae_reference", arguments: { path: REFIMG } });
check("reference image", r.content[0].type === "image" && r.content[1].text.includes("64x32"));
r = await client.callTool({ name: "ae_reference", arguments: { path: REFVID } });
check("reference video + cleanup", r.content[0].type === "image" && String(removed) === "7,8", r.content[1]?.text);
r = await client.callTool({ name: "ae_memory", arguments: { action: "save", kind: "style", content: "likes smooth easing, accent #FF6A3D" } });
check("memory save style", !r.isError, r.content[0].text);
r = await client.callTool({ name: "ae_memory", arguments: { action: "save", kind: "recipe", name: "Hello Wink", content: "o becomes a winking eye", code: "function recipe(a){ return 1; }" } });
check("memory save recipe", r.content[0].text.includes("hello-wink"), r.content[0].text);
r = await client.callTool({ name: "ae_memory", arguments: { action: "save", kind: "recipe", name: "bad", code: "var x=1" } });
check("memory rejects bad recipe", r.isError);
r = await client.callTool({ name: "ae_memory", arguments: { action: "list" } });
const lst = JSON.parse(r.content[0].text); check("memory list", lst.style === 1 && lst.recipes[0].startsWith("hello-wink:"), r.content[0].text);
r = await client.callTool({ name: "ae_reference", arguments: { path: CLICK, markers: "Main" } });
const bt = r.content[0].text, bpm = Number((bt.match(/~([\d.]+) BPM/) || [])[1]);
check("beats: 120 BPM detected", Math.abs(bpm - 120) < 2, bt.split("\n")[0]);
check("beats: pulse-hit markers on the clicks (120 BPM -> cut every 2 beats)", markers && Math.abs(markers.times[1] - markers.times[0] - 1) < 0.02 && markers.times[0] < 0.56 && /K|S/.test(markers.labels[0]), markers && markers.times.slice(0, 4).join(",") + " " + markers.labels.slice(0, 2));
check("rhythm map in reference", /Cut pulse (0\.99\d|1\.00\d)s/.test(bt) && /Pulse hits/.test(bt), bt);
if (process.env.MP3) { r = await client.callTool({ name: "ae_reference", arguments: { path: process.env.MP3 } }); check("beats: mp3 decode", /~1[12]\d(\.\d)? BPM/.test(r.content[0].text), r.content[0].text.split("\n")[0]); }
auditMusic = true;
r = await client.callTool({ name: "ae_review", arguments: { samples: 8, ignore: ["motion blur"] } });
{ const t = r.content[1].text;
  check("review: music sync score", /cuts on a beat hit \(±2f\) 3\/5/.test(t) && /Off-beat cuts: .*3\.20s/.test(t) && /big moments 1\/1/.test(t), t);
  check("review: too-fast cuts flagged", /Too fast for the music: 3\.2→3\.3s/.test(t), t);
  check("review: ignore hides checks", !/motion blur/i.test(t.split("Checks:")[1] || ""), t); }
auditMusic = false;
r = await client.callTool({ name: "ae_fonts", arguments: { action: "list", query: "Archivo" } });
check("fonts list via catalog", r.content[0].text.includes("AEH.catalog") && r.content[0].text.includes("Archivo"), r.content[0].text);
r = await client.callTool({ name: "ae_fonts", arguments: { action: "install" } });
check("fonts install needs families", r.isError && /families is required/.test(r.content[0].text));
r = await client.callTool({ name: "ae_preview", arguments: { ui: true } });
check("ui screenshot: clear error off Windows/macOS", process.platform === "linux" ? r.isError && /Windows and macOS/.test(r.content[0].text) : true, r.content[0].text);
r = await client.callTool({ name: "ae_review", arguments: { reference: REFVID } });
const cv = r.content.find((c) => c.type === "text")?.text || "";
check("compare: paired grid + metrics", r.content[0].type === "image" && /Layout similarity: .*average \d+%/.test(cv) && /Motion rhythm correlation: -?[\d.]+/.test(cv) && cv.includes("Colour (avg)"), "\n" + cv.split("\n").slice(1, 3).join("\n"));
check("compare: reference cleaned up", String(removed) === "7,8");
r = await client.callTool({ name: "ae_checkpoint", arguments: { action: "create", name: "before edit" } });
check("checkpoint create", JSON.parse(r.content[0].text).created.includes("before edit") && JSON.parse(r.content[0].text).saveAs.endsWith("before-edit.aep"), r.content[0].text);
r = await client.callTool({ name: "ae_checkpoint", arguments: { action: "revert", id: "x__1__a.aep" } });
check("checkpoint revert", JSON.parse(r.content[0].text).safetyCheckpoint.includes("before-revert"));
r = await client.callTool({ name: "ae_guide", arguments: { topic: "transitions" } });
check("guide loads on demand", r.content[0].text.startsWith("# Transitions"));
r = await client.callTool({ name: "ae_run_jsx", arguments: { code: "1+1", undo_name: "two", save_as: "Add Two" } });
check("run_jsx save_as recipe", JSON.parse(r.content[0].text).savedRecipe === "add-two" && fs.readFileSync(path.join(HOME, "Documents/AE-Claude/knowledge/recipes/add-two.jsx"), "utf8").includes('eval("1+1")'));
r = await client.callTool({ name: "ae_memory", arguments: { action: "save", kind: "technique", name: "Masked word swap", tags: ["kinetic-type", "transition"], source: "https://example.com/x", content: "What: words swap behind a mask on one baseline\nIn AE: track matte rect, 8f expo" } });
check("technique save", r.content[0].text.includes("masked-word-swap"));
r = await client.callTool({ name: "ae_memory", arguments: { action: "search", query: "kinetic swap" } });
check("memory search finds card", r.content[0].text.startsWith("technique masked-word-swap"), r.content[0].text);
r = await client.callTool({ name: "ae_music", arguments: { action: "add", path: CLICK, title: "Click Test", artist: "me", source: "https://example.com/t", license: "CC BY-NC 4.0", tags: ["tech"] } });
check("music rejects NC license", r.isError && r.content[0].text.includes("not allowed"));
r = await client.callTool({ name: "ae_music", arguments: { action: "add", url: "https://evil.example.com/a.mp3", source: "https://example.com/t", license: "CC BY 4.0" } });
check("music url: only allowed hosts", r.isError && r.content[0].text.includes("pixabay.com"), r.content[0].text);
r = await client.callTool({ name: "ae_music", arguments: { action: "add", url: "http://cdn.pixabay.com/a.mp3", source: "https://example.com/t", license: "CC BY 4.0" } });
check("music url: https only", r.isError && r.content[0].text.includes("https"), r.content[0].text);
r = await client.callTool({ name: "ae_music", arguments: { action: "add", path: CLICK, title: "Click Test", artist: "me", source: "https://example.com/t", license: "CC BY 4.0", tags: ["Tech", "upbeat"] } });
check("music add analyses", /120(\.\d)? BPM/.test(r.content[0].text), r.content[0].text);
r = await client.callTool({ name: "ae_music", arguments: { action: "search", query: "upbeat", bpm_min: 110, bpm_max: 130 } });
check("music search", r.content[0].text.startsWith("click-test |"), r.content[0].text);
r = await client.callTool({ name: "ae_music", arguments: { action: "use", id: "click-test", comp: "Main", start: 1 } });
check("music use adds markers + credit", r.content[0].text.includes("rhythm markers") && r.content[0].text.includes("Cut pulse") && r.content[0].text.includes("CC BY 4.0") && markers.times[0] >= 1, r.content[0].text);
r = await client.callTool({ name: "ae_guide", arguments: { topic: "music" } });
check("music + inspiration guides", r.content[0].text.startsWith("# Music library"));
r = await client.callTool({ name: "ae_memory", arguments: { action: "delete", kind: "style", match: "#FF6A3D" } });
check("memory delete line", r.content[0].text.includes("Removed 1"));
fs.writeFileSync(path.join(HOME, ".ae-claude-bridge.json"), JSON.stringify({ port: mock.address().port, token: "wrong" }));
r = await client.callTool({ name: "ae_status", arguments: {} });
check("bad token -> error", r.isError && r.content[0].text.includes("bad token"), r.content[0].text);

{ const log = fs.readFileSync(path.join(HOME, "Documents", "AE-Claude", "logs", "server.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const bad = log.find((x) => x.tool === "ae_status" && !x.ok);
  check("structured log: every call, error kind, no arguments", log.length > 30 && bad?.kind === "bridge" && !log.some((x) => "args" in x || "code" in x), `${log.length} lines`); }
await client.close(); mock.close();
console.log("bridge calls:", calls.join(","));
