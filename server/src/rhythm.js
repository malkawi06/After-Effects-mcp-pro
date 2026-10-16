// Rhythm analysis for motion sync: strength of every beat (kick / snare), cut pulse, sections, drops, breaks.
// Pure functions over a decoded track { rate, n, sample(i) } + the beat grid from analyseBeats — no I/O here.

const HOP_S = 0.01;   // 10 ms analysis frames
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

// Per-band onset strength (positive log-energy flux) at 100 frames/s. One pass over the samples: O(n).
function bandFlux(a) {
  const hop = Math.max(1, Math.round(a.rate * HOP_S)), F = Math.floor(a.n / hop);
  const cK = 1 - Math.exp(-2 * Math.PI * 150 / a.rate);     // kick: 2-pole low-pass 150 Hz
  const cH = Math.exp(-2 * Math.PI * 1500 / a.rate);        // snare / clap: high-pass 1.5 kHz ...
  const cL = 1 - Math.exp(-2 * Math.PI * 5000 / a.rate);    // ... then low-pass 5 kHz
  const kick = new Float32Array(F), snare = new Float32Array(F), rms = new Float32Array(F);
  let k1 = 0, k2 = 0, hx = 0, hy = 0, s1 = 0, i = 0, pk = 0, ps = 0;
  for (let f = 0; f < F; f++) {
    let kk = 0, ss = 0, ff = 0;
    for (let j = 0; j < hop; j++, i++) {
      const x = a.sample(i);
      k1 += cK * (x - k1); k2 += cK * (k1 - k2);
      hy = cH * (hy + x - hx); hx = x; s1 += cL * (hy - s1);
      kk += k2 * k2; ss += s1 * s1; ff += x * x;
    }
    const ek = Math.log(1e-7 + kk / hop), es = Math.log(1e-7 + ss / hop);
    if (f) { kick[f] = Math.max(0, ek - pk); snare[f] = Math.max(0, es - ps); }
    pk = ek; ps = es; rms[f] = Math.sqrt(ff / hop);
  }
  return { F, kick, snare, rms };
}

// Tempo + beat grid + strong hits from an onset-strength curve (log-energy flux).
export function analyseBeats(a) {
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

const percentile = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 1e-9; };
const autocorr = (d, lag) => { let s = 0; for (let f = 0; f + lag < d.length; f++) s += d[f] * d[f + lag]; return s / Math.max(1, d.length - lag); };

/**
 * @param a decoded audio; @param beat {period, beats} from analyseBeats
 * @returns {pulse, halfTime, hits:[[t, "K"|"S"|"K+S", strength, onPulse]], sections:[[t0,t1,level]], drops:[t], breaks:[t]}
 */
export function analyseRhythm(a, beat) {
  const { F, kick, snare, rms } = bandFlux(a);
  const P = beat.period, lagP = Math.round(P / HOP_S);
  // Cut pulse: above ~115 BPM editors cut every 2 beats; also when the kick pattern itself repeats every 2 beats.
  const halfTime = 60 / P >= 115 || autocorr(kick, 2 * lagP) > 1.12 * autocorr(kick, lagP);
  const pulse = halfTime ? 2 * P : P;

  // Strength of each beat = strongest kick / snare onset within ±40 ms of it, normalised over the track.
  const slot = (d, t) => { let m = 0; for (let f = Math.max(0, Math.round(t / HOP_S) - 4), e = Math.min(F - 1, Math.round(t / HOP_S) + 4); f <= e; f++) m = Math.max(m, d[f]); return m; };
  const ks = beat.beats.map((t) => slot(kick, t)), ss = beat.beats.map((t) => slot(snare, t));
  const kRef = percentile(ks, 0.95), sRef = percentile(ss, 0.95);
  const raw = beat.beats.map((t, i) => {
    const k = Math.min(1, ks[i] / kRef), s = Math.min(1, ss[i] / sRef);
    return [t, k >= 0.3 && s >= 0.3 ? "K+S" : k >= s ? "K" : "S", r2(Math.max(k, s))];
  });
  // Which beat parity carries the pulse (the stronger one of every 2 beats).
  let even = 0, odd = 0;
  raw.forEach((h, i) => { if (i % 2) odd += h[2]; else even += h[2]; });
  const par = even >= odd ? 0 : 1;
  const hits = raw.filter((h) => h[2] >= 0.3).map((h) => [r3(h[0]), h[1], h[2], !halfTime || raw.indexOf(h) % 2 === par]);

  // Sections per bar (4 beats) from loudness relative to the loud parts of the track.
  const bar = 4 * P, b0 = beat.beats[0] || 0, bars = [];
  for (let t = b0; t + bar / 2 < F * HOP_S; t += bar) {
    let sum = 0, n = 0;
    for (let f = Math.floor(t / HOP_S); f < Math.min(F, Math.floor((t + bar) / HOP_S)); f++) { sum += rms[f]; n++; }
    bars.push([t, n ? sum / n : 0]);
  }
  const ref = percentile(bars.map((x) => x[1]), 0.9);
  const level = (v) => (v < 0.55 * ref ? "quiet" : v < 0.8 * ref ? "mid" : "loud");
  const sections = [];
  for (const [t, v] of bars) {
    const L = level(v), last = sections[sections.length - 1];
    if (last && last[2] === L) last[1] = r2(t + bar); else sections.push([r2(t), r2(t + bar), L]);
  }
  // Snap a boundary to the strongest beat hit within ±1 beat (a drop lands on its big kick).
  const snap = (t) => {
    let best = null, bs = -1;
    for (const h of hits) { const d = Math.abs(h[0] - t); if (d > P * 1.01) continue; const sc = h[2] - 0.6 * d / P; if (sc > bs) { bs = sc; best = h; } }
    return best ? best[0] : r2(t);
  };
  const drops = [], breaks = [];
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1][2], cur = sections[i][2];
    if (cur === "loud" && prev !== "loud") drops.push(snap(sections[i][0]));
    if (prev === "loud" && cur !== "loud") breaks.push(snap(sections[i][0]));
  }
  return { pulse: r3(pulse), beat: r3(P), halfTime, hits, sections, drops, breaks };
}

// Map track time → comp time for a layer (compT = startTime + trackT), kept inside [inPoint, outPoint].
export function toComp(r, { startTime = 0, inPoint = 0, outPoint = Infinity }) {
  const m = (t) => r3(t + startTime), inside = (t) => t >= inPoint - 0.001 && t <= outPoint + 0.001;
  return {
    pulse: r.pulse, beat: r.beat, halfTime: r.halfTime,
    hits: r.hits.map(([t, ty, s, p]) => [m(t), ty, s, p]).filter((x) => inside(x[0])),
    sections: r.sections.map(([a, b, L]) => [r2(Math.max(m(a), inPoint)), r2(Math.min(m(b), outPoint)), L]).filter(([a, b]) => b > a),
    drops: r.drops.map(m).filter(inside), breaks: r.breaks.map(m).filter(inside),
  };
}

// Pulse beats strong enough to carry a cut or a big move.
export const keyHits = (c, min = 0.45) => c.hits.filter((h) => h[3] && h[2] >= min);

export function rhythmMap(c, bpm, maxHits = 40) {
  const key = keyHits(c).slice(0, maxHits);
  return [
    `Cut pulse ${c.pulse.toFixed(3)}s${c.halfTime ? ` (every 2 beats of ${bpm} BPM)` : ` (${bpm} BPM)`}. Quiet parts: cut no faster than this. Loud parts: every beat (${c.beat.toFixed(3)}s) at most.`,
    `Sections: ${c.sections.map(([a, b, L]) => `${a.toFixed(2)}–${b.toFixed(2)} ${L}`).join(" · ") || "n/a"}`,
    `Drops: ${c.drops.map((t) => t.toFixed(2)).join(", ") || "none"} · Breaks: ${c.breaks.map((t) => t.toFixed(2)).join(", ") || "none"}`,
    `Pulse hits (land cuts and big moves here): ${key.map(([t, ty, s]) => `${t.toFixed(2)}${ty}${s >= 0.85 ? "!" : ""}`).join(" ") || "none"}`,
  ].join("\n");
}

// Score cuts and coordinated key moments against the beat hits. fps gives the ±2-frame tolerance.
export function scoreSync(c, { cuts = [], moments = [] }, fps = 30) {
  const tol = 2 / fps + 0.001, acc = c.hits.map((h) => h[0]);
  cuts = cuts.filter((t) => t > 1.5 / fps);   // the comp's first frame is not a cut
  if (!acc.length) return null;
  const nearest = (t) => { let lo = 0, hi = acc.length - 1;   // binary search over sorted hits: O(log n)
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] < t) lo = mid; else hi = mid; }
    return Math.abs(acc[lo] - t) <= Math.abs(acc[hi] - t) ? acc[lo] : acc[hi]; };
  const check = (ts) => ts.map((t) => { const n = nearest(t); return { t, n, off: r3(t - n) }; });
  const cs = check(cuts), ms = check(moments), miss = (xs) => xs.filter((x) => Math.abs(x.off) > tol);
  const quiet = (t) => c.sections.some(([a, b, L]) => L !== "loud" && t >= a && t < b);
  const sorted = [...new Set(cuts.map((t) => Math.round(t * fps)))].sort((x, y) => x - y).map((f) => f / fps), fast = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap < (quiet(sorted[i]) ? 0.75 * c.pulse : 0.8 * c.beat)) fast.push([r2(sorted[i - 1]), r2(sorted[i]), r2(gap)]);
  }
  return { cuts: cs, moments: ms, cutMisses: miss(cs), momentMisses: miss(ms), fast };
}

export function syncReport(r, name) {
  if (!r) return "";
  const ok = (xs, m) => `${xs.length - m.length}/${xs.length}`;
  const fmt = (xs) => xs.slice(0, 12).map((x) => `${x.t.toFixed(2)}s (${x.off > 0 ? "+" : ""}${Math.round(x.off * 1000)}ms from beat ${x.n.toFixed(2)})`).join(", ");
  return [
    `Sync with "${name}": cuts on a beat hit (±2f) ${ok(r.cuts, r.cutMisses)}, big moments ${ok(r.moments, r.momentMisses)}.`,
    r.cutMisses.length ? `  Off-beat cuts: ${fmt(r.cutMisses)}` : "",
    r.momentMisses.length ? `  Off-beat moments: ${fmt(r.momentMisses)}` : "",
    r.fast.length ? `  Too fast for the music: ${r.fast.slice(0, 8).map(([a, b, g]) => `${a}→${b}s (${g}s)`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
