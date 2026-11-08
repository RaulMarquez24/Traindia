// ============================================================
// IMPORTAR SIN DUPLICAR NI PISAR (VMerge)
// Compara lo que trae un archivo con lo que ya hay en un perfil y lo clasifica:
//  - nuevo      → se añade
//  - igual      → no se toca (nunca se duplica)
//  - completar  → a lo tuyo le faltaba algo (vídeos, técnica, suplentes): se añade sin borrar nada
//  - distinto   → lo decides tú viendo qué cambia; por defecto se queda lo tuyo
// Nada se escribe hasta que confirmas en la pantalla de revisión.
// ============================================================

const VMerge = (() => {
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const vacio = (x) => x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length);
  // JSON con las claves ordenadas y sin campos vacíos: dos registros iguales dan el mismo texto.
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => !vacio(v[k])).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const num = (x) => (x === null || x === undefined || x === '' || isNaN(Number(x))) ? null : Number(x);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const fecha = (iso) => (iso && typeof UI !== 'undefined' && UI.fmtDateShort) ? UI.fmtDateShort(iso) : (iso || '');
  const kb = (b) => `${Math.max(1, Math.round((b || 0) / 1024))} KB`;

  // ---------- normalizadores (lo que cuenta para decir si dos cosas son iguales) ----------
  // Los ejercicios se comparan por NOMBRE: cada dispositivo les da su propio id.
  function normDay(d, exName) {
    const { id, order, ...rest } = d || {};
    return { ...rest, blocks: (d.blocks || []).map(b => ({ ...b, exercises: (b.exercises || []).map(e => {
      const { exerciseId, ...r } = e; return { ...r, name: norm(exName(exerciseId) || e.name) };
    }) })) };
  }
  const daysSorted = (rt) => (rt.days || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  function normPlan(rt, exName) {
    return { name: norm(rt.name), planNotes: rt.planNotes, planDuration: rt.planDuration, planStart: rt.planStart, days: daysSorted(rt).map(d => normDay(d, exName)) };
  }
  function normSession(s, exName) {
    return { date: s.date, name: norm(s.name), notes: s.notes, durationSec: num(s.durationSec), response: s.response,
      entries: (s.entries || []).map(e => { const { exerciseId, ...r } = e; return { ...r, name: norm(exName(exerciseId) || e.name) }; }) };
  }
  const PROG_FIELDS = [['weight', 'Peso', 'kg'], ['waist', 'Cintura', 'cm'], ['hip', 'Cadera', 'cm'], ['thigh', 'Muslo', 'cm'], ['arm', 'Brazo', 'cm']];
  function normProgress(p) {
    const o = { date: p.date, notes: (p.notes || '').trim() };
    PROG_FIELDS.forEach(([k]) => { o[k] = num(p[k]); });
    return o;
  }
  const NUT_OWN = new Set(['id', 'userId', 'isPrimary', 'createdAt', 'updatedAt', 'docIds']);
  const normNutrition = (n) => Object.fromEntries(Object.entries(n).filter(([k]) => !NUT_OWN.has(k)));

  // Series hechas y resumen corto de una sesión, para enseñar qué cambia.
  const seriesDe = (s) => (s.entries || []).reduce((a, e) => a + (Array.isArray(e.sets) ? e.sets.filter(x => x && x.done !== false).length : 0), 0);
  const minDe = (s) => s.durationSec ? `${Math.round(s.durationSec / 60)} min` : '—';

  // ---------- ANÁLISIS ----------
  // want: { sections:Set('exercises','sessions','progress','nutrition','files'), data (ya filtrado),
  //         plans:[rutinas del archivo], fileActive: rutina activa del archivo | null,
  //         days: { routine, dayIds:Set } | null, allExercises: catálogo completo del archivo }
  async function analyze(uid, want) {
    const data = want.data || {};
    const A = { uid, ex: [], plans: [], swap: null, days: null, sessions: [], progress: [], nutrition: [], files: [] };
    const mine = uid ? {
      exercises: await DB.exercisesOf(uid), routines: await DB.routinesOf(uid),
      sessions: (await DB.sessionsOf(uid)).filter(s => !s.draft), progress: await DB.progressOf(uid),
      nutrition: await DB.nutritionOf(uid), files: await (DB.filesOf ? DB.filesOf(uid).catch(() => []) : []),
    } : { exercises: [], routines: [], sessions: [], progress: [], nutrition: [], files: [] };
    const allTheirEx = want.allExercises || data.exercises || [];
    const theirById = new Map(allTheirEx.map(e => [e.id, e]));
    const myById = new Map(mine.exercises.map(e => [e.id, e]));
    const myByName = new Map(mine.exercises.map(e => [norm(e.name), e]));
    const theirName = (id) => theirById.get(id)?.name;
    const myName = (id) => myById.get(id)?.name;

    // ---- Ejercicios: todos si se marcaron; si no, solo los que usan las sesiones y planes que entran.
    let exList;
    if (want.sections.has('exercises')) exList = data.exercises || [];
    else {
      const ids = new Set();
      const add = (id) => { if (!id || ids.has(id) || !theirById.has(id)) return; ids.add(id); (theirById.get(id).substitutes || []).forEach(add); };
      (data.sessions || []).forEach(s => (s.entries || []).forEach(e => add(e.exerciseId)));
      const dias = [...(want.plans || []).flatMap(r => r.days || []), ...(want.days ? (want.days.routine.days || []).filter(d => want.days.dayIds.has(d.id)) : [])];
      dias.forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => add(e.exerciseId))));
      exList = allTheirEx.filter(e => ids.has(e.id));
    }
    for (const t of exList) {
      const key = norm(t.name); if (!key) continue;
      const m = myByName.get(key);
      if (!m) { A.ex.push({ status: 'nuevo', theirs: t }); continue; }
      const diffs = [], adds = [];
      if (t.muscleGroup && m.muscleGroup && norm(t.muscleGroup) !== norm(m.muscleGroup)) diffs.push({ label: 'Grupo', mine: m.muscleGroup, theirs: t.muscleGroup });
      if (t.type && m.type && t.type !== m.type) diffs.push({ label: 'Tipo', mine: tipo(m.type), theirs: tipo(t.type) });
      if (Array.isArray(t.metrics) && Array.isArray(m.metrics) && stable(t.metrics) !== stable(m.metrics)) diffs.push({ label: 'Datos que apunta', mine: m.metrics.join(', '), theirs: t.metrics.join(', ') });
      if (t.howto && m.howto && stable(t.howto) !== stable(m.howto)) diffs.push({ label: 'Técnica', mine: snip(m.howto), theirs: snip(t.howto), long: true });
      if (t.howto && !m.howto) adds.push('técnica');
      const myUrls = new Set(DB.exVideos(m).map(v => (v.url || '').trim()));
      const nv = DB.exVideos(t).filter(v => !myUrls.has((v.url || '').trim())).length;
      if (nv) adds.push(plural(nv, 'vídeo', 'vídeos'));
      const myAl = new Set((m.aliases || []).map(norm));
      const na = (t.aliases || []).filter(a => !myAl.has(norm(a))).length;
      if (na) adds.push(plural(na, 'otro nombre', 'otros nombres'));
      const mySubs = new Set((m.substitutes || []).map(id => norm(myName(id))));
      const ns = (t.substitutes || []).map(id => norm(theirName(id))).filter(n => n && n !== key && !mySubs.has(n)).length;
      if (ns) adds.push(plural(ns, 'suplente', 'suplentes'));
      A.ex.push({ status: diffs.length ? 'distinto' : adds.length ? 'completar' : 'igual', theirs: t, mine: m, diffs, adds, choice: 'mine', kind: 'Ejercicio', title: m.name, sub: m.muscleGroup || '' });
    }

    // ---- Planes
    const usados = new Set();
    const tieneEj = (rt) => (rt.days || []).some(d => (d.blocks || []).some(b => (b.exercises || []).length));
    const myActive = mine.routines.find(r => r.isPrimary) || null;
    if (want.fileActive && myActive && !tieneEj(myActive) && (want.plans || []).includes(want.fileActive)) {
      // tu plan activo está en blanco (p. ej. el de un perfil recién creado): pasa a ser el activo del archivo
      A.swap = { mine: myActive, theirs: want.fileActive };
      usados.add(myActive.id);
    }
    for (const t of (want.plans || [])) {
      if (A.swap && t === A.swap.theirs) continue;
      const m = mine.routines.find(r => !usados.has(r.id) && r.id === t.id) || mine.routines.find(r => !usados.has(r.id) && norm(r.name) === norm(t.name));
      if (!m) { A.plans.push({ status: 'nuevo', theirs: t }); continue; }
      usados.add(m.id);
      if (stable(normPlan(m, myName)) === stable(normPlan(t, theirName))) { A.plans.push({ status: 'igual', theirs: t, mine: m }); continue; }
      A.plans.push({ status: 'distinto', theirs: t, mine: m, choice: 'mine', kind: 'Plan', title: m.name, sub: m.isPrimary ? 'tu plan activo' : '', diffs: planDiffs(m, t, myName, theirName) });
    }

    // ---- Días sueltos a tu plan activo
    if (want.days && !A.swap) {
      const target = myActive;
      const elegidos = daysSorted(want.days.routine).filter(d => want.days.dayIds.has(d.id));
      if (!target) A.plans.push({ status: 'nuevo', theirs: { ...want.days.routine, days: elegidos } });
      else if (!tieneEj(target)) A.days = { target, blank: true, items: elegidos.map(d => ({ status: 'nuevo', theirs: d })) };
      else {
        A.days = { target, blank: false, items: elegidos.map(d => {
          const m = (target.days || []).find(x => norm(x.name) === norm(d.name));
          if (!m) return { status: 'nuevo', theirs: d };
          if (stable(normDay(m, myName)) === stable(normDay(d, theirName))) return { status: 'igual', theirs: d, mine: m };
          return { status: 'distinto', theirs: d, mine: m, choice: 'mine', kind: 'Día de tu plan', title: m.name, sub: target.name, diffs: dayDiffs(m, d, myName, theirName) };
        }) };
      }
    }

    // ---- Sesiones
    const usadas = new Set();
    for (const t of (data.sessions || [])) {
      const nt = stable(normSession(t, theirName));
      let m = mine.sessions.find(s => !usadas.has(s.id) && s.id === t.id);
      let ambas = false;
      if (!m) {
        const mismas = mine.sessions.filter(s => !usadas.has(s.id) && s.date === t.date && norm(s.name) === norm(t.name));
        m = mismas.find(s => stable(normSession(s, myName)) === nt) || mismas.find(s => s.createdAt && s.createdAt === t.createdAt);
        if (!m && mismas.length === 1) { m = mismas[0]; ambas = true; } // mismo día y nombre: puede ser la misma editada… o dos entrenos
      }
      if (!m) { A.sessions.push({ status: 'nuevo', theirs: t }); continue; }
      usadas.add(m.id);
      if (stable(normSession(m, myName)) === nt) { A.sessions.push({ status: 'igual', theirs: t, mine: m }); continue; }
      A.sessions.push({ status: 'distinto', theirs: t, mine: m, choice: 'mine', both: ambas, kind: 'Sesión', title: m.name || 'Sesión', sub: fecha(m.date), diffs: sessionDiffs(m, t, myName, theirName) });
    }

    // ---- Progreso (un registro por día)
    const usadosP = new Set();
    for (const t of (data.progress || [])) {
      const m = mine.progress.find(p => !usadosP.has(p.id) && p.id === t.id) || mine.progress.find(p => !usadosP.has(p.id) && p.date === t.date);
      if (!m) { A.progress.push({ status: 'nuevo', theirs: t }); continue; }
      usadosP.add(m.id);
      const a = normProgress(m), b = normProgress(t);
      if (stable(a) === stable(b)) { A.progress.push({ status: 'igual', theirs: t, mine: m }); continue; }
      const diffs = [];
      if (a.date !== b.date) diffs.push({ label: 'Fecha', mine: fecha(a.date), theirs: fecha(b.date) });
      PROG_FIELDS.forEach(([k, l, u]) => { if (a[k] !== b[k]) diffs.push({ label: l, mine: a[k] == null ? '—' : `${a[k]} ${u}`, theirs: b[k] == null ? '—' : `${b[k]} ${u}` }); });
      if (a.notes !== b.notes) diffs.push({ label: 'Notas', mine: a.notes || '—', theirs: b.notes || '—' });
      A.progress.push({ status: 'distinto', theirs: t, mine: m, choice: 'mine', kind: 'Progreso', title: fecha(m.date), sub: '', diffs });
    }

    // ---- Nutrición
    const usadasN = new Set();
    for (const t of (data.nutrition || [])) {
      const m = mine.nutrition.find(n => !usadasN.has(n.id) && n.id === t.id) || mine.nutrition.find(n => !usadasN.has(n.id) && norm(n.nombre) === norm(t.nombre));
      if (!m) { A.nutrition.push({ status: 'nuevo', theirs: t }); continue; }
      usadasN.add(m.id);
      if (stable(normNutrition(m)) === stable(normNutrition(t))) { A.nutrition.push({ status: 'igual', theirs: t, mine: m }); continue; }
      const resumen = (n) => `${plural((n.tomas || []).length, 'toma', 'tomas')} · ${plural((n.suplementos || []).length, 'suplemento', 'suplementos')}`;
      const diffs = [];
      if (norm(m.nombre) !== norm(t.nombre)) diffs.push({ label: 'Nombre', mine: m.nombre || '—', theirs: t.nombre || '—' });
      diffs.push({ label: 'Contenido', mine: resumen(m), theirs: resumen(t) });
      A.nutrition.push({ status: 'distinto', theirs: t, mine: m, choice: 'mine', kind: 'Pauta', title: m.nombre || 'Pauta', sub: m.isPrimary ? 'la que usas' : '', diffs });
    }

    // ---- Documentos (mismo nombre y tamaño = el mismo)
    const usadosF = new Set();
    for (const t of (data.files || [])) {
      if (!t || !t.b64) continue;
      const m = mine.files.find(f => !usadosF.has(f.id) && (f.id === t.id || (norm(f.name) === norm(t.name) && (f.size || 0) === (t.size || 0))))
        || mine.files.find(f => !usadosF.has(f.id) && norm(f.name) === norm(t.name));
      if (!m) { A.files.push({ status: 'nuevo', theirs: t }); continue; }
      usadosF.add(m.id);
      if ((m.size || 0) === (t.size || 0)) { A.files.push({ status: 'igual', theirs: t, mine: m }); continue; }
      A.files.push({ status: 'distinto', theirs: t, mine: m, choice: 'mine', kind: 'Documento', title: m.name, sub: '', diffs: [{ label: 'Tamaño', mine: kb(m.size), theirs: kb(t.size) }] });
    }
    return A;
  }

  const snip = (x) => { const s = (typeof x === 'string' ? x : JSON.stringify(x)).replace(/\s+/g, ' ').trim(); return s.length > 90 ? s.slice(0, 88) + '…' : s; };
  function tipo(t) { return ({ weight: 'con peso', reps: 'repeticiones', time: 'por tiempo', check: 'hecho / no hecho' })[t] || t; }

  function exResumen(day) { return (day.blocks || []).reduce((a, b) => a + (b.exercises || []).length, 0); }
  const DAY_FIELDS = [['focus', 'Foco'], ['place', 'Lugar'], ['duration', 'Duración'], ['typeLabel', 'Tipo']];
  // Qué cambia en un día: sus datos, y los ejercicios que están en uno y no en el otro.
  function dayDiffs(m, t, myName, theirName) {
    const out = [];
    DAY_FIELDS.forEach(([k, l]) => { if (norm(m[k]) !== norm(t[k])) out.push({ label: l, mine: (m[k] || '').trim() || '—', theirs: (t[k] || '').trim() || '—' }); });
    if (!!m.isRest !== !!t.isRest) out.push({ label: 'Descanso', mine: m.isRest ? 'sí' : 'no', theirs: t.isRest ? 'sí' : 'no' });
    const a = new Set((m.blocks || []).flatMap(b => (b.exercises || []).map(e => norm(myName(e.exerciseId) || e.name))));
    const b = new Set((t.blocks || []).flatMap(x => (x.exercises || []).map(e => norm(theirName(e.exerciseId) || e.name))));
    if (exResumen(m) !== exResumen(t)) out.push({ label: 'Ejercicios', mine: String(exResumen(m)), theirs: String(exResumen(t)) });
    const soloArchivo = [...b].filter(x => !a.has(x)), soloTuyo = [...a].filter(x => !b.has(x));
    if (soloArchivo.length) out.push({ label: 'Solo en el archivo', full: lista(soloArchivo) });
    if (soloTuyo.length) out.push({ label: 'Solo en el tuyo', full: lista(soloTuyo) });
    if (!out.length) out.push({ label: 'Cambia', full: 'series, orden o notas de los ejercicios' });
    return out;
  }
  // Resumen de una línea de lo que cambia en un día (para la tarjeta de un plan entero).
  function dayLinea(m, t, myName, theirName) {
    const partes = dayDiffs(m, t, myName, theirName).map(d => d.full !== undefined
      ? (d.label === 'Cambia' ? d.full : `${d.label.toLowerCase()}: ${d.full}`)
      : `${d.label.toLowerCase()} ${d.mine} → ${d.theirs}`);
    return `${m.name}: ${partes.join(' · ')}`;
  }
  function planDiffs(m, t, myName, theirName) {
    const out = [];
    if (norm(m.name) !== norm(t.name)) out.push({ label: 'Nombre', mine: m.name, theirs: t.name });
    const md = daysSorted(m), td = daysSorted(t);
    if (md.length !== td.length) out.push({ label: 'Días', mine: String(md.length), theirs: String(td.length) });
    td.forEach(d => {
      const x = md.find(y => norm(y.name) === norm(d.name));
      if (!x) out.push({ label: 'Día nuevo', full: d.name });
      else if (stable(normDay(x, myName)) !== stable(normDay(d, theirName))) out.push({ label: 'Cambia', full: dayLinea(x, d, myName, theirName) });
    });
    md.forEach(d => { if (!td.some(y => norm(y.name) === norm(d.name))) out.push({ label: 'Solo en el tuyo', full: d.name }); });
    if (stable(m.planNotes) !== stable(t.planNotes)) out.push({ label: 'Notas del plan', full: 'distintas' });
    return out;
  }
  function sessionDiffs(m, t, myName, theirName) {
    const out = [];
    const a = (m.entries || []).map(e => norm(myName(e.exerciseId) || e.name)), b = (t.entries || []).map(e => norm(theirName(e.exerciseId) || e.name));
    if (a.length !== b.length) out.push({ label: 'Ejercicios', mine: String(a.length), theirs: String(b.length) });
    if (seriesDe(m) !== seriesDe(t)) out.push({ label: 'Series', mine: String(seriesDe(m)), theirs: String(seriesDe(t)) });
    if (num(m.durationSec) !== num(t.durationSec)) out.push({ label: 'Duración', mine: minDe(m), theirs: minDe(t) });
    const sa = b.filter(x => !a.includes(x)), st = a.filter(x => !b.includes(x));
    if (sa.length) out.push({ label: 'Solo en el archivo', full: lista(sa) });
    if (st.length) out.push({ label: 'Solo en la tuya', full: lista(st) });
    if ((m.notes || '').trim() !== (t.notes || '').trim()) out.push({ label: 'Notas', mine: snip((m.notes || '').trim() || '—'), theirs: snip((t.notes || '').trim() || '—'), long: true });
    if (!out.length) out.push({ label: 'Cambia', full: 'pesos, repeticiones o datos de alguna serie' });
    return out;
  }
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const lista = (arr) => { const xs = arr.slice(0, 4).map(cap); return xs.join(', ') + (arr.length > 4 ? ` y ${arr.length - 4} más` : ''); };

  // ---------- RESUMEN ----------
  const NOMBRES = {
    ex: ['ejercicio', 'ejercicios'], plans: ['plan', 'planes'], sessions: ['sesión', 'sesiones'],
    progress: ['registro de progreso', 'registros de progreso'], nutrition: ['pauta', 'pautas'], files: ['documento', 'documentos'],
  };
  const KEYS = ['plans', 'sessions', 'progress', 'nutrition', 'files', 'ex'];
  function cuenta(A, status) {
    const partes = [];
    KEYS.forEach(k => { const n = A[k].filter(x => x.status === status).length; if (n) partes.push(plural(n, ...NOMBRES[k])); });
    if (A.days) {
      const n = A.days.items.filter(x => x.status === status).length;
      if (n) partes.push(`${plural(n, 'día', 'días')} de tu plan`);
    }
    return partes;
  }
  const conflictos = (A) => [...A.plans, ...(A.days ? A.days.items : []), ...A.sessions, ...A.progress, ...A.nutrition, ...A.files, ...A.ex].filter(x => x.status === 'distinto');
  function hayAlgo(A) {
    return !!(A.swap || (A.days && A.days.blank) || cuenta(A, 'nuevo').length || cuenta(A, 'completar').length || conflictos(A).length);
  }

  // ---------- PANTALLA DE REVISIÓN ----------
  // Devuelve una promesa: 'ok' (importar), 'back' (volver a elegir) o null (cancelar).
  function review(app, A, { who, backLabel = 'Atrás' } = {}) {
    return new Promise((resolve) => {
      let hecho = false;
      const fin = (v) => { if (!hecho) { hecho = true; resolve(v); } };
      const conf = conflictos(A);
      if (!hayAlgo(A)) {
        UI.modal({ title: 'Nada que importar', bodyHTML: `<div class="mg-row same"><span class="mg-ic">${UI.icon('check', 16)}</span><div><strong>Ya lo tienes todo igual</strong><span>${UI.esc(cuenta(A, 'igual').join(' · ') || 'Nada nuevo en el archivo')}</span></div></div><p class="field-hint">${who ? `En ${UI.esc(who)} no` : 'No'} cambia nada y no se duplica nada.</p>`,
          actions: [{ label: backLabel, kind: 'ghost', onClick: () => fin('back') }, { label: 'Cerrar', kind: 'primary', onClick: () => fin(null) }], onClose: () => fin(null) });
        return;
      }
      const nuevos = cuenta(A, 'nuevo'), completar = cuenta(A, 'completar'), iguales = cuenta(A, 'igual');
      const fills = A.ex.filter(x => x.status === 'completar');
      const swapHTML = A.swap ? `<div class="mg-row swap"><span class="mg-ic">${UI.icon('swap', 16)}</span><div><strong>Tu plan «${UI.esc(A.swap.mine.name || 'Mi plan')}» está vacío</strong><span>Pasa a ser «${UI.esc(A.swap.theirs.name || 'Plan')}», con sus ${(A.swap.theirs.days || []).length} días, y queda como tu plan activo.</span></div></div>` : '';
      const blankHTML = (A.days && A.days.blank) ? `<div class="mg-row swap"><span class="mg-ic">${UI.icon('swap', 16)}</span><div><strong>Tu plan «${UI.esc(A.days.target.name || 'Mi plan')}» está vacío</strong><span>Se queda con los ${A.days.items.length} días del archivo, en su orden.</span></div></div>` : '';
      const grupos = [['plans', 'Planes'], ['days', 'Días de tu plan'], ['sessions', 'Sesiones'], ['progress', 'Progreso'], ['nutrition', 'Nutrición'], ['files', 'Documentos'], ['ex', 'Ejercicios']];
      let idx = 0;
      const card = (it) => {
        const i = idx++; it._i = i;
        const filas = it.diffs.map(d => d.full !== undefined
          ? `<div class="mg-d full"><span class="mg-dl">${UI.esc(d.label)}</span><span class="mg-dv">${UI.esc(d.full)}</span></div>`
          : d.long
            ? `<div class="mg-d long"><span class="mg-dl">${UI.esc(d.label)}</span><div class="mg-lv mg-m"><em>Tuyo</em>${UI.esc(String(d.mine))}</div><div class="mg-lv mg-t"><em>Archivo</em>${UI.esc(String(d.theirs))}</div></div>`
            : `<div class="mg-d"><span class="mg-dl">${UI.esc(d.label)}</span><span class="mg-m">${UI.esc(String(d.mine))}</span><span class="mg-t">${UI.esc(String(d.theirs))}</span></div>`).join('');
        const cabecera = it.diffs.some(d => d.full === undefined && !d.long) ? '<div class="mg-d head"><span></span><span>Tuyo</span><span>Archivo</span></div>' : '';
        const extra = (it.adds && it.adds.length) ? `<div class="mg-d full"><span class="mg-dl">Se le añade</span><span class="mg-dv">${UI.esc(it.adds.join(', '))}</span></div>` : '';
        return `<div class="mg-card" data-i="${i}">
          <div class="mg-card-t"><strong>${UI.esc(it.title || '')}</strong>${it.sub ? `<span class="dim">${UI.esc(it.sub)}</span>` : ''}</div>
          <div class="mg-diffs">${cabecera}${filas}${extra}</div>
          <div class="seg mg-seg"><button type="button" class="seg-opt on" data-c="mine">Dejar el mío</button><button type="button" class="seg-opt" data-c="theirs">Usar el del archivo</button>${it.both ? '<button type="button" class="seg-opt" data-c="both">Son dos</button>' : ''}</div>
        </div>`;
      };
      const deGrupo = (k) => (k === 'days' ? (A.days ? A.days.items : []) : A[k]).filter(x => x.status === 'distinto');
      const nGrupos = grupos.filter(([k]) => deGrupo(k).length).length;
      const VISIBLES = 3;
      const confHTML = conf.length ? `<div class="mg-conf-h"><div><strong>Distinto en tu perfil y en el archivo</strong><span class="dim">${plural(conf.length, 'cosa', 'cosas')} · si no eliges, se queda lo tuyo</span></div></div>
        ${nGrupos > 1 ? `<div class="seg mg-all" data-scope="all"><button type="button" class="seg-opt on" data-all="mine">Todo lo mío</button><button type="button" class="seg-opt" data-all="theirs">Todo lo del archivo</button></div>` : ''}
        ${grupos.map(([k, l]) => {
          const its = deGrupo(k);
          if (!its.length) return '';
          const html = its.map(card);
          return `<div class="mg-grp" data-g="${k}">
            <div class="mg-gh"><div class="card-label mg-gl">${l} <span class="dim">(${its.length})</span></div>
              ${its.length > 1 ? `<div class="seg mg-gseg"><button type="button" class="seg-opt on" data-gall="mine">Lo mío</button><button type="button" class="seg-opt" data-gall="theirs">Lo del archivo</button></div>` : ''}</div>
            ${html.slice(0, VISIBLES).join('')}
            ${its.length > VISIBLES ? `<div class="mg-more" hidden>${html.slice(VISIBLES).join('')}</div><button type="button" class="btn ghost block mg-vermas" data-more>Ver ${its.length - VISIBLES === 1 ? 'el que falta' : `los ${its.length - VISIBLES} restantes`}</button>` : ''}
          </div>`;
        }).join('')}` : '';
      UI.modal({
        title: 'Antes de importar', size: 'wide',
        bodyHTML: `<p class="modal-text">${who ? `Así queda <strong>${UI.esc(who)}</strong>. ` : ''}Nada se duplica y nada tuyo cambia sin que lo elijas.</p>
          <div class="mg-sum">
            ${swapHTML}${blankHTML}
            ${nuevos.length ? `<div class="mg-row add"><span class="mg-ic">${UI.icon('plus', 16)}</span><div><strong>Se añade</strong><span>${UI.esc(nuevos.join(' · '))}</span></div></div>` : ''}
            ${completar.length ? `<div class="mg-row fill"><span class="mg-ic">${UI.icon('edit', 16)}</span><div><strong>Se completa, sin borrar nada</strong><span>${UI.esc(completar.join(' · '))}: lo que les faltaba (vídeos, técnica, suplentes…)</span>
              ${fills.length ? `<button type="button" class="imp-toggle mg-ver" data-ver>ver</button><div class="mg-fills" hidden>${fills.map(f => `<div><strong>${UI.esc(f.mine.name)}</strong> <span class="dim">+ ${UI.esc(f.adds.join(', '))}</span></div>`).join('')}</div>` : ''}</div></div>` : ''}
            ${iguales.length ? `<div class="mg-row same"><span class="mg-ic">${UI.icon('check', 16)}</span><div><strong>Ya lo tienes igual</strong><span>${UI.esc(iguales.join(' · '))} · no se toca</span></div></div>` : ''}
          </div>
          ${confHTML}`,
        actions: [
          { label: backLabel, kind: 'ghost', onClick: () => fin('back') },
          { label: 'Importar', kind: 'primary', onClick: () => fin('ok') },
        ],
        onClose: () => fin(null),
        onMount: (root) => {
          const items = conf;
          const pintar = (cardEl, c) => cardEl.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === c));
          const elegir = (el, c) => { const it = items.find(x => x._i === +el.dataset.i); it.choice = c; pintar(el, c); el.classList.toggle('theirs', c !== 'mine'); };
          root.querySelectorAll('.mg-card').forEach(el => {
            el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
              elegir(el, b.dataset.c);
              root.querySelectorAll('[data-all]').forEach(x => x.classList.remove('on'));
              el.closest('.mg-grp').querySelectorAll('[data-gall]').forEach(x => x.classList.remove('on'));
            }));
          });
          root.querySelectorAll('[data-gall]').forEach(b => b.addEventListener('click', () => {
            const g = b.closest('.mg-grp');
            g.querySelectorAll('[data-gall]').forEach(x => x.classList.toggle('on', x === b));
            g.querySelectorAll('.mg-card').forEach(el => elegir(el, b.dataset.gall));
            root.querySelectorAll('[data-all]').forEach(x => x.classList.remove('on'));
          }));
          root.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => {
            root.querySelectorAll('[data-all]').forEach(x => x.classList.toggle('on', x === b));
            root.querySelectorAll('[data-gall]').forEach(x => x.classList.toggle('on', x.dataset.gall === b.dataset.all));
            root.querySelectorAll('.mg-card').forEach(el => elegir(el, b.dataset.all));
          }));
          root.querySelectorAll('[data-more]').forEach(b => b.addEventListener('click', () => {
            const box = b.previousElementSibling; box.hidden = !box.hidden;
            if (!b.dataset.txt) b.dataset.txt = b.textContent;
            b.textContent = box.hidden ? b.dataset.txt : 'Ocultar';
          }));
          const ver = root.querySelector('[data-ver]');
          if (ver) ver.addEventListener('click', () => { const box = root.querySelector('.mg-fills'); box.hidden = !box.hidden; ver.textContent = box.hidden ? 'ver' : 'ocultar'; });
        },
      });
    });
  }

  // ---------- APLICAR ----------
  async function apply(A) {
    const uid = A.uid;
    const tomados = new Set();
    const libre = async (store, id, prefix) => {
      if (id && !tomados.has(id) && !(await DB.get(store, id))) { tomados.add(id); return id; }
      const n = DB.uid(prefix); tomados.add(n); return n;
    };
    const n = { añadidos: 0, cambiados: 0 };

    // 1) Ejercicios → exMap (id del archivo → id tuyo)
    const exMap = {};
    const OWN = new Set(['id', 'userId', 'substitutes', 'createdAt', 'isDefault', 'defaultKey']);
    const payloadOf = (ie) => Object.fromEntries(Object.entries(ie).filter(([k, v]) => !OWN.has(k) && v !== undefined));
    const conSubs = [];
    for (const it of A.ex) {
      const t = it.theirs;
      if (it.status === 'nuevo') {
        const ex = { ...payloadOf(t), id: await libre('exercises', t.id, 'ex'), userId: uid, name: (t.name || '').trim(), muscleGroup: t.muscleGroup || 'General', type: t.type || 'weight', substitutes: [], createdAt: t.createdAt || Date.now() };
        const vids = DB.exVideos(t); if (vids.length) { ex.videos = vids.map(v => ({ ...v })); ex.videoUrl = vids[0].url; }
        await DB.put('exercises', ex); exMap[t.id] = ex.id; conSubs.push({ ex, t, nuevo: true }); n.añadidos++;
        continue;
      }
      const m = it.mine; exMap[t.id] = m.id;
      if (it.status === 'igual') continue;
      const antes = stable(m);
      let ex = { ...m };
      if (it.status === 'distinto' && it.choice === 'theirs') {
        Object.assign(ex, payloadOf(t), { name: m.name });
        if (!Array.isArray(t.metrics) && t.type && t.type !== 'time' && t.type !== 'check') delete ex.metrics;
      }
      // completar sin borrar: vídeos que falten, técnica si no había, otros nombres
      const vids = DB.exVideos(ex).map(v => ({ ...v }));
      const urls = new Set(vids.map(v => (v.url || '').trim()));
      DB.exVideos(t).forEach(v => { if (!urls.has((v.url || '').trim())) { vids.push({ ...v }); urls.add((v.url || '').trim()); } });
      if (vids.length) { ex.videos = vids; ex.videoUrl = vids[0].url; }
      if (t.howto && !ex.howto) ex.howto = t.howto;
      const al = new Set((ex.aliases || []).map(norm));
      const extraAl = (t.aliases || []).filter(a => !al.has(norm(a)));
      if (extraAl.length) ex.aliases = [...(ex.aliases || []), ...extraAl];
      conSubs.push({ ex, t, antes });
    }
    // suplentes, ya con todos los ids: se añaden los que falten (nunca se quitan los tuyos)
    for (const { ex, t, nuevo, antes } of conSubs) {
      const mineS = ex.substitutes || [];
      const extra = (t.substitutes || []).map(id => exMap[id]).filter(id => id && id !== ex.id && !mineS.includes(id));
      if (extra.length) ex.substitutes = [...mineS, ...new Set(extra)];
      if (nuevo) { if (extra.length) await DB.put('exercises', ex); }
      else if (stable(ex) !== antes) { await DB.put('exercises', ex); n.cambiados++; }
    }
    const remapDays = async (days) => {
      const cat = new Map((await DB.exercisesOf(uid)).map(e => [e.id, e]));
      const out = JSON.parse(JSON.stringify(days || []));
      out.forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => {
        if (e.exerciseId && exMap[e.exerciseId]) e.exerciseId = exMap[e.exerciseId];
        const ex = cat.get(e.exerciseId); if (ex) { e.name = ex.name; e.type = ex.type; }
      })));
      return out;
    };

    // 2) Documentos (antes que nutrición: la pauta los cita por id)
    const fileMap = {};
    for (const it of A.files) {
      const t = it.theirs;
      if (it.status === 'nuevo') {
        const id = await libre('files', t.id, 'file');
        try { await DB.put('files', { id, userId: uid, name: t.name, type: t.type || '', size: t.size || 0, addedAt: t.addedAt || Date.now(), data: b64ToBuf(t.b64) }); fileMap[t.id] = id; n.añadidos++; } catch (e) { console.error('importar documento', e); }
      } else {
        fileMap[t.id] = it.mine.id;
        if (it.status === 'distinto' && it.choice === 'theirs') {
          try { await DB.put('files', { ...it.mine, type: t.type || '', size: t.size || 0, addedAt: t.addedAt || Date.now(), data: b64ToBuf(t.b64) }); n.cambiados++; } catch (e) { console.error('importar documento', e); }
        }
      }
    }

    // 3) Planes
    const planMap = {}; // id del plan del archivo → id tuyo (las sesiones lo citan)
    if (A.swap) {
      const t = A.swap.theirs;
      const id = await libre('routines', t.id, 'rt');
      await DB.del('routines', A.swap.mine.id);
      await DB.put('routines', { ...t, id, userId: uid, days: await remapDays(t.days), isPrimary: true, order: A.swap.mine.order || 0 });
      planMap[t.id] = id; n.cambiados++;
    }
    let orden = Date.now();
    for (const it of A.plans) {
      const t = it.theirs;
      if (it.status === 'nuevo') {
        const id = await libre('routines', t.id, 'rt');
        await DB.put('routines', { ...t, id, userId: uid, planType: t.planType === 'template' ? 'template' : (t.planType || 'custom'), days: await remapDays(t.days), isPrimary: false, order: orden++ });
        planMap[t.id] = id; n.añadidos++;
      } else {
        planMap[t.id] = it.mine.id;
        if (it.status === 'distinto' && it.choice === 'theirs') {
          await DB.put('routines', { ...t, id: it.mine.id, userId: uid, days: await remapDays(t.days), isPrimary: !!it.mine.isPrimary, order: it.mine.order });
          n.cambiados++;
        }
      }
    }
    // exactamente un plan activo
    const rts = await DB.routinesOf(uid);
    if (rts.length && rts.filter(r => r.isPrimary).length !== 1) {
      const keep = rts.find(r => r.isPrimary) || rts[0];
      for (const r of rts) { const w = r.id === keep.id; if (!!r.isPrimary !== w) { r.isPrimary = w; await DB.put('routines', r); } }
    }

    // 4) Días sueltos a tu plan activo
    if (A.days) {
      const target = await DB.get('routines', A.days.target.id);
      if (target) {
        if (A.days.blank) {
          const days = await remapDays(A.days.items.map(x => x.theirs));
          target.days = days.map((d, i) => ({ ...d, id: DB.uid('day'), order: i }));
          n.cambiados++;
        } else {
          let next = Math.max(-1, ...(target.days || []).map(d => d.order || 0)) + 1;
          for (const it of A.days.items) {
            if (it.status === 'nuevo') { const [d] = await remapDays([it.theirs]); target.days.push({ ...d, id: DB.uid('day'), order: next++ }); n.añadidos++; }
            else if (it.status === 'distinto' && it.choice === 'theirs') {
              const [d] = await remapDays([it.theirs]);
              const i = target.days.findIndex(x => x.id === it.mine.id);
              if (i >= 0) { target.days[i] = { ...d, id: it.mine.id, order: it.mine.order }; n.cambiados++; }
            }
          }
        }
        await DB.put('routines', target);
      }
    }

    // 5) Sesiones
    const remapEntries = (s) => (s.entries || []).map(e => ({ ...e, exerciseId: (e.exerciseId && exMap[e.exerciseId]) || e.exerciseId || null }));
    for (const it of A.sessions) {
      const t = it.theirs;
      const base = { ...t, userId: uid, entries: remapEntries(t), draft: false, routineId: planMap[t.routineId] || t.routineId };
      if (it.status === 'nuevo' || (it.status === 'distinto' && it.choice === 'both')) {
        await DB.put('sessions', { ...base, id: await libre('sessions', t.id, 'ses') }); n.añadidos++;
      } else if (it.status === 'distinto' && it.choice === 'theirs') {
        await DB.put('sessions', { ...base, id: it.mine.id }); n.cambiados++;
      }
    }

    // 6) Progreso
    for (const it of A.progress) {
      const t = it.theirs;
      if (it.status === 'nuevo') { await DB.put('progress', { ...t, id: await libre('progress', t.id, 'prg'), userId: uid }); n.añadidos++; }
      else if (it.status === 'distinto' && it.choice === 'theirs') { await DB.put('progress', { ...t, id: it.mine.id, userId: uid }); n.cambiados++; }
    }

    // 7) Nutrición
    let tienePauta = uid ? (await DB.nutritionOf(uid)).some(x => x.isPrimary) : false;
    for (const it of A.nutrition) {
      const t = it.theirs;
      const docIds = (t.docIds || []).map(id => fileMap[id] || id);
      try {
        if (it.status === 'nuevo') {
          await DB.saveNutrition({ ...t, id: await libre('nutrition', t.id, 'nut'), userId: uid, docIds, isPrimary: !tienePauta });
          tienePauta = true; n.añadidos++;
        } else if (it.status === 'distinto' && it.choice === 'theirs') {
          await DB.saveNutrition({ ...t, id: it.mine.id, userId: uid, docIds, isPrimary: !!it.mine.isPrimary }); n.cambiados++;
        }
      } catch (e) { console.error('importar nutrición', e); }
    }
    return n;
  }

  function b64ToBuf(b64) {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  return { analyze, review, apply, hayAlgo };
})();
