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
  const DB_VERSION = 2; // v2: store 'files' (documentos adjuntos: PDF del fisio, fotos…)
  const STORES = {
    settings:  { keyPath: 'key', indexes: [] },
    users:     { keyPath: 'id', indexes: [] },
    exercises: { keyPath: 'id', indexes: ['userId'] },
    routines:  { keyPath: 'id', indexes: ['userId'] },
    sessions:  { keyPath: 'id', indexes: ['userId', 'date'] },
    progress:  { keyPath: 'id', indexes: ['userId', 'date'] },
    journal:   { keyPath: 'id', indexes: ['userId', 'date'] },
    files:     { keyPath: 'id', indexes: ['userId'] },   // { id, userId, name, type, size, addedAt, data:ArrayBuffer }
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

  // ---- Lugares de entreno (en settings: [{name, special}]) ----
  async function getPlaces() {
    const s = await getSettings();
    return (s && Array.isArray(s.places)) ? s.places : [];
  }
  async function savePlaces(list) { await saveSettings({ places: list }); return list; }
  // Siembra la lista de lugares desde los días de la rutina si aún no existe.
  async function ensurePlaces(routine) {
    const s = await getSettings();
    if (s && Array.isArray(s.places)) return s.places;
    const map = new Map();
    (routine?.days || []).forEach(d => {
      const p = (d.place || '').trim();
      if (!p || p === '— libre —') return;
      const k = p.toLowerCase();
      if (!map.has(k)) map.set(k, { name: p, special: !!d.placeAccent });
      else if (d.placeAccent) map.get(k).special = true;
    });
    const list = [...map.values()];
    await savePlaces(list);
    return list;
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

  // Datos a registrar por defecto de un ejercicio de tiempo: cardio (cinta, bici,
  // carrera, z2…) lleva distancia+kcal; isométricos/movilidad/agilidad solo tiempo.
  function defaultMetricsFor(name, type) {
    if (type !== 'time') return undefined;
    const n = (name || '').toLowerCase();
    const cardio = ['cinta', 'bici', 'elíptic', 'eliptic', 'carrera', 'trote', 'paseo', 'z2', '400m', '800m', 'km', 'metros'];
    return cardio.some(w => n.includes(w)) ? ['distance', 'kcal', 'time'] : [];
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
          const metrics = defaultMetricsFor(ex.name, type);
          const rec = { id: uid('ex'), userId, name: ex.name.trim(), muscleGroup: muscleGroupFor(ex.name) || 'General', type, isDefault: true, defaultKey: ex.name.trim(), createdAt: Date.now() };
          if (metrics) rec.metrics = metrics;
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

  // Nombre genérico: es una plantilla para cualquiera, no el plan de una persona.
  const PLAN_NAME = 'Plan CNP';
  function routineName() { return PLAN_NAME; }

  const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const TYPE_LABELS_DB = { strong: 'Día fuerte', moderate: 'Día moderado', light: 'Día ligero', rest: 'Descanso' };
  // 7 días vacíos editables para un plan personalizado (sin guías ni contenido CNP).
  function buildEmptyDays() {
    return WEEKDAYS.map((name, i) => ({
      id: uid('day'), name, type: 'moderate', typeLabel: TYPE_LABELS_DB.moderate,
      focus: '', place: '', placeAccent: false, duration: '', isRest: false,
      order: i, blocks: [], substitutes: [], substitutesTitle: '', planB: [], relatedGuides: [],
    }));
  }

  // Crea un plan (rutina). type: 'cnp' (todo el contenido) | 'custom' (7 días vacíos).
  // Ambos conservan el catálogo de ejercicios. Si activate, pasa a ser el plan activo.
  async function createPlan(userId, type = 'cnp', { name, activate = true } = {}) {
    const { map } = await ensureDefaultExercises(userId);
    const isCustom = type === 'custom';
    const routine = {
      id: uid('rt'), userId, planType: isCustom ? 'custom' : 'cnp',
      name: name || (isCustom ? 'Mi plan' : routineName()),
      days: isCustom ? buildEmptyDays() : buildDefaultDays(map),
      order: Date.now(), createdAt: Date.now(), isPrimary: false,
    };
    if (activate) {
      const others = await routinesOf(userId);
      for (const r of others) { if (r.isPrimary) { r.isPrimary = false; await put('routines', r); } }
      routine.isPrimary = true;
    }
    await put('routines', routine);
    if (!isCustom) await seedSubstitutes(userId);
    return routine;
  }

  // ---- Semilla inicial (primer arranque) — envoltura CNP por compatibilidad ----
  async function seedForUser(userId) {
    return createPlan(userId, 'cnp', { activate: true });
  }

  // Conmuta el plan activo (mueve el flag isPrimary).
  async function setActivePlan(userId, routineId) {
    const rts = await routinesOf(userId);
    for (const r of rts) {
      const should = r.id === routineId;
      if (!!r.isPrimary !== should) { r.isPrimary = should; await put('routines', r); }
    }
  }

  // Elimina un plan (rutina). No toca sesiones ni progreso.
  async function deletePlan(routineId) {
    return del('routines', routineId);
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
      const m = defaultMetricsFor(rec.name, rec.type); if (m) rec.metrics = m;
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
  // ---- Unificación de cardio (v10): Cinta*/Bici*/Elíptic* → una máquina + etiqueta ----
  const CARDIO_FAMILIES = [
    { re: /^cinta\b\s*/i, machine: 'Cinta' },
    { re: /^bici\w*\s*/i, machine: 'Bicicleta' },
    { re: /^el[ií]ptic\w*\s*/i, machine: 'Elíptica' },
  ];
  function cardioCanon(name) {
    const n = (name || '').trim();
    for (const f of CARDIO_FAMILIES) {
      if (f.re.test(n)) return { machine: f.machine, label: n.replace(f.re, '').trim() };
    }
    return null;
  }
  // ---- Copias internas (localStorage; máx 2 para no ocupar espacio) ----
  const IBACKUP_PREFIX = 'traindia-ibackup-';
  const IBACKUP_STORES = ['users', 'exercises', 'routines', 'sessions', 'progress', 'journal', 'settings'];
  const MAX_IBACKUPS = 2;
  async function dumpAll() {
    const d = {};
    for (const store of IBACKUP_STORES) { try { d[store] = await getAll(store); } catch (e) { d[store] = []; } }
    return d;
  }
  function internalBackupKeys() {
    return Object.keys(localStorage).filter(k => k.startsWith(IBACKUP_PREFIX)).sort();
  }
  function listInternalBackups() {
    return internalBackupKeys().map(k => {
      let at = 0, reason = ''; const raw = localStorage.getItem(k) || '';
      try { const o = JSON.parse(raw); at = o.at || 0; reason = o.reason || ''; } catch (e) {}
      return { key: k, at, reason, sizeKB: Math.round(raw.length / 1024) };
    }).sort((a, b) => b.at - a.at);
  }
  // Crea una copia interna; mantiene como mucho MAX_IBACKUPS (borra las más viejas).
  async function saveInternalBackup(reason) {
    const dump = await dumpAll();
    const payload = JSON.stringify({ at: Date.now(), reason: reason || '', data: dump });
    const write = () => { localStorage.setItem(IBACKUP_PREFIX + Date.now(), payload); };
    try {
      let keys = internalBackupKeys();
      while (keys.length >= MAX_IBACKUPS) localStorage.removeItem(keys.shift());
      write();
      return true;
    } catch (e) {
      try { internalBackupKeys().forEach(k => localStorage.removeItem(k)); write(); return true; } // sin espacio: deja solo esta
      catch (e2) { return false; }
    }
  }
  function deleteInternalBackup(key) { localStorage.removeItem(key); }
  // Restaura por completo desde una copia interna (reemplaza todos los stores).
  async function restoreInternalBackup(key) {
    let o; try { o = JSON.parse(localStorage.getItem(key)); } catch (e) { return false; }
    if (!o || !o.data) return false;
    for (const store of IBACKUP_STORES) {
      await clearStore(store);
      for (const item of (o.data[store] || [])) await put(store, item);
    }
    return true;
  }
  async function migrateCardioV10() {
    const users = await getAll('users');
    for (const u of users) {
      const exs = (await exercisesOf(u.id)).filter(e => e.type === 'time');
      const canonByMachine = {}; // machine -> ejercicio canónico
      // los que ya son exactamente el nombre-máquina son canónicos (p.ej. Elíptica)
      exs.forEach(e => { const c = cardioCanon(e.name); if (c && !c.label && e.name.trim() === c.machine) canonByMachine[c.machine] = e; });
      const idMap = {}; // idVariante -> idCanónico
      for (const e of exs) {
        const c = cardioCanon(e.name); if (!c) continue;
        let canon = canonByMachine[c.machine];
        if (!canon) {
          canon = { id: uid('ex'), userId: u.id, name: c.machine, type: 'time', muscleGroup: 'Cardio', metrics: Array.isArray(e.metrics) ? e.metrics.slice() : ['distance', 'kcal'], substitutes: [], isDefault: true, defaultKey: c.machine, createdAt: Date.now() };
          canonByMachine[c.machine] = canon;
        } else if (Array.isArray(e.metrics)) {
          canon.metrics = [...new Set([...(canon.metrics || []), ...e.metrics])];
        }
        if (e.id !== canon.id) idMap[e.id] = canon.id;
      }
      for (const m in canonByMachine) await put('exercises', canonByMachine[m]);
      const removed = new Set(Object.keys(idMap));
      // mapa nombre viejo -> {machine,label}
      const byName = {}; exs.forEach(e => { const c = cardioCanon(e.name); if (c) byName[e.name.trim().toLowerCase()] = c; });
      // sesiones: renombrar entry, reapuntar id, métricas del canónico, etiqueta en series sin etiqueta
      for (const s of await sessionsOf(u.id)) {
        let ch = false;
        (s.entries || []).forEach(en => {
          const c = byName[(en.name || '').trim().toLowerCase()]; if (!c) return;
          en.name = c.machine;
          const canon = canonByMachine[c.machine];
          en.exerciseId = (en.exerciseId && idMap[en.exerciseId]) || (canon && canon.id) || en.exerciseId;
          if (canon) en.metrics = canon.metrics.slice();
          if (c.label) (en.sets || []).forEach(st => { if (!st.label) st.label = c.label; });
          ch = true;
        });
        if (ch) await put('sessions', s);
      }
      // rutinas (plan): repoint + etiqueta en el bloque
      for (const rt of await routinesOf(u.id)) {
        let ch = false;
        (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(ex => {
          const c = byName[(ex.name || '').trim().toLowerCase()]; if (!c) return;
          ex.name = c.machine;
          const canon = canonByMachine[c.machine];
          ex.exerciseId = (ex.exerciseId && idMap[ex.exerciseId]) || (canon && canon.id) || ex.exerciseId;
          if (c.label && !ex.label) ex.label = c.label;
          ch = true;
        })));
        if (ch) await put('routines', rt);
      }
      // reapuntar suplentes y borrar variantes
      for (const e of await exercisesOf(u.id)) {
        if (removed.has(e.id) || !(e.substitutes || []).length) continue;
        const subs = [...new Set(e.substitutes.map(sid => idMap[sid] || sid).filter(sid => sid !== e.id && !removed.has(sid)))];
        if (subs.join() !== e.substitutes.join()) { e.substitutes = subs; await put('exercises', e); }
      }
      for (const id of removed) await del('exercises', id);
    }
  }

  // Unificación de cardio: la dispara la app TRAS avisar al usuario (copia + confirmar).
  async function runCardioUnify() {
    await saveInternalBackup('Antes de unificar cardio');
    await migrateCardioV10();
    await saveSettings({ dataVersion: 10 });
  }
  // ¿Hay variantes de cardio que cambiarían? (para decidir si avisar).
  async function cardioUnifyPending() {
    const s = await getSettings();
    if (!s || (s.dataVersion || 0) >= 10) return false;
    for (const u of await getAll('users')) {
      const exs = (await exercisesOf(u.id)).filter(e => e.type === 'time');
      if (exs.some(e => { const c = cardioCanon(e.name); return c && (c.label || e.name.trim() !== c.machine); })) return true;
    }
    return false;
  }

  // Aditivo e inofensivo: marca 'time' (tiempo total opcional) en el cardio que ya
  // existía, para que siga mostrando el total como antes. Idempotente. No toca los
  // ejercicios de tiempo "pelados" (plancha/hang), que no llevan totales.
  async function addTimeTotalToCardio() {
    const hasDK = (m) => Array.isArray(m) && (m.includes('distance') || m.includes('kcal')) && !m.includes('time');
    const users = await getAll('users');
    for (const u of users) {
      for (const e of await exercisesOf(u.id)) {
        if (e.type === 'time' && hasDK(e.metrics)) { e.metrics = [...e.metrics, 'time']; await put('exercises', e); }
      }
      for (const sess of await sessionsOf(u.id)) {
        let ch = false;
        (sess.entries || []).forEach(en => { if (en.type === 'time' && hasDK(en.metrics)) { en.metrics = [...en.metrics, 'time']; ch = true; } });
        if (ch) await put('sessions', sess);
      }
    }
  }

  async function migrate() {
    const s = await getSettings();
    if (!s) return;
    // Aditivo, independiente del aviso de unificación (v10): añade 'time' al cardio existente.
    if (!s.cardioTimeMetric) { await addTimeTotalToCardio(); await saveSettings({ cardioTimeMetric: true }); }
    const v = s.dataVersion || 0;
    if (v >= 9) return; // la unificación de cardio (v10) la lanza la app aparte (con aviso)
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
        // datos a registrar por defecto en ejercicios de tiempo (v9)
        if (e.type === 'time' && e.metrics === undefined) { e.metrics = defaultMetricsFor(e.name, 'time'); needPut = true; }
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
        // (antes se renombraba aquí el plan principal: pisaba el nombre que hubiera puesto el usuario)
        // tipo de plan: las rutinas antiguas son el plan CNP
        if (!rt.planType) { rt.planType = 'cnp'; }
        await put('routines', rt);
      }
      // garantizar exactamente un plan activo por usuario
      const after = await routinesOf(u.id);
      if (after.length && !after.some(r => r.isPrimary)) {
        after.sort((a, b) => (a.order || 0) - (b.order || 0));
        after[0].isPrimary = true; await put('routines', after[0]);
      }
      await seedSubstitutes(u.id); // vincula suplentes a los ya sembrados (idempotente)
    }
    await saveSettings({ dataVersion: 9 });
  }

  // ---- Consultas por usuario ----
  const filesOf = (userId) => byIndex('files', 'userId', userId);
  // Guarda un documento (PDF, imagen…) como ArrayBuffer, para consultarlo sin conexión.
  async function addFile(userId, { name, type, size, data }) {
    const rec = { id: uid('file'), userId, name, type: type || '', size: size || 0, addedAt: Date.now(), data };
    await put('files', rec);
    return rec;
  }
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
    getPlaces, savePlaces, ensurePlaces,
    getUsers, getMainUser, createUser,
    seedForUser, createPlan, setActivePlan, deletePlan, restoreDefaultExercises, restoreDefaultRoutine, restoreDefaultDay, updateExercise, migrate, runCardioUnify, cardioUnifyPending, classifyType,
    saveInternalBackup, listInternalBackups, deleteInternalBackup, restoreInternalBackup,
    filesOf, addFile,
    exercisesOf, routinesOf, sessionsOf, progressOf, journalOf, primaryRoutineOf,
    STORES,
  };
})();
