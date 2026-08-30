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
//       { id, nombre,                 // la DIRECTRIZ del nutricionista
//         recetas?: [ { id, nombre, preparacion?,   // TUS platos que la cumplen
//                       elige?: { [grupoId]: 'alimento' } } ],
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
  const TIPOS = ['Hidrato', 'Proteína', 'Grasa', 'Verdura', 'Fruta', 'Lácteo', 'Fruto seco'];
  const UNIDADES = ['g', 'ml', 'unidad', 'pieza', 'ración', 'cucharada', 'puñado', 'lata', 'onza'];
  const TOMAS_SUGERIDAS = ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena'];

  // ---------- lectura ----------
  function cantidadDe(alt, varianteId) {
    const cs = alt.cantidades || {};
    return cs[varianteId] || cs[Object.keys(cs)[0]] || null;
  }
  // Solo el número y la unidad. La nota ("en crudo", "al gusto") va aparte para
  // que no se pegue al gramaje y se pueda dar menos peso visual.
  function cantidadTexto(alt, varianteId) {
    const c = cantidadDe(alt, varianteId);
    if (!c) return '';
    const val = (c.valor === null || c.valor === undefined || c.valor === '') ? '' : c.valor;
    const t = [val, c.unidad].filter(x => x !== '' && x != null).join(' ').trim();
    return t || c.nota || c.texto || 'al gusto';
  }
  const notaDe = (alt, vId) => {
    const c = cantidadDe(alt, vId);
    if (!c || !c.nota) return '';
    return cantidadTexto(alt, vId) === c.nota ? '' : c.nota;   // si la nota ES la cantidad, no repetir
  };
  // Al principio los días "light" se emparejaron con descanso, y un día ligero
  // (movilidad, brazo suelto) es un día que entrenas. Se corrige al abrir el
  // plan; es idempotente, porque después ya no cumple la condición.
  function arreglarDiaLigero(plan) {
    const vs = plan.variantes || [];
    const tipos = v => (v.match && Array.isArray(v.match.porTipoDia)) ? v.match.porTipoDia : null;
    const desc = vs.find(v => { const t = tipos(v); return t && t.includes('rest') && t.includes('light'); });
    const ent = vs.find(v => { const t = tipos(v); return t && !t.includes('rest') && (t.includes('strong') || t.includes('moderate')); });
    if (!desc || !ent) return false;
    desc.match.porTipoDia = tipos(desc).filter(t => t !== 'light');
    if (!tipos(ent).includes('light')) ent.match.porTipoDia = tipos(ent).concat('light');
    return true;
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
  // Se guarda fuera de memoria: el usuario se va a la IA y al volver Android
  // puede haber recargado la app entera. Si no, el botón de pegar desaparece.
  const PROMPT_KEY = 'traindia-nut-prompt-pedido';
  const pidioPrompt = () => { try { return localStorage.getItem(PROMPT_KEY) === '1'; } catch (e) { return false; } };
  const marcarPrompt = () => { try { localStorage.setItem(PROMPT_KEY, '1'); } catch (e) {} };

  let _planId = null;   // plan elegido cuando hay más de uno
  // La cabecera de la app dice dónde estás: Nutrición → nombre de la pauta → comida.
  function headerTitle(params) {
    if (params && params.planId && _plan) {
      if (params.tomaId) {
        const t = (_plan.tomas || []).find(x => x.id === params.tomaId);
        if (t) return t.nombre;
      }
      return _plan.nombre || 'Nutrición';
    }
    return 'Mis planes';
  }
  let _abierta = {};    // idToma -> idOpcion (para "usar hoy" de un plato)

  // ¿Esta opción se puede hacer hoy? Solo si CADA línea no opcional tiene al menos
  // un alimento con cantidad para esta variante.
  function comidaAplica(op, vId) {
    if (Array.isArray(op.variantes) && op.variantes.length) return op.variantes.includes(vId);
    const gs = (op.grupos || []).filter(g => (g.alternativas || []).length && !g.opcional);
    if (!gs.length) return (op.grupos || []).length > 0;
    return gs.every(g => g.alternativas.some(a => (a.cantidades || {})[vId]));
  }
  // Los días para los que sirve una opción (todos, si no lo dice).
  const variantesDeOpcion = (op, vs) => {
    const ids = Array.isArray(op.variantes) && op.variantes.length ? op.variantes : vs.map(v => v.id);
    return vs.filter(v => ids.includes(v.id));
  };
  const selectorDiasHTML = (vs, elegidas) => `<span class="field-label">¿Qué días vale?</span>
    <div class="dias-pick">${vs.map(v => `<button type="button" class="nut-alt${elegidas.includes(v.id) ? ' on' : ''}" data-dia="${UI.esc(v.id)}">${UI.esc(v.nombre)}</button>`).join('')}</div>
    <p class="field-hint">Marca los dos si la comes igual siempre.</p>`;
  function bindDias(root, elegidas) {
    root.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.dia;
      const i = elegidas.indexOf(id);
      if (i >= 0) { if (elegidas.length === 1) return; elegidas.splice(i, 1); }
      else elegidas.push(id);
      b.classList.toggle('on');
    }));
  }
  function variantesDe(app) {
    const vs = _plan.variantes || [];
    const auto = varianteDeHoy(_plan, app);
    const vId = _varianteId || (auto && auto.id) || (vs[0] && vs[0].id);
    return { vs, vId, v: vs.find(x => x.id === vId) || vs[0] };
  }

  // NAVEGACIÓN: la raíz de la sección es MIS PLANES; un plan se abre encima, así
  // que el botón de atrás siempre devuelve a la lista. Con un solo plan se entra
  // directo, pero dejando la lista en el historial para poder volver.
  let _saltarA = null;
  let _docs = [];           // documentos guardados en este dispositivo
  let _docsOK = false;      // ¿está creado el almacén de documentos?

  // Los documentos viven en 'files' (compartidos con la sección Documentos) y el
  // plan solo guarda sus ids: así el mismo PDF sirve para el entreno y la dieta.
  const docsDelPlan = () => (_plan && Array.isArray(_plan.docIds) ? _plan.docIds : [])
    .map(id => _docs.find(d => d.id === id)).filter(Boolean);

  async function render(app, params) {
    if (!(await DB.hasStore('nutrition'))) return prepararHTML();
    const planes = await DB.nutritionOf(app.activeUser.id);
    if (!planes.length) { _plan = null; return vacioHTML(); }

    _docsOK = await DB.hasStore('files');
    _docs = _docsOK ? await DB.filesOf(app.activeUser.id) : [];

    for (const pl of planes) {
      if (arreglarDiaLigero(pl)) await DB.saveNutrition(pl);
    }

    const planId = params && params.planId;
    if (planId) {
      _plan = planes.find(x => x.id === planId) || planes[0];
      _planId = _plan.id;
      if (params.tomaId) {
        const t = (_plan.tomas || []).find(x => x.id === params.tomaId);
        if (t) return tomaScreenHTML(app, t);
      }
      return planScreenHTML(app);
    }

    // Un solo plan: se abre solo. Marcamos estos params como "lista" para que la
    // entrada que quede en el historial sea la lista y el atrás no rebote aquí.
    if (planes.length === 1 && !(params && params.lista)) {
      if (app.params) app.params.lista = 1;
      _saltarA = planes[0].id;
      _plan = planes[0]; _planId = _plan.id;
      return `<div class="loading">Abriendo…</div>`;
    }
    _plan = null;
    return listaPlanesHTML(planes);
  }

  function listaPlanesHTML(planes) {
    return `<div class="section">
      <div class="sec-label">Mis planes</div>
      ${planes.map(p => `<button class="big-row" data-plan="${UI.esc(p.id)}">
          <span class="big-row-icon tile" style="background:var(--strong)">${UI.icon('book', 20)}</span>
          <span class="big-row-text"><strong>${UI.esc(p.nombre || 'Pauta')}</strong><span class="dim">${(p.tomas || []).length} comidas${p.isPrimary ? ' · en uso' : ''}</span></span>
          <span class="chev">›</span>
        </button>`).join('')}
      <div class="sec-label" style="margin-top:22px">Añadir otra</div>
      <button class="btn ghost block" id="nutWizard">${UI.icon('plus', 15)} Crear a mano</button>
      <button class="btn ghost block" id="nutImport">${UI.icon('chat', 15)} Desde un documento <span class="beta-tag">beta</span></button>
      <button class="btn ${pidioPrompt() ? 'primary' : 'ghost'} block" id="nutPaste">${UI.icon('upload', 15)} Pegar el resultado de la IA</button>
    </div>`;
  }

  // ---------- PANTALLA DEL PLAN: día + lista de comidas ----------
  function planScreenHTML(app) {
    const { vs, vId, v } = variantesDe(app);
    const tomas = (_plan.tomas || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));

    const dias = vs.length > 1
      ? `<div class="nut-days">${vs.map(x => `<button class="nut-day${x.id === vId ? ' sel' : ''}" data-variante="${UI.esc(x.id)}">${UI.esc(x.nombre)}</button>`).join('')}</div>
         <p class="nut-hint">Hoy la app ha elegido <strong>${UI.esc((varianteDeHoy(_plan, app) || {}).nombre || '')}</strong> mirando tu plan de entreno.</p>`
      : '';

    const filas = tomas.map(t => {
      const ops = (t.opciones || []).filter(o => comidaAplica(o, vId));
      const platos = (t.opciones || []).reduce((n, o) => n + (o.recetas || []).filter(r => !r.varianteId || r.varianteId === vId).length, 0);
      return `<button class="big-row" data-toma="${UI.esc(t.id)}">
        <span class="big-row-text"><strong>${UI.esc(t.nombre)}</strong><span class="dim">${ops.length} ${ops.length === 1 ? 'opción' : 'opciones'} hoy${platos ? ` · ${platos} ${platos === 1 ? 'plato' : 'platos'}` : ''}</span></span>
        <span class="chev">›</span>
      </button>`;
    }).join('');

    const reglas = (_plan.reglas || []).length
      ? `<div class="nut-reglas"><div class="card-label">A tener en cuenta</div><ul>${_plan.reglas.map(r => `<li>${UI.esc(r.texto)}</li>`).join('')}</ul></div>` : '';
    const sup = (_plan.suplementos || []).length
      ? `<div class="nut-reglas"><div class="card-label">Suplementación</div><ul>${_plan.suplementos.map(x => `<li><strong>${UI.esc(x.nombre)}</strong>${x.cantidad ? ` · ${UI.esc(x.cantidad)}` : ''}${x.nota ? ` <span class="dim">${UI.esc(x.nota)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
    const dudas = (_plan.dudas || []).length
      ? `<div class="nut-dudas">
          <div class="card-label">Dudas al importar · ${_plan.dudas.length}</div>
          ${_plan.dudas.map((d, i) => `<div class="duda-row">
            <span class="duda-txt">${UI.esc(d)}</span>
            <button class="btn ghost small" data-duda="${i}">${UI.icon('check', 13)} Aclarada</button>
          </div>`).join('')}
          <p class="field-hint">Coteja cada una con tu nutricionista, corrígela en la comida que toque y márcala como aclarada para quitarla de aquí.</p>
        </div>` : '';

    const misDocs = docsDelPlan();
    const docs = `<div class="nut-reglas">
      <div class="card-label">Documentos del plan</div>
      ${misDocs.length ? misDocs.map(d => `<div class="duda-row">
          <span class="duda-txt">${UI.icon(app.docIcon(d.type), 14)} ${UI.esc(d.name)}</span>
          <button class="btn ghost small" data-doc-open="${UI.esc(d.id)}">Abrir</button>
          <button class="btn ghost small danger" data-doc-rm="${UI.esc(d.id)}">Quitar</button>
        </div>`).join('')
        : '<p class="field-hint" style="margin-top:0">El PDF de tu nutricionista, la foto de la hoja que te dio… para consultarlo desde aquí cuando dudes.</p>'}
      ${_docsOK
        ? `<button class="btn ghost small block" id="nutAddDoc" style="margin-top:10px">${UI.icon('plus', 14)} Adjuntar documento</button>`
        : '<p class="field-hint">Para guardar documentos hay que activarlos primero en <strong>Más → Documentos</strong>.</p>'}
    </div>`;

    return `<div class="section">
      <div class="nut-head">
        <div class="nut-head-txt"><strong>${UI.esc(_plan.nombre || 'Mi plan')}</strong><span class="dim">${UI.esc(UI.fmtDate(DB.todayISO()))}</span></div>
      </div>
      ${dias}
      <div class="sec-label">Comidas del día</div>
      ${filas || '<div class="empty-state"><p class="dim">Tu pauta no tiene comidas todavía.</p></div>'}
      <button class="btn ghost block" id="nutAddToma">${UI.icon('plus', 15)} Añadir comida (desayuno, cena…)</button>
      ${reglas}${sup}${docs}${dudas}
      <div class="detail-toolbar">
        <button class="btn ghost" id="nutShare">${UI.icon('upload', 15)} Compartir</button>
        <button class="btn ghost danger" id="nutDel">${UI.icon('trash', 15)} Borrar plan</button>
      </div>
      <p class="field-hint">Para crear otro plan, vuelve atrás a <strong>Mis planes</strong>.</p>
    </div>`;
  }

  // ---------- PANTALLA DE UNA COMIDA: pautas arriba, tus platos abajo ----------
  function tomaScreenHTML(app, t) {
    const { vs, vId, v } = variantesDe(app);

    const dias = vs.length > 1
      ? `<div class="nut-days small">${vs.map(x => `<button class="nut-day${x.id === vId ? ' sel' : ''}" data-variante="${UI.esc(x.id)}">${UI.esc(x.nombre)}</button>`).join('')}</div>`
      : '';

    const ops = (t.opciones || []).slice().sort((a, b) => (comidaAplica(b, vId) ? 1 : 0) - (comidaAplica(a, vId) ? 1 : 0));

    const bloques = ops.map(op => {
      const aplica = comidaAplica(op, vId);
      const filas = (op.grupos || []).map(g => {
        const alts = g.alternativas || [];
        if (!alts.length) return '';
        const conCant = alts.filter(a => (a.cantidades || {})[vId]);
        const lista = conCant.length ? conCant : alts;

        // Una sola posibilidad: línea normal.
        if (lista.length === 1) {
          const el = lista[0];
          const c = cantidadDe(el, vId) || {};
          const pie = [notaDe(el, vId), c.equivale ? `≡ ${c.equivale}` : ''].filter(Boolean).join(' · ');
          return `<div class="nut-row">
            <div class="nut-line"><span class="nut-food">${UI.esc(el.alimento)}</span><span class="nut-dots"></span><span class="nut-qty">${UI.esc(cantidadTexto(el, vId) || '—')}</span></div>
            ${pie ? `<div class="nut-eq">${UI.esc(pie)}</div>` : ''}
          </div>`;
        }

        // Varias: son EQUIVALENTES, ninguna manda. Si comparten cantidad, se
        // enseña una vez arriba; si no, cada una lleva la suya.
        const textos = lista.map(a => cantidadTexto(a, vId));
        const mismaCantidad = textos.every(t => t === textos[0]);
        const nombreGrupo = g.nombre || 'Elige uno';
        if (mismaCantidad) {
          const c = cantidadDe(lista[0], vId) || {};
          const pie = [notaDe(lista[0], vId), c.equivale ? `≡ ${c.equivale}` : ''].filter(Boolean).join(' · ');
          return `<div class="nut-row">
            <div class="nut-line"><span class="nut-food grupo">${UI.esc(nombreGrupo)}</span><span class="nut-dots"></span><span class="nut-qty">${UI.esc(textos[0] || '—')}</span></div>
            ${pie ? `<div class="nut-eq">${UI.esc(pie)}</div>` : ''}
            <div class="nut-opts">${lista.map(a => `<span class="nut-opt">${UI.esc(a.alimento)}</span>`).join('')}</div>
            <div class="nut-opts-hint">cualquiera de estos</div>
          </div>`;
        }
        return `<div class="nut-row">
          <div class="nut-grupo-lbl">${UI.esc(nombreGrupo)} · cualquiera de estos</div>
          ${lista.map(a => {
            const c = cantidadDe(a, vId) || {};
            const pie = [notaDe(a, vId), c.equivale ? `≡ ${c.equivale}` : ''].filter(Boolean).join(' · ');
            return `<div class="nut-line igual"><span class="nut-food">${UI.esc(a.alimento)}</span><span class="nut-dots"></span><span class="nut-qty">${UI.esc(cantidadTexto(a, vId) || '—')}</span></div>
              ${pie ? `<div class="nut-eq">${UI.esc(pie)}</div>` : ''}`;
          }).join('')}
        </div>`;
      }).join('');
      return `<div class="pauta-card${aplica ? '' : ' off'}">
        <div class="pauta-head">
          <span class="pauta-name">${UI.esc(op.nombre || 'Opción')}</span>
          ${aplica ? '' : '<span class="pauta-off">no toca hoy</span>'}
        </div>
        ${filas || '<p class="dim" style="font-size:13px">Sin alimentos.</p>'}
        <div class="pauta-foot">
          <button class="btn ghost small" data-open-op="${UI.esc(t.id)}|${UI.esc(op.id)}">${UI.icon('edit', 13)} Editar</button>
          <button class="btn ghost small" data-add-receta="${UI.esc(t.id)}|${UI.esc(op.id)}">${UI.icon('plus', 13)} Plato con esto</button>
        </div>
      </div>`;
    }).join('');

    // Un plato pertenece al tipo de día con el que se creó: en descanso no se ven
    // los de entreno y al revés. Los antiguos (sin tipo) se ven siempre.
    const platos = [];
    (t.opciones || []).forEach(op => (op.recetas || [])
      .filter(r => !r.varianteId || r.varianteId === vId)
      .forEach(r => platos.push({ op, r })));

    return `<div class="section">
      <div class="nut-head">
        <div class="nut-head-txt"><strong>${UI.esc(t.nombre)}</strong><span class="dim">${UI.esc(v ? v.nombre : '')}</span></div>
        ${docsDelPlan().length ? `<button class="icon-btn" id="nutDocs" title="Ver los documentos del plan">${UI.icon('book', 18)}</button>` : ''}
      </div>
      ${dias}
      ${platos.length ? `
        <div class="sec-label" id="nutPlatos">Tus platos</div>
        <div class="meal-list">${platos.map(({ op, r }) => `
          <button class="meal-card" data-receta="${UI.esc(t.id)}|${UI.esc(op.id)}|${UI.esc(r.id)}">
            <span class="meal-name">${UI.esc(r.nombre)}</span>
            <span class="meal-sub">${UI.esc(Object.values(r.elige || {}).map(e => typeof e === 'string' ? e : e.alimento).join(' · ') || op.nombre || '')}${extrasDe(r).length ? ` + ${UI.esc(extrasDe(r).map(x => x.alimento).join(' · '))}` : ''}</span>
            ${(r.preparacion || r.foto) ? `<span class="meal-flag">${r.foto ? UI.icon('tag', 11) + ' con foto' : ''}${(r.foto && r.preparacion) ? ' · ' : ''}${r.preparacion ? UI.icon('book', 11) + ' con preparación' : ''}</span>` : ''}
            <span class="meal-go">›</span>
          </button>`).join('')}</div>` : ''}

      <div class="sec-label"${platos.length ? '' : ' id="nutPlatos"'}>Lo que te toca</div>
      ${bloques || '<div class="empty-state"><p class="dim">Sin opciones todavía.</p></div>'}
      <button class="btn ghost block" data-add-op="${UI.esc(t.id)}">${UI.icon('plus', 15)} Añadir opción</button>
      ${platos.length ? '' : `<p class="field-hint">Cuando cocines algo con estas cantidades, dale a <strong>«Plato con esto»</strong> y la próxima vez lo tendrás aquí arriba sin pensarlo.</p>`}
      <button class="btn ghost block danger" data-rm-toma="${UI.esc(t.id)}" style="margin-top:26px">${UI.icon('trash', 15)} Borrar ${UI.esc(t.nombre)}</button>
    </div>`;
  }

  // Reduce la foto antes de guardarla: va dentro del plan y este se comparte.
  function fotoDesdeArchivo(file, cb) {
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        let w = img.width, h = img.height;
        if (w > max || h > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(c.toDataURL('image/jpeg', 0.72)); } catch (e) { cb(null); }
      };
      img.onerror = () => cb(null);
      img.src = rd.result;
    };
    rd.onerror = () => cb(null);
    rd.readAsDataURL(file);
  }

  // ---------- RECETAS: tus platos que cumplen una directriz ----------
  // Los extras son ingredientes de verdad: nombre + cantidad, como los de la pauta,
  // solo que marcados como añadidos por ti. Compat: antes eran una línea de texto.
  function extrasDe(r) {
    if (Array.isArray(r.extras)) return r.extras;
    if (typeof r.extras === 'string' && r.extras.trim()) return [{ alimento: r.extras.trim() }];
    return [];
  }
  function cantTexto(valor, unidad, nota) {
    const t = [valor, unidad].filter(v => v !== '' && v != null).join(' ').trim();
    return t || nota || '';
  }
  const extraTexto = (x) => cantTexto(x.valor, x.unidad, x.nota);
  const extraLineaHTML = (x) => `<div class="nut-row">
      <div class="nut-line"><span class="nut-food">${UI.esc(x.alimento)}</span><span class="nut-dots"></span><span class="nut-qty extra">${UI.esc(extraTexto(x) || '—')}</span></div>
      ${(x.nota && extraTexto(x) !== x.nota) ? `<div class="nut-eq">${UI.esc(x.nota)}</div>` : ''}
    </div>`;

  // La elección de un plato para una línea: qué alimento y con cuánta cantidad.
  // La pauta es la GUÍA: si no ajustas nada, se usa su cantidad; si la cambias,
  // manda la tuya. Compat: antes solo se guardaba el nombre del alimento.
  function eleccionDe(r, gid) {
    const e = (r.elige || {})[gid];
    if (!e) return null;
    return (typeof e === 'string') ? { alimento: e } : e;
  }
  function cantidadEfectiva(sel, alt, vId) {
    const c = cantidadDe(alt, vId) || {};
    const valor = (sel && sel.valor != null && sel.valor !== '') ? sel.valor : c.valor;
    const unidad = (sel && sel.unidad != null && sel.unidad !== '') ? sel.unidad : c.unidad;
    const ajustada = !!(sel && sel.valor != null && sel.valor !== '' && String(sel.valor) !== String(c.valor));
    return { valor, unidad, nota: c.nota, equivale: ajustada ? null : c.equivale, ajustada };
  }

  // Alimentos del plato, con la cantidad que tenga guardada (o la de la pauta).
  function recetaFilasHTML(opcion, r, vId) {
    return (opcion.grupos || []).map(g => {
      const alts = g.alternativas || [];
      if (!alts.length) return '';
      const sel = eleccionDe(r, g.id);
      const el = alts.find(a => a.alimento === (sel && sel.alimento)) || alts[0];
      const c = cantidadEfectiva(sel, el, vId);
      const pie = [c.nota, c.equivale ? `≡ ${c.equivale}` : '', c.ajustada ? 'ajustado por ti' : ''].filter(Boolean).join(' · ');
      return `<div class="nut-row">
        <div class="nut-line"><span class="nut-food">${UI.esc(el.alimento)}</span><span class="nut-dots"></span><span class="nut-qty${c.ajustada ? ' tuya' : ''}">${UI.esc(cantTexto(c.valor, c.unidad, c.nota) || '—')}</span></div>
        ${pie ? `<div class="nut-eq">${UI.esc(pie)}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ---------- FORMULARIO COMÚN de crear/editar plato ----------
  // Mismo formulario en los dos sitios: si al crear falta algo, falta también al
  // editar, y no hay dos caminos que mantener.
  function formRecetaHTML(opcion, vId, est) {
    const lineas = (opcion.grupos || []).map(g => {
      const alts = (g.alternativas || []).filter(a => (a.cantidades || {})[vId]);
      const lista = alts.length ? alts : (g.alternativas || []);
      if (!lista.length) return '';
      const sel = est.elige[g.id] || { alimento: lista[0].alimento };
      const alt = lista.find(a => a.alimento === sel.alimento) || lista[0];
      const guia = cantidadDe(alt, vId) || {};
      const chips = lista.length > 1
        ? `<div class="elige-opts">${lista.map(a => `<button type="button" class="nut-alt${a.alimento === sel.alimento ? ' on' : ''}" data-elige="${UI.esc(g.id)}" data-ali="${UI.esc(a.alimento)}">${UI.esc(a.alimento)}</button>`).join('')}</div>`
        : `<div class="elige-uno">${UI.esc(alt.alimento)}</div>`;
      return `<div class="elige-row">
        <span class="elige-lbl">${UI.esc(g.nombre || '')}</span>
        ${chips}
        <div class="nut-qrow">
          <span class="nut-qlbl">Cantidad</span>
          <input class="inp" data-cant="${UI.esc(g.id)}" data-f="valor" type="number" step="0.01" inputmode="decimal" value="${sel.valor != null && sel.valor !== '' ? UI.esc(sel.valor) : (guia.valor == null ? '' : UI.esc(guia.valor))}" placeholder="cantidad">
          <input class="inp" data-cant="${UI.esc(g.id)}" data-f="unidad" list="nutUnidades" value="${UI.esc(sel.unidad || guia.unidad || '')}" placeholder="g">
        </div>
        ${guia.valor != null ? `<div class="nut-eq">La pauta dice ${UI.esc(cantTexto(guia.valor, guia.unidad, guia.nota))}${guia.nota ? ` (${UI.esc(guia.nota)})` : ''}</div>` : ''}
      </div>`;
    }).join('');

    return `<div id="recForm">
      ${UI.field('Nombre del plato', UI.input('nombre', est.nombre || '', { placeholder: 'Ej: Risotto, Puchero, Salteado…' }))}
      <div class="sec-label">¿Con qué lo haces?</div>
      <div id="recElige">${lineas || '<p class="field-hint" style="margin:0">Esta opción no tiene alimentos.</p>'}</div>
      <p class="field-hint">Las cantidades vienen de la pauta, pero puedes ajustarlas: manda lo que pongas aquí.</p>
      <datalist id="nutUnidades">${UNIDADES.map(u => `<option value="${u}">`).join('')}</datalist>
      <div class="sec-label">Además le pones</div>
      <div id="recExtras"></div>
      <button type="button" class="btn ghost small block" id="recAddExtra">+ Añadir ingrediente</button>
      <div class="sec-label">Cómo se hace</div>
      <textarea class="inp" id="nutRecPrep" rows="5" placeholder="Los pasos, a tu manera…">${UI.esc(est.preparacion || '')}</textarea>
      <div class="sec-label">Foto</div>
      <div id="recFotoPrev">${est.foto ? `<img class="rec-foto" src="${est.foto}" alt="">` : ''}</div>
      <div class="pauta-foot" style="border:0;padding:0;margin-top:8px">
        <button type="button" class="btn ghost small" id="recFotoCam">${UI.icon('plus', 13)} Hacer foto</button>
        <button type="button" class="btn ghost small" id="recFoto">${UI.icon('upload', 13)} De la galería</button>
        <button type="button" class="btn ghost small danger" id="recFotoDel"${est.foto ? '' : ' style="display:none"'}>${UI.icon('trash', 13)} Quitar</button>
      </div>
    </div>`;
  }

  function bindRecetaForm(root, opcion, vId, est) {
    const leerCantidades = () => {
      root.querySelectorAll('[data-cant][data-f="valor"]').forEach(i => {
        const gid = i.dataset.cant;
        if (!est.elige[gid]) return;
        est.elige[gid].valor = i.value === '' ? null : parseFloat(i.value);
        const u = root.querySelector(`[data-cant="${gid}"][data-f="unidad"]`);
        est.elige[gid].unidad = u ? u.value.trim() : '';
      });
    };
    const repintar = () => {
      const box = root.querySelector('#recElige');
      const tmp = document.createElement('div');
      tmp.innerHTML = formRecetaHTML(opcion, vId, est);
      box.innerHTML = tmp.querySelector('#recElige').innerHTML;
      enganchar();
    };
    const enganchar = () => {
      root.querySelectorAll('[data-elige]').forEach(b => b.addEventListener('click', () => {
        leerCantidades();
        const gid = b.dataset.elige;
        const alt = (opcion.grupos.find(g => g.id === gid).alternativas || []).find(a => a.alimento === b.dataset.ali);
        const guia = cantidadDe(alt, vId) || {};
        est.elige[gid] = { alimento: b.dataset.ali, valor: guia.valor == null ? null : guia.valor, unidad: guia.unidad || '' };
        repintar();
      }));
    };
    enganchar();

    const pintarExtras = () => {
      const box = root.querySelector('#recExtras');
      box.innerHTML = est.extras.length
        ? est.extras.map((x, i) => `<button type="button" class="extra-row" data-ex="${i}">
             <span class="nut-food">${UI.esc(x.alimento)}</span><span class="nut-dots"></span>
             <span class="nut-qty extra">${UI.esc(extraTexto(x) || '—')}</span><span class="nut-mini">${UI.icon('edit', 12)}</span>
           </button>`).join('')
        : '<p class="field-hint" style="margin:0">Nada añadido todavía.</p>';
      box.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => {
        pedirExtra(est.extras[+b.dataset.ex], (val) => {
          if (val === null) est.extras.splice(+b.dataset.ex, 1);
          else if (val) est.extras[+b.dataset.ex] = val;
          pintarExtras();
        });
      }));
    };
    pintarExtras();
    root.querySelector('#recAddExtra').addEventListener('click', () => {
      pedirExtra(null, (val) => { if (val) { est.extras.push(val); pintarExtras(); } });
    });

    const pintarFoto = () => {
      root.querySelector('#recFotoPrev').innerHTML = est.foto ? `<img class="rec-foto" src="${est.foto}" alt="">` : '';
      root.querySelector('#recFotoDel').style.display = est.foto ? '' : 'none';
    };
    // Dos caminos a propósito: con accept="image/*" a secas, Android abre a veces
    // solo la galería. Con capture se va directo a la cámara.
    const pedirFoto = (conCamara) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      if (conCamara) inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', () => {
        const f = inp.files[0]; if (!f) return;
        fotoDesdeArchivo(f, (data) => { if (!data) { UI.toast('No se ha podido leer la foto', 'err'); return; } est.foto = data; pintarFoto(); });
      });
      inp.click();
    };
    root.querySelector('#recFotoCam').addEventListener('click', () => pedirFoto(true));
    root.querySelector('#recFoto').addEventListener('click', () => pedirFoto(false));
    root.querySelector('#recFotoDel').addEventListener('click', () => { est.foto = null; pintarFoto(); });

    return leerCantidades;
  }

  // Recoge el formulario en el estado. Devuelve false si falta el nombre.
  function leerFormReceta(root, est, leerCantidades) {
    const n = (root.querySelector('input[name="nombre"]').value || '').trim();
    if (!n) { UI.toast('Ponle un nombre', 'err'); return false; }
    leerCantidades();
    est.nombre = n;
    est.preparacion = (root.querySelector('#nutRecPrep').value || '').trim() || undefined;
    return true;
  }

  // ---------- VER un plato ----------
  function verReceta(app, tomaId, opId, recId) {
    const { toma, opcion } = ref(tomaId, opId);
    const r = opcion && (opcion.recetas || []).find(x => x.id === recId);
    if (!r) { app.render(); return; }
    const vs = _plan.variantes || [];
    const vId = r.varianteId || _varianteId || (varianteDeHoy(_plan, app) || {}).id || (vs[0] && vs[0].id);
    const vNombre = (vs.find(x => x.id === vId) || {}).nombre || '';
    const extras = extrasDe(r);

    UI.modal({
      title: r.nombre,
      size: 'wide',
      bodyHTML: `<p class="modal-text dim">${UI.esc(toma.nombre)} · ${UI.esc(opcion.nombre || '')}${vs.length > 1 ? ` · ${UI.esc(vNombre)}` : ''}</p>
        <div class="sec-label">Lo que lleva</div>
        ${recetaFilasHTML(opcion, r, vId) || '<p class="modal-text dim">Sin alimentos.</p>'}
        ${extras.length ? `<div class="sec-label">Además le pones</div>${extras.map(extraLineaHTML).join('')}` : ''}
        ${r.preparacion ? `<div class="sec-label">Cómo se hace</div><p class="modal-text prewrap">${UI.esc(r.preparacion)}</p>` : ''}
        ${r.foto ? `<img class="rec-foto" src="${r.foto}" alt="">` : ''}`,
      actions: [
        { label: 'Borrar', kind: 'danger', onClick: async () => {
          const i = opcion.recetas.indexOf(r);
          if (i >= 0) opcion.recetas.splice(i, 1);
          await guardar(app); UI.toast('Plato borrado');
        } },
        { label: 'Editar plato', kind: 'primary', onClick: () => { setTimeout(() => editarReceta(app, tomaId, opId, recId), 220); } },
      ],
    });
  }

  // ---------- EDITAR ----------
  function editarReceta(app, tomaId, opId, recId) {
    const { opcion } = ref(tomaId, opId);
    const r = opcion && (opcion.recetas || []).find(x => x.id === recId);
    if (!r) { app.render(); return; }
    const vs = _plan.variantes || [];
    const vId = r.varianteId || (vs[0] && vs[0].id);
    const est = {
      nombre: r.nombre, preparacion: r.preparacion, foto: r.foto || null,
      extras: extrasDe(r).slice(),
      elige: Object.fromEntries((opcion.grupos || []).map(g => {
        const sel = eleccionDe(r, g.id);
        const alts = g.alternativas || [];
        const alt = alts.find(a => a.alimento === (sel && sel.alimento)) || alts[0];
        if (!alt) return null;
        const c = cantidadEfectiva(sel, alt, vId);
        return [g.id, { alimento: alt.alimento, valor: c.valor == null ? null : c.valor, unidad: c.unidad || '' }];
      }).filter(Boolean)),
    };
    let leerCantidades;
    UI.modal({
      title: `Editar ${r.nombre}`,
      size: 'wide',
      bodyHTML: formRecetaHTML(opcion, vId, est),
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          if (!leerFormReceta(root, est, leerCantidades)) return false;
          r.nombre = est.nombre; r.elige = est.elige;
          r.extras = est.extras.length ? est.extras : undefined;
          r.preparacion = est.preparacion;
          if (est.foto) r.foto = est.foto; else delete r.foto;
          await guardar(app);
          UI.toast('Plato guardado');
        } },
      ],
      onMount: (root) => { leerCantidades = bindRecetaForm(root, opcion, vId, est); },
    });
  }

  // Alta/edición de un ingrediente extra. onDone(valor | null para borrar | undefined si cancela)
  function pedirExtra(actual, onDone) {
    UI.modal({
      title: actual ? 'Ingrediente extra' : 'Añadir ingrediente',
      bodyHTML: `<div id="exForm">
        ${UI.field('Ingrediente', UI.input('alimento', actual ? actual.alimento : '', { placeholder: 'Cebolla, pimiento…' }))}
        <div class="nut-qrow">
          <span class="nut-qlbl">Cantidad</span>
          <input class="inp" name="valor" type="number" step="0.01" inputmode="decimal" value="${actual && actual.valor != null ? UI.esc(actual.valor) : ''}" placeholder="cantidad">
          <input class="inp" name="unidad" list="nutUnidadesEx" value="${UI.esc((actual && actual.unidad) || 'g')}" placeholder="g">
        </div>
        <datalist id="nutUnidadesEx">${UNIDADES.map(u => `<option value="${u}">`).join('')}</datalist>
        ${UI.field('Nota (opcional)', UI.input('nota', (actual && actual.nota) || '', { placeholder: 'al gusto, picada…' }))}
        <p class="field-hint">Déjalo sin cantidad si va al gusto.</p>
      </div>`,
      actions: [
        actual ? { label: 'Quitar', kind: 'danger', onClick: () => onDone(null) }
               : { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: (root) => {
          const a = (root.querySelector('input[name="alimento"]').value || '').trim();
          if (!a) { UI.toast('Ponle nombre', 'err'); return false; }
          const val = root.querySelector('input[name="valor"]').value;
          const uni = (root.querySelector('input[name="unidad"]').value || '').trim();
          const nota = (root.querySelector('input[name="nota"]').value || '').trim();
          const out = { alimento: a };
          if (val !== '') { out.valor = parseFloat(val); out.unidad = uni; }
          if (nota) out.nota = nota;
          onDone(out);
        } },
      ],
    });
  }

  // ---------- CREAR ----------
  function addReceta(app, tomaId, opId) {
    const { opcion } = ref(tomaId, opId);
    if (!opcion) return;
    const { vs, vId, v } = variantesDe(app);
    const est = {
      nombre: '', preparacion: '', foto: null, extras: [],
      elige: Object.fromEntries((opcion.grupos || []).map(g => {
        const alts = (g.alternativas || []).filter(a => (a.cantidades || {})[vId]);
        const lista = alts.length ? alts : (g.alternativas || []);
        if (!lista.length) return null;
        const c = cantidadDe(lista[0], vId) || {};
        return [g.id, { alimento: lista[0].alimento, valor: c.valor == null ? null : c.valor, unidad: c.unidad || '' }];
      }).filter(Boolean)),
    };
    let leerCantidades;
    UI.modal({
      title: 'Guardar un plato',
      size: 'wide',
      bodyHTML: `<p class="modal-text">Le pones nombre a lo que cocinas y queda guardado para la próxima vez.</p>
        ${vs.length > 1 ? `<p class="modal-text"><strong>Se guarda para ${UI.esc(v ? v.nombre.toLowerCase() : '')}</strong>, que es el día que tienes seleccionado.</p>` : ''}
        ${formRecetaHTML(opcion, vId, est)}`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          if (!leerFormReceta(root, est, leerCantidades)) return false;
          opcion.recetas = opcion.recetas || [];
          opcion.recetas.push({
            id: DB.uid('rec'), nombre: est.nombre, varianteId: vId, elige: est.elige,
            extras: est.extras.length ? est.extras : undefined,
            preparacion: est.preparacion,
            foto: est.foto || undefined,
          });
          await guardar(app);
          UI.toast(`"${est.nombre}" guardado en tus platos`);
          setTimeout(() => { const el = document.getElementById('nutPlatos'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
        } },
      ],
      onMount: (root) => { leerCantidades = bindRecetaForm(root, opcion, vId, est); },
    });
  }

  // El editor de una opción es UN SOLO modal: los alimentos se añaden y se editan
  // aquí dentro, en la propia lista. Antes cada "+" cerraba este modal y abría
  // otro, y se perdía el hilo de lo que estabas montando.
  function abrirComida(app, tomaId, opId, opts) {
    const { toma, opcion: real } = ref(tomaId, opId);
    if (!toma || !real) { app.render(); return; }
    const vs = _plan.variantes || [];
    const vIdHoy = _varianteId || (varianteDeHoy(_plan, app) || {}).id || (vs[0] && vs[0].id);
    const vId = vIdHoy;
    // Se trabaja sobre una copia: nada se guarda hasta pulsar Guardar.
    const op = JSON.parse(JSON.stringify(real));
    op.grupos = op.grupos || [];
    const dias = variantesDeOpcion(op, vs).map(v => v.id);
    const vsOp = () => vs.filter(v => dias.includes(v.id));
    let abierta = null;   // "gi|ai" de la fila que se está editando

    const altVacio = () => ({ alimento: '', cantidades: {} });
    if (opts && opts.nuevo && !op.grupos.length) {
      op.grupos.push({ id: DB.uid('g'), nombre: '', alternativas: [altVacio()] });
      abierta = '0|0';
    }

    // ---- pintar ----
    const filaVistaHTML = (a, gi, ai) => {
      const vId = dias.includes(vIdHoy) ? vIdHoy : dias[0];
      const c = cantidadDe(a, vId) || {};
      const pie = [notaDe(a, vId), c.equivale ? `≡ ${c.equivale}` : ''].filter(Boolean).join(' · ');
      return `<div class="nut-line igual">
          <span class="nut-food">${UI.esc(a.alimento || 'Sin nombre')}</span>
          <span class="nut-dots"></span>
          <span class="nut-qty">${UI.esc(cantidadTexto(a, vId) || '—')}</span>
          <button class="nut-mini" data-ed="${gi}|${ai}" title="Editar ${UI.esc(a.alimento)}">${UI.icon('edit', 13)}</button>
        </div>
        ${pie ? `<div class="nut-eq">${UI.esc(pie)}</div>` : ''}`;
    };

    const filaEditHTML = (a, gi, ai) => {
      const dvs = vsOp();
      const cants = dvs.map(v => cantidadDe(a, v.id) || {});
      const puestas = cants.filter(c => c.valor != null || c.unidad);
      const mismo = !puestas.length || (puestas.length === dvs.length &&
        cants.every(c => c.valor === cants[0].valor && (c.unidad || '') === (cants[0].unidad || '')));
      const c0 = puestas[0] || {};
      const fila = (id, etiqueta, c) => `<div class="nut-qrow">
        <span class="nut-qlbl">${UI.esc(etiqueta)}</span>
        <input class="inp" data-q="${UI.esc(id)}" data-f="valor" type="number" step="0.01" inputmode="decimal" value="${c.valor == null ? '' : UI.esc(c.valor)}" placeholder="60">
        <input class="inp" data-q="${UI.esc(id)}" data-f="unidad" list="nutUnidades" value="${UI.esc(c.unidad || 'g')}" placeholder="g">
      </div>`;
      return `<div class="fila-ed">
        <input class="inp" data-nombre value="${UI.esc(a.alimento || '')}" placeholder="Alimento. Ej: Arroz integral" autocomplete="off">
        ${dvs.length > 1 ? `<label class="metric-opt"><input type="checkbox" data-mismo${mismo ? ' checked' : ''}><span>La misma cantidad todos los días</span></label>` : ''}
        <div data-uni${dvs.length > 1 && !mismo ? ' hidden' : ''}>${fila('__uni', 'Cantidad', c0)}</div>
        ${dvs.length > 1 ? `<div data-dias${mismo ? ' hidden' : ''}>
          ${dvs.map((v, i) => fila(v.id, v.nombre, cants[i])).join('')}
          <p class="field-hint" style="margin-top:-2px">Deja en blanco el día en que <strong>no</strong> lo tomes.</p>
        </div>` : ''}
        <details class="det"${(c0.nota || c0.equivale) ? ' open' : ''}>
          <summary>Nota y equivalencia</summary>
          <div class="det-body">
            ${UI.field('Nota', `<input class="inp" data-nota value="${UI.esc(c0.nota || '')}" placeholder="en crudo, al gusto…">`)}
            ${UI.field('Equivalencia', `<input class="inp" data-equivale value="${UI.esc(c0.equivale || '')}" placeholder="180 g cocido">`, 'La MISMA cantidad medida de otra forma. No es otro alimento.')}
          </div>
        </details>
        <div class="fila-ed-foot">
          <button class="btn ghost small danger" data-quitar="${gi}|${ai}">${UI.icon('trash', 13)} Quitar</button>
          <button class="btn primary small" data-hecho>${UI.icon('check', 13)} Hecho</button>
        </div>
      </div>`;
    };

    const cuerpoHTML = () => op.grupos.map((g, gi) => `<div class="grp-card">
        <input class="inp grp-name" data-gname="${gi}" value="${UI.esc(g.nombre || '')}" placeholder="Tipo: hidrato, proteína, grasa…">
        ${g.nombre ? '' : `<div class="tipo-chips">${TIPOS.map(t => `<button type="button" class="nut-alt" data-tipo="${gi}|${UI.esc(t)}">${UI.esc(t)}</button>`).join('')}</div>`}
        ${(g.alternativas || []).length > 1 ? '<p class="grp-hint">Cualquiera de estos, nunca los dos a la vez.</p>' : ''}
        ${(g.alternativas || []).map((a, ai) => abierta === `${gi}|${ai}` ? filaEditHTML(a, gi, ai) : filaVistaHTML(a, gi, ai)).join('')}
        <button class="btn ghost small" data-add-alt="${gi}">${UI.icon('plus', 13)} Otro que valga lo mismo</button>
      </div>`).join('') || '<p class="modal-text dim">Empieza por un tipo de alimento: el hidrato, la proteína…</p>';

    // ---- leer lo que hay escrito antes de repintar o guardar ----
    const leer = (root) => {
      const n = (root.querySelector('input[name="opNombre"]').value || '').trim();
      if (n) op.nombre = n;
      root.querySelectorAll('[data-gname]').forEach(inp => {
        const g = op.grupos[+inp.dataset.gname];
        const v = (inp.value || '').trim();
        if (g && v) g.nombre = v;
      });
      const ed = root.querySelector('.fila-ed');
      if (!ed || !abierta) return;
      const [gi, ai] = abierta.split('|').map(Number);
      const a = (op.grupos[gi] || { alternativas: [] }).alternativas[ai];
      if (!a) return;
      a.alimento = (ed.querySelector('[data-nombre]').value || '').trim();
      const nota = (ed.querySelector('[data-nota]').value || '').trim();
      const equivale = (ed.querySelector('[data-equivale]').value || '').trim();
      const dato = (id) => {
        const v = ed.querySelector(`[data-q="${id}"][data-f="valor"]`);
        const u = ed.querySelector(`[data-q="${id}"][data-f="unidad"]`);
        if (!v) return { val: '', uni: '' };
        return { val: v.value, uni: (u.value || '').trim() };
      };
      const chk = ed.querySelector('[data-mismo]');
      const unico = !chk || chk.checked;
      const cantidades = {};
      const meter = (vid, val, uni, siempre) => {
        if (val === '' && !uni && !siempre) return;   // en blanco = ese día no se toma
        const c = { valor: val === '' ? null : parseFloat(val), unidad: uni };
        if (nota) c.nota = nota;
        if (equivale) c.equivale = equivale;
        cantidades[vid] = c;
      };
      if (unico) {
        const { val, uni } = dato('__uni');
        // Sin número es "al gusto"; se guarda igual para que el alimento cuente.
        vsOp().forEach(v => meter(v.id, val, val === '' ? '' : uni, true));
      }
      else vsOp().forEach(v => { const { val, uni } = dato(v.id); meter(v.id, val, uni); });
      a.cantidades = cantidades;
    };

    // Fuera lo que se quedó a medias y nombres de línea coherentes.
    const limpiar = () => {
      op.grupos.forEach(g => { g.alternativas = (g.alternativas || []).filter(a => a.alimento); });
      op.grupos = op.grupos.filter(g => g.alternativas.length);
      op.grupos.forEach(g => { if (!g.nombre) g.nombre = g.alternativas[0].alimento; });
    };

    const volcar = () => {
      real.nombre = op.nombre; real.grupos = op.grupos;
      if (vs.length > 1) real.variantes = dias.slice();
    };

    UI.modal({
      title: real.nombre || 'Opción',
      size: 'wide',
      bodyHTML: `
        <p class="modal-text dim">${UI.esc(toma.nombre)}${vs.length > 1 ? ` · ${UI.esc((vs.find(x => x.id === vId) || {}).nombre || '')}` : ''}</p>
        ${UI.field('Cómo la llamas', UI.input('opNombre', op.nombre || '', { placeholder: 'Arroz o pasta, Legumbres…' }), 'La etiqueta que ves al elegir. No es el nombre de un plato.')}
        ${vs.length > 1 ? selectorDiasHTML(vs, dias) : ''}
        <div class="sec-label">Lo que lleva</div>
        <div id="opBody">${cuerpoHTML()}</div>
        <button class="btn ghost block" id="nutAddAli">${UI.icon('plus', 15)} Añadir tipo de alimento</button>
        <datalist id="nutUnidades">${UNIDADES.map(u => `<option value="${u}">`).join('')}</datalist>
        <p class="field-hint">Cada bloque es un <strong>tipo</strong> de alimento —el hidrato, la proteína, la grasa— y dentro van los alimentos que valen lo mismo: arroz <em>o</em> pasta <em>o</em> cuscús, con su cantidad.</p>`,
      actions: [
        { label: 'Borrar', kind: 'danger', onClick: async () => {
          const i = toma.opciones.indexOf(real);
          if (i >= 0) toma.opciones.splice(i, 1);
          await guardar(app); UI.toast('Opción borrada');
        } },
        { label: 'Duplicar', kind: 'ghost', onClick: async (root) => {
          leer(root); limpiar(); volcar();
          const copia = JSON.parse(JSON.stringify(real));
          copia.id = DB.uid('o'); copia.nombre = `${real.nombre} (copia)`;
          toma.opciones.push(copia);
          await guardar(app);
          UI.toast('Duplicada · cámbiale el nombre');
        } },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          leer(root); limpiar();
          if (!op.grupos.length) { UI.toast('Ponle al menos un alimento', 'err'); return false; }
          volcar();
          await guardar(app);
        } },
      ],
      onMount: (root) => {
        const pintar = () => {
          root.querySelector('#opBody').innerHTML = cuerpoHTML();
          enganchar();
          const ed = root.querySelector('.fila-ed');
          if (ed) { ed.scrollIntoView({ block: 'nearest' }); const i = ed.querySelector('[data-nombre]'); if (i && !i.value) i.focus(); }
        };
        const enganchar = () => {
          root.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => {
            leer(root); abierta = b.dataset.ed; pintar();
          }));
          root.querySelectorAll('[data-add-alt]').forEach(b => b.addEventListener('click', () => {
            leer(root);
            const g = op.grupos[+b.dataset.addAlt];
            g.alternativas.push(altVacio());
            abierta = `${b.dataset.addAlt}|${g.alternativas.length - 1}`;
            pintar();
          }));
          const hecho = root.querySelector('[data-hecho]');
          if (hecho) hecho.addEventListener('click', () => { leer(root); abierta = null; pintar(); });
          const quitar = root.querySelector('[data-quitar]');
          if (quitar) quitar.addEventListener('click', () => {
            const [gi, ai] = quitar.dataset.quitar.split('|').map(Number);
            op.grupos[gi].alternativas.splice(ai, 1);
            if (!op.grupos[gi].alternativas.length) op.grupos.splice(gi, 1);
            abierta = null; pintar();
          });
          root.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
            const [gi, t] = b.dataset.tipo.split('|');
            const inp = root.querySelector(`[data-gname="${gi}"]`);
            inp.value = t;
            b.closest('.tipo-chips').remove();
          }));
          const chk = root.querySelector('[data-mismo]');
          if (chk) chk.addEventListener('change', () => {
            root.querySelector('[data-uni]').hidden = !chk.checked;
            root.querySelector('[data-dias]').hidden = chk.checked;
          });
        };
        enganchar();
        // Cambiar de días repinta: las filas abiertas preguntan por los nuevos.
        bindDias(root, dias);
        root.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => { leer(root); pintar(); }));
        root.querySelector('#nutAddAli').addEventListener('click', () => {
          leer(root);
          op.grupos.push({ id: DB.uid('g'), nombre: '', alternativas: [altVacio()] });
          abierta = `${op.grupos.length - 1}|0`;
          pintar();
        });
      },
    });
  }

  // ---------- ASISTENTE DE PRIMEROS PASOS ----------
  // En vez de soltar al usuario en un editor vacío, se le lleva de la mano hasta
  // tener UNA comida completa, que es cuando la sección ya sirve para algo.
  function wizard(app) {
    UI.modal({
      title: 'Paso 1 de 3 · Tu plan',
      bodyHTML: `<p class="modal-text">Vamos a montar tu primera comida. Son tres pasos y luego puedes seguir añadiendo cuando quieras.</p>
        ${UI.field('¿Cómo la llamamos?', UI.input('nombre', 'Mi plan', { placeholder: 'Mi plan' }))}
        <label class="metric-opt"><input type="checkbox" id="nutDias" checked><span>Como distinto los días que entreno</span></label>
        <p class="field-hint">Si lo marcas, cada alimento guardará dos cantidades y la app enseñará la que toque mirando tu plan de entreno.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Siguiente', kind: 'primary', onClick: async (root) => {
          const nombre = (root.querySelector('input[name="nombre"]').value || '').trim() || 'Mi plan';
          const dos = root.querySelector('#nutDias').checked;
          const variantes = dos
            ? [{ id: 'v_desc', nombre: 'Día de descanso', match: { porTipoDia: ['rest'] } },
               { id: 'v_ent', nombre: 'Día de entrenamiento', match: { porTipoDia: ['strong', 'moderate', 'light'] } }]
            : [{ id: 'v_uni', nombre: 'Todos los días', match: null }];
          for (const x of await DB.nutritionOf(app.activeUser.id)) { x.isPrimary = false; await DB.saveNutrition(x); }
          _plan = { id: DB.uid('nut'), userId: app.activeUser.id, isPrimary: true, createdAt: Date.now(),
                    schemaVersion: SCHEMA_VERSION, nombre, tipoDetectado: 'intercambios',
                    variantes, tomas: [], reglas: [], suplementos: [], dudas: [] };
          _planId = _plan.id;
          await DB.saveNutrition(_plan);
          app.go('nutrition', { planId: _plan.id }, true);
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
      bodyHTML: `<p class="modal-text">Ponle nombre a una de las opciones que tienes para esta comida —«Arroz o pasta», «Legumbres»—. Luego le añadirás los alimentos con sus cantidades.</p>
        ${UI.field('Cómo la llamas', UI.input('nombre', '', { placeholder: 'Ej: Arroz o pasta, Yogur con fruta…' }))}`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear', kind: 'primary', onClick: async (root) => {
          const n = (root.querySelector('input[name="nombre"]').value || '').trim();
          if (!n) { UI.toast('Ponle un nombre', 'err'); return false; }
          const op = { id: DB.uid('o'), nombre: n, grupos: [] };
          toma.opciones.push(op);
          await DB.saveNutrition(_plan);
          irAToma(app, toma.id);
          setTimeout(() => abrirComida(app, toma.id, op.id, { nuevo: true }), 300);
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
  // Volver a la pantalla de una comida concreta (tras crearla en el asistente).
  const irAToma = (app, tomaId) => app.go('nutrition', { planId: _planId, tomaId });

  function addOpcion(app, toma) {
    const vs = _plan.variantes || [];
    const elegidas = vs.map(v => v.id);
    UI.modal({
      title: `Nueva opción · ${UI.esc(toma.nombre)}`,
      bodyHTML: `${UI.field('Cómo la llamas', UI.input('nombre', '', { placeholder: 'Ej: Arroz o pasta, Legumbres, Tortitas…' }))}
        ${vs.length > 1 ? selectorDiasHTML(vs, elegidas) : ''}
        <p class="field-hint">Es una de las <strong>opciones que te marcó tu nutricionista</strong> para esta comida, no un plato: después le pones los alimentos y sus cantidades. Los platos que cocines con ella se guardan aparte.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear', kind: 'primary', onClick: async (root) => {
          const n = (root.querySelector('input[name="nombre"]').value || '').trim();
          if (!n) { UI.toast('Ponle un nombre', 'err'); return false; }
          const op = { id: DB.uid('o'), nombre: n, grupos: [] };
          if (vs.length > 1) op.variantes = elegidas.slice();
          toma.opciones.push(op);
          const tid = toma.id, oid = op.id;
          await guardar(app);
          setTimeout(() => abrirComida(app, tid, oid, { nuevo: true }), 300);
        } },
      ],
      onMount: (root) => bindDias(root, elegidas),
    });
  }

  async function adjuntarDoc(app) {
    const yaEstan = (_plan.docIds || []);
    const libres = _docs.filter(d => !yaEstan.includes(d.id));
    const subir = async (file) => {
      if (file.size > app.MAX_DOC_MB * 1048576) { UI.toast(`Máximo ${app.MAX_DOC_MB} MB por documento`, 'err'); return; }
      const rec = await DB.addFile(app.activeUser.id, { name: file.name, type: file.type, size: file.size, data: await file.arrayBuffer() });
      _plan.docIds = yaEstan.concat(rec.id);
      await guardar(app);
      UI.toast('Documento adjuntado');
    };
    const elegirArchivo = () => {
      const inp = document.createElement('input');
      inp.type = 'file';   // sin filtro: en Android los adjuntos de WhatsApp llegan como octet-stream
      inp.addEventListener('change', async () => { const f = inp.files[0]; if (f) await subir(f); });
      inp.click();
    };

    UI.modal({
      title: 'Adjuntar documento',
      bodyHTML: `<p class="modal-text">El PDF de tu nutricionista, una foto de la hoja que te dio… Se queda enganchado al plan y lo abres desde cualquier comida.</p>
        ${libres.length ? `<div class="sec-label">Ya los tienes en el móvil</div>
          <div class="menu-list">${libres.map(d => `<button class="picker-row" data-pick="${UI.esc(d.id)}"><span class="picker-name">${UI.icon(app.docIcon(d.type), 16)} ${UI.esc(d.name)}</span></button>`).join('')}</div>` : ''}
        <button class="btn ghost block" id="nutDocFile" style="margin-top:12px">${UI.icon('plus', 15)} Buscar en el móvil</button>
        <p class="field-hint">Los documentos se guardan <strong>solo en este dispositivo</strong>: si compartes el plan, el archivo no viaja con él.</p>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', async () => {
          _plan.docIds = yaEstan.concat(b.dataset.pick);
          UI.closeModal(root);
          await guardar(app);
          UI.toast('Documento adjuntado');
        }));
        root.querySelector('#nutDocFile').addEventListener('click', () => { UI.closeModal(root); elegirArchivo(); });
      },
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
  function bind(app, root, params) {
    if (_saltarA) { const id = _saltarA; _saltarA = null; app.go('nutrition', { planId: id }); return; }

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

    // elegir plan cuando hay varios
    root.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => {
      app.go('nutrition', { planId: b.dataset.plan });
    }));
    // día (descanso / entrenamiento)
    root.querySelectorAll('[data-variante]').forEach(b => b.addEventListener('click', () => {
      _varianteId = b.dataset.variante; app.render();
    }));
    // entrar en una comida
    root.querySelectorAll('[data-toma]').forEach(b => b.addEventListener('click', () => {
      app.go('nutrition', { planId: _planId, tomaId: b.dataset.toma });
    }));

    const tomaPorId = (id) => (_plan.tomas || []).find(t => t.id === id);
    root.querySelectorAll('[data-add-op]').forEach(b => b.addEventListener('click', () => {
      const t = tomaPorId(b.dataset.addOp); if (t) addOpcion(app, t);
    }));
    root.querySelectorAll('[data-open-op]').forEach(b => b.addEventListener('click', () => {
      const [tid, oid] = b.dataset.openOp.split('|');
      abrirComida(app, tid, oid);
    }));
    root.querySelectorAll('[data-receta]').forEach(b => b.addEventListener('click', () => {
      const [tid, oid, rid] = b.dataset.receta.split('|');
      verReceta(app, tid, oid, rid);
    }));
    root.querySelectorAll('[data-add-receta]').forEach(b => b.addEventListener('click', () => {
      const [tid, oid] = b.dataset.addReceta.split('|');
      addReceta(app, tid, oid);
    }));
    root.querySelectorAll('[data-rm-toma]').forEach(b => b.addEventListener('click', async () => {
      const t = tomaPorId(b.dataset.rmToma);
      if (!t) return;
      await borrarToma(app, t);
      app.go('nutrition', { planId: _planId }, true);
    }));
    root.querySelectorAll('[data-duda]').forEach(b => b.addEventListener('click', async () => {
      const i = parseInt(b.dataset.duda, 10);
      _plan.dudas.splice(i, 1);
      await guardar(app);
      UI.toast(_plan.dudas.length ? `Aclarada · quedan ${_plan.dudas.length}` : 'Sin dudas pendientes');
    }));

    const addDoc = root.querySelector('#nutAddDoc');
    if (addDoc) addDoc.addEventListener('click', () => adjuntarDoc(app));
    root.querySelectorAll('[data-doc-open]').forEach(b => b.addEventListener('click', () => {
      const d = _docs.find(x => x.id === b.dataset.docOpen); if (d) app.openDoc(d);
    }));
    root.querySelectorAll('[data-doc-rm]').forEach(b => b.addEventListener('click', async () => {
      // Se desengancha del plan; el archivo sigue en Documentos.
      _plan.docIds = (_plan.docIds || []).filter(id => id !== b.dataset.docRm);
      await guardar(app);
      UI.toast('Quitado del plan · sigue en Documentos');
    }));
    const verDocs = root.querySelector('#nutDocs');
    if (verDocs) verDocs.addEventListener('click', () => {
      const ds = docsDelPlan();
      if (ds.length === 1) { app.openDoc(ds[0]); return; }
      UI.modal({
        title: 'Documentos del plan',
        bodyHTML: `<div class="menu-list">${ds.map(d => `<button class="picker-row" data-doc="${UI.esc(d.id)}"><span class="picker-name">${UI.icon(app.docIcon(d.type), 16)} ${UI.esc(d.name)}</span></button>`).join('')}</div>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
        onMount: (r) => r.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', () => {
          const d = ds.find(x => x.id === b.dataset.doc); if (d) app.openDoc(d);
        })),
      });
    });

    const addT = root.querySelector('#nutAddToma');
    if (addT) addT.addEventListener('click', () => addToma(app));

    const share = root.querySelector('#nutShare');
    if (share) share.addEventListener('click', () => VData.exportNutrition(app, _plan));
    const del = root.querySelector('#nutDel');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Borrar plan', message: 'Se borrará este plan de nutrición entero, con sus comidas y tus platos.', confirmLabel: 'Borrar', danger: true });
      if (!ok) return;
      await DB.del('nutrition', _plan.id);
      _plan = null; _planId = null;
      app.go('nutrition', { lista: 1 }, true);
      UI.toast('Plan borrado');
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
          marcarPrompt(); // al volver, la pantalla ofrece "pegar el resultado"
        } },
      ],
    });
  }

  // La gente pega lo que le da la IA tal cual: con vallas de markdown, con un
  // "Aquí tienes tu JSON:" delante, o con texto detrás. Se limpia todo eso antes
  // de intentar entenderlo, en vez de soltar "no es un JSON válido".
  function extraerJSON(txt) {
    let t = String(txt || '').trim();
    const bloque = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (bloque) t = bloque[1].trim();
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    return JSON.parse(t);
  }

  function pegarFlow(app) {
    UI.modal({
      title: 'Pegar el resultado',
      size: 'wide',
      bodyHTML: `<p class="modal-text">La IA te devuelve un bloque de texto. Tienes dos formas de traerlo:</p>
        <ul class="nut-check">
          <li><strong>Si te ha dado un archivo</strong>: búscalo con el botón de aquí abajo, o ábrelo desde tus descargas y dale a <strong>Compartir → Traindía</strong>.</li>
          <li><strong>Si te lo ha escrito en el chat</strong>: toca el <strong>botón de copiar</strong> que aparece en la esquina del bloque, vuelve aquí y pega abajo.</li>
        </ul>
        <button class="btn ghost block" id="nutFile">${UI.icon('upload', 15)} Elegir el archivo</button>
        <div class="nut-or"><span>o pégalo aquí</span></div>
        <textarea class="inp" id="nutJson" rows="6" placeholder="Pega aquí lo que te haya dado la IA"></textarea>
        <p class="field-hint">Da igual si viene con texto alrededor o con las comillas del bloque: se limpia solo.</p>`,
      onMount: (root) => {
        root.querySelector('#nutFile').addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file';   // sin filtro: en Android los .json llegan como octet-stream
          inp.addEventListener('change', () => {
            const f = inp.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
              let parsed;
              try { parsed = extraerJSON(rd.result); }
              catch (e) { UI.toast('Ese archivo no se entiende. ¿Es el que te dio la IA?', 'err'); return; }
              UI.closeModal(root);
              previsualizar(app, parsed);
            };
            rd.readAsText(f);
          });
          inp.click();
        });
      },
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        { label: 'Revisar', kind: 'primary', onClick: (root) => {
          const txt = (root.querySelector('#nutJson').value || '').trim();
          if (!txt) { UI.toast('Pega aquí lo que te dio la IA', 'err'); return false; }
          let parsed;
          try { parsed = extraerJSON(txt); }
          catch (e) { UI.toast('No he sabido leer eso. Copia el bloque entero, desde la primera llave.', 'err'); return false; }
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
        { label: 'Guardar plan', kind: 'primary', onClick: async () => {
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
          _plan = rec; _planId = rec.id; _abierta = {}; _varianteId = null;
          app.go('nutrition', { planId: rec.id }, true);
          UI.toast('Plan guardado');
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
Te adjunto mi plan de alimentación.

# CÓMO ME LO TIENES QUE ENTREGAR (importante)
1. Si puedes generar archivos descargables, dame el resultado como un ARCHIVO llamado
   "traindia-nutricion.json". Es lo que más me facilita las cosas.
2. Además, y siempre, escribe el JSON dentro de un bloque de código \`\`\`json … \`\`\`
   para que pueda copiarlo con el botón de copiar.
3. No escribas nada más: ni resumen, ni explicación, ni comentarios dentro del JSON.

# REGLA MÁS IMPORTANTE
NO INVENTES NADA. Solo puedes usar lo que aparezca literalmente en el documento.
Si una cantidad, un alimento o una toma no está clara, NO la rellenes con lo que te parezca
razonable: déjala vacía y describe el problema en el array "dudas". Es una dieta real de una
persona; un gramaje inventado puede hacer daño.

# QUÉ *NO* ES UNA DUDA (muy importante: no llenes "dudas" de ruido)
Es COMPLETAMENTE NORMAL que una opción o un alimento exista solo en uno de los tipos de día.
Simplemente NO pongas cantidad para el día en que no figura, y NO lo menciones en "dudas".
La app ya lo entiende y lo muestra bien. Tampoco es una duda que dos días tengan distinto
número de opciones, ni que una opción tenga más alimentos que otra.
Reserva "dudas" para lo que de verdad no se puede resolver leyendo el documento: texto
ilegible, cantidades contradictorias, o una cantidad que falta donde claramente debería estar.
Si no hay nada así, devuelve "dudas": [].

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

# CÓMO NOMBRAR LAS OPCIONES (importante)
El "nombre" de cada opción es una ETIQUETA CORTA para elegir de un vistazo, no la descripción
de un plato. Usa el alimento principal, de una a tres palabras:
  BIEN: "Yogur" · "Pan" · "Tortitas" · "Arroz o pasta" · "Legumbres" · "Patata"
  MAL:  "Lácteo o bebida vegetal con café o infusión" · "Pan con grasa, proteína y fruta"
El usuario creará después SUS PROPIOS PLATOS a partir de estas opciones (p. ej. "Yogur con
granola" o "Risotto"), así que las opciones no deben parecer ya un plato terminado.

# UNIDADES
Usa "g", "ml", "unidad", "pieza", "ración", "cucharada" o "puñado". Si el documento no da
cantidad (café, infusión, ensalada…), pon valor null, unidad "" y una nota BREVE: "al gusto"
o "sin especificar". Nunca frases largas como "cantidad no especificada en el documento".

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
        { "id": "v_desc", "nombre": "Día de descanso", "match": { "porTipoDia": ["rest"] } },
        { "id": "v_ent", "nombre": "Día de entrenamiento", "match": { "porTipoDia": ["strong", "moderate", "light"] } }
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
- Copia las "variantes" tal cual del ejemplo si la dieta distingue entreno y descanso.
  Los tipos válidos son "strong", "moderate", "light" y "rest"; los tres primeros son
  días en los que se entrena (un día ligero también se entrena) y solo "rest" es descanso.
- Toda alternativa debe traer una cantidad por CADA variante que declares.
- Si una toma tiene varias opciones, créalas todas: son alternativas de toma completa.
- Deja "dudas" como array vacío solo si de verdad no hay ninguna.

# MI CASO
${extra.join('\n')}

Devuelve únicamente el JSON, en un bloque de código, y como archivo descargable si puedes.`;
  }

  return { render, bind, buildPrompt, validar, previewImport: previsualizar, headerTitle, SCHEMA_VERSION };
})();
