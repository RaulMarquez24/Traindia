// ============================================================
// VISTAS: Progreso — resumen, corporal, por ejercicio, récords y comparativa
// ============================================================

const VProgress = (() => {

  const MEASURES = [
    { key: 'weight', label: 'Peso', unit: 'kg', step: '0.1' },
    { key: 'waist', label: 'Cintura', unit: 'cm', step: '0.5' },
    { key: 'hip', label: 'Cadera', unit: 'cm', step: '0.5' },
    { key: 'thigh', label: 'Muslo', unit: 'cm', step: '0.5' },
    { key: 'arm', label: 'Brazo', unit: 'cm', step: '0.5' },
  ];

  const EX_METRICS = [
    { key: 'maxWeight', label: 'Peso máx (kg)' },
    { key: 'e1rm', label: '1RM est.' },
    { key: 'volume', label: 'Peso levantado (kg)' },
    { key: 'maxReps', label: 'Reps máx' },
  ];
  // Con tu propio peso (dominadas, fondos…): el peso es el corporal ± lastre/asistencia.
  const REPS_METRICS = [
    { key: 'maxLoad', label: 'Peso máx (corporal ± lastre)' },
    { key: 'maxReps', label: 'Reps máx' },
    { key: 'e1rm', label: '1RM est.' },
    { key: 'volume', label: 'Peso levantado (kg)' },
  ];
  // Cardio (distancia/kcal totales): la métrica de tiempo es el TOTAL de la sesión.
  const TIME_METRICS_CARDIO = [
    { key: 'distance', label: 'Distancia (km)' },
    { key: 'bestTime', label: 'Tiempos' },               // tus mejores tiempos en 1, 3, 5, 10… km (se elige la distancia)
    { key: 'pace', label: 'Ritmo (min/km)' },            // salidas de 1 km o más; récord = el más bajo
    { key: 'bestSet', label: 'Mejor serie (min/km)' },   // la serie más rápida (series de 400 m…)
    { key: 'totalTime', label: 'Tiempo total' },
    { key: 'kcal', label: 'Kcal' },
  ];
  // Mejores tiempos por distancia: de cada salida de esa distancia o más, el tiempo a su ritmo medio.
  // (Correr más minutos no es un récord; hacer los 5 km en menos tiempo, sí.)
  const TIME_REC = { time1k: 1, time3k: 3, time5k: 5, time10k: 10, time21k: 21.0975, time42k: 42.195 };
  const TIME_REC_LABEL = { time1k: 'Mejor 1 km', time3k: 'Mejor 3 km', time5k: 'Mejor 5 km', time10k: 'Mejor 10 km', time21k: 'Media maratón', time42k: 'Maratón' };
  const TIME_REC_SHORT = { time1k: '1 km', time3k: '3 km', time5k: '5 km', time10k: '10 km', time21k: '21 km', time42k: '42 km' };
  // Lo que no es un récord (más minutos o más kcal no es «mejor»): se enseña frente a tu media
  const NO_RECORD = new Set(['totalTime', 'kcal']);
  // Variantes de cardio (Z2, «Z2 - Suave», «Z2 · suave»…): iguales sin mirar mayúsculas, acentos ni separadores
  const labelKey = (s) => UI.norm(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim();
  // Isométricos (plancha, dead hang…): el récord es el aguante máximo de una serie.
  const TIME_METRICS_HOLD = [
    { key: 'maxTime', label: 'Tiempo máx' },
  ];
  const TIME_METRICS = TIME_METRICS_CARDIO.concat(TIME_METRICS_HOLD); // para mapear etiquetas
  // ¿Ejercicio de cardio (tiempo con totales)? Si entre sus metrics hay distancia/kcal.
  function isCardioEx(ex) {
    return ex && ex.type === 'time' && Array.isArray(ex.metrics) && (ex.metrics.includes('distance') || ex.metrics.includes('kcal'));
  }
  const timeMetricsFor = (ex) => (isCardioEx(ex) ? TIME_METRICS_CARDIO : TIME_METRICS_HOLD);
  const metricsFor = (ex) => (!ex ? EX_METRICS : ex.type === 'time' ? timeMetricsFor(ex) : ex.type === 'reps' ? REPS_METRICS : EX_METRICS);
  const METRIC_UNIT = { maxWeight: ' kg', e1rm: ' kg', volume: ' kg', maxReps: ' reps', distance: ' km', kcal: ' kcal', maxLoad: ' kg' };
  // Métricas en las que MENOS es mejor (el ritmo): el récord es el valor más bajo.
  const LOWER_BETTER = new Set(['pace', 'bestSet', ...Object.keys(TIME_REC)]);
  const fmtPaceV = (sec) => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const METRIC_LABEL = {};
  EX_METRICS.concat(TIME_METRICS).forEach(m => { METRIC_LABEL[m.key] = m.label; });
  Object.assign(METRIC_LABEL, TIME_REC_LABEL);
  METRIC_LABEL.maxLoad = 'Peso máx levantado'; // récord: mayor (corporal+lastre) en una serie
  // Orden de las marcas dentro de la tarjeta de cada ejercicio en "Récords".
  const METRIC_ORDER = ['maxWeight', 'e1rm', 'maxReps', 'maxLoad', 'volume', 'time42k', 'time21k', 'time10k', 'time5k', 'time3k', 'time1k', 'distance', 'pace', 'bestSet', 'totalTime', 'kcal', 'maxTime'];
  // Nombres cortos (para botones) y qué mide cada una, en cristiano.
  const METRIC_SHORT = { maxWeight: 'Peso máx', e1rm: '1RM', volume: 'Volumen', maxReps: 'Reps', maxLoad: 'Peso máx', distance: 'Distancia', bestTime: 'Tiempos', totalTime: 'Tiempo', pace: 'Ritmo', bestSet: 'Mejor serie', kcal: 'Kcal', maxTime: 'Tiempo máx', ...TIME_REC_LABEL };
  const METRIC_HINT = {
    maxWeight: 'El peso más alto que moviste en una serie.',
    e1rm: 'Cuánto levantarías a una sola repetición, estimado con tus series.',
    volume: 'Todo el peso que moviste en el entreno: kilos × repeticiones.',
    maxReps: 'Las repeticiones de tu mejor serie.',
    maxLoad: 'Tu peso ± el lastre o la asistencia, en tu mejor serie.',
    distance: 'Los kilómetros de cada salida. El récord es la más larga.',
    bestTime: 'Tu tiempo en esa distancia, de cada salida igual o más larga, a su ritmo medio.',
    totalTime: 'Cuánto duró cada salida. No es un récord: se compara con tu media.',
    pace: 'Ritmo medio de las salidas de 1 km o más. Cuanto más bajo, mejor.',
    bestSet: 'Tu serie más rápida de cada entreno. Cuanto más bajo, mejor.',
    kcal: 'Las calorías de cada salida. No es un récord: se compara con tu media.',
    maxTime: 'Tu serie más larga.',
  };
  // Números en español (coma decimal), con el formateador reutilizado.
  const _nf = new Map();
  const nf = (v, dec = 1) => { let f = _nf.get(dec); if (!f) { f = new Intl.NumberFormat('es-ES', { maximumFractionDigits: dec }); _nf.set(dec, f); } return f.format(v); };

  // Peso corporal registrado (Progreso → Corporal), ascendente por fecha, para
  // cruzarlo con las sesiones y estimar el "peso levantado" a peso corporal.
  async function loadBodyWeights(userId) {
    return (await DB.progressOf(userId))
      .filter(e => e.date && e.weight != null && e.weight !== '')
      .map(e => ({ date: e.date, kg: parseFloat(e.weight) }))
      .filter(b => !isNaN(b.kg))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  // Último peso corporal con fecha <= la dada (null si no hay ninguno anterior).
  function bwAtDate(bws, date) {
    let val = null;
    for (const b of (bws || [])) { if (b.date <= date) val = b.kg; else break; }
    // sesiones anteriores a tu primer pesaje: el más cercano (mejor que contar solo el lastre)
    if (val == null && bws && bws.length) val = bws[0].kg;
    return val;
  }

  // récord = mejor punto; a igual valor, gana el de mejor condición (más reps / más peso / menos tiempo)
  // (en el ritmo, el mejor es el más bajo)
  const better = (p, b, metric) => LOWER_BETTER.has(metric)
    ? (p.y < b.y || (p.y === b.y && (p.tie || 0) > (b.tie || 0)))
    : (p.y > b.y || (p.y === b.y && (p.tie || 0) > (b.tie || 0)));
  const bestPoint = (points, metric) => (points.length ? points.reduce((b, p) => (better(p, b, metric) ? p : b), points[0]) : null);
  // valor de una métrica con su unidad (sin condiciones)
  function fmtMetricValue(metric, y) {
    if (TIME_REC[metric]) return fmtSecs(y);
    if (LOWER_BETTER.has(metric)) return `${fmtPaceV(y)} /km`;
    if (metric === 'maxTime' || metric === 'totalTime') return fmtSecs(y);
    return `${nf(y, metric === 'distance' ? 2 : 1)}${METRIC_UNIT[metric] || ''}`;
  }
  // valor formateado de un punto con su unidad + condiciones (ej. "90 kg × 3")
  function fmtMetricPoint(metric, p) {
    const base = fmtMetricValue(metric, p.y);
    return p.detail ? `${base} ${p.detail}` : base;
  }
  // opciones de la gráfica según la métrica (eje con mm:ss y, en el ritmo, invertido)
  const chartOpts = (metric) => TIME_REC[metric] ? { fmtY: fmtSecs, invertY: true }
    : LOWER_BETTER.has(metric) ? { fmtY: fmtPaceV, invertY: true }
    : (metric === 'maxTime' || metric === 'totalTime') ? { fmtY: fmtSecs } : {};

  // Serie del 1RM respetando "solo esfuerzo"; si no hay ninguna serie con
  // esfuerzo marcado, cae a usar todas (y avisa con fellBack). Para el resto de
  // métricas devuelve la serie normal.
  async function metricSeries(userId, name, metric, effortOnly, formula, label, pre = {}) {
    if (metric !== 'e1rm' || !effortOnly) {
      return { points: await exerciseSeries(userId, name, metric, { ...pre, effortOnly: false, formula, label }), noEffort: false };
    }
    // tick activo: solo series con esfuerzo. Si no hay ninguna pero sí hay datos,
    // se deja la gráfica vacía y se marca noEffort para avisar (no se usan todas).
    const pts = await exerciseSeries(userId, name, metric, { ...pre, effortOnly: true, formula, label });
    if (pts.length) return { points: pts, noEffort: false };
    const all = await exerciseSeries(userId, name, metric, { ...pre, effortOnly: false, formula, label });
    return { points: [], noEffort: all.length > 0 };
  }
  // Formatea segundos: <60s → "45s"; <60min → "m:ss"; ≥60min → "h:mm:ss".
  function fmtSecs(v) {
    v = Math.max(0, Math.round(v || 0));
    const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), s = v % 60;
    const ss = String(s).padStart(2, '0');
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
    if (m > 0) return `${m}:${ss}`;
    return `${s}s`;
  }

  // Reps "en reserva" según el esfuerzo marcado ('100%' = al fallo → 0;
  // '90%' ≈ 1; '80%' ≈ 2; …). Sin esfuerzo marcado devuelve null.
  function repsInReserve(effort) {
    if (!effort) return null;
    const pct = parseFloat(effort);
    if (isNaN(pct)) return null;
    return Math.max(0, (100 - pct) / 10);
  }

  // 1RM estimado a partir del peso y las reps totales (hasta el fallo).
  const E1_FORMULAS = [{ key: 'epley', label: 'Epley' }, { key: 'brzycki', label: 'Brzycki' }];
  function estimate1rm(weight, totalReps, formula) {
    if (formula === 'brzycki' && totalReps < 37) return weight * 36 / (37 - totalReps);
    return weight * (1 + totalReps / 30); // Epley (y respaldo si Brzycki se sale de rango)
  }

  // ---- cálculo de series por ejercicio desde sesiones ----
  // opts.effortOnly (solo para 1RM): solo cuenta las series con esfuerzo marcado.
  async function exerciseSeries(userId, exName, metric, opts = {}) {
    const effortOnly = !!opts.effortOnly;
    const formula = opts.formula || 'epley';
    const labelFilter = opts.label || ''; // filtra cardio por etiqueta/variante
    // Peso corporal por fecha: para "peso levantado"/"peso máx levantado" a peso corporal.
    let bodyWeights = opts.bodyWeights;
    if (bodyWeights === undefined && (metric === 'volume' || metric === 'maxLoad' || metric === 'e1rm')) bodyWeights = await loadBodyWeights(userId);
    // opts.sessions: los entrenos ya leídos (computeRecords los pasa para no leerlos una vez por ejercicio y marca)
    let sessions = (opts.sessions || await DB.sessionsOf(userId)).filter(s => !s.draft);
    sessions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const points = [];
    const lname = exName.toLowerCase();
    sessions.forEach(s => {
      let maxWeight = 0, volume = 0, maxReps = 0, maxTime = 0, distance = 0, kcal = 0, totalTime = 0, found = false;
      let bestW = null, bestR = null; // mejor serie por peso (desempata reps) y por reps (desempata peso)
      let best1rm = 0, best1rmSet = null; // mejor 1RM estimado (Epley) y la serie que lo produce
      let maxLoad = 0, bestLoad = null;   // mayor (corporal±carga) levantado en una serie
      let bestSetPace = 0, bestSetInfo = null; // la serie más rápida (ritmo, s/km) y su distancia/tiempo
      let e_isReps = false; // ejercicio con tu propio peso (para describir lastre/asistencia)
      const bw = bwAtDate(bodyWeights, s.date); // peso corporal aplicable a esta sesión (o null)
      (s.entries || []).forEach(e => {
        if ((e.name || '').toLowerCase() !== lname) return;
        if (e.type === 'reps') e_isReps = true;
        if (labelFilter && !(e.sets || []).some(st => labelKey(st.label) === labelFilter)) return; // solo la variante elegida
        found = true;
        // cardio nuevo: distancia/kcal como TOTAL del ejercicio (entry.totals).
        // Sin totals (sesiones viejas) → se suman por serie como antes.
        const hasTotals = e.totals && (e.totals.distance || e.totals.kcal);
        if (hasTotals) { distance += parseFloat(e.totals.distance) || 0; kcal += parseFloat(e.totals.kcal) || 0; }
        const hasTotalTime = e.totals && e.totals.time != null && e.totals.time !== '';
        if (hasTotalTime) totalTime += parseInt(e.totals.time) || 0; // tiempo total manual (cardio)
        (e.sets || []).forEach(set => {
          const r = parseFloat(set.reps) || 0, w = parseFloat(set.weight) || 0, t = parseFloat(set.time) || 0;
          // Peso efectivo de la serie: hierro puro (weight) o peso corporal ± lastre/asistencia.
          let ew;
          if (e.type === 'weight') ew = w;
          else {
            const load = parseFloat(set.load) || 0, base = bw || 0;
            ew = set.loadMode === 'asist' ? Math.max(0, base - load) : set.loadMode === 'lastre' ? base + load : base;
          }
          // ¿cuenta para "peso máx levantado"? repes con reps, o series de tiempo con lastre/asist.
          const loadCounts = (e.type === 'reps' && r > 0) || (e.type === 'time' && (set.load || set.loadMode));
          if (loadCounts && (e.type === 'weight' || bw != null) && ew > maxLoad) { maxLoad = ew; bestLoad = { ew, r, mode: set.loadMode, load: parseFloat(set.load) || 0 }; }
          if (w > maxWeight) maxWeight = w;
          if (r > maxReps) maxReps = r;
          if (t > maxTime) maxTime = t;
          if (e.type !== 'reps' || bw != null) volume += r * ew; // con tu peso, sin peso corporal no se sabe
          if (!hasTotalTime) totalTime += t;
          if (!hasTotals) { // sin total: la de cada serie (la apuntada o, si no, la del objetivo «5×400m»)
            const own = (parseFloat(set.distance) || 0) || ((parseFloat(set.sdist) || 0) / 1000);
            distance += own || (e.type === 'time' && t > 0 && typeof VSessions !== 'undefined' ? VSessions.repDistKm({ ...e, totals: {} }) : 0);
            kcal += parseFloat(set.kcal) || 0;
          }
          // ritmo de esta serie (solo en ejercicios por series: con una sola tirada ya está «Ritmo»)
          const porSeries = (e.sets || []).filter(x => parseFloat(x.time) > 0).length >= 2;
          if (e.type === 'time' && t > 0 && porSeries && typeof VSessions !== 'undefined' && VSessions.setPaceSec) {
            const p = VSessions.setPaceSec(e, set);
            if (p > 0 && (!bestSetPace || p < bestSetPace)) {
              const km = (parseFloat(set.sdist) || 0) / 1000 || parseFloat(set.distance) || VSessions.repDistKm(e);
              bestSetPace = p; bestSetInfo = { m: Math.round(km * 1000), t };
            }
          }
          if (w > 0 && (!bestW || w > bestW.w || (w === bestW.w && r > bestW.r))) bestW = { w, r };
          const wR = e.type === 'reps' ? ew : w; // a iguales reps, gana la de más peso (con tu peso: corporal ± lastre)
          if (r > 0 && (!bestR || r > bestR.r || (r === bestR.r && wR > bestR.w))) bestR = { w: wR, r, mode: set.loadMode, load: parseFloat(set.load) || 0 };
          const w1 = e.type === 'reps' ? (bw != null ? ew : 0) : w; // con tu peso: corporal ± lastre
          if (w1 > 0 && r > 0) { // 1RM con reps en reserva según el esfuerzo
            const rir = repsInReserve(set.effort);
            if (!effortOnly || rir != null) {
              const e1 = estimate1rm(w1, r + (rir || 0), formula);
              if (e1 > best1rm) { best1rm = e1; best1rmSet = { w: Math.round(w1 * 10) / 10, r, eff: set.effort || null }; }
            }
          }
        });
      });
      if (!found) return;
      const distR = Math.round(distance * 100) / 100;
      // Ritmo medio (s/km): solo salidas de 1 km o más (un trote corto no es «tu mejor km»)
      const pace = (distR >= 1 && totalTime > 0) ? Math.round(totalTime / distR) : 0;
      if (metric === 'pace' && !pace) return;
      if (metric === 'bestSet' && !bestSetPace) return;
      const map = { maxWeight, volume: Math.round(volume), maxReps, maxTime, totalTime, distance: distR, kcal: Math.round(kcal), pace, bestSet: bestSetPace, e1rm: Math.round(best1rm), maxLoad: Math.round(maxLoad * 10) / 10 };
      // mejor tiempo en una distancia: salidas de esa distancia o más (2 % de margen), a su ritmo medio
      if (TIME_REC[metric]) { const D = TIME_REC[metric]; map[metric] = distR >= D * 0.98 && totalTime > 0 ? Math.round(totalTime / distR * D) : 0; }
      const y = map[metric] || 0;
      if (metric === 'e1rm' && best1rm <= 0) return; // sin series válidas (p.ej. effortOnly y sin esfuerzo)
      // condiciones de la marca + desempate. La "tie" mayor = mejor marca a igual valor.
      let detail = '', tie = 0;
      if (metric === 'maxWeight' && bestW) { detail = bestW.r ? `× ${bestW.r}` : ''; tie = bestW.r; }            // + reps a igual peso
      else if (metric === 'e1rm' && best1rmSet) { detail = `de ${nf(best1rmSet.w)} kg × ${best1rmSet.r}${best1rmSet.eff ? ` · ${best1rmSet.eff}` : ''}`; tie = best1rmSet.w; } // serie origen del 1RM
      else if (metric === 'maxReps' && bestR) { // con tu peso: si llevabas lastre o asistencia; con barra: el peso
        detail = e_isReps ? (bestR.mode && bestR.load ? (bestR.mode === 'asist' ? `con asistencia (−${nf(bestR.load)} kg)` : `con +${nf(bestR.load)} kg`) : '') : (bestR.w ? `@ ${nf(bestR.w)} kg` : '');
        tie = bestR.w; }
      else if (metric === 'distance' && distance > 0) { detail = totalTime ? `en ${fmtSecs(totalTime)}` : ''; tie = -totalTime; } // − tiempo a igual distancia
      else if (metric === 'kcal' && kcal > 0) { detail = totalTime ? `en ${fmtSecs(totalTime)}` : ''; }
      else if (metric === 'maxTime' && distR > 0) { detail = `· ${nf(distR, 2)} km`; tie = distR; }                      // + distancia a igual tiempo
      else if (metric === 'totalTime' && distR > 0) { detail = `· ${nf(distR, 2)} km`; tie = distR; }                    // tiempo total (cardio) + distancia
      else if (metric === 'pace') { detail = `· ${nf(distR, 2)} km en ${fmtSecs(totalTime)}`; tie = distR; }            // a igual ritmo, gana la más larga
      else if (TIME_REC[metric]) { detail = distR > TIME_REC[metric] * 1.05 ? `· en una salida de ${nf(distR, 2)} km` : ''; tie = distR; }
      else if (metric === 'bestSet' && bestSetInfo) { detail = `· ${bestSetInfo.m} m en ${fmtSecs(bestSetInfo.t)}`; tie = bestSetInfo.m; }
      else if (metric === 'maxLoad' && bestLoad) { // peso máx levantado: reps de la serie + lastre/asistencia
        const extra = bestLoad.mode && bestLoad.load ? ` (${bestLoad.mode === 'asist' ? '−' : '+'}${nf(bestLoad.load)} kg)` : '';
        detail = `${bestLoad.r ? `× ${bestLoad.r}` : ''}${extra}`.trim();
        tie = bestLoad.r;
      }
      if (!(y > 0)) return; // un 0 no es una marca (p. ej. peso de la serie en ejercicios con tu peso)
      points.push({ x: s.date, y, detail, tie, sid: s.id });
    });
    return points;
  }

  // Métrica representativa de cada ejercicio para "récords" (la primera con datos).
  // Métricas a guardar como récord de un ejercicio. Un ejercicio puede tener VARIAS
  // (las que no tengan datos se descartan luego). Así "un ejercicio no es solo de algo".
  function recordMetrics(ex) {
    if (ex.type === 'check') return [];  // hecho / no hecho: no hay métrica que seguir
    if (ex.type === 'time') return isCardioEx(ex) ? ['distance', 'pace', 'bestSet', ...Object.keys(TIME_REC)] : ['maxTime', 'maxLoad'];
    if (ex.type === 'reps') return ['maxReps', 'maxLoad', 'e1rm', 'volume'];
    return ['maxWeight', 'e1rm', 'maxReps', 'volume'];
  }

  // Récord (PR) de cada ejercicio del catálogo. Cacheado por usuario + nº de sesiones.
  async function computeRecords(app, userId) {
    const sessions = (await DB.sessionsOf(userId)).filter(s => !s.draft);
    const bodyWeights = await loadBodyWeights(userId); // para "peso levantado" a peso corporal
    const cacheKey = userId + ':' + sessions.length + ':' + bodyWeights.length + ':' + JSON.stringify(sessions).length + ':' + JSON.stringify(bodyWeights).length;
    app._recCache = app._recCache || {};
    if (app._recCache[cacheKey]) return app._recCache[cacheKey];
    // sólo ejercicios realmente entrenados (evita recorrer todo el catálogo)
    const trained = new Set();
    sessions.forEach(s => (s.entries || []).forEach(e => { if (e.name) trained.add(e.name.toLowerCase()); }));
    const catalog = await DB.exercisesOf(userId);
    const seen = new Set(); // un récord por nombre (hay ejercicios duplicados en el catálogo)
    const out = [];
    for (const ex of catalog) {
      const nl = ex.name.toLowerCase();
      if (!trained.has(nl) || seen.has(nl)) continue;
      seen.add(nl);
      // un ejercicio puede tener VARIAS marcas: guardamos todas las que tengan datos
      for (const metric of recordMetrics(ex)) {
        const pts = await exerciseSeries(userId, ex.name, metric, { bodyWeights, sessions });
        const best = bestPoint(pts, metric);
        if (best && best.y > 0) out.push({ ex, metric, point: best, pts });
      }
    }
    out.sort((a, b) => (b.point.x || '').localeCompare(a.point.x || '')); // marca más reciente primero
    app._recCache[cacheKey] = out;
    return out;
  }

  // ---------- utilidades de fechas ----------
  const DAY = 86400000;
  const isoMs = (iso) => new Date(iso + 'T00:00:00').getTime();
  const isoOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const diasEntre = (a, b) => Math.round((isoMs(b) - isoMs(a)) / DAY);
  const fmt1 = (v) => (Math.round(v * 10) / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  const signo = (v, dec = 1) => { const r = Math.round(v * 10 ** dec) / 10 ** dec; return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r).toLocaleString('es-ES', { maximumFractionDigits: dec }); };

  // ---------- PESO: objetivo, «el más bajo desde», tendencia ----------
  const GOALS = [{ value: 'bajar', label: 'Bajar' }, { value: 'subir', label: 'Subir' }, { value: 'mantener', label: 'Mantener' }, { value: '', label: 'Sin objetivo' }];
  const NOTABLE_DIAS = 21; // «desde» solo cuenta si hace al menos 3 semanas que no estabas así

  async function pesosDe(userId) {
    return (await DB.progressOf(userId))
      .filter(e => e.date && e.weight != null && e.weight !== '' && !isNaN(parseFloat(e.weight)))
      .map(e => ({ date: e.date, kg: parseFloat(e.weight) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  // Qué tiene de especial tu último peso: el más bajo / alto desde cuándo, o estable desde cuándo.
  function weightInsight(ws) {
    if (!ws.length) return null;
    const last = ws[ws.length - 1], prev = ws.slice(0, -1).reverse();
    const lower = prev.find(e => e.kg <= last.kg), higher = prev.find(e => e.kg >= last.kg);
    const low = !prev.length ? null : lower ? (diasEntre(lower.date, last.date) >= NOTABLE_DIAS ? { since: lower.date, ref: lower } : null) : (ws.length >= 3 ? { ever: true } : null);
    const high = !prev.length ? null : higher ? (diasEntre(higher.date, last.date) >= NOTABLE_DIAS ? { since: higher.date, ref: higher } : null) : (ws.length >= 3 ? { ever: true } : null);
    let stableFrom = null;
    let mn = last.kg, mx = last.kg;
    for (let i = ws.length - 1; i >= 0; i--) { mn = Math.min(mn, ws[i].kg); mx = Math.max(mx, ws[i].kg); if (mx - mn > 1.5) break; stableFrom = ws[i].date; }
    const desde180 = ws.filter(e => diasEntre(e.date, last.date) <= 180);
    const max = desde180.reduce((m, e) => (e.kg > m.kg ? e : m), last), min = desde180.reduce((m, e) => (e.kg < m.kg ? e : m), last);
    return { last, low, high, stableFrom, max, min };
  }
  // Frase según tu objetivo (null si no hay nada que contar).
  function weightPhrase(ins, goal) {
    if (!ins) return null;
    const d = (x) => UI.fmtDateShort(x);
    const lowTxt = ins.low && (ins.low.ever ? 'Tu peso más bajo registrado' : `El más bajo desde el ${d(ins.low.since)}`);
    const highTxt = ins.high && (ins.high.ever ? 'Tu peso más alto registrado' : `El más alto desde el ${d(ins.high.since)}`);
    const sem = ins.stableFrom ? Math.floor(diasEntre(ins.stableFrom, ins.last.date) / 7) : 0;
    if (goal === 'bajar') return lowTxt ? { txt: lowTxt, sub: ins.max.kg - ins.last.kg >= 1 ? `${signo(ins.last.kg - ins.max.kg)} kg desde tu máximo (${fmt1(ins.max.kg)} · ${d(ins.max.date)})` : '' } : null;
    if (goal === 'subir') return highTxt ? { txt: highTxt, sub: ins.last.kg - ins.min.kg >= 1 ? `${signo(ins.last.kg - ins.min.kg)} kg desde tu mínimo (${fmt1(ins.min.kg)} · ${d(ins.min.date)})` : '' } : null;
    if (goal === 'mantener') return sem >= 2 ? { txt: `Estable desde hace ${sem} semanas`, sub: 'Sin moverte más de 1,5 kg' } : null;
    return lowTxt ? { txt: lowTxt, sub: '' } : highTxt ? { txt: highTxt, sub: '' } : null;
  }
  // Tendencia suavizada (media exponencial con constante de 7 días, según el hueco entre pesajes).
  function trendOf(ws) {
    let t = null, prev = null;
    return ws.map(e => {
      if (t == null) t = e.kg;
      else { const a = 1 - Math.exp(-Math.max(1, diasEntre(prev, e.date)) / 7); t = t + a * (e.kg - t); }
      prev = e.date;
      return { x: e.date, y: Math.round(t * 100) / 100 };
    });
  }
  // Tendencia para dibujar: media de los pesajes cercanos (antes y después, pesando más los más próximos).
  // No va «por detrás» como la exponencial, así que la línea pasa por el centro de los puntos.
  function trendLine(ws, dias = 5) {
    return ws.map(e => {
      let s = 0, n = 0;
      ws.forEach(o => { const d = diasEntre(o.date, e.date); if (d > dias * 3) return; const w = Math.exp(-(d * d) / (2 * dias * dias)); s += w * o.kg; n += w; });
      return { x: e.date, y: Math.round((s / n) * 100) / 100 };
    });
  }
  // kg por semana: pendiente de la tendencia en las últimas 6 semanas (null si no hay datos para decirlo).
  function weeklyRate(trend) {
    if (trend.length < 3) return null;
    const last = trend[trend.length - 1].x;
    const pts = trend.filter(p => diasEntre(p.x, last) <= 42);
    if (pts.length < 3 || diasEntre(pts[0].x, last) < 10) return null;
    const xs = pts.map(p => diasEntre(pts[0].x, p.x)), ys = pts.map(p => p.y);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    return den ? (num / den) * 7 : null;
  }
  const rateTxt = (r) => r == null ? '' : Math.abs(r) < 0.1 ? 'estable' : `${signo(r)} kg/semana`;

  // ---------- RESUMEN ----------
  // La marca principal de cada ejercicio (la primera que tenga). En cardio, tu mejor tiempo en la distancia más larga que hayas hecho.
  const MAIN_METRICS = ['maxWeight', 'maxLoad', 'maxReps', 'time42k', 'time21k', 'time10k', 'time5k', 'time3k', 'time1k', 'distance', 'pace', 'maxTime', 'bestSet'];
  const NO_MUSCULO = new Set(['calentamiento', 'movilidad', 'cardio', 'carrera', 'estiramientos', 'general']);
  const RECIENTE_DIAS = 14;

  // Logros de las últimas 2 semanas: peso, récords y «lo mejor desde».
  async function logrosRecientes(app, uid) {
    const hoy = DB.todayISO();
    const out = [];
    // Peso y récords a la vez (no hace falta esperar a uno para pedir el otro)
    const [ws, records] = await Promise.all([pesosDe(uid), computeRecords(app, uid)]);
    const ins = weightInsight(ws);
    const goal = app.activeUser.weightGoal || '';
    const ph = weightPhrase(ins, goal);
    if (ph && diasEntre(ins.last.date, hoy) <= RECIENTE_DIAS) {
      const ref = /bajo/.test(ph.txt) ? ins.low && ins.low.ref : /alto/.test(ph.txt) ? ins.high && ins.high.ref : null;
      const desde = ref ? ref.date : ws[0].date;
      const pts = ws.filter(e => e.date >= desde || diasEntre(e.date, ins.last.date) <= 120).map(e => ({ x: e.date, y: e.kg }));
      out.push({ kind: 'peso', date: ins.last.date, tag: `Peso · ${UI.fmtDateShort(ins.last.date)}`, big: `${fmt1(ins.last.kg)} kg`, txt: ph.txt, sub: ph.sub, spark: { pts, ref: ref && { x: ref.date, y: ref.kg } } });
    }
    // Récords recientes (una tarjeta por ejercicio, con su marca principal)
    const porEj = new Map();
    const SIN_LOGRO = new Set(['calentamiento', 'movilidad', 'estiramientos']);
    const CORRER = new Set(['carrera', 'cardio']);
    records.forEach(r => {
      if (!MAIN_METRICS.includes(r.metric)) return;
      const g = UI.norm(r.ex.muscleGroup || '');
      const cardio = ['distance', 'pace', 'bestSet'].includes(r.metric) || !!TIME_REC[r.metric];
      if (SIN_LOGRO.has(g) && !cardio) return;                          // calentar no es una marca (correr más km sí, esté donde esté)
      if (r.metric === 'maxTime' && CORRER.has(g)) return;             // en carrera, la serie más larga es la más lenta
      const cur = porEj.get(r.ex.name);
      if (!cur || MAIN_METRICS.indexOf(r.metric) < MAIN_METRICS.indexOf(cur.metric)) porEj.set(r.ex.name, r);
    });
    const conRecord = new Set();
    // pesos y entrenos leídos una sola vez para todas las mini gráficas (antes, una lectura por ejercicio)
    const bodyWeights = ws.map(e => ({ date: e.date, kg: e.kg }));
    const sessions = await DB.sessionsOf(uid);
    for (const r of [...porEj.values()].filter(r => diasEntre(r.point.x, hoy) <= RECIENTE_DIAS)) {
      conRecord.add(r.ex.name);
      const pts = await exerciseSeries(uid, r.ex.name, r.metric, { bodyWeights, sessions });
      out.push({ kind: 'record', date: r.point.x, tag: `Récord · ${UI.fmtDateShort(r.point.x)}`, big: fmtMetricValue(r.metric, r.point.y), txt: r.ex.name, sub: subDe(r.metric, r.point), spark: { pts: pts.filter(p => p.x <= r.point.x).slice(-12), invert: LOWER_BETTER.has(r.metric) } });
    }
    // «Lo mejor desde»: lo último que hiciste no es récord, pero no lo igualabas desde hace un mes o más
    for (const r of porEj.values()) {
      if (conRecord.has(r.ex.name)) continue;
      const pts = await exerciseSeries(uid, r.ex.name, r.metric, { bodyWeights, sessions });
      const last = pts[pts.length - 1];
      if (!last || diasEntre(last.x, hoy) > RECIENTE_DIAS) continue;
      const antes = pts.slice(0, -1).reverse();
      const igual = antes.find(p => !better(last, p, r.metric)); // la última vez que hiciste lo mismo o más
      if (!igual || diasEntre(igual.x, last.x) < 28) continue;
      out.push({ kind: 'desde', date: last.x, tag: `Mejor desde el ${UI.fmtDateShort(igual.x)}`, big: fmtMetricValue(r.metric, last.y), txt: r.ex.name, sub: subDe(r.metric, last), spark: { pts: pts.filter(p => p.x >= igual.x).slice(-14), ref: igual, invert: LOWER_BETTER.has(r.metric) } });
    }
    // el peso primero; luego lo más reciente
    out.sort((a, b) => (a.kind === 'peso' ? -1 : b.kind === 'peso' ? 1 : (b.date || '').localeCompare(a.date || '')));
    return out;
  }
  // Mini gráfica de una tarjeta de logro: la línea, tu último punto y, si lo hay, una
  // línea discontinua hasta la última vez que estuviste así («desde…»).
  const SW = 208, SH = 44;
  function sparkSVG(sp) {
    const pts = (sp && sp.pts) || [];
    if (pts.length < 2) return '';
    const xs = pts.map(p => isoMs(p.x)), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = (iso) => 4 + (x1 === x0 ? 0.5 : (isoMs(iso) - x0) / (x1 - x0)) * (SW - 8);
    const Y = (v) => { const k = y1 === y0 ? 0.5 : (v - y0) / (y1 - y0); return 4 + (sp.invert ? k : 1 - k) * (SH - 8); };
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const ref = sp.ref && pts.find(p => p.x === sp.ref.x) ? sp.ref : null;
    return `<svg class="pg-spark" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}" aria-hidden="true">
      ${ref ? `<line x1="${X(ref.x).toFixed(1)}" y1="${Y(ref.y).toFixed(1)}" x2="${X(last.x).toFixed(1)}" y2="${Y(last.y).toFixed(1)}" class="pg-sp-ref"/><circle cx="${X(ref.x).toFixed(1)}" cy="${Y(ref.y).toFixed(1)}" r="3" class="pg-sp-o"/>` : ''}
      <path d="${d}" class="pg-sp-l"/>
      <circle cx="${X(last.x).toFixed(1)}" cy="${Y(last.y).toFixed(1)}" r="4" class="pg-sp-p"/>
    </svg>`;
  }
  // Subtítulo corto de una marca: «12 repeticiones», «en 42:30», «a 4:51 /km»…
  function subDe(metric, p) {
    const d = (p.detail || '').trim().replace(/^·\s*/, ''); // sin el «·» del principio (ya va separado)
    if (metric === 'maxWeight' || metric === 'maxLoad') { const m = d.match(/^× (\d+)(.*)$/); return m ? `${m[1]} ${m[1] === '1' ? 'repetición' : 'repeticiones'}${m[2]}` : d; }
    if (metric === 'maxReps') return d ? `seguidas ${d}` : 'seguidas';
    if (metric === 'distance') return d;
    if (metric === 'pace') return `ritmo medio ${d}`.trim();
    if (metric === 'bestSet') return `tu serie más rápida ${d}`.trim();
    return d;
  }

  // Números de un periodo: entrenos, volumen (kg levantados), tiempo y km.
  function statsDe(sessions, desde, hasta) {
    let n = 0, vol = 0, secs = 0, km = 0;
    sessions.forEach(s => {
      if (s.date < desde || s.date > hasta) return;
      n++; secs += s.durationSec || 0;
      (s.entries || []).forEach(e => {
        const tot = e.totals && parseFloat(e.totals.distance);
        if (tot) km += tot;
        (e.sets || []).forEach(st => {
          if (st.done === false) return;
          if (e.type === 'weight') vol += (parseFloat(st.weight) || 0) * (parseFloat(st.reps) || 0);
          if (!tot) km += parseFloat(st.distance) || 0;
        });
      });
    });
    return { n, vol, secs, km };
  }

  // Skeleton: un bloque gris que late mientras llega su dato. Cada parte de la pantalla se pinta en cuanto
  // tiene lo suyo, sin esperar a las demás; lo que no necesita datos (títulos, botones) sale al momento.
  const sk = UI.sk;
  const skFallo = '<p class="dim pg-fallo">No se ha podido cargar esta parte. Vuelve a entrar en Progreso.</p>';

  async function renderResumen(app, host) {
    const uid = app.activeUser.id;
    const hoy = DB.todayISO(), now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), dia = now.getDate();
    const vivo = () => host.isConnected;
    const kg = (v) => v >= 1000 ? `${fmt1(v / 1000)} t` : `${Math.round(v)} kg`;
    const hm = (s) => s >= 3600 ? `${fmt1(s / 3600)} h` : `${Math.round(s / 60)} min`;
    const flecha = (a, b) => { if (!a && !b) return ''; const r = b ? (a - b) / b : 1; return Math.abs(r) < 0.05 ? '<i class="pg-eq">=</i>' : r > 0 ? '<i class="pg-up">▲</i>' : '<i class="pg-dn">▼</i>'; };
    const lunes = new Date(y, m, dia - ((now.getDay() + 6) % 7));

    // ---- Semana | Mes: el título, el subtítulo y las columnas no dependen de los datos
    const PER_KEY = 'traindia.progresoPeriodo';
    let periodo = 'semana';
    try { if (localStorage.getItem(PER_KEY) === 'mes') periodo = 'mes'; } catch (e) { /* sin almacenamiento: semana */ }
    const perMeta = (per) => {
      if (per === 'mes') {
        const pm = new Date(y, m - 1, 1);
        const finPrev = new Date(pm.getFullYear(), pm.getMonth(), Math.min(dia, new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate()));
        const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return {
          titulo: 'Este mes', sub: dia === 1 ? 'solo el día 1, los dos' : `los dos, del 1 al ${dia}`,
          cols: [MESES[m], MESES[pm.getMonth()]],
          a: [isoOf(new Date(y, m, 1).getTime()), hoy], b: [isoOf(pm.getTime()), isoOf(finPrev.getTime())],
        };
      }
      const nDia = (now.getDay() + 6) % 7; // 0 = lunes … 6 = domingo
      const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
      return {
        titulo: 'Esta semana', sub: nDia === 6 ? 'de lunes a domingo' : nDia === 0 ? 'solo los lunes' : `las dos, de lunes a ${DIAS[nDia]}`,
        cols: ['Esta', 'Pasada'],
        a: [isoOf(new Date(y, m, dia - nDia).getTime()), hoy],
        b: [isoOf(new Date(y, m, dia - nDia - 7).getTime()), isoOf(new Date(y, m, dia - 7).getTime())],
      };
    };
    let sesiones = null; // llegan después; mientras, la tabla enseña skeletons
    const periodoHTML = (per) => {
      const { titulo, sub, cols, a, b } = perMeta(per);
      let filasHTML;
      if (!sesiones) {
        filasHTML = [0, 1, 2, 3].map(() => `<div class="pg-mt"><span>${sk('62%', 13)}</span><span>${sk('70%', 13, 'margin-left:auto')}</span><span>${sk('60%', 13, 'margin-left:auto')}</span><span></span></div>`).join('');
      } else {
        const este = statsDe(sesiones, a[0], a[1]), prev = statsDe(sesiones, b[0], b[1]);
        filasHTML = [
          ['Entrenos', String(este.n), String(prev.n), este.n, prev.n],
          este.vol || prev.vol ? ['Peso levantado', kg(este.vol), kg(prev.vol), este.vol, prev.vol] : null,
          este.secs || prev.secs ? ['Tiempo entrenando', hm(este.secs), hm(prev.secs), este.secs, prev.secs] : null,
          este.km || prev.km ? ['Cardio', `${fmt1(este.km)} km`, `${fmt1(prev.km)} km`, este.km, prev.km] : null,
        ].filter(Boolean).map(([l, va1, vb1, va, vb]) => `<div class="pg-mt"><span class="pg-ml">${l}</span><span class="pg-mv on">${va1}</span><span class="pg-mv">${vb1}</span>${flecha(va, vb)}</div>`).join('');
      }
      return `<div class="pg-ph"><strong>${titulo}</strong>
          <span class="pg-seg" role="tablist"><button type="button" data-per="semana" class="${per === 'semana' ? 'on' : ''}">Semana</button><button type="button" data-per="mes" class="${per === 'mes' ? 'on' : ''}">Mes</button></span></div>
        <div class="pg-psub dim">${sub}</div>
        <div class="pg-mt pg-mthead"><span></span><span class="pg-mth on">${UI.esc(cols[0])}</span><span class="pg-mth">${UI.esc(cols[1])}</span><span></span></div>
        ${filasHTML}`;
    };

    // ---- Lo que sale al momento: títulos, botones y un skeleton donde va cada dato
    const constHead = '<div class="pg-h"><strong>Constancia</strong><span class="dim">entrenos por semana</span></div>';
    const musHead = '<div class="pg-h"><strong>Series por músculo</strong><span class="dim">esta semana</span></div>';
    const amigoHTML = hayAmigos(app) ? '' : `<button type="button" class="card pg-amigo" id="pgAmigo">
        <span class="pg-amigo-ic">${UI.icon('users', 18)}</span>
        <span><strong>Compárate con un amigo</strong><span class="dim">Cuando un amigo te pase su enlace de «Compartir mi progreso», veréis vuestro mes y vuestras marcas lado a lado.</span></span>
      </button>`;
    host.innerHTML = `<div class="card-label pg-sec">Tus logros recientes</div>
      <div id="pgLogros"><div class="pg-logros">${[0, 1].map(() => `<div class="pg-logro sk-card">${sk('55%', 12)}${sk('62%', 30, 'margin-top:14px')}${sk('80%', 14, 'margin-top:8px')}${sk('100%', 44, 'margin-top:16px')}</div>`).join('')}</div></div>
      <div class="card pg-mes" id="pgPer">${periodoHTML(periodo)}</div>
      <div class="card pg-const" id="pgConst">${constHead}
        <div class="pg-racha">${sk('44px', 34)}<div style="flex:1">${sk('72%', 14)}${sk('45%', 12, 'margin-top:6px')}</div></div>
        <div class="pg-weeks">${Array.from({ length: 12 }, () => '<div class="pg-wk"><span class="pg-wn"></span><span class="pg-wb"></span></div>').join('')}</div>
        ${sk('62%', 12, 'margin-top:12px')}
      </div>
      <div class="card pg-mus" id="pgMus">${musHead}${[0, 1, 2, 3].map(() => `<div class="pg-bar"><span>${sk('75%', 12)}</span><span class="pg-bt"></span><span></span></div>`).join('')}</div>
      ${amigoHTML}`;
    const amigoBtn = host.querySelector('#pgAmigo');
    if (amigoBtn) amigoBtn.addEventListener('click', () => VData.openShare(app));

    const perCard = host.querySelector('#pgPer');
    perCard.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-per]');
      if (!b || b.dataset.per === periodo) return;
      periodo = b.dataset.per;
      try { localStorage.setItem(PER_KEY, periodo); } catch (e) { /* no se recuerda, da igual */ }
      perCard.innerHTML = periodoHTML(periodo);
    });

    // ---- Cada parte carga lo suyo y se pinta sola
    const sesP = DB.sessionsOf(uid).then(l => l.filter(s => !s.draft && s.date));
    const catP = DB.exercisesOf(uid);

    // 1) Logros recientes (lo más lento: récords de todos los ejercicios)
    logrosRecientes(app, uid).then(logros => {
      if (!vivo()) return;
      const ICO = { peso: 'activity', record: 'trophy', desde: 'star' };
      const logroHTML = (l) => `<div class="pg-logro ${l.kind}">
        <div class="pg-lh"><span class="pg-lic">${UI.icon(ICO[l.kind], 15)}</span><span class="pg-tag">${UI.esc(l.tag)}</span></div>
        <span class="pg-big">${UI.esc(l.big)}</span>
        <span class="pg-txt">${UI.esc(l.txt)}</span>
        <span class="pg-sub">${UI.esc(l.sub || '')}</span>
        ${sparkSVG(l.spark)}
      </div>`;
      host.querySelector('#pgLogros').innerHTML = logros.length
        ? `<div class="pg-logros">${logros.slice(0, 8).map(logroHTML).join('')}</div>`
        : `<div class="card pg-vacio"><span class="dim">Sin logros en las últimas 2 semanas. Cuando batas una marca, o hagas lo mejor en mucho tiempo, saldrá aquí.</span></div>`;
    }).catch(err => { console.error(err); if (vivo()) host.querySelector('#pgLogros').innerHTML = `<div class="card">${skFallo}</div>`; });

    // 2) Semana | Mes y 3) Constancia: solo necesitan los entrenos
    sesP.then(sessions => {
      if (!vivo()) return;
      sesiones = sessions;
      perCard.innerHTML = periodoHTML(periodo);

      const curWk = weekIndex(now);
      const porSem = new Map();
      sessions.forEach(s => { const w = weekIndex(new Date(s.date + 'T00:00:00')); porSem.set(w, (porSem.get(w) || 0) + 1); });
      const semanas = new Set(porSem.keys());
      let racha = 0;
      const anchor = semanas.has(curWk) ? curWk : (semanas.has(curWk - 1) ? curWk - 1 : null);
      if (anchor != null) { let w = anchor; while (semanas.has(w)) { racha++; w--; } }
      let mejor = 0, run = 0, prevW = null;
      [...semanas].sort((a, b) => a - b).forEach(w => { run = prevW != null && w === prevW + 1 ? run + 1 : 1; mejor = Math.max(mejor, run); prevW = w; });
      const NW = 12;
      const cols = [];
      for (let i = NW - 1; i >= 0; i--) {
        const ini = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - i * 7);
        cols.push({ n: porSem.get(curWk - i) || 0, ini: isoOf(ini.getTime()), actual: i === 0 });
      }
      const maxN = Math.max(4, ...cols.map(c => c.n));
      const conEntreno = cols.filter(c => !c.actual);
      const media = conEntreno.reduce((a, c) => a + c.n, 0) / conEntreno.length;
      host.querySelector('#pgConst').innerHTML = `${constHead}
        <div class="pg-racha"><span class="pg-rn">${racha}</span><div><strong>${racha === 1 ? 'semana seguida' : 'semanas seguidas'} entrenando</strong><span class="dim">${mejor > racha ? `Tu mejor racha: ${mejor} semanas` : racha > 1 ? 'Es tu mejor racha' : 'Entrena esta semana para empezar una racha'}</span></div></div>
        <div class="pg-weeks">${cols.map(c => `<div class="pg-wk${c.actual ? ' now' : ''}"><span class="pg-wn">${c.n || ''}</span><span class="pg-wb"><i style="height:${c.n ? Math.max(8, c.n / maxN * 100) : 0}%"></i></span></div>`).join('')}</div>
        <div class="pg-wl"><span>${UI.fmtDateShort(cols[0].ini)}</span><span>${UI.fmtDateShort(cols[Math.floor(NW / 2)].ini)}</span><span>esta semana</span></div>
        <p class="pg-media dim">Media de las últimas ${NW - 1} semanas: <strong>${fmt1(media)}</strong> entrenos por semana</p>`;
    }).catch(err => {
      console.error(err);
      if (!vivo()) return;
      perCard.innerHTML = skFallo;
      host.querySelector('#pgConst').innerHTML = constHead + skFallo;
    });

    // 4) Series por músculo: entrenos + catálogo (para saber el grupo de cada ejercicio)
    Promise.all([sesP, catP]).then(([sessions, catalog]) => {
      if (!vivo()) return;
      const card = host.querySelector('#pgMus');
      const byId = new Map(catalog.map(e => [e.id, e])), byName = new Map(catalog.map(e => [UI.norm(e.name), e]));
      const grupoDe = (e) => { const ex = (e.exerciseId && byId.get(e.exerciseId)) || byName.get(UI.norm(e.name || '')); return (ex && ex.muscleGroup) || ''; };
      const iniSem = isoOf(lunes.getTime()), hace4 = isoOf(lunes.getTime() - 28 * DAY);
      const series = new Map(), habituales = new Set();
      sessions.forEach(s => (s.entries || []).forEach(e => {
        const g = grupoDe(e); if (!g || NO_MUSCULO.has(UI.norm(g))) return;
        const hechas = (e.sets || []).filter(st => st.done !== false && (parseFloat(st.reps) || parseFloat(st.weight) || parseFloat(st.time))).length;
        if (!hechas) return;
        if (s.date >= iniSem && s.date <= hoy) series.set(g, (series.get(g) || 0) + hechas);
        else if (s.date >= hace4 && s.date < iniSem) habituales.add(g);
      }));
      const sinTocar = [...habituales].filter(g => !series.has(g));
      const filas = [...series.entries()].sort((a, b) => b[1] - a[1]);
      if (!filas.length && !sinTocar.length) { card.remove(); return; }
      const maxS = Math.max(10, ...filas.map(f => f[1]));
      card.innerHTML = `${musHead}
        ${filas.map(([g, n]) => `<div class="pg-bar"><span class="pg-bn">${UI.esc(g)}</span><span class="pg-bt"><i style="width:${Math.max(4, n / maxS * 100)}%"></i></span><span class="pg-bv">${n}</span></div>`).join('')}
        ${sinTocar.map(g => `<div class="pg-bar off"><span class="pg-bn">${UI.esc(g)}</span><span class="pg-bt"></span><span class="pg-bv">0</span></div>`).join('')}
        ${sinTocar.length ? `<p class="pg-aviso">${UI.icon('info', 14)} ${UI.esc(lista(sinTocar))} ${sinTocar.length === 1 ? 'lo sueles entrenar y aún no lo has tocado' : 'los sueles entrenar y aún no los has tocado'} esta semana.</p>` : ''}`;
    }).catch(err => { console.error(err); if (vivo()) { const c = host.querySelector('#pgMus'); if (c) c.innerHTML = musHead + skFallo; } });

    // Sin nada todavía (ni entrenos ni pesajes): en vez de tarjetas vacías, la explicación
    Promise.all([sesP, pesosDe(uid)]).then(([s, p]) => {
      if (vivo() && !s.length && !p.length) host.innerHTML = `<div class="empty-state"><p><strong>Aquí verás cómo vas.</strong></p><p class="dim">Tus logros, tu semana y tu mes frente a los anteriores, tu constancia y qué músculos has trabajado. Aparece en cuanto guardes tu primer entreno o apuntes tu peso.</p></div>`;
    }).catch(() => {});
  }
  const lista = (arr) => arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`;

  // Lunes de la semana de una fecha, como índice entero de semanas (Mon=inicio).
  function weekIndex(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return Math.floor(dt.getTime() / (7 * 86400000));
  }

  // ---------- utilidades de Ejercicios, Récords y Comparar ----------
  function haceTxt(iso) {
    const d = diasEntre(iso, DB.todayISO());
    if (d <= 0) return 'hoy';
    if (d === 1) return 'ayer';
    if (d < 14) return `hace ${d} días`;
    if (d < 60) return `hace ${Math.round(d / 7)} semanas`;
    if (d < 365) { const m = Math.round(d / 30); return m <= 1 ? 'hace un mes' : `hace ${m} meses`; }
    return 'hace más de un año';
  }
  // Diferencia entre dos valores de una métrica, con su unidad («10 kg», «0:20 /km»…)
  function difTxt(metric, a, b) {
    const d = Math.abs(a - b);
    if (TIME_REC[metric]) return fmtSecs(d);
    if (LOWER_BETTER.has(metric)) return `${fmtPaceV(d)} /km`;
    if (metric === 'maxTime' || metric === 'totalTime') return fmtSecs(d);
    return `${nf(d, metric === 'distance' ? 2 : 1)}${METRIC_UNIT[metric] || ''}`;
  }
  const mejorQue = (metric, a, b) => (LOWER_BETTER.has(metric) ? a < b : a > b);
  // Qué puntos fueron récord en su momento (superaron todo lo anterior; el primero no cuenta)
  function marcarRecords(points, metric) {
    let best = null;
    return points.map((p, i) => { const r = !best || better(p, best, metric); if (r) best = p; return { ...p, rec: r && i > 0 }; });
  }
  // La marca principal de un ejercicio entre las que tiene (peso máx, distancia…)
  const principal = (marks) => marks.slice().sort((a, b) => {
    const ia = MAIN_METRICS.indexOf(a.metric), ib = MAIN_METRICS.indexOf(b.metric);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric);
  })[0];
  // Mini gráfica de una tarjeta de récord (en el color de la app)
  function sparkMini(pts, invert) {
    if (!pts || pts.length < 2) return '';
    const W = 96, H = 34;
    const xs = pts.map(p => isoMs(p.x)), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = (iso) => 3 + (x1 === x0 ? 0.5 : (isoMs(iso) - x0) / (x1 - x0)) * (W - 6);
    const Y = (v) => { const k = y1 === y0 ? 0.5 : (v - y0) / (y1 - y0); return 3 + (invert ? k : 1 - k) * (H - 6); };
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const l = pts[pts.length - 1];
    return `<svg class="rc-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}"/><circle cx="${X(l.x).toFixed(1)}" cy="${Y(l.y).toFixed(1)}" r="3"/></svg>`;
  }

  // ---------- RÉCORDS ----------
  // Una tarjeta por ejercicio con su marca principal y su mini gráfica; el resto de marcas, plegadas.
  async function renderRecords(app, host) {
    const uid = app.activeUser.id;
    const sort = host._recSort || 'recent';
    const SORTS = [{ id: 'recent', l: 'Recientes' }, { id: 'old', l: 'Hace tiempo' }, { id: 'name', l: 'A-Z' }];
    const cabecera = (cats) => `
      <input class="inp" id="recSearch" type="search" placeholder="Buscar ejercicio…" autocomplete="off" value="${UI.esc(host._recSearch || '')}">
      <div class="pg-seg rc-sort">${SORTS.map(s => `<button type="button" data-sort="${s.id}" class="${s.id === sort ? 'on' : ''}">${s.l}</button>`).join('')}</div>
      ${cats}
      ${sort === 'old' ? '<p class="rc-hint dim">Primero las marcas que llevas más tiempo sin superar. ¿Toca intentarlo?</p>' : ''}`;
    if (!host._pintado) {
      host.innerHTML = cabecera(`<div class="rc-cats">${UI.sk('100%', 30, 'border-radius:99px')}</div>`)
        + `<div id="recList">${[0, 1, 2].map(() => `<div class="rc-card">${UI.sk('55%', 16)}${UI.sk('30%', 11, 'margin-top:6px')}${UI.sk('40%', 26, 'margin-top:14px')}${UI.sk('35%', 11, 'margin-top:8px')}</div>`).join('')}</div>`;
    }
    const records = await computeRecords(app, uid);
    if (!host.isConnected) return;
    host._pintado = true;
    if (!records.length) { host.innerHTML = `<div class="empty-state"><p><strong>Aquí irán tus récords.</strong></p><p class="dim">Cada vez que superes una marca en un ejercicio (más peso, más reps, más km o mejor ritmo) quedará guardada aquí.</p></div>`; return; }

    // Agrupar por ejercicio con todas sus marcas
    const byEx = new Map();
    records.forEach(r => {
      const k = r.ex.name;
      if (!byEx.has(k)) byEx.set(k, { ex: r.ex, marks: [] });
      byEx.get(k).marks.push(r);
    });
    const groups = [...byEx.values()].map(g => {
      const main = principal(g.marks);
      const recent = g.marks.reduce((m, r) => ((r.point.x || '') > m ? r.point.x : m), '');
      return { ...g, main, recent, grp: g.ex.muscleGroup || 'General' };
    });
    if (sort === 'name') groups.sort((a, b) => a.ex.name.localeCompare(b.ex.name));
    else if (sort === 'old') groups.sort((a, b) => (a.main.point.x || '').localeCompare(b.main.point.x || ''));
    else groups.sort((a, b) => (b.recent || '').localeCompare(a.recent || ''));

    const cats = [...new Set(groups.map(g => g.grp))].sort((a, b) => a.localeCompare(b));
    const cat = cats.includes(host._recCat) ? host._recCat : '';
    const catsHTML = cats.length > 1
      ? `<div class="chips-row small rc-cats"><button class="chip${!cat ? ' on' : ''}" data-cat="">Todas</button>${cats.map(c => `<button class="chip${c === cat ? ' on' : ''}" data-cat="${UI.esc(c)}">${UI.esc(c)}</button>`).join('')}</div>`
      : '';

    const card = (g) => {
      const m = g.main;
      const sub = subDe(m.metric, m.point);
      const otras = g.marks.filter(r => r !== m).sort((a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric));
      return `<div class="rc-card" role="button" tabindex="0" data-ex="${UI.esc(g.ex.id)}" data-exname="${UI.esc(g.ex.name)}" data-search="${UI.esc(UI.norm(g.ex.name + ' ' + g.grp))}" data-cat="${UI.esc(g.grp)}">
        <div class="rc-top">
          <div class="rc-tit"><strong>${UI.esc(g.ex.name)}</strong><span>${UI.esc(g.grp)}</span></div>
          ${sparkMini((m.pts || []).slice(-14), LOWER_BETTER.has(m.metric))}
        </div>
        <div class="rc-main"><span class="rc-big">${UI.icon('trophy', 15)}${UI.esc(fmtMetricValue(m.metric, m.point.y))}</span><span class="rc-lbl">${UI.esc(METRIC_SHORT[m.metric] || '')}${sub ? ` · ${UI.esc(sub)}` : ''}</span></div>
        <div class="rc-when"><span>${UI.fmtDateShort(m.point.x)} · ${haceTxt(m.point.x)}</span><span class="rc-go">Ver progreso ›</span></div>
        ${otras.length ? `<details class="rc-more"><summary>${otras.length === 1 ? 'Su otra marca' : `Sus otras ${otras.length} marcas`}</summary>
          ${otras.map(r => `<div class="rc-row"><span>${UI.esc(METRIC_LABEL[r.metric] || r.metric)}</span><strong>${UI.esc(fmtMetricPoint(r.metric, r.point))}</strong><small>${UI.fmtDateShort(r.point.x)}</small></div>`).join('')}
        </details>` : ''}
      </div>`;
    };
    host.innerHTML = cabecera(catsHTML)
      + `<div id="recList">${groups.map(card).join('')}</div>
      <p class="dim" id="recNoRes" style="display:none;padding:12px 2px">Sin resultados.</p>`;

    const applyFilter = () => {
      const q = UI.norm(host._recSearch || '');
      const c = cats.includes(host._recCat) ? host._recCat : '';
      let any = false;
      host.querySelectorAll('.rc-card').forEach(row => {
        const vis = (!q || row.dataset.search.includes(q)) && (!c || row.dataset.cat === c);
        row.style.display = vis ? '' : 'none';
        if (vis) any = true;
      });
      host.querySelector('#recNoRes').style.display = any ? 'none' : '';
    };
    const si = host.querySelector('#recSearch');
    si.addEventListener('input', () => { host._recSearch = si.value; applyFilter(); }); // filtra sin repintar (mantiene el foco)
    host.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { if (b.dataset.sort === sort) return; host._recSort = b.dataset.sort; renderRecords(app, host); }));
    host.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      host._recCat = b.dataset.cat;
      host.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b));
      applyFilter();
    }));
    host.querySelectorAll('.rc-card').forEach(c => c.addEventListener('click', (ev) => {
      if (ev.target.closest('.rc-more')) return; // abrir o cerrar sus otras marcas no navega
      app.go('progress', { tab: 'exercise', exId: c.dataset.ex, exName: c.dataset.exname });
    }));
    applyFilter();
  }

  // ====================================================
  // Pestañas: Resumen · Corporal · Ejercicios (la lista con tu récord de cada uno; al tocar uno, su detalle).
  // «Comparar» solo aparece si tienes algún amigo (invitado) con quien compararte.
  const hayAmigos = (app) => Object.values(app.usersById || {}).some(u => !u.isMain);
  async function render(app, params) {
    if (params.tab === 'records') params.tab = 'exercise'; // la antigua pestaña Récords es ahora la lista de Ejercicios
    params.tab = params.tab || 'summary';
    const tab = params.tab;
    const tabs = [
      { id: 'summary', label: 'Resumen' },
      { id: 'body', label: 'Corporal' },
      { id: 'exercise', label: 'Ejercicios' },
      ...(hayAmigos(app) || tab === 'compare' ? [{ id: 'compare', label: 'Comparar' }] : []),
    ];
    const tabBar = `<div class="tabs pg-tabs${tabs.length === 3 ? ' pg-tabs3' : ''}">${tabs.map(t => `<button class="tab${tab === t.id ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>`;
    const host = { summary: 'tabSummary', body: 'tabBody', exercise: 'tabEx', compare: 'tabCompare' }[tab] || 'tabSummary';
    return tabBar + `<div id="${host}"><div class="card">${sk('45%', 14)}${sk('100%', 130, 'margin-top:14px')}</div><div class="card">${sk('60%', 14)}${sk('85%', 12, 'margin-top:10px')}${sk('70%', 12, 'margin-top:8px')}</div></div>`;
  }

  function bind(app, root, params) {
    const tab = params.tab || 'summary';
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => app.go('progress', { tab: b.dataset.tab }, true)));
    if (tab === 'summary') renderResumen(app, root.querySelector('#tabSummary'));
    else if (tab === 'body') renderBody(app, root.querySelector('#tabBody'));
    else if (tab === 'exercise') {
      // sin ejercicio elegido, la lista; con uno, su detalle (y «atrás» vuelve a la lista)
      if (params.exId || params.exName) renderExercise(app, root.querySelector('#tabEx'), params);
      else renderRecords(app, root.querySelector('#tabEx'));
    }
    else renderCompare(app, root.querySelector('#tabCompare'), params);
  }

  // ---------- CORPORAL ----------
  const RANGES = [{ id: '1m', label: '1 mes', days: 31 }, { id: '3m', label: '3 meses', days: 92 }, { id: '6m', label: '6 meses', days: 183 }, { id: '1a', label: '1 año', days: 366 }, { id: 'all', label: 'Todo', days: 0 }];
  // Lo fijo de Corporal (objetivo y «Apuntar»): funciona aunque los datos aún no hayan llegado
  function bindBodyFijos(app, host) {
    const gb = host.querySelector('#pwGoal');
    if (gb) gb.addEventListener('click', () => UI.pickFromList({
      title: 'Tu objetivo de peso',
      options: GOALS,
      value: app.activeUser.weightGoal || '',
      onPick: async (val) => {
        await DB.put('users', { ...app.activeUser, weightGoal: val });
        app.activeUser.weightGoal = val; // sin recargar perfiles: así no cambia el perfil activo
        renderBody(app, host);
        UI.toast(val ? `Objetivo: ${GOALS.find(g => g.value === val).label.toLowerCase()}` : 'Sin objetivo de peso');
      },
    }));
    const add = host.querySelector('#addProg');
    if (add) add.addEventListener('click', () => editProgress(app, null, () => renderBody(app, host)));
  }
  async function renderBody(app, host) {
    const u = app.activeUser;
    const goal = u.weightGoal || '';
    const range = host._range || '6m';
    if (!host._pintado) {
      // primera vez: la tarjeta con su título, el objetivo, los periodos y «Apuntar» al momento; skeletons en lo que depende de tus datos
      const gl = (GOALS.find(g => g.value === goal) || GOALS[3]).label;
      host.innerHTML = `<div class="card pw-card">
          <div class="pw-head"><span class="pw-title">Peso corporal</span><button type="button" class="pw-goal" id="pwGoal">Objetivo: <strong>${UI.esc(gl.toLowerCase())}</strong> ▾</button></div>
          ${sk('150px', 44)}${sk('64px', 13, 'margin-top:8px')}${sk('200px', 30, 'margin-top:12px;border-radius:99px')}
          <div class="pw-datos">${sk('100%', 62, 'border-radius:12px')}${sk('100%', 62, 'border-radius:12px')}</div>
          ${sk('100%', 170, 'margin-top:16px;border-radius:12px')}
          <div class="pg-seg pw-rangos">${RANGES.map(r => `<button type="button" class="${r.id === range ? 'on' : ''}" disabled>${r.label}</button>`).join('')}</div>
        </div>
        <button class="btn primary block" id="addProg">+ Apuntar peso o medidas</button>
        <div class="card-label pg-sec">Registros</div>
        <div class="card pr-list">${[0, 1, 2, 3].map(() => `<div class="pr-row">${sk('42px', 12)}${sk('70px', 15)}<span></span><span></span></div>`).join('')}</div>`;
      bindBodyFijos(app, host);
    }
    const [todasEntradas, ws] = await Promise.all([DB.progressOf(u.id), pesosDe(u.id)]);
    if (!host.isConnected) return;
    host._pintado = true;
    const entries = todasEntradas.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rDays = (RANGES.find(r => r.id === range) || RANGES[2]).days;
    const hoy = DB.todayISO();
    const enRango = (p) => !rDays || diasEntre(p.x, hoy) <= rDays;

    // --- Peso: el número de hoy, qué tiene de especial, el ritmo y la tendencia
    const ins = weightInsight(ws);
    const ph = weightPhrase(ins, goal);
    const trend = trendOf(ws);
    const rate = weeklyRate(trend);
    const raw = ws.map(e => ({ x: e.date, y: e.kg })).filter(enRango);
    // Vista de la gráfica: «Pesajes» (una línea con cada pesaje) o «Tendencia» (puntos suaves y la línea media).
    // Sin elegir, la app decide: tendencia si te pesas a menudo (unas 3 veces por semana o más en lo que se ve).
    const spanDias = raw.length > 1 ? Math.max(1, diasEntre(raw[0].x, raw[raw.length - 1].x)) : 1;
    const VISTA_KEY = 'traindia.pesoVista';
    let vista = host._vista;
    if (!vista) { try { vista = localStorage.getItem(VISTA_KEY); } catch (e) { vista = null; } }
    if (vista !== 'pesajes' && vista !== 'tendencia') vista = raw.length >= 8 && raw.length / (spanDias / 7) >= 3 ? 'tendencia' : 'pesajes';
    const conTendencia = vista === 'tendencia' && raw.length >= 3;
    // si te pesas poco, la media abarca más días (si no, saldría igual que tus pesajes)
    const ventana = Math.min(21, Math.max(5, raw.length > 1 ? (spanDias / (raw.length - 1)) * 1.2 : 5));
    const tr = trendLine(ws, ventana).filter(enRango);
    // línea de referencia: tu mínimo del periodo (o tu máximo si quieres subir), para ver «el más bajo desde…» de un vistazo
    let ref = null;
    if (raw.length >= 3) {
      const ys = raw.map(p => p.y);
      const v = goal === 'subir' ? Math.max(...ys) : Math.min(...ys);
      ref = { y: v, label: `${goal === 'subir' ? 'máx.' : 'mín.'} ${fmt1(v)} kg` };
    }
    const goalLbl = (GOALS.find(g => g.value === goal) || GOALS[3]).label;
    // dos datos: el ritmo y cuánto llevas desde tu máximo (o mínimo, si quieres subir)
    const datos = [];
    if (rate != null) datos.push({ v: Math.abs(rate) < 0.1 ? 'Estable' : `${signo(rate)} kg`, l: Math.abs(rate) < 0.1 ? 'en las últimas semanas' : 'por semana, de media' });
    if (ins && goal === 'subir' && ins.last.kg - ins.min.kg >= 0.5) datos.push({ v: `${signo(ins.last.kg - ins.min.kg)} kg`, l: `desde tu mínimo (${fmt1(ins.min.kg)} · ${UI.fmtDateShort(ins.min.date)})` });
    else if (ins && goal !== 'subir' && ins.max.kg - ins.last.kg >= 0.5) datos.push({ v: `${signo(ins.last.kg - ins.max.kg)} kg`, l: `desde tu máximo (${fmt1(ins.max.kg)} · ${UI.fmtDateShort(ins.max.date)})` });
    const cuando = ins ? (diasEntre(ins.last.date, hoy) === 0 ? 'Hoy' : diasEntre(ins.last.date, hoy) === 1 ? 'Ayer' : `El ${UI.fmtDateShort(ins.last.date)}`) : '';
    const pesoHTML = `<div class="card pw-card">
      <div class="pw-head"><span class="pw-title">Peso corporal</span><button type="button" class="pw-goal" id="pwGoal">Objetivo: <strong>${UI.esc(goalLbl.toLowerCase())}</strong> ▾</button></div>
      ${ins ? `<div class="pw-now"><span class="pw-num">${fmt1(ins.last.kg)}</span><span class="pw-unit">kg</span></div>
        <div class="pw-when">${cuando}</div>
        ${ph ? `<div class="pw-pill">${UI.icon('trophy', 14)}<span>${UI.esc(ph.txt)}</span></div>` : ''}
        ${datos.length ? `<div class="pw-datos">${datos.map(d => `<div><strong>${UI.esc(d.v)}</strong><span>${UI.esc(d.l)}</span></div>`).join('')}</div>` : ''}
        ${raw.length >= 3 ? `<div class="pw-vista">
          <span class="pg-seg"><button type="button" data-vista="pesajes" class="${conTendencia ? '' : 'on'}">Pesajes</button><button type="button" data-vista="tendencia" class="${conTendencia ? 'on' : ''}">Tendencia</button></span>
          ${conTendencia ? '<span class="pw-key"><b></b>pesajes <i></i>media</span>' : ''}
        </div>` : ''}
        ${raw.length ? UI.lineChart(conTendencia ? [
          { label: 'Pesajes', color: u.color, points: raw, noLine: true, r: 2.5, dotOpacity: 0.4, noLegend: true },
          { label: 'Tendencia', color: u.color, points: tr, width: 3, noDots: true, noLegend: true },
        ] : [
          { label: 'Peso', color: u.color, points: raw, width: 2.5, r: 3.5, noLegend: true },
        ], { width: 320, height: 160, noLegend: true, niceY: true, fmtY: (v) => fmt1(v).replace(',0', ''), refLines: ref ? [ref] : [], fmtPoint: (p) => `${fmt1(p.y)} kg` }) : '<div class="chart-empty">Sin pesajes en este periodo.</div>'}
        <div class="pg-seg pw-rangos">${RANGES.map(r => `<button type="button" class="${r.id === range ? 'on' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>`
      : '<p class="dim" style="margin:6px 0 0">Aún no has apuntado tu peso. Apúntalo de vez en cuando y aquí verás tu tendencia.</p>'}
    </div>`;

    // --- Medidas (cintura, cadera…): solo si hay alguna
    const OTRAS = MEASURES.filter(m => m.key !== 'weight' && entries.some(e => e[m.key] != null && e[m.key] !== ''));
    const mKey = (host._metric && OTRAS.some(m => m.key === host._metric)) ? host._metric : (OTRAS[0] && OTRAS[0].key);
    const mDef = OTRAS.find(m => m.key === mKey);
    const mPts = mDef ? entries.filter(e => e[mKey] != null && e[mKey] !== '').map(e => ({ x: e.date, y: parseFloat(e[mKey]) })).filter(p => !isNaN(p.y) && enRango(p)) : [];
    const medidasHTML = mDef ? `<div class="card">
      <div class="pw-head"><span class="pw-title">Medidas</span></div>
      <div class="chips-row small">${OTRAS.map(m => `<button class="chip${m.key === mKey ? ' on' : ''}" data-metric="${m.key}">${m.label}</button>`).join('')}</div>
      ${UI.lineChart([{ label: mDef.label, color: u.color, points: mPts }], { width: 320, height: 130, fmtPoint: (p) => `${p.y} ${mDef.unit}` })}
    </div>` : '';

    // cada registro con lo que cambió el peso respecto al anterior (verde si va hacia tu objetivo)
    const asc = entries.slice().reverse();
    const prevPeso = new Map();
    let ultimo = null;
    asc.forEach(e => { const w = parseFloat(e.weight); if (!isNaN(w)) { prevPeso.set(e.id, ultimo); ultimo = w; } });
    const VISIBLES = 8;
    const verTodos = !!host._todos;
    const fila = (e) => {
      const w = parseFloat(e.weight), pw = prevPeso.get(e.id);
      const dif = !isNaN(w) && pw != null ? Math.round((w - pw) * 10) / 10 : null;
      const bien = dif == null || dif === 0 || !goal || goal === 'mantener' ? '' : (goal === 'bajar' ? dif < 0 : dif > 0) ? ' good' : ' bad';
      const otras = MEASURES.filter(m => m.key !== 'weight' && e[m.key]).map(m => `${m.label} ${String(e[m.key]).replace('.', ',')}`).join(' · ');
      return `<div class="pr-row">
        <span class="pr-date">${UI.fmtDateShort(e.date)}</span>
        <span class="pr-main"><strong>${!isNaN(w) ? `${fmt1(w)} kg` : (otras ? 'Medidas' : '—')}</strong>${otras && !isNaN(w) ? `<span>${UI.esc(otras)}</span>` : otras ? `<span>${UI.esc(otras)}</span>` : ''}${e.notes ? `<span class="pr-note">${UI.esc(e.notes)}</span>` : ''}</span>
        ${dif != null ? `<span class="pr-dif${bien}">${dif === 0 ? '=' : signo(dif)}</span>` : '<span></span>'}
        <button class="icon-btn pr-more" data-more="${e.id}" aria-label="Opciones">${UI.icon('more', 18)}</button>
      </div>`;
    };
    const lista = (verTodos ? entries : entries.slice(0, VISIBLES)).map(fila).join('');

    host.innerHTML = `${pesoHTML}
      <button class="btn primary block" id="addProg">+ Apuntar peso o medidas</button>
      ${medidasHTML}
      ${entries.length ? `<div class="card-label pg-sec">Registros <span class="dim">(${entries.length})</span></div>
        <div class="card pr-list">${lista}</div>
        ${entries.length > VISIBLES ? `<button class="btn ghost block" id="prTodos">${verTodos ? 'Ver menos' : `Ver los ${entries.length}`}</button>` : ''}` : ''}`;

    host.querySelectorAll('[data-range]').forEach(c => c.addEventListener('click', () => { host._range = c.dataset.range; renderBody(app, host); }));
    host.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => {
      if (b.classList.contains('on')) return;
      host._vista = b.dataset.vista;
      try { localStorage.setItem(VISTA_KEY, host._vista); } catch (e) { /* no se recuerda, da igual */ }
      renderBody(app, host);
    }));
    host.querySelectorAll('[data-metric]').forEach(c => c.addEventListener('click', () => { host._metric = c.dataset.metric; renderBody(app, host); }));
    bindBodyFijos(app, host);
    const todos = host.querySelector('#prTodos');
    if (todos) todos.addEventListener('click', () => { host._todos = !host._todos; renderBody(app, host); });
    host.querySelectorAll('[data-more]').forEach(b => b.addEventListener('click', async () => {
      const e = await DB.get('progress', b.dataset.more);
      if (!e) return;
      UI.modal({
        title: `Registro del ${UI.fmtDateShort(e.date)}`,
        bodyHTML: `<div class="menu-list">
          <button class="menu-row" data-a="edit"><span>${UI.icon('edit', 16)} Editar</span><span class="chev">›</span></button>
          <button class="menu-row" data-a="share"><span>${UI.icon('upload', 16)} Compartir</span><span class="chev">›</span></button>
          <button class="menu-row danger" data-a="del"><span>${UI.icon('trash', 16)} Borrar</span><span class="chev">›</span></button>
        </div>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
        onMount: (root) => {
          root.querySelector('[data-a="edit"]').addEventListener('click', () => { UI.closeModal(root); editProgress(app, e, () => renderBody(app, host)); });
          root.querySelector('[data-a="share"]').addEventListener('click', () => { UI.closeModal(root); VData.exportProgressEntry(app, e.id); });
          root.querySelector('[data-a="del"]').addEventListener('click', async () => {
            UI.closeModal(root);
            const ok = await UI.confirm({ title: 'Borrar registro', message: `¿Borrar el registro del ${UI.fmtDateShort(e.date)}?`, confirmLabel: 'Borrar', danger: true });
            if (!ok) return;
            await DB.del('progress', e.id); renderBody(app, host); UI.toast('Registro borrado');
          });
        },
      });
    }));
  }

  function editProgress(app, existing, onSaved) {
    const isNew = !existing;
    const e = existing || { date: DB.todayISO() };
    UI.modal({
      title: isNew ? 'Nuevo registro' : 'Editar registro',
      bodyHTML: `<div id="progForm">
        ${UI.field('Fecha', UI.input('date', e.date, { type: 'date' }))}
        <div class="measure-grid">
          ${MEASURES.map(m => UI.field(`${m.label} (${m.unit})`, UI.input(m.key, e[m.key] != null ? e[m.key] : '', { type: 'number', step: m.step, placeholder: '—' }))).join('')}
        </div>
        ${UI.field('Notas', UI.textarea('notes', e.notes || '', 'Sensaciones, contexto…', 2))}
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          const d = UI.readForm(root.querySelector('#progForm'));
          const rec = { id: existing ? existing.id : DB.uid('prg'), userId: app.activeUser.id, date: d.date, notes: d.notes };
          MEASURES.forEach(m => { rec[m.key] = d[m.key] === '' ? null : parseFloat(d[m.key]); });
          await DB.put('progress', rec);
          UI.toast('Registro guardado');
          onSaved();
        }},
      ],
    });
  }

  // ---------- POR EJERCICIO ----------
  // Arriba el ejercicio (el último que hiciste) y qué medir; luego tu récord frente a la última vez,
  // la gráfica con cada nuevo récord marcado y el historial, que abre cada entreno.
  async function renderExercise(app, host, params) {
    const uid = app.activeUser.id;
    if (!host._pintado) {
      host.innerHTML = `<div class="card ex-card">
          ${UI.sk('65%', 22)}${UI.sk('45%', 12, 'margin-top:8px')}
          ${UI.sk('100%', 34, 'margin-top:16px;border-radius:99px')}
          <div class="pw-datos">${UI.sk('100%', 70, 'border-radius:12px')}${UI.sk('100%', 70, 'border-radius:12px')}</div>
          ${UI.sk('100%', 170, 'margin-top:16px;border-radius:12px')}
        </div>
        <div class="card-label pg-sec">Historial</div>
        <div class="card pr-list">${UI.skRows(4)}</div>`;
    }
    const [todos, sesAll, bws] = await Promise.all([DB.exercisesOf(uid), DB.sessionsOf(uid), loadBodyWeights(uid)]);
    if (!host.isConnected) return;
    host._pintado = true;
    const sessions = sesAll.filter(s => !s.draft);

    // Cuántas veces has hecho cada ejercicio y cuándo fue la última
    const uso = new Map();
    sessions.forEach(s => (s.entries || []).forEach(e => {
      if (!(e.sets || []).length || !e.name) return;
      const k = e.name.trim().toLowerCase();
      const u = uso.get(k) || { n: 0, last: '' };
      u.n++; if ((s.date || '') > u.last) u.last = s.date || '';
      uso.set(k, u);
    }));
    const usoDe = (c) => uso.get((c.name || '').trim().toLowerCase());
    const vistos = new Set();
    const catalog = todos.filter(c => {
      const k = (c.name || '').trim().toLowerCase();
      if (!usoDe(c) || vistos.has(k) || c.type === 'check') return false;
      vistos.add(k); return true;
    }).sort((a, b) => usoDe(b).last.localeCompare(usoDe(a).last) || a.name.localeCompare(b.name));
    if (!catalog.length) {
      host.innerHTML = `<div class="empty-state"><p><strong>Aquí verás cómo progresa cada ejercicio.</strong></p><p class="dim">En cuanto guardes un entreno, cada ejercicio que hagas tendrá su gráfica, su récord y su historial.</p></div>`;
      return;
    }
    const pedido = host._exId || (params && params.exId);
    const pedidoNombre = !host._exId && params && params.exName ? params.exName.trim().toLowerCase() : '';
    const ex = catalog.find(e => e.id === pedido) || (pedidoNombre && catalog.find(e => e.name.trim().toLowerCase() === pedidoNombre)) || catalog[0];
    const u = usoDe(ex);
    const metrics = metricsFor(ex);
    const metricSel = (host._metric && metrics.some(m => m.key === host._metric)) ? host._metric : metrics[0].key;

    // Filtro por variante (solo cardio con etiquetas apuntadas)
    const lname = ex.name.toLowerCase();
    const etiquetas = new Map(); // clave → { nombre más usado, cuántas }
    if (isCardioEx(ex)) sessions.forEach(s => (s.entries || []).forEach(e => {
      if ((e.name || '').toLowerCase() !== lname) return;
      (e.sets || []).forEach(st => {
        const k = labelKey(st.label); if (!k) return;
        const v = etiquetas.get(k) || { formas: new Map(), n: 0 };
        const f = String(st.label).trim(); v.formas.set(f, (v.formas.get(f) || 0) + 1); v.n++;
        etiquetas.set(k, v);
      });
    }));
    const cardioLabels = [...etiquetas.entries()].map(([k, v]) => ({ k, l: [...v.formas.entries()].sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => a.l.localeCompare(b.l));
    const labelF = (host._exLabel && etiquetas.has(host._exLabel)) ? host._exLabel : '';

    // «Tiempos»: la distancia elegida entre las que has llegado a hacer (por defecto, 5 km o la mayor)
    let distancias = [], metric = metricSel;
    if (metricSel === 'bestTime') {
      const maxKm = Math.max(0, ...(await metricSeries(uid, ex.name, 'distance', false, 'epley', labelF, { sessions, bodyWeights: bws })).points.map(p => p.y));
      distancias = Object.keys(TIME_REC).filter(k => maxKm >= TIME_REC[k] * 0.98);
      metric = distancias.includes(host._dist) ? host._dist : distancias.includes('time5k') ? 'time5k' : distancias[distancias.length - 1] || 'time1k';
    }
    const esRec = !NO_RECORD.has(metric);
    const sinPeso = ex.type === 'reps' && ['maxLoad', 'e1rm', 'volume'].includes(metric) && !bws.length;
    const isE1 = metric === 'e1rm';
    const effortOnly = isE1 ? (host._effortOnly !== false) : false; // por defecto activado
    const formula = app._e1Formula || 'epley';
    const { points: crudos, noEffort } = await metricSeries(uid, ex.name, metric, effortOnly, formula, labelF, { sessions, bodyWeights: bws });
    if (!host.isConnected) return;
    const points = esRec ? marcarRecords(crudos, metric) : crudos.map(p => ({ ...p, rec: false }));
    const hoy = DB.todayISO();
    const range = host._exRange || 'all';
    const rDays = (RANGES.find(r => r.id === range) || RANGES[RANGES.length - 1]).days;
    const vis = points.filter(p => !rDays || diasEntre(p.x, hoy) <= rDays);
    const pr = bestPoint(points, metric);
    const last = points[points.length - 1];
    const fmtPoint = (p) => fmtMetricPoint(metric, p);

    // Récord frente a la última vez
    let datosHTML = '';
    if (pr && !esRec) {
      const media = points.reduce((s, p) => s + p.y, 0) / points.length;
      datosHTML = `<div class="pw-datos ex-datos">
          <div><span class="ex-dl">Tu media</span><strong>${UI.esc(fmtMetricValue(metric, Math.round(media)))}</strong><span>de ${points.length} ${points.length === 1 ? 'salida' : 'salidas'}</span></div>
          <div><span class="ex-dl">Última vez</span><strong>${UI.esc(fmtMetricValue(metric, last.y))}</strong><span>${UI.esc([subDe(metric, last), UI.fmtDateShort(last.x)].filter(Boolean).join(' · '))}</span></div>
        </div>`;
    } else if (pr) {
      const subPr = [subDe(metric, pr), UI.fmtDateShort(pr.x)].filter(Boolean).join(' · ');
      const subLast = [subDe(metric, last), UI.fmtDateShort(last.x)].filter(Boolean).join(' · ');
      const esRecord = last === pr || (last.y === pr.y && !mejorQue(metric, pr.y, last.y));
      datosHTML = `<div class="pw-datos ex-datos">
          <div class="ex-pr"><span class="ex-dl">${UI.icon('trophy', 13)} Récord</span><strong>${UI.esc(fmtMetricValue(metric, pr.y))}</strong><span>${UI.esc(subPr)}</span></div>
          <div><span class="ex-dl">Última vez</span><strong>${UI.esc(fmtMetricValue(metric, last.y))}</strong><span>${UI.esc(subLast)}</span></div>
        </div>
        ${points.length > 1 ? `<div class="pw-pill${esRecord ? '' : ' ex-gap'}">${esRecord ? `${UI.icon('trophy', 14)}<span>La última vez fue tu récord</span>` : `<span>A ${UI.esc(difTxt(metric, pr.y, last.y))} de tu récord</span>`}</div>` : ''}`;
    }

    const helpOpen = host._e1Help === true; // explicación plegada por defecto
    const e1Panel = isE1 ? `
      <div class="e1-bar">
        <label class="check-row e1-toggle"><input type="checkbox" id="effOnly"${effortOnly ? ' checked' : ''}><span>Usar solo series con esfuerzo marcado</span></label>
        <button type="button" class="e1-help-btn" id="e1Help">${helpOpen ? 'Ocultar' : '¿Cómo funciona?'}</button>
      </div>
      <div class="e1-formula-row"><span class="e1-formula-label">Fórmula</span><div class="chips-row small">${E1_FORMULAS.map(f => `<button class="chip${formula === f.key ? ' on' : ''}" data-formula="${f.key}">${f.label}</button>`).join('')}</div></div>
      ${noEffort ? `<div class="e1-alert">${UI.icon('star', 15)}<span>No tienes series con <strong>esfuerzo marcado</strong> en este ejercicio, por eso la gráfica está vacía. Marca el % en tus series o desmarca el tick para calcular con todas.</span></div>` : ''}
      ${helpOpen ? `<div class="e1-help">
        <p><strong>Qué es el 1RM estimado</strong><br>Una predicción de cuánto levantarías a <strong>1 repetición</strong>, a partir del peso y las reps de tus series.</p>
        <p><strong>Epley vs Brzycki</strong><br>Dos fórmulas distintas para el mismo cálculo; puedes alternarlas a tu gusto. Coinciden casi exactamente <strong>alrededor de las 10 reps</strong>; por debajo de 10 Epley estima algo más alto y por encima de 10, Brzycki. Quédate con una y úsala siempre para comparar tu progreso.</p>
        <p><strong>El tick "solo esfuerzo"</strong><br>Cuenta solo las series donde marcaste el esfuerzo, dejando fuera los calentamientos. Si lo quitas, usa todas (las no marcadas se asumen al fallo). El % de esfuerzo indica las reps que te quedaban: 100% = al fallo, 90% ≈ 1, 80% ≈ 2…</p>
        <p><strong>Es una estimación, no un valor exacto</strong><br>Es una media estadística: tu número real puede variar. Para que se acerque lo máximo posible:</p>
        <ul class="e1-tips">
          <li>Marca bien el <strong>esfuerzo</strong> de tus series, sobre todo la más dura.</li>
          <li>Es más fiable con <strong>pocas reps (1–6)</strong>; con 10+ se desvía más.</li>
          <li>Mantén <strong>técnica y rango</strong> de movimiento consistentes.</li>
          <li>Influye estar <strong>descansado</strong> o fatigado por series previas.</li>
        </ul>
      </div>` : ''}` : '';

    const enteros = ['maxReps', 'kcal', 'volume'].includes(metric);
    const esTiempo = metric === 'maxTime' || metric === 'totalTime' || LOWER_BETTER.has(metric);
    const chart = vis.length
      ? UI.lineChart([{ label: ex.name, color: app.activeUser.color, points: vis.map(p => ({ ...p, mark: p.rec })), width: 2.5, r: 3.5, noLegend: true }],
        { width: 320, height: 170, noLegend: true, niceY: true, minStep: enteros ? 1 : esTiempo ? 5 : 0, ...(esTiempo ? chartOpts(metric) : { fmtY: (v) => nf(v) }), fmtPoint })
      : `<div class="chart-empty">${points.length ? 'Sin registros en este periodo.' : 'Aún no hay datos para esta métrica.'}</div>`;

    // Historial: lo último arriba, con lo que cambió respecto a la vez anterior
    const VISIBLES = 8;
    const desc = points.map((p, i) => ({ p, prev: points[i - 1] })).reverse();
    const fila = ({ p, prev }) => {
      let dif = '<span></span>';
      if (p.rec) dif = `<span class="pr-dif good">${UI.icon('trophy', 11)} Récord</span>`;
      else if (prev) {
        const d = p.y - prev.y;
        // en las marcas de fuerza o ritmo, verde si mejoras; en km, tiempo, kcal o volumen no hay «peor», solo el cambio
        const colorea = !['distance', 'totalTime', 'kcal', 'volume'].includes(metric);
        dif = Math.abs(d) < 1e-9 ? '<span class="pr-dif">=</span>' : `<span class="pr-dif${colorea ? (mejorQue(metric, p.y, prev.y) ? ' good' : ' bad') : ''}">${d > 0 ? '+' : '−'}${UI.esc(difTxt(metric, p.y, prev.y))}</span>`;
      }
      return `<button type="button" class="pr-row eh-row"${p.sid ? ` data-ses="${UI.esc(p.sid)}"` : ''}>
        <span class="pr-date">${UI.fmtDateShort(p.x)}</span>
        <span class="pr-main"><strong>${UI.esc(fmtMetricValue(metric, p.y))}</strong>${p.detail ? `<span>${UI.esc(p.detail)}</span>` : ''}</span>
        ${dif}<span class="chev">${p.sid ? '›' : ''}</span>
      </button>`;
    };
    const lista = (host._exTodos ? desc : desc.slice(0, VISIBLES)).map(fila).join('');

    host.innerHTML = `
      <div class="card ex-card">
        <button type="button" class="ex-pick" id="exSelBtn" aria-label="Cambiar de ejercicio">
          <span class="ex-name">${UI.esc(ex.name)}</span><span class="ex-change">${UI.icon('swap', 14)} Cambiar</span>
          <span class="ex-meta">${UI.esc(ex.muscleGroup || 'General')} · ${u.n} ${u.n === 1 ? 'entreno' : 'entrenos'} · último ${haceTxt(u.last)}</span>
        </button>
        ${cardioLabels.length > 1 || (cardioLabels.length === 1 && labelF) ? `<div class="chips-row small ex-label-row"><button class="chip${labelF === '' ? ' on' : ''}" data-exlabel="">Todas</button>${cardioLabels.map(l => `<button class="chip${labelF === l.k ? ' on' : ''}" data-exlabel="${UI.esc(l.k)}">${UI.esc(l.l)}</button>`).join('')}</div>` : ''}
        <div class="pg-seg ex-metrics${metrics.length > 4 ? ' ex-metrics-2' : ''}" style="--cols:${metrics.length > 4 ? 3 : metrics.length}">${metrics.map(m => `<button type="button" data-metric="${m.key}" class="${m.key === metricSel ? 'on' : ''}">${METRIC_SHORT[m.key] || m.label}</button>`).join('')}</div>
        ${distancias.length ? `<div class="chips-row small ex-dist">${distancias.map(k => `<button class="chip${k === metric ? ' on' : ''}" data-dist="${k}">${TIME_REC_SHORT[k]}</button>`).join('')}</div>` : ''}
        <p class="ex-hint dim">${UI.esc(METRIC_HINT[metricSel] || '')}</p>
        ${metricSel === 'bestTime' && !distancias.length ? '<div class="chart-empty">Aún no tienes ninguna salida de 1 km o más.</div>' : ''}
        ${e1Panel}
        ${sinPeso ? `<div class="e1-alert">${UI.icon('star', 15)}<span>Para el peso de los ejercicios con tu propio peso hace falta tu <strong>peso corporal</strong>: apúntalo en <strong>Progreso → Corporal</strong> y se calcula solo (corporal ± lastre o asistencia).</span></div>` : ''}
        ${datosHTML}
        ${vis.some(p => p.rec) ? '<div class="pw-key ex-key"><u></u>nuevo récord</div>' : ''}
        ${chart}
        ${points.length ? `<div class="pg-seg pw-rangos">${RANGES.map(r => `<button type="button" class="${r.id === range ? 'on' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>` : ''}
      </div>
      ${points.length ? `<div class="card-label pg-sec">Historial <span class="dim">(${points.length})</span></div>
        <div class="card pr-list">${lista}</div>
        ${points.length > VISIBLES ? `<button class="btn ghost block" id="exTodos">${host._exTodos ? 'Ver menos' : `Ver los ${points.length}`}</button>` : ''}` : ''}`;

    const re = () => { host._exId = ex.id; renderExercise(app, host, params); };
    host.querySelector('#exSelBtn').addEventListener('click', () => UI.pickFromList({
      title: 'Elegir ejercicio',
      options: catalog.map(c => { const n = usoDe(c).n; return { value: c.id, label: c.name, group: c.muscleGroup || 'General', hint: `${c.muscleGroup || 'General'} · ${n} ${n === 1 ? 'registro' : 'registros'} · ${haceTxt(usoDe(c).last)}` }; }),
      value: ex.id,
      onPick: (val) => { host._exId = val; host._metric = null; host._exLabel = ''; host._exTodos = false; renderExercise(app, host, params); },
    }));
    host.querySelectorAll('[data-metric]').forEach(c => c.addEventListener('click', () => { host._metric = c.dataset.metric; re(); }));
    host.querySelectorAll('[data-exlabel]').forEach(c => c.addEventListener('click', () => { host._exLabel = c.dataset.exlabel; re(); }));
    host.querySelectorAll('[data-range]').forEach(c => c.addEventListener('click', () => { host._exRange = c.dataset.range; re(); }));
    host.querySelectorAll('[data-dist]').forEach(c => c.addEventListener('click', () => { host._dist = c.dataset.dist; re(); }));
    const effChk = host.querySelector('#effOnly');
    if (effChk) effChk.addEventListener('change', () => { host._effortOnly = effChk.checked; re(); });
    const helpBtn = host.querySelector('#e1Help');
    if (helpBtn) helpBtn.addEventListener('click', () => { host._e1Help = !host._e1Help; re(); });
    host.querySelectorAll('[data-formula]').forEach(b => b.addEventListener('click', () => { app._e1Formula = b.dataset.formula; re(); }));
    const todosBtn = host.querySelector('#exTodos');
    if (todosBtn) todosBtn.addEventListener('click', () => { host._exTodos = !host._exTodos; re(); });
    host.querySelectorAll('[data-ses]').forEach(b => b.addEventListener('click', () => app.go('session', { sessionId: b.dataset.ses, ownerId: uid })));
  }

  // ---------- COMPARAR ----------
  // Tú y un amigo (su perfil llega con su enlace de «Compartir mi progreso»): vuestro mes,
  // los ejercicios que hacéis los dos y una gráfica con los dos.
  async function renderCompare(app, host, params) {
    if (!host._pintado) {
      host.innerHTML = `<div class="card">${UI.sk('50%', 16)}${UI.sk('100%', 120, 'margin-top:14px;border-radius:12px')}</div>
        <div class="card">${UI.sk('60%', 16)}${UI.skRows(3)}</div>`;
    }
    const users = await DB.getUsers();
    if (!host.isConnected) return;
    host._pintado = true;
    const me = app.mainUser;
    const guests = users.filter(u => !u.isMain);
    if (!guests.length) {
      host.innerHTML = `<div class="empty-state"><p><strong>Compárate con un amigo</strong></p><p class="dim">Cuando un amigo te pase su enlace de «Compartir mi progreso» y lo abras, aparecerá aquí: veréis vuestro mes, vuestras marcas en los ejercicios que hacéis los dos y vuestras gráficas, lado a lado.</p></div>`;
      return;
    }
    const guestId = guests.some(g => g.id === host._guestId) ? host._guestId : (params && guests.some(g => g.id === params.guestId) ? params.guestId : guests[0].id);
    const guest = guests.find(g => g.id === guestId);
    const [misS, susS, misR, susR, misW, susW] = await Promise.all([
      DB.sessionsOf(me.id), DB.sessionsOf(guest.id), computeRecords(app, me.id), computeRecords(app, guest.id), loadBodyWeights(me.id), loadBodyWeights(guest.id),
    ]);
    if (!host.isConnected) return;
    const mis = misS.filter(s => !s.draft && s.date), suyas = susS.filter(s => !s.draft && s.date);
    const quien = (u, txt) => `<span class="cp-who"><i style="background:${u.color || '#4f46e5'}"></i>${UI.esc(txt)}</span>`;

    // 1) Este mes, del 1 a hoy
    const hoy = DB.todayISO(), now = new Date();
    const ini = isoOf(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
    const a = statsDe(mis, ini, hoy), b = statsDe(suyas, ini, hoy);
    const hace8 = isoOf(Date.now() - 56 * DAY);
    const media = (ss) => ss.filter(s => s.date > hace8 && s.date <= hoy).length / 8;
    const kg = (v) => v >= 1000 ? `${fmt1(v / 1000)} t` : `${Math.round(v)} kg`;
    const hm = (s) => s >= 3600 ? `${fmt1(s / 3600)} h` : `${Math.round(s / 60)} min`;
    const filas = [
      ['Entrenos', String(a.n), String(b.n), a.n, b.n],
      a.vol || b.vol ? ['Peso levantado', kg(a.vol), kg(b.vol), a.vol, b.vol] : null,
      a.secs || b.secs ? ['Tiempo entrenando', hm(a.secs), hm(b.secs), a.secs, b.secs] : null,
      a.km || b.km ? ['Cardio', `${fmt1(a.km)} km`, `${fmt1(b.km)} km`, a.km, b.km] : null,
      ['Entrenos por semana', fmt1(media(mis)), fmt1(media(suyas)), media(mis), media(suyas)],
    ].filter(Boolean);
    const celda = (txt, gana) => `<span class="pg-mv${gana ? ' on' : ''}">${txt}</span>`;
    const mesHTML = `<div class="card">
      <div class="pg-h"><strong>Este mes</strong><span class="dim">del 1 a hoy · por semana, las últimas 8</span></div>
      <div class="pg-mt pg-mthead cp-mt"><span></span><span class="pg-mth">${quien(me, 'Tú')}</span><span class="pg-mth">${quien(guest, guest.name)}</span></div>
      ${filas.map(([l, va, vb, x, y]) => `<div class="pg-mt cp-mt"><span class="pg-ml">${l}</span>${celda(va, x > y)}${celda(vb, y > x)}</div>`).join('')}
    </div>`;

    // 2) Ejercicios que hacéis los dos: la marca principal de cada uno
    const agrupa = (recs) => { const m = new Map(); recs.forEach(r => { const k = r.ex.name.trim().toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
    const misM = agrupa(misR), susM = agrupa(susR);
    const comunes = [];
    misM.forEach((marks, k) => {
      const suyos = susM.get(k);
      if (!suyos) return;
      // con tu propio peso (dominadas, fondos…) el «peso máx» es casi tu peso corporal: entre dos personas se comparan las reps
      const orden = marks[0].ex.type === 'reps' ? ['maxReps', ...MAIN_METRICS] : MAIN_METRICS;
      const metr = orden.find(mm => marks.some(r => r.metric === mm) && suyos.some(r => r.metric === mm));
      if (!metr) return;
      const mio = marks.find(r => r.metric === metr), suyo = suyos.find(r => r.metric === metr);
      const reciente = marks.reduce((x, r) => ((r.point.x || '') > x ? r.point.x : x), '');
      comunes.push({ name: mio.ex.name, metric: metr, mio, suyo, reciente });
    });
    comunes.sort((x, y) => y.reciente.localeCompare(x.reciente));
    const VIS = 6;
    const comHTML = comunes.length ? `<div class="card">
      <div class="pg-h"><strong>Lo que hacéis los dos</strong><span class="dim">vuestra mejor marca</span></div>
      <div class="cp-row cp-head"><span></span><span>${quien(me, 'Tú')}</span><span>${quien(guest, guest.name)}</span></div>
      ${(host._cpTodos ? comunes : comunes.slice(0, VIS)).map(c => {
        const ga = mejorQue(c.metric, c.mio.point.y, c.suyo.point.y), gb = mejorQue(c.metric, c.suyo.point.y, c.mio.point.y);
        return `<button type="button" class="cp-row" data-subject="${UI.esc('ex:' + c.name)}" data-m="${c.metric}">
          <span class="cp-ex"><strong>${UI.esc(c.name)}</strong><small>${UI.esc(METRIC_SHORT[c.metric] || '')}</small></span>
          <span class="cp-v${ga ? ' on' : ''}">${UI.esc(fmtMetricValue(c.metric, c.mio.point.y))}</span>
          <span class="cp-v${gb ? ' on' : ''}">${UI.esc(fmtMetricValue(c.metric, c.suyo.point.y))}</span>
        </button>`;
      }).join('')}
      ${comunes.length > VIS ? `<button class="btn ghost block" id="cpTodos" style="margin-top:8px">${host._cpTodos ? 'Ver menos' : `Ver los ${comunes.length}`}</button>` : ''}
    </div>` : `<div class="card"><div class="pg-h"><strong>Lo que hacéis los dos</strong></div><p class="dim" style="margin:0;font-size:13px">Aún no hay ningún ejercicio que hayáis apuntado los dos.</p></div>`;

    // 3) La gráfica de los dos: peso corporal o un ejercicio
    const subjectKey = host._subject || (comunes[0] ? 'ex:' + comunes[0].name : 'body:weight');
    let series = [], exMetrics = [], exMetric = null, titulo = 'Peso corporal';
    if (subjectKey === 'body:weight') {
      series = [
        { label: 'Tú', color: me.color, points: misW.map(e => ({ x: e.date, y: e.kg })), width: 2.5 },
        { label: guest.name, color: guest.color, points: susW.map(e => ({ x: e.date, y: e.kg })), width: 2.5 },
      ];
    } else {
      const exName = subjectKey.slice(3);
      const subj = misR.find(r => r.ex.name === exName);
      exMetrics = metricsFor(subj && subj.ex).filter(m => m.key !== 'bestTime');
      const comun = comunes.find(c => c.name === exName);
      if (comun && TIME_REC[comun.metric]) exMetrics = [{ key: comun.metric, label: TIME_REC_LABEL[comun.metric] }, ...exMetrics];
      exMetric = (host._exMetric && exMetrics.some(m => m.key === host._exMetric)) ? host._exMetric : (comunes.find(c => c.name === exName) || {}).metric || exMetrics[0].key;
      if (!exMetrics.some(m => m.key === exMetric)) exMetric = exMetrics[0].key;
      const e1f = app._e1Formula || 'epley';
      const [pa, pb] = await Promise.all([
        metricSeries(me.id, exName, exMetric, exMetric === 'e1rm', e1f, '', { sessions: mis, bodyWeights: misW }),
        metricSeries(guest.id, exName, exMetric, exMetric === 'e1rm', e1f, '', { sessions: suyas, bodyWeights: susW }),
      ]);
      if (!host.isConnected) return;
      series = [
        { label: 'Tú', color: me.color, points: pa.points, width: 2.5 },
        { label: guest.name, color: guest.color, points: pb.points, width: 2.5 },
      ];
      titulo = exName;
    }
    const subjectOptions = [{ value: 'body:weight', label: 'Peso corporal' }]
      .concat(comunes.map(c => ({ value: 'ex:' + c.name, label: c.name, hint: 'Lo hacéis los dos' })))
      .concat([...misM.values()].map(ms => ms[0].ex.name).filter(n => !comunes.some(c => c.name === n)).sort((x, y) => x.localeCompare(y)).map(n => ({ value: 'ex:' + n, label: n, hint: `Solo tú` })));
    const esTiempo = exMetric && (exMetric === 'maxTime' || exMetric === 'totalTime' || LOWER_BETTER.has(exMetric));
    const chartHTML = `<div class="card" id="cpChart">
      <div class="pg-h"><strong>Gráfica</strong></div>
      ${UI.selectButton('subjectSelBtn', titulo)}
      ${exMetrics.length > 1 ? `<div class="pg-seg ex-metrics${exMetrics.length > 4 ? ' ex-metrics-2' : ''}" style="margin-top:10px;--cols:${exMetrics.length > 4 ? 3 : exMetrics.length}">${exMetrics.map(m => `<button type="button" data-exmetric="${m.key}" class="${m.key === exMetric ? 'on' : ''}">${METRIC_SHORT[m.key] || m.label}</button>`).join('')}</div>` : ''}
      <div class="cp-legend">${quien(me, 'Tú')}${quien(guest, guest.name)}</div>
      ${UI.lineChart(series, { width: 320, height: 170, noLegend: true, niceY: true, ...(esTiempo ? chartOpts(exMetric) : { fmtY: (v) => nf(v) }), fmtPoint: subjectKey === 'body:weight' ? (p => `${fmt1(p.y)} kg`) : (p => fmtMetricPoint(exMetric, p)) })}
    </div>`;

    host.innerHTML = `${guests.length > 1 ? `<div class="chips-row cp-guests">${guests.map(g => `<button class="chip${g.id === guest.id ? ' on' : ''}" data-guest="${g.id}">${UI.esc(g.name)}</button>`).join('')}</div>` : ''}
      ${mesHTML}${comHTML}${chartHTML}`;

    host.querySelectorAll('[data-guest]').forEach(b => b.addEventListener('click', () => { host._guestId = b.dataset.guest; host._subject = null; host._exMetric = null; renderCompare(app, host, params); }));
    host.querySelector('#subjectSelBtn').addEventListener('click', () => UI.pickFromList({
      title: '¿Qué queréis comparar?',
      options: subjectOptions,
      value: subjectKey,
      onPick: (val) => { host._subject = val; host._exMetric = null; renderCompare(app, host, params); },
    }));
    host.querySelectorAll('[data-exmetric]').forEach(c => c.addEventListener('click', () => { host._exMetric = c.dataset.exmetric; renderCompare(app, host, params); }));
    host.querySelectorAll('.cp-row[data-subject]').forEach(r => r.addEventListener('click', async () => {
      host._subject = r.dataset.subject; host._exMetric = r.dataset.m;
      await renderCompare(app, host, params);
      const c = host.querySelector('#cpChart');
      if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const t = host.querySelector('#cpTodos');
    if (t) t.addEventListener('click', () => { host._cpTodos = !host._cpTodos; renderCompare(app, host, params); });
  }

  return { render, bind };
})();
