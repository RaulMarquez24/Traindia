// ============================================================
// PLAN DE ENTRENO CON UNA IA · beta
// ------------------------------------------------------------
// Igual que en Nutrición: Traindía prepara un texto para una IA (ChatGPT, Gemini,
// Claude…). El usuario se lo da junto con el PDF o las fotos del plan de su
// entrenador (o sin documento: la IA se lo propone) y la IA devuelve un JSON
// («plan-ia»). Traindía lo valida, enseña lo que ha entendido y, si el usuario
// confirma, crea un plan nuevo con sus días y ejercicios.
// El texto lleva SIEMPRE el catálogo de ejercicios del usuario (para que la IA use
// sus nombres y no duplique ejercicios) y, si el plan es parecido a otro o una
// evolución de otro, ese plan (y, sin documento, su historial reciente).
// Traindía no envía nada a ninguna IA por su cuenta.
// ============================================================

const VPlanAI = (() => {
  const KIND = 'plan-ia';
  const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const TYPES = ['strong', 'moderate', 'light', 'rest'];
  const TYPE_LABELS = { strong: 'Día fuerte', moderate: 'Día moderado', light: 'Día ligero', rest: 'Descanso' };
  const EX_TYPES = ['weight', 'reps', 'time', 'check'];
  const BASE_CATS = ['Calentamiento', 'Movilidad', 'Pierna', 'Glúteo', 'Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Antebrazo', 'Agarre', 'Core', 'Cardio', 'Carrera', 'Estiramientos'];
  // Reparto de N sesiones en la semana cuando el documento no dice qué día es cada una
  const SPREAD = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };

  // Al volver de la IA, Android puede haber recargado la app: se recuerda que se pidió.
  const PROMPT_KEY = 'traindia-plan-prompt-pedido';
  // (se guarda también de qué plan partía, para enseñar los cambios respecto a él)
  const pidioPrompt = () => { try { return !!localStorage.getItem(PROMPT_KEY); } catch (e) { return false; } };
  const marcarPrompt = (on) => { try { if (on) localStorage.setItem(PROMPT_KEY, typeof on === 'object' ? JSON.stringify(on) : '1'); else localStorage.removeItem(PROMPT_KEY); } catch (e) {} };
  const pedido = () => { try { const v = JSON.parse(localStorage.getItem(PROMPT_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };

  const str = (v) => (v === null || v === undefined) ? '' : String(v).trim();
  const key = (n) => str(n).toLowerCase();

  // ---------- 1. Pedir el texto para la IA ----------
  const RELS = [
    { v: 'nuevo', ic: '✨', l: 'Uno nuevo', d: 'No se parece a ninguno de tus planes.' },
    { v: 'parecido', ic: '🔁', l: 'Parecido a…', d: 'Del mismo tipo que uno tuyo: copia sus nombres y su forma.' },
    { v: 'evolucion', ic: '📈', l: 'Evolución de…', d: 'El siguiente bloque de uno tuyo: te dice qué cambia.' },
  ];
  const hasExercises = (rt) => (rt.days || []).some(d => (d.blocks || []).some(b => (b.exercises || []).length));

  async function open(app) {
    const uid = app.activeUser.id;
    const [exs, plans, sessions] = await Promise.all([DB.exercisesOf(uid), DB.routinesOf(uid), DB.sessionsOf(uid)]);
    const cats = [...new Set([...BASE_CATS, ...exs.map(e => e.muscleGroup).filter(Boolean)])];
    const tuyos = usados(exs, plans, sessions);
    const bases = plans.filter(hasExercises).sort((a, b) => (a.order || 0) - (b.order || 0));
    const activeId = app.routine && app.routine.id;
    let mode = 'doc', rel = 'nuevo';
    UI.modal({
      title: 'Plan con una IA',
      size: 'wide',
      bodyHTML: `
        <div class="seg" role="radiogroup" id="paiMode">
          <button type="button" class="seg-opt on" data-mode="doc">Plan de mi entrenador</button>
          <button type="button" class="seg-opt" data-mode="ia">Que lo proponga la IA</button>
        </div>
        <p class="modal-text" data-show="doc">Traindía te prepara un texto para que se lo des a una IA <strong>junto con el PDF o las fotos del plan de tu entrenador</strong>. La IA te devuelve un archivo que la app entiende y tú revisas antes de guardar.</p>
        <p class="modal-text" data-show="ia" hidden>Cuéntale qué quieres y la IA te <strong>diseña el plan</strong> con tus ejercicios${bases.length ? ' y, si parte de uno tuyo, con lo que has ido levantando' : ''}. Tú lo revisas antes de guardar.</p>
        <span class="field-label">¿Qué es este plan?</span>
        <div class="pai-rels" role="radiogroup">${RELS.map(r => `<button type="button" class="pai-rel${r.v === rel ? ' on' : ''}" data-rel="${r.v}" role="radio" aria-checked="${r.v === rel}"${r.v !== 'nuevo' && !bases.length ? ' disabled' : ''}><span class="pai-ic">${r.ic}</span><strong>${r.l}</strong><span class="dim">${r.d}</span></button>`).join('')}</div>
        ${bases.length ? `<div id="paiBase" hidden>${UI.field('Tu plan', UI.select('base', bases.map(p => ({ value: p.id, label: `${p.name || 'Plan'}${p.id === activeId ? ' (activo)' : ''}` })), bases.some(p => p.id === activeId) ? activeId : bases[0].id))}</div>` : '<p class="field-hint">Cuando tengas un plan con ejercicios podrás decir que el nuevo se parece a él o que es su evolución.</p>'}
        <div data-show="ia" hidden>${UI.field('¿Qué quieres?', UI.textarea('objetivo', '', 'Objetivo, días a la semana, cuánto dura cada sesión, dónde entrenas y con qué material, molestias o lesiones…', 4))}</div>
        ${tuyos.list.length ? `<p class="field-hint pai-cat">${UI.icon('check', 13)}<span>Le pasa tus <strong>${tuyos.list.length} ejercicios</strong> (los que usas o tienes en algún plan) para que use los tuyos, con su nombre exacto y la variante en la etiqueta, y no te cree repetidos.</span></p>` : ''}
        <p class="field-hint" style="margin-bottom:0">Marca lo que aplique a tu caso:</p>
        <div class="metric-opts">
          <label class="metric-opt" data-show="doc"><input type="checkbox" data-opt="fotos"><span>Lo tengo en fotos, no en PDF</span></label>
          <label class="metric-opt" data-show="doc"><input type="checkbox" data-opt="idioma"><span>El documento está en otro idioma</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="tecnica" checked><span>Que añada una nota breve de técnica en cada ejercicio</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="sustitutos" checked><span>Que proponga 1-2 alternativas por ejercicio${'<span data-show="doc"> si el documento no trae</span>'}</span></label>
        </div>
        <p class="field-hint" data-show="doc">Las series, repeticiones, descansos y cargas se copian <strong>tal cual</strong> del documento; lo que no esté claro sale como duda para que lo revises.</p>
        <p class="field-hint" data-show="ia" hidden>La IA no te conoce como tu entrenador: revisa las cargas y, si tienes alguna lesión, consúltalo con un profesional.</p>
        <p class="field-hint" data-show="doc">⚠️ Tu documento se sube al servicio de IA que elijas y puede llevar datos personales. El texto le pide que <strong>no los copie</strong> al resultado.</p>`,
      onMount: (root) => {
        const sync = () => {
          root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
          root.querySelectorAll('[data-show]').forEach(el => { el.hidden = el.dataset.show !== mode; });
          root.querySelectorAll('[data-rel]').forEach(b => { b.classList.toggle('on', b.dataset.rel === rel); b.setAttribute('aria-checked', b.dataset.rel === rel); });
          const base = root.querySelector('#paiBase'); if (base) base.hidden = rel === 'nuevo';
        };
        root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; sync(); }));
        root.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', () => { rel = b.dataset.rel; sync(); }));
        sync();
      },
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Continuar', kind: 'primary', onClick: async (root) => {
          const op = { modo: mode, rel };
          root.querySelectorAll('[data-opt]').forEach(c => { op[c.dataset.opt] = mode === 'doc' || !['fotos', 'idioma'].includes(c.dataset.opt) ? c.checked : false; });
          op.objetivo = mode === 'ia' ? (root.querySelector('textarea[name="objetivo"]').value || '').trim() : '';
          if (mode === 'ia' && rel === 'nuevo' && !op.objetivo) { UI.toast('Cuéntale qué quieres: objetivo, días, material…', 'err'); return false; }
          const sel = root.querySelector('select[name="base"]');
          const base = rel !== 'nuevo' && sel ? bases.find(p => p.id === sel.value) : null;
          const ctx = contexto(tuyos, exs, plans, sessions, base, mode === 'ia');
          UI.askAI(buildPrompt(op, cats, ctx));
          marcarPrompt(base ? { rel, baseId: base.id, baseName: base.name || 'tu plan' } : true); // al volver, «El plan» ofrece pegar el resultado
        } },
      ],
    });
  }

  // ---------- Lo que la IA necesita saber de ti ----------
  // catálogo (por categoría, con sus etiquetas y cuántas veces lo has registrado),
  // el plan del que parte y, sin documento, lo que has hecho últimamente en él.
  const fmtT = (sec) => { sec = Math.round(sec); return sec >= 600 && sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const num = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  function fmtSerie(type, st) {
    const w = parseFloat(st.weight), r = parseFloat(st.reps), t = parseFloat(st.time), d = parseFloat(st.distance), m = parseFloat(st.sdist), l = parseFloat(st.load);
    const lastre = l > 0 ? (st.loadMode === 'asist' ? ` asist. ${num(l)} kg` : ` +${num(l)} kg`) : '';
    if (type === 'weight') return w > 0 && r > 0 ? `${num(w)} kg×${r}` : r > 0 ? `${r} reps` : '';
    if (type === 'reps') return r > 0 ? `${r}${lastre}` : '';
    if (type === 'time') return [t > 0 ? fmtT(t) : '', m > 0 ? `${num(m)} m` : d > 0 ? `${num(d)} km` : '', lastre.trim()].filter(Boolean).join(' ');
    return '';
  }
  // Los ejercicios que cuentan: los que has registrado o tienes en algún plan (los de
  // «Sin usar» solo alargarían el texto), sin nombres repetidos: se queda el de más registros.
  function usados(exs, plans, sessions) {
    const veces = new Map();
    sessions.forEach(x => new Set((x.entries || []).map(e => e.exerciseId)).forEach(id => veces.set(id, (veces.get(id) || 0) + 1)));
    const enPlan = new Set();
    const etiquetas = new Map();
    plans.forEach(rt => (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(x => {
      if (!x.exerciseId) return;
      enPlan.add(x.exerciseId);
      const lab = str(x.label); if (!lab) return;
      const arr = etiquetas.get(x.exerciseId) || []; if (!arr.some(a => key(a) === key(lab))) arr.push(lab);
      etiquetas.set(x.exerciseId, arr);
    }))));
    const porNombre = new Map();
    exs.filter(e => veces.get(e.id) || enPlan.has(e.id)).forEach(e => {
      const k = key(e.name), prev = porNombre.get(k);
      if (!prev || (veces.get(e.id) || 0) > (veces.get(prev.id) || 0)) porNombre.set(k, e);
    });
    return { list: [...porNombre.values()], veces, etiquetas };
  }
  function contexto(tuyos, exs, plans, allSessions, base, conHistorial) {
    const { veces, etiquetas } = tuyos;
    const sessions = allSessions.filter(x => x.date).sort((a, b) => b.date.localeCompare(a.date));
    const exById = new Map(exs.map(e => [e.id, e]));
    const porCat = new Map();
    tuyos.list.forEach(e => { const c = e.muscleGroup || 'General'; if (!porCat.has(c)) porCat.set(c, []); porCat.get(c).push(e); });
    const orden = (c) => { const i = BASE_CATS.indexOf(c); return i < 0 ? 99 : i; };
    const catalogo = [...porCat.entries()].sort((a, b) => orden(a[0]) - orden(b[0]) || a[0].localeCompare(b[0]))
      .map(([c, list]) => `${c}:\n` + list.sort((a, b) => (veces.get(b.id) || 0) - (veces.get(a.id) || 0) || a.name.localeCompare(b.name)).map(e => {
        const n = veces.get(e.id) || 0, labs = (etiquetas.get(e.id) || []).slice(0, 4);
        return `- ${e.name} [${e.type || 'weight'}]${labs.length ? ` · etiquetas: ${labs.join(', ')}` : ''}${n ? ` · ${n} ${n === 1 ? 'registro' : 'registros'}` : ''}`;
      }).join('\n')).join('\n');
    if (!tuyos.list.length) return {};
    if (!base) return { catalogo };

    const nombre = (x) => (exById.get(x.exerciseId) || {}).name || x.name || '';
    const dias = (base.days || []).filter(d => !d.isRest && (d.blocks || []).some(b => (b.exercises || []).length));
    const plan = [
      `Nombre: ${base.name || 'Plan'}${base.planDuration ? ` · Duración: ${base.planDuration}` : ''}`,
      ...dias.map(d => `${d.name}${d.focus ? ` — ${d.focus}` : ''}:\n` + (d.blocks || []).filter(b => (b.exercises || []).length).map(b =>
        `  ${b.label || 'General'}${b.optional ? ' (opcional)' : ''}: ` + b.exercises.map(x =>
          `${nombre(x)}${x.sets ? ` ${x.sets}` : ''}${x.label ? ` «${x.label}»` : ''}${x.notes ? ` (${x.notes})` : ''}`).join(' | ')).join('\n')),
      ...(Array.isArray(base.planNotes) && base.planNotes.length ? [`Notas: ${base.planNotes.join(' · ')}`] : []),
    ].join('\n');
    if (!conHistorial) return { catalogo, plan };

    // Historial: las 3 últimas veces de cada ejercicio del plan (sin los de «hecho/no»)
    const ids = [...new Set(dias.flatMap(d => (d.blocks || []).flatMap(b => b.exercises.map(x => x.exerciseId))).filter(Boolean))];
    const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const lineas = ids.map(id => {
      const e = exById.get(id); if (!e || e.type === 'check') return '';
      const veces3 = [];
      for (const x of sessions) {
        const en = (x.entries || []).find(y => y.exerciseId === id); if (!en) continue;
        let sets = (en.sets || []).map(st => fmtSerie(e.type, st)).filter(Boolean);
        if (!sets.length && en.totals && (en.totals.distance || en.totals.time)) sets = [[en.totals.time ? fmtT(parseFloat(en.totals.time)) : '', en.totals.distance ? `${num(parseFloat(en.totals.distance))} km` : ''].filter(Boolean).join(' ')];
        if (sets.length) veces3.push(`${ddmm(x.date)}: ${sets.join(', ')}`);
        if (veces3.length >= 3) break;
      }
      return veces3.length ? `- ${e.name}: ${veces3.join(' | ')}` : `- ${e.name}: sin registros`;
    }).filter(Boolean);
    const hace4 = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    const ult4 = sessions.filter(x => x.date >= hace4).length;
    const historial = [`Entrenos registrados en las últimas 4 semanas: ${ult4} (el plan tiene ${dias.length} días por semana).`, ...lineas].join('\n');
    return { catalogo, plan, historial };
  }

  // ---------- 2. Traer el resultado (archivo o pegado) ----------
  function extraerJSON(txt) {
    let t = String(txt || '').trim();
    const bloque = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (bloque) t = bloque[1].trim();
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    return JSON.parse(t);
  }
  function paste(app) {
    UI.modal({
      title: 'Pegar el resultado de la IA',
      size: 'wide',
      bodyHTML: `<p class="modal-text">La IA te devuelve un bloque de texto o un archivo:</p>
        <ul class="nut-check">
          <li><strong>Si te ha dado un archivo</strong>: búscalo con el botón de aquí abajo, o ábrelo desde tus descargas y dale a <strong>Compartir → Traindía</strong>.</li>
          <li><strong>Si te lo ha escrito en el chat</strong>: toca el <strong>botón de copiar</strong> del bloque, vuelve aquí y pégalo abajo.</li>
        </ul>
        <button class="btn ghost block" id="paFile">${UI.icon('upload', 15)} Elegir el archivo</button>
        <div class="nut-or"><span>o pégalo aquí</span></div>
        <textarea class="inp" id="paJson" rows="6" placeholder="Pega aquí lo que te haya dado la IA"></textarea>
        <p class="field-hint">Da igual si viene con texto alrededor o con las comillas del bloque: se limpia solo.</p>`,
      onMount: (root) => {
        root.querySelector('#paFile').addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file'; // sin filtro: en Android los .json llegan como octet-stream
          inp.addEventListener('change', () => {
            const f = inp.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
              let parsed;
              try { parsed = extraerJSON(rd.result); } catch (e) { UI.toast('Ese archivo no se entiende. ¿Es el que te dio la IA?', 'err'); return; }
              UI.closeModal(root);
              preview(app, parsed);
            };
            rd.readAsText(f);
          });
          inp.click();
        });
      },
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        { label: 'Revisar', kind: 'primary', onClick: (root) => {
          const txt = (root.querySelector('#paJson').value || '').trim();
          if (!txt) { UI.toast('Pega aquí lo que te dio la IA', 'err'); return false; }
          let parsed;
          try { parsed = extraerJSON(txt); } catch (e) { UI.toast('No he sabido leer eso. Copia el bloque entero, desde la primera llave.', 'err'); return false; }
          preview(app, parsed);
        } },
      ],
    });
  }

  // ---------- 3. Entender y normalizar lo que devuelve la IA ----------
  // Devuelve { errores, avisos, dudas, notas, routine, exercises } con el formato de
  // un export de plan de Traindía (lo que ya sabe importar VData).
  function normalizar(payload) {
    const errores = [], avisos = [];
    const p = payload && payload.data && (payload.data.plan || payload.data);
    if (payload && payload.error === 'no-es-un-plan') { errores.push('La IA dice que el documento no es un plan de entrenamiento.'); return { errores }; }
    if (!p || !Array.isArray(p.dias) || !p.dias.length) { errores.push('El resultado no trae ningún día de entrenamiento.'); return { errores }; }

    // Catálogo que trae la IA (por nombre)
    const defs = new Map();
    const addDef = (e) => {
      const n = str(e && e.nombre); if (!n) return null;
      if (!defs.has(key(n))) defs.set(key(n), { nombre: n, categoria: str(e.categoria), tipo: str(e.tipo), tecnica: str(e.tecnica), sustitutos: [], videos: [], series: '' });
      const d = defs.get(key(n));
      if (!d.series && e.series) d.series = str(e.series);
      if (!d.categoria && e.categoria) d.categoria = str(e.categoria);
      if (!d.tipo && e.tipo) d.tipo = str(e.tipo);
      if (!d.tecnica && e.tecnica) d.tecnica = str(e.tecnica);
      (Array.isArray(e.sustitutos) ? e.sustitutos : []).forEach(s => { const sn = str(typeof s === 'string' ? s : s && s.nombre); if (sn && !d.sustitutos.some(x => key(x) === key(sn))) d.sustitutos.push(sn); });
      (Array.isArray(e.videos) ? e.videos : []).forEach(v => {
        const url = str(typeof v === 'string' ? v : v && v.url);
        if (/^https?:\/\//i.test(url) && !d.videos.some(x => x.url === url)) d.videos.push(str(v && v.nombre) ? { url, label: str(v.nombre) } : { url });
      });
      return d;
    };
    (Array.isArray(p.ejercicios) ? p.ejercicios : []).forEach(addDef);

    // Días de entreno, en el orden del documento
    const sesiones = p.dias.filter(d => d && str(d.tipo) !== 'rest' && Array.isArray(d.secciones) && d.secciones.some(s => (s.ejercicios || []).length));
    if (!sesiones.length) { errores.push('Ningún día trae ejercicios.'); return { errores }; }
    if (sesiones.length > 7) avisos.push(`El documento trae ${sesiones.length} sesiones: solo caben 7 en la semana, el resto no se importa.`);

    // Colocar cada sesión en un día de la semana
    const byWd = new Array(7).fill(null);
    const sinDia = [];
    sesiones.slice(0, 7).forEach(s => {
      const wd = WEEKDAYS.findIndex(w => UI.norm(w) === UI.norm(str(s.diaSemana)));
      if (wd >= 0 && !byWd[wd]) byWd[wd] = s; else sinDia.push(s);
    });
    if (sinDia.length) {
      const libres = byWd.map((x, i) => x ? -1 : i).filter(i => i >= 0);
      const patron = (SPREAD[sesiones.length] || SPREAD[Math.min(sesiones.length, 7)]).filter(i => libres.includes(i));
      const huecos = [...patron, ...libres.filter(i => !patron.includes(i))];
      sinDia.forEach((s, k) => { byWd[huecos[k]] = s; });
      avisos.push(sinDia.length === sesiones.length
        ? `El documento no dice qué día de la semana es cada sesión: las he puesto en ${sinDia.map((s, k) => WEEKDAYS[huecos[k]]).join(', ')}. Muévelas con «Intercambiar» si entrenas otros días.`
        : `${sinDia.length} sesión(es) sin día de la semana: las he colocado en los días libres.`);
    }

    let nEj = 0;
    const days = WEEKDAYS.map((w, i) => {
      const s = byWd[i];
      if (!s) return { id: `d${i}`, name: w, type: 'rest', typeLabel: TYPE_LABELS.rest, isRest: true, focus: 'Recuperación', place: '', placeAccent: false, duration: '', order: i, blocks: [], substitutes: [], substitutesTitle: '', planB: [], relatedGuides: [] };
      const tipo = TYPES.includes(str(s.tipo)) ? str(s.tipo) : '';
      const titulo = str(s.titulo), enfoque = str(s.enfoque);
      const focus = [titulo && !WEEKDAYS.some(x => UI.norm(x) === UI.norm(titulo)) ? titulo : '', enfoque].filter(Boolean).join(' · ');
      const blocks = (s.secciones || []).map(sec => ({
        label: str(sec.categoria) || 'General', optional: !!sec.opcional,
        exercises: (sec.ejercicios || []).map(x => {
          const d = addDef({ nombre: x.nombre, categoria: sec.categoria, tipo: x.tipo, series: x.series });
          if (!d) return null;
          nEj++;
          const row = { exerciseId: null, name: d.nombre, type: 'weight', sets: str(x.series), priority: !!x.prioritario, optional: !!x.opcional };
          const det = str(x.detalle); if (det) row.notes = det.slice(0, 140);
          const lab = str(x.etiqueta); if (lab) row.label = lab.slice(0, 18);
          return row;
        }).filter(Boolean),
      })).filter(b => b.exercises.length);
      return { id: `d${i}`, name: w, type: tipo, typeLabel: tipo ? TYPE_LABELS[tipo] : '', isRest: false, focus, place: '', placeAccent: false, duration: str(s.duracion), order: i, blocks, substitutes: [], substitutesTitle: '', planB: [], relatedGuides: [] };
    });

    // Ejercicios con id propio; los sustitutos que no vengan definidos se crean con
    // la categoría y el tipo de su ejercicio.
    [...defs.values()].forEach(d => d.sustitutos.forEach(sn => {
      if (!defs.has(key(sn))) defs.set(key(sn), { nombre: sn, categoria: d.categoria, tipo: d.tipo, tecnica: '', sustitutos: [], videos: [] });
    }));
    const idOf = new Map();
    let k = 0;
    defs.forEach((d, kk) => idOf.set(kk, `ia_ex_${++k}`));
    const exercises = [...defs.values()].map(d => {
      const type = EX_TYPES.includes(d.tipo) ? d.tipo : guessType(d);
      const e = { id: idOf.get(key(d.nombre)), name: d.nombre, muscleGroup: d.categoria || 'General', type,
        substitutes: d.sustitutos.map(sn => idOf.get(key(sn))).filter(Boolean) };
      if (d.tecnica) e.howto = d.tecnica;
      if (d.videos.length) { e.videos = d.videos; e.videoUrl = d.videos[0].url; }
      if (type === 'time') e.metrics = /carrera|correr|cinta|bici|el[ií]ptica|remo erg|km|metros|\d+\s*m\b/i.test(d.nombre) ? ['time', 'distance'] : [];
      if (type === 'check') e.metrics = [];
      return e;
    });
    days.forEach(d => d.blocks.forEach(b => b.exercises.forEach(r => {
      const e = exercises.find(x => key(x.name) === key(r.name));
      r.exerciseId = e.id; r.type = e.type;
    })));

    const notas = (Array.isArray(p.notas) ? p.notas : []).map(str).filter(Boolean);
    const cambios = (Array.isArray(p.cambios) ? p.cambios : []).map(str).filter(Boolean);
    const dudas = (Array.isArray(p.dudas) ? p.dudas : []).map(str).filter(Boolean);
    const routine = { id: 'ia_plan', name: str(p.nombre) || 'Plan del entrenador', planType: 'custom', dayTypeUnset: true, days,
      source: 'ia', planNotes: notas.length ? notas : undefined, planDuration: str(p.duracion) || undefined, planStart: str(p.inicio) || undefined };
    return { errores, avisos, dudas, notas, cambios, routine, exercises, nSes: sesiones.slice(0, 7).length, nEj, nVid: exercises.filter(e => e.videos).length };
  }

  // Si la IA no dice el tipo, se deduce de la categoría y de cómo se prescribe.
  function guessType(d) {
    const c = UI.norm(d.categoria || ''), s = UI.norm(d.series || ''), n = UI.norm(d.nombre || '');
    // Lo que dice la prescripción manda: «10 min» es tiempo aunque vaya en el calentamiento.
    if (/\bmin\b|\bkm\b|\bseg\b|\d\s*s\b|\d\s*m\b|max/.test(s)) return 'time';
    if (/calentamiento|movilidad|estiramiento/.test(c) || /estir|movilidad|activacion|articular/.test(n)) return 'check';
    if (/carrera|cardio/.test(c) || /plancha|suspension|colgad|carrera|correr/.test(n)) return 'time';
    if (/dominad|flexion|fondos|abdominal/.test(n)) return 'reps';
    return 'weight';
  }

  // ---------- 4. Enseñar lo entendido y crear el plan ----------
  function preview(app, payload) {
    const r = normalizar(payload);
    if (r.errores.length) {
      UI.modal({
        title: 'No se puede importar',
        bodyHTML: `<ul class="nut-check err">${r.errores.map(e => `<li>${UI.esc(e)}</li>`).join('')}</ul>
          <p class="field-hint">Vuelve a pedírselo a la IA con el texto que te dio Traindía, sin cambiarlo.</p>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
      });
      return;
    }
    const exById = Object.fromEntries(r.exercises.map(e => [e.id, e]));
    const dias = r.routine.days.map(d => d.isRest
      ? `<div class="tp-day rest"><strong>${UI.esc(d.name)}</strong><span class="dim">Descanso</span></div>`
      : `<div class="tp-day"><strong>${UI.esc(d.name)}</strong>${d.focus ? `<span class="tp-focus">${UI.esc(d.focus)}</span>` : ''}
          <ul>${d.blocks.flatMap(b => b.exercises).map(x => `<li class="${x.priority ? 'prio' : ''}${x.optional ? ' opt' : ''}"><span>${UI.esc(x.name)}${exById[x.exerciseId] && exById[x.exerciseId].videos ? ' ▶' : ''}</span><span class="dim">${UI.esc(x.sets || '')}</span></li>`).join('')}</ul>
        </div>`).join('');
    const lista = (t, arr, cls) => arr.length ? `<div class="card-label" style="margin-top:14px">${t}</div><ul class="nut-check ${cls}">${arr.map(a => `<li>${UI.esc(a)}</li>`).join('')}</ul>` : '';
    UI.modal({
      title: 'Esto es lo que he entendido',
      size: 'wide',
      bodyHTML: `<p class="modal-text dim">El importador está <strong>en beta</strong>: revisa series y cargas antes de entrenar y cuéntame qué tal ha salido.</p>
        <div class="nut-sum"><span><b>${r.nSes}</b> sesiones</span><span><b>${r.nEj}</b> ejercicios</span>${r.nVid ? `<span><b>${r.nVid}</b> con vídeo</span>` : ''}${r.dudas.length ? `<span class="warn"><b>${r.dudas.length}</b> dudas</span>` : ''}</div>
        ${UI.field('Nombre del plan', UI.input('planName', r.routine.name))}
        <div class="tp-days">${dias}</div>
        ${lista(`Cambios respecto a ${pedido().baseName || 'tu plan'}`, r.cambios, '')}
        ${lista('Avisos', r.avisos, 'warn')}
        ${lista('Dudas de la IA', r.dudas, 'warn')}
        ${lista('Notas del entrenador', r.notas, '')}
        <p class="field-hint">Se crea como un plan nuevo y pasa a ser el activo. Tu plan actual no se toca: lo recuperas cuando quieras desde «El plan».</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Contar qué tal', kind: 'ghost', onClick: () => { reportar(app, r); return false; } },
        { label: 'Crear y activar', kind: 'primary', onClick: async (root) => {
          const name = (root.querySelector('input[name="planName"]').value || '').trim() || r.routine.name;
          const prev = app.routine;
          const rt = await VData.createImportedPlan(app.activeUser.id, r.routine, new Set(r.routine.days.map(d => d.id)), name, r.exercises);
          await DB.setActivePlan(app.activeUser.id, rt.id);
          // El plan en blanco que se crea al darse de alta (sin un solo ejercicio) ya no pinta nada.
          const vacio = prev && prev.planType === 'custom' && !(prev.days || []).some(d => (d.blocks || []).some(b => (b.exercises || []).length));
          if (vacio) { try { await DB.deletePlan(prev.id); } catch (e) {} }
          marcarPrompt(false);
          await app.refreshRoutine();
          app.history = [];
          app.go('week', {}, true);
          UI.toast('Plan creado y activado');
        } },
      ],
    });
  }

  function reportar(app, r) {
    const ctx = [
      'Importador de planes de entreno (beta)',
      `Sesiones: ${r.nSes} · Ejercicios: ${r.nEj} · Con vídeo: ${r.nVid} · Dudas: ${r.dudas.length} · Avisos: ${r.avisos.length}`,
      '',
      '¿Qué tal ha salido? ',
    ].join('\n');
    app.openFeedback({ tipo: 'Importador de planes (beta)', mensaje: ctx });
  }

  // ---------- EL TEXTO PARA LA IA ----------
  // Va pegado a normalizar(): si cambia uno, cambia el otro.
  function buildPrompt(op, cats, ctx = {}) {
    const doc = op.modo !== 'ia';
    const extra = [];
    if (op.fotos) extra.push('- Te paso FOTOS: puede haber texto torcido o cortado. Si no puedes leer algo con seguridad, NO lo adivines: anótalo en "dudas".');
    if (op.idioma) extra.push('- El documento puede estar en otro idioma: traduce los nombres de los ejercicios al español de gimnasio, pero respeta series, repeticiones, cargas y descansos tal cual.');
    extra.push(op.tecnica
      ? '- Rellena "tecnica" de cada ejercicio con 1-2 frases de las claves de ejecución. Si el documento explica cómo hacerlo, usa eso; si no, usa las claves estándar del ejercicio.'
      : '- Deja "tecnica" vacía salvo que el documento explique cómo se hace el ejercicio.');
    extra.push(!doc
      ? (op.sustitutos ? '- En "sustitutos" propón 1-2 alternativas del mismo patrón de movimiento (con otro material), preferiblemente de MIS EJERCICIOS.' : '- Deja "sustitutos" vacío.')
      : op.sustitutos
      ? '- En "sustitutos": primero las alternativas que dé el documento ("A o B"); si no da ninguna, propón 1-2 alternativas habituales del mismo patrón de movimiento (con otro material: mancuernas, máquina, polea o peso corporal), preferiblemente de MIS EJERCICIOS.'
      : '- En "sustitutos" pon SOLO las alternativas que dé el propio documento ("A o B").');
    if (!doc) extra.push(`- Lo que quiero: ${op.objetivo || 'no he dicho nada más: mantén los días, la duración de las sesiones y el estilo del plan del que parto.'}`);

    // Mi catálogo: siempre. Así la IA usa mis nombres y no me crea ejercicios repetidos.
    const catalogo = ctx.catalogo ? `
# MIS EJERCICIOS (MUY IMPORTANTE)
Estos son los ejercicios que ya tengo en la app, por categoría, con su tipo, las etiquetas que suelo
usar y cuántas veces los he registrado. Mi historial va unido a ellos, así que:
- Antes de poner un ejercicio, búscalo aquí. Si es el MISMO ejercicio aunque ${doc ? 'el documento lo llame' : 'lo llamarías'} distinto (en plural,
  con otro orden de palabras, más corto o más largo, con la variante en el nombre…), usa el nombre de
  esta lista EXACTAMENTE, letra por letra, con su mismo tipo.
- La variante NO va en el nombre: va en "etiqueta". "Carrera" con etiqueta "Suave", no "Carrera suave";
  "Jalón al pecho" con etiqueta "Agarre supino", no "Jalón al pecho supino". Usa las etiquetas que ya uso
  si encajan.
- Si dos de la lista te encajan, elige el que más registros tiene.
- Si ${doc ? 'el documento agrupa en una línea' : 'quieres agrupar'} varios ejercicios que aquí están por separado, ponlos por separado.
- Solo si de verdad es otro ejercicio (otro movimiento u otro material) usa un nombre nuevo, y en
  "ejercicios" márcalo con "nuevo": true.

${ctx.catalogo}
` : '';
    const relTxt = !ctx.plan ? '' : op.rel === 'evolucion' ? `
# EL PLAN DEL QUE PARTO: este es su EVOLUCIÓN
El plan nuevo es el siguiente bloque de este plan mío. Si un ejercicio sigue, usa EXACTAMENTE el mismo
nombre y, si encaja, la misma etiqueta. ${doc ? 'Las series, cargas y ejercicios salen del documento: este plan es solo la referencia.' : 'Progresa de forma razonable a partir de mi historial: más carga, más repeticiones o más volumen, pero no todo a la vez ni en todos los ejercicios. Cambia algún ejercicio solo si tiene sentido (estancamiento, variedad, lo que te pido).'}
En "cambios" resume lo que cambia respecto a él, una línea corta por cambio: "+ Curl martillo"
(entra), "− Apertura" (sale), "Press banca: 4×8 → 5×5". Si no cambia nada, "cambios": [].

${ctx.plan}
` : `
# EL PLAN DEL QUE PARTO: es PARECIDO a este
El plan nuevo es del mismo tipo que este plan mío. Úsalo de referencia para los nombres, las etiquetas
y la forma de organizarlo. ${doc ? 'Pero lo que manda es el documento: no añadas nada que no esté en él.' : 'Mantén su estilo, pero no lo copies: hazlo según lo que te pido.'}

${ctx.plan}
`;
    const historial = ctx.historial ? `
# MI HISTORIAL RECIENTE (las últimas veces de cada ejercicio del plan del que parto)
${ctx.historial}
` : '';

    const intro = doc
      ? `Eres un asistente que convierte planes de entrenamiento en un JSON para la app Traindía.
Te adjunto el plan de entrenamiento que me ha preparado mi entrenador.`
      : `Eres un entrenador personal que diseña planes de entrenamiento y los entrega en un JSON para la app Traindía.
No tengo documento: quiero que TÚ me diseñes el plan con lo que te cuento en MI CASO, usando mis ejercicios${ctx.historial ? ' y mi historial' : ''}.`;
    const reglas = doc ? `# REGLA MÁS IMPORTANTE
NO INVENTES LA PRESCRIPCIÓN. Series, repeticiones, tiempos, distancias, cargas y descansos
se copian TAL CUAL del documento. Si algo no está claro, déjalo vacío y descríbelo en
"dudas". Es el plan real de una persona: una carga o un descanso inventado puede lesionarla.
Tampoco inventes ejercicios ni días que no estén en el documento.

# QUÉ *NO* ES UNA DUDA (no llenes "dudas" de ruido)
No es una duda que un día tenga más ejercicios que otro, que un ejercicio no tenga descanso
indicado o que el calentamiento no lleve series. Reserva "dudas" para lo que de verdad no se
puede resolver leyendo el documento: texto ilegible, datos contradictorios o una cifra que
falta donde claramente debería estar. Si no hay nada así, devuelve "dudas": [].

# NO COPIES DATOS PERSONALES
No incluyas nombres, teléfonos, correos ni el nombre del entrenador o del centro.` : `# REGLA MÁS IMPORTANTE
PRUDENCIA. Es el plan real de una persona. Las cargas salen de mi historial: no subas más de un
5-10 % sobre lo último que hice. Si no tengo historial de un ejercicio, no pongas kilos: indica el
esfuerzo en "detalle" ("deja 2-3 repeticiones en reserva"). No uses material que no te haya dicho
que tengo. Pon calentamiento al principio y descansos razonables.
En "dudas" pon lo que hayas tenido que suponer (días, material, nivel…), una línea por cosa.`;

    return `${intro}

# CÓMO ME LO TIENES QUE ENTREGAR (importante)
1. Si puedes generar archivos descargables, dame el resultado como un ARCHIVO llamado
   "traindia-plan.json". Es lo que más me facilita las cosas.
2. Además, y siempre, escribe el JSON dentro de un bloque de código \`\`\`json … \`\`\`
   para que pueda copiarlo con el botón de copiar.
3. No escribas nada más: ni resumen, ni explicación, ni comentarios dentro del JSON.

${reglas}
${catalogo}${relTxt}${historial}
# CÓMO SE ORGANIZA
- Cada día de entrenamiento ("Día 1", "Lunes", "Sesión A"…) es un elemento de "dias",
  en orden. Si ${doc ? 'el documento dice' : 'sabes'} qué día de la semana es, ponlo en "diaSemana"
  ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado" o "Domingo"); si no, null.
- Los días de descanso no hace falta ponerlos.
- Dentro de cada día, "secciones" agrupa los ejercicios por CATEGORÍA, en el orden en que se
  hacen. Una categoría puede repetirse en el mismo día si el documento la intercala.
  Usa preferentemente estas categorías: ${cats.join(', ')}.
- Calentamiento, activaciones y movilidad → "Calentamiento" o "Movilidad". Estirar al final → "Estiramientos".
- Correr, series de 400 m, rodajes → "Carrera". Bici, elíptica, cinta → "Cardio".

# CADA EJERCICIO DENTRO DE UN DÍA
- "nombre": el de MIS EJERCICIOS si ya lo tengo. Si es nuevo, nombre corto de gimnasio, en español
  ("Press banca", "Remo sentado", "Hip thrust"), sin la variante. Nada de descripciones largas. El MISMO
  ejercicio se llama igual en todos los días.
- "series": la prescripción corta: "4×12", "3×10-12", "3×Máx", "5×400 m", "10 min", "15-20 min".
  Vacío si no lleva (calentamiento, estiramientos).
- "detalle": lo demás que diga el documento, breve: "Descanso 45 s", "Lastre 7,5 kg · Descanso 3 min",
  "Mantener 2 s arriba", "Alternando piernas, mancuerna 6-8 kg". Máximo unas 15 palabras.
- "etiqueta": opcional, 1-3 palabras para verlo de un vistazo: la variante o la carga ("Suave",
  "Agarre supino", "De pie", "Lastre 7,5 kg", "Z2", "Por pierna"). Máximo 18 caracteres.
- "prioritario": true solo si el documento lo destaca como clave (negrita, "importante", "prioridad").
- "opcional": true si el documento dice que es opcional, "si da tiempo" o "hacer algunos de estos".

# LOS EJERCICIOS (catálogo, uno por nombre distinto)
En "ejercicios" pon cada ejercicio UNA vez con:
- "categoria": la misma que su sección (si ya lo tengo, la de MIS EJERCICIOS).
- "tipo": "weight" (se registra peso y repeticiones), "reps" (repeticiones con el peso corporal:
  dominadas, flexiones, abdominales), "time" (tiempo o distancia: carrera, planchas, suspensiones,
  cardio) o "check" (solo hecho/no hecho: movilidad, activación, estiramientos, técnica de carrera).
- "tecnica": ver MI CASO.
- "sustitutos": lista de NOMBRES de ejercicios alternativos. Ver MI CASO.
- "videos": los enlaces que el documento asocie a ESE ejercicio, con un "nombre" corto si hay varios.
  Si un enlace sirve para varios ejercicios, ponlo en todos. Si no sabes a qué ejercicio va, anótalo en "dudas".

# NOTAS GENERALES
Las indicaciones que valen para todo el plan ("respetar los descansos", "estirar siempre",
"hacer las activaciones todas las semanas", "elige una carga que te deje 2 repeticiones en
reserva") van en "notas", una por frase, resumidas. Si el documento dice cuánto dura el plan
o cuándo empieza, ponlo en "duracion" ("4 semanas") e "inicio" ("2026-09-28").

${doc ? 'Si el documento NO es un plan de entrenamiento, devuelve {"error":"no-es-un-plan"} y nada más.\n' : ''}
# FORMATO EXACTO
{
  "format": "traindia-export",
  "version": 2,
  "kind": "plan-ia",
  "data": {
    "plan": {
      "nombre": "Plan de fuerza",
      "duracion": "4 semanas",
      "inicio": null,
      "dias": [
        {
          "titulo": "Día 1",
          "diaSemana": null,
          "tipo": "",
          "enfoque": "Espalda y bíceps",
          "duracion": "",
          "secciones": [
            { "categoria": "Calentamiento", "ejercicios": [
              { "nombre": "Movilidad articular", "series": "", "detalle": "", "etiqueta": "", "prioritario": false, "opcional": false },
              { "nombre": "Carrera", "series": "10 min", "detalle": "Ritmo suave", "etiqueta": "Suave", "prioritario": false, "opcional": false }
            ] },
            { "categoria": "Espalda", "ejercicios": [
              { "nombre": "Jalón al pecho", "series": "4×12", "detalle": "Descanso 45 s", "etiqueta": "", "prioritario": false, "opcional": false }
            ] }
          ]
        }
      ],
      "ejercicios": [
        { "nombre": "Jalón al pecho", "categoria": "Espalda", "tipo": "weight",
          "tecnica": "Pecho alto, tira de la barra hacia la parte alta del pecho con los codos hacia abajo.",
          "sustitutos": ["Dominadas asistidas", "Remo sentado"],
          "videos": [ { "url": "https://…", "nombre": "" } ] }
      ],
      "notas": [ "Respetar los tiempos de descanso" ],
      "cambios": [],
      "dudas": []
    }
  }
}

# REGLAS DE FORMATO
- Los nombres del ejemplo son solo ejemplos: usa los de MIS EJERCICIOS.
- "tipo" del día: déjalo "" salvo que el documento diga la intensidad (entonces "strong", "moderate" o "light").
- Todos los ejercicios de los días tienen que estar también en "ejercicios", con el mismo nombre.
- Deja "dudas" como array vacío solo si de verdad no hay ninguna.

# MI CASO
${extra.join('\n')}

Devuelve únicamente el JSON, en un bloque de código, y como archivo descargable si puedes.`.replace(/\n{3,}/g, '\n\n');
  }

  return { open, paste, preview, normalizar, buildPrompt, pidioPrompt, olvidarPrompt: () => marcarPrompt(false), KIND };
})();
