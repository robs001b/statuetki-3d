// Generowanie plików do druku tym samym kodem co w przeglądarce.
// użycie: node scripts/gen.mjs <wyjście_bez_rozszerzenia> '<json parametrów>'
import Module from 'manifold-3d';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { generate, estimates, ENGINE_VERSION } from '../src/geom/engine.js';
import { toSTL, to3MF, paramsJSON, colorHex } from '../src/geom/export.js';
const wasm = await Module(); wasm.setup();
const out = process.argv[2]; const p = JSON.parse(process.argv[3] || '{}');
const r = generate(wasm, p, (m) => console.error(m));
const P = r.stats.params; const name = (P.shape + '-' + P.line).toLowerCase();
const stl = toSTL(r.mesh, name);
fs.writeFileSync(out + '.stl', stl);
if (!process.env.NO3MF) fs.writeFileSync(out + '.3mf', to3MF(r.mesh, { name, color: colorHex(P.color), material: P.material }));
fs.writeFileSync(out + '.json', paramsJSON(P, r.stats, r.validation, { engineVersion: ENGINE_VERSION }));
const est = estimates(r.stats, P.material);
console.log(JSON.stringify({ sha256: createHash('sha256').update(stl).digest('hex'), tri: r.stats.numTri, ms: r.stats.timeMs, compBefore: r.stats.compBefore, removed: r.stats.removedVol, minima: r.stats.localMinima, est, val: r.validation.items.map((v) => v.status + ' ' + v.label + ' = ' + v.value) }, null, 1));
