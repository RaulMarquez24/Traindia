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

  // ---- Iconos SVG inline (sin dependencias, offline, currentColor) ----
  const ICONS = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    dumbbell: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    notebook: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M11 8h5M11 12h5M11 16h5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    code: '<path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    play: '<path d="M6 4v16l14-8z" fill="currentColor" stroke="none"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    book: '<path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    swap: '<path d="M7 21V3M3 7l4-4 4 4M17 3v18M21 17l-4 4-4-4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.1l-5-4.9 6.9-1z"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".6" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C22 6 17.5 2 12 2Z"/>',
    grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  };
  function icon(name, size = 20) {
    const inner = ICONS[name] || '';
    return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
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

  // Enfocar un campo al abrir un modal. En móvil (pantalla táctil) NO se hace en
  // los selectores con lista: abrir el teclado solo tapaba la lista y movía el modal
  // mientras aún subía. Con { touch: true } se enfoca también en móvil (diálogos
  // cuyo único sentido es escribir). preventScroll: que el navegador no desplace nada.
  const isTouch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  function autoFocus(el, delay = 120, { touch = false } = {}) {
    if (!el || (!touch && isTouch())) return;
    setTimeout(() => { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }, delay);
  }

  // ---- Modal genérico (con pila para anidar) ----
  // open({ title, bodyHTML, actions:[{label,kind,onClick→puede devolver false p/ no cerrar}], onMount })
  const modalStack = [];
  function modal({ title, bodyHTML = '', actions = [], onMount, size = '', dismissable = true }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = String(500 + modalStack.length * 10);
    overlay.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          ${dismissable ? '<button class="modal-x" aria-label="Cerrar">×</button>' : ''}
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

    // dismissable=false: no se puede cerrar con la X ni tocando fuera (cambio obligatorio).
    if (dismissable) {
      overlay.querySelector('.modal-x').addEventListener('click', () => closeModal(overlay));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
    }

    // Con el teclado abierto, el campo en el que escribes se mantiene a la vista
    // desplazando SOLO el cuerpo del modal (nunca la página: eso lo hacía saltar).
    const keepFocusVisible = () => {
      const a = document.activeElement;
      const body = overlay.querySelector('.modal-body');
      if (!a || !body || !body.contains(a)) return;
      const br = body.getBoundingClientRect(), ar = a.getBoundingClientRect(), pad = 14;
      if (ar.bottom > br.bottom - pad) body.scrollTop += ar.bottom - br.bottom + pad;
      else if (ar.top < br.top + pad) body.scrollTop -= br.top + pad - ar.top;
    };
    overlay.addEventListener('focusin', () => setTimeout(keepFocusVisible, 350)); // tras la animación del teclado

    // Ajusta el overlay al viewport VISIBLE: cuando se abre el teclado, el modal
    // se encoge y se queda por encima de él (no queda nada tapado). En Android la
    // página ya se encoge sola (interactive-widget=resizes-content en el viewport);
    // esto cubre iOS, que en vez de encoger desplaza el viewport visible.
    const vv = window.visualViewport;
    if (vv) {
      let raf = 0;
      const apply = () => {
        raf = 0;
        const top = vv.offsetTop || 0;
        const h = Math.min(vv.height, window.innerHeight - top); // clamp: nunca excede el viewport
        if (!h || h < 1) { // viewport no fiable: usar el CSS por defecto
          overlay.style.height = ''; overlay.style.top = ''; overlay.style.bottom = '';
          return;
        }
        overlay.style.height = h + 'px';
        overlay.style.top = top + 'px';
        overlay.style.bottom = 'auto';
        keepFocusVisible();
      };
      // Un ajuste por fotograma: durante la animación del teclado llegan decenas de
      // eventos y aplicarlos todos hacía temblar el modal.
      const fit = () => { if (!raf) raf = requestAnimationFrame(apply); };
      overlay._fit = fit;
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      apply();
    }

    if (onMount) onMount(overlay);
    return overlay;
  }

  function closeModal(overlay) {
    const target = (overlay && overlay.classList) ? overlay : modalStack[modalStack.length - 1];
    if (!target) return;
    if (target._fit && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', target._fit);
      window.visualViewport.removeEventListener('scroll', target._fit);
    }
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
          autoFocus(inp, 120, { touch: true });
        } : undefined,
      });
    });
  }

  // Copia texto al portapapeles. Usa la Clipboard API (NO roba el foco), para no
  // invalidar la activación del usuario al abrir luego un enlace (clave en Android).
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => { /* noop */ });
      return true;
    }
    // Fallback solo si no hay Clipboard API (puede robar foco; raro en móvil moderno).
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      return true;
    } catch (e) { return false; }
  }

  // Abre una URL externa de forma fiable (mejor que window.open en PWA/móvil).
  function openUrl(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---- Preguntar a una IA (abre ChatGPT/Gemini/Claude con el contexto) ----
  // copyOnly: la IA no admite prerrellenar por URL, así que se copia y se pega.
  const AI_PROVIDERS = [
    { key: 'chatgpt', label: 'ChatGPT', url: (t) => 'https://chatgpt.com/?q=' + encodeURIComponent(t) },
    { key: 'gemini', label: 'Gemini', url: (t) => 'https://gemini.google.com/app?q=' + encodeURIComponent(t) },
    { key: 'claude', label: 'Claude', url: (t) => 'https://claude.ai/new?q=' + encodeURIComponent(t) },
  ];
  function askAI(initialText) {
    modal({
      title: 'Preguntar a una IA',
      bodyHTML: `<p class="field-hint" style="margin-top:0">Edita el texto si quieres y elige con qué IA abrir. En Gemini se copia el texto para que lo pegues.</p>
        ${textarea('aiPrompt', initialText, '', 7)}
        <div class="ai-providers" id="aiProviders"></div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const ta = root.querySelector('textarea[name="aiPrompt"]');
        const box = root.querySelector('#aiProviders');
        AI_PROVIDERS.forEach(p => {
          const b = document.createElement('button');
          b.className = 'btn ghost block';
          b.textContent = `Abrir en ${p.label}`;
          b.addEventListener('click', () => {
            const text = ta.value;
            copyText(text); // respaldo en portapapeles (no roba foco), por si la IA no prerrellena
            openUrl(p.url(text));
            toast(`Abriendo ${p.label}…`);
            closeModal();
          });
          box.appendChild(b);
        });
        if (!isTouch()) setTimeout(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }, 120);
      },
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
        onMount: (root) => { autoFocus(root.querySelector('input[name="v"]'), 100, { touch: true }); },
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
  // ESSENTIALS: colores principales (una fila). COLORS: paleta completa.
  const ESSENTIALS = ['#4f46e5', '#2563eb', '#0e9aae', '#16a34a', '#eab308', '#ea580c', '#dc2626', '#ec4899'];
  const COLORS = [
    '#4f46e5', '#7c3aed', '#2457d6', '#2563eb', '#0e9aae', '#178a8a', '#14b8a6',
    '#16a34a', '#2d6a4f', '#40916c', '#1b9e77', '#6a8a2d', '#9bbf3a', '#eab308',
    '#d97706', '#b8860b', '#d4a017', '#f08c00', '#ea580c', '#e8590c', '#c14a1f',
    '#dc2626', '#d64545', '#e11d48', '#c2477f', '#e0559b', '#ec4899', '#ff7ab6',
    '#9b59b6', '#5e4a8a', '#3d5a80', '#5a7bd8', '#6d4c41', '#64748b', '#3a3a3a',
  ];

  // Layout: [seleccionado] | [colores principales] [icono paleta]
  function colorPicker(name, value = ESSENTIALS[0]) {
    return `<div class="color-picker" data-color-field="${esc(name)}">
      <span class="color-current" data-current style="background:${esc(value)}" title="Color seleccionado"></span>
      <span class="color-sep"></span>
      ${ESSENTIALS.map(c => `<button type="button" class="color-dot${c === value ? ' sel' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
      <button type="button" class="color-dot color-palette" data-more title="Seleccionar de la paleta">${icon('palette', 18)}</button>
      <input type="hidden" name="${esc(name)}" value="${esc(value)}">
    </div>`;
  }

  // Modal con la paleta completa (solo tocar, sin sliders)
  function openPalette(current, onPick) {
    modal({
      title: 'Seleccionar de la paleta',
      bodyHTML: `<div class="color-picker palette-grid">${COLORS.map(c => `<button type="button" class="color-dot${c === current ? ' sel' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => root.querySelectorAll('[data-color]').forEach(d => d.addEventListener('click', () => { closeModal(); onPick(d.dataset.color); })),
    });
  }

  function bindColorPicker(scope) {
    scope.querySelectorAll('[data-color-field]').forEach(pic => {
      const hidden = pic.querySelector('input[type="hidden"]');
      const current = pic.querySelector('[data-current]');
      const setVal = (c) => {
        hidden.value = c;
        if (current) current.style.background = c;
        pic.querySelectorAll('.color-dot[data-color]').forEach(d => d.classList.toggle('sel', d.dataset.color === c));
      };
      pic.querySelectorAll('.color-dot[data-color]').forEach(dot => dot.addEventListener('click', () => setVal(dot.dataset.color)));
      const palette = pic.querySelector('.color-palette');
      if (palette) palette.addEventListener('click', () => openPalette(hidden.value, setVal));
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

    const fmtY = opts.fmtY || ((v) => Math.round(v));
    // grid horizontal (3 líneas)
    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const yVal = minY + (i / 3) * (maxY - minY);
      const yy = sy(yVal);
      grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" class="chart-grid"/>`;
      grid += `<text x="2" y="${(yy + 3).toFixed(1)}" class="chart-axis">${esc(String(fmtY(yVal)))}</text>`;
    }

    const multi = series.length > 1;
    const pointInfo = (p, s) => {
      const valTxt = opts.fmtPoint ? opts.fmtPoint(p) : (p.detail ? `${fmtY(p.y)} ${p.detail}` : String(fmtY(p.y)));
      const pre = multi ? `${s.label}: ` : '';
      return `${pre}${fmtDateShort(p.x)} · ${valTxt}`;
    };
    const paths = series.map(s => {
      const pts = [...s.points].sort((a, b) => +new Date(a.x) - +new Date(b.x));
      if (pts.length === 0) return '';
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
      const dots = pts.map(p => {
        const cx = sx(p.x).toFixed(1), cy = sy(p.y).toFixed(1);
        // círculo visible + área de toque invisible (r grande) con la info del punto
        return `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${s.color}"/>`
          + `<circle class="chart-hit" cx="${cx}" cy="${cy}" r="9" fill="transparent" data-cx="${cx}" data-cy="${cy}" data-color="${s.color}" data-info="${esc(pointInfo(p, s))}"/>`;
      }).join('');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
    }).join('');

    const legend = multi
      ? `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`
      : '';

    return `<div class="chart-wrap"><svg data-w="${W}" data-h="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="none">${grid}${paths}</svg><div class="chart-tip" hidden></div>${legend}</div>`;
  }

  // ---- Selector de ejercicios con buscador (móvil-friendly) ----
  // pickExercise({ exercises, title, allowNew, onPick, lockGroup, categories, others, withSets })
  //   → onPick(ex) para uno existente, u onPick({ isNew, name, muscleGroup, type, sets, notes }) al crear.
  // others: ejercicios de OTRAS categorías (se ofrecen al buscar, en su propia sección).
  // withSets: el formulario de crear pide también series y detalle (para un día del plan).
  // known: TODO el catálogo, para avisar de duplicados (con inDay: true si ya está en el día).
  const TYPE_SHORT = { weight: 'peso+reps', reps: 'reps', time: 'tiempo', check: 'hecho/no' };
  const NEW_TYPES = [
    { v: 'weight', l: 'Peso + reps', ej: 'Press, sentadilla, remo…', ph: '4×10' },
    { v: 'reps', l: 'Repeticiones', ej: 'Dominadas, flexiones…', ph: '3×12' },
    { v: 'time', l: 'Tiempo', ej: 'Plancha, carrera, colgado…', ph: '3×30s' },
    { v: 'check', l: 'Hecho / no hecho', ej: 'Movilidad, estiramientos…', ph: '' },
  ];
  // Tipo probable por el nombre (o la categoría): el usuario lo puede cambiar.
  function guessType(name, group) {
    const n = norm(name || ''), g = norm(group || '');
    if (/estir|movilidad|activacion|articular|calentamiento|foam|rodillo/.test(n) || /estiramiento|movilidad|calentamiento/.test(g)) return 'check';
    if (/plancha|carrera|correr|cinta|bici|eliptica|remo ergo|comba|colgad|suspension|hang|hold|isometric|sentadilla isometrica|\bmin\b|km/.test(n) || /carrera|cardio|isometric/.test(g)) return 'time';
    if (/dominad|flexion|fondos|burpee|abdominal|crunch|zancada sin|salto|jump|push ?up|pull ?up|chin ?up/.test(n)) return 'reps';
    return 'weight';
  }
  function pickExercise({ exercises, title = 'Elegir ejercicio', allowNew = true, onPick, lockGroup = null, categories = null, others = [], withSets = false, known = null }) {
    const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name));
    const rest = [...(others || [])].sort((a, b) => a.name.localeCompare(b.name));
    const everyone = [...sorted, ...rest];
    const pool = known || everyone; // para detectar duplicados
    const cats = Array.isArray(categories) ? categories : null;
    const row = (e) => `<button class="picker-row" data-id="${esc(e.id)}"><span class="picker-name">${esc(e.name)}</span><span class="picker-tag">${esc(e.muscleGroup || 'General')} · ${TYPE_SHORT[e.type] || e.type}</span></button>`;
    let overlay;
    overlay = modal({
      title, size: 'wide',
      bodyHTML: `<div id="pkList">
          <input class="inp picker-search" id="exSearch" placeholder="🔎 Buscar ejercicio…" autocomplete="off">
          ${allowNew ? `<button type="button" class="picker-new" id="pkNewBtn">${icon('plus', 16)} <span>Nuevo ejercicio</span></button>` : ''}
          <div class="picker-list" id="pickerList"></div>
        </div>
        <div id="pkNew" hidden></div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const search = root.querySelector('#exSearch');
        const listEl = root.querySelector('#pickerList');
        const listBox = root.querySelector('#pkList');
        const newBox = root.querySelector('#pkNew');
        const newBtn = root.querySelector('#pkNewBtn');
        const done = (v) => { closeModal(overlay); onPick(v); };

        const draw = (q) => {
          const ql = norm(q);
          const match = (e) => !ql || norm(e.name).includes(ql) || norm(e.muscleGroup || '').includes(ql);
          const mine = sorted.filter(match);
          const fuera = ql ? rest.filter(match) : [];
          let html = mine.map(row).join('');
          if (fuera.length) html += `<div class="picker-sec">En otras categorías</div>` + fuera.map(row).join('');
          listEl.innerHTML = html || `<div class="empty-state"><p class="dim">${ql ? 'Ningún ejercicio con ese nombre.' : 'No hay ejercicios en esta categoría todavía.'}</p></div>`;
          listEl.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => done(everyone.find(e => e.id === b.dataset.id))));
          if (newBtn) {
            const exact = everyone.some(e => norm(e.name) === ql);
            newBtn.querySelector('span').textContent = q.trim() && !exact ? `Crear «${q.trim()}»` : 'Nuevo ejercicio';
            newBtn.classList.toggle('hot', !!q.trim() && !exact && !mine.length && !fuera.length);
          }
        };

        // ---- Formulario de crear, dentro del mismo modal ----
        const openNew = () => {
          const name0 = search.value.trim();
          let type = guessType(name0, lockGroup);
          const catHTML = lockGroup
            ? `<div class="pk-cat"><span class="field-label">Categoría</span><span class="pk-cat-chip">${esc(lockGroup)}</span></div>`
            : (cats && cats.length
              ? field('Categoría', `<select class="inp" name="muscleGroup" id="pkCat">${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}<option value="__new__">➕ Otra categoría…</option></select>`)
                + `<div id="pkNewCat" hidden>${field('Nueva categoría', input('newCat', '', { placeholder: 'Ej: Movilidad' }))}</div>`
              : field('Categoría', input('muscleGroup', '', { placeholder: 'Ej: Pecho, Cardio…' })));
          newBox.innerHTML = `
            <button type="button" class="pk-back" id="pkBack">‹ Volver a la lista</button>
            <div id="pkForm">
              ${field('Nombre', `<input class="inp" name="name" id="pkName" value="${esc(name0)}" placeholder="Ej: Remo con mancuerna" autocomplete="off" maxlength="60">`)}
              <div class="pk-dup" id="pkDup" hidden></div>
              ${catHTML}
              <span class="field-label">Tipo</span>
              <div class="pk-types" id="pkTypes">${NEW_TYPES.map(t => `<button type="button" class="pk-type" data-type="${t.v}"><strong>${t.l}</strong><span>${t.ej}</span></button>`).join('')}</div>
              ${withSets ? `<div class="pk-row2">
                ${field('Series', `<input class="inp" name="sets" id="pkSets" autocomplete="off" maxlength="20">`)}
                ${field('Detalle (opcional)', `<input class="inp" name="notes" placeholder="Descanso, tempo, carga…" autocomplete="off" maxlength="90">`)}
              </div>` : ''}
              <button type="button" class="btn primary block" id="pkCreate">${withSets ? 'Crear y añadir' : 'Crear'}</button>
              <p class="field-hint" style="text-align:center">Vídeos, técnica y suplentes: luego, desde <strong>Ejercicios</strong>.</p>
            </div>`;
          const nameIn = newBox.querySelector('#pkName');
          const dup = newBox.querySelector('#pkDup');
          const setsIn = newBox.querySelector('#pkSets');
          let setsTouched = false;
          if (setsIn) setsIn.addEventListener('input', () => { setsTouched = true; });
          const paintType = () => {
            newBox.querySelectorAll('.pk-type').forEach(b => b.classList.toggle('on', b.dataset.type === type));
            if (setsIn) setsIn.placeholder = (NEW_TYPES.find(t => t.v === type) || {}).ph || '';
          };
          let typeTouched = false;
          newBox.querySelectorAll('.pk-type').forEach(b => b.addEventListener('click', () => { type = b.dataset.type; typeTouched = true; paintType(); }));
          const checkDup = () => {
            const n = norm(nameIn.value.trim());
            const same = n && pool.find(e => norm(e.name) === n);
            dup.hidden = !same;
            if (same && same.inDay) {
              dup.innerHTML = `<span><strong>${esc(same.name)}</strong> ya está en este día.</span>`;
            } else if (same) {
              dup.innerHTML = `<span>Ya tienes <strong>${esc(same.name)}</strong> (${esc(same.muscleGroup || 'General')}).</span><button type="button" class="btn small primary" data-use>Usar ese</button>`;
              dup.querySelector('[data-use]').addEventListener('click', () => done(same));
            }
            if (!typeTouched) { type = guessType(nameIn.value, lockGroup); paintType(); }
          };
          nameIn.addEventListener('input', checkDup);
          const catSel = newBox.querySelector('#pkCat');
          if (catSel) catSel.addEventListener('change', () => { newBox.querySelector('#pkNewCat').hidden = catSel.value !== '__new__'; });
          newBox.querySelector('#pkBack').addEventListener('click', () => { newBox.hidden = true; listBox.hidden = false; search.value = nameIn.value; draw(search.value); });
          newBox.querySelector('#pkCreate').addEventListener('click', () => {
            const d = readForm(newBox.querySelector('#pkForm'));
            const name = (d.name || '').trim();
            if (!name) { toast('Escribe un nombre', 'err'); nameIn.focus(); return; }
            const same = pool.find(e => norm(e.name) === norm(name));
            if (same && same.inDay) { toast('Ese ejercicio ya está en este día', 'err'); return; }
            if (same) { done(same); return; } // ya existe: se usa ese, nunca se duplica
            let group = lockGroup || d.muscleGroup || 'General';
            if (!lockGroup && cats && d.muscleGroup === '__new__') group = (d.newCat || '').trim() || 'General';
            done({ isNew: true, name, muscleGroup: String(group).trim() || 'General', type, sets: (d.sets || '').trim(), notes: (d.notes || '').trim() || undefined });
          });
          paintType(); checkDup();
          listBox.hidden = true; newBox.hidden = false;
          if (name0) autoFocus(setsIn || nameIn, 80); else autoFocus(nameIn, 80, { touch: true });
        };
        if (newBtn) newBtn.addEventListener('click', openNew);
        search.addEventListener('input', () => draw(search.value));
        search.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const first = listEl.querySelector('[data-id]');
          if (first && listEl.querySelectorAll('[data-id]').length === 1) first.click();
          else if (allowNew && search.value.trim() && !listEl.querySelector('[data-id]')) openNew();
        });
        draw('');
        autoFocus(search);
      },
    });
  }

  // Selector con buscador reutilizable (sustituye a <select> largos en móvil).
  // pickFromList({ title, options:[{value,label}]|string[], value, onPick(value,opt) })
  function pickFromList({ title = 'Elegir', options, value, onPick }) {
    const opts = (options || []).map(o => (typeof o === 'object' ? o : { value: o, label: o }));
    const searchable = opts.length > 8;
    modal({
      title, size: 'wide',
      bodyHTML: `${searchable ? '<input class="inp picker-search" id="listSearch" placeholder="Buscar…" autocomplete="off">' : ''}<div class="picker-list" id="listResults"></div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const listEl = root.querySelector('#listResults');
        const draw = (q) => {
          const ql = norm(q || '');
          const items = opts.filter(o => !ql || norm(o.label).includes(ql));
          listEl.innerHTML = items.map(o => `<button class="picker-row${String(o.value) === String(value) ? ' sel' : ''}" data-val="${esc(o.value)}"><span class="picker-name">${esc(o.label)}</span></button>`).join('') || '<div class="empty-state"><p class="dim">Sin resultados.</p></div>';
          listEl.querySelectorAll('[data-val]').forEach(b => b.addEventListener('click', () => { closeModal(); onPick(b.dataset.val, opts.find(o => String(o.value) === b.dataset.val)); }));
        };
        const search = root.querySelector('#listSearch');
        if (search) { search.addEventListener('input', () => draw(search.value)); autoFocus(search); }
        draw('');
      },
    });
  }
  // Botón con aspecto de select que abre el buscador.
  function selectButton(id, label) {
    return `<button type="button" class="select-btn" id="${esc(id)}">${esc(label)}<span class="select-caret">▾</span></button>`;
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

  // ---- Reordenar arrastrando (touch + ratón) ----
  // container: el contenedor cuyos hijos directos (itemSelector) se reordenan.
  // handleSelector: el "agarrador"; solo al pulsarlo empieza el arrastre.
  // onReorder(orderIds): recibe el array de data-sort-id en el nuevo orden.
  function makeSortable(container, { itemSelector, handleSelector, onReorder }) {
    if (!container) return;
    const items = () => [...container.querySelectorAll(':scope > ' + itemSelector)];
    let dragging = null, placeholder = null, moved = false;
    let startY = 0, lastY = 0, rafId = 0, scrollEl = null, prevSB = '';

    // Ancestro con scroll (p.ej. el cuerpo del modal); si no hay, se usa la ventana.
    const findScroller = () => {
      let el = container.parentElement;
      while (el && el !== document.body) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2) return el;
        el = el.parentElement;
      }
      return null;
    };

    // Mueve el HUECO (placeholder) al sitio donde caería, según el centro del
    // elemento que flota bajo el dedo.
    const movePlaceholder = () => {
      const rect = dragging.getBoundingClientRect(); // incluye el transform → posición flotante real
      const centerY = rect.top + rect.height / 2;
      let after = null;
      for (const s of items()) {
        if (s === dragging) continue;
        const r = s.getBoundingClientRect();
        if (centerY < r.top + r.height / 2) { after = s; break; }
      }
      if (after) { if (placeholder.nextElementSibling !== after) container.insertBefore(placeholder, after); }
      else if (container.lastElementChild !== placeholder) container.appendChild(placeholder);
    };

    const follow = () => {
      // El elemento flota pegado al dedo (translateY) + ligero "levantamiento" (scale).
      dragging.style.transform = 'translateY(' + (lastY - startY) + 'px) scale(1.03)';
    };

    // Auto-scroll cuando el dedo se acerca al borde superior/inferior visible.
    const EDGE = 70, MAX_SPEED = 16;
    const tick = () => {
      if (!dragging) return;
      let top, bottom;
      if (scrollEl) { const r = scrollEl.getBoundingClientRect(); top = r.top; bottom = r.bottom; }
      else { top = 0; bottom = (window.visualViewport ? window.visualViewport.height : window.innerHeight); }
      let dy = 0;
      if (lastY < top + EDGE) dy = -MAX_SPEED * Math.min(1, (top + EDGE - lastY) / EDGE);
      else if (lastY > bottom - EDGE) dy = MAX_SPEED * Math.min(1, (lastY - (bottom - EDGE)) / EDGE);
      if (dy) {
        // Escribir scrollTop directamente (instantáneo). Evita window.scrollBy(),
        // que respeta `scroll-behavior: smooth` y haría el auto-scroll lentísimo.
        const target = scrollEl || document.scrollingElement || document.documentElement;
        target.scrollTop += dy;
        movePlaceholder(); // el contenido se desplaza bajo el elemento flotante
      }
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      moved = true;
      lastY = e.clientY;
      follow();
      movePlaceholder();
    };
    const end = () => {
      if (!dragging) return;
      cancelAnimationFrame(rafId); rafId = 0;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const d = dragging;
      // Devolver el elemento al flujo, en la posición del hueco.
      d.classList.remove('dragging');
      ['position', 'left', 'top', 'width', 'zIndex', 'transform', 'margin', 'boxSizing', 'pointerEvents'].forEach(p => { d.style[p] = ''; });
      if (placeholder && placeholder.parentElement === container) container.insertBefore(d, placeholder);
      if (placeholder) placeholder.remove();
      document.documentElement.style.scrollBehavior = prevSB;
      document.body.classList.remove('dragging-active');
      const order = items().map(el => el.dataset.sortId);
      const wasMoved = moved;
      dragging = null; placeholder = null; moved = false; scrollEl = null;
      if (wasMoved && typeof onReorder === 'function') onReorder(order);
    };

    container.addEventListener('pointerdown', (e) => {
      if (dragging) return;
      const handle = e.target.closest(handleSelector);
      if (!handle || !container.contains(handle)) return;
      const item = handle.closest(itemSelector);
      if (!item || item.parentElement !== container) return; // solo hijos directos de ESTE contenedor
      e.preventDefault();
      dragging = item; moved = false; startY = e.clientY; lastY = e.clientY;
      scrollEl = findScroller();
      // Desactivar scroll suave durante el arrastre: con `scroll-behavior: smooth`
      // el auto-scroll por frames se vuelve lentísimo.
      prevSB = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      const rect = item.getBoundingClientRect();
      const cs = getComputedStyle(item);
      // Hueco que mantiene el espacio mientras el elemento flota.
      placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.height = rect.height + 'px';
      placeholder.style.marginBottom = cs.marginBottom;
      container.insertBefore(placeholder, item.nextSibling);
      // Sacar el elemento del flujo y dejarlo "flotando" en su posición actual.
      item.style.position = 'fixed';
      item.style.left = rect.left + 'px';
      item.style.top = rect.top + 'px';
      item.style.width = rect.width + 'px';
      item.style.boxSizing = 'border-box';
      item.style.margin = '0';
      item.style.zIndex = '95'; // por debajo del header y la nav (z-index 100)
      item.style.pointerEvents = 'none';
      item.classList.add('dragging');
      follow();
      document.body.classList.add('dragging-active');
      rafId = requestAnimationFrame(tick);
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  }

  // ---- Tooltip de las gráficas: tocar un punto muestra fecha + valor + condiciones ----
  document.addEventListener('click', (ev) => {
    const hit = ev.target.closest && ev.target.closest('.chart-hit');
    if (!hit) {
      // clic fuera de un punto: oculta cualquier tooltip abierto
      document.querySelectorAll('.chart-tip:not([hidden])').forEach(t => { t.hidden = true; });
      return;
    }
    const wrap = hit.closest('.chart-wrap');
    const svg = hit.closest('.chart-svg');
    const tip = wrap && wrap.querySelector('.chart-tip');
    if (!tip || !svg) return;
    const rect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const W = +svg.dataset.w || 320, Hh = +svg.dataset.h || 160;
    const px = (+hit.dataset.cx / W) * rect.width + (rect.left - wrapRect.left);
    const py = (+hit.dataset.cy / Hh) * rect.height + (rect.top - wrapRect.top);
    tip.textContent = hit.dataset.info || '';
    tip.style.setProperty('--tip-color', hit.dataset.color || 'var(--accent)');
    tip.hidden = false;
    tip.style.left = px + 'px';
    tip.style.top = py + 'px';
    // si se sale por un borde, ajusta para que no se corte
    requestAnimationFrame(() => {
      const tr = tip.getBoundingClientRect();
      if (tr.left < wrapRect.left + 2) tip.style.left = (px + (wrapRect.left + 2 - tr.left)) + 'px';
      if (tr.right > wrapRect.right - 2) tip.style.left = (px - (tr.right - (wrapRect.right - 2))) + 'px';
    });
  });

  return {
    esc, norm, toast, modal, closeModal, confirm,
    field, input, textarea, select, readForm,
    colorPicker, bindColorPicker, avatar, COLORS, ESSENTIALS,
    pickExercise, prompt, askAI, icon, autoFocus, pickFromList, selectButton,
    lineChart, fmtDate, fmtDateShort, makeSortable,
  };
})();
