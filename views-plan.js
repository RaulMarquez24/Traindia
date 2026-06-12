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
        <button class="menu-row" data-cat-new="1"><span>➕ Nueva categoría…</span></button>
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
    const restoreBtn = isDefaultDay(d) ? `<button class="btn ghost" data-act="restore-day">🔄 Restaurar día</button>` : '';
    const byId = {};
    (await DB.exercisesOf(app.activeUser.id)).forEach(e => { byId[e.id] = e; });
    const subsLine = (ex) => {
      const ids = (ex.exerciseId && byId[ex.exerciseId] && byId[ex.exerciseId].substitutes) || [];
      const names = ids.map(id => byId[id] && byId[id].name).filter(Boolean);
      return names.length ? `<span class="ex-subs">↻ ${names.map(UI.esc).join(' · ')}</span>` : '';
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
          <button class="btn ghost" data-act="edit-day">✏️ Editar día</button>
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
    if (d.relatedGuides && d.relatedGuides.length) {
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
          ${d.place ? `<span class="${placeClass}">📍 ${UI.esc(d.place)}</span>` : ''}
          ${d.duration ? `<span>⏱ ${UI.esc(d.duration)}</span>` : ''}
        </div>
      </div>
      <button class="btn primary block" data-act="start">▶ Empezar entreno</button>
      ${blocks}
      ${substitutes}
      ${related}
      <div class="detail-toolbar">
        <button class="btn ghost" data-act="edit-day">✏️ Editar día</button>
        <button class="btn ghost" data-act="share-day">📤 Compartir</button>
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
    const restore = root.querySelector('[data-act="restore-day"]');
    if (restore) restore.addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: `⚠️ Restaurar ${d.name}`,
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

  // ---- Editor de día (modal grande, con buscador de ejercicios) ----
  const EX_TYPE_SHORT = { weight: 'peso+reps', reps: 'reps', time: 'tiempo' };

  async function editDay(app, d) {
    const catalog = await DB.exercisesOf(app.activeUser.id); // lista mutable
    const categories = categoriesFrom(catalog); // establecidas; se amplían al crear nuevas
    const draft = JSON.parse(JSON.stringify(d));
    let rerender;

    const rowHTML = (ex, bi, ei) => `
      <div class="ed-ex" data-bi="${bi}" data-ei="${ei}">
        <input type="hidden" data-f="exerciseId" value="${UI.esc(ex.exerciseId || '')}">
        <input type="hidden" data-f="name" value="${UI.esc(ex.name || '')}">
        <input type="hidden" data-f="type" value="${UI.esc(ex.type || 'weight')}">
        <div class="ed-ex-top">
          <button type="button" class="ed-ex-pick${ex.name ? '' : ' empty'}" data-pick>${ex.name ? UI.esc(ex.name) : '➕ Elegir ejercicio'}</button>
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
        ${UI.field('Lugar', UI.input('place', draft.place || ''))}
        ${UI.field('Duración', UI.input('duration', draft.duration || ''))}
      </div>`;
      if (draft.type === 'rest') return meta + `<p class="field-hint">Los días de descanso no tienen ejercicios.</p>`;
      const blocks = (draft.blocks || []).map((b, bi) => `
        <div class="ed-block" data-block="${bi}">
          <div class="ed-block-head">
            <button type="button" class="ed-cat-btn" data-block-cat="${bi}">${UI.esc(b.label || 'Categoría')} ▾</button>
            <label class="mini-check"><input type="checkbox" data-block-opt="${bi}"${b.optional ? ' checked' : ''}> Opcional</label>
            <button class="icon-btn danger" data-del-block="${bi}">🗑️</button>
          </div>
          ${b.exercises.map((ex, ei) => rowHTML(ex, bi, ei)).join('')}
          <button class="btn ghost small" data-add-ex="${bi}">+ Ejercicio</button>
        </div>`).join('');
      return meta + `<div class="editor-blocks">${blocks}</div><button class="btn ghost block" id="addBlock">+ Añadir categoría</button>`;
    };

    const readMeta = (root) => {
      const m = root.querySelector('#dayMeta');
      if (!m) return;
      const data = UI.readForm(m);
      draft.name = data.name.trim() || draft.name;
      draft.type = data.type; draft.focus = data.focus; draft.place = data.place; draft.duration = data.duration;
    };
    const sync = (root) => {
      readMeta(root);
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
    };

    rerender = (root) => { root.querySelector('.modal-body').innerHTML = editorHTML(); bindBody(root); };

    UI.modal({
      title: `Editar ${d.name}`, size: 'wide', bodyHTML: '',
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          if (draft.type === 'rest') readMeta(root); else sync(root);
          (draft.blocks || []).forEach(b => { b.exercises = (b.exercises || []).filter(e => e.name && e.name.trim()); });
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

  // ---------- PLANES ----------
  async function info(app) {
    const routines = (await DB.routinesOf(app.activeUser.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
    const active = routines.find(r => r.isPrimary) || routines[0];
    const trainingDays = active ? active.days.filter(d => !d.isRest).length : 0;

    const planCards = routines.map(r => {
      const tDays = r.days.filter(d => !d.isRest).length;
      return `<div class="plan-card${r.id === (active && active.id) ? ' active' : ''}">
        <div class="plan-card-main">
          <strong>${UI.esc(r.name)}</strong>
          <span class="dim">${tDays} días de entreno${r.id === (active && active.id) ? ' · activo' : ''}</span>
        </div>
        ${r.id === (active && active.id) ? '<span class="badge">Activo</span>' : ''}
      </div>`;
    }).join('');

    return `
      <div class="week-intro"><div class="eyebrow">Tus planes</div><h2>Planes</h2><p>Tu plan de entrenamiento. Pronto podrás tener varios.</p></div>
      ${planCards}
      <button class="plan-card new" id="newPlan">
        <div class="plan-card-main">
          <strong>➕ Crear nuevo plan</strong>
          <span class="dim">Crea planes distintos y cambia entre ellos</span>
        </div>
        <span class="badge soon">Próximamente</span>
      </button>

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
      </div>
      <p class="version-foot">Traindía · v2.0</p>`;
  }

  function infoBind(app, root) {
    const newPlan = root.querySelector('#newPlan');
    if (newPlan) newPlan.addEventListener('click', () => {
      UI.modal({
        title: 'Crear nuevo plan',
        bodyHTML: `<p class="modal-text">Pronto podrás crear varios planes de entrenamiento (por ejemplo una nueva fase) y cambiar entre ellos.</p><p class="modal-text dim">De momento trabajas sobre <strong>${UI.esc((app.routine && app.routine.name) || 'tu plan')}</strong>, donde está todo lo actual.</p>`,
        actions: [{ label: 'Entendido', kind: 'primary' }],
      });
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
          <button class="icon-btn" data-edit="${e.id}">✏️</button>
          ${deletable ? `<button class="icon-btn danger" data-del="${e.id}">🗑️</button>` : ''}
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
      <input class="inp" id="exCatalogSearch" placeholder="🔎 Buscar ejercicio…" autocomplete="off" style="margin-bottom:14px">
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

  function emptyRoutine() {
    return `<div class="empty-state"><p>No hay rutina configurada.</p></div>`;
  }

  return { week, weekBind, day, dayBind, guides, guide, info, infoBind, exercises, exercisesBind };
})();
