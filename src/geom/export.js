// Eksport: STL binarny, 3MF (mm, kolor), JSON parametrów. Bez danych autora w plikach.
import { zipSync, strToU8 } from 'fflate';

export const PALETTE = [
  { id: 'bialy', nazwa: 'Biały', hex: '#F4F4F1' },
  { id: 'kosc', nazwa: 'Kość słoniowa', hex: '#EDE3CC' },
  { id: 'zloty', nazwa: 'Złoty', hex: '#C9A54A' },
  { id: 'srebrny', nazwa: 'Srebrny', hex: '#B9BCC0' },
  { id: 'rozowy', nazwa: 'Różowy', hex: '#E7A9B8' },
  { id: 'czerwony', nazwa: 'Czerwony', hex: '#B3262E' },
  { id: 'niebieski', nazwa: 'Niebieski', hex: '#3C6AA8' },
  { id: 'zielony', nazwa: 'Zielony', hex: '#4C8A55' },
];
export const colorHex = (id) => (PALETTE.find((c) => c.id === id) || PALETTE[1]).hex;

export function toSTL(mesh, name = 'statuetka') {
  const V = mesh.vert, np = mesh.numProp, T = mesh.tri, nt = T.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const hdr = ('binary STL ' + name + ' mm').slice(0, 80);
  for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i) & 0x7f);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let f = 0; f < nt; f++) {
    const a = T[f * 3] * np, b = T[f * 3 + 1] * np, c = T[f * 3 + 2] * np;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
    for (const k of [a, b, c]) { dv.setFloat32(o, V[k], true); dv.setFloat32(o + 4, V[k + 1], true); dv.setFloat32(o + 8, V[k + 2], true); o += 12; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

export function to3MF(mesh, { name = 'statuetka', color = '#EDE3CC', material = 'PLA' } = {}) {
  const V = mesh.vert, np = mesh.numProp, T = mesh.tri, nv = V.length / np, nt = T.length / 3;
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="pl-PL" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
  parts.push(' <metadata name="Title">' + esc(name) + '</metadata>\n');
  parts.push(' <resources>\n  <basematerials id="1">\n   <base name="' + esc(material) + '" displaycolor="' + color.toUpperCase() + 'FF" />\n  </basematerials>\n');
  parts.push('  <object id="2" type="model" pid="1" pindex="0" name="' + esc(name) + '">\n   <mesh>\n    <vertices>\n');
  let chunk = [];
  for (let i = 0; i < nv; i++) {
    chunk.push('     <vertex x="' + fx(V[i * np]) + '" y="' + fx(V[i * np + 1]) + '" z="' + fx(V[i * np + 2]) + '" />\n');
    if (chunk.length > 20000) { parts.push(chunk.join('')); chunk = []; }
  }
  parts.push(chunk.join('')); chunk = [];
  parts.push('    </vertices>\n    <triangles>\n');
  for (let f = 0; f < nt; f++) {
    chunk.push('     <triangle v1="' + T[f * 3] + '" v2="' + T[f * 3 + 1] + '" v3="' + T[f * 3 + 2] + '" />\n');
    if (chunk.length > 20000) { parts.push(chunk.join('')); chunk = []; }
  }
  parts.push(chunk.join(''));
  parts.push('    </triangles>\n   </mesh>\n  </object>\n </resources>\n <build>\n  <item objectid="2" transform="1 0 0 0 1 0 0 0 1 128 128 0" />\n </build>\n</model>\n');
  const model = strToU8(parts.join(''));
  const ct = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\n</Types>\n';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\n</Relationships>\n';
  const fixed = [1980, 0, 1, 0, 0, 0]; // stała data w ZIP -> deterministyczny plik
  return zipSync({ '[Content_Types].xml': [strToU8(ct), { mtime: new Date(...fixed) }], '_rels/.rels': [strToU8(rels), { mtime: new Date(...fixed) }], '3D/3dmodel.model': [model, { mtime: new Date(...fixed) }] }, { level: 6 });
}
const fx = (v) => (Math.round(v * 10000) / 10000).toString();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function paramsJSON(P, stats, validation, extra = {}) {
  return JSON.stringify({
    format: 'statuetki-3d/projekt', wersjaSilnika: extra.engineVersion, kształt: P.shape, linia: P.line, styl: P.style, ziarno: P.seed,
    parametry: P, personalizacja: extra.personalizacja || null,
    wynik: { wymiaryMm: validation.dims.map((d) => +d.toFixed(2)), objetoscMm3: +stats.volume.toFixed(1), trojkaty: stats.numTri, genus: stats.genus, komponenty: stats.compCount },
    walidacja: validation.items.map((v) => ({ id: v.id, status: v.status, wartosc: v.value })),
  }, null, 2);
}
