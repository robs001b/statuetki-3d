// Ażur: rozmieszczenie ziaren na powierzchni (Poisson, deterministycznie), sąsiedztwa,
// pola otworów: Voronoi (linia A i B z motywami), TPMS (gyroid), low-poly, kontury, spirala.
import { makeRng } from './prng.js';
import { smin, len2 } from './sdf.js';
import { MOTIFS, motifItems, motifInscribed } from './motifs.js';

export function gradient(B, x, y, z, e = 0.05) {
  const a = B(x + e, y - e, z - e), b = B(x - e, y - e, z + e), c = B(x - e, y + e, z - e), d = B(x + e, y + e, z + e);
  const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d; const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

export class Grid {
  constructor(pts, cell, bounds) {
    this.c = cell; this.o = bounds.min.map((v) => v - cell);
    this.n = [0, 1, 2].map((a) => Math.ceil((bounds.max[a] - bounds.min[a]) / cell) + 3);
    this.map = new Map(); this.pts = pts;
  }
  key(i, j, k) { return (k * this.n[1] + j) * this.n[0] + i; }
  cellOf(x, y, z) { return [Math.floor((x - this.o[0]) / this.c), Math.floor((y - this.o[1]) / this.c), Math.floor((z - this.o[2]) / this.c)]; }
  add(id) { const p = this.pts[id]; const [i, j, k] = this.cellOf(p[0], p[1], p[2]); const kk = this.key(i, j, k); let a = this.map.get(kk); if (!a) this.map.set(kk, (a = [])); a.push(id); }
  forNear(x, y, z, r, cb) {
    const [i0, j0, k0] = this.cellOf(x - r, y - r, z - r), [i1, j1, k1] = this.cellOf(x + r, y + r, z + r);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = this.map.get(this.key(i, j, k)); if (a) for (const id of a) cb(id); }
  }
  nearest(x, y, z) {
    let best = -1, bd = Infinity, best2 = -1, bd2 = Infinity;
    for (let r = this.c; r < this.c * 8; r += this.c) {
      this.forNear(x, y, z, r, (id) => { const p = this.pts[id]; const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
        if (d < bd) { bd2 = bd; best2 = best; bd = d; best = id; } else if (d < bd2 && id !== best) { bd2 = d; best2 = id; } });
      if (best >= 0 && Math.sqrt(bd2) <= r) break;
    }
    return [best, Math.sqrt(bd), best2, Math.sqrt(bd2)];
  }
}

// kandydaci na powierzchni bryły B (znormalizowany SDF)
export function surfaceCandidates(B, bounds, h, rng) {
  const out = [];
  const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;
  for (let z = z0; z <= z1; z += h) for (let y = y0; y <= y1; y += h) for (let x = x0; x <= x1; x += h) {
    const d0 = B(x, y, z); if (Math.abs(d0) > h) continue;
    let px = x + (rng() - 0.5) * h, py = y + (rng() - 0.5) * h, pz = z + (rng() - 0.5) * h;
    for (let it = 0; it < 3; it++) { const d = B(px, py, pz); const g = gradient(B, px, py, pz); px -= d * g[0]; py -= d * g[1]; pz -= d * g[2]; }
    if (Math.abs(B(px, py, pz)) < 0.05) out.push([px, py, pz]);
  }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}

export function buildSeeds(B, bounds, P, ctx) {
  const rng = makeRng(P.seed, 1);
  const s = P.cell, w = P.rib;
  const cand = surfaceCandidates(B, bounds, s / 3, rng);
  const pts = [], rad = [], motif = [], grid = new Grid(pts, s, bounds);
  const lineB = P.line === 'B';
  const items = motifItems(P.motif);
  const M = P.motifSize, bridge = 0.75;
  const Dm = M + w + 2 * bridge; // odstęp motyw - motyw (bazowy)
  // odstęp motyw - zwykła komórka; bliższy sąsiad zmniejsza motyw (mostek >= 1,5 mm pilnuje skala motywu)
  const Dn = Math.max(0.75 * M + 3.2 - w, 0.8 * s);
  const footZ = ctx.footZ;
  const tryAdd = (p, r, mot, minFn) => {
    let ok = true; const R = Math.max(r, Dm) * 1.6;
    grid.forNear(p[0], p[1], p[2], R, (id) => { if (!ok) return; const q = pts[id]; const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < minFn(id)) ok = false; });
    if (!ok) return false; const id = pts.length; pts.push(p); rad.push(r); motif.push(mot); grid.add(id); return true;
  };
  if (lineB) {
    const spacing = Dm * (1 + (1 - P.motifShare) * 1.6);
    for (const p of cand) {
      if (p[2] < footZ + Dm * 0.6 || (ctx.solidZone && ctx.solidZone(p[0], p[1], p[2]))) continue;
      const n = gradient(B, p[0], p[1], p[2]);
      const fr = frame(n);
      let curvOk = true; // ograniczenie krzywizny: normalne na brzegu motywu
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = [p[0] + (fr.u[0] * a + fr.v[0] * b) * M * 0.5, p[1] + (fr.u[1] * a + fr.v[1] * b) * M * 0.5, p[2] + (fr.u[2] * a + fr.v[2] * b) * M * 0.5];
        const nq = gradient(B, q[0], q[1], q[2]); if (nq[0] * n[0] + nq[1] * n[1] + nq[2] * n[2] < 0.82) { curvOk = false; break; }
        if (Math.abs(B(q[0], q[1], q[2])) > M * 0.12) { curvOk = false; break; }
      }
      if (!curvOk) continue;
      tryAdd(p, Dm, 1, (id) => (motif[id] ? spacing : Dm));
    }
  }
  const jit = P.jitter;
  for (const p of cand) {
    const r = s * (1 + jit * (rng() - 0.5));
    tryAdd(p, r, 0, (id) => (motif[id] ? Math.max(Dn, (r + rad[id]) / 2) : (r + rad[id]) / 2));
  }
  // dane ziaren
  const S = pts.map((p, i) => {
    const n = gradient(B, p[0], p[1], p[2]);
    const solid = p[2] < footZ + s * 0.6 || (ctx.solidZone ? ctx.solidZone(p[0], p[1], p[2]) : false);
    return { p, n, solid, motif: motif[i] ? 1 : 0, fr: frame(n) };
  });
  // sąsiedzi (promień 3s)
  for (let i = 0; i < S.length; i++) {
    const p = S[i].p, nb = [];
    grid.forNear(p[0], p[1], p[2], Math.max(3 * s, 2 * Dm), (j) => { if (j === i) return; const q = S[j].p; const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < Math.max(3 * s, 2 * Dm)) nb.push([d, j]); });
    nb.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    S[i].nb = nb.slice(0, 26).map(([d, j]) => { const q = S[j].p; const nx = (q[0] - p[0]) / d, ny = (q[1] - p[1]) / d, nz = (q[2] - p[2]) / d;
      return { j, d, nx, ny, nz, c: nx * (p[0] + q[0]) / 2 + ny * (p[1] + q[1]) / 2 + nz * (p[2] + q[2]) / 2 }; });
  }
  // motywy: typ, skala, kontrola mostka
  const mrng = makeRng(P.seed, 2);
  const stats = { motifs: 0, motifDropped: 0, minBridge: Infinity, minMotifHole: Infinity };
  for (const sd of S) {
    if (!sd.motif) continue;
    const type = items[Math.floor(mrng() * items.length) % items.length];
    const rot = P.motifOrient === 'losowa' ? (mrng() - 0.5) * 1.2 : 0;
    const dmin = sd.nb.length ? sd.nb[0].d : Infinity;
    let scale = Math.min(M * 1.35, dmin + w - 3.2); // mostek >= 1,5 mm (z zapasem 0,1)
    const holeD = scale * motifInscribed(type);
    if (sd.solid || holeD < 3.0) { sd.motif = 0; stats.motifDropped++; continue; }
    sd.mType = type; sd.mScale = scale; sd.mRot = rot; sd.mF = MOTIFS[type].f;
    const bridgeW = dmin / 2 - scale / 2 + w / 2;
    stats.motifs++; stats.minBridge = Math.min(stats.minBridge, bridgeW); stats.minMotifHole = Math.min(stats.minMotifHole, holeD);
  }
  // najmniejszy otwór komórki Voronoi (średnica koła wpisanego w płaszczyźnie)
  let minHole = Infinity;
  for (const sd of S) { if (sd.solid || sd.motif || !sd.nb.length) continue; minHole = Math.min(minHole, sd.nb[0].d - w); }
  stats.minCellHole = minHole; stats.count = S.length;
  return { S, grid, stats };
}

export function frame(n) {
  let vx = -n[2] * n[0], vy = -n[2] * n[1], vz = 1 - n[2] * n[2]; // z - (z.n)n
  let l = Math.hypot(vx, vy, vz);
  if (l < 0.25) { vx = 1 - n[0] * n[0]; vy = -n[0] * n[1]; vz = -n[0] * n[2]; l = Math.hypot(vx, vy, vz); }
  const v = [vx / l, vy / l, vz / l];
  const u = [v[1] * n[2] - v[2] * n[1], v[2] * n[0] - v[0] * n[2], v[0] * n[1] - v[1] * n[0]]; // u = v x n
  return { u, v };
}

// Pole otworu Voronoi/motyw: wartość ujemna wewnątrz otworu
export function makeVoronoiHole(seeds, P) {
  const { S, grid } = seeds; const w = P.rib, kc = Math.max(0.5, 0.32 * P.cell);
  return (x, y, z) => {
    const [i] = grid.nearest(x, y, z); if (i < 0) return 10;
    const sd = S[i]; if (sd.solid) return 10;
    let b = Infinity;
    for (const e of sd.nb) { const dist = e.c - (e.nx * x + e.ny * y + e.nz * z); b = smin(b, dist, kc); if (b < -w) break; }
    let H = -(b - w / 2);
    if (sd.motif) {
      const qx = x - sd.p[0], qy = y - sd.p[1], qz = z - sd.p[2];
      let u = qx * sd.fr.u[0] + qy * sd.fr.u[1] + qz * sd.fr.u[2], v = qx * sd.fr.v[0] + qy * sd.fr.v[1] + qz * sd.fr.v[2];
      if (sd.mRot) { const c = Math.cos(sd.mRot), s = Math.sin(sd.mRot); const t = c * u + s * v; v = -s * u + c * v; u = t; }
      H = Math.max(H, sd.mF(u / sd.mScale, v / sd.mScale) * sd.mScale);
    }
    return H;
  };
}

// TPMS gyroid: otwory tam, gdzie G > tau
export function makeGyroidHole(P) {
  const k = 2 * Math.PI / (P.cell * 1.5), tau = Math.max(0.1, 1.1 - P.rib / (P.cell * 0.22));
  return (x, y, z) => { const a = k * x, b = k * y, c = k * z; const G = Math.sin(a) * Math.cos(b) + Math.sin(b) * Math.cos(c) + Math.sin(c) * Math.cos(a); return -(G - tau) / (k * 1.3); };
}

// Low-poly: żebra wzdłuż krawędzi grafu Gabriela ziaren (okna trójkątne)
export function makeLowpolyHole(seeds, P) {
  const { S, grid } = seeds; const w = P.rib;
  const edges = new Map();
  for (let i = 0; i < S.length; i++) {
    const adj = [];
    for (const e of S[i].nb) { const j = e.j; const m = [(S[i].p[0] + S[j].p[0]) / 2, (S[i].p[1] + S[j].p[1]) / 2, (S[i].p[2] + S[j].p[2]) / 2];
      let ok = true; const r2 = (e.d / 2) ** 2 * 0.999;
      for (const f of S[i].nb) { if (f.j === j) continue; const q = S[f.j].p; if ((q[0] - m[0]) ** 2 + (q[1] - m[1]) ** 2 + (q[2] - m[2]) ** 2 < r2) { ok = false; break; } }
      if (ok) adj.push(j); }
    S[i].adj = adj;
  }
  return (x, y, z) => {
    const [i] = grid.nearest(x, y, z); if (i < 0) return 10; if (S[i].solid) return 10;
    let best = Infinity; const cand = [i, ...S[i].adj];
    for (const a of cand) for (const b of S[a].adj) {
      const A = S[a].p, Bp = S[b].p; const dx = Bp[0] - A[0], dy = Bp[1] - A[1], dz = Bp[2] - A[2];
      const px = x - A[0], py = y - A[1], pz = z - A[2]; const h = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)));
      let rx = px - dx * h, ry = py - dy * h, rz = pz - dz * h;
      const n = S[a].n; const nn = rx * n[0] + ry * n[1] + rz * n[2]; rx -= nn * n[0]; ry -= nn * n[1]; rz -= nn * n[2];
      const d = Math.hypot(rx, ry, rz); if (d < best) best = d;
    }
    for (const a of cand) if (S[a].solid) return 10;
    return -(best - w / 2);
  };
}

// Kontury warstwowe: zagnieżdżone obrysy sylwetki (widok z przodu) + mostki promieniowe
export function makeContourHole(sil, P, center) {
  const pitch = P.cell, w = P.rib; const nSp = Math.max(6, Math.round(P.cell * 1.2));
  return (x, y, z) => {
    const e = sil(x, z); if (e < 0) return 10;
    const k = Math.round(e / pitch); const dBand = Math.abs(e - k * pitch);
    const dx = x - center[0], dz = z - center[1]; const r = Math.hypot(dx, dz); const ang = Math.atan2(dz, dx);
    const off = (Math.floor(e / pitch) % 2) * Math.PI / nSp;
    const a = ((ang + off) * nSp / (2 * Math.PI)); const dSp = Math.abs(a - Math.round(a)) * 2 * Math.PI / nSp * Math.max(r, 1);
    return -(Math.min(dBand, dSp) - w / 2);
  };
}

// Spirala: śrubowe wstęgi wokół osi Z + żebra pionowe
export function makeSpiralHole(P, center) {
  const pitch = P.cell * 1.2, w = P.rib, nMer = 10;
  return (x, y, z) => {
    const dx = x - center[0], dy = y - center[1]; const r = Math.hypot(dx, dy); const ang = Math.atan2(dy, dx);
    const u = z / pitch - ang / (2 * Math.PI) * 2; const dBand = Math.abs(u - Math.round(u)) * pitch * 0.85;
    const a = ang * nMer / (2 * Math.PI); const dMer = Math.abs(a - Math.round(a)) * 2 * Math.PI / nMer * Math.max(r, 1);
    return -(Math.min(dBand, dMer) - w / 2);
  };
}
