import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SHAPES, GROUPS, STYLES, PRESETS, getShape } from './geom/shapes.js';
import { DEFAULTS, ENGINE_VERSION, normalizeParams } from './geom/engine.js';
import { motifOptions } from './geom/motifs.js';
import { PALETTE, colorHex, toSTL, to3MF, paramsJSON } from './geom/export.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const state = { params: { ...DEFAULTS }, result: null, busy: false, reqId: 0 };
for (const [k, v] of qs) if (k in DEFAULTS || k === 'motifMethod' || k === 'motifMin') state.params[k] = v; else if (k === 'motifAuto') state.params.motifAuto = !(v === '0' || v === 'false');

// ---------- scena ----------
const vp = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.localClippingEnabled = true;
vp.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe4e2dd);
const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8680, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-150, -220, 260); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(200, 180, 120); scene.add(rim);
const bedGroup = new THREE.Group(); scene.add(bedGroup);
{
  const g = new THREE.PlaneGeometry(256, 256); const m = new THREE.MeshBasicMaterial({ color: 0xd6d3cc, transparent: true, opacity: 0.55 });
  const pl = new THREE.Mesh(g, m); pl.position.z = -0.05; bedGroup.add(pl);
  const grid = new THREE.GridHelper(256, 16, 0xa9a59d, 0xbfbbb3); grid.rotation.x = Math.PI / 2; bedGroup.add(grid);
}
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let meshObj = null, backObj = null;
const matFront = new THREE.MeshStandardMaterial({ color: 0xede3cc, roughness: 0.62, metalness: 0.0, side: THREE.FrontSide });
const matBack = new THREE.MeshStandardMaterial({ color: 0x8c3a2e, roughness: 0.9, side: THREE.BackSide });
function resize() { const w = vp.clientWidth, h = vp.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();
function loop() { if ($('rotate').checked && meshObj) meshObj.rotation.z += 0.006, backObj.rotation.z = meshObj.rotation.z; controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }
loop();

function setView(v) {
  const H = state.result ? state.result.stats.bbox.max[2] : 100; const c = new THREE.Vector3(0, 0, H / 2); const d = Math.max(H, 80) * 2.6;
  const dirs = { iso: [-0.62, -0.72, 0.32], front: [0, -1, 0.04], back: [0, 1, 0.04], side: [1, 0, 0.04], top: [0, -0.01, 1] };
  const dv = new THREE.Vector3(...dirs[v]).normalize();
  if (meshObj) { meshObj.rotation.z = 0; backObj.rotation.z = 0; }
  camera.position.copy(c.clone().addScaledVector(dv, d)); controls.target.copy(c); controls.update();
  state.view = v;
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

function updateClip() {
  const on = $('clip').checked; const ax = $('clipAxis').value; const t = +$('clipPos').value;
  const st = state.result && state.result.stats; const bb = st ? st.bbox : { min: [-50, -50, 0], max: [50, 50, 100] };
  const i = { x: 0, y: 1, z: 2 }[ax]; const mid = (bb.min[i] + bb.max[i]) / 2, half = (bb.max[i] - bb.min[i]) / 2;
  const n = new THREE.Vector3(ax === 'x' ? -1 : 0, ax === 'y' ? -1 : 0, ax === 'z' ? -1 : 0);
  clipPlane.normal.copy(n); clipPlane.constant = mid + t * half;
  matFront.clippingPlanes = on ? [clipPlane] : []; matBack.clippingPlanes = on ? [clipPlane] : [];
  matFront.needsUpdate = matBack.needsUpdate = true;
}
['clip', 'clipAxis', 'clipPos'].forEach((id) => $(id).addEventListener('input', updateClip));
$('bed').addEventListener('change', () => (bedGroup.visible = $('bed').checked));

function showMesh(mesh) {
  if (meshObj) { scene.remove(meshObj); scene.remove(backObj); meshObj.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  const np = mesh.numProp; let pos = mesh.vert;
  if (np !== 3) { pos = new Float32Array((mesh.vert.length / np) * 3); for (let i = 0; i < pos.length / 3; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = mesh.vert[i * np + k]; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(mesh.tri, 1));
  g.computeVertexNormals();
  meshObj = new THREE.Mesh(g, matFront); backObj = new THREE.Mesh(g, matBack);
  scene.add(meshObj); scene.add(backObj);
}

// ---------- UI ----------
function selectShape(id, extra = {}) {
  const s = getShape(id); state.params.shape = id; if (s.motif) state.params.motif = s.motif;
  state.params.height = DEFAULTS.height; if (s.defaults) Object.assign(state.params, s.defaults); Object.assign(state.params, extra);
  state.preset = extra.__preset || null; delete state.params.__preset; writeForm(); buildCatalog(); run();
}
function buildCatalog() {
  const el = $('catalog'); el.innerHTML = '';
  for (const gr of GROUPS) {
    const h = document.createElement('div'); h.className = 'cat-group'; h.textContent = gr.nazwa; el.appendChild(h);
    if (gr.id === 'start') {
      for (const p of PRESETS) {
        const d = document.createElement('div'); d.className = 'cat-item' + (state.preset === p.id ? ' sel' : '');
        d.innerHTML = '<span>' + p.nazwa + '</span><span class="badge ok">preset</span>';
        d.addEventListener('click', () => selectShape(p.shape, { ...p.params, __preset: p.id })); el.appendChild(d);
      }
      continue;
    }
    for (const s of SHAPES.filter((x) => x.grupa === gr.id)) {
      const d = document.createElement('div'); const ready = !!s.build;
      d.className = 'cat-item' + (ready ? '' : ' dis') + (s.id === state.params.shape && !state.preset ? ' sel' : '');
      d.title = (s.motywy ? 'Motywy: ' + s.motywy : '') + (s.uwagi ? '\n' + s.uwagi : '') + (s.supports ? '\nUwaga: ' + s.supports : '');
      d.innerHTML = '<span><span class="nr">' + (s.nr || '') + '</span>' + s.nazwa + '</span>' + (ready ? (s.supports ? '<span class="badge warn">podpory zewn.</span>' : '<span class="badge ok">gotowy</span>') : '<span class="badge prep">w przygotowaniu</span>');
      if (ready) d.addEventListener('click', () => selectShape(s.id));
      el.appendChild(d);
    }
  }
}
function buildSelects() {
  $('style').innerHTML = STYLES.map((s) => '<option value="' + s.id + '">' + s.nazwa + '</option>').join('');
  $('motif').innerHTML = motifOptions().map((m) => '<option value="' + m.id + '">' + m.nazwa + '</option>').join('');
  $('palette').innerHTML = PALETTE.map((c) => '<div class="sw" data-c="' + c.id + '"><i style="background:' + c.hex + '"></i>' + c.nazwa + '</div>').join('');
  $('palette').querySelectorAll('.sw').forEach((el) => el.addEventListener('click', () => { state.params.color = el.dataset.c; applyColor(); }));
}
function applyColor() { matFront.color.set(colorHex(state.params.color)); $('palette').querySelectorAll('.sw').forEach((el) => el.classList.toggle('sel', el.dataset.c === state.params.color)); }
const FIELDS = ['number', 'line', 'style', 'motifMethod', 'motif', 'motifShare', 'motifSize', 'motifOrient', 'height', 'shell', 'cell', 'rib', 'jitter', 'seed', 'resolution', 'simplify', 'material'];
function writeForm() { for (const f of FIELDS) $(f).value = state.params[f] ?? (f === 'motifMethod' ? 'medalion' : ''); const a = state.params.motifAuto; $('motifAuto').checked = !(a === false || a === 'false' || a === 0 || a === '0'); $('motifMin').value = state.params.motifMin ?? 8.5; toggleLine(); }
function readForm() { for (const f of FIELDS) state.params[f] = $(f).value; state.params.motifAuto = $('motifAuto').checked; state.params.motifMin = $('motifMin').value; }
function toggleLine() { const sh = getShape(state.params.shape); $('numberRow').style.display = sh && sh.number ? '' : 'none'; const b = $('line').value === 'B'; $('styleRow').style.display = b ? 'none' : ''; ['motifRow0', 'motifRow', 'motifRow2', 'motifRow3'].forEach((i) => ($(i).style.display = b ? '' : 'none'));
  if (b && $('motif').value === 'cyfry') $('numberRow').style.display = '';
  $('motifRow4').style.display = b && $('motifMethod').value !== 'v1' ? '' : 'none'; $('motifMin').disabled = !$('motifAuto').checked; }
// metoda 2 (medalion) potrzebuje większego motywu niż wycięcie v1: domyślnie 13 mm
$('line').addEventListener('change', () => { if ($('line').value === 'B' && $('motifMethod').value !== 'v1' && Number($('motifSize').value) === 10.5) $('motifSize').value = 13; toggleLine(); });
$('motifMethod').addEventListener('change', () => { const v2 = $('motifMethod').value !== 'v1'; const m = Number($('motifSize').value); if (v2 && m === 10.5) $('motifSize').value = 13; if (!v2 && m === 13) $('motifSize').value = 10.5; });
$('motif').addEventListener('change', toggleLine);
$('motifMethod').addEventListener('change', toggleLine);
$('motifAuto').addEventListener('change', () => { $('motifMin').disabled = !$('motifAuto').checked; });
$('gen').addEventListener('click', () => { readForm(); run(); });
$('newSeed').addEventListener('click', () => { $('seed').value = String(Math.floor(Math.random() * 1e8)); readForm(); run(); });

function perso() {
  const v = (id) => $(id).value.trim();
  return { okazja: v('p_okazja'), numer: v('p_numer'), dlaKogo: v('p_dla'), odKogo: v('p_od'), data: v('p_data'), zyczenia: v('p_zyczenia') || v('p_zyczenia_sel') };
}
function persoCheck() {
  const p = perso(); const msgs = [];
  const lim = { okazja: 32, dlaKogo: 32, odKogo: 32, zyczenia: 48 };
  for (const [k, n] of Object.entries(lim)) if (p[k].length > n) msgs.push(k + ': ' + p[k].length + '/' + n + ' znaków - skróć tekst');
  if (p.numer && !/^\d{1,3}$/.test(p.numer)) msgs.push('numer: tylko cyfry (1-3)');
  $('persoCheck').textContent = msgs.length ? msgs.join('; ') : 'Długość tekstów w normie (limit wstępny tabliczki).';
}
document.querySelectorAll('#perso input, #perso select').forEach((el) => el.addEventListener('input', persoCheck));

// ---------- worker ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.onmessage = (ev) => {
  const m = ev.data; if (m.id !== state.reqId) return;
  if (m.type === 'progress') { $('busyMsg').textContent = m.msg; return; }
  state.busy = false; $('busy').classList.add('hidden'); $('gen').disabled = false;
  if (m.type === 'error') { $('status').textContent = 'Błąd: ' + m.msg; return; }
  state.result = m; showMesh(m.mesh); applyColor(); renderValidation(); renderStats(); updateClip();
  if (!state.viewSet) { setView(qs.get('view') || 'iso'); state.viewSet = true; }
  $('status').textContent = 'Gotowe: ' + (m.stats.timeMs / 1000).toFixed(1) + ' s, ' + m.stats.numTri.toLocaleString('pl-PL') + ' trójkątów';
  document.body.dataset.ready = String(state.reqId);
};
function run() {
  state.reqId++; state.busy = true; $('busy').classList.remove('hidden'); $('gen').disabled = true; $('busyMsg').textContent = 'Generowanie...';
  $('status').textContent = 'Generowanie...';
  worker.postMessage({ id: state.reqId, params: normalizeParams(state.params) });
}

function renderValidation() {
  const v = state.result.validation; const sum = $('valSummary');
  sum.className = 'valsum ' + (v.ok ? 'ok' : 'error');
  const warns = v.items.filter((i) => i.status === 'warn').length;
  sum.textContent = v.ok ? 'Model spełnia reguły blokujące' + (warns ? ' (uwagi: ' + warns + ')' : '') : 'Eksport zablokowany: ' + v.blocking + ' błąd(y)';
  const lab = { ok: 'OK', warn: 'UWAGA', error: 'BŁĄD' };
  $('valTable').innerHTML = v.items.map((i) => '<tr><td class="st ' + i.status + '">' + lab[i.status] + '</td><td>' + i.label + '<div class="lim">wymóg: ' + i.limit + (i.note ? ' - ' + i.note : '') + '</div></td><td class="v">' + i.value + '</td></tr>').join('');
  ['exSTL', 'ex3MF'].forEach((id) => ($(id).disabled = !v.ok));
  $('exNote').textContent = v.ok ? 'Eksport zapisuje dokładnie siatkę widoczną w podglądzie.' : 'Popraw parametry - walidacja blokuje eksport produkcyjny.';
}
function renderStats() {
  const s = state.result.stats, e = state.result.est, d = state.result.validation.dims; const P = s.params;
  const rows = [
    ['Kształt / linia', getShape(P.shape).nazwa + ' / ' + P.line + (P.line === 'A' ? ' (' + STYLES.find((x) => x.id === P.style).nazwa + ')' : '')],
    ['Ziarno', P.seed],
    ['Wymiary', d.map((x) => x.toFixed(1)).join(' x ') + ' mm'],
    ['Objętość', e.cm3.toFixed(1) + ' cm³'],
    ['Masa szac. (' + P.material + ')', e.mass.toFixed(0) + ' g'],
    ['Czas druku (orientacyjnie)', fmtMin(e.minutes)],
    ['Trójkąty', s.numTri.toLocaleString('pl-PL')],
    ['Genus', s.genus],
    ['Komórki / motywy', s.seedStats ? s.seedStats.count + ' / ' + s.seedStats.motifs : '-'],
    ['Wnętrze dosypane (dach 45°)', (s.roofFilledVoxels / 1000).toFixed(1) + ' cm³ (woksele)'],
    ['Wersja silnika', ENGINE_VERSION],
  ];
  $('stats').innerHTML = rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('');
}
const fmtMin = (m) => Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0') + ' min';

// ---------- eksport ----------
function fileBase() { const P = state.result.stats.params; return 'statuetka-' + P.shape + '-' + P.line + '-' + P.seed; }
function download(data, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function exportMesh() { const m = state.result.mesh; return { vert: m.vert, numProp: m.numProp, tri: m.tri }; }
$('exSTL').addEventListener('click', () => download(toSTL(exportMesh(), (state.result.stats.params.shape + '-' + state.result.stats.params.line).toLowerCase()), fileBase() + '.stl', 'model/stl'));
$('ex3MF').addEventListener('click', () => { const P = state.result.stats.params; download(to3MF(exportMesh(), { name: (P.shape + '-' + P.line).toLowerCase(), color: colorHex(P.color), material: P.material }), fileBase() + '.3mf', 'model/3mf'); });
$('exJSON').addEventListener('click', () => { const r = state.result; const P = { ...r.stats.params, color: state.params.color }; download(paramsJSON(P, r.stats, r.validation, { engineVersion: ENGINE_VERSION, personalizacja: perso() }), fileBase() + '.json', 'application/json'); });

// dla testów automatycznych (Playwright): skrót SHA-256 eksportowanego STL
window.__app = {
  state,
  async stlHash() { const P = state.result.stats.params; const b = toSTL(exportMesh(), (P.shape + '-' + P.line).toLowerCase()); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join(''); },
  setView, run: (p) => { Object.assign(state.params, p); writeForm(); buildCatalog(); run(); },
  zoom(f) { camera.position.lerp(controls.target, 1 - 1 / f); controls.update(); },
  clip(on, axis = 'y', pos = 0) { $('clip').checked = on; $('clipAxis').value = axis; $('clipPos').value = pos; updateClip(); },
};

buildSelects(); writeForm(); buildCatalog(); applyColor(); persoCheck();
$('status').textContent = 'Uruchamianie silnika (WASM)...';
run();
