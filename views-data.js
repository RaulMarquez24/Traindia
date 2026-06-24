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

  // ---- Copia de seguridad completa (perfil principal) ----
  async function backupProfile(app) {
    download(await gatherProfile(app.mainUser.id, app.mainUser), `traindia-perfil-${app.mainUser.name}-${stamp()}.json`);
    await DB.saveSettings({ lastBackupAt: Date.now() });
    UI.toast('Copia descargada');
  }

  // Recordatorio semanal de copia de seguridad. Solo si hay datos nuevos desde la
  // última copia; persiste mientras esté pendiente (te vuelve a avisar en siguientes
  // aperturas aunque lo omitas o pases días sin entrar); como mucho un aviso al día.
  async function checkBackupReminder(app) {
    if (document.querySelector('.modal-overlay')) return; // no encimar otro modal (p.ej. reanudar entreno)
    const s = (await DB.getSettings()) || {};
    const now = Date.now(), DAY = 86400000;
    const lastBackup = s.lastBackupAt || 0;
    const lastReminder = s.lastBackupReminderAt || 0;
    const [sessions, progress, journal] = await Promise.all([
      DB.sessionsOf(app.mainUser.id), DB.progressOf(app.mainUser.id), DB.journalOf(app.mainUser.id),
    ]);
    const stamps = [...sessions.filter(x => !x.draft), ...progress, ...journal].map(x => x.createdAt || 0).filter(Boolean);
    if (!stamps.length) return;
    const newest = Math.max(...stamps);
    if (newest <= lastBackup) return; // nada nuevo que respaldar
    const since = lastBackup || Math.min(...stamps); // si nunca: cuenta desde el dato más antiguo
    if (now - since < 7 * DAY) return; // cadencia semanal
    if (lastReminder && now - lastReminder < 20 * 60 * 60 * 1000) return; // como mucho 1/día
    await DB.saveSettings({ lastBackupReminderAt: now });
    const daysAgo = lastBackup ? Math.floor((now - lastBackup) / DAY) : 0;
    UI.modal({
      title: 'Copia de seguridad',
      bodyHTML: `<p class="modal-text">Tus entrenos se guardan solo en este dispositivo. ${lastBackup ? `Hace <strong>${daysAgo} día${daysAgo === 1 ? '' : 's'}</strong> que no haces una copia.` : 'Todavía no has hecho ninguna copia de seguridad.'} Descárgala para no perderlos si cambias de móvil o borras la app.</p>`,
      actions: [
        { label: 'Ahora no', kind: 'ghost' },
        { label: 'Descargar copia', kind: 'primary', onClick: async () => { await backupProfile(app); } },
      ],
    });
  }

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
        <button class="btn primary block" id="impBtn">Importar (archivo o pegar JSON)</button>
        <p class="field-hint">Pega el JSON o elige un archivo. Podrás elegir a qué perfil(es) asignarlo y qué partes importar.</p>
      </div>
    </div>`;
  }

  function bind(app, root) {
    root.querySelector('#expProfile').addEventListener('click', () => backupProfile(app));
    root.querySelector('#expDay').addEventListener('click', () => exportDay(app));
    root.querySelector('#expSessions').addEventListener('click', () => exportSessions(app));
    root.querySelector('#expProgress').addEventListener('click', () => exportProgress(app));
    root.querySelector('#expRoutines').addEventListener('click', () => exportRoutines(app));
    root.querySelector('#impBtn').addEventListener('click', () => startImport(app));
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
        <button class="menu-row" data-act="import"><span>${UI.icon('swap', 17)} Importar (archivo o pegar)</span><span class="chev">›</span></button>
      </div>
      <p class="field-hint">Para entrenar juntos: exporta un día y pásaselo a tu compañero; al importarlo podrá reemplazar su día o añadir solo lo que le falte.</p>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const go = (fn) => { UI.closeModal(); fn(); };
        root.querySelector('[data-act="exp-day"]').addEventListener('click', () => go(() => exportDay(app)));
        root.querySelector('[data-act="exp-profile"]').addEventListener('click', () => go(() => backupProfile(app)));
        root.querySelector('[data-act="exp-sessions"]').addEventListener('click', () => go(() => exportSessions(app)));
        root.querySelector('[data-act="exp-progress"]').addEventListener('click', () => go(() => exportProgress(app)));
        root.querySelector('[data-act="exp-routines"]').addEventListener('click', () => go(() => exportRoutines(app)));
        root.querySelector('[data-act="import"]').addEventListener('click', () => go(() => startImport(app)));
      },
    });
  }

  // ---- Importar: pegar texto JSON o elegir archivo ----
  function startImport(app) {
    UI.modal({
      title: 'Importar datos', size: 'wide',
      bodyHTML: `
        <p class="field-hint" style="margin-top:0">Pega aquí el texto JSON exportado, o elige un archivo.</p>
        <textarea class="inp" id="impText" rows="6" placeholder='Pega el JSON aquí… (empieza por {"format":"cnp-export"…})'></textarea>
        <button class="btn ghost block" id="impFileBtn" style="margin-top:8px">${UI.icon('upload', 15)} …o elegir un archivo</button>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Continuar', kind: 'primary', onClick: (root) => {
          const txt = (root.querySelector('#impText').value || '').trim();
          if (!txt) { UI.toast('Pega el JSON o elige un archivo', 'err'); return false; }
          let parsed;
          try { parsed = JSON.parse(txt); } catch (e) { UI.toast('El texto no es un JSON válido', 'err'); return false; }
          if (!parsed || parsed.format !== FORMAT || !parsed.data) { UI.toast('No es un export de Traindía', 'err'); return false; }
          routeImport(app, parsed);
        }},
      ],
      onMount: (root) => {
        root.querySelector('#impFileBtn').addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'application/json,.json';
          inp.addEventListener('change', () => {
            const f = inp.files[0]; if (!f) return;
            const reader = new FileReader();
            reader.onload = () => { root.querySelector('#impText').value = reader.result; };
            reader.readAsText(f);
          });
          inp.click();
        });
        setTimeout(() => root.querySelector('#impText').focus(), 120);
      },
    });
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
  function importItemLabel(key, it) {
    if (key === 'exercises') return UI.esc(it.name || 'Ejercicio');
    if (key === 'routines') return UI.esc(it.name || 'Plan');
    if (key === 'sessions') return `${UI.fmtDateShort(it.date)} · ${UI.esc(it.name || 'Sesión')}`;
    if (key === 'progress') return `${UI.fmtDateShort(it.date)}${it.weight ? ` · ${it.weight} kg` : ''}`;
    if (key === 'journal') return `${UI.fmtDateShort(it.date)}`;
    return UI.esc(String(it.id));
  }

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

    // sección con checkbox global + lista de elementos editable (para quitar lo que no quieras)
    const sectionHTML = (s) => {
      const items = counts[s.key];
      const editable = items.length > 1 && items.length <= 60;
      return `<div class="imp-sec">
        <label class="check-row imp-sec-head"><input type="checkbox" data-sec="${s.key}" checked><span>${s.label} <span class="dim">(${items.length})</span></span>${editable ? `<button type="button" class="imp-toggle" data-toggle="${s.key}">editar</button>` : ''}</label>
        ${editable ? `<div class="imp-items" data-items="${s.key}" style="display:none">${items.map(it => `<label class="check-row sub"><input type="checkbox" data-item="${s.key}" data-id="${UI.esc(String(it.id))}" checked><span>${importItemLabel(s.key, it)}</span></label>`).join('')}</div>` : ''}
      </div>`;
    };

    UI.modal({
      title: 'Importar datos', size: 'wide',
      bodyHTML: `
        <p class="modal-text">Archivo de <strong>${UI.esc(payload.user?.name || 'desconocido')}</strong>.</p>
        <div id="impForm">
          <span class="field-label">Asignar a perfil(es)</span>
          <p class="field-hint" style="margin-top:0;margin-bottom:8px">Puedes marcar varios: se importan los mismos datos a cada uno (luego editas el de cada perfil por separado).</p>
          <div class="check-list" style="max-height:none;margin-bottom:10px">
            ${users.map((u, i) => `<label class="check-row"><input type="checkbox" data-user="${u.id}"${i === 0 ? ' checked' : ''}><span>${UI.esc(u.name)}${u.isMain ? ' (principal)' : ' (invitado)'}</span></label>`).join('')}
            <label class="check-row"><input type="checkbox" data-newguest><span>+ Crear nuevo invitado</span></label>
          </div>
          <div id="newGuestBox" style="display:none">
            ${UI.field('Nombre del invitado', UI.input('guestName', payload.user?.name || '', { placeholder: 'Nombre' }))}
            ${UI.field('Color', UI.colorPicker('guestColor', payload.user?.color || UI.ESSENTIALS[1]))}
          </div>
          <span class="field-label">Qué importar</span>
          <div style="margin-bottom:12px">
            ${SECTIONS.length ? SECTIONS.map(sectionHTML).join('') : '<p class="dim" style="padding:2px">El archivo no tiene datos.</p>'}
          </div>
          <span class="field-label">Si ya tienes esos datos</span>
          ${UI.select('policy', [
            { value: 'duplicate', label: 'Añadir como copia nueva' },
            { value: 'overwrite', label: 'Reemplazar lo que coincida' }], 'duplicate')}
          <p class="field-hint" id="policyHint"></p>
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Importar', kind: 'primary', onClick: async (root) => {
          const targetIds = [...root.querySelectorAll('[data-user]:checked')].map(c => c.dataset.user);
          const newGuest = root.querySelector('[data-newguest]').checked;
          if (!targetIds.length && !newGuest) { UI.toast('Elige al menos un perfil', 'err'); return false; }

          // secciones + filtrado por elemento
          const chosen = new Set();
          const filtered = {};
          for (const s of SECTIONS) {
            const secChk = root.querySelector(`[data-sec="${s.key}"]`);
            if (!secChk || !secChk.checked) continue;
            const itemsBox = root.querySelector(`[data-items="${s.key}"]`);
            let sel;
            if (itemsBox) {
              const ids = new Set([...root.querySelectorAll(`[data-item="${s.key}"]:checked`)].map(c => c.dataset.id));
              sel = (counts[s.key] || []).filter(it => ids.has(String(it.id)));
            } else sel = (counts[s.key] || []);
            if (sel.length) { filtered[s.key] = sel; chosen.add(s.key); }
          }
          if (!chosen.size) { UI.toast('Marca al menos algo que importar', 'err'); return false; }

          if (newGuest) {
            const name = (root.querySelector('input[name="guestName"]').value || '').trim();
            if (!name) { UI.toast('Escribe el nombre del invitado', 'err'); return false; }
            const color = root.querySelector('input[name="guestColor"]').value;
            const g = await DB.createUser({ name, color, isGuest: true });
            targetIds.push(g.id);
          }

          // con varios perfiles se duplica siempre (un mismo id no puede ser de dos perfiles)
          const policy = targetIds.length > 1 ? 'duplicate' : root.querySelector('select[name="policy"]').value;
          const payload2 = { ...payload, data: { exercises: [], routines: [], sessions: [], progress: [], journal: [], ...filtered } };
          for (const tid of targetIds) await applyImport(app, payload2, tid, policy, chosen);

          await app.loadUsers();
          await app.refreshRoutine();
          app.render();
          UI.toast(`Importado a ${targetIds.length} perfil(es)`);
        }},
      ],
      onMount: (root) => {
        UI.bindColorPicker(root);
        const ng = root.querySelector('[data-newguest]');
        const box = root.querySelector('#newGuestBox');
        ng.addEventListener('change', () => { box.style.display = ng.checked ? '' : 'none'; });
        root.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
          const items = root.querySelector(`[data-items="${b.dataset.toggle}"]`);
          const open = items.style.display === 'none';
          items.style.display = open ? '' : 'none';
          b.textContent = open ? 'ocultar' : 'editar';
        }));
        root.querySelectorAll('[data-sec]').forEach(sc => sc.addEventListener('change', () => {
          root.querySelectorAll(`[data-item="${sc.dataset.sec}"]`).forEach(ic => { ic.checked = sc.checked; });
        }));
        const pol = root.querySelector('select[name="policy"]');
        const hint = root.querySelector('#policyHint');
        const setHint = () => {
          hint.textContent = pol.value === 'duplicate'
            ? 'Se añade como entradas NUEVAS; nunca borra ni pisa lo que ya tienes. Tu plan y días actuales NO cambian (la rutina entra como un plan aparte, sin activar).'
            : 'Actualiza en su sitio lo que coincida (mismo identificador) con lo del archivo; el resto se añade. Ideal para RESTAURAR tu propio perfil: tus días vuelven a como están en el archivo.';
        };
        pol.addEventListener('change', setHint); setHint();
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
    if (want.has('routines')) {
      for (const rt of (data.routines || [])) {
        const days = (rt.days || []).map(day => ({
          ...day,
          blocks: (day.blocks || []).map(b => ({
            ...b,
            exercises: (b.exercises || []).map(e => ({ ...e, exerciseId: remapEx(e.exerciseId) })),
          })),
        }));
        // copia nueva: nunca activa (no pisa tu plan). Reemplazar: conserva si era el activo
        // (así reimportar tu propio perfil restaura/actualiza los días en su sitio).
        await DB.put('routines', { ...rt, id: duplicate ? DB.uid('rt') : rt.id, userId: targetUserId, days, isPrimary: duplicate ? false : !!rt.isPrimary });
      }
      // garantizar exactamente un plan activo en el destino
      const rts = await DB.routinesOf(targetUserId);
      if (rts.length && rts.filter(r => r.isPrimary).length !== 1) {
        const keep = rts.find(r => r.isPrimary) || rts[0];
        for (const r of rts) { const want1 = r.id === keep.id; if (!!r.isPrimary !== want1) { r.isPrimary = want1; await DB.put('routines', r); } }
      }
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
        if (Array.isArray(ie.metrics)) ex.metrics = ie.metrics.slice(); // conservar datos a registrar (tiempo)
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

  return { render, bind, openMenu, exportDay, importDay, exportSession, exportProgressEntry, routeImport, checkBackupReminder };
})();
