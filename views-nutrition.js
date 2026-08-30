// ============================================================
// VISTA: Nutrición — qué te toca comer hoy y qué puedes cocinar
// ============================================================
// PRINCIPIO: la PAUTA manda (te la da tu nutricionista) y las recetas cuelgan
// de ella. Un risotto y un puchero no son dos dietas: son dos maneras de
// comerte los mismos 75 g de arroz.
//
// ESQUEMA DE LA PAUTA (schemaVersion 1) — es a la vez el formato interno, el de
// compartir entre perfiles y el que devuelve la IA al importar un documento.
// Diseñado para cubrir 5 arquetipos: intercambios, menú semanal, raciones,
// recetario y (fuera de alcance) macros.
//
// {
//   id, userId, isPrimary, createdAt,
//   schemaVersion: 1,
//   nombre: 'Plan de …',
//   tipoDetectado: 'intercambios' | 'menu-semanal' | 'raciones' | 'recetario' | 'otro',
//   variantes: [                       // cómo cambian las cantidades según el día
//     { id, nombre: 'Día de entreno',
//       match: { porTipoDia: ['strong','moderate'] }   // tipos del plan de entreno
//            | { porDiaSemana: [1,2] }                 // 1 = lunes … 7 = domingo
//            | null }                                  // solo manual
//   ],
//   tomas: [                           // desayuno, media mañana, almuerzo…
//     { id, nombre, orden,
//       opciones: [                    // alternativas de toma completa: eliges UNA
//         { id, nombre,
//           grupos: [                  // las "ranuras" del plato
//             { id, nombre: 'Hidrato',
//               alternativas: [        // alimentos intercambiables entre sí
//                 { alimento: 'Arroz integral',
//                   cantidades: {      // por id de variante
//                     v_ent: { valor: 75, unidad: 'g', nota: 'en crudo',
//                              equivale: '225 g cocido' } } } ] } ] } ] }
//   ],
//   reglas: [ { texto, aplicaA: [idToma] } ],   // "ensalada en comida y cena"
//   suplementos: [ { nombre, cantidad, nota } ],
//   dudas: [ 'texto' ],                          // lo que la IA no vio claro
// }
//
// Una receta corriente es una opción donde cada grupo tiene UNA alternativa:
// no se paga complejidad por adelantado.

const VNutrition = (() => {

  const SCHEMA_VERSION = 1;
  const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  // ---------- utilidades de lectura ----------
  function cantidadTexto(alt, varianteId) {
    const c = (alt.cantidades || {})[varianteId] || (alt.cantidades || {})[Object.keys(alt.cantidades || {})[0]];
    if (!c) return '';
    const val = (c.valor === null || c.valor === undefined || c.valor === '') ? '' : c.valor;
    let t = [val, c.unidad].filter(x => x !== '' && x != null).join(' ').trim();
    if (!t) t = c.texto || '';
    if (c.nota) t += ` ${c.nota}`;
    return t.trim();
  }
  // ¿Qué variante toca hoy? Se mira el plan de entreno; si no encaja, la primera.
  function varianteDeHoy(plan, app) {
    const vs = plan.variantes || [];
    if (!vs.length) return null;
    const hoyIdx = ((new Date().getDay() + 6) % 7) + 1; // 1 = lunes
    const dia = diaDelPlan(app, hoyIdx);
    const porTipo = dia && vs.find(v => v.match && Array.isArray(v.match.porTipoDia) && v.match.porTipoDia.includes(dia.type));
    if (porTipo) return porTipo;
    const porDia = vs.find(v => v.match && Array.isArray(v.match.porDiaSemana) && v.match.porDiaSemana.includes(hoyIdx));
    if (porDia) return porDia;
    return vs[0];
  }
  function diaDelPlan(app, hoyIdx) {
    const days = (app.routine && app.routine.days) || [];
    if (!days.length) return null;
    const nombre = DIAS[hoyIdx];
    return days.find(d => (d.name || '').trim().toLowerCase() === nombre) || null;
  }

  // ---------- estado de la vista ----------
  let _plan = null;
  let _varianteId = null;   // variante elegida a mano (manda sobre la automática)
  let _abierta = {};        // idToma -> idOpcion elegida
  let _elegido = {};        // `${idToma}|${idGrupo}` -> nombre de alimento

  async function render(app) {
    if (!(await DB.hasStore('nutrition'))) return prepararHTML();
    _plan = await DB.primaryNutritionOf(app.activeUser.id);
    if (!_plan) return vacioHTML();
    return planHTML(app);
  }

  // La ampliación del almacén se hace a propósito (ver db.js: nunca en el arranque).
  function prepararHTML() {
    return `<div class="section">
      <p class="section-intro">Para usar Nutrición hay que ampliar el almacén de la app. Solo puede hacerse si <strong>Traindía no está abierta en ningún otro sitio</strong>: cierra las demás pestañas y la app de la pantalla de inicio.</p>
      <button class="btn primary block" id="nutPrep">${UI.icon('refresh', 15)} Preparar Nutrición</button>
      <p class="section-intro dim">El resto de la app funciona con normalidad; tus datos están intactos.</p>
    </div>`;
  }

  function vacioHTML() {
    return `<div class="section">
      <p class="section-intro">Aquí verás <strong>lo que te toca comer hoy</strong>, con las cantidades del día que sea, y los platos que hayas ido guardando para esas medidas.</p>
      <button class="btn primary block" id="nutImport">${UI.icon('chat', 15)} Crear desde un documento <span class="beta-tag">beta</span></button>
      <p class="field-hint">Con el PDF o las fotos de tu dieta y la ayuda de una IA. Tú hablas con la IA; Traindía no envía nada por su cuenta.</p>
      <div class="empty-state"><p class="dim">Todavía no has creado tu pauta.</p></div>
    </div>`;
  }

  function planHTML(app) {
    const vs = _plan.variantes || [];
    const auto = varianteDeHoy(_plan, app);
    const vId = _varianteId || (auto && auto.id) || (vs[0] && vs[0].id);
    const v = vs.find(x => x.id === vId) || vs[0];

    const tomas = (_plan.tomas || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const cuerpo = tomas.map(t => tomaHTML(t, vId)).join('');

    const reglas = (_plan.reglas || []).length
      ? `<div class="nut-reglas"><div class="card-label">A tener en cuenta</div><ul>${_plan.reglas.map(r => `<li>${UI.esc(r.texto)}</li>`).join('')}</ul></div>` : '';
    const sup = (_plan.suplementos || []).length
      ? `<div class="nut-reglas"><div class="card-label">Suplementación</div><ul>${_plan.suplementos.map(x => `<li><strong>${UI.esc(x.nombre)}</strong>${x.cantidad ? ` · ${UI.esc(x.cantidad)}` : ''}${x.nota ? ` <span class="dim">${UI.esc(x.nota)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
    const dudas = (_plan.dudas || []).length
      ? `<div class="nut-dudas"><div class="card-label">Dudas al importar</div><ul>${_plan.dudas.map(d => `<li>${UI.esc(d)}</li>`).join('')}</ul><p class="field-hint">Revísalo con tu documento delante y corrígelo si hace falta.</p></div>` : '';

    return `<div class="section">
      <div class="nut-head">
        <div class="nut-head-txt"><strong>${UI.esc(_plan.nombre || 'Mi pauta')}</strong><span class="dim">${UI.esc(UI.fmtDate(DB.todayISO()))}</span></div>
        ${vs.length > 1 ? `<button class="nut-variant" id="nutVariant">${UI.esc(v ? v.nombre : '')} ▾</button>` : (v ? `<span class="nut-variant static">${UI.esc(v.nombre)}</span>` : '')}
      </div>
      ${cuerpo || '<div class="empty-state"><p class="dim">La pauta no tiene tomas.</p></div>'}
      ${reglas}${sup}${dudas}
      <div class="detail-toolbar">
        <button class="btn ghost" id="nutImport">${UI.icon('chat', 15)} Reimportar <span class="beta-tag">beta</span></button>
        <button class="btn ghost" id="nutShare">${UI.icon('upload', 15)} Compartir</button>
        <button class="btn ghost danger" id="nutDel">${UI.icon('trash', 15)} Borrar pauta</button>
      </div>
    </div>`;
  }

  function tomaHTML(t, vId) {
    const ops = t.opciones || [];
    if (!ops.length) return '';
    const opId = _abierta[t.id] || ops[0].id;
    const op = ops.find(o => o.id === opId) || ops[0];
    const tabs = ops.length > 1
      ? `<div class="nut-ops">${ops.map(o => `<button class="nut-op${o.id === op.id ? ' sel' : ''}" data-toma="${UI.esc(t.id)}" data-op="${UI.esc(o.id)}">${UI.esc(o.nombre || 'Opción')}</button>`).join('')}</div>`
      : '';
    const filas = (op.grupos || []).map(g => {
      const alts = g.alternativas || [];
      if (!alts.length) return '';
      const key = `${t.id}|${g.id}`;
      const elegido = alts.find(a => a.alimento === _elegido[key]) || alts[0];
      const otras = alts.filter(a => a !== elegido);
      return `<div class="nut-row">
        <div class="nut-line">
          <span class="nut-food">${UI.esc(elegido.alimento)}</span>
          <span class="nut-dots"></span>
          <span class="nut-qty">${UI.esc(cantidadTexto(elegido, vId) || '—')}</span>
        </div>
        ${(elegido.cantidades && elegido.cantidades[vId] && elegido.cantidades[vId].equivale) ? `<div class="nut-eq">≡ ${UI.esc(elegido.cantidades[vId].equivale)}</div>` : ''}
        ${otras.length ? `<div class="nut-swap">⇄ ${otras.map(a => `<button class="nut-alt" data-key="${UI.esc(key)}" data-alt="${UI.esc(a.alimento)}">${UI.esc(a.alimento)}</button>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="nut-toma">
      <div class="nut-toma-lbl">${UI.esc(t.nombre)}</div>
      ${tabs}
      ${filas}
    </div>`;
  }

  // ---------- enganches ----------
  function bind(app, root) {
    const prep = root.querySelector('#nutPrep');
    if (prep) prep.addEventListener('click', async () => {
      prep.disabled = true; prep.textContent = 'Preparando…';
      const ok = await DB.upgradeNow();
      if (ok) { UI.toast('Nutrición lista'); app.render(); return; }
      UI.modal({
        title: 'Sigue abierta en otro sitio',
        bodyHTML: `<p class="modal-text">No se ha podido ampliar el almacén porque Traindía sigue abierta en otro lado.</p>
          <p class="modal-text dim">Cierra las demás pestañas y la app de la pantalla de inicio, y vuelve a intentarlo. Tus datos no corren ningún riesgo.</p>`,
        actions: [{ label: 'Entendido', kind: 'primary', onClick: () => location.reload() }],
      });
    });

    root.querySelectorAll('#nutImport').forEach(b => b.addEventListener('click', () => importarFlow(app)));

    const variant = root.querySelector('#nutVariant');
    if (variant) variant.addEventListener('click', () => {
      UI.pickFromList({
        title: 'Día',
        options: (_plan.variantes || []).map(v => ({ value: v.id, label: v.nombre })),
        value: _varianteId || '',
        onPick: (val) => { _varianteId = val; app.render(); },
      });
    });

    root.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
      _abierta[b.dataset.toma] = b.dataset.op; app.render();
    }));
    root.querySelectorAll('[data-alt]').forEach(b => b.addEventListener('click', () => {
      _elegido[b.dataset.key] = b.dataset.alt; app.render();
    }));

    const share = root.querySelector('#nutShare');
    if (share) share.addEventListener('click', () => VData.exportNutrition(app, _plan));

    const del = root.querySelector('#nutDel');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Borrar pauta', message: 'Se borrará tu pauta de alimentación. Las recetas que dependan de ella también.', confirmLabel: 'Borrar', danger: true });
      if (!ok) return;
      await DB.del('nutrition', _plan.id);
      _plan = null; app.render(); UI.toast('Pauta borrada');
    });
  }

  // ---------- IMPORTADOR POR IA (beta) ----------
  function importarFlow(app) {
    UI.modal({
      title: 'Crear desde un documento',
      size: 'wide',
      bodyHTML: `
        <p class="modal-text">Traindía te prepara un texto para que se lo des a una IA <strong>junto con el PDF o las fotos de tu dieta</strong>. La IA te devuelve un archivo que la app entiende.</p>
        <p class="field-hint" style="margin-top:0">Marca lo que aplique a tu caso, para afinar el texto:</p>
        <div class="metric-opts">
          <label class="metric-opt"><input type="checkbox" data-opt="dias" checked><span>Mi dieta distingue días de entreno y de descanso</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="fotos"><span>Lo tengo en fotos, no en PDF</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="agrupar" checked><span>Que agrupe las alternativas equivalentes</span></label>
          <label class="metric-opt"><input type="checkbox" data-opt="idioma"><span>El documento está en otro idioma</span></label>
        </div>
        <p class="field-hint">⚠️ Tu documento se sube al servicio de IA que elijas y puede llevar datos personales. El texto le pide que <strong>no los copie</strong> al resultado.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Continuar', kind: 'primary', onClick: (root) => {
          const op = {};
          root.querySelectorAll('[data-opt]').forEach(c => { op[c.dataset.opt] = c.checked; });
          UI.askAI(buildPrompt(op));
          setTimeout(() => pegarFlow(app), 400);
        } },
      ],
    });
  }

  function pegarFlow(app) {
    UI.modal({
      title: 'Pegar el resultado',
      size: 'wide',
      bodyHTML: `<p class="modal-text">Cuando la IA te devuelva el JSON, pégalo aquí. También puedes descargarlo y mandarlo con <strong>Compartir → Traindía</strong>.</p>
        <textarea class="inp" id="nutJson" rows="7" placeholder='{"format":"cnp-export","kind":"nutrition"…'></textarea>`,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        { label: 'Revisar', kind: 'primary', onClick: (root) => {
          const txt = (root.querySelector('#nutJson').value || '').trim();
          if (!txt) { UI.toast('Pega el JSON', 'err'); return false; }
          let parsed;
          try { parsed = JSON.parse(txt); } catch (e) { UI.toast('Eso no es un JSON válido', 'err'); return false; }
          previsualizar(app, parsed);
        } },
      ],
    });
  }

  // Valida y ENSEÑA lo entendido antes de guardar nada. Nunca pisa la pauta actual
  // sin confirmación explícita.
  function validar(payload) {
    const errores = [], avisos = [];
    const p = (payload && payload.data && payload.data.plan) || null;
    if (!p) { errores.push('El archivo no trae ninguna pauta.'); return { errores, avisos, plan: null }; }
    if (payload.kind && payload.kind !== 'nutrition') avisos.push(`El archivo dice ser de tipo "${payload.kind}".`);
    if (p.schemaVersion && p.schemaVersion !== SCHEMA_VERSION) {
      avisos.push(`Está hecho para la versión ${p.schemaVersion} del formato y esta app usa la ${SCHEMA_VERSION}. Revísalo con cuidado.`);
    }
    if (!Array.isArray(p.variantes) || !p.variantes.length) errores.push('No trae variantes de día.');
    if (!Array.isArray(p.tomas) || !p.tomas.length) errores.push('No trae ninguna toma (desayuno, almuerzo…).');
    const vIds = new Set((p.variantes || []).map(v => v.id));
    let nAlt = 0, sinCantidad = 0;
    (p.tomas || []).forEach(t => (t.opciones || []).forEach(o => (o.grupos || []).forEach(g => (g.alternativas || []).forEach(a => {
      nAlt++;
      const cs = a.cantidades || {};
      if (!Object.keys(cs).length) sinCantidad++;
      Object.keys(cs).forEach(k => { if (!vIds.has(k)) avisos.push(`"${a.alimento}" tiene una cantidad para una variante que no existe (${k}).`); });
    }))));
    if (sinCantidad) avisos.push(`${sinCantidad} alimento(s) sin cantidad.`);
    return { errores, avisos, plan: p, nAlt };
  }

  function previsualizar(app, payload) {
    const { errores, avisos, plan, nAlt } = validar(payload);
    if (errores.length) {
      UI.modal({
        title: 'No se puede importar',
        bodyHTML: `<ul class="nut-check err">${errores.map(e => `<li>${UI.esc(e)}</li>`).join('')}</ul>
          <p class="field-hint">Vuelve a pedírselo a la IA con el texto que te dio Traindía, sin cambiarlo.</p>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
      });
      return;
    }
    const tomas = plan.tomas || [];
    const nOps = tomas.reduce((n, t) => n + (t.opciones || []).length, 0);
    const resumen = `<div class="nut-sum">
        <span><b>${tomas.length}</b> tomas</span><span><b>${nOps}</b> opciones</span><span><b>${nAlt}</b> alimentos</span>
        ${(plan.dudas || []).length ? `<span class="warn"><b>${plan.dudas.length}</b> dudas</span>` : ''}
      </div>`;
    const detalle = tomas.map(t => `<li><strong>${UI.esc(t.nombre)}</strong> · ${(t.opciones || []).length} opción(es)</li>`).join('');
    const dudas = (plan.dudas || []).length
      ? `<div class="card-label" style="margin-top:14px">Dudas de la IA</div><ul class="nut-check warn">${plan.dudas.map(d => `<li>${UI.esc(d)}</li>`).join('')}</ul>` : '';
    const avs = avisos.length ? `<ul class="nut-check warn">${avisos.map(a => `<li>${UI.esc(a)}</li>`).join('')}</ul>` : '';

    UI.modal({
      title: 'Esto es lo que he entendido',
      size: 'wide',
      bodyHTML: `${plan.tipoDetectado ? `<p class="modal-text">Formato detectado: <strong>${UI.esc(plan.tipoDetectado)}</strong>.</p>` : ''}
        <p class="modal-text dim">El importador está <strong>en beta</strong>: revisa las cantidades antes de guardar y cuéntame qué tal ha salido.</p>
        ${resumen}
        <ul class="nut-check">${detalle}</ul>
        ${avs}${dudas}`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Contar qué tal', kind: 'ghost', onClick: () => { reportar(app, plan); return false; } },
        { label: 'Guardar pauta', kind: 'primary', onClick: async () => {
          const rec = {
            ...plan,
            id: DB.uid('nut'),
            userId: app.activeUser.id,
            isPrimary: true,
            schemaVersion: SCHEMA_VERSION,
            createdAt: Date.now(),
          };
          const previas = await DB.nutritionOf(app.activeUser.id);
          for (const x of previas) { x.isPrimary = false; await DB.saveNutrition(x); }
          await DB.saveNutrition(rec);
          _plan = rec; _abierta = {}; _elegido = {}; _varianteId = null;
          app.go('nutrition', {}, true);
          UI.toast('Pauta guardada');
        } },
      ],
    });
  }

  // Reporte con contexto: el tipo detectado y el tamaño, nunca la dieta entera
  // salvo que el usuario la pegue a mano.
  function reportar(app, plan) {
    const ctx = [
      'Importador de nutrición (beta)',
      `Formato detectado: ${plan.tipoDetectado || 'sin declarar'}`,
      `Tomas: ${(plan.tomas || []).length} · Dudas: ${(plan.dudas || []).length} · Esquema: ${plan.schemaVersion || '?'}`,
      '',
      '¿Qué tal ha salido? ',
    ].join('\n');
    app.openFeedback({ tipo: 'Importador de nutrición (beta)', mensaje: ctx });
  }

  // ---------- EL PROMPT ----------
  // Va pegado al esquema de arriba: si cambia uno, cambia el otro.
  function buildPrompt(op) {
    const extra = [];
    if (op.dias) extra.push('- Mi dieta distingue DÍA DE ENTRENAMIENTO y DÍA DE DESCANSO: crea una variante para cada uno y rellena las cantidades de ambas.');
    else extra.push('- Mi dieta no distingue tipos de día: crea una sola variante llamada "Todos los días".');
    if (op.fotos) extra.push('- Te paso FOTOS, puede haber texto torcido o cortado. Si no puedes leer algo con seguridad, NO lo adivines: anótalo en "dudas".');
    if (op.agrupar) extra.push('- Agrupa como alternativas del MISMO grupo los alimentos que el documento presenta como intercambiables entre sí (separados por "/" o por "o").');
    else extra.push('- No agrupes: crea un grupo por cada alimento, con una sola alternativa.');
    if (op.idioma) extra.push('- El documento puede estar en otro idioma: traduce los nombres de alimentos al español pero respeta las cantidades tal cual.');

    return `Eres un asistente que convierte planes de alimentación en un JSON para la app Traindía.
Te adjunto mi plan de alimentación. Devuélveme SOLO el JSON, sin explicaciones ni bloques de código.

# REGLA MÁS IMPORTANTE
NO INVENTES NADA. Solo puedes usar lo que aparezca literalmente en el documento.
Si una cantidad, un alimento o una toma no está clara, NO la rellenes con lo que te parezca
razonable: déjala vacía y describe el problema en el array "dudas". Es una dieta real de una
persona; un gramaje inventado puede hacer daño.

# NO COPIES DATOS PERSONALES
No incluyas nombres de pacientes, teléfonos, correos, direcciones ni el nombre del profesional.
La app no los necesita.

# ARQUETIPOS: primero identifica qué tipo de plan es y decláralo en "tipoDetectado"
- "intercambios": cada toma tiene varias opciones y dentro de cada una hay alimentos
  intercambiables entre sí ("Arroz / Pasta / Quinoa"). Es el caso más común.
- "menu-semanal": un menú cerrado día por día ("Lunes: desayuno X, comida Y").
  En este caso crea UNA VARIANTE POR DÍA de la semana, con match.porDiaSemana.
- "raciones": cantidades sin gramos ("2 raciones de hidrato"). Usa unidad "ración".
- "recetario": una lista de platos ya montados, sin pauta de cantidades por toma.
- "otro": cualquier cosa que no encaje.
Si el documento SOLO trae objetivos de calorías y macros, sin alimentos ni cantidades,
devuelve {"error":"solo-macros"} y nada más.

# CUIDADO CON ESTAS DOS COSAS
1. "Arroz 60 g EN CRUDO o 180 g COCIDO" NO son dos alternativas: es el mismo alimento medido
   de dos formas. Pon 60 g como cantidad, "en crudo" en "nota" y "180 g cocido" en "equivale".
   Solo son alternativas los alimentos DISTINTOS entre sí (arroz vs pasta vs quinoa).
2. Las frases que aplican a varias tomas ("incluir siempre ensalada en comida y cena",
   "el pan debe ser integral") NO son alimentos: van en "reglas".

# UNIDADES
Usa "g", "ml", "unidad", "pieza", "ración", "cucharada" o "puñado". Si el documento dice algo
como "al gusto" o "libre", pon valor null y ese texto en "nota".

# FORMATO EXACTO
{
  "format": "cnp-export",
  "version": 2,
  "kind": "nutrition",
  "data": {
    "plan": {
      "schemaVersion": 1,
      "nombre": "Plan de alimentación",
      "tipoDetectado": "intercambios",
      "variantes": [
        { "id": "v_desc", "nombre": "Día de descanso", "match": { "porTipoDia": ["rest", "light"] } },
        { "id": "v_ent", "nombre": "Día de entrenamiento", "match": { "porTipoDia": ["strong", "moderate"] } }
      ],
      "tomas": [
        {
          "id": "t_alm", "nombre": "Almuerzo", "orden": 3,
          "opciones": [
            {
              "id": "t_alm_o1", "nombre": "Arroz o pasta con proteína",
              "grupos": [
                {
                  "id": "g_hc", "nombre": "Hidrato",
                  "alternativas": [
                    { "alimento": "Arroz integral", "cantidades": {
                        "v_desc": { "valor": 60, "unidad": "g", "nota": "en crudo", "equivale": "180 g cocido" },
                        "v_ent":  { "valor": 75, "unidad": "g", "nota": "en crudo", "equivale": "225 g cocido" } } },
                    { "alimento": "Pasta integral", "cantidades": {
                        "v_desc": { "valor": 60, "unidad": "g", "nota": "en crudo" },
                        "v_ent":  { "valor": 75, "unidad": "g", "nota": "en crudo" } } }
                  ]
                },
                {
                  "id": "g_prot", "nombre": "Proteína",
                  "alternativas": [
                    { "alimento": "Pechuga de pollo sin piel", "cantidades": {
                        "v_desc": { "valor": 140, "unidad": "g" }, "v_ent": { "valor": 170, "unidad": "g" } } }
                  ]
                }
              ]
            }
          ]
        }
      ],
      "reglas": [ { "texto": "En comida y cena incluir ensalada variada o verdura", "aplicaA": ["t_alm"] } ],
      "suplementos": [ { "nombre": "Creatina", "cantidad": "5 g/día", "nota": "" } ],
      "dudas": [ "En la merienda no queda claro si la fruta es adicional o alternativa" ]
    }
  }
}

# REGLAS DE FORMATO
- Los "id" los inventas tú, en minúsculas y sin espacios; solo tienen que ser únicos y coherentes.
- "orden" numera las tomas a lo largo del día empezando en 1.
- Toda alternativa debe traer una cantidad por CADA variante que declares.
- Si una toma tiene varias opciones, créalas todas: son alternativas de toma completa.
- Deja "dudas" como array vacío solo si de verdad no hay ninguna.

# MI CASO
${extra.join('\n')}

Devuelve únicamente el JSON.`;
  }

  return { render, bind, buildPrompt, validar, previewImport: previsualizar, SCHEMA_VERSION };
})();
