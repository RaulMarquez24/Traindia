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
// ============================================================

const DB = (() => {
  const DB_NAME = 'traindia-db';
  const OLD_DB_NAME = 'cnp-db';   // BD anterior (marca antigua). Se copia UNA vez a la nueva y se CONSERVA intacta como respaldo.
  const MIG_KEY = '__dbmig';      // marcador en 'settings' que confirma que la copia terminó bien
  const DB_VERSION = 3; // v2: 'files' (documentos). v3: 'nutrition' (pauta de alimentación)
  const STORES = {
    settings:  { keyPath: 'key', indexes: [] },
    users:     { keyPath: 'id', indexes: [] },
    exercises: { keyPath: 'id', indexes: ['userId'] },
    routines:  { keyPath: 'id', indexes: ['userId'] },
    sessions:  { keyPath: 'id', indexes: ['userId', 'date'] },
    progress:  { keyPath: 'id', indexes: ['userId', 'date'] },
    files:     { keyPath: 'id', indexes: ['userId'] },   // { id, userId, name, type, size, addedAt, data:ArrayBuffer }
    nutrition: { keyPath: 'id', indexes: ['userId'] },   // pauta de alimentación (ver ESQUEMA en views-nutrition.js)
  };

  let dbPromise = null;

  // Abre la base. Si se pide una versión y otra copia de la app tiene abierta una
  // versión anterior, el navegador BLOQUEA la subida. Antes eso dejaba la promesa
  // sin resolver para siempre (app en blanco). Ahora hay plan B: si no se puede
  // subir de versión, se abre CON LA QUE HAYA. La app funciona igual; como mucho
  // faltará el almacén de documentos hasta que se pueda actualizar.
  function openWith(version, name = DB_NAME) {
    return new Promise((resolve, reject) => {
      const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: def.keyPath });
            def.indexes.forEach(idx => store.createIndex(idx, idx, { unique: false }));
          }
        }
      };
      req.onblocked = () => reject(new Error('BLOCKED'));
      req.onsuccess = () => {
        const db = req.result;
        // Si otra copia pide subir de versión, esta cierra su conexión en vez de bloquearla.
        db.onversionchange = () => { try { db.close(); } catch (e) {} dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  function withTimeout(p, ms, label) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))]);
  }
  // REGLA DE ORO: en el arranque NUNCA se pide una versión concreta.
  // Pedir una subida que otra copia bloquea deja una petición encolada que cuelga
  // TODAS las aperturas siguientes — y sobrevive incluso a recargar la página. Abrir
  // sin versión, en cambio, nunca se bloquea. Si faltan almacenes nuevos, la app
  // arranca igual en modo degradado y la subida se pide aparte, a propósito.
  let dbFallback = false; // true = faltan almacenes nuevos (p. ej. documentos)

  // ---- Copia una-sola-vez de la BD antigua (cnp-db) a la nueva (traindia-db) ----
  // Operaciones sobre un handle concreto (no sobre la BD "oficial") para poder tocar las dos a la vez.
  function rawCount(db, store) {
    return new Promise((resolve) => {
      if (!db.objectStoreNames.contains(store)) return resolve(0);
      const r = db.transaction(store, 'readonly').objectStore(store).count();
      r.onsuccess = () => resolve(r.result || 0); r.onerror = () => resolve(0);
    });
  }
  function rawGetAll(db, store) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(store)) return resolve([]);
      const r = db.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []); r.onerror = () => reject(r.error);
    });
  }
  function rawGet(db, store, key) {
    return new Promise((resolve) => {
      if (!db.objectStoreNames.contains(store)) return resolve(null);
      const r = db.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null);
    });
  }
  function rawPut(db, store, obj) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(obj);
      t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error('abort'));
    });
  }
  // Vuelca todos los registros de un store en UNA transacción (rápido y atómico por store).
  function rawReplaceStore(db, store, records) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite'); const os = t.objectStore(store);
      os.clear();
      records.forEach(rec => os.put(rec));
      t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error('abort'));
    });
  }
  const STORE_NAMES = Object.keys(STORES);

  // Copia cnp-db → traindia-db una sola vez. La antigua NO se modifica ni se borra
  // (queda como respaldo). Solo escribe el marcador MIG_KEY si TODO se copió y verificó,
  // así una copia interrumpida se repite entera en el siguiente arranque (cnp-db es la fuente).
  async function ensureDbRenamed() {
    // 1) ¿Ya migrado? Se mira SIN pedir versión concreta (no puede bloquear).
    let target = await openWith(null); // crea traindia-db si no existía (con sus stores)
    let done = target.objectStoreNames.contains('settings') ? await rawGet(target, 'settings', MIG_KEY) : null;
    if (done) { target.close(); return; }
    target.close();

    // 2) Asegura el esquema completo en la nueva (sube a la versión actual). traindia-db
    // es nueva en esta versión: no hay otra pestaña con ella abierta a otra versión → no bloquea.
    target = await openWith(DB_VERSION);
    try {
      // 3) Mira si la BD antigua tiene datos que copiar.
      let source = await openWith(null, OLD_DB_NAME);
      let oldHasData = false;
      for (const s of STORE_NAMES) { if (await rawCount(source, s) > 0) { oldHasData = true; break; } }

      if (oldHasData) {
        for (const s of STORE_NAMES) {
          if (!source.objectStoreNames.contains(s)) continue;
          const records = await rawGetAll(source, s);
          if (!records.length) continue;
          await rawReplaceStore(target, s, records);   // limpia + reescribe (idempotente ante reintentos)
          const c = await rawCount(target, s);
          if (c !== records.length) { source.close(); throw new Error(`DBMIG_${s}_${c}/${records.length}`); }
        }
      }
      source.close();
      // 4) Marcador final: solo llega aquí si toda la copia (o "no había nada") fue bien.
      await rawPut(target, 'settings', { key: MIG_KEY, done: true, copied: oldHasData, ts: Date.now() });
    } finally {
      target.close();
    }
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = (async () => {
      await ensureDbRenamed(); // copia una-sola-vez cnp-db → traindia-db (conserva la antigua)
      const db = await openWith(null);
      if (db.objectStoreNames.length === 0) {
        // Base recién creada (instalación nueva): aquí sí hay que montar el esquema,
        // y no puede bloquearse porque no hay nada anterior que subir.
        db.close();
        return openWith(DB_VERSION);
      }
      dbFallback = Object.keys(STORES).some(n => !db.objectStoreNames.contains(n));
      return db;
    })();
    dbPromise.catch(() => { dbPromise = null; }); // permite reintentar
    return dbPromise;
  }

  // Sube de versión A PROPÓSITO (lo pide el usuario, avisado de cerrar otras copias).
  // Devuelve true si se completó. Si se bloquea, hay que cerrar las otras copias y recargar.
  async function upgradeNow() {
    const db = await open();
    if (!Object.keys(STORES).some(n => !db.objectStoreNames.contains(n))) return true;
    try { db.close(); } catch (e) {}
    dbPromise = null;
    try {
      const nuevo = await withTimeout(openWith(DB_VERSION), 4000, 'BLOCKED');
      dbPromise = Promise.resolve(nuevo);
      dbFallback = false;
      return true;
    } catch (e) {
      dbPromise = null;
      return false;
    }
  }
  // ¿Existe ese almacén en la base realmente abierta?
  async function hasStore(name) {
    try { return (await open()).objectStoreNames.contains(name); } catch (e) { return false; }
  }
  const isFallback = () => dbFallback;

  function tx(store, mode = 'readonly') {
    return open().then(db => {
      if (!db.objectStoreNames.contains(store)) throw new Error(`NO_STORE:${store}`);
      return db.transaction(store, mode).objectStore(store);
    });
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

  // Vídeos de un ejercicio, normalizados. Un ejercicio nuevo lleva `videos` (lista
  // de {url, label}); los de siempre solo tienen `videoUrl` (un string). Esta función
  // devuelve una lista única para que el resto del código no distinga entre ambos.
  function exVideos(ex) {
    if (ex && Array.isArray(ex.videos) && ex.videos.length) {
      return ex.videos.filter(v => v && v.url);
    }
    return (ex && ex.videoUrl) ? [{ url: ex.videoUrl, label: '' }] : [];
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
    if (/^cinta(\s|$)/.test(n)) return CINTA_METRICS.slice();
    return cardio.some(w => n.includes(w)) ? ['distance', 'kcal', 'time'] : [];
  }
  // Lo que se apunta en la cinta: tiempo total, km y kcal; por serie, velocidad e inclinación.
  const CINTA_METRICS = ['distance', 'kcal', 'time', 'speed', 'incline'];

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

  const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  // 7 días vacíos editables para un plan personalizado (sin guías ni contenido).
  function buildEmptyDays() {
    return WEEKDAYS.map((name, i) => ({
      id: uid('day'), name, type: '', typeLabel: '', // sin tipo: lo marca el usuario
      focus: '', place: '', placeAccent: false, duration: '', isRest: false,
      order: i, blocks: [], substitutes: [], substitutesTitle: '', planB: [], relatedGuides: [],
    }));
  }

  // ---- Plantillas (templates.js) ----
  // Deja en el catálogo del usuario todos los ejercicios que usa la plantilla (y sus
  // suplentes). Reutiliza los que ya tenga con el mismo nombre (su progreso sigue
  // enlazado): solo les añade la técnica si no tenían y los suplentes que falten.
  async function ensureTemplateExercises(userId, tpl) {
    const defs = (typeof TEMPLATES !== 'undefined' && TEMPLATES.EXERCISES) || {};
    const key = (n) => String(n || '').trim().toLowerCase();
    const byName = new Map((await exercisesOf(userId)).map(e => [key(e.name), e]));
    const needed = [];
    const add = (n) => { if (!n || needed.includes(n)) return; needed.push(n); ((defs[n] && defs[n].subs) || []).forEach(add); };
    tpl.days.forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(x => add(x.name))));
    for (const n of needed) {
      const def = defs[n] || {};
      let e = byName.get(key(n));
      if (!e) {
        const type = def.type || classifyType(n, '');
        e = { id: uid('ex'), userId, name: n, muscleGroup: def.group || 'General', type, substitutes: [], createdAt: Date.now() };
        if (def.howto) e.howto = def.howto;
        if (Array.isArray(def.videos) && def.videos.length) { e.videos = def.videos.map(v => ({ ...v })); e.videoUrl = def.videos[0].url; }
        const metrics = Array.isArray(def.metrics) ? def.metrics : defaultMetricsFor(n, type);
        if ((type === 'time' || type === 'check') && Array.isArray(metrics)) e.metrics = metrics.slice();
        await put('exercises', e); byName.set(key(n), e);
      } else {
        // Ya lo tenía: solo se añade lo que le falte (técnica y vídeos), sin pisar nada.
        let touched = false;
        if (def.howto && !e.howto) { e.howto = def.howto; touched = true; }
        const mine = exVideos(e);
        const extra = (def.videos || []).filter(v => !mine.some(m => m.url === v.url));
        if (extra.length) { e.videos = [...mine, ...extra.map(v => ({ ...v }))]; e.videoUrl = e.videos[0].url; touched = true; }
        if (touched) await put('exercises', e);
      }
    }
    for (const n of needed) {
      const subs = (defs[n] && defs[n].subs) || [];
      if (!subs.length) continue;
      const e = byName.get(key(n));
      const mine = e.substitutes || [];
      const extra = subs.map(s => byName.get(key(s))).filter(s => s && s.id !== e.id && !mine.includes(s.id)).map(s => s.id);
      if (extra.length) { e.substitutes = [...mine, ...extra]; await put('exercises', e); }
    }
    return (n) => byName.get(key(n));
  }
  // Catálogo base para un plan en blanco: los ejercicios de las plantillas (nombres de
  // gimnasio, técnica, vídeos y suplentes). Solo CREA los que falten; los que ya
  // existan no se tocan (ni su nombre, ni sus datos, ni sus registros).
  async function ensureBaseCatalog(userId) {
    const defs = (typeof TEMPLATES !== 'undefined' && TEMPLATES.EXERCISES) || {};
    const key = (n) => String(n || '').trim().toLowerCase();
    const byName = new Map((await exercisesOf(userId)).map(e => [key(e.name), e]));
    const created = [];
    for (const n of Object.keys(defs)) {
      if (byName.has(key(n))) continue;
      const def = defs[n];
      const type = def.type || classifyType(n, '');
      const e = { id: uid('ex'), userId, name: n, muscleGroup: def.group || 'General', type, substitutes: [], createdAt: Date.now() };
      if (def.howto) e.howto = def.howto;
      if (Array.isArray(def.videos) && def.videos.length) { e.videos = def.videos.map(v => ({ ...v })); e.videoUrl = def.videos[0].url; }
      if ((type === 'time' || type === 'check') && Array.isArray(def.metrics)) e.metrics = def.metrics.slice();
      byName.set(key(n), e); created.push(e);
    }
    for (const e of created) {
      e.substitutes = ((defs[e.name] && defs[e.name].subs) || []).map(s => byName.get(key(s))).filter(s => s && s.id !== e.id).map(s => s.id);
      await put('exercises', e);
    }
    return created.length;
  }
  function buildTemplateDays(tpl, find) {
    return tpl.days.map((d, i) => ({
      id: uid('day'), name: d.name, type: d.type || '', typeLabel: d.typeLabel || '',
      focus: d.focus || '', place: '', placeAccent: false, duration: d.duration || '',
      isRest: !!d.isRest, order: i, substitutes: [], substitutesTitle: '',
      planB: (d.planB || []).map(p => ({ ...p })), relatedGuides: [...(d.relatedGuides || [])],
      blocks: (d.blocks || []).map(b => ({
        label: b.label, optional: !!b.optional,
        exercises: (b.exercises || []).map(x => {
          const e = find(x.name);
          const row = { exerciseId: e ? e.id : null, name: e ? e.name : x.name, type: e ? e.type : 'weight', sets: x.sets || '', priority: !!x.priority, optional: !!x.optional };
          if (x.notes) row.notes = x.notes;
          if (x.label) row.label = x.label;
          return row;
        }),
      })),
    }));
  }

  // Crea un plan (rutina). type: 'custom' (7 días vacíos) | 'template' (una plantilla de
  // templates.js, con opts.templateId). Si activate, pasa a ser el plan activo.
  async function createPlan(userId, type = 'custom', { name, activate = true, templateId } = {}) {
    const tpl = type === 'template' && typeof TEMPLATES !== 'undefined' ? TEMPLATES.byId(templateId) : null;
    if (type === 'template' && !tpl) throw new Error('Plantilla no encontrada');
    // La plantilla trae su propio catálogo; un plan en blanco, el catálogo base de las plantillas.
    if (!tpl && typeof TEMPLATES !== 'undefined') await ensureBaseCatalog(userId);
    const routine = tpl
      ? { id: uid('rt'), userId, planType: 'template', templateId: tpl.id, name: name || tpl.name,
          days: buildTemplateDays(tpl, await ensureTemplateExercises(userId, tpl)),
          order: Date.now(), createdAt: Date.now(), isPrimary: false, dayTypeUnset: true }
      : { id: uid('rt'), userId, planType: 'custom', name: name || 'Mi plan', days: buildEmptyDays(),
          order: Date.now(), createdAt: Date.now(), isPrimary: false };
    if (activate) {
      const others = await routinesOf(userId);
      for (const r of others) { if (r.isPrimary) { r.isPrimary = false; await put('routines', r); } }
      routine.isPrimary = true;
    }
    await put('routines', routine);
    return routine;
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

  // ---- Nombres del catálogo antiguo → nombres de gimnasio (una sola vez) ----
  // Solo se tocan los ejercicios que se llamen EXACTAMENTE como el nombre antiguo (lo que
  // el usuario ya renombró a mano no cambia). Renombrar cambia también el nombre en los
  // planes y en las sesiones (el historial y los récords siguen juntos). Si ya existe
  // uno con el nombre nuevo, se funden en uno conservando todo. «alsoCreate»: el que
  // iba detrás de la «o» se crea aparte y queda como alternativa.
  const CATALOG_RENAMES = [
    { from: 'Sentadilla o prensa', to: 'Sentadilla', alsoCreate: 'Prensa' },
    { from: 'Press banca o mancuerna', to: 'Press banca', alsoCreate: 'Press con mancuernas' },
    { from: 'Zancadas o búlgaras', to: 'Zancadas', alsoCreate: 'Sentadilla búlgara' },
    { from: 'Remo máquina o sentado', to: 'Remo en máquina', alsoCreate: 'Remo sentado' },
    { from: 'Prensa, hack squat', to: 'Prensa', alsoCreate: 'Sentadilla hack' },
    { from: 'Remo bajo polea', to: 'Remo sentado' },
    { from: 'Polea baja', to: 'Remo sentado' },
    { from: 'Remo máquina cualquiera', to: 'Remo en máquina' },
    { from: 'Remo mancuerna', to: 'Remo con mancuerna' },
    { from: 'Press inclinado mancuerna', to: 'Press inclinado con mancuernas' },
    { from: 'Press inclinado máquina', to: 'Press inclinado en máquina' },
    { from: 'Press militar mancuerna', to: 'Press militar con mancuernas' },
    { from: 'Press máquina hombro', to: 'Press de hombro en máquina' },
    { from: 'Máquina hombro', to: 'Press de hombro en máquina' },
    { from: 'Press máquina pecho', to: 'Press de pecho en máquina' },
    { from: 'Press francés mancuerna', to: 'Press francés' },
    { from: 'Face pull polea', to: 'Face pull' },
    { from: 'Curl bíceps barra', to: 'Curl con barra' },
    { from: 'Curl mancuerna', to: 'Curl con mancuernas' },
    { from: 'Curl cuerda polea', to: 'Curl en polea' },
    { from: 'Curl alterno (sin fallo)', to: 'Curl alterno' },
    { from: 'Tríceps pushdown cuerda', to: 'Extensión de tríceps en polea' },
    { from: 'Tríceps cuerda overhead', to: 'Extensión de tríceps sobre la cabeza' },
    { from: 'Jalón al pecho prono', to: 'Jalón al pecho' },
    { from: 'Dominadas asistidas prono', to: 'Dominadas asistidas' },
    { from: 'Negativas (5-7s)', to: 'Negativas de dominada' },
    { from: 'Pallof press polea', to: 'Pallof press' },
    { from: 'Elev. polea', to: 'Elevación lateral en polea' },
    { from: 'Gemelo', to: 'Gemelos' },
    { from: 'Gemelo prensa', to: 'Gemelos en prensa' },
    { from: 'Static hold mancuernas', to: 'Aguante con mancuernas' },
    { from: 'Landmine', to: 'Landmine press' },
    { from: 'Goblet', to: 'Sentadilla goblet' },
    { from: 'Suspensión supina barra parque', to: 'Suspensión supina' },
    { from: 'Mancuerna', to: 'Curl de muñeca con mancuerna' },

    // v2: carrera del plan antiguo

    { from: "Sem. impar — 5-6×400m R 1:30-2'", to: '5-6×400m' },

    { from: 'Sem. par — 1km test o 2×800m', to: '1km o 2×800m' },
  ];
  // Restos de leer mal el plan antiguo: se borran solo si no se usan en ningún sitio.
  const CATALOG_JUNK = ['Quitarla'];

  async function runCatalogNames() {
    const s = await getSettings();
    if (!s || s.catalogNamesV2) return false;
    const users = await getAll('users');
    const key = (n) => String(n || '').trim().toLowerCase();
    const defs = (typeof TEMPLATES !== 'undefined' && TEMPLATES.EXERCISES) || {};
    // ¿Hay algo que hacer? Si no, solo se marca (sin copia).
    let pending = false;
    for (const u of users) {
      const names = new Set((await exercisesOf(u.id)).map(e => key(e.name)));
      if (CATALOG_RENAMES.some(r => names.has(key(r.from))) || CATALOG_JUNK.some(j => names.has(key(j)))) { pending = true; break; }
    }
    if (pending) await saveInternalBackup('Antes de ordenar los nombres del catálogo');

    for (const u of users) {
      const routines = await routinesOf(u.id);
      const sessions = await sessionsOf(u.id);
      const dirtyR = new Set(), dirtyS = new Set();
      // Cambia en planes y sesiones las referencias de un ejercicio a otro (id y nombre).
      const repoint = (fromEx, toEx) => {
        const match = (e) => (e.exerciseId && e.exerciseId === fromEx.id) || (!e.exerciseId && key(e.name) === key(fromEx.name));
        routines.forEach(rt => (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(e => {
          if (match(e)) { e.exerciseId = toEx.id; e.name = toEx.name; dirtyR.add(rt); }
        }))));
        sessions.forEach(ss => (ss.entries || []).forEach(e => {
          if (match(e)) { e.exerciseId = toEx.id; e.name = toEx.name; dirtyS.add(ss); }
        }));
      };
      const all = await exercisesOf(u.id);
      const byName = new Map(all.map(e => [key(e.name), e]));
      const removed = new Set();
      const makeFromDef = async (name) => {
        const def = defs[name] || {};
        const type = def.type || classifyType(name, '');
        const e = { id: uid('ex'), userId: u.id, name, muscleGroup: def.group || 'General', type, substitutes: [], createdAt: Date.now() };
        if (def.howto) e.howto = def.howto;
        if (Array.isArray(def.videos) && def.videos.length) { e.videos = def.videos.map(v => ({ ...v })); e.videoUrl = def.videos[0].url; }
        if ((type === 'time' || type === 'check') && Array.isArray(def.metrics)) e.metrics = def.metrics.slice();
        await put('exercises', e); byName.set(key(name), e); all.push(e);
        return e;
      };

      for (const r of CATALOG_RENAMES) {
        const from = byName.get(key(r.from));
        if (!from || removed.has(from.id)) continue;
        let to = byName.get(key(r.to));
        if (to && to.id !== from.id) {
          // Fundir: todo lo de «from» pasa a «to» (historial, planes, suplentes).
          repoint(from, to);
          to.substitutes = [...new Set([...(to.substitutes || []), ...(from.substitutes || [])])].filter(x => x !== to.id && x !== from.id);
          if (!to.howto && from.howto) to.howto = from.howto;
          if (!exVideos(to).length && exVideos(from).length) { to.videos = exVideos(from); to.videoUrl = to.videos[0].url; }
          if (!Array.isArray(to.metrics) && Array.isArray(from.metrics)) to.metrics = from.metrics.slice();
          all.forEach(o => { if (o.substitutes && o.substitutes.includes(from.id)) { o.substitutes = [...new Set(o.substitutes.map(x => x === from.id ? to.id : x))].filter(x => x !== o.id); o._dirty = true; } });
          to._dirty = true;
          await del('exercises', from.id); removed.add(from.id); byName.delete(key(r.from));
        } else {
          // Renombrar en su sitio (mismo id): planes y sesiones cambian de nombre.
          const oldName = from.name;
          from.name = r.to;
          repoint({ id: from.id, name: oldName }, from);
          byName.delete(key(r.from)); byName.set(key(r.to), from); from._dirty = true;
          to = from;
        }
        if (r.alsoCreate) {
          const extra = byName.get(key(r.alsoCreate)) || await makeFromDef(r.alsoCreate);
          if (extra.id !== to.id && !(to.substitutes || []).includes(extra.id)) { to.substitutes = [...(to.substitutes || []), extra.id]; to._dirty = true; }
        }
      }
      // Restos sin usar
      for (const j of CATALOG_JUNK) {
        const e = byName.get(key(j));
        if (!e || removed.has(e.id)) continue;
        const usado = routines.some(rt => (rt.days || []).some(d => (d.blocks || []).some(b => (b.exercises || []).some(x => x.exerciseId === e.id))))
          || sessions.some(ss => (ss.entries || []).some(x => x.exerciseId === e.id || key(x.name) === key(j)));
        if (usado) continue;
        await del('exercises', e.id); removed.add(e.id);
        all.forEach(o => { if (o.substitutes && o.substitutes.includes(e.id)) { o.substitutes = o.substitutes.filter(x => x !== e.id); o._dirty = true; } });
      }
      for (const e of all) { if (e._dirty && !removed.has(e.id)) { delete e._dirty; await put('exercises', e); } }
      for (const rt of dirtyR) await put('routines', rt);
      for (const ss of dirtyS) await put('sessions', ss);
    }
    await saveSettings({ catalogNamesV1: true, catalogNamesV2: true });
    return pending;
  }

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
  const IBACKUP_STORES = ['users', 'exercises', 'routines', 'sessions', 'progress', 'nutrition', 'settings'];
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
      try { await clearStore(store); for (const item of (o.data[store] || [])) await put(store, item); } catch (e) {} // tolera stores ausentes (modo degradado)
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
          canon = { id: uid('ex'), userId: u.id, name: c.machine, type: 'time', muscleGroup: 'Cardio', metrics: c.machine === 'Cinta' ? [...new Set([...CINTA_METRICS, ...(e.metrics || [])])] : Array.isArray(e.metrics) ? e.metrics.slice() : ['distance', 'kcal'], substitutes: [], createdAt: Date.now() };
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

  // Variantes de máquina (Cinta Z2…, Bici Z2…) que el plan antiguo volvía a crear tras la
  // unificación: se unen a su máquina con la misma migración (registros → la máquina, la
  // variante pasa a etiqueta de la serie). Solo con la unificación ya aceptada (v10).
  async function cardioVariantsLeft() {
    for (const u of await getAll('users')) {
      const exs = (await exercisesOf(u.id)).filter(e => e.type === 'time');
      if (exs.some(e => { const c = cardioCanon(e.name); return c && (c.label || e.name.trim() !== c.machine); })) return true;
    }
    return false;
  }
  async function tidyCardioVariants() {
    const s = await getSettings();
    if (!s || (s.dataVersion || 0) < 10) return false;
    let hubo = false;
    if (await cardioVariantsLeft()) {
      await saveInternalBackup('Antes de unir las variantes de cinta, bici y elíptica');
      await migrateCardioV10();
      hubo = true;
    }
    // Una vez: la cinta con lo que se apunta en ella (velocidad e inclinación por serie).
    if (!s.cintaMetricsV1) {
      for (const u of await getAll('users')) {
        for (const e of await exercisesOf(u.id)) {
          if (e.type !== 'time' || e.name.trim().toLowerCase() !== 'cinta') continue;
          const m = [...new Set([...(e.metrics || []), ...CINTA_METRICS])];
          if (m.length !== (e.metrics || []).length) { e.metrics = m; await put('exercises', e); hubo = true; }
        }
      }
      await saveSettings({ cintaMetricsV1: true });
    }
    return hubo;
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
    return cardioVariantsLeft();
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

  // Una vez: se retira el plan de inicio antiguo (ya no vive en el código).
  //  - Los planes que nacieron de él se quedan tal cual, como planes personalizados.
  //  - Sus ejercicios predefinidos se quedan solo si se usan: con registros en alguna
  //    sesión o puestos en algún plan (quitarlos rompería ese plan). Los demás se borran.
  //  - Los que se quedan pasan a ser ejercicios normales (editables y borrables).
  async function retireLegacyPlan() {
    const s = await getSettings();
    if (!s || s.legacyPlanRetiredV1) return false;
    const users = await getAll('users');
    let pending = false;
    for (const u of users) {
      if ((await exercisesOf(u.id)).some(e => e.isDefault || e.defaultKey)) { pending = true; break; }
      if ((await routinesOf(u.id)).some(r => !['custom', 'template'].includes(r.planType) || (r.days || []).some(d => d.isDefault))) { pending = true; break; }
    }
    if (pending) await saveInternalBackup('Antes de retirar el plan de inicio');
    const key = (n) => String(n || '').trim().toLowerCase();
    for (const u of users) {
      const routines = await routinesOf(u.id);
      const sessions = await sessionsOf(u.id);
      for (const rt of routines) {
        let ch = false;
        if (!['custom', 'template'].includes(rt.planType)) { rt.planType = 'custom'; rt.dayTypeUnset = true; ch = true; }
        (rt.days || []).forEach(d => { if (d.isDefault) { delete d.isDefault; ch = true; } });
        if (ch) await put('routines', rt);
      }
      const usedIds = new Set(), usedNames = new Set();
      const mark = (x) => { if (x.exerciseId) usedIds.add(x.exerciseId); usedNames.add(key(x.name)); };
      sessions.forEach(ss => (ss.entries || []).forEach(mark));
      routines.forEach(rt => (rt.days || []).forEach(d => (d.blocks || []).forEach(b => (b.exercises || []).forEach(mark))));
      const all = await exercisesOf(u.id);
      const removed = new Set();
      for (const e of all) {
        if (!(e.isDefault || e.defaultKey)) continue;
        if (usedIds.has(e.id) || usedNames.has(key(e.name))) continue;
        await del('exercises', e.id); removed.add(e.id);
      }
      for (const e of all) {
        if (removed.has(e.id)) continue;
        let ch = false;
        if (e.isDefault !== undefined || e.defaultKey !== undefined) { delete e.isDefault; delete e.defaultKey; ch = true; }
        if ((e.substitutes || []).some(id => removed.has(id))) { e.substitutes = e.substitutes.filter(id => !removed.has(id)); ch = true; }
        if (ch) await put('exercises', e);
      }
    }
    await saveSettings({ legacyPlanRetiredV1: true });
    return pending;
  }

  async function migrate() {
    const s = await getSettings();
    if (!s) return;
    // Aditivo, independiente del aviso de unificación (v10): añade 'time' al cardio existente.
    if (!s.cardioTimeMetric) { await addTimeTotalToCardio(); await saveSettings({ cardioTimeMetric: true }); }
    // Una vez: nombres del catálogo antiguo → nombres de gimnasio (con copia interna antes).
    try { await runCatalogNames(); } catch (e) { console.error('runCatalogNames', e); }
    try { await tidyCardioVariants(); } catch (e) { console.error('tidyCardioVariants', e); }
    try { await retireLegacyPlan(); } catch (e) { console.error('retireLegacyPlan', e); }
    const v = s.dataVersion || 0;
    if (v >= 9) return; // la unificación de cardio (v10) la lanza la app aparte (con aviso)
    const users = await getAll('users');
    for (const u of users) {
      const exs = await exercisesOf(u.id);
      const typeByName = new Map();
      const byId = {}, byName = {};
      for (const e of exs) {
        let needPut = false;
        // datos a registrar por defecto en ejercicios de tiempo (v9)
        if (e.type === 'time' && e.metrics === undefined) { e.metrics = defaultMetricsFor(e.name, 'time'); needPut = true; }
        if (needPut) await put('exercises', e);
        typeByName.set(e.name.trim().toLowerCase(), e.type);
        byId[e.id] = e; byName[e.name.trim().toLowerCase()] = e;
      }
      // grupo de un ejercicio de día: por catálogo (id/nombre)
      const groupOf = (ex) => {
        const bi = ex.exerciseId && byId[ex.exerciseId];
        const bn = byName[(ex.name || '').trim().toLowerCase()];
        return (bi && bi.muscleGroup) || (bn && bn.muscleGroup) || 'General';
      };
      const rts = await routinesOf(u.id);
      for (const rt of rts) {
        (rt.days || []).forEach(d => {
          (d.blocks || []).forEach(b => (b.exercises || []).forEach(ex => {
            if (!ex.type) ex.type = typeByName.get((ex.name || '').trim().toLowerCase()) || classifyType(ex.name, ex.sets);
          }));
          // reagrupar bloques por categoría (conserva series, flags y ejercicios añadidos)
          // (no en plantillas: sus secciones van por función —fuerza principal, accesorios…— y en orden)
          if (!d.isRest && d.blocks && d.blocks.length && rt.planType !== 'template') {
            const flat = d.blocks.flatMap(b => b.exercises || []);
            if (flat.length) d.blocks = groupIntoBlocks(flat, groupOf);
          }
        });
        // (antes se renombraba aquí el plan principal: pisaba el nombre que hubiera puesto el usuario)
        if (!rt.planType) { rt.planType = 'custom'; }
        await put('routines', rt);
      }
      // garantizar exactamente un plan activo por usuario
      const after = await routinesOf(u.id);
      if (after.length && !after.some(r => r.isPrimary)) {
        after.sort((a, b) => (a.order || 0) - (b.order || 0));
        after[0].isPrimary = true; await put('routines', after[0]);
      }
    }
    await saveSettings({ dataVersion: 9 });
  }

  // ---- Consultas por usuario ----
  async function filesOf(userId) {
    if (!(await hasStore('files'))) return []; // sin subir de versión aún: sin documentos
    return byIndex('files', 'userId', userId);
  }
  // Guarda un documento (PDF, imagen…) como ArrayBuffer, para consultarlo sin conexión.
  // ---- Nutrición: una pauta activa por usuario (se guardan varias, manda isPrimary) ----
  async function nutritionOf(userId) {
    if (!(await hasStore('nutrition'))) return [];
    return byIndex('nutrition', 'userId', userId);
  }
  async function primaryNutritionOf(userId) {
    const all = await nutritionOf(userId);
    if (!all.length) return null;
    return all.find(p => p.isPrimary) || all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  }
  async function saveNutrition(plan) {
    if (!(await hasStore('nutrition'))) throw new Error('NO_STORE:nutrition');
    return put('nutrition', plan);
  }

  async function addFile(userId, { name, type, size, data }) {
    if (!(await hasStore('files'))) throw new Error('Cierra las demás copias de Traindía y recarga para poder guardar documentos.');
    const rec = { id: uid('file'), userId, name, type: type || '', size: size || 0, addedAt: Date.now(), data };
    await put('files', rec);
    return rec;
  }
  const exercisesOf = (userId) => byIndex('exercises', 'userId', userId);
  const routinesOf  = (userId) => byIndex('routines', 'userId', userId);
  const sessionsOf  = (userId) => byIndex('sessions', 'userId', userId);
  const progressOf  = (userId) => byIndex('progress', 'userId', userId);

  async function primaryRoutineOf(userId) {
    const rs = await routinesOf(userId);
    rs.sort((a, b) => (a.order || 0) - (b.order || 0));
    return rs.find(r => r.isPrimary) || rs[0] || null;
  }

  return {
    open, uid, todayISO, exVideos,
    get, getAll, put, del, byIndex, clearStore,
    getSettings, saveSettings,
    getPlaces, savePlaces, ensurePlaces,
    getUsers, getMainUser, createUser,
    createPlan, ensureTemplateExercises, runCatalogNames, tidyCardioVariants, retireLegacyPlan, setActivePlan, deletePlan, updateExercise, migrate, runCardioUnify, cardioUnifyPending, classifyType,
    saveInternalBackup, listInternalBackups, deleteInternalBackup, restoreInternalBackup,
    filesOf, addFile, hasStore, isFallback, upgradeNow,
    nutritionOf, primaryNutritionOf, saveNutrition,
    exercisesOf, routinesOf, sessionsOf, progressOf, primaryRoutineOf,
    STORES,
  };
})();
