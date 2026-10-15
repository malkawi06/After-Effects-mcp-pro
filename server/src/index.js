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

const CFG_PATH = path.join(os.homedir(), ".ae-claude-bridge.json");
const WORK_DIR = path.join(os.homedir(), "Documents", "AE-Claude");
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
      ? `After Effects did not answer within ${CALL_TIMEOUT_MS / 1000}s (busy, or a modal dialog is open).`
      : "Cannot reach the Claude Bridge panel. Is After Effects open with Window > Extensions > Claude Bridge?");
  }
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!body.ok) throw new BridgeError(body.error + (body.line != null ? ` (line ${body.line})` : ""));
  return body.result;
}

const text = (t) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message || e) }] });
const tool = (handler) => async (args) => { try { return await handler(args); } catch (e) { return fail(e); } };

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
// Tempo + beat grid + strong hits from an onset-strength curve (log-energy flux).
function analyseBeats(a) {
  const hop = 512, win = 1024, fps = a.rate / hop, F = Math.max(0, Math.floor((a.n - win) / hop));
  if (F < fps * 2) throw new Error("audio too short for beat analysis (< 2 s)");
  const env = new Float32Array(F), on = new Float32Array(F);
  for (let f = 0; f < F; f++) { let s = 0; for (let k = 0; k < win; k += 2) { const v = a.sample(f * hop + k); s += v * v; } env[f] = Math.log(1e-9 + s / (win / 2)); }
  for (let f = 1; f < F; f++) on[f] = Math.max(0, env[f] - env[f - 1]);
  let best = 0, bestLag = 0;
  const lagMin = Math.round(fps * 60 / 200), lagMax = Math.round(fps * 60 / 60);
  const ac = new Float32Array(lagMax + 2);
  for (let lag = lagMin; lag <= lagMax + 1; lag++) {
    let s = 0; for (let f = 0; f + lag < F; f++) s += on[f] * on[f + lag];
    ac[lag] = s / (F - lag);
  }
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const bpm = 60 * fps / lag, prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 1) ** 2);   // mild preference near 120
    if (ac[lag] * prior > best) { best = ac[lag] * prior; bestLag = lag; }
  }
  const y0 = ac[bestLag - 1] || 0, y1 = ac[bestLag], y2 = ac[bestLag + 1] || 0, den = y0 - 2 * y1 + y2;
  const lag = bestLag + (den ? 0.5 * (y0 - y2) / den : 0), period = lag / fps;
  let bestOff = 0, bestSum = -1;
  for (let off = 0; off < lag; off++) {
    let s = 0; for (let t = off; t < F; t += lag) s += on[Math.round(t)] || 0;
    if (s > bestSum) { bestSum = s; bestOff = off; }
  }
  // frame time = window centre; extend the grid back towards 0 so the first beat isn't dropped
  const ctr = win / 2 / a.rate;
  let first = bestOff / fps + ctr;
  while (first - period >= -0.05) first -= period;
  const beats = []; for (let t = Math.max(0, first); t < a.n / a.rate; t += period) beats.push(Math.round(t * 1000) / 1000);
  let mean = 0; for (const v of on) mean += v; mean /= F;
  let sd = 0; for (const v of on) sd += (v - mean) ** 2; sd = Math.sqrt(sd / F);
  const hits = []; let last = -1;
  for (let f = 1; f < F - 1; f++) if (on[f] > mean + 2.5 * sd && on[f] >= on[f - 1] && on[f] >= on[f + 1] && f - last > fps * 0.1) { hits.push([on[f], Math.round((f / fps + ctr) * 1000) / 1000]); last = f; }
  hits.sort((x, y) => y[0] - x[0]);
  return { duration: Math.round(a.n / a.rate * 100) / 100, bpm: Math.round(600 / period) / 10, period: Math.round(period * 1000) / 1000,
           beats, hits: hits.slice(0, 32).map((h) => h[1]).sort((x, y) => x - y) };
}
// RMS per timeline bin for audio layers ([{file,startTime,inPoint,outPoint,levels}]); returns {env, notes}.
async function audioEnvelope(layers, duration, bins) {
  const env = new Float32Array(bins), notes = [];
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
  }
  return { env, notes };
}

// Timeline strip under the sheet: motion (orange), keyframes (white), audio (cyan), 1 s grid.
function drawStrip(W, duration, { energies, sampleTimes, keyTimes = [], env = null, refEnergies = null }) {
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
    job.status = code === 0 && fs.existsSync(output) ? "done" : "failed";
    job.seconds = Math.round((Date.now() - job.started) / 100) / 10;
  });
  jobs.set(id, job);
  return job;
}

function jobReport(job) {
  const r = { job_id: job.id, status: job.status, comp: job.comp, output: job.output,
    progress: job.total ? `${Math.min(job.frame, job.total)}/${job.total} frames` : `${job.frame} frames` };
  if (job.seconds) r.seconds = job.seconds;
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

// ---------------- MCP server ----------------
const INSTRUCTIONS = `Controls a live Adobe After Effects session through the Claude Bridge panel.
The user's prompt is the brief — follow it. Saved knowledge (ae_memory) is opt-in: consult it only when the user
mentions their style/recipes/past work, and save only when they explicitly ask. If they give a reference (file),
analyse it with ae_reference (audio -> beats), then replicate/improve; ae_review reference=<video> compares.
Workflow: ae_status -> ae_inspect -> (ae_checkpoint create on user projects) -> small ae_run_jsx steps -> ae_review
-> fix -> ae_render. ae_guide <topic> loads expert recipes only when needed.
ae_run_jsx runs ExtendScript (ES3: var only, no let/const/arrows/JSON/Array.map/forEach/indexOf; parenthesize nested
a?b:(c?d:e) — ExtendScript mis-parses chained ternaries). Last expression is returned as JSON. One undo group per
call; undo:false for code that saves. AEH: comp layer layers(comp,"selected"|"all"|/re/|[..]) prop hex importFile
listEffects catalog(fonts|presets|templates) applyPreset | anim(prop,[[t,v]],curve) curve(prop,name: ease smooth out in
expo snap linear hold) | expr(prop, wiggle|bounce|loop|pingpong|spin|follow|blink, opts) | text(comp,str,{font,size,
color,tracking,justify,pos}) textAnim(layer, rise|drop|pop|blur|fade|typewriter|tracking, {start,dur,curve,by,amount}) |
shape(comp, rect|ellipse|star|path, {...}) drawOn(layer,t0,t1,curve) bg(comp,inner,outer,kind) fx(layer,matchName,
{param:value}) precompose stagger(layers,frames,start) marker audio(comp,path,t,db) recipe(name,args).
Never render inside ae_run_jsx; use ae_render. Voice-over: ae_tts then AEH.audio.`;

const server = new McpServer({ name: "after-effects-claude-bridge", version: "1.2.0" }, { instructions: INSTRUCTIONS });

server.registerTool("ae_status", {
  description: "Bridge check: AE version, project, active comp.",
  inputSchema: {},
}, tool(async () => text(await bridge("status"))));

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
  description: "No comp: list project items. With comp: settings, layers (kind, timing, parent, effects) and animated/expression props.",
  inputSchema: {
    comp: z.union([z.string(), z.number()]).optional(),
    props: z.boolean().optional().describe("animated props, default true"),
  },
}, tool(async ({ comp, props }) => text(await bridge("inspect", { comp, props }))));

server.registerTool("ae_preview", {
  description: "Frames of a comp as one image grid (left-to-right, top-to-bottom).",
  inputSchema: {
    comp: z.union([z.string(), z.number()]).optional(),
    times: z.array(z.number()).max(12).optional().describe("seconds; overrides count"),
    count: z.number().int().min(1).max(12).optional().describe("default 6"),
    width: z.number().int().min(160).max(1600).optional().describe("tile px, default 1024 single / 480 grid"),
  },
}, tool(async ({ comp, times, count, width }) => {
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
  const out = output ?? path.join(WORK_DIR, "renders", `${safe}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) fs.rmSync(out);
  const job = startRender(prep, out);
  const end = Date.now() + (wait_seconds ?? 45) * 1000;
  while (job.status === "running" && Date.now() < end) await sleep(500);
  return text(jobReport(job));
}));

server.registerTool("ae_render_status", {
  description: "Progress of an ae_render job.",
  inputSchema: { job_id: z.string() },
}, tool(async ({ job_id }) => {
  const job = jobs.get(job_id);
  if (!job) throw new Error(`Unknown job ${job_id}`);
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
  const out = a.out ?? path.join(WORK_DIR, "audio", `tts-${Date.now()}.wav`);
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
  description: "Review: frame grid + timeline (orange motion, white keys, cyan audio, grey seconds) + QA checks. reference=video compares side by side.",
  inputSchema: {
    comp: z.union([z.string(), z.number()]).optional(),
    samples: z.number().int().min(4).max(24).optional().describe("default 12"),
    width: z.number().int().min(200).max(800).optional().describe("tile px, default 320"),
    reference: z.string().optional(),
  },
}, tool(async ({ comp, samples, width, reference }) => {
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
    const { env, notes } = await audioEnvelope(audit.audio, dur, a.sheet.W);
    const strip = drawStrip(a.sheet.W, dur, { energies: a.energies, sampleTimes: times, keyTimes: audit.keyTimes, env: audit.audio.length ? env : null });
    const img = stack(a.sheet.data, a.sheet.H, strip.data, strip.H, a.sheet.W);
    const report = [
      `${audit.comp}: ${audit.width}x${audit.height}, ${dur}s @ ${audit.frameRate}fps. Grid ${a.sheet.cols} cols, frames at ${times.join(", ")}s.`,
      `Motion: ${motionSummary(times, a.energies, a.thumbs) || "n/a"}`,
      `Keyframes: ${audit.keyTimes.length} (${[...new Set(audit.keyTimes)].sort((x, y) => x - y).slice(0, 30).join(", ")}${audit.keyTimes.length > 30 ? " …" : ""})`,
      notes.length ? `Audio: ${notes.join("; ")}` : "Audio: none",
      `Checks: ${[...audit.issues, ...pixelFlags].join(" | ") || "no issues found"}`,
    ].join("\n");
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
    const b = analyseBeats(await decodeAudio(p));
    let marked = "";
    if (markers) {
      const r = await bridge("addMarkers", { comp: markers, times: b.beats, labels: b.beats.map((_, i) => String((i % 4) + 1)) });
      marked = `\nAdded ${r.markers} beat markers to ${r.comp} (labels 1-4 = beat in bar).`;
    }
    const fmt = (a, k) => a.slice(0, k).join(", ") + (a.length > k ? ` … (+${a.length - k})` : "");
    return text(`${path.basename(p)}: ${b.duration}s, ~${b.bpm} BPM (beat every ${b.period}s, ${Math.round(b.period * 30)} frames @30fps).\nBeats: ${fmt(b.beats, 40)}\nStrong hits: ${fmt(b.hits, 32)}${marked}`);
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

server.registerTool("ae_memory", {
  description: "Opt-in saved lessons/style/notes/recipes (AEH.recipe). Read only when the user refers to them; save only when asked.",
  inputSchema: {
    action: z.enum(["list", "read", "save", "delete"]),
    kind: z.enum(["lesson", "style", "note", "recipe"]).optional(),
    name: z.string().optional(),
    content: z.string().optional(),
    code: z.string().optional().describe("must define function recipe(args)"),
    match: z.string().optional().describe("substring of line to delete"),
  },
}, tool(async ({ action, kind, name, content, code, match }) => {
  fs.mkdirSync(recipeDir, { recursive: true });
  const recipes = () => fs.readdirSync(recipeDir).filter((f) => f.endsWith(".jsx")).map((f) => f.slice(0, -4));
  const lines = (k) => { const f = path.join(KDIR, KFILES[k]); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean) : []; };
  if (action === "list") {
    return text({ folder: KDIR, lessons: lines("lesson").length, style: lines("style").length, notes: lines("note").length,
      recipes: recipes().map((r) => { const d = path.join(recipeDir, `${r}.md`); return fs.existsSync(d) ? `${r}: ${fs.readFileSync(d, "utf8").split("\n")[0]}` : r; }) });
  }
  if (!kind) throw new Error("kind is required");
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
  expressions: gExpressions, deliver: gDeliver, reference: gReference, matchnames: gMatch };
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
    return { ...t, inputSchema: schema };
  });
  return res;
});

await server.connect(new StdioServerTransport());
