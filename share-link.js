// ============================================================
// COMPARTIR CON AMIGOS POR ENLACE
// ------------------------------------------------------------
// En vez de pasarse un archivo: tu amigo toca «Compartir con amigos», le sale un
// enlace y lo manda por WhatsApp (a ti o a un grupo). Al abrirlo, Traindía ofrece
// guardarlo como invitado para compararos (o actualizarlo si ya lo tenías) o
// quedarte con su plan o su nutrición en tu perfil.
//
// Privacidad: el paquete se comprime y se CIFRA en el móvil (AES-GCM 256). Al
// servidor del homelab (el mismo de los avisos) solo sube eso, ilegible; la llave
// va en el enlace detrás de «#», parte que el navegador nunca envía a ningún
// servidor. El servidor lo guarda en memoria; se puede abrir varias veces y se
// borra a las 48 horas o cuando quien lo creó lo retira. Si ya lo usaste en este
// móvil (añadiste su plan, lo guardaste como invitado…), al reabrirlo te lo avisa.
// ============================================================

const VShare = (() => {
  const SERVER_DEF = 'https://push.raulmarquez.dev';
  const server = () => { try { return localStorage.getItem('traindia.pushUrl') || SERVER_DEF; } catch (e) { return SERVER_DEF; } };
  const PENDING_KEY = 'traindia.pendingShare';
  const LAST_KEY = 'traindia.lastShare'; // antes solo se guardaba el último (sin la llave)
  const MINE_KEY = 'traindia.myShares';   // los que has creado: [{ id, key, del, exp, what }]
  const HERE_KEY = 'traindia.shareHere'; // en Safari de iPhone: «úsalo aquí» (solo esta visita)
  const USED_KEY = 'traindia.sharesUsed'; // enlaces ya usados aquí: { id: { at, did: [...] } }
  const TTL_TXT = '48 horas';

  // ---- base64url y cifrado ----
  const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (str) => { const s = str.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '==='.slice((s.length + 3) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function seal(obj) {
    let bytes = new TextEncoder().encode(JSON.stringify(obj));
    const zip = canZip();
    if (zip) bytes = await pipe(bytes, new CompressionStream('gzip'));
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const pkg = new Uint8Array(2 + 12 + ct.length);
    pkg[0] = 1; pkg[1] = zip ? 1 : 0; pkg.set(iv, 2); pkg.set(ct, 14); // versión · comprimido · iv · datos
    return { data: b64u(pkg), key: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', key))) };
  }
  async function unseal(data, keyStr) {
    const pkg = unb64u(data);
    if (pkg[0] !== 1) throw new Error('versión');
    const key = await crypto.subtle.importKey('raw', unb64u(keyStr), 'AES-GCM', false, ['decrypt']);
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: pkg.subarray(2, 14) }, key, pkg.subarray(14)));
    if (pkg[1] === 1) bytes = await pipe(bytes, new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function api(path, opts = {}) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(server() + path, { ...opts, cache: 'no-store', signal: ctl.signal, headers: { 'Content-Type': 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || ('HTTP ' + r.status)), { status: r.status });
      return j;
    } finally { clearTimeout(t); }
  }

  // ---- Enlaces: #s=<id>.<llave> ----
  const parseLink = (txt) => { const m = String(txt || '').match(/#s=([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{40,50})/); return m ? { id: m[1], key: m[2] } : null; };
  const linkOf = (id, key) => `${location.origin}${location.pathname.replace(/index\.html$/, '')}#s=${id}.${key}`;
  // Al arrancar: si la app se abrió con un enlace, se guarda aparte y se limpia la
  // barra de direcciones (así una recarga no lo repite y la llave no se queda a la vista).
  function stashFromUrl() {
    const l = parseLink(location.hash);
    if (!l) return;
    try { localStorage.setItem(PENDING_KEY, `#s=${l.id}.${l.key}`); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search);
  }
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  // Tras arrancar con perfil: si había un enlace pendiente, se ofrece importarlo.
  async function checkPending(app) {
    let txt = null;
    try { txt = localStorage.getItem(PENDING_KEY); localStorage.removeItem(PENDING_KEY); } catch (e) {}
    if (!txt || !parseLink(txt)) return false;
    if (needsHandoff()) { handoff(app, txt, true); return true; }
    await open(app, txt);
    return true;
  }

  // En iPhone los enlaces se abren en Safari, no en la app de la pantalla de inicio,
  // y cada una guarda sus datos por separado: se explica cómo pasarlo a la app
  // (copiar y pegar) antes de nada, también si en Safari aún no hay perfil.
  const needsHandoff = () => { if (!isIOS() || standalone()) return false; try { return !sessionStorage.getItem(HERE_KEY); } catch (e) { return true; } };
  function pendingLink() { try { const t = localStorage.getItem(PENDING_KEY); return t && parseLink(t) ? t : null; } catch (e) { return null; } }
  // Al arrancar sin perfil (Safari recién abierto con el enlace)
  function handoffAtStart(app) {
    const txt = pendingLink();
    if (txt && needsHandoff()) handoff(app, txt, false);
  }
  function handoff(app, txt, hasProfile) {
    const full = location.origin + '/' + txt;
    UI.modal({
      title: 'Ábrelo en tu Traindía',
      bodyHTML: `<p class="modal-text">En iPhone los enlaces se abren en <strong>Safari</strong>, no en la Traindía de tu pantalla de inicio, y cada una guarda sus datos por separado.</p>
        <ol class="share-steps">
          <li><strong>Copia el enlace</strong> con el botón de abajo.</li>
          <li>Abre <strong>Traindía desde tu pantalla de inicio</strong>.</li>
          <li>Toca ${UI.icon('upload', 14)} arriba a la derecha y luego <strong>Pegar el enlace de un amigo</strong>.</li>
        </ol>
        <p class="field-hint">¿Aún no la tienes en la pantalla de inicio? Añádela primero (botón Compartir de Safari → <strong>Añadir a pantalla de inicio</strong>), ábrela desde ahí y pega el enlace. Lo que hagas aquí en Safari no pasa a la app.</p>`,
      actions: [
        { label: 'Usarlo en Safari', kind: 'ghost', onClick: () => {
          try { sessionStorage.setItem(HERE_KEY, '1'); } catch (e) {}
          if (hasProfile) setTimeout(() => checkPending(app), 50); // si no hay perfil, se abre al crearlo
        } },
        { label: 'Copiar enlace', kind: 'primary', onClick: async () => {
          try { await navigator.clipboard.writeText(full); } catch (e) { UI.toast('No se pudo copiar: mantén pulsado el enlace en WhatsApp y cópialo desde allí', 'err'); return false; }
          try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
          UI.toast('Enlace copiado: ahora abre Traindía desde tu pantalla de inicio');
        } },
      ],
    });
  }

  // «Pegar enlace» (botón de compartir de arriba): lo lee del portapapeles y lo abre.
  async function pasteAndOpen(app) {
    let txt = '';
    try { txt = await navigator.clipboard.readText(); } catch (e) {}
    if (parseLink(txt)) { open(app, txt); return true; }
    // El navegador no deja leer lo copiado (permiso, Firefox, dentro de un marco…) o no era un enlace:
    // en vez de decir «no hay nada», se deja pegarlo a mano.
    const v = await UI.prompt({ title: 'Pega el enlace de tu amigo', label: txt ? 'Lo que tenías copiado no era un enlace de Traindía. Pégalo aquí:' : 'Mantén pulsado aquí y elige «Pegar»:', placeholder: 'https://traindia.raulmarquez.dev/#s=…', confirmLabel: 'Abrir' });
    if (v == null) return false;
    if (parseLink(v)) { open(app, v.trim()); return true; }
    UI.toast('Eso no es un enlace de Traindía', 'err');
    return false;
  }

  // ---- Enlaces ya usados en este móvil (se olvidan cuando ya han caducado) ----
  const DID_TXT = { compare: 'lo guardaste como invitado', plan: 'añadiste su plan', nutrition: 'usaste su nutrición' };
  function usedAll() {
    let m = {};
    try { m = JSON.parse(localStorage.getItem(USED_KEY)) || {}; } catch (e) {}
    const old = Date.now() - 3 * 86400000;
    for (const id of Object.keys(m)) if (!m[id] || m[id].at < old) delete m[id];
    return m;
  }
  function markUsed(id, what) {
    if (!id) return;
    const m = usedAll();
    const x = m[id] || { did: [] };
    x.at = Date.now();
    if (!x.did.includes(what)) x.did.push(what);
    m[id] = x;
    try { localStorage.setItem(USED_KEY, JSON.stringify(m)); } catch (e) {}
  }
  const usedOf = (id) => usedAll()[id] || null;
  const cuando = (t) => {
    const d = new Date(t), hoy = new Date(); const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`;
    if (d.toDateString() === ayer.toDateString()) return `ayer a las ${hora}`;
    return `el ${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })} a las ${hora}`;
  };
  const humanList = (a) => a.length > 1 ? `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}` : a[0] || '';

  // ---- Recibir: descargar, descifrar y ofrecer añadir como invitado ----
  async function open(app, txt, again) {
    const l = parseLink(txt);
    if (!l) { UI.toast('Ese enlace no es de Traindía', 'err'); return false; }
    const used = !again && usedOf(l.id);
    if (used) {
      const did = humanList(used.did.map(k => DID_TXT[k]).filter(Boolean));
      UI.modal({
        title: 'Ya canjeaste este enlace',
        bodyHTML: `<p class="modal-text">Lo usaste ${cuando(used.at)}${did ? `: ${did}` : ''}.</p>
          <p class="modal-text">¿Quieres volver a usarlo?</p>`,
        actions: [
          { label: 'No', kind: 'ghost' },
          { label: 'Volver a usarlo', kind: 'primary', onClick: () => { setTimeout(() => open(app, txt, true), 50); } },
        ],
      });
      return true;
    }
    UI.toast('Abriendo lo que te han compartido…');
    let payload, r = null;
    try {
      r = await api(`/share/${l.id}`);
      payload = await unseal(r.data, l.key);
    } catch (e) {
      // sin respuesta (o rechazada) es cosa del servidor o de la conexión, no del enlace
      const sinServidor = !r && !(e && e.status === 404);
      UI.hideToast(); // el «Abriendo…» no se queda encima del aviso
      UI.modal({
        title: 'No se ha podido abrir',
        bodyHTML: `<p class="modal-text">${e && e.status === 404 ? `Este enlace ha caducado o lo han retirado (duran ${TTL_TXT}). Pídele que te mande uno nuevo.` : navigator.onLine === false ? 'Sin conexión: vuelve a abrirlo cuando tengas internet.' : sinServidor ? 'No se ha podido conectar con el servidor de los enlaces. Inténtalo de nuevo en un rato.' : 'El enlace está incompleto o no se ha podido descifrar. Pídele que te lo reenvíe.'}</p>`,
        actions: [{ label: 'Cerrar', kind: 'primary' }],
      });
      return false;
    }
    if (!payload || !payload.data || !payload.share) { UI.toast('El enlace no trae datos de Traindía', 'err'); return false; }
    UI.hideToast();
    offer(app, payload, l.id);
    return true;
  }

  // Qué hacer con lo que te pasan: compararos (invitado) o quedarte con su plan o
  // su nutrición en tu perfil. Si solo cabe una cosa, va directo.
  function offer(app, payload, id) {
    const from = payload.from || {};
    const d = payload.data;
    const name = from.name || 'Tu amigo';
    const sub = { format: payload.format, version: payload.version, exportedAt: payload.exportedAt, user: { name: from.name, color: from.color } };
    const done = (what) => () => markUsed(id, what); // al terminar de aplicarlo, no al elegirlo
    const ya = (usedOf(id) || { did: [] }).did;
    const rt = (d.routines || [])[0];
    const nut = (d.nutrition || []).find(n => n.isPrimary) || (d.nutrition || [])[0];
    const nSes = (d.sessions || []).length, nPrg = (d.progress || []).length;
    const opts = [];
    if (nSes || nPrg) opts.push({ id: 'compare', icon: 'users', color: 'var(--light)', title: 'Compararnos',
      sub: `Guarda sus ${[nSes && `${nSes} entreno${nSes === 1 ? '' : 's'}`, nPrg && 'medidas'].filter(Boolean).join(' y ')} como invitado. No toca tus datos.`,
      go: () => offerGuest(app, payload, done('compare')) });
    if (rt) {
      const nDays = (rt.days || []).filter(x => !x.isRest).length;
      opts.push({ id: 'plan', icon: 'calendar', color: 'var(--moderate)', title: 'Añadir su plan a mis planes',
        sub: `${rt.name ? `«${UI.esc(rt.name)}» · ` : ''}${nDays} día${nDays === 1 ? '' : 's'} de entreno. Revisas los ejercicios y lo activas cuando quieras.`,
        go: () => VData.routeImport(app, { ...sub, kind: 'plan', data: { routine: rt, exercises: d.exercises || [], places: d.places || [] }, onDone: done('plan') }) });
    }
    if (nut) {
      const plan = { ...nut }; delete plan.id; delete plan.userId; delete plan.isPrimary; delete plan.createdAt;
      opts.push({ id: 'nutrition', icon: 'book', color: 'var(--sub-accent)', title: 'Usar su nutrición', sub: 'Su pauta de alimentación, en tu Nutrición.',
        go: () => VData.routeImport(app, { ...sub, kind: 'nutrition', data: { plan }, onDone: done('nutrition') }) });
    }
    if (!opts.length) { UI.toast('El enlace no trae datos', 'err'); return; }
    if (opts.length === 1) { opts[0].go(); return; }
    UI.modal({
      title: `${UI.esc(name)} te comparte su Traindía`,
      bodyHTML: `<p class="modal-text">¿Qué quieres hacer?</p>
        <div class="menu-list">${opts.map(o => `<button class="big-row" data-opt="${o.id}"><span class="big-row-icon tile" style="background:${o.color}">${UI.icon(o.icon, 18)}</span><span class="big-row-text"><strong>${o.title}</strong><span class="dim">${ya.includes(o.id) ? '<b>Ya lo hiciste.</b> ' : ''}${o.sub}</span></span><span class="chev">›</span></button>`).join('')}</div>
        <p class="field-hint">Puedes volver a abrir el enlace para hacer otra cosa mientras no caduque (dura ${TTL_TXT}).</p>`,
      actions: [{ label: 'Ahora no', kind: 'ghost' }],
      onMount: (m) => m.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
        const o = opts.find(x => x.id === b.dataset.opt);
        UI.closeModal(m); setTimeout(() => o.go(), 50);
      })),
    });
  }
  async function offerGuest(app, payload, onDone) {
    const from = payload.from || {};
    const d = payload.data;
    const nSes = (d.sessions || []).length, nPrg = (d.progress || []).length;
    const users = await DB.getUsers();
    const guests = users.filter(u => !u.isMain);
    const same = guests.find(g => from.linkId && g.linkId === from.linkId);
    const parts = [nSes && `${nSes} entreno${nSes === 1 ? '' : 's'}`, nPrg && `${nPrg} registro${nPrg === 1 ? '' : 's'} de peso y medidas`, (d.routines || []).length && 'su plan', (d.nutrition || []).length && 'su nutrición'].filter(Boolean);
    UI.modal({
      title: `${UI.esc(from.name || 'Alguien')} te comparte su progreso`,
      bodyHTML: `<div id="shForm">
        <p class="modal-text">${parts.length ? `Trae ${parts.join(', ')}.` : 'No trae datos.'} Se guarda como <strong>perfil invitado</strong>: no toca tus datos y podéis compararos en <strong>Progreso → Comparativa</strong>.</p>
        ${same ? `<p class="field-hint">Ya lo tienes como <strong>${UI.esc(same.name)}</strong>: se actualizarán sus datos.</p>` : `
          <span class="field-label">Guardarlo en</span>
          <div class="check-list" style="max-height:none">
            <label class="check-row"><input type="radio" name="dest" value="new" checked><span>Invitado nuevo</span></label>
            ${guests.map(g => `<label class="check-row"><input type="radio" name="dest" value="${g.id}"><span>Actualizar a ${UI.esc(g.name)}</span></label>`).join('')}
          </div>
          <div id="shNew">${UI.field('Nombre', UI.input('gname', from.name || 'Invitado'))}</div>`}
      </div>`,
      actions: [
        { label: 'Ahora no', kind: 'ghost' },
        { label: same ? 'Actualizar' : 'Guardar', kind: 'primary', onClick: async (m) => {
          let guest = same;
          if (!guest) {
            const dest = (m.querySelector('input[name="dest"]:checked') || {}).value || 'new';
            if (dest === 'new') {
              const name = (m.querySelector('input[name="gname"]').value || '').trim();
              if (!name) { UI.toast('Ponle un nombre', 'err'); return false; }
              // Que no coincida con tu color (si no, en la Comparativa las dos líneas se confunden)
              const mine = (app.mainUser && app.mainUser.color || '').toLowerCase();
              const used = new Set(users.map(x => (x.color || '').toLowerCase()));
              const color = (from.color && from.color.toLowerCase() !== mine) ? from.color : (UI.ESSENTIALS.find(c => !used.has(c.toLowerCase())) || UI.ESSENTIALS[3]);
              guest = await DB.createUser({ name, color, isGuest: true });
            } else guest = users.find(u => u.id === dest);
          }
          if (from.linkId) guest.linkId = from.linkId;
          guest.sharedAt = Date.now(); // «Actualizado por enlace hace…» en Perfiles
          await DB.put('users', guest);
          await VData.importShared(app, payload, guest.id);
          await app.loadUsers();
          if (onDone) onDone();
          UI.toast(same ? `${guest.name} actualizado` : `${guest.name} añadido`);
          app.go('progress', { tab: 'compare' });
        } },
      ],
      onMount: (m) => {
        const box = m.querySelector('#shNew');
        m.querySelectorAll('input[name="dest"]').forEach(r => r.addEventListener('change', () => { if (box) box.style.display = r.value === 'new' && r.checked ? '' : 'none'; }));
      },
    });
  }

  // ---- Enviar: elegir qué, cifrar, subir y compartir el enlace ----
  async function linkId() {
    const s = (await DB.getSettings()) || {};
    if (s.shareLinkId) return s.shareLinkId;
    const id = b64u(crypto.getRandomValues(new Uint8Array(9)));
    await DB.saveSettings({ shareLinkId: id });
    return id;
  }
  // ---- Tus enlaces activos (en este móvil, que es el que guarda el permiso para retirarlos) ----
  const WHAT_TXT = { sessions: 'Entrenos', progress: 'peso y medidas', plan: 'plan', nutrition: 'nutrición' };
  const whatTxt = (w) => { const s = humanList((w || []).map(k => WHAT_TXT[k]).filter(Boolean)); return s ? s[0].toUpperCase() + s.slice(1) : 'Enlace anterior'; };
  const hastaTxt = (exp) => { // «hasta hoy / mañana / el miércoles 4 a las 18:24»
    try {
      const d = new Date(exp), hoy = new Date(), man = new Date(); man.setDate(hoy.getDate() + 1);
      const dia = d.toDateString() === hoy.toDateString() ? 'hoy' : d.toDateString() === man.toDateString() ? 'mañana' : `el ${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}`;
      return `hasta ${dia} a las ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) { return ''; }
  };
  function myShares() {
    let a = [], moved = false;
    try { a = JSON.parse(localStorage.getItem(MINE_KEY)) || []; } catch (e) {}
    try { // el último de antes de la lista
      const last = JSON.parse(localStorage.getItem(LAST_KEY));
      if (last && last.id && !a.some(x => x.id === last.id)) { a.push(last); moved = true; }
      localStorage.removeItem(LAST_KEY);
    } catch (e) {}
    const live = a.filter(x => x && x.id && x.exp > Date.now()).sort((x, y) => y.exp - x.exp);
    if (moved || live.length !== a.length) saveMine(live);
    return live;
  }
  function saveMine(a) { try { localStorage.setItem(MINE_KEY, JSON.stringify(a)); } catch (e) {} }
  const forget = (id) => saveMine(myShares().filter(x => x.id !== id));
  async function revoke(s) {
    try { await api(`/share/${s.id}?del=${encodeURIComponent(s.del)}`, { method: 'DELETE' }); }
    catch (e) { if (!(e && e.status === 404)) { UI.toast('No se pudo retirar. ¿Tienes conexión?', 'err'); return false; } }
    forget(s.id);
    UI.toast('Enlace retirado: ya no se puede abrir');
    return true;
  }
  const mineHTML = (list) => !list.length ? '' : `<span class="field-label">Tus enlaces activos</span>
    <div class="sh-mine">${list.map(s => `<div class="sh-link" data-id="${s.id}">
        <div class="sh-link-txt"><strong>${UI.esc(whatTxt(s.what))}</strong><span>${UI.esc(hastaTxt(s.exp))}</span></div>
        <div class="sh-link-act">${s.key ? `<button class="btn ghost small" data-copy>Copiar</button>` : ''}<button class="btn ghost danger small" data-revoke>Retirar</button></div>
        <div class="sh-link-ask" hidden><span>Nadie más podrá abrirlo.</span><button class="btn ghost small" data-no>Cancelar</button><button class="btn danger small" data-yes>Retirar</button></div>
      </div>`).join('')}</div>`;
  function bindMine(m) {
    m.querySelectorAll('.sh-link').forEach(row => {
      const s = myShares().find(x => x.id === row.dataset.id); if (!s) return;
      const act = row.querySelector('.sh-link-act'), ask = row.querySelector('.sh-link-ask');
      const c = row.querySelector('[data-copy]');
      if (c) c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(linkOf(s.id, s.key)); UI.toast('Enlace copiado'); } catch (e) { UI.toast('No se pudo copiar', 'err'); } });
      row.querySelector('[data-revoke]').addEventListener('click', () => { act.hidden = true; ask.hidden = false; });
      row.querySelector('[data-no]').addEventListener('click', () => { ask.hidden = true; act.hidden = false; });
      row.querySelector('[data-yes]').addEventListener('click', async (ev) => {
        ev.currentTarget.disabled = true;
        if (!(await revoke(s))) { ev.currentTarget.disabled = false; return; }
        row.remove();
        if (!m.querySelector('.sh-link')) { const box = m.querySelector('.sh-mine'); box.previousElementSibling.remove(); box.remove(); }
      });
    });
  }

  async function start(app) {
    const u = app.mainUser, uid = u.id;
    const mine = myShares();
    const [ses, prg, nut] = await Promise.all([DB.sessionsOf(uid), DB.progressOf(uid), DB.nutritionOf(uid).catch(() => [])]);
    const sessions = ses.filter(x => !x.draft);
    const opt = (k, label, n, on) => `<label class="metric-opt"><input type="checkbox" data-part="${k}"${on ? ' checked' : ''}${n === 0 ? ' disabled' : ''}><span>${label}${n != null ? ` <span class="dim">(${n})</span>` : ''}</span></label>`;
    UI.modal({
      title: 'Compartir con amigos', size: 'wide',
      bodyHTML: `<p class="modal-text">Te sale un <strong>enlace</strong> para mandarlo por WhatsApp a quien quieras, también a un grupo. Quien lo abra podrá guardarte como invitado para compararos o quedarse con tu plan o tu nutrición.</p>
        ${mineHTML(mine)}
        <p class="field-hint"${mine.length ? '' : ' style="margin-top:0"'}>${mine.length ? '¿Creas otro? ' : ''}¿Qué compartes?</p>
        <div class="metric-opts">
          ${opt('sessions', 'Mis entrenos', sessions.length, true)}
          ${opt('progress', 'Peso y medidas', prg.length, true)}
          ${opt('plan', 'Mi plan activo', app.routine ? null : 0, false)}
          ${opt('nutrition', 'Mi nutrición', nut.length, false)}
        </div>
        <p class="field-hint share-privacy">🔒 El paquete se cifra en tu móvil y se guarda en el servidor de Traindía, que no puede leerlo: la llave va dentro del enlace. Se borra a los ${TTL_TXT} o cuando lo retires. Cualquiera que tenga el enlace puede abrirlo: mándalo solo a quien quieras.</p>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear enlace', kind: 'primary', onClick: async (m) => {
          const want = new Set([...m.querySelectorAll('[data-part]:checked')].map(c => c.dataset.part));
          if (!want.size) { UI.toast('Marca al menos una cosa', 'err'); return false; }
          if (!navigator.onLine) { UI.toast('Sin conexión: hace falta internet para crear el enlace', 'err'); return false; }
          const btn = m.querySelector('.modal-actions .btn.primary'); btn.textContent = 'Creando…'; btn.disabled = true;
          try {
            const payload = await VData.gatherShare(app, want);
            payload.share = true;
            payload.from = { name: u.name, color: u.color, linkId: await linkId() };
            const { data, key } = await seal(payload);
            const r = await api('/share', { method: 'POST', body: JSON.stringify({ data }) });
            const link = linkOf(r.id, key);
            saveMine([{ id: r.id, key, del: r.del, exp: r.exp, what: [...want] }, ...myShares()]);
            setTimeout(() => showLink(app, link, r), 60);
          } catch (e) {
            btn.textContent = 'Crear enlace'; btn.disabled = false;
            UI.toast(e && e.status === 400 ? 'Es demasiado grande para un enlace: quita algo (por ejemplo la nutrición)' : e && e.status === 503 ? 'El servidor está ocupado: prueba en un rato' : 'No se pudo crear el enlace. ¿Tienes conexión?', 'err');
            return false;
          }
        } },
      ],
      onMount: bindMine,
    });
  }
  function showLink(app, link, r) {
    const hasta = hastaTxt(r.exp);
    const canShare = !!(navigator.share);
    UI.modal({
      title: 'Enlace listo',
      bodyHTML: `<p class="modal-text">Mándaselo a quien quieras, también a un grupo. Se puede abrir <strong>las veces que haga falta</strong>${hasta ? ` <strong>${UI.esc(hasta)}</strong>` : ''}.</p>
        <input class="inp share-link-inp" readonly value="${UI.esc(link)}">
        <p class="field-hint">Si te arrepientes, lo retiras desde ${UI.icon('upload', 13)} → <strong>Compartir con amigos</strong>.</p>
        <button class="btn ghost danger small" id="shRevoke" style="margin-top:4px">Retirar el enlace</button>`,
      actions: [
        { label: 'Copiar', kind: 'ghost', onClick: async () => { try { await navigator.clipboard.writeText(link); UI.toast('Enlace copiado'); } catch (e) { UI.toast('Mantén pulsado el enlace para copiarlo', 'err'); } return false; } },
        ...(canShare ? [{ label: 'Compartir', kind: 'primary', onClick: () => {
          try { const p = navigator.share({ title: 'Mi Traindía', text: `${app.mainUser.name} te comparte su Traindía:`, url: link }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
          return false;
        } }] : []),
      ],
      onMount: (m) => {
        const inp = m.querySelector('.share-link-inp'); inp.addEventListener('focus', () => inp.select());
        m.querySelector('#shRevoke').addEventListener('click', async () => {
          if (await revoke(r)) UI.closeModal();
        });
      },
    });
  }

  return { start, open, stashFromUrl, checkPending, handoffAtStart, pasteAndOpen, parseLink, seal, unseal };
})();
