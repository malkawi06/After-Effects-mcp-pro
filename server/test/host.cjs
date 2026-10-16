// Smoke-test AEH library code paths against a universal AE DOM stub (catches typos/ReferenceErrors).
const fs = require("fs");
// ExtendScript is ES3: future reserved words can't be identifiers (Node accepts them, AE refuses to load the file).
{ const RES = "abstract|boolean|byte|char|class|const|debugger|double|enum|export|extends|final|float|goto|implements|import|int|interface|long|native|package|private|protected|public|short|static|super|synchronized|throws|transient|volatile";
  const src = fs.readFileSync(process.argv[2], "utf8").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/\/\/.*$/gm, "");
  const bad = src.match(new RegExp(`\\b(?:function|var)\\s+(?:${RES})\\b|[,(]\\s*(?:${RES})\\s*[,)=]|\\.(?:${RES})\\s*\\(`, "g"));
  console.log(bad ? `FAIL ES3 reserved word used as identifier: ${bad.join(" ")}` : "PASS no ES3 reserved words as identifiers");
  if (bad) process.exitCode = 1; }
const calls = [];
function stub(path) {
  const fn = function () { calls.push(path + "()"); return stub(path + "()"); };
  return new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 1;
      if (k === "numKeys" || k === "numProperties" || k === "numLayers" || k === "numItems") return 2;
      if (k === "propertyValueType") return 2;
      if (k === "propertyType") return 1;
      if (k === "length") return 0;
      if (k === "then") return undefined;
      return stub(path + "." + String(k));
    },
    set() { return true; },
  });
}
const g = global;
g.$ = { global: g, os: "Windows", evalFile() {} };
g.app = stub("app");
["PropertyValueType", "KeyframeInterpolationType", "ParagraphJustification", "PropertyType", "Folder"].forEach((n) => (g[n] = stub(n)));
g.KeyframeEase = function (s, i) { this.speed = s; this.influence = i; };
g.Shape = function () {}; g.MarkerValue = function () {}; g.ImportOptions = function () {};
g.File = function (p) { this.exists = true; this.fsName = p; };
g.CompItem = function () {}; g.TextLayer = function () {}; g.ShapeLayer = function () {};
g.recipe = (a) => ({ ran: a });
(0, eval)(fs.readFileSync(process.argv[2], "utf8"));

const comp = stub("comp"), layer = stub("layer");
const steps = {
  curves: () => ["ease", "smooth", "out", "in", "expo", "snap", "linear", "hold"].forEach((c) => AEH.curve(stub("p"), c)),
  anim: () => AEH.anim(stub("p"), [[0, 0], [1, 100]], "out"),
  exprs: () => ["wiggle", "bounce", "loop", "pingpong", "spin", "follow", "blink"].forEach((e) => AEH.expr(stub("p"), e, { leader: "A" })),
  text: () => AEH.text(comp, "Hi", { size: 100, color: "#ff0000", justify: "left", start: 1 }),
  textAnims: () => ["rise", "drop", "pop", "blur", "fade", "typewriter", "tracking"].forEach((p) => AEH.textAnim(layer, p, { start: 0.2, by: "word" })),
  shapes: () => {
    AEH.shape(comp, "rect", { radius: 20, fill: "#ffffff", stroke: "#000000" });
    AEH.shape(comp, "ellipse", { fill: "#ffffff" });
    AEH.shape(comp, "star", { polygon: true });
    AEH.shape(comp, "path", { vertices: [[0, 0], [1, 1]], stroke: "#ffffff" });
  },
  drawOn: () => AEH.drawOn(layer, 0, 1),
  bg: () => { AEH.bg(comp); AEH.bg(comp, "#111111", "#000000", "linear"); },
  stagger: () => AEH.stagger([layer, layer], 3, 0.5),
  misc: () => { AEH.marker(layer, 1, "x"); AEH.audio(comp, "C:/a.wav", 1, -6); AEH.precompose(comp, [1], "P"); AEH.recipe("x", { a: 1 }); },
};
let ok = true;
for (const [name, f] of Object.entries(steps)) {
  try { f(); console.log("PASS", name); } catch (e) { ok = false; console.log("FAIL", name, e.message); }
}
for (const bad of [() => AEH.curve(stub("p"), "nope"), () => AEH.textAnim(layer, "nope"), () => AEH.shape(comp, "nope"), () => AEH.expr(stub("p"), "nope")]) {
  try { bad(); ok = false; console.log("FAIL expected throw"); } catch (e) { console.log("PASS throws:", e.message.slice(0, 50)); }
}
const r = JSON.parse(__aeb.call("audit", { comp: "x" }).replace(/^@file:.*/, "{}"));
console.log(r.ok ? "PASS audit dispatch" : "INFO audit (stub limits): " + r.error);
process.exit(ok ? 0 : 1);
