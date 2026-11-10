// Motywy 2D (prześwity tematyczne). Każdy mieści się w kole o promieniu 0.5 (szerokość ok. 1).
// Wartość ujemna wewnątrz motywu (czyli wewnątrz otworu).
import { sdHeartIQ, sdStar5, sdCircle2, sdBox2, sdRhombus2, sdPolygon2, sdSegment2, len2 } from './sdf.js';
import { GLYPHS } from './shapes.js';

const K_HEART = 0.5 / 0.62;
const DOMEK = [[-0.36, -0.42], [0.36, -0.42], [0.36, 0.08], [0, 0.44], [-0.36, 0.08]];
const SNOW = (() => { const v = []; for (let i = 0; i < 12; i++) { const a = Math.PI / 2 + i * Math.PI / 6; const r = i % 2 ? 0.24 : 0.48; v.push([Math.cos(a) * r, Math.sin(a) * r]); } return v; })();

export const MOTIFS = {
  serce: { nazwa: 'Serca', f: (u, v) => sdHeartIQ(u / K_HEART, v / K_HEART + 0.55) * K_HEART },
  gwiazda: { nazwa: 'Gwiazdki', f: (u, v) => sdStar5(u, v + 0.03, 0.5, 0.52) },
  ksiezyc: { nazwa: 'Księżyce', f: (u, v) => Math.max(sdCircle2(u, v, 0.46), -sdCircle2(u - 0.24, v + 0.06, 0.33)) },
  krzyz: { nazwa: 'Krzyżyki', f: (u, v) => Math.min(sdBox2(u, v, 0.17, 0.48), sdBox2(u, v - 0.13, 0.36, 0.17)) },
  kwiat: { nazwa: 'Kwiaty i różyczki', f: (u, v) => { let d = sdCircle2(u, v, 0.2); for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + i * 2 * Math.PI / 5; d = Math.min(d, sdCircle2(u - 0.29 * Math.cos(a), v - 0.29 * Math.sin(a), 0.19)); } return d; } },
  lisc: { nazwa: 'Listki', f: (u, v) => { const c = Math.cos(0.5), s = Math.sin(0.5); const x = c * u - s * v, y = s * u + c * v; return Math.max(sdCircle2(x - 0.3, y, 0.5), sdCircle2(x + 0.3, y, 0.5)); } },
  motyl: { nazwa: 'Motylki', f: (u, v) => { const au = Math.abs(u); return Math.min(sdCircle2(au - 0.25, v - 0.13, 0.23), sdCircle2(au - 0.2, v + 0.2, 0.17), sdBox2(u, v, 0.08, 0.3)); } },
  romb: { nazwa: 'Romby', f: (u, v) => sdRhombus2(u, v, 0.34, 0.49) },
  kolo: { nazwa: 'Koła (hostie, balony)', f: (u, v) => sdCircle2(u, v, 0.46) },
  obraczki: { nazwa: 'Obrączki', f: (u, v) => Math.min(sdCircle2(u - 0.18, v, 0.3), sdCircle2(u + 0.18, v, 0.3)) },
  domek: { nazwa: 'Domki', f: (u, v) => sdPolygon2(u, v, DOMEK) },
  sniezynka: { nazwa: 'Płatki i gwiazdki', f: (u, v) => sdPolygon2(u, v, SNOW) },
  kropla: { nazwa: 'Krople i piórka', f: (u, v) => Math.min(sdCircle2(u, v + 0.15, 0.3), sdPolygon2(u, v, [[-0.25, -0.02], [0.25, -0.02], [0, 0.48]])) },
  aniolek: { nazwa: 'Aniołki', v2only: true, f: (u, v) => { const au = Math.abs(u);
    const head = sdCircle2(u, v - 0.34, 0.12); const robe = sdPolygon2(u, v, [[-0.22, -0.47], [0.22, -0.47], [0.05, 0.24], [-0.05, 0.24]]);
    const wing = sdPolygon2(au, v, [[0.06, 0.12], [0.44, 0.3], [0.4, 0.06], [0.2, -0.16]]); return Math.min(head, robe, wing); } },
};
// motywy w wersji 2 (medalion): pełny kształt (wartość ujemna = materiał motywu); fo = obrys zewnętrzny
// (z wypełnionymi otworami), gdy motyw ma własne prześwity
export const SOLID_OVERRIDES = {
  ksiezyc: { f: (u, v) => MOTIFS.ksiezyc.f(u, v), fo: (u, v) => sdCircle2(u, v, 0.46) },
  // kształty z głębokimi wcięciami: okno okrągłe (wcięcia stają się dużymi prześwitami zamiast ostrych klinów)
  gwiazda: { f: (u, v) => MOTIFS.gwiazda.f(u, v), fo: (u, v) => sdCircle2(u, v - 0.02, 0.47) },
  sniezynka: { f: (u, v) => MOTIFS.sniezynka.f(u, v), fo: (u, v) => sdCircle2(u, v, 0.46) },
  krzyz: { f: (u, v) => MOTIFS.krzyz.f(u, v), fo: (u, v) => sdCircle2(u, v, 0.47) },
  motyl: { f: (u, v) => MOTIFS.motyl.f(u, v), fo: (u, v) => sdCircle2(u, v, 0.46) },
  kwiat: { f: (u, v) => MOTIFS.kwiat.f(u, v), fo: (u, v) => sdCircle2(u, v, 0.48) },
  aniolek: { f: (u, v) => MOTIFS.aniolek.f(u, v), fo: (u, v) => sdCircle2(u, v, 0.48) },
  obraczki: { f: (u, v) => Math.min(Math.abs(len2(u - 0.17, v) - 0.26) - 0.075, Math.abs(len2(u + 0.17, v) - 0.26) - 0.075),
    fo: (u, v) => Math.min(sdCircle2(u - 0.17, v, 0.335), sdCircle2(u + 0.17, v, 0.335)) },
};
// uproszczone warianty dla małych motywów (< 11 mm): elementy rozsunięte, żeby nie zlewały się po
// zamknięciu prześwitów < 3 mm
export const SMALL_OVERRIDES = {
  kwiat: { f: (u, v) => { let d = Infinity; for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; d = Math.min(d, sdCircle2(u - 0.26 * Math.cos(a), v - 0.26 * Math.sin(a), 0.19)); } return Math.min(d, sdCircle2(u, v, 0.1)); },
    fo: (u, v) => sdCircle2(u, v, 0.48) },
  motyl: { f: (u, v) => { const au = Math.abs(u); return Math.min(sdCircle2(au - 0.27, v - 0.12, 0.2), sdCircle2(au - 0.2, v + 0.2, 0.14), sdBox2(u, v, 0.075, 0.3)); },
    fo: (u, v) => sdCircle2(u, v, 0.48) },
};
// cyfry: obrys kreskowy z GLYPHS (pole 1 x 1,6) wpisany w koło o średnicy ok. 1
export function digitGlyph(ch) {
  const pls = GLYPHS[ch] || GLYPHS['0']; const S = 1 / 1.75, hw = 0.085;
  const segs = []; for (const pl of pls) for (let i = 0; i + 1 < pl.length; i++) segs.push([(pl[i][0] - 0.5) * S, (pl[i][1] - 0.8) * S, (pl[i + 1][0] - 0.5) * S, (pl[i + 1][1] - 0.8) * S]);
  return (u, v) => { let d = Infinity; for (const g of segs) d = Math.min(d, sdSegment2(u, v, g[0], g[1], g[2], g[3])); return d - hw; };
}
// zestawy mieszane (losowanie motywu na komórkę)
export const MOTIF_SETS = {
  niebo: { nazwa: 'Gwiazdki i księżyce', items: ['gwiazda', 'ksiezyc'] },
  'serca-kwiaty': { nazwa: 'Serca i kwiaty', items: ['serce', 'kwiat'] },
  'krzyze-kola': { nazwa: 'Krzyżyki i hostie', items: ['krzyz', 'kolo'] },
  'listki-serca': { nazwa: 'Listki i serca', items: ['lisc', 'serce'] },
  'gwiazdy-romby': { nazwa: 'Gwiazdy i romby', items: ['gwiazda', 'romb'] },
  cyfry: { nazwa: 'Cyfry (z pola Liczba)', items: ['cyfra'], v2only: true },
};
export function motifItems(id) { if (MOTIFS[id]) return [id]; if (MOTIF_SETS[id]) return MOTIF_SETS[id].items.filter((k) => MOTIFS[k]).length ? MOTIF_SETS[id].items.filter((k) => MOTIFS[k]) : ['kolo']; return ['serce']; }
export function motifOptions() {
  return [...Object.entries(MOTIFS).map(([k, m]) => ({ id: k, nazwa: m.nazwa })), ...Object.entries(MOTIF_SETS).map(([k, m]) => ({ id: k, nazwa: m.nazwa }))];
}
// średnica koła wpisanego (w jednostkach szerokości motywu) - liczona numerycznie
const _insc = {};
export function motifInscribed(id) {
  if (_insc[id] != null) return _insc[id];
  const f = MOTIFS[id].f; let m = 0;
  for (let i = 0; i <= 240; i++) for (let j = 0; j <= 240; j++) { const u = -0.6 + 1.2 * i / 240, v = -0.6 + 1.2 * j / 240; m = Math.max(m, -f(u, v)); }
  return (_insc[id] = 2 * m);
}
