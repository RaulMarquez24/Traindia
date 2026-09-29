// ============================================================
// VISTAS: Sesiones — registro en vivo, manual, historial, edición
// ============================================================

const VSessions = (() => {

  // -------- helpers de modelo --------
  // Datos extra opcionales de los ejercicios de TIEMPO (cardio). Se eligen por
  // ejercicio (se recuerdan) y/o sobre la marcha; solo se muestran los activos.
  // scope: 'set' = se registra en cada serie (intensidad); 'total' = se registra
  // UNA vez por ejercicio (se lee de la máquina al terminar) y se guarda en entry.totals.
  const TIME_FIELDS = [
    { key: 'time', label: 'Tiempo total', unit: '', ph: '', step: '1', scope: 'total' }, // suma de las series (opcional, editable)
    { key: 'distance', label: 'Distancia', unit: 'km', ph: 'km', step: '0.01', scope: 'total' },
    { key: 'kcal', label: 'Kcal', unit: 'kcal', ph: 'kcal', step: '1', scope: 'total' },
    { key: 'hr', label: 'Pulsaciones', unit: 'ppm', ph: 'ppm', step: '1', scope: 'total' },
    { key: 'speed', label: 'Velocidad', unit: 'km/h', ph: 'km/h', step: '0.1', scope: 'set' },
    { key: 'incline', label: 'Inclinación', unit: '%', ph: 'incl %', step: '0.5', scope: 'set' },
    { key: 'level', label: 'Nivel', unit: '', ph: 'nivel', step: '1', scope: 'set' },
    { key: 'weight', label: 'Peso', unit: 'kg', ph: 'kg', step: '0.5', scope: 'set' },
    { key: 'load', label: 'Lastre / asistencia', unit: '', ph: '', step: '0.5', scope: 'set' }, // opcional: para suspensiones/colgadas (± kg), como en peso corporal
  ];
  const TIME_FIELD = Object.fromEntries(TIME_FIELDS.map(f => [f.key, f]));

  // Datos opcionales de los ejercicios de «HECHO / NO HECHO» (estiramientos, movilidad,
  // acarreos…): además de la marca, cuánto duró, con qué peso… Todos van por serie y
  // se eligen por ejercicio, igual que en los de tiempo.
  const CHECK_FIELDS = [
    { key: 'time', label: 'Tiempo', unit: 'min:seg', ph: '', step: '1' },
    { key: 'reps', label: 'Repeticiones', unit: '', ph: 'reps', step: '1' },
    { key: 'weight', label: 'Peso', unit: 'kg', ph: 'kg', step: '0.5' },
    { key: 'load', label: 'Lastre / asistencia', unit: '± kg', ph: '', step: '0.5' },
    { key: 'distance', label: 'Distancia', unit: 'km', ph: 'km', step: '0.01' },
  ];
  const CHECK_FIELD = Object.fromEntries(CHECK_FIELDS.map(f => [f.key, f]));
  function checkHasValue(s, k) {
    if (k === 'load') return !!(s.load || s.loadMode); // el lastre/asist ocupa dos campos
    return s[k] !== undefined && s[k] !== null && s[k] !== '';
  }
  // Datos activos de una entry de hecho/no hecho: los elegidos + los que ya tengan valor.
  function checkActiveMetrics(entry) {
    const keys = new Set(Array.isArray(entry.metrics) ? entry.metrics : []);
    CHECK_FIELDS.forEach(f => { if ((entry.sets || []).some(s => checkHasValue(s, f.key))) keys.add(f.key); });
    return CHECK_FIELDS.filter(f => keys.has(f.key)).map(f => f.key);
  }
  // Métricas activas de una entry de tiempo: las elegidas (entry.metrics) + las
  // que ya tengan datos (para no ocultar nada introducido), ordenadas.
  // OJO: sin métricas elegidas NO se asume cardio (un ejercicio de tiempo "pelado"
  // —plancha, hang— no lleva totales). 'time' nunca se activa por tener set.time
  // (lo tienen todas las series); solo si está elegido o hay un total manual.
  function timeActiveMetrics(entry) {
    const chosen = Array.isArray(entry.metrics) ? entry.metrics : [];
    const keys = new Set(chosen);
    TIME_FIELDS.forEach(f => {
      if (f.key === 'time') { if (entry.totals && entry.totals.time) keys.add('time'); return; }
      const hasData = f.key === 'load'
        ? (entry.sets || []).some(s => s.load || s.loadMode) // el lastre/asist va en load + loadMode
        : (entry.sets || []).some(s => s[f.key]) || (entry.totals && entry.totals[f.key]);
      if (hasData) keys.add(f.key);
    });
    return TIME_FIELDS.filter(f => keys.has(f.key)).map(f => f.key);
  }
  // Métricas activas filtradas por scope (genérico: hoy solo cardio usa 'total').
  function metricsForScope(entry, scope) {
    return timeActiveMetrics(entry).filter(k => (TIME_FIELD[k].scope || 'set') === scope);
  }
  const timeSetMetrics = (entry) => metricsForScope(entry, 'set');     // van en cada serie
  const timeTotalMetrics = (entry) => metricsForScope(entry, 'total'); // van como total del ejercicio
  // ¿Esta entry de tiempo lleva totales? (cardio). Compat: sesiones viejas con distance/kcal por serie.
  function entryHasTotals(entry) {
    if (timeTotalMetrics(entry).length) return true;
    if (entry.totals && Object.keys(entry.totals).some(k => entry.totals[k])) return true;
    return (entry.sets || []).some(s => s.distance || s.kcal);
  }
  async function setExerciseMetrics(app, exId, keys) {
    if (!exId) return;
    const ex = await DB.get('exercises', exId);
    if (ex) { ex.metrics = keys; await DB.put('exercises', ex); }
  }
  // Aplica la selección de datos a la entry (limpia los quitados) y la recuerda en el ejercicio.
  async function applyMetrics(app, entry, keys) {
    if (entry.type === 'check') return applyCheckMetrics(app, entry, keys);
    const ordered = TIME_FIELDS.filter(f => keys.includes(f.key)).map(f => f.key);
    const removed = timeActiveMetrics(entry).filter(k => !ordered.includes(k));
    (entry.sets || []).forEach(s => removed.forEach(k => {
      if (k === 'time') return;          // 'time' por serie es la duración: NO borrar
      delete s[k];
      if (k === 'load') delete s.loadMode; // el lastre/asist ocupa dos campos
    }));
    if (entry.totals) removed.forEach(k => { delete entry.totals[k]; }); // quita también los totales descartados (incl. tiempo total)
    entry.metrics = ordered;
    await setExerciseMetrics(app, entry.exerciseId, ordered);
  }
  async function applyCheckMetrics(app, entry, keys) {
    const ordered = CHECK_FIELDS.filter(f => keys.includes(f.key)).map(f => f.key);
    const removed = checkActiveMetrics(entry).filter(k => !ordered.includes(k));
    (entry.sets || []).forEach(s => removed.forEach(k => { delete s[k]; if (k === 'load') delete s.loadMode; }));
    entry.metrics = ordered;
    await setExerciseMetrics(app, entry.exerciseId, ordered);
  }
  function pickCheckMetrics(app, entry, onDone) {
    const active = new Set(checkActiveMetrics(entry));
    UI.modal({
      title: 'Datos a registrar',
      bodyHTML: `<div class="metric-opts">${CHECK_FIELDS.map(f => `<label class="metric-opt"><input type="checkbox" data-mk="${f.key}"${active.has(f.key) ? ' checked' : ''}><span>${f.label}${f.unit ? ` <em>(${f.unit})</em>` : ''}</span></label>`).join('')}</div>
        <p class="field-hint">Opcional: además de marcarlo, apunta cuánto duró, con qué peso… Se recuerda para este ejercicio.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Listo', kind: 'primary', onClick: async (root) => {
          await onDone([...root.querySelectorAll('[data-mk]')].filter(c => c.checked).map(c => c.dataset.mk));
        } },
      ],
    });
  }
  function pickMetrics(app, entry, onDone) {
    if (entry.type === 'check') return pickCheckMetrics(app, entry, onDone);
    const active = new Set(timeActiveMetrics(entry));
    const opt = (f) => `<label class="metric-opt"><input type="checkbox" data-mk="${f.key}"${active.has(f.key) ? ' checked' : ''}><span>${f.label}${f.unit ? ` <em>(${f.unit})</em>` : ''}</span></label>`;
    const totals = TIME_FIELDS.filter(f => f.scope === 'total');
    const perSet = TIME_FIELDS.filter(f => (f.scope || 'set') === 'set');
    UI.modal({
      title: 'Datos a registrar',
      bodyHTML: `
        <div class="metric-group-label">Totales del ejercicio <span class="dim">(una vez)</span></div>
        <div class="metric-opts">${totals.map(opt).join('')}</div>
        <div class="metric-group-label">Por serie</div>
        <div class="metric-opts">${perSet.map(opt).join('')}</div>
        <p class="field-hint">Los totales se anotan una vez al final; lo de "por serie" en cada intervalo. Se recuerdan para este ejercicio.</p>`,
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

  // Etiqueta corta de una serie de cardio (andar/correr…). Ofrece como atajo las
  // etiquetas ya usadas en este ejercicio + escribir una nueva. onPick(label) ('' = quitar).
  function pickLabel(entry, current, onPick) {
    const used = [...new Set((entry.sets || []).map(s => (s.label || '').trim()).filter(Boolean))];
    UI.modal({
      title: 'Etiqueta de la serie',
      bodyHTML: `
        ${used.length ? `<div class="effort-pick" id="lblChips">${used.map(l => `<button type="button" class="effort-opt${l === current ? ' sel' : ''}" data-lbl="${UI.esc(l)}">${UI.esc(l)}</button>`).join('')}</div>` : ''}
        ${UI.field('Escribir', `<input class="inp" name="label" type="text" maxlength="18" value="${UI.esc(current || '')}" placeholder="andar, correr, sprint…">`)}
        <p class="field-hint">Toca una ya usada o escribe una nueva. Vacía para quitarla.</p>`,
      actions: [
        { label: 'Quitar', kind: 'ghost', onClick: () => onPick('') },
        { label: 'Guardar', kind: 'primary', onClick: (root) => onPick((root.querySelector('input[name="label"]').value || '').trim()) },
      ],
      onMount: (root) => root.querySelectorAll('[data-lbl]').forEach(b => b.addEventListener('click', () => { UI.closeModal(root); onPick(b.dataset.lbl); })),
    });
  }

  // Tiempo TOTAL del ejercicio (cardio): editable; vacío = suma de las series.
  // onPick(totalSec|null) — null = volver a usar la suma.
  function pickTotalTime(entry, onPick) {
    const sumSec = (entry.sets || []).reduce((a, s) => a + (parseInt(s.time) || 0), 0);
    const cur = (entry.totals && entry.totals.time) ? parseInt(entry.totals.time) : '';
    const mm = cur !== '' ? Math.floor(cur / 60) : '';
    const ss = cur !== '' ? cur % 60 : '';
    UI.modal({
      title: 'Tiempo total',
      bodyHTML: `<div class="set-row" style="grid-template-columns:1fr auto 1fr;max-width:200px">
          <input class="inp set-f" id="ttMin" type="number" min="0" value="${mm}" placeholder="min"><span class="set-x">:</span><input class="inp set-f" id="ttSec" type="number" min="0" max="59" value="${ss}" placeholder="seg">
        </div>
        <p class="field-hint">Déjalo vacío para usar la suma de las series (${fmtClock(sumSec)}). Útil si solo registras los intervalos importantes.</p>`,
      actions: [
        { label: 'Usar la suma', kind: 'ghost', onClick: () => onPick(null) },
        { label: 'Guardar', kind: 'primary', onClick: (root) => {
          const m = parseInt(root.querySelector('#ttMin').value) || 0, s = parseInt(root.querySelector('#ttSec').value) || 0;
          const total = m * 60 + s; onPick(total > 0 ? total : null);
        } },
      ],
    });
  }

  // Repetir el bloque de series del ejercicio ×N. Muestra cuántas quedarán y pide confirmar.
  function pickRepeat(count, onPick) {
    UI.modal({
      title: 'Repetir bloque',
      bodyHTML: `<p class="modal-text">Tienes <strong>${count}</strong> serie${count === 1 ? '' : 's'}. Elige cuántas veces quieres el bloque en total.</p>
        <div class="rep-row">${UI.field('Veces (total)', `<input class="inp" id="repN" type="number" min="2" max="50" value="3" style="text-align:center">`)}</div>
        <div class="effort-pick" id="repQuick">${[2, 3, 4, 5, 6, 8, 10].map(n => `<button type="button" class="effort-opt" data-n="${n}">×${n}</button>`).join('')}</div>
        <p class="field-hint" id="repHint"></p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Aplicar', kind: 'primary', onClick: (root) => { const n = Math.min(50, Math.max(2, parseInt(root.querySelector('#repN').value) || 2)); onPick(n); } },
      ],
      onMount: (root) => {
        const inp = root.querySelector('#repN'), hint = root.querySelector('#repHint');
        const upd = () => { const n = Math.min(50, Math.max(2, parseInt(inp.value) || 2)); hint.textContent = `Quedarán ${count * n} series en total.`; };
        inp.addEventListener('input', upd);
        root.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { inp.value = b.dataset.n; upd(); }));
        upd();
      },
    });
  }

  // Carga de una serie de peso corporal: peso corporal / + lastre / − asistencia + kg.
  // onPick(loadMode, kg) — loadMode '' = peso corporal.
  function pickLoad(current, onPick) {
    const cm = current.loadMode || '';
    UI.modal({
      title: 'Carga de la serie',
      bodyHTML: `<div id="loadForm">
          <span class="field-label">Tipo</span>
          <div class="effort-pick" id="loadModes">
            <button type="button" class="effort-opt${cm === '' ? ' sel' : ''}" data-mode="">Peso corporal</button>
            <button type="button" class="effort-opt${cm === 'lastre' ? ' sel' : ''}" data-mode="lastre">+ Lastre</button>
            <button type="button" class="effort-opt${cm === 'asist' ? ' sel' : ''}" data-mode="asist">− Asistencia</button>
          </div>
          <div id="loadKgWrap" style="margin-top:10px;${cm ? '' : 'display:none'}">${UI.field('Kilos', UI.input('load', current.load != null ? current.load : '', { type: 'number', min: 0, step: 0.5, placeholder: 'kg' }))}</div>
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Aplicar', kind: 'primary', onClick: (root) => {
          const mode = root.querySelector('#loadModes .sel')?.dataset.mode || '';
          const kg = root.querySelector('input[name="load"]').value;
          onPick(mode, mode ? kg : '');
        } },
      ],
      onMount: (root) => {
        const modes = root.querySelector('#loadModes'), kgWrap = root.querySelector('#loadKgWrap');
        modes.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
          modes.querySelectorAll('.effort-opt').forEach(x => x.classList.remove('sel'));
          b.classList.add('sel');
          kgWrap.style.display = b.dataset.mode ? '' : 'none';
          if (b.dataset.mode) setTimeout(() => root.querySelector('input[name="load"]').focus(), 60);
        }));
      },
    });
  }

  function emptySet(type) {
    if (type === 'check') return { done: false, check: true }; // hecho / no hecho, sin más
    if (type === 'time') return { time: '', label: '', weight: '', speed: '', incline: '', level: '', done: false };
    if (type === 'reps') return { reps: '', load: '', loadMode: '', done: false };
    return { reps: '', weight: '', done: false };
  }
  function emptyDrop(type) {
    if (type === 'reps') return { reps: '', load: '' };
    return { reps: '', weight: '' };
  }
  // Copia una serie con sus valores (para "+ Serie copia anterior" y duplicar/repetir).
  // No copia los dropsets ni el estado "hecha".
  function cloneSet(set) {
    const c = { ...set, done: false };
    delete c.drops;
    delete c.skip; // tampoco arrastra un «No hecho»: la copia sale sin marcar
    return c;
  }

  function dropHasData(d) { return d && (d.reps || d.weight || d.load); }
  function setHasData(s) {
    // Ejercicios de "hecho / no hecho": el dato es la marca. «No hecho» (skip) también
    // se registra; solo lo que se queda sin marcar se considera vacío.
    if (s && s.check) return !!s.done || !!s.skip;
    return s.reps || s.weight || s.time || s.speed || s.level || s.incline || s.load || s.distance || s.kcal ||
      (s.drops && s.drops.some(dropHasData));
  }
  // «Hecho / no hecho»: tocar una opción la marca; tocar la que ya está marcada la
  // quita (vuelve a «sin marcar»). Son excluyentes: marcar una desmarca la otra.
  function marcarCheck(set, que) {
    if (que === 'done') {
      set.done = !set.done;
      if (set.done) delete set.skip;
    } else {
      if (set.skip) delete set.skip;
      else { set.skip = true; set.done = false; }
    }
  }
  function liveHasData(s) { return (s.entries || []).some(e => (e.sets || []).some(setHasData)); }
  // Series con algo apuntado / series planificadas. Con esto se sabe si un
  // ejercicio está hecho, a medias o sin empezar.
  function entryProgreso(entry) {
    const sets = entry.sets || [];
    return { hechas: sets.filter(setHasData).length, total: sets.length };
  }

  // sufijo lastre/asistencia para ejercicios de peso corporal
  function loadSuffix(set) {
    if (!set.load || !set.loadMode) return '';
    const sign = set.loadMode === 'asist' ? '−' : '+';
    return ` ${sign}${set.load}kg${set.loadMode === 'asist' ? ' asist' : ''}`;
  }
  // Chip tocable de carga (peso corporal / +lastre / −asistencia). Compartido por
  // las series de repes y por las de tiempo con la métrica 'load' activada.
  function loadChipHTML(s, ei, si, dis) {
    const lm = s.loadMode;
    const label = lm ? `${lm === 'asist' ? '−' : '+'} ${UI.esc(String(s.load || 0))} kg` : '+ carga';
    return `<button type="button" class="load-chip${lm ? ' on' : ''}" data-set-load data-ei="${ei}" data-si="${si}"${dis}>${label}</button>`;
  }
  // texto de una serie para detalle / contexto IA (incluye dropsets y esfuerzo)
  function setDisplay(type, set) {
    let v;
    if (type === 'check') {
      v = set.done ? 'Hecho' : set.skip ? 'No hecho' : '—';
      if (set.done) { // los datos solo tienen sentido si se hizo
        const extra = [];
        const t = fmtTime(set.time); if (t) extra.push(t);
        if (set.reps) extra.push(`${set.reps} reps`);
        if (set.weight) extra.push(`${set.weight} kg`);
        const ls = loadSuffix(set).trim(); if (ls) extra.push(ls);
        if (set.distance) extra.push(`${set.distance} km`);
        if (extra.length) v += ' · ' + extra.join(' · ');
      }
      if (set.effort) v += ` · ${set.effort}`;
      return v;
    }
    if (type === 'time') {
      const parts = [];
      const t = fmtTime(set.time); if (t) parts.push(t);
      if (set.distance) parts.push(`${set.distance} km`); // compat: sesiones viejas con distancia por serie
      if (set.kcal) parts.push(`${set.kcal} kcal`);       // compat
      if (set.weight) parts.push(`${set.weight} kg`);
      const ls = loadSuffix(set).trim(); if (ls) parts.push(ls); // lastre/asistencia (suspensiones/colgadas)
      const ex = cardioExtra(set); if (ex) parts.push(ex);
      v = parts.join(' · ') || '0s';
      if (set.label) v = `${set.label} · ${v}`;
    } else if (type === 'reps') {
      v = `${set.reps || 0} reps${loadSuffix(set)}`;
      (set.drops || []).filter(dropHasData).forEach(d => { v += ` → ${d.reps || 0}${d.load ? ` (${d.load}kg)` : ''}`; });
    } else {
      v = `${set.weight || 0} kg × ${set.reps || 0}`; // peso × repeticiones, como en Progreso
      (set.drops || []).filter(dropHasData).forEach(d => { v += ` → ${d.weight || 0} kg × ${d.reps || 0}`; });
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
      detail: ex.notes || undefined, // prescripción del plan (tempo, carga, tope…)
      sets: [],
    };
  }

  // Vídeo y notas de técnica del catálogo, para el botón "cómo se hace".
  let _exMeta = {};
  async function loadExMeta(app) {
    _exMeta = {};
    (await DB.exercisesOf(app.activeUser.id)).forEach(x => {
      const videos = DB.exVideos(x);
      if (videos.length || x.howto) _exMeta[x.id] = { videos, howto: x.howto, name: x.name };
    });
  }
  function showHowto(entry) {
    const m = entry && entry.exerciseId && _exMeta[entry.exerciseId];
    if (!m) return;
    const videos = m.videos || [];
    const acts = [{ label: 'Cerrar', kind: 'ghost' }];
    // Un solo vídeo: botón directo, como siempre. Varios: lista de enlaces en el cuerpo.
    if (videos.length === 1) {
      acts.push({ label: 'Ver vídeo', kind: 'primary', onClick: () => { window.open(videos[0].url, '_blank', 'noopener'); return false; } });
    }
    const listaVideos = videos.length > 1
      ? `<div class="howto-videos"><span class="field-label">Vídeos</span>${videos.map((v, i) =>
          `<a class="howto-video" href="${UI.esc(v.url)}" target="_blank" rel="noopener">${UI.icon('play', 15)}<span>${UI.esc(v.label || ('Vídeo ' + (i + 1)))}</span></a>`).join('')}</div>`
      : '';
    UI.modal({
      title: entry.name || m.name,
      bodyHTML: `${entry.detail ? `<p class="modal-text"><strong>En este plan:</strong> ${UI.esc(entry.detail)}</p>` : ''}
        ${m.howto ? `<p class="modal-text prewrap">${UI.esc(m.howto)}</p>` : '<p class="modal-text dim">Sin notas de técnica.</p>'}
        ${listaVideos}`,
      actions: acts,
    });
  }

  // ----- "Última vez": qué hiciste la sesión anterior con cada ejercicio -----
  // Empareja por exerciseId (robusto a renombres) y, si no hay, por nombre.
  function keyForEntry(entry) {
    return entry.exerciseId || (entry.name || '').trim().toLowerCase();
  }
  let _lastTimeMap = null; // key -> { date, type, sets } de la sesión más reciente
  let _prevDaySession = null; // sesión completa anterior del MISMO día (vistazo rápido en vivo)
  let _hasDocs = false;       // ¿hay documentos guardados? (botón en la cabecera del entreno)
  // La última sesión (no borrador) del mismo día del plan que la actual. Empareja por
  // dayId (preciso); si la actual no tiene dayId (entreno libre), cae al nombre.
  function findPrevDaySession(current, sessions) {
    if (!current) return null;
    const sameDay = current.dayId
      ? (x => x.dayId === current.dayId)
      : (x => (x.name || '').trim().toLowerCase() === (current.name || '').trim().toLowerCase());
    return sessions
      .filter(x => !x.draft && x.id !== current.id && sameDay(x))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
  }
  function buildLastTimeMap(sessions, excludeId) {
    const map = {};
    sessions
      .filter(s => !s.draft && s.id !== excludeId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0))
      .forEach(sess => (sess.entries || []).forEach(e => {
        const k = keyForEntry(e);
        if (!k || map[k]) return; // ya tenemos una más reciente para este ejercicio
        const done = (e.sets || []).filter(setHasData);
        if (done.length) map[k] = { date: sess.date, type: e.type || 'weight', sets: done, note: e.note, metrics: e.metrics, totals: e.totals };
      }));
    return map;
  }
  // Resumen compacto de un cardio de intervalos: agrupa series iguales (etiqueta+
  // tiempo+velocidad) → "Andar 2:00 @5.5 ×7 · Correr 3:00 @8.5 ×7 — 35:00 · 4.5 km".
  function summarizeCardioSets(sets) {
    const groups = [], idx = {};
    sets.forEach(st => {
      const t = parseInt(st.time) || 0;
      const key = `${(st.label || '').trim().toLowerCase()}|${t}|${st.speed || ''}`;
      if (idx[key] == null) { idx[key] = groups.length; groups.push({ label: (st.label || '').trim(), time: t, speed: st.speed, n: 0 }); }
      groups[idx[key]].n++;
    });
    return groups.map(g => {
      const lab = g.label ? `${g.label} ` : '';
      const dur = g.time ? fmtClock(g.time) : '';
      const sp = g.speed ? ` @${g.speed}` : '';
      const mult = g.n > 1 ? ` ×${g.n}` : '';
      return `${lab}${dur}${sp}${mult}`.trim();
    }).join(' · ');
  }
  function cardioTotalsText(prev, opts) {
    const includeTime = !opts || opts.includeTime !== false; // con 1 sola serie el tiempo total es redundante
    const t = prev.totals || {};
    const active = new Set(timeActiveMetrics({ type: 'time', metrics: prev.metrics, totals: t, sets: prev.sets }));
    const parts = [];
    if (includeTime && active.has('time')) { // tiempo total solo si está elegido (es opcional)
      const totalSec = (t.time != null && t.time !== '') ? parseInt(t.time) : prev.sets.reduce((a, s) => a + (parseInt(s.time) || 0), 0);
      if (totalSec) parts.push(fmtClock(totalSec));
    }
    const dist = t.distance ? parseFloat(t.distance) : prev.sets.reduce((a, s) => a + (parseFloat(s.distance) || 0), 0);
    const kc = t.kcal ? parseFloat(t.kcal) : prev.sets.reduce((a, s) => a + (parseFloat(s.kcal) || 0), 0);
    if (dist) parts.push(`${Math.round(dist * 100) / 100} km`);
    if (kc) parts.push(`${Math.round(kc)} kcal`);
    if (t.hr) parts.push(`${t.hr} ppm`);
    return parts.join(' · ');
  }
  // La serie equivalente de la última vez (la misma posición o, si hubo menos, la
  // última), para enseñarla en gris dentro de las casillas y usarla al tocar ✓.
  function lastSetFor(entry, si) {
    const prev = _lastTimeMap && _lastTimeMap[keyForEntry(entry)];
    const type = entry.type || 'weight';
    if (!prev || prev.type !== type || (type !== 'weight' && type !== 'reps') || !prev.sets.length) return null;
    return prev.sets[Math.min(si, prev.sets.length - 1)];
  }

  function lastTimeHTML(entry) {
    const prev = _lastTimeMap && _lastTimeMap[keyForEntry(entry)];
    if (!prev) return '';
    const isCardio = prev.type === 'time' && entryHasTotals({ type: 'time', metrics: prev.metrics, totals: prev.totals, sets: prev.sets });
    let body;
    if (isCardio) {
      const multi = (prev.sets || []).length > 1;          // 1 serie = la serie ya es el total
      const summary = summarizeCardioSets(prev.sets);
      const tot = cardioTotalsText(prev, { includeTime: multi }); // sin tiempo total si es una sola
      body = tot ? `${summary}${multi ? ' — ' : ' · '}${tot}` : summary;
    } else body = prev.sets.map(st => setDisplay(prev.type, st)).join(' · ');
    const note = prev.note ? `<div class="last-note"><span>${UI.icon('edit', 12)} ${UI.esc(prev.note)}</span></div>` : '';
    return `<div class="last-time">${UI.icon('clock', 12)} Última vez · ${UI.esc(UI.fmtDateShort(prev.date))}: <span>${UI.esc(body)}</span></div>${note}`;
  }

  // ----- Récords personales (PR): mejor marca histórica por ejercicio -----
  // Métrica principal por tipo: peso → kg máx, corporal → reps máx, tiempo → s máx.
  function metricOf(type, set) {
    if (type === 'check') return 0; // no compite por récords
    if (type === 'time') return parseFloat(set.time) || 0;
    if (type === 'reps') return parseFloat(set.reps) || 0;
    return parseFloat(set.weight) || 0;
  }
  // Mejor marca de UNA entry para récords. Cardio (tiempo con totales) → distancia
  // TOTAL de la sesión. Isométricos → tiempo máx de aguante. Resto → peso/reps máx.
  function entryBest(entry) {
    const type = entry.type || 'weight';
    if (type === 'time' && entryHasTotals(entry)) {
      const dist = (entry.totals && entry.totals.distance) ? parseFloat(entry.totals.distance)
        : (entry.sets || []).reduce((a, s) => a + (parseFloat(s.distance) || 0), 0);
      return { metric: 'distance', value: Math.round((dist || 0) * 100) / 100 };
    }
    let best = 0; (entry.sets || []).forEach(st => { const m = metricOf(type, st); if (m > best) best = m; });
    return { metric: type, value: best };
  }
  function prValueText(type, value) {
    if (type === 'distance') return value + ' km';
    if (type === 'time') return fmtTime(value) || (value + 's');
    if (type === 'reps') return value + ' reps';
    return value + ' kg';
  }
  let _prMap = null; // key -> { type, best, date }
  function buildPRMap(sessions, excludeId) {
    const map = {};
    sessions.filter(s => !s.draft && s.id !== excludeId).forEach(sess => (sess.entries || []).forEach(e => {
      const k = keyForEntry(e); if (!k) return;
      const { metric, value } = entryBest(e);
      if (value > 0 && (!map[k] || value > map[k].best)) map[k] = { type: metric, best: value, date: sess.date };
    }));
    return map;
  }
  // Compara la sesión recién terminada con las marcas previas y devuelve los récords nuevos.
  // Cuenta como récord tanto superar una marca anterior como establecer la primera (first).
  function detectPRs(session) {
    const prs = [];
    (session.entries || []).forEach(e => {
      const k = keyForEntry(e);
      const { metric, value } = entryBest(e);
      if (value <= 0) return;
      const prev = (_prMap && _prMap[k]) ? _prMap[k].best : 0;
      if (prev === 0) prs.push({ name: e.name, type: metric, value, prev: 0, first: true });
      else if (value > prev) prs.push({ name: e.name, type: metric, value, prev });
    });
    return prs;
  }
  // Recalcula los récords de una sesión EDITADA comparando con las demás sesiones
  // anteriores (así un ejercicio quitado o un valor cambiado deja de mostrar récord).
  function recomputePRs(session, others) {
    const prs = [];
    (session.entries || []).forEach(e => {
      const k = keyForEntry(e);
      const { metric, value } = entryBest(e);
      if (value <= 0) return;
      let prev = 0;
      others.forEach(os => {
        const before = (os.date || '') < (session.date || '') || ((os.date || '') === (session.date || '') && (os.createdAt || 0) < (session.createdAt || 0));
        if (!before) return;
        (os.entries || []).forEach(oe => {
          if (keyForEntry(oe) !== k) return;
          const v = entryBest(oe).value; if (v > prev) prev = v;
        });
      });
      if (prev === 0) prs.push({ name: e.name, type: metric, value, prev: 0, first: true });
      else if (value > prev) prs.push({ name: e.name, type: metric, value, prev });
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
  // Preferencias del final del descanso (Ajustes → Durante el entreno). Por defecto, las dos.
  const prefOn = (k) => { try { return localStorage.getItem(k) !== '0'; } catch (e) { return true; } };
  const setPref = (k, on) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch (e) {} };
  const restSoundOn = () => prefOn('traindia.restSound');
  const restVibrateOn = () => prefOn('traindia.restVibrate');
  const setRestSound = (on) => setPref('traindia.restSound', on);
  const setRestVibrate = (on) => setPref('traindia.restVibrate', on);
  function setRestDefault(app, sec) {
    app._restDuration = sec;
    try { localStorage.setItem('traindia.restDuration', String(sec)); } catch (e) {}
  }
  function getRestDuration(app) {
    if (!app._restDuration) {
      let v = 90;
      try { v = parseInt(localStorage.getItem('traindia.restDuration'), 10) || 90; } catch (e) {}
      app._restDuration = v;
    }
    return app._restDuration;
  }
  // ---- Aviso de fin de descanso como NOTIFICACIÓN del sistema ----
  // Opt-in (interruptor en el selector de duración). Fase 1, sin servidor: si la app
  // está en segundo plano cuando acaba el descanso, sale una notificación en vez del
  // aviso de dentro. Con el móvil bloqueado el navegador congela la página y no
  // llega: eso lo cubrirá el aviso desde el servidor (Web Push, fase 2).
  const REST_NOTIFY_KEY = 'traindia.restNotify';
  const REST_NOTIFY_TEXT = 'Te avisa al acabar el descanso aunque salgas de la app o bloquees el móvil. Para eso, al servidor de avisos de Traindía solo le llega cuándo acaba el descanso; nada de tus entrenos.';
  const REST_TAG = 'traindia-rest';
  const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
  function restNotifyOn() {
    try { return notifSupported() && Notification.permission === 'granted' && localStorage.getItem(REST_NOTIFY_KEY) === '1'; } catch (e) { return false; }
  }
  // Activa/desactiva. Al activar pide permiso (tiene que ser tras un toque).
  async function setRestNotify(on) {
    if (!on) {
      try { localStorage.setItem(REST_NOTIFY_KEY, '0'); } catch (e) {}
      pushSubscription(false).then(s => s && s.unsubscribe()).catch(() => {});
      return false;
    }
    if (!notifSupported()) { UI.toast('Este navegador no permite notificaciones', 'err'); return false; }
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
    if (perm !== 'granted') {
      UI.toast(perm === 'denied' ? 'Notificaciones bloqueadas: actívalas en los ajustes del móvil para Traindía' : 'Sin permiso para notificar', 'err');
      try { localStorage.setItem(REST_NOTIFY_KEY, '0'); } catch (e) {}
      return false;
    }
    try { localStorage.setItem(REST_NOTIFY_KEY, '1'); } catch (e) {}
    pushSubscription(true).catch(() => {}); // prepara el aviso con el móvil bloqueado
    return true;
  }
  async function restNotifications() {
    try { const reg = await navigator.serviceWorker.ready; return { reg, list: await reg.getNotifications({ tag: REST_TAG }) }; } catch (e) { return { reg: null, list: [] }; }
  }
  async function clearRestNotification() { (await restNotifications()).list.forEach(n => n.close()); }
  async function showRestNotification() {
    const { reg, list } = await restNotifications();
    if (!reg) return false;
    if (list.length) return true; // ya lo mostró el aviso del servidor: no vibrar dos veces
    try {
      await reg.showNotification('⏱ Descanso terminado', {
        body: 'A por la siguiente serie.',
        tag: REST_TAG, renotify: true, requireInteraction: false,
        icon: 'icon-192.png', badge: 'icon-192.png',
        vibrate: [220, 110, 220],
        data: { url: './' },
      });
      return true;
    } catch (e) { return false; }
  }
  // Al volver a la app, la notificación ya no hace falta.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && notifSupported()) clearRestNotification(); });
  // Si el aviso del servidor llega con la app delante, el SW lo dice: se quita.
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'rest-push' && document.visibilityState === 'visible') setTimeout(clearRestNotification, 1500);
  });

  // ---- Fase 2: aviso desde el servidor de avisos (Web Push) ----
  // Llega aunque el móvil esté bloqueado. Al servidor solo va la suscripción push
  // (la «dirección» del navegador) y cuánto falta para avisar; nada de los entrenos.
  // Si no hay red o el servidor no responde, queda el aviso local de arriba.
  const PUSH_URL_DEF = 'https://push.raulmarquez.dev';
  const pushUrl = () => { try { return localStorage.getItem('traindia.pushUrl') || PUSH_URL_DEF; } catch (e) { return PUSH_URL_DEF; } };
  async function pushFetch(path, opts = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(pushUrl() + path, { ...opts, cache: 'no-store', signal: ctl.signal, headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw new Error('push ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  function b64urlToBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  // Suscripción push del navegador. create: crearla si no hay (o si el servidor
  // cambió de clave, rehacerla).
  async function pushSubscription(create) {
    if (!('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!create) return sub;
    const { publicKey } = await pushFetch('/vapid');
    let used = ''; try { used = localStorage.getItem('traindia.pushKey') || ''; } catch (e) {}
    if (sub && used && used !== publicKey) { try { await sub.unsubscribe(); } catch (e) {} sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
    try { localStorage.setItem('traindia.pushKey', publicKey); } catch (e) {}
    return sub;
  }
  // Programa el aviso de ESTE descanso. app._restPush = promesa del id (para que
  // +15 s o parar funcionen aunque la petición aún no haya vuelto).
  function pushSchedule(app) {
    pushCancel(app);
    if (!restNotifyOn()) return;
    const inMs = Math.max(0, app._restEndTs - Date.now());
    app._restPush = pushPost(inMs).catch(() => null);
  }
  // Pide al servidor un aviso dentro de inMs. Devuelve el id; guarda el último
  // error (o lo borra si fue bien) para enseñarlo en Ajustes → Notificaciones.
  async function pushPost(inMs) {
    try {
      const sub = await pushSubscription(true);
      if (!sub) throw new Error('Este navegador no admite avisos push');
      const { id } = await pushFetch('/rest', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), inMs }) });
      try { localStorage.removeItem('traindia.pushLastError'); } catch (e) {}
      return id;
    } catch (e) {
      const msg = (e && (e.name === 'AbortError' ? 'El servidor de avisos no respondió a tiempo' : (e.message || e.name))) || 'error';
      try { localStorage.setItem('traindia.pushLastError', JSON.stringify({ msg, at: Date.now() })); } catch (x) {}
      throw e;
    }
  }
  // Estado para Ajustes: permiso, suscripción, servidor y último error.
  async function notifStatus() {
    const st = { supported: notifSupported(), permission: notifSupported() ? Notification.permission : 'unsupported', on: restNotifyOn(), subscribed: false, server: null, lastError: null };
    try { st.lastError = JSON.parse(localStorage.getItem('traindia.pushLastError') || 'null'); } catch (e) {}
    try { st.subscribed = !!(await pushSubscription(false)); } catch (e) {}
    try { await pushFetch('/health'); st.server = true; } catch (e) { st.server = false; }
    return st;
  }
  // Aviso de prueba por el servidor (para comprobarlo con el móvil bloqueado).
  async function testPush(inMs = 10000) {
    if (!restNotifyOn() && !(await setRestNotify(true))) return false;
    await pushPost(inMs);
    return true;
  }
  function pushReschedule(app) {
    const p = app._restPush; if (!p) return;
    p.then(id => { if (id && app._restEndTs) pushFetch('/rest/' + id, { method: 'PUT', body: JSON.stringify({ inMs: Math.max(0, app._restEndTs - Date.now()) }) }).catch(() => {}); });
  }
  function pushCancel(app) {
    const p = app._restPush; app._restPush = null;
    if (p) p.then(id => { if (id) pushFetch('/rest/' + id, { method: 'DELETE' }).catch(() => {}); });
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
    // El botón de empezar se pintó al abrir la vista: refleja la última duración elegida.
    const lbl = document.querySelector('#restMain .rest-label');
    if (lbl) lbl.textContent = `Descanso · ${getRestDuration(app)}s`;
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
        if (b.dataset.rest === 'add') { app._restEndTs += 15000; app._restFired = false; pushReschedule(app); restPaint(app); }
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
      if (rem <= 2 && app._restPush && document.visibilityState === 'visible') pushCancel(app);
      const c = _restNode && _restNode.querySelector('.rest-count');
      if (c) c.textContent = fmtClock(rem); else restEnsure(app);
      return;
    }
    if (!app._restFired) {
      app._restFired = true;
      app._restPush = null; // el del servidor ya se está enviando: no cancelarlo
      const fuera = document.visibilityState !== 'visible';
      if (fuera && restNotifyOn()) showRestNotification();
      if (restVibrateOn()) { try { if (navigator.vibrate) navigator.vibrate([220, 110, 220]); } catch (e) {} }
      if (restSoundOn()) beep();
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
    if (notifSupported()) clearRestNotification(); // la del descanso anterior, si seguía ahí
    pushSchedule(app);
    restEnsure(app);
  }
  function restStop(app) {
    pushCancel(app);
    app._restEndTs = null; app._restFired = false;
    restEnsure(app);
  }
  function pickRestDuration(app) {
    const opts = [45, 60, 90, 120, 180];
    const cur = getRestDuration(app);
    UI.modal({
      title: 'Tiempo de descanso',
      bodyHTML: `<div class="menu-list">
        ${opts.map(d => `<button class="menu-row" data-dur="${d}"><span><strong>${fmtClock(d)}</strong> · ${d}s</span><span class="chev">${d === cur ? '✓' : '›'}</span></button>`).join('')}
        <button class="menu-row" data-dur="custom"><span>Personalizado…${opts.includes(cur) ? '' : ` <span class="dim">(${cur}s)</span>`}</span><span class="chev">${opts.includes(cur) ? '›' : '✓'}</span></button>
      </div>
      ${notifSupported() ? `<label class="check-row rest-notif"><input type="checkbox" id="restNotif"${restNotifyOn() ? ' checked' : ''}>
        <span><strong>Avisar con notificación</strong><span class="dim">${REST_NOTIFY_TEXT}</span></span></label>` : ''}`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (m) => {
        const chk = m.querySelector('#restNotif');
        if (chk) chk.addEventListener('change', async () => {
          const on = await setRestNotify(chk.checked);
          chk.checked = on;
          if (on) UI.toast('Te avisaremos con una notificación');
        });
        m.querySelectorAll('[data-dur]').forEach(b => b.addEventListener('click', async () => {
        const v = b.dataset.dur;
        UI.closeModal();
        if (v === 'custom') {
          const r = await UI.prompt({ title: 'Descanso personalizado', label: 'Segundos', value: String(getRestDuration(app)), placeholder: 'Ej: 75' });
          const n = parseInt(r, 10);
          if (n && n > 0) restStart(app, n);
        } else {
          restStart(app, parseInt(v, 10));
        }
      }));
      },
    });
  }

  // -------- render de filas de serie (compartido live/editor) --------
  function setRowsHTML(entry, ei, mode) {
    const type = entry.type || 'weight';
    return (entry.sets || []).map((s, si) => {
      // En vivo, al marcar la serie (✓) se "bloquea": no se edita ni hay dropset.
      const locked = mode === 'live' && s.done && type !== 'check';
      const dis = locked ? ' disabled' : '';
      const done = (mode === 'live' || (mode === 'edit' && type === 'check'))
        ? `<button class="set-done${s.done ? ' on' : ''}" data-done data-ei="${ei}" data-si="${si}" title="${s.done ? 'Desmarcar' : 'Marcar como hecho'}">${UI.icon('check', 16)}</button>`
        : '';
      const rm = locked ? '' : `<button class="icon-btn danger" data-rm-set data-ei="${ei}" data-si="${si}">×</button>`;
      const effortBtn = (mode === 'live' || mode === 'edit')
        ? `<button type="button" class="set-rpe${s.effort ? ' on' : ''}" data-set-effort data-ei="${ei}" data-si="${si}" title="Esfuerzo de la serie">${s.effort ? UI.esc(s.effort) : '%'}</button>`
        : '';
      // Pie de serie: duplicar (todos) + dropset (peso/reps). Al confirmar una serie
      // se ocultan… salvo el duplicar de la ÚLTIMA: es la forma de encadenar otra
      // serie con los mismos kilos sin volver a teclearlos.
      const esUltima = si === (entry.sets || []).length - 1;
      const dupBtn = `<button type="button" class="set-drop-btn" data-dup-set data-ei="${ei}" data-si="${si}">↻ duplicar</button>`;
      const dropBtn = type !== 'time' ? ` <button type="button" class="set-drop-btn" data-add-drop data-ei="${ei}" data-si="${si}">↧ dropset</button>` : '';
      const footBtns = type === 'check' ? ''
        : locked ? (esUltima ? `<div class="set-foot">${dupBtn}</div>` : '')
        : `<div class="set-foot">${dupBtn}${dropBtn}</div>`;

      if (type === 'check') {
        // Sin números (estiramientos, movilidad…): se marca «Hecho» o «No hecho» y
        // las dos cosas quedan registradas. Sin marcar = aún sin decidir (no se guarda).
        const editable = mode === 'live' || mode === 'edit';
        const estado = s.done ? ' chk-done' : s.skip ? ' chk-skip' : '';
        const vals = editable
          ? `<div class="chk-seg" role="group" aria-label="¿Lo has hecho?">
              <button type="button" class="chk-opt chk-yes${s.done ? ' on' : ''}" data-chk="done" data-ei="${ei}" data-si="${si}" aria-pressed="${s.done ? 'true' : 'false'}">${UI.icon('check', 15)} Hecho</button>
              <button type="button" class="chk-opt chk-no${s.skip ? ' on' : ''}" data-chk="skip" data-ei="${ei}" data-si="${si}" aria-pressed="${s.skip ? 'true' : 'false'}">${UI.icon('x', 15)} No hecho</button>
            </div>`
          : `<span class="set-check-txt">${s.done ? 'Hecho' : s.skip ? 'No hecho' : 'Sin marcar'}</span>`;
        // Datos opcionales (tiempo, peso…). En «No hecho» no se enseñan, pero lo
        // apuntado no se borra: si vuelves a marcar «Hecho», reaparece.
        const ms = (editable && !s.skip) ? checkActiveMetrics(entry) : [];
        const extra = ms.length ? `<div class="set-extra">${ms.map(k => {
          if (k === 'load') return loadChipHTML(s, ei, si, '');
          if (k === 'time') {
            const tt = parseInt(s.time), has = s.time !== '' && s.time != null && !isNaN(tt);
            return `<span class="chk-time"><input class="inp set-f" data-f="timemin" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${has ? Math.floor(tt / 60) : ''}" placeholder="min"><span class="set-x">:</span><input class="inp set-f" data-f="timesec" data-ei="${ei}" data-si="${si}" type="number" min="0" max="59" value="${has ? tt % 60 : ''}" placeholder="seg"></span>`;
          }
          // Con la unidad detrás: al rellenarlo el placeholder desaparece y «24» solo
          // no dice si son kilos o repeticiones.
          const f = CHECK_FIELD[k];
          return `<span class="chk-f"><input class="inp set-f" data-f="${k}" data-ei="${ei}" data-si="${si}" type="number" min="0" step="${f.step}" value="${UI.esc(s[k] != null ? s[k] : '')}" placeholder="${f.ph}"><span class="set-x">${f.unit || f.ph}</span></span>`;
        }).join('')}</div>` : '';
        return `<div class="set-wrap${estado}${mode === 'live' && !setHasData(s) ? ' pend' : ''}">
          <div class="set-row set-row-check">
            <span class="set-n">${si + 1}</span>
            <div class="set-vals">${vals}</div>
            <div class="set-acts">${rm}</div>
          </div>
          ${extra}
        </div>`;
      }
      if (type === 'time') {
        const total = parseInt(s.time);
        const hasT = s.time !== '' && s.time != null && !isNaN(total);
        const mm = hasT ? Math.floor(total / 60) : '';
        const ss = hasT ? total % 60 : '';
        return `<div class="set-wrap${s.done ? ' done' : ''}${mode === 'live' && !setHasData(s) ? ' pend' : ''}">
          <div class="set-row">
            <span class="set-n">${si + 1}</span>
            <div class="set-vals">
              <input class="inp set-f" data-f="timemin" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${mm}" placeholder="min"${dis}><span class="set-x">:</span><input class="inp set-f" data-f="timesec" data-ei="${ei}" data-si="${si}" type="number" min="0" max="59" value="${ss}" placeholder="seg"${dis}><button type="button" class="set-label-chip${s.label ? ' on' : ''}" data-set-label data-ei="${ei}" data-si="${si}"${dis} title="${s.label ? UI.esc(s.label) : 'Etiqueta de la serie'}">${s.label ? `<span class="lc-txt">${UI.esc(s.label)}</span>` : UI.icon('tag', 14)}</button>
            </div>
            <div class="set-acts">${effortBtn}${done}${rm}</div>
          </div>
          ${(() => { const ms = timeSetMetrics(entry); return ms.length ? `<div class="set-extra">${ms.map(k => {
            if (k === 'load') return loadChipHTML(s, ei, si, dis); // lastre/asistencia = chip tocable (± kg)
            const f = TIME_FIELD[k]; return `<input class="inp set-f" data-f="${k}" data-ei="${ei}" data-si="${si}" type="number" min="0" step="${f.step}" value="${UI.esc(s[k] || '')}" placeholder="${f.ph}"${dis}>`;
          }).join('')}</div>` : ''; })()}
          ${footBtns}
        </div>`;
      }

      // weight / reps: fila principal + dropsets opcionales
      let mainFields;
      // En vivo, las casillas enseñan en gris lo de la última vez (si no hay nada escrito).
      const last = mode === 'live' ? lastSetFor(entry, si) : null;
      const phR = last && last.reps ? String(last.reps) : 'reps';
      const phW = last && last.weight ? String(last.weight) : 'kg';
      const lc = (ph, def) => ph !== def ? ' last-ph' : '';
      if (type === 'reps') {
        mainFields = `<input class="inp set-f set-reps${lc(phR, 'reps')}" data-f="reps" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${UI.esc(s.reps)}" placeholder="${UI.esc(phR)}"${dis}>${loadChipHTML(s, ei, si, dis)}`;
      } else {
        mainFields = `<input class="inp set-f${lc(phR, 'reps')}" data-f="reps" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${UI.esc(s.reps)}" placeholder="${UI.esc(phR)}"${dis}><span class="set-x">×</span><input class="inp set-f${lc(phW, 'kg')}" data-f="weight" data-ei="${ei}" data-si="${si}" type="number" min="0" step="0.5" value="${UI.esc(s.weight)}" placeholder="${UI.esc(phW)}"${dis}>`;
      }
      const drops = (s.drops || []).map((d, di) => {
        let df;
        if (type === 'reps') {
          df = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" value="${UI.esc(d.reps)}" placeholder="reps"${dis}><span class="set-x">+</span><input class="inp set-f set-load" data-f="load" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" step="0.5" value="${UI.esc(d.load)}" placeholder="kg"${dis}>`;
        } else {
          df = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" value="${UI.esc(d.reps)}" placeholder="reps"${dis}><span class="set-x">×</span><input class="inp set-f" data-f="weight" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" step="0.5" value="${UI.esc(d.weight)}" placeholder="kg"${dis}>`;
        }
        const dropRm = locked ? '' : `<button class="icon-btn danger" data-rm-drop data-ei="${ei}" data-si="${si}" data-di="${di}">×</button>`;
        return `<div class="drop-row"><span class="drop-tag">drop</span>${df}${dropRm}</div>`;
      }).join('');
      return `<div class="set-wrap${s.done ? ' done' : ''}${mode === 'live' && !setHasData(s) ? ' pend' : ''}">
        <div class="set-row">
          <span class="set-n">${si + 1}</span>
          <div class="set-vals">${mainFields}</div>
          <div class="set-acts">${effortBtn}${done}${rm}</div>
        </div>
        ${drops}
        ${footBtns}
      </div>`;
    }).join('');
  }

  // Fila de TOTALES del ejercicio (solo time/cardio): tiempo total auto-sumado +
  // un input por cada métrica de scope 'total' activa (hoy distancia/kcal).
  function timeTotalsHTML(entry, ei) {
    if (entry.type !== 'time' || !entryHasTotals(entry)) return '';
    const totals = entry.totals || {};
    const fields = timeTotalMetrics(entry);
    const showTime = fields.includes('time'); // el tiempo total es opcional (se elige en "datos")
    // Inputs de los demás totales (distancia/kcal/ppm). 'time' va como chip, no input.
    const inputs = fields.filter(k => k !== 'time').map(k => {
      const f = TIME_FIELD[k];
      return `<input class="inp ex-total-f" data-tf="${k}" data-ei="${ei}" type="number" min="0" step="${f.step}" value="${UI.esc(totals[k] || '')}" placeholder="${(f.unit || f.label)} tot.">`;
    }).join('');
    let timeChip = '';
    if (showTime) {
      const sumSec = (entry.sets || []).reduce((a, s) => a + (parseInt(s.time) || 0), 0);
      const overridden = totals.time != null && totals.time !== '';
      const totalSec = overridden ? parseInt(totals.time) : sumSec;
      // Tiempo total: tocable para editar; vacío = suma de las series.
      timeChip = `<button type="button" class="ex-total-time${overridden ? ' on' : ''}" data-set-totaltime data-ei="${ei}"${overridden ? ' data-fixed="1"' : ''} title="Editar tiempo total">${UI.icon('clock', 13)} <span class="ett-val">${fmtClock(totalSec)}</span></button>`;
    }
    if (!timeChip && !inputs) return '';
    return `<div class="ex-totals">${timeChip}${inputs}</div>`;
  }
  // Recalcula los chips de tiempo total (solo lectura del DOM) al teclear min/seg.
  function updateTotalTimes(root) {
    root.querySelectorAll('.ex-card').forEach(card => {
      const btn = card.querySelector('.ex-total-time');
      const ett = card.querySelector('.ett-val');
      if (!ett || !btn || btn.dataset.fixed) return; // tiempo total manual: no recalcular
      let sec = 0;
      card.querySelectorAll('.set-row').forEach(r => {
        const mm = r.querySelector('[data-f="timemin"]'), ss = r.querySelector('[data-f="timesec"]');
        if (mm || ss) sec += (parseInt(mm && mm.value) || 0) * 60 + (parseInt(ss && ss.value) || 0);
      });
      ett.textContent = fmtClock(sec);
    });
  }

  function entryCardHTML(entry, ei, mode) {
    const pr = entryProgreso(entry);
    const clase = (mode === 'live' && pr.hechas < pr.total) ? ' ex-pend' : '';
    return `<div class="ex-card${clase}" data-ei="${ei}" data-sort-id="${ei}">
      <div class="ex-card-body">
        <div class="ex-card-head">
          <button type="button" class="drag-handle" data-drag="card" title="Arrastra para reordenar" aria-label="Arrastrar">${UI.icon('grip', 18)}</button>
          <div class="ex-card-name"><strong>${UI.esc(entry.name)}</strong>${entry.target ? `<span class="ex-target">obj: ${UI.esc(entry.target)}</span>` : ''}${entry.detail ? `<span class="ex-detail">${UI.esc(entry.detail)}</span>` : ''}</div>
          ${mode === 'live' && pr.total ? `<span class="ex-prog" title="Series apuntadas">${pr.hechas}/${pr.total}</span>` : ''}
          <span class="ex-card-actions">
            ${(entry.exerciseId && _exMeta[entry.exerciseId]) ? `<button class="icon-btn" data-howto data-ei="${ei}" title="Cómo se hace">${UI.icon('info', 17)}</button>` : ''}
            ${mode === 'live' ? `<button class="icon-btn" data-ai-ex data-ei="${ei}" title="Consultar a una IA sobre este ejercicio">${UI.icon('chat', 17)}</button>` : ''}
            <button class="icon-btn danger" data-rm-ex data-ei="${ei}">${UI.icon('trash', 17)}</button>
          </span>
        </div>
        ${mode === 'live' ? lastTimeHTML(entry) : ''}
        <div class="set-list">${setRowsHTML(entry, ei, mode)}</div>
        ${timeTotalsHTML(entry, ei)}
        ${entry.note ? `<div class="ex-note" data-note data-ei="${ei}"><span class="ex-note-txt">${UI.icon('edit', 13)} ${UI.esc(entry.note)}</span></div>` : ''}
        <div class="ex-card-foot">
          <button class="btn ghost small" data-add-set data-ei="${ei}">+ Serie</button>
          ${(entry.sets || []).length ? `<button type="button" class="metric-add" data-repeat-block data-ei="${ei}">↻ repetir</button>` : ''}
          ${(entry.type === 'time' || entry.type === 'check') ? `<button type="button" class="metric-add" data-metrics data-ei="${ei}">${UI.icon('plus', 13)} datos</button>` : ''}
          ${entry.note ? '' : `<button type="button" class="metric-add" data-note data-ei="${ei}">${UI.icon('edit', 13)} nota</button>`}
        </div>
      </div>
    </div>`;
  }

  // Remarca en el DOM las series que aún no tienen nada apuntado, y el ejercicio
  // que las contiene. No redibuja: solo cambia clases, así se llama en cada tecla
  // sin perder el foco ni el scroll.
  // Un «hecho / no hecho» sencillo (una serie, sin datos extra ni nota) cabe en una fila.
  function isCompactCheck(e) {
    return (e.type === 'check') && (e.sets || []).length === 1 && !e.note && !checkActiveMetrics(e).length;
  }
  function compactGroupHTML(items) {
    const head = items[0].e.block || 'Por hacer';
    const hechas = items.filter(({ e }) => setHasData(e.sets[0])).length; // «No hecho» también cuenta como apuntado
    const rows = items.map(({ e, i }) => {
      const st = e.sets[0];
      const sub = [e.target, e.detail].filter(Boolean).join(' · ');
      const info = (e.exerciseId && _exMeta[e.exerciseId]) ? `<button class="icon-btn" data-howto data-ei="${i}" title="Cómo se hace">${UI.icon('info', 17)}</button>` : '';
      return `<div class="chkc-row${st.done ? ' on' : ''}${st.skip ? ' skip' : ''}">
          <button class="chkc-box" data-chk="done" data-ei="${i}" data-si="0" aria-pressed="${st.done ? 'true' : 'false'}" aria-label="Hecho">${st.done ? UI.icon('check', 16) : ''}</button>
          <span class="chkc-name">${UI.esc(e.name)}${sub ? `<small>${UI.esc(sub)}</small>` : ''}</span>
          ${info}
          <button class="chkc-no${st.skip ? ' on' : ''}" data-chk="skip" data-ei="${i}" data-si="0" aria-pressed="${st.skip ? 'true' : 'false'}">No hecho</button>
        </div>`;
    }).join('');
    return `<div class="ex-card chkc-card${hechas < items.length ? ' ex-pend' : ''}" data-sort-id="${items.map(x => x.i).join(',')}">
        <div class="chkc-head"><button type="button" class="drag-handle" data-drag="card" aria-label="Arrastrar">${UI.icon('grip', 18)}</button><strong>${UI.esc(head)}</strong><span class="ex-prog">${hechas}/${items.length}</span></div>
        ${rows}
      </div>`;
  }
  function liveEntriesHTML(s) {
    const out = [];
    let group = [];
    const flush = () => { if (group.length) { out.push(group.length > 1 ? compactGroupHTML(group) : entryCardHTML(group[0].e, group[0].i, 'live')); group = []; } };
    (s.entries || []).forEach((e, i) => {
      if (isCompactCheck(e) && (!group.length || (group[0].e.block || '') === (e.block || ''))) group.push({ e, i });
      else { flush(); if (isCompactCheck(e)) group.push({ e, i }); else out.push(entryCardHTML(e, i, 'live')); }
    });
    flush();
    return out.join('');
  }

  function pintarEstado(root, session) {
    root.querySelectorAll('.ex-card').forEach(card => {
      const e = (session.entries || [])[+card.dataset.ei];
      if (!e) return;
      const sets = e.sets || [];
      card.querySelectorAll('.set-wrap').forEach((w, si) => {
        const st = sets[si];
        if (!st) return;
        w.classList.toggle('pend', !setHasData(st));
        // Hecho / no hecho: refleja la marca (p. ej. la que se pone sola al teclear
        // un dato) sin redibujar, para no perder el foco del campo.
        if (st.check) {
          w.classList.toggle('chk-done', !!st.done);
          w.classList.toggle('chk-skip', !!st.skip);
          const y = w.querySelector('.chk-yes'), n = w.querySelector('.chk-no');
          if (y) { y.classList.toggle('on', !!st.done); y.setAttribute('aria-pressed', st.done ? 'true' : 'false'); }
          if (n) { n.classList.toggle('on', !!st.skip); n.setAttribute('aria-pressed', st.skip ? 'true' : 'false'); }
        }
      });
      const { hechas, total } = entryProgreso(e);
      card.classList.toggle('ex-pend', hechas < total);
      const chip = card.querySelector('.ex-prog');
      if (chip) chip.textContent = `${hechas}/${total}`;
    });
  }

  // Lee inputs del DOM al modelo de sesión (incluye dropsets via data-di)
  // Huella de los datos de una serie de hecho/no hecho, para saber si se han tocado.
  const huellaCheck = (s) => CHECK_FIELDS.map(f => (s[f.key] == null ? '' : String(s[f.key]))).join('|');
  function syncEntries(root, session) {
    // Foto de las series de hecho/no hecho ANTES de leer el DOM (ver la marca automática abajo).
    const antes = new Map();
    (session.entries || []).forEach(e => { if (e.type === 'check') (e.sets || []).forEach(s => antes.set(s, huellaCheck(s))); });
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
    // (también los de hecho / no hecho con el dato «tiempo» activado)
    (session.entries || []).forEach(e => {
      const t = e.type || 'weight';
      if (t !== 'time' && t !== 'check') return;
      (e.sets || []).forEach(s => {
        if (s.timemin !== undefined || s.timesec !== undefined) {
          const m = parseInt(s.timemin) || 0, sec = parseInt(s.timesec) || 0;
          s.time = (m || sec) ? (m * 60 + sec) : '';
          delete s.timemin; delete s.timesec;
        }
      });
    });
    // Hecho / no hecho: si CAMBIAS un dato de una serie sin marcar, es que la hiciste
    // y se marca sola (si no, se perdería al terminar). Ojo: cuenta el cambio, no tener
    // datos — las copias de «repetir» vienen con datos precargados y no están hechas.
    // Respeta un «No hecho».
    (session.entries || []).forEach(e => {
      if (e.type !== 'check') return;
      (e.sets || []).forEach(s => {
        if (s.done || s.skip) return;
        const cambiado = antes.has(s) && antes.get(s) !== huellaCheck(s);
        if (cambiado && CHECK_FIELDS.some(f => checkHasValue(s, f.key))) s.done = true;
      });
    });
    // totales del ejercicio (cardio): distancia/kcal una vez por entry
    root.querySelectorAll('.ex-total-f').forEach(inp => {
      const e = session.entries[+inp.dataset.ei];
      if (!e) return;
      e.totals = e.totals || {};
      e.totals[inp.dataset.tf] = inp.value;
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
          if (b.label) e.block = b.label; // sección del plan (Calentamiento, Pierna…)
          if ((e.type === 'time' || e.type === 'check') && e.exerciseId && metricsById[e.exerciseId]) e.metrics = metricsById[e.exerciseId].slice();
          // Tantas series como diga la prescripción («4×6-8», «3x12», «5×400m»); si no
          // hay número o es hecho/no hecho, una. Las que queden vacías se limpian al terminar.
          const m = e.type === 'check' ? null : /^\s*(\d{1,2})\s*[x×]/i.exec(ex.sets || '');
          const n = m ? Math.min(Math.max(+m[1], 1), 10) : 1;
          for (let i = 0; i < n; i++) {
            const st = emptySet(e.type);
            if (ex.label && e.type === 'time') st.label = ex.label; // prerellena la variante prescrita en el plan
            e.sets.push(st);
          }
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
    _prevDaySession = findPrevDaySession(s, hist);
    await loadExMeta(app);
    try { _hasDocs = (await DB.filesOf(app.activeUser.id)).length > 0; } catch (e) { _hasDocs = false; }
    const elapsed = Math.floor((Date.now() - s.startTs) / 1000);

    return `
      <div class="live-head">
        <div class="live-title">${UI.esc(s.name)}</div>
        <div class="live-head-right">
          ${_hasDocs ? `<button class="icon-btn" id="liveDocs" title="Ver mis documentos (PDF del fisio, fotos…)">${UI.icon('book', 18)}</button>` : ''}
          ${_prevDaySession ? `<button class="icon-btn" id="livePrev" title="Ver la última vez que hiciste este día">${UI.icon('calendar', 18)}</button>` : ''}
          <div class="live-timer" id="liveTimer">${fmtClock(elapsed)}</div>
        </div>
      </div>
      <div class="live-entries">
        ${liveEntriesHTML(s) || '<div class="empty-state"><p>Añade ejercicios para empezar.</p></div>'}
      </div>
      <button class="btn ghost block" id="liveAddEx">+ Añadir ejercicio</button>
      <label class="field"><span class="field-label">Notas</span><textarea class="inp" id="liveNotes" rows="2" placeholder="Sensaciones, ajustes…">${UI.esc(s.notes)}</textarea></label>
      <div class="live-actions">
        <button class="btn primary block" id="liveFinish">Finalizar y guardar</button>
        <button class="live-discard" id="liveCancel">Descartar entreno</button>
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

    const prevBtn = root.querySelector('#livePrev');
    if (prevBtn) prevBtn.addEventListener('click', () => showPrevDaySession(app));
    const docsBtn = root.querySelector('#liveDocs');
    if (docsBtn) docsBtn.addEventListener('click', () => app.openDocsPicker());

    const sync = () => { syncLive(root, s); app.persistLive(); };

    // Handlers de cada tarjeta. Se re-enganchan tras cada redibujado de la lista.
    function bindEntries() {
      root.querySelectorAll('[data-add-set]').forEach(b => b.addEventListener('click', () => {
        sync(); const e = s.entries[+b.dataset.ei]; e.sets.push(emptySet(e.type)); redraw(); // serie vacía (para copiar está "duplicar")
      }));
      root.querySelectorAll('[data-howto]').forEach(b => b.addEventListener('click', () => showHowto(s.entries[+b.dataset.ei])));
      root.querySelectorAll('[data-dup-set]').forEach(b => b.addEventListener('click', () => {
        sync(); const e = s.entries[+b.dataset.ei], si = +b.dataset.si; e.sets.splice(si + 1, 0, cloneSet(e.sets[si])); redraw();
      }));
      root.querySelectorAll('[data-repeat-block]').forEach(b => b.addEventListener('click', () => {
        sync(); const e = s.entries[+b.dataset.ei];
        pickRepeat(e.sets.length, (n) => { const snap = e.sets.slice(); for (let k = 1; k < n; k++) snap.forEach(st => e.sets.push(cloneSet(st))); app.persistLive(); redraw(); });
      }));
      root.querySelectorAll('[data-set-totaltime]').forEach(b => b.addEventListener('click', () => {
        sync(); const entry = s.entries[+b.dataset.ei];
        pickTotalTime(entry, (sec) => { entry.totals = entry.totals || {}; if (sec == null) delete entry.totals.time; else entry.totals.time = sec; app.persistLive(); redraw(); });
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
        sync();
        const entry = s.entries[+b.dataset.ei], si = +b.dataset.si, set = entry.sets[si];
        // ✓ sin haber escrito nada: se apunta lo mismo que la última vez (lo que se veía en gris).
        if (!set.done && !setHasData(set)) {
          const last = lastSetFor(entry, si);
          if (last) { if (last.reps) set.reps = last.reps; if (last.weight) set.weight = last.weight; if (last.load != null && last.load !== '') { set.load = last.load; if (last.loadMode) set.loadMode = last.loadMode; } }
        }
        set.done = !set.done; redraw();
      }));
      root.querySelectorAll('[data-chk]').forEach(b => b.addEventListener('click', () => {
        sync(); marcarCheck(s.entries[+b.dataset.ei].sets[+b.dataset.si], b.dataset.chk); redraw();
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
      root.querySelectorAll('[data-set-load]').forEach(b => b.addEventListener('click', () => {
        sync(); const set = s.entries[+b.dataset.ei].sets[+b.dataset.si];
        pickLoad(set, (mode, kg) => { set.loadMode = mode || undefined; set.load = mode ? kg : ''; app.persistLive(); redraw(); });
      }));
      root.querySelectorAll('[data-set-label]').forEach(b => b.addEventListener('click', () => {
        sync(); const entry = s.entries[+b.dataset.ei], set = entry.sets[+b.dataset.si];
        pickLabel(entry, set.label, (lbl) => { set.label = lbl || undefined; app.persistLive(); redraw(); });
      }));
    }

    // Re-render SOLO la lista de ejercicios (no reconstruye toda la vista → no se
    // pierde el scroll ni hay que volver a bajar). El contenedor .live-entries
    // persiste, así que makeSortable (enganchado abajo una vez) sigue valiendo.
    const redraw = () => {
      const cont = root.querySelector('.live-entries');
      if (!cont) { app.render(); return; }
      cont.innerHTML = liveEntriesHTML(s) || '<div class="empty-state"><p>Añade ejercicios para empezar.</p></div>';
      bindEntries();
      pintarEstado(root, s);
    };

    // Autoguardado inmediato en cada tecla (delegado en la vista: sobrevive al
    // redibujado de la lista). En .view y no en root: root (#mainContent) persiste
    // entre pantallas y se acumularía un listener por cada visita.
    (root.querySelector('.view') || root).addEventListener('input', () => { syncLive(root, s); app.persistLive(); updateTotalTimes(root); pintarEstado(root, s); });

    bindEntries();
    pintarEstado(root, s);
    UI.makeSortable(root.querySelector('.live-entries'), {
      itemSelector: '.ex-card', handleSelector: '[data-drag="card"]',
      onReorder: (order) => { sync(); s.entries = order.flatMap(id => String(id).split(',').map(i => s.entries[+i])); redraw(); },
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
      // Se comprueba ANTES de limpiar nada: si no se puede guardar, el entreno sigue tal cual.
      const conDatos = (e) => (e.sets || []).filter(setHasData);
      const algoApuntado = s.entries.some(e => conDatos(e).length);
      // Un entreno en el que todo es «no hecho» no cuenta como entreno (racha, estadísticas).
      const algoHecho = s.entries.some(e => conDatos(e).some(st => !st.skip));
      if (!algoHecho) {
        UI.toast(algoApuntado ? 'Marca algo como hecho o apunta alguna serie' : 'Registra al menos una serie', 'err');
        return;
      }
      // Ejercicios sin nada apuntado: se avisa antes de guardar (al guardar desaparecen).
      const sinApuntar = s.entries.filter(e => !conDatos(e).length).map(e => e.name);
      if (sinApuntar.length) {
        const lista = sinApuntar.slice(0, 4).join(', ') + (sinApuntar.length > 4 ? ` y ${sinApuntar.length - 4} más` : '');
        const ok = await UI.confirm({
          title: sinApuntar.length === 1 ? 'Te queda 1 ejercicio sin apuntar' : `Te quedan ${sinApuntar.length} ejercicios sin apuntar`,
          message: `${lista}. Si terminas ahora, se guarda solo lo que has apuntado.`,
          confirmLabel: 'Terminar igualmente',
        });
        if (!ok) return;
      }
      // limpiar series vacías y entradas sin series
      s.entries.forEach(e => { e.sets = conDatos(e); });
      s.entries = s.entries.filter(e => e.sets.length > 0);
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
      // Primer entreno: a partir de aquí sí tiene sentido proponer instalar la app.
      try { localStorage.setItem('traindia-first-workout', '1'); } catch (e) {}
      if (window.showInstallPrompt) setTimeout(() => window.showInstallPrompt(), 1500);
      const batidos = prs.filter(p => !p.first);
      if (batidos.length) celebratePRs(batidos);
      else if (prs.length) UI.toast('Sesión guardada · primeras marcas apuntadas: la próxima vez, a superarlas');
      else UI.toast('Sesión guardada');
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
      if ((ex.type === 'time' || ex.type === 'check') && Array.isArray(ex.metrics)) entry.metrics = ex.metrics.slice();
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
        const setCount = (s.entries || []).reduce((n, e) => n + (e.sets ? e.sets.filter(st => !st.skip).length : 0), 0); // «no hecho» no es una serie hecha
        return `<button class="session-row" data-link="session" data-params='${JSON.stringify({ sessionId: s.id, ownerId: s.userId })}'>
          <div class="session-main">
            <strong>${UI.esc(s.name || 'Sesión')}</strong>
            <span class="dim">${responseDot(s)}${(s.entries || []).length} ejercicio${(s.entries || []).length === 1 ? '' : 's'} · ${setCount} serie${setCount === 1 ? '' : 's'}${s.durationSec ? ' · ' + fmtClock(s.durationSec) : ''}</span>
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

  // ============ SEMÁFORO: cómo respondió el cuerpo AL DÍA SIGUIENTE ============
  // No manda lo que duele durante la serie, sino cómo amaneces. Es el criterio para
  // decidir si se sube carga, y aquí queda registrado por sesión.
  const RESPONSES = [
    { key: 'verde', label: 'Igual o mejor', hint: 'Puedes mantener o subir', cls: 'go' },
    { key: 'ambar', label: 'Algo cargado', hint: 'Repite la misma carga, no subas', cls: 'wait' },
    { key: 'rojo',  label: 'Peor', hint: 'La próxima vez baja o acorta el rango', cls: 'stop' },
  ];
  const RESPONSE = Object.fromEntries(RESPONSES.map(r => [r.key, r]));
  function responseChip(s) {
    const r = s && s.response && RESPONSE[s.response];
    if (!r) return '';
    return `<span class="resp-chip ${r.cls}" title="Al día siguiente: ${r.label}"><i></i>${r.label}</span>`;
  }
  function responseDot(s) {
    const r = s && s.response && RESPONSE[s.response];
    return r ? `<span class="resp-dot ${r.cls}" title="Al día siguiente: ${r.label}"></span>` : '';
  }
  // Pregunta por una sesión concreta. onDone(guardada) tras responder o saltar.
  function askResponse(app, sess, onDone) {
    UI.modal({
      title: '¿Cómo amaneciste?',
      bodyHTML: `<p class="modal-text">Tu entreno <strong>${UI.esc(sess.name || 'Sesión')}</strong> del ${UI.esc(UI.fmtDateShort(sess.date))}.</p>
        <p class="modal-text dim">Lo que decide si puedes subir carga no es lo que notaste durante el ejercicio, sino cómo te levantaste al día siguiente.</p>
        <div class="resp-pick">
          ${RESPONSES.map(r => `<button type="button" class="resp-opt ${r.cls}" data-resp="${r.key}"><i></i><span><strong>${r.label}</strong><em>${r.hint}</em></span></button>`).join('')}
        </div>`,
      actions: [{ label: 'Ahora no', kind: 'ghost', onClick: async () => {
        sess.responseSkipped = true; await DB.put('sessions', sess); if (onDone) onDone(false);
      } }],
      onMount: (root) => root.querySelectorAll('[data-resp]').forEach(b => b.addEventListener('click', async () => {
        sess.response = b.dataset.resp;
        delete sess.responseSkipped;
        await DB.put('sessions', sess);
        UI.closeModal(root);
        UI.toast('Anotado');
        if (onDone) onDone(true);
      })),
    });
  }
  // Al abrir la app: si hay un entreno de ayer (o de hasta 3 días) sin responder, pregunta.
  async function checkDayAfter(app) {
    const hoy = DB.todayISO();
    const hace = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const desde = hace(3), hasta = hace(1); // ya ha pasado al menos una noche
    const cand = (await DB.sessionsOf(app.activeUser.id))
      .filter(s => !s.draft && !s.response && !s.responseSkipped && s.date >= desde && s.date <= hasta)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (!cand) return false;
    askResponse(app, cand, () => { if (app.currentView === 'sessions' || app.currentView === 'session') app.render(); });
    return true;
  }

  // Bloques por ejercicio de una sesión (series + totales + nota). Reutilizado por el
  // detalle y por el vistazo rápido a la sesión anterior. opts.ai añade el botón de IA.
  // Totales de un ejercicio de tiempo (tiempo total, km, kcal, pulso) en una línea.
  function entryTotalsText(e) {
    if ((e.type || 'weight') !== 'time' || !entryHasTotals(e)) return '';
    const t = e.totals || {};
    const active = new Set(timeActiveMetrics(e));
    const parts = [];
    if (active.has('time') && (e.sets || []).length > 1) { // tiempo total solo con varios intervalos (con 1 serie es redundante)
      const totalSec = (t.time != null && t.time !== '') ? parseInt(t.time) : (e.sets || []).reduce((a, set) => a + (parseInt(set.time) || 0), 0);
      if (totalSec) parts.push(`${fmtClock(totalSec)} total`);
    }
    const dist = t.distance ? parseFloat(t.distance) : (e.sets || []).reduce((a, set) => a + (parseFloat(set.distance) || 0), 0); // compat viejas
    const kc = t.kcal ? parseFloat(t.kcal) : (e.sets || []).reduce((a, set) => a + (parseFloat(set.kcal) || 0), 0);
    if (dist) parts.push(`${Math.round(dist * 100) / 100} km`);
    if (kc) parts.push(`${Math.round(kc)} kcal`);
    if (t.hr) parts.push(`${t.hr} ppm`);
    return parts.join(' · ');
  }

  // Datos de una sesión ya listos para el PDF del entrenador: cada ejercicio con sus
  // series en texto y, al lado, lo que hiciste la vez anterior (sesiones de antes).
  async function reportModel(app, s) {
    const all = await DB.sessionsOf(s.userId);
    const antes = all.filter(x => !x.draft && x.id !== s.id &&
      ((x.date || '') < (s.date || '') || ((x.date || '') === (s.date || '') && (x.createdAt || 0) < (s.createdAt || 0))));
    const prevMap = buildLastTimeMap(antes, s.id);
    const author = app.userById(s.userId);
    const entries = (s.entries || []).map(e => {
      const type = e.type || 'weight';
      const prev = prevMap[keyForEntry(e)];
      const sets = (e.sets || []).map((set, i) => ({
        n: i + 1,
        txt: setHasData(set) ? setDisplay(type, set) : 'Sin apuntar',
        empty: !setHasData(set),
        skip: !!(set.check && set.skip && !set.done),
        prev: prev && prev.sets[i] ? setDisplay(prev.type, prev.sets[i]) : '',
      }));
      return { name: e.name, type, block: e.block || '', target: e.target || '', detail: e.detail || '', note: e.note || '',
        totals: entryTotalsText(e), sets, prevDate: prev ? prev.date : '', check: type === 'check' && sets.length <= 1 };
    });
    const nSeries = (s.entries || []).filter(e => (e.type || 'weight') !== 'check') // el calentamiento (hecho/no hecho) no cuenta como series
      .reduce((a, e) => a + (e.sets || []).filter(setHasData).length, 0);
    const r = s.response && RESPONSE[s.response];
    return {
      name: s.name || 'Sesión', date: s.date, dateTxt: UI.fmtDate(s.date), author: author ? author.name : '',
      duration: s.durationSec ? fmtClock(s.durationSec) : '', volume: sessionVolume(s), nSeries,
      nEx: (s.entries || []).length, response: r ? { label: r.label, cls: r.cls } : null,
      prs: (s.prs || []).filter(p => !p.first).map(p => ({ name: p.name, value: prValueText(p.type, p.value) })),
      notes: s.notes || '', entries,
    };
  }

  function sessionEntriesHTML(s, opts) {
    const withAI = !!(opts && opts.ai);
    return (s.entries || []).map((e, ei) => {
      const rows = (e.sets || []).map((set, i) =>
        `<li><span class="set-n-sm">${i + 1}</span><span>${UI.esc(setDisplay(e.type || 'weight', set))}</span></li>`).join('');
      const note = e.note ? `<div class="ex-note"><span class="ex-note-txt">${UI.icon('edit', 13)} ${UI.esc(e.note)}</span></div>` : '';
      const tt = entryTotalsText(e);
      const totalsLine = tt ? `<div class="detail-totals">${UI.icon('clock', 13)} ${tt}</div>` : '';
      const head = withAI
        ? `<div class="block-label detail-ex-head"><span>${UI.esc(e.name)}</span><button class="icon-btn" data-ai-done data-ei="${ei}" title="Consultar a una IA sobre este ejercicio">${UI.icon('chat', 16)}</button></div>`
        : `<div class="block-label">${UI.esc(e.name)}</div>`;
      return `<div class="block">${head}<ul class="set-detail-list">${rows}</ul>${totalsLine}${note}</div>`;
    }).join('');
  }

  // Vistazo rápido (modal) a la última sesión del mismo día — para consultar qué hiciste
  // la vez anterior sin salir del entreno en curso.
  function showPrevDaySession(app) {
    const prev = _prevDaySession;
    if (!prev) { UI.toast('No hay una sesión anterior de este día'); return; }
    const vol = sessionVolume(prev);
    UI.modal({
      title: 'La última vez',
      bodyHTML: `<div class="prev-sess">
        <div class="meta prev-sess-meta">
          <span>${UI.icon('calendar', 13)} ${UI.esc(UI.fmtDate(prev.date))}</span>
          ${prev.durationSec ? `<span>${UI.icon('clock', 13)} ${fmtClock(prev.durationSec)}</span>` : ''}
          ${vol ? `<span>${UI.icon('dumbbell', 13)} ${vol} kg vol.</span>` : ''}
          ${responseChip(prev)}
        </div>
        ${sessionEntriesHTML(prev, { ai: false }) || '<p class="dim">Sin ejercicios.</p>'}
        ${prev.notes ? `<div class="note-box"><div class="block-label">Notas</div><p>${UI.esc(prev.notes)}</p></div>` : ''}
      </div>`,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        { label: 'Ver completa', kind: 'primary', onClick: () => app.go('session', { sessionId: prev.id }) },
      ],
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

    const entries = sessionEntriesHTML(s, { ai: true });

    const prsBatidos = (s.prs || []).filter(p => !p.first); // la primera marca no es un récord
    return `<div class="section">
      <div class="detail-hero">
        <div class="session-author">${author ? UI.avatar(author, 24) + `<span>${UI.esc(author.name)}</span>` : ''}</div>
        <h2>${UI.esc(s.name || 'Sesión')}</h2>
        <div class="meta">
          <span>${UI.icon('calendar', 13)} ${UI.fmtDate(s.date)}</span>
          ${s.durationSec ? `<span>${UI.icon('clock', 13)} ${fmtClock(s.durationSec)}</span>` : ''}
          ${vol ? `<span>${UI.icon('dumbbell', 13)} ${vol} kg vol.</span>` : ''}
        </div>
        ${(s.response || (s.date || '') < DB.todayISO()) ? `<div class="detail-resp">${responseChip(s) || '<span class="dim">Sin anotar cómo amaneciste</span>'}<button class="btn ghost small" data-act="resp">${UI.icon('edit', 13)} ${s.response ? 'Cambiar' : 'Anotar'}</button></div>` : ''}
      </div>
      ${prsBatidos.length ? `<div class="pr-banner">${UI.icon('star', 16)}<div><strong>Récord${prsBatidos.length > 1 ? 's' : ''} personal${prsBatidos.length > 1 ? 'es' : ''}</strong>${prsBatidos.map(p => `<span class="pr-chip">${UI.esc(p.name)}: <b>${UI.esc(prValueText(p.type, p.value))}</b></span>`).join('')}</div></div>` : ''}
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
    // Compartir: PDF para el entrenador (lo normal) o el archivo de Traindía para importarlo en otra app.
    root.querySelector('[data-act="share"]').addEventListener('click', () => UI.modal({
      title: 'Compartir sesión',
      bodyHTML: `<button class="big-row" data-sh="pdf"><span class="big-row-icon tile" style="background:var(--strong)">${UI.icon('notebook', 18)}</span><span class="big-row-text"><strong>PDF para tu entrenador</strong><span class="dim">Cada ejercicio con sus series y lo de la vez anterior</span></span><span class="chev">›</span></button>
        <button class="big-row" data-sh="json"><span class="big-row-icon tile" style="background:var(--light)">${UI.icon('upload', 18)}</span><span class="big-row-text"><strong>Archivo de Traindía</strong><span class="dim">Para importarla en otro móvil con Traindía</span></span><span class="chev">›</span></button>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (m) => {
        m.querySelector('[data-sh="pdf"]').addEventListener('click', () => { UI.closeModal(); VSessionPDF.share(app, params.sessionId); });
        m.querySelector('[data-sh="json"]').addEventListener('click', () => { UI.closeModal(); VData.exportSession(app, params.sessionId); });
      },
    }));
    const respBtn = root.querySelector('[data-act="resp"]');
    if (respBtn) respBtn.addEventListener('click', async () => {
      const s = await DB.get('sessions', params.sessionId);
      if (s) askResponse(app, s, () => app.render());
    });
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
    await loadExMeta(app);
    try { _hasDocs = (await DB.filesOf(app.activeUser.id)).length > 0; } catch (e) { _hasDocs = false; }
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
      root.querySelectorAll('[data-add-set]').forEach(b => b.addEventListener('click', () => { syncMeta(root); const e = draft.entries[+b.dataset.ei]; e.sets.push(emptySet(e.type)); render(root); }));
      root.querySelectorAll('[data-dup-set]').forEach(b => b.addEventListener('click', () => { syncMeta(root); const e = draft.entries[+b.dataset.ei], si = +b.dataset.si; e.sets.splice(si + 1, 0, cloneSet(e.sets[si])); render(root); }));
      root.querySelectorAll('[data-repeat-block]').forEach(b => b.addEventListener('click', () => { syncMeta(root); const e = draft.entries[+b.dataset.ei]; pickRepeat(e.sets.length, (n) => { const snap = e.sets.slice(); for (let k = 1; k < n; k++) snap.forEach(st => e.sets.push(cloneSet(st))); render(root); }); }));
      root.querySelectorAll('[data-set-totaltime]').forEach(b => b.addEventListener('click', () => { syncMeta(root); const entry = draft.entries[+b.dataset.ei]; pickTotalTime(entry, (sec) => { entry.totals = entry.totals || {}; if (sec == null) delete entry.totals.time; else entry.totals.time = sec; render(root); }); }));
      root.querySelectorAll('[data-howto]').forEach(b => b.addEventListener('click', () => showHowto(draft.entries[+b.dataset.ei])));
      root.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); const st = draft.entries[+b.dataset.ei].sets[+b.dataset.si]; st.done = !st.done; render(root);
      }));
      root.querySelectorAll('[data-chk]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); marcarCheck(draft.entries[+b.dataset.ei].sets[+b.dataset.si], b.dataset.chk); render(root);
      }));
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
      root.querySelectorAll('[data-set-load]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); const set = draft.entries[+b.dataset.ei].sets[+b.dataset.si];
        pickLoad(set, (mode, kg) => { set.loadMode = mode || undefined; set.load = mode ? kg : ''; render(root); });
      }));
      root.querySelectorAll('[data-set-label]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); const entry = draft.entries[+b.dataset.ei], set = entry.sets[+b.dataset.si];
        pickLabel(entry, set.label, (lbl) => { set.label = lbl || undefined; render(root); });
      }));
      root.querySelector('#sesAddEx').addEventListener('click', () => { syncMeta(root); addExerciseToSession(app, draft, () => render(root)); });
      if (!root._ttBound) { root.addEventListener('input', () => updateTotalTimes(root)); root._ttBound = true; } // total de tiempo en vivo al teclear
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

  return { live, liveBind, list, listBind, detail, detailBind, checkDayAfter, sessionVolume, reportModel, checkResume, liveHasData, restEnsure, TIME_FIELDS, CHECK_FIELDS,
    notifStatus, setRestNotify, restNotifyOn, testPush, REST_NOTIFY_TEXT,
    getRestDuration, setRestDefault, restSoundOn, restVibrateOn, setRestSound, setRestVibrate, fmtClock };
})();
