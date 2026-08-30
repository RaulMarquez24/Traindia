// ============================================================
// VISTA: Nutrición — qué te toca comer hoy y qué puedes cocinar
// ============================================================
// PRINCIPIO: la PAUTA manda (te la da tu nutricionista) y cada COMIDA es una
// tarjeta en la que entras: sus alimentos con sus gramos, por qué puedes
// cambiarlos y cómo se prepara.
//
// En la interfaz NO aparecen las palabras "opción", "grupo" ni "alternativa":
// se habla de COMIDAS, ALIMENTOS y "puedes cambiarlo por". Los nombres técnicos
// se quedan en el esquema, que es lo que viaja entre perfiles y por la IA.
//
// ESQUEMA (schemaVersion 1)
// {
//   id, userId, isPrimary, createdAt, schemaVersion, nombre, tipoDetectado,
//   variantes: [ { id, nombre, match: { porTipoDia:[...] } | { porDiaSemana:[1..7] } | null } ],
//   tomas: [ { id, nombre, orden,
//     opciones: [                       // en la interfaz: COMIDAS
//       { id, nombre, preparacion?,     // preparacion = cómo se hace (opcional)
//         grupos: [                     // en la interfaz: cada línea de la comida
//           { id, nombre, opcional?,   // opcional: no impide que la comida valga hoy
//             alternativas: [           // intercambiables entre sí
//               { alimento,
//                 cantidades: { [varianteId]: { valor, unidad, nota?, equivale? } } } ] } ] } ] } ],
//   reglas: [ { texto, aplicaA?: [idToma] } ],
//   suplementos: [ { nombre, cantidad, nota } ],
//   dudas: [ 'texto' ],
// }

const VNutrition = (() => {

  const SCHEMA_VERSION = 1;
  const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const UNIDADES = ['g', 'ml', 'unidad', 'pieza', 'ración', 'cucharada', 'puñado', 'lata', 'onza'];
  const TOMAS_SUGERIDAS = ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena'];

  // ---------- lectura ----------
  function cantidadDe(alt, varianteId) {
    const cs = alt.cantidades || {};
    return cs[varianteId] || cs[Object.keys(cs)[0]] || null;
  }
  function cantidadTexto(alt, varianteId) {
    const c = cantidadDe(alt, varianteId);
    if (!c) return '';
    const val = (c.valor === null || c.valor === undefined || c.valor === '') ? '' : c.valor;
    let t = [val, c.unidad].filter(x => x !== '' && x != null).join(' ').trim();
    if (!t) t = c.texto || '';
    if (c.nota) t += ` ${c.nota}`;
    return t.trim();
  }
  function varianteDeHoy(plan, app) {
    const vs = plan.variantes || [];
    if (!vs.length) return null;
    const hoyIdx = ((new Date().getDay() + 6) % 7) + 1;
    const dia = diaDelPlan(app, hoyIdx);
    const porTipo = dia && vs.find(v => v.match && Array.isArray(v.match.porTipoDia) && v.match.porTipoDia.includes(dia.type));
    if (porTipo) return porTipo;
    const porDia = vs.find(v => v.match && Array.isArray(v.match.porDiaSemana) && v.match.porDiaSemana.includes(hoyIdx));
    return porDia || vs[0];
  }
  function diaDelPlan(app, hoyIdx) {
    const days = (app.routine && app.routine.days) || [];
    const nombre = DIAS[hoyIdx];
    return days.find(d => (d.name || '').trim().toLowerCase() === nombre) || null;
  }
  const resumenComida = (op) => (op.grupos || [])
    .map(g => (g.alternativas || [])[0]).filter(Boolean).map(a => a.alimento).join(' · ');

  // Tras render(), _plan se relee de la base y los objetos anteriores quedan
  // huérfanos. Por eso todo se mueve por ID y se resuelve en el momento de usarlo.
  function ref(tomaId, opId, grupoId, altNombre) {
    const toma = (_plan.tomas || []).find(t => t.id === tomaId) || null;
    const opcion = toma && (toma.opciones || []).find(o => o.id === opId) || null;
    const grupo = opcion && grupoId ? (opcion.grupos || []).find(g => g.id === grupoId) || null : null;
    const alt = grupo && altNombre ? (grupo.alternativas || []).find(a => a.alimento === altNombre) || null : null;
    return { toma, opcion, grupo, alt };
  }

  // ---------- estado ----------
  let _plan = null;
  let _varianteId = null;
  let _elegido = {};        // `${opId}|${grupoId}` -> alimento elegido
  let _pidioPrompt = false;

  async function render(app) {
    if (!(await DB.hasStore('nutrition'))) return prepararHTML();
    _plan = await DB.primaryNutritionOf(app.activeUser.id);
    if (!_plan) return vacioHTML();
    return planHTML(app);
  }

  function prepararHTML() {
    return `<div class="section">
      <p class="section-intro">Para usar Nutrición hay que ampliar el almacén de la app. Solo puede hacerse si <strong>Traindía no está abierta en ningún otro sitio</strong>: cierra las demás pestañas y la app de la pantalla de inicio.</p>
      <button class="btn primary block" id="nutPrep">${UI.icon('refresh', 15)} Preparar Nutrición</button>
      <p class="section-intro dim">El resto de la app funciona con normalidad; tus datos están intactos.</p>
    </div>`;
  }

  function vacioHTML() {
    return `<div class="section">
      <div class="nut-intro">
        <h3>Tu dieta, sin pensar qué cocinar</h3>
        <p>Guardas las cantidades que te marcó tu nutricionista y las comidas que haces con ellas. Al abrir, ves <strong>lo que te toca hoy</strong> — la app ya sabe si entrenas o descansas.</p>
      </div>
      <button class="btn primary block" id="nutWizard">${UI.icon('plus', 15)} Empezar paso a paso</button>
      <p class="field-hint">Te voy guiando. En dos minutos tienes tu primera comida y ya te sirve.</p>
      <div class="nut-or"><span>o si tienes el plan en un PDF</span></div>
      <button class="btn ghost block" id="nutImport">${UI.icon('chat', 15)} Crear desde un documento <span class="beta-tag">beta</span></button>
      <button class="btn ${_pidioPrompt ? 'primary' : 'ghost'} block" id="nutPaste">${UI.icon('upload', 15)} Pegar el resultado de la IA</button>
    </div>`;
  }

  // ---------- PANTALLA DE HOY ----------
  // Cada toma enseña QUÉ OPCIONES tienes (las comidas, en pestañas) y, de la
  // elegida, los alimentos CON SUS CANTIDADES del día que toca. Si las cantidades
  // quedan escondidas dentro de la tarjeta, la distinción entreno/descanso se
  // vuelve invisible y la sección pierde su sentido.
  let _abierta = {};   // idToma -> idComida abierta

  // ¿Esta comida se puede hacer hoy? Solo si CADA línea tiene al menos un alimento
  // con cantidad para esta variante. Si falta una entera (p. ej. los fideos de una
  // sopa que solo existe en día de descanso), la comida no aplica.
  function comidaAplica(op, vId) {
    const gs = (op.grupos || []).filter(g => (g.alternativas || []).length && !g.opcional);
    if (!gs.length) return (op.grupos || []).length > 0;
    return gs.every(g => g.alternativas.some(a => (a.cantidades || {})[vId]));
  }

  function planHTML(app) {
    const vs = _plan.variantes || [];
    const auto = varianteDeHoy(_plan, app);
    const vId = _varianteId || (auto && auto.id) || (vs[0] && vs[0].id);
    const v = vs.find(x => x.id === vId) || vs[0];
    const tomas = (_plan.tomas || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));

    const cuerpo = tomas.map(t => tomaHTML(t, vId, vs)).join('');

    const reglas = (_plan.reglas || []).length
      ? `<div class="nut-reglas"><div class="card-label">A tener en cuenta</div><ul>${_plan.reglas.map(r => `<li>${UI.esc(r.texto)}</li>`).join('')}</ul></div>` : '';
    const sup = (_plan.suplementos || []).length
      ? `<div class="nut-reglas"><div class="card-label">Suplementación</div><ul>${_plan.suplementos.map(x => `<li><strong>${UI.esc(x.nombre)}</strong>${x.cantidad ? ` · ${UI.esc(x.cantidad)}` : ''}${x.nota ? ` <span class="dim">${UI.esc(x.nota)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
    const dudas = (_plan.dudas || []).length
      ? `<div class="nut-dudas"><div class="card-label">Dudas al importar</div><ul>${_plan.dudas.map(d => `<li>${UI.esc(d)}</li>`).join('')}</ul></div>` : '';

    return `<div class="section">
      <div class="nut-head">
        <div class="nut-head-txt"><strong>${UI.esc(_plan.nombre || 'Mi pauta')}</strong><span class="dim">${UI.esc(UI.fmtDate(DB.todayISO()))}</span></div>
        ${vs.length > 1 ? `<button class="nut-variant" id="nutVariant">${UI.esc(v ? v.nombre : '')} ▾</button>` : (v ? `<span class="nut-variant static">${UI.esc(v.nombre)}</span>` : '')}
      </div>
      ${vs.length > 1 ? `<p class="nut-hint">Las cantidades son las de <strong>${UI.esc(v ? v.nombre.toLowerCase() : '')}</strong>. La app lo elige por tu plan de entreno; tócalo para cambiarlo.</p>` : ''}
      ${cuerpo || '<div class="empty-state"><p class="dim">Tu pauta está vacía.</p></div>'}
      <button class="btn ghost block" id="nutAddToma">${UI.icon('plus', 15)} Añadir toma (desayuno, cena…)</button>
      ${reglas}${sup}${dudas}
      <div class="detail-toolbar">
        <button class="btn ghost" id="nutImport">${UI.icon('chat', 15)} Reimportar <span class="beta-tag">beta</span></button>
        <button class="btn ghost" id="nutShare">${UI.icon('upload', 15)} Compartir</button>
        <button class="btn ghost danger" id="nutDel">${UI.icon('trash', 15)} Borrar pauta</button>
      </div>
    </div>`;
  }

  function tomaHTML(t, vId, vs) {
    const ops = t.opciones || [];
    const cabecera = `<div class="nut-toma-lbl">${UI.esc(t.nombre)}<button class="nut-x" data-rm-toma="${UI.esc(t.id)}" title="Borrar toma">×</button></div>`;
    if (!ops.length) {
      return `<div class="nut-toma">${cabecera}
        <p class="dim" style="font-size:13px;margin-bottom:10px">Todavía no has puesto qué puedes comer aquí.</p>
        <button class="btn ghost small" data-add-op="${UI.esc(t.id)}">+ Añadir comida</button>
      </div>`;
    }
    // La abierta: la elegida, o la primera que aplique al día de hoy
    const conDatos = ops.filter(o => comidaAplica(o, vId));
    const op = ops.find(o => o.id === _abierta[t.id]) || conDatos[0] || ops[0];

    const pestañas = `<div class="meal-tabs">${ops.map(o => {
      const aplica = comidaAplica(o, vId);
      return `<button class="meal-tab${o.id === op.id ? ' sel' : ''}${aplica ? '' : ' off'}" data-tab="${UI.esc(t.id)}|${UI.esc(o.id)}"${aplica ? '' : ' title="No aplica a este día"'}>${UI.esc(o.nombre || 'Comida')}</button>`;
    }).join('')}<button class="meal-tab add" data-add-op="${UI.esc(t.id)}">+</button></div>`;

    const filas = (op.grupos || []).map(g => {
      const alts = g.alternativas || [];
      if (!alts.length) return '';
      const key = `${op.id}|${g.id}`;
      const conCant = alts.filter(a => (a.cantidades || {})[vId]);
      const lista = conCant.length ? conCant : alts;
      const el = lista.find(a => a.alimento === _elegido[key]) || lista[0];
      const otras = lista.filter(a => a !== el);
      const c = cantidadDe(el, vId) || {};
      const txt = (el.cantidades || {})[vId] ? cantidadTexto(el, vId) : '—';
      return `<div class="nut-row">
        <div class="nut-line">
          <span class="nut-food">${UI.esc(el.alimento)}</span>
          <span class="nut-dots"></span>
          <span class="nut-qty">${UI.esc(txt || '—')}</span>
        </div>
        ${c.equivale ? `<div class="nut-eq">≡ ${UI.esc(c.equivale)}</div>` : ''}
        ${otras.length ? `<div class="nut-swap"><span class="nut-swap-lbl">o</span>${otras.map(a => `<button class="nut-alt" data-key="${UI.esc(key)}" data-alt="${UI.esc(a.alimento)}">${UI.esc(a.alimento)}${(a.cantidades || {})[vId] ? ` <em>${UI.esc(cantidadTexto(a, vId))}</em>` : ''}</button>`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    const noAplica = !comidaAplica(op, vId) && vs.length > 1
      ? `<p class="nut-hint warn">Esta comida no tiene cantidades para hoy. Ábrela para añadirlas.</p>` : '';

    return `<div class="nut-toma">
      ${cabecera}
      ${pestañas}
      ${noAplica}
      ${filas || '<p class="dim" style="font-size:13px">Esta comida no tiene alimentos todavía.</p>'}
      <div class="meal-foot">
        ${op.preparacion ? `<span class="meal-flag">${UI.icon('book', 12)} tiene preparación</span>` : ''}
        <button class="btn ghost small" data-open-op="${UI.esc(t.id)}|${UI.esc(op.id)}">${UI.icon('edit', 13)} Abrir ${UI.esc(op.nombre || '')}</button>
      </div>
    </div>`;
  }

  // ---------- DETALLE DE UNA COMIDA (la tarjeta abierta) ----------
  function abrirComida(app, tomaId, opId) {
    const { toma, opcion: op } = ref(tomaId, opId);
    if (!toma || !op) { app.render(); return; }
    const vs = _plan.variantes || [];
    const vId = _varianteId || (varianteDeHoy(_plan, app) || {}).id || (vs[0] && vs[0].id);
    const filas = (op.grupos || []).map(g => {
      const alts = g.alternativas || [];
      if (!alts.length) return '';
      const key = `${op.id}|${g.id}`;
      const el = alts.find(a => a.alimento === _elegido[key]) || alts[0];
      const otras = alts.filter(a => a !== el);
      const c = cantidadDe(el, vId) || {};
      return `<div class="nut-row">
        <div class="nut-line">
          <span class="nut-food">${UI.esc(el.alimento)}</span>
          <span class="nut-dots"></span>
          <span class="nut-qty">${UI.esc(cantidadTexto(el, vId) || '—')}</span>
          <button class="nut-mini" data-ed-ali="${UI.esc(g.id)}|${UI.esc(el.alimento)}" title="Editar">${UI.icon('edit', 13)}</button>
        </div>
        ${c.equivale ? `<div class="nut-eq">≡ ${UI.esc(c.equivale)}</div>` : ''}
        <div class="nut-swap">
          ${otras.length ? `<span class="nut-swap-lbl">Puedes cambiarlo por:</span>${otras.map(a => `<button class="nut-alt" data-key="${UI.esc(key)}" data-alt="${UI.esc(a.alimento)}">${UI.esc(a.alimento)}</button>`).join('')}` : ''}
          <button class="nut-alt add" data-add-alt="${UI.esc(g.id)}">+ cambio posible</button>
        </div>
      </div>`;
    }).join('');

    UI.modal({
      title: op.nombre || 'Comida',
      size: 'wide',
      bodyHTML: `
        <p class="modal-text dim">${UI.esc(toma.nombre)}${vs.length > 1 ? ` · ${UI.esc((vs.find(x => x.id === vId) || {}).nombre || '')}` : ''}</p>
        ${filas || '<p class="modal-text dim">Esta comida todavía no tiene alimentos.</p>'}
        <button class="btn ghost small block" id="nutAddAli">+ Añadir alimento</button>
        <div class="card-label" style="margin-top:16px">Cómo se hace</div>
        <textarea class="inp" id="nutPrep2" rows="4" placeholder="Ej: sofríes la cebolla, añades el arroz…">${UI.esc(op.preparacion || '')}</textarea>
        <p class="field-hint">Opcional. Es lo que te evita pensar qué cocinar cuando la abras.</p>`,
      actions: [
        { label: 'Borrar comida', kind: 'danger', onClick: async () => {
          const i = toma.opciones.indexOf(op);
          if (i >= 0) toma.opciones.splice(i, 1);
          await guardar(app); UI.toast('Comida borrada');
        } },
        { label: 'Duplicar', kind: 'ghost', onClick: async (root) => {
          const copia = JSON.parse(JSON.stringify(op));
          copia.id = DB.uid('o'); copia.nombre = `${op.nombre} (copia)`;
          copia.preparacion = (root.querySelector('#nutPrep2').value || '').trim() || undefined;
          toma.opciones.push(copia);
          await guardar(app);
          UI.toast('Duplicada · cámbiale el nombre y la preparación');
        } },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          op.preparacion = (root.querySelector('#nutPrep2').value || '').trim() || undefined;
          await guardar(app);
        } },
      ],
      onMount: (root) => {
        root.querySelectorAll('[data-alt]').forEach(b => b.addEventListener('click', () => {
          _elegido[b.dataset.key] = b.dataset.alt;
          UI.closeModal(root); abrirComida(app, tomaId, opId);
        }));
        root.querySelector('#nutAddAli').addEventListener('click', () => {
          UI.closeModal(root); editAlimento(app, { tomaId, opId });
        });
        root.querySelectorAll('[data-add-alt]').forEach(b => b.addEventListener('click', () => {
          UI.closeModal(root); editAlimento(app, { tomaId, opId, grupoId: b.dataset.addAlt });
        }));
        root.querySelectorAll('[data-ed-ali]').forEach(b => b.addEventListener('click', () => {
          const [gid, nombre] = b.dataset.edAli.split('|');
          UI.closeModal(root); editAlimento(app, { tomaId, opId, grupoId: gid, altNombre: nombre });
        }));
      },
    });
  }

  // ---------- ASISTENTE DE PRIMEROS PASOS ----------
  // En vez de soltar al usuario en un editor vacío, se le lleva de la mano hasta
  // tener UNA comida completa, que es cuando la sección ya sirve para algo.
  function wizard(app) {
    UI.modal({
      title: 'Paso 1 de 3 · Tu pauta',
      bodyHTML: `<p class="modal-text">Vamos a montar tu primera comida. Son tres pasos y luego puedes seguir añadiendo cuando quieras.</p>
        ${UI.field('¿Cómo la llamamos?', UI.input('nombre', 'Mi pauta', { placeholder: 'Mi pauta' }))}
        <label class="metric-opt"><input type="checkbox" id="nutDias" checked><span>Como distinto los días que entreno</span></label>
        <p class="field-hint">Si lo marcas, cada alimento guardará dos cantidades y la app enseñará la que toque mirando tu plan de entreno.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Siguiente', kind: 'primary', onClick: async (root) => {
          const nombre = (root.querySelector('input[name="nombre"]').value || '').trim() || 'Mi pauta';
          const dos = root.querySelector('#nutDias').checked;
          const variantes = dos
            ? [{ id: 'v_desc', nombre: 'Día de descanso', match: { porTipoDia: ['rest', 'light'] } },
               { id: 'v_ent', nombre: 'Día de entrenamiento', match: { porTipoDia: ['strong', 'moderate'] } }]
            : [{ id: 'v_uni', nombre: 'Todos los días', match: null }];
          for (const x of await DB.nutritionOf(app.activeUser.id)) { x.isPrimary = false; await DB.saveNutrition(x); }
          _plan = { id: DB.uid('nut'), userId: app.activeUser.id, isPrimary: true, createdAt: Date.now(),
                    schemaVersion: SCHEMA_VERSION, nombre, tipoDetectado: 'intercambios',
                    variantes, tomas: [], reglas: [], suplementos: [], dudas: [] };
          await DB.saveNutrition(_plan);
          setTimeout(() => wizardToma(app), 250);
        } },
      ],
    });
  }

  function wizardToma(app) {
    UI.modal({
      title: 'Paso 2 de 3 · ¿Qué comida?',
      bodyHTML: `<p class="modal-text">Elige por cuál empezamos. Da igual el orden: puedes añadir el resto después.</p>
        <div class="effort-pick">${TOMAS_SUGERIDAS.map(t => `<button type="button" class="effort-opt" data-sug="${UI.esc(t)}">${UI.esc(t)}</button>`).join('')}</div>
        ${UI.field('O escríbela', UI.input('nombre', '', { placeholder: 'Recena, pre-entreno…' }))}`,
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
      onMount: (root) => {
        const ir = async (n) => {
          if (!n) { UI.toast('Elige una', 'err'); return; }
          const t = { id: DB.uid('t'), nombre: n, orden: (_plan.tomas.length + 1), opciones: [] };
          _plan.tomas.push(t);
          await DB.saveNutrition(_plan);
          UI.closeModal(root);
          setTimeout(() => wizardComida(app, t), 250);
        };
        root.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => ir(b.dataset.sug)));
        const inp = root.querySelector('input[name="nombre"]');
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(inp.value.trim()); });
      },
    });
  }

  function wizardComida(app, toma) {
    UI.modal({
      title: `Paso 3 de 3 · ${UI.esc(toma.nombre)}`,
      bodyHTML: `<p class="modal-text">Ponle nombre a un plato que hagas para esta comida. Luego le añadirás los alimentos con sus gramos.</p>
        ${UI.field('Nombre del plato', UI.input('nombre', '', { placeholder: 'Ej: Arroz con pollo, Tostada con pavo…' }))}`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear', kind: 'primary', onClick: async (root) => {
          const n = (root.querySelector('input[name="nombre"]').value || '').trim();
          if (!n) { UI.toast('Ponle un nombre', 'err'); return false; }
          const op = { id: DB.uid('o'), nombre: n, grupos: [] };
          toma.opciones.push(op);
          await DB.saveNutrition(_plan);
          app.render();
          setTimeout(() => editAlimento(app, { tomaId: toma.id, opId: op.id, primero: true }), 300);
        } },
      ],
    });
  }

  // ---------- ALTA / EDICIÓN DE UN ALIMENTO ----------
  async function guardar(app) {
    _plan.userId = app.activeUser.id;
    await DB.saveNutrition(_plan);
    app.render();
  }

  function editAlimento(app, { tomaId, opId, grupoId, altNombre, primero }) {
    const { toma, opcion, grupo, alt } = ref(tomaId, opId, grupoId, altNombre);
    if (!toma || !opcion) { app.render(); return; }
    const vs = _plan.variantes || [];
    const esNuevo = !alt;
    const campos = vs.map(v => {
      const c = (alt && cantidadDe(alt, v.id)) || {};
      return `<div class="nut-qrow">
        <span class="nut-qlbl">${UI.esc(v.nombre)}</span>
        <input class="inp" data-q="${UI.esc(v.id)}" data-f="valor" type="number" step="0.01" inputmode="decimal" value="${c.valor == null ? '' : UI.esc(c.valor)}" placeholder="cantidad">
        <input class="inp" data-q="${UI.esc(v.id)}" data-f="unidad" list="nutUnidades" value="${UI.esc(c.unidad || 'g')}" placeholder="g">
      </div>`;
    }).join('');
    const c0 = (alt && cantidadDe(alt, vs[0] && vs[0].id)) || {};
    UI.modal({
      title: esNuevo ? (grupo ? 'Un cambio posible' : 'Añadir alimento') : 'Editar alimento',
      bodyHTML: `<div id="nutAli">
        ${primero ? `<p class="modal-text">Ya casi. Añade el primer alimento de <strong>${UI.esc(opcion.nombre)}</strong> con la cantidad que te marcó tu nutricionista.</p>` : ''}
        ${grupo && esNuevo ? `<p class="modal-text">Un alimento que puedes poner <strong>en lugar de ${UI.esc((grupo.alternativas[0] || {}).alimento || '')}</strong> cuando no lo tengas. Pon su cantidad equivalente.</p>` : ''}
        ${UI.field('Alimento', UI.input('alimento', alt ? alt.alimento : '', { placeholder: 'Ej: Arroz integral' }))}
        <span class="field-label">Cantidad</span>
        ${campos}
        <datalist id="nutUnidades">${UNIDADES.map(u => `<option value="${u}">`).join('')}</datalist>
        ${UI.field('Nota (opcional)', UI.input('nota', c0.nota || '', { placeholder: 'en crudo, al gusto…' }))}
        ${UI.field('Equivalencia (opcional)', UI.input('equivale', c0.equivale || '', { placeholder: '180 g cocido' }), 'La MISMA cantidad medida de otra forma. No es otro alimento.')}
      </div>`,
      actions: [
        alt ? { label: 'Borrar', kind: 'danger', onClick: async () => {
          const i = grupo.alternativas.indexOf(alt);
          if (i >= 0) grupo.alternativas.splice(i, 1);
          if (!grupo.alternativas.length) {
            const gi = opcion.grupos.indexOf(grupo);
            if (gi >= 0) opcion.grupos.splice(gi, 1);
          }
          await guardar(app); UI.toast('Alimento borrado');
          setTimeout(() => abrirComida(app, tomaId, opId), 250);
        } } : { label: 'Cancelar', kind: 'ghost' },
        { label: primero ? 'Listo' : 'Guardar', kind: 'primary', onClick: async (root) => {
          const nombre = (root.querySelector('input[name="alimento"]').value || '').trim();
          if (!nombre) { UI.toast('Ponle nombre al alimento', 'err'); return false; }
          const nota = (root.querySelector('input[name="nota"]').value || '').trim();
          const equivale = (root.querySelector('input[name="equivale"]').value || '').trim();
          const cantidades = {};
          vs.forEach(v => {
            const val = root.querySelector(`[data-q="${v.id}"][data-f="valor"]`).value;
            const uni = (root.querySelector(`[data-q="${v.id}"][data-f="unidad"]`).value || '').trim();
            if (val === '' && !nota) return;
            const c = { valor: val === '' ? null : parseFloat(val), unidad: uni };
            if (nota) c.nota = nota;
            if (equivale) c.equivale = equivale;
            cantidades[v.id] = c;
          });
          if (alt) { alt.alimento = nombre; alt.cantidades = cantidades; }
          else {
            const nuevo = { alimento: nombre, cantidades };
            if (grupo) grupo.alternativas.push(nuevo);
            else opcion.grupos.push({ id: DB.uid('g'), nombre, alternativas: [nuevo] });
          }
          await guardar(app);
          if (primero) UI.toast('¡Listo! Ya tienes tu primera comida');
          setTimeout(() => abrirComida(app, tomaId, opId), primero ? 350 : 250);
        } },
      ],
    });
  }

  function addToma(app) {
    UI.modal({
      title: 'Nueva toma',
      bodyHTML: `<div class="effort-pick">${TOMAS_SUGERIDAS.map(t => `<button type="button" class="effort-opt" data-sug="${UI.esc(t)}">${UI.esc(t)}</button>`).join('')}</div>
        ${UI.field('Nombre', UI.input('nombre', '', { placeholder: 'Desayuno, Cena…' }))}`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Añadir', kind: 'primary', onClick: async (root) => {
          const n = (root.querySelector('input[name="nombre"]').value || '').trim();
          if (!n) { UI.toast('Ponle nombre', 'err'); return false; }
          _plan.tomas.push({ id: DB.uid('t'), nombre: n, orden: (_plan.tomas.length + 1), opciones: [] });
          await guardar(app);
        } },
      ],
      onMount: (root) => root.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => {
        root.querySelector('input[name="nombre"]').value = b.dataset.sug;
      })),
    });
  }

  function addComida(app, toma) {
    UI.modal({
      title: `Nueva comida · ${UI.esc(toma.nombre)}`,
      bodyHTML: `${UI.field('Nombre del plato', UI.input('nombre', '', { placeholder: 'Ej: Lentejas con arroz' }))}
        <p class="field-hint">Es una de las cosas que puedes comer en esta toma. Después le añades los alimentos.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear', kind: 'primary', onClick: async (root) => {
          const n = (root.querySelector('input[name="nombre"]').value || '').trim();
          if (!n) { UI.toast('Ponle un nombre', 'err'); return false; }
          const op = { id: DB.uid('o'), nombre: n, grupos: [] };
          toma.opciones.push(op);
          const tid = toma.id, oid = op.id;
          await guardar(app);
          setTimeout(() => editAlimento(app, { tomaId: tid, opId: oid, primero: true }), 300);
        } },
      ],
    });
  }

  async function borrarToma(app, toma) {
    const ok = await UI.confirm({ title: 'Borrar toma', message: `Se borrará "${toma.nombre}" con todas sus comidas.`, confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const i = _plan.tomas.indexOf(toma);
    if (i >= 0) _plan.tomas.splice(i, 1);
    await guardar(app);
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
          <p class="modal-text dim">Cierra las demás pestañas y la app de la pantalla de inicio, y vuelve a intentarlo.</p>`,
        actions: [{ label: 'Entendido', kind: 'primary', onClick: () => location.reload() }],
      });
    });

    const wiz = root.querySelector('#nutWizard');
    if (wiz) wiz.addEventListener('click', () => wizard(app));
    root.querySelectorAll('#nutImport').forEach(b => b.addEventListener('click', () => importarFlow(app)));
    const paste = root.querySelector('#nutPaste');
    if (paste) paste.addEventListener('click', () => pegarFlow(app));

    const variant = root.querySelector('#nutVariant');
    if (variant) variant.addEventListener('click', () => {
      UI.pickFromList({
        title: 'Día',
        options: (_plan.variantes || []).map(v => ({ value: v.id, label: v.nombre })),
        value: _varianteId || '',
        onPick: (val) => { _varianteId = val; app.render(); },
      });
    });

    const tomaPorId = (id) => (_plan.tomas || []).find(t => t.id === id);
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      const [tid, oid] = b.dataset.tab.split('|');
      _abierta[tid] = oid; app.render();
    }));
    root.querySelectorAll('[data-alt]').forEach(b => b.addEventListener('click', () => {
      _elegido[b.dataset.key] = b.dataset.alt; app.render();
    }));
    root.querySelectorAll('[data-open-op]').forEach(b => b.addEventListener('click', () => {
      const [tid, oid] = b.dataset.openOp.split('|');
      abrirComida(app, tid, oid);
    }));
    root.querySelectorAll('[data-add-op]').forEach(b => b.addEventListener('click', () => {
      const t = tomaPorId(b.dataset.addOp); if (t) addComida(app, t);
    }));
    root.querySelectorAll('[data-rm-toma]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = tomaPorId(b.dataset.rmToma); if (t) borrarToma(app, t);
    }));
    const addT = root.querySelector('#nutAddToma');
    if (addT) addT.addEventListener('click', () => addToma(app));

    const share = root.querySelector('#nutShare');
    if (share) share.addEventListener('click', () => VData.exportNutrition(app, _plan));
    const del = root.querySelector('#nutDel');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Borrar pauta', message: 'Se borrará tu pauta de alimentación entera.', confirmLabel: 'Borrar', danger: true });
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
          _pidioPrompt = true; // al volver, la pantalla ofrece "pegar el resultado"
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
2b. Si un alimento solo aparece en uno de los tipos de día, NO crees un grupo aparte:
   ponlo como alternativa del MISMO grupo (p. ej. pan en descanso y quinoa en entreno
   son el hidrato de esa comida). Si de verdad es un extra que solo se añade un día,
   marca ese grupo con "opcional": true.
3. Las frases que aplican a varias tomas ("incluir siempre ensalada en comida y cena",
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
