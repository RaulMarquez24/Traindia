// ============================================================
// REVISAR EJERCICIOS · antes de crear un plan importado
// ------------------------------------------------------------
// Cada ejercicio del plan que llega (p. ej. de la IA) se enlaza con uno tuyo o se
// crea nuevo. Traindía propone: el del mismo nombre, uno que ya enlazaste antes
// (se recuerda en el ejercicio, «aliases») o el más parecido (nombre sin plurales
// ni variantes, categoría, tipo y registros). Tú confirmas o cambias cualquiera:
// otro de tus ejercicios, uno nuevo, renombrar el tuyo o pasar la variante del
// nombre a la etiqueta («Carrera suave» → Carrera + «Suave»). Lo enlazado conserva
// tu historial, porque va unido al ejercicio y no al nombre.
// La misma pantalla sirve para un plan que ya tienes (si uno de sus ejercicios es el
// mismo que otro tuyo con más historial, se fusionan) y la fusión, para la ficha de
// un ejercicio («Es el mismo que otro: fusionar…»).
// ============================================================

const VReview = (() => {
  const STOP = new Set(['de', 'del', 'la', 'el', 'en', 'con', 'a', 'al', 'y', 'o', 'los', 'las', 'por', 'para', 'c', 'un', 'una']);
  // Palabras que no cambian el ejercicio: son su variante y van a la etiqueta.
  const VARIANT = new Set(['suave', 'continua', 'continuo', 'rapida', 'rapido', 'ligera', 'ligero', 'intensa', 'intenso',
    'progresivo', 'progresiva', 'vuelta', 'calma', 'supino', 'supina', 'prono', 'prona', 'neutro', 'neutra', 'pie',
    'alterno', 'alterna', 'unilateral', 'lastre', 'sin', 'z1', 'z2', 'z3', 'z4', 'z5']);
  const SYN = { militar: 'hombro' }; // «Press militar» = «Press de hombro»
  const singular = (w) => (w.length > 4 && /[lrndzj]es$/.test(w)) ? w.slice(0, -2) : (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : w;
  const words = (name) => UI.norm(name).replace(/(\d)([a-zñ])/g, '$1 $2').replace(/[^a-z0-9ñ]+/g, ' ').split(' ').filter(Boolean); // «400m» = «400 m»
  const tokens = (name) => words(name).filter(w => !STOP.has(w)).map(singular).map(t => SYN[t] || t);
  const core = (name) => new Set(tokens(name).filter(t => !VARIANT.has(t)));
  const aliasKey = (name) => tokens(name).join(' ');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Parecido de los nombres (sin plurales ni variantes): 1 = el mismo; si uno contiene
  // al otro, más cuanto más comparten («Técnica de carrera» → la «Técnica de carrera y
  // activación» antes que «Carrera»).
  function nameScore(srcName, exName) {
    const a = core(srcName), b = core(exName);
    if (!a.size || !b.size) return 0;
    const inter = [...a].filter(t => b.has(t)).length;
    if (!inter) return 0;
    const j = inter / new Set([...a, ...b]).size;
    if (j === 1) return 1;
    return (inter === a.size || inter === b.size) ? 0.5 + 0.35 * j : j;
  }
  // + misma categoría, mismo tipo y, para desempatar, el que más has registrado
  function score(src, ex, veces) {
    let s = nameScore(src.name, ex.name);
    if (!s) return 0;
    if (UI.norm(src.muscleGroup || '') === UI.norm(ex.muscleGroup || '')) s += 0.08;
    if (src.type && src.type === ex.type) s += 0.05;
    return s + Math.min(0.03, (veces.get(ex.id) || 0) * 0.003);
  }
  // Lo que sobra del nombre que llega respecto al tuyo, si es solo la variante: su etiqueta
  function labelFrom(srcName, exName) {
    const mine = new Set(tokens(exName));
    const orig = String(srcName).trim().split(/\s+/);
    const keep = orig.map(w => { const n = words(w)[0] || ''; return { w, n, t: singular(n) }; });
    const extra = keep.filter(k => k.n && !STOP.has(k.n) && !mine.has(k.t));
    if (!extra.length || extra.length > 3 || !extra.every(k => VARIANT.has(k.t))) return '';
    const i = keep.indexOf(extra[0]), j = keep.indexOf(extra[extra.length - 1]);
    const txt = keep.slice(i, j + 1).map(k => k.w).join(' ');
    return (txt.charAt(0).toUpperCase() + txt.slice(1)).slice(0, 18);
  }

  // Tu catálogo y cuántas veces has registrado cada ejercicio
  async function datos(uid) {
    const [local, sessions] = await Promise.all([DB.exercisesOf(uid), DB.sessionsOf(uid)]);
    const veces = new Map();
    sessions.forEach(x => new Set((x.entries || []).map(e => e.exerciseId)).forEach(id => veces.set(id, (veces.get(id) || 0) + 1)));
    return { local, veces, byId: new Map(local.map(e => [e.id, e])) };
  }
  const rowsOf = (routine, exId) => (routine.days || []).flatMap(d => (d.blocks || []).flatMap(b => (b.exercises || []).filter(x => x.exerciseId === exId).map(x => ({ d, x }))));
  const nDias = (it) => new Set(it.uses.map(u => u.d.id)).size;

  // ---------- Revisar los ejercicios de un plan que se va a importar ----------
  // routine/exercises: el plan y su catálogo (ids del archivo). Al confirmar renombra
  // o recuerda lo que hayas decidido, ajusta nombres y etiquetas del plan y llama a
  // onConfirm(links) con { idDelArchivo: idDeTuEjercicio } para que lo cree.
  async function importar(app, { routine, exercises, onBack, onConfirm }) {
    const uid = app.activeUser.id;
    const ctx = await datos(uid);
    const { local, veces } = ctx;
    const enPlan = new Set(routine.days.flatMap(d => (d.blocks || []).flatMap(b => (b.exercises || []).map(x => x.exerciseId))));

    const items = exercises.map(src => {
      // el mismo nombre, también en plural o con sinónimo («Elevaciones laterales» = «Elevación lateral»)
      const exact = local.find(e => UI.norm(e.name) === UI.norm(src.name)) || local.find(e => aliasKey(e.name) === aliasKey(src.name));
      const remembered = !exact && local.find(e => (e.aliases || []).includes(aliasKey(src.name)));
      const cands = local.map(e => ({ e, s: score(src, e, veces) })).filter(c => c.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, 4).map(c => c.e);
      // (las alternativas solo se enlazan si son el mismo ejercicio; si no, se crean)
      const sub = !enPlan.has(src.id);
      const best = exact || remembered || (cands[0] && (sub ? nameScore(src.name, cands[0].name) === 1 : score(src, cands[0], veces) >= 0.45) ? cands[0] : null);
      const it = { src, sub, cands, state: exact || remembered ? 'tuyo' : best ? 'parecido' : 'nuevo',
        why: exact ? '' : remembered ? 'Lo recuerdo de otra vez' : '', target: best ? best.id : null, confirmed: !!(exact || remembered) || sub,
        newName: src.name, myName: best ? best.name : '', label: best ? labelFrom(src.name, best.name) : '' };
      // mismo nombre, pero otro parecido tuyo tiene más historial (p. ej. «Estiramientos» y «Estiramientos Generales»)
      const more = exact && !sub && local.filter(e => e.id !== exact.id && nameScore(src.name, e.name) >= 0.6 && (veces.get(e.id) || 0) > (veces.get(exact.id) || 0))
        .sort((x, y) => (veces.get(y.id) || 0) - (veces.get(x.id) || 0))[0];
      if (more) { it.why = `ojo: «${more.name}» tiene ${plural(veces.get(more.id), 'registro', 'registros')}`; if (!it.cands.includes(more)) it.cands.unshift(more); }
      it.uses = rowsOf(routine, src.id);
      return it;
    });

    pantalla(ctx, items, {
      title: 'Revisa los ejercicios',
      intro: 'Comprueba con cuál de tus ejercicios va cada uno. Lo que enlaces con uno tuyo <strong>conserva su historial</strong>.',
      onBack, finalLabel: 'Crear y activar',
      onFinish: async () => {
        const pend = items.filter(pendiente);
        if (pend.length) {
          const ok = await UI.confirm({ title: `Quedan ${plural(pend.length, 'ejercicio', 'ejercicios')} por confirmar`, message: `Se enlazarán con lo que te propongo: ${pend.map(i => `«${i.src.name}» → ${ctx.byId.get(i.target).name}`).join(', ')}.`, confirmLabel: 'Sí, enlazarlos' });
          if (!ok) return false;
        }
        for (const it of items) {
          if (!it.target) { it.src.name = it.newName; continue; }
          await recordar(uid, it.target, it.src.name, it.myName);
          if (it.label) it.uses.forEach(u => { if (!u.x.label) u.x.label = it.label; });
        }
        await onConfirm(Object.fromEntries(items.filter(i => i.target).map(i => [i.src.id, i.target])));
      },
    });
  }

  // ---------- Revisar los ejercicios de un plan que ya tienes ----------
  // Si uno de sus ejercicios parece el mismo que otro tuyo con más historial (p. ej.
  // el «Carrera suave» que creó una importación), lo propone; al confirmarlo se
  // fusionan y el historial queda junto. También se renombra o se pone etiqueta.
  async function plan(app, planId, onDone) {
    const uid = app.activeUser.id;
    const rt = (await DB.routinesOf(uid)).find(r => r.id === planId); if (!rt) return;
    const ctx = await datos(uid);
    const { local, veces, byId } = ctx;
    const ids = [...new Set(rt.days.flatMap(d => (d.blocks || []).flatMap(b => (b.exercises || []).map(x => x.exerciseId))))].filter(id => byId.has(id));
    if (!ids.length) { UI.toast('Este plan aún no tiene ejercicios'); return; }
    const items = ids.map(id => {
      const src = byId.get(id), mine = veces.get(id) || 0;
      const others = local.filter(e => e.id !== id);
      // Fusionar sí tiene consecuencias: entre los parecidos manda el nombre y después el
      // historial (el «Carrera» con 8 registros antes que otro «Carrera suave» vacío), y
      // solo se propone uno con MÁS registros. Si este ya tiene registros, solo uno con su
      // mismo nombre de base («Jalón al pecho supino» → «Jalón al pecho»).
      const rank = others.map(e => ({ e, n: nameScore(src.name, e.name), s: score(src, e, veces) })).filter(c => c.s >= 0.3)
        .sort((a, b) => (Math.round(b.n * 100) - Math.round(a.n * 100)) || ((veces.get(b.e.id) || 0) - (veces.get(a.e.id) || 0)) || (b.s - a.s));
      const cands = rank.slice(0, 4).map(c => c.e);
      const top = rank.find(c => (veces.get(c.e.id) || 0) > mine && c.s >= 0.45 && (!mine || c.n >= 0.6));
      const best = others.find(e => (aliasKey(e.name) === aliasKey(src.name) || (e.aliases || []).includes(aliasKey(src.name))) && (veces.get(e.id) || 0) > mine)
        || (top ? top.e : null);
      if (best && !cands.includes(best)) cands.unshift(best);
      return { src, self: true, cands, state: best ? 'parecido' : 'tuyo', why: '', target: best ? best.id : id, confirmed: !best,
        myName: best ? best.name : src.name, label: best ? labelFrom(src.name, best.name) : '', uses: rowsOf(rt, id) };
    });
    pantalla(ctx, items, {
      title: `Ejercicios de ${rt.name || 'tu plan'}`,
      intro: 'Si alguno es <strong>el mismo que otro tuyo</strong> con más historial, te lo propongo: al confirmarlo se fusionan y su historial queda junto. Toca cualquiera para renombrarlo o ponerle etiqueta.',
      pendTitle: '¿Es el mismo?', pendHint: 'Se parecen a uno tuyo con más registros. Lo que no confirmes se queda como está.',
      finalLabel: 'Guardar cambios', oneByOne: true, // fusionar, de una en una
      onFinish: async () => {
        const hechos = items.filter(i => i.confirmed);
        // 1) etiquetas en las filas de este plan (antes de fusionar, que reescribe los planes)
        hechos.forEach(it => { if (it.label) it.uses.forEach(u => { if (!u.x.label) u.x.label = it.label; }); });
        await DB.put('routines', rt);
        // 2) fusiones y renombres
        let n = 0;
        for (const it of hechos) {
          if (it.target !== it.src.id) { await fusionar(uid, it.src.id, it.target); n++; }
          const ex = await DB.get('exercises', it.target);
          if (ex && it.myName && it.myName !== ex.name) await DB.updateExercise(uid, ex.id, { name: it.myName, aliases: [...new Set([...(ex.aliases || []), aliasKey(ex.name)])] });
        }
        await app.refreshRoutine();
        if (onDone) await onDone(); else app.render();
        UI.toast(n ? `${plural(n, 'ejercicio fusionado', 'ejercicios fusionados')} · cambios guardados` : 'Cambios guardados');
      },
    });
  }

  const pendiente = (i) => i.state === 'parecido' && !i.confirmed && i.target && !i.sub;

  // ---------- La pantalla (común a los dos casos) ----------
  function pantalla(ctx, items, o) {
    const { local, veces, byId } = ctx;
    const main = items.filter(i => !i.sub), subs = items.filter(i => i.sub);
    const regs = (id) => { const n = veces.get(id) || 0; return n ? plural(n, 'registro', 'registros') : 'sin registros'; };

    const rowHTML = (it) => {
      const i = items.indexOf(it), ex = it.target && byId.get(it.target), pend = pendiente(it);
      const fusion = it.self && ex && ex.id !== it.src.id;
      const name = ex ? (it.myName || ex.name) : it.newName;
      const tag = !ex ? '<span class="rv-tag new">Nuevo</span>' : pend ? '' : fusion ? '<span class="rv-tag ok">Se fusiona</span>' : '<span class="rv-tag ok">Tuyo</span>';
      const from = it.self && !fusion ? '' : `<span class="rv-from">${UI.esc(it.src.name)}${it.self ? ` <span class="dim">· ${regs(it.src.id)}</span>` : ''}${it.sub ? '' : ` <span class="dim">· ${plural(nDias(it), 'día', 'días')}</span>`}</span>`;
      return `<div class="rv-row${!ex ? ' is-new' : pend ? ' is-pend' : ''}">
        <button type="button" class="rv-main" data-i="${i}">
          ${from}
          <span class="rv-to">${it.self && !fusion ? '' : UI.icon('chevronRight', 13)}<strong>${UI.esc(name)}</strong>${ex && it.label ? ` <span class="rv-lab">${UI.esc(it.label)}</span>` : ''}<span class="dim">${ex ? ` · ${regs(ex.id)}` : ' · se crea'}${it.self && !fusion ? ` · ${plural(nDias(it), 'día', 'días')}` : ''}${it.why ? ` · ${it.why}` : ''}</span></span>
        </button>
        ${pend ? `<button type="button" class="btn small primary rv-yes" data-yes="${i}">Sí, es este</button>` : tag}
      </div>`;
    };
    const sec = (title, list, hint) => list.length ? `<div class="card-label rv-sec">${title} <span class="dim">${list.length}</span></div>${hint ? `<p class="field-hint" style="margin-top:-4px">${hint}</p>` : ''}${list.map(rowHTML).join('')}` : '';
    const draw = (root) => {
      const pend = main.filter(pendiente), nuevos = main.filter(i => !i.target), tuyos = main.filter(i => i.target && !pend.includes(i));
      root.querySelector('#rvBody').innerHTML = `
        <div class="nut-sum"><span><b>${tuyos.length}</b> ${main.some(i => i.self) ? 'ejercicios' : 'tuyos'}</span>${pend.length ? `<span class="warn"><b>${pend.length}</b> por confirmar</span>` : ''}${main.some(i => i.self) ? '' : `<span><b>${nuevos.length}</b> nuevos</span>`}</div>
        ${pend.length > 1 && !o.oneByOne ? `<button type="button" class="btn ghost block small" id="rvAll">${UI.icon('check', 14)} Sí a las ${pend.length} sugerencias</button>` : ''}
        ${sec(o.pendTitle || 'Por confirmar', pend, o.pendHint || 'Se parecen a uno tuyo. Confírmalo o toca para elegir otro.')}
        ${sec('Nuevos', nuevos, 'No he encontrado uno tuyo igual. Toca si sí lo tienes.')}
        ${sec(main.some(i => i.self) ? 'En el plan' : 'Ya los tienes', tuyos, '')}
        ${subs.length ? `<details class="rv-subs"><summary>Alternativas que propone el plan <span class="dim">${subs.length}</span></summary>${subs.map(rowHTML).join('')}</details>` : ''}`;
      root.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => editar(items[+b.dataset.i], () => draw(root))));
      root.querySelectorAll('[data-yes]').forEach(b => b.addEventListener('click', () => { items[+b.dataset.yes].confirmed = true; draw(root); }));
      const all = root.querySelector('#rvAll'); if (all) all.addEventListener('click', () => { main.filter(pendiente).forEach(i => { i.confirmed = true; }); draw(root); });
    };

    // Una fila: ¿con cuál de los tuyos va (o es nuevo / se queda como está)? + nombre y etiqueta
    function editar(it, redraw) {
      let target = it.target, myName = it.myName, label = it.label, newName = it.newName;
      const extra = target && target !== it.src.id && !it.cands.some(e => e.id === target) ? [byId.get(target)] : [];
      const rowLabels = [...new Set(it.uses.map(u => u.x.label).filter(Boolean))];
      UI.modal({
        title: it.src.name, size: 'wide',
        bodyHTML: `${rowLabels.length ? `<p class="field-hint" style="margin-top:0">En el plan lleva la etiqueta ${rowLabels.map(l => `«${UI.esc(l)}»`).join(', ')}.</p>` : ''}
          <span class="field-label">${it.self ? '¿Es el mismo que otro tuyo?' : '¿Cuál es?'}</span>
          <div class="rv-opts" id="rvOpts"></div>
          <div id="rvFields"></div>`,
        onMount: (root) => {
          const opts = root.querySelector('#rvOpts'), fields = root.querySelector('#rvFields');
          const optHTML = (e, title) => `<button type="button" class="rv-opt${e.id === target ? ' on' : ''}" data-ex="${e.id}"><strong>${UI.esc(title || e.name)}</strong><span class="dim">${title ? `${UI.esc(e.name)} · ` : `${UI.esc(e.muscleGroup || 'General')} · `}${regs(e.id)}</span></button>`;
          const paint = () => {
            opts.innerHTML = (it.self ? optHTML(it.src, 'No, es otro: dejarlo como está') : '')
              + [...it.cands, ...extra].map(e => optHTML(e)).join('')
              + `<button type="button" class="rv-opt" data-search>${UI.icon('search', 15)}<strong>Otro de tus ejercicios…</strong></button>`
              + (it.self ? '' : `<button type="button" class="rv-opt${!target ? ' on' : ''}" data-new><strong>Es nuevo</strong><span class="dim">Se crea en tu catálogo</span></button>`);
            const ex = target && byId.get(target);
            const fusion = it.self && ex && ex.id !== it.src.id;
            const tipos = fusion && ex.type !== it.src.type && (veces.get(it.src.id) || 0);
            fields.innerHTML = ex
              ? (fusion ? `<p class="field-hint rv-merge${tipos ? ' warn' : ''}">${tipos ? `${UI.icon('warning', 14)} Son de tipos distintos: sus registros no casarían. Elige otro o déjalo como está.` : `«${UI.esc(it.src.name)}» (${regs(it.src.id)}) se fusiona con «${UI.esc(ex.name)}»: sus registros y planes pasan a él y se borra.`}</p>` : '')
                + UI.field(it.self && !fusion ? 'Nombre' : 'Nombre de tu ejercicio', UI.input('myName', myName || ex.name), 'Si lo cambias, se renombra en toda la app y conserva su historial.')
                + UI.field('Etiqueta en este plan', UI.input('label', label, { placeholder: 'Ej. Suave, De pie, Supino…' }), rowLabels.length ? 'Solo para las filas que no traen la suya.' : 'Para ver la variante de un vistazo.')
              : UI.field('Nombre del ejercicio nuevo', UI.input('newName', newName));
            opts.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => pick(byId.get(b.dataset.ex))));
            const nw = opts.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => { sync(); target = null; paint(); });
            opts.querySelector('[data-search]').addEventListener('click', () => UI.pickExercise({ exercises: local.filter(e => e.id !== it.src.id || !it.self), title: 'Uno de tus ejercicios', allowNew: false, onPick: (e) => {
              if (!it.cands.some(c => c.id === e.id) && !extra.some(c => c.id === e.id)) extra.push(e);
              pick(e);
            } }));
          };
          const sync = () => {
            const v = (n) => { const el = fields.querySelector(`input[name="${n}"]`); return el ? el.value.trim() : null; };
            if (v('myName') !== null) { myName = v('myName'); label = v('label'); }
            if (v('newName') !== null) newName = v('newName');
          };
          const pick = (e) => { sync(); target = e.id; myName = e.name; label = e.id === it.src.id ? '' : labelFrom(it.src.name, e.name); paint(); };
          root._sync = sync;
          paint();
        },
        actions: [
          { label: 'Cancelar', kind: 'ghost' },
          { label: 'Guardar', kind: 'primary', onClick: (root) => {
            root._sync();
            if (target) {
              const ex = byId.get(target);
              if (it.self && ex.id !== it.src.id && ex.type !== it.src.type && (veces.get(it.src.id) || 0)) { UI.toast('Son de tipos distintos: no se pueden fusionar', 'err'); return false; }
              if (!myName) { UI.toast('Escribe el nombre', 'err'); return false; }
              if (local.some(e => e.id !== target && (!it.self || e.id !== it.src.id) && UI.norm(e.name) === UI.norm(myName))) { UI.toast('Ya tienes otro ejercicio con ese nombre', 'err'); return false; }
            } else {
              if (!newName) { UI.toast('Escribe el nombre', 'err'); return false; }
              const same = local.find(e => UI.norm(e.name) === UI.norm(newName));
              if (same) { target = same.id; myName = same.name; UI.toast(`Ya lo tienes: se usa tu «${same.name}»`); }
            }
            Object.assign(it, { target, myName, label: (label || '').slice(0, 18), newName, confirmed: true, why: target === it.target ? it.why : '' });
            if (it.state === 'nuevo' && target) it.state = 'parecido';
            redraw();
          } },
        ],
      });
    }

    UI.modal({
      title: o.title, size: 'wide',
      bodyHTML: `<p class="modal-text dim">${o.intro}</p><div id="rvBody"></div>`,
      onMount: draw,
      actions: [
        o.onBack ? { label: 'Atrás', kind: 'ghost', onClick: () => { setTimeout(o.onBack, 50); } } : { label: 'Cancelar', kind: 'ghost' },
        { label: o.finalLabel, kind: 'primary', onClick: o.onFinish },
      ],
    });
  }

  // Lo que hayas enlazado se recuerda en tu ejercicio (y se renombra si lo cambiaste).
  async function recordar(uid, exId, srcName, finalName) {
    const ex = await DB.get('exercises', exId); if (!ex) return;
    const oldName = ex.name; finalName = finalName || oldName;
    const aliases = new Set(ex.aliases || []);
    if (aliasKey(srcName) !== aliasKey(finalName)) aliases.add(aliasKey(srcName)); // la próxima vez, directo
    if (finalName !== oldName) aliases.add(aliasKey(oldName));
    const patch = { aliases: [...aliases].filter(a => a && a !== aliasKey(finalName)) };
    if (finalName !== oldName) { patch.name = finalName; await DB.updateExercise(uid, ex.id, patch); }
    else await DB.put('exercises', { ...ex, ...patch });
  }

  // ---------- Fusionar dos ejercicios ----------
  // Todo lo de «from» (registros, filas de los planes, suplentes, vídeos, técnica)
  // pasa a «to», que recuerda el nombre de «from»; después «from» se borra.
  async function fusionar(uid, fromId, toId) {
    if (fromId === toId) return;
    const from = await DB.get('exercises', fromId), to = await DB.get('exercises', toId);
    if (!from || !to) return;
    for (const rt of await DB.routinesOf(uid)) {
      let ch = false;
      (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(x => {
        if (x.exerciseId === fromId) { x.exerciseId = toId; x.name = to.name; x.type = to.type; ch = true; }
      })));
      if (ch) await DB.put('routines', rt);
    }
    for (const s of await DB.sessionsOf(uid)) {
      let ch = false;
      (s.entries || []).forEach(e => { if (e.exerciseId === fromId) { e.exerciseId = toId; e.name = to.name; ch = true; } });
      if (ch) await DB.put('sessions', s);
    }
    for (const e of await DB.exercisesOf(uid)) {
      if (e.id === fromId || e.id === toId || !(e.substitutes || []).includes(fromId)) continue;
      e.substitutes = [...new Set(e.substitutes.map(s => s === fromId ? toId : s))].filter(s => s !== e.id);
      await DB.put('exercises', e);
    }
    const vids = DB.exVideos(to).map(v => ({ ...v }));
    DB.exVideos(from).forEach(v => { if (!vids.some(x => (x.url || '').trim() === (v.url || '').trim())) vids.push({ ...v }); });
    const merged = { ...to,
      substitutes: [...new Set([...(to.substitutes || []), ...(from.substitutes || [])])].filter(s => s !== toId && s !== fromId),
      aliases: [...new Set([...(to.aliases || []), ...(from.aliases || []), aliasKey(from.name)])].filter(a => a && a !== aliasKey(to.name)) };
    if (vids.length) { merged.videos = vids; merged.videoUrl = vids[0].url; }
    if (!merged.howto && from.howto) merged.howto = from.howto;
    await DB.put('exercises', merged);
    await DB.del('exercises', fromId);
  }

  // «Es el mismo que otro: fusionar…» desde la ficha de un ejercicio
  async function fusionarCon(app, ex, onDone) {
    const uid = app.activeUser.id;
    const { local, veces } = await datos(uid);
    const others = local.filter(e => e.id !== ex.id);
    UI.pickExercise({ exercises: others, title: `¿Con cuál fusionar «${ex.name}»?`, allowNew: false, onPick: async (to) => {
      const n = veces.get(ex.id) || 0, m = veces.get(to.id) || 0;
      if (n && ex.type !== to.type) { UI.toast('Son de tipos distintos: sus registros no casarían', 'err'); return; }
      const ok = await UI.confirm({
        title: `¿Fusionar con ${to.name}?`,
        message: `«${ex.name}» (${n ? plural(n, 'registro', 'registros') : 'sin registros'}) pasa a «${to.name}» (${m ? plural(m, 'registro', 'registros') : 'sin registros'}): sus registros, sus días en tus planes, suplentes y vídeos. Después «${ex.name}» se borra.`,
        confirmLabel: 'Fusionar',
      });
      if (!ok) return;
      await fusionar(uid, ex.id, to.id);
      await app.refreshRoutine();
      if (onDone) await onDone(); else app.render();
      UI.toast(`Fusionado con ${to.name}`);
    } });
  }

  return { importar, plan, fusionar, fusionarCon, score, labelFrom, aliasKey };
})();
