// ============================================================
// PLAN DE ENTRENO CON UNA IA · beta
// ------------------------------------------------------------
// Igual que en Nutrición: Traindía prepara un texto para una IA (ChatGPT, Gemini,
// Claude…). El usuario se lo da junto con el PDF o las fotos del plan de su
// entrenador (o sin documento: la IA se lo propone) y la IA devuelve un JSON
// («plan-ia»). Traindía lo lee venga como venga (otro formato, campos en inglés,
// ejercicios como texto, cortado…), enseña lo que ha entendido, revisa contigo los
// ejercicios y, si confirmas, crea un plan nuevo.
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
    { v: 'nuevo', l: 'No, es nuevo' },
    { v: 'parecido', l: 'Parecido a…' },     // del mismo tipo: copia sus nombres y su forma
    { v: 'evolucion', l: 'Evolución de…' },  // el siguiente bloque: dice qué cambia
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
    // Lo de pegar la respuesta va arriba y en grande solo si ya le pediste el texto (vuelves de la IA)
    const vuelves = pidioPrompt();
    UI.modal({
      title: 'Plan con una IA',
      size: 'wide',
      bodyHTML: `
        ${vuelves ? `<div class="pl-ai-banner pai-ya">
          <span>${UI.icon('chat', 18)}</span>
          <div><strong>¿Ya te lo ha hecho la IA?</strong><span>Pega su respuesta o elige el archivo y Traindía monta el plan.</span></div>
          <button type="button" class="btn primary small" data-ya>Importar</button>
        </div>` : ''}
        <ol class="pai-steps"><li class="on">Preparas</li><li>Se lo das a la IA</li><li>Revisas y guardas</li></ol>
        <div class="seg" role="radiogroup" id="paiMode">
          <button type="button" class="seg-opt on" data-mode="doc">Plan de mi entrenador</button>
          <button type="button" class="seg-opt" data-mode="ia">Que lo proponga la IA</button>
        </div>
        <p class="modal-text" data-show="doc">En el paso 2 le adjuntas el <strong>PDF o las fotos</strong> del plan. Copia series y cargas tal cual, venga en el idioma que venga.</p>
        <div data-show="ia" hidden>${UI.field('¿Qué quieres?', UI.textarea('objetivo', '', 'Objetivo, días a la semana, cuánto dura cada sesión, dónde entrenas y con qué material, molestias o lesiones…', 4))}
          <p class="field-hint pai-ia-hint">La IA no te conoce como tu entrenador: revisa las cargas y, si tienes alguna lesión, consúltalo con un profesional.</p></div>
        ${bases.length ? `<span class="field-label">¿Parte de un plan tuyo?</span>
        <div class="pai-chips" role="radiogroup">${RELS.map(r => `<button type="button" class="pai-chip${r.v === rel ? ' on' : ''}" data-rel="${r.v}" role="radio" aria-checked="${r.v === rel}">${r.l}</button>`).join('')}</div>
        <div id="paiBase" hidden>${UI.select('base', bases.map(p => ({ value: p.id, label: `${p.name || 'Plan'}${p.id === activeId ? ' (activo)' : ''}` })), bases.some(p => p.id === activeId) ? activeId : bases[0].id)}</div>` : ''}
        <details class="pai-more"><summary>Más opciones</summary>
          <div class="metric-opts">
            <label class="metric-opt"><input type="checkbox" data-opt="tecnica"><span>Que añada una nota breve de técnica en cada ejercicio</span></label>
            <label class="metric-opt"><input type="checkbox" data-opt="sustitutos"><span>Que proponga 1-2 alternativas por ejercicio</span></label>
          </div>
          <p class="field-hint">Mejor sin marcar si usas la IA gratis: la respuesta sale más corta y no se corta a medias.</p>
        </details>
        ${vuelves ? '' : '<button type="button" class="pai-link" data-ya>¿Ya tienes la respuesta de la IA? Pégala ›</button>'}`,
      onMount: (root) => {
        const sync = () => {
          root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
          root.querySelectorAll('[data-show]').forEach(el => { el.hidden = el.dataset.show !== mode; });
          root.querySelectorAll('[data-rel]').forEach(b => { b.classList.toggle('on', b.dataset.rel === rel); b.setAttribute('aria-checked', b.dataset.rel === rel); });
          const base = root.querySelector('#paiBase'); if (base) base.hidden = rel === 'nuevo';
        };
        root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; sync(); }));
        root.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', () => { rel = b.dataset.rel; sync(); }));
        // Vuelves con la respuesta ya hecha: directo a pegarla
        root.querySelector('[data-ya]').addEventListener('click', () => { UI.closeModal(root); paste(app); });
        sync();
      },
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Preparar texto ›', kind: 'primary', onClick: async (root) => {
          const op = { modo: mode, rel };
          root.querySelectorAll('[data-opt]').forEach(c => { op[c.dataset.opt] = c.checked; });
          op.objetivo = mode === 'ia' ? (root.querySelector('textarea[name="objetivo"]').value || '').trim() : '';
          if (mode === 'ia' && rel === 'nuevo' && !op.objetivo) { UI.toast('Cuéntale qué quieres: objetivo, días, material…', 'err'); return false; }
          const sel = root.querySelector('select[name="base"]');
          const base = rel !== 'nuevo' && sel ? bases.find(p => p.id === sel.value) : null;
          const ctx = contexto(tuyos, exs, plans, sessions, base, mode === 'ia');
          UI.askAI(buildPrompt(op, cats, ctx), mode === 'doc' ? { note: 'Al abrir la IA, <strong>adjúntale el PDF o las fotos del plan</strong> antes de enviar.' } : {});
          marcarPrompt(base ? { rel, baseId: base.id, baseName: base.name || 'tu plan' } : true); // al volver, «El plan» ofrece pegar el resultado
        } },
      ],
    });
  }

  // ---------- Lo que la IA necesita saber de ti (en corto) ----------
  // catálogo (una línea por categoría, con sus etiquetas), el plan del que parte (una
  // línea por día) y, sin documento, la última vez de cada ejercicio de ese plan.
  const fmtT = (sec) => { sec = Math.round(sec); return sec >= 600 && sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const num = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  function fmtSerie(type, st) {
    const w = parseFloat(st.weight), r = parseFloat(st.reps), t = parseFloat(st.time), d = parseFloat(st.distance), m = parseFloat(st.sdist), l = parseFloat(st.load);
    const lastre = l > 0 ? (st.loadMode === 'asist' ? ` asist. ${num(l)} kg` : ` +${num(l)} kg`) : '';
    if (type === 'weight') return w > 0 && r > 0 ? `${num(w)}kg×${r}` : r > 0 ? `${r} reps` : '';
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
      .map(([c, list]) => `${c}: ` + list.sort((a, b) => (veces.get(b.id) || 0) - (veces.get(a.id) || 0) || a.name.localeCompare(b.name)).map(e => {
        const labs = (etiquetas.get(e.id) || []).slice(0, 3);
        return `${e.name}${labs.length ? ` (${labs.join(', ')})` : ''}`;
      }).join('; ')).join('\n');
    if (!tuyos.list.length) return {};
    if (!base) return { catalogo };

    const nombre = (x) => (exById.get(x.exerciseId) || {}).name || x.name || '';
    const dias = (base.days || []).filter(d => !d.isRest && (d.blocks || []).some(b => (b.exercises || []).length));
    const plan = dias.map(d => `${d.name}${d.focus ? ` (${d.focus})` : ''}: ` + (d.blocks || []).flatMap(b => b.exercises || []).map(x =>
      `${nombre(x)}${x.label ? ` «${x.label}»` : ''}${x.sets ? ` ${x.sets}` : ''}`).join(', ')).join('\n');
    if (!conHistorial) return { catalogo, plan };

    // Historial: la última vez de cada ejercicio del plan (sin los de «hecho/no»)
    const ids = [...new Set(dias.flatMap(d => (d.blocks || []).flatMap(b => b.exercises.map(x => x.exerciseId))).filter(Boolean))];
    const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const lineas = ids.map(id => {
      const e = exById.get(id); if (!e || e.type === 'check') return '';
      for (const x of sessions) {
        const en = (x.entries || []).find(y => y.exerciseId === id); if (!en) continue;
        let sets = (en.sets || []).map(st => fmtSerie(e.type, st)).filter(Boolean);
        if (!sets.length && en.totals && (en.totals.distance || en.totals.time)) sets = [[en.totals.time ? fmtT(parseFloat(en.totals.time)) : '', en.totals.distance ? `${num(parseFloat(en.totals.distance))} km` : ''].filter(Boolean).join(' ')];
        if (sets.length) return `${e.name} (${ddmm(x.date)}): ${sets.join(', ')}`;
      }
      return '';
    }).filter(Boolean);
    const hace4 = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    const ult4 = sessions.filter(x => x.date >= hace4).length;
    const historial = [`${ult4} entrenos en las últimas 4 semanas (el plan tiene ${dias.length} días).`, ...lineas].join('\n');
    return { catalogo, plan, historial };
  }

  // ---------- 2. Traer el resultado (archivo o pegado) ----------
  // prev: lo que se pegó antes, si la respuesta se cortó y ahora llega la continuación
  function paste(app, prev) {
    UI.modal({
      title: prev ? 'Pegar la continuación' : 'Pegar el resultado de la IA',
      size: 'wide',
      bodyHTML: (prev
        ? `<p class="modal-text">Escríbele a la IA <strong>«continúa»</strong> y pega aquí lo que te dé. Traindía lo junta con lo de antes.</p>`
        : `<p class="modal-text">La IA te devuelve un bloque de texto o un archivo:</p>
        <ul class="nut-check">
          <li><strong>Si te ha dado un archivo</strong>: búscalo con el botón de aquí abajo, o ábrelo desde tus descargas y dale a <strong>Compartir → Traindía</strong>.</li>
          <li><strong>Si te lo ha escrito en el chat</strong>: toca el <strong>botón de copiar</strong> del bloque, vuelve aquí y pégalo abajo.</li>
        </ul>`) + `
        <button class="btn ghost block" id="paFile">${UI.icon('upload', 15)} Elegir el archivo</button>
        <div class="nut-or"><span>o pégalo aquí</span></div>
        <textarea class="inp" id="paJson" rows="6" placeholder="Pega aquí lo que te haya dado la IA"></textarea>
        <p class="field-hint">Da igual si viene con texto alrededor, con las comillas del bloque o a medias: Traindía aprovecha todo lo que pueda.</p>`,
      onMount: (root) => {
        root.querySelector('#paFile').addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file'; // sin filtro: en Android los .json llegan como octet-stream
          inp.addEventListener('change', () => {
            const f = inp.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
              const r = leer(rd.result, prev);
              if (!r) { UI.toast('Ese archivo no se entiende. ¿Es el que te dio la IA?', 'err'); return; }
              UI.closeModal(root);
              preview(app, r.payload, r);
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
          const r = leer(txt, prev);
          if (!r) { UI.toast('No encuentro un plan en eso. Copia el bloque entero, desde la primera llave.', 'err'); return false; }
          preview(app, r.payload, r);
        } },
      ],
    });
  }

  // ---------- 3. Leer lo que devuelve la IA, venga como venga ----------
  // Del texto pegado o del archivo saca el JSON aunque traiga texto alrededor,
  // varios bloques, comas de más, comillas tipográficas o esté CORTADO (la IA
  // gratuita a veces no acaba): entonces se cierra lo que haya y se avisa.
  // prev: el texto de antes, si esto es la continuación de una respuesta cortada.
  // Devuelve { payload, cortado, raw } o null si ahí no hay ningún plan.
  const sinBloques = (s) => String(s || '').replace(/```[a-zA-Z]*/g, '').trim();
  const desdeLlave = (s) => { const i = s.search(/[{[]/); return i >= 0 ? s.slice(i) : ''; };
  const limpiar = (s) => s.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
  function parsear(s) {
    for (const t of [s, limpiar(s)]) {
      try { let o = JSON.parse(t); if (typeof o === 'string') o = JSON.parse(o); return o; } catch (e) { /* sigue */ }
      const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')); // texto detrás del JSON
      if (j > 0) { try { return JSON.parse(t.slice(0, j + 1)); } catch (e) { /* sigue */ } }
    }
    return undefined;
  }
  // JSON cortado: se cierran las comillas y llaves abiertas; si no cuadra, se va
  // quitando por el final hasta el último elemento completo.
  function cierre(s) {
    const st = []; let enStr = false, esc = false;
    for (const ch of s) {
      if (enStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') enStr = false; continue; }
      if (ch === '"') enStr = true; else if (ch === '{') st.push('}'); else if (ch === '[') st.push(']'); else if (ch === '}' || ch === ']') st.pop();
    }
    return (enStr ? '"' : '') + st.reverse().join('');
  }
  function reparar(s) {
    s = limpiar(s);
    let cut = s.length;
    for (let i = 0; i < 400 && cut > 1; i++) {
      const t = s.slice(0, cut).replace(/[\s,:]+$/, '');
      const c = cierre(t);
      if (c[0] !== '"') { try { return JSON.parse(t + c); } catch (e) { /* recorta más */ } } // un texto a medias («5×4…») no vale
      const k = Math.max(t.lastIndexOf(','), t.lastIndexOf('{'), t.lastIndexOf('['));
      if (k <= 0) break;
      cut = t[k] === ',' ? k : k + 1;
    }
    return undefined;
  }
  const tamaño = (o) => { const c = aplanar(o); return c.error ? 1 : c.dias.reduce((n, d) => n + d.ejercicios.length, 0); };
  function leer(texto, prev) {
    const t = String(texto || '').replace(/^﻿/, '').trim();
    if (!t) return null;
    const cands = [];
    if (prev) { // continuación: lo de antes + lo nuevo, o lo nuevo solo (si la IA empezó de cero)
      const a = desdeLlave(sinBloques(prev)), b = sinBloques(t);
      cands.push(a + b, a + '\n' + desdeLlave(b), desdeLlave(b));
    }
    const bloques = [...t.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)(?:```|$)/g)].map(m => m[1].trim()).filter(Boolean);
    if (bloques.length > 1) cands.push(desdeLlave(bloques[0]) + bloques.slice(1).join(''));
    bloques.slice().reverse().forEach(b => cands.push(desdeLlave(b)));
    cands.push(desdeLlave(t));
    const vistos = new Set();
    let mejor = null;
    for (const cortado of [false, true]) {
      for (const c of cands) {
        if (!c || vistos.has(c + cortado)) continue; vistos.add(c + cortado);
        const o = cortado ? reparar(c) : parsear(c);
        if (!o || typeof o !== 'object') continue;
        const n = tamaño(o);
        if (n && (!mejor || n > mejor.n)) mejor = { payload: o, cortado, n, raw: prev ? `${prev}\n${t}` : t };
      }
      if (mejor) return mejor; // lo completo antes que lo reparado
    }
    return null;
  }
  const esPlan = (o) => !!o && typeof o === 'object' && tamaño(o) > 0;

  // ---------- 4. Ponerlo a punto: de lo que llegue al formato de Traindía ----------
  // La IA no siempre respeta el formato: nombres de campo en inglés o con otras
  // palabras, días como objeto, secciones o no, ejercicios escritos como texto
  // («Press banca 4x12 (descanso 45 s)»), series y repeticiones por separado…
  // aplanar() lo deja todo como { dias: [{ wd, titulo, enfoque, ejercicios: [...] }] }.
  const nk = (k) => UI.norm(k).replace(/[^a-z0-9]/g, '');
  function pick(o, ...names) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
    const keys = Object.keys(o).map(k => [nk(k), k]);
    for (const n of names) {
      const hit = keys.find(([x]) => x === n);
      if (hit) { const v = o[hit[1]]; if (v !== null && v !== undefined && v !== '') return v; }
    }
    return undefined;
  }
  const texto = (v) => Array.isArray(v) ? v.map(texto).filter(Boolean).join(' · ') : (v && typeof v === 'object') ? str(pick(v, 'texto', 'text', 'nombre', 'name')) : str(v);
  const si = (v) => v === true || /^(si|sí|true|1|yes|x)$/i.test(str(v));
  const listaDe = (v) => Array.isArray(v) ? v : (typeof v === 'string' && v.trim()) ? v.split(/\s*(?:[,;\n]|\s+o\s+|\s+or\s+)\s*/).filter(Boolean) : (v && typeof v === 'object') ? [v] : [];
  const WD = { lunes: 0, monday: 0, martes: 1, tuesday: 1, miercoles: 2, wednesday: 2, jueves: 3, thursday: 3, viernes: 4, friday: 4, sabado: 5, saturday: 5, domingo: 6, sunday: 6,
    lun: 0, mon: 0, mar: 1, tue: 1, mie: 2, wed: 2, jue: 3, thu: 3, vie: 4, fri: 4, sab: 5, sat: 5, dom: 6, sun: 6 };
  function weekday(v) {
    const w = UI.norm(str(v)).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
    for (const x of w) if (x in WD && (x.length > 3 || w.length === 1)) return WD[x]; // «mar» suelto sí; dentro de una frase, no
    return -1;
  }
  const normSeries = (s) => str(s).replace(/(\d)\s*[xX*×]\s*/g, '$1×').replace(/\bm[aá]x(?:imo|\.)?\b/gi, 'Máx').replace(/\s+/g, ' ');
  const SERIES_RE = /(?:^|\s)[-–:]?\s*(\d+\s*[x×*]\s*(?:\d+(?:\s*[-–]\s*\d+)?|m[aá]x\w*)(?:\s*(?:reps?|repeticiones|s|seg|m|min|km)\b)?|\d+(?:[.,]\d+)?\s*(?:min|minutos|km|m|metros|s|seg|segundos)\b)(.*)$/i;
  // «1. Press banca 4x12 (descanso 45 s)» → nombre, series y detalle
  function parseLinea(s) {
    let t = str(s).replace(/^\s*(?:[-•*·▪]|\d+[.)]|[A-Z]\d?[.)])\s+/, '');
    const det = [];
    t = t.replace(/\(([^)]*)\)/g, (m, x) => { if (x.trim()) det.push(x.trim()); return ' '; });
    let series = '';
    const m = t.match(SERIES_RE);
    if (m && m.index > 0) {
      series = m[1];
      const resto = m[2].replace(/^[\s,;:·-]+/, '').trim(); if (resto) det.unshift(resto);
      t = t.slice(0, m.index);
    }
    return { nombre: t.replace(/\s+/g, ' ').replace(/[\s,;:·-]+$/, '').trim(), series: normSeries(series), detalle: det.join(' · ') };
  }
  const CAT_SYN = { pierna: 'Pierna', piernas: 'Pierna', cuadriceps: 'Pierna', isquios: 'Pierna', gemelos: 'Pierna', tren: 'Pierna', gluteo: 'Glúteo', gluteos: 'Glúteo',
    pecho: 'Pecho', pectoral: 'Pecho', pectorales: 'Pecho', espalda: 'Espalda', dorsal: 'Espalda', dorsales: 'Espalda', hombro: 'Hombro', hombros: 'Hombro', biceps: 'Bíceps', triceps: 'Tríceps',
    antebrazo: 'Antebrazo', antebrazos: 'Antebrazo', agarre: 'Agarre', core: 'Core', abdominales: 'Core', abdomen: 'Core', abs: 'Core', cardio: 'Cardio',
    carrera: 'Carrera', running: 'Carrera', correr: 'Carrera', calentamiento: 'Calentamiento', warmup: 'Calentamiento', activacion: 'Calentamiento', movilidad: 'Movilidad',
    estiramiento: 'Estiramientos', estiramientos: 'Estiramientos', vueltaalacalma: 'Estiramientos', enfriamiento: 'Estiramientos', cooldown: 'Estiramientos',
    chest: 'Pecho', back: 'Espalda', leg: 'Pierna', legs: 'Pierna', quads: 'Pierna', hamstrings: 'Pierna', calves: 'Pierna', glute: 'Glúteo', glutes: 'Glúteo',
    shoulder: 'Hombro', shoulders: 'Hombro', forearms: 'Antebrazo', grip: 'Agarre', stretching: 'Estiramientos', mobility: 'Movilidad' };
  function categoria(c, nombre) {
    const n = nk(c);
    if (n) { const hit = BASE_CATS.find(x => nk(x) === n); if (hit) return hit; if (CAT_SYN[n]) return CAT_SYN[n]; const t = str(c); return t.charAt(0).toUpperCase() + t.slice(1); }
    const k = UI.norm(nombre); // sin categoría: por el nombre
    if (/carrera|correr|rodaje|trote|series de|\d+\s*m\b/.test(k)) return 'Carrera';
    if (/bici|eliptica|cinta|remo erg|cardio|caminar|andar/.test(k)) return 'Cardio';
    if (/estir/.test(k)) return 'Estiramientos';
    if (/movilidad|articular|activacion/.test(k)) return 'Calentamiento';
    if (/plancha|abdominal|crunch|hollow|dead bug|pallof|rueda|plank|knee raise/.test(k)) return 'Core';
    if (/hip thrust|glute|puente|patada/.test(k)) return 'Glúteo';
    if (/sentadilla|zancada|prensa|femoral|cuadriceps|gemelo|soleo|peso muerto|squat|lunge|deadlift|leg /.test(k)) return 'Pierna';
    if (/triceps|press frances|fondos|pushdown/.test(k)) return 'Tríceps';
    if (/\bcurl\b|biceps/.test(k)) return 'Bíceps';
    if (/press (militar|hombro|de hombro)|elevacion(es)? lateral|face pull|pajaro|shoulder|overhead/.test(k)) return 'Hombro';
    if (/press banca|banca|pecho|apertura|flexion|bench|chest|push.?up/.test(k)) return 'Pecho';
    if (/remo|jalon|dominada|pull|row|chin/.test(k)) return 'Espalda';
    if (/suspension|colgad|dead hang|farmer/.test(k)) return 'Agarre';
    return 'General';
  }
  const TYPE_SYN = { weight: 'weight', peso: 'weight', pesorepeticiones: 'weight', reps: 'reps', repeticiones: 'reps', pesocorporal: 'reps', time: 'time', tiempo: 'time', distancia: 'time', duracion: 'time', check: 'check', hecho: 'check', hechonohecho: 'check' };
  function ejercicio(x, cat) {
    if (typeof x === 'string') { const p = parseLinea(x); return p.nombre ? { nombre: p.nombre.slice(0, 60), series: p.series, detalle: p.detalle.slice(0, 140), etiqueta: '', categoria: cat, comoTexto: true, alternativas: [], videos: [] } : null; }
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    let nombre = str(pick(x, 'nombre', 'name', 'ejercicio', 'exercise', 'titulo', 'title'));
    let series = str(pick(x, 'series', 'prescripcion', 'prescription', 'sets', 'pauta', 'volumen'));
    const reps = pick(x, 'repeticiones', 'reps', 'repetitions', 'rep');
    const t = pick(x, 'tiempo', 'duracion', 'duration', 'time', 'distancia', 'distance');
    if (/^\d+$/.test(series) && (reps != null || t != null)) series = `${series}×${str(reps != null ? reps : t)}`; // 4 series de 8-10 / de 45 s
    else if (!series && reps != null) series = str(reps);
    if (!series && t != null) series = str(t);
    const det = [];
    const d0 = texto(pick(x, 'detalle', 'detalles', 'notas', 'nota', 'notes', 'descripcion', 'comentario', 'comentarios', 'observaciones', 'indicaciones')); if (d0) det.push(d0);
    const carga = str(pick(x, 'carga', 'peso', 'load', 'weight', 'kg')); if (carga) det.push(/^\d+([.,]\d+)?$/.test(carga) ? `${carga} kg` : carga);
    const desc = str(pick(x, 'descanso', 'rest', 'recuperacion')); if (desc && !/descans/i.test(d0)) det.push(`Descanso ${/^\d+$/.test(desc) ? `${desc} s` : desc}`);
    // «Press banca 4x12» en el nombre → series aparte (solo con pauta clara: «Series de 1 min 30 s» es un nombre)
    if (nombre && !series && /\d+\s*[x×*]\s*(\d|m[aá]x)/i.test(nombre)) { const p = parseLinea(nombre); if (p.series) { nombre = p.nombre; series = p.series; if (p.detalle) det.push(p.detalle); } }
    nombre = nombre.replace(/^\s*(?:[-•*·▪]|\d+[.)])\s+/, '').trim();
    if (!nombre) return null;
    let etiqueta = str(pick(x, 'etiqueta', 'label', 'variante', 'variant', 'tag'));
    if (etiqueta.length > 18) { det.unshift(etiqueta); etiqueta = etiqueta.slice(0, 18).replace(/\s+\S*$/, '') || etiqueta.slice(0, 18); }
    const tipo = TYPE_SYN[nk(pick(x, 'tipo', 'type'))] || '';
    return { nombre: nombre.slice(0, 60), series: normSeries(series), detalle: det.join(' · ').slice(0, 140), etiqueta,
      categoria: str(pick(x, 'categoria', 'category', 'grupo', 'grupomuscular', 'musclegroup', 'seccion', 'bloque')) || cat, tipo,
      prioritario: si(pick(x, 'prioritario', 'priority', 'prioridad', 'clave')), opcional: si(pick(x, 'opcional', 'optional')),
      tecnica: texto(pick(x, 'tecnica', 'technique', 'howto', 'ejecucion')),
      alternativas: listaDe(pick(x, 'alternativas', 'sustitutos', 'alternatives', 'substitutes', 'alternativa')).map(a => str(typeof a === 'string' ? a : pick(a, 'nombre', 'name'))).filter(Boolean),
      videos: listaDe(pick(x, 'videos', 'video', 'enlaces', 'links', 'url', 'enlace')) };
  }
  // Los ejercicios de un día: lista, secciones con su categoría u objeto { categoría: [...] }
  function ejerciciosDe(d) {
    const out = [];
    const meter = (lista, cat, opt) => {
      if (lista && typeof lista === 'object' && !Array.isArray(lista)) { Object.entries(lista).forEach(([k, v]) => meter(v, k, opt)); return; }
      listaDe(lista).forEach(x => { const e = ejercicio(x, cat); if (e) { if (opt) e.opcional = true; out.push(e); } });
    };
    const secs = pick(d, 'secciones', 'sections', 'bloques', 'blocks', 'partes', 'parts', 'circuitos', 'fases');
    if (Array.isArray(secs)) secs.forEach(sec => {
      if (!sec || typeof sec !== 'object') return;
      meter(pick(sec, 'ejercicios', 'exercises', 'items', 'lista'), str(pick(sec, 'categoria', 'category', 'nombre', 'name', 'titulo', 'title', 'label', 'tipo')), si(pick(sec, 'opcional', 'optional')));
    });
    meter(pick(d, 'ejercicios', 'exercises', 'items', 'lista', 'trabajo'), '', false);
    return out;
  }
  function diasDe(p) {
    const d = pick(p, 'dias', 'days', 'sesiones', 'sessions', 'semana', 'week', 'entrenamientos', 'workouts');
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object') {
      const v = pick(d, 'dias', 'days', 'sesiones', 'sessions'); if (Array.isArray(v)) return v;
      const ent = Object.entries(d); // { "Lunes": [...] } o { "Lunes": { ejercicios } }
      if (ent.length && ent.every(([, x]) => x && typeof x === 'object')) return ent.map(([k, x]) => Array.isArray(x) ? { dia: k, ejercicios: x } : { dia: k, ...x });
    }
    return null;
  }
  function aplanar(raw) {
    let p = raw;
    for (let i = 0; i < 4 && p && typeof p === 'object' && !Array.isArray(p) && !diasDe(p); i++) {
      const inner = pick(p, 'data', 'plan', 'rutina', 'routine', 'resultado', 'result', 'traindia');
      if (inner && typeof inner === 'object') p = inner; else break;
    }
    if (Array.isArray(p)) p = { dias: p };
    if (!p || typeof p !== 'object') return { dias: [] };
    if (/no.?es.?un.?plan/.test(UI.norm(str(pick(p, 'error')) || str(pick(raw || {}, 'error'))))) return { error: true, dias: [] };
    const dias = [];
    (diasDe(p) || []).forEach(d => {
      if (!d || typeof d !== 'object') return;
      const ejercicios = Array.isArray(d) ? d.map(x => ejercicio(x, '')).filter(Boolean) : ejerciciosDe(d);
      if (!ejercicios.length) return;
      const diaRaw = pick(d, 'diasemana', 'dia', 'weekday', 'day', 'diadelasemana');
      let titulo = str(pick(d, 'titulo', 'title', 'nombre', 'name', 'sesion', 'session'));
      let wd = weekday(diaRaw); if (wd < 0) wd = weekday(titulo);
      if (!titulo && diaRaw != null && wd < 0) titulo = str(diaRaw);
      dias.push({ wd, titulo, enfoque: texto(pick(d, 'enfoque', 'focus', 'objetivo', 'grupos', 'grupo', 'descripcion', 'description', 'musculos')),
        tipo: str(pick(d, 'tipo', 'type', 'intensidad')), duracion: str(pick(d, 'duracion', 'duration', 'tiempo')), ejercicios });
    });
    const catalogo = (Array.isArray(pick(p, 'ejercicios', 'exercises')) ? pick(p, 'ejercicios', 'exercises') : []).map(x => ejercicio(x, '')).filter(Boolean); // formato de antes
    const lista = (k) => listaDe(pick(p, ...k)).map(texto).filter(Boolean);
    return { nombre: str(pick(p, 'nombre', 'name', 'titulo', 'title')), duracion: str(pick(p, 'duracion', 'duration')), inicio: str(pick(p, 'inicio', 'start', 'fechainicio', 'startdate')),
      dias, catalogo, notas: lista(['notas', 'notes', 'indicaciones', 'observaciones']), dudas: lista(['dudas', 'doubts', 'questions', 'preguntas']), cambios: lista(['cambios', 'changes']) };
  }

  // Devuelve { errores, avisos, dudas, notas, cambios, routine, exercises } con el formato
  // de un export de plan de Traindía (lo que ya sabe importar VData).
  function normalizar(payload) {
    const errores = [], avisos = [];
    const c = aplanar(payload);
    if (c.error) { errores.push('La IA dice que el documento no es un plan de entrenamiento.'); return { errores }; }
    if (!c.dias.length) { errores.push('No encuentro ningún día con ejercicios en lo que ha devuelto la IA.'); return { errores }; }

    // Catálogo (por nombre): lo que diga cada ejercicio + el catálogo aparte del formato de antes
    const defs = new Map();
    const addDef = (e) => {
      const n = str(e && e.nombre); if (!n) return null;
      if (!defs.has(key(n))) defs.set(key(n), { nombre: n, categoria: '', tipo: '', tecnica: '', sustitutos: [], videos: [], series: '' });
      const d = defs.get(key(n));
      if (!d.series && e.series) d.series = str(e.series);
      if (!d.categoria && e.categoria) d.categoria = str(e.categoria);
      if (!d.tipo && e.tipo) d.tipo = str(e.tipo);
      if (!d.tecnica && e.tecnica) d.tecnica = str(e.tecnica);
      (e.alternativas || []).forEach(sn => { if (sn && key(sn) !== key(n) && !d.sustitutos.some(x => key(x) === key(sn))) d.sustitutos.push(sn); });
      (e.videos || []).forEach(v => {
        const url = str(typeof v === 'string' ? v : v && (v.url || v.enlace || v.link));
        if (/^https?:\/\//i.test(url) && !d.videos.some(x => x.url === url)) d.videos.push(v && typeof v === 'object' && str(v.nombre || v.name) ? { url, label: str(v.nombre || v.name) } : { url });
      });
      return d;
    };
    c.catalogo.forEach(addDef);

    const sesiones = c.dias;
    if (sesiones.length > 7) avisos.push(`Vienen ${sesiones.length} sesiones: solo caben 7 en la semana, el resto no se importa.`);
    // Colocar cada sesión en un día de la semana
    const byWd = new Array(7).fill(null);
    const sinDia = [];
    sesiones.slice(0, 7).forEach(s => { if (s.wd >= 0 && !byWd[s.wd]) byWd[s.wd] = s; else sinDia.push(s); });
    if (sinDia.length) {
      const libres = byWd.map((x, i) => x ? -1 : i).filter(i => i >= 0);
      const patron = (SPREAD[sesiones.length] || SPREAD[Math.min(sesiones.length, 7)]).filter(i => libres.includes(i));
      const huecos = [...patron, ...libres.filter(i => !patron.includes(i))];
      sinDia.forEach((s, k) => { byWd[huecos[k]] = s; });
      avisos.push(sinDia.length === Math.min(sesiones.length, 7)
        ? `No dice qué día de la semana es cada sesión: las he puesto en ${sinDia.map((s, k) => WEEKDAYS[huecos[k]]).join(', ')}. Muévelas con «Intercambiar» si entrenas otros días.`
        : `${sinDia.length} sesión(es) sin día de la semana: las he colocado en los días libres.`);
    }

    let nEj = 0, comoTexto = 0, sinCat = 0;
    const days = WEEKDAYS.map((w, i) => {
      const s = byWd[i];
      if (!s) return { id: `d${i}`, name: w, type: 'rest', typeLabel: TYPE_LABELS.rest, isRest: true, focus: 'Recuperación', place: '', placeAccent: false, duration: '', order: i, blocks: [], substitutes: [], substitutesTitle: '', planB: [], relatedGuides: [] };
      const tipo = TYPES.includes(s.tipo) ? s.tipo : '';
      const focus = [s.titulo && weekday(s.titulo) < 0 ? s.titulo : '', s.enfoque].filter(Boolean).join(' · ');
      // secciones = ejercicios seguidos de la misma categoría
      const blocks = [];
      s.ejercicios.forEach(x => {
        if (x.comoTexto) comoTexto++;
        if (!str(x.categoria)) sinCat++;
        const cat = categoria(x.categoria, x.nombre);
        const d = addDef({ ...x, categoria: cat });
        nEj++;
        const row = { exerciseId: null, name: d.nombre, type: 'weight', sets: x.series, priority: !!x.prioritario, optional: !!x.opcional };
        if (x.detalle) row.notes = x.detalle;
        if (x.etiqueta) row.label = x.etiqueta.slice(0, 18);
        const last = blocks[blocks.length - 1];
        if (last && last.label === cat) last.exercises.push(row); else blocks.push({ label: cat, optional: false, exercises: [row] });
      });
      return { id: `d${i}`, name: w, type: tipo, typeLabel: tipo ? TYPE_LABELS[tipo] : '', isRest: false, focus, place: '', placeAccent: false, duration: s.duracion, order: i, blocks, substitutes: [], substitutesTitle: '', planB: [], relatedGuides: [] };
    });
    if (comoTexto) avisos.push(`${comoTexto} ejercicio(s) venían como texto: he separado nombre, series y detalle. Revísalos.`);
    if (sinCat) avisos.push(`${sinCat} ejercicio(s) sin categoría: se la he puesto según su nombre.`);

    // Ejercicios con id propio; las alternativas que no vengan definidas se crean con
    // la categoría y el tipo de su ejercicio.
    [...defs.values()].forEach(d => d.sustitutos.forEach(sn => {
      if (!defs.has(key(sn))) defs.set(key(sn), { nombre: sn, categoria: d.categoria, tipo: d.tipo, tecnica: '', sustitutos: [], videos: [] });
    }));
    const idOf = new Map();
    let k = 0;
    defs.forEach((d, kk) => idOf.set(kk, `ia_ex_${++k}`));
    const exercises = [...defs.values()].map(d => {
      const type = EX_TYPES.includes(d.tipo) ? d.tipo : guessType(d);
      const e = { id: idOf.get(key(d.nombre)), name: d.nombre, muscleGroup: categoria(d.categoria, d.nombre), type,
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

    const routine = { id: 'ia_plan', name: c.nombre || 'Plan del entrenador', planType: 'custom', dayTypeUnset: true, days,
      source: 'ia', planNotes: c.notas.length ? c.notas : undefined, planDuration: c.duracion || undefined, planStart: c.inicio || undefined };
    return { errores, avisos, dudas: c.dudas, notas: c.notas, cambios: c.cambios, routine, exercises, nSes: Math.min(sesiones.length, 7), nEj, nVid: exercises.filter(e => e.videos).length };
  }

  // Si la IA no dice el tipo, se deduce de la categoría y de cómo se prescribe.
  function guessType(d) {
    const c = UI.norm(d.categoria || ''), s = UI.norm(d.series || ''), n = UI.norm(d.nombre || '');
    // Lo que dice la prescripción manda: «10 min» es tiempo aunque vaya en el calentamiento.
    if (/\bmin\b|\bkm\b|\bseg\b|\d\s*s\b|\d\s*m\b/.test(s)) return 'time';
    if (/calentamiento|movilidad|estiramiento/.test(c) || /estir|movilidad|activacion|articular/.test(n)) return 'check';
    if (/carrera|cardio/.test(c) || /plancha|suspension|colgad|carrera|correr|hollow/.test(n)) return 'time';
    if (/dominad|flexion|fondos|abdominal|hiperextension|elevacion de rodillas|knee raise/.test(n)) return 'reps';
    return 'weight';
  }

  // ---------- 5. Enseñar lo entendido, revisar ejercicios y crear el plan ----------
  // info: { cortado, raw } si la respuesta llegó a medias (se ofrece pegar la continuación)
  function preview(app, payload, info = {}) {
    const r = normalizar(payload);
    // Una evolución suele empezar más adelante (al acabar el bloque actual): por defecto, sin activar
    const act = info.activar != null ? info.activar : pedido().rel !== 'evolucion';
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
          <ul>${d.blocks.flatMap(b => b.exercises).map(x => `<li class="${x.priority ? 'prio' : ''}${x.optional ? ' opt' : ''}"><span>${UI.esc(x.name)}${x.label ? ` <span class="dim">· ${UI.esc(x.label)}</span>` : ''}${exById[x.exerciseId] && exById[x.exerciseId].videos ? ' ▶' : ''}</span><span class="dim">${UI.esc(x.sets || '')}</span></li>`).join('')}</ul>
        </div>`).join('');
    const lista = (t, arr, cls) => arr.length ? `<div class="card-label" style="margin-top:14px">${t}</div><ul class="nut-check ${cls}">${arr.map(a => `<li>${UI.esc(a)}</li>`).join('')}</ul>` : '';
    UI.modal({
      title: 'Esto es lo que he entendido',
      size: 'wide',
      bodyHTML: `${info.cortado ? `<div class="pai-cut">${UI.icon('warning', 16)}<div><strong>La respuesta de la IA se cortó antes de acabar.</strong><span>He aprovechado lo que llegó (${r.nSes} ${r.nSes === 1 ? 'sesión' : 'sesiones'}); revisa sobre todo ${UI.esc(cortadoEn(r))}, que es donde se cortó. Si falta algo, escríbele «continúa» y pega aquí lo nuevo.</span><button type="button" class="btn small ghost" id="paiMore">Pegar la continuación</button></div></div>` : ''}
        <p class="modal-text dim">El importador está <strong>en beta</strong>: revisa series y cargas antes de entrenar y cuéntame qué tal ha salido.</p>
        <div class="nut-sum"><span><b>${r.nSes}</b> sesiones</span><span><b>${r.nEj}</b> ejercicios</span>${r.nVid ? `<span><b>${r.nVid}</b> con vídeo</span>` : ''}${r.dudas.length ? `<span class="warn"><b>${r.dudas.length}</b> dudas</span>` : ''}</div>
        ${UI.field('Nombre del plan', UI.input('planName', r.routine.name))}
        <div class="tp-days">${dias}</div>
        ${lista(`Cambios respecto a ${pedido().baseName || 'tu plan'}`, r.cambios, '')}
        ${lista('Avisos', r.avisos, 'warn')}
        ${lista('Dudas de la IA', r.dudas, 'warn')}
        ${lista('Notas del entrenador', r.notas, '')}
        <label class="metric-opt pai-act"><input type="checkbox" id="paiAct"${act ? ' checked' : ''}><span>Empezar a usarlo ya<span class="dim">Si no, se guarda en Planes y lo activas cuando empieces. Tu plan actual no se toca.</span></span></label>
        <p class="field-hint">Ahora revisas con cuál de tus ejercicios va cada uno.</p>`,
      onMount: (root) => {
        const more = root.querySelector('#paiMore');
        if (more) more.addEventListener('click', () => { UI.closeModal(root); paste(app, info.raw); });
      },
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Contar qué tal', kind: 'ghost', onClick: () => { reportar(app, r, info); return false; } },
        { label: 'Revisar ejercicios', kind: 'primary', onClick: (root) => {
          const name = (root.querySelector('input[name="planName"]').value || '').trim() || r.routine.name;
          const activar = root.querySelector('#paiAct').checked;
          setTimeout(() => VReview.importar(app, { routine: r.routine, exercises: r.exercises, onBack: () => preview(app, payload, { ...info, activar }),
            finalLabel: activar ? 'Crear y activar' : 'Guardar plan',
            onConfirm: (links) => crear(app, r, name, links, activar) }), 50);
        } },
      ],
    });
  }
  // El día donde se cortó la respuesta: el último con sesión según el orden en que llegaron
  const cortadoEn = (r) => { const d = r.routine.days.filter(x => !x.isRest).pop(); return d ? `el ${d.name.toLowerCase()}` : 'el último día'; };
  // Crea el plan con los ejercicios ya enlazados (links: id del archivo → tu ejercicio).
  // activar=false: se queda guardado en Planes, sin tocar el activo.
  async function crear(app, r, name, links, activar = true) {
    const prev = app.routine;
    const rt = await VData.createImportedPlan(app.activeUser.id, r.routine, new Set(r.routine.days.map(d => d.id)), name, r.exercises, { links });
    if (!activar) {
      marcarPrompt(false);
      await app.refreshRoutine();
      app.history = [];
      app.go('info', {}, true);
      UI.toast(`«${rt.name}» guardado en Planes: actívalo cuando empieces`);
      return;
    }
    await DB.setActivePlan(app.activeUser.id, rt.id);
    // El plan en blanco que se crea al darse de alta (sin un solo ejercicio) ya no pinta nada.
    const vacio = prev && prev.planType === 'custom' && !(prev.days || []).some(d => (d.blocks || []).some(b => (b.exercises || []).length));
    if (vacio) { try { await DB.deletePlan(prev.id); } catch (e) {} }
    marcarPrompt(false);
    await app.refreshRoutine();
    app.history = [];
    app.go('week', {}, true);
    UI.toast('Plan creado y activado');
  }

  function reportar(app, r, info = {}) {
    const ctx = [
      'Importador de planes de entreno (beta)',
      `Sesiones: ${r.nSes} · Ejercicios: ${r.nEj} · Con vídeo: ${r.nVid} · Dudas: ${r.dudas.length} · Avisos: ${r.avisos.length}${info.cortado ? ' · Respuesta cortada' : ''}`,
      '',
      '¿Qué tal ha salido? ',
    ].join('\n');
    app.openFeedback({ tipo: 'Importador de planes (beta)', mensaje: ctx });
  }

  // ---------- EL TEXTO PARA LA IA ----------
  // Corto a propósito (las IA gratuitas cortan pronto): pide lo mínimo y en un formato
  // plano; lo que falte o venga torcido lo arreglan aplanar() y la revisión de ejercicios.
  function buildPrompt(op, cats, ctx = {}) {
    const doc = op.modo !== 'ia';
    const r = []; // reglas
    if (doc) {
      r.push('Copia series, repeticiones, tiempos, distancias, cargas y descansos TAL CUAL. No inventes nada: si algo no se lee o no está claro, déjalo vacío y explícalo en "dudas".');
      r.push('Nada de datos personales (nombres, teléfonos, correos, centro).');
    } else {
      r.push(`Prudencia: es el plan real de una persona. ${ctx.historial ? 'Las cargas salen de MI HISTORIAL (no subas más de un 5-10 %); si' : 'Si'} no sabes la carga, no pongas kilos: pon el esfuerzo en "detalle" ("deja 2-3 repeticiones en reserva"). Solo el material que te diga. Calentamiento al principio y descansos razonables.`);
      r.push('En "dudas" pon lo que hayas tenido que suponer.');
    }
    r.push(`Un objeto por ejercicio, en el orden en que se hacen.${doc ? ' Si una línea junta varios ejercicios, sepáralos. Si da alternativas ("A o B"), pon A y las demás en "alternativas".' : ''}`);
    r.push('"nombre": corto, en español y SIN la variante. La variante o la carga va en "etiqueta" (máx. 18 caracteres): "Carrera" + "Suave", "Jalón al pecho" + "Supino", "Suspensión" + "Lastre 7,5 kg".');
    if (ctx.catalogo) r.push(`Si es uno de MIS EJERCICIOS, usa su nombre exacto:\n${ctx.catalogo}`);
    r.push(`"categoria": ${cats.slice(0, 15).join(', ')}…`);
    r.push('"series" corto ("4×12", "3×Máx", "5×400 m", "10 min"); en "detalle", el descanso y lo demás, breve.');
    r.push(`"dia": el día de la semana${doc ? ' si lo dice' : ''} ("Lunes"…); si no, null. Los días de descanso no se ponen.`);
    r.push(`Lo que vale para todo el plan va en "notas".${doc ? ' Si dice cuánto dura o cuándo empieza: "duracion" e "inicio" (AAAA-MM-DD).' : ''}`);
    if (doc) r.push('Si está en otro idioma, traduce los nombres al español de gimnasio; las cifras, tal cual.');
    r.push(op.tecnica ? 'Añade "tecnica" a cada ejercicio: una frase con la clave de ejecución.' : 'No pongas técnica.');
    if (op.sustitutos) r.push(`Añade "alternativas" a cada ejercicio: 1-2 del mismo movimiento con otro material${ctx.catalogo ? ', mejor de MIS EJERCICIOS' : ''}.`);
    r.push('Si el documento trae enlaces de vídeo de un ejercicio, ponlos en "videos": ["https://…"]. Si marca algo como opcional: "opcional": true.');
    if (ctx.plan && op.rel === 'evolucion') r.push(`Es la EVOLUCIÓN de este plan mío: si un ejercicio sigue, mismo nombre y etiqueta.${doc ? '' : ' Progresa con calma desde mi historial (más carga, reps o volumen, no todo a la vez).'} Añade "cambios": una línea por cambio ("+ Curl martillo", "− Apertura", "Press banca: 4×8 → 5×5").\n${ctx.plan}`);
    else if (ctx.plan) r.push(`Es PARECIDO a este plan mío: úsalo de referencia para nombres y etiquetas${doc ? ', pero manda el documento' : ''}.\n${ctx.plan}`);
    if (ctx.historial) r.push(`MI HISTORIAL (la última vez de cada ejercicio):\n${ctx.historial}`);
    if (!doc) r.push(`Lo que quiero: ${op.objetivo || 'lo mismo que el plan del que parto: mismos días, duración y estilo.'}`);

    return `${doc ? 'Convierte el plan de entrenamiento que te adjunto (de mi entrenador) en un JSON para la app Traindía.' : 'Diséñame un plan de entrenamiento y dámelo en un JSON para la app Traindía.'}
Devuelve SOLO el JSON en un bloque \`\`\`json (y también como archivo "traindia-plan.json" si puedes). Sin explicaciones.

${r.map((x, i) => `${i + 1}. ${x}`).join('\n')}

FORMATO:
{"traindia":"plan","nombre":"","duracion":"","inicio":null,
"dias":[{"dia":"Lunes","titulo":"Día 1","enfoque":"Espalda y bíceps","ejercicios":[
{"nombre":"Carrera","etiqueta":"Suave","categoria":"Calentamiento","series":"10 min","detalle":""},
{"nombre":"Jalón al pecho","etiqueta":"","categoria":"Espalda","series":"4×12","detalle":"Descanso 45 s"}]}],
"notas":[],${ctx.plan && op.rel === 'evolucion' ? '"cambios":[],' : ''}"dudas":[]}${doc ? '\nSi el documento no es un plan de entrenamiento, devuelve {"error":"no-es-un-plan"}.' : ''}`;
  }

  return { open, paste, preview, leer, esPlan, normalizar, buildPrompt, pidioPrompt, olvidarPrompt: () => marcarPrompt(false), KIND };
})();
