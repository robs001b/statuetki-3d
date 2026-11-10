// Samonośne wnętrze skorupy: sufity pustki o nachyleniu łagodniejszym niż 45 st. od pionu
// są zastępowane "dachem" 45 st. (materiał dosypany od wewnątrz). Dzięki temu w pustym
// wnętrzu nie trzeba podpór. Siatka wokseli jest deterministyczna (zależy tylko od parametrów).
export function buildRoof(B, bounds, t, footZ, vs = 1.0) {
  const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;
  const nx = Math.ceil((x1 - x0) / vs) + 1, ny = Math.ceil((y1 - y0) / vs) + 1, nz = Math.ceil((z1 - z0) / vs) + 1;
  const N = nx * ny * nz, idx = (i, j, k) => (k * ny + j) * nx + i;
  const val = new Float32Array(N); // B + t (ujemne = pustka)
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    val[idx(i, j, k)] = B(x0 + i * vs, y0 + j * vs, z0 + k * vs) + t;
  const isVoid = (n, k) => val[n] < 0 && z0 + k * vs > footZ;
  const ceil = new Float32Array(N).fill(NaN);
  for (let k = nz - 1; k >= 0; k--) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = idx(i, j, k); if (!isVoid(n, k)) continue;
    if (k + 1 < nz && isVoid(idx(i, j, k + 1), k + 1)) ceil[n] = ceil[idx(i, j, k + 1)];
    else { const a = val[n], b = k + 1 < nz ? val[idx(i, j, k + 1)] : 1; const f = b > a ? Math.min(1, -a / (b - a)) : 0.5; ceil[n] = z0 + (k + f) * vs; }
  }
  const margin = new Float32Array(N).fill(NaN);
  const L = new Float32Array(nx * ny);
  const Lv = new Float32Array(N), steep = new Uint8Array(N);
  const D2 = Math.SQRT2 * vs;
  for (let k = 0; k < nz; k++) {
    const zc = z0 + k * vs; const base = k * nx * ny;
    let any = false;
    for (let q = 0; q < nx * ny; q++) { const c = ceil[base + q]; L[q] = Number.isNaN(c) ? NaN : c; if (!Number.isNaN(c)) any = true; }
    if (!any) continue;
    const relax = (q, q2, w) => { const v = L[q2]; if (!Number.isNaN(v) && v + w < L[q]) L[q] = v + w; };
    for (let it = 0; it < 2; it++) {
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = j * nx + i; if (Number.isNaN(L[q])) continue;
        if (i > 0) relax(q, q - 1, vs); if (j > 0) relax(q, q - nx, vs); if (i > 0 && j > 0) relax(q, q - nx - 1, D2); if (i < nx - 1 && j > 0) relax(q, q - nx + 1, D2); }
      for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const q = j * nx + i; if (Number.isNaN(L[q])) continue;
        if (i < nx - 1) relax(q, q + 1, vs); if (j < ny - 1) relax(q, q + nx, vs); if (i < nx - 1 && j < ny - 1) relax(q, q + nx + 1, D2); if (i > 0 && j < ny - 1) relax(q, q + nx - 1, D2); }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const q = j * nx + i, n = base + q, c = ceil[n]; if (Number.isNaN(c)) continue;
      const g = (a, b) => { const ca = a >= 0 ? ceil[base + a] : NaN, cb = b >= 0 ? ceil[base + b] : NaN;
        if (!Number.isNaN(ca) && !Number.isNaN(cb)) return (cb - ca) / (2 * vs);
        if (!Number.isNaN(cb)) return (cb - c) / vs; if (!Number.isNaN(ca)) return (c - ca) / vs; return 0; };
      const gx = g(i > 0 ? n - 1 - base : -1, i < nx - 1 ? n + 1 - base : -1);
      const gy = g(j > 0 ? n - nx - base : -1, j < ny - 1 ? n + nx - base : -1);
      steep[n] = Math.hypot(gx, gy) >= 1.05 ? 1 : 0;
      Lv[n] = L[q];
    }
  }
  // dach wspólny dla całego odcinka pustki w kolumnie: minimum L po warstwach odcinka
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let k = 0;
    while (k < nz) {
      if (Number.isNaN(ceil[idx(i, j, k)])) { k++; continue; }
      let k2 = k, mn = Infinity;
      while (k2 < nz && !Number.isNaN(ceil[idx(i, j, k2)])) { mn = Math.min(mn, Lv[idx(i, j, k2)]); k2++; }
      for (let kk = k; kk < k2; kk++) { const n = idx(i, j, kk); const h = mn; margin[n] = h - (z0 + kk * vs); }
      k = k2;
    }
  }
  // poszerzenie wartości poza pustkę (dla gładkiej interpolacji), dalej +5
  for (let it = 0; it < 2; it++) {
    const src = margin.slice();
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const n = idx(i, j, k); if (!Number.isNaN(src[n])) continue;
      let s = 0, c = 0;
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj, e = k + dk; if (a < 0 || b < 0 || e < 0 || a >= nx || b >= ny || e >= nz) continue;
        const v = src[idx(a, b, e)]; if (!Number.isNaN(v)) { s += v; c++; } }
      if (c) margin[n] = s / c;
    }
  }
  let filled = 0;
  for (let n = 0; n < N; n++) { if (Number.isNaN(margin[n])) margin[n] = 5; else if (margin[n] > 5) margin[n] = 5; else if (margin[n] < -5) margin[n] = -5; }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const n = idx(i, j, k); if (isVoid(n, k) && margin[n] < 0) filled++; }
  const sample = (x, y, z) => {
    let fx = (x - x0) / vs, fy = (y - y0) / vs, fz = (z - z0) / vs;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return 5;
    const i = fx | 0, j = fy | 0, k = fz | 0; fx -= i; fy -= j; fz -= k;
    const n = idx(i, j, k), sx = 1, sy = nx, sz = nx * ny;
    const c00 = margin[n] * (1 - fx) + margin[n + sx] * fx, c10 = margin[n + sy] * (1 - fx) + margin[n + sy + sx] * fx;
    const c01 = margin[n + sz] * (1 - fx) + margin[n + sz + sx] * fx, c11 = margin[n + sz + sy] * (1 - fx) + margin[n + sz + sy + sx] * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  };
  return { sample, filledVoxels: filled, voxel: vs };
}
