// ============================================================
// VISTAS: Sesiones — registro en vivo, manual, historial, edición
// ============================================================

const VSessions = (() => {

  // -------- helpers de modelo --------
  // Datos extra opcionales de los ejercicios de TIEMPO (cardio). Se eligen por
  // ejercicio (se recuerdan) y/o sobre la marcha; solo se muestran los activos.
  const TIME_FIELDS = [
    { key: 'distance', label: 'Distancia', unit: 'km', ph: 'km', step: '0.01' },
    { key: 'kcal', label: 'Kcal', unit: 'kcal', ph: 'kcal', step: '1' },
    { key: 'speed', label: 'Velocidad', unit: 'km/h', ph: 'km/h', step: '0.1' },
    { key: 'incline', label: 'Inclinación', unit: '%', ph: 'incl %', step: '0.5' },
    { key: 'level', label: 'Nivel', unit: '', ph: 'nivel', step: '1' },
    { key: 'weight', label: 'Peso', unit: 'kg', ph: 'kg', step: '0.5' },
  ];
  const TIME_FIELD = Object.fromEntries(TIME_FIELDS.map(f => [f.key, f]));
  const DEFAULT_TIME_METRICS = ['distance', 'kcal'];
  // Métricas activas de una entry de tiempo: las elegidas (entry.metrics) + las
  // que ya tengan datos (para no ocultar nada introducido), ordenadas.
  function timeActiveMetrics(entry) {
    const chosen = Array.isArray(entry.metrics) ? entry.metrics : DEFAULT_TIME_METRICS;
    const keys = new Set(chosen);
    TIME_FIELDS.forEach(f => { if ((entry.sets || []).some(s => s[f.key])) keys.add(f.key); });
    return TIME_FIELDS.filter(f => keys.has(f.key)).map(f => f.key);
  }
  async function setExerciseMetrics(app, exId, keys) {
    if (!exId) return;
    const ex = await DB.get('exercises', exId);
    if (ex) { ex.metrics = keys; await DB.put('exercises', ex); }
  }
  // Aplica la selección de datos a la entry (limpia los quitados) y la recuerda en el ejercicio.
  async function applyMetrics(app, entry, keys) {
    const ordered = TIME_FIELDS.filter(f => keys.includes(f.key)).map(f => f.key);
    const removed = timeActiveMetrics(entry).filter(k => !ordered.includes(k));
    (entry.sets || []).forEach(s => removed.forEach(k => { delete s[k]; }));
    entry.metrics = ordered;
    await setExerciseMetrics(app, entry.exerciseId, ordered);
  }
  function pickMetrics(app, entry, onDone) {
    const active = new Set(timeActiveMetrics(entry));
    UI.modal({
      title: 'Datos a registrar',
      bodyHTML: `<div class="metric-opts">${TIME_FIELDS.map(f => `<label class="metric-opt"><input type="checkbox" data-mk="${f.key}"${active.has(f.key) ? ' checked' : ''}><span>${f.label}${f.unit ? ` <em>(${f.unit})</em>` : ''}</span></label>`).join('')}</div>
        <p class="field-hint">Se recuerdan para este ejercicio; podrás cambiarlos cuando quieras.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Listo', kind: 'primary', onClick: async (root) => {
          const keys = [...root.querySelectorAll('[data-mk]')].filter(c => c.checked).map(c => c.dataset.mk);
          await onDone(keys);
        } },
      ],
    });
  }

  // Nota libre por ejercicio (comentario general que reaparece en "última vez").
  function editNote(app, entry, onDone) {
    UI.modal({
      title: 'Nota del ejercicio',
      bodyHTML: UI.field('Nota', UI.textarea('note', entry.note || '', 'Ej: subir peso la próxima, molestia leve…', 3)),
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: (root) => onDone(root.querySelector('textarea[name="note"]').value.trim()) },
      ],
    });
  }

  // Nivel de esfuerzo (RPE en %) POR SERIE. Menú rápido que aplica al tocar.
  const EFFORT_LEVELS = ['50%', '60%', '70%', '80%', '90%', '100%'];
  function pickSetEffort(current, onPick) {
    UI.modal({
      title: 'Esfuerzo de la serie',
      bodyHTML: `<div class="effort-pick">
          <button type="button" class="effort-opt${!current ? ' sel' : ''}" data-eff="">—</button>
          ${EFFORT_LEVELS.map(l => `<button type="button" class="effort-opt${current === l ? ' sel' : ''}" data-eff="${l}">${l}</button>`).join('')}
        </div>
        <p class="field-hint">Cómo de duro fue esta serie. Toca para elegir.</p>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => root.querySelectorAll('.effort-opt').forEach(b => b.addEventListener('click', () => { UI.closeModal(root); onPick(b.dataset.eff); })),
    });
  }

  function emptySet(type) {
    if (type === 'time') return { time: '', distance: '', kcal: '', weight: '', speed: '', incline: '', level: '', done: false };
    if (type === 'reps') return { reps: '', load: '', loadMode: '', done: false };
    return { reps: '', weight: '', done: false };
  }
  function emptyDrop(type) {
    if (type === 'reps') return { reps: '', load: '' };
    return { reps: '', weight: '' };
  }

  function dropHasData(d) { return d && (d.reps || d.weight || d.load); }
  function setHasData(s) {
    return s.reps || s.weight || s.time || s.speed || s.level || s.incline || s.load || s.distance || s.kcal ||
      (s.drops && s.drops.some(dropHasData));
  }
  function liveHasData(s) { return (s.entries || []).some(e => (e.sets || []).some(setHasData)); }

  // sufijo lastre/asistencia para ejercicios de peso corporal
  function loadSuffix(set) {
    if (!set.load || !set.loadMode) return '';
    const sign = set.loadMode === 'asist' ? '−' : '+';
    return ` ${sign}${set.load}kg${set.loadMode === 'asist' ? ' asist' : ''}`;
  }
  // texto de una serie para detalle / contexto IA (incluye dropsets y esfuerzo)
  function setDisplay(type, set) {
    let v;
    if (type === 'time') {
      const parts = [];
      const t = fmtTime(set.time); if (t) parts.push(t);
      if (set.distance) parts.push(`${set.distance} km`);
      if (set.kcal) parts.push(`${set.kcal} kcal`);
      if (set.weight) parts.push(`${set.weight} kg`);
      const ex = cardioExtra(set); if (ex) parts.push(ex);
      v = parts.join(' · ') || '0s';
    } else if (type === 'reps') {
      v = `${set.reps || 0} reps${loadSuffix(set)}`;
      (set.drops || []).filter(dropHasData).forEach(d => { v += ` → ${d.reps || 0}${d.load ? ` (${d.load}kg)` : ''}`; });
    } else {
      v = `${set.reps || 0} × ${set.weight || 0} kg`;
      (set.drops || []).filter(dropHasData).forEach(d => { v += ` → ${d.reps || 0}×${d.weight || 0}`; });
    }
    if (set.effort) v += ` · ${set.effort}`;
    return v;
  }

  // Texto de contexto para preguntar a una IA sobre un ejercicio (en curso o ya hecho).
  function buildExerciseContext(session, entry, opts) {
    const past = opts && opts.past;
    const lines = [];
    lines.push(past
      ? `He hecho este ejercicio en mi entreno${session.name ? ` "${session.name}"` : ''}${session.date ? ` el ${UI.fmtDate(session.date)}` : ''}.`
      : `Estoy entrenando${session.name ? ` (${session.name})` : ''}.`);
    let l = `Ejercicio: ${entry.name}`;
    if (entry.target) l += ` — objetivo ${entry.target}`;
    lines.push(l);
    const setsTxt = (entry.sets || []).filter(setHasData).map(s => setDisplay(entry.type || 'weight', s));
    if (setsTxt.length) lines.push(`Series realizadas: ${setsTxt.join(', ')}.`);
    lines.push('');
    lines.push('Mi duda: ');
    return lines.join('\n');
  }

  function fmtTime(sec) {
    const t = parseInt(sec); if (isNaN(t) || t === 0 && sec === '') return '';
    const m = Math.floor(t / 60), s = t % 60;
    return m ? `${m}:${String(s).padStart(2, '0')} min` : `${s}s`;
  }
  // Texto compacto de los datos opcionales de un set de tiempo
  function cardioExtra(s) {
    const parts = [];
    if (s.speed) parts.push(`${s.speed} km/h`);
    if (s.incline) parts.push(`${s.incline}%`);
    if (s.level) parts.push(`niv ${s.level}`);
    return parts.join(' · ');
  }

  function entryFromExercise(ex) {
    return {
      exerciseId: ex.exerciseId || null,
      name: ex.name,
      type: ex.type || 'weight',
      target: ex.sets || '',
      sets: [],
    };
  }

  // ----- "Última vez": qué hiciste la sesión anterior con cada ejercicio -----
  // Empareja por exerciseId (robusto a renombres) y, si no hay, por nombre.
  function keyForEntry(entry) {
    return entry.exerciseId || (entry.name || '').trim().toLowerCase();
  }
  let _lastTimeMap = null; // key -> { date, type, sets } de la sesión más reciente
  function buildLastTimeMap(sessions, excludeId) {
    const map = {};
    sessions
      .filter(s => !s.draft && s.id !== excludeId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0))
      .forEach(sess => (sess.entries || []).forEach(e => {
        const k = keyForEntry(e);
        if (!k || map[k]) return; // ya tenemos una más reciente para este ejercicio
        const done = (e.sets || []).filter(setHasData);
        if (done.length) map[k] = { date: sess.date, type: e.type || 'weight', sets: done, note: e.note };
      }));
    return map;
  }
  function lastTimeHTML(entry) {
    const prev = _lastTimeMap && _lastTimeMap[keyForEntry(entry)];
    if (!prev) return '';
    const sets = prev.sets.map(st => setDisplay(prev.type, st)).join(' · ');
    const note = prev.note ? `<div class="last-note"><span>${UI.icon('edit', 12)} ${UI.esc(prev.note)}</span></div>` : '';
    return `<div class="last-time">${UI.icon('clock', 12)} Última vez · ${UI.esc(UI.fmtDateShort(prev.date))}: <span>${UI.esc(sets)}</span></div>${note}`;
  }

  // ----- Récords personales (PR): mejor marca histórica por ejercicio -----
  // Métrica principal por tipo: peso → kg máx, corporal → reps máx, tiempo → s máx.
  function metricOf(type, set) {
    if (type === 'time') return parseFloat(set.time) || 0;
    if (type === 'reps') return parseFloat(set.reps) || 0;
    return parseFloat(set.weight) || 0;
  }
  function prValueText(type, value) {
    if (type === 'time') return fmtTime(value) || (value + 's');
    if (type === 'reps') return value + ' reps';
    return value + ' kg';
  }
  let _prMap = null; // key -> { type, best, date }
  function buildPRMap(sessions, excludeId) {
    const map = {};
    sessions.filter(s => !s.draft && s.id !== excludeId).forEach(sess => (sess.entries || []).forEach(e => {
      const k = keyForEntry(e); if (!k) return;
      const type = e.type || 'weight';
      let best = 0;
      (e.sets || []).forEach(st => { const m = metricOf(type, st); if (m > best) best = m; });
      if (best > 0 && (!map[k] || best > map[k].best)) map[k] = { type, best, date: sess.date };
    }));
    return map;
  }
  // Compara la sesión recién terminada con las marcas previas y devuelve los récords nuevos.
  // Cuenta como récord tanto superar una marca anterior como establecer la primera (first).
  function detectPRs(session) {
    const prs = [];
    (session.entries || []).forEach(e => {
      const k = keyForEntry(e), type = e.type || 'weight';
      let best = 0; (e.sets || []).forEach(st => { const m = metricOf(type, st); if (m > best) best = m; });
      if (best <= 0) return;
      const prev = (_prMap && _prMap[k]) ? _prMap[k].best : 0;
      if (prev === 0) prs.push({ name: e.name, type, value: best, prev: 0, first: true });
      else if (best > prev) prs.push({ name: e.name, type, value: best, prev });
    });
    return prs;
  }
  // Recalcula los récords de una sesión EDITADA comparando con las demás sesiones
  // anteriores (así un ejercicio quitado o un valor cambiado deja de mostrar récord).
  function recomputePRs(session, others) {
    const prs = [];
    (session.entries || []).forEach(e => {
      const k = keyForEntry(e), type = e.type || 'weight';
      let best = 0; (e.sets || []).forEach(st => { const m = metricOf(type, st); if (m > best) best = m; });
      if (best <= 0) return;
      let prev = 0;
      others.forEach(os => {
        const before = (os.date || '') < (session.date || '') || ((os.date || '') === (session.date || '') && (os.createdAt || 0) < (session.createdAt || 0));
        if (!before) return;
        (os.entries || []).forEach(oe => {
          if (keyForEntry(oe) !== k) return;
          (oe.sets || []).forEach(st => { const m = metricOf(oe.type || 'weight', st); if (m > prev) prev = m; });
        });
      });
      if (prev === 0) prs.push({ name: e.name, type, value: best, prev: 0, first: true });
      else if (best > prev) prs.push({ name: e.name, type, value: best, prev });
    });
    return prs;
  }
  function celebratePRs(prs) {
    UI.modal({
      title: '🏆 ¡Récord personal!',
      bodyHTML: `<p class="modal-text dim">${prs.length > 1 ? 'Marcas conseguidas' : 'Marca conseguida'}:</p>
        <div class="pr-list">${prs.map(p => `<div class="pr-item">
          <span class="pr-ex">${UI.esc(p.name)}</span>
          <span class="pr-vals"><span class="pr-now">${UI.esc(prValueText(p.type, p.value))}</span><span class="pr-prev">${p.first ? 'primera marca' : 'antes ' + UI.esc(prValueText(p.type, p.prev))}</span></span>
        </div>`).join('')}</div>`,
      actions: [{ label: '¡Genial! 💪', kind: 'primary' }],
    });
  }

  function sessionVolume(session) {
    let vol = 0;
    const add = (r, w) => { r = parseFloat(r); w = parseFloat(w); if (!isNaN(r) && !isNaN(w)) vol += r * w; };
    (session.entries || []).forEach(e => (e.sets || []).forEach(s => {
      add(s.reps, s.weight);
      (s.drops || []).forEach(d => add(d.reps, d.weight));
    }));
    return Math.round(vol);
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }

  // ===== Temporizador de descanso (manual, GLOBAL) =====
  // La cuenta atrás corre en un intervalo a nivel de app y se pinta en un nodo
  // fijo en <body>, fuera de #mainContent, así sigue visible y corriendo aunque
  // navegues por la app. La vista en vivo solo aporta el control para empezarlo.
  let _audioCtx = null;
  function ensureAudio() {
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
    } catch (e) {}
  }
  function beep() {
    try {
      if (!_audioCtx) return;
      const t = _audioCtx.currentTime;
      [0, 0.28].forEach(off => {
        const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
        o.connect(g); g.connect(_audioCtx.destination);
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t + off);
        g.gain.exponentialRampToValueAtTime(0.3, t + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.2);
        o.start(t + off); o.stop(t + off + 0.22);
      });
    } catch (e) {}
  }
  function getRestDuration(app) {
    if (!app._restDuration) {
      let v = 90;
      try { v = parseInt(localStorage.getItem('traindia.restDuration'), 10) || 90; } catch (e) {}
      app._restDuration = v;
    }
    return app._restDuration;
  }
  function restRunning(app) { return !!(app._restEndTs && app._restEndTs > Date.now()); }

  // Wake Lock: mantiene la pantalla encendida (a su brillo normal, sin forzar
  // nada) SOLO mientras corre el descanso, para que el aviso suene puntual. Se
  // libera al parar/terminar, así el móvil vuelve a dormirse como siempre.
  let _wakeLock = null, _wakeBound = false;
  async function requestWake() {
    try {
      if (!('wakeLock' in navigator) || _wakeLock) return;
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    } catch (e) { _wakeLock = null; } // el SO puede denegarlo (p.ej. batería baja)
  }
  function releaseWake() {
    try { if (_wakeLock) _wakeLock.release(); } catch (e) {}
    _wakeLock = null;
  }
  function bindWakeReacquire(app) {
    if (_wakeBound) return;
    _wakeBound = true;
    // El SO suelta el lock al ocultar la pestaña; al volver, si seguimos en
    // descanso, lo recuperamos.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && restRunning(app)) requestWake();
    });
  }

  // Control para EMPEZAR el descanso (solo en la vista en vivo). Mientras corre,
  // el CSS (body.rest-running) lo oculta y manda la píldora global.
  function restTimerHTML(app) {
    return `<div class="rest-timer rest-start" id="restStart">
      <button class="rest-main" id="restMain" title="Empezar descanso">${UI.icon('clock', 18)}<span class="rest-label">Descanso · ${getRestDuration(app)}s</span></button>
      <button class="rest-btn" id="restPresets" aria-label="Cambiar duración">▾</button>
    </div>`;
  }
  function bindRestTimer(app, root) {
    const main = root.querySelector('#restMain');
    if (!main) return;
    main.addEventListener('click', () => restStart(app, getRestDuration(app)));
    root.querySelector('#restPresets').addEventListener('click', () => pickRestDuration(app));
  }

  let _restNode = null, _restInterval = null;
  // Crea/actualiza/quita el nodo global y mantiene el intervalo según el estado.
  // Lo llama app.render() en cada navegación, y restStart/restStop al cambiar.
  function restEnsure(app) {
    const running = restRunning(app);
    document.body.classList.toggle('rest-running', running);
    if (!running) {
      if (_restNode) { _restNode.remove(); _restNode = null; }
      if (_restInterval) { clearInterval(_restInterval); _restInterval = null; }
      releaseWake(); // descanso terminado/parado → la pantalla puede apagarse normal
      return;
    }
    bindWakeReacquire(app);
    requestWake(); // mantiene la pantalla encendida solo durante el descanso
    if (!_restNode || !document.body.contains(_restNode)) {
      _restNode = document.createElement('div');
      _restNode.id = 'globalRest';
      _restNode.className = 'rest-timer running';
      _restNode.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rest]'); if (!b) return;
        if (b.dataset.rest === 'add') { app._restEndTs += 15000; app._restFired = false; restPaint(app); }
        else restStop(app);
      });
      document.body.appendChild(_restNode);
    }
    restPaint(app);
    if (!_restInterval) _restInterval = setInterval(() => restTick(app), 1000);
  }
  function restPaint(app) {
    if (!_restNode) return;
    const rem = Math.max(0, Math.round((app._restEndTs - Date.now()) / 1000));
    _restNode.innerHTML = `<button class="rest-main" data-rest="toggle" title="Parar descanso">${UI.icon('clock', 18)}<span class="rest-count">${fmtClock(rem)}</span></button>
      <button class="rest-btn" data-rest="add" title="Sumar 15s">+15s</button>
      <button class="rest-btn stop" data-rest="stop" aria-label="Parar descanso">✕</button>`;
  }
  function restTick(app) {
    if (!app._restEndTs) { restEnsure(app); return; }
    const rem = Math.round((app._restEndTs - Date.now()) / 1000);
    if (rem > 0) {
      const c = _restNode && _restNode.querySelector('.rest-count');
      if (c) c.textContent = fmtClock(rem); else restEnsure(app);
      return;
    }
    if (!app._restFired) {
      app._restFired = true;
      try { if (navigator.vibrate) navigator.vibrate([220, 110, 220]); } catch (e) {}
      beep();
      UI.toast('⏱ Descanso terminado');
    }
    app._restEndTs = null;
    restEnsure(app); // oculta el nodo y limpia el intervalo
  }
  function restStart(app, dur) {
    app._restDuration = dur;
    try { localStorage.setItem('traindia.restDuration', String(dur)); } catch (e) {}
    ensureAudio(); // el toque del usuario habilita el audio (política de autoplay)
    app._restEndTs = Date.now() + dur * 1000;
    app._restFired = false;
    restEnsure(app);
  }
  function restStop(app) {
    app._restEndTs = null; app._restFired = false;
    restEnsure(app);
  }
  function pickRestDuration(app) {
    const opts = [60, 90, 120, 180];
    UI.modal({
      title: 'Tiempo de descanso',
      bodyHTML: `<div class="menu-list">
        ${opts.map(d => `<button class="menu-row" data-dur="${d}"><span><strong>${fmtClock(d)}</strong> · ${d}s</span><span class="chev">›</span></button>`).join('')}
        <button class="menu-row" data-dur="custom"><span>Personalizado…</span><span class="chev">›</span></button>
      </div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (m) => m.querySelectorAll('[data-dur]').forEach(b => b.addEventListener('click', async () => {
        const v = b.dataset.dur;
        UI.closeModal();
        if (v === 'custom') {
          const r = await UI.prompt({ title: 'Descanso personalizado', label: 'Segundos', value: String(getRestDuration(app)), placeholder: 'Ej: 75' });
          const n = parseInt(r, 10);
          if (n && n > 0) restStart(app, n);
        } else {
          restStart(app, parseInt(v, 10));
        }
      })),
    });
  }

  // -------- render de filas de serie (compartido live/editor) --------
  function setRowsHTML(entry, ei, mode) {
    const type = entry.type || 'weight';
    return (entry.sets || []).map((s, si) => {
      // En vivo, al marcar la serie (✓) se "bloquea": no se edita ni hay dropset.
      const locked = mode === 'live' && s.done;
      const dis = locked ? ' disabled' : '';
      const done = mode === 'live'
        ? `<button class="set-done${s.done ? ' on' : ''}" data-done data-ei="${ei}" data-si="${si}" title="${s.done ? 'Desmarcar para editar' : 'Serie hecha'}">${UI.icon('check', 16)}</button>`
        : '';
      const rm = locked ? '' : `<button class="icon-btn danger" data-rm-set data-ei="${ei}" data-si="${si}">×</button>`;
      const effortBtn = (mode === 'live' || mode === 'edit')
        ? `<button type="button" class="set-rpe${s.effort ? ' on' : ''}" data-set-effort data-ei="${ei}" data-si="${si}" title="Esfuerzo de la serie">${s.effort ? UI.esc(s.effort) : '%'}</button>`
        : '';

      if (type === 'time') {
        const total = parseInt(s.time);
        const hasT = s.time !== '' && s.time != null && !isNaN(total);
        const mm = hasT ? Math.floor(total / 60) : '';
        const ss = hasT ? total % 60 : '';
        return `<div class="set-wrap${s.done ? ' done' : ''}">
          <div class="set-row">
            <span class="set-n">${si + 1}</span>
            <input class="inp set-f" data-f="timemin" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${mm}" placeholder="min"${dis}><span class="set-unit">m</span>
            <input class="inp set-f" data-f="timesec" data-ei="${ei}" data-si="${si}" type="number" min="0" max="59" value="${ss}" placeholder="seg"${dis}><span class="set-unit">s</span>
            ${effortBtn}${done}${rm}
          </div>
          ${(() => { const ms = timeActiveMetrics(entry); return ms.length ? `<div class="set-extra">${ms.map(k => { const f = TIME_FIELD[k]; return `<input class="inp set-f" data-f="${k}" data-ei="${ei}" data-si="${si}" type="number" min="0" step="${f.step}" value="${UI.esc(s[k] || '')}" placeholder="${f.ph}"${dis}>`; }).join('')}</div>` : ''; })()}
        </div>`;
      }

      // weight / reps: fila principal + dropsets opcionales
      let mainFields;
      if (type === 'reps') {
        mainFields = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${UI.esc(s.reps)}" placeholder="reps"${dis}>
          <select class="inp set-f set-load-mode" data-f="loadMode" data-ei="${ei}" data-si="${si}"${dis}>
            <option value=""${!s.loadMode ? ' selected' : ''}>corporal</option>
            <option value="lastre"${s.loadMode === 'lastre' ? ' selected' : ''}>+ lastre</option>
            <option value="asist"${s.loadMode === 'asist' ? ' selected' : ''}>− asist.</option>
          </select>
          <input class="inp set-f set-load" data-f="load" data-ei="${ei}" data-si="${si}" type="number" min="0" step="0.5" value="${UI.esc(s.load)}" placeholder="kg"${dis}>`;
      } else {
        mainFields = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${UI.esc(s.reps)}" placeholder="reps"${dis}><span class="set-x">×</span><input class="inp set-f" data-f="weight" data-ei="${ei}" data-si="${si}" type="number" min="0" step="0.5" value="${UI.esc(s.weight)}" placeholder="kg"${dis}><span class="set-unit">kg</span>`;
      }
      const drops = (s.drops || []).map((d, di) => {
        let df;
        if (type === 'reps') {
          df = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" value="${UI.esc(d.reps)}" placeholder="reps"${dis}><span class="set-unit">reps</span><input class="inp set-f set-load" data-f="load" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" step="0.5" value="${UI.esc(d.load)}" placeholder="kg"${dis}>`;
        } else {
          df = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" value="${UI.esc(d.reps)}" placeholder="reps"${dis}><span class="set-x">×</span><input class="inp set-f" data-f="weight" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" step="0.5" value="${UI.esc(d.weight)}" placeholder="kg"${dis}>`;
        }
        const dropRm = locked ? '' : `<button class="icon-btn danger" data-rm-drop data-ei="${ei}" data-si="${si}" data-di="${di}">×</button>`;
        return `<div class="drop-row"><span class="drop-tag">drop</span>${df}${dropRm}</div>`;
      }).join('');
      return `<div class="set-wrap${s.done ? ' done' : ''}">
        <div class="set-row"><span class="set-n">${si + 1}</span>${mainFields}${effortBtn}${done}${rm}</div>
        ${drops}
        ${locked ? '' : `<div class="set-foot"><button type="button" class="set-drop-btn" data-add-drop data-ei="${ei}" data-si="${si}">↧ dropset</button></div>`}
      </div>`;
    }).join('');
  }

  function entryCardHTML(entry, ei, mode) {
    return `<div class="ex-card" data-ei="${ei}" data-sort-id="${ei}">
      <button type="button" class="drag-handle" data-drag="card" title="Arrastra para reordenar" aria-label="Arrastrar">${UI.icon('grip', 18)}</button>
      <div class="ex-card-body">
        <div class="ex-card-head">
          <div class="ex-card-name"><strong>${UI.esc(entry.name)}</strong>${entry.target ? `<span class="ex-target">obj: ${UI.esc(entry.target)}</span>` : ''}</div>
          <span class="ex-card-actions">
            ${mode === 'live' ? `<button class="icon-btn" data-ai-ex data-ei="${ei}" title="Consultar a una IA sobre este ejercicio">${UI.icon('chat', 17)}</button>` : ''}
            <button class="icon-btn danger" data-rm-ex data-ei="${ei}">${UI.icon('trash', 17)}</button>
          </span>
        </div>
        ${mode === 'live' ? lastTimeHTML(entry) : ''}
        <div class="set-list">${setRowsHTML(entry, ei, mode)}</div>
        ${entry.note ? `<div class="ex-note" data-note data-ei="${ei}"><span class="ex-note-txt">${UI.icon('edit', 13)} ${UI.esc(entry.note)}</span></div>` : ''}
        <div class="ex-card-foot">
          <button class="btn ghost small" data-add-set data-ei="${ei}">+ Serie</button>
          ${entry.type === 'time' ? `<button type="button" class="metric-add" data-metrics data-ei="${ei}">${UI.icon('plus', 13)} datos</button>` : ''}
          ${entry.note ? '' : `<button type="button" class="metric-add" data-note data-ei="${ei}">${UI.icon('edit', 13)} nota</button>`}
        </div>
      </div>
    </div>`;
  }

  // Lee inputs del DOM al modelo de sesión (incluye dropsets via data-di)
  function syncEntries(root, session) {
    root.querySelectorAll('.set-f').forEach(inp => {
      const ei = +inp.dataset.ei, si = +inp.dataset.si, f = inp.dataset.f;
      const set = session.entries[ei] && session.entries[ei].sets[si];
      if (!set) return;
      if (inp.dataset.di !== undefined) {
        const di = +inp.dataset.di;
        if (set.drops && set.drops[di]) set.drops[di][f] = inp.value;
      } else {
        set[f] = inp.value;
      }
    });
    // los sets de tiempo guardan los segundos totales a partir de min:seg
    (session.entries || []).forEach(e => {
      if ((e.type || 'weight') !== 'time') return;
      (e.sets || []).forEach(s => {
        if (s.timemin !== undefined || s.timesec !== undefined) {
          const m = parseInt(s.timemin) || 0, sec = parseInt(s.timesec) || 0;
          s.time = (m || sec) ? (m * 60 + sec) : '';
          delete s.timemin; delete s.timesec;
        }
      });
    });
  }

  // =====================================================
  // REGISTRO EN VIVO
  // =====================================================
  async function live(app, params) {
    // Solo se construye una sesión nueva si NO hay ninguna en curso (no se pisa).
    if (!app._live) {
      const day = (app.routine?.days || []).find(d => d.id === params.dayId);
      const entries = [];
      if (day && !day.isRest) {
        const metricsById = {};
        (await DB.exercisesOf(app.activeUser.id)).forEach(x => { if (Array.isArray(x.metrics)) metricsById[x.id] = x.metrics; });
        day.blocks.forEach(b => b.exercises.forEach(ex => {
          const e = entryFromExercise(ex);
          if (e.type === 'time' && e.exerciseId && metricsById[e.exerciseId]) e.metrics = metricsById[e.exerciseId].slice();
          e.sets.push(emptySet(e.type));
          entries.push(e);
        }));
      }
      app._live = {
        id: DB.uid('ses'),
        userId: app.activeUser.id,
        date: DB.todayISO(),
        name: day ? day.name : 'Entreno libre',
        dayId: params.dayId || null,
        routineId: app.routine ? app.routine.id : null,
        entries,
        notes: '',
        draft: true,
        startTs: Date.now(),
        createdAt: Date.now(),
      };
    }
    const s = app._live;
    const hist = await DB.sessionsOf(app.activeUser.id);
    _lastTimeMap = buildLastTimeMap(hist, s.id);
    _prMap = buildPRMap(hist, s.id);
    const elapsed = Math.floor((Date.now() - s.startTs) / 1000);

    return `
      <div class="live-head">
        <div class="live-title">${UI.esc(s.name)}</div>
        <div class="live-timer" id="liveTimer">${fmtClock(elapsed)}</div>
      </div>
      <div class="live-entries">
        ${s.entries.map((e, i) => entryCardHTML(e, i, 'live')).join('') || '<div class="empty-state"><p>Añade ejercicios para empezar.</p></div>'}
      </div>
      <button class="btn ghost block" id="liveAddEx">+ Añadir ejercicio</button>
      <label class="field"><span class="field-label">Notas</span><textarea class="inp" id="liveNotes" rows="2" placeholder="Sensaciones, ajustes…">${UI.esc(s.notes)}</textarea></label>
      <div class="live-actions">
        <button class="btn danger" id="liveCancel">Descartar</button>
        <button class="btn primary" id="liveFinish">Finalizar y guardar</button>
      </div>
      <div class="live-rest-spacer"></div>
      ${restTimerHTML(app)}`;
  }

  function liveBind(app, root) {
    const s = app._live;
    if (!s) { app.go('sessions', {}, true); return; }
    app.persistLive(); // guarda el entreno en cuanto se inicia (aunque esté vacío)

    // timer
    if (app._liveTimer) clearInterval(app._liveTimer);
    const timerEl = root.querySelector('#liveTimer');
    app._liveTimer = setInterval(() => {
      if (!document.body.contains(timerEl)) { clearInterval(app._liveTimer); app._liveTimer = null; return; }
      timerEl.textContent = fmtClock(Math.floor((Date.now() - s.startTs) / 1000));
    }, 1000);
    bindRestTimer(app, root);

    const sync = () => { syncLive(root, s); app.persistLive(); };

    // Handlers de cada tarjeta. Se re-enganchan tras cada redibujado de la lista.
    function bindEntries() {
      root.querySelectorAll('[data-add-set]').forEach(b => b.addEventListener('click', () => {
        sync(); const e = s.entries[+b.dataset.ei]; e.sets.push(emptySet(e.type)); redraw();
      }));
      root.querySelectorAll('[data-rm-set]').forEach(b => b.addEventListener('click', () => {
        sync(); s.entries[+b.dataset.ei].sets.splice(+b.dataset.si, 1); redraw();
      }));
      root.querySelectorAll('[data-add-drop]').forEach(b => b.addEventListener('click', () => {
        sync(); const set = s.entries[+b.dataset.ei].sets[+b.dataset.si]; (set.drops = set.drops || []).push(emptyDrop(s.entries[+b.dataset.ei].type)); redraw();
      }));
      root.querySelectorAll('[data-rm-drop]').forEach(b => b.addEventListener('click', () => {
        sync(); const set = s.entries[+b.dataset.ei].sets[+b.dataset.si]; if (set.drops) set.drops.splice(+b.dataset.di, 1); redraw();
      }));
      root.querySelectorAll('[data-rm-ex]').forEach(b => b.addEventListener('click', () => {
        sync(); s.entries.splice(+b.dataset.ei, 1); redraw();
      }));
      root.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => {
        sync(); const set = s.entries[+b.dataset.ei].sets[+b.dataset.si]; set.done = !set.done; redraw();
      }));
      root.querySelectorAll('[data-ai-ex]').forEach(b => b.addEventListener('click', () => {
        sync(); UI.askAI(buildExerciseContext(s, s.entries[+b.dataset.ei]));
      }));
      root.querySelectorAll('[data-metrics]').forEach(b => b.addEventListener('click', () => {
        sync(); const entry = s.entries[+b.dataset.ei];
        pickMetrics(app, entry, async (keys) => { await applyMetrics(app, entry, keys); redraw(); });
      }));
      root.querySelectorAll('[data-note]').forEach(b => b.addEventListener('click', () => {
        sync(); const entry = s.entries[+b.dataset.ei];
        editNote(app, entry, (note) => { entry.note = note || undefined; app.persistLive(); redraw(); });
      }));
      root.querySelectorAll('[data-set-effort]').forEach(b => b.addEventListener('click', () => {
        sync(); const set = s.entries[+b.dataset.ei].sets[+b.dataset.si];
        pickSetEffort(set.effort, (eff) => { set.effort = eff || undefined; app.persistLive(); redraw(); });
      }));
    }

    // Re-render SOLO la lista de ejercicios (no reconstruye toda la vista → no se
    // pierde el scroll ni hay que volver a bajar). El contenedor .live-entries
    // persiste, así que makeSortable (enganchado abajo una vez) sigue valiendo.
    const redraw = () => {
      const cont = root.querySelector('.live-entries');
      if (!cont) { app.render(); return; }
      cont.innerHTML = s.entries.map((e, i) => entryCardHTML(e, i, 'live')).join('') || '<div class="empty-state"><p>Añade ejercicios para empezar.</p></div>';
      bindEntries();
    };

    // Autoguardado inmediato en cada tecla (delegado en root: sobrevive al redibujado).
    root.addEventListener('input', () => { syncLive(root, s); app.persistLive(); });

    bindEntries();
    UI.makeSortable(root.querySelector('.live-entries'), {
      itemSelector: '.ex-card', handleSelector: '[data-drag="card"]',
      onReorder: (order) => { sync(); s.entries = order.map(i => s.entries[+i]); redraw(); },
    });
    root.querySelector('#liveAddEx').addEventListener('click', () => { sync(); addExerciseToSession(app, s, () => redraw()); });
    root.querySelector('#liveCancel').addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Descartar entreno', message: 'Se perderá lo registrado en esta sesión.', confirmLabel: 'Descartar', danger: true });
      if (!ok) return;
      clearInterval(app._liveTimer); app._liveTimer = null;
      app._restEndTs = null;
      await DB.del('sessions', s.id);   // borra el borrador autoguardado
      app._live = null;
      app.go('sessions', {}, true);
    });
    root.querySelector('#liveFinish').addEventListener('click', async () => {
      syncLive(root, s);
      // limpiar series vacías y entradas sin series
      s.entries.forEach(e => { e.sets = (e.sets || []).filter(setHasData); });
      s.entries = s.entries.filter(e => e.sets.length > 0);
      if (s.entries.length === 0) { UI.toast('Registra al menos una serie', 'err'); return; }
      s.durationSec = Math.floor((Date.now() - s.startTs) / 1000);
      delete s.startTs;
      delete s.draft;   // ya no es borrador: pasa al historial
      const prs = detectPRs(s);          // ¿récords nuevos vs marcas previas?
      s.prs = prs.length ? prs : undefined;
      await DB.put('sessions', s);
      clearInterval(app._liveTimer); app._liveTimer = null;
      app._restEndTs = null;
      const id = s.id; app._live = null;
      app.go('session', { sessionId: id }, true);
      if (prs.length) celebratePRs(prs); else UI.toast('Sesión guardada');
    });
  }

  function syncLive(root, s) {
    syncEntries(root, s);
    const notes = root.querySelector('#liveNotes');
    if (notes) s.notes = notes.value;
  }

  // Añade un ejercicio (del catálogo o nuevo) a una sesión, vía buscador
  async function addExerciseToSession(app, session, onAdded) {
    const catalog = await DB.exercisesOf(app.activeUser.id);
    const categories = [...new Set(catalog.map(e => e.muscleGroup || 'General'))].sort((a, b) => a.localeCompare(b));
    UI.pickExercise({ exercises: catalog, categories, onPick: async (picked) => {
      let ex = picked;
      if (picked.isNew) {
        const clash = catalog.find(e => (e.name || '').trim().toLowerCase() === picked.name.trim().toLowerCase());
        if (clash) { ex = clash; UI.toast('Ese ejercicio ya existe; se ha usado el existente'); }
        else {
          ex = { id: DB.uid('ex'), userId: app.activeUser.id, name: picked.name, muscleGroup: picked.muscleGroup, type: picked.type, createdAt: Date.now() };
          await DB.put('exercises', ex);
        }
      }
      const entry = { exerciseId: ex.id, name: ex.name, type: ex.type, target: '', sets: [emptySet(ex.type)] };
      if (ex.type === 'time' && Array.isArray(ex.metrics)) entry.metrics = ex.metrics.slice();
      session.entries.push(entry);
      onAdded();
    } });
  }

  // =====================================================
  // HISTORIAL
  // =====================================================
  const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function dayLabel(iso) {
    if (!iso) return 'Sin fecha';
    const d = new Date(iso + 'T00:00:00');
    const s = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Helpers de fecha para el calendario de consistencia (a nivel de módulo para
  // que el componente y la navegación atrás compartan la misma lógica).
  const calIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const calAddDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return calIso(d); };
  const calMonday = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return calIso(d); };
  const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  let _calData = null;  // { trained, color, today, oldest }

  // Calendario compacto inline: las últimas 4 semanas, sin controles.
  function calInlineGrid() {
    const { trained, color, today } = _calData;
    const startMon = calAddDays(calMonday(today), -7 * 3); // 4 semanas terminando esta
    let cells = DOW.map(d => `<span class="cal-dow">${d}</span>`).join('');
    for (let i = 0; i < 28; i++) {
      const day = calAddDays(startMon, i);
      const on = trained.has(day), isToday = day === today, future = day > today;
      cells += `<span class="cal-cell${on ? ' on' : ''}${isToday ? ' today' : ''}${future ? ' future' : ''}"${on ? ` style="background:${color}"` : ''}>${parseInt(day.slice(8, 10), 10)}</span>`;
    }
    return cells;
  }

  // ----- Modal de historial: calendario mensual navegable -----
  let _histY = 0, _histM = 0;
  function histMonthHTML() {
    const { trained, color, today } = _calData;
    const monthKey = `${_histY}-${String(_histM + 1).padStart(2, '0')}`;
    const startMon = calMonday(monthKey + '-01');
    let cells = DOW.map(d => `<span class="cal-dow">${d}</span>`).join('');
    for (let i = 0; i < 42; i++) {
      const day = calAddDays(startMon, i);
      const inMonth = day.slice(0, 7) === monthKey;
      const on = trained.has(day), isToday = day === today, future = day > today;
      cells += `<span class="cal-cell hist${on ? ' on' : ''}${isToday ? ' today' : ''}${inMonth ? '' : ' out'}${future ? ' future' : ''}"${on ? ` style="background:${color}"` : ''}>${parseInt(day.slice(8, 10), 10)}</span>`;
    }
    const nm = new Date(_histY, _histM, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const nice = nm.charAt(0).toUpperCase() + nm.slice(1);
    const monthName = nm.split(' ')[0]; // "junio"
    const count = [...trained].filter(d => d.startsWith(monthKey)).length;
    const atPresent = monthKey >= today.slice(0, 7);
    const atOldest = monthKey <= _calData.oldest.slice(0, 7);
    return `<div class="hist-nav">
        <button class="cal-arrow${atOldest ? ' disabled' : ''}" data-hist-prev aria-label="Mes anterior"${atOldest ? ' disabled' : ''}>‹</button>
        <span class="hist-month">${nice}</span>
        <button class="cal-arrow${atPresent ? ' disabled' : ''}" data-hist-next aria-label="Mes siguiente"${atPresent ? ' disabled' : ''}>›</button>
      </div>
      <div class="cal-grid hist-grid">${cells}</div>
      <p class="hist-summary">${count} día${count === 1 ? '' : 's'} entrenado${count === 1 ? '' : 's'} en ${monthName}</p>`;
  }
  function bindHist(root) {
    const body = root.querySelector('#histBody');
    if (!body) return;
    const redraw = () => { body.innerHTML = histMonthHTML(); bindHist(root); };
    const prev = body.querySelector('[data-hist-prev]');
    const next = body.querySelector('[data-hist-next]');
    if (prev && !prev.disabled) prev.addEventListener('click', () => { if (--_histM < 0) { _histM = 11; _histY--; } redraw(); });
    if (next && !next.disabled) next.addEventListener('click', () => { if (++_histM > 11) { _histM = 0; _histY++; } redraw(); });
  }
  function openHistory() {
    if (!_calData) return;
    _histY = parseInt(_calData.today.slice(0, 4), 10);
    _histM = parseInt(_calData.today.slice(5, 7), 10) - 1;
    UI.modal({
      title: 'Historial de entrenos', size: 'wide',
      bodyHTML: `<div id="histBody">${histMonthHTML()}</div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => bindHist(root),
    });
  }

  // Racha y consistencia: racha de semanas seguidas + entrenos esta semana +
  // días totales + calendario compacto (toca para ver el historial mensual).
  function streakWidget(sessions, color) {
    const trained = new Set(sessions.map(s => s.date).filter(Boolean));
    if (trained.size === 0) return '';
    const today = DB.todayISO();

    const weeks = new Set([...trained].map(calMonday));
    const thisMon = calMonday(today);
    let cursor = thisMon;
    if (!weeks.has(cursor)) cursor = calAddDays(cursor, -7); // gracia: esta semana sin entrenar aún no rompe la racha
    let streak = 0;
    while (weeks.has(cursor)) { streak++; cursor = calAddDays(cursor, -7); }
    const thisWeekCount = [...trained].filter(d => calMonday(d) === thisMon).length;
    const totalDays = trained.size;

    _calData = { trained, color, today, oldest: [...trained].sort()[0] };

    return `<div class="streak-card">
      <button class="streak-expand" data-hist aria-label="Ver historial mensual" title="Ver historial">${UI.icon('expand', 15)}</button>
      <div class="streak-stats">
        <div class="streak-fig"><span class="streak-num">🔥 ${streak}</span><span class="streak-lbl">semana${streak === 1 ? '' : 's'}</span></div>
        <div class="streak-fig"><span class="streak-num">${thisWeekCount}</span><span class="streak-lbl">esta semana</span></div>
        <div class="streak-fig"><span class="streak-num">${totalDays}</span><span class="streak-lbl">días totales</span></div>
      </div>
      <div class="cal-grid" data-hist role="button" title="Ver historial">${calInlineGrid()}</div>
    </div>`;
  }

  async function list(app, params) {
    const filter = params.filterUser || app.mainUser.id;
    const year = params.year || '', month = params.month || '', day = params.day || '';
    const users = await DB.getUsers();

    let all;
    if (filter === 'all') {
      all = [];
      for (const u of users) all.push(...await DB.sessionsOf(u.id));
    } else {
      all = await DB.sessionsOf(filter);
    }
    all = all.filter(s => !s.draft);

    // Racha/consistencia del usuario relevante (el filtrado; si "Todos", el principal)
    const streakUser = app.userById(filter === 'all' ? app.mainUser.id : filter) || app.mainUser;
    const streakSessions = filter === 'all' ? all.filter(s => s.userId === streakUser.id) : all;

    // años disponibles (antes de filtrar por fecha, para no perder opciones)
    const years = [...new Set(all.map(s => (s.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();

    const inFilter = (s) => {
      const dt = s.date || '';
      if (year && dt.slice(0, 4) !== year) return false;
      if (month && dt.slice(5, 7) !== month) return false;
      if (day && dt.slice(8, 10) !== day) return false;
      return true;
    };
    const sessions = all.filter(inFilter).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    const chips = [{ id: 'all', name: 'Todos' }].concat(users.map(u => ({ id: u.id, name: u.name })))
      .map(c => `<button class="chip${filter === c.id ? ' on' : ''}" data-filter="${c.id}">${UI.esc(c.name)}</button>`).join('');

    const yearSel = `<select class="inp date-filter" data-df="year"><option value="">Año</option>${years.map(y => `<option value="${y}"${year === y ? ' selected' : ''}>${y}</option>`).join('')}</select>`;
    const monthSel = `<select class="inp date-filter" data-df="month"><option value="">Mes</option>${MONTH_NAMES.map((n, i) => { const mm = String(i + 1).padStart(2, '0'); return `<option value="${mm}"${month === mm ? ' selected' : ''}>${n}</option>`; }).join('')}</select>`;
    const daySel = `<select class="inp date-filter" data-df="day"><option value="">Día</option>${Array.from({ length: 31 }, (_, i) => { const dd = String(i + 1).padStart(2, '0'); return `<option value="${dd}"${day === dd ? ' selected' : ''}>${i + 1}</option>`; }).join('')}</select>`;
    const anyDateFilter = year || month || day;

    // agrupar por DÍA (fecha completa)
    const groups = {};
    sessions.forEach(s => { const key = s.date || 'Sin fecha'; (groups[key] = groups[key] || []).push(s); });

    const body = Object.keys(groups).sort().reverse().map(key => `
      <div class="month-group"><div class="month-label">${dayLabel(key)}</div>
      ${groups[key].map(s => {
        const author = app.userById(s.userId);
        const setCount = (s.entries || []).reduce((n, e) => n + (e.sets ? e.sets.length : 0), 0);
        return `<button class="session-row" data-link="session" data-params='${JSON.stringify({ sessionId: s.id, ownerId: s.userId })}'>
          <div class="session-main">
            <strong>${UI.esc(s.name || 'Sesión')}</strong>
            <span class="dim">${(s.entries || []).length} ejercicios · ${setCount} series${s.durationSec ? ' · ' + fmtClock(s.durationSec) : ''}</span>
          </div>
          ${filter === 'all' && author ? UI.avatar(author, 26) : '<span class="chev">›</span>'}
        </button>`;
      }).join('')}
      </div>`).join('');

    const emptyMsg = anyDateFilter
      ? '<div class="empty-state"><p>No hay sesiones con ese filtro.</p></div>'
      : '<div class="empty-state"><p>Aún no hay sesiones registradas.</p><p class="dim">Empieza un entreno desde un día de tu plan o añádelo manualmente.</p></div>';

    return `<div class="section">
      <div class="chips-row">${chips}</div>
      ${streakWidget(streakSessions, streakUser.color)}
      <div class="date-filters">${yearSel}${monthSel}${daySel}${anyDateFilter ? '<button class="btn ghost small" id="clearDates">✕ Limpiar</button>' : ''}</div>
      <div class="sessions-cta">
        <button class="btn primary" id="startFromDay">${UI.icon('play', 15)} ${app._live ? 'Continuar entreno' : 'Registrar entreno'}</button>
        <button class="btn ghost" id="addManual">+ Añadir manual</button>
      </div>
      ${sessions.length ? body : emptyMsg}
    </div>`;
  }

  function listBind(app, root) {
    const cur = app.params || {};
    root.querySelectorAll('[data-hist]').forEach(b => b.addEventListener('click', () => openHistory())); // abre el historial mensual
    const go = (patch) => app.go('sessions', { filterUser: cur.filterUser, year: cur.year, month: cur.month, day: cur.day, ...patch }, true);
    root.querySelectorAll('[data-filter]').forEach(c => c.addEventListener('click', () => go({ filterUser: c.dataset.filter })));
    root.querySelectorAll('[data-df]').forEach(sel => sel.addEventListener('change', () => go({ [sel.dataset.df]: sel.value || undefined })));
    const clear = root.querySelector('#clearDates');
    if (clear) clear.addEventListener('click', () => go({ year: undefined, month: undefined, day: undefined }));
    root.querySelector('#startFromDay').addEventListener('click', () => {
      if (app._live) { app.go('live', { dayId: app._live.dayId }); return; }
      pickDayToStart(app);
    });
    root.querySelector('#addManual').addEventListener('click', () => sessionEditor(app, null));
  }

  // Comprueba si hay un entreno a medias (borrador) al arrancar y ofrece continuarlo.
  async function checkResume(app) {
    const drafts = (await DB.sessionsOf(app.activeUser.id)).filter(s => s.draft);
    if (!drafts.length) return;
    drafts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const draft = drafts[0];
    for (let i = 1; i < drafts.length; i++) await DB.del('sessions', drafts[i].id); // limpia extras
    app._live = draft;
    app.updateActiveBar();
    UI.modal({
      title: 'Entrenamiento a medias',
      bodyHTML: `<p class="modal-text">Dejaste un entrenamiento sin terminar${draft.name ? ` (<strong>${UI.esc(draft.name)}</strong>)` : ''}. ¿Quieres continuarlo?</p>`,
      actions: [
        { label: 'Descartar', kind: 'danger', onClick: async () => { await DB.del('sessions', draft.id); app._live = null; app.updateActiveBar(); UI.toast('Entreno descartado'); } },
        { label: 'Continuar', kind: 'primary', onClick: () => { app.go('live', { dayId: draft.dayId }); } },
      ],
    });
  }

  function pickDayToStart(app) {
    const days = (app.routine?.days || []).filter(d => !d.isRest);
    UI.modal({
      title: 'Empezar entreno',
      bodyHTML: `<p class="modal-text dim">Elige el día de tu plan que vas a entrenar:</p>
        <div class="menu-list">
          ${days.map(d => `<button class="menu-row" data-day="${d.id}"><span><strong>${UI.esc(d.name)}</strong> — ${UI.esc(d.focus || '')}</span><span class="chev">›</span></button>`).join('')}
          <button class="menu-row" data-day=""><span>Entreno libre (sin plan)</span><span class="chev">›</span></button>
        </div>`,
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: (root) => root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
        UI.closeModal();
        app._live = null;
        app.go('live', { dayId: b.dataset.day || null });
      })),
    });
  }

  // =====================================================
  // DETALLE DE SESIÓN
  // =====================================================
  async function detail(app, params) {
    const s = await DB.get('sessions', params.sessionId);
    if (!s) return `<div class="empty-state"><p>Sesión no encontrada.</p></div>`;
    const author = app.userById(s.userId);
    const vol = sessionVolume(s);

    const entries = (s.entries || []).map((e, ei) => {
      const rows = (e.sets || []).map((set, i) => {
        return `<li><span class="set-n-sm">${i + 1}</span><span>${UI.esc(setDisplay(e.type || 'weight', set))}</span></li>`;
      }).join('');
      const note = e.note ? `<div class="ex-note"><span class="ex-note-txt">${UI.icon('edit', 13)} ${UI.esc(e.note)}</span></div>` : '';
      return `<div class="block"><div class="block-label detail-ex-head"><span>${UI.esc(e.name)}</span><button class="icon-btn" data-ai-done data-ei="${ei}" title="Consultar a una IA sobre este ejercicio">${UI.icon('chat', 16)}</button></div><ul class="set-detail-list">${rows}</ul>${note}</div>`;
    }).join('');

    return `<div class="section">
      <div class="detail-hero">
        <div class="session-author">${author ? UI.avatar(author, 24) + `<span>${UI.esc(author.name)}</span>` : ''}</div>
        <h2>${UI.esc(s.name || 'Sesión')}</h2>
        <div class="meta">
          <span>${UI.icon('calendar', 13)} ${UI.fmtDate(s.date)}</span>
          ${s.durationSec ? `<span>${UI.icon('clock', 13)} ${fmtClock(s.durationSec)}</span>` : ''}
          ${vol ? `<span>${UI.icon('dumbbell', 13)} ${vol} kg vol.</span>` : ''}
        </div>
      </div>
      ${(s.prs && s.prs.length) ? `<div class="pr-banner">${UI.icon('star', 16)}<div><strong>Récord${s.prs.length > 1 ? 's' : ''} personal${s.prs.length > 1 ? 'es' : ''}</strong>${s.prs.map(p => `<span class="pr-chip">${UI.esc(p.name)}: <b>${UI.esc(prValueText(p.type, p.value))}</b></span>`).join('')}</div></div>` : ''}
      ${entries || '<p class="dim">Sin ejercicios.</p>'}
      ${s.notes ? `<div class="note-box"><div class="block-label">Notas</div><p>${UI.esc(s.notes)}</p></div>` : ''}
      <div class="detail-toolbar">
        <button class="btn ghost" data-act="edit">${UI.icon('edit', 16)} Editar</button>
        <button class="btn ghost" data-act="share">${UI.icon('upload', 16)} Compartir</button>
        <button class="btn ghost danger" data-act="del">${UI.icon('trash', 16)} Eliminar</button>
      </div>
    </div>`;
  }

  function detailBind(app, root, params) {
    root.querySelector('[data-act="edit"]').addEventListener('click', async () => {
      const s = await DB.get('sessions', params.sessionId);
      sessionEditor(app, s);
    });
    root.querySelector('[data-act="share"]').addEventListener('click', () => VData.exportSession(app, params.sessionId));
    root.querySelectorAll('[data-ai-done]').forEach(b => b.addEventListener('click', async () => {
      const s = await DB.get('sessions', params.sessionId);
      if (s) UI.askAI(buildExerciseContext(s, s.entries[+b.dataset.ei], { past: true }));
    }));
    root.querySelector('[data-act="del"]').addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Eliminar sesión', message: 'Se borrará esta sesión permanentemente.', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.del('sessions', params.sessionId);
      app.go('sessions', {}, true);
      UI.toast('Sesión eliminada');
    });
  }

  // =====================================================
  // EDITOR DE SESIÓN (manual / editar existente)
  // =====================================================
  async function sessionEditor(app, existing) {
    const isNew = !existing;
    const users = await DB.getUsers();
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: DB.uid('ses'), userId: app.activeUser.id, date: DB.todayISO(), name: '', entries: [], notes: '', createdAt: Date.now() };

    const render = (root) => {
      const body = root.querySelector('.modal-body');
      body.innerHTML = `
        <div id="sesMeta">
          ${UI.field('Nombre', UI.input('name', draft.name, { placeholder: 'Ej: Empuje' }))}
          ${UI.field('Fecha', UI.input('date', draft.date, { type: 'date' }))}
          ${UI.field('Duración (min)', UI.input('durationMin', draft.durationSec ? Math.round(draft.durationSec / 60) : '', { type: 'number', min: 0, placeholder: 'Ej: 55' }), 'Cuánto has tardado. Opcional.')}
          ${UI.field('Autoría', UI.select('userId', users.map(u => ({ value: u.id, label: u.name + (u.isMain ? ' (principal)' : '') })), draft.userId))}
        </div>
        <div class="editor-entries">${draft.entries.map((e, i) => entryCardHTML(e, i, 'edit')).join('') || '<p class="dim">Sin ejercicios todavía.</p>'}</div>
        <button class="btn ghost block" id="sesAddEx">+ Añadir ejercicio</button>
        <label class="field"><span class="field-label">Notas</span><textarea class="inp" name="notes" id="sesNotes" rows="2">${UI.esc(draft.notes)}</textarea></label>`;
      bindEditorBody(root);
    };

    const syncMeta = (root) => {
      const m = UI.readForm(root.querySelector('#sesMeta'));
      draft.name = m.name; draft.date = m.date; draft.userId = m.userId;
      const dm = parseFloat(m.durationMin);
      draft.durationSec = (m.durationMin !== '' && !isNaN(dm) && dm >= 0) ? Math.round(dm * 60) : undefined;
      const notes = root.querySelector('#sesNotes'); if (notes) draft.notes = notes.value;
      syncEntries(root, draft);
    };

    const bindEditorBody = (root) => {
      root.querySelectorAll('[data-add-set]').forEach(b => b.addEventListener('click', () => { syncMeta(root); draft.entries[+b.dataset.ei].sets.push(emptySet(draft.entries[+b.dataset.ei].type)); render(root); }));
      root.querySelectorAll('[data-rm-set]').forEach(b => b.addEventListener('click', () => { syncMeta(root); draft.entries[+b.dataset.ei].sets.splice(+b.dataset.si, 1); render(root); }));
      root.querySelectorAll('[data-add-drop]').forEach(b => b.addEventListener('click', () => { syncMeta(root); const set = draft.entries[+b.dataset.ei].sets[+b.dataset.si]; (set.drops = set.drops || []).push(emptyDrop(draft.entries[+b.dataset.ei].type)); render(root); }));
      root.querySelectorAll('[data-rm-drop]').forEach(b => b.addEventListener('click', () => { syncMeta(root); const set = draft.entries[+b.dataset.ei].sets[+b.dataset.si]; if (set.drops) set.drops.splice(+b.dataset.di, 1); render(root); }));
      root.querySelectorAll('[data-rm-ex]').forEach(b => b.addEventListener('click', () => { syncMeta(root); draft.entries.splice(+b.dataset.ei, 1); render(root); }));
      UI.makeSortable(root.querySelector('.editor-entries'), {
        itemSelector: '.ex-card', handleSelector: '[data-drag="card"]',
        onReorder: (order) => { syncMeta(root); draft.entries = order.map(i => draft.entries[+i]); render(root); },
      });
      root.querySelectorAll('[data-metrics]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); const entry = draft.entries[+b.dataset.ei];
        pickMetrics(app, entry, async (keys) => { await applyMetrics(app, entry, keys); render(root); });
      }));
      root.querySelectorAll('[data-note]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); const entry = draft.entries[+b.dataset.ei];
        editNote(app, entry, (note) => { entry.note = note || undefined; render(root); });
      }));
      root.querySelectorAll('[data-set-effort]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); const set = draft.entries[+b.dataset.ei].sets[+b.dataset.si];
        pickSetEffort(set.effort, (eff) => { set.effort = eff || undefined; render(root); });
      }));
      root.querySelector('#sesAddEx').addEventListener('click', () => { syncMeta(root); addExerciseToSession(app, draft, () => render(root)); });
    };

    UI.modal({
      title: isNew ? 'Añadir sesión' : 'Editar sesión', size: 'wide', bodyHTML: '',
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          syncMeta(root);
          if (!draft.name.trim()) draft.name = 'Sesión';
          draft.entries.forEach(e => { e.sets = e.sets.filter(setHasData); });
          draft.entries = draft.entries.filter(e => e.sets.length > 0);
          // recalcular récords de la sesión editada (un ejercicio quitado deja de tener récord)
          const others = (await DB.sessionsOf(draft.userId)).filter(x => !x.draft && x.id !== draft.id);
          const prs = recomputePRs(draft, others);
          draft.prs = prs.length ? prs : undefined;
          await DB.put('sessions', draft);
          UI.toast('Sesión guardada');
          if (app.currentView === 'session') app.go('session', { sessionId: draft.id }, true);
          else app.render();
        }},
      ],
      onMount: render,
    });
  }

  return { live, liveBind, list, listBind, detail, detailBind, sessionVolume, checkResume, liveHasData, restEnsure, TIME_FIELDS, DEFAULT_TIME_METRICS };
})();
