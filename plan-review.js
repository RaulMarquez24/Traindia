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

  // ---------- Revisar los ejercicios de un plan que se va a importar ----------
  // routine/exercises: el plan y su catálogo (ids del archivo). Al confirmar renombra
  // o recuerda lo que hayas decidido, ajusta nombres y etiquetas del plan y llama a
  // onConfirm(links) con { idDelArchivo: idDeTuEjercicio } para que lo cree.
  async function importar(app, { routine, exercises, onBack, onConfirm }) {
    const uid = app.activeUser.id;
    const [local, sessions] = await Promise.all([DB.exercisesOf(uid), DB.sessionsOf(uid)]);
    const veces = new Map();
    sessions.forEach(x => new Set((x.entries || []).map(e => e.exerciseId)).forEach(id => veces.set(id, (veces.get(id) || 0) + 1)));
    const byId = new Map(local.map(e => [e.id, e]));
    const rows = (srcId) => routine.days.flatMap(d => (d.blocks || []).flatMap(b => (b.exercises || []).filter(x => x.exerciseId === srcId).map(x => ({ d, x }))));
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
      it.uses = rows(src.id);
      it.rowLabels = [...new Set(it.uses.map(u => u.x.label).filter(Boolean))];
      return it;
    });
    const main = items.filter(i => !i.sub), subs = items.filter(i => i.sub);
    const pending = () => main.filter(i => i.state === 'parecido' && !i.confirmed && i.target);

    const rowHTML = (it) => {
      const i = items.indexOf(it), ex = it.target && byId.get(it.target), n = ex ? (veces.get(ex.id) || 0) : 0;
      const name = ex ? (it.myName || ex.name) : it.newName;
      const tag = !ex ? '<span class="rv-tag new">Nuevo</span>' : (it.state === 'parecido' && !it.confirmed) ? '' : '<span class="rv-tag ok">Tuyo</span>';
      return `<div class="rv-row${!ex ? ' is-new' : (it.state === 'parecido' && !it.confirmed) ? ' is-pend' : ''}">
        <button type="button" class="rv-main" data-i="${i}">
          <span class="rv-from">${UI.esc(it.src.name)}${it.sub ? '' : ` <span class="dim">· ${plural(new Set(it.uses.map(u => u.d.id)).size, 'día', 'días')}</span>`}</span>
          <span class="rv-to">${UI.icon('chevronRight', 13)}<strong>${UI.esc(name)}</strong>${ex && it.label ? ` <span class="rv-lab">${UI.esc(it.label)}</span>` : ''}<span class="dim">${ex ? (n ? ` · ${plural(n, 'registro', 'registros')}` : ' · sin registros') : ' · se crea'}${it.why ? ` · ${it.why}` : ''}</span></span>
        </button>
        ${ex && it.state === 'parecido' && !it.confirmed ? `<button type="button" class="btn small primary rv-yes" data-yes="${i}">Sí, es este</button>` : tag}
      </div>`;
    };
    const sec = (title, list, hint) => list.length ? `<div class="card-label rv-sec">${title} <span class="dim">${list.length}</span></div>${hint ? `<p class="field-hint" style="margin-top:-4px">${hint}</p>` : ''}${list.map(rowHTML).join('')}` : '';
    const draw = (root) => {
      const pend = pending(), nuevos = main.filter(i => !i.target), tuyos = main.filter(i => i.target && !pend.includes(i));
      root.querySelector('#rvBody').innerHTML = `
        <div class="nut-sum"><span><b>${tuyos.length}</b> tuyos</span>${pend.length ? `<span class="warn"><b>${pend.length}</b> por confirmar</span>` : ''}<span><b>${nuevos.length}</b> nuevos</span></div>
        ${pend.length > 1 ? `<button type="button" class="btn ghost block small" id="rvAll">${UI.icon('check', 14)} Sí a las ${pend.length} sugerencias</button>` : ''}
        ${sec('Por confirmar', pend, 'Se parecen a uno tuyo. Confírmalo o toca para elegir otro.')}
        ${sec('Nuevos', nuevos, 'No he encontrado uno tuyo igual. Toca si sí lo tienes.')}
        ${sec('Ya los tienes', tuyos, '')}
        ${subs.length ? `<details class="rv-subs"><summary>Alternativas que propone el plan <span class="dim">${subs.length}</span></summary>${subs.map(rowHTML).join('')}</details>` : ''}`;
      root.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => editar(items[+b.dataset.i], () => draw(root))));
      root.querySelectorAll('[data-yes]').forEach(b => b.addEventListener('click', () => { items[+b.dataset.yes].confirmed = true; draw(root); }));
      const all = root.querySelector('#rvAll'); if (all) all.addEventListener('click', () => { pending().forEach(i => { i.confirmed = true; }); draw(root); });
    };

    // Una fila: ¿con cuál de los tuyos va, o es nuevo? + nombre y etiqueta
    function editar(it, redraw) {
      let target = it.target, myName = it.myName, label = it.label, newName = it.newName;
      const extra = target && !it.cands.some(e => e.id === target) ? [byId.get(target)] : [];
      UI.modal({
        title: it.src.name, size: 'wide',
        bodyHTML: `${it.rowLabels.length ? `<p class="field-hint" style="margin-top:0">En el plan lleva la etiqueta ${it.rowLabels.map(l => `«${UI.esc(l)}»`).join(', ')}.</p>` : ''}
          <span class="field-label">¿Cuál es?</span>
          <div class="rv-opts" id="rvOpts"></div>
          <div id="rvFields"></div>`,
        onMount: (root) => {
          const opts = root.querySelector('#rvOpts'), fields = root.querySelector('#rvFields');
          const optHTML = (e) => { const n = veces.get(e.id) || 0; return `<button type="button" class="rv-opt${e.id === target ? ' on' : ''}" data-ex="${e.id}"><strong>${UI.esc(e.name)}</strong><span class="dim">${UI.esc(e.muscleGroup || 'General')} · ${n ? plural(n, 'registro', 'registros') : 'sin registros'}</span></button>`; };
          const paint = () => {
            opts.innerHTML = [...it.cands, ...extra].map(optHTML).join('')
              + `<button type="button" class="rv-opt" data-search>${UI.icon('search', 15)}<strong>Otro de tus ejercicios…</strong></button>`
              + `<button type="button" class="rv-opt${!target ? ' on' : ''}" data-new><strong>Es nuevo</strong><span class="dim">Se crea en tu catálogo</span></button>`;
            const ex = target && byId.get(target);
            fields.innerHTML = ex
              ? UI.field('Nombre de tu ejercicio', UI.input('myName', myName || ex.name), 'Si lo cambias, se renombra en toda la app y conserva su historial.')
                + UI.field('Etiqueta en este plan', UI.input('label', label, { placeholder: 'Ej. Suave, De pie, Supino…' }), it.rowLabels.length ? 'Solo para las filas que no traen la suya.' : 'Para ver la variante de un vistazo.')
              : UI.field('Nombre del ejercicio nuevo', UI.input('newName', newName));
            opts.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => pick(byId.get(b.dataset.ex))));
            opts.querySelector('[data-new]').addEventListener('click', () => { sync(); target = null; paint(); });
            opts.querySelector('[data-search]').addEventListener('click', () => UI.pickExercise({ exercises: local, title: 'Uno de tus ejercicios', allowNew: false, onPick: (e) => {
              if (!it.cands.some(c => c.id === e.id) && !extra.some(c => c.id === e.id)) extra.push(e);
              pick(e);
            } }));
          };
          const sync = () => {
            const v = (n) => { const el = fields.querySelector(`input[name="${n}"]`); return el ? el.value.trim() : null; };
            if (v('myName') !== null) { myName = v('myName'); label = v('label'); }
            if (v('newName') !== null) newName = v('newName');
          };
          const pick = (e) => { sync(); target = e.id; myName = e.name; label = labelFrom(it.src.name, e.name); paint(); };
          root._sync = sync;
          paint();
        },
        actions: [
          { label: 'Cancelar', kind: 'ghost' },
          { label: 'Guardar', kind: 'primary', onClick: (root) => {
            root._sync();
            if (target) {
              if (!myName) { UI.toast('Escribe el nombre', 'err'); return false; }
              if (local.some(e => e.id !== target && UI.norm(e.name) === UI.norm(myName))) { UI.toast('Ya tienes otro ejercicio con ese nombre', 'err'); return false; }
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
      title: 'Revisa los ejercicios', size: 'wide',
      bodyHTML: `<p class="modal-text dim">Comprueba con cuál de tus ejercicios va cada uno. Lo que enlaces con uno tuyo <strong>conserva su historial</strong>.</p><div id="rvBody"></div>`,
      onMount: draw,
      actions: [
        { label: 'Atrás', kind: 'ghost', onClick: () => { if (onBack) setTimeout(onBack, 50); } },
        { label: 'Crear y activar', kind: 'primary', onClick: async () => {
          const pend = pending();
          if (pend.length) {
            const ok = await UI.confirm({ title: `Quedan ${plural(pend.length, 'ejercicio', 'ejercicios')} por confirmar`, message: `Se enlazarán con lo que te propongo: ${pend.map(i => `«${i.src.name}» → ${byId.get(i.target).name}`).join(', ')}.`, confirmLabel: 'Sí, enlazarlos' });
            if (!ok) return false;
          }
          await aplicar();
          await onConfirm(links());
        } },
      ],
    });

    const links = () => Object.fromEntries(items.filter(i => i.target).map(i => [i.src.id, i.target]));
    // Lo decidido: renombres, equivalencias recordadas, nombres de los nuevos y etiquetas.
    async function aplicar() {
      for (const it of items) {
        if (!it.target) { it.src.name = it.newName; continue; }
        const ex = await DB.get('exercises', it.target); if (!ex) continue;
        const oldName = ex.name, finalName = it.myName || ex.name;
        const aliases = new Set(ex.aliases || []);
        if (aliasKey(it.src.name) !== aliasKey(finalName)) aliases.add(aliasKey(it.src.name)); // la próxima vez, directo
        if (finalName !== oldName) aliases.add(aliasKey(oldName));
        const patch = { aliases: [...aliases].filter(a => a && a !== aliasKey(finalName)) };
        if (finalName !== oldName) { patch.name = finalName; await DB.updateExercise(uid, ex.id, patch); }
        else await DB.put('exercises', { ...ex, ...patch });
        if (it.label) it.uses.forEach(u => { if (!u.x.label) u.x.label = it.label; });
      }
    }
  }

  return { importar, score, labelFrom, aliasKey };
})();
