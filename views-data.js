// ============================================================
// VISTA: Datos — exportación / importación granular (JSON)
// ============================================================

const VData = (() => {

  const FORMAT = 'cnp-export';

  // ---- recolección de datos ----
  async function gatherProfile(userId, user) {
    return {
      format: FORMAT, version: 2, kind: 'profile',
      exportedAt: new Date().toISOString(),
      user: { name: user.name, color: user.color },
      data: {
        exercises: await DB.exercisesOf(userId),
        routines: await DB.routinesOf(userId),
        sessions: (await DB.sessionsOf(userId)).filter(s => !s.draft),
        progress: await DB.progressOf(userId),
        journal: await DB.journalOf(userId),
      },
    };
  }

  function exercisesByIds(allExercises, ids) {
    const set = new Set(ids.filter(Boolean));
    return allExercises.filter(e => set.has(e.id));
  }

  function download(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() { return DB.todayISO(); }

  // ====================================================
  function render(app) {
    return `<div class="section">
      <div class="card">
        <div class="card-label">Exportar</div>
        <button class="btn primary block" id="expProfile">Perfil completo (${UI.esc(app.mainUser.name)})</button>
        <button class="btn ghost block" id="expDay">Un día concreto</button>
        <button class="btn ghost block" id="expSessions">Sesiones (individuales o por fechas)</button>
        <button class="btn ghost block" id="expProgress">Progreso</button>
        <button class="btn ghost block" id="expRoutines">Rutinas específicas</button>
        <p class="field-hint">Se descarga un archivo JSON que puedes guardar o compartir con un compañero.</p>
      </div>
      <div class="card">
        <div class="card-label">Importar</div>
        <button class="btn primary block" id="impBtn">Importar archivo JSON</button>
        <p class="field-hint">Al importar verás de qué perfil viene y elegirás cómo aplicarlo (reemplazar o añadir lo diferente).</p>
      </div>
    </div>`;
  }

  function bind(app, root) {
    root.querySelector('#expProfile').addEventListener('click', async () => {
      const data = await gatherProfile(app.mainUser.id, app.mainUser);
      download(data, `traindia-perfil-${app.mainUser.name}-${stamp()}.json`);
      UI.toast('Perfil exportado');
    });
    root.querySelector('#expDay').addEventListener('click', () => exportDay(app));
    root.querySelector('#expSessions').addEventListener('click', () => exportSessions(app));
    root.querySelector('#expProgress').addEventListener('click', () => exportProgress(app));
    root.querySelector('#expRoutines').addEventListener('click', () => exportRoutines(app));
    root.querySelector('#impBtn').addEventListener('click', () => triggerImport(app));
  }

  // ---- Menú global (botón de cabecera, disponible en cualquier sección) ----
  function openMenu(app) {
    UI.modal({
      title: 'Compartir / Datos',
      bodyHTML: `<div class="menu-list">
        <button class="menu-row" data-act="exp-day"><span>${UI.icon('upload', 17)} Exportar un día</span><span class="chev">›</span></button>
        <button class="menu-row" data-act="exp-profile"><span>${UI.icon('upload', 17)} Exportar perfil completo</span><span class="chev">›</span></button>
        <button class="menu-row" data-act="exp-sessions"><span>${UI.icon('upload', 17)} Exportar sesiones</span><span class="chev">›</span></button>
        <button class="menu-row" data-act="exp-progress"><span>${UI.icon('upload', 17)} Exportar progreso</span><span class="chev">›</span></button>
        <button class="menu-row" data-act="exp-routines"><span>${UI.icon('upload', 17)} Exportar rutinas</span><span class="chev">›</span></button>
        <button class="menu-row" data-act="import"><span>${UI.icon('swap', 17)} Importar archivo</span><span class="chev">›</span></button>
      </div>
      <p class="field-hint">Para entrenar juntos: exporta un día y pásaselo a tu compañero; al importarlo podrá reemplazar su día o añadir solo lo que le falte.</p>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const go = (fn) => { UI.closeModal(); fn(); };
        root.querySelector('[data-act="exp-day"]').addEventListener('click', () => go(() => exportDay(app)));
        root.querySelector('[data-act="exp-profile"]').addEventListener('click', () => go(async () => {
          download(await gatherProfile(app.mainUser.id, app.mainUser), `traindia-perfil-${app.mainUser.name}-${stamp()}.json`);
          UI.toast('Perfil exportado');
        }));
        root.querySelector('[data-act="exp-sessions"]').addEventListener('click', () => go(() => exportSessions(app)));
        root.querySelector('[data-act="exp-progress"]').addEventListener('click', () => go(() => exportProgress(app)));
        root.querySelector('[data-act="exp-routines"]').addEventListener('click', () => go(() => exportRoutines(app)));
        root.querySelector('[data-act="import"]').addEventListener('click', () => go(() => triggerImport(app)));
      },
    });
  }

  // ---- Lectura de archivo + enrutado por tipo ----
  function triggerImport(app) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); } catch (e) { UI.toast('Archivo JSON inválido', 'err'); return; }
        routeImport(app, parsed);
      };
      reader.readAsText(f);
    });
    inp.click();
  }

  function routeImport(app, payload) {
    if (!payload || payload.format !== FORMAT || !payload.data) { UI.toast('No es un export de Traindía', 'err'); return; }
    if (payload.kind === 'day' && payload.data.day) importDay(app, payload);
    else importFlow(app, payload);
  }

  // ---------- EXPORTAR SESIONES ----------
  async function exportSessions(app) {
    const sessions = (await DB.sessionsOf(app.mainUser.id)).filter(s => !s.draft).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (sessions.length === 0) { UI.toast('No hay sesiones que exportar', 'err'); return; }
    const allEx = await DB.exercisesOf(app.mainUser.id);

    UI.modal({
      title: 'Exportar sesiones', size: 'wide',
      bodyHTML: `
        <div id="rangeForm" class="range-row">
          ${UI.field('Desde', UI.input('from', '', { type: 'date' }))}
          ${UI.field('Hasta', UI.input('to', '', { type: 'date' }))}
        </div>
        <p class="field-hint">Deja las fechas vacías para no filtrar. O marca sesiones concretas abajo (si marcas alguna, se exportan solo esas).</p>
        <div class="check-list">
          ${sessions.map(s => `<label class="check-row"><input type="checkbox" data-ses="${s.id}"><span>${UI.fmtDateShort(s.date)} · ${UI.esc(s.name || 'Sesión')}</span></label>`).join('')}
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Exportar', kind: 'primary', onClick: async (root) => {
          const checked = [...root.querySelectorAll('[data-ses]:checked')].map(c => c.dataset.ses);
          const r = UI.readForm(root.querySelector('#rangeForm'));
          let selected;
          if (checked.length) {
            selected = sessions.filter(s => checked.includes(s.id));
          } else {
            selected = sessions.filter(s => (!r.from || s.date >= r.from) && (!r.to || s.date <= r.to));
          }
          if (selected.length === 0) { UI.toast('Nada que exportar con ese filtro', 'err'); return false; }
          await doExportSessions(app, selected, allEx);
        }},
      ],
    });
  }

  // Descarga un conjunto de sesiones (con sus ejercicios referenciados).
  async function doExportSessions(app, sessions, allEx) {
    allEx = allEx || await DB.exercisesOf(app.mainUser.id);
    const refIds = sessions.flatMap(s => (s.entries || []).map(e => e.exerciseId));
    download({
      format: FORMAT, version: 2, kind: 'sessions', exportedAt: new Date().toISOString(),
      user: { name: app.mainUser.name, color: app.mainUser.color },
      data: { exercises: exercisesByIds(allEx, refIds), routines: [], sessions, progress: [], journal: [] },
    }, sessions.length === 1 ? `traindia-sesion-${stamp()}.json` : `traindia-sesiones-${stamp()}.json`);
    UI.toast(`${sessions.length} sesión(es) exportadas`);
  }

  // Exporta una sola sesión (desde su propia pantalla).
  async function exportSession(app, sessionId) {
    const s = await DB.get('sessions', sessionId);
    if (!s) { UI.toast('Sesión no encontrada', 'err'); return; }
    await doExportSessions(app, [s]);
  }

  // ---------- EXPORTAR PROGRESO ----------
  async function exportProgress(app) {
    const entries = (await DB.progressOf(app.mainUser.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (entries.length === 0) { UI.toast('No hay progreso que exportar', 'err'); return; }
    UI.modal({
      title: 'Exportar progreso', size: 'wide',
      bodyHTML: `<p class="field-hint">Marca registros concretos o deja todo sin marcar para exportarlos todos.</p>
        <div class="check-list">
          ${entries.map(e => `<label class="check-row"><input type="checkbox" data-prg="${e.id}"><span>${UI.fmtDateShort(e.date)}${e.weight ? ` · ${e.weight} kg` : ''}</span></label>`).join('')}
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Exportar', kind: 'primary', onClick: async (root) => {
          const checked = [...root.querySelectorAll('[data-prg]:checked')].map(c => c.dataset.prg);
          const sel = checked.length ? entries.filter(e => checked.includes(e.id)) : entries;
          doExportProgress(app, sel);
        }},
      ],
    });
  }
  function doExportProgress(app, entries) {
    download({
      format: FORMAT, version: 2, kind: 'progress', exportedAt: new Date().toISOString(),
      user: { name: app.mainUser.name, color: app.mainUser.color },
      data: { exercises: [], routines: [], sessions: [], progress: entries, journal: [] },
    }, entries.length === 1 ? `traindia-progreso-${stamp()}.json` : `traindia-progresos-${stamp()}.json`);
    UI.toast(`${entries.length} registro(s) exportados`);
  }
  async function exportProgressEntry(app, entryId) {
    const e = await DB.get('progress', entryId);
    if (!e) { UI.toast('Registro no encontrado', 'err'); return; }
    doExportProgress(app, [e]);
  }

  // ---------- EXPORTAR RUTINAS ----------
  async function exportRoutines(app) {
    const routines = await DB.routinesOf(app.mainUser.id);
    if (routines.length === 0) { UI.toast('No hay rutinas', 'err'); return; }
    const allEx = await DB.exercisesOf(app.mainUser.id);
    UI.modal({
      title: 'Exportar rutinas',
      bodyHTML: `<div class="check-list">
        ${routines.map(r => `<label class="check-row"><input type="checkbox" data-rt="${r.id}" checked><span>${UI.esc(r.name)}</span></label>`).join('')}
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Exportar', kind: 'primary', onClick: async (root) => {
          const ids = [...root.querySelectorAll('[data-rt]:checked')].map(c => c.dataset.rt);
          const selected = routines.filter(r => ids.includes(r.id));
          if (!selected.length) { UI.toast('Selecciona al menos una', 'err'); return false; }
          const refIds = selected.flatMap(r => (r.days || []).flatMap(d => (d.blocks || []).flatMap(b => (b.exercises || []).map(e => e.exerciseId))));
          download({
            format: FORMAT, version: 2, kind: 'routines', exportedAt: new Date().toISOString(),
            user: { name: app.mainUser.name, color: app.mainUser.color },
            data: { exercises: exercisesByIds(allEx, refIds), routines: selected, sessions: [], progress: [], journal: [] },
          }, `traindia-rutinas-${stamp()}.json`);
          UI.toast(`${selected.length} rutina(s) exportadas`);
        }},
      ],
    });
  }

  // ---------- IMPORTAR ----------
  async function importFlow(app, payload) {
    const users = await DB.getUsers();
    const counts = payload.data;
    const SECTIONS = [
      { key: 'exercises', label: 'Ejercicios' },
      { key: 'routines', label: 'Rutinas' },
      { key: 'sessions', label: 'Sesiones' },
      { key: 'progress', label: 'Progreso' },
      { key: 'journal', label: 'Diario' },
    ].filter(s => (counts[s.key] || []).length);

    const targetOpts = users.map(u => ({ value: u.id, label: u.name + (u.isMain ? ' (principal)' : ' (invitado)') }))
      .concat([{ value: '__new__', label: '+ Crear nuevo invitado' }]);

    UI.modal({
      title: 'Importar datos',
      bodyHTML: `
        <p class="modal-text">Archivo de <strong>${UI.esc(payload.user?.name || 'desconocido')}</strong>.</p>
        <div id="impForm">
          ${UI.field('Asignar a perfil', UI.select('target', targetOpts, users[0].id))}
          <div id="newGuestBox" style="display:none">
            ${UI.field('Nombre del invitado', UI.input('guestName', payload.user?.name || '', { placeholder: 'Nombre' }))}
            ${UI.field('Color', UI.colorPicker('guestColor', payload.user?.color || UI.ESSENTIALS[1]))}
          </div>
          <span class="field-label">Qué importar</span>
          <div class="check-list" style="max-height:none;margin-bottom:12px">
            ${SECTIONS.length ? SECTIONS.map(s => `<label class="check-row"><input type="checkbox" data-sec="${s.key}" checked><span>${s.label} <span class="dim">(${counts[s.key].length})</span></span></label>`).join('') : '<p class="dim" style="padding:2px">El archivo no tiene datos.</p>'}
          </div>
          ${UI.field('Si hay conflictos de id', UI.select('policy', [
            { value: 'duplicate', label: 'Duplicar (crear copias nuevas)' },
            { value: 'overwrite', label: 'Sobreescribir (reemplazar existentes)' }], 'duplicate'),
            'Duplicar evita pisar datos; sobreescribir actualiza registros con el mismo id.')}
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Importar', kind: 'primary', onClick: async (root) => {
          const d = UI.readForm(root.querySelector('#impForm'));
          const sections = new Set([...root.querySelectorAll('[data-sec]:checked')].map(c => c.dataset.sec));
          if (sections.size === 0) { UI.toast('Marca al menos una sección', 'err'); return false; }
          let targetUserId = d.target;
          if (d.target === '__new__') {
            if (!d.guestName || !d.guestName.trim()) { UI.toast('Escribe el nombre del invitado', 'err'); return false; }
            const guest = await DB.createUser({ name: d.guestName, color: d.guestColor, isGuest: true });
            targetUserId = guest.id;
          }
          await applyImport(app, payload, targetUserId, d.policy, sections);
          await app.loadUsers();
          await app.refreshRoutine();
          app.render();
          UI.toast('Importación completada');
        }},
      ],
      onMount: (root) => {
        UI.bindColorPicker(root);
        const sel = root.querySelector('select[name="target"]');
        const box = root.querySelector('#newGuestBox');
        sel.addEventListener('change', () => { box.style.display = sel.value === '__new__' ? '' : 'none'; });
      },
    });
  }

  async function applyImport(app, payload, targetUserId, policy, sections) {
    const data = payload.data || {};
    const duplicate = policy === 'duplicate';
    const want = sections || new Set(['exercises', 'routines', 'sessions', 'progress', 'journal']);
    const exMap = {}; // oldId -> newId (para reescribir referencias)

    // 1) Ejercicios
    if (want.has('exercises')) for (const ex of (data.exercises || [])) {
      const oldId = ex.id;
      const newId = duplicate ? DB.uid('ex') : ex.id;
      exMap[oldId] = newId;
      await DB.put('exercises', { ...ex, id: newId, userId: targetUserId });
    }
    const remapEx = (id) => (id && exMap[id]) ? exMap[id] : (id || null);

    // 2) Rutinas (reescribe exerciseId en bloques)
    if (want.has('routines')) for (const rt of (data.routines || [])) {
      const days = (rt.days || []).map(day => ({
        ...day,
        blocks: (day.blocks || []).map(b => ({
          ...b,
          exercises: (b.exercises || []).map(e => ({ ...e, exerciseId: remapEx(e.exerciseId) })),
        })),
      }));
      await DB.put('routines', { ...rt, id: duplicate ? DB.uid('rt') : rt.id, userId: targetUserId, days, isPrimary: false });
    }

    // 3) Sesiones (reescribe exerciseId en entries)
    if (want.has('sessions')) for (const s of (data.sessions || [])) {
      const entries = (s.entries || []).map(e => ({ ...e, exerciseId: remapEx(e.exerciseId) }));
      await DB.put('sessions', { ...s, id: duplicate ? DB.uid('ses') : s.id, userId: targetUserId, entries, draft: false });
    }

    // 4) Progreso
    if (want.has('progress')) for (const p of (data.progress || [])) {
      await DB.put('progress', { ...p, id: duplicate ? DB.uid('prg') : p.id, userId: targetUserId });
    }

    // 5) Diario
    if (want.has('journal')) for (const j of (data.journal || [])) {
      await DB.put('journal', { ...j, id: duplicate ? DB.uid('jrn') : j.id, userId: targetUserId });
    }
  }

  // ---------- EXPORTAR UN DÍA ----------
  async function doExportDay(app, day) {
    const allEx = await DB.exercisesOf(app.mainUser.id);
    const byId = Object.fromEntries(allEx.map(e => [e.id, e]));
    const ids = new Set();
    (day.blocks || []).forEach(bl => bl.exercises.forEach(x => {
      if (x.exerciseId) { ids.add(x.exerciseId); (byId[x.exerciseId]?.substitutes || []).forEach(sid => ids.add(sid)); }
    }));
    const exercises = [...ids].map(id => byId[id]).filter(Boolean);
    download({
      format: FORMAT, version: 2, kind: 'day', exportedAt: new Date().toISOString(),
      user: { name: app.mainUser.name, color: app.mainUser.color },
      data: { day: JSON.parse(JSON.stringify(day)), exercises },
    }, `traindia-dia-${day.name}-${stamp()}.json`);
    UI.toast('Día exportado');
  }

  async function exportDay(app, dayId) {
    if (dayId) { const d = (app.routine?.days || []).find(x => x.id === dayId); if (d) return doExportDay(app, d); }
    const days = (app.routine?.days || []).filter(d => !d.isRest);
    if (!days.length) { UI.toast('No hay días que exportar', 'err'); return; }
    UI.modal({
      title: 'Exportar un día',
      bodyHTML: `<p class="modal-text dim">Elige el día que quieres compartir:</p><div class="menu-list">
        ${days.map(d => `<button class="menu-row" data-day="${d.id}"><span><strong>${UI.esc(d.name)}</strong> — ${UI.esc(d.focus || '')}</span><span class="chev">›</span></button>`).join('')}
      </div>`,
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: (root) => root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', async () => {
        UI.closeModal();
        await doExportDay(app, app.routine.days.find(d => d.id === b.dataset.day));
      })),
    });
  }

  // Asegura que los ejercicios importados existen en el catálogo del usuario (por nombre).
  // Devuelve idMap: idOrigen -> idLocal. Crea los que falten y remapea sus suplentes.
  async function mapExercisesToCatalog(userId, importedExercises) {
    const local = await DB.exercisesOf(userId);
    const byName = new Map(local.map(e => [e.name.trim().toLowerCase(), e]));
    const idMap = {};
    const created = [];
    for (const ie of (importedExercises || [])) {
      const key = (ie.name || '').trim().toLowerCase();
      let ex = byName.get(key);
      if (!ex) {
        ex = { id: DB.uid('ex'), userId, name: (ie.name || '').trim(), muscleGroup: ie.muscleGroup || 'General', type: ie.type || 'weight', substitutes: [], createdAt: Date.now() };
        await DB.put('exercises', ex); byName.set(key, ex); created.push({ ex, srcSubs: ie.substitutes || [] });
      }
      idMap[ie.id] = ex.id;
    }
    for (const { ex, srcSubs } of created) {
      const subs = srcSubs.map(sid => idMap[sid]).filter(Boolean);
      if (subs.length) { ex.substitutes = subs; await DB.put('exercises', ex); }
    }
    return idMap;
  }

  // ---------- IMPORTAR UN DÍA (reemplazar / añadir diferente) ----------
  async function importDay(app, payload) {
    const day = payload.data.day;
    const sender = payload.user?.name || 'desconocido';
    const idMap = await mapExercisesToCatalog(app.mainUser.id, payload.data.exercises);
    const src = JSON.parse(JSON.stringify(day));
    (src.blocks || []).forEach(b => (b.exercises || []).forEach(e => { if (e.exerciseId && idMap[e.exerciseId]) e.exerciseId = idMap[e.exerciseId]; }));

    const rt = app.routine;
    const target = rt.days.find(d => d.id === day.id) || rt.days.find(d => (d.name || '').toLowerCase() === (day.name || '').toLowerCase());
    const exCount = (src.blocks || []).reduce((n, b) => n + (b.exercises ? b.exercises.length : 0), 0);

    const persist = async (dayId) => { await DB.put('routines', rt); await app.refreshRoutine(); app.go('day', { dayId }, true); };

    const actions = [{ label: 'Cancelar', kind: 'ghost' }];
    if (target) {
      actions.push({ label: 'Añadir lo diferente', kind: 'ghost', onClick: async () => {
        const added = mergeDay(target, src);
        await persist(target.id);
        UI.toast(added ? `${added} ejercicio(s) añadidos` : 'No había nada nuevo');
      }});
      actions.push({ label: 'Reemplazar', kind: 'danger', onClick: async () => {
        const ok = await UI.confirm({ title: `Reemplazar ${target.name}`, message: `¿Seguro? Tu día "${target.name}" se sustituye por completo por el de ${sender}. Se borran tus ejercicios actuales de ese día (no afecta a otros días ni a tus sesiones).`, confirmLabel: 'Sí, reemplazar', danger: true });
        if (!ok) return false;
        replaceDay(target, src);
        await persist(target.id);
        UI.toast('Día reemplazado');
      }});
    } else {
      actions.push({ label: 'Añadir como día nuevo', kind: 'primary', onClick: async () => {
        src.order = rt.days.length;
        rt.days.push(src);
        await persist(src.id);
        UI.toast('Día añadido');
      }});
    }

    UI.modal({
      title: 'Importar día',
      bodyHTML: `<p class="modal-text">Día <strong>${UI.esc(day.name)}</strong> de <strong>${UI.esc(sender)}</strong> · ${exCount} ejercicios.</p>
        ${target
          ? `<p class="modal-text dim">Coincide con tu día <strong>${UI.esc(target.name)}</strong>. Puedes <strong>reemplazarlo</strong> entero o <strong>añadir solo lo que no tengas</strong>.</p>`
          : `<p class="modal-text dim">No tienes un día equivalente; se añadirá como día nuevo.</p>`}`,
      actions,
    });
  }

  function replaceDay(target, src) {
    target.type = src.type; target.typeLabel = src.typeLabel; target.focus = src.focus;
    target.place = src.place; target.placeAccent = src.placeAccent; target.duration = src.duration; target.isRest = src.isRest;
    target.blocks = src.blocks; target.substitutes = src.substitutes || [];
    target.substitutesTitle = src.substitutesTitle || ''; target.planB = src.planB || []; target.relatedGuides = src.relatedGuides || [];
  }

  // Añade al día destino solo los ejercicios que no tiene (por id o nombre), en su categoría.
  function mergeDay(target, src) {
    const have = new Set();
    (target.blocks || []).forEach(b => (b.exercises || []).forEach(e => { if (e.exerciseId) have.add(e.exerciseId); have.add((e.name || '').toLowerCase()); }));
    let added = 0;
    (src.blocks || []).forEach(sb => {
      (sb.exercises || []).forEach(e => {
        if ((e.exerciseId && have.has(e.exerciseId)) || have.has((e.name || '').toLowerCase())) return;
        let tb = target.blocks.find(b => b.label === sb.label);
        if (!tb) { tb = { label: sb.label, optional: !!sb.optional, exercises: [] }; target.blocks.push(tb); }
        tb.exercises.push(e); added++;
        if (e.exerciseId) have.add(e.exerciseId); have.add((e.name || '').toLowerCase());
      });
    });
    return added;
  }

  return { render, bind, openMenu, exportDay, importDay, exportSession, exportProgressEntry, routeImport };
})();
