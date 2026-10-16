// Claude Bridge for After Effects — MCP server (stdio).
// Talks to the Claude Bridge CEP panel over 127.0.0.1 HTTP (port + token in ~/.ae-claude-bridge.json).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { MPEGDecoder } from "mpg123-decoder";
import gTransitions from "../guides/transitions.md";
import gTypography from "../guides/typography.md";
import gCamera from "../guides/camera-3d.md";
import gAudio from "../guides/audio-sync.md";
import gExpressions from "../guides/expressions.md";
import gDeliver from "../guides/deliver.md";
import gReference from "../guides/reference.md";
import gMatch from "../guides/matchnames.md";
import gInspire from "../guides/inspiration.md";
import gMusic from "../guides/music.md";
import { analyseBeats, analyseRhythm, toComp, rhythmMap, keyHits, scoreSync, syncReport } from "./rhythm.js";

const CFG_PATH = path.join(os.homedir(), ".ae-claude-bridge.json");
const WORK_DIR = path.join(os.homedir(), "Documents", "AE-Claude");
const SERVER_VERSION = "1.5.0";
const CALL_TIMEOUT_MS = 55_000;           // stay under the client's 60 s request timeout
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- bridge client ----------------
class BridgeError extends Error {}

async function bridge(fn, args = {}) {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8")); }
  catch { throw new BridgeError("Claude Bridge panel has never started. In After Effects open Window > Extensions > Claude Bridge."); }
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${cfg.port}/call`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-token": cfg.token },
      body: JSON.stringify({ fn, args }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (e) {
    throw new BridgeError(e.name === "TimeoutError"
      ? `After Effects did not answer within ${CALL_TIMEOUT_MS / 1000}s (busy, or a modal dialog is open). A long script may still be running: wait, then ae_status. Split heavy builds (≤ 40 new layers per call, keyframes instead of per-layer expressions).`
      : "Cannot reach the Claude Bridge panel. Is After Effects open with Window > Extensions > Claude Bridge?");
  }
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!body.ok) throw new BridgeError(body.error + (body.line != null ? ` (line ${body.line})` : ""));
  return body.result;
}

const text = (t) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message || e) }] });
const tool = (handler) => async (args) => { try { return await handler(args); } catch (e) { return fail(e); } };
// Output paths from the model: absolute, expected extension, no traversal tricks. undefined passes through.
function checkOut(p, ext) {
  if (p == null) return p;
  if (!path.isAbsolute(p) || path.normalize(p) !== path.resolve(p) || path.extname(p).toLowerCase() !== ext)
    throw new Error(`Output path must be an absolute ${ext} path`);
  return path.resolve(p);
}

// Structured log (JSON lines, no arguments or project content): Documents/AE-Claude/logs/server.jsonl, rotated at 1 MB.
const LOG = path.join(WORK_DIR, "logs", "server.jsonl");
let opSeq = 0;
function logOp(rec) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1 << 20) fs.renameSync(LOG, LOG + ".1");
    fs.appendFileSync(LOG, JSON.stringify(rec) + "\n");
  } catch {}
}
const errKind = (m) => (/Cannot reach|did not answer|never started|bad token/.test(m) ? "bridge"
  : /required|must|not allowed|Unknown|not found|No track|no longer exists|Invalid/i.test(m) ? "validation" : "app");

// ---------------- image helpers (preview) ----------------
async function waitForFile(file, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < end) {
    const size = fs.existsSync(file) ? fs.statSync(file).size : -1;
    if (size > 0 && size === last) return;
    last = size;
    await sleep(150);
  }
  throw new Error(`Frame was not written: ${file}`);
}

// Bilinear resize of an RGBA PNG onto an RGB canvas, alpha composited over a dark grey.
function blit(src, dst, dstW, ox, oy, w, h) {
  const sx = src.width / w, sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(src.height - 1, (y + 0.5) * sy - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(src.height - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(src.width - 1, (x + 0.5) * sx - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(src.width - 1, x0 + 1), wx = fx - x0;
      const di = ((oy + y) * dstW + ox + x) * 4;
      const a = (i) => src.data[i];
      const i00 = (y0 * src.width + x0) * 4, i01 = (y0 * src.width + x1) * 4, i10 = (y1 * src.width + x0) * 4, i11 = (y1 * src.width + x1) * 4;
      const alpha = ((a(i00 + 3) * (1 - wx) + a(i01 + 3) * wx) * (1 - wy) + (a(i10 + 3) * (1 - wx) + a(i11 + 3) * wx) * wy) / 255;
      for (let c = 0; c < 3; c++) {
        const v = (a(i00 + c) * (1 - wx) + a(i01 + c) * wx) * (1 - wy) + (a(i10 + c) * (1 - wx) + a(i11 + c) * wx) * wy;
        dst[di + c] = v * alpha + 40 * (1 - alpha);
      }
      dst[di + 3] = 255;
    }
  }
}

const readPng = (f) => PNG.sync.read(fs.readFileSync(f));
function readImage(file) {
  const buf = fs.readFileSync(file);
  if (/\.png$/i.test(file)) return PNG.sync.read(buf);
  if (/\.jpe?g$/i.test(file)) return jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  throw new Error("Only PNG/JPG images can be read directly; use a video path for frame analysis.");
}

// Raw RGBA grid of frames (left-to-right, top-to-bottom).
function sheetRaw(frames, tileW, maxCols = 3) {
  const cols = frames.length === 1 ? 1 : frames.length <= 4 ? 2 : Math.min(maxCols, frames.length);
  const rows = Math.ceil(frames.length / cols), gap = frames.length === 1 ? 0 : 4;
  const tileH = Math.round(tileW * frames[0].height / frames[0].width);
  const W = cols * tileW + (cols - 1) * gap, H = rows * tileH + (rows - 1) * gap;
  const data = Buffer.alloc(W * H * 4, 255);
  frames.forEach((fr, i) => blit(fr, data, W, (i % cols) * (tileW + gap), Math.floor(i / cols) * (tileH + gap), tileW, tileH));
  return { data, W, H, cols };
}
const toJpeg = (data, W, H) => Buffer.from(jpeg.encode({ data, width: W, height: H }, 82).data).toString("base64");

function contactSheet(pngFiles, tileW) {
  const s = sheetRaw(pngFiles.map(readPng), tileW);
  return { jpeg: Buffer.from(jpeg.encode({ data: s.data, width: s.W, height: s.H }, 82).data), cols: s.cols };
}

// ---------------- frame analysis ----------------
// Grey thumbnail (box average) for cheap comparisons.
function thumb(img, w = 96, hFixed = 0) {
  const h = hFixed || Math.max(1, Math.round(w * img.height / img.width)), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * img.width / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.width / w));
    const y0 = Math.floor(y * img.height / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.height / h));
    let s = 0, n = 0;
    for (let yy = y0; yy < y1; yy += 2) for (let xx = x0; xx < x1; xx += 2) {
      const i = (yy * img.width + xx) * 4, a = img.data[i + 3] / 255;
      s += (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) * a + 40 * (1 - a); n++;
    }
    out[y * w + x] = s / n;
  }
  let mean = 0; for (const v of out) mean += v; mean /= out.length;
  let sd = 0; for (const v of out) sd += (v - mean) ** 2; sd = Math.sqrt(sd / out.length);
  // z-scored copy: fades/brightness ramps cancel out, so "motion" means things actually moving or changing shape
  const z = new Float32Array(out.length); if (sd > 2) for (let i = 0; i < out.length; i++) z[i] = (out[i] - mean) / sd;
  return { g: out, z, mean, sd, w, h };
}
function frameFlags(t) {
  const { g, w, h } = t, flags = [];
  if (t.sd < 2) flags.push("looks empty/flat");
  const corners = [g[0], g[w - 1], g[(h - 1) * w], g[h * w - 1]].sort((a, b) => a - b), bgL = (corners[1] + corners[2]) / 2;
  const band = Math.max(1, Math.round(w * 0.03));
  let hit = 0, tot = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= band && x < w - band && y >= band && y < h - band) continue;
    tot++; if (Math.abs(g[y * w + x] - bgL) > 45) hit++;
  }
  if (hit / tot > 0.04) flags.push("content touches the frame edge (outside 3% margin)");
  return flags;
}
// Average colour of an RGBA image (sparse sampling) as #rrggbb.
function meanHex(img) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < img.data.length; i += 4 * 97) { r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
  return "#" + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("");
}
// Layout similarity of two thumbs (same size): 100% = identical structure, independent of brightness.
const similarity = (a, b) => { let s = 0; for (let i = 0; i < a.z.length; i++) s += Math.abs(a.z[i] - b.z[i]); return Math.max(0, 1 - s / a.z.length / 1.2); };
const pearson = (x, y) => {
  const n = Math.min(x.length, y.length); if (n < 3) return null;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n, my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
};
const motionEnergy = (a, b) => { let s = 0; for (let i = 0; i < a.z.length; i++) s += Math.abs(a.z[i] - b.z[i]); return 20 * s / a.z.length; };

// ---------------- WAV envelope ----------------
function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV");
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      let format = b.readUInt16LE(p + 8);
      if (format === 0xfffe) format = b.readUInt16LE(p + 32);
      fmt = { format, channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    } else if (id === "data") data = { start: p + 8, size: Math.min(size, b.length - p - 8) };
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV missing fmt/data");
  const bps = fmt.bits / 8, frameBytes = bps * fmt.channels, n = Math.floor(data.size / frameBytes);
  const read = fmt.format === 3 ? (o) => b.readFloatLE(o)
    : fmt.bits === 16 ? (o) => b.readInt16LE(o) / 32768 : fmt.bits === 24 ? (o) => b.readIntLE(o, 3) / 8388608
    : fmt.bits === 32 ? (o) => b.readInt32LE(o) / 2147483648 : fmt.bits === 8 ? (o) => (b.readUInt8(o) - 128) / 128 : null;
  if (!read) throw new Error(`unsupported WAV bit depth ${fmt.bits}`);
  return { rate: fmt.rate, n, sample: (i) => read(data.start + i * frameBytes) };
}
async function decodeAudio(file) {
  if (/\.wav$/i.test(file)) return readWav(file);
  if (!/\.mp3$/i.test(file)) throw new Error("audio analysis supports WAV and MP3");
  const d = new MPEGDecoder(); await d.ready;
  const r = d.decode(new Uint8Array(fs.readFileSync(file))); d.free();
  const [L, R] = r.channelData;
  return { rate: r.sampleRate, n: r.samplesDecoded, sample: R ? (i) => (L[i] + R[i]) / 2 : (i) => L[i] };
}
// Beat grid + rhythm per audio file, cached by path/size/mtime (decoding a 3-min MP3 costs ~1 s).
const rhythmCache = new Map();
async function rhythmOf(file) {
  const st = fs.statSync(file), key = `${file}|${st.size}|${st.mtimeMs}`;
  if (!rhythmCache.has(key)) {
    const dec = await decodeAudio(file), beat = analyseBeats(dec);
    rhythmCache.set(key, { beat, rhythm: analyseRhythm(dec, beat) });
  }
  return rhythmCache.get(key);
}
// RMS per timeline bin for audio layers ([{file,startTime,inPoint,outPoint,levels}]); returns {env, notes}.
async function audioEnvelope(layers, duration, bins) {
  const env = new Float32Array(bins), notes = [], peaks = [];
  for (const L of layers) {
    let w; try { w = await decodeAudio(L.file); } catch (e) { notes.push(`${L.name}: ${e.message}`); continue; }
    const gain = Math.pow(10, (Math.max(...(L.levels || [0])) || 0) / 20);
    let peakT = 0, peakV = 0;
    for (let i = 0; i < bins; i++) {
      const t0 = i * duration / bins, t1 = (i + 1) * duration / bins;
      const a = Math.max(t0, L.inPoint), z = Math.min(t1, L.outPoint);
      if (z <= a) continue;
      const s0 = Math.max(0, Math.floor((a - L.startTime) * w.rate)), s1 = Math.min(w.n, Math.floor((z - L.startTime) * w.rate));
      let s = 0, c = 0;
      for (let k = s0; k < s1; k += 8) { const v = w.sample(k); s += v * v; c++; }
      const rms = c ? Math.sqrt(s / c) * gain : 0;
      env[i] = Math.max(env[i], rms);
      if (rms > peakV) { peakV = rms; peakT = (t0 + t1) / 2; }
    }
    notes.push(`${L.name}: starts ${L.startTime.toFixed(2)}s, loudest around ${peakT.toFixed(2)}s`);
    peaks.push({ name: L.name, t: peakT, start: L.inPoint, short: L.outPoint - L.inPoint < 3 });
  }
  return { env, notes, peaks };
}

// Timeline strip under the sheet: motion (orange), keyframes (white), audio (cyan), 1 s grid.
function drawStrip(W, duration, { energies, sampleTimes, keyTimes = [], env = null, refEnergies = null, hits = null, cuts = [] }) {
  const H = 150, d = Buffer.alloc(W * H * 4);
  const fill = (x, y, w, h, c) => {
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      const i = (yy * W + xx) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  };
  const X = (t) => Math.round(Math.min(Math.max(t / duration, 0), 1) * (W - 1));
  fill(0, 0, W, H, [24, 24, 24]);
  for (let s = 0; s <= duration; s += 1) fill(X(s), 0, 1, H, [70, 70, 70]);
  const maxE = Math.max(1e-6, ...energies);
  energies.forEach((e, i) => {
    const x0 = X(sampleTimes[i]), x1 = X(sampleTimes[i + 1]), h = Math.round(55 * e / maxE);
    fill(x0 + 1, 62 - h, Math.max(1, x1 - x0 - 2), h, [255, 140, 60]);
  });
  for (const t of keyTimes) fill(X(t), 68, 1, 12, [235, 235, 235]);
  if (refEnergies) {   // reference motion (violet), drawn downward so the two rhythms read like a mirror
    const m = Math.max(1e-6, ...refEnergies);
    refEnergies.forEach((e, i) => {
      const x0 = X(sampleTimes[i]), x1 = X(sampleTimes[i + 1]);
      fill(x0 + 1, 88, Math.max(1, x1 - x0 - 2), Math.round(55 * e / m), [170, 120, 255]);
    });
  }
  if (env) {
    const m = Math.max(1e-6, ...env);
    env.forEach((v, i) => { const h = Math.round(30 * v / m); fill(Math.round(i * W / env.length), 115 - h, Math.max(1, Math.ceil(W / env.length)), 2 * h + 1, [80, 210, 230]); });
  }
  // Beat hits (bottom row: red = pulse hit, grey = other beat) and cuts (yellow) — they should line up.
  if (hits) for (const [t, , s, onPulse] of hits) fill(X(t), 150 - Math.round(4 + 10 * s), 2, Math.round(4 + 10 * s), onPulse ? [255, 70, 60] : [120, 120, 120]);
  for (const t of cuts) fill(X(t), 82, 2, 10, [255, 220, 60]);
  return { data: d, H };
}
function stack(a, aH, b, bH, W) { return { data: Buffer.concat([a.subarray(0, W * aH * 4), b.subarray(0, W * bH * 4)]), H: aH + bH }; }

function motionSummary(times, energies, thumbs = []) {
  if (!energies.length) return "";
  const max = Math.max(...energies), med = [...energies].sort((a, b) => a - b)[Math.floor(energies.length / 2)];
  const span = (i) => `${times[i]}–${times[i + 1]}s`;
  const peaks = energies.map((e, i) => [e, i]).filter(([e]) => e >= 0.6 * max && max > 0.5).map(([, i]) => span(i));
  const still = energies.map((e, i) => [e, i]).filter(([e]) => e < 0.25).map(([, i]) => span(i));
  const cuts = energies.map((e, i) => [e, i]).filter(([e]) => med > 0 && e > 4 * med && e > 12).map(([, i]) => span(i));
  const fades = thumbs.slice(1).map((t, i) => [Math.abs(t.mean - thumbs[i].mean), i]).filter(([d]) => d > 6).map(([, i]) => span(i));
  return [peaks.length && `most motion: ${peaks.join(", ")}`, still.length && `still/holds: ${still.join(", ")}`,
    cuts.length && `possible cuts/hard changes: ${cuts.join(", ")}`, fades.length && `brightness change (fade?): ${fades.join(", ")}`]
    .filter(Boolean).join("; ") + `\nmotion per interval: ${energies.map((e) => e.toFixed(1)).join(" ")}`;
}

async function analyseFrames(files, tileW, maxCols) {
  for (const f of files) await waitForFile(f);
  const imgs = files.map(readPng), thumbs = imgs.map((i) => thumb(i));
  const energies = thumbs.slice(1).map((t, i) => motionEnergy(thumbs[i], t));
  return { imgs, thumbs, energies, sheet: sheetRaw(imgs, tileW, maxCols) };
}

// ---------------- render jobs (aerender in background) ----------------
const jobs = new Map();
let jobSeq = 0;

function startRender(prep, output) {
  const id = `r${++jobSeq}`;
  const total = Math.round(prep.duration * prep.frameRate);
  const job = { id, status: "running", output, comp: prep.comp, total, frame: 0, started: Date.now(), tail: [] };
  const args = ["-project", prep.project, "-comp", prep.comp, "-output", output, "-OMtemplate", prep.h264Template];
  const child = spawn(prep.aerender, args, { windowsHide: true });
  const onData = (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      const m = line.match(/PROGRESS:.*\((\d+)\)/);
      if (m) job.frame = Number(m[1]);
      if (line.trim()) { job.tail.push(line.trim()); if (job.tail.length > 15) job.tail.shift(); }
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", (e) => { job.status = "failed"; job.tail.push(String(e)); });
  child.on("close", (code) => {
    job.seconds = Math.round((Date.now() - job.started) / 100) / 10;
    if (job.status === "cancelled") return;
    if (code !== 0 || !fs.existsSync(output)) { job.status = "failed"; return; }
    job.status = "done";
    job.verified = verifyMp4(output);   // file exists ≠ valid video: check size and the MP4 container header
  });
  job.cancel = () => { if (job.status === "running") { job.status = "cancelled"; child.kill(); } };
  jobs.set(id, job);
  return job;
}

// Basic output check: non-trivial size and an ISO-BMFF 'ftyp' box at the start. Not a decode test.
function verifyMp4(file) {
  try {
    const st = fs.statSync(file), fd = fs.openSync(file, "r"), b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
    const ok = st.size > 1024 && b.toString("ascii", 4, 8) === "ftyp";
    return ok ? `mp4 container ok, ${(st.size / 1048576).toFixed(1)} MB` : `not a valid MP4 (${st.size} bytes)`;
  } catch (e) { return `cannot read output: ${e.message}`; }
}
function jobReport(job) {
  const r = { job_id: job.id, status: job.status, comp: job.comp, output: job.output,
    progress: job.total ? `${Math.min(job.frame, job.total)}/${job.total} frames` : `${job.frame} frames` };
  if (job.seconds) r.seconds = job.seconds;
  if (job.verified) r.verified = job.verified;
  if (job.status === "failed") r.log = job.tail.join("\n");
  return r;
}

// ---------------- TTS ----------------
function tts({ text: t, voice, rate, ssml, out }) {
  return new Promise((resolve, reject) => {
    if (process.platform === "darwin") {
      const a = ["-o", out, "--data-format=LEI16@44100"];
      if (voice) a.push("-v", voice);
      a.push(t);
      return execFile("say", a, (e) => (e ? reject(e) : resolve(out)));
    }
    if (process.platform !== "win32") return reject(new Error("TTS supports Windows and macOS only."));
    const ps = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "if ($env:AEC_LIST -eq '1') { $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + ' | ' + $_.VoiceInfo.Culture + ' | ' + $_.VoiceInfo.Gender }; exit }",
      "if ($env:AEC_VOICE) { $s.SelectVoice($env:AEC_VOICE) }",
      "$s.Rate = [int]$env:AEC_RATE",
      "$s.SetOutputToWaveFile($env:AEC_OUT)",
      "if ($env:AEC_SSML -eq '1') { $s.SpeakSsml($env:AEC_TEXT) } else { $s.Speak($env:AEC_TEXT) }",
      "$s.Dispose()",
    ].join("; ");
    // Text travels via env vars, never through the command line, so it can't inject PowerShell.
    const env = { ...process.env, AEC_TEXT: t || "", AEC_VOICE: voice && voice !== "list" ? voice : "",
      AEC_RATE: String(rate ?? 0), AEC_SSML: ssml ? "1" : "0", AEC_OUT: out || "", AEC_LIST: voice === "list" ? "1" : "0" };
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { env, windowsHide: true, timeout: 50_000 },
      (e, stdout, stderr) => (e ? reject(new Error(stderr || e.message)) : resolve(voice === "list" ? stdout.trim() : out)));
  });
}

// ---------------- OS helpers: window screenshot, Caps Lock ----------------
const run = (cmd, args, env = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, { env: { ...process.env, ...env }, windowsHide: true, timeout: 30_000 },
    (e, stdout, stderr) => (e ? reject(new Error((stderr || e.message).trim())) : resolve(stdout.trim()))));
const PS = (script, env) => run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], env);

// Only the After Effects window (PrintWindow also works when it is behind other windows). Output path via env var.
const WIN_SHOT = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class AecW{[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);[DllImport("user32.dll")]public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint f);[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);public struct RECT{public int L,T,R,B;}}'
[AecW]::SetProcessDPIAware() | Out-Null
$p = Get-Process AfterFX -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { throw 'After Effects window not found' }
$h = $p.MainWindowHandle; if ([AecW]::IsIconic($h)) { throw 'After Effects is minimized' }
$r = New-Object AecW+RECT; [AecW]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.R - $r.L; $ht = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $ht; $g = [System.Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
$ok = [AecW]::PrintWindow($h, $dc, 2); $g.ReleaseHdc($dc)
if (-not $ok) { $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size) }
$bmp.Save($env:AEC_OUT, [System.Drawing.Imaging.ImageFormat]::Png); "$($w)x$($ht)"`;
async function screenshotAE(out) {
  if (process.platform === "win32") return await PS(WIN_SHOT, { AEC_OUT: out });
  if (process.platform === "darwin") { await run("screencapture", ["-x", out]); return "main display"; }
  throw new Error("UI screenshots are supported on Windows and macOS");
}
const capsLockOn = async () => (process.platform === "win32" ? (await PS("[Console]::CapsLock").catch(() => "")) === "True" : false);

// ---------------- MCP server ----------------
const INSTRUCTIONS =`Controls a live Adobe After Effects session through the Claude Bridge panel. Use these tools for ANY After Effects,
motion-graphics, animation or video request (also Arabic: افتر افكتس، موشن، انيميشن، مقطع، فيديو، مونتاج).
New piece, always in this order: (0) brief: before any research, ask the user (in one short batch) what the video is for,
audience, platform/format/length, message and copy, mood, brand (colours, fonts, logo), assets they have, music taste,
references they like or hate; skip what they already said; show 3-6 reference links/clips that match it and let them pick or react; (1) inspiration aimed at that brief: ae_guide inspiration, find 3-5 references, save what you learn as
ae_memory technique cards (automatic), and ae_memory search for cards learned earlier; (2) music: ae_music search
(ae_guide music to add tracks; royalty-free, license checked); (3) a written plan with timing (scenes, copy, rhythm, music,
which idea came from which reference; fonts: ae_fonts preview 3 options); (4) styleframes: build key frames in AE and show them with ae_preview; (5) WAIT for
the user's approval; (6) build in small ae_run_jsx steps, ae_review, fix until clean; (7) show the user, wait for approval,
then ae_render. Edits to existing work: ae_inspect -> ae_checkpoint create -> edit -> ae_review.
Learning: technique cards are saved automatically; the user's personal style is saved only when they ask. Learn ideas,
never copy a design. A reference file the user gives: ae_reference (audio -> beats); ae_review reference=<video> compares.
ae_guide <topic> loads expert recipes only when needed.
ae_run_jsx runs ExtendScript (ES3: var only, no let/const/arrows/JSON/Array.map/forEach/indexOf; parenthesize nested
a?b:(c?d:e) — ExtendScript mis-parses chained ternaries). Last expression is returned as JSON. One undo group per
call; undo:false for code that saves. AEH: comp layer layers(comp,"selected"|"all"|/re/|[..]) prop hex importFile
listEffects catalog(fonts|presets|templates) applyPreset | anim(prop,[[t,v]],curve) curve(prop,name: ease smooth out in
expo snap linear hold) | expr(prop, wiggle|bounce|loop|pingpong|spin|follow|blink, opts) | text(comp,str,{font,size,
color,tracking,justify,pos}) textAnim(layer, rise|drop|pop|blur|fade|typewriter|tracking, {start,dur,curve,by,amount}) |
shape(comp, rect|ellipse|star|path, {...}) drawOn(layer,t0,t1,curve) bg(comp,inner,outer,kind) fx(layer,matchName,
{param:value}) fxParam(effect,name) precompose stagger(layers,frames,start) marker audio(comp,path,t,db) recipe(name,args).
resetComp(name,w,h,dur,fps) (rebuild a precomp without breaking its users) charBox(textLayer,index) (comp box of one
letter) pivot(comp,layers,[x,y]) (null to zoom into a point). Never render inside ae_run_jsx; use ae_render. Voice-over: ae_tts then AEH.audio.
MUSIC SYNC IS THE TOP PRIORITY: ae_music use returns the rhythm map (cut pulse, sections, drops, breaks, pulse hits) and
drops typed markers; drop_at puts the drop where the story needs it. Every cut and big move lands on a pulse hit; quiet
sections get slow moves and no cut faster than the cut pulse; slams only on real hits. ae_review scores cuts/moments
against the beats — fix every off-beat or too-fast item before showing the user.`;

const server = new McpServer({ name: "after-effects-claude-bridge", version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
// Every tool call is timed and logged (tool, ms, ok, error kind) — the model-facing reply stays unchanged.
{ const reg = server.registerTool.bind(server);
  server.registerTool = (name, cfg, handler) => reg(name, cfg, async (args, extra) => {
    const t0 = Date.now(), op = ++opSeq, r = await handler(args, extra), err = r?.isError ? String(r.content?.[0]?.text || "") : "";
    logOp({ ts: new Date().toISOString(), op, tool: name, ms: Date.now() - t0, ok: !err, ...(err ? { kind: errKind(err), error: err.slice(0, 160) } : {}) });
    return r;
  }); }
// Behaviour hints for the client (MCP tool annotations): read-only, destructive (can overwrite/delete), network.
const ANN = {
  ae_status: { readOnlyHint: true }, ae_inspect: { readOnlyHint: true }, ae_preview: { readOnlyHint: true },
  ae_review: { readOnlyHint: true }, ae_guide: { readOnlyHint: true }, ae_render_status: { readOnlyHint: false, destructiveHint: false },
  ae_run_jsx: { destructiveHint: true }, ae_checkpoint: { destructiveHint: true }, ae_render: { destructiveHint: true },
  ae_memory: { destructiveHint: true }, ae_music: { destructiveHint: true, openWorldHint: true }, ae_fonts: { destructiveHint: false, openWorldHint: true },
  ae_reference: { destructiveHint: false }, ae_tts: { destructiveHint: false },
};

server.registerTool("ae_status", {
  description: "Bridge check: AE version, project, active comp.",
  inputSchema: {},
}, tool(async () => {
  const [s, caps] = await Promise.all([bridge("status"), capsLockOn()]);
  const warn = [];
  if (caps) warn.push("Caps Lock is on — After Effects stops refreshing its viewer ('Refresh Disabled'). Ask the user to turn it off.");
  if (s.host !== SERVER_VERSION || (s.panel && s.panel.version !== SERVER_VERSION))
    warn.push(`Version mismatch: server ${SERVER_VERSION}, panel ${s.panel?.version ?? "?"}, host script ${s.host ?? "< 1.5"}. Reinstall the panel files (install script) and restart After Effects.`);
  const can = { server: SERVER_VERSION, uiScreenshot: ["win32", "darwin"].includes(process.platform), tts: ["win32", "darwin"].includes(process.platform),
    rawJsx: s.panel?.rawJsx ?? null, readOnly: s.panel?.readOnly ?? null, layerIds: s.layerIds ?? null };
  return text({ ...s, capabilities: can, ...(warn.length ? { warnings: warn } : {}) });
}));

server.registerTool("ae_run_jsx", {
  description: "Run ES3 ExtendScript in AE (full DOM + AEH helpers). Returns the last expression as JSON. One undo group unless undo=false.",
  inputSchema: {
    code: z.string(),
    undo_name: z.string().optional(),
    undo: z.boolean().optional().describe("false when saving"),
    save_as: z.string().optional().describe("recipe name; only if user asked"),
  },
}, tool(async ({ code, undo_name, undo, save_as }) => {
  const result = await bridge("runJsx", { code, undoName: undo_name, undo });
  if (!save_as) return text(result);
  const n = safeName(save_as);
  fs.mkdirSync(recipeDir, { recursive: true });
  fs.writeFileSync(path.join(recipeDir, `${n}.jsx`), `// saved from ae_run_jsx\nfunction recipe(args) { return eval(${JSON.stringify(code)}); }\n`);
  fs.writeFileSync(path.join(recipeDir, `${n}.md`), undo_name || n);
  return text({ result, savedRecipe: n });
}));

server.registerTool("ae_inspect", {
  description: "No args: project items, missing footage. comp: its layers. comp+layer (name|index|#id): that layer in depth (values, keys, effect params, text, expression errors).",
  inputSchema: {
    comp: z.union([z.string(), z.number()]).optional(),
    layer: z.union([z.string(), z.number()]).optional(),
    props: z.boolean().optional().describe("animated props, default true"),
    offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(500).optional().describe("page size, default 200 layers / 300 items"),
  },
}, tool(async ({ comp, layer, props, offset, limit }) => text(await bridge("inspect", { comp, layer, props, offset, limit }))));

server.registerTool("ae_preview", {
  description: "Frames of a comp as one image grid. ui=true: screenshot of the After Effects window itself (save_to keeps the PNG).",
  inputSchema: {
    comp: z.union([z.string(), z.number()]).optional(),
    times: z.array(z.number()).max(12).optional().describe("seconds; overrides count"),
    count: z.number().int().min(1).max(12).optional().describe("default 6"),
    width: z.number().int().min(160).max(1600).optional().describe("tile px, default 1024 single / 480 grid"),
    ui: z.boolean().optional(),
    save_to: z.string().optional().describe("abs .png path (ui only)"),
  },
}, tool(async ({ comp, times, count, width, ui, save_to }) => {
  if (ui) {
    const file = checkOut(save_to, ".png") ?? path.join(os.tmpdir(), "ae-claude", `ui-${Date.now()}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const size = await screenshotAE(file);
    try {
      const sheet = contactSheet([file], width ?? 1456);
      return { content: [{ type: "image", data: Buffer.from(sheet.jpeg).toString("base64"), mimeType: "image/jpeg" },
        { type: "text", text: `After Effects window ${size}${save_to ? `, saved ${file}` : ""}` }] };
    } finally { if (!save_to) fs.rmSync(file, { force: true }); }
  }
  let ts = times;
  if (!ts) {
    const info = await bridge("frames", { comp, times: [], dir: os.tmpdir() });
    const n = count ?? 6;
    ts = Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * info.duration / n) * 100) / 100);
  }
  const dir = path.join(os.tmpdir(), "ae-claude", `prev-${Date.now()}`);
  const res = await bridge("frames", { comp, times: ts, dir });
  try {
    for (const f of res.frames) await waitForFile(f.file);
    const sheet = contactSheet(res.frames.map((f) => f.file), width ?? (res.frames.length === 1 ? 1024 : 480));
    return { content: [
      { type: "image", data: Buffer.from(sheet.jpeg).toString("base64"), mimeType: "image/jpeg" },
      { type: "text", text: `${res.comp} ${res.width}x${res.height}, ${res.duration}s. Frames (grid ${sheet.cols} cols): ${res.frames.map((f) => f.time + "s").join(", ")}` },
    ] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

server.registerTool("ae_render", {
  description: "Save project, render comp to H.264 MP4 via background aerender. Waits up to wait_seconds, else returns job_id.",
  inputSchema: {
    comp: z.union([z.string(), z.number()]).optional(),
    output: z.string().optional().describe("abs .mp4 path"),
    save_as: z.string().optional().describe("abs .aep path if untitled"),
    wait_seconds: z.number().min(0).max(50).optional().describe("default 45"),
  },
}, tool(async ({ comp, output, save_as, wait_seconds }) => {
  const name = comp ?? (await bridge("status")).activeComp ?? "comp";
  const safe = String(name).replace(/[\\/:*?"<>|]/g, "_");
  const prep = await bridge("renderPrep", { comp, saveAs: save_as ?? path.join(WORK_DIR, `${safe}.aep`) });
  if (!prep.h264Template) throw new Error("No H.264 output module template found in this After Effects install.");
  const out = checkOut(output, ".mp4") ?? path.join(WORK_DIR, "renders", `${safe}.mp4`);
  checkOut(save_as, ".aep");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) fs.rmSync(out);
  const job = startRender(prep, out);
  const end = Date.now() + (wait_seconds ?? 45) * 1000;
  while (job.status === "running" && Date.now() < end) await sleep(500);
  return text(jobReport(job));
}));

server.registerTool("ae_render_status", {
  description: "Progress of an ae_render job (running, done + verified, failed, cancelled). cancel=true stops it.",
  inputSchema: { job_id: z.string(), cancel: z.boolean().optional() },
}, tool(async ({ job_id, cancel }) => {
  const job = jobs.get(job_id);
  if (!job) throw new Error(`Unknown job ${job_id} (jobs live only while this server runs)`);
  if (cancel) job.cancel();
  return text(jobReport(job));
}));

server.registerTool("ae_tts", {
  description: "Voice-over WAV from OS voices (Windows SAPI / macOS say). voice='list' lists voices.",
  inputSchema: {
    text: z.string().optional().describe("text or SSML"),
    voice: z.string().optional(),
    rate: z.number().int().min(-10).max(10).optional(),
    ssml: z.boolean().optional(),
    out: z.string().optional().describe("abs .wav path"),
  },
}, tool(async (a) => {
  if (a.voice === "list") return text(await tts(a));
  if (!a.text) throw new Error("text is required");
  const out = checkOut(a.out, ".wav") ?? path.join(WORK_DIR, "audio", `tts-${Date.now()}.wav`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await tts({ ...a, out });
  return text({ file: out, bytes: fs.statSync(out).size });
}));

// Our frames vs a reference video at the same normalised times: paired grid (ours | ref), layout similarity,
// motion-rhythm correlation and colour comparison.
async function compareReview(audit, times, files, refPath, dir, width) {
  if (!fs.existsSync(refPath)) throw new Error(`Reference not found: ${refPath}`);
  const info = await bridge("refFrames", { path: refPath, count: times.length, dir: path.join(dir, "ref") });
  try {
    if (!info.frames.length) throw new Error("Reference has no video frames");
    for (const f of [...files, ...info.frames.map((x) => x.file)]) await waitForFile(f);
    const ours = files.map(readPng), refs = info.frames.map((x) => readPng(x.file));
    const tO = ours.map((i) => thumb(i, 96, 54)), tR = refs.map((i) => thumb(i, 96, 54));
    const eO = tO.slice(1).map((t, i) => motionEnergy(tO[i], t)), eR = tR.slice(1).map((t, i) => motionEnergy(tR[i], t));
    const sims = tO.map((t, i) => (tR[i] ? similarity(t, tR[i]) : 0));
    const paired = []; ours.forEach((img, i) => { paired.push(img); if (refs[i]) paired.push(refs[i]); });
    const sheet = sheetRaw(paired, width ?? 280, 4);
    const strip = drawStrip(sheet.W, audit.duration, { energies: eO, sampleTimes: times, keyTimes: audit.keyTimes, refEnergies: eR });
    const img = stack(sheet.data, sheet.H, strip.data, strip.H, sheet.W);
    const r = pearson(eO, eR), avg = sims.reduce((a, b) => a + b, 0) / sims.length;
    const report = [
      `Compare ${audit.comp} (${audit.duration}s) vs ${info.name} (${info.duration.toFixed(2)}s @ ${info.frameRate}fps, ${info.width}x${info.height}). Grid pairs: ours | reference, at normalised times ${times.join(", ")}s.`,
      `Layout similarity: ${sims.map((s, i) => `${times[i]}s ${Math.round(s * 100)}%`).join(", ")} — average ${Math.round(avg * 100)}%`,
      `Motion rhythm correlation: ${r === null ? "n/a" : r.toFixed(2)} (1 = same timing; strip: orange ours, violet reference)`,
      `Colour (avg): ours ${ours.map(meanHex).join(" ")} | ref ${refs.map(meanHex).join(" ")}`,
      `Checks: ${audit.issues.join(" | ") || "no issues found"}`,
    ].join("\n");
    return { content: [{ type: "image", data: toJpeg(img.data, sheet.W, img.H), mimeType: "image/jpeg" }, { type: "text", text: report }] };
  } finally {
    if (info.removeIds) await bridge("removeItems", { ids: info.removeIds }).catch(() => {});
  }
}

server.registerTool("ae_review", {
  description: "Review: frame grid + timeline strip + QA checks + music sync score (cuts/moments vs beat hits). reference=video compares side by side.",
  inputSchema: {
    comp: z.union([z.string(), z.number()]).optional(),
    samples: z.number().int().min(4).max(24).optional().describe("default 12"),
    width: z.number().int().min(200).max(800).optional().describe("tile px, default 320"),
    reference: z.string().optional(),
    ignore: z.array(z.string()).optional().describe("hide checks containing these words (intentional, e.g. HUD)"),
  },
}, tool(async ({ comp, samples, width, reference, ignore }) => {
  const audit = await bridge("audit", { comp });
  const n = samples ?? (reference ? 8 : 12), dur = audit.duration;
  const times = Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * dur / n) * 100) / 100);
  const dir = path.join(os.tmpdir(), "ae-claude", `rev-${Date.now()}`);
  const res = await bridge("frames", { comp: audit.comp, times, dir });
  try {
    const files = res.frames.map((f) => f.file);
    if (reference) return await compareReview(audit, times, files, reference, dir, width);
    const a = await analyseFrames(files, width ?? (n > 9 ? 320 : 400), 4);
    const pixelFlags = [];
    a.thumbs.forEach((t, i) => frameFlags(t).forEach((f) => pixelFlags.push(`${times[i]}s: ${f}`)));
    const { env, notes, peaks } = await audioEnvelope(audit.audio, dur, a.sheet.W);
    // a short sound effect should land on something that moves: a keyframe near its start or its peak
    const near = (t) => audit.keyTimes.some((k) => Math.abs(k - t) <= 0.2);
    const sync = peaks.filter((pk) => pk.short && !near(pk.t) && !near(pk.start)).map((pk) => `sound "${pk.name}" at ${pk.t.toFixed(2)}s has no visual hit (no keyframe within 0.2s)`);
    // Music (longest audio layer ≥ 8 s): score every cut and coordinated moment against its beat hits.
    const music = audit.audio.filter((L) => L.outPoint - L.inPoint >= 8).sort((x, y) => (y.outPoint - y.inPoint) - (x.outPoint - x.inPoint))[0];
    let musicRep = "", hits = null;
    if (music) {
      try {
        const { beat, rhythm } = await rhythmOf(music.file), c = toComp(rhythm, music);
        hits = c.hits;
        musicRep = `${rhythmMap(c, beat.bpm, 24)}\n${syncReport(scoreSync(c, { cuts: audit.cuts || [], moments: audit.moments || [] }, audit.frameRate), music.name)}`;
      } catch (e) { musicRep = `Music sync: ${e.message}`; }
    }
    const strip = drawStrip(a.sheet.W, dur, { energies: a.energies, sampleTimes: times, keyTimes: audit.keyTimes, env: audit.audio.length ? env : null, hits, cuts: hits ? audit.cuts || [] : [] });
    const img = stack(a.sheet.data, a.sheet.H, strip.data, strip.H, a.sheet.W);
    const ig = (ignore || []).map((s) => s.toLowerCase()), keep = (s) => !ig.some((x) => s.toLowerCase().includes(x));
    const report = [
      `${audit.comp}: ${audit.width}x${audit.height}, ${dur}s @ ${audit.frameRate}fps. Grid ${a.sheet.cols} cols, frames at ${times.join(", ")}s.`,
      `Motion: ${motionSummary(times, a.energies, a.thumbs) || "n/a"}`,
      `Keyframes: ${audit.keyTimes.length} (${[...new Set(audit.keyTimes)].sort((x, y) => x - y).slice(0, 30).join(", ")}${audit.keyTimes.length > 30 ? " …" : ""})`,
      notes.length ? `Audio: ${notes.join("; ")}` : "Audio: none",
      musicRep,
      `Checks: ${[...audit.issues, ...sync, ...pixelFlags].filter(keep).join(" | ") || "no issues found"}`,
    ].filter(Boolean).join("\n");
    return { content: [{ type: "image", data: toJpeg(img.data, a.sheet.W, img.H), mimeType: "image/jpeg" }, { type: "text", text: report }] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

server.registerTool("ae_reference", {
  description: "Analyse a reference file. Image: shown. Video: frames, motion, cuts. Audio (wav/mp3): BPM, beats, hits; markers=comp adds beat markers.",
  inputSchema: {
    path: z.string(),
    count: z.number().int().min(4).max(24).optional(),
    markers: z.string().optional(),
  },
}, tool(async ({ path: p, count, markers }) => {
  if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`);
  if (/\.(wav|mp3)$/i.test(p)) {
    const { beat: b, rhythm: rh } = await rhythmOf(p), c = toComp(rh, {});
    let marked = "";
    if (markers) {
      const mk = keyHits(c);
      const r = await bridge("addMarkers", { comp: markers, times: mk.map((h) => h[0]), labels: mk.map((h) => h[1]) });
      marked = `\nAdded ${r.markers} pulse-hit markers to ${r.comp}.`;
    }
    return text(`${path.basename(p)}: ${b.duration}s, ~${b.bpm} BPM (beat every ${b.period}s, ${Math.round(b.period * 30)} frames @30fps).\n${rhythmMap(c, b.bpm, 60)}${marked}`);
  }
  if (/\.(png|jpe?g)$/i.test(p)) {
    const img = readImage(p), s = sheetRaw([img], Math.min(1024, img.width));
    return { content: [{ type: "image", data: toJpeg(s.data, s.W, s.H), mimeType: "image/jpeg" },
      { type: "text", text: `Image ${img.width}x${img.height}` }] };
  }
  const dir = path.join(os.tmpdir(), "ae-claude", `ref-${Date.now()}`);
  const info = await bridge("refFrames", { path: p, count: count ?? 12, dir });
  try {
    if (!info.frames.length) return text(info);
    const times = info.frames.map((f) => f.time);
    const a = await analyseFrames(info.frames.map((f) => f.file), 320, 4);
    const strip = drawStrip(a.sheet.W, info.duration, { energies: a.energies, sampleTimes: times });
    const img = stack(a.sheet.data, a.sheet.H, strip.data, strip.H, a.sheet.W);
    return { content: [{ type: "image", data: toJpeg(img.data, a.sheet.W, img.H), mimeType: "image/jpeg" },
      { type: "text", text: `${info.name}: ${info.width}x${info.height}, ${info.duration.toFixed(2)}s @ ${info.frameRate}fps, audio: ${info.hasAudio}. Frames at ${times.join(", ")}s.\nMotion: ${motionSummary(times, a.energies, a.thumbs)}` }] };
  } finally {
    if (info.removeIds) await bridge("removeItems", { ids: info.removeIds }).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

// ---------------- opt-in knowledge ----------------
const KDIR = path.join(WORK_DIR, "knowledge");
const KFILES = { lesson: "lessons.md", style: "style.md", note: "notes.md" };
const recipeDir = path.join(KDIR, "recipes");
const safeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");

const techDir = path.join(KDIR, "techniques");
const words = (q) => String(q || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

server.registerTool("ae_memory", {
  description: "Knowledge: technique cards (auto-save what you learn from references), lessons, notes, recipes; style only when asked. search by words.",
  inputSchema: {
    action: z.enum(["list", "read", "save", "delete", "search"]),
    kind: z.enum(["technique", "lesson", "style", "note", "recipe"]).optional(),
    name: z.string().optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
    code: z.string().optional().describe("must define function recipe(args)"),
    match: z.string().optional().describe("substring of line to delete"),
    query: z.string().optional(),
  },
}, tool(async ({ action, kind, name, content, tags, source, code, match, query }) => {
  fs.mkdirSync(recipeDir, { recursive: true }); fs.mkdirSync(techDir, { recursive: true });
  const recipes = () => fs.readdirSync(recipeDir).filter((f) => f.endsWith(".jsx")).map((f) => f.slice(0, -4));
  const techs = () => fs.readdirSync(techDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  const card = (n) => fs.readFileSync(path.join(techDir, `${n}.md`), "utf8");
  const lines = (k) => { const f = path.join(KDIR, KFILES[k]); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean) : []; };
  if (action === "list") {
    return text({ folder: KDIR, techniques: techs().length, lessons: lines("lesson").length, style: lines("style").length, notes: lines("note").length,
      recipes: recipes().map((r) => { const d = path.join(recipeDir, `${r}.md`); return fs.existsSync(d) ? `${r}: ${fs.readFileSync(d, "utf8").split("\n")[0]}` : r; }) });
  }
  if (action === "search") {
    const q = words(query); if (!q.length) throw new Error("query is required");
    const docs = [...techs().map((n) => ["technique", n, card(n)]), ...recipes().map((n) => { const d = path.join(recipeDir, `${n}.md`); return ["recipe", n, fs.existsSync(d) ? fs.readFileSync(d, "utf8") : n]; }),
      ...lines("lesson").map((l, i) => ["lesson", String(i), l])];
    const hits = docs.map(([k, n, body]) => { const b = (n + " " + body).toLowerCase(); return [q.reduce((sc, w) => sc + (b.includes(w) ? (n.includes(w) ? 3 : 1) : 0), 0), k, n, body]; })
      .filter((h) => h[0] > 0).sort((x, y) => y[0] - x[0]).slice(0, 8);
    return text(hits.map(([, k, n, body]) => `${k} ${n}: ${body.split("\n").find((l) => l && !l.startsWith("tags:") && !l.startsWith("source:")) || ""}`.slice(0, 160)).join("\n") || "(no matches)");
  }
  if (!kind) throw new Error("kind is required");
  if (kind === "technique") {
    if (action === "read") { if (!name) return text(techs()); return text(card(safeName(name))); }
    const n = safeName(name || "");
    if (action === "save") {
      if (!n || !content) throw new Error("technique needs name and content");
      fs.writeFileSync(path.join(techDir, `${n}.md`), `${content.trim()}\ntags: ${(tags || []).join(", ")}\nsource: ${source || "unknown"}\nsaved: ${new Date().toISOString().slice(0, 10)}\n`);
      return text(`Saved technique ${n}.`);
    }
    fs.rmSync(path.join(techDir, `${n}.md`), { force: true }); return text(`Deleted technique ${n}.`);
  }
  if (action === "read") {
    if (kind === "recipe") {
      if (!name) return text(recipes());
      const f = path.join(recipeDir, `${safeName(name)}.jsx`);
      if (!fs.existsSync(f)) throw new Error(`No recipe ${name}`);
      const d = path.join(recipeDir, `${safeName(name)}.md`);
      return text(`${fs.existsSync(d) ? fs.readFileSync(d, "utf8") + "\n\n" : ""}${fs.readFileSync(f, "utf8")}`);
    }
    return text(lines(kind).join("\n") || "(empty)");
  }
  if (action === "save") {
    if (kind === "recipe") {
      if (!name || !code || !/function\s+recipe\s*\(/.test(code)) throw new Error("recipe needs name and code defining function recipe(args)");
      const n = safeName(name);
      fs.writeFileSync(path.join(recipeDir, `${n}.jsx`), code);
      fs.writeFileSync(path.join(recipeDir, `${n}.md`), content || n);
      return text(`Saved recipe ${n}. Run it with AEH.recipe("${n}", {...}).`);
    }
    if (!content) throw new Error("content is required");
    fs.appendFileSync(path.join(KDIR, KFILES[kind]), `- [${new Date().toISOString().slice(0, 10)}] ${content.replace(/\n+/g, " ")}\n`);
    return text(`Saved to ${KFILES[kind]}.`);
  }
  // delete
  if (kind === "recipe") {
    const n = safeName(name || "");
    for (const ext of [".jsx", ".md"]) fs.rmSync(path.join(recipeDir, n + ext), { force: true });
    return text(`Deleted recipe ${n}.`);
  }
  if (!match) throw new Error("match is required to delete a line");
  const keep = lines(kind).filter((l) => !l.includes(match));
  const removed = lines(kind).length - keep.length;
  fs.writeFileSync(path.join(KDIR, KFILES[kind]), keep.length ? keep.join("\n") + "\n" : "");
  return text(`Removed ${removed} line(s) from ${KFILES[kind]}.`);
}));

// ---------------- music library ----------------
const MUSIC_DIR = path.join(WORK_DIR, "music"), MUSIC_INDEX = path.join(MUSIC_DIR, "index.json");
const BLOCKED_LICENSE = /\b(nc|nd)\b|non[- ]?commercial|no[- ]?deriv|all rights reserved/i;
const loadIndex = () => (fs.existsSync(MUSIC_INDEX) ? JSON.parse(fs.readFileSync(MUSIC_INDEX, "utf8")) : []);
const saveIndex = (ix) => { fs.mkdirSync(MUSIC_DIR, { recursive: true }); fs.writeFileSync(MUSIC_INDEX, JSON.stringify(ix, null, 1)); };
// loudness (dBFS RMS) and an 8-part energy curve, 0..1 relative to the track's loudest part
function musicProfile(a) {
  const parts = 8, per = Math.floor(a.n / parts), rms = [];
  let all = 0, cnt = 0;
  for (let p = 0; p < parts; p++) { let s = 0, c = 0; for (let i = p * per; i < (p + 1) * per; i += 32) { const v = a.sample(i); s += v * v; c++; } rms.push(Math.sqrt(s / Math.max(1, c))); all += s; cnt += c; }
  const mx = Math.max(1e-9, ...rms), loud = 20 * Math.log10(Math.sqrt(all / Math.max(1, cnt)) + 1e-9);
  const curve = rms.map((v) => +(v / mx).toFixed(2)), mean = curve.reduce((x, y) => x + y, 0) / parts;
  return { loudness: +loud.toFixed(1), energy: loud > -14 ? "high" : loud > -20 ? "mid" : "low", curve, dynamic: +(1 - mean).toFixed(2) };
}

// direct audio download from the royalty-free sources in the music guide only
const MUSIC_HOSTS = /(^|\.)(pixabay\.com|freemusicarchive\.org|incompetech\.com)$/i, MAX_TRACK = 60 * 1024 * 1024;
async function downloadTrack(url) {
  const ok = (u) => { const p = new URL(u); return p.protocol === "https:" && MUSIC_HOSTS.test(p.hostname); };
  if (!ok(url)) throw new Error("url must be https on pixabay.com, freemusicarchive.org or incompetech.com");
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  if (!ok(res.url)) throw new Error(`redirected outside the allowed sources: ${new URL(res.url).hostname}`);
  if (+res.headers.get("content-length") > MAX_TRACK) throw new Error("file is larger than 60 MB");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_TRACK) throw new Error("file is larger than 60 MB");
  const ext = buf.slice(0, 4).toString("latin1") === "RIFF" ? ".wav"
    : (buf.slice(0, 3).toString("latin1") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) ? ".mp3" : null;
  if (!ext) throw new Error("not an audio file (expected mp3 or wav) — pass the direct file URL, not the page");
  const name = safeName(path.basename(new URL(res.url).pathname, path.extname(new URL(res.url).pathname))) || "track";
  const dest = path.join(MUSIC_DIR, "downloads", name + ext);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
  return dest;
}

server.registerTool("ae_music", {
  description: "Music library (ae_guide music). add: url (direct audio file) or path, license + source page required. search. use: import + beat markers.",
  inputSchema: {
    action: z.enum(["add", "search", "use", "list", "remove"]),
    url: z.string().optional(), path: z.string().optional(), title: z.string().optional(), artist: z.string().optional(),
    source: z.string().optional(), license: z.string().optional(), tags: z.array(z.string()).optional(),
    query: z.string().optional(), bpm_min: z.number().optional(), bpm_max: z.number().optional(),
    min_seconds: z.number().optional(), energy: z.enum(["low", "mid", "high"]).optional(),
    id: z.string().optional(), comp: z.string().optional(), start: z.number().optional(), db: z.number().optional(), markers: z.boolean().optional(),
    offset: z.number().optional().describe("seconds into the track"), drop_at: z.number().optional().describe("comp time the first drop lands on"),
  },
}, tool(async (a) => {
  const ix = loadIndex();
  if (a.action === "list") return text(ix.map((t) => `${t.id} | ${t.title} — ${t.artist} | ${t.bpm} BPM ${t.duration}s ${t.energy} | ${t.tags.join(", ")} | ${t.license}`).join("\n") || "(empty)");
  if (a.action === "add") {
    if (!a.license || !a.source) throw new Error("license and source are required");
    if (BLOCKED_LICENSE.test(a.license)) throw new Error(`License "${a.license}" is not allowed (non-commercial or no-derivatives).`);
    if (a.url) a.path = await downloadTrack(a.url);
    if (!a.path || !fs.existsSync(a.path)) throw new Error("url (direct audio file) or path to a downloaded wav/mp3 is required");
    const dec = await decodeAudio(a.path), b = analyseBeats(dec), prof = musicProfile(dec), rh = analyseRhythm(dec, b);
    const id = safeName(`${a.title || path.basename(a.path, path.extname(a.path))}`).slice(0, 48);
    const dest = path.join(MUSIC_DIR, "tracks", id + path.extname(a.path).toLowerCase());
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(a.path, dest);
    const rec = { id, title: a.title || id, artist: a.artist || "unknown", file: dest, source: a.source, license: a.license, tags: (a.tags || []).map((t) => t.toLowerCase()),
      bpm: b.bpm, duration: b.duration, beats: b.beats, rhythm: rh, ...prof, added: new Date().toISOString().slice(0, 10) };
    saveIndex([...ix.filter((t) => t.id !== id), rec]);
    return text(`Added ${id}: ${rec.bpm} BPM (cut pulse ${rh.pulse}s), ${rec.duration}s, ${rec.energy} energy (${rec.loudness} dBFS), curve ${rec.curve.join(" ")}, drops at ${rh.drops.slice(0, 4).join(", ") || "none"}s`);
  }
  if (a.action === "search") {
    const q = words(a.query);
    const res = ix.filter((t) => (a.bpm_min == null || t.bpm >= a.bpm_min) && (a.bpm_max == null || t.bpm <= a.bpm_max) &&
      (a.min_seconds == null || t.duration >= a.min_seconds) && (!a.energy || t.energy === a.energy))
      .map((t) => [q.reduce((sc, w) => sc + (t.tags.some((g) => g.includes(w)) ? 2 : 0) + (t.title.toLowerCase().includes(w) ? 1 : 0), 0), t])
      .filter(([sc]) => !q.length || sc > 0).sort((x, y) => y[0] - x[0]).slice(0, 6);
    return text(res.map(([, t]) => `${t.id} | ${t.bpm} BPM ${t.duration}s ${t.energy} | curve ${t.curve.join(" ")} | ${t.tags.join(", ")}`).join("\n") ||
      "(no match — find one with ae_guide music, then ae_music add)");
  }
  const t = ix.find((x) => x.id === a.id);
  if (!t) throw new Error(`No track ${a.id}`);
  if (a.action === "remove") { saveIndex(ix.filter((x) => x.id !== a.id)); fs.rmSync(t.file, { force: true }); return text(`Removed ${a.id}.`); }
  // use
  if (!t.rhythm) {   // tracks added before 1.4: analyse once and keep it
    const dec = await decodeAudio(t.file), b = analyseBeats(dec);
    t.rhythm = analyseRhythm(dec, b); t.beats = b.beats; saveIndex(ix);
  }
  const rh = t.rhythm, start = a.start || 0;
  let offset = a.offset || 0;
  if (a.drop_at != null) {   // trim the track so its first drop after the trim lands on drop_at (comp time)
    const want = a.drop_at - start, d = rh.drops.find((x) => x >= want);
    if (d == null) throw new Error(`No drop at or after ${want.toFixed(2)}s into the track (drops: ${rh.drops.join(", ") || "none"})`);
    offset = Math.round((d - want) * 1000) / 1000;
  }
  const file = t.file.replace(/\\/g, "/");
  const r = await bridge("runJsx", { code: `var c = AEH.comp(${JSON.stringify(a.comp || "")}); var l = AEH.audio(c, ${JSON.stringify(file)}, ${start}, ${a.db ?? -14});
    l.startTime = ${start - offset}; l.inPoint = ${start}; l.name = ${JSON.stringify("♪ " + t.title)}; ({ comp: c.name, layer: l.name, duration: c.duration, fps: c.frameRate })`, undoName: "Add music" });
  const c = toComp(rh, { startTime: start - offset, inPoint: start, outPoint: r.duration });
  let m = "";
  if (a.markers !== false) {
    const mk = [...keyHits(c).map(([tm, ty, s]) => [tm, ty + (s >= 0.85 ? "!" : "")]),
      ...c.drops.map((tm) => [tm, "DROP"]), ...c.breaks.map((tm) => [tm, "BREAK"]), ...c.sections.map(([s0, , L]) => [s0 + 0.001, L])]
      .sort((x, y) => x[0] - y[0]);   // addMarkers stops at the first time past the comp end
    const res = await bridge("addMarkers", { comp: r.comp, times: mk.map((x) => x[0]), labels: mk.map((x) => x[1]) });
    m = `, ${res.markers} rhythm markers (pulse hits, DROP, BREAK, sections)`;
  }
  return text(`${t.title} on ${r.comp} from ${start}s, ${offset}s into the track${m}.\n${rhythmMap(c, t.bpm)}\nCredit if required: "${t.title}" by ${t.artist} — ${t.license} — ${t.source}`);
}));

// ---------------- fonts: Google Fonts (OFL only) installed per user, no admin ----------------
const FONT_DIR = process.platform === "win32" ? path.join(process.env.LOCALAPPDATA || os.homedir(), "Microsoft", "Windows", "Fonts")
  : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Fonts") : path.join(os.homedir(), ".local", "share", "fonts");
const isFont = (b) => b.length > 12 && ([0x00010000, 0x74727565, 0x4f54544f].includes(b.readUInt32BE(0)));   // TrueType, 'true', 'OTTO'
async function installFamily(family) {
  const dir = String(family).toLowerCase().replace(/[^a-z0-9]/g, "");
  const res = await fetch(`https://api.github.com/repos/google/fonts/contents/ofl/${dir}`, { headers: { "User-Agent": "ae-mcp-pro" } });
  if (res.status === 404) throw new Error(`"${family}" is not in Google Fonts under the OFL license`);
  if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
  const files = (await res.json()).filter((f) => /\.ttf$/i.test(f.name)).slice(0, 24), done = [];
  fs.mkdirSync(FONT_DIR, { recursive: true });
  for (const f of files) {
    if (new URL(f.download_url).hostname !== "raw.githubusercontent.com") continue;
    const dest = path.join(FONT_DIR, path.basename(f.name));
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== f.size) {
      const b = Buffer.from(await (await fetch(f.download_url)).arrayBuffer());
      if (!isFont(b) || b.length > 12e6) throw new Error(`${f.name} is not a valid font file`);
      fs.writeFileSync(dest, b);
      if (process.platform === "win32")
        await run("reg", ["add", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", "/v", `${path.basename(f.name, ".ttf")} (TrueType)`, "/t", "REG_SZ", "/d", dest, "/f"]);
    }
    done.push(f.name);
  }
  if (!done.length) throw new Error(`No .ttf files for "${family}"`);
  return done;
}

server.registerTool("ae_fonts", {
  description: "Fonts: list installed (query), install Google Fonts families (OFL, per user), preview PostScript names side by side for the user to choose.",
  inputSchema: {
    action: z.enum(["list", "install", "preview"]),
    query: z.string().optional(), families: z.array(z.string()).max(6).optional(),
    fonts: z.array(z.string()).max(4).optional().describe("PostScript names"), text: z.string().optional(),
  },
}, tool(async ({ action, query, families, fonts, text: sample }) => {
  if (action === "list") return text(await bridge("runJsx", { code: `AEH.catalog("fonts", ${JSON.stringify(query || "")}).slice(0, 80)`, undo: false }));
  if (action === "install") {
    if (!families?.length) throw new Error("families is required, e.g. [\"Archivo Black\", \"Space Mono\"]");
    const out = [];
    for (const f of families) out.push(`${f}: ${(await installFamily(f)).join(", ")}`);
    return text(`Installed to ${FONT_DIR} (OFL — free for commercial use):\n${out.join("\n")}\nCheck with ae_fonts list; if a font is missing there, restart After Effects.`);
  }
  if (!fonts?.length) throw new Error("fonts (PostScript names from ae_fonts list) is required");
  const r = await bridge("runJsx", { undo: false, code: `var F=${JSON.stringify(fonts)},T=${JSON.stringify(sample || "The quick motion — 2026")},n=F.length,miss=[];
    var c=app.project.items.addComp("__font_preview",1920,Math.max(360,220*n),1,1,30);c.layers.addSolid([0.043,0.043,0.051],"bg",1920,c.height,1);
    for(var i=0;i<n;i++){var ok=true;try{ok=app.fonts.getFontsByPostScriptName(F[i]).length>0;}catch(e){}if(!ok)miss.push(F[i]);
      AEH.text(c,T,{font:F[i],size:100,color:"#F4F1EA",pos:[960,120+i*220]});AEH.text(c,(i+1)+"  "+F[i]+(ok?"":"  (not installed)"),{size:24,color:"#FF4D1A",pos:[960,200+i*220]});}
    ({comp:c.name,id:c.id,missing:miss})` });
  const dir = path.join(os.tmpdir(), "ae-claude", `fonts-${Date.now()}`);
  try {
    const fr = await bridge("frames", { comp: r.comp, times: [0], dir });
    await waitForFile(fr.frames[0].file);
    const sheet = contactSheet([fr.frames[0].file], 1200);
    return { content: [{ type: "image", data: Buffer.from(sheet.jpeg).toString("base64"), mimeType: "image/jpeg" },
      { type: "text", text: `Font options 1-${fonts.length}${r.missing.length ? `. Not installed: ${r.missing.join(", ")}` : ""}` }] };
  } finally {
    await bridge("runJsx", { undo: false, code: `var it=app.project.itemByID(${r.id});if(it)it.remove();1` }).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

server.registerTool("ae_checkpoint", {
  description: "Project snapshots: create (before risky edits on user projects), list, revert (snapshots current state first).",
  inputSchema: {
    action: z.enum(["create", "list", "revert"]),
    name: z.string().optional(),
    id: z.string().optional().describe("from list"),
    save_as: z.string().optional().describe("abs .aep path if untitled"),
  },
}, tool(async ({ action, name, id, save_as }) =>
  text(await bridge("checkpoint", { action, name, id, saveAs: save_as ?? path.join(WORK_DIR, "projects", `${safeName(name || "untitled")}.aep`) }))));

// On-demand cookbooks: only the requested topic enters the context.
const GUIDES = { transitions: gTransitions, typography: gTypography, "camera-3d": gCamera, "audio-sync": gAudio,
  expressions: gExpressions, deliver: gDeliver, reference: gReference, matchnames: gMatch, inspiration: gInspire, music: gMusic };
server.registerTool("ae_guide", {
  description: "Expert recipes for one topic, on demand.",
  inputSchema: { topic: z.enum(Object.keys(GUIDES)) },
}, tool(async ({ topic }) => text(GUIDES[topic])));

// Trim tools/list: drop "$schema", "title" and "execution" noise the model never needs (~30 tokens per tool, every turn).
const listHandler = server.server._requestHandlers?.get("tools/list");
if (listHandler) server.server._requestHandlers.set("tools/list", async (req, extra) => {
  const res = await listHandler(req, extra);
  res.tools = res.tools.map(({ title, execution, inputSchema, ...t }) => {
    const { $schema, ...schema } = inputSchema || {};
    return { ...t, inputSchema: schema, ...(ANN[t.name] ? { annotations: ANN[t.name] } : {}) };
  });
  return res;
});

await server.connect(new StdioServerTransport());
