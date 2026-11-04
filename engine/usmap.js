/*
 * usmap.js — US county/state map engine for the us-map-kit.
 * ------------------------------------------------------------------
 * One global, `USMap`. Build any county- or state-keyed map on it:
 *
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"></script>
 *   <script src="engine/maplibre-css.js"></script>
 *   <script src="engine/usmap.js"></script>
 *
 *   const m = await USMap.create({ container: '#map', dataRoot: 'data/' });
 *   m.on('county:click', e => console.log(e.fips, e.county.name));
 *   m.setCountyValues({ '48453': 0.62, '48491': 0.41 }, { scale: USMap.scale.diverging([0, 0.5, 1], USMap.palettes.redBlue) });
 *
 * Everything is keyed by FIPS code as a 5-digit STRING ('48453'), states by
 * 2-digit FIPS ('48'). Full API in docs/ENGINE.md. Data layout in docs/DATA.md.
 *
 * Depends on globals: maplibregl (4.x), topojson (topojson-client 3.x).
 */
(function (global) {
  'use strict';
  const VERSION = '1.0.0';

  /* ------------------------------------------------------------------ */
  /* Themes: every colour the basemap uses, in one place per theme.      */
  /* Apps may register more with USMap.themes.custom = {...}.            */
  /* ------------------------------------------------------------------ */
  const THEMES = {
    'atlas-light': {
      land: '#f1efe8', water: '#b7d0e3', waterLine: '#95b9d6', waterLabel: '#3b6f94',
      urban: '#e4ded2', nation: '#4f4a40', state: '#5f594d', county: '#b3ad9f',
      countyFill: 'rgba(0,0,0,0)', hover: 'rgba(40,36,30,0.10)', select: '#2b6cb0',
      iFill: '#d84a3e', iCase: '#7d1f17', uFill: '#f3b73f', uCase: '#8d5c0c',
      sFill: '#fff3c4', sCase: '#a1956a', oFill: '#ffffff', oCase: '#c7c1b2', unpaved: '#b8b2a3',
      label: '#2a2722', labelMuted: '#6a645a', halo: '#f1efe8', countyLabel: '#7a7366',
      cityDot: '#2a2722', cityDotRing: '#f1efe8',
    },
    'atlas-dark': {
      land: '#1b1e22', water: '#0f2434', waterLine: '#1f4b6b', waterLabel: '#7fb0d6',
      urban: '#24282e', nation: '#c9ccd2', state: '#9ca2ab', county: '#3c4149',
      countyFill: 'rgba(0,0,0,0)', hover: 'rgba(255,255,255,0.10)', select: '#7cb2ff',
      iFill: '#ff6f63', iCase: '#4a1612', uFill: '#f4bb45', uCase: '#4d350a',
      sFill: '#6b644e', sCase: '#2d2a22', oFill: '#3b4049', oCase: '#23272d', unpaved: '#3a3f47',
      label: '#ecebe4', labelMuted: '#a7a59d', halo: '#1b1e22', countyLabel: '#8e9298',
      cityDot: '#ecebe4', cityDotRing: '#1b1e22',
    },
  };

  /* ------------------------------------------------------------------ */
  /* Colour scales and palettes for thematic (choropleth) layers.        */
  /* ------------------------------------------------------------------ */
  const PALETTES = {
    // political: Republican red <-> Democratic blue (diverging)
    redBlue: ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'],
    blueRed: ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'],
    // sequential
    teal: ['#e6f2ef', '#bfe0d8', '#8fcbbd', '#5db19f', '#2f9682', '#157766', '#0b574b'],
    amber: ['#fdf3dc', '#f8dfa4', '#f0c56d', '#e2a63f', '#c7841f', '#9f6210', '#704306'],
    purple: ['#f0ecf7', '#d7cde9', '#b9a8d8', '#9a82c6', '#7a5db1', '#5a3c95', '#3c2270'],
    grey: ['#f2f1ee', '#d9d7d1', '#bebcb4', '#9f9d95', '#7f7d76', '#5e5c56', '#3c3b37'],
    // categorical (parties, winners, categories) — colourblind-safe-ish
    party: { D: '#2f6fc4', R: '#d2382d', I: '#7b5ea7', G: '#3f9d4a', L: '#e6b12e', O: '#8a8780' },
    categorical: ['#2f6fc4', '#d2382d', '#e6b12e', '#3f9d4a', '#7b5ea7', '#d77a2d', '#2aa0a8', '#8a8780'],
  };

  function hexToRgb(h) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function interpolatePalette(colors, t) {
    t = Math.max(0, Math.min(1, t));
    const n = colors.length - 1, i = Math.min(n - 1, Math.floor(t * n));
    return mix(colors[i], colors[i + 1], t * n - i);
  }
  const scale = {
    /** Continuous sequential: domain [min,max] -> palette */
    sequential(domain, colors) {
      const [a, b] = domain;
      const f = v => (v == null || isNaN(v)) ? null : interpolatePalette(colors, (v - a) / (b - a || 1));
      f.kind = 'sequential'; f.domain = domain; f.colors = colors; return f;
    },
    /** Continuous diverging: domain [min, mid, max] -> palette (mid maps to the palette centre) */
    diverging(domain, colors) {
      const [a, m, b] = domain;
      const f = v => {
        if (v == null || isNaN(v)) return null;
        const t = v < m ? 0.5 * (v - a) / (m - a || 1) : 0.5 + 0.5 * (v - m) / (b - m || 1);
        return interpolatePalette(colors, t);
      };
      f.kind = 'diverging'; f.domain = domain; f.colors = colors; return f;
    },
    /** Classed (quantized) scale: breaks [b1,b2,...] -> colors[0..n] */
    threshold(breaks, colors) {
      const f = v => {
        if (v == null || isNaN(v)) return null;
        let i = 0; while (i < breaks.length && v >= breaks[i]) i++;
        return colors[Math.min(i, colors.length - 1)];
      };
      f.kind = 'threshold'; f.breaks = breaks; f.colors = colors; return f;
    },
    /** Categorical: map of category -> colour */
    categorical(mapping, fallback) {
      const f = v => (v == null ? null : (mapping[v] || fallback || null));
      f.kind = 'categorical'; f.mapping = mapping; return f;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Small utilities                                                      */
  /* ------------------------------------------------------------------ */
  const pad5 = id => String(id).padStart(5, '0');
  const fmtInt = n => Number(n).toLocaleString('en-US');
  function emitter() {
    const h = {};
    return {
      on(ev, fn) { (h[ev] = h[ev] || []).push(fn); return () => this.off(ev, fn); },
      off(ev, fn) { h[ev] = (h[ev] || []).filter(f => f !== fn); },
      emit(ev, data) { (h[ev] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(e); } }); },
    };
  }
  async function fetchJSON(url, onProgress) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
    const total = +r.headers.get('content-length') || 0;
    if (!r.body || !onProgress || !total) return r.json();
    const reader = r.body.getReader(); const chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got / total); }
    const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
    return JSON.parse(new TextDecoder().decode(buf));
  }
  function bboxOf(geom) {
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    const walk = c => { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; } else c.forEach(walk); };
    if (geom && geom.coordinates) walk(geom.coordinates);
    return [x0, y0, x1, y1];
  }
  function injectCSS() {
    if (document.getElementById('usmap-maplibre-css')) return;
    const s = document.createElement('style'); s.id = 'usmap-maplibre-css';
    s.textContent = (global.__MAPLIBRE_CSS || '') + `
      .usmap-tooltip{position:absolute;pointer-events:none;z-index:5;transform:translate(14px,14px);max-width:260px;font:13px/1.35 system-ui,sans-serif;opacity:0;transition:opacity .08s}
      .usmap-tooltip.on{opacity:1}
      .usmap-legend{font:12px/1.3 system-ui,sans-serif}
      .usmap-legend .t{font-weight:600;margin-bottom:6px}
      .usmap-legend .ramp{height:10px;border-radius:3px;background:linear-gradient(90deg,var(--ramp))}
      .usmap-legend .ends{display:flex;justify-content:space-between;margin-top:3px;font-variant-numeric:tabular-nums}
      .usmap-legend .row{display:flex;align-items:center;gap:7px;margin:3px 0}
      .usmap-legend .sw{width:14px;height:14px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.15)}
      .maplibregl-ctrl-group{box-shadow:0 1px 3px rgba(0,0,0,.18)}`;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* Route shields, drawn once on canvas and registered as images.       */
  /* ------------------------------------------------------------------ */
  function drawShields(map) {
    const R = 2; // pixel ratio
    const make = (w, h, draw) => {
      const c = document.createElement('canvas'); c.width = w * R; c.height = h * R;
      const g = c.getContext('2d'); g.scale(R, R); draw(g, w, h);
      return { data: g.getImageData(0, 0, c.width, c.height), w, h };
    };
    const add = (name, img, content, stretchX) => {
      if (map.hasImage(name)) return;
      // content / stretch boxes are in image pixels (already scaled by R), not CSS pixels
      map.addImage(name, { width: img.data.width, height: img.data.height, data: img.data.data },
        { pixelRatio: R, content: content.map(v => v * R), stretchX: stretchX.map(([a, b]) => [a * R, b * R]), stretchY: [[8 * R, (img.h - 8) * R]] });
    };
    // Interstate: red band over blue field, shield outline
    const interstate = (g, w, h) => {
      const path = () => { g.beginPath(); g.moveTo(3, 3); g.lineTo(w - 3, 3); g.quadraticCurveTo(w - 3, h * .62, w / 2, h - 2); g.quadraticCurveTo(3, h * .62, 3, 3); g.closePath(); };
      path(); g.fillStyle = '#fff'; g.fill();
      g.save(); path(); g.clip(); g.fillStyle = '#1f4f9d'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0362c'; g.fillRect(0, 0, w, 8); g.restore();
      path(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
    };
    // US highway: white shield, black outline
    const us = (g, w, h) => {
      g.beginPath(); g.moveTo(4, 3); g.lineTo(w - 4, 3); g.lineTo(w - 3, 8); g.quadraticCurveTo(w - 3, h * .7, w / 2, h - 2); g.quadraticCurveTo(3, h * .7, 3, 8); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#222'; g.stroke();
    };
    // State route: white rounded box, dark outline
    const state = (g, w, h) => {
      const r = 4; g.beginPath(); g.moveTo(3 + r, 3); g.lineTo(w - 3 - r, 3); g.quadraticCurveTo(w - 3, 3, w - 3, 3 + r); g.lineTo(w - 3, h - 3 - r); g.quadraticCurveTo(w - 3, h - 3, w - 3 - r, h - 3); g.lineTo(3 + r, h - 3); g.quadraticCurveTo(3, h - 3, 3, h - 3 - r); g.lineTo(3, 3 + r); g.quadraticCurveTo(3, 3, 3 + r, 3); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#3a3a3a'; g.stroke();
    };
    add('shield-I', make(30, 28, interstate), [6, 9, 24, 22], [[12, 18]]);
    add('shield-U', make(30, 28, us), [6, 6, 24, 20], [[12, 18]]);
    add('shield-S', make(28, 24, state), [5, 5, 23, 19], [[11, 17]]);
    // city markers
    const dot = (ring, fill) => (g, w, h) => { g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); g.fillStyle = ring; g.fill(); g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 3.2, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
    const star = (ring, fill) => (g, w, h) => {
      const cx = w / 2, cy = h / 2, R1 = w / 2 - 1, R2 = R1 * .45; g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? R2 : R1, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = ring; g.stroke();
    };
    const img = (name, w, h, fn) => { if (!map.hasImage(name)) { const i = make(w, h, fn); map.addImage(name, { width: i.data.width, height: i.data.height, data: i.data.data }, { pixelRatio: R }); } };
    img('city-dot-light', 12, 12, dot('#f1efe8', '#2a2722')); img('city-dot-dark', 12, 12, dot('#1b1e22', '#ecebe4'));
    img('capital-light', 16, 16, star('#2a2722', '#fff')); img('capital-dark', 16, 16, star('#ecebe4', '#1b1e22'));
  }

  /* ------------------------------------------------------------------ */
  /* Layer definitions as functions of the theme T.                      */
  /* ------------------------------------------------------------------ */
  const Z = (...stops) => ['interpolate', ['exponential', 1.6], ['zoom'], ...stops];
  function roadWidth(cls, isCasing) {
    // widths by class at zoom 4 / 7 / 10 / 14
    const w = { I: [0.9, 2.0, 4, 10], U: [0.6, 1.4, 3, 8], S: [0.5, 1.0, 2.4, 6], O: [0.3, 0.7, 1.6, 4.5] }[cls];
    const c = isCasing ? [1.4, 1.6, 2, 3] : [0, 0, 0, 0];
    return Z(4, w[0] + c[0], 7, w[1] + c[1], 10, w[2] + c[2], 14, w[3] + c[3]);
  }
  function layerDefs(T, dark) {
    const sfx = dark ? 'dark' : 'light';
    const text = { 'text-color': T.label, 'text-halo-color': T.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
    const cityTier = (id, minzoom, filter, size, font) => ([
      { id: `city-dot-${id}`, type: 'symbol', source: 'cities', minzoom, filter, layout: { 'icon-image': ['case', ['==', ['get', 'tier'], 'C'], `capital-${sfx}`, `city-dot-${sfx}`], 'icon-size': ['case', ['==', ['get', 'tier'], 'C'], 0.8, size.dot], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 'pop']] }, paint: {} },
      { id: `city-label-${id}`, type: 'symbol', source: 'cities', minzoom, filter, layout: { 'text-field': ['get', 'name'], 'text-font': [font], 'text-size': size.text, 'text-anchor': 'left', 'text-offset': [0.6, 0], 'text-max-width': 9, 'symbol-sort-key': ['-', 0, ['get', 'pop']], 'text-padding': 3, 'text-optional': false }, paint: text },
    ]);
    const big = ['any', ['>=', ['get', 'pop'], 500000], ['==', ['get', 'tier'], 'C']];
    return [
      { id: 'urban', type: 'fill', source: 'urban', paint: { 'fill-color': T.urban, 'fill-opacity': Z(4, 0.35, 9, 0.8) } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': T.water } },
      { id: 'lakes-line', type: 'line', source: 'lakes', paint: { 'line-color': T.waterLine, 'line-width': Z(4, 0.3, 10, 1.2) } },
      { id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': T.waterLine, 'line-width': Z(4, 0.4, 10, 1.8), 'line-opacity': 0.9 } },
      { id: 'county-fill', type: 'fill', source: 'counties', 'source-layer': undefined, paint: {
          'fill-color': ['coalesce', ['feature-state', 'color'], T.countyFill],
          'fill-opacity': ['coalesce', ['feature-state', 'opacity'], 0.72] } },
      { id: 'county-hover', type: 'fill', source: 'counties', paint: { 'fill-color': T.hover, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0] } },
      { id: 'county-line', type: 'line', source: 'counties', paint: { 'line-color': T.county, 'line-width': Z(3, 0.15, 6, 0.5, 10, 1.1, 14, 2), 'line-opacity': Z(3, 0.5, 6, 1) } },
      { id: 'county-select', type: 'line', source: 'counties', paint: { 'line-color': T.select, 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0] } },
      { id: 'state-line', type: 'line', source: 'states', paint: { 'line-color': T.state, 'line-width': Z(3, 0.7, 6, 1.4, 10, 2.6), 'line-opacity': 0.9 } },
      { id: 'nation-line', type: 'line', source: 'nation', paint: { 'line-color': T.nation, 'line-width': Z(3, 0.8, 8, 1.8) } },
      // roads: minor first (under), then major. Casings before fills.
      { id: 'road-unpaved', type: 'line', source: 'roads-minor', filter: ['==', ['get', 't'], 'u'], minzoom: 8, paint: { 'line-color': T.unpaved, 'line-width': roadWidth('O', false), 'line-dasharray': [3, 2] } },
      { id: 'road-minor-case', type: 'line', source: 'roads-minor', filter: ['!=', ['get', 't'], 'u'], minzoom: 7.5, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.oCase, 'line-width': roadWidth('O', true) } },
      { id: 'road-minor', type: 'line', source: 'roads-minor', filter: ['!=', ['get', 't'], 'u'], minzoom: 7.5, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.oFill, 'line-width': roadWidth('O', false) } },
      { id: 'road-state-case', type: 'line', source: 'roads-major', filter: ['==', ['get', 'c'], 'S'], minzoom: 6.2, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.sCase, 'line-width': roadWidth('S', true) } },
      { id: 'road-state', type: 'line', source: 'roads-major', filter: ['==', ['get', 'c'], 'S'], minzoom: 6.2, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.sFill, 'line-width': roadWidth('S', false) } },
      { id: 'road-us-case', type: 'line', source: 'roads-major', filter: ['==', ['get', 'c'], 'U'], minzoom: 5, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.uCase, 'line-width': roadWidth('U', true) } },
      { id: 'road-us', type: 'line', source: 'roads-major', filter: ['==', ['get', 'c'], 'U'], minzoom: 5, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.uFill, 'line-width': roadWidth('U', false) } },
      { id: 'road-i-case', type: 'line', source: 'roads-major', filter: ['==', ['get', 'c'], 'I'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.iCase, 'line-width': roadWidth('I', true) } },
      { id: 'road-i', type: 'line', source: 'roads-major', filter: ['==', ['get', 'c'], 'I'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': T.iFill, 'line-width': roadWidth('I', false) } },
      { id: 'road-shield', type: 'symbol', source: 'roads-major', minzoom: 6, filter: ['all', ['!=', ['get', 'n'], ''], ['!=', ['get', 'c'], 'O']],
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'icon-image': ['concat', 'shield-', ['get', 'c']], 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 4, 2, 4], 'icon-rotation-alignment': 'viewport', 'text-rotation-alignment': 'viewport', 'text-field': ['get', 'n'], 'text-font': ['Overpass Bold'], 'text-size': 10, 'text-letter-spacing': 0.02, 'symbol-sort-key': ['get', 's'], 'icon-padding': 6, 'text-padding': 6, 'text-offset': [0, 0.12] },
        paint: { 'text-color': ['match', ['get', 'c'], 'I', '#ffffff', '#1a1a1a'] } },
      { id: 'water-label', type: 'symbol', source: 'lakes', minzoom: 5, filter: ['!=', ['get', 'n'], ''], layout: { 'text-field': ['get', 'n'], 'text-font': ['Overpass Italic'], 'text-size': Z(5, 10, 10, 14), 'symbol-placement': 'point' }, paint: { 'text-color': T.waterLabel, 'text-halo-color': T.water, 'text-halo-width': 1 } },
      { id: 'county-label', type: 'symbol', source: 'county-points', minzoom: 7, layout: { 'text-field': ['get', 'name'], 'text-font': ['Overpass Regular'], 'text-size': Z(7, 9.5, 11, 13), 'text-transform': 'uppercase', 'text-letter-spacing': 0.14, 'text-max-width': 8, 'text-padding': 8 }, paint: { 'text-color': T.countyLabel, 'text-halo-color': T.halo, 'text-halo-width': 1.2 } },
      // smallest places first: MapLibre places symbols from the top layer down, so big cities (added last) win collisions
      ...cityTier('5', 9, ['<', ['get', 'pop'], 5000], { dot: 0.5, text: 11 }, 'Overpass Regular'),
      ...cityTier('4', 7.6, ['all', ['<', ['get', 'pop'], 25000], ['>=', ['get', 'pop'], 5000]], { dot: 0.6, text: Z(7, 10, 11, 13) }, 'Overpass Regular'),
      ...cityTier('3', 6.2, ['all', ['<', ['get', 'pop'], 100000], ['>=', ['get', 'pop'], 25000]], { dot: 0.7, text: Z(6, 10, 10, 14) }, 'Overpass Regular'),
      ...cityTier('2', 4.6, ['all', ['!', big], ['>=', ['get', 'pop'], 100000]], { dot: 0.8, text: Z(4, 10.5, 9, 15) }, 'Overpass SemiBold'),
      ...cityTier('1', 3, big, { dot: 0.9, text: Z(3, 11, 8, 16) }, 'Overpass SemiBold'),
      { id: 'state-label', type: 'symbol', source: 'state-points', maxzoom: 7, layout: { 'text-field': ['get', 'abbr'], 'text-font': ['Overpass Bold'], 'text-size': Z(3, 11, 6, 18), 'text-letter-spacing': 0.1, 'text-allow-overlap': false }, paint: { 'text-color': T.labelMuted, 'text-halo-color': T.halo, 'text-halo-width': 1.5, 'text-opacity': 0.9 } },
    ];
  }

  /* ------------------------------------------------------------------ */
  /* create()                                                             */
  /* ------------------------------------------------------------------ */
  async function create(opts = {}) {
    if (!global.maplibregl) throw new Error('usmap.js needs maplibre-gl loaded first');
    if (!global.topojson) throw new Error('usmap.js needs topojson-client loaded first');
    injectCSS();
    const o = Object.assign({
      container: '#map', dataRoot: 'data/', theme: 'auto', states: '50dc',
      layers: { urban: true, water: true, roads: 'all', cities: true, countyLabels: true, stateLabels: true },
      interactive: true, tooltip: null, onProgress: null, minZoom: 2.6, maxZoom: 15,
      bounds: [[-125.5, 24.2], [-66.5, 49.6]], fitPadding: 20, navControl: true,
      glyphs: 'fonts/{fontstack}/{range}.pbf',   // relative to dataRoot; some hosts need another extension (see docs/ARCHITECTURE.md)
    }, opts);
    o.layers = Object.assign({ urban: true, water: true, roads: 'all', cities: true, countyLabels: true, stateLabels: true }, opts.layers || {});
    const root = o.dataRoot.endsWith('/') ? o.dataRoot : o.dataRoot + '/';
    const base = new URL(root, document.baseURI).href;
    const abs = p => base + p;   // string concat: URL() would percent-encode the {fontstack}/{range} braces
    const ev = emitter();
    const progress = (stage, pct) => { if (o.onProgress) o.onProgress(stage, pct); ev.emit('progress', { stage, pct }); };

    // -- theme resolution (auto follows the document / OS) --------------
    const prefersDark = () => (document.documentElement.dataset.theme === 'dark') || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    let themeName = o.theme === 'auto' ? (prefersDark() ? 'atlas-dark' : 'atlas-light') : o.theme;
    const T = () => THEMES[themeName] || THEMES['atlas-light'];
    const isDark = () => /dark/.test(themeName);

    // -- load the small, essential data first -------------------------
    progress('counties', 0);
    const [topo, index, cities] = await Promise.all([
      fetchJSON(abs('counties.topo.json'), p => progress('counties', p)),
      fetchJSON(abs('counties-index.json')),
      o.layers.cities ? fetchJSON(abs('cities.json')) : null,
    ]);
    const counties = topojson.feature(topo, topo.objects.counties);
    const states = topojson.feature(topo, topo.objects.states);
    const nation = topojson.feature(topo, topo.objects.nation);
    const limit50 = o.states === '50dc';
    const stateSet = Array.isArray(o.states) ? new Set(o.states) : null;
    const keep = fips => stateSet ? stateSet.has(fips.slice(0, 2)) : (limit50 ? fips.slice(0, 2) <= '56' : true);
    counties.features = counties.features.filter(f => keep(f.id));
    states.features = states.features.filter(f => keep(f.id + '000'));
    // numeric ids for feature-state, bboxes for flyTo
    const bbox = {}; const stateBbox = {};
    counties.features.forEach(f => { f.properties.fips = f.id; bbox[f.id] = bboxOf(f.geometry); f.id = +f.id; });
    states.features.forEach(f => { f.properties.fips = f.id; stateBbox[f.id] = bboxOf(f.geometry); f.id = +f.id; });

    // index: fips -> county record
    const idx = { counties: new Map(), states: new Map(), byState: new Map(), cities: [] };
    for (const [fips, s] of Object.entries(index.states)) if (keep(fips + '000')) idx.states.set(fips, { fips, ...s, counties: [] });
    for (const [fips, r] of Object.entries(index.counties)) {
      if (!keep(fips)) continue;
      const st = idx.states.get(r[1]);
      const rec = { fips, name: r[0], state: r[1], stateAbbr: st ? st.abbr : r[1], stateName: st ? st.name : r[1], lon: r[2], lat: r[3], areaSqMi: r[4], bbox: bbox[fips] || null };
      idx.counties.set(fips, rec); if (st) st.counties.push(fips);
    }
    const countyPoints = { type: 'FeatureCollection', features: [...idx.counties.values()].filter(c => c.lon != null).map(c => ({ type: 'Feature', id: +c.fips, properties: { name: c.name, fips: c.fips }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) };
    const statePoints = { type: 'FeatureCollection', features: [...idx.states.values()].filter(s => s.lon != null).map(s => ({ type: 'Feature', properties: { abbr: s.abbr, name: s.name, fips: s.fips }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) };
    let cityFC = { type: 'FeatureCollection', features: [] };
    if (cities) {
      idx.cities = cities.rows.map((r, i) => ({ name: r[0], st: r[1], lat: r[2], lon: r[3], pop: r[4], tier: r[5], fips: r[6], rank: i }));
      cityFC.features = idx.cities.map(c => ({ type: 'Feature', id: c.rank, properties: { name: c.name, st: c.st, pop: c.pop, tier: c.tier, fips: c.fips }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }));
    }
    const empty = { type: 'FeatureCollection', features: [] };

    // -- the map --------------------------------------------------------
    const container = typeof o.container === 'string' ? document.querySelector(o.container) : o.container;
    const map = new maplibregl.Map({
      container, attributionControl: false, minZoom: o.minZoom, maxZoom: o.maxZoom, maxPitch: 0, dragRotate: false, touchPitch: false, preserveDrawingBuffer: !!o.preserveDrawingBuffer,
      style: {
        version: 8, glyphs: abs(o.glyphs),
        sources: {
          counties: { type: 'geojson', data: counties }, states: { type: 'geojson', data: states }, nation: { type: 'geojson', data: nation },
          'county-points': { type: 'geojson', data: countyPoints }, 'state-points': { type: 'geojson', data: statePoints },
          cities: { type: 'geojson', data: cityFC }, urban: { type: 'geojson', data: empty }, lakes: { type: 'geojson', data: empty },
          rivers: { type: 'geojson', data: empty }, 'roads-major': { type: 'geojson', data: empty, tolerance: 0.3 }, 'roads-minor': { type: 'geojson', data: empty, tolerance: 0.35 },
        },
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': T().land } }],
      },
      bounds: o.bounds, fitBoundsOptions: { padding: o.fitPadding },
    });
    map.touchZoomRotate.disableRotation();
    if (o.navControl) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Boundaries: U.S. Census · Roads/water: Natural Earth · Places: GeoNames (CC BY)' }), 'bottom-left');

    await new Promise(res => map.once('load', res));
    drawShields(map);
    let defs = layerDefs(T(), isDark());
    const hide = new Set();
    if (!o.layers.urban) hide.add('urban');
    if (!o.layers.water) ['lakes', 'lakes-line', 'rivers', 'water-label'].forEach(h => hide.add(h));
    if (!o.layers.roads) defs.filter(d => d.id.startsWith('road-')).forEach(d => hide.add(d.id));
    if (!o.layers.countyLabels) hide.add('county-label');
    if (!o.layers.stateLabels) hide.add('state-label');
    for (const d of defs) { const def = JSON.parse(JSON.stringify(d)); if (hide.has(d.id)) { def.layout = def.layout || {}; def.layout.visibility = 'none'; } map.addLayer(def); }

    // -- lazy basemap layers (map is usable before these arrive) --------
    const loadTopo = async (file, source, stage) => {
      try {
        const t = await fetchJSON(abs(file), p => progress(stage, p));
        const obj = t.objects[Object.keys(t.objects)[0]];
        map.getSource(source).setData(topojson.feature(t, obj));
        ev.emit('layer:loaded', { layer: source });
      } catch (e) { console.warn('usmap: could not load', file, e); ev.emit('layer:error', { layer: source, error: e }); }
    };
    const lazy = [];
    if (o.layers.water) lazy.push(loadTopo('lakes.topo.json', 'lakes', 'water'), loadTopo('rivers.topo.json', 'rivers', 'water'));
    if (o.layers.urban) lazy.push(loadTopo('urban.topo.json', 'urban', 'urban'));
    if (o.layers.roads) lazy.push(loadTopo('roads-major.topo.json', 'roads-major', 'roads').then(() => o.layers.roads === 'all' ? loadTopo('roads-minor.topo.json', 'roads-minor', 'roads-minor') : null));
    Promise.all(lazy).then(() => { progress('done', 1); ev.emit('basemap:complete'); });

    // -- interaction ----------------------------------------------------
    let hoverId = null, selId = null;
    const county = id => idx.counties.get(pad5(id));
    const tip = document.createElement('div'); tip.className = 'usmap-tooltip'; container.appendChild(tip);
    const setHover = id => {
      if (hoverId === id) return;
      if (hoverId != null) map.setFeatureState({ source: 'counties', id: hoverId }, { hover: false });
      hoverId = id;
      if (hoverId != null) map.setFeatureState({ source: 'counties', id: hoverId }, { hover: true });
    };
    const hit = e => { const f = map.queryRenderedFeatures(e.point, { layers: ['county-fill'] })[0]; return f ? f.id : null; };
    if (o.interactive) {
      map.on('mousemove', e => {
        const id = hit(e); setHover(id);
        map.getCanvas().style.cursor = id != null ? 'pointer' : '';
        if (id != null) {
          const c = county(id); ev.emit('county:hover', { fips: c.fips, county: c, lngLat: e.lngLat, point: e.point, originalEvent: e.originalEvent });
          if (o.tooltip) { const html = o.tooltip(c, e); if (html) { tip.innerHTML = html; tip.style.left = e.point.x + 'px'; tip.style.top = e.point.y + 'px'; tip.classList.add('on'); } else tip.classList.remove('on'); }
        } else { tip.classList.remove('on'); ev.emit('county:leave', {}); }
      });
      map.on('mouseout', () => { setHover(null); tip.classList.remove('on'); });
      map.on('click', e => {
        const id = hit(e); if (id == null) { ev.emit('map:click', { lngLat: e.lngLat }); return; }
        const c = county(id); ev.emit('county:click', { fips: c.fips, county: c, lngLat: e.lngLat, point: e.point, originalEvent: e.originalEvent });
      });
    }

    // -- public instance -------------------------------------------------
    const inst = {
      map, index: idx, theme: () => themeName, version: VERSION,
      on: ev.on.bind(ev), off: ev.off.bind(ev),
      /** county(fips) -> record or undefined */
      county: fips => idx.counties.get(pad5(fips)),
      state: fips => idx.states.get(String(fips).padStart(2, '0')),
      /** Set a thematic colour per county. values: {fips: number|string} or Map. opts.scale: a USMap.scale fn; opts.opacity */
      setCountyValues(values, opt = {}) {
        const sc = opt.scale || scale.sequential([0, 1], PALETTES.teal);
        const entries = values instanceof Map ? values : Object.entries(values);
        for (const [fips, v] of entries) {
          const c = idx.counties.get(pad5(fips)); if (!c) continue;
          const color = typeof sc === 'function' ? sc(v) : null;
          map.setFeatureState({ source: 'counties', id: +c.fips }, { color: color, value: v, opacity: opt.opacity != null ? opt.opacity : (color ? 0.72 : 0) });
        }
        if (opt.clearOthers) for (const c of idx.counties.values()) if (!(c.fips in values)) map.setFeatureState({ source: 'counties', id: +c.fips }, { color: null, value: null, opacity: null });
      },
      /** Explicit colour per county: {fips: cssColor} */
      setCountyColors(colors, opacity) {
        for (const [fips, color] of Object.entries(colors)) { const c = idx.counties.get(pad5(fips)); if (c) map.setFeatureState({ source: 'counties', id: +c.fips }, { color: color || null, opacity: color ? (opacity != null ? opacity : 0.72) : 0 }); }
      },
      clearCountyValues() { for (const c of idx.counties.values()) map.setFeatureState({ source: 'counties', id: +c.fips }, { color: null, value: null, opacity: null }); },
      /** arbitrary feature-state merge on one county */
      setCountyState(fips, state) { const c = idx.counties.get(pad5(fips)); if (c) map.setFeatureState({ source: 'counties', id: +c.fips }, state); },
      getCountyState(fips) { const c = idx.counties.get(pad5(fips)); return c ? map.getFeatureState({ source: 'counties', id: +c.fips }) : null; },
      /** Replace the county-fill colour expression (advanced; expressions may use ['feature-state', ...]) */
      setCountyPaint(colorExpr, opacityExpr) { map.setPaintProperty('county-fill', 'fill-color', colorExpr); if (opacityExpr !== undefined) map.setPaintProperty('county-fill', 'fill-opacity', opacityExpr); },
      /** State-level thematic colouring via the states source (adds a fill layer on first use) */
      setStateColors(colors, opacity) {
        if (!map.getLayer('state-fill')) map.addLayer({ id: 'state-fill', type: 'fill', source: 'states', paint: { 'fill-color': ['coalesce', ['feature-state', 'color'], 'rgba(0,0,0,0)'], 'fill-opacity': ['coalesce', ['feature-state', 'opacity'], 0] } }, 'county-fill');
        for (const [fips, color] of Object.entries(colors)) map.setFeatureState({ source: 'states', id: +fips }, { color: color || null, opacity: color ? (opacity != null ? opacity : 0.6) : 0 });
      },
      select(fips) { if (selId != null) map.setFeatureState({ source: 'counties', id: selId }, { sel: false }); selId = fips == null ? null : +pad5(fips); if (selId != null) map.setFeatureState({ source: 'counties', id: selId }, { sel: true }); },
      flyToCounty(fips, opt = {}) { const c = idx.counties.get(pad5(fips)); if (!c) return; if (c.bbox) map.fitBounds([[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]]], Object.assign({ padding: 60, maxZoom: 11, duration: 900 }, opt)); else map.flyTo({ center: [c.lon, c.lat], zoom: 10 }); },
      flyToState(fips, opt = {}) { const b = stateBbox[String(fips).padStart(2, '0')]; if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], Object.assign({ padding: 40, duration: 900 }, opt)); },
      flyToCity(city, opt = {}) { map.flyTo(Object.assign({ center: [city.lon, city.lat], zoom: 10, duration: 900 }, opt)); },
      fitUS(opt = {}) { map.fitBounds(o.bounds, Object.assign({ padding: o.fitPadding, duration: 700 }, opt)); },
      fitCounties(fipsList, opt = {}) {
        let x0 = 180, y0 = 90, x1 = -180, y1 = -90, n = 0;
        for (const f of fipsList) { const c = idx.counties.get(pad5(f)); if (!c || !c.bbox) continue; n++; x0 = Math.min(x0, c.bbox[0]); y0 = Math.min(y0, c.bbox[1]); x1 = Math.max(x1, c.bbox[2]); y1 = Math.max(y1, c.bbox[3]); }
        if (n) map.fitBounds([[x0, y0], [x1, y1]], Object.assign({ padding: 40, duration: 900 }, opt));
      },
      /** Search counties and cities. Returns [{kind:'county'|'city', label, sub, fips?, city?, lon, lat}] */
      search(q, opt = {}) {
        q = (q || '').trim().toLowerCase(); if (!q) return [];
        const limit = opt.limit || 12; const out = [];
        const norm = s => s.toLowerCase().replace(/\s+county$|\s+parish$|\s+borough$/i, '').trim();
        const [qname, qst] = q.split(/,\s*/);
        const qn = norm(qname);
        const score = (name, st, abbr) => { const n = name.toLowerCase(); let s = n === qn ? 100 : n.startsWith(qn) ? 80 : n.includes(qn) ? 50 : 0; if (!s) return 0; if (qst) { if (!(abbr.toLowerCase() === qst || st.toLowerCase().startsWith(qst))) return 0; s += 10; } return s; };
        if (opt.counties !== false) for (const c of idx.counties.values()) { const s = score(c.name, c.stateName, c.stateAbbr); if (s) out.push({ kind: 'county', score: s, label: c.name, sub: `County · ${c.stateAbbr}`, fips: c.fips, county: c, lon: c.lon, lat: c.lat }); }
        if (opt.cities !== false) for (const c of idx.cities) { const s = score(c.name, c.st, c.st); if (s) { const cty = c.fips && idx.counties.get(c.fips); out.push({ kind: 'city', score: s - 5 + Math.min(10, 1.5 * Math.log10(c.pop + 1)), label: c.name, sub: `${c.tier === 'C' ? 'State capital' : c.tier === 'S' ? 'County seat' : 'City/town'} · ${c.st}${cty ? ' · ' + cty.name + ' County' : ''}`, city: c, fips: c.fips || null, lon: c.lon, lat: c.lat }); if (out.length > 400) break; } }
        return out.sort((a, b) => b.score - a.score).slice(0, limit);
      },
      /** County containing a lon/lat (uses rendered features; the point must be within the current viewport) */
      countyAt(lngLat) { const p = map.project(lngLat); const f = map.queryRenderedFeatures(p, { layers: ['county-fill'] })[0]; return f ? idx.counties.get(pad5(f.id)) : null; },
      setLayerVisible(id, on) { const ids = { roads: defs.filter(d => d.id.startsWith('road-')).map(d => d.id), cities: defs.filter(d => d.id.startsWith('city-')).map(d => d.id), water: ['lakes', 'lakes-line', 'rivers', 'water-label'], countyLabels: ['county-label'], stateLabels: ['state-label'], urban: ['urban'] }[id] || [id]; ids.forEach(l => map.getLayer(l) && map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none')); },
      setTheme(name) {
        if (!THEMES[name]) return; themeName = name; const t = T(); defs = layerDefs(t, isDark());
        map.setPaintProperty('background', 'background-color', t.land);
        for (const d of defs) { if (!map.getLayer(d.id)) continue; for (const [k, v] of Object.entries(d.paint || {})) map.setPaintProperty(d.id, k, v); for (const [k, v] of Object.entries(d.layout || {})) if (k === 'icon-image') map.setLayoutProperty(d.id, k, v); }
        ev.emit('theme', { theme: name });
      },
      themes: THEMES,
      destroy() { map.remove(); },
    };
    if (o.theme === 'auto') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => inst.setTheme(prefersDark() ? 'atlas-dark' : 'atlas-light'));
      new MutationObserver(() => inst.setTheme(prefersDark() ? 'atlas-dark' : 'atlas-light')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    ev.emit('ready', inst);
    return inst;
  }

  /* ------------------------------------------------------------------ */
  /* Legend helper: renders into an element from a scale.                */
  /* ------------------------------------------------------------------ */
  function legend(el, spec) {
    el = typeof el === 'string' ? document.querySelector(el) : el;
    const sc = spec.scale; const fmt = spec.format || (v => v); let html = `<div class="usmap-legend">${spec.title ? `<div class="t">${spec.title}</div>` : ''}`;
    if (sc && (sc.kind === 'sequential' || sc.kind === 'diverging')) {
      html += `<div class="ramp" style="--ramp:${sc.colors.join(',')}"></div><div class="ends"><span>${fmt(sc.domain[0])}</span>${sc.kind === 'diverging' ? `<span>${fmt(sc.domain[1])}</span>` : ''}<span>${fmt(sc.domain[sc.domain.length - 1])}</span></div>`;
    } else if (sc && sc.kind === 'threshold') {
      sc.colors.forEach((c, i) => { const lo = i === 0 ? null : sc.breaks[i - 1], hi = sc.breaks[i]; html += `<div class="row"><span class="sw" style="background:${c}"></span><span>${lo == null ? '< ' + fmt(hi) : hi == null ? '≥ ' + fmt(lo) : fmt(lo) + ' – ' + fmt(hi)}</span></div>`; });
    } else if (sc && sc.kind === 'categorical') {
      for (const [k, c] of Object.entries(sc.mapping)) html += `<div class="row"><span class="sw" style="background:${c}"></span><span>${(spec.labels && spec.labels[k]) || k}</span></div>`;
    } else if (spec.items) {
      for (const it of spec.items) html += `<div class="row"><span class="sw" style="background:${it.color}"></span><span>${it.label}</span></div>`;
    }
    el.innerHTML = html + '</div>'; return el;
  }

  global.USMap = { create, scale, palettes: PALETTES, themes: THEMES, legend, version: VERSION, util: { pad5, fmtInt, mix, interpolatePalette } };
})(typeof window !== 'undefined' ? window : this);
