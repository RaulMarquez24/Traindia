// ============================================================
// VISTAS: Progreso — corporal, por ejercicio, comparativa
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
    { key: 'volume', label: 'Volumen (kg)' },
    { key: 'maxReps', label: 'Reps máx' },
  ];
  // Cardio (distancia/kcal totales): la métrica de tiempo es el TOTAL de la sesión.
  const TIME_METRICS_CARDIO = [
    { key: 'distance', label: 'Distancia (km)' },
    { key: 'totalTime', label: 'Tiempo total' },
    { key: 'avgSpeed', label: 'Vel. media (km/h)' },
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
  const METRIC_UNIT = { maxWeight: ' kg', e1rm: ' kg', volume: ' kg', maxReps: ' reps', distance: ' km', kcal: ' kcal', avgSpeed: ' km/h' };
  const METRIC_LABEL = {};
  EX_METRICS.concat(TIME_METRICS).forEach(m => { METRIC_LABEL[m.key] = m.label; });

  // récord = mejor punto; a igual valor, gana el de mejor condición (más reps / más peso / menos tiempo)
  const better = (p, b) => p.y > b.y || (p.y === b.y && (p.tie || 0) > (b.tie || 0));
  const bestPoint = (points) => (points.length ? points.reduce((b, p) => (better(p, b) ? p : b), points[0]) : null);
  // valor formateado de un punto con su unidad + condiciones (ej. "90 kg × 3")
  function fmtMetricPoint(metric, p) {
    const base = (metric === 'maxTime' || metric === 'totalTime') ? fmtSecs(p.y) : `${p.y}${METRIC_UNIT[metric] || ''}`;
    return p.detail ? `${base} ${p.detail}` : base;
  }

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
    let sessions = (await DB.sessionsOf(userId)).filter(s => !s.draft);
    sessions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const points = [];
    const lname = exName.toLowerCase();
    sessions.forEach(s => {
      let maxWeight = 0, volume = 0, maxReps = 0, maxTime = 0, distance = 0, kcal = 0, totalTime = 0, found = false;
      let bestW = null, bestR = null; // mejor serie por peso (desempata reps) y por reps (desempata peso)
      let best1rm = 0, best1rmSet = null; // mejor 1RM estimado (Epley) y la serie que lo produce
      (s.entries || []).forEach(e => {
        if ((e.name || '').toLowerCase() !== lname) return;
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
          if (w > maxWeight) maxWeight = w;
          if (r > maxReps) maxReps = r;
          if (t > maxTime) maxTime = t;
          volume += r * w;
          if (!hasTotalTime) totalTime += t;
          if (!hasTotals) { distance += parseFloat(set.distance) || 0; kcal += parseFloat(set.kcal) || 0; }
          if (w > 0 && (!bestW || w > bestW.w || (w === bestW.w && r > bestW.r))) bestW = { w, r };
          if (r > 0 && (!bestR || r > bestR.r || (r === bestR.r && w > bestR.w))) bestR = { w, r };
          if (w > 0 && r > 0) { // 1RM con reps en reserva según el esfuerzo
            const rir = repsInReserve(set.effort);
            if (!effortOnly || rir != null) {
              const e1 = estimate1rm(w, r + (rir || 0), formula);
              if (e1 > best1rm) { best1rm = e1; best1rmSet = { w, r, eff: set.effort || null }; }
            }
          }
        });
      });
      if (!found) return;
      const distR = Math.round(distance * 100) / 100;
      const avgSpeed = totalTime > 0 ? Math.round((distR / (totalTime / 3600)) * 10) / 10 : 0; // km/h media
      const map = { maxWeight, volume, maxReps, maxTime, totalTime, distance: distR, kcal: Math.round(kcal), avgSpeed, e1rm: Math.round(best1rm) };
      const y = map[metric] || 0;
      if (metric === 'e1rm' && best1rm <= 0) return; // sin series válidas (p.ej. effortOnly y sin esfuerzo)
      // condiciones de la marca + desempate. La "tie" mayor = mejor marca a igual valor.
      let detail = '', tie = 0;
      if (metric === 'maxWeight' && bestW) { detail = bestW.r ? `× ${bestW.r}` : ''; tie = bestW.r; }            // + reps a igual peso
      else if (metric === 'e1rm' && best1rmSet) { detail = `de ${best1rmSet.w}×${best1rmSet.r}${best1rmSet.eff ? ` · ${best1rmSet.eff}` : ''}`; tie = best1rmSet.w; } // serie origen del 1RM
      else if (metric === 'maxReps' && bestR) { detail = bestR.w ? `@ ${bestR.w} kg` : ''; tie = bestR.w; }       // + peso a iguales reps
      else if (metric === 'distance' && distance > 0) { detail = totalTime ? `en ${fmtSecs(totalTime)}` : ''; tie = -totalTime; } // − tiempo a igual distancia
      else if (metric === 'kcal' && kcal > 0) { detail = totalTime ? `en ${fmtSecs(totalTime)}` : ''; }
      else if (metric === 'maxTime' && distR > 0) { detail = `· ${distR} km`; tie = distR; }                      // + distancia a igual tiempo
      else if (metric === 'totalTime' && distR > 0) { detail = `· ${distR} km`; tie = distR; }                    // tiempo total (cardio) + distancia
      else if (metric === 'avgSpeed' && distR > 0) { detail = `· ${distR} km`; }                                  // velocidad media + distancia
      points.push({ x: s.date, y, detail, tie });
    });
    return points;
  }

  // Métrica representativa de cada ejercicio para "récords" (la primera con datos).
  function recordMetrics(ex) {
    if (ex.type === 'check') return [];  // hecho / no hecho: no hay métrica que seguir
    if (ex.type === 'time') return isCardioEx(ex) ? ['distance', 'totalTime', 'kcal'] : ['maxTime'];
    if (ex.type === 'reps') return ['maxReps'];
    return ['maxWeight'];
  }

  // Récord (PR) de cada ejercicio del catálogo. Cacheado por usuario + nº de sesiones.
  async function computeRecords(app, userId) {
    const sessions = (await DB.sessionsOf(userId)).filter(s => !s.draft);
    const cacheKey = userId + ':' + sessions.length;
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
      for (const metric of recordMetrics(ex)) {
        const pts = await exerciseSeries(userId, ex.name, metric);
        const best = bestPoint(pts);
        if (best && best.y > 0) { out.push({ ex, metric, point: best }); break; }
      }
    }
    out.sort((a, b) => (b.point.x || '').localeCompare(a.point.x || '')); // marca más reciente primero
    app._recCache[cacheKey] = out;
    return out;
  }

  // Lunes de la semana de una fecha, como índice entero de semanas (Mon=inicio).
  function weekIndex(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return Math.floor(dt.getTime() / (7 * 86400000));
  }

  // ---------- PANEL "TUS NÚMEROS" ----------
  async function renderSummary(app, host) {
    const uid = app.activeUser.id;
    const sessions = (await DB.sessionsOf(uid)).filter(s => !s.draft && s.date);
    const now = new Date();
    const curWk = weekIndex(now);
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let thisWeek = 0, thisMonth = 0;
    const weeks = new Set();
    sessions.forEach(s => {
      const wk = weekIndex(new Date(s.date));
      weeks.add(wk);
      if (wk === curWk) thisWeek++;
      if ((s.date || '').startsWith(monthPrefix)) thisMonth++;
    });
    // racha = semanas consecutivas con ≥1 entreno, ancladas a la semana actual o la anterior
    let streak = 0, anchor = weeks.has(curWk) ? curWk : (weeks.has(curWk - 1) ? curWk - 1 : null);
    if (anchor != null) { let w = anchor; while (weeks.has(w)) { streak++; w--; } }

    const records = await computeRecords(app, uid);
    const last = records[0]; // ya ordenado por fecha desc

    const tiles = [
      [thisWeek, 'esta semana'],
      [thisMonth, 'este mes'],
      [streak, streak === 1 ? 'sem. racha' : 'sem. racha'],
      [sessions.length, 'entrenos'],
    ];
    host.innerHTML = `
      <div class="card summary-card">
        <div class="stat-grid">
          ${tiles.map(([n, cap]) => `<div class="stat-tile"><span class="stat-num">${n}</span><span class="stat-cap">${cap}</span></div>`).join('')}
        </div>
        ${last ? `<div class="summary-pr">${UI.icon('star', 15)}<span>Última marca · <strong>${UI.esc(last.ex.name)}</strong> ${UI.esc(fmtMetricPoint(last.metric, last.point))} <span class="dim">· ${UI.fmtDateShort(last.point.x)}</span></span></div>` : ''}
      </div>`;
  }

  // ---------- LISTA "TUS RÉCORDS" ----------
  async function renderRecords(app, host) {
    const records = await computeRecords(app, app.activeUser.id);
    if (!records.length) { host.innerHTML = `<div class="empty-state"><p class="dim">Aún no hay récords. Registra sesiones para verlos aquí.</p></div>`; return; }
    const sort = host._recSort || 'recent';
    const cat = host._recCat || '__all__';
    const search = host._recSearch || '';
    const cats = [...new Set(records.map(r => r.ex.muscleGroup || 'General'))].sort((a, b) => a.localeCompare(b));
    const list = records.slice();
    if (sort === 'name') list.sort((a, b) => a.ex.name.localeCompare(b.ex.name));
    const rows = list.map(r => {
      const grp = r.ex.muscleGroup || 'General';
      return `<div class="rec-row" data-search="${UI.esc(UI.norm(r.ex.name + ' ' + grp))}" data-cat="${UI.esc(grp)}">
        <span class="rec-medal">🏆</span>
        <div class="rec-main">
          <div class="rec-name">${UI.esc(r.ex.name)}</div>
          <div class="rec-meta">${UI.esc(METRIC_LABEL[r.metric] || r.metric)} · ${UI.esc(grp)} · ${UI.fmtDateShort(r.point.x)}</div>
        </div>
        <span class="rec-val">${UI.esc(fmtMetricPoint(r.metric, r.point))}</span>
      </div>`;
    }).join('');
    host.innerHTML = `
      <input class="inp" id="recSearch" placeholder="Buscar ejercicio…" autocomplete="off" value="${UI.esc(search)}" style="margin-bottom:10px">
      <div class="chips-row small" style="margin-bottom:8px">
        <button class="chip${sort === 'recent' ? ' on' : ''}" data-sort="recent">Recientes</button>
        <button class="chip${sort === 'name' ? ' on' : ''}" data-sort="name">A-Z</button>
      </div>
      ${cats.length > 1 ? `<div class="rec-catsel">${UI.field('Categoría', UI.selectButton('recCatBtn', cat === '__all__' ? 'Todas' : cat))}</div>` : ''}
      <div class="card" style="padding:0" id="recList">${rows}</div>
      <p class="dim" id="recNoRes" style="display:none;padding:12px 2px">Sin resultados.</p>`;

    const applyFilter = () => {
      const q = UI.norm(host._recSearch || '');
      const c = host._recCat || '__all__';
      let any = false;
      host.querySelectorAll('.rec-row').forEach(row => {
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
  function render(app, params) {
    const tab = params.tab || 'body';
    const tabs = [
      { id: 'body', label: 'Corporal' },
      { id: 'exercise', label: 'Por ejercicio' },
      { id: 'records', label: 'Récords' },
      { id: 'compare', label: 'Comparativa' },
    ];
    const tabBar = `<div class="tabs">${tabs.map(t => `<button class="tab${tab === t.id ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>`;
    const summary = `<div id="progSummary"></div>`;

    if (tab === 'body') return summary + tabBar + `<div id="tabBody">${'<div class="loading">Cargando…</div>'}</div>`;
    if (tab === 'exercise') return summary + tabBar + `<div id="tabEx"><div class="loading">Cargando…</div></div>`;
    if (tab === 'records') return summary + tabBar + `<div id="tabRecords"><div class="loading">Cargando…</div></div>`;
    return summary + tabBar + `<div id="tabCompare"><div class="loading">Cargando…</div></div>`;
  }

  function bind(app, root, params) {
    const tab = params.tab || 'body';
    renderSummary(app, root.querySelector('#progSummary'));
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => app.go('progress', { tab: b.dataset.tab }, true)));
    if (tab === 'body') renderBody(app, root.querySelector('#tabBody'));
    else if (tab === 'exercise') renderExercise(app, root.querySelector('#tabEx'), params);
    else if (tab === 'records') renderRecords(app, root.querySelector('#tabRecords'));
    else renderCompare(app, root.querySelector('#tabCompare'), params);
  }

  // ---------- CORPORAL ----------
  async function renderBody(app, host) {
    const entries = (await DB.progressOf(app.activeUser.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const metric = host._metric || 'weight';
    const available = MEASURES.filter(m => entries.some(e => e[m.key] != null && e[m.key] !== ''));
    const chartPoints = entries
      .filter(e => e[metric] != null && e[metric] !== '')
      .map(e => ({ x: e.date, y: parseFloat(e[metric]) }))
      .filter(p => !isNaN(p.y));

    const metricUnit = (MEASURES.find(m => m.key === metric) || {}).unit || '';
    const metricChips = (available.length ? available : [MEASURES[0]])
      .map(m => `<button class="chip${m.key === metric ? ' on' : ''}" data-metric="${m.key}">${m.label}</button>`).join('');

    const rows = entries.map(e => {
      const vals = MEASURES.filter(m => e[m.key]).map(m => `${m.label} ${e[m.key]}${m.unit}`).join(' · ');
      return `<div class="prog-row">
        <div class="prog-date">${UI.fmtDateShort(e.date)}</div>
        <div class="prog-vals">${vals || '<span class="dim">—</span>'}${e.notes ? `<span class="dim block-note">${UI.esc(e.notes)}</span>` : ''}</div>
        <span class="prog-actions"><button class="icon-btn" data-share="${e.id}" title="Compartir">${UI.icon('upload', 17)}</button><button class="icon-btn" data-edit="${e.id}">${UI.icon('edit', 17)}</button><button class="icon-btn danger" data-del="${e.id}">${UI.icon('trash', 17)}</button></span>
      </div>`;
    }).join('');

    host.innerHTML = `
      <div class="card">
        <div class="chips-row small">${metricChips}</div>
        ${UI.lineChart([{ label: app.activeUser.name, color: app.activeUser.color, points: chartPoints }], { width: 320, height: 150, fmtPoint: (p) => `${p.y}${metricUnit}` })}
      </div>
      <button class="btn primary block" id="addProg">+ Registrar medida</button>
      ${rows || '<div class="empty-state"><p>Sin registros de progreso.</p></div>'}`;

    host.querySelectorAll('[data-metric]').forEach(c => c.addEventListener('click', () => { host._metric = c.dataset.metric; renderBody(app, host); }));
    host.querySelector('#addProg').addEventListener('click', () => editProgress(app, null, () => renderBody(app, host)));
    host.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => VData.exportProgressEntry(app, b.dataset.share)));
    host.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => editProgress(app, await DB.get('progress', b.dataset.edit), () => renderBody(app, host))));
    host.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Eliminar registro', message: '¿Borrar este registro de progreso?', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.del('progress', b.dataset.del); renderBody(app, host); UI.toast('Registro eliminado');
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
  async function renderExercise(app, host, params) {
    const catalog = (await DB.exercisesOf(app.activeUser.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (catalog.length === 0) { host.innerHTML = `<div class="empty-state"><p>No hay ejercicios en el catálogo.</p></div>`; return; }
    const exId = host._exId || params.exId || catalog[0].id;
    const ex = catalog.find(e => e.id === exId) || catalog[0];
    const metrics = ex.type === 'time' ? timeMetricsFor(ex) : EX_METRICS;
    const metric = (host._metric && metrics.some(m => m.key === host._metric)) ? host._metric : metrics[0].key;

    // Filtro por etiqueta/variante (solo cardio con etiquetas registradas)
    const cardioLabels = isCardioEx(ex) ? await exerciseLabels(app.activeUser.id, ex.name) : [];
    const labelF = (host._exLabel && cardioLabels.includes(host._exLabel)) ? host._exLabel : '';

    const isE1 = metric === 'e1rm';
    const effortOnly = isE1 ? (host._effortOnly !== false) : false; // por defecto activado
    const formula = app._e1Formula || 'epley';
    const { points, noEffort } = await metricSeries(app.activeUser.id, ex.name, metric, effortOnly, formula, labelF);

    const isTime = metric === 'maxTime' || metric === 'totalTime';
    const prPoint = bestPoint(points);
    const fmtPoint = (p) => fmtMetricPoint(metric, p);
    const metricLabel = (metrics.find(m => m.key === metric) || {}).label || '';
    const isPR = (p) => prPoint && p.y === prPoint.y && (p.tie || 0) === (prPoint.tie || 0);
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
        ${prPoint ? `<div class="pr-stat">${UI.icon('star', 16)}<div class="pr-stat-text"><span class="pr-stat-label">Récord · ${UI.esc(metricLabel)}</span><span class="pr-stat-date">${UI.fmtDateShort(prPoint.x)}</span></div><span class="pr-stat-val">${isTime ? fmtSecs(prPoint.y) : `${prPoint.y}${METRIC_UNIT[metric] || ''}`}${prPoint.detail ? `<span class="pr-stat-cond">${UI.esc(prPoint.detail)}</span>` : ''}</span></div>` : ''}
        ${UI.lineChart([{ label: ex.name, color: app.activeUser.color, points }], { width: 320, height: 150, fmtY: isTime ? fmtSecs : undefined, fmtPoint })}
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
    const guestId = host._guestId || guests[0].id;
    const guest = users.find(u => u.id === guestId);

    // métricas: peso corporal + cada ejercicio del principal
    const catalog = (await DB.exercisesOf(app.mainUser.id)).sort((a, b) => a.name.localeCompare(b.name));
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
      exMetrics = (subjEx && subjEx.type === 'time') ? timeMetricsFor(subjEx) : EX_METRICS; // métricas según el tipo
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
        ${UI.lineChart(series, { width: 320, height: 160, fmtY: (exMetric === 'maxTime' || exMetric === 'totalTime') ? fmtSecs : undefined, fmtPoint: subjectKey === 'body:weight' ? (p => `${p.y} kg`) : (p => fmtMetricPoint(exMetric, p)) })}
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
