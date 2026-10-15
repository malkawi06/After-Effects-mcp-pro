// Run panel/main.js under Node with fake CEP + DOM, then probe its HTTP server.
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "panel-")); process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const els = {}; const el = (id) => (els[id] ||= { id, checked: false, textContent: "", className: "", childNodes: [], insertBefore(n) { this.childNodes.unshift(n); }, removeChild() { this.childNodes.pop(); }, get firstChild() { return this.childNodes[0]; }, get lastChild() { return this.childNodes.at(-1); } });
const store = {};
global.document = { getElementById: el, createElement: () => ({}) };
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
global.window = { __adobe_cep__: { evalScript: (s, cb) => setTimeout(() => cb('{"ok":true,"result":' + JSON.stringify(s.slice(0, 40)) + "}"), 5) } };
eval(fs.readFileSync(process.argv[2], "utf8"));
setTimeout(async () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(HOME, ".ae-claude-bridge.json"), "utf8"));
  const call = (body, headers = {}) => new Promise((res) => {
    const r = http.request({ host: "127.0.0.1", port: cfg.port, path: "/call", method: "POST", headers: { "content-type": "application/json", "x-token": cfg.token, ...headers } },
      (resp) => { let d = ""; resp.on("data", (c) => (d += c)); resp.on("end", () => res([resp.statusCode, d])); });
    r.end(JSON.stringify(body));
  });
  const t = [];
  t.push(["ok call", (await call({ fn: "status" }))[0] === 200]);
  t.push(["browser origin blocked", (await call({ fn: "status" }, { origin: "http://evil.com" }))[0] === 403]);
  t.push(["referer blocked", (await call({ fn: "status" }, { referer: "http://evil.com/x" }))[0] === 403]);
  t.push(["bad token", (await call({ fn: "status" }, { "x-token": "nope" }))[0] === 401]);
  t.push(["non-json rejected", (await call({ fn: "status" }, { "content-type": "text/plain" }))[0] === 415]);
  el("allowRaw").checked = false;
  t.push(["raw disabled blocks runJsx", (await call({ fn: "runJsx", args: { code: "1" } }))[0] === 403]);
  el("allowRaw").checked = true; el("readOnly").checked = true;
  t.push(["read-only blocks runJsx", (await call({ fn: "runJsx", args: { code: "1" } }))[0] === 403]);
  t.push(["read-only blocks checkpoint create", (await call({ fn: "checkpoint", args: { action: "create" } }))[0] === 403]);
  t.push(["read-only allows checkpoint list", (await call({ fn: "checkpoint", args: { action: "list" } }))[0] === 200]);
  t.push(["read-only allows inspect", (await call({ fn: "inspect" }))[0] === 200]);
  el("readOnly").checked = false;
  t.push(["runJsx allowed again", (await call({ fn: "runJsx", args: { code: "1" } }))[0] === 200]);
  t.forEach(([n, ok]) => console.log(ok ? "PASS" : "FAIL", n));
  process.exit(t.every((x) => x[1]) ? 0 : 1);
}, 300);
