# Statuetki 3D z ażurem - wersja testowa

Konfigurator ażurowych statuetek do druku FDM (Bambu Lab P1S, dysza 0,4 mm, stół 256 mm).
Geometria: pole SDF -> manifold-3d (WASM, levelSet) w Web Workerze, podgląd Three.js.
Eksport: binarny STL, 3MF i JSON z parametrami. Ten sam seed i parametry dają identyczny model.

Strona testowa: https://robs001b.github.io/statuetki-3d/

## Uruchomienie

```
npm install
npm run dev        # tryb deweloperski: http://localhost:5180/statuetki-3d/
npm run build      # wersja statyczna w dist/
npm run preview    # podgląd builda: http://127.0.0.1:5181/statuetki-3d/
```

Pliki do druku z linii poleceń (ten sam kod co w przeglądarce):

```
node scripts/gen.mjs serce-A '{"resolution":0.5}'
node scripts/gen.mjs serce-B '{"resolution":0.5,"line":"B","motif":"serce","motifSize":13}'
node scripts/test-shapes.mjs 0.7 wynik.json    # test wszystkich kształtów, linie A i B
```

Niezależna kontrola plików (Python): `pip install trimesh shapely scipy rtree networkx manifold3d`,
potem `python weryfikacja/weryfikuj.py plik.stl` (szczelność, komponenty, wymiary, wyspy na warstwach 0,2 mm, nawisy).

## Struktura

- `index.html`, `src/main.js`, `src/style.css` - interfejs, podgląd, przekrój, eksport
- `src/worker.js` - Web Worker z manifold-3d
- `src/geom/engine.js` - potok geometrii, walidacja P1S, szacunki masy i czasu
- `src/geom/shapes.js` - katalog kształtów (SDF), presety
- `src/geom/lattice.js` - ażur linii A (Voronoi, gyroid, low-poly, kontury, spirala)
- `src/geom/motifs.js`, `src/geom/motifcells.js` - linia B: motywy i metoda "medalion w oknie"
- `src/geom/roof.js` - samonośne wnętrze "dach 45°" (bez podpór w środku)
- `src/geom/sdf.js`, `prng.js`, `export.js` - prymitywy SDF, deterministyczny PRNG, STL/3MF/JSON

## Linia B - medalion w oknie, automatyczne zmniejszanie motywu

Motyw jest pełnym kształtem w oknie (szczelina 3,4 mm, żebro ramki), rysowanym w płaszczyźnie stycznej.
Raster 0,1 mm usuwa elementy cieńsze niż 1,2 mm, zamyka prześwity węższe niż 3 mm, a skan warstw dokłada
pionowe łączniki pod czubkami i nawisami. Przy włączonym "Automatycznym zmniejszaniu motywu" okna stawiane
są kolejno od rozmiaru nominalnego (np. 13 mm) do minimum (domyślnie 8,5 mm): najpierw duże w płaskich
miejscach, potem mniejsze, z progiem krzywizny zależnym od rozmiaru. W pełnym wypełnieniu okno idzie na
wylot przód-tył albo jest niszą z medalionem na dnie.

Wdrożenie: gałąź `gh-pages` zawiera zbudowany `dist/` (npm run build), publikowany przez GitHub Pages.
