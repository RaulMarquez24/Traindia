// ============================================================
// CAPA DE PERSISTENCIA — IndexedDB (offline, sin dependencias)
// ============================================================
// Stores (todas con userId salvo settings/users):
//   settings   { key, ... }            singleton de configuración de la app
//   users      { id, name, color, isMain, isGuest, createdAt }
//   exercises  { id, userId, name, muscleGroup, type, createdAt }
//   routines   { id, userId, name, days[], order, createdAt }
//   sessions   { id, userId, date, name, dayId?, routineId?, entries[], notes, durationSec, createdAt }
//   progress   { id, userId, date, weight, measurements{}, notes }
//   journal    { id, userId, date, mood, text }
// ============================================================

const DB = (() => {
  const DB_NAME = 'cnp-db';
  const DB_VERSION = 1;
  const STORES = {
    settings:  { keyPath: 'key', indexes: [] },
    users:     { keyPath: 'id', indexes: [] },
    exercises: { keyPath: 'id', indexes: ['userId'] },
    routines:  { keyPath: 'id', indexes: ['userId'] },
    sessions:  { keyPath: 'id', indexes: ['userId', 'date'] },
    progress:  { keyPath: 'id', indexes: ['userId', 'date'] },
    journal:   { keyPath: 'id', indexes: ['userId', 'date'] },
  };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: def.keyPath });
            def.indexes.forEach(idx => store.createIndex(idx, idx, { unique: false }));
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode = 'readonly') {
    return open().then(db => db.transaction(store, mode).objectStore(store));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---- API genérica ----
  async function get(store, key) {
    return reqToPromise((await tx(store)).get(key));
  }
  async function getAll(store) {
    return reqToPromise((await tx(store)).getAll());
  }
  async function put(store, obj) {
    await reqToPromise((await tx(store, 'readwrite')).put(obj));
    return obj;
  }
  async function del(store, key) {
    return reqToPromise((await tx(store, 'readwrite')).delete(key));
  }
  async function byIndex(store, index, value) {
    const os = await tx(store);
    return reqToPromise(os.index(index).getAll(value));
  }
  async function clearStore(store) {
    return reqToPromise((await tx(store, 'readwrite')).clear());
  }

  // ---- Utilidades ----
  function uid(prefix = 'id') {
    if (crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  // ---- Settings ----
  async function getSettings() {
    return (await get('settings', 'app')) || null;
  }
  async function saveSettings(patch) {
    const cur = (await getSettings()) || { key: 'app' };
    const next = { ...cur, ...patch, key: 'app' };
    await put('settings', next);
    return next;
  }

  // ---- Usuarios ----
  async function getUsers() {
    return (await getAll('users')).sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }
  async function getMainUser() {
    const s = await getSettings();
    if (!s || !s.mainUserId) return null;
    return get('users', s.mainUserId);
  }
  async function createUser({ name, color, isMain = false, isGuest = false }) {
    const user = { id: uid('usr'), name: name.trim(), color, isMain, isGuest, createdAt: Date.now() };
    await put('users', user);
    return user;
  }

  // ---- Inferencia para semilla ----
  // Tipos: 'weight' (reps+kg), 'reps' (peso corporal), 'time' (duración).
  // Clasifica por marcas en las series y por palabras clave del nombre.
  function classifyType(name, sets) {
    const s = String(sets || '');
    if (/['"]|\bmin\b|\bseg\b|\bmáx\b|tempo|\bint\.|\d\s*['"]/i.test(s)) return 'time';
    const n = (name || '').toLowerCase();
    const timeWords = ['cinta', 'elíptic', 'eliptic', 'bici', 'carrera', 'paseo', 'trote', 'plancha',
      'hang', 'colgad', 'suspensi', 'static hold', 'drenaje', 'compresi', 'movilidad', 'estiramient',
      'calentamiento', 'progresivo', 'slalom', 'agilidad', 'circuito', 'pallof', 'z2'];
    if (timeWords.some(w => n.includes(w))) return 'time';
    return 'weight';
  }

  // Grupo muscular INDIVIDUAL de cada ejercicio predefinido (uno solo, nunca combinado).
  const MUSCLE_GROUP = {
    'Press banca o mancuerna': 'Pecho',
    'Press inclinado mancuerna': 'Pecho',
    'Press militar mancuerna': 'Hombro',
    'Fondos máquina sentado': 'Tríceps',
    'Tríceps cuerda overhead': 'Tríceps',
    'Cinta Z2 conversacional': 'Cardio',
    'Sentadilla o prensa': 'Pierna',
    'Peso muerto rumano': 'Pierna',
    'Hip thrust': 'Glúteo',
    'Zancadas o búlgaras': 'Pierna',
    'Gemelo': 'Pierna',
    'Dominadas asistidas prono': 'Espalda',
    'Remo con barra': 'Espalda',
    'Jalón al pecho prono': 'Espalda',
    'Remo bajo polea': 'Espalda',
    'Curl bíceps barra': 'Bíceps',
    'Curl martillo': 'Bíceps',
    'Cinta Z2 muy suave': 'Cardio',
    'Elevación lateral': 'Hombro',
    'Tríceps pushdown cuerda': 'Tríceps',
    'Curl alterno (sin fallo)': 'Bíceps',
    'Dead hang prono c/grips': 'Agarre',
    'Static hold mancuernas': 'Agarre',
    'Curl muñeca lateral polea': 'Antebrazo',
    'Pronosupinación mancuerna de pie': 'Antebrazo',
    "Captain's chair (rod./piernas)": 'Core',
    'Crunch máquina abdominal': 'Core',
    'Pallof press polea': 'Core',
    'Plancha frontal': 'Core',
    'Cinta Z2': 'Cardio',
    'Progresivo + movilidad': 'Movilidad',
    "Sem. impar — 5-6×400m R 1:30-2'": 'Carrera',
    'Sem. par — 1km test o 2×800m': 'Carrera',
    'Suspensión supina barra parque': 'Agarre',
    '5-10-5 con conos': 'Agilidad',
    'Slaloms · salidas · giros': 'Agilidad',
    'Cadera · dorsal · hombro': 'Movilidad',
    'Jalón al pecho supino': 'Espalda',
    'Remo máquina o sentado': 'Espalda',
    'Face pull polea': 'Hombro',
    'Estiramientos cadera/lumbar': 'Movilidad',
    'Cinta Z2 o paseo': 'Cardio',
    'Drenaje · compresión · frío': 'Recuperación',
  };
  function muscleGroupFor(name) {
    const n = (name || '').trim();
    if (MUSCLE_GROUP[n]) return MUSCLE_GROUP[n];
    const lc = n.toLowerCase();
    for (const k in MUSCLE_GROUP) { if (k.toLowerCase() === lc) return MUSCLE_GROUP[k]; }
    return null;
  }

  // Mapa nombre(min)->tipo de todos los ejercicios predefinidos (PLAN_DATA).
  function defaultTypeByName() {
    const map = new Map();
    if (typeof PLAN_DATA === 'undefined') return map;
    PLAN_DATA.days.forEach(d => {
      if (d.isRest || !d.blocks) return;
      d.blocks.forEach(b => b.exercises.forEach(ex => {
        map.set(ex.name.trim().toLowerCase(), classifyType(ex.name, ex.sets));
      }));
    });
    return map;
  }

  // Crea (idempotente) el catálogo de ejercicios predefinidos para un usuario.
  // Devuelve { map: nombre->{id,type}, added }. Los predefinidos llevan isDefault:true.
  async function ensureDefaultExercises(userId) {
    if (typeof PLAN_DATA === 'undefined') return { map: new Map(), added: 0 };
    const existing = await exercisesOf(userId);
    const byName = new Map(existing.map(e => [e.name.trim().toLowerCase(), e]));
    const map = new Map();
    let added = 0;
    for (const d of PLAN_DATA.days) {
      if (d.isRest || !d.blocks) continue;
      for (const b of d.blocks) {
        for (const ex of b.exercises) {
          const key = ex.name.trim().toLowerCase();
          if (map.has(key)) continue;
          if (byName.has(key)) { const e = byName.get(key); map.set(key, { id: e.id, type: e.type }); continue; }
          const type = classifyType(ex.name, ex.sets);
          const rec = { id: uid('ex'), userId, name: ex.name.trim(), muscleGroup: muscleGroupFor(ex.name) || 'General', type, isDefault: true, defaultKey: ex.name.trim(), createdAt: Date.now() };
          await put('exercises', rec);
          added++;
          map.set(key, { id: rec.id, type });
        }
      }
    }
    return { map, added };
  }

  // Agrupa una lista de ejercicios en bloques por categoría (grupo muscular),
  // respetando el orden de primera aparición de cada categoría.
  function groupIntoBlocks(exArray, groupOf) {
    const order = [], groups = {};
    exArray.forEach(ex => {
      const g = groupOf(ex) || 'General';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(ex);
    });
    return order.map(g => ({ label: g, optional: groups[g].length > 0 && groups[g].every(e => e.optional), exercises: groups[g] }));
  }

  // Construye los 7 días por defecto desde PLAN_DATA, con los ejercicios agrupados
  // por categoría individual (Pecho, Hombro, Tríceps, Cardio…), enlazados al catálogo.
  function buildDefaultDays(map) {
    return PLAN_DATA.days.map((d, i) => {
      const day = {
        id: d.id, name: d.name, type: d.type, typeLabel: d.typeLabel,
        focus: d.focus || '', place: d.place || '', placeAccent: !!d.placeAccent,
        duration: d.duration || '', isRest: !!d.isRest, order: i, isDefault: true,
        blocks: [], substitutes: d.substitutes ? d.substitutes.map(s => ({ ...s })) : [],
        substitutesTitle: d.substitutesTitle || '', relatedGuides: d.relatedGuides ? [...d.relatedGuides] : [],
      };
      if (!d.isRest && d.blocks) {
        const flat = [];
        d.blocks.forEach(b => b.exercises.forEach(ex => {
          const m = map.get(ex.name.trim().toLowerCase());
          flat.push({ exerciseId: m ? m.id : null, name: ex.name, sets: ex.sets, type: m ? m.type : classifyType(ex.name, ex.sets), priority: !!ex.priority, optional: !!ex.optional });
        }));
        day.blocks = groupIntoBlocks(flat, e => muscleGroupFor(e.name) || 'General');
      }
      return day;
    });
  }

  const PLAN_NAME = 'Plan CNP María';
  function routineName() { return PLAN_NAME; }

  // ---- Semilla inicial (primer arranque) ----
  async function seedForUser(userId) {
    const { map } = await ensureDefaultExercises(userId);
    const routine = { id: uid('rt'), userId, name: routineName(), days: buildDefaultDays(map), order: 0, createdAt: Date.now(), isPrimary: true };
    await put('routines', routine);
    await seedSubstitutes(userId);
    return routine;
  }

  // Restaura ejercicios predefinidos que falten (no duplica). Devuelve nº añadidos.
  async function restoreDefaultExercises(userId) {
    return (await ensureDefaultExercises(userId)).added;
  }

  // Restaura el plan original sobre la rutina principal (sobreescribe los días).
  async function restoreDefaultRoutine(userId) {
    const { map } = await ensureDefaultExercises(userId);
    let rt = await primaryRoutineOf(userId);
    const days = buildDefaultDays(map);
    if (rt) { rt.days = days; rt.name = rt.name || routineName(); await put('routines', rt); }
    else { rt = { id: uid('rt'), userId, name: routineName(), days, order: 0, createdAt: Date.now(), isPrimary: true }; await put('routines', rt); }
    return rt;
  }

  // Edita un ejercicio y propaga el cambio a toda la app:
  //  - rutinas: actualiza nombre y tipo de las referencias (por exerciseId)
  //  - sesiones: actualiza el nombre (mantiene el tipo/series históricos intactos)
  async function updateExercise(userId, exId, patch) {
    const ex = await get('exercises', exId);
    if (!ex) return null;
    const updated = { ...ex, ...patch };
    await put('exercises', updated);

    const rts = await routinesOf(userId);
    for (const rt of rts) {
      let changed = false;
      (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => {
        if (e.exerciseId === exId) { e.name = updated.name; e.type = updated.type; changed = true; }
      })));
      if (changed) await put('routines', rt);
    }

    const ses = await sessionsOf(userId);
    for (const s of ses) {
      let changed = false;
      (s.entries || []).forEach(e => { if (e.exerciseId === exId) { e.name = updated.name; changed = true; } });
      if (changed) await put('sessions', s);
    }
    return updated;
  }

  // ---- Suplentes predefinidos: parsea PLAN_DATA y los vincula como ejercicios del catálogo ----
  function _tokens(s) { return (s || '').toLowerCase().replace(/[().]/g, ' ').split(/[\s/·,]+/).filter(Boolean); }
  function _bestMatch(orig, names) {
    const ot = _tokens(orig);
    if (!ot.length) return null;
    let best = null, bestScore = 0;
    for (const nm of names) {
      const nt = _tokens(nm);
      let score = 0;
      for (const t of ot) if (nt.some(x => x.startsWith(t) || t.startsWith(x))) score++;
      if (score > bestScore) { bestScore = score; best = nm; }
    }
    return (bestScore >= Math.ceil(ot.length * 0.6) && bestScore >= 1) ? best : null;
  }
  function _splitAlts(sub) { return (sub || '').split(/\s+o\s+/i).map(s => s.trim()).filter(Boolean); }
  function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Idempotente. Vincula suplentes por ejercicio y guarda en la rutina los "Plan B" no mapeables.
  async function seedSubstitutes(userId) {
    if (typeof PLAN_DATA === 'undefined') return;
    const exs = await exercisesOf(userId);
    const byName = new Map(exs.map(e => [e.name.trim().toLowerCase(), e]));
    const ensureAlt = async (name, group, type) => {
      const key = name.trim().toLowerCase();
      if (byName.has(key)) return byName.get(key);
      const rec = { id: uid('ex'), userId, name: _cap(name.trim()), muscleGroup: group || 'General', type: type || 'weight', isDefault: true, defaultKey: _cap(name.trim()), substitutes: [], createdAt: Date.now() };
      await put('exercises', rec);
      byName.set(key, rec);
      return rec;
    };

    const dayPlanB = {};
    for (const d of PLAN_DATA.days) {
      if (!d.substitutes || !d.substitutes.length) continue;
      const dayExNames = (d.blocks || []).flatMap(b => b.exercises.map(e => e.name));
      const leftover = [];
      for (const { orig, sub } of d.substitutes) {
        const matchName = _bestMatch(orig, dayExNames);
        const source = matchName ? byName.get(matchName.trim().toLowerCase()) : null;
        if (!source) { leftover.push({ orig, sub }); continue; }
        source.substitutes = source.substitutes || [];
        for (const alt of _splitAlts(sub)) {
          const altEx = await ensureAlt(alt, source.muscleGroup, source.type);
          if (altEx.id !== source.id && !source.substitutes.includes(altEx.id)) source.substitutes.push(altEx.id);
        }
        await put('exercises', source);
      }
      dayPlanB[d.id] = leftover;
    }

    const rt = await primaryRoutineOf(userId);
    if (rt) {
      (rt.days || []).forEach(d => { if (dayPlanB[d.id]) d.planB = dayPlanB[d.id]; });
      await put('routines', rt);
    }
  }

  // Restaura SOLO un día al plan original (sobreescribe ese día). Devuelve el día o null si no es predefinido.
  async function restoreDefaultDay(userId, dayId) {
    if (typeof PLAN_DATA === 'undefined') return null;
    if (!PLAN_DATA.days.some(d => d.id === dayId)) return null; // no es un día predefinido
    const { map } = await ensureDefaultExercises(userId);
    const rebuilt = buildDefaultDays(map).find(d => d.id === dayId);
    const rt = await primaryRoutineOf(userId);
    if (!rt || !rebuilt) return null;
    const idx = rt.days.findIndex(d => d.id === dayId);
    if (idx === -1) { rebuilt.order = rt.days.length; rt.days.push(rebuilt); }
    else { rebuilt.order = rt.days[idx].order; rt.days[idx] = rebuilt; }
    await put('routines', rt);
    return rebuilt;
  }

  // Migración idempotente: corrige tipos mal puestos en predefinidos y rellena type en rutinas.
  async function migrate() {
    const s = await getSettings();
    if (!s || (s.dataVersion || 0) >= 7) return;
    const defaults = defaultTypeByName();
    const users = await getAll('users');
    for (const u of users) {
      const exs = await exercisesOf(u.id);
      const typeByName = new Map();
      const byId = {}, byName = {};
      for (const e of exs) {
        let needPut = false;
        const dt = defaults.get(e.name.trim().toLowerCase());
        if (dt && e.type === 'weight' && dt !== 'weight') { e.type = dt; needPut = true; }
        if (dt && e.isDefault === undefined) { e.isDefault = true; e.defaultKey = e.name.trim(); needPut = true; }
        const mg = muscleGroupFor(e.name); // grupo individual (solo predefinidos conocidos)
        if (mg && e.muscleGroup !== mg) { e.muscleGroup = mg; needPut = true; }
        if (needPut) await put('exercises', e);
        typeByName.set(e.name.trim().toLowerCase(), e.type);
        byId[e.id] = e; byName[e.name.trim().toLowerCase()] = e;
      }
      // grupo de un ejercicio de día: por catálogo (id/nombre) y, si no, por el mapa
      const groupOf = (ex) => {
        const bi = ex.exerciseId && byId[ex.exerciseId];
        const bn = byName[(ex.name || '').trim().toLowerCase()];
        return (bi && bi.muscleGroup) || (bn && bn.muscleGroup) || muscleGroupFor(ex.name) || 'General';
      };
      const rts = await routinesOf(u.id);
      for (const rt of rts) {
        (rt.days || []).forEach(d => {
          (d.blocks || []).forEach(b => (b.exercises || []).forEach(ex => {
            if (!ex.type) ex.type = typeByName.get((ex.name || '').trim().toLowerCase()) || classifyType(ex.name, ex.sets);
          }));
          // reagrupar bloques por categoría (conserva series, flags y ejercicios añadidos)
          if (!d.isRest && d.blocks && d.blocks.length) {
            const flat = d.blocks.flatMap(b => b.exercises || []);
            if (flat.length) d.blocks = groupIntoBlocks(flat, groupOf);
          }
        });
        // renombrar el plan principal al nombre actual (si conserva el nombre sembrado)
        if (rt.isPrimary && /^Plan CNP/.test(rt.name || '')) rt.name = PLAN_NAME;
        await put('routines', rt);
      }
      await seedSubstitutes(u.id); // vincula suplentes a los ya sembrados (idempotente)
    }
    await saveSettings({ dataVersion: 7 });
  }

  // ---- Consultas por usuario ----
  const exercisesOf = (userId) => byIndex('exercises', 'userId', userId);
  const routinesOf  = (userId) => byIndex('routines', 'userId', userId);
  const sessionsOf  = (userId) => byIndex('sessions', 'userId', userId);
  const progressOf  = (userId) => byIndex('progress', 'userId', userId);
  const journalOf   = (userId) => byIndex('journal', 'userId', userId);

  async function primaryRoutineOf(userId) {
    const rs = await routinesOf(userId);
    rs.sort((a, b) => (a.order || 0) - (b.order || 0));
    return rs.find(r => r.isPrimary) || rs[0] || null;
  }

  return {
    open, uid, todayISO,
    get, getAll, put, del, byIndex, clearStore,
    getSettings, saveSettings,
    getUsers, getMainUser, createUser,
    seedForUser, restoreDefaultExercises, restoreDefaultRoutine, restoreDefaultDay, updateExercise, migrate, classifyType,
    exercisesOf, routinesOf, sessionsOf, progressOf, journalOf, primaryRoutineOf,
    STORES,
  };
})();
