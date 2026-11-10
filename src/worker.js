// Web Worker: Manifold (WASM) + silnik geometrii. Zwraca siatkę i walidację.
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { generate, estimates } from './geom/engine.js';

let wasmP = null;
function getWasm() {
  if (!wasmP) wasmP = Module({ locateFile: () => wasmUrl }).then((w) => { w.setup(); return w; });
  return wasmP;
}
self.onmessage = async (ev) => {
  const { id, params } = ev.data;
  try {
    const wasm = await getWasm();
    const r = generate(wasm, params, (msg) => self.postMessage({ id, type: 'progress', msg }));
    const est = estimates(r.stats, r.stats.params.material);
    const vert = new Float32Array(r.mesh.vert), tri = new Uint32Array(r.mesh.tri);
    self.postMessage({ id, type: 'done', mesh: { vert, tri, numProp: r.mesh.numProp }, stats: r.stats, validation: r.validation, est }, [vert.buffer, tri.buffer]);
  } catch (e) {
    self.postMessage({ id, type: 'error', msg: String(e && e.message || e) });
  }
};
