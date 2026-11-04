// «Aprende» (Más → Aprende): novedades (historias a pantalla completa), tutoriales
// (vídeos) y trucos por temas (tips.js), con buscador. El último anuncio sale solo al
// entrar, una vez, y solo en reposo (maybeShow).
// Regla: con un entreno en marcha no se saca nada de esto solo (ver app.isIdle).
const VNews = (() => {
  // Clave nueva desde v2.64.2: la v2.64.0 marcaba las novedades como vistas solo con
  // aparecer, así que se empieza de cero para todos (y se borra la vieja).
  const NEWS_SEEN_KEY = 'traindia.newsVisto';
  try { localStorage.removeItem('traindia.newsSeen'); } catch (e) {}
  const SEEN_KEY = 'traindia.tutosSeen';
  const TIPS_SEEN_KEY = 'traindia.tipsSeen';
  const { cats: CATS, tips: TIPS } = typeof TIPS_DATA !== 'undefined' ? TIPS_DATA : { cats: [], tips: [] };
  const DUR = 8000; // lo que dura cada historia sin vídeo

  // Vídeos verticales en tutoriales/. No los guarda el SW: se bajan solo al verlos.
  // teaser: unos segundos sin sonido (≈170 KB) que se ven de fondo en la historia.
  const TUTOS = [
    { id: 'plan-ia', title: 'Tu plan del entrenador con una IA', sub: 'Del PDF a tu semana en 3 pasos', dur: '1:27', src: 'tutoriales/plan-ia.mp4', poster: 'tutoriales/plan-ia.jpg', teaser: 'tutoriales/plan-ia-teaser.mp4', try: 'planAI' },
  ];
  // Color por tipo: Nuevo, morado; Mejora, verde azulado.
  const TAGS = { nuevo: { txt: 'Nuevo', bg: '#4f46e5', dk: '#312e81' }, mejora: { txt: 'Mejora', bg: '#0f766e', dk: '#134e4a' } };
  // Degradado de las tarjetas de «Lo nuevo»: luz (arriba a la derecha), sombra (abajo a la
  // izquierda), base y texto marcado. Por defecto el del tipo; una historia puede pedir otro.
  const PALS = {
    mejora: { a: '#2dd4bf', b: '#064e3b', c: '#0f766e', d: '#134e4a', k: '#0f766e' },
    nuevo: { a: '#a78bfa', b: '#1e1b4b', c: '#4f46e5', d: '#312e81', k: '#4338ca' },
    rosa: { a: '#f472b6', b: '#4c0519', c: '#db2777', d: '#831843', k: '#be185d' },
  };
  // Cada anuncio, máximo 4 historias. En Aprende solo sale el último: lo anterior queda
  // como truco en su tema (cada novedad tiene su truco en tips.js).
  // card: la tarjeta en «Lo nuevo» (estilo póster). lines + mark: titular en líneas, la
  // marcada va en blanco. crop: el trozo de captura que flota (iw = ancho al que se pinta la
  // imagen; x, y = desde dónde se ve; w, h = tamaño; r, b = posición; rot = giro). chip: la
  // etiqueta que lo remata (timer cuenta solo). Sin cifras que se queden viejas. Sin vídeo, capturas
  // de la app (con datos de ejemplo, en novedades/) dentro de un móvil.
  const NEWS = [
    { id: '2026-11-04', date: '2026-11-04', stories: [
      { tag: 'mejora', title: 'Del PDF de tu entrenador a tu Traindía', text: 'Crear tu plan con una IA ahora es más corto: preparas el texto, se lo das a tu IA y pegas lo que te devuelva.', video: 'plan-ia', try: 'planAI',
        card: { lines: ['Del PDF', 'de tu entrenador', 'a tu Traindía'], mark: 0 } },
      { tag: 'nuevo', title: 'Entrenad con el mismo plan', text: 'Mándale un enlace a un amigo y en un toque tiene tu plan o tu nutrición, o os comparáis. Vale para todo el grupo durante 48 horas.', shots: ['novedades/compartir-1.jpg', 'novedades/compartir-2.jpg'], try: 'share',
        card: { lines: ['Entrenad', 'con el mismo', 'plan'], mark: 1, go: 'Pruébalo',
          crop: { img: 'novedades/compartir-2.jpg', iw: 360, x: 11, y: 536, w: 207, h: 128, r: 16, b: 58, rot: -4 },
          chip: { avatar: 'M', color: '#e11d48', txt: 'Marta abrió tu enlace', l: 16, b: 168, rot: 3 } } },
      { tag: 'mejora', title: 'Tu entreno no se pierde nunca', text: 'Recarga, cierra o abre un enlace: al volver estás donde lo dejaste, con el tiempo corriendo.', shots: ['novedades/entreno.jpg'],
        card: { lines: ['Tu entreno', 'no se pierde', 'nunca'], mark: 1, go: 'Ver cómo',
          crop: { img: 'novedades/entreno.jpg', iw: 470, x: 116, y: 745, w: 236, h: 76, r: 14, b: 100, rot: -3 },
          chip: { timer: 1451, txt: 'sigue corriendo', l: 20, b: 56 } } },
      { tag: 'nuevo', title: 'Aprende: trucos y tutoriales', text: 'Trucos por temas, tutoriales en vídeo y un buscador para encontrar lo que quieras. En Más → Aprende.', shots: ['novedades/aprende-1.jpg', 'novedades/aprende-2.jpg'], try: 'go:learn',
        card: { pal: 'rosa', lines: ['Trucos', 'y tutoriales', 'en Aprende'], mark: 0, go: 'Ir a Aprende',
          crop: { img: 'novedades/aprende-1.jpg', iw: 378, x: 0, y: 180, w: 225, h: 153, r: -27, b: 38, rot: -6 },
          chip: { icon: 'search', txt: '«notificación»', l: 20, b: 64 } } },
    ] },
  ];

  const esc = (s) => UI.esc(s == null ? '' : String(s));
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const seen = () => { try { return JSON.parse(ls(SEEN_KEY) || '[]'); } catch (e) { return []; } };
  const markSeen = (id) => { const s = seen(); if (!s.includes(id)) { s.push(id); ls(SEEN_KEY, JSON.stringify(s)); } };
  const tuto = (id) => TUTOS.find(t => t.id === id);
  const tipsSeen = () => { try { return JSON.parse(ls(TIPS_SEEN_KEY) || '[]'); } catch (e) { return []; } };
  const markTip = (id) => { const s = tipsSeen(); if (!s.includes(id)) { s.push(id); ls(TIPS_SEEN_KEY, JSON.stringify(s)); } };
  const cat = (id) => CATS.find(c => c.id === id);
  // Un truco se abre como una historia más, con el color y el nombre de su tema.
  const tipStory = (t) => { const c = cat(t.cat) || CATS[0]; return { ...t, tg: { txt: c.name, bg: c.bg, dk: c.dk }, shots: t.shot ? [t.shot] : [], head: 'Trucos', tipId: t.id }; };
  const thumbOf = (t) => t.shot || (t.video && tuto(t.video) ? tuto(t.video).poster : '') || (t.shots || [])[0] || '';
  // La barra del sistema (theme-color) toma el color de lo que está a pantalla completa.
  let _tinted = null;
  const tint = (c) => { const m = document.querySelector('meta[name="theme-color"]'); if (!m) return; if (_tinted === null) _tinted = m.content; m.content = c; };
  const untint = () => { const m = document.querySelector('meta[name="theme-color"]'); if (m && _tinted !== null) m.content = _tinted; _tinted = null; };
  // Con «reducir movimiento» activado en el móvil, los avances de vídeo no arrancan solos.
  const autoplay = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? '' : 'autoplay';
  const fecha = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  // Al entrar: el último anuncio, y solo si estás en reposo en Semana (sin entreno en
  // marcha ni a medias, sin ventanas abiertas, sin nada escrito). Cuenta como visto cuando
  // lo cierras, llegas al final, tocas «Pruébalo» o abres el vídeo: si desaparece porque la
  // app se recargó o la cerraste, vuelve a salir la próxima vez.
  function maybeShow(app) {
    const n = NEWS[0];
    if (!n || ls(NEWS_SEEN_KEY) === n.id) return;
    // Quien se acaba de dar de alta no necesita «novedades»: para él todo es nuevo.
    const alta = app.mainUser && app.mainUser.createdAt;
    if (alta && alta > new Date(n.date + 'T00:00:00').getTime()) { ls(NEWS_SEEN_KEY, n.id); return; }
    setTimeout(() => {
      if (app._live || app._updReady || app.currentView !== 'week' || document.visibilityState !== 'visible' || !app.isIdle()) return;
      play(app, n.stories, 0, null, () => ls(NEWS_SEEN_KEY, n.id));
    }, 1200);
  }

  // ---- Reproductor de historias ----
  // list: historias; start: índice; onEnd: al cerrar. Va encima de todo (no es un modal).
  // onSeen: se llama cuando de verdad se ha visto (cerrar, terminar, «Pruébalo» o el vídeo).
  function play(app, list, start = 0, onEnd, onSeen) {
    close();
    let i = start, t0 = 0, el = 0, paused = false, raf = 0, holdT = 0, held = false;
    const ov = document.createElement('div');
    ov.className = 'nv';
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    const visto = () => { if (onSeen) onSeen(); };
    const fin = () => { cancelAnimationFrame(raf); visto(); close(); if (onEnd) onEnd(); };
    const next = () => { if (i < list.length - 1) { i++; show(); } else fin(); };
    const prev = () => { if (i > 0) i--; show(); };

    function show() {
      const s = list[i], tg = s.tg || TAGS[s.tag] || TAGS.nuevo, tv = s.video && tuto(s.video);
      if (s.tipId) markTip(s.tipId);
      ov.style.setProperty('--nv-bg', tg.bg); ov.style.setProperty('--nv-dk', tg.dk);
      tint(tv ? '#000' : tg.bg);
      // Con vídeo: el avance se ve de fondo a pantalla completa y el texto va abajo. Solo
      // el botón del centro abre el vídeo: tocar a los lados sigue pasando historias.
      ov.classList.toggle('nv-media', !!tv);
      const txt = `<div class="nv-tags"><span class="nv-tag">${tg.txt}</span>${tv ? `<span class="nv-tag2">Con vídeo</span>` : ''}</div>
        <h2 class="nv-title">${esc(s.title)}</h2>
        <p class="nv-text">${esc(s.text)}</p>`;
      ov.innerHTML = `${tv ? `<video class="nv-bgv" src="${tv.teaser}" poster="${tv.poster}" muted ${autoplay()} loop playsinline></video><div class="nv-shade"></div>` : ''}<div class="nv-in">
        <div class="nv-bars">${list.map((_, k) => `<span><i style="width:${k < i ? 100 : 0}%"></i></span>`).join('')}</div>
        <div class="nv-head"><span class="nv-logo">T</span>${s.head || 'Novedades'}<span class="nv-sp"></span><button class="nv-x" aria-label="Cerrar">${UI.icon('x', 22)}</button></div>
        ${tv ? `<div class="nv-sp"></div><button class="nv-watch" data-video><span class="nv-play">${UI.icon('play', 30)}</span><span class="nv-watch-l">Ver el vídeo · ${tv.dur}</span></button><div class="nv-sp"></div>${txt}`
          : `<div class="nv-stage"><div class="nv-phone${(s.shots || []).length > 1 ? ' nv-two' : ''}">${(s.shots || []).map(src => `<img src="${src}" alt="">`).join('')}</div></div>${txt}`}
        <button class="nv-cta" data-cta>${s.try ? `Pruébalo ${UI.icon('chevronRight', 16)}` : (i < list.length - 1 ? 'Siguiente' : 'Listo')}</button>
        <p class="nv-foot">${i + 1} de ${list.length}${s.tipId ? '' : ' · luego las tienes en Más → Aprende'}</p></div>`;
      ov.querySelector('.nv-x').onclick = (e) => { e.stopPropagation(); fin(); };
      ov.querySelector('[data-cta]').onclick = (e) => { e.stopPropagation(); if (s.try) { cancelAnimationFrame(raf); visto(); tryIt(app, s.try, () => play(app, list, i + 1 < list.length ? i + 1 : i, onEnd, onSeen), i + 1 < list.length); } else next(); };
      const pv = ov.querySelector('[data-video]');
      if (pv) pv.onclick = (e) => { e.stopPropagation(); cancelAnimationFrame(raf); visto(); video(app, tv, () => play(app, list, i, onEnd, onSeen), s.try ? () => { fin(); tryIt(app, s.try); } : null); };
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
    document.querySelectorAll('.nv').forEach(o => { o.querySelectorAll('video').forEach(v => v.pause()); o.remove(); });
    untint();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('modal-open');
  }

  // ---- Vídeo a pantalla completa (dentro de la historia o desde Tutoriales) ----
  // Como en WhatsApp: el vídeo ocupa toda la pantalla; un toque enseña los controles
  // (cerrar, sonido, pausa, barra para avanzar) y se esconden solos si sigue en marcha.
  // back: al cerrar o «Seguir»; onTry: «Pruébalo ahora» al terminar (si el vídeo lo tiene).
  function video(app, t, back, onTry) {
    close();
    markSeen(t.id);
    const ov = document.createElement('div');
    ov.className = 'nv nv-video paused';
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    tint('#000');
    ov.innerHTML = `<video class="nv-v" src="${t.src}" poster="${t.poster}" playsinline preload="metadata"></video>
      <div class="nv-ui on">
        <div class="nv-top"><button class="nv-x" aria-label="Cerrar vídeo">${UI.icon('x', 24)}</button><span class="nv-sp"></span>
          <button class="nv-snd" aria-label="Sonido">${UI.icon('volume', 22)}${UI.icon('volumeOff', 22)}</button></div>
        <button class="nv-big" aria-label="Reproducir o pausar">${UI.icon('play', 30)}${UI.icon('pause', 30)}</button>
        <div class="nv-bot"><span class="nv-cur">0:00</span><input class="nv-seek" type="range" min="0" max="1000" value="0" aria-label="Avanzar o retroceder"><span class="nv-dur">${t.dur}</span></div>
      </div>
      <div class="nv-end" hidden>
        ${onTry ? `<button class="nv-cta" data-try>Pruébalo ahora</button>` : ''}
        <button class="nv-cta nv-ghost" data-again>${UI.icon('refresh', 16)} Volver a verlo</button>
        <button class="nv-cta nv-ghost" data-back>${onTry ? 'Seguir' : 'Cerrar'}</button></div>`;
    const q = (c) => ov.querySelector(c);
    const v = q('video'), ui = q('.nv-ui'), seek = q('.nv-seek'), end = q('.nv-end'), snd = q('.nv-snd');
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let hideT = 0, dragging = false;
    const showUI = () => { ui.classList.add('on'); clearTimeout(hideT); if (!v.paused && !dragging) hideT = setTimeout(() => ui.classList.remove('on'), 2500); };
    const hideUI = () => { clearTimeout(hideT); ui.classList.remove('on'); };
    const salir = () => { v.pause(); close(); if (back) back(); };

    ov.addEventListener('click', (e) => {
      if (e.target.closest('button, input') || !end.hidden) return;
      ui.classList.contains('on') ? hideUI() : showUI();
    });
    v.addEventListener('play', () => { ov.classList.remove('paused'); end.hidden = true; showUI(); });
    v.addEventListener('pause', () => { ov.classList.add('paused'); clearTimeout(hideT); ui.classList.add('on'); });
    v.addEventListener('loadedmetadata', () => { q('.nv-dur').textContent = mmss(v.duration); });
    v.addEventListener('timeupdate', () => {
      q('.nv-cur').textContent = mmss(v.currentTime);
      if (v.duration && !dragging) seek.value = Math.round(v.currentTime / v.duration * 1000);
    });
    v.addEventListener('ended', () => { hideUI(); end.hidden = false; });
    v.addEventListener('error', () => { UI.toast('No se pudo cargar el vídeo. Mira tu conexión', 'err'); });
    seek.addEventListener('input', () => { dragging = true; clearTimeout(hideT); if (v.duration) v.currentTime = seek.value / 1000 * v.duration; });
    seek.addEventListener('change', () => { dragging = false; showUI(); });
    q('.nv-big').onclick = () => { v.paused ? v.play() : v.pause(); };
    snd.onclick = () => { v.muted = !v.muted; snd.classList.toggle('off', v.muted); showUI(); };
    q('.nv-x').onclick = salir;
    q('[data-back]').onclick = salir;
    q('[data-again]').onclick = () => { v.currentTime = 0; v.play(); };
    const tb = q('[data-try]');
    if (tb) tb.onclick = () => { v.pause(); close(); onTry(); };
    // Se ha llegado aquí con un toque: se puede arrancar con sonido.
    v.play().catch(() => { v.muted = true; snd.classList.add('off'); v.play().catch(() => {}); });
  }

  // ---- «Pruébalo»: lleva a donde se usa ----
  // planAI abre «Plan con una IA»; share señala ⇧ (tocarlo lo abre; tocar fuera, sigue).
  function tryIt(app, what, resume, hasMore) {
    close();
    if (what === 'planAI') { VPlanAI.open(app); return; }
    if (what === 'feedback') { app.openFeedback(); return; }
    if (what.startsWith('go:')) { const [, v, tab] = what.split(':'); app.go(v, tab ? { tab } : {}); return; }
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

  // ---- Más → Tutoriales ----
  function tutosView() {
    const vistos = seen();
    return `<div class="section">
      <div class="nv-tutos">${TUTOS.map(t => `<button class="nv-tu" data-tuto="${t.id}">
        <span class="nv-thumb"><img src="${t.poster}" alt="" loading="lazy"><em>${t.dur}</em><i>${UI.icon('play', 18)}</i></span>
        <span class="nv-tu-txt"><strong>${esc(t.title)}</strong><span>${esc(t.sub)}</span>
          ${vistos.includes(t.id) ? `<small class="ok">${UI.icon('check', 13)} Visto</small>` : '<small class="new">Nuevo</small>'}</span></button>`).join('')}</div>
    </div>`;
  }
  function tutosBind(app, root) { bindTutos(app, root); }

  // ---- Tarjeta de «Lo nuevo»: póster con titular grande, palabra marcada y el momento
  // clave de la app flotando (o el avance del vídeo de fondo). ----
  const hms = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  function newCard(st, k) {
    const tg = TAGS[st.tag] || TAGS.nuevo, tv = st.video && tuto(st.video), cd = st.card || { lines: [st.title], mark: -1 };
    const p = PALS[cd.pal] || PALS[st.tag] || PALS.nuevo, cr = cd.crop, ch = cd.chip;
    const titulo = cd.lines.map((l, i) => i === cd.mark ? `<em>${esc(l)}</em>` : esc(l)).join('<br>');
    const chip = !ch ? '' : `<span class="lr-chip" style="left:${ch.l}px;bottom:${ch.b}px;--rot:${ch.rot || 0}deg">${
      ch.timer != null ? `<b class="lr-timer" data-s="${ch.timer}">${hms(ch.timer)}</b>`
      : ch.avatar ? `<i class="lr-av" style="background:${ch.color}">${esc(ch.avatar)}</i>`
      : ch.icon ? `<i class="lr-ic">${UI.icon(ch.icon, 15)}</i>` : ''}${esc(ch.txt)}</span>`;
    return `<button class="lr-new-c${tv ? ' lr-v' : ''}" data-story="${k}" style="--a:${p.a};--b:${p.b};--c:${p.c};--d:${p.d};--k:${p.k}">
      ${tv ? `<video class="lr-bgv" src="${tv.teaser}" poster="${tv.poster}" muted ${autoplay()} loop playsinline></video><span class="lr-shade"></span>`
        : '<span class="lr-bg"></span><i class="lr-ring"></i><i class="lr-ring lr-ring2"></i>'}
      <span class="lr-tags"><b>${tg.txt}</b>${tv ? `<i>${UI.icon('play', 11)} vídeo</i>` : ''}</span>
      <strong class="lr-t">${titulo}</strong>
      ${cr ? `<span class="lr-crop" style="right:${cr.r}px;bottom:${cr.b}px;width:${cr.w}px;height:${cr.h}px;--rot:${cr.rot}deg"><img src="${cr.img}" alt="" loading="lazy" style="width:${cr.iw}px;left:-${cr.x}px;top:-${cr.y}px"></span>` : ''}
      ${chip}
      ${tv ? `<span class="lr-chip lr-play-chip" style="left:20px;bottom:20px"><i class="lr-ic">${UI.icon('play', 14)}</i>Ver el vídeo · ${tv.dur}</span>`
        : `<span class="lr-go">${esc(cd.go || 'Ver')} ›</span>`}</button>`;
  }

  // ---- Más → Aprende (portada) ----
  // Como «Mi Pixel»: buscador, lo nuevo en grande, tutoriales y trucos por temas.
  const tipRow = (t, seenIds) => `<button class="lr-tip" data-tip="${t.id}">
      <span class="lr-mini">${thumbOf(t) ? `<img src="${thumbOf(t)}" alt="" loading="lazy">` : ''}${t.video ? `<i>${UI.icon('play', 14)}</i>` : ''}</span>
      <span class="lr-tip-txt"><strong>${esc(t.title)}</strong><span>${esc(t.text)}</span></span>
      ${seenIds.includes(t.id) ? `<span class="lr-ok" aria-label="Visto">${UI.icon('check', 15)}</span>` : '<span class="lr-dot" aria-label="Sin ver"></span>'}</button>`;
  const tutoCard = (t, vistos) => `<button class="lr-tuto" data-tuto="${t.id}">
      <img src="${t.poster}" alt="" loading="lazy"><span class="lr-tuto-sh"></span>
      ${vistos.includes(t.id) ? '' : '<em class="lr-new">Nuevo</em>'}<span class="lr-play">${UI.icon('play', 16)}</span>
      <span class="lr-tuto-t"><strong>${esc(t.title)}</strong><small>${t.dur}</small></span></button>`;
  function learnView() {
    const n = NEWS[0], vistos = seen(), seenIds = tipsSeen();
    return `<div class="section lr">
      <label class="lr-search">${UI.icon('search', 18)}<input id="lrQ" type="search" placeholder="Busca: descanso, copia, IA…" autocomplete="off" enterkeyhint="search"></label>
      <div id="lrRes" hidden></div>
      <div id="lrHome">
        ${n ? `<div class="lr-h"><span>Lo nuevo · ${fecha(n.date)}</span></div>
        <div class="lr-row">${n.stories.map((st, k) => newCard(st, k)).join('')}</div>` : ''}
        ${TUTOS.length ? `<div class="lr-h"><span>Tutoriales</span>${TUTOS.length > 2 ? '<button class="link-btn" data-go="tutorials">Ver todos</button>' : ''}</div>
        <div class="lr-row">${TUTOS.map(t => tutoCard(t, vistos)).join('')}</div>` : ''}
        <div class="lr-h"><span>Por temas</span><small>${TIPS.length} trucos</small></div>
        <div class="lr-cats">${CATS.map(c => { const ts = TIPS.filter(t => t.cat === c.id), nuevos = ts.filter(t => !seenIds.includes(t.id)).length;
          return `<button class="lr-cat" data-cat="${c.id}"><span class="lr-cat-ic" style="background:${c.bg}">${UI.icon(c.icon, 18)}</span>
            <strong>${esc(c.name)}</strong><small>${ts.length} trucos${nuevos && nuevos < ts.length ? ` · ${nuevos} sin ver` : ''}</small></button>`; }).join('')}</div>
      </div>
    </div>`;
  }
  // Abre una lista de trucos como historias desde el que toques.
  const playTips = (app, list, id) => play(app, list.map(tipStory), Math.max(0, list.findIndex(t => t.id === id)), () => app.render());
  function bindTips(app, root, list) {
    root.querySelectorAll('[data-tip]').forEach(b => b.addEventListener('click', () => playTips(app, list(), b.dataset.tip)));
  }
  function bindTutos(app, root) {
    root.querySelectorAll('[data-tuto]').forEach(b => b.addEventListener('click', () => {
      const t = tuto(b.dataset.tuto);
      if (t) video(app, t, () => app.render(), t.try ? () => tryIt(app, t.try) : null);
    }));
  }
  function learnBind(app, root) {
    const n = NEWS[0];
    const timers = [...root.querySelectorAll('.lr-timer')];
    if (timers.length) {
      const iv = setInterval(() => {
        if (!timers[0].isConnected) return clearInterval(iv);
        timers.forEach(t => { t.dataset.s = +t.dataset.s + 1; t.textContent = hms(+t.dataset.s); });
      }, 1000);
    }
    root.querySelectorAll('[data-story]').forEach(b => b.addEventListener('click', () => play(app, n.stories, +b.dataset.story)));
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => app.go(b.dataset.go)));
    root.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => app.go('learnCat', { cat: b.dataset.cat })));
    bindTutos(app, root);
    // Buscador: trucos y tutoriales por título, texto, tema y palabras clave.
    const q = root.querySelector('#lrQ'), res = root.querySelector('#lrRes'), home = root.querySelector('#lrHome');
    let found = [];
    q.addEventListener('input', () => {
      const words = UI.norm(q.value).split(/\s+/).filter(Boolean);
      home.hidden = !!words.length; res.hidden = !words.length;
      if (!words.length) return;
      const hay = (x) => words.every(w => UI.norm(x).includes(w));
      found = TIPS.filter(t => hay(`${t.title} ${t.text} ${t.k || ''} ${(cat(t.cat) || {}).name || ''}`));
      const tus = TUTOS.filter(t => hay(`${t.title} ${t.sub}`));
      const seenIds = tipsSeen(), vistos = seen();
      res.innerHTML = found.length || tus.length
        ? `<p class="lr-count">${found.length + tus.length} ${found.length + tus.length === 1 ? 'resultado' : 'resultados'}</p>
          ${tus.length ? `<div class="lr-row">${tus.map(t => tutoCard(t, vistos)).join('')}</div>` : ''}
          <div class="lr-tips">${found.map(t => tipRow(t, seenIds)).join('')}</div>`
        : `<p class="lr-count">Nada con «${esc(q.value.trim())}». Prueba con otra palabra.</p>`;
      bindTips(app, res, () => found);
      bindTutos(app, res);
    });
  }

  // ---- Más → Aprende → un tema ----
  function catView(params) {
    const c = cat(params.cat) || CATS[0], ts = TIPS.filter(t => t.cat === c.id), seenIds = tipsSeen();
    const vistos = ts.filter(t => seenIds.includes(t.id)).length;
    return `<div class="section lr">
      <div class="lr-cat-head"><span class="lr-cat-ic" style="background:${c.bg}">${UI.icon(c.icon, 20)}</span>
        <span><strong>${esc(c.name)}</strong><small>${ts.length} trucos${vistos ? ` · ${vistos} ${vistos === 1 ? 'visto' : 'vistos'}` : ''}</small></span></div>
      <div class="lr-tips">${ts.map(t => tipRow(t, seenIds)).join('')}</div>
    </div>`;
  }
  function catBind(app, root, params) {
    const c = cat(params.cat) || CATS[0];
    bindTips(app, root, () => TIPS.filter(t => t.cat === c.id));
  }

  // Fila «Aprende» para Más.
  function moreGroup() {
    const sinVer = TIPS.filter(t => !tipsSeen().includes(t.id)).length + TUTOS.filter(t => !seen().includes(t.id)).length;
    return { title: 'Aprende', color: 'var(--strong)', rows: [
      { v: 'learn', icon: 'star', label: 'Aprende', sub: `Novedades, tutoriales y ${TIPS.length} trucos${sinVer ? ` · ${sinVer} sin ver` : ''}` },
    ] };
  }

  return { maybeShow, moreGroup, learnView, learnBind, catView, catBind, tutosView, tutosBind, play, video, close };
})();
