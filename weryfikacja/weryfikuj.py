#!/usr/bin/env python3
"""Niezależna weryfikacja plików do druku (trimesh + shapely).
Sprawdza: watertight, is_volume, liczba komponentów, wymiary w stole P1S, objętość, masa,
oraz analizę warstwową (0,2 mm): wyspy startujące w powietrzu i powierzchnię nawisów > 45 st.
użycie: python weryfikuj.py plik.stl [plik2.stl ...] [--json wynik.json]"""
import sys, json, math, zipfile, re
import numpy as np, trimesh
from shapely.geometry import Polygon
from shapely.ops import unary_union

GESTOSC = {"PLA": 1.24, "PETG": 1.27}
STOL = 256.0
WARSTWA = 0.2

def wczytaj(path):
    if path.endswith('.3mf'):
        z = zipfile.ZipFile(path); xml = z.read('3D/3dmodel.model').decode()
        unit = re.search(r'unit="([a-z]+)"', xml).group(1)
        v = np.array(re.findall(r'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"', xml), dtype=float)
        f = np.array(re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"', xml), dtype=np.int64)
        col = re.search(r'displaycolor="([^"]+)"', xml)
        m = trimesh.Trimesh(v, f, process=True)
        return m, {"unit": unit, "color": col.group(1) if col else None, "author_meta": bool(re.search(r'Designer|Author|Autor|Copyright', xml))}
    m = trimesh.load_mesh(path, process=True)
    hdr = open(path, 'rb').read(80)
    return m, {"stl_header": hdr.rstrip(b'\0').decode('ascii', 'replace'), "author_meta": b'Kolodziej' in hdr}

def warstwy(m):
    z0, z1 = m.bounds[0][2], m.bounds[1][2]
    hs = np.arange(z0 + WARSTWA / 2, z1, WARSTWA)
    secs = m.section_multiplane(plane_origin=[0, 0, 0], plane_normal=[0, 0, 1], heights=list(hs))
    prev = None; islands = []; over_area = 0.0; layer_area = []
    for h, s in zip(hs, secs):
        if s is None: polys = []
        else: polys = [p.buffer(0) for p in s.polygons_full]
        polys = [p for p in polys if p.area > 1e-4]
        cur = unary_union(polys) if polys else None
        if prev is not None and cur is not None:
            sup = prev.buffer(WARSTWA * math.tan(math.radians(45)), resolution=4)
            for p in polys:
                if not p.intersects(sup):
                    islands.append({"z": round(float(h), 2), "pole_mm2": round(p.area, 3), "xy": [round(c, 1) for c in p.representative_point().coords[0]]})
            over_area += cur.difference(sup).area
        layer_area.append(cur.area if cur is not None else 0)
        prev = cur
    return islands, over_area, layer_area

def sprawdz(path, material="PLA"):
    m, meta = wczytaj(path)
    comps = m.split(only_watertight=False)
    ext = m.extents
    r = {
        "plik": path, "trojkaty": int(len(m.faces)), "watertight": bool(m.is_watertight), "is_volume": bool(m.is_volume),
        "winding_consistent": bool(m.is_winding_consistent),
        "komponenty": sum(1 for c in comps if c.volume > 0), "pustki_wewnetrzne": sum(1 for c in comps if c.volume <= 0),
        "euler": int(m.euler_number),
        "wymiary_mm": [round(float(x), 2) for x in ext], "w_stole_P1S": bool(np.all(ext <= STOL)),
        "objetosc_cm3": round(float(m.volume) / 1000, 2), "masa_g": round(float(m.volume) / 1000 * GESTOSC[material], 1),
        "powierzchnia_cm2": round(float(m.area) / 100, 1), "z_min": round(float(m.bounds[0][2]), 3),
        "pole_kontaktu_ze_stolem_mm2": None, **meta,
    }
    # pole pierwszej warstwy
    s = m.section(plane_origin=[0, 0, m.bounds[0][2] + 0.1], plane_normal=[0, 0, 1])
    if s is not None:
        p2, _ = s.to_2D() if hasattr(s, 'to_2D') else s.to_planar()
        r["pole_kontaktu_ze_stolem_mm2"] = round(float(sum(p.area for p in p2.polygons_full)), 1)
    isl, over, la = warstwy(m)
    r["warstwy"] = len(la)
    r["wyspy_w_powietrzu"] = len(isl)
    r["wyspy_pole_mm2_suma"] = round(sum(i["pole_mm2"] for i in isl), 2)
    r["wyspy_lista"] = isl[:200]
    r["nawisy_ponad_45st_mm2"] = round(over, 1)
    # orientacyjny czas: 5 mm3/s + 4 s/warstwę
    r["czas_orientacyjny_min"] = round((m.volume / 5 + len(la) * 4) / 60)
    return r

if __name__ == "__main__":
    args = sys.argv[1:]; out = None
    if "--json" in args: i = args.index("--json"); out = args[i + 1]; args = args[:i] + args[i + 2:]
    res = [sprawdz(a) for a in args]
    for r in res:
        print(json.dumps({k: v for k, v in r.items() if k != "wyspy_lista"}, ensure_ascii=False))
    if out: json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
