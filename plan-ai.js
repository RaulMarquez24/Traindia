// ============================================================
// PLAN DE ENTRENO DESDE UN DOCUMENTO (con una IA) · beta
// ------------------------------------------------------------
// Igual que en Nutrición: Traindía prepara un texto para una IA (ChatGPT, Gemini,
// Claude…). El usuario se lo da junto con el PDF o las fotos de su plan y la IA
// devuelve un JSON («plan-ia»). Traindía lo valida, enseña lo que ha entendido
// y, si el usuario confirma, crea un plan nuevo con sus días y ejercicios.
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
  const pidioPrompt = () => { try { return localStorage.getItem(PROMPT_KEY) === '1'; } catch (e) { return false; } };
  const marcarPrompt = (on) => { try { if (on) localStorage.setItem(PROMPT_KEY, '1'); else localStorage.removeItem(PROMPT_KEY); } catch (e) {} };

  const str = (v) => (v === null || v === undefined) ? '' : String(v).trim();
  const key = (n) => str(n).toLowerCase();

  // ---------- 1. Pedir el texto para la IA ----------
  async function open(app) {
    const cats = [...new Set([...BASE_CATS, ...(await DB.exercisesOf(app.activeUser.id)).map(e => e.muscleGroup).filter(Boolean)])];
    UI.modal({
      title: 'Plan desde un documento',
      size: 'wide',
      bodyHTML: `
        <p class="modal-text">Traindía te prepara un texto para que se lo des a una IA <strong>junto con el PDF o las fotos del plan de tu entrenador</strong>. La IA te devuelve un archivo que la app entiende y tú revisas antes de guardar.</p>
        <p class="field-hint" style="margin-top:0">Marca lo que aplique a tu caso:</p>
        <div class="metric-opts">
          <label class="metric-opt"><input type="checkbox" data-opt="fotos"><span>Lo tengo en fotos, no en PDF</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="idioma"><span>El documento está en otro idioma</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="tecnica" checked><span>Que añada una nota breve de técnica en cada ejercicio</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="sustitutos" checked><span>Que proponga 1-2 alternativas por ejercicio si el documento no trae</span></label>
        </div>
        <p class="field-hint">Las series, repeticiones, descansos y cargas se copian <strong>tal cual</strong> del documento; lo que no esté claro sale como duda para que lo revises.</p>
        <p class="field-hint">⚠️ Tu documento se sube al servicio de IA que elijas y puede llevar datos personales. El texto le pide que <strong>no los copie</strong> al resultado.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Continuar', kind: 'primary', onClick: (root) => {
          const op = {};
          root.querySelectorAll('[data-opt]').forEach(c => { op[c.dataset.opt] = c.checked; });
          UI.askAI(buildPrompt(op, cats));
          marcarPrompt(true); // al volver, «El plan» ofrece pegar el resultado
        } },
      ],
    });
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
    const dudas = (Array.isArray(p.dudas) ? p.dudas : []).map(str).filter(Boolean);
    const routine = { id: 'ia_plan', name: str(p.nombre) || 'Plan del entrenador', planType: 'custom', dayTypeUnset: true, days,
      source: 'ia', planNotes: notas.length ? notas : undefined, planDuration: str(p.duracion) || undefined, planStart: str(p.inicio) || undefined };
    return { errores, avisos, dudas, notas, routine, exercises, nSes: sesiones.slice(0, 7).length, nEj, nVid: exercises.filter(e => e.videos).length };
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
  function buildPrompt(op, cats) {
    const extra = [];
    if (op.fotos) extra.push('- Te paso FOTOS: puede haber texto torcido o cortado. Si no puedes leer algo con seguridad, NO lo adivines: anótalo en "dudas".');
    if (op.idioma) extra.push('- El documento puede estar en otro idioma: traduce los nombres de los ejercicios al español de gimnasio, pero respeta series, repeticiones, cargas y descansos tal cual.');
    extra.push(op.tecnica
      ? '- Rellena "tecnica" de cada ejercicio con 1-2 frases de las claves de ejecución. Si el documento explica cómo hacerlo, usa eso; si no, usa las claves estándar del ejercicio.'
      : '- Deja "tecnica" vacía salvo que el documento explique cómo se hace el ejercicio.');
    extra.push(op.sustitutos
      ? '- En "sustitutos": primero las alternativas que dé el documento ("A o B"); si no da ninguna, propón 1-2 alternativas habituales del mismo patrón de movimiento (con otro material: mancuernas, máquina, polea o peso corporal).'
      : '- En "sustitutos" pon SOLO las alternativas que dé el propio documento ("A o B").');

    return `Eres un asistente que convierte planes de entrenamiento en un JSON para la app Traindía.
Te adjunto el plan de entrenamiento que me ha preparado mi entrenador.

# CÓMO ME LO TIENES QUE ENTREGAR (importante)
1. Si puedes generar archivos descargables, dame el resultado como un ARCHIVO llamado
   "traindia-plan.json". Es lo que más me facilita las cosas.
2. Además, y siempre, escribe el JSON dentro de un bloque de código \`\`\`json … \`\`\`
   para que pueda copiarlo con el botón de copiar.
3. No escribas nada más: ni resumen, ni explicación, ni comentarios dentro del JSON.

# REGLA MÁS IMPORTANTE
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
No incluyas nombres, teléfonos, correos ni el nombre del entrenador o del centro.

# CÓMO SE ORGANIZA
- Cada día de entrenamiento del documento ("Día 1", "Lunes", "Sesión A"…) es un elemento de "dias",
  en el mismo orden. Si el documento dice qué día de la semana es, ponlo en "diaSemana"
  ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado" o "Domingo"); si no, null.
- Los días de descanso no hace falta ponerlos.
- Dentro de cada día, "secciones" agrupa los ejercicios por CATEGORÍA, en el orden en que se
  hacen. Una categoría puede repetirse en el mismo día si el documento la intercala.
  Usa preferentemente estas categorías: ${cats.join(', ')}.
- Calentamiento, activaciones y movilidad → "Calentamiento" o "Movilidad". Estirar al final → "Estiramientos".
- Correr, series de 400 m, rodajes → "Carrera". Bici, elíptica, cinta → "Cardio".

# CADA EJERCICIO DENTRO DE UN DÍA
- "nombre": nombre corto de gimnasio, en español ("Press banca", "Jalón al pecho", "Remo sentado",
  "Sentadilla", "Hip thrust"). Nada de descripciones largas. El MISMO ejercicio se llama igual en
  todos los días.
- "series": la prescripción corta: "4×12", "3×10-12", "3×Máx", "5×400 m", "10 min", "15-20 min".
  Vacío si no lleva (calentamiento, estiramientos).
- "detalle": lo demás que diga el documento, breve: "Descanso 45 s", "Lastre 7,5 kg · Descanso 3 min",
  "Mantener 2 s arriba", "Alternando piernas, mancuerna 6-8 kg". Máximo unas 15 palabras.
- "etiqueta": opcional, 1-3 palabras para verlo de un vistazo (la variante o la carga: "Lastre 7,5 kg",
  "Sin lastre", "Z2", "Por pierna"). Máximo 18 caracteres.
- "prioritario": true solo si el documento lo destaca como clave (negrita, "importante", "prioridad").
- "opcional": true si el documento dice que es opcional, "si da tiempo" o "hacer algunos de estos".

# LOS EJERCICIOS (catálogo, uno por nombre distinto)
En "ejercicios" pon cada ejercicio UNA vez con:
- "categoria": la misma que su sección.
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

Si el documento NO es un plan de entrenamiento, devuelve {"error":"no-es-un-plan"} y nada más.

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
              { "nombre": "Carrera suave", "series": "10 min", "detalle": "Ritmo suave", "etiqueta": "", "prioritario": false, "opcional": false }
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
      "dudas": []
    }
  }
}

# REGLAS DE FORMATO
- "tipo" del día: déjalo "" salvo que el documento diga la intensidad (entonces "strong", "moderate" o "light").
- Todos los ejercicios de los días tienen que estar también en "ejercicios", con el mismo nombre.
- Deja "dudas" como array vacío solo si de verdad no hay ninguna.

# MI CASO
${extra.join('\n')}

Devuelve únicamente el JSON, en un bloque de código, y como archivo descargable si puedes.`;
  }

  return { open, paste, preview, normalizar, buildPrompt, pidioPrompt, KIND };
})();
