// «Aprende»: novedades (historias a pantalla completa), tutoriales (vídeos) y trucos
// por temas (tips.js), con buscador. De momento en VISTA PREVIA: no le salta a nadie al
// entrar. Solo se ve si activas la vista previa tocando 5 veces «Traindía · vX» al pie
// de Más; entonces aparece «Aprende» en Más (solo en ese móvil).
// Regla: con un entreno en marcha no se saca nada de esto solo (ver app.isIdle).
const VNews = (() => {
  const PREVIEW_KEY = 'traindia.newsPreview';
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
  // Cada anuncio, máximo 4 historias. En Aprende solo sale el último: lo anterior queda
  // como truco en su tema (cada novedad tiene su truco en tips.js). Sin vídeo, capturas
  // de la app (con datos de ejemplo, en novedades/) dentro de un móvil.
  const NEWS = [
    { id: '2026-11-04', date: '2026-11-04', stories: [
      { tag: 'mejora', title: 'Del PDF de tu entrenador a tu Traindía', text: 'Crear tu plan con una IA ahora es más corto: preparas el texto, se lo das a tu IA y pegas lo que te devuelva.', video: 'plan-ia', try: 'planAI' },
      { tag: 'nuevo', title: 'Entrenad con el mismo plan', text: 'Mándale un enlace a un amigo y en un toque tiene tu plan o tu nutrición, o os comparáis. Vale para todo el grupo durante 48 horas.', shots: ['novedades/compartir-1.jpg', 'novedades/compartir-2.jpg'], try: 'share' },
      { tag: 'mejora', title: 'Tu entreno no se pierde nunca', text: 'Recarga, cierra o abre un enlace: al volver estás donde lo dejaste, con el tiempo corriendo.', shots: ['novedades/entreno.jpg'] },
      { tag: 'nuevo', title: 'Aprende: trucos y tutoriales', text: 'Más de 40 trucos por temas, tutoriales en vídeo y un buscador para encontrar lo que quieras. En Más → Aprende.', shots: ['novedades/aprende-1.jpg', 'novedades/aprende-2.jpg'], try: 'go:learn' },
    ] },
  ];

  const esc = (s) => UI.esc(s == null ? '' : String(s));
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const preview = () => ls(PREVIEW_KEY) === '1';
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
      ov.innerHTML = `${tv ? `<video class="nv-bgv" src="${tv.teaser}" poster="${tv.poster}" muted autoplay loop playsinline></video><div class="nv-shade"></div>` : ''}<div class="nv-in">
        <div class="nv-bars">${list.map((_, k) => `<span><i style="width:${k < i ? 100 : 0}%"></i></span>`).join('')}</div>
        <div class="nv-head"><span class="nv-logo">T</span>${s.head || 'Novedades'}<span class="nv-sp"></span><button class="nv-x" aria-label="Cerrar">${UI.icon('x', 22)}</button></div>
        ${tv ? `<div class="nv-sp"></div><button class="nv-watch" data-video><span class="nv-play">${UI.icon('play', 30)}</span><span class="nv-watch-l">Ver el vídeo · ${tv.dur}</span></button><div class="nv-sp"></div>${txt}`
          : `<div class="nv-stage"><div class="nv-phone${(s.shots || []).length > 1 ? ' nv-two' : ''}">${(s.shots || []).map(src => `<img src="${src}" alt="">`).join('')}</div></div>${txt}`}
        <button class="nv-cta" data-cta>${s.try ? `Pruébalo ${UI.icon('chevronRight', 16)}` : (i < list.length - 1 ? 'Siguiente' : 'Listo')}</button>
        <p class="nv-foot">${i + 1} de ${list.length}${s.tipId ? '' : ' · luego las tienes en Más → Aprende'}</p></div>`;
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
      <p class="nv-prev">Vista previa: solo la ves tú.</p>
    </div>`;
  }
  function tutosBind(app, root) { bindTutos(app, root); }

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
        <div class="lr-row">${n.stories.map((st, k) => { const tg = TAGS[st.tag] || TAGS.nuevo, img = st.video ? (tuto(st.video) || {}).poster : (st.shots || [])[0];
          return `<button class="lr-new-c" data-story="${k}" style="--c:${tg.bg};--d:${tg.dk}">
            <span class="lr-tags"><b>${tg.txt}</b>${st.video ? `<i>${UI.icon('play', 11)} vídeo</i>` : ''}</span>
            <span class="lr-ph">${img ? `<img src="${img}" alt="" loading="lazy">` : ''}</span>
            <strong>${esc(st.title)}</strong></button>`; }).join('')}</div>` : ''}
        ${TUTOS.length ? `<div class="lr-h"><span>Tutoriales</span>${TUTOS.length > 2 ? '<button class="link-btn" data-go="tutorials">Ver todos</button>' : ''}</div>
        <div class="lr-row">${TUTOS.map(t => tutoCard(t, vistos)).join('')}</div>` : ''}
        <div class="lr-h"><span>Por temas</span><small>${TIPS.length} trucos</small></div>
        <div class="lr-cats">${CATS.map(c => { const ts = TIPS.filter(t => t.cat === c.id), nuevos = ts.filter(t => !seenIds.includes(t.id)).length;
          return `<button class="lr-cat" data-cat="${c.id}"><span class="lr-cat-ic" style="background:${c.bg}">${UI.icon(c.icon, 18)}</span>
            <strong>${esc(c.name)}</strong><small>${ts.length} trucos${nuevos && nuevos < ts.length ? ` · ${nuevos} sin ver` : ''}</small></button>`; }).join('')}</div>
        <p class="nv-prev">Vista previa: solo la ves tú (5 toques al pie de Más para quitarla).</p>
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

  // Fila «Aprende» para Más (solo con la vista previa activa).
  function moreGroup() {
    if (!preview()) return null;
    const sinVer = TIPS.filter(t => !tipsSeen().includes(t.id)).length + TUTOS.filter(t => !seen().includes(t.id)).length;
    return { title: 'Aprende', color: 'var(--strong)', rows: [
      { v: 'learn', icon: 'star', label: 'Aprende', sub: `Novedades, tutoriales y ${TIPS.length} trucos${sinVer ? ` · ${sinVer} sin ver` : ''}` },
    ] };
  }

  return { tapFoot, moreGroup, learnView, learnBind, catView, catBind, tutosView, tutosBind, play, video, close, preview };
})();
