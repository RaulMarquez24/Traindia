// ============================================================
// VISTAS: Plan semanal, día (con edición), guías, info, ejercicios
// ============================================================

const VPlan = (() => {

  const TYPE_LABELS = {
    strong: 'Día fuerte', moderate: 'Día moderado', light: 'Día ligero', rest: 'Descanso',
  };

  function saveRoutine(app) {
    return DB.put('routines', app.routine);
  }

  // Categorías establecidas = grupos musculares presentes en el catálogo.
  function categoriesFrom(catalog) {
    return [...new Set(catalog.map(e => e.muscleGroup || 'General'))].sort((a, b) => a.localeCompare(b));
  }

  // Nº de ejercicios del catálogo por categoría (para el selector).
  function catCounts(catalog) {
    const m = {};
    (catalog || []).forEach(e => { const g = e.muscleGroup || 'General'; m[g] = (m[g] || 0) + 1; });
    return m;
  }
  // Tono estable por nombre: cada categoría tiene siempre su color.
  function catHue(name) {
    let h = 0;
    for (const ch of UI.norm(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  // Selector de categoría: cuadrícula compacta con buscador que también crea.
  function pickCategory({ categories, used = [], onPick, current = '', counts = {} }) {
    const avail = categories.filter(c => !used.includes(c));
    const chip = (c) => `<button type="button" class="catp-chip${c === current ? ' on' : ''}" data-cat="${UI.esc(c)}" data-s="${UI.esc(UI.norm(c))}">
        <span class="catp-dot" style="--h:${catHue(c)}">${UI.esc((c.trim()[0] || '?').toUpperCase())}</span>
        <span class="catp-name">${UI.esc(c)}</span>
        ${c === current ? `<span class="catp-ok">${UI.icon('check', 14)}</span>` : (counts[c] ? `<span class="catp-n">${counts[c]}</span>` : '')}
      </button>`;
    let overlay;
    overlay = UI.modal({
      title: 'Categoría',
      bodyHTML: `<label class="cat-search catp-search">
          ${UI.icon('search', 16)}
          <input type="search" id="catpQ" placeholder="Buscar o crear categoría…" autocomplete="off" enterkeyhint="done" maxlength="30">
        </label>
        <button type="button" class="catp-new" id="catpNew" hidden></button>
        <div class="catp-grid" id="catpGrid">${avail.map(chip).join('')}</div>
        <p class="dim catp-empty" id="catpEmpty"${avail.length ? ' hidden' : ''}>${avail.length ? 'Ninguna coincide.' : 'Aún no hay categorías.'} Escribe arriba para crear una.</p>`,
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: (root) => {
        const q = root.querySelector('#catpQ');
        const btnNew = root.querySelector('#catpNew');
        const empty = root.querySelector('#catpEmpty');
        const pick = (c) => { UI.closeModal(overlay); onPick(c); };
        const filter = () => {
          const raw = q.value.trim(), s = UI.norm(raw);
          let shown = 0;
          root.querySelectorAll('.catp-chip').forEach(b => { const ok = !s || b.dataset.s.includes(s); b.hidden = !ok; if (ok) shown++; });
          const exact = raw && categories.some(c => UI.norm(c) === s);
          btnNew.hidden = !raw || exact;
          btnNew.innerHTML = `${UI.icon('plus', 16)} Crear «${UI.esc(raw)}»`;
          empty.hidden = shown > 0 || !!raw;
        };
        q.addEventListener('input', filter);
        q.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const raw = q.value.trim(); if (!raw) return;
          const exact = categories.find(c => UI.norm(c) === UI.norm(raw));
          const visibles = [...root.querySelectorAll('.catp-chip:not([hidden])')];
          pick(exact || (visibles.length === 1 ? visibles[0].dataset.cat : raw));
        });
        btnNew.addEventListener('click', () => { const raw = q.value.trim(); if (raw) pick(raw); });
        root.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => pick(b.dataset.cat)));
      },
    });
  }

  // Selector de lugar del día. Los lugares se crean aquí y se guardan para reusarlos;
  // el lápiz de cada uno lo renombra, lo marca como especial o lo borra (en todos los
  // días que lo usan). No hay otra pantalla de lugares.
  //   places: la lista (se modifica en sitio y se guarda) · current: el lugar del día
  //   onPick(p | null) al elegir (null = sin lugar) · onChange(viejo, nuevo | null) al editar/borrar
  function pickPlace({ app, places, current, onPick, onChange }) {
    let overlay;
    const listHTML = () => `<div class="menu-list">
        <button class="menu-row pk-place${!current ? ' on' : ''}" data-place-none="1"><span class="dim">Sin lugar</span>${!current ? UI.icon('check', 16) : ''}</button>
        ${places.map((p, i) => `<div class="pk-place-row">
          <button class="menu-row pk-place${p.name === current ? ' on' : ''}" data-place="${i}"><span>${UI.esc(p.name)}${p.special ? ' <span class="badge soon">especial</span>' : ''}</span>${p.name === current ? UI.icon('check', 16) : ''}</button>
          <button class="icon-btn" data-place-edit="${i}" aria-label="Editar ${UI.esc(p.name)}">${UI.icon('edit', 16)}</button>
        </div>`).join('')}
        <button class="menu-row" data-place-new="1"><span>${UI.icon('plus', 16)} Nueva ubicación…</span></button>
      </div>`;
    const form = (p) => `<div id="placeForm">
        ${UI.field('Nombre', UI.input('name', p ? p.name : '', { placeholder: 'Ej: Parque' }))}
        <label class="mini-check"><input type="checkbox" name="special"${p && p.special ? ' checked' : ''}> Lugar especial (se resalta en rojo)</label>
      </div>`;
    const readForm = (r2, skipIndex) => {
      const d = UI.readForm(r2.querySelector('#placeForm'));
      const name = (d.name || '').trim();
      if (!name) { UI.toast('Escribe un nombre', 'err'); return null; }
      if (places.some((x, i) => i !== skipIndex && x.name.toLowerCase() === name.toLowerCase())) { UI.toast('Ya existe esa ubicación', 'err'); return null; }
      return { name, special: !!d.special };
    };
    const bind = (root) => {
      const body = root.querySelector('.modal-body');
      const redraw = () => { body.innerHTML = listHTML(); bind(root); };
      body.querySelector('[data-place-none]').addEventListener('click', () => { UI.closeModal(overlay); onPick(null); });
      body.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => { UI.closeModal(overlay); onPick(places[+b.dataset.place]); }));
      body.querySelector('[data-place-new]').addEventListener('click', () => UI.modal({
        title: 'Nueva ubicación', bodyHTML: form(null),
        actions: [
          { label: 'Cancelar', kind: 'ghost' },
          { label: 'Crear', kind: 'primary', onClick: async (r2) => {
            const np = readForm(r2, -1); if (!np) return false;
            places.push(np); await DB.savePlaces(places);
            UI.closeModal(overlay); onPick(np);
          } },
        ],
      }));
      body.querySelectorAll('[data-place-edit]').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.placeEdit, old = places[i];
        UI.modal({
          title: 'Editar ubicación', bodyHTML: form(old),
          actions: [
            { label: 'Borrar', kind: 'ghost danger', onClick: async () => {
              const usos = await placeUsage(old.name);
              const ok = await UI.confirm({
                title: `¿Borrar ${old.name}?`,
                message: usos.length ? `Está puesto en ${usos.length} día${usos.length === 1 ? '' : 's'} (${usos.slice(0, 4).join(', ')}${usos.length > 4 ? '…' : ''}); se quitará de ${usos.length === 1 ? 'él' : 'ellos'}.` : 'No lo usa ningún día.',
                confirmLabel: 'Borrar', danger: true,
              });
              if (!ok) return false;
              places.splice(i, 1); await DB.savePlaces(places);
              await applyPlaceToDays(app, old.name, null);
              if (onChange) onChange(old.name, null);
              if (current === old.name) current = '';
              redraw(); UI.toast('Lugar borrado');
            } },
            { label: 'Cancelar', kind: 'ghost' },
            { label: 'Guardar', kind: 'primary', onClick: async (r2) => {
              const np = readForm(r2, i); if (!np) return false;
              places[i] = np; await DB.savePlaces(places);
              await applyPlaceToDays(app, old.name, np);
              if (onChange) onChange(old.name, np);
              if (current === old.name) current = np.name;
              redraw(); UI.toast('Lugar guardado');
            } },
          ],
        });
      }));
    };
    overlay = UI.modal({
      title: 'Lugar de entreno', bodyHTML: listHTML(),
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: bind,
    });
  }
  // Días (de todos los planes y perfiles) que usan un lugar, para avisar al borrarlo.
  async function placeUsage(name) {
    const out = [];
    (await DB.getAll('routines')).forEach(rt => (rt.days || []).forEach(d => { if ((d.place || '') === name) out.push(d.name); }));
    return out;
  }
  // Propaga un cambio de lugar a los días que lo usaban (renombrar / especial / borrar).
  // También en el plan en memoria: el editor del día lo guarda entero al terminar.
  async function applyPlaceToDays(app, oldName, np) {
    const fix = (rt) => {
      let changed = false;
      (rt.days || []).forEach(d => {
        if ((d.place || '') !== oldName) return;
        d.place = np ? np.name : ''; d.placeAccent = np ? !!np.special : false; changed = true;
      });
      return changed;
    };
    for (const rt of await DB.getAll('routines')) { if (fix(rt)) await DB.put('routines', rt); }
    if (app && app.routine) fix(app.routine);
  }

  // ---------- SEMANA ----------
  function week(app) {
    const r = app.routine;
    if (!r) return emptyRoutine();
    const days = r.days.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(d => {
      const placeClass = d.placeAccent ? 'parque' : '';
      const metaRight = d.isRest
        ? `<span class="day-place">${UI.esc(d.place || '')}</span>`
        : `<span class="day-place ${placeClass}">${UI.esc(d.place || '')}${d.duration ? `${d.place ? ' · ' : ''}<strong>${UI.esc(d.duration)}</strong>` : ''}</span>`;
      return `
        <a class="day-card ${d.type || 'untyped'}" data-link="day" data-params='${JSON.stringify({ dayId: d.id })}'>
          <div class="day-row-1">
            <span class="day-name">${UI.esc(d.name)}</span>
            ${d.type ? `<span class="day-tag tag-${d.type}">${UI.esc(d.typeLabel || TYPE_LABELS[d.type] || '')}</span>` : ''}
          </div>
          <div class="day-focus">${UI.esc(d.focus || '')}</div>
          <div class="day-meta">${metaRight}<span class="day-arrow">›</span></div>
        </a>`;
    }).join('');

    // Aviso de bienvenida: solo la primera vez (p. ej. si has puesto el nombre sin
    // leer la presentación). Se descarta al cerrarlo o al abrir la presentación.
    let welcome = '';
    try {
      if (localStorage.getItem('traindia-welcomed') !== '1') {
        welcome = `<div class="week-welcome" id="weekWelcome">
          <div class="ww-text"><strong>👋 ¿Primera vez por aquí?</strong><span>Mira en un momento qué puede hacer Traindía.</span></div>
          <div class="ww-actions">
            <button class="btn primary" data-ww-view>Ver presentación</button>
            <button class="ww-close" data-ww-close aria-label="Ahora no">✕</button>
          </div>
        </div>`;
      }
    } catch (e) {}

    // Plan sin ningún ejercicio (p. ej. recién creado en blanco): decir qué hacer.
    const planVacio = r.days.every(d => d.isRest || !(d.blocks || []).some(b => (b.exercises || []).length));
    const empty = planVacio ? `<div class="week-empty" id="weekEmpty">
        <strong>Tu plan está vacío</strong>
        <span>Toca cada día para añadirle ejercicios o marcarlo como descanso, o empieza con una plantilla ya montada.</span>
        <div class="week-empty-actions">
          <button class="btn primary" data-we-tpl>Usar una plantilla</button>
          <button class="btn ghost" data-we-free>Entrenar sin plan</button>
        </div>
      </div>` : '';

    return `${welcome}${empty}<div class="week-days">${days}</div>`;
  }

  function weekBind(app, root) {
    const we = root && root.querySelector('#weekEmpty');
    if (we) {
      we.querySelector('[data-we-tpl]').addEventListener('click', () => createPlanModal(app));
      we.querySelector('[data-we-free]').addEventListener('click', () => app.go('live', {}));
    }
    const ww = root && root.querySelector('#weekWelcome');
    if (ww) {
      // Ver la presentación NO descarta el aviso: sigue ahí hasta que se pulsa la ✕.
      ww.querySelector('[data-ww-view]').addEventListener('click', () => app.previewLanding());
      ww.querySelector('[data-ww-close]').addEventListener('click', () => {
        try { localStorage.setItem('traindia-welcomed', '1'); } catch (e) {}
        ww.remove();
      });
    }
  }

  // ---------- DÍA ----------
  async function day(app, params) {
    const d = (app.routine?.days || []).find(x => x.id === params.dayId);
    if (!d) return `<div class="empty-state"><p>Día no encontrado.</p></div>`;
    const byId = {};
    (await DB.exercisesOf(app.activeUser.id)).forEach(e => { byId[e.id] = e; });
    const subsLine = (ex) => {
      const ids = (ex.exerciseId && byId[ex.exerciseId] && byId[ex.exerciseId].substitutes) || [];
      const names = ids.map(id => byId[id] && byId[id].name).filter(Boolean);
      return names.length ? `<span class="ex-subs">${UI.icon('repeat', 12)} ${names.map(UI.esc).join(' · ')}</span>` : '';
    };

    if (d.isRest) {
      return `
        <div class="detail-hero">
          <span class="day-tag tag-${d.type}">${UI.esc(d.typeLabel || 'Descanso')}</span>
          <h2>${UI.esc(d.name)}</h2>
          <div class="focus">${UI.esc(d.focus || '')}</div>
        </div>
        <div class="rest-display">
          <span class="x">×</span>
          <div class="lead">Recuperación</div>
          <div class="small">Sin entreno</div>
        </div>
        <div class="detail-toolbar">
          <button class="btn ghost" data-act="edit-day">${UI.icon('edit', 16)} Editar día</button>
          <button class="btn ghost" data-act="swap-day">${UI.icon('swap', 16)} Intercambiar</button>
        </div>`;
    }

    const exCount = (d.blocks || []).reduce((n, b) => n + (b.exercises || []).length, 0);
    if (!exCount) {
      return `
        <div class="detail-hero">
          ${d.type ? `<span class="day-tag tag-${d.type}">${UI.esc(d.typeLabel || TYPE_LABELS[d.type] || '')}</span>` : ''}
          <h2>${UI.esc(d.name)}</h2>
          <div class="focus">${UI.esc(d.focus || '')}</div>
        </div>
        <div class="day-empty">
          <div class="day-empty-ic">${UI.icon('dumbbell', 26)}</div>
          <strong>¿Qué toca este día?</strong>
          <span>Si entrenas, añade los ejercicios una vez y Traindía te enseñará qué hiciste la última vez. Si no, márcalo como descanso.</span>
          <button class="btn primary block" data-act="add-first">${UI.icon('plus', 16)} Añadir ejercicios</button>
          <button class="btn ghost block" data-act="make-rest">Marcar como descanso</button>
        </div>
        <div class="detail-toolbar">
          <button class="btn ghost" data-act="swap-day">${UI.icon('swap', 16)} Intercambiar</button>
        </div>`;
    }

    const blocks = d.blocks.map((b, bi) => {
      const items = b.exercises.map(ex => {
        const nameCls = ex.priority ? 'ex-name priority' : 'ex-name';
        const optCls = ex.optional ? 'optional' : '';
        const sl = subsLine(ex);
        const det = ex.notes ? `<span class="ex-detail">${UI.esc(ex.notes)}</span>` : '';
        return `<li class="${optCls}"><span class="ex-line-main"><span class="${nameCls}">${UI.esc(ex.name)}${ex.label ? ` <span class="ex-variant">${UI.esc(ex.label)}</span>` : ''}</span>${det}${sl}</span><span class="ex-sets">${UI.esc(ex.sets || '')}</span></li>`;
      }).join('');
      const labelCls = b.optional ? 'block-label optional' : 'block-label';
      const labelText = b.optional ? `${UI.esc(b.label)} · si hay tiempo` : UI.esc(b.label);
      return `<div class="block"><div class="${labelCls}">${labelText}</div><ul class="ex-list">${items || '<li class="dim" style="padding:10px 14px">Sin ejercicios</li>'}</ul></div>`;
    }).join('');

    let substitutes = '';
    const planB = d.planB || [];
    if (planB.length) {
      const subItems = planB.map(s => `<li><span class="sub-orig">${UI.esc(s.orig)}</span><span class="arrow">→</span>${UI.esc(s.sub)}</li>`).join('');
      substitutes = `<div class="substitutes"><div class="substitutes-title">${UI.esc(d.substitutesTitle || 'Plan B')}</div><ul class="sub-list">${subItems}</ul></div>`;
    }

    let related = '';
    if (d.relatedGuides && d.relatedGuides.length && guideList(app).length) {
      const found = d.relatedGuides
        .map(gid => guideList(app).find(x => x.id === gid))
        .filter(Boolean); // ignora guías que ya no existen (p.ej. la eliminada)
      if (found.length) {
        const links = found.map(g => `<a class="guide-link" data-link="guide" data-params='${JSON.stringify({ guideId: g.id })}'><span>${UI.esc(g.title)}</span><span class="guide-link-arrow">›</span></a>`).join('');
        related = `<div class="related-guides"><div class="block-label">Guías relacionadas</div>${links}</div>`;
      }
    }

    const placeClass = d.placeAccent ? 'parque' : '';
    return `
      <div class="detail-hero">
        ${d.type ? `<span class="day-tag tag-${d.type}">${UI.esc(d.typeLabel || TYPE_LABELS[d.type] || '')}</span>` : ''}
        <h2>${UI.esc(d.name)}</h2>
        <div class="focus">${UI.esc(d.focus || '')}</div>
        <div class="meta">
          ${d.place ? `<span class="${placeClass}">${UI.icon('pin', 13)} ${UI.esc(d.place)}</span>` : ''}
          ${d.duration ? `<span>${UI.icon('clock', 13)} ${UI.esc(d.duration)}</span>` : ''}
        </div>
      </div>
      <button class="btn primary block" data-act="start">${app._live ? (app._live.dayId === d.id ? UI.icon('play', 15) + ' Continuar entrenamiento' : UI.icon('clock', 15) + ' Entreno en curso (otro día)') : UI.icon('play', 15) + ' Empezar entreno'}</button>
      ${blocks}
      ${substitutes}
      ${related}
      <div class="detail-toolbar">
        <button class="btn ghost" data-act="edit-day">${UI.icon('edit', 16)} Editar día</button>
        <button class="btn ghost" data-act="share-day">${UI.icon('upload', 16)} Compartir</button>
        <button class="btn ghost" data-act="swap-day">${UI.icon('swap', 16)} Intercambiar</button>
      </div>`;
  }

  function dayBind(app, root, params) {
    const d = (app.routine?.days || []).find(x => x.id === params.dayId);
    if (!d) return;
    const start = root.querySelector('[data-act="start"]');
    if (start) start.addEventListener('click', async () => {
      if (app._live && app._live.dayId !== d.id) {
        const ok = await UI.confirm({ title: 'Entreno en curso', message: `Tienes un entreno en curso (${app._live.name || 'sin nombre'}). Termínalo o descártalo antes de empezar otro.`, confirmLabel: 'Ir al entreno' });
        if (ok) app.go('live', { dayId: app._live.dayId });
        return;
      }
      app.go('live', { dayId: d.id });
    });
    const editBtn = root.querySelector('[data-act="edit-day"]');
    if (editBtn) editBtn.addEventListener('click', () => editDay(app, d));
    const addFirst = root.querySelector('[data-act="add-first"]');
    if (addFirst) addFirst.addEventListener('click', () => editDay(app, d, { openAdd: true }));
    const mkRest = root.querySelector('[data-act="make-rest"]');
    if (mkRest) mkRest.addEventListener('click', async () => {
      d.type = 'rest'; d.typeLabel = TYPE_LABELS.rest; d.isRest = true;
      if (!d.focus) d.focus = 'Recuperación';
      await saveRoutine(app);
      app.render();
      UI.toast(`${d.name}: descanso · se cambia desde Editar día`);
    });
    const share = root.querySelector('[data-act="share-day"]');
    if (share) share.addEventListener('click', () => VData.exportDay(app, d.id));
    const swap = root.querySelector('[data-act="swap-day"]');
    if (swap) swap.addEventListener('click', () => swapDayFlow(app, d));
  }

  // Intercambia el CONTENIDO de dos días (mantiene id, nombre y posición/semana).
  // Los tipos de día canónicos son strong/moderate/light/rest (así los espera el CSS
  // para el color). Un plan importado puede traerlos en español: se normalizan aquí
  // para que la tarjeta se coloree igual, en vez de quedarse sin color.
  const DAY_TYPE_ALIAS = {
    fuerte: 'strong', fuertes: 'strong', duro: 'strong',
    moderado: 'moderate', medio: 'moderate',
    ligero: 'light', suave: 'light',
    descanso: 'rest', reposo: 'rest', libre: 'rest',
  };
  function normalizeDayTypes(routine) {
    let changed = false;
    // Una vez: los planes personalizados nacían con todos los días en «moderado»
    // aunque nadie lo eligiera. Los días aún vacíos vuelven a quedar sin marcar.
    if (routine && routine.planType === 'custom' && !routine.dayTypeUnset) {
      routine.dayTypeUnset = true; changed = true;
      (routine.days || []).forEach(d => {
        const vacio = !d.focus && !(d.blocks || []).some(b => (b.exercises || []).length);
        if (vacio && d.type === 'moderate' && d.typeLabel === 'Día moderado') { d.type = ''; d.typeLabel = ''; }
      });
    }
    (routine && routine.days || []).forEach(d => {
      const canon = DAY_TYPE_ALIAS[String(d.type || '').toLowerCase()];
      if (canon && canon !== d.type) { d.type = canon; changed = true; }
      // Sin tipo se queda sin tipo (el usuario lo marca si quiere); solo el descanso es implícito.
      if (d.isRest && d.type !== 'rest') { d.type = 'rest'; changed = true; }
    });
    return changed;
  }

  const SWAP_FIELDS = ['type', 'typeLabel', 'focus', 'place', 'placeAccent', 'duration', 'isRest', 'blocks', 'substitutes', 'substitutesTitle', 'planB', 'relatedGuides'];
  function swapDayContent(a, b) {
    SWAP_FIELDS.forEach(f => { const tmp = a[f]; a[f] = b[f]; b[f] = tmp; });
  }
  function swapDayFlow(app, d) {
    const others = (app.routine?.days || []).filter(x => x.id !== d.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    UI.modal({
      title: `Intercambiar ${d.name}`,
      bodyHTML: `<p class="modal-text dim">Elige con qué día intercambiar el contenido de <strong>${UI.esc(d.name)}</strong>. Los nombres de los días no cambian, solo su entrenamiento.</p>
        <div class="menu-list">
          ${others.map(o => `<button class="menu-row" data-other="${o.id}"><span><strong>${UI.esc(o.name)}</strong> — ${UI.esc(o.focus || (o.isRest ? 'Descanso' : ''))}</span><span class="chev">›</span></button>`).join('')}
        </div>`,
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: (root) => root.querySelectorAll('[data-other]').forEach(b => b.addEventListener('click', async () => {
        const other = app.routine.days.find(x => x.id === b.dataset.other);
        UI.closeModal();
        const ok = await UI.confirm({
          title: `Intercambiar ${d.name} ↔ ${other.name}`,
          message: `Vas a intercambiar el entrenamiento de "${d.name}" y "${other.name}". Tras esto, "${d.name}" tendrá lo que ahora hay en "${other.name}" y viceversa. Tus sesiones registradas no se tocan.`,
          confirmLabel: 'Sí, intercambiar', danger: true,
        });
        if (!ok) return;
        swapDayContent(d, other);
        d.typeLabel = TYPE_LABELS[d.type] || d.typeLabel;
        other.typeLabel = TYPE_LABELS[other.type] || other.typeLabel;
        await saveRoutine(app);
        await app.refreshRoutine();
        app.go('day', { dayId: d.id }, true);
        UI.toast(`${d.name} y ${other.name} intercambiados`);
      })),
    });
  }

  // ---- Editor de día (modal grande, con buscador de ejercicios) ----
  const EX_TYPE_SHORT = { weight: 'peso+reps', reps: 'reps', time: 'tiempo', check: 'hecho/no' };

  async function editDay(app, d, opts = {}) {
    const catalog = await DB.exercisesOf(app.activeUser.id); // lista mutable
    const categories = categoriesFrom(catalog); // establecidas; se amplían al crear nuevas
    const places = await DB.getPlaces(); // lugares establecidos (mutable)
    const draft = JSON.parse(JSON.stringify(d));
    let rerender;

    const rowHTML = (ex, bi, ei) => `
      <div class="ed-ex" data-bi="${bi}" data-ei="${ei}" data-sort-id="${ei}">
        <input type="hidden" data-f="exerciseId" value="${UI.esc(ex.exerciseId || '')}">
        <input type="hidden" data-f="name" value="${UI.esc(ex.name || '')}">
        <input type="hidden" data-f="type" value="${UI.esc(ex.type || 'weight')}">
        <div class="ed-ex-top">
          <button type="button" class="drag-handle" data-drag="ex" title="Arrastra para reordenar" aria-label="Arrastrar">${UI.icon('grip', 18)}</button>
          <button type="button" class="ed-ex-pick${ex.name ? '' : ' empty'}" data-pick>${ex.name ? UI.esc(ex.name) : UI.icon('plus', 15) + ' Elegir ejercicio'}</button>
          <input class="inp narrow" data-f="sets" value="${UI.esc(ex.sets || '')}" placeholder="series">
        </div>
        <div class="ed-ex-bottom">
          <span class="ex-type">${EX_TYPE_SHORT[ex.type || 'weight']}</span>
          <input class="inp ed-ex-label" data-f="label" value="${UI.esc(ex.label || '')}" placeholder="etiqueta" maxlength="18">
          <label class="mini-check"><input type="checkbox" data-f="priority"${ex.priority ? ' checked' : ''}> Prior.</label>
          <label class="mini-check"><input type="checkbox" data-f="optional"${ex.optional ? ' checked' : ''}> Opc.</label>
          <span class="ed-ex-moves">
            <button class="icon-btn danger" data-mv="del">×</button>
          </span>
        </div>
        <input class="inp ed-ex-detail" data-f="notes" value="${UI.esc(ex.notes || '')}" placeholder="detalle: tempo, carga inicial, tope de rango…" maxlength="90">
      </div>`;

    const editorHTML = () => {
      const meta = `<div class="editor-meta" id="dayMeta">
        ${UI.field('Nombre', UI.input('name', draft.name))}
        ${UI.field('Tipo de día', UI.select('type', [
          { value: '', label: 'Sin marcar' }, { value: 'strong', label: 'Día fuerte' }, { value: 'moderate', label: 'Día moderado' },
          { value: 'light', label: 'Día ligero' }, { value: 'rest', label: 'Descanso' }], draft.type))}
        ${UI.field('Enfoque', UI.input('focus', draft.focus || ''))}
        <span class="field-label">Lugar</span>
        <button type="button" class="ed-cat-btn" id="dayPlaceBtn" style="width:100%;margin-bottom:14px">${draft.place ? UI.esc(draft.place) + (draft.placeAccent ? ' ' + UI.icon('star', 13) : '') : 'Elegir lugar'} ▾</button>
        <input type="hidden" name="place" value="${UI.esc(draft.place || '')}">
        <input type="hidden" name="placeAccent" value="${draft.placeAccent ? '1' : ''}">
        ${UI.field('Duración', UI.input('duration', draft.duration || ''))}
      </div>`;
      const planBHTML = `
        <div class="catalog-title" style="font-size:15px">Plan B / alternativas</div>
        <p class="field-hint" style="margin-top:0;margin-bottom:8px">Situaciones y su alternativa (ej. "Si llueve → cinta + susp. otro día").</p>
        <div class="editor-planb">
          ${(draft.planB || []).map((p, i) => `<div class="ed-planb" data-pb="${i}">
            <input class="inp" data-pb-f="orig" value="${UI.esc(p.orig || '')}" placeholder="Si… / ejercicio">
            <span class="arrow">→</span>
            <input class="inp" data-pb-f="sub" value="${UI.esc(p.sub || '')}" placeholder="alternativa">
            <button class="icon-btn danger" data-rm-pb="${i}">×</button>
          </div>`).join('')}
        </div>
        <button class="btn ghost small" id="addPlanB">+ Añadir alternativa</button>`;
      if (draft.type === 'rest') return meta + `<p class="field-hint">Los días de descanso no tienen ejercicios.</p>` + planBHTML;
      const blocks = (draft.blocks || []).map((b, bi) => `
        <div class="ed-block" data-block="${bi}" data-sort-id="${bi}">
          <div class="ed-block-head">
            <button type="button" class="drag-handle" data-drag="block" title="Arrastra para reordenar la sección" aria-label="Arrastrar sección">${UI.icon('grip', 18)}</button>
            <button type="button" class="ed-cat-btn" data-block-cat="${bi}">${UI.esc(b.label || 'Categoría')} ▾</button>
            <label class="mini-check"><input type="checkbox" data-block-opt="${bi}"${b.optional ? ' checked' : ''}> Opc.</label>
            <span class="ed-block-moves">
              <button class="icon-btn danger" data-del-block="${bi}" title="Eliminar sección">${UI.icon('trash', 17)}</button>
            </span>
          </div>
          <div class="ed-ex-list" data-block="${bi}">${b.exercises.map((ex, ei) => rowHTML(ex, bi, ei)).join('')}</div>
          <button class="btn ghost small" data-add-ex="${bi}">+ Ejercicio</button>
        </div>`).join('');
      return meta + `<div class="editor-blocks">${blocks}</div>
        <button class="btn primary block" id="addExAny">${UI.icon('plus', 16)} Añadir ejercicio</button>
        <div class="ed-add-more"><button class="btn ghost small" id="addBlock">+ Añadir categoría vacía</button></div>` + planBHTML;
    };

    const readMeta = (root) => {
      const m = root.querySelector('#dayMeta');
      if (!m) return;
      const data = UI.readForm(m);
      draft.name = data.name.trim() || draft.name;
      draft.type = data.type; draft.focus = data.focus; draft.duration = data.duration;
      draft.place = data.place; draft.placeAccent = data.placeAccent === '1';
    };
    const sync = (root) => {
      readMeta(root);
      draft.planB = draft.planB || [];
      root.querySelectorAll('.ed-planb').forEach(el => {
        const i = +el.dataset.pb;
        if (draft.planB[i]) { draft.planB[i].orig = el.querySelector('[data-pb-f="orig"]').value; draft.planB[i].sub = el.querySelector('[data-pb-f="sub"]').value; }
      });
      root.querySelectorAll('.ed-ex').forEach(el => {
        const bi = +el.dataset.bi, ei = +el.dataset.ei;
        const ex = draft.blocks[bi] && draft.blocks[bi].exercises[ei];
        if (!ex) return;
        ex.name = el.querySelector('[data-f="name"]').value;
        ex.sets = el.querySelector('[data-f="sets"]').value;
        ex.exerciseId = el.querySelector('[data-f="exerciseId"]').value || null;
        ex.type = el.querySelector('[data-f="type"]').value;
        ex.priority = el.querySelector('[data-f="priority"]').checked;
        ex.optional = el.querySelector('[data-f="optional"]').checked;
        ex.label = el.querySelector('[data-f="label"]').value.trim() || undefined;
        ex.notes = el.querySelector('[data-f="notes"]').value.trim() || undefined; // prescripción del plan
      });
      root.querySelectorAll('[data-block-opt]').forEach(c => { draft.blocks[+c.dataset.blockOpt].optional = c.checked; });
    };
    const syncSafe = (root) => { try { sync(root); } catch (e) { readMeta(root); } };

    // Abre el buscador de una categoría: sus ejercicios (no presentes ya en el día)
    // y, al buscar, también los de otras categorías. Crear uno nuevo lo fija a esa
    // categoría y trae ya series y detalle. cb(ex, { sets, notes }).
    const openPicker = (category, cb) => {
      const inDay = new Set();
      draft.blocks.forEach(bl => (bl.exercises || []).forEach(x => { if (x.exerciseId) inDay.add(x.exerciseId); }));
      // Una sección puede ser una categoría (Pecho) o una función (Fuerza principal,
      // como en las plantillas). Si no hay ejercicios de esa categoría, se ofrecen
      // todos y al crear uno se elige su categoría.
      const isCategory = !!category && catalog.some(e => (e.muscleGroup || 'General') === category);
      const free = catalog.filter(e => !inDay.has(e.id));
      const opts = isCategory ? free.filter(e => (e.muscleGroup || 'General') === category) : free;
      const others = isCategory ? free.filter(e => (e.muscleGroup || 'General') !== category) : [];
      const known = catalog.map(e => ({ ...e, inDay: inDay.has(e.id) }));
      UI.pickExercise({ exercises: opts, others, known, withSets: true, title: category ? `Añadir a ${category}` : 'Añadir ejercicio', lockGroup: isCategory ? category : null, categories: isCategory ? null : categories, onPick: async (picked) => {
        let ex = picked;
        if (picked.isNew) {
          const clash = catalog.find(e => (e.name || '').trim().toLowerCase() === picked.name.trim().toLowerCase());
          if (clash) { ex = clash; UI.toast('Ese ejercicio ya existe; se ha usado el existente'); }
          else {
            const group = isCategory ? category : (picked.muscleGroup || 'General');
            ex = { id: DB.uid('ex'), userId: app.activeUser.id, name: picked.name, muscleGroup: group, type: picked.type, substitutes: [], createdAt: Date.now() };
            await DB.put('exercises', ex); catalog.push(ex);
            if (!categories.includes(group)) categories.push(group);
            UI.toast(`«${ex.name}» creado y añadido`);
          }
        }
        cb(ex, { sets: picked.sets || '', notes: picked.notes });
      } });
    };

    const defSets = (t) => (t === 'weight' || t === 'reps') ? '3×10' : '';
    const placeExercise = (ex, extra = {}) => {
      const row = { exerciseId: ex.id, name: ex.name, type: ex.type, sets: extra.sets || defSets(ex.type), notes: extra.notes || '', priority: false, optional: false };
      const group = ex.muscleGroup || 'General';
      let bi = -1;
      draft.blocks.forEach((b, i) => { if ((b.label || '') === group) bi = i; });
      if (bi < 0) {
        const tail = /estiramiento|vuelta a la calma/i;
        let at = draft.blocks.length;
        while (at > 0 && tail.test(draft.blocks[at - 1].label || '') && !tail.test(group)) at--;
        draft.blocks.splice(at, 0, { label: group, optional: false, exercises: [] });
        bi = at;
      }
      draft.blocks[bi].exercises.push(row);
      return { bi, ei: draft.blocks[bi].exercises.length - 1, group };
    };
    // Tras repintar, lleva la vista al ejercicio recién añadido y lo resalta.
    const flashRow = (root, pos) => {
      const el = root.querySelector(`.ed-ex[data-bi="${pos.bi}"][data-ei="${pos.ei}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    };
    const openAddAny = (root) => {
      sync(root);
      openPicker(null, (ex, extra) => {
        const pos = placeExercise(ex, extra);
        rerender(root);
        flashRow(root, pos);
        UI.toast(`Añadido a ${pos.group}`);
      });
    };

    const bindBody = (root) => {
      const typeSel = root.querySelector('#dayMeta select[name="type"]');
      const addAny = root.querySelector('#addExAny');
      if (addAny) addAny.addEventListener('click', () => openAddAny(root));
      if (typeSel) typeSel.addEventListener('change', () => { syncSafe(root); draft.type = typeSel.value; rerender(root); });
      root.querySelectorAll('[data-add-ex]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const bi = +b.dataset.addEx;
        const cat = draft.blocks[bi].label || 'General';
        // Si no se indican series (ejercicio elegido de la lista), 3×10 en los de peso o
        // repeticiones (defSets): así el entreno arranca con 3 series y no con una.
        openPicker(cat, (ex, extra = {}) => { draft.blocks[bi].exercises.push({ exerciseId: ex.id, name: ex.name, type: ex.type, sets: extra.sets || defSets(ex.type), notes: extra.notes || '', priority: false, optional: false }); rerender(root); });
      }));
      root.querySelectorAll('[data-block-cat]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const bi = +b.dataset.blockCat;
        // se permiten categorías repetidas en un mismo día (no se excluye ninguna)
        pickCategory({ categories, used: [], current: draft.blocks[bi].label, counts: catCounts(catalog), onPick: (cat) => { draft.blocks[bi].label = cat; if (!categories.includes(cat)) categories.push(cat); rerender(root); } });
      }));
      const addBlock = root.querySelector('#addBlock');
      if (addBlock) addBlock.addEventListener('click', () => {
        sync(root);
        pickCategory({ categories, used: [], counts: catCounts(catalog), onPick: (cat) => { draft.blocks.push({ label: cat, optional: false, exercises: [] }); if (!categories.includes(cat)) categories.push(cat); rerender(root); } });
      });
      root.querySelectorAll('[data-del-block]').forEach(b => b.addEventListener('click', () => { sync(root); draft.blocks.splice(+b.dataset.delBlock, 1); rerender(root); }));
      root.querySelectorAll('[data-mv="del"]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const w = b.closest('.ed-ex'); const bi = +w.dataset.bi, ei = +w.dataset.ei;
        draft.blocks[bi].exercises.splice(ei, 1);
        rerender(root);
      }));
      // Reordenar secciones arrastrando
      UI.makeSortable(root.querySelector('.editor-blocks'), {
        itemSelector: '.ed-block', handleSelector: '[data-drag="block"]',
        onReorder: (order) => { sync(root); draft.blocks = order.map(i => draft.blocks[+i]); rerender(root); },
      });
      // Reordenar ejercicios dentro de cada sección arrastrando
      root.querySelectorAll('.ed-ex-list').forEach(list => {
        const bi = +list.dataset.block;
        UI.makeSortable(list, {
          itemSelector: '.ed-ex', handleSelector: '[data-drag="ex"]',
          onReorder: (order) => { sync(root); const arr = draft.blocks[bi].exercises; draft.blocks[bi].exercises = order.map(i => arr[+i]); rerender(root); },
        });
      });
      root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const w = b.closest('.ed-ex'); const bi = +w.dataset.bi, ei = +w.dataset.ei;
        const cat = draft.blocks[bi].label || 'General';
        openPicker(cat, (ex, extra = {}) => {
          const row = draft.blocks[bi].exercises[ei]; row.name = ex.name; row.exerciseId = ex.id; row.type = ex.type;
          if (extra.sets && !row.sets) row.sets = extra.sets;       // solo rellena lo que estaba vacío
          if (extra.notes && !row.notes) row.notes = extra.notes;
          rerender(root);
        });
      }));
      const placeBtn = root.querySelector('#dayPlaceBtn');
      if (placeBtn) placeBtn.addEventListener('click', () => {
        syncSafe(root);
        pickPlace({ app, places, current: draft.place || '',
          onPick: (p) => { draft.place = p ? p.name : ''; draft.placeAccent = p ? !!p.special : false; rerender(root); },
          // renombrado / borrado desde el lápiz: el borrador del día también se entera
          onChange: (oldName, np) => { if ((draft.place || '') === oldName) { draft.place = np ? np.name : ''; draft.placeAccent = np ? !!np.special : false; rerender(root); } },
        });
      });
      const addPlanB = root.querySelector('#addPlanB');
      if (addPlanB) addPlanB.addEventListener('click', () => { sync(root); draft.planB = draft.planB || []; draft.planB.push({ orig: '', sub: '' }); rerender(root); });
      root.querySelectorAll('[data-rm-pb]').forEach(b => b.addEventListener('click', () => { sync(root); draft.planB.splice(+b.dataset.rmPb, 1); rerender(root); }));
    };

    rerender = (root) => { root.querySelector('.modal-body').innerHTML = editorHTML(); bindBody(root); };

    UI.modal({
      title: `Editar ${d.name}`, size: 'wide', bodyHTML: '',
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          sync(root);
          (draft.blocks || []).forEach(b => { b.exercises = (b.exercises || []).filter(e => e.name && e.name.trim()); });
          draft.planB = (draft.planB || []).filter(p => (p.orig && p.orig.trim()) || (p.sub && p.sub.trim()));
          const prevType = d.type;
          Object.assign(d, draft);
          // Conserva una etiqueta propia (p. ej. «Día moderado-ligero») si el tipo no cambia.
          d.typeLabel = !d.type ? '' : (d.type === prevType && d.typeLabel) ? d.typeLabel : TYPE_LABELS[d.type];
          d.isRest = d.type === 'rest';
          await saveRoutine(app);
          app.render();
          UI.toast('Día guardado');
        }},
      ],
      onMount: (root) => { rerender(root); if (opts.openAdd && draft.type !== 'rest') openAddAny(root); },
    });
  }

  // ---------- GUÍAS (estáticas) ----------
  // Vienen de la plantilla del plan activo (templates.js). Un plan personalizado no tiene guías.
  function templateOf(app) {
    const r = app && app.routine;
    return (r && r.planType === 'template' && typeof TEMPLATES !== 'undefined') ? TEMPLATES.byId(r.templateId) : null;
  }
  function guideList(app) {
    const t = templateOf(app);
    return t ? (t.guides || []) : [];
  }
  function findGuide(app, id) { return guideList(app).find(x => x.id === id) || null; }

  function guides(app) {
    const t = templateOf(app);
    const cards = guideList(app).map(g => `
      <a class="guide-card" data-link="guide" data-params='${JSON.stringify({ guideId: g.id })}'>
        <div class="num">GUÍA ${UI.esc(g.number)}</div>
        <h3>${UI.esc(g.title)}</h3>
        <p>${UI.esc(g.summary)}</p>
      </a>`).join('');
    return `<div class="week-intro"><div class="eyebrow">${t ? UI.esc(t.name) : 'Documentación detallada'}</div><h2>Guías</h2><p>Información completa sobre cada parte del plan.</p></div><div class="guides-list">${cards || '<p class="dim">Este plan no tiene guías.</p>'}</div>`;
  }

  function guide(app, params) {
    const g = findGuide(app, params.guideId);
    if (!g) return `<div class="empty-state"><p>Guía no encontrada.</p></div>`;
    return `<div class="guide-content"><div class="guide-eyebrow">GUÍA ${UI.esc(g.number)}</div><h2>${UI.esc(g.title)}</h2>${g.content}</div>`;
  }

  // ---------- PLANES (gestor de planes) ----------
  const PLAN_TYPE_LABEL = { custom: 'Personalizado', template: 'Plantilla' };

  // Ficha de una plantilla: datos, puntos fuertes y guías.
  function templateInfoHTML(t) {
    const rows = [['Objetivo', t.goal], ['Frecuencia', t.frequency], ['Sesión', t.sessionTime], ['Nivel', t.level], ['Material', t.equipment]];
    return `
      <div class="catalog-title" style="margin-top:8px">Sobre este plan</div>
      <p class="field-hint" style="margin-top:0">${UI.esc(t.tagline)}</p>
      <div class="block"><ul class="ex-list">${rows.map(([k, v]) => `<li><span class="ex-name">${k}</span><span class="ex-sets">${UI.esc(v)}</span></li>`).join('')}</ul></div>
      <div class="block"><div class="block-label">Qué incluye</div><ul class="ex-list">${(t.highlights || []).map(h => `<li><span class="ex-name">${UI.esc(h)}</span></li>`).join('')}</ul></div>
      <div class="related-guides"><div class="block-label">Guías</div>
        ${(t.guides || []).map(g => `<a class="guide-link" data-link="guide" data-params='${JSON.stringify({ guideId: g.id })}'><span>${UI.esc(g.title)}</span><span class="guide-link-arrow">›</span></a>`).join('')}
      </div>`;
  }

  // Tarjetas para elegir con qué empezar un plan (alta y «Crear plan»).
  // Valor: 'tpl:<id>' para una plantilla o 'custom' para uno en blanco.
  function planChoicesHTML(selected) {
    const tpls = typeof TEMPLATES !== 'undefined' ? TEMPLATES.list : [];
    const card = (value, title, sub, meta, badge) => `
      <button type="button" class="plan-choice${value === selected ? ' sel' : ''}" data-plan="${value}">
        <strong>${title}${badge ? ` <span class="badge">${badge}</span>` : ''}</strong>
        <span class="dim">${sub}</span>
        ${meta ? `<span class="plan-choice-meta">${meta}</span>` : ''}
      </button>`;
    return tpls.map((t, i) => card(`tpl:${t.id}`, UI.esc(t.name), UI.esc(t.tagline),
        `<span>${UI.esc(t.frequency)} · ${UI.esc(t.sessionTime)} · ${UI.esc(t.level)}</span><span class="plan-choice-more" data-preview="${t.id}">Ver qué incluye ›</span>`, i === 0 ? 'Recomendada' : ''))
      .join('')
      + card('ai', 'Plan de tu entrenador', 'Con el PDF o las fotos que te dio y la ayuda de una IA: Traindía lo convierte en tu plan.', '', 'Beta')
      + card('custom', 'Plan en blanco', '7 días vacíos que montas a tu medida: tus ejercicios, tus días.', '', '')
      + '<p class="field-hint plan-choice-soon">Más plantillas en camino.</p>';
  }
  function bindPlanChoices(root, onChange) {
    root.querySelectorAll('.plan-choice[data-plan]').forEach(b => b.addEventListener('click', (e) => {
      const pv = e.target.closest('[data-preview]');
      if (pv) { e.stopPropagation(); templatePreview(pv.dataset.preview); return; }
      root.querySelectorAll('.plan-choice').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); onChange(b.dataset.plan);
    }));
  }
  // Vista previa de una plantilla: sus días y ejercicios, antes de elegirla.
  function templatePreview(id) {
    const t = TEMPLATES.byId(id);
    if (!t) return;
    const days = t.days.map(d => d.isRest
      ? `<div class="tp-day rest"><strong>${UI.esc(d.name)}</strong><span class="dim">Descanso</span></div>`
      : `<div class="tp-day"><strong>${UI.esc(d.name)}</strong><span class="tp-focus">${UI.esc(d.focus || '')}${d.duration ? ` · ${UI.esc(d.duration)}` : ''}</span>
          <ul>${d.blocks.filter(b => !/calentamiento|estiramientos|vuelta a la calma/i.test(b.label)).flatMap(b => b.exercises).map(x => `<li class="${x.priority ? 'prio' : ''}${x.optional ? ' opt' : ''}"><span>${UI.esc(x.name)}</span><span class="dim">${UI.esc(x.sets || '')}</span></li>`).join('')}</ul>
        </div>`).join('');
    UI.modal({
      title: t.name, size: 'wide',
      bodyHTML: `<p class="modal-text">${UI.esc(t.tagline)}</p>
        <p class="field-hint" style="margin-top:0">${UI.esc(t.frequency)} · ${UI.esc(t.sessionTime)} · ${UI.esc(t.level)} · ${UI.esc(t.equipment)}</p>
        <div class="tp-days">${days}</div>
        <p class="field-hint">Cada día incluye calentamiento, vuelta a la calma y Plan B. Todo se puede editar después.</p>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
    });
  }

  async function info(app) {
    const routines = (await DB.routinesOf(app.activeUser.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
    const activeId = app.routine && app.routine.id;

    const planCards = routines.map(r => {
      const train = (r.days || []).filter(d => !d.isRest);
      const optDays = train.filter(d => (d.blocks || []).length && d.blocks.every(b => b.optional)).length; // días enteros opcionales
      const tDays = train.length - optDays;
      const isActive = r.id === activeId;
      const typeBadge = `<span class="badge${(r.planType === 'custom') ? ' guest' : ''}">${PLAN_TYPE_LABEL[r.planType] || 'Personalizado'}</span>`;
      return `<div class="plan-card${isActive ? ' active' : ''}">
        <div class="plan-card-main">
          <strong>${UI.esc(r.name)} ${typeBadge}${isActive ? ' <span class="badge">Activo</span>' : ''}</strong>
          <span class="dim">${tDays} días de entreno${optDays ? ` + ${optDays} opcional` : ''}</span>
        </div>
        <span class="plan-card-actions">
          ${isActive ? '' : `<button class="btn ghost small" data-activate="${r.id}">Activar</button>`}
          <button class="icon-btn" data-plan-menu="${r.id}" aria-label="Opciones de ${UI.esc(r.name)}">${UI.icon('more', 20)}</button>
        </span>
      </div>`;
    }).join('');

    const r0 = app.routine;
    const notesHTML = (r0 && Array.isArray(r0.planNotes) && r0.planNotes.length) ? `
      <div class="catalog-title" style="margin-top:8px">Notas del plan</div>
      ${(r0.planDuration || r0.planStart) ? `<p class="field-hint" style="margin-top:0">${[r0.planDuration ? `Duración: ${UI.esc(r0.planDuration)}` : '', r0.planStart ? `Empieza: ${UI.esc(UI.fmtDate(r0.planStart))}` : ''].filter(Boolean).join(' · ')}</p>` : ''}
      <div class="block"><ul class="ex-list">${r0.planNotes.map(n => `<li><span class="ex-name">${UI.esc(n)}</span></li>`).join('')}</ul></div>` : '';
    const tplActive = templateOf(app);
    const planInfo = tplActive ? templateInfoHTML(tplActive) : '';

    return `
      <p class="section-intro">Cambia entre tus planes o crea uno nuevo. En <strong>⋯</strong> puedes renombrarlos, duplicarlos, exportarlos o borrarlos.</p>
      ${planCards}
      <button class="btn ghost block" id="newPlan">${UI.icon('plus', 16)} Crear plan</button>
      ${VPlanAI.pidioPrompt() ? `<button class="btn primary block" id="aiPaste">${UI.icon('upload', 16)} Pegar el resultado de la IA</button>` : ''}
      ${notesHTML}
      ${planInfo}`;
  }

  function infoBind(app, root) {
    root.querySelectorAll('[data-activate]').forEach(b => b.addEventListener('click', async () => {
      await DB.setActivePlan(app.activeUser.id, b.dataset.activate);
      await app.refreshRoutine();
      app.render();
      UI.toast('Plan activado');
    }));
    root.querySelectorAll('[data-plan-menu]').forEach(b => b.addEventListener('click', () => planMenu(app, b.dataset.planMenu)));
    const newPlan = root.querySelector('#newPlan');
    if (newPlan) newPlan.addEventListener('click', () => createPlanModal(app));
    const aiPaste = root.querySelector('#aiPaste');
    if (aiPaste) aiPaste.addEventListener('click', () => VPlanAI.paste(app));
  }

  // Menú «⋯» de un plan: activar, renombrar, duplicar, exportar y borrar.
  async function planMenu(app, planId) {
    const uid = app.activeUser.id;
    const plans = await DB.routinesOf(uid);
    const rt = plans.find(x => x.id === planId); if (!rt) return;
    const isActive = app.routine && app.routine.id === rt.id;
    const done = async (msg) => { await app.refreshRoutine(); app.render(); if (msg) UI.toast(msg); };
    const ov = UI.modal({
      title: rt.name || 'Plan',
      bodyHTML: `<div class="menu-list">
        ${isActive ? '' : `<button class="menu-row" data-op="activate"><span>${UI.icon('check', 16)} Activar este plan</span><span class="chev">›</span></button>`}
        <button class="menu-row" data-op="rename"><span>${UI.icon('edit', 16)} Renombrar</span><span class="chev">›</span></button>
        <button class="menu-row" data-op="dup"><span>${UI.icon('repeat', 16)} Duplicar</span><span class="chev">›</span></button>
        <button class="menu-row" data-op="export"><span>${UI.icon('upload', 16)} Exportar</span><span class="chev">›</span></button>
        <button class="menu-row danger" data-op="del"><span>${UI.icon('trash', 16)} Borrar</span><span class="chev">›</span></button>
      </div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (m) => {
        const on = (op, fn) => { const x = m.querySelector(`[data-op="${op}"]`); if (x) x.addEventListener('click', () => { UI.closeModal(ov); fn(); }); };
        on('activate', async () => { await DB.setActivePlan(uid, rt.id); await done('Plan activado'); });
        on('rename', () => UI.modal({
          title: 'Renombrar plan',
          bodyHTML: `<div id="rnForm">${UI.field('Nombre', UI.input('name', rt.name || '', { placeholder: 'Ej: Fuerza otoño' }))}</div>`,
          actions: [
            { label: 'Cancelar', kind: 'ghost' },
            { label: 'Guardar', kind: 'primary', onClick: async (r2) => {
              const name = (UI.readForm(r2.querySelector('#rnForm')).name || '').trim();
              if (!name) { UI.toast('Escribe un nombre', 'err'); return false; }
              rt.name = name; await DB.put('routines', rt); await done('Plan renombrado');
            } },
          ],
          onMount: (r2) => { const i = r2.querySelector('input[name="name"]'); if (i) { i.focus(); i.select(); } },
        }));
        on('dup', async () => {
          const copy = JSON.parse(JSON.stringify(rt));
          copy.id = DB.uid('rt'); copy.name = `${rt.name || 'Plan'} (copia)`; copy.isPrimary = false;
          copy.order = Date.now(); copy.createdAt = Date.now();
          (copy.days || []).forEach(d => { d.id = DB.uid('day'); }); // días propios: las sesiones del original no se mezclan
          await DB.put('routines', copy); await done('Plan duplicado: está debajo, sin activar');
        });
        on('export', () => VData.exportRoutine(app, rt));
        on('del', async () => {
          if (plans.length === 1) { UI.toast('Es tu único plan: crea otro antes de borrarlo', 'err'); return; }
          const ok = await UI.confirm({ title: `¿Borrar ${rt.name || 'este plan'}?`, message: `Se borra el plan (sus días y ejercicios asignados). Tus sesiones, registros y progreso NO se tocan.${isActive ? ' Como es el activo, pasará a activo otro de tus planes.' : ''}`, confirmLabel: 'Borrar plan', danger: true });
          if (!ok) return;
          await DB.deletePlan(rt.id);
          if (isActive) { const next = plans.filter(x => x.id !== rt.id).sort((a, b) => (a.order || 0) - (b.order || 0))[0]; if (next) await DB.setActivePlan(uid, next.id); }
          await done('Plan borrado');
        });
      },
    });
  }

  function createPlanModal(app) {
    let type = typeof TEMPLATES !== 'undefined' && TEMPLATES.list.length ? `tpl:${TEMPLATES.list[0].id}` : 'custom';
    UI.modal({
      title: 'Crear plan', size: 'wide',
      bodyHTML: `<div id="newPlanForm">
        <span class="field-label">Empieza con</span>
        <div class="plan-choices" id="planChoices">${planChoicesHTML(type)}</div>
        ${UI.field('Nombre (opcional)', UI.input('name', '', { placeholder: 'Si lo dejas vacío, el de la plantilla' }))}
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear y activar', kind: 'primary', onClick: async (rootEl) => {
          const d = UI.readForm(rootEl.querySelector('#newPlanForm'));
          if (type === 'ai') { setTimeout(() => VPlanAI.open(app), 50); return; } // el plan lo crea el importador
          const tplId = type.startsWith('tpl:') ? type.slice(4) : null;
          await DB.createPlan(app.activeUser.id, tplId ? 'template' : 'custom', { name: d.name.trim() || undefined, activate: true, templateId: tplId });
          await app.refreshRoutine();
          app.go('info', {}, true);
          UI.toast('Plan creado y activado');
        }},
      ],
      onMount: (rootEl) => bindPlanChoices(rootEl, (v) => { type = v; }),
    });
  }

  // ---------- CATÁLOGO DE EJERCICIOS ----------
  const TYPE_NAME = { weight: 'Peso+reps', reps: 'Reps', time: 'Tiempo', check: 'Hecho/no' };

  // Mapa de uso: qué días de la rutina usan cada ejercicio (por id y por nombre).
  function buildUsage(routine) {
    const usage = new Map();
    const add = (key, dayName) => {
      if (!key) return;
      const k = String(key).toLowerCase();
      if (!usage.has(k)) usage.set(k, new Set());
      usage.get(k).add(dayName);
    };
    (routine?.days || []).forEach(d => {
      if (d.isRest) return;
      (d.blocks || []).forEach(b => b.exercises.forEach(ex => {
        if (ex.exerciseId) add(ex.exerciseId, d.name);
        if (ex.name) add(ex.name, d.name);
      }));
    });
    return usage;
  }

  // ---------- Ejercicios duplicados (idénticos) ----------
  // "Firma" de identidad: dos ejercicios con la misma firma son el mismo ejercicio
  // (igual nombre, tipo y grupo muscular) → se pueden fusionar. Las métricas (qué
  // campos se registran en cardio) NO entran en la firma: al fusionar se conserva
  // la unión de todas, así que no se pierde ningún campo.
  function exSignature(e) {
    return [
      (e.name || '').trim().toLowerCase(),
      e.type || '',
      UI.norm(e.muscleGroup || ''),
    ].join('@@');
  }
  // Unión de las métricas de un cluster, preservando el orden de la más completa.
  function unionMetrics(group) {
    const lists = group.map(e => e.metrics).filter(m => Array.isArray(m) && m.length);
    if (!lists.length) return null;
    lists.sort((a, b) => b.length - a.length);
    const out = [...lists[0]];
    lists.slice(1).forEach(m => m.forEach(k => { if (!out.includes(k)) out.push(k); }));
    return out;
  }

  // Agrupa los ejercicios idénticos en clusters { keep, remove[] }. Conserva uno
  // por cluster con prioridad: usado en el plan > con más suplentes.
  async function mergeableClusters(app) {
    const list = await DB.exercisesOf(app.activeUser.id);
    const routines = await DB.routinesOf(app.activeUser.id);
    const usedIds = new Set();
    routines.forEach(rt => (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => { if (e.exerciseId) usedIds.add(e.exerciseId); }))));
    const groups = {};
    list.forEach(e => { if ((e.name || '').trim()) { const k = exSignature(e); (groups[k] = groups[k] || []).push(e); } });
    const clusters = [];
    Object.values(groups).forEach(g => {
      if (g.length < 2) return;
      g.sort((a, b) =>
        ((usedIds.has(b.id) ? 1 : 0) - (usedIds.has(a.id) ? 1 : 0))
        || ((b.substitutes || []).length - (a.substitutes || []).length));
      clusters.push({ keep: g[0], remove: g.slice(1) });
    });
    return clusters;
  }

  // Lista plana de duplicados borrables (para contar/avisar).
  async function dedupeRemovable(app) {
    return (await mergeableClusters(app)).flatMap(c => c.remove);
  }

  // Elimina los duplicados idénticos dejando uno de cada y REAPUNTANDO las
  // referencias (plan y sesiones) al que se conserva, para no perder nada.
  // El progreso se calcula por nombre de ejercicio, así que no se ve afectado.
  async function cleanupDuplicates(app) {
    const clusters = await mergeableClusters(app);
    if (!clusters.length) return 0;
    const remap = {}; // idBorrado -> idConservado
    clusters.forEach(c => c.remove.forEach(e => { remap[e.id] = c.keep.id; }));
    const removedIds = new Set(Object.keys(remap));

    // 1) Reapunta los ejercicios en los días del plan (todas las rutinas).
    for (const rt of await DB.routinesOf(app.activeUser.id)) {
      let changed = false;
      (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => {
        if (e.exerciseId && remap[e.exerciseId]) { e.exerciseId = remap[e.exerciseId]; changed = true; }
      })));
      if (changed) await DB.put('routines', rt);
    }
    // 2) Reapunta los ejercicios en las sesiones ya registradas.
    for (const s of await DB.sessionsOf(app.activeUser.id)) {
      let changed = false;
      (s.entries || []).forEach(e => { if (e.exerciseId && remap[e.exerciseId]) { e.exerciseId = remap[e.exerciseId]; changed = true; } });
      if (changed) await DB.put('sessions', s);
    }
    // 3) Funde en el conservado: suplentes + la unión de métricas (config más
    //    completa de cardio); reapunta los suplentes del resto.
    for (const c of clusters) {
      const keep = await DB.get('exercises', c.keep.id);
      const subs = [...(keep.substitutes || []), ...c.remove.flatMap(e => e.substitutes || [])]
        .map(sid => remap[sid] || sid).filter(sid => sid !== keep.id && !removedIds.has(sid));
      keep.substitutes = [...new Set(subs)];
      const metrics = unionMetrics([c.keep, ...c.remove]);
      if (metrics) keep.metrics = metrics;
      await DB.put('exercises', keep);
    }
    for (const ex of await DB.exercisesOf(app.activeUser.id)) {
      if (removedIds.has(ex.id) || !(ex.substitutes || []).length) continue;
      const subs = [...new Set(ex.substitutes.map(sid => remap[sid] || sid).filter(sid => sid !== ex.id && !removedIds.has(sid)))];
      if (subs.length !== ex.substitutes.length || subs.some((s, i) => s !== ex.substitutes[i])) { ex.substitutes = subs; await DB.put('exercises', ex); }
    }
    // 4) Borra los duplicados.
    for (const id of removedIds) await DB.del('exercises', id);
    return removedIds.size;
  }

  // Aviso al entrar en la app si hay duplicados idénticos.
  async function checkDuplicates(app) {
    if (document.querySelector('.modal-overlay')) return; // no encimar otros avisos
    const rem = await dedupeRemovable(app);
    if (!rem.length) return;
    const names = [...new Set(rem.map(e => e.name))];
    UI.modal({
      title: 'Ejercicios duplicados',
      bodyHTML: `<p class="modal-text">Hay <strong>${rem.length}</strong> ejercicio${rem.length === 1 ? '' : 's'} idéntico${rem.length === 1 ? '' : 's'} repetido${rem.length === 1 ? '' : 's'} (${names.slice(0, 3).map(n => UI.esc(n)).join(', ')}${names.length > 3 ? '…' : ''}). ¿Eliminar los repetidos y dejar uno de cada? Se conserva uno y se mantienen tanto tu plan como tus registros y progreso.</p>`,
      actions: [
        { label: 'Ahora no', kind: 'ghost' },
        { label: `Eliminar ${rem.length}`, kind: 'danger', onClick: async () => { const n = await cleanupDuplicates(app); UI.toast(`${n} duplicado${n === 1 ? '' : 's'} eliminado${n === 1 ? '' : 's'}`); app.render(); } },
      ],
    });
  }

  // Filtros del catálogo: viven fuera de la vista para que sigan puestos al editar
  // un ejercicio, al navegar y volver, y al recargar (sessionStorage).
  const EX_UI_KEY = 'traindia.exCatalog';
  const exUI = (() => {
    const def = { q: '', use: 'all', type: '', cat: '' };
    try { return Object.assign(def, JSON.parse(sessionStorage.getItem(EX_UI_KEY) || '{}')); } catch (e) { return def; }
  })();
  function saveExUI() { try { sessionStorage.setItem(EX_UI_KEY, JSON.stringify(exUI)); } catch (e) {} }

  // Datos del catálogo ya preparados para pintar: uso en los días, vídeos, suplentes.
  async function catalogData(app) {
    const list = (await DB.exercisesOf(app.activeUser.id)).sort((a, b) => a.name.localeCompare(b.name));
    const usage = buildUsage(app.routine);
    const byId = {};
    list.forEach(e => { byId[e.id] = e; });
    // Los suplentes de un ejercicio en uso también se consideran en uso
    // (y se apunta de cuál son suplentes, para decirlo en la fila).
    const subOf = {};
    list.forEach(e => {
      const direct = usage.get(e.id.toLowerCase()) || usage.get(e.name.toLowerCase());
      if (direct && e.substitutes) e.substitutes.forEach(sid => {
        if (!byId[sid]) return;
        const k = sid.toLowerCase();
        if (!usage.has(k)) usage.set(k, new Set());
        usage.get(k).add('suplente');
        (subOf[sid] || (subOf[sid] = [])).push(e.name);
      });
    });
    const daysUsing = (e) => {
      const s = new Set([...(usage.get(e.id.toLowerCase()) || []), ...(usage.get(e.name.toLowerCase()) || [])]);
      return [...s];
    };

    // Registros: en cuántos entrenos guardados sale cada ejercicio (y el último).
    const recById = {}, recByName = {};
    (await DB.sessionsOf(app.activeUser.id)).filter(ss => !ss.draft).forEach(ss => {
      const seen = new Set();
      (ss.entries || []).forEach(en => {
        if (!(en.sets || []).length) return;
        const k = en.exerciseId ? 'id:' + en.exerciseId : 'n:' + (en.name || '').trim().toLowerCase();
        if (seen.has(k)) return; seen.add(k);
        const tgt = en.exerciseId ? recById : recByName;
        const kk = en.exerciseId || (en.name || '').trim().toLowerCase();
        const r = tgt[kk] || (tgt[kk] = { n: 0, last: '' });
        r.n++; if ((ss.date || '') > r.last) r.last = ss.date || '';
      });
    });
    const recsOf = (e) => {
      const a = recById[e.id] || { n: 0, last: '' }, b = recByName[e.name.trim().toLowerCase()] || { n: 0, last: '' };
      return { n: a.n + b.n, last: a.last > b.last ? a.last : b.last };
    };

    const items = list.map(e => {
      const days = daysUsing(e);
      const recs = recsOf(e);
      return {
        e, days, used: days.length > 0, recs: recs.n, lastRec: recs.last, subOf: [...new Set(subOf[e.id] || [])],
        group: e.muscleGroup || 'General',
        type: e.type || 'weight',
        vids: DB.exVideos(e).length,
        subs: (e.substitutes || []).filter(id => byId[id]).length,
        search: UI.norm([e.name, e.muscleGroup || '', ...(e.substitutes || []).map(id => byId[id] ? byId[id].name : '')].join(' ')),
      };
    });
    return { items, removableDup: await dedupeRemovable(app) };
  }

  async function exercises(app) {
    const { removableDup } = await catalogData(app);
    return `<div class="section ex-catalog">
      <div class="cat-bar" id="catBar">
        <div class="cat-search-row">
          <label class="cat-search">
            ${UI.icon('search', 16)}
            <input type="search" id="exCatalogSearch" placeholder="Buscar ejercicio o suplente…" autocomplete="off" enterkeyhint="search" value="${UI.esc(exUI.q)}">
            <button type="button" class="cat-clear" id="exSearchClear" aria-label="Borrar búsqueda"${exUI.q ? '' : ' hidden'}>${UI.icon('x', 14)}</button>
          </label>
          <button class="btn primary cat-new" id="addEx" aria-label="Nuevo ejercicio">${UI.icon('plus', 16)}<span>Nuevo</span></button>
        </div>
        <div class="cat-filters"><div>
          <div class="seg cat-use" id="catUse"></div>
          <div class="chips-scroll" id="catTypes"></div>
          <div class="chips-scroll" id="catCats"></div>
        </div></div>
      </div>
      <div class="cat-count" id="catCount"></div>
      <div id="catalogBody"></div>
      ${removableDup.length ? `<button class="btn ghost danger block" id="cleanDups" style="margin-top:16px">${UI.icon('trash', 16)} Eliminar ${removableDup.length} duplicado${removableDup.length === 1 ? '' : 's'} idéntico${removableDup.length === 1 ? '' : 's'}</button>` : ''}
      <details class="det cat-help"><summary>¿Cómo funciona el catálogo?</summary>
        <p class="field-hint">Catálogo de <strong>${UI.esc(app.activeUser.name)}</strong>. Un ejercicio está <strong>en uso</strong> si aparece en algún día de tu plan (o es suplente de uno que lo está); si lo quitas de todos los días pasa a <strong>sin usar</strong>. Los que no usas se pueden borrar; si tienen registros, te pide confirmarlo. Toca un ejercicio para editarlo.</p>
      </details>
    </div>`;
  }

  const TYPE_FILTERS = [
    { v: '', l: 'Todos los tipos' }, { v: 'weight', l: 'Peso+reps' }, { v: 'reps', l: 'Reps' },
    { v: 'time', l: 'Tiempo' }, { v: 'check', l: 'Hecho/no' },
  ];

  function exercisesBind(app, root) {
    let items = [];
    const $ = (sel) => root.querySelector(sel);
    const search = $('#exCatalogSearch');
    if (!search) return;

    // La barra de filtros se queda pegada bajo la cabecera al bajar por la lista.
    const header = document.querySelector('.app-header');
    const bar = $('#catBar');
    if (header && bar) bar.style.top = header.offsetHeight + 'px';
    // Al bajar se recogen los filtros (queda solo el buscador) y al subir vuelven.
    let lastY = window.scrollY, quietUntil = 0;
    const onScroll = () => {
      if (!document.body.contains(bar)) { window.removeEventListener('scroll', onScroll); return; }
      const y = window.scrollY;
      if (Date.now() < quietUntil) { lastY = y; return; } // el cambio de alto mueve el scroll: no rebotar
      if (Math.abs(y - lastY) < 6) return;
      const compact = y > lastY && y > 120;
      if (compact !== bar.classList.contains('compact')) { bar.classList.toggle('compact', compact); quietUntil = Date.now() + 350; }
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const matches = (it, skip) =>
      (!exUI.q || it.search.includes(UI.norm(exUI.q))) &&
      (skip === 'use' || exUI.use === 'all' || (exUI.use === 'used' ? it.used : !it.used)) &&
      (skip === 'type' || !exUI.type || it.type === exUI.type) &&
      (skip === 'cat' || !exUI.cat || it.group === exUI.cat);
    const countBy = (skip, key) => {
      const m = {};
      items.forEach(it => { if (matches(it, skip)) { const k = key(it); m[k] = (m[k] || 0) + 1; } });
      return m;
    };
    const filtersOn = () => !!(exUI.q || exUI.use !== 'all' || exUI.type || exUI.cat);

    const rowHTML = (it) => {
      const e = it.e;
      const realDays = it.days.filter(d => d !== 'suplente');
      const asSub = realDays.length !== it.days.length;
      // «Suplente de Plancha frontal» (o «de A, B y 2 más» si lo es de varios)
      const de = it.subOf.length > 2 ? `${it.subOf.slice(0, 2).join(', ')} y ${it.subOf.length - 2} más` : it.subOf.join(' y ');
      const where = !it.used ? 'Sin usar'
        : realDays.length ? 'En ' + realDays.join(', ') + (asSub ? ` · suplente de ${de}` : '')
        : `Suplente de ${de}`;
      const extras = [
        it.vids ? `<span class="cat-ic" title="Vídeos">${UI.icon('play', 9)}${it.vids}</span>` : '',
        it.subs ? `<span class="cat-ic sub" title="Suplentes">${UI.icon('repeat', 10)}${it.subs}</span>` : '',
      ].join('');
      const recs = it.recs ? `<span class="cat-recs" title="Entrenos en los que lo has apuntado">${UI.icon('activity', 10)}${it.recs} registro${it.recs === 1 ? '' : 's'}</span>` : '<span class="cat-recs none">Sin registros</span>';
      const deletable = !it.used;
      return `<li class="cat-row${it.used ? '' : ' unused'}" data-edit="${e.id}" tabindex="0" role="button">
        <span class="ex-name-wrap">
          <span class="ex-name">${UI.esc(e.name)}</span>
          <span class="ex-sub"><span class="ex-type">${TYPE_NAME[it.type] || it.type}</span> · ${UI.esc(where)}${extras}${recs}</span>
        </span>
        <span class="ex-actions">
          ${deletable ? `<button class="icon-btn danger" data-del="${e.id}" aria-label="Eliminar">${UI.icon('trash', 17)}</button>` : ''}
          <span class="chev">›</span>
        </span></li>`;
    };

    const paint = () => {
      const all = items.length;
      const useC = countBy('use', it => it.used ? 'used' : 'unused');
      const useOpts = [
        { v: 'all', l: 'Todos', n: (useC.used || 0) + (useC.unused || 0) },
        { v: 'used', l: 'En uso', n: useC.used || 0 },
        { v: 'unused', l: 'Sin usar', n: useC.unused || 0 },
      ];
      $('#catUse').innerHTML = useOpts.map(o => `<button class="seg-opt${exUI.use === o.v ? ' on' : ''}" data-use="${o.v}">${o.l} <span class="cat-n">${o.n}</span></button>`).join('');

      const typeC = countBy('type', it => it.type);
      $('#catTypes').innerHTML = TYPE_FILTERS
        .filter(t => !t.v || typeC[t.v] || exUI.type === t.v)
        .map(t => `<button class="chip${exUI.type === t.v ? ' on' : ''}" data-type="${t.v}">${t.l}${t.v ? ` <span class="cat-n">${typeC[t.v] || 0}</span>` : ''}</button>`).join('');

      const catC = countBy('cat', it => it.group);
      const cats = [...new Set(items.map(it => it.group))].sort((a, b) => a.localeCompare(b))
        .filter(c => catC[c] || exUI.cat === c);
      $('#catCats').innerHTML = `<button class="chip${exUI.cat ? '' : ' on'}" data-cat="">Todas las categorías</button>` +
        cats.map(c => `<button class="chip${exUI.cat === c ? ' on' : ''}" data-cat="${UI.esc(c)}">${UI.esc(c)} <span class="cat-n">${catC[c] || 0}</span></button>`).join('');

      const shown = items.filter(it => matches(it));
      $('#catCount').innerHTML = `<span>${filtersOn() ? `${shown.length} de ${all}` : all} ejercicio${all === 1 ? '' : 's'}</span>` +
        (filtersOn() ? `<button class="link-btn" data-reset>Quitar filtros</button>` : '');

      let html;
      if (!shown.length) {
        html = `<div class="cat-empty"><p>Ningún ejercicio coincide${exUI.q ? ` con «${UI.esc(exUI.q)}»` : ''}.</p>
          <div class="cat-empty-actions">
            ${filtersOn() ? '<button class="btn ghost small" data-reset>Quitar filtros</button>' : ''}
            ${exUI.q.trim() ? `<button class="btn primary small" data-new-q>+ Crear «${UI.esc(exUI.q.trim())}»</button>` : ''}
          </div></div>`;
      } else if (exUI.cat) {
        html = `<ul class="ex-list">${shown.map(rowHTML).join('')}</ul>`;
      } else {
        const groups = {};
        shown.forEach(it => { (groups[it.group] = groups[it.group] || []).push(it); });
        html = Object.keys(groups).sort((a, b) => a.localeCompare(b)).map(g =>
          `<div class="block"><div class="block-label">${UI.esc(g)} <span class="cat-n">${groups[g].length}</span></div><ul class="ex-list">${groups[g].map(rowHTML).join('')}</ul></div>`
        ).join('');
      }
      $('#catalogBody').innerHTML = html;
      $('#exSearchClear').hidden = !exUI.q;
    };

    const set = (patch) => { Object.assign(exUI, patch); saveExUI(); paint(); };

    // Recarga los datos y repinta SOLO la lista: se conservan filtros, búsqueda y
    // posición. Si se indica un id, se resalta esa fila.
    const refresh = async (flashId) => {
      const y = window.scrollY;
      items = (await catalogData(app)).items;
      paint();
      window.scrollTo(0, y);
      if (flashId) {
        const li = root.querySelector(`.cat-row[data-edit="${flashId}"]`);
        if (li) {
          const r = li.getBoundingClientRect();
          const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
          if (r.top < barBottom || r.bottom > window.innerHeight) window.scrollBy(0, r.top - barBottom - 80);
          li.classList.add('flash');
          setTimeout(() => li.classList.remove('flash'), 1600);
        }
      }
    };

    search.addEventListener('input', () => set({ q: search.value }));
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') search.blur(); });
    $('#exSearchClear').addEventListener('click', () => { search.value = ''; set({ q: '' }); search.focus(); });
    $('#addEx').addEventListener('click', () => editExercise(app, null, { onSaved: refresh, group: exUI.cat }));

    // Delegado en la sección (se recrea en cada render), NO en root: root es
    // #mainContent, persiste entre pantallas y acumularía un listener por visita
    // (se abrían varios editores apilados).
    const host = root.querySelector('.ex-catalog');
    host.addEventListener('click', async (ev) => {
      const t = ev.target;
      const use = t.closest('[data-use]'); if (use) { set({ use: use.dataset.use }); return; }
      const ty = t.closest('[data-type]'); if (ty) { set({ type: ty.dataset.type }); return; }
      const cat = t.closest('[data-cat]'); if (cat) { set({ cat: cat.dataset.cat }); return; }
      if (t.closest('[data-reset]')) { search.value = ''; set({ q: '', use: 'all', type: '', cat: '' }); return; }
      if (t.closest('[data-new-q]')) { editExercise(app, null, { onSaved: refresh, name: exUI.q.trim(), group: exUI.cat }); return; }
      const del = t.closest('[data-del]');
      if (del) {
        const ex = await DB.get('exercises', del.dataset.del);
        const it = items.find(x => x.e.id === ex.id) || { recs: 0 };
        let ok;
        if (it.recs) {
          // Con registros no se borra con un simple «sí»: hay que escribir BORRAR.
          ok = await UI.confirm({
            title: `¿Borrar ${ex.name}?`,
            message: `Lo has apuntado en ${it.recs} entreno${it.recs === 1 ? '' : 's'}${it.lastRec ? ` (el último, el ${UI.fmtDate(it.lastRec)})` : ''}. Esas sesiones se conservan, pero dejarás de ver su progreso en Progreso → Por ejercicio. Si solo quieres dejar de usarlo, basta con quitarlo de tus días.`,
            confirmLabel: 'Borrar igualmente', danger: true, requireText: 'BORRAR',
          });
        } else {
          const msg = 'No se usa en ningún día y no tiene registros. Se eliminará del catálogo.';
          ok = await UI.confirm({ title: `Eliminar ${ex.name}`, message: msg, confirmLabel: 'Eliminar', danger: true });
        }
        if (!ok) return;
        await DB.del('exercises', ex.id);
        await refresh();
        UI.toast('Ejercicio eliminado');
        return;
      }
      const row = t.closest('[data-edit]');
      if (row) {
        const ex = await DB.get('exercises', row.dataset.edit);
        if (ex) editExercise(app, ex, { onSaved: refresh });
      }
    });
    host.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('cat-row')) { ev.preventDefault(); ev.target.click(); }
    });

    const cleanBtn = $('#cleanDups');
    if (cleanBtn) cleanBtn.addEventListener('click', async () => {
      const rem = await dedupeRemovable(app);
      const ok = await UI.confirm({ title: 'Eliminar duplicados', message: `Se eliminarán ${rem.length} ejercicio(s) idéntico(s) repetido(s) y se conservará uno de cada. Tu plan, tus sesiones y tu progreso se mantienen.`, confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      const n = await cleanupDuplicates(app);
      app.render(); UI.toast(`${n} duplicado(s) eliminado(s)`);
    });

    refresh();
  }

  // opts.onSaved(id): en vez de repintar toda la vista (el catálogo repinta solo su
  // lista y conserva filtros). opts.name / opts.group: valores iniciales al crear.
  async function editExercise(app, ex, opts = {}) {
    const isNew = !ex;
    const initName = ex ? ex.name : (opts.name || '');
    const initGroup = ex ? (ex.muscleGroup || 'General') : (opts.group || '');
    const catalog = await DB.exercisesOf(app.activeUser.id);
    const categories = categoriesFrom(catalog);
    const byId = {};
    catalog.forEach(e => { byId[e.id] = e; });
    let subs = (ex && ex.substitutes ? [...ex.substitutes] : []).filter(id => byId[id]);
    // Lista de vídeos, en vivo: los inputs actualizan estos objetos según se escribe.
    let vids = DB.exVideos(ex).map(v => ({ url: v.url || '', label: v.label || '' }));

    const renderChips = (root) => {
      const box = root.querySelector('#subsBox');
      box.innerHTML = subs.length
        ? subs.map(id => `<span class="sub-chip">${UI.esc(byId[id].name)}<button type="button" data-rmsub="${id}">×</button></span>`).join('')
        : '<span class="dim" style="font-size:12px">Sin suplentes definidos.</span>';
      box.querySelectorAll('[data-rmsub]').forEach(b => b.addEventListener('click', () => { subs = subs.filter(x => x !== b.dataset.rmsub); renderChips(root); }));
    };

    const renderVids = (root) => {
      const box = root.querySelector('#vidsBox');
      box.innerHTML = vids.length
        ? vids.map((v, i) => `<div class="vid-row">
            <input class="inp vid-url" type="url" value="${UI.esc(v.url)}" placeholder="https://youtube.com/…">
            <input class="inp vid-label" type="text" value="${UI.esc(v.label)}" placeholder="Nombre (opcional)">
            <button type="button" class="vid-rm" data-rmvid="${i}" aria-label="Quitar vídeo">×</button>
          </div>`).join('')
        : '<span class="dim" style="font-size:12px">Sin vídeos.</span>';
      box.querySelectorAll('.vid-row').forEach((row, i) => {
        row.querySelector('.vid-url').addEventListener('input', (e) => { vids[i].url = e.target.value; });
        row.querySelector('.vid-label').addEventListener('input', (e) => { vids[i].label = e.target.value; });
      });
      box.querySelectorAll('[data-rmvid]').forEach(b => b.addEventListener('click', () => { vids.splice(+b.dataset.rmvid, 1); renderVids(root); }));
    };

    UI.modal({
      title: isNew ? 'Nuevo ejercicio' : 'Editar ejercicio',
      bodyHTML: `<div id="exForm">
        ${UI.field('Nombre', UI.input('name', initName))}
        <span class="field-label">Categoría (grupo muscular)</span>
        <button type="button" class="ed-cat-btn" id="exCatBtn" style="width:100%;margin-bottom:14px">${UI.esc(initGroup || 'Elegir categoría')} ▾</button>
        <input type="hidden" name="muscleGroup" value="${UI.esc(ex ? (ex.muscleGroup || '') : initGroup)}">
        ${UI.field('Tipo', UI.select('type', [
          { value: 'weight', label: 'Peso + repeticiones' },
          { value: 'reps', label: 'Repeticiones (peso corporal)' },
          { value: 'time', label: 'Tiempo / duración' },
          { value: 'check', label: 'Hecho / no hecho (sin números)' }], ex ? ex.type : 'weight'),
          'Determina qué campos verás al registrar la sesión.')}
        ${(() => {
          const tipo = ex ? ex.type : 'weight';
          const chosen = (ex && Array.isArray(ex.metrics)) ? ex.metrics : [];
          const opts = (fields, attr) => fields.map(f => `<label class="metric-opt"><input type="checkbox" ${attr}="${f.key}"${chosen.includes(f.key) ? ' checked' : ''}><span>${f.label}${f.unit ? ` <em>(${f.unit})</em>` : ''}</span></label>`).join('');
          // Un bloque por tipo que admite datos extra; se enseña el del tipo elegido.
          return `<div id="exMetrics" style="${tipo === 'time' ? '' : 'display:none'}">
            <span class="field-label">Datos a registrar (además del tiempo)</span>
            <div class="metric-opts">${opts(VSessions.TIME_FIELDS, 'data-mk')}</div>
            <p class="field-hint">Solo se mostrarán estos al registrar. También puedes cambiarlos durante el entreno.</p>
          </div>
          <div id="exMetricsChk" style="${tipo === 'check' ? '' : 'display:none'}">
            <span class="field-label">Datos a registrar (además de la marca)</span>
            <div class="metric-opts">${opts(VSessions.CHECK_FIELDS, 'data-mkc')}</div>
            <p class="field-hint">Opcional: cuánto duró, con qué peso… Si no eliges ninguno, solo se marca hecho o no hecho.</p>
          </div>`;
        })()}
        <div class="field">
          <span class="field-label">Vídeos · cómo se hace</span>
          <div class="vids-box" id="vidsBox"></div>
          <button type="button" class="btn ghost small" id="addVid">+ Añadir vídeo</button>
          <span class="field-hint">Se abren desde el entreno, sin buscarlos. Ponle nombre a cada uno (técnica, calentamiento, variante…) si quieres.</span>
        </div>
        ${UI.field('Notas de técnica', UI.textarea('howto', (ex && ex.howto) || '', 'Puntos clave: postura, tempo, hasta dónde bajar…', 3))}
        <span class="field-label">Suplentes (el sustituto de este ejercicio es…)</span>
        <div class="subs-box" id="subsBox"></div>
        <button type="button" class="btn ghost small" id="addSub">+ Añadir suplente</button>
        <p class="field-hint">Los suplentes también son ejercicios del catálogo. Puedes elegir uno existente o crear uno nuevo.</p>
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          const d = UI.readForm(root.querySelector('#exForm'));
          if (!d.name.trim()) { UI.toast('Escribe un nombre', 'err'); return false; }
          const nameKey = d.name.trim().toLowerCase();
          if (catalog.some(e => (e.name || '').trim().toLowerCase() === nameKey && (!ex || e.id !== ex.id))) {
            UI.toast('Ya existe un ejercicio con ese nombre', 'err'); return false;
          }
          const metrics = d.type === 'time'
            ? VSessions.TIME_FIELDS.map(f => f.key).filter(k => root.querySelector(`#exMetrics [data-mk="${k}"]`)?.checked)
            : d.type === 'check'
              ? VSessions.CHECK_FIELDS.map(f => f.key).filter(k => root.querySelector(`#exMetricsChk [data-mkc="${k}"]`)?.checked)
              : undefined;
          const videos = vids
            .map(v => ({ url: (v.url || '').trim(), label: (v.label || '').trim() }))
            .filter(v => v.url)
            .map(v => v.label ? { url: v.url, label: v.label } : { url: v.url });
          const firstUrl = videos.length ? videos[0].url : undefined; // compat con el campo videoUrl de siempre
          const videosField = videos.length ? videos : undefined;
          let savedId = ex ? ex.id : null;
          if (isNew) {
            savedId = DB.uid('ex');
            await DB.put('exercises', { id: savedId, userId: app.activeUser.id, name: d.name.trim(), muscleGroup: d.muscleGroup.trim() || 'General', type: d.type, substitutes: subs, metrics, videos: videosField, videoUrl: firstUrl, howto: (d.howto || '').trim() || undefined, createdAt: Date.now() });
          } else {
            await DB.updateExercise(app.activeUser.id, ex.id, { name: d.name.trim(), muscleGroup: d.muscleGroup.trim() || 'General', type: d.type, substitutes: subs, metrics, videos: videosField, videoUrl: firstUrl, howto: (d.howto || '').trim() || undefined });
            await app.refreshRoutine();
          }
          if (opts.onSaved) await opts.onSaved(savedId); else app.render();
          UI.toast(isNew ? 'Ejercicio creado' : 'Ejercicio guardado · cambios aplicados en toda la app');
        }},
      ],
      onMount: (root) => {
        renderChips(root);
        renderVids(root);
        root.querySelector('#addVid').addEventListener('click', () => { vids.push({ url: '', label: '' }); renderVids(root); });
        const typeSel = root.querySelector('#exForm select[name="type"]');
        const exMetrics = root.querySelector('#exMetrics');
        const exMetricsChk = root.querySelector('#exMetricsChk');
        if (typeSel && exMetrics) typeSel.addEventListener('change', () => {
          exMetrics.style.display = typeSel.value === 'time' ? '' : 'none';
          if (exMetricsChk) exMetricsChk.style.display = typeSel.value === 'check' ? '' : 'none';
        });
        const catBtn = root.querySelector('#exCatBtn');
        const catHidden = root.querySelector('#exForm input[name="muscleGroup"]');
        catBtn.addEventListener('click', () => {
          pickCategory({ categories, used: [], current: catHidden.value, counts: catCounts(catalog), onPick: (cat) => { catHidden.value = cat; catBtn.textContent = cat + ' ▾'; if (!categories.includes(cat)) categories.push(cat); } });
        });
        root.querySelector('#addSub').addEventListener('click', () => {
          const selfId = ex ? ex.id : null;
          const options = catalog.filter(e => e.id !== selfId && !subs.includes(e.id));
          UI.pickExercise({ exercises: options, onPick: async (picked) => {
            let chosen = picked;
            if (picked.isNew) {
              chosen = { id: DB.uid('ex'), userId: app.activeUser.id, name: picked.name, muscleGroup: picked.muscleGroup, type: picked.type, substitutes: [], createdAt: Date.now() };
              await DB.put('exercises', chosen); catalog.push(chosen); byId[chosen.id] = chosen;
            }
            if (!subs.includes(chosen.id)) subs.push(chosen.id);
            renderChips(root);
          } });
        });
      },
    });
  }

  // ---------- LUGARES ----------
  function emptyRoutine() {
    return `<div class="empty-state"><p>No hay rutina configurada.</p></div>`;
  }

  return { week, weekBind, day, dayBind, normalizeDayTypes, guides, guide, templateOf, guideList, findGuide, planChoicesHTML, bindPlanChoices, templatePreview, info, infoBind, exercises, exercisesBind, checkDuplicates };
})();
