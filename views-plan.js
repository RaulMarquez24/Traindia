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

  // Selector de categoría: reusar una existente o crear una nueva.
  function pickCategory({ categories, used = [], onPick }) {
    const avail = categories.filter(c => !used.includes(c));
    UI.modal({
      title: 'Categoría',
      bodyHTML: `<div class="menu-list">
        ${avail.length ? avail.map(c => `<button class="menu-row" data-cat="${UI.esc(c)}"><span>${UI.esc(c)}</span><span class="chev">›</span></button>`).join('') : '<p class="dim" style="padding:4px 2px">No quedan categorías sin usar. Crea una nueva.</p>'}
        <button class="menu-row" data-cat-new="1"><span>${UI.icon('plus', 16)} Nueva categoría…</span></button>
      </div>`,
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: (root) => {
        root.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { UI.closeModal(); onPick(b.dataset.cat); }));
        root.querySelector('[data-cat-new]').addEventListener('click', async () => {
          const name = await UI.prompt({ title: 'Nueva categoría', label: 'Nombre de la categoría', placeholder: 'Ej: Cardio', confirmLabel: 'Crear' });
          if (name && name.trim()) { UI.closeModal(); onPick(name.trim()); }
        });
      },
    });
  }

  // Selector de lugar: reusar uno existente o crear uno nuevo (especial o no).
  function pickPlace({ places, onPick }) {
    let overlay;
    overlay = UI.modal({
      title: 'Lugar de entreno',
      bodyHTML: `<div class="menu-list">
        ${places.map(p => `<button class="menu-row" data-place="${UI.esc(p.name)}"><span>${UI.esc(p.name)}${p.special ? ' <span class="badge soon">especial</span>' : ''}</span><span class="chev">›</span></button>`).join('')}
        <button class="menu-row" data-place-new="1"><span>${UI.icon('plus', 16)} Nueva ubicación…</span></button>
      </div>`,
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: (root) => {
        root.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => {
          const p = places.find(x => x.name === b.dataset.place);
          UI.closeModal(overlay); onPick(p);
        }));
        root.querySelector('[data-place-new]').addEventListener('click', () => {
          UI.modal({
            title: 'Nueva ubicación',
            bodyHTML: `<div id="newPlaceForm">
              ${UI.field('Nombre', UI.input('name', '', { placeholder: 'Ej: Parque' }))}
              <label class="mini-check"><input type="checkbox" name="special"> Lugar especial (se resalta en rojo)</label>
            </div>`,
            actions: [
              { label: 'Cancelar', kind: 'ghost' },
              { label: 'Crear', kind: 'primary', onClick: (r2) => {
                const d = UI.readForm(r2.querySelector('#newPlaceForm'));
                if (!d.name.trim()) { UI.toast('Escribe un nombre', 'err'); return false; }
                UI.closeModal(overlay);
                onPick({ name: d.name.trim(), special: !!d.special });
              }},
            ],
          });
        });
      },
    });
  }

  // ---------- SEMANA ----------
  function week(app) {
    const r = app.routine;
    if (!r) return emptyRoutine();
    const days = r.days.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(d => {
      const placeClass = d.placeAccent ? 'parque' : '';
      const metaRight = d.isRest
        ? `<span class="day-place">${UI.esc(d.place || '')}</span>`
        : `<span class="day-place ${placeClass}">${UI.esc(d.place || '')}${d.duration ? ` · <strong>${UI.esc(d.duration)}</strong>` : ''}</span>`;
      return `
        <a class="day-card ${d.type}" data-link="day" data-params='${JSON.stringify({ dayId: d.id })}'>
          <div class="day-row-1">
            <span class="day-name">${UI.esc(d.name)}</span>
            <span class="day-tag tag-${d.type}">${UI.esc(d.typeLabel || TYPE_LABELS[d.type] || '')}</span>
          </div>
          <div class="day-focus">${UI.esc(d.focus || '')}</div>
          <div class="day-meta">${metaRight}<span class="day-arrow">›</span></div>
        </a>`;
    }).join('');

    return `<div class="week-days">${days}</div>`;
  }

  function weekBind() {}

  // ---------- DÍA ----------
  function isDefaultDay(d) {
    return typeof PLAN_DATA !== 'undefined' && PLAN_DATA.days.some(x => x.id === d.id);
  }

  async function day(app, params) {
    const d = (app.routine?.days || []).find(x => x.id === params.dayId);
    if (!d) return `<div class="empty-state"><p>Día no encontrado.</p></div>`;
    const restoreBtn = (isDefaultDay(d) && app.isCnp()) ? `<button class="btn ghost" data-act="restore-day">${UI.icon('refresh', 16)} Restaurar día</button>` : '';
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
          ${restoreBtn}
        </div>`;
    }

    const blocks = d.blocks.map((b, bi) => {
      const items = b.exercises.map(ex => {
        const nameCls = ex.priority ? 'ex-name priority' : 'ex-name';
        const optCls = ex.optional ? 'optional' : '';
        const sl = subsLine(ex);
        return `<li class="${optCls}"><span class="ex-line-main"><span class="${nameCls}">${UI.esc(ex.name)}</span>${sl}</span><span class="ex-sets">${UI.esc(ex.sets || '')}</span></li>`;
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
    if (app.isCnp() && d.relatedGuides && d.relatedGuides.length) {
      const links = d.relatedGuides.map(gid => {
        const g = PLAN_DATA.guides.find(x => x.id === gid);
        if (!g) return '';
        return `<a class="guide-link" data-link="guide" data-params='${JSON.stringify({ guideId: g.id })}'><span>${UI.esc(g.title)}</span><span class="guide-link-arrow">›</span></a>`;
      }).join('');
      related = `<div class="related-guides"><div class="block-label">Guías relacionadas</div>${links}</div>`;
    }

    const placeClass = d.placeAccent ? 'parque' : '';
    return `
      <div class="detail-hero">
        <span class="day-tag tag-${d.type}">${UI.esc(d.typeLabel || '')}</span>
        <h2>${UI.esc(d.name)}</h2>
        <div class="focus">${UI.esc(d.focus || '')}</div>
        <div class="meta">
          ${d.place ? `<span class="${placeClass}">${UI.icon('pin', 13)} ${UI.esc(d.place)}</span>` : ''}
          ${d.duration ? `<span>${UI.icon('clock', 13)} ${UI.esc(d.duration)}</span>` : ''}
        </div>
      </div>
      <button class="btn primary block" data-act="start">${UI.icon('play', 15)} Empezar entreno</button>
      ${blocks}
      ${substitutes}
      ${related}
      <div class="detail-toolbar">
        <button class="btn ghost" data-act="edit-day">${UI.icon('edit', 16)} Editar día</button>
        <button class="btn ghost" data-act="share-day">${UI.icon('upload', 16)} Compartir</button>
        <button class="btn ghost" data-act="swap-day">${UI.icon('swap', 16)} Intercambiar</button>
        ${restoreBtn}
      </div>`;
  }

  function dayBind(app, root, params) {
    const d = (app.routine?.days || []).find(x => x.id === params.dayId);
    if (!d) return;
    const start = root.querySelector('[data-act="start"]');
    if (start) start.addEventListener('click', () => app.go('live', { dayId: d.id }));
    root.querySelector('[data-act="edit-day"]').addEventListener('click', () => editDay(app, d));
    const share = root.querySelector('[data-act="share-day"]');
    if (share) share.addEventListener('click', () => VData.exportDay(app, d.id));
    const swap = root.querySelector('[data-act="swap-day"]');
    if (swap) swap.addEventListener('click', () => swapDayFlow(app, d));
    const restore = root.querySelector('[data-act="restore-day"]');
    if (restore) restore.addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: `Restaurar ${d.name}`,
        message: `CUIDADO: esto devuelve SOLO el día "${d.name}" al entrenamiento predefinido y BORRA tus cambios en este día (ejercicios, series, orden…). No se puede deshacer. No afecta a los demás días, ni a tus sesiones o progreso.`,
        confirmLabel: 'Sí, restaurar día', danger: true, requireText: 'RESTAURAR',
      });
      if (!ok) return;
      await DB.restoreDefaultDay(app.activeUser.id, d.id);
      await app.refreshRoutine();
      app.go('day', { dayId: d.id }, true);
      UI.toast('Día restaurado');
    });
  }

  // Intercambia el CONTENIDO de dos días (mantiene id, nombre y posición/semana).
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
  const EX_TYPE_SHORT = { weight: 'peso+reps', reps: 'reps', time: 'tiempo' };

  async function editDay(app, d) {
    const catalog = await DB.exercisesOf(app.activeUser.id); // lista mutable
    const categories = categoriesFrom(catalog); // establecidas; se amplían al crear nuevas
    const places = await DB.getPlaces(); // lugares establecidos (mutable)
    const draft = JSON.parse(JSON.stringify(d));
    let rerender;

    const rowHTML = (ex, bi, ei) => `
      <div class="ed-ex" data-bi="${bi}" data-ei="${ei}">
        <input type="hidden" data-f="exerciseId" value="${UI.esc(ex.exerciseId || '')}">
        <input type="hidden" data-f="name" value="${UI.esc(ex.name || '')}">
        <input type="hidden" data-f="type" value="${UI.esc(ex.type || 'weight')}">
        <div class="ed-ex-top">
          <button type="button" class="ed-ex-pick${ex.name ? '' : ' empty'}" data-pick>${ex.name ? UI.esc(ex.name) : UI.icon('plus', 15) + ' Elegir ejercicio'}</button>
          <input class="inp narrow" data-f="sets" value="${UI.esc(ex.sets || '')}" placeholder="4×8">
        </div>
        <div class="ed-ex-bottom">
          <span class="ex-type">${EX_TYPE_SHORT[ex.type || 'weight']}</span>
          <label class="mini-check"><input type="checkbox" data-f="priority"${ex.priority ? ' checked' : ''}> Prior.</label>
          <label class="mini-check"><input type="checkbox" data-f="optional"${ex.optional ? ' checked' : ''}> Opc.</label>
          <span class="ed-ex-moves">
            <button class="icon-btn" data-mv="up">↑</button>
            <button class="icon-btn" data-mv="down">↓</button>
            <button class="icon-btn danger" data-mv="del">×</button>
          </span>
        </div>
      </div>`;

    const editorHTML = () => {
      const meta = `<div class="editor-meta" id="dayMeta">
        ${UI.field('Nombre', UI.input('name', draft.name))}
        ${UI.field('Tipo de día', UI.select('type', [
          { value: 'strong', label: 'Día fuerte' }, { value: 'moderate', label: 'Día moderado' },
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
        <div class="ed-block" data-block="${bi}">
          <div class="ed-block-head">
            <button type="button" class="ed-cat-btn" data-block-cat="${bi}">${UI.esc(b.label || 'Categoría')} ▾</button>
            <label class="mini-check"><input type="checkbox" data-block-opt="${bi}"${b.optional ? ' checked' : ''}> Opcional</label>
            <button class="icon-btn danger" data-del-block="${bi}">${UI.icon('trash', 17)}</button>
          </div>
          ${b.exercises.map((ex, ei) => rowHTML(ex, bi, ei)).join('')}
          <button class="btn ghost small" data-add-ex="${bi}">+ Ejercicio</button>
        </div>`).join('');
      return meta + `<div class="editor-blocks">${blocks}</div><button class="btn ghost block" id="addBlock">+ Añadir categoría</button>` + planBHTML;
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
      });
      root.querySelectorAll('[data-block-opt]').forEach(c => { draft.blocks[+c.dataset.blockOpt].optional = c.checked; });
    };
    const syncSafe = (root) => { try { sync(root); } catch (e) { readMeta(root); } };

    // Abre el buscador filtrado a una categoría: solo ejercicios de ese grupo y no
    // presentes ya en el día. Crear uno nuevo lo fija a esa categoría.
    const openPicker = (category, cb) => {
      const inDay = new Set();
      draft.blocks.forEach(bl => (bl.exercises || []).forEach(x => { if (x.exerciseId) inDay.add(x.exerciseId); }));
      const opts = catalog.filter(e => (e.muscleGroup || 'General') === category && !inDay.has(e.id));
      UI.pickExercise({ exercises: opts, title: `Añadir a ${category}`, lockGroup: category, onPick: async (picked) => {
        let ex = picked;
        if (picked.isNew) {
          ex = { id: DB.uid('ex'), userId: app.activeUser.id, name: picked.name, muscleGroup: category, type: picked.type, createdAt: Date.now() };
          await DB.put('exercises', ex); catalog.push(ex);
          if (!categories.includes(category)) categories.push(category);
        }
        cb(ex);
      } });
    };

    const bindBody = (root) => {
      const typeSel = root.querySelector('#dayMeta select[name="type"]');
      if (typeSel) typeSel.addEventListener('change', () => { syncSafe(root); draft.type = typeSel.value; rerender(root); });
      root.querySelectorAll('[data-add-ex]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const bi = +b.dataset.addEx;
        const cat = draft.blocks[bi].label || 'General';
        openPicker(cat, (ex) => { draft.blocks[bi].exercises.push({ exerciseId: ex.id, name: ex.name, type: ex.type, sets: '', priority: false, optional: false }); rerender(root); });
      }));
      root.querySelectorAll('[data-block-cat]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const bi = +b.dataset.blockCat;
        const used = draft.blocks.map((bl, i) => i !== bi ? bl.label : null).filter(Boolean);
        pickCategory({ categories, used, onPick: (cat) => { draft.blocks[bi].label = cat; if (!categories.includes(cat)) categories.push(cat); rerender(root); } });
      }));
      const addBlock = root.querySelector('#addBlock');
      if (addBlock) addBlock.addEventListener('click', () => {
        sync(root);
        const used = draft.blocks.map(bl => bl.label).filter(Boolean);
        pickCategory({ categories, used, onPick: (cat) => { draft.blocks.push({ label: cat, optional: false, exercises: [] }); if (!categories.includes(cat)) categories.push(cat); rerender(root); } });
      });
      root.querySelectorAll('[data-del-block]').forEach(b => b.addEventListener('click', () => { sync(root); draft.blocks.splice(+b.dataset.delBlock, 1); rerender(root); }));
      root.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const w = b.closest('.ed-ex'); const bi = +w.dataset.bi, ei = +w.dataset.ei; const arr = draft.blocks[bi].exercises;
        if (b.dataset.mv === 'del') arr.splice(ei, 1);
        else if (b.dataset.mv === 'up' && ei > 0) { [arr[ei - 1], arr[ei]] = [arr[ei], arr[ei - 1]]; }
        else if (b.dataset.mv === 'down' && ei < arr.length - 1) { [arr[ei + 1], arr[ei]] = [arr[ei], arr[ei + 1]]; }
        rerender(root);
      }));
      root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        sync(root);
        const w = b.closest('.ed-ex'); const bi = +w.dataset.bi, ei = +w.dataset.ei;
        const cat = draft.blocks[bi].label || 'General';
        openPicker(cat, (ex) => { const row = draft.blocks[bi].exercises[ei]; row.name = ex.name; row.exerciseId = ex.id; row.type = ex.type; rerender(root); });
      }));
      const placeBtn = root.querySelector('#dayPlaceBtn');
      if (placeBtn) placeBtn.addEventListener('click', () => {
        syncSafe(root);
        pickPlace({ places, onPick: (p) => {
          draft.place = p.name; draft.placeAccent = !!p.special;
          if (!places.find(x => x.name === p.name)) { places.push(p); DB.savePlaces(places); }
          rerender(root);
        } });
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
          Object.assign(d, draft);
          d.typeLabel = TYPE_LABELS[d.type] || d.typeLabel;
          d.isRest = d.type === 'rest';
          await saveRoutine(app);
          app.render();
          UI.toast('Día guardado');
        }},
      ],
      onMount: (root) => rerender(root),
    });
  }

  // ---------- GUÍAS (estáticas) ----------
  function guides() {
    const cards = PLAN_DATA.guides.map(g => `
      <a class="guide-card" data-link="guide" data-params='${JSON.stringify({ guideId: g.id })}'>
        <div class="num">GUÍA ${UI.esc(g.number)}</div>
        <h3>${UI.esc(g.title)}</h3>
        <p>${UI.esc(g.summary)}</p>
      </a>`).join('');
    return `<div class="week-intro"><div class="eyebrow">Documentación detallada</div><h2>Guías</h2><p>Información completa sobre cada parte del plan.</p></div><div class="guides-list">${cards}</div>`;
  }

  function guide(app, params) {
    const g = PLAN_DATA.guides.find(x => x.id === params.guideId);
    if (!g) return `<div class="empty-state"><p>Guía no encontrada.</p></div>`;
    return `<div class="guide-content"><div class="guide-eyebrow">GUÍA ${UI.esc(g.number)}</div><h2>${UI.esc(g.title)}</h2>${g.content}</div>`;
  }

  // ---------- PLANES (gestor de planes) ----------
  const PLAN_TYPE_LABEL = { cnp: 'CNP', custom: 'Personalizado' };

  async function info(app) {
    const routines = (await DB.routinesOf(app.activeUser.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
    const activeId = app.routine && app.routine.id;

    const planCards = routines.map(r => {
      const tDays = (r.days || []).filter(d => !d.isRest).length;
      const isActive = r.id === activeId;
      const typeBadge = `<span class="badge${(r.planType === 'custom') ? ' guest' : ''}">${PLAN_TYPE_LABEL[r.planType] || 'CNP'}</span>`;
      return `<div class="plan-card${isActive ? ' active' : ''}">
        <div class="plan-card-main">
          <strong>${UI.esc(r.name)} ${typeBadge}${isActive ? ' <span class="badge">Activo</span>' : ''}</strong>
          <span class="dim">${tDays} días de entreno</span>
        </div>
        <span class="plan-card-actions">
          ${isActive ? '' : `<button class="btn ghost small" data-activate="${r.id}">Activar</button>`}
          ${isActive ? '' : `<button class="icon-btn danger" data-del-plan="${r.id}" title="Eliminar plan">${UI.icon('trash', 17)}</button>`}
        </span>
      </div>`;
    }).join('');

    const cnpInfo = app.isCnp() ? `
      <div class="catalog-title" style="margin-top:8px">Sobre este plan</div>
      <div class="block"><div class="block-label">Datos atleta</div>
        <ul class="ex-list">
          <li><span class="ex-name">Altura</span><span class="ex-sets">168 cm</span></li>
          <li><span class="ex-name">Peso</span><span class="ex-sets">60-65 kg</span></li>
          <li><span class="ex-name">Sede actual</span><span class="ex-sets">Basic Fit</span></li>
          <li><span class="ex-name">Sede junio</span><span class="ex-sets">Go Fit</span></li>
        </ul></div>
      <div class="block"><div class="block-label">Objetivos prioritarios</div>
        <ul class="ex-list">
          <li><span class="ex-name priority">Dominadas</span><span class="ex-sets">★ alta</span></li>
          <li><span class="ex-name priority">Suspensión supina</span><span class="ex-sets">★ alta</span></li>
          <li><span class="ex-name">1 km carrera</span><span class="ex-sets">media</span></li>
          <li><span class="ex-name">Agilidad / circuito</span><span class="ex-sets">media</span></li>
          <li><span class="ex-name">Fuerza general</span><span class="ex-sets">base</span></li>
        </ul></div>
      <div class="block"><div class="block-label">Estructura</div>
        <ul class="ex-list">
          <li><span class="ex-name">Días entreno</span><span class="ex-sets">5</span></li>
          <li><span class="ex-name">Días ligeros</span><span class="ex-sets">1</span></li>
          <li><span class="ex-name">Descanso</span><span class="ex-sets">1 (vie)</span></li>
          <li><span class="ex-name">Duración fase</span><span class="ex-sets">8-10 sem</span></li>
        </ul></div>
      <div class="related-guides"><div class="block-label">Guías clave</div>
        <a class="guide-link" data-link="guide" data-params='${JSON.stringify({ guideId: 'logica-semana' })}'><span>Lógica de la semana</span><span class="guide-link-arrow">›</span></a>
        <a class="guide-link" data-link="guide" data-params='${JSON.stringify({ guideId: 'analisis-nivel' })}'><span>Análisis de tu nivel</span><span class="guide-link-arrow">›</span></a>
        <a class="guide-link" data-link="guide" data-params='${JSON.stringify({ guideId: 'progresion-dominadas' })}'><span>Progresión de dominadas</span><span class="guide-link-arrow">›</span></a>
      </div>` : '';

    return `
      <div class="week-intro"><div class="eyebrow">Tus planes</div><h2>Planes</h2><p>Cambia entre planes o crea uno nuevo. El plan activo decide qué guías y contenido ves.</p></div>
      ${planCards}
      <button class="btn ghost block" id="newPlan">${UI.icon('plus', 16)} Crear plan</button>
      ${cnpInfo}
      <p class="version-foot">Traindía · v2.1.0</p>`;
  }

  function infoBind(app, root) {
    root.querySelectorAll('[data-activate]').forEach(b => b.addEventListener('click', async () => {
      await DB.setActivePlan(app.activeUser.id, b.dataset.activate);
      await app.refreshRoutine();
      app.render();
      UI.toast('Plan activado');
    }));
    root.querySelectorAll('[data-del-plan]').forEach(b => b.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Eliminar plan', message: 'Se borra este plan (sus días y rutina). Tus sesiones y progreso NO se tocan.', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.deletePlan(b.dataset.delPlan);
      app.render();
      UI.toast('Plan eliminado');
    }));
    const newPlan = root.querySelector('#newPlan');
    if (newPlan) newPlan.addEventListener('click', () => createPlanModal(app));
  }

  function createPlanModal(app) {
    let type = 'cnp';
    UI.modal({
      title: 'Crear plan',
      bodyHTML: `<div id="newPlanForm">
        ${UI.field('Nombre', UI.input('name', '', { placeholder: 'Ej: Mi plan' }))}
        <span class="field-label">Tipo de plan</span>
        <div class="plan-choices" id="planChoices">
          <button type="button" class="plan-choice sel" data-plan="cnp"><strong>Plan CNP (mujer)</strong><span class="dim">Rutina completa, guías y contenido CNP.</span></button>
          <button type="button" class="plan-choice" data-plan="custom"><strong>Plan personalizado</strong><span class="dim">7 días vacíos. Sin guías ni contenido CNP.</span></button>
          <div class="plan-choice disabled"><strong>Más planes <span class="badge soon">Próximamente</span></strong></div>
        </div>
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear y activar', kind: 'primary', onClick: async (rootEl) => {
          const d = UI.readForm(rootEl.querySelector('#newPlanForm'));
          await DB.createPlan(app.activeUser.id, type, { name: d.name.trim() || undefined, activate: true });
          await app.refreshRoutine();
          app.go('info', {}, true);
          UI.toast('Plan creado y activado');
        }},
      ],
      onMount: (rootEl) => rootEl.querySelectorAll('.plan-choice[data-plan]').forEach(b => b.addEventListener('click', () => {
        rootEl.querySelectorAll('.plan-choice').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel'); type = b.dataset.plan;
      })),
    });
  }

  // ---------- CATÁLOGO DE EJERCICIOS ----------
  const TYPE_NAME = { weight: 'Peso+reps', reps: 'Reps', time: 'Tiempo' };

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

  async function exercises(app) {
    const list = (await DB.exercisesOf(app.activeUser.id)).sort((a, b) => a.name.localeCompare(b.name));
    const usage = buildUsage(app.routine);
    const byId = {};
    list.forEach(e => { byId[e.id] = e; });
    // Los suplentes de un ejercicio en uso también se consideran en uso.
    list.forEach(e => {
      const direct = usage.get(e.id.toLowerCase()) || usage.get(e.name.toLowerCase());
      if (direct && e.substitutes) e.substitutes.forEach(sid => {
        if (!byId[sid]) return;
        const k = sid.toLowerCase();
        if (!usage.has(k)) usage.set(k, new Set());
        usage.get(k).add('suplente');
      });
    });
    const daysUsing = (e) => {
      const s = new Set([...(usage.get(e.id.toLowerCase()) || []), ...(usage.get(e.name.toLowerCase()) || [])]);
      return [...s];
    };

    const inUse = [], unused = [];
    list.forEach(e => { (daysUsing(e).length ? inUse : unused).push(e); });

    const item = (e, deletable) => {
      const days = daysUsing(e);
      const sub = days.length ? 'en ' + days.join(', ') : (e.muscleGroup || 'General');
      return `<li data-search="${UI.esc(UI.norm(e.name + ' ' + (e.muscleGroup || '')))}">
        <span class="ex-name-wrap">
          <span class="ex-name">${UI.esc(e.name)}${e.isDefault ? ' <span class="badge def">def</span>' : ''}</span>
          <span class="ex-sub">${UI.esc(sub)}</span>
        </span>
        <span class="ex-actions">
          <span class="ex-type">${TYPE_NAME[e.type] || e.type}</span>
          <button class="icon-btn" data-edit="${e.id}">${UI.icon('edit', 17)}</button>
          ${deletable ? `<button class="icon-btn danger" data-del="${e.id}">${UI.icon('trash', 17)}</button>` : ''}
        </span></li>`;
    };

    // "En uso" agrupado por bloques (grupo muscular) para encontrarlos fácil
    const groups = {};
    inUse.forEach(e => { const g = e.muscleGroup || 'General'; (groups[g] = groups[g] || []).push(e); });
    const inUseHTML = Object.keys(groups).sort().map(g =>
      `<div class="block"><div class="block-label">${UI.esc(g)}</div><ul class="ex-list">${groups[g].map(e => item(e, false)).join('')}</ul></div>`
    ).join('');

    return `<div class="section">
      <p class="section-intro">Catálogo de <strong>${UI.esc(app.activeUser.name)}</strong>. Los ejercicios están vinculados a los días de tu rutina: si quitas uno de todos tus días pasa a <strong>desuso</strong>. Los predefinidos <span class="badge def">def</span> no se pueden borrar (siempre están disponibles); los tuyos en desuso sí.</p>
      <input class="inp" id="exCatalogSearch" placeholder="Buscar ejercicio…" autocomplete="off" style="margin-bottom:14px">
      <div id="catalogBody">
      <div class="catalog-title">En uso (${inUse.length})</div>
      ${inUse.length ? inUseHTML : '<p class="dim" style="padding:2px 0 14px">Ningún ejercicio en uso.</p>'}
      <div class="catalog-title">En desuso (${unused.length})</div>
      ${unused.length ? `<ul class="ex-list">${unused.map(e => item(e, !e.isDefault)).join('')}</ul>` : '<p class="dim" style="padding:2px 0">No hay ejercicios en desuso.</p>'}
      </div>
      <p class="dim" id="catalogNoResults" style="display:none;padding:12px 2px">Sin resultados.</p>
      <button class="btn primary block" id="addEx" style="margin-top:16px">+ Nuevo ejercicio</button>
    </div>`;
  }

  function exercisesBind(app, root) {
    const search = root.querySelector('#exCatalogSearch');
    if (search) search.addEventListener('input', () => {
      const q = UI.norm(search.value);
      let anyVisible = false;
      root.querySelectorAll('#catalogBody .ex-list li').forEach(li => {
        const hay = li.dataset.search || UI.norm(li.textContent);
        const match = !q || hay.includes(q);
        li.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
      });
      // ocultar bloques de grupo (En uso) sin resultados, y los títulos de sección si quedan vacíos
      root.querySelectorAll('#catalogBody .block').forEach(b => {
        const vis = [...b.querySelectorAll('.ex-list li')].some(li => li.style.display !== 'none');
        b.style.display = vis ? '' : 'none';
      });
      const noRes = root.querySelector('#catalogNoResults');
      if (noRes) noRes.style.display = anyVisible ? 'none' : '';
    });
    root.querySelector('#addEx').addEventListener('click', () => editExercise(app, null));
    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => {
      const ex = await DB.get('exercises', b.dataset.edit);
      editExercise(app, ex);
    }));
    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const ex = await DB.get('exercises', b.dataset.del);
      const msg = ex.isDefault
        ? 'Está en desuso. Es un ejercicio predefinido: se quitará del catálogo pero podrás recuperarlo con “Restaurar predefinidos”. No afecta a las sesiones ya registradas.'
        : 'Está en desuso (no se usa en ningún día). Se eliminará del catálogo. No afecta a las sesiones ya registradas.';
      const ok = await UI.confirm({ title: `Eliminar ${ex.name}`, message: msg, confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.del('exercises', ex.id);
      app.render();
      UI.toast('Ejercicio eliminado');
    }));
  }

  async function editExercise(app, ex) {
    const isNew = !ex;
    const catalog = await DB.exercisesOf(app.activeUser.id);
    const categories = categoriesFrom(catalog);
    const byId = {};
    catalog.forEach(e => { byId[e.id] = e; });
    let subs = (ex && ex.substitutes ? [...ex.substitutes] : []).filter(id => byId[id]);

    const renderChips = (root) => {
      const box = root.querySelector('#subsBox');
      box.innerHTML = subs.length
        ? subs.map(id => `<span class="sub-chip">${UI.esc(byId[id].name)}<button type="button" data-rmsub="${id}">×</button></span>`).join('')
        : '<span class="dim" style="font-size:12px">Sin suplentes definidos.</span>';
      box.querySelectorAll('[data-rmsub]').forEach(b => b.addEventListener('click', () => { subs = subs.filter(x => x !== b.dataset.rmsub); renderChips(root); }));
    };

    UI.modal({
      title: isNew ? 'Nuevo ejercicio' : 'Editar ejercicio',
      bodyHTML: `<div id="exForm">
        ${UI.field('Nombre', UI.input('name', ex ? ex.name : ''))}
        <span class="field-label">Categoría (grupo muscular)</span>
        <button type="button" class="ed-cat-btn" id="exCatBtn" style="width:100%;margin-bottom:14px">${UI.esc(ex ? (ex.muscleGroup || 'General') : 'Elegir categoría')} ▾</button>
        <input type="hidden" name="muscleGroup" value="${UI.esc(ex ? (ex.muscleGroup || '') : '')}">
        ${UI.field('Tipo', UI.select('type', [
          { value: 'weight', label: 'Peso + repeticiones' },
          { value: 'reps', label: 'Repeticiones (peso corporal)' },
          { value: 'time', label: 'Tiempo / duración' }], ex ? ex.type : 'weight'),
          'Determina qué campos verás al registrar la sesión.')}
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
          if (isNew) {
            await DB.put('exercises', { id: DB.uid('ex'), userId: app.activeUser.id, name: d.name.trim(), muscleGroup: d.muscleGroup.trim() || 'General', type: d.type, substitutes: subs, createdAt: Date.now() });
          } else {
            await DB.updateExercise(app.activeUser.id, ex.id, { name: d.name.trim(), muscleGroup: d.muscleGroup.trim() || 'General', type: d.type, substitutes: subs });
            await app.refreshRoutine();
          }
          app.render();
          UI.toast('Ejercicio guardado · cambios aplicados en toda la app');
        }},
      ],
      onMount: (root) => {
        renderChips(root);
        const catBtn = root.querySelector('#exCatBtn');
        const catHidden = root.querySelector('#exForm input[name="muscleGroup"]');
        catBtn.addEventListener('click', () => {
          pickCategory({ categories, used: [], onPick: (cat) => { catHidden.value = cat; catBtn.textContent = cat + ' ▾'; if (!categories.includes(cat)) categories.push(cat); } });
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
  async function places(app) {
    const list = await DB.getPlaces();
    const rows = list.map((p, i) => `<div class="profile-card">
      <div class="profile-meta">
        <strong>${UI.esc(p.name)} ${p.special ? '<span class="badge soon">especial</span>' : ''}</strong>
        <span class="dim">${p.special ? 'Se resalta en rojo' : 'Normal'}</span>
      </div>
      <div class="profile-actions">
        <button class="icon-btn" data-edit-place="${i}">${UI.icon('edit', 17)}</button>
        <button class="icon-btn danger" data-del-place="${i}">${UI.icon('trash', 17)}</button>
      </div>
    </div>`).join('');
    return `<div class="section">
      <p class="section-intro">Lugares donde entrenas. Los <strong>especiales</strong> se resaltan en rojo (como el parque). Se usan al elegir el lugar de un día.</p>
      ${rows || '<div class="empty-state"><p>Aún no hay lugares.</p></div>'}
      <button class="btn primary block" id="addPlace">+ Nueva ubicación</button>
    </div>`;
  }

  function placesBind(app, root) {
    root.querySelector('#addPlace').addEventListener('click', () => editPlace(app, null, -1));
    root.querySelectorAll('[data-edit-place]').forEach(b => b.addEventListener('click', async () => {
      const list = await DB.getPlaces(); const i = +b.dataset.editPlace;
      editPlace(app, list[i], i);
    }));
    root.querySelectorAll('[data-del-place]').forEach(b => b.addEventListener('click', async () => {
      const list = await DB.getPlaces(); const i = +b.dataset.delPlace; const p = list[i];
      const ok = await UI.confirm({ title: `Eliminar ${p.name}`, message: 'Se quita de la lista de lugares. Los días que ya lo usan conservan su texto.', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      list.splice(i, 1); await DB.savePlaces(list); app.render(); UI.toast('Lugar eliminado');
    }));
  }

  // Propaga un cambio de lugar a los días de la rutina que lo usaban.
  async function applyPlaceToDays(app, oldName, newName, special) {
    const rts = await DB.routinesOf(app.activeUser.id);
    for (const rt of rts) {
      let changed = false;
      (rt.days || []).forEach(d => { if ((d.place || '') === oldName) { d.place = newName; d.placeAccent = special; changed = true; } });
      if (changed) await DB.put('routines', rt);
    }
    await app.refreshRoutine();
  }

  function editPlace(app, existing, index) {
    const isNew = !existing;
    UI.modal({
      title: isNew ? 'Nueva ubicación' : 'Editar ubicación',
      bodyHTML: `<div id="placeForm">
        ${UI.field('Nombre', UI.input('name', existing ? existing.name : '', { placeholder: 'Ej: Parque' }))}
        <label class="mini-check"><input type="checkbox" name="special"${existing && existing.special ? ' checked' : ''}> Lugar especial (se resalta en rojo)</label>
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          const d = UI.readForm(root.querySelector('#placeForm'));
          if (!d.name.trim()) { UI.toast('Escribe un nombre', 'err'); return false; }
          const name = d.name.trim(), special = !!d.special;
          const list = await DB.getPlaces();
          const dup = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
          if (isNew) {
            if (dup !== -1) { UI.toast('Ya existe esa ubicación', 'err'); return false; }
            list.push({ name, special });
          } else {
            const old = list[index];
            if (dup !== -1 && dup !== index) { UI.toast('Ya existe esa ubicación', 'err'); return false; }
            list[index] = { name, special };
            await applyPlaceToDays(app, old.name, name, special);
          }
          await DB.savePlaces(list);
          app.render();
          UI.toast('Ubicación guardada');
        }},
      ],
    });
  }

  function emptyRoutine() {
    return `<div class="empty-state"><p>No hay rutina configurada.</p></div>`;
  }

  return { week, weekBind, day, dayBind, guides, guide, info, infoBind, exercises, exercisesBind, places, placesBind };
})();
