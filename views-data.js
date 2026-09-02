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
        journal: await DB.journalOf(userId),   // sección retirada, pero sus datos se conservan
        nutrition: await DB.nutritionOf(userId),
      },
    };
  }

  function exercisesByIds(allExercises, ids) {
    const set = new Set(ids.filter(Boolean));
    return allExercises.filter(e => set.has(e.id));
  }

  // Todo lo que exporta la app pasa por aquí: se guarda en Descargas y, si el
  // móvil sabe compartir archivos, se ofrece mandarlo sin tener que ir a buscarlo
  // al explorador (que en Android es un dolor).
  function download(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ofrecerCompartir(blob, filename);
  }

  // Android NO deja compartir .json: el menú responde "Permission denied" aunque
  // canShare() diga que sí. Como texto plano lo acepta siempre, y Traindía lo
  // importa igual porque al abrir un archivo mira el contenido, no la extensión.
  const comoTexto = (blob, filename) => new File([blob], filename.replace(/\.json$/, '.txt'), { type: 'text/plain' });
  const comoJson = (blob, filename) => new File([blob], filename, { type: 'application/json' });

  function ficheroCompartible(blob, filename) {
    if (!navigator.canShare || !navigator.share || typeof File !== 'function') return null;
    const txt = comoTexto(blob, filename);
    if (navigator.canShare({ files: [txt] })) return txt;
    const json = comoJson(blob, filename);
    return navigator.canShare({ files: [json] }) ? json : null;
  }

  function ofrecerCompartir(blob, filename) {
    const file = ficheroCompartible(blob, filename);
    if (!file) return;   // escritorio o navegador sin compartir: se queda descargado y ya
    const esTexto = file.name !== filename;
    // Chrome para Android rechaza application/json en el menú de compartir
    // ("Permission denied") aunque canShare() diga que sí. Por eso el envío
    // seguro va como .txt y el .json queda a un toque, por si el móvil lo admite.
    const puedeJson = esTexto && navigator.canShare({ files: [comoJson(blob, filename)] });
    UI.modal({
      title: '¿Lo compartes?',
      bodyHTML: `<p class="modal-text"><strong>${UI.esc(filename)}</strong> se ha guardado en tus descargas.</p>
        <p class="modal-text dim">Si quieres, lo mandas ahora por WhatsApp, Telegram, Gmail, Drive… sin tener que buscarlo en el explorador.</p>
        ${esTexto ? `<p class="field-hint">Va como <strong>.txt</strong> con el mismo contenido: Android no deja mandar archivos .json desde el navegador. Traindía lo importa igual.${puedeJson ? ' Si prefieres arriesgarte, prueba «Como .json».' : ''}</p>` : ''}
        ${esTexto ? '<p class="field-hint">Para mandar el .json tal cual: ábrelo desde <strong>Descargas</strong> y compártelo desde ahí. Esa vía no pasa por el navegador y no lo bloquea.</p>' : ''}`,
      actions: [
        { label: 'Ahora no', kind: 'ghost' },
        ...(puedeJson ? [{ label: 'Como .json', kind: 'ghost', onClick: () => lanzarCompartir(blob, filename, comoJson(blob, filename)) }] : []),
        { label: 'Compartir', kind: 'primary', onClick: () => lanzarCompartir(blob, filename, file) },
      ],
    });
  }

  // OJO: navigator.share solo funciona con un gesto reciente del usuario, y ese
  // gesto se gasta al terminar el click. Por eso NO se puede reintentar dentro
  // del mismo toque: si falla, se ofrece un botón nuevo.
  function lanzarCompartir(blob, filename, file) {
    const marcar = (e) => { try { (e || {})._nombre = file.name; } catch (x) {} return e; };
    let p;
    try { p = navigator.share({ files: [file] }); }
    catch (e) { fallo(blob, filename, marcar(e)); return; }
    if (p && p.catch) p.catch(e => { if (!e || e.name !== 'AbortError') fallo(blob, filename, marcar(e)); });
  }

  function fallo(blob, filename, e) {
    const nombre = (e && e.name) || 'Error';
    const motivo = {
      NotAllowedError: 'El móvil ha bloqueado el envío. Suele pasar si se ha tardado en pulsar o si el menú de compartir ya estaba abierto.',
      NotSupportedError: 'Este navegador no sabe compartir este tipo de archivo.',
      DataError: 'El archivo no se ha podido preparar para compartir.',
      TypeError: 'Este navegador no admite compartir archivos.',
    }[nombre] || 'Tu navegador ha rechazado el envío.';
    // El segundo intento va con el otro formato, por si el móvil solo acepta uno.
    const yaFueTexto = /\.txt$/.test((e && e._nombre) || '') || !/\.json$/.test(filename);
    const alt = yaFueTexto ? comoJson(blob, filename) : comoTexto(blob, filename);
    const puedeAlt = navigator.canShare && navigator.canShare({ files: [alt] });
    UI.modal({
      title: 'No se ha podido compartir',
      bodyHTML: `<p class="modal-text">${UI.esc(motivo)}</p>
        <p class="modal-text dim">El archivo <strong>${UI.esc(filename)}</strong> está guardado en tus descargas, así que no has perdido nada.</p>
        <p class="field-hint">Detalle técnico: ${UI.esc(nombre)}${e && e.message ? ` · ${UI.esc(String(e.message).slice(0, 120))}` : ''}</p>`,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        ...(puedeAlt ? [{ label: `Probar como ${alt.name.endsWith('.txt') ? 'texto' : '.json'}`, kind: 'primary', onClick: () => {
          try { const q = navigator.share({ files: [alt] }); if (q && q.catch) q.catch(() => {}); } catch (x) {}
        } }] : []),
      ],
    });
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
        <button class="btn ghost block" id="expPlan">Plan completo (semana)</button>
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
    root.querySelector('#expPlan').addEventListener('click', () => exportPlan(app));
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
        <button class="menu-row" data-act="exp-plan"><span>${UI.icon('upload', 17)} Exportar plan (semana)</span><span class="chev">›</span></button>
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
        root.querySelector('[data-act="exp-plan"]').addEventListener('click', () => go(() => exportPlan(app)));
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
        <p class="field-hint" style="margin-top:0">Pega aquí el texto JSON exportado, o elige un archivo. <strong>Desde el móvil</strong>: en WhatsApp o Archivos, dale al documento → <strong>Compartir</strong> → <strong>Traindía</strong> y se importa solo.</p>
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
          // SIN filtro 'accept': en Android los .json guardados por WhatsApp llegan
          // como application/octet-stream y el selector los ocultaba (ni salían en
          // "Recientes"), obligando a navegar a mano hasta la carpeta.
          inp.type = 'file';
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
    if (payload.kind === 'nutrition' && payload.data.plan) importNutrition(app, payload);
    else if (payload.kind === 'day' && payload.data.day) importDay(app, payload);
    else if (payload.kind === 'plan' && payload.data.routine) importPlan(app, payload);
    else importFlow(app, payload);
  }

  // ---------- EXPORTAR PLAN (semana completa = la rutina activa) ----------
  function exportPlan(app) {
    const routine = app.routine;
    if (!routine) { UI.toast('No hay plan activo', 'err'); return; }
    doExportPlan(app, routine);
  }
  async function doExportPlan(app, routine) {
    const allEx = await DB.exercisesOf(app.mainUser.id);
    const byId = Object.fromEntries(allEx.map(e => [e.id, e]));
    const ids = new Set();
    (routine.days || []).forEach(d => (d.blocks || []).forEach(bl => bl.exercises.forEach(x => {
      if (x.exerciseId) { ids.add(x.exerciseId); (byId[x.exerciseId]?.substitutes || []).forEach(sid => ids.add(sid)); }
    })));
    download({
      format: FORMAT, version: 2, kind: 'plan', exportedAt: new Date().toISOString(),
      user: { name: app.mainUser.name, color: app.mainUser.color },
      data: { routine, exercises: exercisesByIds(allEx, [...ids]) },
    }, `traindia-plan-${stamp()}.json`);
    UI.toast('Plan exportado');
  }

  // Crea un plan NUEVO (no activo) en el perfil destino, con los días elegidos y
  // sus ejercicios remapeados al catálogo del destino. Reutilizado por importPlan
  // y por la importación de perfil completo.
  async function createImportedPlan(targetUserId, routine, dayIds, name, exercises) {
    const idMap = await mapExercisesToCatalog(targetUserId, exercises || []);
    const newDays = JSON.parse(JSON.stringify((routine.days || []).filter(d => dayIds.has(d.id))));
    newDays.forEach(d => {
      d.id = DB.uid('day'); // id propio para el nuevo plan
      (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => { if (e.exerciseId && idMap[e.exerciseId]) e.exerciseId = idMap[e.exerciseId]; }));
    });
    await DB.put('routines', { id: DB.uid('rt'), userId: targetUserId, planType: routine.planType || 'cnp', name, days: newDays, order: Date.now(), createdAt: Date.now(), isPrimary: false });
  }
  // Fusiona los días elegidos del plan del archivo DENTRO del plan activo del destino:
  // sustituye el día con el mismo nombre (conserva su id/orden) o lo añade si no existe.
  async function mergeDaysIntoPlan(targetUserId, routine, dayIds, exercises) {
    const idMap = await mapExercisesToCatalog(targetUserId, exercises || []);
    const rts = await DB.routinesOf(targetUserId);
    const target = rts.find(r => r.isPrimary) || rts[0];
    if (!target) { await createImportedPlan(targetUserId, routine, dayIds, routine.name || 'Plan importado', exercises); return; }
    (routine.days || []).filter(d => dayIds.has(d.id)).forEach(sd => {
      const copy = JSON.parse(JSON.stringify(sd));
      (copy.blocks || []).forEach(b => (b.exercises || []).forEach(e => { if (e.exerciseId && idMap[e.exerciseId]) e.exerciseId = idMap[e.exerciseId]; }));
      const idx = target.days.findIndex(d => (d.name || '').trim().toLowerCase() === (sd.name || '').trim().toLowerCase());
      if (idx >= 0) { copy.id = target.days[idx].id; copy.order = target.days[idx].order; target.days[idx] = copy; }
      else { copy.id = DB.uid('day'); target.days.push(copy); }
    });
    await DB.put('routines', target);
  }
  // Lista de casillas de días de un plan (marcados por defecto).
  function dayChecksHTML(days) {
    return (days || []).map(d => `<label class="check-row"><input type="checkbox" data-day="${UI.esc(d.id)}" checked><span>${UI.esc(d.name)}${d.isRest ? ' (descanso)' : ` — ${(d.blocks || []).reduce((a, b) => a + (b.exercises || []).length, 0)} ej`}</span></label>`).join('');
  }

  // ---------- Pauta de alimentación ----------
  function exportNutrition(app, plan) {
    if (!plan) { UI.toast('No hay pauta que compartir', 'err'); return; }
    const limpio = { ...plan };
    delete limpio.id; delete limpio.userId; delete limpio.isPrimary; delete limpio.createdAt;
    download({
      format: FORMAT, version: 2, kind: 'nutrition', exportedAt: new Date().toISOString(),
      user: { name: app.activeUser.name, color: app.activeUser.color },
      data: { plan: limpio },
    }, `traindia-nutricion-${stamp()}.json`);
    UI.toast('Pauta exportada');
  }
  function importNutrition(app, payload) {
    if (typeof VNutrition === 'undefined') { UI.toast('Nutrición no disponible', 'err'); return; }
    app.go('nutrition', {}, true);
    setTimeout(() => VNutrition.previewImport(app, payload), 300);
  }

  // ---------- IMPORTAR PLAN: se añade como un plan NUEVO (no activo) ----------
  function importPlan(app, payload) {
    const routine = payload.data.routine || {};
    const sender = payload.user?.name || 'alguien';
    UI.modal({
      title: `Importar plan de ${UI.esc(sender)}`, size: 'wide',
      bodyHTML: `
        ${UI.field('Nombre del plan', UI.input('planName', routine.name ? `${routine.name} (de ${sender})` : `Plan de ${sender}`))}
        <span class="field-label">Días a incluir</span>
        <p class="field-hint" style="margin-top:0">Se añade como un plan NUEVO. Lo activas cuando quieras desde "El plan".</p>
        <div class="check-list">${dayChecksHTML(routine.days)}</div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Añadir plan', kind: 'primary', onClick: async (root) => {
          const chosen = new Set([...root.querySelectorAll('[data-day]:checked')].map(c => c.dataset.day));
          if (!chosen.size) { UI.toast('Marca al menos un día', 'err'); return false; }
          const name = root.querySelector('input[name="planName"]').value.trim() || `Plan de ${sender}`;
          await createImportedPlan(app.mainUser.id, routine, chosen, name, payload.data.exercises);
          await app.refreshRoutine();
          app.render();
          UI.toast('Plan añadido · actívalo en "El plan"');
        } },
      ],
    });
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
    const sender = payload.user?.name || 'desconocido';
    const routines = counts.routines || [];
    const planRoutine = routines.find(r => r.isPrimary) || routines[0] || null; // el plan del archivo
    const hasPlan = !!planRoutine;
    const DATA_SECTIONS = [
      { key: 'exercises', label: 'Ejercicios' },
      { key: 'sessions', label: 'Sesiones' },
      { key: 'progress', label: 'Progreso' },
    ].filter(s => (counts[s.key] || []).length);
    const hasData = DATA_SECTIONS.length > 0;

    // sección de datos: casilla global + lista de elementos editable
    const sectionHTML = (s) => {
      const items = counts[s.key];
      const editable = items.length > 1 && items.length <= 60;
      return `<div class="imp-sec">
        <label class="check-row imp-sec-head"><input type="checkbox" data-sec="${s.key}" checked><span>${s.label} <span class="dim">(${items.length})</span></span>${editable ? `<button type="button" class="imp-toggle" data-toggle="${s.key}">editar</button>` : ''}</label>
        ${editable ? `<div class="imp-items" data-items="${s.key}" style="display:none">${items.map(it => `<label class="check-row sub"><input type="checkbox" data-item="${s.key}" data-id="${UI.esc(String(it.id))}" checked><span>${importItemLabel(s.key, it)}</span></label>`).join('')}</div>` : ''}
      </div>`;
    };
    // sección "Días del plan": desmarcada por defecto (no toca tu plan salvo que la actives),
    // con destino (a tu plan actual / plan nuevo) y casillas por día.
    const daysSection = hasPlan ? `<div class="imp-sec">
      <label class="check-row imp-sec-head"><input type="checkbox" data-sec="days"><span>Días del plan <span class="dim">(${(planRoutine.days || []).length})</span></span><button type="button" class="imp-toggle" data-toggle="days">editar</button></label>
      <div class="imp-items" data-items="days" style="display:none">
        <div style="margin-bottom:6px">
          <label class="check-row"><input type="radio" name="daysdest" value="merge" checked><span>A mi plan actual (sustituye esos días)</span></label>
          <label class="check-row"><input type="radio" name="daysdest" value="new"><span>Como plan nuevo aparte</span></label>
        </div>
        <div id="daysNewName" style="display:none;margin-bottom:6px">${UI.field('Nombre del plan nuevo', UI.input('planName', planRoutine.name ? `${planRoutine.name} (de ${sender})` : `Plan de ${sender}`))}</div>
        ${dayChecksHTML(planRoutine.days)}
      </div>
    </div>` : '';

    UI.modal({
      title: 'Importar', size: 'wide',
      bodyHTML: `
        <p class="modal-text">Archivo de <strong>${UI.esc(sender)}</strong>.</p>
        <div id="impForm">
          <span class="field-label">Asignar a perfil(es)</span>
          <p class="field-hint" style="margin-top:0;margin-bottom:8px">Puedes marcar varios: se importa lo mismo a cada uno.</p>
          <div class="check-list" style="max-height:none;margin-bottom:10px">
            ${users.map((u, i) => `<label class="check-row"><input type="checkbox" data-user="${u.id}"${i === 0 ? ' checked' : ''}><span>${UI.esc(u.name)}${u.isMain ? ' (principal)' : ' (invitado)'}</span></label>`).join('')}
            <label class="check-row"><input type="checkbox" data-newguest><span>+ Crear nuevo invitado</span></label>
          </div>
          <div id="newGuestBox" style="display:none">
            ${UI.field('Nombre del invitado', UI.input('guestName', sender, { placeholder: 'Nombre' }))}
            ${UI.field('Color', UI.colorPicker('guestColor', payload.user?.color || UI.ESSENTIALS[1]))}
          </div>
          <span class="field-label">Qué importar</span>
          <p class="field-hint" style="margin-top:0;margin-bottom:8px">Marca lo que quieras. En "Días" pulsa <em>editar</em> para elegir días sueltos y si van a tu plan o a uno nuevo.</p>
          <div style="margin-bottom:12px">
            ${daysSection}${DATA_SECTIONS.map(sectionHTML).join('')}
            ${(!hasPlan && !hasData) ? '<p class="dim" style="padding:2px">El archivo no tiene datos.</p>' : ''}
          </div>
          ${hasData ? `<span class="field-label">Si ya tienes esos datos</span>
          ${UI.select('policy', [{ value: 'duplicate', label: 'Añadir como copia nueva' }, { value: 'overwrite', label: 'Reemplazar lo que coincida' }], 'duplicate')}
          <p class="field-hint" id="policyHint"></p>` : ''}
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Importar', kind: 'primary', onClick: async (root) => {
          const targetIds = [...root.querySelectorAll('[data-user]:checked')].map(c => c.dataset.user);
          const newGuest = root.querySelector('[data-newguest]').checked;
          if (!targetIds.length && !newGuest) { UI.toast('Elige al menos un perfil', 'err'); return false; }

          // Días del plan
          let dayIds = null, daysDest = 'merge', planName = '';
          const daysChk = root.querySelector('[data-sec="days"]');
          const wantDays = hasPlan && daysChk && daysChk.checked;
          if (wantDays) {
            dayIds = new Set([...root.querySelectorAll('[data-day]:checked')].map(c => c.dataset.day));
            if (!dayIds.size) { UI.toast('Marca al menos un día del plan', 'err'); return false; }
            daysDest = root.querySelector('[name="daysdest"]:checked')?.value || 'merge';
            planName = (root.querySelector('input[name="planName"]')?.value || '').trim() || `Plan de ${sender}`;
          }

          // Datos (sin rutinas: los días se gestionan en su sección)
          const chosen = new Set();
          const filtered = {};
          for (const s of DATA_SECTIONS) {
            const secChk = root.querySelector(`[data-sec="${s.key}"]`);
            if (!secChk || !secChk.checked) continue;
            const itemsBox = root.querySelector(`[data-items="${s.key}"]`);
            let sel;
            if (itemsBox) { const ids = new Set([...root.querySelectorAll(`[data-item="${s.key}"]:checked`)].map(c => c.dataset.id)); sel = (counts[s.key] || []).filter(it => ids.has(String(it.id))); }
            else sel = (counts[s.key] || []);
            if (sel.length) { filtered[s.key] = sel; chosen.add(s.key); }
          }

          if (!wantDays && !chosen.size) { UI.toast('Marca al menos algo que importar', 'err'); return false; }

          if (newGuest) {
            const name = (root.querySelector('input[name="guestName"]').value || '').trim();
            if (!name) { UI.toast('Escribe el nombre del invitado', 'err'); return false; }
            const color = root.querySelector('input[name="guestColor"]').value;
            const g = await DB.createUser({ name, color, isGuest: true });
            targetIds.push(g.id);
          }

          const policy = targetIds.length > 1 ? 'duplicate' : (root.querySelector('select[name="policy"]')?.value || 'duplicate');
          for (const tid of targetIds) {
            if (chosen.size) {
              const payload2 = { ...payload, data: { exercises: [], routines: [], sessions: [], progress: [], journal: [], ...filtered } };
              await applyImport(app, payload2, tid, policy, chosen);
            }
            if (wantDays) {
              if (daysDest === 'new') await createImportedPlan(tid, planRoutine, dayIds, planName, counts.exercises || []);
              else await mergeDaysIntoPlan(tid, planRoutine, dayIds, counts.exercises || []);
            }
          }

          await app.loadUsers();
          await app.refreshRoutine();
          app.render();
          UI.toast(`Importado a ${targetIds.length} perfil(es)`);
        }},
      ],
      onMount: (root) => {
        UI.bindColorPicker(root);
        const ng = root.querySelector('[data-newguest]');
        const gbox = root.querySelector('#newGuestBox');
        ng.addEventListener('change', () => { gbox.style.display = ng.checked ? '' : 'none'; });
        root.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
          const items = root.querySelector(`[data-items="${b.dataset.toggle}"]`);
          const open = items.style.display === 'none';
          items.style.display = open ? '' : 'none';
          b.textContent = open ? 'ocultar' : 'editar';
          if (open && b.dataset.toggle === 'days') { const c = root.querySelector('[data-sec="days"]'); if (c && !c.checked) c.checked = true; } // al editar días, activarlos
        }));
        root.querySelectorAll('[data-sec]').forEach(sc => sc.addEventListener('change', () => {
          root.querySelectorAll(`[data-item="${sc.dataset.sec}"]`).forEach(ic => { ic.checked = sc.checked; });
        }));
        const daysNewName = root.querySelector('#daysNewName');
        root.querySelectorAll('[name="daysdest"]').forEach(r => r.addEventListener('change', () => {
          if (daysNewName) daysNewName.style.display = (root.querySelector('[name="daysdest"]:checked').value === 'new') ? '' : 'none';
        }));
        const pol = root.querySelector('select[name="policy"]');
        const hint = root.querySelector('#policyHint');
        if (pol && hint) {
          const setHint = () => { hint.textContent = pol.value === 'duplicate'
            ? 'Se añade como entradas NUEVAS; nunca pisa lo que ya tienes (si lo tenías idéntico, se duplica).'
            : 'Actualiza en su sitio lo que coincida (mismo identificador); el resto se añade. Ideal para RESTAURAR tus propios datos.'; };
          pol.addEventListener('change', setHint); setHint();
        }
      },
    });
  }

  async function applyImport(app, payload, targetUserId, policy, sections) {
    const data = payload.data || {};
    const duplicate = policy === 'duplicate';
    const want = sections || new Set(['exercises', 'routines', 'sessions', 'progress', 'journal']);
    let exMap = {}; // idOrigen -> idLocal (para reescribir referencias)

    // 1) Ejercicios — SIEMPRE se emparejan por NOMBRE con el catálogo, así que
    //    nunca se duplican: si ya tienes ese ejercicio (aunque con otro id) se
    //    reutiliza; solo se crean los que te falten. (El progreso va por nombre.)
    if (want.has('exercises')) {
      exMap = await mapExercisesToCatalog(targetUserId, data.exercises || [], { overwrite: !duplicate });
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
    for (const n of (data.nutrition || [])) {   // pauta de alimentación
      try { await DB.saveNutrition({ ...n, id: duplicate ? DB.uid('nut') : n.id, userId: targetUserId }); } catch (e) {}
    }
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
  // Con opts.overwrite, además ACTUALIZA los existentes con los datos importados
  // (grupo, tipo, métricas y suplentes) — para la política "Reemplazar".
  async function mapExercisesToCatalog(userId, importedExercises, opts = {}) {
    const overwrite = !!opts.overwrite;
    const local = await DB.exercisesOf(userId);
    const byName = new Map(local.map(e => [e.name.trim().toLowerCase(), e]));
    const idMap = {};
    const created = [], updated = [];
    for (const ie of (importedExercises || [])) {
      const key = (ie.name || '').trim().toLowerCase();
      let ex = byName.get(key);
      if (!ex) {
        ex = { id: DB.uid('ex'), userId, name: (ie.name || '').trim(), muscleGroup: ie.muscleGroup || 'General', type: ie.type || 'weight', substitutes: [], createdAt: Date.now() };
        if (Array.isArray(ie.metrics)) ex.metrics = ie.metrics.slice(); // conservar datos a registrar (tiempo)
        if (ie.videoUrl) ex.videoUrl = ie.videoUrl;   // vídeo "cómo se hace"
        if (ie.howto) ex.howto = ie.howto;             // notas de técnica
        await DB.put('exercises', ex); byName.set(key, ex); created.push({ ex, srcSubs: ie.substitutes || [] });
      } else if (overwrite) {
        // reemplazar: vuelca los datos importados en tu ejercicio (mantiene id y createdAt)
        if (ie.videoUrl) ex.videoUrl = ie.videoUrl;
        if (ie.howto) ex.howto = ie.howto;
        if (ie.muscleGroup) ex.muscleGroup = ie.muscleGroup;
        if (ie.type) ex.type = ie.type;
        if (Array.isArray(ie.metrics)) ex.metrics = ie.metrics.slice();
        else if (ie.type && ie.type !== 'time') delete ex.metrics; // un no-cardio no lleva métricas
        updated.push({ ex, srcSubs: ie.substitutes || [] });
      }
      // Enriquecer SIN pisar: si el ejercicio ya existía y no tenía vídeo/técnica, se rellenan.
      if (!overwrite && !created.some(c => c.ex.id === ex.id)) {
        let touched = false;
        if (ie.videoUrl && !ex.videoUrl) { ex.videoUrl = ie.videoUrl; touched = true; }
        if (ie.howto && !ex.howto) { ex.howto = ie.howto; touched = true; }
        if (touched) await DB.put('exercises', ex);
      }
      idMap[ie.id] = ex.id;
    }
    // 2º pase: remapea suplentes ya con el idMap completo.
    for (const { ex, srcSubs } of created) {
      const subs = srcSubs.map(sid => idMap[sid]).filter(Boolean);
      if (subs.length) { ex.substitutes = subs; await DB.put('exercises', ex); }
    }
    for (const { ex, srcSubs } of updated) {
      const subs = srcSubs.map(sid => idMap[sid]).filter(Boolean);
      if (subs.length) ex.substitutes = subs; // si el import no trae suplentes, conserva los tuyos
      await DB.put('exercises', ex);
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

  return { render, bind, openMenu, exportDay, importDay, exportNutrition, exportSession, exportProgressEntry, routeImport, checkBackupReminder, backupProfile };
})();
