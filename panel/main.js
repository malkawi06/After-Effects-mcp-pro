/* Claude Bridge — CEP panel. Runs a token-protected HTTP server on 127.0.0.1 and forwards
   calls to the ExtendScript dispatcher (__aeb.call in host/host.jsx). */
(function () {
  var http = require("http"), fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
  var CFG_PATH = path.join(os.homedir(), ".ae-claude-bridge.json");
  var PORT = 47811;
  var MAX_BODY = 8 * 1024 * 1024;
  var PANEL_VERSION = "1.5.0";
  function sameToken(t) {   // constant-time compare
    var a = Buffer.from(String(t || "")), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  var $ = function (id) { return document.getElementById(id); };
  // A stale index.html (older install) may lack a switch: fall back to a safe default instead of crashing.
  var allowRaw = $("allowRaw") || { checked: true };
  try { allowRaw.checked = localStorage.getItem("allowRaw") !== "0"; } catch (e) { allowRaw.checked = true; }
  allowRaw.onchange = function () { try { localStorage.setItem("allowRaw", allowRaw.checked ? "1" : "0"); } catch (e) {} };
  var readOnly = $("readOnly") || { checked: false };
  try { readOnly.checked = localStorage.getItem("readOnly") === "1"; } catch (e) {}
  readOnly.onchange = function () { try { localStorage.setItem("readOnly", readOnly.checked ? "1" : "0"); } catch (e) {} };
  // Calls that change the project or disk. checkpoint "list" is allowed in read-only mode.
  var WRITES = { runJsx: 1, renderPrep: 1, addMarkers: 1, checkpoint: 1 };

  function log(text, isErr) {
    var box = $("log"), row = document.createElement("div");
    row.textContent = new Date().toLocaleTimeString() + "  " + text;
    if (isErr) row.className = "err";
    box.insertBefore(row, box.firstChild);
    while (box.childNodes.length > 80) box.removeChild(box.lastChild);
  }
  function setStatus(on, text) { $("dot").className = on ? "on" : ""; $("status").textContent = text; }

  // Reuse the token across restarts so a running MCP server keeps working.
  var cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8")); } catch (e) {}
  var token = cfg.token || crypto.randomBytes(24).toString("hex");

  // ExtendScript is single-threaded: serialize calls so results never interleave.
  var chain = Promise.resolve();
  function evalHost(fn, args) {
    // JSON is a valid JS literal except for U+2028/2029 — escape those.
    var lit = JSON.stringify(args || {}).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    var script = "__aeb.call(" + JSON.stringify(fn) + "," + lit + ")";
    var run = function () {
      return new Promise(function (resolve) { window.__adobe_cep__.evalScript(script, resolve); });
    };
    var p = chain.then(run, run);
    chain = p.catch(function () {});
    return p.then(function (out) {
      if (typeof out === "string" && out.indexOf("@file:") === 0) {
        var f = out.slice(6), txt = fs.readFileSync(f, "utf8");
        try { fs.unlinkSync(f); } catch (e) {}
        return txt;
      }
      return out;
    });
  }

  function send(res, code, body) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  }

  var server = http.createServer(function (req, res) {
    // Browsers always send Origin/Referer; the MCP server never does. Blocks cross-site requests outright.
    if (req.headers.origin || req.headers.referer) return send(res, 403, { ok: false, error: "browser requests are not allowed" });
    if (!sameToken(req.headers["x-token"])) return send(res, 401, { ok: false, error: "bad token" });
    if (!/^application\/json/.test(req.headers["content-type"] || "")) return send(res, 415, { ok: false, error: "JSON only" });
    if (req.method !== "POST" || req.url !== "/call") return send(res, 404, { ok: false, error: "not found" });
    var chunks = [], size = 0;
    req.on("data", function (c) { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
    req.on("end", function () {
      var msg;
      try { msg = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return send(res, 400, { ok: false, error: "bad json" }); }
      if (readOnly.checked && WRITES[msg.fn] && !(msg.fn === "checkpoint" && (msg.args || {}).action === "list")) {
        log("blocked " + msg.fn + " (read-only mode)", true);
        return send(res, 403, { ok: false, error: "Claude Bridge is in read-only mode (untick it in the panel to allow changes)." });
      }
      if (msg.fn === "runJsx" && !allowRaw.checked) {
        log("blocked runJsx (raw ExtendScript disabled)", true);
        return send(res, 403, { ok: false, error: "Raw ExtendScript is disabled in the Claude Bridge panel." });
      }
      var t0 = Date.now(), preview = msg.fn === "runJsx" ? " :: " + String((msg.args || {}).code || "").slice(0, 160) : "";
      evalHost(msg.fn, msg.args).then(function (out) {
        var ok = typeof out === "string" && out.indexOf('{"ok":true') === 0;
        log(msg.fn + " " + (Date.now() - t0) + "ms" + (ok ? "" : " ERROR") + preview, !ok);
        if (!out || out === "EvalScript error.") out = JSON.stringify({ ok: false, error: "EvalScript error (host script not loaded or a modal dialog is open)." });
        else if (ok && msg.fn === "status") {   // capability discovery: what this panel allows right now
          try { var o = JSON.parse(out); o.result.panel = { version: PANEL_VERSION, readOnly: readOnly.checked, rawJsx: allowRaw.checked }; out = JSON.stringify(o); } catch (e) {}
        }
        send(res, 200, out);
      });
    });
  });

  server.on("error", function (e) { setStatus(false, "Server error: " + e.message); log(e.message, true); });
  server.listen(PORT, "127.0.0.1", function () {
    fs.writeFileSync(CFG_PATH, JSON.stringify({ port: PORT, token: token, pid: process.pid }, null, 2));
    setStatus(true, "Listening on 127.0.0.1:" + PORT);
    log("ready");
  });
})();
