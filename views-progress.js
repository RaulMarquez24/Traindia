// ============================================================
// VISTAS: Progreso — corporal, por ejercicio, comparativa
// ============================================================

const VProgress = (() => {

  const MEASURES = [
    { key: 'weight', label: 'Peso', unit: 'kg', step: '0.1' },
    { key: 'waist', label: 'Cintura', unit: 'cm', step: '0.5' },
    { key: 'hip', label: 'Cadera', unit: 'cm', step: '0.5' },
    { key: 'thigh', label: 'Muslo', unit: 'cm', step: '0.5' },
    { key: 'arm', label: 'Brazo', unit: 'cm', step: '0.5' },
  ];

  const EX_METRICS = [
    { key: 'maxWeight', label: 'Peso máx (kg)' },
    { key: 'volume', label: 'Volumen (kg)' },
    { key: 'maxReps', label: 'Reps máx' },
  ];
  const TIME_METRIC = { key: 'maxTime', label: 'Tiempo máx (s)' };

  // ---- cálculo de series por ejercicio desde sesiones ----
  async function exerciseSeries(userId, exName, metric) {
    let sessions = (await DB.sessionsOf(userId)).filter(s => !s.draft);
    sessions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const points = [];
    const lname = exName.toLowerCase();
    sessions.forEach(s => {
      let maxWeight = 0, volume = 0, maxReps = 0, maxTime = 0, found = false;
      (s.entries || []).forEach(e => {
        if ((e.name || '').toLowerCase() !== lname) return;
        found = true;
        (e.sets || []).forEach(set => {
          const r = parseFloat(set.reps) || 0, w = parseFloat(set.weight) || 0, t = parseFloat(set.time) || 0;
          if (w > maxWeight) maxWeight = w;
          if (r > maxReps) maxReps = r;
          if (t > maxTime) maxTime = t;
          volume += r * w;
        });
      });
      if (!found) return;
      const map = { maxWeight, volume, maxReps, maxTime };
      const y = map[metric] || 0;
      points.push({ x: s.date, y });
    });
    return points;
  }

  // ====================================================
  function render(app, params) {
    const tab = params.tab || 'body';
    const tabs = [
      { id: 'body', label: 'Corporal' },
      { id: 'exercise', label: 'Por ejercicio' },
      { id: 'compare', label: 'Comparativa' },
    ];
    const tabBar = `<div class="tabs">${tabs.map(t => `<button class="tab${tab === t.id ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>`;

    if (tab === 'body') return tabBar + `<div id="tabBody">${'<div class="loading">Cargando…</div>'}</div>`;
    if (tab === 'exercise') return tabBar + `<div id="tabEx"><div class="loading">Cargando…</div></div>`;
    return tabBar + `<div id="tabCompare"><div class="loading">Cargando…</div></div>`;
  }

  function bind(app, root, params) {
    const tab = params.tab || 'body';
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => app.go('progress', { tab: b.dataset.tab }, true)));
    if (tab === 'body') renderBody(app, root.querySelector('#tabBody'));
    else if (tab === 'exercise') renderExercise(app, root.querySelector('#tabEx'), params);
    else renderCompare(app, root.querySelector('#tabCompare'), params);
  }

  // ---------- CORPORAL ----------
  async function renderBody(app, host) {
    const entries = (await DB.progressOf(app.activeUser.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const metric = host._metric || 'weight';
    const available = MEASURES.filter(m => entries.some(e => e[m.key] != null && e[m.key] !== ''));
    const chartPoints = entries
      .filter(e => e[metric] != null && e[metric] !== '')
      .map(e => ({ x: e.date, y: parseFloat(e[metric]) }))
      .filter(p => !isNaN(p.y));

    const metricChips = (available.length ? available : [MEASURES[0]])
      .map(m => `<button class="chip${m.key === metric ? ' on' : ''}" data-metric="${m.key}">${m.label}</button>`).join('');

    const rows = entries.map(e => {
      const vals = MEASURES.filter(m => e[m.key]).map(m => `${m.label} ${e[m.key]}${m.unit}`).join(' · ');
      return `<div class="prog-row">
        <div class="prog-date">${UI.fmtDateShort(e.date)}</div>
        <div class="prog-vals">${vals || '<span class="dim">—</span>'}${e.notes ? `<span class="dim block-note">${UI.esc(e.notes)}</span>` : ''}</div>
        <span class="prog-actions"><button class="icon-btn" data-share="${e.id}" title="Compartir">${UI.icon('upload', 17)}</button><button class="icon-btn" data-edit="${e.id}">${UI.icon('edit', 17)}</button><button class="icon-btn danger" data-del="${e.id}">${UI.icon('trash', 17)}</button></span>
      </div>`;
    }).join('');

    host.innerHTML = `
      <div class="card">
        <div class="chips-row small">${metricChips}</div>
        ${UI.lineChart([{ label: app.activeUser.name, color: app.activeUser.color, points: chartPoints }], { width: 320, height: 150 })}
      </div>
      <button class="btn primary block" id="addProg">+ Registrar medida</button>
      ${rows || '<div class="empty-state"><p>Sin registros de progreso.</p></div>'}`;

    host.querySelectorAll('[data-metric]').forEach(c => c.addEventListener('click', () => { host._metric = c.dataset.metric; renderBody(app, host); }));
    host.querySelector('#addProg').addEventListener('click', () => editProgress(app, null, () => renderBody(app, host)));
    host.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => VData.exportProgressEntry(app, b.dataset.share)));
    host.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => editProgress(app, await DB.get('progress', b.dataset.edit), () => renderBody(app, host))));
    host.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Eliminar registro', message: '¿Borrar este registro de progreso?', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.del('progress', b.dataset.del); renderBody(app, host); UI.toast('Registro eliminado');
    }));
  }

  function editProgress(app, existing, onSaved) {
    const isNew = !existing;
    const e = existing || { date: DB.todayISO() };
    UI.modal({
      title: isNew ? 'Nuevo registro' : 'Editar registro',
      bodyHTML: `<div id="progForm">
        ${UI.field('Fecha', UI.input('date', e.date, { type: 'date' }))}
        <div class="measure-grid">
          ${MEASURES.map(m => UI.field(`${m.label} (${m.unit})`, UI.input(m.key, e[m.key] != null ? e[m.key] : '', { type: 'number', step: m.step, placeholder: '—' }))).join('')}
        </div>
        ${UI.field('Notas', UI.textarea('notes', e.notes || '', 'Sensaciones, contexto…', 2))}
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          const d = UI.readForm(root.querySelector('#progForm'));
          const rec = { id: existing ? existing.id : DB.uid('prg'), userId: app.activeUser.id, date: d.date, notes: d.notes };
          MEASURES.forEach(m => { rec[m.key] = d[m.key] === '' ? null : parseFloat(d[m.key]); });
          await DB.put('progress', rec);
          UI.toast('Registro guardado');
          onSaved();
        }},
      ],
    });
  }

  // ---------- POR EJERCICIO ----------
  async function renderExercise(app, host, params) {
    const catalog = (await DB.exercisesOf(app.activeUser.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (catalog.length === 0) { host.innerHTML = `<div class="empty-state"><p>No hay ejercicios en el catálogo.</p></div>`; return; }
    const exId = host._exId || params.exId || catalog[0].id;
    const ex = catalog.find(e => e.id === exId) || catalog[0];
    const metrics = ex.type === 'time' ? [TIME_METRIC] : EX_METRICS;
    const metric = (host._metric && metrics.some(m => m.key === host._metric)) ? host._metric : metrics[0].key;

    const points = await exerciseSeries(app.activeUser.id, ex.name, metric);

    const recent = points.slice(-8).reverse().map(p => `<li><span>${UI.fmtDateShort(p.x)}</span><strong>${p.y}</strong></li>`).join('');

    host.innerHTML = `
      <div class="card">
        ${UI.field('Ejercicio', UI.selectButton('exSelBtn', ex.name))}
        <div class="chips-row small">${metrics.map(m => `<button class="chip${m.key === metric ? ' on' : ''}" data-metric="${m.key}">${m.label}</button>`).join('')}</div>
        ${UI.lineChart([{ label: ex.name, color: app.activeUser.color, points }], { width: 320, height: 150 })}
      </div>
      ${points.length ? `<div class="block"><div class="block-label">Últimos registros</div><ul class="kv-list">${recent}</ul></div>` : '<div class="empty-state"><p class="dim">Aún no has registrado este ejercicio en ninguna sesión.</p></div>'}`;

    host.querySelector('#exSelBtn').addEventListener('click', () => UI.pickFromList({
      title: 'Elegir ejercicio',
      options: catalog.map(c => ({ value: c.id, label: c.name })),
      value: ex.id,
      onPick: (val) => { host._exId = val; host._metric = null; renderExercise(app, host, params); },
    }));
    host.querySelectorAll('[data-metric]').forEach(c => c.addEventListener('click', () => { host._metric = c.dataset.metric; host._exId = ex.id; renderExercise(app, host, params); }));
  }

  // ---------- COMPARATIVA ----------
  async function renderCompare(app, host, params) {
    const users = await DB.getUsers();
    const guests = users.filter(u => !u.isMain);
    if (guests.length === 0) {
      host.innerHTML = `<div class="empty-state"><p>No hay perfiles invitados para comparar.</p><p class="dim">Crea un invitado e importa sus datos desde Perfiles o Datos.</p><button class="btn ghost" data-link="profiles">Ir a Perfiles</button></div>`;
      app.bindLinks(host);
      return;
    }
    const guestId = host._guestId || guests[0].id;
    const guest = users.find(u => u.id === guestId);

    // métricas: peso corporal + cada ejercicio del principal
    const catalog = (await DB.exercisesOf(app.mainUser.id)).sort((a, b) => a.name.localeCompare(b.name));
    const subjectKey = host._subject || 'body:weight';

    let series = [], unit = '';
    if (subjectKey === 'body:weight') {
      const mainPts = (await DB.progressOf(app.mainUser.id)).filter(e => e.weight != null && e.weight !== '').map(e => ({ x: e.date, y: parseFloat(e.weight) }));
      const guestPts = (await DB.progressOf(guest.id)).filter(e => e.weight != null && e.weight !== '').map(e => ({ x: e.date, y: parseFloat(e.weight) }));
      series = [
        { label: app.mainUser.name, color: app.mainUser.color, points: mainPts },
        { label: guest.name, color: guest.color, points: guestPts },
      ];
      unit = 'Peso corporal (kg)';
    } else {
      const exName = subjectKey.slice(3);
      const metric = host._exMetric || 'maxWeight';
      const mainPts = await exerciseSeries(app.mainUser.id, exName, metric);
      const guestPts = await exerciseSeries(guest.id, exName, metric);
      series = [
        { label: app.mainUser.name, color: app.mainUser.color, points: mainPts },
        { label: guest.name, color: guest.color, points: guestPts },
      ];
      unit = `${exName} — ${(EX_METRICS.find(m => m.key === metric) || {}).label || metric}`;
    }

    const subjectOptions = [{ value: 'body:weight', label: 'Peso corporal' }]
      .concat(catalog.map(c => ({ value: 'ex:' + c.name, label: c.name })));
    const showExMetric = subjectKey.startsWith('ex:');

    host.innerHTML = `
      <div class="card">
        ${UI.field('Comparar con', UI.select('guestSel', guests.map(g => ({ value: g.id, label: g.name })), guestId))}
        ${UI.field('Métrica', UI.selectButton('subjectSelBtn', (subjectOptions.find(o => o.value === subjectKey) || subjectOptions[0]).label))}
        ${showExMetric ? `<div class="chips-row small">${EX_METRICS.map(m => `<button class="chip${(host._exMetric || 'maxWeight') === m.key ? ' on' : ''}" data-exmetric="${m.key}">${m.label}</button>`).join('')}</div>` : ''}
        <div class="chart-title">${UI.esc(unit)}</div>
        ${UI.lineChart(series, { width: 320, height: 160 })}
      </div>`;

    host.querySelector('select[name="guestSel"]').addEventListener('change', e => { host._guestId = e.target.value; renderCompare(app, host, params); });
    host.querySelector('#subjectSelBtn').addEventListener('click', () => UI.pickFromList({
      title: 'Elegir métrica',
      options: subjectOptions,
      value: subjectKey,
      onPick: (val) => { host._subject = val; renderCompare(app, host, params); },
    }));
    host.querySelectorAll('[data-exmetric]').forEach(c => c.addEventListener('click', () => { host._exMetric = c.dataset.exmetric; renderCompare(app, host, params); }));
    app.bindLinks(host);
  }

  return { render, bind };
})();
