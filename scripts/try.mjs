import Module from 'manifold-3d';
import { generate, estimates } from '../src/geom/engine.js';
const wasm = await Module(); wasm.setup();
const p = JSON.parse(process.argv[2] || '{}');
const r = generate(wasm, p, (m) => console.log(m));
const st = r.stats;
console.log('time', st.timeMs, 'lvl', st.levelSetMs, 'tri', st.numTri, 'genus', st.genus, 'comp', st.compBefore, '->', st.compCount, 'removed', st.removedVol.toFixed(2), 'vol', st.volume.toFixed(0), 'roofFill', st.roofFilledVoxels, 'seeds', JSON.stringify(st.seedStats && {...st.seedStats}));
console.log(estimates(st));
for (const v of r.validation.items) console.log(v.status.padEnd(5), v.label, '=', v.value);
