// Prymitywy SDF (wartość ujemna wewnątrz, w mm). Oś Z pionowo (kierunek druku).
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const len2 = (x, y) => Math.sqrt(x * x + y * y);
export const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
export function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function smax(a, b, k) { return -smin(-a, -b, k); }

export function sphere(x, y, z, cx, cy, cz, r) { return len3(x - cx, y - cy, z - cz) - r; }
export function ellipsoid(x, y, z, rx, ry, rz) {
  const k0 = len3(x / rx, y / ry, z / rz), k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
export function capsule(x, y, z, ax, ay, az, bx, by, bz, r) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
  return len3(px - dx * h, py - dy * h, pz - dz * h) - r;
}
export function roundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
// torus: oś obrotu = ax ('x','y','z')
export function torus(x, y, z, R, r, ax = 'y') {
  let a, b, c;
  if (ax === 'y') { a = x; b = z; c = y; } else if (ax === 'x') { a = y; b = z; c = x; } else { a = x; b = y; c = z; }
  return len2(len2(a, b) - R, c) - r;
}
export function cylinderZ(x, y, z, r, z0, z1) {
  const dr = len2(x, y) - r, dz = Math.max(z0 - z, z - z1);
  return Math.min(Math.max(dr, dz), 0) + len2(Math.max(dr, 0), Math.max(dz, 0));
}
// 2D
export function sdSegment2(px, py, ax, ay, bx, by) {
  const qx = px - ax, qy = py - ay, dx = bx - ax, dy = by - ay;
  const h = clamp((qx * dx + qy * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return len2(qx - dx * h, qy - dy * h);
}
export function sdPolygon2(px, py, v) { // v: [[x,y],...]
  let d = Infinity, s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = px - v[i][0], wy = py - v[i][1];
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * h, by = wy - ey * h; d = Math.min(d, bx * bx + by * by);
    const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
// serce IQ: czubek (0,0), góra ~1.10, szerokość +-0.60
export function sdHeartIQ(px, py) {
  px = Math.abs(px);
  if (py + px > 1.0) return len2(px - 0.25, py - 0.75) - Math.SQRT2 / 4;
  const a = (px - 0) ** 2 + (py - 1) ** 2; const m = 0.5 * Math.max(px + py, 0);
  const b = (px - m) ** 2 + (py - m) ** 2;
  return Math.sqrt(Math.min(a, b)) * Math.sign(px - py);
}
export function sdStar5(px, py, r, rf) { // IQ star, r promień, rf współczynnik wcięcia
  const k1x = 0.809016994375, k1y = -0.587785252292, k2x = -k1x, k2y = k1y;
  px = Math.abs(px);
  let d = k1x * px + k1y * py; px -= 2 * Math.max(d, 0) * k1x; py -= 2 * Math.max(d, 0) * k1y;
  d = k2x * px + k2y * py; px -= 2 * Math.max(d, 0) * k2x; py -= 2 * Math.max(d, 0) * k2y;
  px = Math.abs(px); py -= r;
  const bax = rf * -k1y, bay = rf * k1x - 1; // ba = rf*(-k1.y,k1.x) - (0,1)
  const h = clamp((px * bax + py * bay) / (bax * bax + bay * bay), 0, r);
  return len2(px - bax * h, py - bay * h) * Math.sign(py * bax - px * bay);
}
export function sdCircle2(px, py, r) { return len2(px, py) - r; }
export function sdBox2(px, py, bx, by) { const dx = Math.abs(px) - bx, dy = Math.abs(py) - by; return len2(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0); }
export function sdRhombus2(px, py, a, b) { // a: pół-szerokość, b: pół-wysokość
  px = Math.abs(px); py = Math.abs(py);
  const ndot = (ax, ay, bx, by) => ax * bx - ay * by;
  const h = clamp(ndot(a - 2 * px, b - 2 * py, a, b) / (a * a + b * b), -1, 1);
  const d = len2(px - 0.5 * a * (1 - h), py - 0.5 * b * (1 + h));
  return d * Math.sign(px * b + py * a - a * b);
}
// Bryła "napompowana" z konturu 2D w płaszczyźnie XZ; głębia wzdłuż Y.
// d2 < 0 wewnątrz konturu. Przekrój w płaszczyźnie (e, y): elipsa W x H przy brzegu,
// dalej płasko na grubości 2H. Pole bliskie odległości euklidesowej (bez osobliwości).
export function inflate(d2, y, H, W) {
  const qx = Math.min(-d2 - W, 0), qy = y;
  const k0 = len2(qx / W, qy / H), k1 = len2(qx / (W * W), qy / (H * H));
  return k1 < 1e-12 ? -Math.min(W, H) : (k0 * (k0 - 1)) / k1;
}
// Teardrop 3D (kropla z czubkiem w dół, ścianki 45 st.) - bryła samonośna.
// Otoczka wypukła kuli R (środek 0) i wierzchołka (0,0,-R*sqrt2).
export function sdTeardrop(qx, qy, qz, R) {
  const r = len2(qx, qy), z = qz, S = Math.SQRT1_2;
  if (z >= -r) return len2(r, z) - R;
  const vx = r, vz = z + R * Math.SQRT2;
  const s = (vx + vz) * S, dl = (vx - vz) * S;
  if (s < 0) return len2(vx, vz);
  if (s <= R) return dl;
  return len2(r - R * S, z + R * S);
}
// odcinek "omieciony" kroplą: min po t (funkcja wypukła -> wyszukiwanie trójdzielne)
export function dropSegment(x, y, z, ax, ay, az, bx, by, bz, R) {
  let lo = 0, hi = 1;
  const f = (t) => sdTeardrop(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t), z - (az + (bz - az) * t), R);
  for (let i = 0; i < 11; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
  return Math.min(f((lo + hi) / 2), f(0), f(1));
}
// polilinia z kroplą; pts [[x,y,z],...]. Kropla mieści się w kuli R*sqrt2, więc odległość od
// kapsuły R*sqrt2 jest dolnym ograniczeniem: liczymy dokładnie tylko najbliższe odcinki,
// a daleko od powierzchni (> 4 mm) zwracamy samo ograniczenie (znak pola się zgadza).
export function dropPolyline(x, y, z, pts, R, closed = false) {
  const n = pts.length, m = closed ? n : n - 1; const lb = new Float64Array(m); let minLb = Infinity;
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % n]; lb[i] = capsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], R * 1.4143); if (lb[i] < minLb) minLb = lb[i]; }
  if (minLb > 4) return minLb;
  let best = Infinity;
  for (let k = 0; k < m; k++) {
    let i = -1, v = Infinity; for (let j = 0; j < m; j++) if (lb[j] < v) { v = lb[j]; i = j; }
    if (i < 0 || v >= best) break; lb[i] = Infinity;
    const a = pts[i], b = pts[(i + 1) % n]; const d = dropSegment(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], R);
    if (d < best) best = d;
  }
  return best;
}
// bryła obrotowa wokół osi Z z profilu 2D (r, z)
export function revolve(x, y, z, prof2) { return prof2(len2(x, y), z); }

// Zestaw rur o przekroju kropli z akceleracją siatką (dla cyfr, płatka śniegu, pętli).
// Daleko od rur (> ok. 6 mm) zwraca dolne ograniczenie odległości (znak poprawny).
export function makeDropTubes(polylines, R, cell = 6) {
  const segs = [];
  for (const { pts, closed } of polylines) { const n = pts.length, m = closed ? n : n - 1; for (let i = 0; i < m; i++) segs.push([pts[i], pts[(i + 1) % n]]); }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [a, b] of segs) for (const p of [a, b]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const pad = R * 1.42 + 8; for (let k = 0; k < 3; k++) { lo[k] -= pad; hi[k] += pad; }
  const nx = Math.ceil((hi[0] - lo[0]) / cell), ny = Math.ceil((hi[1] - lo[1]) / cell), nz = Math.ceil((hi[2] - lo[2]) / cell);
  const lists = new Array(nx * ny * nz); const hd = cell * Math.sqrt(3) / 2;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cx = lo[0] + (i + 0.5) * cell, cy = lo[1] + (j + 0.5) * cell, cz = lo[2] + (k + 0.5) * cell; const L = [];
    for (let s = 0; s < segs.length; s++) { const [a, b] = segs[s]; if (capsule(cx, cy, cz, a[0], a[1], a[2], b[0], b[1], b[2], R * 1.4143) < hd + 7) L.push(s); }
    lists[(k * ny + j) * nx + i] = L;
  }
  return (x, y, z) => {
    const i = Math.floor((x - lo[0]) / cell), j = Math.floor((y - lo[1]) / cell), k = Math.floor((z - lo[2]) / cell);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 7;
    const L = lists[(k * ny + j) * nx + i]; if (!L.length) return 7;
    let best = Infinity, minLb = Infinity; const lb = [];
    for (const s of L) { const [a, b] = segs[s]; const v = capsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], R * 1.4143); lb.push(v); if (v < minLb) minLb = v; }
    if (minLb > 4) return Math.max(minLb, 7);
    const ord = L.map((s, q) => q).sort((p, q) => lb[p] - lb[q]);
    for (const q of ord) { if (lb[q] >= best) break; const [a, b] = segs[L[q]]; const d = dropSegment(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], R); if (d < best) best = d; }
    return best;
  };
}
