// Silnik geometrii: bryła SDF -> skorupa (samonośne wnętrze) -> ażur -> Manifold.levelSet
// -> jedna zamknięta siatka + walidacja reguł P1S. Działa w przeglądarce (Web Worker) i w Node.
import { getShape } from './shapes.js';
import { buildRoof } from './roof.js';
import { buildSeeds, makeVoronoiHole, makeGyroidHole, makeLowpolyHole, makeContourHole, makeSpiralHole } from './lattice.js';
import { smax } from './sdf.js';
import { motifInscribed, motifItems } from './motifs.js';
import { buildSeedsV2, makeMotifHoleV2 } from './motifcells.js';

export const ENGINE_VERSION = '1.2.0';
export const P1S = { bed: [256, 256, 256], nozzle: 0.4, minRib: 1.2, minBridge: 1.5, minHole: 3.0, maxOverhangDeg: 45 };
export const DENSITY = { PLA: 1.24, PETG: 1.27 };

export const DEFAULTS = {
  shape: 'serce', line: 'A', style: 'voronoi', height: 90, shell: 2.0, cell: 8.0, rib: 1.6, jitter: 0.35,
  seed: 20261110, motif: 'serce', motifShare: 0.8, motifSize: 10.5, motifOrient: 'pion', resolution: 0.5,
  material: 'PLA', color: 'kosc', simplify: 0.05, number: '30',
};

export function normalizeParams(p) {
  const P = { ...DEFAULTS, ...p };
  for (const k of ['height', 'shell', 'cell', 'rib', 'jitter', 'motifShare', 'motifSize', 'resolution', 'simplify']) P[k] = Number(P[k]);
  P.seed = String(P.seed).trim() === '' ? '0' : String(P.seed).trim();
  if (P.line === 'B') { P.style = 'voronoi'; if (P.motifMethod !== 'v1') P.motifMethod = 'medalion';
    if (P.motifMethod === 'medalion') { P.motifAuto = !(P.motifAuto === false || P.motifAuto === 'false' || P.motifAuto === 0 || P.motifAuto === '0'); P.motifMin = Math.min(P.motifSize, Math.max(8, Number(P.motifMin ?? 8.5) || 8.5)); }
    else { delete P.motifAuto; delete P.motifMin; } } else { delete P.motifMethod; delete P.motifAuto; delete P.motifMin; }
  return P;
}

export function generate(wasm, params, onProgress = () => {}) {
  const T0 = Date.now();
  const P = normalizeParams(params);
  const shape = getShape(P.shape);
  if (!shape || !shape.build) throw new Error('Kształt niedostępny: ' + P.shape);
  const def = shape.build(P);
  const s = P.height / def.h0;
  const f0 = def.f;
  const raw = (x, y, z) => s * f0(x / s, y / s, z / s);
  const t = P.shell, band = t + 2.5, ge = 0.05;
  // znormalizowany SDF (|grad| = 1 w pasie przy powierzchni) -> dokładna grubość skorupy;
  // płaskie cięcie spodu (z = 0) dokładane po normalizacji, żeby spód był idealnie płaski
  const Bn = (x, y, z) => {
    const f = raw(x, y, z); if (Math.abs(f) > band) return f;
    const a = raw(x + ge, y - ge, z - ge), b = raw(x - ge, y - ge, z + ge), c = raw(x - ge, y + ge, z - ge), d = raw(x + ge, y + ge, z + ge);
    const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d; const g = Math.hypot(gx, gy, gz) / (4 * ge);
    return g > 1e-6 ? f / g : f;
  };
  const B = (x, y, z) => Math.max(Bn(x, y, z), -z);
  const bounds = { min: def.bounds.min.map((v) => v * s - 2), max: def.bounds.max.map((v) => v * s + 2) };
  bounds.min[2] = -1.5;
  const footZ = (def.foot ?? 4) * (def.footScale === false ? 1 : 1) ;
  const solidZone = def.solid ? (x, y, z) => def.solid(x / s, y / s, z / s) : null;
  onProgress('Wnętrze samonośne (dach 45°)...');
  const roof = buildRoof(B, bounds, t, footZ, 1.0);
  onProgress('Ziarna ażuru...');
  const ctx = { footZ, solidZone };
  let hole = null, seeds = null;
  const style = P.style;
  if (P.line === 'B' && P.motifMethod === 'medalion') {
    seeds = buildSeedsV2(B, bounds, P, { ...ctx, minHole: P1S.minHole + 0.4, roof, shell: t });
    hole = makeMotifHoleV2(makeVoronoiHole(seeds, P), seeds.mot, P, B);
  } else if (style === 'voronoi' || style === 'lowpoly') {
    seeds = buildSeeds(B, bounds, P, ctx);
    hole = style === 'voronoi' ? makeVoronoiHole(seeds, P) : makeLowpolyHole(seeds, P);
  } else if (style === 'tpms') hole = makeGyroidHole(P);
  else if (style === 'kontury') hole = makeContourHole(def.silhouette ? (x, z) => def.silhouette(x / s, z / s) * s : (x, z) => -B(x, 0, z), P, [0, P.height * 0.5]);
  else if (style === 'spirala') hole = makeSpiralHole(P, [0, 0]);
  const edgeK = Math.min(0.6, P.rib * 0.3);
  const S2 = Math.SQRT1_2;
  const field = (x, y, z) => {
    const b = B(x, y, z);
    if (b > 1.0) return b;
    let m = b;
    if (z > footZ && b + t < 0.6) {
      const cav = Math.max(b + t, -roof.sample(x, y, z) * S2);
      m = Math.max(b, -cav);
    }
    if (hole && m < 1.0 && z > footZ) {
      const inSolid = solidZone && solidZone(x, y, z);
      if (!inSolid) { let H = hole(x, y, z); H = Math.max(H, footZ - z); m = smax(m, -H, edgeK); }
    }
    return m;
  };
  if (globalThis.__STATUETKI_DEBUG) globalThis.__STATUETKI_DEBUG = { seeds, hole, field, B, roof };
  onProgress('Siatka (Manifold levelSet)...');
  const { Manifold } = wasm;
  // wartości bliskie zera odsuwane od zera: inaczej wierzchołki z różnych krawędzi siatki
  // mogą po zaokrągleniu do float32 trafić w ten sam punkt (STL scalony w slicerze = krawędzie niemanifoldowe)
  const EPS0 = 2e-3;
  const level = () => Manifold.levelSet((p) => { const v = -field(p[0], p[1], p[2]); return v > -EPS0 && v < EPS0 ? (v >= 0 ? EPS0 : -EPS0) : v; }, bounds, P.resolution, 0, -1);
  let man = level();
  const T1 = Date.now();
  // spójność
  // decompose rozdziela też zamknięte pustki wewnętrzne (objętość ujemna) - te zostają w bryle
  let parts = man.decompose();
  let vols = parts.map((m) => m.volume());
  let pos = vols.map((v, i) => i).filter((i) => vols[i] > 0).sort((a, b) => vols[b] - vols[a]);
  // linia B: okno motywu, z którego odpadł fragment (> 0,5 mm³), jest usuwane i bryła liczona ponownie
  const lost = () => pos.slice(1).reduce((a, i) => a + vols[i], 0);
  const remesh = () => { parts.forEach((m) => m.delete()); man.delete(); man = level(); parts = man.decompose(); vols = parts.map((m) => m.volume()); pos = vols.map((v, i) => i).filter((i) => vols[i] > 0).sort((a, b) => vols[b] - vols[a]); };
  const dropPass = () => {
    if (globalThis.process && process.env.NODROP) return;
    for (let pass = 0; pass < 2; pass++) {
      const big = pos.slice(1).filter((i) => vols[i] > 0.5); if (!big.length) break;
      const cs = big.map((i) => { const b = parts[i].boundingBox(); return [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2); });
      const L0 = seeds.mot.list; const L1 = L0.filter((m) => !cs.some((c) => { const d = [0, 1, 2].map((k) => c[k] - m.p[k]); const dn = d[0] * m.n[0] + d[1] * m.n[1] + d[2] * m.n[2]; const dt = Math.hypot(d[0] - dn * m.n[0], d[1] - dn * m.n[1], d[2] - dn * m.n[2]); return dt < m.mc.Rwin + 1 && dn < 3 && dn > -((m.through || 0) + t + 7); }));
      if (L1.length === L0.length) break;
      seeds.mot.list = L1; const st = seeds.stats; st.motifDropped = (st.motifDropped || 0) + L0.length - L1.length; st.motifs = L1.length;
      st.sizes = {}; for (const m of L1) st.sizes[m.size] = (st.sizes[m.size] || 0) + 1; st.through = L1.filter((m) => m.through).length; st.niche = L1.filter((m) => m.niche).length; st.minSize = L1.length ? Math.min(...L1.map((m) => m.size)) : null;
      hole = makeMotifHoleV2(makeVoronoiHole(seeds, P), seeds.mot, P, B);
      remesh();
    }
  };
  if (P.line === 'B' && P.motifMethod === 'medalion' && seeds && seeds.mot) {
    dropPass();
    // nadal odpada > 2 mm³ (np. okruch wypełnienia między komórkami): jedna deterministyczna próba z innym
    // rozkładem ziaren, zostaje wariant z mniejszą stratą
    for (let salt = 1; salt <= 2 && lost() >= 2; salt++) {
      const old = { seeds, hole, man, parts, vols, pos, l: lost() };
      seeds = buildSeedsV2(B, bounds, P, { ...ctx, minHole: P1S.minHole + 0.4, roof, shell: t, salt });
      hole = makeMotifHoleV2(makeVoronoiHole(seeds, P), seeds.mot, P, B);
      man = level(); parts = man.decompose(); vols = parts.map((m) => m.volume()); pos = vols.map((v, i) => i).filter((i) => vols[i] > 0).sort((a, b) => vols[b] - vols[a]);
      dropPass();
      if (globalThis.process && process.env.MDBG) console.error('reseed lost', old.l.toFixed(2), '->', lost().toFixed(2));
      if (lost() < old.l) { old.parts.forEach((m) => m.delete()); old.man.delete(); seeds.stats.reseed = salt; }
      else { parts.forEach((m) => m.delete()); man.delete(); ({ seeds, hole, man, parts, vols, pos } = old); }
    }
  }
  if (globalThis.__STATUETKI_DEBUG) Object.assign(globalThis.__STATUETKI_DEBUG, { seeds, hole });
  const voids = vols.map((v, i) => i).filter((i) => vols[i] <= 0);
  const compBefore = pos.length;
  let removedVol = 0; for (let i = 1; i < pos.length; i++) removedVol += vols[pos[i]];
  if (globalThis.__STATUETKI_PARTS) globalThis.__STATUETKI_PARTS = pos.slice(1).map((i) => { const b = parts[i].boundingBox(); return { vol: +vols[i].toFixed(2), min: Array.from(b.min).map((v) => +v.toFixed(1)), max: Array.from(b.max).map((v) => +v.toFixed(1)) }; });
  const keep = [parts[pos[0]], ...voids.map((i) => parts[i])];
  let main = keep.length > 1 ? Manifold.compose(keep) : parts[pos[0]];
  const voidCount = voids.length, voidVol = -voids.reduce((a, i) => a + vols[i], 0);
  for (let i = 0; i < parts.length; i++) if (parts[i] !== main) parts[i].delete();
  man.delete();
  P.simplify = Math.min(0.1, Math.max(0, P.simplify || 0));
  // upraszczanie z kontrolą spójności: jeśli rozdzieli bryłę, próba mniejszej tolerancji, w ostateczności bez upraszczania
  let simplifyUsed = 0;
  for (const tol of [P.simplify, Math.min(P.simplify, 0.02)]) {
    if (!(tol > 0)) break;
    const sm = main.simplify(tol); const pc = sm.decompose(); const pv = pc.map((m) => m.volume()); const nPos = pv.filter((v) => v > 0).length;
    const okStatus = sm.status() === 0 || sm.status() === 'NoError';
    if (nPos === 1 && okStatus) { pc.forEach((m) => m.delete()); main.delete(); main = sm; simplifyUsed = tol; break; }
    // uproszczenie oddzieliło tylko drobiny (< 1 mm³): zostaje największa część + pustki
    const order = pv.map((v, i) => i).filter((i) => pv[i] > 0).sort((a, b) => pv[b] - pv[a]);
    const extra = order.slice(1).reduce((a, i) => a + pv[i], 0);
    if (P.line === 'B' && okStatus && nPos > 1 && extra < 1.0) { // tylko linia B (linia A bez zmian)
      const kp = [pc[order[0]], ...pv.map((v, i) => i).filter((i) => pv[i] < 0).map((i) => pc[i])];
      const nm = kp.length > 1 ? Manifold.compose(kp) : pc[order[0]];
      pc.forEach((m) => { if (m !== nm) m.delete(); }); sm.delete(); main.delete(); main = nm; simplifyUsed = tol; removedVol += extra; break;
    }
    pc.forEach((m) => m.delete()); sm.delete();
  }
  const mesh = main.getMesh();
  const pinches = separateCoincident(mesh);
  const bb = main.boundingBox();
  const genus = main.genus(), status = main.status(), volume = main.volume(), area = main.surfaceArea(), numTri = main.numTri();
  const compAfter = main.decompose(); const compCount = compAfter.filter((m) => m.volume() > 0).length; compAfter.forEach((m) => m.delete());
  main.delete();
  const an = analyzeMesh(mesh);
  const stats = { params: P, seedStats: seeds ? seeds.stats : null, roofFilledVoxels: roof.filledVoxels, pinches, voidCount, voidVol, compBefore, removedVol, genus, status, volume, area, numTri, bbox: bb, compCount, ...an, simplifyUsed, timeMs: Date.now() - T0, levelSetMs: T1 - T0 };
  const validation = validate(P, stats, shape);
  return { mesh: { vert: mesh.vertProperties, numProp: mesh.numProp, tri: mesh.triVerts }, stats, validation };
}

// Wierzchołki różne topologicznie, ale o identycznych współrzędnych float32 (styk dwóch płatów
// w jednym punkcie). Slicer scala STL po współrzędnych, co dałoby krawędzie niemanifoldowe.
// Każdy duplikat przesuwamy o 0,002 mm w stronę środka własnego otoczenia.
export function separateCoincident(mesh) {
  const V = mesh.vertProperties, np = mesh.numProp, T = mesh.triVerts, nv = V.length / np;
  const U = new Uint32Array(V.buffer, V.byteOffset, V.length);
  const map = new Map(); const dups = [];
  for (let i = 0; i < nv; i++) {
    const k = (Math.imul(U[i * np], 73856093) ^ Math.imul(U[i * np + 1], 19349663) ^ Math.imul(U[i * np + 2], 83492791)) >>> 0;
    const prev = map.get(k);
    if (prev === undefined) { map.set(k, i); continue; }
    const list = Array.isArray(prev) ? prev : [prev];
    let same = -1; for (const j of list) if (U[j * np] === U[i * np] && U[j * np + 1] === U[i * np + 1] && U[j * np + 2] === U[i * np + 2]) { same = j; break; }
    if (same >= 0) dups.push(i, same);
    list.push(i); map.set(k, list);
  }
  if (!dups.length) return 0;
  const move = new Set(dups); const acc = new Map();
  for (const v of move) acc.set(v, [0, 0, 0, 0]);
  for (let f = 0; f < T.length; f += 3) for (let e = 0; e < 3; e++) { const v = T[f + e]; const a = acc.get(v); if (!a) continue;
    for (let o = 1; o <= 2; o++) { const u = T[f + (e + o) % 3]; a[0] += V[u * np]; a[1] += V[u * np + 1]; a[2] += V[u * np + 2]; a[3]++; } }
  for (const [v, a] of acc) { if (!a[3]) continue; const cx = a[0] / a[3] - V[v * np], cy = a[1] / a[3] - V[v * np + 1], cz = a[2] / a[3] - V[v * np + 2]; const l = Math.hypot(cx, cy, cz) || 1;
    V[v * np] += 0.002 * cx / l; V[v * np + 1] += 0.002 * cy / l; V[v * np + 2] += 0.002 * cz / l; }
  return dups.length / 2;
}

// nawisy (powierzchnia z normalną w dół > 45 st. od pionu) i lokalne minima (wyspy startujące w powietrzu)
export function analyzeMesh(mesh) {
  const V = mesh.vertProperties, np = mesh.numProp, T = mesh.triVerts; const nt = T.length / 3, nv = V.length / np;
  let zmin = Infinity; for (let i = 0; i < nv; i++) zmin = Math.min(zmin, V[i * np + 2]);
  let ovArea = 0, downArea = 0;
  const lowerNb = new Uint8Array(nv); const nzSum = new Float32Array(nv);
  for (let f = 0; f < nt; f++) {
    const a = T[f * 3], b = T[f * 3 + 1], c = T[f * 3 + 2];
    const ax = V[a * np], ay = V[a * np + 1], az = V[a * np + 2], bx = V[b * np], by = V[b * np + 1], bz = V[b * np + 2], cx = V[c * np], cy = V[c * np + 1], cz = V[c * np + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const A2 = Math.hypot(nx, ny, nz); if (A2 === 0) continue;
    const cosz = nz / A2; const zc = (az + bz + cz) / 3;
    if (zc > zmin + 0.3) { if (cosz < -Math.SQRT1_2) ovArea += A2 / 2; if (cosz < -0.2) downArea += A2 / 2; }
    // sąsiad niżej
    nzSum[a] += nz; nzSum[b] += nz; nzSum[c] += nz;
    if (bz < az - 1e-6 || cz < az - 1e-6) lowerNb[a] = 1;
    if (az < bz - 1e-6 || cz < bz - 1e-6) lowerNb[b] = 1;
    if (az < cz - 1e-6 || bz < cz - 1e-6) lowerNb[c] = 1;
  }
  // wyspy: lokalne minimum, z którego w paśmie +0,3 mm (1,5 warstwy) nie da się zejść niżej
  const deg = new Uint32Array(nv + 1);
  for (let f = 0; f < nt * 3; f++) deg[T[f] + 1] += 2;
  for (let i = 0; i < nv; i++) deg[i + 1] += deg[i];
  const adj = new Uint32Array(deg[nv]); const fill = deg.slice(0, nv);
  for (let f = 0; f < nt; f++) { const a = T[f * 3], b = T[f * 3 + 1], c = T[f * 3 + 2]; adj[fill[a]++] = b; adj[fill[a]++] = c; adj[fill[b]++] = c; adj[fill[b]++] = a; adj[fill[c]++] = a; adj[fill[c]++] = b; }
  const mark = new Int32Array(nv).fill(-1); const islands = [];
  for (let i = 0; i < nv; i++) {
    if (lowerNb[i] || nzSum[i] >= 0) continue; const z0 = V[i * np + 2]; if (z0 < zmin + 0.6) continue;
    const stack = [i]; mark[i] = i; let down = false, count = 0;
    while (stack.length && !down && count < 4000) {
      const v = stack.pop(); count++;
      for (let e = deg[v]; e < deg[v + 1]; e++) { const u = adj[e]; if (mark[u] === i) continue; const zu = V[u * np + 2];
        if (zu < z0 - 1e-4) { down = true; break; } if (zu <= z0 + 0.3) { mark[u] = i; stack.push(u); } }
    }
    if (!down) islands.push([V[i * np], V[i * np + 1], z0]);
  }
  const minima = islands.length;
  return { overhangArea: ovArea, localMinima: minima, islands: islands.slice(0, 200), zmin };
}

export function validate(P, st, shape) {
  const out = [];
  const add = (id, label, value, limit, ok, level = 'error', note = '') => out.push({ id, label, value, limit, status: ok ? 'ok' : level, note });
  const dims = [st.bbox.max[0] - st.bbox.min[0], st.bbox.max[1] - st.bbox.min[1], st.bbox.max[2] - st.bbox.min[2]];
  add('closed', 'Siatka zamknięta (manifold, status Manifold)', st.status === 0 || st.status === 'NoError' ? 'tak' : String(st.status), 'tak', st.status === 0 || st.status === 'NoError');
  add('comp', 'Spójność - liczba komponentów', String(st.compCount), '1', st.compCount === 1);
  add('frag', 'Oderwane fragmenty usunięte przed eksportem', st.compBefore - 1 + ' szt., ' + (st.removedVol).toFixed(2) + ' mm³', '< 5 mm³', st.removedVol < 5, 'warn', 'drobiny z marching cubes; większe oznaczają rozpadający się ażur');
  add('voids', 'Zamknięte pustki wewnętrzne (bez otworu)', st.voidCount + ' szt., ' + (st.voidVol / 1000).toFixed(1) + ' cm³', 'informacyjnie', true, 'ok', 'drukują się bez podpór (dach 45°), slicer potraktuje jak wnętrze');
  add('pinch', 'Punkty styku płatów rozsunięte (0,002 mm)', String(st.pinches), 'informacyjnie', true, 'ok');
  add('genus', 'Genus (liczba uchwytów = połączeń ażuru)', String(st.genus), '-', true, 'ok');
  add('bed', 'Wymiary w stole P1S (X x Y x Z)', dims.map((d) => d.toFixed(1)).join(' x ') + ' mm', '<= 256 mm', dims.every((d) => d <= 256));
  add('rib', 'Grubość żebra (parametr)', P.rib.toFixed(2) + ' mm', '>= 1,2 mm', P.rib >= P1S.minRib);
  add('shell', 'Grubość skorupy (głębokość żebra)', P.shell.toFixed(2) + ' mm', '>= 1,2 mm', P.shell >= P1S.minRib);
  add('res', 'Rozdzielczość siatki a żebro', P.resolution.toFixed(2) + ' mm', '<= żebro/2,5', P.resolution <= P.rib / 2.5 + 1e-9, 'warn', 'zbyt rzadka siatka spłaszcza żebra');
  const ss = st.seedStats;
  if (P.style === 'voronoi' || P.style === 'lowpoly') {
    const mh = P.style === 'voronoi' ? ss.minCellHole : P.cell / Math.sqrt(3) - P.rib;
    add('hole', 'Najmniejszy otwór (koło wpisane)', isFinite(mh) ? mh.toFixed(2) + ' mm' : '-', '>= 3 mm', !isFinite(mh) || mh >= P1S.minHole);
  } else {
    const mh = P.style === 'tpms' ? P.cell * 0.5 : P.cell - P.rib;
    add('hole', 'Otwór nominalny (z parametrów)', mh.toFixed(2) + ' mm', '>= 3 mm', mh >= P1S.minHole);
  }
  if (P.line === 'B') {
    add('motifs', 'Motywy wplecione w ażur', ss.motifs + ' szt. (pominięte: ' + ss.motifDropped + ')', '>= 6', ss.motifs >= 6, 'warn');
    if (ss.motifs) {
      add('bridge', 'Najwęższy mostek motyw - ażur', ss.minBridge.toFixed(2) + ' mm', '>= 1,5 mm', ss.minBridge >= P1S.minBridge);
      add('mhole', 'Najmniejszy otwór motywu (koło wpisane)', ss.minMotifHole.toFixed(2) + ' mm', '>= 3 mm', ss.minMotifHole >= P1S.minHole);
    }
    if (P.motifMethod === 'medalion') {
      add('mconn', 'Łączniki pionowe motywów (skan warstw 2D)', ss.connectors + ' szt., szer. ' + (isFinite(ss.minBridge) ? ss.minBridge.toFixed(2) : '-') + ' mm', 'pod każdym czubkiem', true, 'ok', 'dodane automatycznie pod punktami, które zaczynałyby się w powietrzu');
      const sz = ss.sizes ? Object.entries(ss.sizes).sort((a, b) => b[0] - a[0]).map(([k, n]) => String(k).replace('.', ',') + ' mm x' + n).join(', ') : '-';
      add('msize', 'Rozmiar motywu (nominalny / użyte)', P.motifSize.toFixed(1) + ' mm' + (P.motifAuto ? ' (auto, min ' + P.motifMin.toFixed(1) + ')' : '') + ' / ' + sz, '>= 8 mm (czytelność)', P.motifSize >= 8 && (ss.minSize == null || ss.minSize >= 8), 'warn');
    } else {
      const insc = Math.min(...motifItems(P.motif).map(motifInscribed));
      add('msize', 'Rozmiar motywu a otwór 3 mm', (P.motifSize * insc).toFixed(2) + ' mm', '>= 3 mm', P.motifSize * insc >= P1S.minHole);
    }
  }
  const ovPct = (st.overhangArea / st.area) * 100;
  add('overhang', 'Nawisy > 45° od pionu (powierzchnia)', (st.overhangArea / 100).toFixed(1) + ' cm² (' + ovPct.toFixed(1) + '%)', 'tylko krótkie mostki nad otworami', ovPct < 6, 'warn', 'krawędzie górne otworów drukują się jako mostki 3-9 mm');
  add('minima', 'Wyspy startujące w powietrzu (minima lokalne)', String(st.localMinima), '0', st.localMinima === 0, 'warn', 'wymagają podpory albo zmiany parametrów; sprawdź w podglądzie warstw');
  add('simplify', 'Upraszczanie siatki (tolerancja)', st.simplifyUsed > 0 ? st.simplifyUsed.toFixed(2) + ' mm' : 'brak', '<= 0,05 mm, bez rozdzielenia bryły', true, 'warn', 'informacyjne - po uproszczeniu sprawdzono spójność');
  if (shape && shape.supports) add('supports', 'Podpory zewnętrzne', shape.supports, 'brak', false, 'warn');
  const blocking = out.filter((r) => r.status === 'error').length;
  return { items: out, ok: blocking === 0, blocking, dims };
}

export function estimates(st, material = 'PLA') {
  const cm3 = st.volume / 1000; const mass = cm3 * (DENSITY[material] || 1.24);
  const layers = (st.bbox.max[2] - st.bbox.min[2]) / 0.2;
  // orientacyjnie: przepływ efektywny ~5 mm3/s przy obrysach ażuru + ok. 4 s na warstwę (przejazdy)
  const minutes = (st.volume / 5 + layers * 4) / 60;
  return { cm3, mass, minutes };
}
