// ============================================================
// VISTA: Datos — exportación / importación granular (JSON)
// ============================================================

const VData = (() => {

  const FORMAT = 'traindia-export';   // formato actual de los export
  const OLD_FORMAT = 'cnp-export';    // formato anterior: se sigue ACEPTANDO al importar (copias viejas)
  const isExportFormat = (f) => f === FORMAT || f === OLD_FORMAT;

  // ---- recolección de datos ----
  // Documentos (PDFs, fotos) dentro del JSON: el binario va en base64.
  function bufToB64(buf) {
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToBuf(b64) {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  async function filesForExport(userId) {
    let list = [];
    try { list = await DB.filesOf(userId); } catch (e) { return []; }
    const out = [];
    for (const f of list) {
      try {
        const buf = f.data instanceof Blob ? await f.data.arrayBuffer() : f.data;
        if (!buf) continue;
        out.push({ id: f.id, name: f.name, type: f.type || '', size: f.size || buf.byteLength, addedAt: f.addedAt || Date.now(), b64: bufToB64(buf) });
      } catch (e) {}
    }
    return out;
  }

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
        nutrition: await DB.nutritionOf(userId),
        files: await filesForExport(userId),
        places: await DB.getPlaces(),
      },
    };
  }

  // Paquete para «Compartir mi progreso» (enlace): lo elegido + los ejercicios que
  // hacen falta para entenderlo (nombres, tipos). Sin documentos.
  async function gatherShare(app, want) {
    const u = app.mainUser, uid = u.id;
    const allEx = await DB.exercisesOf(uid);
    const data = { exercises: [], sessions: [], progress: [], routines: [], nutrition: [], places: [] };
    const ids = new Set();
    if (want.has('sessions')) {
      data.sessions = (await DB.sessionsOf(uid)).filter(s => !s.draft);
      data.sessions.forEach(s => (s.entries || []).forEach(e => e.exerciseId && ids.add(e.exerciseId)));
    }
    if (want.has('progress')) data.progress = await DB.progressOf(uid);
    if (want.has('plan') && app.routine) {
      data.routines = [JSON.parse(JSON.stringify(app.routine))];
      exercisesForDays(allEx, app.routine.days).forEach(e => ids.add(e.id));
      data.places = await placesForDays(app.routine.days);
    }
    if (want.has('nutrition')) data.nutrition = await DB.nutritionOf(uid);
    data.exercises = allEx.filter(e => ids.has(e.id) || data.sessions.some(s => (s.entries || []).some(x => !x.exerciseId && (x.name || '').trim().toLowerCase() === e.name.trim().toLowerCase())));
    return { format: FORMAT, version: 2, kind: 'profile', exportedAt: new Date().toISOString(), user: { name: u.name, color: u.color }, data };
  }
  // Lo que llega por enlace, al perfil invitado: «reemplazar lo que coincida», así
  // un segundo enlace del mismo amigo actualiza sus datos en vez de duplicarlos.
  async function importShared(app, payload, guestId) {
    const d = payload.data || {};
    const sections = new Set(['exercises', ...['sessions', 'progress', 'routines', 'nutrition'].filter(k => (d[k] || []).length)]);
    await applyImport(app, payload, guestId, 'overwrite', sections);
    if ((d.routines || []).length) await importPlaces(d.places, d.routines.flatMap(r => r.days || []));
  }

  function exercisesByIds(allExercises, ids) {
    const set = new Set(ids.filter(Boolean));
    return allExercises.filter(e => set.has(e.id));
  }
  // Ejercicios que usan unos días + sus suplentes (y los suplentes de esos, etc.),
  // para que al importar no falte ninguno. Van completos: vídeos, técnica, métricas…
  function exercisesForDays(allExercises, days) {
    const byId = Object.fromEntries(allExercises.map(e => [e.id, e]));
    const ids = new Set();
    const add = (id) => {
      if (!id || ids.has(id) || !byId[id]) return;
      ids.add(id);
      (byId[id].substitutes || []).forEach(add);
    };
    (days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(x => add(x.exerciseId))));
    return allExercises.filter(e => ids.has(e.id));
  }
  // Lugares que usan unos días, con su marca de "especial" (de la lista de lugares).
  async function placesForDays(days) {
    const known = await DB.getPlaces();
    const out = new Map();
    (days || []).forEach(d => {
      const name = (d.place || '').trim();
      if (!name || out.has(name.toLowerCase())) return;
      const k = known.find(p => (p.name || '').trim().toLowerCase() === name.toLowerCase());
      out.set(name.toLowerCase(), { name, special: k ? !!k.special : !!d.placeAccent });
    });
    return [...out.values()];
  }
  // Al importar: añade a tu lista los lugares del archivo que no tengas (por nombre).
  // Archivos antiguos no traen `places`: se sacan de los días.
  async function importPlaces(places, days) {
    const incoming = [...(places || [])];
    (days || []).forEach(d => { const n = (d.place || '').trim(); if (n) incoming.push({ name: n, special: !!d.placeAccent }); });
    if (!incoming.length) return;
    const list = await DB.getPlaces();
    let changed = false;
    incoming.forEach(p => {
      const n = (p.name || '').trim();
      if (!n || n === '— libre —' || list.some(x => (x.name || '').trim().toLowerCase() === n.toLowerCase())) return;
      list.push({ name: n, special: !!p.special }); changed = true;
    });
    if (changed) await DB.savePlaces(list);
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
    const [sessions, progress, nutrition] = await Promise.all([
      DB.sessionsOf(app.mainUser.id), DB.progressOf(app.mainUser.id), DB.nutritionOf(app.mainUser.id),
    ]);
    const stamps = [...sessions.filter(x => !x.draft), ...progress, ...nutrition].map(x => x.createdAt || 0).filter(Boolean);
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
  const modRow = (act, icon, color, title, sub) =>
    `<button class="big-row" data-act="${act}"><span class="big-row-icon tile" style="background:${color}">${UI.icon(icon, 18)}</span><span class="big-row-text"><strong>${title}</strong><span class="dim">${sub}</span></span><span class="chev">›</span></button>`;

  // "Compartir": modal (hoja inferior) con dos tarjetas → Exportar / Importar.
  function openShare(app) {
    UI.modal({
      title: 'Compartir',
      bodyHTML: `<div class="share-grid">
          <button class="share-card share-card-wide" data-act="friend"><span class="share-card-ic" style="background:var(--light)">${UI.icon('users', 26)}</span><span class="share-card-txt"><strong>Con amigos</strong><span class="dim">Un enlace con tu progreso, tu plan o tu nutrición, para uno o para un grupo</span></span></button>
          <button class="share-card" data-act="export"><span class="share-card-ic" style="background:var(--strong)">${UI.icon('upload', 26)}</span><strong>Exportar</strong><span class="dim">Tu copia completa o partes sueltas</span></button>
          <button class="share-card" data-act="import"><span class="share-card-ic" style="background:var(--light)">${UI.icon('swap', 26)}</span><strong>Importar</strong><span class="dim">Un archivo, un JSON o el enlace de un amigo</span></button>
        </div>
        <button class="btn ghost block share-paste" data-act="paste">${UI.icon('link', 16)} Pegar el enlace de un amigo</button>
        <p class="field-hint">Con amigos va por enlace (cifrado, dura 48 horas). Exportar e importar usan archivos: tu copia completa o partes sueltas.</p>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        root.querySelector('[data-act="export"]').addEventListener('click', () => { UI.closeModal(); openExport(app); });
        root.querySelector('[data-act="import"]').addEventListener('click', () => { UI.closeModal(); startImport(app); });
        root.querySelector('[data-act="friend"]').addEventListener('click', () => { UI.closeModal(); VShare.start(app); });
        root.querySelector('[data-act="paste"]').addEventListener('click', async () => { if (await VShare.pasteAndOpen(app)) UI.closeModal(root); });
      },
    });
  }

  // "Exportar": modal con la copia completa (protagonista) + cada parte.
  function openExport(app) {
    UI.modal({
      title: 'Exportar',
      bodyHTML: `<button class="share-hero" data-act="profile">
          <span class="share-hero-icon">${UI.icon('upload', 26)}</span>
          <span class="share-hero-txt"><strong>Copia completa</strong><span>TODO tu perfil en un archivo: ejercicios, plan, sesiones, progreso y nutrición.</span></span>
        </button>
        <div class="card-label" style="margin-top:18px">Exportar algo concreto</div>
        ${modRow('plan', 'calendar', 'var(--moderate)', 'Plan de la semana', 'Tu rutina activa completa')}
        ${modRow('day', 'calendar', 'var(--moderate)', 'Un día concreto', 'Comparte un solo día con un compañero')}
        ${modRow('sessions', 'activity', 'var(--light)', 'Sesiones', 'Todas, por fechas o sueltas')}
        ${modRow('progress', 'activity', 'var(--strong)', 'Progreso', 'Peso corporal y medidas')}
        ${modRow('nutrition', 'book', 'var(--sub-accent)', 'Nutrición', 'Tu pauta de alimentación en uso')}
        ${modRow('routines', 'repeat', 'var(--rest)', 'Rutinas', 'Uno o varios planes concretos')}`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const go = (fn) => { UI.closeModal(); fn(); };
        root.querySelector('[data-act="profile"]').addEventListener('click', () => go(() => backupProfile(app)));
        root.querySelector('[data-act="plan"]').addEventListener('click', () => go(() => exportPlan(app)));
        root.querySelector('[data-act="day"]').addEventListener('click', () => go(() => exportDay(app)));
        root.querySelector('[data-act="sessions"]').addEventListener('click', () => go(() => exportSessions(app)));
        root.querySelector('[data-act="progress"]').addEventListener('click', () => go(() => exportProgress(app)));
        root.querySelector('[data-act="nutrition"]').addEventListener('click', () => go(async () => {
          const plan = await DB.primaryNutritionOf(app.mainUser.id);
          if (!plan) { UI.toast('No tienes ninguna pauta de nutrición', 'err'); return; }
          exportNutrition(app, plan);
        }));
        root.querySelector('[data-act="routines"]').addEventListener('click', () => go(() => exportRoutines(app)));
      },
    });
  }

  // ---- Importar: pegar texto JSON o elegir archivo ----
  function startImport(app) {
    UI.modal({
      title: 'Importar datos', size: 'wide',
      bodyHTML: `
        <p class="field-hint" style="margin-top:0">Pega aquí <strong>el enlace que te han pasado</strong> o elige el archivo. Truco: en WhatsApp o en Archivos, mantén pulsado el archivo → <strong>Compartir</strong> → <strong>Traindía</strong> y se abre solo.</p>
        <textarea class="inp" id="impText" rows="5" placeholder="Pega aquí el enlace (o el texto del archivo)"></textarea>
        <button class="btn ghost block" id="impFileBtn" style="margin-top:8px">${UI.icon('upload', 15)} …o elegir un archivo</button>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Continuar', kind: 'primary', onClick: (root) => {
          const txt = (root.querySelector('#impText').value || '').trim();
          if (!txt) { UI.toast('Pega el JSON o elige un archivo', 'err'); return false; }
          if (typeof VShare !== 'undefined' && VShare.parseLink(txt)) { VShare.open(app, txt); return; } // enlace de «Compartir mi progreso»
          let parsed;
          try { parsed = JSON.parse(txt); } catch (e) { parsed = null; }
          if (!parsed || !isExportFormat(parsed.format) || !parsed.data) {
            // ¿La respuesta de la IA con un plan? (otro formato, con texto alrededor o cortada)
            const ia = typeof VPlanAI !== 'undefined' ? VPlanAI.leer(txt) : null;
            if (ia) { VPlanAI.preview(app, ia.payload, ia); return; }
            UI.toast(parsed ? 'No es un export de Traindía' : 'El texto no es un JSON válido', 'err'); return false;
          }
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
        UI.autoFocus(root.querySelector('#impText')); // en móvil no: el teclado tapaba el botón de elegir archivo
      },
    });
  }

  // ---- Alta: «¿Ya usabas Traindía?» → recupera la copia completa en un perfil nuevo ----
  // Se crea el perfil con el nombre y el color de la copia y entra todo (no hay nada
  // con lo que chocar: el perfil está vacío). Después, onDone(user) termina el alta.
  function restoreOnboarding(app, onDone) {
    const inp = document.createElement('input');
    inp.type = 'file'; // sin 'accept': en Android los .json de WhatsApp llegan como octet-stream
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        let p = null;
        try { p = JSON.parse(reader.result); } catch (e) {}
        if (!p || !isExportFormat(p.format) || !p.data) { UI.toast('Ese archivo no es una copia de Traindía', 'err'); return; }
        if (p.kind !== 'profile' || !(p.data.routines || []).length && !(p.data.sessions || []).length) {
          UI.toast('Ese archivo no es una copia completa. Crea tu perfil y luego impórtalo desde Compartir → Importar.', 'err'); return;
        }
        const d = p.data, n = (k) => (d[k] || []).length;
        const partes = [[n('routines'), 'plan', 'planes'], [n('sessions'), 'sesión', 'sesiones'], [n('progress'), 'registro de progreso', 'registros de progreso'], [n('nutrition'), 'pauta', 'pautas'], [n('files'), 'documento', 'documentos']]
          .filter(([x]) => x).map(([x, a, b]) => `${x} ${x === 1 ? a : b}`);
        const cuando = p.exportedAt ? new Date(p.exportedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        UI.modal({
          title: 'Recuperar tu copia',
          bodyHTML: `<p class="modal-text">Copia de <strong>${UI.esc(p.user?.name || 'Traindía')}</strong>${cuando ? ` del ${UI.esc(cuando)}` : ''}.</p>
            <div class="mg-sum"><div class="mg-row add"><span class="mg-ic">${UI.icon('upload', 16)}</span><div><strong>Se recupera</strong><span>${UI.esc(partes.join(' · '))}</span></div></div></div>
            <p class="field-hint">Tu perfil se crea con este nombre; lo puedes cambiar en Ajustes.</p>`,
          actions: [
            { label: 'Cancelar', kind: 'ghost' },
            { label: 'Recuperar', kind: 'primary', onClick: async () => {
              const user = await DB.createUser({ name: p.user?.name || 'Yo', color: p.user?.color || UI.COLORS[0], isMain: true });
              const rts = d.routines || [];
              const activo = rts.find(r => r.isPrimary) || rts[0] || null;
              const sections = new Set(['exercises', 'sessions', 'progress', 'nutrition', 'files'].filter(k => n(k)));
              const A = await VMerge.analyze(user.id, { sections, data: d, plans: rts, fileActive: activo, days: null, allExercises: d.exercises || [] });
              await VMerge.apply(A);
              await importPlaces(d.places, rts.flatMap(r => r.days || []));
              await onDone(user);
            } },
          ],
        });
      };
      reader.readAsText(f);
    });
    inp.click();
  }

  function routeImport(app, payload) {
    if (payload && !isExportFormat(payload.format) && typeof VPlanAI !== 'undefined' && VPlanAI.esPlan(payload)) { VPlanAI.preview(app, payload); return; } // plan de la IA en su formato
    if (!payload || !isExportFormat(payload.format) || !payload.data) { UI.toast('No es un export de Traindía', 'err'); return; }
    if (payload.kind === 'plan-ia' && typeof VPlanAI !== 'undefined') VPlanAI.preview(app, payload); // plan de entreno hecho por una IA
    else if (payload.kind === 'nutrition' && payload.data.plan) importNutrition(app, payload);
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
  // El plan activo es del perfil ACTIVO (puede ser un invitado): su catálogo y su nombre.
  function routineOwner(app, routine) {
    return (routine && routine.userId && app.userById(routine.userId)) || app.activeUser || app.mainUser;
  }
  async function doExportPlan(app, routine) {
    const owner = routineOwner(app, routine);
    const allEx = await DB.exercisesOf(owner.id);
    download({
      format: FORMAT, version: 2, kind: 'plan', exportedAt: new Date().toISOString(),
      user: { name: owner.name, color: owner.color },
      data: { routine, exercises: exercisesForDays(allEx, routine.days), places: await placesForDays(routine.days) },
    }, `traindia-plan-${stamp()}.json`);
    UI.toast('Plan exportado');
  }

  // Crea un plan NUEVO (no activo) en el perfil destino, con los días elegidos y
  // sus ejercicios remapeados al catálogo del destino. Reutilizado por importPlan
  // y por la importación de perfil completo.
  // opts.links: { idDelArchivo: idDeTuEjercicio } decididos al revisar los ejercicios.
  async function createImportedPlan(targetUserId, routine, dayIds, name, exercises, opts = {}) {
    const idMap = await mapExercisesToCatalog(targetUserId, exercises || [], { links: opts.links });
    const mine = new Map((await DB.exercisesOf(targetUserId)).map(e => [e.id, e]));
    const newDays = JSON.parse(JSON.stringify((routine.days || []).filter(d => dayIds.has(d.id))));
    newDays.forEach(d => {
      d.id = DB.uid('day'); // id propio para el nuevo plan
      (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => {
        if (e.exerciseId && idMap[e.exerciseId]) e.exerciseId = idMap[e.exerciseId];
        const ex = mine.get(e.exerciseId); if (ex) { e.name = ex.name; e.type = ex.type; } // con el nombre y tipo de tu ejercicio
      }));
    });
    const { id: _i, userId: _u, isPrimary: _p, days: _d, ...rest } = routine; // resto de datos del plan, tal cual
    const rec = { ...rest, id: DB.uid('rt'), userId: targetUserId, planType: routine.planType === 'template' ? 'template' : 'custom', name, days: newDays, order: Date.now(), createdAt: Date.now(), isPrimary: false };
    await DB.put('routines', rec);
    return rec;
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
        { label: 'Revisar ejercicios', kind: 'primary', onClick: (root) => {
          const chosen = new Set([...root.querySelectorAll('[data-day]:checked')].map(c => c.dataset.day));
          if (!chosen.size) { UI.toast('Marca al menos un día', 'err'); return false; }
          const name = root.querySelector('input[name="planName"]').value.trim() || `Plan de ${sender}`;
          const days = (routine.days || []).filter(d => chosen.has(d.id));
          const exercises = VReview.deLosDias(days, payload.data.exercises);
          // con cuál de tus ejercicios va cada uno de los suyos (y así no se duplican)
          setTimeout(() => VReview.importar(app, { userId: app.mainUser.id, routine: { days }, exercises, from: sender, finalLabel: 'Añadir plan',
            onBack: () => importPlan(app, payload),
            onConfirm: async (links) => {
              const prev = app.routine;
              const rt = await createImportedPlan(app.mainUser.id, routine, chosen, name, exercises, { links });
              await importPlaces(payload.data.places, days);
              // Si tu plan activo está en blanco (el del alta, sin un solo ejercicio), el nuevo
              // pasa a ser el activo y el vacío sobra.
              const vacio = prev && prev.userId === app.mainUser.id && !(prev.days || []).some(d => (d.blocks || []).some(b => (b.exercises || []).length));
              if (vacio) { await DB.setActivePlan(app.mainUser.id, rt.id); try { await DB.deletePlan(prev.id); } catch (e) {} }
              await app.refreshRoutine();
              app.render();
              if (payload.onDone) payload.onDone();
              UI.toast(vacio ? `«${rt.name}» es ahora tu plan` : 'Plan añadido · actívalo en "El plan"');
            } }), 50);
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
      data: { exercises: exercisesByIds(allEx, refIds), routines: [], sessions, progress: [] },
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
      data: { exercises: [], routines: [], sessions: [], progress: entries },
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
          const allDays = selected.flatMap(r => r.days || []);
          download({
            format: FORMAT, version: 2, kind: 'routines', exportedAt: new Date().toISOString(),
            user: { name: app.mainUser.name, color: app.mainUser.color },
            data: { exercises: exercisesForDays(allEx, allDays), routines: selected, sessions: [], progress: [], places: await placesForDays(allDays) },
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
    if (key === 'nutrition') return UI.esc(it.nombre || 'Pauta');
    if (key === 'files') return `${UI.esc(it.name || 'Documento')} <span class="dim">· ${Math.max(1, Math.round((it.size || 0) / 1024))} KB</span>`;
    return UI.esc(String(it.id));
  }

  async function importFlow(app, payload) {
    const users = await DB.getUsers();
    const counts = payload.data;
    const sender = payload.user?.name || 'desconocido';
    const routines = counts.routines || [];
    const planRoutine = routines.find(r => r.isPrimary) || routines[0] || null; // el plan del archivo
    const hasPlan = !!planRoutine;
    // El resto de planes del archivo (una copia completa puede traer varios): se
    // añaden como planes aparte, sin activar. Marcados por defecto: que no se pierdan.
    const otherPlans = routines.filter(r => r !== planRoutine);
    const DATA_SECTIONS = [
      { key: 'exercises', label: 'Ejercicios' },
      { key: 'sessions', label: 'Sesiones' },
      { key: 'progress', label: 'Progreso' },
      { key: 'nutrition', label: 'Nutrición' },
      { key: 'files', label: 'Documentos' },
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
    // «Planes»: todos los del archivo (el activo, marcado). Los que no tengas se añaden sin
    // activarlos; si tu plan activo está vacío, pasa a ser el activo del archivo.
    const filePlans = planRoutine ? [planRoutine, ...otherPlans] : [];
    const plansSection = filePlans.length ? `<div class="imp-sec">
      <label class="check-row imp-sec-head"><input type="checkbox" data-sec="plans" checked><span>Planes <span class="dim">(${filePlans.length})</span></span>${filePlans.length > 1 ? '<button type="button" class="imp-toggle" data-toggle="plans">editar</button>' : ''}</label>
      ${filePlans.length > 1 ? `<div class="imp-items" data-items="plans" style="display:none">${filePlans.map(r => `<label class="check-row sub"><input type="checkbox" data-item="plans" data-id="${UI.esc(String(r.id))}" checked><span>${UI.esc(r.name || 'Plan')} <span class="dim">· ${(r.days || []).length} días${r === planRoutine ? ' · el activo' : ''}</span></span></label>`).join('')}</div>` : ''}
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
          <p class="field-hint" style="margin-top:0;margin-bottom:8px">Marca lo que quieras. Antes de importar verás qué se añade, qué ya tienes y qué es distinto. Nada se duplica y nada tuyo cambia sin que lo elijas.</p>
          <div style="margin-bottom:4px">
            ${plansSection}${DATA_SECTIONS.map(sectionHTML).join('')}
            ${(!hasPlan && !hasData) ? '<p class="dim" style="padding:2px">El archivo no tiene datos.</p>' : ''}
          </div>
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Revisar', kind: 'primary', onClick: async (root) => {
          const targetIds = [...root.querySelectorAll('[data-user]:checked')].map(c => c.dataset.user);
          const newGuest = root.querySelector('[data-newguest]').checked;
          if (!targetIds.length && !newGuest) { UI.toast('Elige al menos un perfil', 'err'); return false; }

          // Planes
          let plans = [];
          const plChk = root.querySelector('[data-sec="plans"]');
          if (plChk && plChk.checked) {
            const box = root.querySelector('[data-items="plans"]');
            if (box) { const ids = new Set([...root.querySelectorAll('[data-item="plans"]:checked')].map(c => c.dataset.id)); plans = filePlans.filter(r => ids.has(String(r.id))); }
            else plans = filePlans;
          }
          const days = null; // (los días sueltos se pasan con «Exportar un día»)
          // Datos
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
          if (!plans.length && !days && !chosen.size) { UI.toast('Marca al menos algo que importar', 'err'); return false; }

          let guestName = '', guestColor = '';
          if (newGuest) {
            guestName = (root.querySelector('input[name="guestName"]').value || '').trim();
            if (!guestName) { UI.toast('Escribe el nombre del invitado', 'err'); return false; }
            guestColor = root.querySelector('input[name="guestColor"]').value;
          }

          // Revisión por perfil (el invitado nuevo se revisa vacío y se crea solo si confirmas)
          const want = { sections: chosen, data: filtered, plans, fileActive: plans.includes(planRoutine) ? planRoutine : null, days, allExercises: counts.exercises || [] };
          const destinos = [...targetIds.map(id => ({ id, name: (users.find(u => u.id === id) || {}).name })), ...(newGuest ? [{ id: null, name: guestName }] : [])];
          const listos = [];
          for (const d of destinos) {
            const A = await VMerge.analyze(d.id, want);
            const r = await VMerge.review(app, A, { who: destinos.length > 1 || !d.id ? d.name : '' });
            if (r === 'back') return false;          // vuelve a esta pantalla, con lo que habías marcado
            if (r !== 'ok') return;                  // cancelado: no se toca nada
            if (VMerge.hayAlgo(A)) listos.push({ d, A });
          }
          if (!listos.length) return;
          let añadidos = 0, cambiados = 0;
          for (const { d, A } of listos) {
            if (!d.id) { const g = await DB.createUser({ name: guestName, color: guestColor, isGuest: true }); A.uid = g.id; }
            const r = await VMerge.apply(A);
            añadidos += r.añadidos; cambiados += r.cambiados;
          }
          if (plans.length || days) {
            const usedDays = [...plans.flatMap(r => r.days || []), ...(days ? (planRoutine.days || []).filter(x => days.dayIds.has(x.id)) : [])];
            await importPlaces(counts.places, usedDays);
          }
          await app.loadUsers();
          await app.refreshRoutine();
          app.render();
          const partes = [añadidos ? `${añadidos} añadido${añadidos === 1 ? '' : 's'}` : '', cambiados ? `${cambiados} actualizado${cambiados === 1 ? '' : 's'}` : ''].filter(Boolean);
          UI.toast(`Importado${partes.length ? ' · ' + partes.join(' · ') : ''}${listos.length > 1 ? ` en ${listos.length} perfiles` : ''}`);
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
        }));
        root.querySelectorAll('[data-sec]').forEach(sc => sc.addEventListener('change', () => {
          root.querySelectorAll(`[data-item="${sc.dataset.sec}"]`).forEach(ic => { ic.checked = sc.checked; });
        }));
      },
    });
  }

  // Solo para lo que llega por enlace al perfil invitado de ese amigo (su «espejo»):
  // se actualiza en su sitio lo que coincida. Las importaciones a mano van por VMerge.
  async function applyImport(app, payload, targetUserId, policy, sections) {
    const data = payload.data || {};
    const duplicate = policy === 'duplicate';
    const want = sections || new Set(['exercises', 'routines', 'sessions', 'progress', 'nutrition', 'files']);
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

    // 5) Nutrición (pauta de alimentación)
    if (want.has('nutrition')) for (const n of (data.nutrition || [])) {
      try { await DB.saveNutrition({ ...n, id: duplicate ? DB.uid('nut') : n.id, userId: targetUserId }); } catch (e) {}
    }

    // 6) Documentos. Como copia nueva no se repite uno que ya tengas (mismo nombre y tamaño),
    //    así restaurar tu propia copia no los duplica.
    if (want.has('files') && (data.files || []).length) {
      let mine = [];
      try { mine = await DB.filesOf(targetUserId); } catch (e) {}
      for (const f of data.files) {
        if (!f || !f.b64) continue;
        try {
          if (duplicate && mine.some(m => m.name === f.name && (m.size || 0) === (f.size || 0))) continue;
          await DB.put('files', { id: duplicate ? DB.uid('file') : f.id, userId: targetUserId, name: f.name, type: f.type || '', size: f.size || 0, addedAt: f.addedAt || Date.now(), data: b64ToBuf(f.b64) });
        } catch (e) { console.error('importar documento', e); }
      }
    }
  }

  // ---------- EXPORTAR UN DÍA ----------
  async function doExportDay(app, day) {
    const owner = routineOwner(app, app.routine);
    const allEx = await DB.exercisesOf(owner.id);
    download({
      format: FORMAT, version: 2, kind: 'day', exportedAt: new Date().toISOString(),
      user: { name: owner.name, color: owner.color },
      data: { day: JSON.parse(JSON.stringify(day)), exercises: exercisesForDays(allEx, [day]), places: await placesForDays([day]) },
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
    const links = opts.links || {}; // enlaces elegidos a mano (revisión de ejercicios): mandan sobre el nombre
    const local = await DB.exercisesOf(userId);
    const byName = new Map(local.map(e => [e.name.trim().toLowerCase(), e]));
    const byId = new Map(local.map(e => [e.id, e]));
    const idMap = {};
    const created = [], updated = [], enriched = [];
    // Campos que son de ESTE catálogo y no se copian del archivo; todo lo demás
    // (vídeos, técnica, métricas y cualquier campo futuro) viaja tal cual.
    const OWN = new Set(['id', 'userId', 'substitutes', 'createdAt', 'isDefault', 'defaultKey']); // (isDefault/defaultKey: marcas antiguas, no se copian)
    const payloadOf = (ie) => Object.fromEntries(Object.entries(ie).filter(([k, v]) => !OWN.has(k) && v !== undefined));
    for (const ie of (importedExercises || [])) {
      const key = (ie.name || '').trim().toLowerCase();
      if (!key) continue;
      let ex = (links[ie.id] && byId.get(links[ie.id])) || byName.get(key);
      const vids = DB.exVideos(ie); // vídeos "cómo se hace" (formato nuevo y el antiguo videoUrl)
      if (!ex) {
        ex = { ...payloadOf(ie), id: DB.uid('ex'), userId, name: (ie.name || '').trim(), muscleGroup: ie.muscleGroup || 'General', type: ie.type || 'weight', substitutes: [], createdAt: Date.now() };
        if (vids.length) { ex.videos = vids.map(v => ({ ...v })); ex.videoUrl = vids[0].url; }
        await DB.put('exercises', ex); byName.set(key, ex); created.push({ ex, srcSubs: ie.substitutes || [] });
      } else if (overwrite) {
        // reemplazar: vuelca los datos importados en tu ejercicio (mantiene id, nombre y createdAt)
        Object.assign(ex, payloadOf(ie), { name: ex.name });
        if (vids.length) { ex.videos = vids.map(v => ({ ...v })); ex.videoUrl = vids[0].url; }
        if (!Array.isArray(ie.metrics) && ie.type && ie.type !== 'time' && ie.type !== 'check') delete ex.metrics; // sin datos extra
        updated.push({ ex, srcSubs: ie.substitutes || [] });
      }
      // Enriquecer SIN pisar: añade los vídeos que no tengas (por URL) y la técnica si no había.
      if (!overwrite && !created.some(c => c.ex.id === ex.id)) {
        let touched = false;
        const mine = DB.exVideos(ex).map(v => ({ ...v }));
        const urls = new Set(mine.map(v => (v.url || '').trim()));
        vids.forEach(v => { if (!urls.has((v.url || '').trim())) { mine.push({ ...v }); urls.add((v.url || '').trim()); touched = true; } });
        if (touched) { ex.videos = mine; ex.videoUrl = mine[0].url; }
        if (ie.howto && !ex.howto) { ex.howto = ie.howto; touched = true; }
        if (touched) await DB.put('exercises', ex);
        if ((ie.substitutes || []).length) enriched.push({ ex, srcSubs: ie.substitutes });
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
    // Enriquecer sin pisar: añade los suplentes del archivo que no tengas (conserva los tuyos).
    for (const { ex, srcSubs } of enriched) {
      const mine = ex.substitutes || [];
      const extra = srcSubs.map(sid => idMap[sid]).filter(sid => sid && sid !== ex.id && !mine.includes(sid));
      if (extra.length) { ex.substitutes = [...mine, ...new Set(extra)]; await DB.put('exercises', ex); }
    }
    return idMap;
  }

  // ---------- IMPORTAR UN DÍA (revisar ejercicios → reemplazar / añadir diferente) ----------
  function importDay(app, payload) {
    const day = JSON.parse(JSON.stringify(payload.data.day));
    const exercises = VReview.deLosDias([day], payload.data.exercises);
    VReview.importar(app, { userId: app.mainUser.id, routine: { days: [day] }, exercises, from: payload.user?.name, finalLabel: 'Seguir',
      onConfirm: (links) => importDayWith(app, payload, day, exercises, links) });
  }
  async function importDayWith(app, payload, day, exercises, links) {
    const sender = payload.user?.name || 'desconocido';
    const idMap = await mapExercisesToCatalog(app.mainUser.id, exercises, { links });
    const mine = new Map((await DB.exercisesOf(app.mainUser.id)).map(e => [e.id, e]));
    const src = JSON.parse(JSON.stringify(day));
    (src.blocks || []).forEach(b => (b.exercises || []).forEach(e => {
      if (e.exerciseId && idMap[e.exerciseId]) e.exerciseId = idMap[e.exerciseId];
      const ex = mine.get(e.exerciseId); if (ex) { e.name = ex.name; e.type = ex.type; } // con el nombre y tipo de tu ejercicio
    }));

    const rt = app.routine;
    const target = rt.days.find(d => d.id === day.id) || rt.days.find(d => (d.name || '').toLowerCase() === (day.name || '').toLowerCase());
    const exCount = (src.blocks || []).reduce((n, b) => n + (b.exercises ? b.exercises.length : 0), 0);

    const persist = async (dayId) => { await DB.put('routines', rt); await importPlaces(payload.data.places, [day]); await app.refreshRoutine(); app.go('day', { dayId }, true); };

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

  return { openShare, openExport, startImport, restoreOnboarding, exportRoutine: doExportPlan, gatherShare, importShared, exportDay, importDay, exportNutrition, exportSession, exportProgressEntry, routeImport, checkBackupReminder, backupProfile , createImportedPlan };
})();
