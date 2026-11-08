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
    { key: 'totalTime', label: 'Tiempo total' },
    { key: 'pace', label: 'Ritmo (min/km)' },            // salidas de 1 km o más; récord = el más bajo
    { key: 'bestSet', label: 'Mejor serie (min/km)' },   // la serie más rápida (series de 400 m…)
    { key: 'kcal', label: 'Kcal' },
  ];
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
  const LOWER_BETTER = new Set(['pace', 'bestSet']);
  const fmtPaceV = (sec) => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const METRIC_LABEL = {};
  EX_METRICS.concat(TIME_METRICS).forEach(m => { METRIC_LABEL[m.key] = m.label; });
  METRIC_LABEL.maxLoad = 'Peso máx levantado'; // récord: mayor (corporal+lastre) en una serie
  // Orden de las marcas dentro de la tarjeta de cada ejercicio en "Récords".
  const METRIC_ORDER = ['maxWeight', 'e1rm', 'maxReps', 'maxLoad', 'volume', 'distance', 'pace', 'bestSet', 'totalTime', 'kcal', 'maxTime'];

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
    if (LOWER_BETTER.has(metric)) return `${fmtPaceV(y)} /km`;
    if (metric === 'maxTime' || metric === 'totalTime') return fmtSecs(y);
    return `${y}${METRIC_UNIT[metric] || ''}`;
  }
  // valor formateado de un punto con su unidad + condiciones (ej. "90 kg × 3")
  function fmtMetricPoint(metric, p) {
    const base = fmtMetricValue(metric, p.y);
    return p.detail ? `${base} ${p.detail}` : base;
  }
  // opciones de la gráfica según la métrica (eje con mm:ss y, en el ritmo, invertido)
  const chartOpts = (metric) => LOWER_BETTER.has(metric) ? { fmtY: fmtPaceV, invertY: true }
    : (metric === 'maxTime' || metric === 'totalTime') ? { fmtY: fmtSecs } : {};

  // Serie del 1RM respetando "solo esfuerzo"; si no hay ninguna serie con
  // esfuerzo marcado, cae a usar todas (y avisa con fellBack). Para el resto de
  // métricas devuelve la serie normal.
  async function metricSeries(userId, name, metric, effortOnly, formula, label) {
    if (metric !== 'e1rm' || !effortOnly) {
      return { points: await exerciseSeries(userId, name, metric, { effortOnly: false, formula, label }), noEffort: false };
    }
    // tick activo: solo series con esfuerzo. Si no hay ninguna pero sí hay datos,
    // se deja la gráfica vacía y se marca noEffort para avisar (no se usan todas).
    const pts = await exerciseSeries(userId, name, metric, { effortOnly: true, formula, label });
    if (pts.length) return { points: pts, noEffort: false };
    const all = await exerciseSeries(userId, name, metric, { effortOnly: false, formula, label });
    return { points: [], noEffort: all.length > 0 };
  }
  // Etiquetas/variantes usadas por un ejercicio en las sesiones (para el filtro de cardio).
  async function exerciseLabels(userId, exName) {
    const lname = exName.toLowerCase();
    const set = new Set();
    (await DB.sessionsOf(userId)).filter(s => !s.draft).forEach(s => (s.entries || []).forEach(e => {
      if ((e.name || '').toLowerCase() === lname) (e.sets || []).forEach(st => { if (st.label) set.add(st.label.trim()); });
    }));
    return [...set].sort((a, b) => a.localeCompare(b));
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
    let sessions = (await DB.sessionsOf(userId)).filter(s => !s.draft);
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
        if (labelFilter && !(e.sets || []).some(st => (st.label || '').trim() === labelFilter)) return; // solo la variante elegida
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
      const y = map[metric] || 0;
      if (metric === 'e1rm' && best1rm <= 0) return; // sin series válidas (p.ej. effortOnly y sin esfuerzo)
      // condiciones de la marca + desempate. La "tie" mayor = mejor marca a igual valor.
      let detail = '', tie = 0;
      if (metric === 'maxWeight' && bestW) { detail = bestW.r ? `× ${bestW.r}` : ''; tie = bestW.r; }            // + reps a igual peso
      else if (metric === 'e1rm' && best1rmSet) { detail = `de ${best1rmSet.w} kg × ${best1rmSet.r}${best1rmSet.eff ? ` · ${best1rmSet.eff}` : ''}`; tie = best1rmSet.w; } // serie origen del 1RM
      else if (metric === 'maxReps' && bestR) { // con tu peso: si llevabas lastre o asistencia; con barra: el peso
        detail = e_isReps ? (bestR.mode && bestR.load ? (bestR.mode === 'asist' ? `con asistencia (−${bestR.load} kg)` : `con +${bestR.load} kg`) : '') : (bestR.w ? `@ ${bestR.w} kg` : '');
        tie = bestR.w; }
      else if (metric === 'distance' && distance > 0) { detail = totalTime ? `en ${fmtSecs(totalTime)}` : ''; tie = -totalTime; } // − tiempo a igual distancia
      else if (metric === 'kcal' && kcal > 0) { detail = totalTime ? `en ${fmtSecs(totalTime)}` : ''; }
      else if (metric === 'maxTime' && distR > 0) { detail = `· ${distR} km`; tie = distR; }                      // + distancia a igual tiempo
      else if (metric === 'totalTime' && distR > 0) { detail = `· ${distR} km`; tie = distR; }                    // tiempo total (cardio) + distancia
      else if (metric === 'pace') { detail = `· ${distR} km en ${fmtSecs(totalTime)}`; tie = distR; }            // a igual ritmo, gana la más larga
      else if (metric === 'bestSet' && bestSetInfo) { detail = `· ${bestSetInfo.m} m en ${fmtSecs(bestSetInfo.t)}`; tie = bestSetInfo.m; }
      else if (metric === 'maxLoad' && bestLoad) { // peso máx levantado: reps de la serie + lastre/asistencia
        const extra = bestLoad.mode && bestLoad.load ? ` (${bestLoad.mode === 'asist' ? '−' : '+'}${bestLoad.load} kg)` : '';
        detail = `${bestLoad.r ? `× ${bestLoad.r}` : ''}${extra}`.trim();
        tie = bestLoad.r;
      }
      if (!(y > 0)) return; // un 0 no es una marca (p. ej. peso de la serie en ejercicios con tu peso)
      points.push({ x: s.date, y, detail, tie });
    });
    return points;
  }

  // Métrica representativa de cada ejercicio para "récords" (la primera con datos).
  // Métricas a guardar como récord de un ejercicio. Un ejercicio puede tener VARIAS
  // (las que no tengan datos se descartan luego). Así "un ejercicio no es solo de algo".
  function recordMetrics(ex) {
    if (ex.type === 'check') return [];  // hecho / no hecho: no hay métrica que seguir
    if (ex.type === 'time') return isCardioEx(ex) ? ['distance', 'pace', 'bestSet', 'totalTime', 'kcal'] : ['maxTime', 'maxLoad'];
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
        const pts = await exerciseSeries(userId, ex.name, metric, { bodyWeights });
        const best = bestPoint(pts, metric);
        if (best && best.y > 0) out.push({ ex, metric, point: best });
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
  const MAIN_METRICS = ['maxWeight', 'maxLoad', 'maxReps', 'distance', 'pace', 'maxTime', 'bestSet'];
  const NO_MUSCULO = new Set(['calentamiento', 'movilidad', 'cardio', 'carrera', 'estiramientos', 'general']);
  const RECIENTE_DIAS = 14;

  // Logros de las últimas 2 semanas: peso, récords y «lo mejor desde».
  async function logrosRecientes(app, uid) {
    const hoy = DB.todayISO();
    const out = [];
    // Peso
    const ws = await pesosDe(uid);
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
    const records = await computeRecords(app, uid);
    const porEj = new Map();
    const SIN_LOGRO = new Set(['calentamiento', 'movilidad', 'estiramientos']);
    const CORRER = new Set(['carrera', 'cardio']);
    records.forEach(r => {
      if (!MAIN_METRICS.includes(r.metric)) return;
      const g = UI.norm(r.ex.muscleGroup || '');
      const cardio = ['distance', 'pace', 'bestSet'].includes(r.metric);
      if (SIN_LOGRO.has(g) && !cardio) return;                          // calentar no es una marca (correr más km sí, esté donde esté)
      if (r.metric === 'maxTime' && CORRER.has(g)) return;             // en carrera, la serie más larga es la más lenta
      const cur = porEj.get(r.ex.name);
      if (!cur || MAIN_METRICS.indexOf(r.metric) < MAIN_METRICS.indexOf(cur.metric)) porEj.set(r.ex.name, r);
    });
    const conRecord = new Set();
    const bodyWeights = await loadBodyWeights(uid);
    for (const r of [...porEj.values()].filter(r => diasEntre(r.point.x, hoy) <= RECIENTE_DIAS)) {
      conRecord.add(r.ex.name);
      const pts = await exerciseSeries(uid, r.ex.name, r.metric, { bodyWeights });
      out.push({ kind: 'record', date: r.point.x, tag: `Récord · ${UI.fmtDateShort(r.point.x)}`, big: fmtMetricValue(r.metric, r.point.y), txt: r.ex.name, sub: subDe(r.metric, r.point), spark: { pts: pts.filter(p => p.x <= r.point.x).slice(-12), invert: LOWER_BETTER.has(r.metric) } });
    }
    // «Lo mejor desde»: lo último que hiciste no es récord, pero no lo igualabas desde hace un mes o más
    for (const r of porEj.values()) {
      if (conRecord.has(r.ex.name)) continue;
      const pts = await exerciseSeries(uid, r.ex.name, r.metric, { bodyWeights });
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
    const d = (p.detail || '').trim();
    if (metric === 'maxWeight' || metric === 'maxLoad') { const m = d.match(/^× (\d+)(.*)$/); return m ? `${m[1]} repeticiones${m[2]}` : d; }
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

  async function renderResumen(app, host) {
    const uid = app.activeUser.id;
    const sessions = (await DB.sessionsOf(uid)).filter(s => !s.draft && s.date);
    const hoy = DB.todayISO(), now = new Date();
    if (!sessions.length && !(await pesosDe(uid)).length) {
      host.innerHTML = `<div class="empty-state"><p><strong>Aquí verás cómo vas.</strong></p><p class="dim">Tus logros, tu semana y tu mes frente a los anteriores, tu constancia y qué músculos has trabajado. Aparece en cuanto guardes tu primer entreno o apuntes tu peso.</p></div>`;
      return;
    }

    // 1) Logros recientes
    const logros = await logrosRecientes(app, uid);
    const ICO = { peso: 'activity', record: 'trophy', desde: 'star' };
    const logroHTML = (l) => `<div class="pg-logro ${l.kind}">
      <div class="pg-lh"><span class="pg-lic">${UI.icon(ICO[l.kind], 15)}</span><span class="pg-tag">${UI.esc(l.tag)}</span></div>
      <span class="pg-big">${UI.esc(l.big)}</span>
      <span class="pg-txt">${UI.esc(l.txt)}</span>
      <span class="pg-sub">${UI.esc(l.sub || '')}</span>
      ${sparkSVG(l.spark)}
    </div>`;
    const logrosHTML = logros.length
      ? `<div class="pg-logros">${logros.slice(0, 8).map(logroHTML).join('')}</div>`
      : `<div class="card pg-vacio"><span class="dim">Sin logros en las últimas 2 semanas. Cuando batas una marca, o hagas lo mejor en mucho tiempo, saldrá aquí.</span></div>`;

    // 2) Esta semana frente a la pasada (de lunes al mismo día) o, con un toque, este mes frente al anterior (del 1 al mismo día)
    const y = now.getFullYear(), m = now.getMonth(), dia = now.getDate();
    const kg = (v) => v >= 1000 ? `${fmt1(v / 1000)} t` : `${Math.round(v)} kg`;
    const hm = (s) => s >= 3600 ? `${fmt1(s / 3600)} h` : `${Math.round(s / 60)} min`;
    const flecha = (a, b) => { if (!a && !b) return ''; const r = b ? (a - b) / b : 1; return Math.abs(r) < 0.05 ? '<i class="pg-eq">=</i>' : r > 0 ? '<i class="pg-up">▲</i>' : '<i class="pg-dn">▼</i>'; };
    const periodoDe = (per) => {
      if (per === 'mes') {
        const pm = new Date(y, m - 1, 1);
        const finPrev = new Date(pm.getFullYear(), pm.getMonth(), Math.min(dia, new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate()));
        const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return {
          titulo: 'Este mes', sub: dia === 1 ? 'solo el día 1, los dos' : `los dos, del 1 al ${dia}`,
          cols: [MESES[m], MESES[pm.getMonth()]],
          este: statsDe(sessions, isoOf(new Date(y, m, 1).getTime()), hoy), prev: statsDe(sessions, isoOf(pm.getTime()), isoOf(finPrev.getTime())),
        };
      }
      const nDia = (now.getDay() + 6) % 7; // 0 = lunes … 6 = domingo
      const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
      return {
        titulo: 'Esta semana', sub: nDia === 6 ? 'de lunes a domingo' : nDia === 0 ? 'solo los lunes' : `las dos, de lunes a ${DIAS[nDia]}`,
        cols: ['Esta', 'Pasada'],
        este: statsDe(sessions, isoOf(new Date(y, m, dia - nDia).getTime()), hoy),
        prev: statsDe(sessions, isoOf(new Date(y, m, dia - nDia - 7).getTime()), isoOf(new Date(y, m, dia - 7).getTime())),
      };
    };
    const PER_KEY = 'traindia.progresoPeriodo';
    let periodo = 'semana';
    try { if (localStorage.getItem(PER_KEY) === 'mes') periodo = 'mes'; } catch (e) { /* sin almacenamiento: semana */ }
    const periodoHTML = (per) => {
      const { titulo, sub, cols, este, prev } = periodoDe(per);
      const filas = [
        ['Entrenos', String(este.n), String(prev.n), este.n, prev.n],
        este.vol || prev.vol ? ['Peso levantado', kg(este.vol), kg(prev.vol), este.vol, prev.vol] : null,
        este.secs || prev.secs ? ['Tiempo entrenando', hm(este.secs), hm(prev.secs), este.secs, prev.secs] : null,
        este.km || prev.km ? ['Cardio', `${fmt1(este.km)} km`, `${fmt1(prev.km)} km`, este.km, prev.km] : null,
      ].filter(Boolean);
      return `<div class="pg-ph"><strong>${titulo}</strong>
          <span class="pg-seg" role="tablist"><button type="button" data-per="semana" class="${per === 'semana' ? 'on' : ''}">Semana</button><button type="button" data-per="mes" class="${per === 'mes' ? 'on' : ''}">Mes</button></span></div>
        <div class="pg-psub dim">${sub}</div>
        <div class="pg-mt pg-mthead"><span></span><span class="pg-mth on">${UI.esc(cols[0])}</span><span class="pg-mth">${UI.esc(cols[1])}</span><span></span></div>
        ${filas.map(([l, a, b, va, vb]) => `<div class="pg-mt"><span class="pg-ml">${l}</span><span class="pg-mv on">${a}</span><span class="pg-mv">${b}</span>${flecha(va, vb)}</div>`).join('')}`;
    };
    const mesHTML = `<div class="card pg-mes" id="pgPer">${periodoHTML(periodo)}</div>`;

    // 3) Constancia: entrenos por semana (últimas 12) y racha
    const curWk = weekIndex(now);
    const lunes = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const porSem = new Map();
    sessions.forEach(s => { const w = weekIndex(new Date(s.date + 'T00:00:00')); porSem.set(w, (porSem.get(w) || 0) + 1); });
    const semanas = new Set(porSem.keys());
    let racha = 0, anchor = semanas.has(curWk) ? curWk : (semanas.has(curWk - 1) ? curWk - 1 : null);
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
    const constHTML = `<div class="card pg-const">
      <div class="pg-h"><strong>Constancia</strong><span class="dim">entrenos por semana</span></div>
      <div class="pg-racha"><span class="pg-rn">${racha}</span><div><strong>${racha === 1 ? 'semana seguida' : 'semanas seguidas'} entrenando</strong><span class="dim">${mejor > racha ? `Tu mejor racha: ${mejor} semanas` : racha > 1 ? 'Es tu mejor racha' : 'Entrena esta semana para empezar una racha'}</span></div></div>
      <div class="pg-weeks">${cols.map(c => `<div class="pg-wk${c.actual ? ' now' : ''}"><span class="pg-wn">${c.n || ''}</span><span class="pg-wb"><i style="height:${c.n ? Math.max(8, c.n / maxN * 100) : 0}%"></i></span></div>`).join('')}</div>
      <div class="pg-wl"><span>${UI.fmtDateShort(cols[0].ini)}</span><span>${UI.fmtDateShort(cols[Math.floor(NW / 2)].ini)}</span><span>esta semana</span></div>
      <p class="pg-media dim">Media de las últimas ${NW - 1} semanas: <strong>${fmt1(media)}</strong> entrenos por semana</p>
    </div>`;

    // 4) Series por músculo esta semana (y lo que sueles entrenar y aún no has tocado)
    const catalog = await DB.exercisesOf(uid);
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
    const maxS = Math.max(10, ...filas.map(f => f[1]));
    const musHTML = (filas.length || sinTocar.length) ? `<div class="card pg-mus">
      <div class="pg-h"><strong>Series por músculo</strong><span class="dim">esta semana</span></div>
      ${filas.map(([g, n]) => `<div class="pg-bar"><span class="pg-bn">${UI.esc(g)}</span><span class="pg-bt"><i style="width:${Math.max(4, n / maxS * 100)}%"></i></span><span class="pg-bv">${n}</span></div>`).join('')}
      ${sinTocar.map(g => `<div class="pg-bar off"><span class="pg-bn">${UI.esc(g)}</span><span class="pg-bt"></span><span class="pg-bv">0</span></div>`).join('')}
      ${sinTocar.length ? `<p class="pg-aviso">${UI.icon('info', 14)} ${UI.esc(lista(sinTocar))} ${sinTocar.length === 1 ? 'lo sueles entrenar y aún no lo has tocado' : 'los sueles entrenar y aún no los has tocado'} esta semana.</p>` : ''}
    </div>` : '';

    host.innerHTML = `<div class="card-label pg-sec">Tus logros recientes</div>${logrosHTML}${mesHTML}${constHTML}${musHTML}`;
    const perCard = host.querySelector('#pgPer');
    perCard.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-per]');
      if (!b || b.dataset.per === periodo) return;
      periodo = b.dataset.per;
      try { localStorage.setItem(PER_KEY, periodo); } catch (e) { /* no se recuerda, da igual */ }
      perCard.innerHTML = periodoHTML(periodo);
    });
  }
  const lista = (arr) => arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`;

  // Lunes de la semana de una fecha, como índice entero de semanas (Mon=inicio).
  function weekIndex(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return Math.floor(dt.getTime() / (7 * 86400000));
  }

  // ---------- LISTA "TUS RÉCORDS" ----------
  async function renderRecords(app, host) {
    const records = await computeRecords(app, app.activeUser.id);
    if (!records.length) { host.innerHTML = `<div class="empty-state"><p class="dim">Aún no hay récords. Registra sesiones para verlos aquí.</p></div>`; return; }
    const sort = host._recSort || 'recent';
    const cat = host._recCat || '__all__';
    const search = host._recSearch || '';
    const cats = [...new Set(records.map(r => r.ex.muscleGroup || 'General'))].sort((a, b) => a.localeCompare(b));
    // Agrupar por ejercicio: cada uno con TODAS sus marcas (records ya viene por fecha desc).
    const byEx = new Map();
    records.forEach(r => {
      const k = r.ex.name;
      if (!byEx.has(k)) byEx.set(k, { ex: r.ex, marks: [], recent: '' });
      const g = byEx.get(k);
      g.marks.push(r);
      if ((r.point.x || '') > g.recent) g.recent = r.point.x || '';
    });
    const groups = [...byEx.values()];
    if (sort === 'name') groups.sort((a, b) => a.ex.name.localeCompare(b.ex.name));
    else groups.sort((a, b) => (b.recent || '').localeCompare(a.recent || '')); // por marca más reciente
    const rows = groups.map(g => {
      const grp = g.ex.muscleGroup || 'General';
      g.marks.sort((a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric));
      const marks = g.marks.map(r => `<div class="rec-mark">
          <span class="rm-label">${UI.esc(METRIC_LABEL[r.metric] || r.metric)}</span>
          <span class="rm-val">${UI.esc(fmtMetricPoint(r.metric, r.point))}<span class="rm-date">${UI.fmtDateShort(r.point.x)}</span></span>
        </div>`).join('');
      return `<div class="rec-group" data-search="${UI.esc(UI.norm(g.ex.name + ' ' + grp))}" data-cat="${UI.esc(grp)}">
        <div class="rec-group-head"><span class="rec-medal">🏆</span><div class="rec-main"><div class="rec-name">${UI.esc(g.ex.name)}</div><div class="rec-meta">${UI.esc(grp)}</div></div></div>
        <div class="rec-marks">${marks}</div>
      </div>`;
    }).join('');
    host.innerHTML = `
      <input class="inp" id="recSearch" placeholder="Buscar ejercicio…" autocomplete="off" value="${UI.esc(search)}" style="margin-bottom:10px">
      <div class="chips-row small" style="margin-bottom:8px">
        <button class="chip${sort === 'recent' ? ' on' : ''}" data-sort="recent">Recientes</button>
        <button class="chip${sort === 'name' ? ' on' : ''}" data-sort="name">A-Z</button>
      </div>
      ${cats.length > 1 ? `<div class="rec-catsel">${UI.field('Categoría', UI.selectButton('recCatBtn', cat === '__all__' ? 'Todas' : cat))}</div>` : ''}
      <div id="recList">${rows}</div>
      <p class="dim" id="recNoRes" style="display:none;padding:12px 2px">Sin resultados.</p>`;

    const applyFilter = () => {
      const q = UI.norm(host._recSearch || '');
      const c = host._recCat || '__all__';
      let any = false;
      host.querySelectorAll('.rec-group').forEach(row => {
        const vis = (!q || row.dataset.search.includes(q)) && (c === '__all__' || row.dataset.cat === c);
        row.style.display = vis ? '' : 'none';
        if (vis) any = true;
      });
      host.querySelector('#recNoRes').style.display = any ? 'none' : '';
    };
    const si = host.querySelector('#recSearch');
    si.addEventListener('input', () => { host._recSearch = si.value; applyFilter(); }); // filtra sin re-render (mantiene foco)
    host.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { host._recSort = b.dataset.sort; renderRecords(app, host); }));
    const catBtn = host.querySelector('#recCatBtn');
    if (catBtn) catBtn.addEventListener('click', () => UI.pickFromList({
      title: 'Filtrar por categoría',
      options: [{ value: '__all__', label: 'Todas' }].concat(cats.map(c => ({ value: c, label: c }))),
      value: cat,
      onPick: (val) => { host._recCat = val; renderRecords(app, host); },
    }));
    applyFilter();
  }

  // ====================================================
  async function render(app, params) {
    params.tab = params.tab || 'summary';
    const tab = params.tab;
    const tabs = [
      { id: 'summary', label: 'Resumen' },
      { id: 'body', label: 'Corporal' },
      { id: 'exercise', label: 'Ejercicios' },
      { id: 'records', label: 'Récords' },
      { id: 'compare', label: 'Comparar' },
    ];
    const tabBar = `<div class="tabs pg-tabs">${tabs.map(t => `<button class="tab${tab === t.id ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>`;
    const host = { summary: 'tabSummary', body: 'tabBody', exercise: 'tabEx', records: 'tabRecords', compare: 'tabCompare' }[tab] || 'tabSummary';
    return tabBar + `<div id="${host}"><div class="loading">Cargando…</div></div>`;
  }

  function bind(app, root, params) {
    const tab = params.tab || 'summary';
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => app.go('progress', { tab: b.dataset.tab }, true)));
    if (tab === 'summary') renderResumen(app, root.querySelector('#tabSummary'));
    else if (tab === 'body') renderBody(app, root.querySelector('#tabBody'));
    else if (tab === 'exercise') renderExercise(app, root.querySelector('#tabEx'), params);
    else if (tab === 'records') renderRecords(app, root.querySelector('#tabRecords'));
    else renderCompare(app, root.querySelector('#tabCompare'), params);
  }

  // ---------- CORPORAL ----------
  const RANGES = [{ id: '1m', label: '1 mes', days: 31 }, { id: '6m', label: '6 meses', days: 183 }, { id: 'all', label: 'Todo', days: 0 }];
  async function renderBody(app, host) {
    const u = app.activeUser;
    const entries = (await DB.progressOf(u.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const goal = u.weightGoal || '';
    const range = host._range || '6m';
    const rDays = (RANGES.find(r => r.id === range) || RANGES[1]).days;
    const hoy = DB.todayISO();
    const enRango = (p) => !rDays || diasEntre(p.x, hoy) <= rDays;

    // --- Peso: el número de hoy, qué tiene de especial, el ritmo y la tendencia
    const ws = await pesosDe(u.id);
    const ins = weightInsight(ws);
    const ph = weightPhrase(ins, goal);
    const trend = trendOf(ws);
    const rate = weeklyRate(trend);
    const raw = ws.map(e => ({ x: e.date, y: e.kg })).filter(enRango);
    const tr = trend.filter(enRango);
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
        ${raw.length ? UI.lineChart([
          { label: 'Pesajes', color: u.color, points: raw, width: 1.5, opacity: 0.35, noLegend: true },
          { label: 'Tendencia', color: u.color, points: tr, width: 3, noDots: true, noLegend: true },
        ], { width: 320, height: 150, noLegend: true, fmtPoint: (p) => `${fmt1(p.y)} kg` }) : '<div class="chart-empty">Sin pesajes en este periodo.</div>'}
        <div class="pw-foot"><div class="chips-row small">${RANGES.map(r => `<button class="chip${r.id === range ? ' on' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div><span class="pw-key"><i></i>tendencia</span></div>`
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
    host.querySelectorAll('[data-metric]').forEach(c => c.addEventListener('click', () => { host._metric = c.dataset.metric; renderBody(app, host); }));
    const gb = host.querySelector('#pwGoal');
    if (gb) gb.addEventListener('click', () => UI.pickFromList({
      title: 'Tu objetivo de peso',
      options: GOALS,
      value: goal,
      onPick: async (val) => {
        await DB.put('users', { ...app.activeUser, weightGoal: val });
        app.activeUser.weightGoal = val; // sin recargar perfiles: así no cambia el perfil activo
        renderBody(app, host);
        UI.toast(val ? `Objetivo: ${GOALS.find(g => g.value === val).label.toLowerCase()}` : 'Sin objetivo de peso');
      },
    }));
    host.querySelector('#addProg').addEventListener('click', () => editProgress(app, null, () => renderBody(app, host)));
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

  // Ejercicios que REALMENTE tienen algo registrado. El catálogo tiene más de cien y
  // la mayoría nunca se han hecho: no tiene sentido ofrecer su "progreso".
  async function exercisesWithData(userId, catalog) {
    const ses = (await DB.sessionsOf(userId)).filter(s => !s.draft);
    const ids = new Set(), names = new Set();
    ses.forEach(s => (s.entries || []).forEach(e => {
      if (!(e.sets || []).length) return;
      if (e.exerciseId) ids.add(e.exerciseId);
      if (e.name) names.add(e.name.trim().toLowerCase());
    }));
    const conDatos = catalog.filter(c => ids.has(c.id) || names.has((c.name || '').trim().toLowerCase()));
    return conDatos.length ? conDatos : catalog; // si aún no hay nada, no dejamos la vista vacía
  }

  // ---------- POR EJERCICIO ----------
  async function renderExercise(app, host, params) {
    const todos = (await DB.exercisesOf(app.activeUser.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (todos.length === 0) { host.innerHTML = `<div class="empty-state"><p>No hay ejercicios en el catálogo.</p></div>`; return; }
    const catalog = await exercisesWithData(app.activeUser.id, todos);
    const exId = host._exId || params.exId || catalog[0].id;
    const ex = catalog.find(e => e.id === exId) || catalog[0];
    const metrics = metricsFor(ex);
    const metric = (host._metric && metrics.some(m => m.key === host._metric)) ? host._metric : metrics[0].key;

    // Filtro por etiqueta/variante (solo cardio con etiquetas registradas)
    const cardioLabels = isCardioEx(ex) ? await exerciseLabels(app.activeUser.id, ex.name) : [];
    const labelF = (host._exLabel && cardioLabels.includes(host._exLabel)) ? host._exLabel : '';

    const sinPeso = ex.type === 'reps' && ['maxLoad', 'e1rm', 'volume'].includes(metric) && !(await loadBodyWeights(app.activeUser.id)).length;
    const isE1 = metric === 'e1rm';
    const effortOnly = isE1 ? (host._effortOnly !== false) : false; // por defecto activado
    const formula = app._e1Formula || 'epley';
    const { points, noEffort } = await metricSeries(app.activeUser.id, ex.name, metric, effortOnly, formula, labelF);

    const isTime = metric === 'maxTime' || metric === 'totalTime';
    const prPoint = bestPoint(points, metric);
    const fmtPoint = (p) => fmtMetricPoint(metric, p);
    const metricLabel = (metrics.find(m => m.key === metric) || {}).label || '';
    const isPR = (p) => p === prPoint; // solo la marca: la primera vez que la lograste
    const recent = points.slice(-8).reverse().map(p => `<li><span>${UI.fmtDateShort(p.x)}</span><strong>${fmtPoint(p)}${isPR(p) ? ' 🏆' : ''}</strong></li>`).join('');

    const helpOpen = host._e1Help === true;        // explicación plegada por defecto
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

    host.innerHTML = `
      <div class="card">
        ${UI.field('Ejercicio', UI.selectButton('exSelBtn', ex.name))}
        ${cardioLabels.length ? `<div class="chips-row small ex-label-row"><button class="chip${labelF === '' ? ' on' : ''}" data-exlabel="">Todas</button>${cardioLabels.map(l => `<button class="chip${labelF === l ? ' on' : ''}" data-exlabel="${UI.esc(l)}">${UI.esc(l)}</button>`).join('')}</div>` : ''}
        <div class="chips-row small">${metrics.map(m => `<button class="chip${m.key === metric ? ' on' : ''}" data-metric="${m.key}">${m.label}</button>`).join('')}</div>
        ${e1Panel}
        ${sinPeso ? `<div class="e1-alert">${UI.icon('star', 15)}<span>Para el peso de los ejercicios con tu propio peso hace falta tu <strong>peso corporal</strong>: apúntalo en <strong>Progreso → Corporal</strong> y se calcula solo (corporal ± lastre o asistencia).</span></div>` : ''}
        ${prPoint ? `<div class="pr-stat">${UI.icon('star', 16)}<div class="pr-stat-text"><span class="pr-stat-label">Récord · ${UI.esc(metricLabel)}</span><span class="pr-stat-date">${UI.fmtDateShort(prPoint.x)}</span></div><span class="pr-stat-val">${fmtMetricValue(metric, prPoint.y)}${prPoint.detail ? `<span class="pr-stat-cond">${UI.esc(prPoint.detail)}</span>` : ''}</span></div>` : ''}
        ${UI.lineChart([{ label: ex.name, color: app.activeUser.color, points }], { width: 320, height: 150, ...chartOpts(metric), fmtPoint })}
        ${LOWER_BETTER.has(metric) ? `<p class="field-hint" style="margin:6px 0 0">${metric === 'pace' ? 'Ritmo medio de cada salida de <strong>1 km o más</strong>.' : 'Ritmo de tu serie más rápida en cada entreno.'} Cuanto más bajo, mejor (en la gráfica, más arriba).</p>` : ''}
      </div>
      ${points.length ? `<div class="block"><div class="block-label">Últimos registros</div><ul class="kv-list">${recent}</ul></div>` : (noEffort ? '' : '<div class="empty-state"><p class="dim">Aún no has registrado este ejercicio en ninguna sesión.</p></div>')}`;

    host.querySelector('#exSelBtn').addEventListener('click', () => UI.pickFromList({
      title: 'Elegir ejercicio',
      options: catalog.map(c => ({ value: c.id, label: c.name })),
      value: ex.id,
      onPick: (val) => { host._exId = val; host._metric = null; renderExercise(app, host, params); },
    }));
    host.querySelectorAll('[data-metric]').forEach(c => c.addEventListener('click', () => { host._metric = c.dataset.metric; host._exId = ex.id; renderExercise(app, host, params); }));
    host.querySelectorAll('[data-exlabel]').forEach(c => c.addEventListener('click', () => { host._exLabel = c.dataset.exlabel; host._exId = ex.id; renderExercise(app, host, params); }));
    const effChk = host.querySelector('#effOnly');
    if (effChk) effChk.addEventListener('change', () => { host._effortOnly = effChk.checked; host._exId = ex.id; renderExercise(app, host, params); });
    const helpBtn = host.querySelector('#e1Help');
    if (helpBtn) helpBtn.addEventListener('click', () => { host._e1Help = !host._e1Help; host._exId = ex.id; renderExercise(app, host, params); });
    host.querySelectorAll('[data-formula]').forEach(b => b.addEventListener('click', () => { app._e1Formula = b.dataset.formula; host._exId = ex.id; renderExercise(app, host, params); }));
  }

  // ---------- COMPARATIVA ----------
  async function renderCompare(app, host, params) {
    const users = await DB.getUsers();
    const guests = users.filter(u => !u.isMain);
    if (guests.length === 0) {
      host.innerHTML = `<div class="empty-state"><p>No hay perfiles invitados para comparar.</p><p class="dim">Crea un invitado e importa sus datos desde Perfiles o Datos.</p><button class="btn ghost" data-link="profiles">Ir a Perfiles</button></div>`;
      app.bindLinks(host);
      return;
    }
    const guestId = host._guestId || (params && guests.some(g => g.id === params.guestId) ? params.guestId : guests[0].id);
    const guest = users.find(u => u.id === guestId);

    // métricas: peso corporal + cada ejercicio del principal
    const catalog = await exercisesWithData(app.mainUser.id,
      (await DB.exercisesOf(app.mainUser.id)).sort((a, b) => a.name.localeCompare(b.name)));
    const subjectKey = host._subject || 'body:weight';

    let series = [], unit = '', exMetrics = EX_METRICS, exMetric = 'maxWeight';
    if (subjectKey === 'body:weight') {
      const mainPts = (await DB.progressOf(app.mainUser.id)).filter(e => e.weight != null && e.weight !== '').map(e => ({ x: e.date, y: parseFloat(e.weight) }));
      const guestPts = (await DB.progressOf(guest.id)).filter(e => e.weight != null && e.weight !== '').map(e => ({ x: e.date, y: parseFloat(e.weight) }));
      series = [
        { label: app.mainUser.name, color: app.mainUser.color, points: mainPts },
        { label: guest.name, color: guest.color, points: guestPts },
      ];
      unit = 'Peso corporal (kg)';
    } else {
      const exName = subjectKey.slice(3);
      const subjEx = catalog.find(c => c.name === exName);
      exMetrics = metricsFor(subjEx); // métricas según el tipo (barra, tu peso, cardio…)
      exMetric = (host._exMetric && exMetrics.some(m => m.key === host._exMetric)) ? host._exMetric : exMetrics[0].key;
      // el 1RM se compara solo con series de esfuerzo marcado (cae a todas si no hay)
      const e1f = app._e1Formula || 'epley';
      const mainPts = (await metricSeries(app.mainUser.id, exName, exMetric, exMetric === 'e1rm', e1f)).points;
      const guestPts = (await metricSeries(guest.id, exName, exMetric, exMetric === 'e1rm', e1f)).points;
      series = [
        { label: app.mainUser.name, color: app.mainUser.color, points: mainPts },
        { label: guest.name, color: guest.color, points: guestPts },
      ];
      unit = `${exName} — ${(exMetrics.find(m => m.key === exMetric) || {}).label || exMetric}`;
    }

    const subjectOptions = [{ value: 'body:weight', label: 'Peso corporal' }]
      .concat(catalog.map(c => ({ value: 'ex:' + c.name, label: c.name })));
    const showExMetric = subjectKey.startsWith('ex:');

    host.innerHTML = `
      <div class="card">
        ${UI.field('Comparar con', UI.select('guestSel', guests.map(g => ({ value: g.id, label: g.name })), guestId))}
        ${UI.field('Métrica', UI.selectButton('subjectSelBtn', (subjectOptions.find(o => o.value === subjectKey) || subjectOptions[0]).label))}
        ${showExMetric ? `<div class="chips-row small">${exMetrics.map(m => `<button class="chip${exMetric === m.key ? ' on' : ''}" data-exmetric="${m.key}">${m.label}</button>`).join('')}</div>` : ''}
        <div class="chart-title">${UI.esc(unit)}</div>
        ${UI.lineChart(series, { width: 320, height: 160, ...(subjectKey === 'body:weight' ? {} : chartOpts(exMetric)), fmtPoint: subjectKey === 'body:weight' ? (p => `${p.y} kg`) : (p => fmtMetricPoint(exMetric, p)) })}
      </div>`;

    host.querySelector('select[name="guestSel"]').addEventListener('change', e => { host._guestId = e.target.value; renderCompare(app, host, params); });
    host.querySelector('#subjectSelBtn').addEventListener('click', () => UI.pickFromList({
      title: 'Elegir métrica',
      options: subjectOptions,
      value: subjectKey,
      onPick: (val) => { host._subject = val; renderCompare(app, host, params); },
    }));
    host.querySelectorAll('[data-exmetric]').forEach(c => c.addEventListener('click', () => { host._exMetric = c.dataset.exmetric; renderCompare(app, host, params); }));
    app.bindLinks(host);
  }

  return { render, bind };
})();
