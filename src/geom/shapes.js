// Biblioteka kształtów. Gotowy kształt = parametryczny SDF w mm (wartość nominalna),
// oś Z w górę, spód w z = 0 (silnik przycina płasko). Skalowanie do zadanej wysokości robi silnik.
// Projekt pod druk pionowy bez podpór: kontury dołem pod <= 45° (kształty kropli), rury o
// przekroju kropli (dropPolyline), wnętrza samonośne (dach 45° w silniku).
import { makeDropTubes, sdHeartIQ, inflate, smin, smax, ellipsoid, sphere, capsule, roundBox, cylinderZ, sdPolygon2, sdStar5, len2, len3, dropPolyline, sdTeardrop, clamp, sdCircle2, sdSegment2 } from './sdf.js';

const D2R = Math.PI / 180;
const rot2 = (x, z, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * x + s * z, -s * x + c * z]; };
const heart2D = (x, z, U, sx) => sdHeartIQ(x / (U * sx), z / U) * U * sx;
// kropla 2D w płaszczyźnie XZ (koło R w (cx,cz) + czubek 45° w dół)
const drop2D = (x, z, cx, cz, R) => sdTeardrop(x - cx, 0, z - cz, R);
// torus o przekroju kropli, okrąg w płaszczyźnie pionowej obróconej o kąt a wokół Z
function dropRing(x, y, z, cx, cy, cz, R, r, a = 0) {
  const c = Math.cos(a), s = Math.sin(a); const lx = (x - cx) * c + (y - cy) * s, ly = -(x - cx) * s + (y - cy) * c, lz = z - cz;
  const l = len2(lx, lz) || 1e-9; const px = lx / l * R, pz = lz / l * R; // najbliższy punkt okręgu
  return sdTeardrop((lx - px) * c - ly * s, (lx - px) * s + ly * c, lz - pz, r);
}
// stożek ścięty (oś Z) - podstawy o nachyleniu <= 45° od pionu są samonośne
function frustum(x, y, z, r0, r1, z0, z1) { const r = len2(x, y); const t = clamp((z - z0) / (z1 - z0), 0, 1); const rr = r0 + (r1 - r0) * t; return Math.max((r - rr) * Math.cos(Math.atan2(r0 - r1, z1 - z0)), z0 - z, z - z1); }
function box(x, y, z, cx, cy, cz, bx, by, bz, r = 1) { return roundBox(x - cx, y - cy, z - cz, bx, by, bz, r); }

// ---------- 1. serce ----------
function buildSerce() {
  const U = 88, cut = 7;
  return { f: (x, y, z) => inflate(heart2D(x, z + cut, U, 0.85), y, 19, 24), h0: U * 1.104 - cut, bounds: { min: [-46, -20, 0], max: [46, 20, 92] }, foot: 4,
    silhouette: (x, z) => -heart2D(x, z + cut, U, 0.85) };
}
// ---------- 2. dwa serca ----------
function buildDwaSerca() {
  const U = 62, sx = 0.85;
  const d2 = (x, z) => { const [ax, az] = rot2(x + 15, z + 3, -16 * D2R); const [bx, bz] = rot2(x - 15, z + 1, 16 * D2R); return smin(heart2D(ax, az, U, sx), heart2D(bx, bz, U, sx), 5); };
  return { f: (x, y, z) => inflate(d2(x, z), y, 15, 18), h0: 68, bounds: { min: [-58, -16, 0], max: [58, 16, 72] }, foot: 4, silhouette: (x, z) => -d2(x, z) };
}
// ---------- 3. obrączki ----------
function buildObraczki() {
  const R = 25, r = 7;
  const f = (x, y, z) => {
    const a = dropRing(x, y, z, -13, 0, R + r + 4, R, r, 0);
    const b = dropRing(x, y, z, 15, 2, R + r + 4, R, r, 38 * D2R);
    const base = box(x, y, z, 0, 0, 2, 40, 13, 5, 2.5);
    return smin(smin(a, b, 2), base, 5);
  };
  return { f, h0: 2 * (R + r) + 4, bounds: { min: [-46, -32, 0], max: [52, 34, 72] }, foot: 6 };
}
// ---------- cyfry (liczba rocznicy / urodzinowa) ----------
// szkielety cyfr w kwadracie 0..1 (szer.) x 0..1.6 (wys.), łuki jako łamane
const arc = (cx, cz, rx, rz, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * D2R; return [cx + rx * Math.cos(a), cz + rz * Math.sin(a)]; });
export const GLYPHS = {
  '0': [arc(0.5, 0.8, 0.42, 0.72, 0, 360, 20)],
  '1': [[[0.2, 1.2], [0.55, 1.55], [0.55, 0.05]], [[0.25, 0.05], [0.85, 0.05]]],
  '2': [[...arc(0.5, 1.15, 0.38, 0.38, 160, -30, 10), [0.08, 0.05], [0.92, 0.05]]],
  '3': [arc(0.48, 1.2, 0.36, 0.33, 150, -90, 10), arc(0.48, 0.45, 0.4, 0.4, 90, -150, 10)],
  '4': [[[0.72, 0.05], [0.72, 1.55], [0.08, 0.5], [0.95, 0.5]]],
  '5': [[[0.88, 1.55], [0.2, 1.55], [0.15, 0.92], ...arc(0.48, 0.5, 0.42, 0.45, 115, -150, 12)]],
  '6': [[...arc(0.55, 1.05, 0.38, 0.5, 70, 180, 6), ...arc(0.5, 0.5, 0.4, 0.45, 180, 540, 16)]],
  '7': [[[0.08, 1.55], [0.92, 1.55], [0.35, 0.05]]],
  '8': [arc(0.5, 1.2, 0.33, 0.33, -90, 270, 16), arc(0.5, 0.45, 0.42, 0.42, 90, 450, 18)],
  '9': [[...arc(0.5, 1.1, 0.4, 0.45, 0, 360, 16), ...arc(0.45, 0.55, 0.38, 0.5, 0, -110, 6)]],
};
function buildLiczba(P) {
  const txt = String(P.number || '30').replace(/[^0-9]/g, '').slice(0, 3) || '30';
  const S = 52, gap = 0.25, r = 7.5; const n = txt.length; const W = n + (n - 1) * gap; const x0 = -W / 2;
  const lines = [];
  for (let i = 0; i < n; i++) for (const pl of GLYPHS[txt[i]]) lines.push(pl.map(([u, v]) => [(x0 + i * (1 + gap) + u) * S, 0, v * S + r * 1.42 + 3]));
  const halfW = W * S / 2 + r;
  const tubes = makeDropTubes(lines.map((pts) => ({ pts, closed: false })), r);
  const f = (x, y, z) => smin(tubes(x, y, z), box(x, y, z, 0, 0, 3, halfW, r + 4, 6, 3), 4);
  return { f, h0: 1.6 * S + r * 1.42 + 3 + r, bounds: { min: [-halfW - 6, -r - 8, 0], max: [halfW + 6, r + 8, 1.6 * S + 2.5 * r + 6] }, foot: 6 };
}
// ---------- 6. drzewo życia ----------
function buildDrzewo() {
  const f = (x, y, z) => {
    const crown = sdTeardrop(x, y / 0.62, z - 66, 32) * 0.62;
    const trunk = frustum(x, y, z, 15, 7, 0, 48);
    const br = Math.min(capsule(x, y, z, 0, 0, 30, -18, 0, 52, 4.5), capsule(x, y, z, 0, 0, 34, 17, 0, 54, 4.5));
    return smin(smin(crown, trunk, 6), br, 4);
  };
  return { f, h0: 98, bounds: { min: [-34, -22, 0], max: [34, 22, 100] }, foot: 4,
    solid: (x, y, z) => z < 34 && len2(x, y) < 13 };
}
// ---------- 7. klucz z sercem ----------
function buildKlucz() {
  const f = (x, y, z) => {
    const shaft = capsule(x, y, z, 0, 0, 0, 0, 0, 62, 6.5);
    const bow = inflate(heart2D(x, z - 48, 42, 0.85), y, 10, 12);
    const bit = box(x, y, z, 10, 0, 7, 9, 6, 7, 2);
    return smin(smin(shaft, bow, 5), bit, 3);
  };
  return { f, h0: 48 + 42 * 1.104, bounds: { min: [-24, -12, 0], max: [24, 12, 96] }, foot: 3, solid: (x, y, z) => z < 16 };
}
// ---------- 8. motyl ----------
function buildMotyl() {
  const wing2 = (x, z) => { const ax = Math.abs(x); return smin(smin(drop2D(ax, z, 25, 62, 20), drop2D(ax, z, 19, 30, 13), 6), sdSegment2(ax, z, 0, 14, 0, 80) - 4, 5); };
  const f = (x, y, z) => {
    const yy = y - 0.006 * x * x;
    const wings = inflate(wing2(x, z), yy, 7, 9);
    const body = Math.min(capsule(x, y, z, 0, 0, 8, 0, 0, 78, 6.5), sdTeardrop(x, y, z - 84, 7));
    const ant = Math.min(capsule(x, y, z, 0, 0, 86, -9, -2, 100, 2.2), capsule(x, y, z, 0, 0, 86, 9, -2, 100, 2.2));
    return smin(smin(wings, body, 4), ant, 2);
  };
  return { f, h0: 102, bounds: { min: [-48, -20, 0], max: [48, 20, 104] }, foot: 4,
    solid: (x, y, z) => z > 88 || (Math.abs(x) < 7 && z < 20) };
}
// ---------- 9. kielich z hostią ----------
function buildKielich() {
  const prof = (r, z) => {
    const foot = Math.max(r - (30 - z), -z, z - 6) * 0.707; // stopa 45°
    const stem = Math.max(r - 6.5, -z, z - 50);
    const knob = Math.max(Math.abs(z - 26) + r - 13, -1) * 0.707; // guz dwustożkowy
    const bowl = Math.max(r - Math.min(7 + (z - 46) * 0.84, 28 + (z - 71) * 0.15), 46 - z, z - 86) ;
    return smin(smin(Math.min(foot, stem), knob, 2), bowl, 3);
  };
  const f = (x, y, z) => {
    const b = prof(len2(x, y), z);
    const host = inflate(sdCircle2(x, z - 98, 17), y, 3.5, 5);
    return smin(b, host, 3);
  };
  return { f, h0: 115, bounds: { min: [-32, -32, 0], max: [32, 32, 117] }, foot: 4, solid: (x, y, z) => (z > 88) || (len2(x, y) < 8 && z < 60) || z < 7 };
}
// ---------- krzyże ----------
function crossArms(x, y, z, cz, armH, armUp, armDown, r) {
  const v = dropPolyline(x, y, z, [[0, 0, cz - armDown], [0, 0, cz + armUp]], r);
  const h = dropPolyline(x, y, z, [[-armH, 0, cz], [armH, 0, cz]], r);
  return Math.min(v, h);
}
function buildKrzyz() {
  const f = (x, y, z) => smin(crossArms(x, y, z, 70, 30, 30, 62, 10), frustum(x, y, z, 28, 12, 0, 14), 4);
  return { f, h0: 100 + 8, bounds: { min: [-40, -28, 0], max: [40, 28, 110] }, foot: 4, solid: (x, y, z) => z < 14 };
}
function buildKrzyzCeltycki() {
  const f = (x, y, z) => smin(smin(crossArms(x, y, z, 68, 36, 32, 58, 9.5), dropRing(x, y, z, 0, 0, 68, 24, 6), 2.5), frustum(x, y, z, 28, 12, 0, 14), 4);
  return { f, h0: 108, bounds: { min: [-44, -28, 0], max: [44, 28, 110] }, foot: 4, solid: (x, y, z) => z < 14 };
}
function buildKrzyzRoza() {
  const f = (x, y, z) => {
    const cr = crossArms(x, y, z, 70, 30, 30, 62, 9.5);
    const rose = Math.min(sdTeardrop(x, y + 7, z - 70, 13), sdTeardrop(x - 9, y + 5, z - 64, 7), sdTeardrop(x + 9, y + 5, z - 64, 7));
    return smin(smin(cr, rose, 3), frustum(x, y, z, 26, 10, 0, 14), 4);
  };
  return { f, h0: 108, bounds: { min: [-40, -28, 0], max: [40, 28, 110] }, foot: 4, solid: (x, y, z) => z < 14 };
}
// ---------- 12. anioł ----------
function buildAniol() {
  const wing2 = (x, z) => drop2D(Math.abs(x), z, 20, 60, 17);
  const f = (x, y, z) => {
    const robe = frustum(x, y / 0.8, z, 27, 9, 0, 62) * 0.8;
    const head = sdTeardrop(x, y, z - 76, 11);
    const wings = inflate(wing2(x, z), y - 5 - 0.008 * x * x, 5.5, 7);
    return smin(smin(robe, head, 3), wings, 5);
  };
  return { f, h0: 87, bounds: { min: [-42, -24, 0], max: [42, 26, 89] }, foot: 4, solid: (x, y, z) => z > 70 };
}
// ---------- 13. hostia z IHS ----------
function buildHostia() {
  const f = (x, y, z) => smin(inflate(sdCircle2(x, z - 50, 38), y, 7, 10), box(x, y, z, 0, 0, 10, 32, 14, 12, 3), 4);
  return { f, h0: 88, bounds: { min: [-40, -16, 0], max: [40, 16, 90] }, foot: 5, solid: (x, y, z) => z < 20 };
}
// ---------- 15. korona z krzyżem ----------
function buildKoronaKrzyz() {
  const f = (x, y, z) => {
    const r = len2(x, y);
    const band = Math.max(Math.abs(r - 30) - 5, -z, z - 26);
    let arches = Infinity; for (let k = 0; k < 2; k++) arches = Math.min(arches, dropRing(x, y, z, 0, 0, 26, 28, 4.5, k * Math.PI / 2));
    arches = Math.max(arches, 24 - z);
    const orb = sdTeardrop(x, y, z - 60, 7);
    const cross = crossArms(x, y, z, 78, 7, 10, 10, 3.5);
    return smin(smin(band, arches, 3), Math.min(orb, cross), 2);
  };
  return { f, h0: 92, bounds: { min: [-37, -37, 0], max: [37, 37, 94] }, foot: 3, solid: (x, y, z) => z > 66 };
}
// ---------- 16. tort ----------
function buildTort() {
  const f = (x, y, z) => {
    const t1 = cylinderZ(x, y, z, 42, -1, 26), t2 = cylinderZ(x, y, z, 31, 0, 46), t3 = cylinderZ(x, y, z, 20, 0, 62);
    let c = Infinity; for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5; c = Math.min(c, capsule(x, y, z, 12 * Math.cos(a), 12 * Math.sin(a), 60, 12 * Math.cos(a), 12 * Math.sin(a), 74, 2.6), sdTeardrop(x - 12 * Math.cos(a), y - 12 * Math.sin(a), z - 79, 2.4)); }
    return smin(Math.min(Math.min(t1, t2), t3), c, 1.5);
  };
  return { f, h0: 82, bounds: { min: [-44, -44, 0], max: [44, 44, 84] }, foot: 4, solid: (x, y, z) => z > 60 };
}
// ---------- 17. balony ----------
function buildBalony() {
  const B = [[-20, 0, 70, 15], [18, -4, 76, 16], [0, 8, 92, 14]];
  const f = (x, y, z) => {
    let d = Infinity;
    for (const [bx, by, bz, R] of B) { d = Math.min(d, sdTeardrop(x - bx, (y - by) / 0.85, z - bz, R) * 0.85, capsule(x, y, z, 0, 0, 8, bx * 0.98, by, bz - R * 1.3, 3)); }
    return smin(d, frustum(x, y, z, 22, 12, 0, 10), 4);
  };
  return { f, h0: 106, bounds: { min: [-38, -20, 0], max: [36, 24, 108] }, foot: 4,
    solid: (x, y, z) => { if (z < 12) return true; for (const [bx, by, bz, R] of B) if (z < bz - R * 1.05 && capsule(x, y, z, 0, 0, 8, bx * 0.98, by, bz - R * 1.3, 3) < 3) return true; return false; } };
}
// ---------- 19. gwiazda ----------
function buildGwiazda() {
  const f = (x, y, z) => {
    const d = sdStar5(x, z - 50, 50, 0.48);
    const r = len2(x, z - 50); const th = 15 - r * 0.2;
    return smax(d, Math.abs(y) - Math.max(th, 3), 2) ;
  };
  return { f, h0: 50 + 50 * 0.97, bounds: { min: [-50, -16, 0], max: [50, 16, 102] }, foot: 3, supports: 'boczne ramiona gwiazdy mają spód poziomy - podpory zewnętrzne pod ramionami' };
}
// ---------- 20. słonecznik ----------
function buildSlonecznik() {
  const f = (x, y, z) => {
    const cz = 62; const dx = x, dz = z - cz; const r = len2(dx, dz), a = Math.atan2(dz, dx);
    const petal = r - (26 + 10 * Math.pow(Math.abs(Math.cos(a * 7)), 0.6));
    const head = inflate(petal * 0.8, y, 7, 8);
    const disc = ellipsoid(x, y + 6, z - cz, 17, 8, 17);
    const stem = capsule(x, y, z, 0, 0, 0, 0, 0, cz, 5);
    const leaf = inflate(drop2D(x - 14, z - 22, 0, 0, 9), y, 4, 5);
    return smin(smin(Math.min(head, disc), stem, 3), leaf, 3);
  };
  return { f, h0: 98, bounds: { min: [-38, -16, 0], max: [38, 12, 100] }, foot: 3, supports: 'dolne płatki mają spód poziomy - podpory zewnętrzne pod płatkami', solid: (x, y, z) => z < 30 };
}
// ---------- 21. liść klonu ----------
const MAPLE = [[0, 1.0], [0.12, 0.72], [0.28, 0.8], [0.25, 0.55], [0.55, 0.68], [0.5, 0.42], [0.72, 0.38], [0.42, 0.16], [0.4, 0.02], [0.12, 0.12], [0.06, -0.12], [0.06, -0.3]].map(([x, z]) => [x, z]);
const MAPLE_FULL = [...MAPLE, ...MAPLE.slice().reverse().map(([x, z]) => [-x, z]).filter(([x]) => x !== 0)];
function buildLisc() {
  const f = (x, y, z) => { const d = sdPolygon2(x / 70, (z - 30) / 70, MAPLE_FULL) * 70; return inflate(d - 1, y - 0.004 * x * x, 6, 7); };
  return { f, h0: 98, bounds: { min: [-54, -14, 0], max: [54, 14, 100] }, foot: 3, supports: 'zęby liścia mają krótkie nawisy - podpory zewnętrzne punktowo' };
}
// ---------- 22. mandala (kopuła) ----------
function buildMandala() {
  const f = (x, y, z) => Math.max(ellipsoid(x, y, z + 6, 48, 48, 46), -z + 0) ;
  return { f, h0: 40, bounds: { min: [-48, -48, 0], max: [48, 48, 41] }, foot: 3, defaults: { height: 40 } };
}
// ---------- 23. płatek śniegu ----------
function buildSniezynka() {
  const C = [0, 0, 54], L = 46, segs = [];
  for (let k = 0; k < 6; k++) {
    const a = (90 + k * 60) * D2R, ca = Math.cos(a), sa = Math.sin(a);
    const P = (t, o) => [C[0] + ca * t - sa * o, 0, C[2] + sa * t + ca * o];
    segs.push([P(0, 0), P(L, 0)], [P(L * 0.55, 0), P(L * 0.8, L * 0.22)], [P(L * 0.55, 0), P(L * 0.8, -L * 0.22)]);
  }
  const tubes = makeDropTubes(segs.map((pts) => ({ pts, closed: false })), 5);
  const f = (x, y, z) => smin(tubes(x, y, z), box(x, y, z, 0, 0, 2, 18, 9, 4, 2), 4);
  return { f, h0: 54 + L + 5, bounds: { min: [-48, -10, 0], max: [48, 10, 106] }, foot: 3 };
}
// ---------- 26. dom ----------
function buildDom() {
  const f = (x, y, z) => {
    const walls = box(x, y, z, 0, 0, 22, 34, 26, 22, 1.5);
    const chimney = box(x, y, z, 18, 8, 66, 5, 5, 10, 1);
    return Math.min(smin(walls, Math.max((Math.abs(x) + z - 80) * 0.707, 43 - z, Math.abs(y) - 28), 1), chimney);
  };
  return { f, h0: 80, bounds: { min: [-37, -30, 0], max: [37, 30, 82] }, foot: 3 };
}
// ---------- 27. korona urodzinowa ----------
function buildKoronaUr() {
  const N = 6;
  const f = (x, y, z) => {
    const r = len2(x, y), a = Math.atan2(y, x);
    const u = ((a / (2 * Math.PI)) * N % 1 + 1) % 1; const tooth = 1 - Math.abs(u - 0.5) * 2;
    const top = 26 + 30 * tooth;
    const band = Math.max(Math.abs(r - 36) - 5, -z, (z - top) * 0.7);
    let balls = Infinity; for (let k = 0; k < N; k++) { const b = (k + 0.5) / N * 2 * Math.PI; balls = Math.min(balls, sdTeardrop(x - 36 * Math.cos(b), y - 36 * Math.sin(b), z - 58, 5)); }
    return smin(band, balls, 2);
  };
  return { f, h0: 64, bounds: { min: [-42, -42, 0], max: [42, 42, 66] }, foot: 3, defaults: { height: 64 } };
}
// ---------- 28. tarcza ----------
const SHIELD = [[-1, 1], [1, 1], [1, 0.35], [0.62, -0.3], [0, -0.95], [-0.62, -0.3], [-1, 0.35]];
function buildTarcza() {
  const f = (x, y, z) => { const d = sdPolygon2(x / 40, (z - 52) / 40, SHIELD) * 40 - 2; return smin(inflate(d, y, 11, 14), box(x, y, z, 0, 0, 4, 16, 14, 6, 2), 4); };
  return { f, h0: 94, bounds: { min: [-44, -16, 0], max: [44, 16, 96] }, foot: 4 };
}
// ---------- 30. nieskończoność ----------
function buildNieskonczonosc() {
  const pts = []; const A = 46, cz = 34;
  for (let i = 0; i < 64; i++) { const t = i / 64 * 2 * Math.PI; const s = Math.sin(t), c = Math.cos(t); const d = 1 + s * s; pts.push([A * c / d, 0, cz + A * s * c / d * 1.15]); }
  const tubes = makeDropTubes([{ pts, closed: true }], 7);
  const f = (x, y, z) => smin(tubes(x, y, z), box(x, y, z, 0, 0, 2, 40, 12, 4, 2), 4);
  return { f, h0: cz + 22, bounds: { min: [-56, -14, 0], max: [56, 14, 66] }, foot: 4, defaults: { height: 56 } };
}
// ---------- dodatkowe: otwarta księga, dzwon ----------
function buildKsiega() {
  const page = (x, y, z, s) => { const c = Math.cos(s * 32 * D2R), sn = Math.sin(s * 32 * D2R); const u = c * x - sn * y, v = sn * x + c * y; return box(u, v + 0.012 * u * u * 0 , z, s * 30, 0, 40, 30, 6.5, 38, 3); };
  const f = (x, y, z) => smin(smin(page(x, y, z, 1), page(x, y, z, -1), 4), capsule(x, y, z, 0, 3, 2, 0, 3, 78, 6), 3);
  return { f, h0: 78, bounds: { min: [-56, -10, 0], max: [56, 40, 80] }, foot: 3 };
}
function buildDzwon() {
  const prof = (r, z) => { const R = z < 8 ? 40 - z * 0.25 : 38 - (z - 8) * 0.38 - 0.0035 * (z - 8) * (z - 8); return Math.max((r - R) * 0.8, -z, z - 72); };
  const f = (x, y, z) => smin(smin(prof(len2(x, y), z), sdTeardrop(x, y, z - 70, 10), 4), dropRing(x, y, z, 0, 0, 84, 7, 3.5), 2);
  return { f, h0: 95, bounds: { min: [-42, -42, 0], max: [42, 42, 97] }, foot: 4, solid: (x, y, z) => z > 74 };
}
// ---------- bombki ----------
function buildKula() {
  const f = (x, y, z) => smin(sphere(x, y, z, 0, 0, 34, 35), Math.min(cylinderZ(x, y, z, 7, 60, 72), dropRing(x, y, z, 0, 0, 80, 6, 2.8)), 2);
  return { f, h0: 89, bounds: { min: [-36, -36, 0], max: [36, 36, 92] }, foot: 2, solid: (x, y, z) => z > 66, supports: 'dolna półkula ma nawis > 45° - podpory zewnętrzne pod spodem lub druk w połówkach', defaults: { height: 75 } };
}
function buildKropla() {
  const f = (x, y, z) => smin(sdTeardrop(x, y, z - 42, 33), Math.min(cylinderZ(x, y, z, 6.5, 67, 79), dropRing(x, y, z, 0, 0, 87, 6, 2.8)), 2);
  return { f, h0: 96, bounds: { min: [-34, -34, 0], max: [34, 34, 104] }, foot: 3, solid: (x, y, z) => z > 73, defaults: { height: 85 } };
}

export const GROUPS = [
  { id: 'start', nazwa: 'Kolekcja startowa (presety)' },
  { id: 'bib', nazwa: 'Biblioteka 30 kształtów' },
  { id: 'dod', nazwa: 'Dodatkowe kształty' },
  { id: 'bombki', nazwa: 'Bombki (etap 4)' },
];
export const STYLES = [
  { id: 'voronoi', nazwa: 'Organiczny Voronoi' },
  { id: 'tpms', nazwa: 'TPMS (gyroid)' },
  { id: 'lowpoly', nazwa: 'Low-poly (okna trójkątne)' },
  { id: 'kontury', nazwa: 'Kontury warstwowe' },
  { id: 'spirala', nazwa: 'Spirala' },
];

const S = (id, nr, nazwa, grupa, motywy, motif, build, extra = {}) => ({ id, nr, nazwa, grupa, motywy, motif, build, ...extra });
export const SHAPES = [
  // biblioteka 30
  S('serce', 1, 'Serce', 'bib', 'Serca, kwiaty, gwiazdy', 'serce', buildSerce),
  S('dwa-serca', 2, 'Dwa serca', 'bib', 'Serca, róże', 'serca-kwiaty', buildDwaSerca),
  S('obraczki', 3, 'Obrączki', 'bib', 'Małe obrączki, serca', 'obraczki', buildObraczki),
  S('para-golebi', 4, 'Para gołębi', 'bib', 'Pióra, gołąbki', 'kropla', null, { uwagi: 'Figuratywne ptaki wymagają modelu rzeźbiarskiego (siatka bazowa), nie prostego SDF.' }),
  S('liczba-rocznicy', 5, 'Liczba rocznicy', 'bib', 'Powtórzona liczba', 'gwiazda', buildLiczba, { number: true, uwagi: 'Motyw "miniaturowa liczba" w przygotowaniu (cyfry zamknięte wymagają mostków szablonowych); tymczasowo gwiazdki.' }),
  S('drzewo', 6, 'Drzewo życia', 'bib', 'Liście, serca', 'listki-serca', buildDrzewo),
  S('klucz', 7, 'Klucz z sercem', 'bib', 'Serca, klucze', 'serce', buildKlucz),
  S('motyl', 8, 'Motyl', 'bib', 'Motyle, kwiaty', 'motyl', buildMotyl),
  S('kielich', 9, 'Kielich z hostią', 'bib', 'Krzyże, koła hostii', 'krzyze-kola', buildKielich, { uwagi: 'Dekoracja, nie naczynie.' }),
  S('krzyz-celtycki', 10, 'Krzyż celtycki', 'bib', 'Krzyże, plecionka', 'krzyz', buildKrzyzCeltycki, { defaults: { motifSize: 9, cell: 7 } }),
  S('krzyz-roza', 11, 'Krzyż z różą', 'bib', 'Kwiaty, krzyże', 'kwiat', buildKrzyzRoza, { defaults: { motifSize: 9, cell: 7 } }),
  S('aniol', 12, 'Anioł', 'bib', 'Aniołki, gwiazdy', 'gwiazda', buildAniol, { uwagi: 'Uproszczona sylwetka (szata, głowa, skrzydła). Motyw aniołków w przygotowaniu - tymczasowo gwiazdki.' }),
  S('hostia', 13, 'Hostia z IHS', 'bib', 'Krzyże, kłosy', 'krzyz', buildHostia, { uwagi: 'Napis IHS dojdzie z modułem napisów (etap 2).' }),
  S('golab', 14, 'Gołąb', 'bib', 'Gołąbki, pióra', 'kropla', null, { uwagi: 'Ptak w locie na wsporniku - wymaga modelu rzeźbiarskiego.' }),
  S('korona-krzyz', 15, 'Korona z krzyżem', 'bib', 'Krzyże, rozety', 'krzyz', buildKoronaKrzyz),
  S('tort', 16, 'Tort', 'bib', 'Świeczki, gwiazdy', 'gwiazda', buildTort),
  S('balony', 17, 'Balony', 'bib', 'Gwiazdy, balony', 'kolo', buildBalony),
  S('liczba-urodzinowa', 18, 'Liczba urodzinowa', 'bib', 'Cyfry, gwiazdy', 'gwiazda', buildLiczba, { number: true, defaults: { number: '18' } }),
  S('gwiazda', 19, 'Gwiazda', 'bib', 'Gwiazdki', 'gwiazda', buildGwiazda, { supports: 'boczne ramiona gwiazdy mają spód poziomy - podpory zewnętrzne pod ramionami' }),
  S('slonecznik', 20, 'Słonecznik', 'bib', 'Płatki, listki', 'lisc', buildSlonecznik, { supports: 'dolne płatki mają spód poziomy - podpory zewnętrzne pod płatkami' }),
  S('lisc-klonu', 21, 'Liść klonu', 'bib', 'Listki', 'lisc', buildLisc, { supports: 'zęby liścia mają krótkie nawisy - podpory zewnętrzne punktowo' }),
  S('mandala', 22, 'Przestrzenna mandala', 'bib', 'Rozety, geometria', 'kwiat', buildMandala, { defaults: { height: 40 }, uwagi: 'Wariant kopułowy.' }),
  S('platek-sniegu', 23, 'Płatek śniegu', 'bib', 'Płatki, gwiazdy', 'sniezynka', buildSniezynka),
  S('pajeczyna', 24, 'Przestrzenna pajęczyna', 'bib', 'Nieregularne oczka', 'kolo', null, { uwagi: 'Zakrzywiona sieć w podporze - w przygotowaniu.' }),
  S('muszla', 25, 'Muszla', 'bib', 'Muszelki, spirale', 'kropla', null, { uwagi: 'Pełna forma spiralna - w przygotowaniu.' }),
  S('dom', 26, 'Dom', 'bib', 'Domki, okna, serca', 'domek', buildDom),
  S('korona-ur', 27, 'Korona urodzinowa', 'bib', 'Gwiazdy, romby', 'gwiazdy-romby', buildKoronaUr, { defaults: { height: 64 } }),
  S('tarcza', 28, 'Tarcza', 'bib', 'Geometria, inicjały', 'romb', buildTarcza, { uwagi: 'Inicjały dojdą z modułem napisów (etap 2).' }),
  S('mapa-polski', 29, 'Mapa Polski', 'bib', 'Serca, listki', 'listki-serca', null, { uwagi: 'Wymaga dokładnego konturu granic (dane źródłowe), bez przybliżeń "z ręki".' }),
  S('nieskonczonosc', 30, 'Nieskończoność', 'bib', 'Serca, obrączki', 'serce', buildNieskonczonosc, { defaults: { height: 56 } }),
  // dodatkowe
  S('krzyz', '', 'Krzyż łaciński', 'dod', 'Krzyżyki', 'krzyz', buildKrzyz, { defaults: { motifSize: 9.5, cell: 7.5 } }),
  S('roza', '', 'Róża', 'dod', 'Róże, listki', 'kwiat', null, { uwagi: 'Przestrzenne płatki - w przygotowaniu.' }),
  S('ksiega', '', 'Otwarta księga', 'dod', 'Serca, gwiazdki', 'serce', buildKsiega),
  S('dzwon', '', 'Dzwon', 'dod', 'Gwiazdki, serca', 'gwiazda', buildDzwon),
  // bombki
  S('kula', '', 'Bombka - kula', 'bombki', 'Gwiazdki, płatki', 'sniezynka', buildKula, { supports: 'dolna półkula ma nawis > 45° - podpory zewnętrzne pod spodem lub druk w połówkach', defaults: { height: 75 }, uwagi: 'Imię jako wstęga/medalion - etap 4.' }),
  S('kropla', '', 'Bombka - kropla', 'bombki', 'Gwiazdki, płatki', 'sniezynka', buildKropla, { defaults: { height: 85 }, uwagi: 'Imię jako wstęga/medalion - etap 4.' }),
];
// Kolekcja startowa: presety (kształt + linia + motyw), zgodnie z koncepcją
export const PRESETS = [
  { id: 'p-serce-serca', nazwa: 'Serce z serduszkami', shape: 'serce', params: { line: 'B', motifSize: 13, motif: 'serce' } },
  { id: 'p-serce-roze', nazwa: 'Serce z różyczkami', shape: 'serce', params: { line: 'B', motifSize: 13, motif: 'kwiat' } },
  { id: 'p-serce-niebo', nazwa: 'Serce z gwiazdami i księżycami', shape: 'serce', params: { line: 'B', motifSize: 13, motif: 'niebo' } },
  { id: 'p-liczba-30', nazwa: 'Liczba 30', shape: 'liczba-rocznicy', params: { line: 'B', motifSize: 13, motif: 'gwiazda', number: '30' } },
  { id: 'p-krzyz', nazwa: 'Krzyż z krzyżykami', shape: 'krzyz', params: { line: 'B', motif: 'krzyz' } },
  { id: 'p-aniol', nazwa: 'Anioł', shape: 'aniol', params: { line: 'B', motifSize: 13, motif: 'gwiazda' } },
  { id: 'p-drzewo', nazwa: 'Drzewo z listkami', shape: 'drzewo', params: { line: 'B', motifSize: 13, motif: 'lisc' } },
  { id: 'p-motyl', nazwa: 'Motyl z motylkami', shape: 'motyl', params: { line: 'B', motifSize: 13, motif: 'motyl' } },
  { id: 'p-gwiazda', nazwa: 'Gwiazda z gwiazdkami', shape: 'gwiazda', params: { line: 'B', motifSize: 13, motif: 'gwiazda' } },
  { id: 'p-kielich', nazwa: 'Kielich z hostiami i krzyżykami', shape: 'kielich', params: { line: 'B', motifSize: 13, motif: 'krzyze-kola' } },
];
export function getShape(id) { return SHAPES.find((s) => s.id === id); }
