// ============================================================
// VISTAS: Sesiones — registro en vivo, manual, historial, edición
// ============================================================

const VSessions = (() => {

  // -------- helpers de modelo --------
  function emptySet(type) {
    if (type === 'time') return { time: '', weight: '', speed: '', incline: '', level: '', done: false };
    if (type === 'reps') return { reps: '', load: '', loadMode: '', done: false };
    return { reps: '', weight: '', done: false };
  }
  function emptyDrop(type) {
    if (type === 'reps') return { reps: '', load: '' };
    return { reps: '', weight: '' };
  }

  function dropHasData(d) { return d && (d.reps || d.weight || d.load); }
  function setHasData(s) {
    return s.reps || s.weight || s.time || s.speed || s.level || s.incline || s.load ||
      (s.drops && s.drops.some(dropHasData));
  }
  function liveHasData(s) { return (s.entries || []).some(e => (e.sets || []).some(setHasData)); }

  // sufijo lastre/asistencia para ejercicios de peso corporal
  function loadSuffix(set) {
    if (!set.load || !set.loadMode) return '';
    const sign = set.loadMode === 'asist' ? '−' : '+';
    return ` ${sign}${set.load}kg${set.loadMode === 'asist' ? ' asist' : ''}`;
  }
  // texto de una serie para detalle / contexto IA (incluye dropsets)
  function setDisplay(type, set) {
    if (type === 'time') {
      let v = fmtTime(set.time) || '0s';
      if (set.weight) v += ` · ${set.weight}kg`;
      const ex = cardioExtra(set); if (ex) v += ` · ${ex}`;
      return v;
    }
    if (type === 'reps') {
      let v = `${set.reps || 0} reps${loadSuffix(set)}`;
      (set.drops || []).filter(dropHasData).forEach(d => { v += ` → ${d.reps || 0}${d.load ? ` (${d.load}kg)` : ''}`; });
      return v;
    }
    let v = `${set.reps || 0} × ${set.weight || 0} kg`;
    (set.drops || []).filter(dropHasData).forEach(d => { v += ` → ${d.reps || 0}×${d.weight || 0}`; });
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

  // -------- render de filas de serie (compartido live/editor) --------
  function setRowsHTML(entry, ei, mode) {
    const type = entry.type || 'weight';
    return (entry.sets || []).map((s, si) => {
      const done = mode === 'live'
        ? `<button class="set-done${s.done ? ' on' : ''}" data-done data-ei="${ei}" data-si="${si}" title="Serie hecha">${UI.icon('check', 16)}</button>`
        : '';
      const rm = `<button class="icon-btn danger" data-rm-set data-ei="${ei}" data-si="${si}">×</button>`;

      if (type === 'time') {
        const total = parseInt(s.time);
        const hasT = s.time !== '' && s.time != null && !isNaN(total);
        const mm = hasT ? Math.floor(total / 60) : '';
        const ss = hasT ? total % 60 : '';
        return `<div class="set-wrap${s.done ? ' done' : ''}">
          <div class="set-row">
            <span class="set-n">${si + 1}</span>
            <input class="inp set-f" data-f="timemin" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${mm}" placeholder="min"><span class="set-unit">m</span>
            <input class="inp set-f" data-f="timesec" data-ei="${ei}" data-si="${si}" type="number" min="0" max="59" value="${ss}" placeholder="seg"><span class="set-unit">s</span>
            ${done}${rm}
          </div>
          <div class="set-extra">
            <input class="inp set-f" data-f="weight" data-ei="${ei}" data-si="${si}" type="number" min="0" step="0.5" value="${UI.esc(s.weight)}" placeholder="kg">
            <input class="inp set-f" data-f="speed" data-ei="${ei}" data-si="${si}" type="number" min="0" step="0.1" value="${UI.esc(s.speed)}" placeholder="km/h">
            <input class="inp set-f" data-f="incline" data-ei="${ei}" data-si="${si}" type="number" step="0.5" value="${UI.esc(s.incline)}" placeholder="incl %">
            <input class="inp set-f" data-f="level" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${UI.esc(s.level)}" placeholder="nivel">
          </div>
        </div>`;
      }

      // weight / reps: fila principal + dropsets opcionales
      let mainFields;
      if (type === 'reps') {
        mainFields = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${UI.esc(s.reps)}" placeholder="reps"><span class="set-unit">reps</span>
          <select class="inp set-f set-load-mode" data-f="loadMode" data-ei="${ei}" data-si="${si}">
            <option value=""${!s.loadMode ? ' selected' : ''}>corporal</option>
            <option value="lastre"${s.loadMode === 'lastre' ? ' selected' : ''}>+ lastre</option>
            <option value="asist"${s.loadMode === 'asist' ? ' selected' : ''}>− asist.</option>
          </select>
          <input class="inp set-f set-load" data-f="load" data-ei="${ei}" data-si="${si}" type="number" min="0" step="0.5" value="${UI.esc(s.load)}" placeholder="kg">`;
      } else {
        mainFields = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" type="number" min="0" value="${UI.esc(s.reps)}" placeholder="reps"><span class="set-x">×</span><input class="inp set-f" data-f="weight" data-ei="${ei}" data-si="${si}" type="number" min="0" step="0.5" value="${UI.esc(s.weight)}" placeholder="kg"><span class="set-unit">kg</span>`;
      }
      const drops = (s.drops || []).map((d, di) => {
        let df;
        if (type === 'reps') {
          df = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" value="${UI.esc(d.reps)}" placeholder="reps"><span class="set-unit">reps</span><input class="inp set-f set-load" data-f="load" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" step="0.5" value="${UI.esc(d.load)}" placeholder="kg">`;
        } else {
          df = `<input class="inp set-f" data-f="reps" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" value="${UI.esc(d.reps)}" placeholder="reps"><span class="set-x">×</span><input class="inp set-f" data-f="weight" data-ei="${ei}" data-si="${si}" data-di="${di}" type="number" min="0" step="0.5" value="${UI.esc(d.weight)}" placeholder="kg">`;
        }
        return `<div class="drop-row"><span class="drop-tag">drop</span>${df}<button class="icon-btn danger" data-rm-drop data-ei="${ei}" data-si="${si}" data-di="${di}">×</button></div>`;
      }).join('');
      return `<div class="set-wrap${s.done ? ' done' : ''}">
        <div class="set-row"><span class="set-n">${si + 1}</span>${mainFields}${done}${rm}</div>
        ${drops}
        <div class="set-foot"><button type="button" class="set-drop-btn" data-add-drop data-ei="${ei}" data-si="${si}">↧ dropset</button></div>
      </div>`;
    }).join('');
  }

  function entryCardHTML(entry, ei, mode) {
    return `<div class="ex-card" data-ei="${ei}">
      <div class="ex-card-head">
        <div><strong>${UI.esc(entry.name)}</strong>${entry.target ? `<span class="ex-target">obj: ${UI.esc(entry.target)}</span>` : ''}</div>
        <span class="ex-card-actions">
          ${mode === 'live' ? `<button class="icon-btn" data-ai-ex data-ei="${ei}" title="Consultar a una IA sobre este ejercicio">${UI.icon('chat', 17)}</button>` : ''}
          <button class="icon-btn" data-mv-ex="up" data-ei="${ei}" title="Subir">${UI.icon('chevronUp', 18)}</button>
          <button class="icon-btn" data-mv-ex="down" data-ei="${ei}" title="Bajar">${UI.icon('chevronDown', 18)}</button>
          <button class="icon-btn danger" data-rm-ex data-ei="${ei}">${UI.icon('trash', 17)}</button>
        </span>
      </div>
      <div class="set-list">${setRowsHTML(entry, ei, mode)}</div>
      <button class="btn ghost small" data-add-set data-ei="${ei}">+ Serie</button>
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
  function live(app, params) {
    // Solo se construye una sesión nueva si NO hay ninguna en curso (no se pisa).
    if (!app._live) {
      const day = (app.routine?.days || []).find(d => d.id === params.dayId);
      const entries = [];
      if (day && !day.isRest) {
        day.blocks.forEach(b => b.exercises.forEach(ex => {
          const e = entryFromExercise(ex);
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
      </div>`;
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

    const sync = () => { syncLive(root, s); app.persistLive(); };
    const redraw = () => app.render();

    // Autoguardado inmediato en cada tecla: el modelo y el borrador en BD siempre
    // están al día, así si se cierra la app de golpe se puede reanudar sin perder nada.
    root.addEventListener('input', () => { syncLive(root, s); app.persistLive(); });

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
    root.querySelectorAll('[data-mv-ex]').forEach(b => b.addEventListener('click', () => {
      sync(); const ei = +b.dataset.ei, arr = s.entries;
      if (b.dataset.mvEx === 'up' && ei > 0) { [arr[ei - 1], arr[ei]] = [arr[ei], arr[ei - 1]]; }
      else if (b.dataset.mvEx === 'down' && ei < arr.length - 1) { [arr[ei + 1], arr[ei]] = [arr[ei], arr[ei + 1]]; }
      redraw();
    }));
    root.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => {
      sync(); const set = s.entries[+b.dataset.ei].sets[+b.dataset.si]; set.done = !set.done; redraw();
    }));
    root.querySelectorAll('[data-ai-ex]').forEach(b => b.addEventListener('click', () => {
      sync(); UI.askAI(buildExerciseContext(s, s.entries[+b.dataset.ei]));
    }));
    root.querySelector('#liveAddEx').addEventListener('click', () => { sync(); addExerciseToSession(app, s, () => app.render()); });
    root.querySelector('#liveCancel').addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Descartar entreno', message: 'Se perderá lo registrado en esta sesión.', confirmLabel: 'Descartar', danger: true });
      if (!ok) return;
      clearInterval(app._liveTimer); app._liveTimer = null;
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
      await DB.put('sessions', s);
      clearInterval(app._liveTimer); app._liveTimer = null;
      const id = s.id; app._live = null;
      UI.toast('Sesión guardada');
      app.go('session', { sessionId: id }, true);
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
        ex = { id: DB.uid('ex'), userId: app.activeUser.id, name: picked.name, muscleGroup: picked.muscleGroup, type: picked.type, createdAt: Date.now() };
        await DB.put('exercises', ex);
      }
      session.entries.push({ exerciseId: ex.id, name: ex.name, type: ex.type, target: '', sets: [emptySet(ex.type)] });
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
      return `<div class="block"><div class="block-label detail-ex-head"><span>${UI.esc(e.name)}</span><button class="icon-btn" data-ai-done data-ei="${ei}" title="Consultar a una IA sobre este ejercicio">${UI.icon('chat', 16)}</button></div><ul class="set-detail-list">${rows}</ul></div>`;
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
      root.querySelectorAll('[data-mv-ex]').forEach(b => b.addEventListener('click', () => {
        syncMeta(root); const ei = +b.dataset.ei, arr = draft.entries;
        if (b.dataset.mvEx === 'up' && ei > 0) { [arr[ei - 1], arr[ei]] = [arr[ei], arr[ei - 1]]; }
        else if (b.dataset.mvEx === 'down' && ei < arr.length - 1) { [arr[ei + 1], arr[ei]] = [arr[ei], arr[ei + 1]]; }
        render(root);
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
          await DB.put('sessions', draft);
          UI.toast('Sesión guardada');
          if (app.currentView === 'session') app.go('session', { sessionId: draft.id }, true);
          else app.render();
        }},
      ],
      onMount: render,
    });
  }

  return { live, liveBind, list, listBind, detail, detailBind, sessionVolume, checkResume, liveHasData };
})();
