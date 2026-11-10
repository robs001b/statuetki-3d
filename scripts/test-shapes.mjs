// Automatyczny test wszystkich gotowych kształtów (linia A i B): siatka zamknięta, 1 komponent,
// wymiary w stole, wyspy, nawisy. użycie: node scripts/test-shapes.mjs [rozdzielczość] [plik.json]
import Module from 'manifold-3d';
import fs from 'node:fs';
import { generate, estimates } from '../src/geom/engine.js';
import { SHAPES } from '../src/geom/shapes.js';
const wasm = await Module(); wasm.setup();
const res = Number(process.argv[2] || 0.6); const out = process.argv[3] || 'test-wynik.json';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const rows = [];
for (const sh of SHAPES) {
  if (only && !only.includes(sh.id)) continue;
  if (!sh.build) { rows.push({ id: sh.id, nazwa: sh.nazwa, status: 'w przygotowaniu' }); continue; }
  for (const line of (process.env.LINES ? process.env.LINES.split(',') : ['A', 'B'])) {
    const p = { shape: sh.id, line, motif: sh.motif, resolution: res, ...(line === 'B' ? { motifSize: 13 } : {}), ...(sh.defaults || {}) };
    try {
      const r = generate(wasm, p); const st = r.stats; const v = r.validation; const e = estimates(st);
      const get = (id) => v.items.find((i) => i.id === id);
      const pass = st.status === 0 || st.status === 'NoError';
      const row = { id: sh.id, nazwa: sh.nazwa, linia: line, zamknieta: pass, komponenty: st.compCount, usuniete_mm3: +st.removedVol.toFixed(2), genus: st.genus,
        wymiary: v.dims.map((d) => +d.toFixed(1)), w_stole: get('bed').status === 'ok', wyspy: st.localMinima, nawisy_pct: +(st.overhangArea / st.area * 100).toFixed(1),
        motywy: st.seedStats ? st.seedStats.motifs : null, rozmiary: st.seedStats ? st.seedStats.sizes ?? null : null, metoda: line === 'B' ? st.params.motifMethod : '', lacznikow: st.seedStats ? st.seedStats.connectors ?? null : null, masa_g: +e.mass.toFixed(1), blokujace: v.blocking, podpory: sh.supports || '', ms: st.timeMs };
      row.test = row.zamknieta && row.komponenty === 1 && row.w_stole && row.blokujace === 0 && row.usuniete_mm3 < 5 ? 'OK' : 'BŁĄD';
      rows.push(row); console.log(JSON.stringify(row));
    } catch (e) { rows.push({ id: sh.id, linia: line, test: 'BŁĄD', blad: String(e) }); console.log('ERR', sh.id, line, e); }
  }
}
fs.writeFileSync(out, JSON.stringify({ rozdzielczosc: res, data: new Date().toISOString(), wyniki: rows }, null, 1));
