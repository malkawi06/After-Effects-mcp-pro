// Token benchmark for Claude Bridge. Usage: node bench.mjs <ourServer.js> <host.jsx> [dakkshinServer.js]
// Token counts use @anthropic-ai/tokenizer (legacy Claude tokenizer) — a close proxy, not exact for current models.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(new URL("../package.json", import.meta.url));
const { countTokens } = require("@anthropic-ai/tokenizer");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const [ourServer, hostPath, dakServer] = process.argv.slice(2);
const T = (s) => countTokens(typeof s === "string" ? s : JSON.stringify(s));
const rows = [];

async function surface(server) {
  const c = new Client({ name: "bench", version: "1" });
  await c.connect(new StdioClientTransport({ command: "node", args: [server], stderr: "ignore" }));
  const tools = (await c.listTools()).tools, ins = c.getInstructions() || "";
  await c.close();
  return { n: tools.length, tools: T(tools), ins: T(ins) };
}
const ours = await surface(ourServer);
rows.push(["Tool definitions (sent every turn)", `${ours.n} tools: ${ours.tools}`, ""]);
rows.push(["Server instructions (once per session)", ours.ins, ""]);
if (dakServer) { const d = await surface(dakServer); rows.push(["Dakkshin after-effects-mcp tool definitions", `${d.n} tools: ${d.tools}`, ""]); }

// --- code Claude has to write for the same clip ---
const raw = fs.readFileSync(new URL("./HelloWink_raw.jsx", import.meta.url), "utf8");
const aeh = fs.readFileSync(new URL("./hello_aeh.jsx", import.meta.url), "utf8");
rows.push(["Hello-wink clip: raw ExtendScript", T(raw), ""]);
rows.push(["Hello-wink clip: with AEH library", T(aeh), `${Math.round((1 - T(aeh) / T(raw)) * 100)}% fewer`]);

// --- ae_inspect output on a realistic comp, via the real host code + a fake AE DOM ---
class CompItem {} class TextLayer {} class ShapeLayer {} class CameraLayer {} class LightLayer {} class SolidSource {} class FootageItem {}
const P = (matchName, name, keys = 0, expr = null) => ({ matchName, name, propertyType: 1, numKeys: keys, keyTime: (k) => k * 0.25,
  canSetExpression: true, expressionEnabled: !!expr, expression: expr || "" });
const G = (matchName, name, kids) => ({ matchName, name, propertyType: 2, numProperties: kids.length,
  property: (x) => (typeof x === "number" ? kids[x - 1] : kids.find((k) => k.matchName === x || k.name === x)) });
const tr = (keys = {}) => G("ADBE Transform Group", "Transform", ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"]
  .map((m) => P(m, m.replace("ADBE ", ""), keys[m] || 0)));
function L(Kind, name, props, extra = {}) {
  const l = Object.assign(Object.create(Kind.prototype), { name, enabled: true, inPoint: 0, outPoint: 4, startTime: 0, parent: null, threeDLayer: false,
    nullLayer: false, adjustmentLayer: false, hasAudio: false, hasVideo: true, source: null }, extra);
  const groups = [tr(props.tr), G("ADBE Effect Parade", "Effects", (props.fx || []).map((f) => G(f, f, [P(f + "-1", "p1"), P(f + "-2", "p2")])))];
  if (props.more) groups.push(...props.more);
  Object.assign(l, G("layer", name, groups));
  if (Kind === TextLayer) {
    const tp = G("ADBE Text Properties", "Text", [{ matchName: "ADBE Text Document", name: "Source Text", propertyType: 1, numKeys: 0, value: { text: name } },
      G("ADBE Text Animators", "Animators", [G("ADBE Text Animator", "Reveal", [G("ADBE Text Selectors", "Sel", [P("ADBE Text Percent Offset", "Offset", 2)])])])]);
    const base = l.property; l.property = (x) => (x === "ADBE Text Properties" ? tp : base(x)); l.numProperties++; const bp = l.property;
    l.property = (x) => (x === groups.length + 1 ? tp : bp(x));
  }
  return l;
}
const rig = L(class Null {}, "Rig", { tr: { "ADBE Scale": 3, "ADBE Rotate Z": 3 } }, { nullLayer: true });
const solid = { name: "BG", mainSource: Object.create(SolidSource.prototype) };
const layers = [
  L(ShapeLayer, "Sparkle", { tr: { "ADBE Scale": 4, "ADBE Rotate Z": 2 } }, { parent: rig }),
  L(ShapeLayer, "Lid (wink)", { tr: { "ADBE Scale": 5 } }, { parent: rig }),
  L(ShapeLayer, "Eye (o)", { tr: { "ADBE Scale": 5 }, more: [G("ADBE Root Vectors Group", "Contents", [P("ADBE Vector Trim End", "End", 2)])] }, { parent: rig }),
  L(TextLayer, "Hell", {}, { parent: rig }),
  rig,
  L(class Solid {}, "Fade Out", { tr: { "ADBE Opacity": 2 } }, { source: solid }),
  L(class Solid {}, "BG", { fx: ["ADBE Ramp", "ADBE Noise"] }, { source: solid }),
  ...["whoosh.wav", "hello.wav", "wink_chime.wav"].map((n) => L(class Aud {}, n, {}, { hasAudio: true, hasVideo: false, source: { name: n } })),
];
const comp = Object.assign(Object.create(CompItem.prototype), { name: "Hello Wink", id: 1, width: 1920, height: 1080, duration: 4, frameRate: 30,
  bgColor: [0, 0, 0], workAreaStart: 0, workAreaDuration: 4, numLayers: layers.length, layer: (i) => layers[i - 1] });
Object.assign(globalThis, { CompItem, TextLayer, ShapeLayer, CameraLayer, LightLayer, SolidSource, FootageItem,
  PropertyType: { PROPERTY: 1 }, $: { global: globalThis, os: "Windows" },
  app: { project: { numItems: 1, item: () => comp, activeItem: comp, file: null, dirty: true } } });
(0, eval)(fs.readFileSync(hostPath, "utf8"));
const out = JSON.parse(globalThis.__aeb.call("inspect", { comp: "Hello Wink" })).result;
rows.push(["ae_inspect on the Hello comp (pretty JSON)", T(JSON.stringify(out, null, 2)), ""]);
rows.push(["ae_inspect on the Hello comp (compact JSON)", T(JSON.stringify(out)), ""]);

// --- images: Claude bills ~ w*h/750 tokens after downscaling to <=1568 px long edge (~1.15 MP cap) ---
const imgTok = (w, h) => { const s = Math.min(1, 1568 / Math.max(w, h)); w *= s; h *= s; const k = Math.min(1, Math.sqrt(1.15e6 / (w * h))); return Math.round(w * k * h * k / 750); };
const sheet = (n, tileW, maxCols, strip = 0) => { const cols = n === 1 ? 1 : n <= 4 ? 2 : Math.min(maxCols, n), rows_ = Math.ceil(n / cols), gap = n === 1 ? 0 : 4, th = Math.round(tileW * 1080 / 1920);
  return [cols * tileW + (cols - 1) * gap, rows_ * th + (rows_ - 1) * gap + strip]; };
const cfg = JSON.parse(process.env.BENCH_IMG || '{"preview":[6,480,3],"single":[1,1024,1],"review":[12,320,4]}');
for (const [k, [n, tw, mc]] of Object.entries(cfg)) { const [w, h] = sheet(n, tw, mc, k === "review" ? 150 : 0); rows.push([`image: ${k} (${n} frame${n > 1 ? "s" : ""}) ${w}x${h}`, imgTok(w, h), ""]); }

console.log(JSON.stringify(rows));
