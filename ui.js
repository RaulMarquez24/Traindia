// ============================================================
// UI HELPERS — modales, toasts, formularios, gráficas SVG
// Sin dependencias. Reutiliza la estética de la app.
// ============================================================

const UI = (() => {

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Normaliza para búsquedas: quita tildes/diacríticos y pasa a minúsculas.
  function norm(str) {
    return String(str == null ? '' : str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // ---- Toast ----
  let toastTimer = null;
  function toast(msg, type = 'ok') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
  }

  // ---- Modal genérico (con pila para anidar) ----
  // open({ title, bodyHTML, actions:[{label,kind,onClick→puede devolver false p/ no cerrar}], onMount })
  const modalStack = [];
  function modal({ title, bodyHTML = '', actions = [], onMount, size = '' }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = String(500 + modalStack.length * 10);
    overlay.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="modal-x" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        <div class="modal-actions"></div>
      </div>`;
    document.body.appendChild(overlay);
    modalStack.push(overlay);
    document.body.classList.add('modal-open');

    const actionsEl = overlay.querySelector('.modal-actions');
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = `btn ${a.kind || 'ghost'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', async () => {
        const res = a.onClick ? await a.onClick(overlay) : undefined;
        if (res !== false) closeModal(overlay);
      });
      actionsEl.appendChild(btn);
    });

    overlay.querySelector('.modal-x').addEventListener('click', () => closeModal(overlay));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });

    if (onMount) onMount(overlay);
    return overlay;
  }

  function closeModal(overlay) {
    const target = (overlay && overlay.classList) ? overlay : modalStack[modalStack.length - 1];
    if (!target) return;
    const idx = modalStack.indexOf(target);
    if (idx !== -1) modalStack.splice(idx, 1);
    target.remove();
    if (modalStack.length === 0) document.body.classList.remove('modal-open');
  }

  // ---- Confirmación ----
  // requireText: si se indica, hay que escribir ese texto exacto para habilitar el botón.
  function confirm({ title = 'Confirmar', message = '', confirmLabel = 'Aceptar', danger = false, requireText = null }) {
    return new Promise((resolve) => {
      const body = `<p class="modal-text">${esc(message)}</p>` +
        (requireText ? `<p class="field-hint" style="margin-top:0">Para confirmar, escribe <strong>${esc(requireText)}</strong>:</p>
          <input class="inp" id="confirmText" autocomplete="off" autocapitalize="characters" placeholder="${esc(requireText)}">` : '');
      modal({
        title,
        bodyHTML: body,
        actions: [
          { label: 'Cancelar', kind: 'ghost', onClick: () => { resolve(false); } },
          { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { resolve(true); } },
        ],
        onMount: requireText ? (root) => {
          const btns = root.querySelectorAll('.modal-actions .btn');
          const confirmBtn = btns[btns.length - 1];
          const inp = root.querySelector('#confirmText');
          const refresh = () => {
            const ok = inp.value.trim().toUpperCase() === requireText.toUpperCase();
            confirmBtn.disabled = !ok;
            confirmBtn.classList.toggle('disabled', !ok);
          };
          refresh();
          inp.addEventListener('input', refresh);
          setTimeout(() => inp.focus(), 120);
        } : undefined,
      });
    });
  }

  // ---- Prompt de texto ----
  function prompt({ title = '', label = '', value = '', placeholder = '', confirmLabel = 'Aceptar' }) {
    return new Promise((resolve) => {
      modal({
        title,
        bodyHTML: field(label, input('v', value, { placeholder })),
        actions: [
          { label: 'Cancelar', kind: 'ghost', onClick: () => resolve(null) },
          { label: confirmLabel, kind: 'primary', onClick: (root) => { resolve(root.querySelector('input[name="v"]').value); } },
        ],
        onMount: (root) => { const i = root.querySelector('input[name="v"]'); setTimeout(() => i.focus(), 100); },
      });
    });
  }

  // ---- Form helpers (generan HTML de campos) ----
  function field(label, inputHTML, hint) {
    return `<label class="field"><span class="field-label">${esc(label)}</span>${inputHTML}${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}</label>`;
  }
  function input(name, value = '', opts = {}) {
    const { type = 'text', placeholder = '', step, min, attrs = '' } = opts;
    return `<input class="inp" name="${esc(name)}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"${step ? ` step="${step}"` : ''}${min != null ? ` min="${min}"` : ''} ${attrs}>`;
  }
  function textarea(name, value = '', placeholder = '', rows = 4) {
    return `<textarea class="inp" name="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  }
  function select(name, options, value = '') {
    const opts = options.map(o => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`;
    }).join('');
    return `<select class="inp" name="${esc(name)}">${opts}</select>`;
  }
  // Lee un <form> a objeto
  function readForm(scope) {
    const data = {};
    scope.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }

  // ---- Selector de color ----
  // Paleta amplia: muchos colores para elegir tocando, sin complicaciones.
  const COLORS = [
    '#4f46e5', '#7c3aed', '#2457d6', '#0e9aae', '#178a8a', '#14b8a6',
    '#2d6a4f', '#40916c', '#1b9e77', '#6a8a2d', '#9bbf3a', '#d97706',
    '#b8860b', '#d4a017', '#f08c00', '#e8590c', '#c14a1f', '#d64545',
    '#e11d48', '#c2477f', '#e0559b', '#ff7ab6', '#9b59b6', '#5e4a8a',
    '#3d5a80', '#5a7bd8', '#6d4c41', '#64748b', '#3a3a3a',
  ];
  function colorPicker(name, value = COLORS[0]) {
    return `<div class="color-picker" data-color-field="${esc(name)}">
      ${COLORS.map(c => `<button type="button" class="color-dot${c === value ? ' sel' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
      <input type="hidden" name="${esc(name)}" value="${esc(value)}">
    </div>`;
  }
  function bindColorPicker(scope) {
    scope.querySelectorAll('[data-color-field]').forEach(pic => {
      const hidden = pic.querySelector('input[type="hidden"]');
      pic.querySelectorAll('.color-dot[data-color]').forEach(dot => {
        dot.addEventListener('click', () => {
          pic.querySelectorAll('.color-dot').forEach(d => d.classList.remove('sel'));
          dot.classList.add('sel');
          hidden.value = dot.dataset.color;
        });
      });
    });
  }

  function avatar(user, size = 32) {
    if (!user) return '';
    const initial = (user.name || '?').trim().charAt(0).toUpperCase();
    return `<span class="avatar" style="width:${size}px;height:${size}px;background:${user.color || '#4f46e5'};font-size:${Math.round(size * 0.45)}px">${esc(initial)}</span>`;
  }

  // ---- Gráfica de líneas SVG ----
  // series: [{ label, color, points:[{x:isoDate, y:number}] }]
  function lineChart(series, opts = {}) {
    const W = opts.width || 320, H = opts.height || 160;
    const padL = 34, padR = 10, padT = 12, padB = 22;
    const all = series.flatMap(s => s.points);
    if (all.length === 0) {
      return `<div class="chart-empty">Sin datos suficientes para la gráfica.</div>`;
    }
    const xs = all.map(p => +new Date(p.x));
    const ys = all.map(p => p.y);
    let minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    if (minX === maxX) { minX -= 86400000; maxX += 86400000; }
    if (minY === maxY) { minY -= 1; maxY += 1; }
    const yPad = (maxY - minY) * 0.1;
    minY -= yPad; maxY += yPad;

    const sx = (x) => padL + ((+new Date(x) - minX) / (maxX - minX)) * (W - padL - padR);
    const sy = (y) => H - padB - ((y - minY) / (maxY - minY)) * (H - padT - padB);

    // grid horizontal (3 líneas)
    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const yVal = minY + (i / 3) * (maxY - minY);
      const yy = sy(yVal);
      grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" class="chart-grid"/>`;
      grid += `<text x="2" y="${(yy + 3).toFixed(1)}" class="chart-axis">${Math.round(yVal)}</text>`;
    }

    const paths = series.map(s => {
      const pts = [...s.points].sort((a, b) => +new Date(a.x) - +new Date(b.x));
      if (pts.length === 0) return '';
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
      const dots = pts.map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.5" fill="${s.color}"/>`).join('');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
    }).join('');

    const legend = series.length > 1
      ? `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`
      : '';

    return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="none">${grid}${paths}</svg>${legend}</div>`;
  }

  // ---- Selector de ejercicios con buscador (móvil-friendly) ----
  // pickExercise({ exercises, title, allowNew, onPick }) → onPick(ex) o onPick({isNew, name, muscleGroup, type})
  const TYPE_SHORT = { weight: 'peso+reps', reps: 'reps', time: 'tiempo' };
  function pickExercise({ exercises, title = 'Elegir ejercicio', allowNew = true, onPick, lockGroup = null }) {
    const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name));
    modal({
      title, size: 'wide',
      bodyHTML: `<input class="inp" id="exSearch" placeholder="🔎 Buscar ejercicio…" autocomplete="off">
        <div class="picker-list" id="pickerList"></div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const search = root.querySelector('#exSearch');
        const listEl = root.querySelector('#pickerList');
        const draw = (q) => {
          const ql = norm(q);
          const items = sorted.filter(e => !ql || norm(e.name).includes(ql) || norm(e.muscleGroup || '').includes(ql));
          let html = items.map(e => `<button class="picker-row" data-id="${esc(e.id)}"><span class="picker-name">${esc(e.name)}</span><span class="picker-tag">${esc(e.muscleGroup || '')} · ${TYPE_SHORT[e.type] || e.type}</span></button>`).join('');
          if (allowNew && ql) html += `<button class="picker-row new" data-new="1"><span class="picker-name">➕ Crear “${esc(q.trim())}”</span></button>`;
          listEl.innerHTML = html || '<div class="empty-state"><p class="dim">Sin resultados.</p></div>';
          listEl.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => { closeModal(); onPick(sorted.find(e => e.id === b.dataset.id)); }));
          const nb = listEl.querySelector('[data-new]');
          if (nb) nb.addEventListener('click', async () => {
            const nu = await newExercisePrompt(q.trim(), lockGroup);
            if (nu) { closeModal(); onPick({ isNew: true, ...nu }); }
          });
        };
        search.addEventListener('input', () => draw(search.value));
        draw('');
        setTimeout(() => search.focus(), 120);
      },
    });
  }

  function newExercisePrompt(name, lockedGroup) {
    return new Promise((resolve) => {
      modal({
        title: 'Nuevo ejercicio',
        bodyHTML: `<div id="npForm">
          ${field('Nombre', input('name', name))}
          ${lockedGroup ? `<p class="field-hint" style="margin-top:0">Categoría: <strong>${esc(lockedGroup)}</strong></p>` : field('Grupo muscular', input('muscleGroup', '', { placeholder: 'Ej: Pecho, Cardio…' }))}
          ${field('Tipo', select('type', [
            { value: 'weight', label: 'Peso + repeticiones' },
            { value: 'reps', label: 'Repeticiones (peso corporal)' },
            { value: 'time', label: 'Tiempo / duración' }], 'weight'))}
        </div>`,
        actions: [
          { label: 'Cancelar', kind: 'ghost', onClick: () => resolve(null) },
          { label: 'Crear', kind: 'primary', onClick: (root) => {
            const d = readForm(root.querySelector('#npForm'));
            if (!d.name.trim()) { toast('Escribe un nombre', 'err'); return false; }
            resolve({ name: d.name.trim(), muscleGroup: lockedGroup || (d.muscleGroup.trim() || 'General'), type: d.type });
          }},
        ],
      });
    });
  }

  // ---- Formato de fecha legible ----
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateShort(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  return {
    esc, norm, toast, modal, closeModal, confirm,
    field, input, textarea, select, readForm,
    colorPicker, bindColorPicker, avatar, COLORS,
    pickExercise, newExercisePrompt, prompt,
    lineChart, fmtDate, fmtDateShort,
  };
})();
