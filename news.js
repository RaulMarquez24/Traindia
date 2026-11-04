// Novedades (historias a pantalla completa) y Tutoriales (vídeos).
// De momento en VISTA PREVIA: no le salta a nadie al entrar. Solo se ven si activas la
// vista previa tocando 5 veces «Traindía · vX» al pie de Más; entonces aparecen
// «Novedades» y «Tutoriales» en Más (solo en ese móvil).
// Regla: con un entreno en marcha no se saca nada de esto solo (ver app.isIdle).
const VNews = (() => {
  const PREVIEW_KEY = 'traindia.newsPreview';
  const SEEN_KEY = 'traindia.tutosSeen';
  const DUR = 8000; // lo que dura cada historia sin vídeo

  // Vídeos verticales en tutoriales/. No los guarda el SW: se bajan solo al verlos.
  const TUTOS = [
    { id: 'plan-ia', title: 'Tu plan del entrenador con una IA', sub: 'Del PDF a tu semana en 3 pasos', dur: '1:27', src: 'tutoriales/plan-ia.mp4', poster: 'tutoriales/plan-ia.jpg', try: 'planAI' },
  ];
  // Color por tipo: Nuevo, morado; Mejora, verde azulado.
  const TAGS = { nuevo: { txt: 'Nuevo', bg: '#4f46e5', dk: '#312e81' }, mejora: { txt: 'Mejora', bg: '#0f766e', dk: '#134e4a' } };
  // Cada anuncio, máximo 4 historias; el resto, solo en la lista.
  const NEWS = [
    { id: '2026-11-04', date: '2026-11-04', stories: [
      { tag: 'mejora', title: 'Del PDF de tu entrenador a tu Traindía', text: 'Crear tu plan con una IA ahora es más corto: preparas el texto, se lo das a tu IA y pegas lo que te devuelva.', video: 'plan-ia', try: 'planAI' },
      { tag: 'nuevo', title: 'Entrenad con el mismo plan', text: 'Mándale un enlace a un amigo y en un toque tiene tu plan o tu nutrición, o os comparáis. Vale para todo el grupo durante 48 horas.', visual: 'amigo', try: 'share' },
      { tag: 'mejora', title: 'Tu entreno no se pierde nunca', text: 'Recarga, cierra o abre un enlace: al volver estás donde lo dejaste, con el tiempo corriendo.', visual: 'salvo' },
      { tag: 'mejora', title: 'Ya no hace falta cerrar la app', text: 'Traindía se pone al día sola cuando no estás en nada. Y si estás entrenando, espera.', visual: 'upd' },
    ] },
  ];

  const esc = (s) => UI.esc(s == null ? '' : String(s));
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const preview = () => ls(PREVIEW_KEY) === '1';
  const seen = () => { try { return JSON.parse(ls(SEEN_KEY) || '[]'); } catch (e) { return []; } };
  const markSeen = (id) => { const s = seen(); if (!s.includes(id)) { s.push(id); ls(SEEN_KEY, JSON.stringify(s)); } };
  const tuto = (id) => TUTOS.find(t => t.id === id);
  const fecha = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  // 5 toques en el pie de Más: activa o quita la vista previa.
  let taps = 0, tapT = 0;
  function tapFoot(app) {
    const now = Date.now();
    taps = now - tapT < 800 ? taps + 1 : 1; tapT = now;
    if (taps < 5) return;
    taps = 0;
    const on = !preview();
    ls(PREVIEW_KEY, on ? '1' : '0');
    UI.toast(on ? 'Vista previa de novedades activada' : 'Vista previa de novedades quitada');
    app.render();
  }

  // ---- Dibujos animados de cada historia ----
  function visual(v) {
    if (v === 'amigo') return `<div class="nv-vis nv-amigo">
        <div class="nv-ph"><b>R</b>Tú</div><div class="nv-ph nv-ph2"><b>M</b>Marta</div>
        <div class="nv-link">${UI.icon('link', 14)} enlace</div>
        <div class="nv-opts"><span>Compararnos</span><span>Su plan</span><span>Su nutrición</span></div></div>`;
    if (v === 'salvo') return `<div class="nv-vis"><div class="nv-card">
        <div class="nv-card-h"><strong>Día 1</strong><span>0:24:11</span></div>
        <div class="nv-card-r"><i class="nv-spin">${UI.icon('refresh', 16)}</i>Recargas… y sigue ahí</div>
        <div class="nv-card-s"><span>80 kg × 8</span><span>80 kg × 8</span><span>82,5 × 6</span></div></div></div>`;
    if (v === 'upd') return `<div class="nv-vis"><div class="nv-screen">
        <div class="nv-banner">Hay una versión nueva<span>Actualizar</span></div>
        <p>Sin cerrar la app. Sin perder nada.</p></div></div>`;
    return '';
  }

  // ---- Reproductor de historias ----
  // list: historias; start: índice; onEnd: al cerrar. Va encima de todo (no es un modal).
  function play(app, list, start = 0, onEnd) {
    close();
    let i = start, t0 = 0, el = 0, paused = false, raf = 0, holdT = 0, held = false;
    const ov = document.createElement('div');
    ov.className = 'nv';
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    const fin = () => { cancelAnimationFrame(raf); close(); if (onEnd) onEnd(); };
    const next = () => { if (i < list.length - 1) { i++; show(); } else fin(); };
    const prev = () => { if (i > 0) i--; show(); };

    function show() {
      const s = list[i], tg = TAGS[s.tag] || TAGS.nuevo, tv = s.video && tuto(s.video);
      ov.style.setProperty('--nv-bg', tg.bg); ov.style.setProperty('--nv-dk', tg.dk);
      ov.innerHTML = `<div class="nv-in">
        <div class="nv-bars">${list.map((_, k) => `<span><i style="width:${k < i ? 100 : 0}%"></i></span>`).join('')}</div>
        <div class="nv-head"><span class="nv-logo">T</span>Novedades<span class="nv-sp"></span><button class="nv-x" aria-label="Cerrar">${UI.icon('x', 22)}</button></div>
        <div class="nv-tags"><span class="nv-tag">${tg.txt}</span>${tv ? `<span class="nv-tag2">Con vídeo</span>` : ''}</div>
        <h2 class="nv-title">${esc(s.title)}</h2>
        <p class="nv-text">${esc(s.text)}</p>
        ${tv ? `<button class="nv-poster" data-video><img src="${tv.poster}" alt=""><span class="nv-play">${UI.icon('play', 26)}</span><span class="nv-pl">Ver el vídeo<small>${tv.dur} · se entiende sin sonido</small></span></button>` : visual(s.visual)}
        <div class="nv-sp"></div>
        <button class="nv-cta" data-cta>${s.try ? `Pruébalo ${UI.icon('chevronRight', 16)}` : (i < list.length - 1 ? 'Siguiente' : 'Listo')}</button>
        <p class="nv-foot">${i + 1} de ${list.length} · luego las tienes en Más → Novedades</p></div>`;
      ov.querySelector('.nv-x').onclick = (e) => { e.stopPropagation(); fin(); };
      ov.querySelector('[data-cta]').onclick = (e) => { e.stopPropagation(); if (s.try) { cancelAnimationFrame(raf); tryIt(app, s.try, () => play(app, list, i + 1 < list.length ? i + 1 : i, onEnd), i + 1 < list.length); } else next(); };
      const pv = ov.querySelector('[data-video]');
      if (pv) pv.onclick = (e) => { e.stopPropagation(); cancelAnimationFrame(raf); video(app, tv, () => play(app, list, i, onEnd), s.try ? () => { fin(); tryIt(app, s.try); } : null); };
      el = 0; t0 = performance.now(); cancelAnimationFrame(raf); tick();
    }
    function tick() {
      raf = requestAnimationFrame((n) => {
        if (!ov.isConnected) return;
        if (paused) t0 = n - el;
        el = n - t0;
        const b = ov.querySelectorAll('.nv-bars i')[i];
        if (b) b.style.width = Math.min(100, el / DUR * 100) + '%';
        if (el >= DUR) next(); else tick();
      });
    }
    // Tocar a la izquierda vuelve, a la derecha sigue; mantener pulsado pausa.
    ov.addEventListener('pointerdown', () => { paused = true; held = false; holdT = setTimeout(() => { held = true; }, 250); });
    ov.addEventListener('pointerup', () => { paused = false; clearTimeout(holdT); });
    ov.addEventListener('pointercancel', () => { paused = false; clearTimeout(holdT); });
    ov.addEventListener('click', (e) => {
      if (held || e.target.closest('button')) return;
      (e.clientX < window.innerWidth / 3) ? prev() : next();
    });
    show();
  }
  function close() {
    document.querySelectorAll('.nv').forEach(o => { const v = o.querySelector('video'); if (v) v.pause(); o.remove(); });
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('modal-open');
  }

  // ---- Vídeo a pantalla completa (dentro de la historia o desde Tutoriales) ----
  // back: al cerrar o «Seguir»; onTry: «Pruébalo ahora» al terminar (si el vídeo lo tiene).
  function video(app, t, back, onTry) {
    close();
    markSeen(t.id);
    const ov = document.createElement('div');
    ov.className = 'nv nv-video';
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    ov.innerHTML = `<div class="nv-in">
      <div class="nv-bars"><span><i></i></span></div>
      <div class="nv-head"><span class="nv-time">0:00 / ${t.dur}</span><span class="nv-sp"></span>
        <button class="nv-snd" aria-label="Sonido">${UI.icon('volume', 18)}${UI.icon('volumeOff', 18)}</button>
        <button class="nv-x" aria-label="Cerrar vídeo">${UI.icon('x', 22)}</button></div>
      <video class="nv-v" src="${t.src}" poster="${t.poster}" playsinline preload="metadata"></video>
      <div class="nv-end" hidden>
        ${onTry ? `<button class="nv-cta" data-try>Pruébalo ahora</button>` : ''}
        <button class="nv-cta nv-ghost" data-back>${onTry ? 'Seguir' : 'Cerrar'}</button></div></div>`;
    const v = ov.querySelector('video'), bar = ov.querySelector('.nv-bars i'), tm = ov.querySelector('.nv-time');
    const snd = ov.querySelector('.nv-snd');
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const salir = () => { v.pause(); close(); if (back) back(); };
    v.addEventListener('timeupdate', () => {
      if (v.duration) bar.style.width = (v.currentTime / v.duration * 100) + '%';
      tm.textContent = `${mmss(v.currentTime)} / ${v.duration ? mmss(v.duration) : t.dur}`;
    });
    v.addEventListener('ended', () => { ov.querySelector('.nv-end').hidden = false; });
    v.addEventListener('play', () => { ov.querySelector('.nv-end').hidden = true; });
    v.addEventListener('click', () => { v.paused ? v.play() : v.pause(); });
    v.addEventListener('error', () => { UI.toast('No se pudo cargar el vídeo. Mira tu conexión', 'err'); });
    snd.onclick = () => { v.muted = !v.muted; snd.classList.toggle('off', v.muted); };
    ov.querySelector('.nv-x').onclick = salir;
    ov.querySelector('[data-back]').onclick = salir;
    const tb = ov.querySelector('[data-try]');
    if (tb) tb.onclick = () => { v.pause(); close(); onTry(); };
    // Se ha llegado aquí con un toque: se puede arrancar con sonido.
    v.play().catch(() => { v.muted = true; snd.classList.add('off'); v.play().catch(() => {}); });
  }

  // ---- «Pruébalo»: lleva a donde se usa ----
  // planAI abre «Plan con una IA»; share señala ⇧ (tocarlo lo abre; tocar fuera, sigue).
  function tryIt(app, what, resume, hasMore) {
    close();
    if (what === 'planAI') { VPlanAI.open(app); return; }
    if (what === 'share') spotlight('#dataBtn', '<strong>Toca aquí</strong> y elige «Compartir con amigos». Le mandas el enlace a quien quieras.', hasMore ? resume : null);
  }
  function spotlight(sel, html, resume) {
    const el = document.querySelector(sel);
    if (!el) { if (resume) resume(); return; }
    const r = el.getBoundingClientRect(), pad = 6;
    const ov = document.createElement('div');
    ov.className = 'nv-spot';
    ov.innerHTML = `<div class="nv-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>
      <div class="nv-tip" style="top:${r.bottom + 14}px">${html}<span>${resume ? 'Toca fuera para seguir con las novedades' : 'Toca fuera para cerrar'}</span></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => {
      ov.remove();
      const inHole = e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad;
      if (inHole) el.click(); else if (resume) resume();
    });
  }

  // ---- Más → Novedades ----
  function listView() {
    return `<div class="section">
      <p class="nv-prev">Vista previa: solo la ves tú (5 toques al pie de Más para quitarla).</p>
      ${NEWS.map(n => `<div class="more-sec">${fecha(n.date)}</div>
        <div class="more-group">${n.stories.map((s, k) => `<button class="more-row" data-news="${n.id}" data-k="${k}">
          <span class="more-ic" style="background:${(TAGS[s.tag] || TAGS.nuevo).bg}">${UI.icon(s.video ? 'play' : 'star', 18)}</span>
          <span class="more-txt"><strong>${esc(s.title)}</strong><span>${(TAGS[s.tag] || TAGS.nuevo).txt}${s.video ? ' · con vídeo' : ''}</span></span><span class="chev">›</span></button>`).join('')}</div>`).join('')}
    </div>`;
  }
  function listBind(app, root) {
    root.querySelectorAll('[data-news]').forEach(b => b.addEventListener('click', () => {
      const n = NEWS.find(x => x.id === b.dataset.news);
      if (n) play(app, n.stories, +b.dataset.k);
    }));
  }

  // ---- Más → Tutoriales ----
  function tutosView() {
    const vistos = seen();
    return `<div class="section">
      <div class="nv-tutos">${TUTOS.map(t => `<button class="nv-tu" data-tuto="${t.id}">
        <span class="nv-thumb"><img src="${t.poster}" alt="" loading="lazy"><em>${t.dur}</em><i>${UI.icon('play', 18)}</i></span>
        <span class="nv-tu-txt"><strong>${esc(t.title)}</strong><span>${esc(t.sub)}</span>
          ${vistos.includes(t.id) ? `<small class="ok">${UI.icon('check', 13)} Visto</small>` : '<small class="new">Nuevo</small>'}</span></button>`).join('')}</div>
      <p class="nv-prev">Vista previa: solo la ves tú.</p>
    </div>`;
  }
  function tutosBind(app, root) {
    root.querySelectorAll('[data-tuto]').forEach(b => b.addEventListener('click', () => {
      const t = tuto(b.dataset.tuto);
      if (t) video(app, t, () => app.render(), t.try ? () => tryIt(app, t.try) : null);
    }));
  }

  // Grupo «Aprende» para Más (solo con la vista previa activa).
  function moreGroup() {
    if (!preview()) return null;
    const nuevos = TUTOS.filter(t => !seen().includes(t.id)).length;
    return { title: 'Aprende', color: 'var(--strong)', rows: [
      { v: 'news', icon: 'star', label: 'Novedades', sub: 'Lo último que ha cambiado' },
      { v: 'tutorials', icon: 'play', label: 'Tutoriales', sub: nuevos ? `${nuevos} ${nuevos === 1 ? 'vídeo nuevo' : 'vídeos nuevos'}` : `${TUTOS.length} ${TUTOS.length === 1 ? 'vídeo' : 'vídeos'}` },
    ] };
  }

  return { tapFoot, moreGroup, listView, listBind, tutosView, tutosBind, play, video, close, preview };
})();
