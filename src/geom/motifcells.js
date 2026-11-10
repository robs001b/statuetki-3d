// Linia B, metoda 2 ("medalion"): motyw jako pełny kształt w oknie o stałej szerokości szczeliny,
// obwiedziony żebrem ramki; komórki Voronoi oplatają ramkę (przycięte do jej obrysu ze stałym żebrem).
// Każdy motyw jest rasteryzowany w płaszczyźnie stycznej (oś v = rzut pionu), a skan warstw w 2D
// dokłada pionowe łączniki pod każdym punktem, który zaczynałby się w powietrzu (czubki, wcięcia).
// Wynik: pole odległości (mm) próbkowane biliniowo w polu otworów.
import { makeRng } from './prng.js';
import { MOTIFS, SOLID_OVERRIDES, SMALL_OVERRIDES, digitGlyph, motifItems } from './motifs.js';
import { gradient } from './lattice.js';

const PX = 0.1; // rozdzielczość rastra motywu [mm]

// --- 1D/2D transformata odległości (Felzenszwalb), wynik: odległość euklidesowa w pikselach
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
// odległość każdego piksela do najbliższego piksela, gdzie mask == target
function edt(mask, N, target) {
  const INF = 1e12, g = new Float64Array(N * N), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  for (let i = 0; i < N * N; i++) g[i] = mask[i] === target ? 0 : INF;
  for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) f[y] = g[y * N + x]; edt1(f, N, d, v, z); for (let y = 0; y < N; y++) g[y * N + x] = d[y]; }
  for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) f[x] = g[y * N + x]; edt1(f, N, d, v, z); for (let x = 0; x < N; x++) g[y * N + x] = Math.sqrt(d[x]); }
  return g;
}
// otwarcie morfologiczne zbioru "target" promieniem r [px]: usuwa części węższe niż 2r
function openSet(mask, N, target, r) {
  const other = 1 - target;
  const dOut = edt(mask, N, other); // odległość do dopełnienia
  const core = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) core[i] = mask[i] === target && dOut[i] >= r ? 1 : 0;
  const dCore = edt(core, N, 1);
  let changed = 0;
  for (let i = 0; i < N * N; i++) if (mask[i] === target && dCore[i] > r + 0.5) { mask[i] = other; changed++; }
  return changed;
}

// --- skan warstw (od dołu, piksel 0,1 mm, tolerancja 45° = 1 piksel na wiersz).
// Piksel bez materiału pod sobą: odcinek wiszący. Cały odcinek wiszący = wyspa -> łącznik pod środkiem;
// nawis jednostronny dłuższy niż Lc -> łącznik pod końcem; mostek (oparty z obu stron) dłuższy niż Lb -> łącznik pod środkiem.
function addConnectors(mat, N, hw, motifMask, Lc, Lb) {
  const bars = [];
  const bar = (r, c) => {
    c = Math.max(hw, Math.min(N - 1 - hw, c));
    let r2 = r - 1; while (r2 > 0 && !mat[r2 * N + c]) r2--;
    for (let rr = r2; rr <= Math.min(N - 1, r + hw); rr++) for (let k = c - hw; k <= c + hw; k++) mat[rr * N + k] = 1;
    bars.push({ c, r0: r2, r1: r, fromMotif: !!motifMask[r * N + c], toMotif: !!motifMask[r2 * N + c] });
  };
  for (let r = 1; r < N; r++) {
    for (let guard = 0; guard < 40; guard++) {
      let added = false, x = 0;
      while (x < N && !added) {
        if (!mat[r * N + x]) { x++; continue; }
        const a = x; while (x < N && mat[r * N + x]) x++; const b = x - 1;
        const sup = (k) => mat[(r - 1) * N + k] || (k > 0 && mat[(r - 1) * N + k - 1]) || (k < N - 1 && mat[(r - 1) * N + k + 1]);
        let k = a;
        while (k <= b && !added) {
          if (sup(k)) { k++; continue; }
          const s0 = k; while (k <= b && !sup(k)) k++; const s1 = k - 1; const L = s1 - s0 + 1;
          const left = s0 === a, right = s1 === b;
          if (left && right) { bar(r, Math.round((a + b) / 2)); added = true; }
          else if ((left || right) && L > Lc) { bar(r, left ? s0 + hw : s1 - hw); added = true; }
          else if (!left && !right && L > Lb) { bar(r, Math.round((s0 + s1) / 2)); added = true; }
        }
      }
      if (!added) break;
    }
  }
  return bars;
}

// raster jednego motywu: zwraca pole odległości (ujemne w prześwicie okna)
export function buildMotifCell(solid, outer, rot, M, g, w, wc) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const fS = (u, v) => { const x = c * u + s * v, y = -s * u + c * v; return solid(x / M, y / M) * M; };
  const fO = (u, v) => { const x = c * u + s * v, y = -s * u + c * v; return outer(x / M, y / M) * M; };
  // zasięg okna
  let ext = 0; for (let i = 0; i < 64; i++) { const a = i * Math.PI / 32; for (let r = M; r > 0; r -= 0.1) if (fO(r * Math.cos(a), r * Math.sin(a)) < 0) { ext = Math.max(ext, r); break; } }
  const Rwin = ext + g + w;
  const R = Rwin + 1.0, N = Math.ceil(2 * R / PX) | 1, o = -R;
  const mat = new Uint8Array(N * N), motif = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = o + (i + 0.5) * PX, v = o + (j + 0.5) * PX; const k = j * N + i;
    const fs = fS(u, v), fo = fO(u, v);
    motif[k] = fs <= 0 ? 1 : 0; mat[k] = fs <= 0 || fo >= g ? 1 : 0;
  }
  let motif0 = 0, gap0 = 0; for (let k = 0; k < N * N; k++) { motif0 += motif[k]; gap0 += mat[k] ? 0 : 1; }
  const rMat = 0.6 / PX, rHole = 1.5 / PX, hw = Math.ceil(wc / 2 / PX);
  openSet(mat, N, 1, rMat);   // elementy motywu cieńsze niż 1,2 mm - usunięte (i tak by się nie wydrukowały)
  openSet(mat, N, 0, rHole);  // prześwity węższe niż 3 mm - zamknięte
  let bars = [];
  for (let it = 0; it < 3; it++) { const b = addConnectors(mat, N, hw, motif, Math.round(1.0 / PX), Math.round(8 / PX)); bars = bars.concat(b); const ch = openSet(mat, N, 0, rHole); if (!b.length && !ch) break; }
  // łącznik górny (sztywność), jeśli motyw nie jest podwieszony od góry
  if (!bars.some((b) => b.toMotif && !b.fromMotif)) {
    let best = null;
    for (let j = N - 1; j >= 0 && !best; j--) for (let i = 0; i < N; i++) if (motif[j * N + i] && mat[j * N + i]) { const d = Math.abs(i - (N >> 1)); if (!best || d < best.d) best = { i, j, d }; }
    if (best) { let j2 = best.j + 1; while (j2 < N - 1 && !mat[j2 * N + best.i]) j2++;
      for (let rr = best.j - hw; rr <= j2; rr++) for (let k = best.i - hw; k <= best.i + hw; k++) if (rr >= 0 && rr < N && k >= 0 && k < N) mat[rr * N + k] = 1;
      bars.push({ c: best.i, r0: best.j, r1: j2, top: true }); openSet(mat, N, 0, rHole); }
  }
  // pole odległości (mm): + w materiale, - w prześwicie
  const dH = edt(mat, N, 0), dM = edt(mat, N, 1);
  const F = new Float32Array(N * N); for (let i = 0; i < N * N; i++) F[i] = mat[i] ? (dH[i] - 0.5) * PX : -(dM[i] - 0.5) * PX;
  // najmniejszy prześwit (koło wpisane) po wszystkich składowych okna
  const lab = new Int32Array(N * N).fill(-1); let minHole = Infinity, holes = 0;
  for (let k0 = 0; k0 < N * N; k0++) {
    if (mat[k0] || lab[k0] >= 0) continue; let mx = 0; const st = [k0]; lab[k0] = holes;
    while (st.length) { const k = st.pop(); mx = Math.max(mx, dM[k]); const x = k % N, y = (k / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; const kk = yy * N + xx; if (!mat[kk] && lab[kk] < 0) { lab[kk] = holes; st.push(kk); } } }
    holes++; minHole = Math.min(minHole, 2 * mx * PX);
  }
  const sample = (u, v) => {
    const x = (u - o) / PX - 0.5, y = (v - o) / PX - 0.5; if (x < 0 || y < 0 || x >= N - 1 || y >= N - 1) return 5;
    const i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = j * N + i;
    return (F[k] * (1 - fx) + F[k + 1] * fx) * (1 - fy) + (F[k + N] * (1 - fx) + F[k + N + 1] * fx) * fy;
  };
  // czytelność: ile kształtu motywu i prześwitu okna zostało po otwarciach i łącznikach
  let motif1 = 0, gap1 = 0; for (let k = 0; k < N * N; k++) { if (motif[k] && mat[k]) motif1++; if (!mat[k]) gap1++; }
  const motifKept = motif0 ? motif1 / motif0 : 0, gapKept = gap0 ? gap1 / gap0 : 0;
  const readable = motifKept >= 0.9 && gapKept >= 0.45 && isFinite(minHole);
  return { sample, fO, Rwin, Rhole: ext + g, R, bars: bars.length, minHole, holes, N, mat, motif, M, motifKept, gapKept, readable };
}

function glyphFor(type, idx, P, size) {
  if (size < 11 && SMALL_OVERRIDES[type]) return { solid: SMALL_OVERRIDES[type].f, outer: SMALL_OVERRIDES[type].fo };
  if (type === 'cyfra') { const digits = (String(P.number || '30').replace(/[^0-9]/g, '') || '30'); const f = digitGlyph(digits[idx % digits.length]); return { solid: f, outer: f }; }
  const o = SOLID_OVERRIDES[type]; if (o) return { solid: o.f, outer: o.fo };
  return { solid: MOTIFS[type].f, outer: MOTIFS[type].f };
}
export function motifTypesV2(id) { return id === 'cyfry' ? ['cyfra'] : motifItems(id); }

function frame(n) {
  let vx = -n[2] * n[0], vy = -n[2] * n[1], vz = 1 - n[2] * n[2]; let l = Math.hypot(vx, vy, vz);
  if (l < 0.25) { vx = 1 - n[0] * n[0]; vy = -n[0] * n[1]; vz = -n[0] * n[2]; l = Math.hypot(vx, vy, vz); }
  const v = [vx / l, vy / l, vz / l]; const u = [v[1] * n[2] - v[2] * n[1], v[2] * n[0] - v[0] * n[2], v[0] * n[1] - v[1] * n[0]];
  return { u, v };
}

// rozmieszczenie: najpierw okna motywów (Poisson, ograniczenie krzywizny), potem ziarna Voronoi poza ramkami
export function placeMotifsV2(B, cand, P, ctx) {
  const M = P.motifSize, w = P.rib, g = ctx.minHole, wc = Math.max(1.6, w);
  const types = motifTypesV2(P.motif); const mrng = makeRng(P.seed, 12);
  // rozmiary: nominalny, a przy automatycznym zmniejszaniu kolejno mniejsze (x0,87) do minimum
  const Mmin = Math.min(M, Math.max(8, P.motifMin || 8.5));
  const sizes = [M]; if (P.motifAuto) { let s = M * 0.87; while (s > Mmin + 0.3) { sizes.push(Math.round(s * 10) / 10); s *= 0.87; } if (Mmin < M) sizes.push(Mmin); }
  const cache = new Map();
  const cell = (type, idx, rot, size) => { const key = type + '|' + (type === 'cyfra' ? idx : '') + '|' + rot.toFixed(4) + '|' + size; if (!cache.has(key)) { const gl = glyphFor(type, idx, P, size); cache.set(key, buildMotifCell(gl.solid, gl.outer, rot, size, g, w, wc)); } return cache.get(key); };
  const list = []; let idx = 0, rejected = 0, unreadable = 0;
  const share = P.motifShare;
  const S2 = Math.SQRT1_2;
  const solidAt = (x, y, z) => { const b = B(x, y, z); if (b > 0) return false; if (z <= ctx.footZ || b + ctx.shell >= 0.6) return true; return Math.max(b + ctx.shell, -ctx.roof.sample(x, y, z) * S2) >= 0; };
  // długość wypełnienia "dach 45°" (bez samej skorupy, także ściany prostopadłej) wzdłuż -n
  const fillAt = (x, y, z) => { const b = B(x, y, z); if (b > -ctx.shell - 0.3 || z <= ctx.footZ) return false; return ctx.roof.sample(x, y, z) <= 0; };
  const thick = (q, n, t0) => { let L = 0; for (let t = t0; t < t0 + 20; t += 0.5) { const x = q[0] - n[0] * t, y = q[1] - n[1] * t, z = q[2] - n[2] * t; if (B(x, y, z) > 0 && t > t0 + 1) break; if (fillAt(x, y, z)) L += 0.5; } return L; };
  // ocena miejsca na okno o promieniu R: próbki na dwóch okręgach; promień wzdłuż -n musi trafić w skorupę
  // (okno nie wisi nad prześwitem bryły), bez grubego wypełnienia "dach 45°", normalne zgodne z normalną okna
  const why = {}; const no = (k) => { why[k] = (why[k] || 0) + 1; return null; };
  // przelot: cała droga wzdłuż -n do wyjścia z bryły w materiale (bez pustki) -> długość, inaczej -1
  const solidRun = (q, n, t0) => { for (let t = t0; t < t0 + 32; t += 0.5) { const x = q[0] - n[0] * t, y = q[1] - n[1] * t, z = q[2] - n[2] * t; if (B(x, y, z) > 0) return t; if (!solidAt(x, y, z)) return -1; } return -1; };
  const fit = (p, R, thickLim, allowThrough) => {
    if (p[2] - R < ctx.footZ + 1.0 || (ctx.solidZone && ctx.solidZone(p[0], p[1], p[2]))) return no('foot');
    const n = gradient(B, p[0], p[1], p[2]); const fr = frame(n); let minDot = 1, minIn = 1, needThrough = false; const qs = [];
    for (let k = 0; k < 33; k++) {
      const rr = k === 32 ? 0 : k < 16 ? R : R * 0.55, a = (k % 16) * Math.PI / 8 + (k < 16 ? 0 : Math.PI / 16), cu = Math.cos(a) * rr, cv = Math.sin(a) * rr;
      const q = [p[0] + fr.u[0] * cu + fr.v[0] * cv, p[1] + fr.u[1] * cu + fr.v[1] * cv, p[2] + fr.u[2] * cu + fr.v[2] * cv];
      if (Math.abs(B(q[0], q[1], q[2])) > 4.5 || q[2] < ctx.footZ + 1.0 || (ctx.solidZone && ctx.solidZone(q[0], q[1], q[2]))) return no(Math.abs(B(q[0], q[1], q[2])) > 4.5 ? 'off' : 'zone');
      let hit = false, t0 = 0; for (let t = -2; t <= 4.5 + P.shell && !hit; t += 0.5) if (B(q[0] - n[0] * t, q[1] - n[1] * t, q[2] - n[2] * t) <= -0.4) { hit = true; t0 = t; }
      if (!hit) return no('ray');
      qs.push([q, t0]);
      if (ctx.roof && thick(q, n, t0) > thickLim) { if (!allowThrough) return no('thick'); needThrough = true; }
      if (k < 32) { const nq = gradient(B, q[0], q[1], q[2]); const d = nq[0] * n[0] + nq[1] * n[1] + nq[2] * n[2]; minDot = Math.min(minDot, d); if (k >= 16) minIn = Math.min(minIn, d); }
    }
    let through = 0, exit = null;
    let niche = false;
    if (needThrough) {
      // okno w pełnym wypełnieniu (np. ramię krzyża): wycięcie na wylot, tylko przód-tył (czytelne z obu stron),
      // gdy na całej drodze jest materiał i wyjście po drugiej stronie jest równoległe
      const tryThrough = () => {
        if (minIn < 0.88 || Math.abs(n[1]) < 0.9) return false;
        let L = 0; for (const [q, t0] of qs) { const l = solidRun(q, n, t0); if (l < 0) return false; L = Math.max(L, l); }
        if (L > 28) return false;
        const Lc = solidRun(p, n, 0); if (Lc < 0) return false; const e = [p[0] - n[0] * Lc, p[1] - n[1] * Lc, p[2] - n[2] * Lc];
        const ne = gradient(B, e[0], e[1], e[2]); if (-(ne[0] * n[0] + ne[1] * n[1] + ne[2] * n[2]) < 0.9) return false;
        through = L; exit = e; return true;
      };
      if (!tryThrough()) {
        // za gruba bryła na przelot (np. dzwon): nisza - pełny materiał za całą głębokością cięcia, motyw
        // jako medalion na dnie niszy (bez stropów wiszących w pustce)
        const D = P.shell + 9.5;
        for (const [q, t0] of qs) for (let t = t0; t <= t0 + D; t += 0.5) { const x = q[0] - n[0] * t, y = q[1] - n[1] * t, z = q[2] - n[2] * t; if (B(x, y, z) > 0 || !solidAt(x, y, z)) return no('thick'); }
        niche = true;
      }
    }
    return { n, fr, minDot, through, exit, niche };
  };
  const gap = 0.45 * P.cell * (1 + (1 - share) * 2.5);
  const ghosts = []; const free = (p, Rw) => { for (const q of list.concat(ghosts)) { const d = Math.hypot(q.p[0] - p[0], q.p[1] - p[1], q.p[2] - p[2]); if (d < Rw + q.mc.Rwin + gap) return false; } return true; };
  const bySize = {};
  sizes.forEach((size, si) => {
    // próg płaskości zależny od rozmiaru: mniejsze okno może leżeć na mocniej zakrzywionym fragmencie (boki)
    const thr = sizes.length > 1 ? 0.8 - 0.14 * si / (sizes.length - 1) : 0.8;
    // okno nie tnie wypełnienia "dach 45°" (> 1 mm wzdłuż normalnej); w pełnym wypełnieniu tylko okno na wylot
    const tLim = 1.0;
    const cells = types.map((t, i) => cell(t, i, 0, size));
    if (!cells.some((c) => c.readable)) { unreadable++; return; }
    const Rmax = Math.max(...cells.map((c) => c.Rwin));
    // test dopasowania na obwodzie prześwitu okna (+ćwierć żebra); rama okna może zawinąć się na zaokrągleniu bryły
    const Rfit = Math.max(...cells.map((c) => c.Rhole)) + 0.25 * w;
    const scored = []; const dbg = { free: 0, nofit: 0, flat: 0 };
    cand.forEach((p, ci) => { if (!free(p, Rmax)) { dbg.free++; return; } const w0 = { ...why }; const f = fit(p, Rfit, tLim, !(globalThis.process && process.env.NOTHROUGH)); if (globalThis.__CD) globalThis.__CD.push([size, p.map((v) => +v.toFixed(1)), Object.keys(why).find((k) => why[k] !== w0[k]) || (f ? f.minDot.toFixed(2) : '?')]); if (!f || f.minDot < thr) { if (f) dbg.flat++; else dbg.nofit++; rejected++; return; } scored.push({ p, n: f.n, fr: f.fr, sc: Math.round(f.minDot * 20) / 20 - (f.through ? 0.5 : f.niche ? 0.7 : 0), ci, through: f.through, exit: f.exit, niche: f.niche }); });
    scored.sort((x, y) => y.sc - x.sc || x.ci - y.ci);
    if (typeof process !== 'undefined' && process.env && process.env.MDBG) console.error('size', size, 'thr', thr.toFixed(2), 'Rmax', Rmax.toFixed(1), dbg, why, 'ok', scored.length);
    for (const c of scored) {
      const type = types[idx % types.length];
      const rot = P.motifOrient === 'losowa' ? Math.round((mrng() - 0.5) * 8) * 0.15 : 0;
      const mc = cell(type, idx, rot, size); if (!mc.readable) continue;
      if (!free(c.p, mc.Rwin) || (c.exit && !free(c.exit, mc.Rwin))) continue;
      list.push({ p: c.p, n: c.n, fr: c.fr, mc, type, rot, size, through: c.through ? c.through + 1.5 : 0, niche: !!c.niche });
      if (c.exit) ghosts.push({ p: c.exit, mc }); idx++; bySize[size] = (bySize[size] || 0) + 1;
    }
  });
  let minHole = Infinity; for (const m of list) minHole = Math.min(minHole, m.mc.minHole);
  return { list, rejected, minHole, wc, g, sizes, bySize, Mmin, through: list.filter((m) => m.through).length, niche: list.filter((m) => m.niche).length };
}

export function makeMotifHoleV2(pointHole, mot, P, B = null) {
  const { list } = mot; const w = P.rib, g = mot.g, rOpen = 1.5;
  const gc = 24; const map = new Map(); const key = (i, j, k) => i + ',' + j + ',' + k;
  list.forEach((m, id) => { const R = m.mc.R; const dep = m.through || (m.niche ? P.shell + 14 : 0); for (let t = 0; t <= dep + 1e-6; t += Math.max(1, dep / Math.ceil(dep / 12 || 1))) { const x = m.p[0] - m.n[0] * t, y = m.p[1] - m.n[1] * t, z = m.p[2] - m.n[2] * t; for (let i = Math.floor((x - R) / gc); i <= Math.floor((x + R) / gc); i++) for (let j = Math.floor((y - R) / gc); j <= Math.floor((y + R) / gc); j++) for (let k = Math.floor((z - R) / gc); k <= Math.floor((z + R) / gc); k++) { const kk = key(i, j, k); if (!map.has(kk)) map.set(kk, []); const a = map.get(kk); if (a[a.length - 1] !== id) a.push(id); } } });
  const depth = P.shell + 6;
  return (x, y, z) => {
    let H = pointHole(x, y, z);
    const ids = map.get(key(Math.floor(x / gc), Math.floor(y / gc), Math.floor(z / gc))); if (!ids) return H;
    let Hw = Infinity;
    for (const id of ids) {
      const m = list[id]; const qx = x - m.p[0], qy = y - m.p[1], qz = z - m.p[2];
      const dn = qx * m.n[0] + qy * m.n[1] + qz * m.n[2]; if (dn > 2 || dn < -(m.through || depth) - (m.niche ? 8 : 0)) continue;
      if (m.niche && dn < -depth) { const u = qx * m.fr.u[0] + qy * m.fr.u[1] + qz * m.fr.u[2], v = qx * m.fr.v[0] + qy * m.fr.v[1] + qz * m.fr.v[2]; if (m.mc.fO(u, v) < g + w + 3) H = Math.max(H, 0.6); continue; }
      const u = qx * m.fr.u[0] + qy * m.fr.u[1] + qz * m.fr.u[2], v = qx * m.fr.v[0] + qy * m.fr.v[1] + qz * m.fr.v[2];
      if (Math.abs(u) > m.mc.R || Math.abs(v) > m.mc.R) continue;
      // tylko skorupa zwrócona w stronę okna (na zaokrągleniu bryły prześwit nie tnie ścianki pod ostrym kątem)
      if (B && !m.through && !m.niche) { const gq = gradient(B, x, y, z, 0.1); if (gq[0] * m.n[0] + gq[1] * m.n[1] + gq[2] * m.n[2] < 0.5) continue; }
      const fo = m.mc.fO(u, v);
      const b = g + w - fo; // > 0 w obrębie ramki
      if (b > -P.cell) H = Math.max(H, b, (H + b) / 2 + rOpen);
      Hw = Math.min(Hw, m.mc.sample(u, v));
    }
    return Math.min(H, Hw);
  };
}

// ziarna dla linii B (metoda 2): okna motywów + zwykłe komórki Voronoi poza ramkami
import { Grid, surfaceCandidates } from './lattice.js';
export function buildSeedsV2(B, bounds, P, ctx) {
  const rng = makeRng(P.seed, 1 + 100 * (ctx.salt || 0)); const s = P.cell, w = P.rib;
  const cand = surfaceCandidates(B, bounds, s / 3, rng);
  const mot = placeMotifsV2(B, cand, P, ctx); const footZ = ctx.footZ;
  const pts = [], rad = [], grid = new Grid(pts, s, bounds); const jit = P.jitter;
  // pod każdym oknem para ziaren symetrycznych względem pionu okna: dwusieczna = pionowe żebro,
  // które podpiera najniższy punkt ramki (inaczej dół ramki wisiałby nad otworem Voronoi)
  for (const m of mot.list) {
    for (const sg of [-1, 1]) {
      const cu = sg * 0.5 * s, cv = -(m.mc.Rwin + 0.6 * s);
      let q = [m.p[0] + m.fr.u[0] * cu + m.fr.v[0] * cv, m.p[1] + m.fr.u[1] * cu + m.fr.v[1] * cv, m.p[2] + m.fr.u[2] * cu + m.fr.v[2] * cv];
      for (let it = 0; it < 4; it++) { const d = B(q[0], q[1], q[2]); const gq = gradient(B, q[0], q[1], q[2]); q = [q[0] - d * gq[0], q[1] - d * gq[1], q[2] - d * gq[2]]; }
      if (Math.abs(B(q[0], q[1], q[2])) > 0.1 || q[2] < footZ) continue;
      let ok = true;
      for (const o of mot.list) if (Math.hypot(o.p[0] - q[0], o.p[1] - q[1], o.p[2] - q[2]) < o.mc.Rwin + 0.3 * s) ok = false;
      grid.forNear(q[0], q[1], q[2], s, (id) => { const t = pts[id]; if (Math.hypot(t[0] - q[0], t[1] - q[1], t[2] - q[2]) < 0.8 * s) ok = false; });
      if (!ok) continue; const id = pts.length; pts.push(q); rad.push(s); grid.add(id);
    }
  }
  for (const p of cand) {
    const r = s * (1 + jit * (rng() - 0.5));
    let ok = true;
    for (const m of mot.list) { const d = Math.hypot(m.p[0] - p[0], m.p[1] - p[1], m.p[2] - p[2]); if (d < m.mc.Rwin + 0.55 * r) { ok = false; break; } }
    if (!ok) continue;
    grid.forNear(p[0], p[1], p[2], s * 1.6, (id) => { if (!ok) return; const q = pts[id]; if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < (r + rad[id]) / 2) ok = false; });
    if (!ok) continue; const id = pts.length; pts.push(p); rad.push(r); grid.add(id);
  }
  const S = pts.map((p) => { const n = gradient(B, p[0], p[1], p[2]); const solid = p[2] < footZ + s * 0.6 || (ctx.solidZone ? ctx.solidZone(p[0], p[1], p[2]) : false); return { p, n, solid, motif: 0 }; });
  for (let i = 0; i < S.length; i++) {
    const p = S[i].p, nb = [];
    grid.forNear(p[0], p[1], p[2], 3 * s, (j) => { if (j === i) return; const q = S[j].p; const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < 3 * s) nb.push([d, j]); });
    nb.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    S[i].nb = nb.slice(0, 26).map(([d, j]) => { const q = S[j].p; const nx = (q[0] - p[0]) / d, ny = (q[1] - p[1]) / d, nz = (q[2] - p[2]) / d;
      return { j, d, nx, ny, nz, c: nx * (p[0] + q[0]) / 2 + ny * (p[1] + q[1]) / 2 + nz * (p[2] + q[2]) / 2 }; });
  }
  let minHole = Infinity;
  for (const sd of S) { if (sd.solid || !sd.nb.length) continue; minHole = Math.min(minHole, sd.nb[0].d - w); }
  const bars = mot.list.reduce((a, m) => a + m.mc.bars, 0);
  const stats = { method: 'medalion', sizes: mot.bySize, through: mot.through, niche: mot.niche, minSize: mot.list.length ? Math.min(...mot.list.map((m) => m.size)) : null, motifs: mot.list.length, motifDropped: 0, minBridge: mot.list.length ? mot.wc : Infinity, minMotifHole: mot.minHole, minCellHole: minHole, count: S.length, connectors: bars, gap: mot.g };
  return { S, grid, stats, mot };
}
export const glyphForX = (...a) => glyphFor(...a);
