// ============================================================
// APP Traindía v2 — controlador, router, shell, onboarding, perfiles
// ============================================================

const app = {
  REPO_URL: 'https://github.com/RaulMarquez24/Traindia',
  currentView: 'week',
  params: {},
  history: [],

  settings: null,
  mainUser: null,
  activeUser: null,   // en uso diario, siempre = mainUser
  usersById: {},
  routine: null,      // rutina principal del usuario activo (cache)

  // Registro de vistas: cada una expone render(app, params)->HTML y opcional bind()
  views: {},

  async init() {
    try {
      await this.boot();
    } catch (e) {
      console.error(e);
      this.showBootError(e);
    }
  },

  // Pantalla de error en vez de dejar la app en blanco si el arranque falla.
  showBootError(e) {
    const bloqueada = e && (e.message === 'BLOCKED' || e.name === 'VersionError');
    document.documentElement.classList.add('has-profile'); // saca la app (si no, el error quedaría oculto tras la presentación)
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.innerHTML = `<div class="view active"><div class="section">
      <div class="empty-state">
        <p><strong>${bloqueada ? 'Traindía está abierta en otro sitio' : 'No se ha podido arrancar'}</strong></p>
        <p class="dim">${bloqueada
          ? 'Para terminar de actualizar hay que cerrar las demás copias: cierra las pestañas del navegador y la app de la pantalla de inicio (deslízala fuera de recientes) y vuelve a abrirla.'
          : UI.esc((e && e.message) || 'Error desconocido')}</p>
      </div>
      <button class="btn primary block" id="bootRetry">Reintentar</button>
    </div></div>`;
    const r = main.querySelector('#bootRetry');
    if (r) r.addEventListener('click', () => location.reload());
  },

  async boot() {
    try { VShare.stashFromUrl(); } catch (e) {} // enlace de «Compartir mi progreso»: se guarda y se limpia la URL
    this.applyTheme(this.getTheme()); // tema antes de nada (sincroniza barra del navegador)
    if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (this.getTheme() === 'system') this.applyTheme('system'); }); } catch (e) {} }
    await DB.open();
    this.registerViews();
    this.bindShell();

    this.settings = await DB.getSettings();
    if (!this.settings || !this.settings.seeded || !this.settings.mainUserId) {
      this.showLanding(); // visitante nuevo: presentación con botón para empezar
      return;
    }
    this.markHasProfile();
    await DB.migrate();
    await this.loadUsers();
    DB.sessionsOf(this.mainUser.id).then(ss => {
      if (ss.some(x => !x.draft)) { try { localStorage.setItem('traindia-first-workout', '1'); } catch (e) {} if (window.showInstallPrompt) window.showInstallPrompt(); }
    }).catch(() => {});
    await this.refreshRoutine();
    await DB.ensurePlaces(this.routine);
    // Plan de plantilla: trae al catálogo lo que la plantilla haya ganado desde que se
    // creó (vídeos, técnica, suplentes). Solo añade lo que falte; nunca pisa nada.
    const tpl = VPlan.templateOf(this);
    if (tpl) DB.ensureTemplateExercises(this.activeUser.id, tpl).catch(() => {});
    this.go('week', {}, true);
    // Unificación de cardio (v10): si hay variantes, avisa y deja hacer copia antes.
    if (await DB.cardioUnifyPending()) { this.showCardioMigration(); return; }
    if (((this.settings && this.settings.dataVersion) || 0) < 10) await DB.runCardioUnify(); // nada que cambiar: solo marca hecho
    // Un archivo compartido es una acción explícita del usuario: va ANTES que el aviso
    // de entreno a medias (si no, se apilan dos modales). El aviso vuelve al siguiente inicio.
    if (await this.checkSharedImport()) return;
    if (await VShare.checkPending(this)) return; // abriste la app con un enlace de un amigo
    await VSessions.checkResume(this);
    if (await VSessions.checkDayAfter(this)) return; // semáforo: cómo amaneciste tras el último entreno
    VData.checkBackupReminder(this); // recordatorio semanal de copia (si procede)
    VPlan.checkDuplicates(this);     // avisa si hay ejercicios duplicados sin usar
  },

  // Archivo recibido por "Compartir" desde otra app (WhatsApp, Archivos…). El SW lo
  // deja en una caché-buzón y aquí lo leemos, lo vaciamos y lanzamos la importación.
  // Devuelve true si había algo que importar.
  async checkSharedImport() {
    const clean = () => { // quita ?shared=1 para que al recargar no se repita
      if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    };
    if (!('caches' in window)) { clean(); return false; }
    let buf = null, type = '', name = 'archivo', kind = '';
    try {
      const cache = await caches.open('traindia-share-inbox');
      const res = await cache.match('./__shared-import');
      if (res) {
        type = res.headers.get('Content-Type') || '';
        kind = res.headers.get('X-Share-Kind') || '';
        try { name = decodeURIComponent(res.headers.get('X-Share-Name') || 'archivo'); } catch (e) {}
        buf = await res.arrayBuffer();
        await cache.delete('./__shared-import');
      }
    } catch (e) { /* sin caché disponible: nada que hacer */ }
    clean();
    if (!buf || !buf.byteLength) return false;
    window.__holdReload = true; // no auto-recargar por actualización: perdería el modal (ver index.html)

    // ¿Es un export de Traindía? Entonces se importa. Si no, se guarda como documento.
    const text = this.decodeShared(buf);
    const parsed = this.parseExport(text);
    if (parsed) { VData.routeImport(this, parsed); return true; }
    // El mensaje de un amigo con su enlace de «Compartir mi progreso» (reenviado a Traindía): se abre.
    if (typeof VShare !== 'undefined' && VShare.parseLink(text)) { await VShare.open(this, text); return true; }
    // Parece texto (JSON, .txt, o solo llegó el texto del mensaje) pero no es un
    // export: decir QUÉ ha llegado en vez de ofrecer guardarlo como documento.
    const pareceTexto = kind === 'text' || /json|text/i.test(type) || /\.(json|txt)$/i.test(name)
      || (text && !/[\u0000�]/.test(text.slice(0, 2000)));
    if (pareceTexto) { this.explainSharedText({ kind, type, name, text, size: buf.byteLength }); return true; }
    return await this.offerSaveSharedDoc({ buf, type, name });
  },

  // Texto del archivo compartido: UTF-8 (o UTF-16 si lo parece), sin BOM.
  decodeShared(buf) {
    try {
      const b = new Uint8Array(buf.slice(0, 400));
      let zeros = 0; for (let i = 1; i < b.length; i += 2) if (b[i] === 0) zeros++;
      const enc = (b[0] === 0xFF && b[1] === 0xFE) || zeros > b.length / 4 ? 'utf-16le' : 'utf-8';
      return new TextDecoder(enc).decode(buf).replace(/^﻿/, '');
    } catch (e) { return ''; }
  },
  // Export de Traindía dentro de un texto: tolera espacios, texto alrededor del
  // JSON (p. ej. un pie de mensaje) y JSON metido como string.
  parseExport(text) {
    const ok = (o) => o && typeof o === 'object' && (o.format === 'traindia-export' || o.format === 'cnp-export') && o.data ? o : null;
    const tryParse = (s) => { try { let o = JSON.parse(s); if (typeof o === 'string') o = JSON.parse(o); return ok(o); } catch (e) { return null; } };
    const t = (text || '').trim();
    if (!t) return null;
    const a = t.indexOf('{'), z = t.lastIndexOf('}');
    return tryParse(t) || (a >= 0 && z > a ? tryParse(t.slice(a, z + 1)) : null);
  },
  explainSharedText({ kind, type, name, text, size }) {
    const soloTexto = kind === 'text';
    const muestra = (text || '').trim().slice(0, 160);
    UI.modal({
      title: 'No se puede importar',
      bodyHTML: soloTexto
        ? `<p class="modal-text">WhatsApp ha mandado <strong>solo el texto del mensaje</strong>, sin el archivo. Es cosa de WhatsApp: a veces lo hace al compartir desde el chat.</p>
           <ul class="nut-check">
             <li><strong>Si era un archivo de Traindía</strong>: ábrelo en el chat (tócalo) y compártelo desde el visor, o guárdalo y en Traindía ve a <strong>Compartir → Importar → elegir archivo</strong>.</li>
             <li><strong>Para pasaros el progreso</strong>, mejor <strong>Compartir → Con un amigo</strong>: es un enlace, basta con tocarlo en el chat y funciona también en iPhone.</li>
           </ul>`
        : `<p class="modal-text">Ha llegado <strong>${UI.esc(name)}</strong>, pero no es un archivo exportado de Traindía (o está incompleto).</p>
           <p class="modal-text dim">Si es el plan que te pasaron, en Traindía usa <strong>Compartir → Importar → elegir archivo</strong>.</p>`,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        { label: 'Importar a mano', kind: 'primary', onClick: () => { setTimeout(() => VData.openShare(this), 50); } },
      ],
      onMount: (root) => {
        // Datos técnicos plegados, por si hay que averiguar qué pasó.
        const det = document.createElement('details');
        det.className = 'det';
        det.innerHTML = `<summary>Detalles</summary><p class="field-hint">Tipo: ${UI.esc(type || '—')} · ${size} bytes · ${soloTexto ? 'solo texto' : 'archivo'}</p>${muestra ? `<pre class="field-hint" style="white-space:pre-wrap;word-break:break-all">${UI.esc(muestra)}</pre>` : ''}`;
        root.querySelector('.modal-body').appendChild(det);
      },
    });
  },

  // Un archivo compartido que NO es un export: se ofrece guardarlo como documento
  // para tenerlo a mano durante el entreno.
  async offerSaveSharedDoc({ buf, type, name }) {
    const mb = buf.byteLength / 1048576;
    if (mb > this.MAX_DOC_MB) { UI.toast(`Ese archivo pesa ${mb.toFixed(1)} MB (máximo ${this.MAX_DOC_MB})`, 'err'); return true; }
    UI.modal({
      title: 'Guardar documento',
      bodyHTML: `<p class="modal-text">Has compartido <strong>${UI.esc(name)}</strong>.</p>
        <p class="modal-text dim">Se guardará en <strong>Documentos</strong> y podrás abrirlo durante el entreno, sin conexión.</p>`,
      actions: [
        { label: 'Ahora no', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async () => {
          await DB.addFile(this.activeUser.id, { name, type, size: buf.byteLength, data: buf });
          UI.toast('Documento guardado');
          this.go('docs', {}, true);
        } },
      ],
    });
    return true;
  },

  // Aviso de la reorganización de cardio (unificar máquinas + etiqueta), con copia.
  showCardioMigration() {
    UI.modal({
      title: 'Ordenar tus ejercicios de cardio',
      dismissable: false, // cambio obligatorio: no se puede cerrar sin continuar
      bodyHTML: `<p class="modal-text">Una pequeña reorganización de una sola vez: tus variantes de cardio (Cinta Z2, Bici Z2, Elíptica…) se <strong>unen por máquina</strong> — <strong>Cinta</strong>, <strong>Bicicleta</strong>, <strong>Elíptica</strong> — guardando la variante (Z2, conversacional, suave…) como <strong>etiqueta</strong>.</p>
        <p class="modal-text dim">Se actualizan tu catálogo, sesiones y plan; el progreso se conserva (podrás filtrar por etiqueta). Antes se guarda una <strong>copia interna</strong> (en "Más → Copias internas"); si quieres, descárgate también la tuya.</p>`,
      actions: [
        { label: 'Descargar copia', kind: 'ghost', onClick: async () => { await VData.backupProfile(this); return false; } },
        { label: 'Continuar', kind: 'primary', onClick: async () => {
          await DB.runCardioUnify();
          await this.loadUsers();
          await this.refreshRoutine();
          this.settings = await DB.getSettings();
          this.render();
          UI.toast('Cardio reorganizado');
          await VSessions.checkResume(this);
        } },
      ],
    });
  },

  // ---- Sesión en curso (autoguardado + indicador) ----
  _live: null,
  persistLive() {
    if (!this._live) return;
    this._live.draft = true;
    DB.put('sessions', this._live).catch(() => {});
  },
  updateActiveBar() {
    const bar = document.getElementById('activeBar');
    if (!bar) return;
    const show = this._live && this.currentView !== 'live';
    if (show) {
      bar.style.display = 'flex';
      const t = bar.querySelector('.ab-text');
      if (t) t.textContent = 'Entreno en curso' + (this._live.name ? ' · ' + this._live.name : '');
    } else {
      bar.style.display = 'none';
    }
    // Marca para que el temporizador de descanso global se coloque encima y no se solape.
    document.body.classList.toggle('has-active-bar', !!show);
  },

  registerViews() {
    this.views = {
      week:     { render: (a, p) => VPlan.week(a, p),     bind: (a, r, p) => VPlan.weekBind(a, r, p) },
      day:      { render: (a, p) => VPlan.day(a, p),      bind: (a, r, p) => VPlan.dayBind(a, r, p) },
      exercises:{ render: (a, p) => VPlan.exercises(a, p),bind: (a, r, p) => VPlan.exercisesBind(a, r, p) },
      guides:   { render: (a, p) => VPlan.guides(a, p), bind: (a, r, p) => VPlan.guidesBind(a, r, p) },
      guide:    { render: (a, p) => VPlan.guide(a, p),  bind: (a, r, p) => VPlan.guideBind(a, r, p) },
      info:     { render: (a, p) => VPlan.info(a, p),      bind: (a, r, p) => VPlan.infoBind(a, r, p) },

      sessions: { render: (a, p) => VSessions.list(a, p),   bind: (a, r, p) => VSessions.listBind(a, r, p) },
      session:  { render: (a, p) => VSessions.detail(a, p), bind: (a, r, p) => VSessions.detailBind(a, r, p) },
      live:     { render: (a, p) => VSessions.live(a, p),   bind: (a, r, p) => VSessions.liveBind(a, r, p) },

      progress: { render: (a, p) => VProgress.render(a, p), bind: (a, r, p) => VProgress.bind(a, r, p) },
      nutrition:{ render: (a, p) => VNutrition.render(a, p), bind: (a, r, p) => VNutrition.bind(a, r, p) },

      more:     { render: (a, p) => this.renderMore(),      bind: (a, r) => this.bindMore(r) },
      profiles: { render: (a, p) => this.renderProfiles(),  bind: (a, r) => this.bindProfiles(r) },
      settings: { render: (a, p) => this.renderSettings(),  bind: (a, r) => this.bindSettings(r) },
      backups:  { render: (a, p) => this.renderBackups(),   bind: (a, r) => this.bindBackups(r) },
      docs:     { render: (a, p) => this.renderDocs(),      bind: (a, r) => this.bindDocs(r) },
    };
  },

  bindShell() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => { this.history = []; this.go(btn.dataset.view, {}, true); });
    });
    document.getElementById('backBtn').addEventListener('click', () => this.back());
    document.getElementById('userChip').addEventListener('click', () => this.openUserMenu());
    const dataBtn = document.getElementById('dataBtn');
    if (dataBtn) dataBtn.addEventListener('click', () => VData.openShare(this));
    const activeBar = document.getElementById('activeBar');
    if (activeBar) activeBar.addEventListener('click', () => { if (this._live) this.go('live', { dayId: this._live.dayId }); });
    // Autoguardado extra al ocultar/cerrar la app
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.persistLive(); });
    window.addEventListener('pagehide', () => this.persistLive());
  },

  async loadUsers() {
    const users = await DB.getUsers();
    this.usersById = {};
    users.forEach(u => { this.usersById[u.id] = u; });
    this.mainUser = await DB.getMainUser();
    this.activeUser = this.mainUser;
    this.renderUserChip();
  },

  async refreshRoutine() {
    this.routine = await DB.primaryRoutineOf(this.activeUser.id);
    // Un plan importado puede traer los tipos de día en español y quedarse sin color:
    // se normalizan a strong/moderate/light/rest y se guarda si ha cambiado algo.
    if (this.routine && VPlan.normalizeDayTypes(this.routine)) {
      try { await DB.put('routines', this.routine); } catch (e) {}
    }
  },

  userById(id) { return this.usersById[id] || null; },

  // ---- Navegación ----
  go(view, params = {}, replace = false) {
    if (!replace && this.currentView) {
      this.history.push({ view: this.currentView, params: this.params });
    }
    this.currentView = view;
    this.params = params || {};
    this.render();
    window.scrollTo(0, 0);
  },

  back() {
    if (this.history.length === 0) { this.go('week', {}, true); return; }
    const prev = this.history.pop();
    this.currentView = prev.view;
    this.params = prev.params || {};
    this.render();
    window.scrollTo(0, 0);
  },

  async render() {
    document.body.dataset.view = this.currentView || 'week';
    this.updateHeader();
    this.updateNavActive();
    const main = document.getElementById('mainContent');
    const def = this.views[this.currentView] || this.views.week;
    main.innerHTML = `<div class="view active"><div class="loading">Cargando…</div></div>`;
    let html = '';
    try {
      html = await def.render(this, this.params);
    } catch (e) {
      console.error(e);
      html = `<div class="empty-state"><p>Error al cargar la vista.</p><p class="dim">${UI.esc(e.message || e)}</p></div>`;
    }
    main.innerHTML = `<div class="view active">${html}</div>`;
    this.updateHeader();   // otra vez: algunas vistas solo saben su título tras cargar sus datos
    this.bindLinks(main);
    if (def.bind) { try { def.bind(this, main, this.params); } catch (e) { console.error(e); } }
    this.updateActiveBar();
    try { VSessions.restEnsure(this); } catch (e) {} // mantiene el descanso global visible al navegar
  },

  bindLinks(scope) {
    scope.querySelectorAll('[data-link]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = el.dataset.link;
        const params = el.dataset.params ? JSON.parse(el.dataset.params) : {};
        this.go(target, params);
      });
    });
  },

  updateHeader() {
    const backBtn = document.getElementById('backBtn');
    backBtn.style.display = this.history.length > 0 ? 'flex' : 'none';
    const title = document.getElementById('headerTitle');
    const titles = {
      week: 'Traindía', exercises: 'Ejercicios', guides: 'Guías', info: 'Planes',
      sessions: 'Sesiones', live: 'Entreno', session: 'Sesión',
      progress: 'Progreso', nutrition: 'Nutrición',
      more: 'Más', profiles: 'Perfiles', settings: 'Ajustes', backups: 'Copias y datos', docs: 'Documentos',
    };
    let label = titles[this.currentView] || 'Traindía';
    if (this.currentView === 'nutrition' && typeof VNutrition !== 'undefined') {
      label = VNutrition.headerTitle(this.params) || label;   // Nutrición → pauta → comida
    } else if (this.currentView === 'day' && this.routine) {
      const d = this.routine.days.find(x => x.id === this.params.dayId);
      if (d) label = d.name;
    } else if (this.currentView === 'guide') {
      const g = VPlan.findGuide(this, this.params.guideId);
      if (g) label = g.title;
    }
    title.textContent = label;
    // En la pantalla de inicio, pulsar el logo «Traindía» abre la presentación.
    if (this.currentView === 'week') {
      title.classList.add('title-tap');
      title.title = 'Ver la presentación';
      title.onclick = () => this.previewLanding();
    } else {
      title.classList.remove('title-tap');
      title.removeAttribute('title');
      title.onclick = null;
    }
  },

  updateNavActive() {
    const map = {
      week: 'week', day: 'week', exercises: 'week',
      sessions: 'sessions', session: 'sessions', live: 'sessions',
      progress: 'progress', nutrition: 'nutrition',
      more: 'more', exercises: 'more', profiles: 'more', settings: 'more', guides: 'more', guide: 'more', info: 'more', backups: 'more', docs: 'more',
    };
    const active = map[this.currentView] || 'week';
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === active);
    });
  },

  renderUserChip() {
    const chip = document.getElementById('userChip');
    if (!this.activeUser) { chip.innerHTML = ''; return; }
    chip.innerHTML = `${UI.avatar(this.activeUser, 28)}`;
    chip.title = this.activeUser.name;
  },

  // ---- Onboarding (primer arranque) ----
  renderOnboarding() {
    document.getElementById('appShell').style.display = 'none';
    let host = document.getElementById('onboarding');
    if (!host) {
      host = document.createElement('div');
      host.id = 'onboarding';
      document.body.appendChild(host);
    }
    let planType = typeof TEMPLATES !== 'undefined' && TEMPLATES.list.length ? `tpl:${TEMPLATES.list[0].id}` : 'custom';
    host.innerHTML = `
      <div class="onb-wrap">
        <div class="onb-card">
          <button type="button" class="onb-back" id="onbBack" aria-label="Volver a la presentación">← Volver</button>
          <div class="onb-eyebrow">Bienvenido a Traindía</div>
          <h2>Configura tu perfil</h2>
          <p class="onb-sub">Este es el perfil principal de este dispositivo. La app arrancará siempre con él. Podrás cambiarlo todo desde Ajustes.</p>
          <div id="onbForm">
            ${UI.field('Tu nombre', UI.input('name', '', { placeholder: 'Ej: Raúl' }))}
            ${UI.field('Color', UI.colorPicker('color', UI.COLORS[0]))}
          </div>
          <span class="field-label">Empieza con</span>
          <div class="plan-choices" id="planChoices">${VPlan.planChoicesHTML(planType)}</div>
          <button class="btn primary block" id="onbStart">Empezar</button>
        </div>
      </div>`;
    UI.bindColorPicker(host);
    // Volver a la presentación: el #landing solo se ocultó (no se destruyó), así que
    // basta con quitar el onboarding y volver a mostrarlo desde arriba.
    const back = host.querySelector('#onbBack');
    if (back) back.addEventListener('click', () => {
      host.remove();
      const ld = document.getElementById('landing');
      if (ld) ld.style.display = '';
      window.scrollTo(0, 0);
    });
    VPlan.bindPlanChoices(host, (v) => { planType = v; });
    const start = host.querySelector('#onbStart');
    start.addEventListener('click', async () => {
      const data = UI.readForm(host.querySelector('#onbForm'));
      if (!data.name || !data.name.trim()) { UI.toast('Escribe un nombre', 'err'); return; }
      start.disabled = true;
      const user = await DB.createUser({ name: data.name, color: data.color, isMain: true });
      const tplId = planType.startsWith('tpl:') ? planType.slice(4) : null;
      // «Plan de tu entrenador»: se empieza con uno en blanco y se abre el importador.
      await DB.createPlan(user.id, tplId ? 'template' : 'custom', { activate: true, templateId: tplId });
      // Todo nace en el formato actual: nada que migrar.
      await DB.saveSettings({ mainUserId: user.id, activeUserId: user.id, seeded: true, version: 2, dataVersion: 10, cardioTimeMetric: true, legacyPlanRetiredV1: true });
      host.remove();
      this.markHasProfile(); // ya hay perfil: se oculta la presentación y se muestra la app
      document.getElementById('appShell').style.display = '';
      this.settings = await DB.getSettings();
      await this.loadUsers();
      await this.refreshRoutine();
      await DB.ensurePlaces(this.routine);
      try { localStorage.setItem('traindia-welcomed', '1'); } catch (e) {} // viene de la presentación
      UI.toast(`¡Listo, ${user.name}!`);
      this.go('week', {}, true);
      if (planType === 'ai') setTimeout(() => VPlanAI.open(this), 400);
      else setTimeout(() => VShare.checkPending(this), 500); // llegó por el enlace de un amigo antes de tener perfil
    });
  },


  // ---- Presentación (landing) vs app ----
  // Por defecto el HTML muestra la presentación; en cuanto hay perfil se marca el <html>
  // (y se recuerda en localStorage) para entrar directo a la app sin verla.
  HASPROFILE_KEY: 'traindia-hasprofile',
  markHasProfile() {
    try { localStorage.setItem(this.HASPROFILE_KEY, '1'); } catch (e) {}
    document.documentElement.classList.add('has-profile');
    if (window.showInstallPrompt) window.showInstallPrompt(); // el aviso esperaba a que hubiera perfil
  },
  // Visitante nuevo: presentación como puerta de entrada (aún sin perfil).
  showLanding() {
    try { localStorage.removeItem(this.HASPROFILE_KEY); } catch (e) {}
    document.documentElement.classList.remove('has-profile');
    this.initLanding();
  },

  // Ver la presentación teniendo YA perfil (desde Ajustes), para releerla o enseñarla.
  // No toca los datos ni el flag de perfil: solo la oculta/muestra en memoria.
  previewLanding() {
    this._landingPreview = true;
    const ld = document.getElementById('landing');
    if (ld) ld.style.display = '';
    document.documentElement.classList.remove('has-profile'); // muestra landing y oculta la app (localStorage intacto)
    // Con perfil, "Empezar gratis" no aplica: el CTA pasa a "Volver a la app".
    document.querySelectorAll('[data-ld-start]').forEach(b => { if (!b.dataset.orig) b.dataset.orig = b.textContent; b.textContent = 'Volver a la app'; });
    let close = document.getElementById('ldClose');
    if (!close && ld) {
      close = document.createElement('button');
      close.id = 'ldClose'; close.type = 'button'; close.className = 'ld-close';
      close.textContent = '✕ Volver a la app';
      close.addEventListener('click', () => this.exitLandingPreview());
      ld.appendChild(close);
    }
    if (close) close.style.display = '';
    this.initLanding();
    window.scrollTo(0, 0);
  },
  exitLandingPreview() {
    this._landingPreview = false;
    const ld = document.getElementById('landing');
    if (ld) ld.style.display = 'none';
    const close = document.getElementById('ldClose');
    if (close) close.style.display = 'none';
    document.querySelectorAll('[data-ld-start]').forEach(b => { if (b.dataset.orig) b.textContent = b.dataset.orig; });
    document.documentElement.classList.add('has-profile');
    window.scrollTo(0, 0);
  },

  // Bindeos y efectos de la presentación. Idempotente: los listeners y los efectos
  // se montan una sola vez; revealLanding se re-lanza en cada apertura.
  initLanding() {
    if (!this._landingReady) {
      this._landingReady = true;
      document.querySelectorAll('[data-ld-start]').forEach(b => b.addEventListener('click', () => this.startFromLanding()));
      // Botón claro/oscuro: alterna a partir del tema EFECTIVO (resuelve 'system').
      const themeBtn = document.querySelector('[data-ld-theme]');
      if (themeBtn) themeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        const dark = root.getAttribute('data-theme') === 'dark'
          || (!root.hasAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
        this.setTheme(dark ? 'light' : 'dark');
      });
      this.initScrollFx();
      this.initSeq();
    }
    this.revealLanding();
  },
  // El CTA de la presentación: si ya hay perfil, vuelve a la app; si no, al onboarding.
  startFromLanding() {
    if (this._landingPreview || (this.settings && this.settings.seeded && this.settings.mainUserId)) {
      this.exitLandingPreview();
      return;
    }
    const ld = document.getElementById('landing');
    if (ld) ld.style.display = 'none';
    this.renderOnboarding();
  },

  // Movimiento de la presentación. Todo va atado al scroll normal y nada se ancla:
  //  - paralaje: las imágenes se mueven unos píxeles menos que el texto (profundidad).
  //  - barra de progreso arriba, para que se vea que queda contenido por delante.
  // Solo transform y width: no toca el flujo, así que no hay saltos ni reflows.
  initScrollFx() {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const barra = document.querySelector('#landing .ld-bar i');
    const capas = reduce ? [] : [...document.querySelectorAll('#landing [data-par]')]
      .map(el => ({ el, amp: parseFloat(el.dataset.par) || 0 }));
    if (!barra && !capas.length) return;

    const pintar = () => {
      if (barra) {
        const alto = document.documentElement.scrollHeight - innerHeight;
        barra.style.width = (alto > 0 ? Math.min(100, Math.max(0, (scrollY / alto) * 100)) : 0) + '%';
      }
      const medio = innerHeight / 2;
      capas.forEach(c => {
        const r = c.el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return; // fuera de vista: ni se toca
        const d = ((r.top + r.height / 2) - medio) / innerHeight; // -1 arriba, +1 abajo
        c.el.style.transform = `translate3d(0, ${(d * c.amp).toFixed(1)}px, 0)`;
      });
    };

    let pedido = false;
    const alMover = () => {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(() => { pedido = false; pintar(); });
    };
    window.addEventListener('scroll', alMover, { passive: true });
    window.addEventListener('resize', alMover);
    pintar();
  },

  // Los pasos. La sección se ancla (position:sticky, lo hace el CSS) y el fondo se
  // queda quieto mientras lo que has bajado se traduce en movimiento lateral: el
  // paso que viene entra por la derecha y el anterior sale por la izquierda.
  // Al llegar al último la sección se suelta y se sigue bajando con normalidad.
  // Sin esto el CSS deja los pasos en vertical, uno debajo de otro, y se leen igual.
  initSeq() {
    const sec = document.querySelector('#landing [data-seq]');
    if (!sec) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const pin = sec.querySelector('.seq-pin');
    const pasos = [...sec.querySelectorAll('.seq-step')];
    const puntos = [...sec.querySelectorAll('.seq-dots i')];
    const cue = sec.querySelector('.seq-cue');
    if (!pin || pasos.length < 2) return;
    document.documentElement.classList.add('js-seq');

    // Cada cambio se mueve en el tramo central y descansa en los extremos: así da
    // tiempo a leer el paso antes de que empiece a irse.
    const suave = (f) => {
      const ini = 0.14, fin = 0.86;
      if (f <= ini) return 0;
      if (f >= fin) return 1;
      const t = (f - ini) / (fin - ini);
      return t * t * (3 - 2 * t);
    };

    const pintar = () => {
      const recorrido = sec.offsetHeight - pin.offsetHeight;
      if (recorrido <= 0) return;
      const avance = Math.min(1, Math.max(0, -sec.getBoundingClientRect().top / recorrido));
      const tramos = pasos.length - 1;
      const bruto = avance * tramos;
      const i = Math.min(tramos - 1, Math.floor(bruto));
      const donde = i + suave(bruto - i); // 0 = primer paso centrado, tramos = último
      const hueco = innerWidth < 700 ? 44 : 90; // aire entre un paso y el siguiente
      pasos.forEach((el, n) => {
        const rel = donde - n; // <0 aún por llegar (derecha), >0 ya se fue (izquierda)
        const fuera = Math.min(1, Math.abs(rel));
        if (fuera >= 1) { el.style.visibility = 'hidden'; return; } // ni se pinta
        el.style.visibility = '';
        const d = -rel;
        // Además de apartarse, el que se va se encoge y se apaga: el que manda es
        // siempre el del centro y la transición tiene fondo, no es un simple barrido.
        el.style.transform = `translate3d(calc(${(d * 100).toFixed(2)}% + ${(d * hueco).toFixed(0)}px), 0, 0) scale(${(1 - fuera * 0.09).toFixed(3)})`;
        el.style.opacity = (1 - fuera * 1.05 < 0 ? 0 : 1 - fuera * 1.05).toFixed(3);
        // La captura va un pelín por detrás del texto: da sensación de profundidad.
        const ui = el.querySelector('.seq-ui');
        if (ui) ui.style.transform = `translate3d(${(d * 7).toFixed(2)}%, 0, 0)`;
      });
      const activo = Math.round(donde);
      puntos.forEach((el, n) => {
        el.classList.toggle('on', n === activo);
        el.classList.toggle('done', n < activo); // los ya pasados quedan llenos: barra que baja
      });
      // La flecha "sigue bajando" se apaga al acercarse al último paso.
      if (cue) cue.style.opacity = avance < 0.85 ? '1' : Math.max(0, (1 - avance) / 0.15).toFixed(2);
    };

    let pedido = false;
    const alMover = () => {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(() => { pedido = false; pintar(); });
    };
    pintar();
    window.addEventListener('scroll', alMover, { passive: true });
    window.addEventListener('resize', alMover);

    // --- El gesto HORIZONTAL también avanza (se traduce a scroll vertical) ---
    // Es puramente ADITIVO: el scroll vertical sigue igual; esto solo hace que,
    // cuando alguien intenta deslizar de lado (trackpad o swipe), la presentación
    // avance en vez de no hacer nada. Solo actúa con la sección anclada; en los
    // extremos deja pasar el gesto para poder entrar y salir. Los listeners van en
    // la sección (no en window) para no penalizar el scroll del resto de la página.
    const anclada = () => {
      const r = sec.getBoundingClientRect();
      const recorrido = sec.offsetHeight - pin.offsetHeight;
      return r.top <= 1 && (-r.top) < recorrido - 1;
    };
    sec.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical: como siempre
      if (!anclada()) return;
      e.preventDefault();
      window.scrollBy({ top: e.deltaX, behavior: 'auto' });
    }, { passive: false });

    let sx = 0, sy = 0, modo = null; // modo: null indeciso · true horizontal · false vertical/fuera
    sec.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      modo = anclada() ? null : false;
    }, { passive: true });
    sec.addEventListener('touchmove', (e) => {
      if (modo === false) return; // vertical o fuera: scroll nativo, no se toca
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      if (modo === null) {
        const dx = x - sx, dy = y - sy;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // gesto aún sin definir
        modo = Math.abs(dx) > Math.abs(dy) * 1.3;
        if (!modo) return; // predominantemente vertical: se deja al scroll nativo
      }
      if (!anclada()) { modo = false; return; }
      e.preventDefault();
      window.scrollBy({ top: -(x - sx) * 1.5, behavior: 'auto' }); // deslizar a la izquierda = avanzar
      sx = x; sy = y;
    }, { passive: false });
    sec.addEventListener('touchend', () => { modo = null; }, { passive: true });
  },

  // Va mostrando cada bloque al entrar en pantalla. El estado oculto lo pone el CSS
  // (clase .js-reveal del <html>), así que aquí solo hay que marcar lo que ya se ve.
  revealLanding() {
    if (!document.documentElement.classList.contains('js-reveal')) return;
    const els = document.querySelectorAll('#landing .ld-sec, #landing .ld-band, #landing .ld-final');
    if (!els.length) { document.documentElement.classList.remove('js-reveal'); return; }
    let alguno = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        alguno = true;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(el => io.observe(el));
    window.__ldRevealReady = true; // desactiva la red de seguridad del <head>
    // Si por lo que sea el observador no llega a disparar (pestaña que nunca se pinta,
    // navegador raro...), se quita la animación y se enseña todo tal cual: nunca en blanco.
    setTimeout(() => { if (!alguno) { io.disconnect(); document.documentElement.classList.remove('js-reveal'); } }, 2500);
  },

  // ---- Tema (sistema / claro / oscuro) ----
  THEME_KEY: 'traindia-theme',
  getTheme() { try { return localStorage.getItem(this.THEME_KEY) || 'system'; } catch (e) { return 'system'; } },
  applyTheme(t) {
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme'); // 'system' → media query
    const dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1116' : '#f4f5f8'); // barra del navegador acorde al fondo
  },
  setTheme(t) { try { localStorage.setItem(this.THEME_KEY, t); } catch (e) {} this.applyTheme(t); },

  // ---- Menú de usuario (desde el chip) ----
  // Menú del avatar: tú (nombre y color), compartir tu progreso y tus amigos para compararos.
  openUserMenu() {
    const me = this.mainUser;
    const friends = Object.values(this.usersById).filter(u => !u.isMain);
    const ov = UI.modal({
      title: 'Tu perfil',
      bodyHTML: `
        <button class="set-head um-me" data-act="edit">${UI.avatar(me, 48)}<span class="pf-me-txt"><strong>${UI.esc(me.name)}</strong><span>Perfil principal</span></span><span class="set-head-edit">${UI.icon('edit', 15)} Editar</span></button>
        <div class="menu-list">
          <button class="menu-row" data-act="share"><span>${UI.icon('upload', 18)} Compartir mi progreso</span><span class="chev">›</span></button>
          <button class="menu-row" data-act="profiles"><span>${UI.icon('users', 18)} Tus amigos${friends.length ? ` <span class="dim">(${friends.length})</span>` : ''}</span><span class="chev">›</span></button>
        </div>
        ${friends.length ? `<div class="field-label" style="margin-top:16px">Compárate con</div>
          <div class="menu-list">${friends.map(u => `<button class="menu-row um-friend" data-compare="${u.id}"><span>${UI.avatar(u, 28)} ${UI.esc(u.name)}</span><span class="chev">›</span></button>`).join('')}</div>` : ''}
      `,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.addEventListener('click', () => { UI.closeModal(ov); fn(); }); };
        on('[data-act="edit"]', () => this.editUserModal(me.id));
        on('[data-act="share"]', () => VShare.start(this));
        on('[data-act="profiles"]', () => this.go('profiles'));
        root.querySelectorAll('[data-compare]').forEach(b => b.addEventListener('click', () => { UI.closeModal(ov); this.go('progress', { tab: 'compare', guestId: b.dataset.compare }); }));
      },
    });
  },

  // ---- Sugerencias / reportes (formulario → email vía Web3Forms) ----
  openFeedback(pre) {
    const ACCESS_KEY = '1ba5f2b9-bc2f-4d16-b0d7-6fcdf7f4639e';
    const preTipo = (pre && pre.tipo) || '';
    const preMsg = (pre && pre.mensaje) || '';
    const TIPOS = [
      { v: 'Sugerencia', l: 'Idea', ic: '💡', ph: '¿Qué te gustaría que hiciera Traindía, o qué mejorarías?' },
      { v: 'Error', l: 'Fallo', ic: '🐞', ph: '¿Qué hacías, qué esperabas que pasara y qué pasó? Si puedes, di en qué pantalla.' },
      { v: 'Otro', l: 'Otra cosa', ic: '💬', ph: 'Cuéntame lo que quieras.' },
    ];
    let tipo = TIPOS.some(t => t.v === preTipo) ? preTipo : (preTipo ? 'Otro' : 'Sugerencia');
    const ov = UI.modal({
      title: 'Sugerencias y reportes',
      bodyHTML: `<div id="fbForm">
        <p class="modal-text dim" style="margin-top:0">Me llega directo. Deja un contacto solo si quieres que te conteste.</p>
        <div class="fb-types" role="radiogroup">${TIPOS.map(t => `<button type="button" class="fb-type${t.v === tipo ? ' on' : ''}" data-tipo="${t.v}" role="radio" aria-checked="${t.v === tipo}"><span class="fb-ic">${t.ic}</span>${t.l}</button>`).join('')}</div>
        <input type="hidden" name="tipo" value="${UI.esc(tipo)}">
        ${UI.field('Mensaje', UI.textarea('mensaje', preMsg, (TIPOS.find(t => t.v === tipo) || TIPOS[0]).ph, 6))}
        ${UI.field('Tu contacto (opcional)', UI.input('contacto', '', { placeholder: 'Email o nombre, por si quiero responderte' }))}
        <input type="text" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
        <details class="det fb-privacy"><summary>Qué se envía</summary><p class="field-hint">Se envía por un servicio externo (Web3Forms) y me llega por correo. Con tu mensaje van el nombre de tu perfil, la versión de la app y el tipo de navegador (para poder reproducir los fallos). Nada de tus entrenos.</p></details>
      </div>`,
      onMount: (m) => {
        const hidden = m.querySelector('input[name="tipo"]'), ta = m.querySelector('textarea[name="mensaje"]');
        m.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => {
          tipo = b.dataset.tipo; hidden.value = tipo;
          m.querySelectorAll('[data-tipo]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
          ta.placeholder = (TIPOS.find(t => t.v === tipo) || TIPOS[0]).ph;
        }));
      },
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Enviar', kind: 'primary', onClick: async (overlay) => {
          const root = overlay.querySelector('#fbForm');
          const d = UI.readForm(root);
          if (d.botcheck) return; // honeypot: cierra en silencio
          if (!d.mensaje || !d.mensaje.trim()) { UI.toast('Escribe un mensaje', 'err'); return false; }
          if (!navigator.onLine) { UI.toast('Sin conexión: inténtalo cuando vuelvas a tener internet', 'err'); return false; }
          const btn = overlay.querySelector('.modal-actions .btn.primary');
          const prev = btn.textContent; btn.textContent = 'Enviando…'; btn.disabled = true;
          try {
            const res = await fetch('https://api.web3forms.com/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                access_key: ACCESS_KEY,
                subject: `Traindía · ${d.tipo}`,
                from_name: 'Traindía PWA',
                tipo: d.tipo,
                mensaje: d.mensaje.trim(),
                contacto: (d.contacto || '').trim() || '(no indicado)',
                version: 'v2.48.8',
                perfil: (this.mainUser && this.mainUser.name) || '',
                navegador: navigator.userAgent,
              }),
            });
            const out = await res.json().catch(() => ({}));
            if (res.ok && out.success) {
              overlay.querySelector('.modal-body').innerHTML = `<div class="fb-thanks"><span>🙌</span><strong>¡Gracias!</strong><p>Tu mensaje me ha llegado${(d.contacto || '').trim() ? ' y te contestaré si hace falta' : ''}.</p></div>`;
              overlay.querySelector('.modal-actions').innerHTML = '<button class="btn primary block" data-fb-close>Cerrar</button>';
              overlay.querySelector('[data-fb-close]').addEventListener('click', () => UI.closeModal(overlay));
              return false;
            }
            UI.toast('No se pudo enviar: ' + (out.message || 'inténtalo de nuevo'), 'err');
          } catch (e) {
            UI.toast('Fallo de red: inténtalo de nuevo', 'err');
          } finally {
            btn.textContent = prev; btn.disabled = false;
          }
          return false; // error → mantener el formulario abierto
        } },
      ],
    });
  },

  // ---- Vista MÁS ----
  async renderMore() {
    // Cada fila dice algo tuyo (plan activo, cuántos ejercicios, última copia…), no solo qué es.
    const uid = this.activeUser.id;
    const [plans, exs, docs, st] = await Promise.all([
      DB.routinesOf(uid).catch(() => []), DB.exercisesOf(uid).catch(() => []), this.loadDocs().catch(() => []), DB.getSettings().catch(() => null),
    ]);
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const guides = VPlan.guideList(this);
    const DAY = 86400000, last = (st && st.lastBackupAt) || 0; // fresco: la copia puede ser de hace un momento
    const ago = last ? Math.floor((Date.now() - last) / DAY) : -1;
    const copia = ago < 0 ? { txt: 'Aún no has hecho ninguna copia completa', warn: true }
      : { txt: `Última copia completa ${ago === 0 ? 'hoy' : ago === 1 ? 'ayer' : `hace ${ago} días`}`, warn: ago > 7 };
    const invitados = Object.keys(this.usersById).length - 1;
    const tema = { system: 'Tema del sistema', light: 'Tema claro', dark: 'Tema oscuro' }[this.getTheme()] || 'Tema';
    const groups = [
      { title: 'Entreno', color: 'var(--moderate)', rows: [
        { v: 'info', icon: 'calendar', label: 'Planes', sub: this.routine ? `${this.routine.name}${plans.length > 1 ? ` · ${n(plans.length, 'plan', 'planes')}` : ''}` : 'Crea tu primer plan' },
        { v: 'guides', icon: 'book', label: 'Guías', sub: guides.length ? `${n(guides.length, 'guía', 'guías')} de tu plan` : 'Créalas con la IA a partir de tu plan' },
        { v: 'exercises', icon: 'tag', label: 'Ejercicios', sub: exs.length ? `${n(exs.length, 'ejercicio', 'ejercicios')} en tu catálogo` : 'Tu catálogo, vacío por ahora' },
        { v: 'docs', icon: 'notebook', label: 'Documentos', sub: docs.length ? `${n(docs.length, 'guardado', 'guardados')} · a mano en el entreno` : 'PDFs y fotos, a mano en el entreno' },
      ] },
      { title: 'Tus datos', color: 'var(--light)', rows: [
        { v: 'backups', icon: 'swap', label: 'Copias y datos', sub: copia.txt, warn: copia.warn },
        { v: 'profiles', icon: 'users', label: 'Perfiles', sub: `${this.mainUser ? this.mainUser.name : 'Tú'}${invitados > 0 ? ` · ${n(invitados, 'invitado', 'invitados')}` : ' · sin invitados'}` },
      ] },
      { title: 'App', color: 'var(--rest)', rows: [
        { v: 'settings', icon: 'settings', label: 'Ajustes', sub: `${tema} · avisos ${VSessions.restNotifyOn() ? 'activados' : 'desactivados'}` },
        { feedback: true, icon: 'chat', label: 'Sugerencias y reportes', sub: 'Envíame ideas o fallos' },
      ] },
    ];
    return `<div class="section">
      ${groups.map(g => `<div class="more-sec">${g.title}</div>
        <div class="more-group">${g.rows.map(r => `<button class="more-row" ${r.feedback ? 'data-feedback' : `data-link="${r.v}"`}>
          <span class="more-ic" style="background:${g.color}">${UI.icon(r.icon, 20)}</span>
          <span class="more-txt"><strong>${r.label}</strong><span${r.warn ? ' class="warn"' : ''}>${UI.esc(r.sub)}</span></span><span class="chev">›</span></button>`).join('')}</div>`).join('')}
      <p class="version-foot">Traindía · v2.48.8<br>© 2026 Raúl Márquez · <a class="foot-link" href="${this.REPO_URL}" target="_blank" rel="noopener">Ver en GitHub ↗</a></p>
    </div>`;
  },
  bindMore(root) {
    const fb = root && root.querySelector('[data-feedback]');
    if (fb) fb.addEventListener('click', () => this.openFeedback());
  },

  // ---- Vista DOCUMENTOS (adjuntos consultables durante el entreno) ----
  MAX_DOC_MB: 8,
  _docs: [],
  async loadDocs() {
    try { this._docs = (await DB.filesOf(this.activeUser.id)).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); }
    catch (e) { this._docs = []; }
    return this._docs;
  },
  docIcon(type) {
    if ((type || '').startsWith('image/')) return 'tag';
    return 'book';
  },
  // Abre un documento: las imágenes se ven dentro de la app; el resto (PDF…) en el visor del móvil.
  openDoc(rec) {
    const blob = new Blob([rec.data], { type: rec.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    if ((rec.type || '').startsWith('image/')) {
      UI.modal({
        title: rec.name, size: 'wide',
        bodyHTML: `<img class="doc-view" src="${url}" alt="${UI.esc(rec.name)}">`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
      });
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return;
    }
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  },
  docKind(d) {
    const t = (d.type || '').toLowerCase(), n = (d.name || '').toLowerCase();
    if (t.startsWith('image/')) return 'Foto';
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'PDF';
    return 'Documento';
  },
  async renderDocs() {
    await this.loadDocs();
    const listo = await DB.hasStore('files');
    if (!listo) {
      return `<div class="section">
        <p class="section-intro">Aquí podrás guardar el <strong>PDF del fisio</strong> o fotos y consultarlos durante el entreno.</p>
        <p class="section-intro">Para activarlo hay que ampliar el almacén de la app, y eso solo puede hacerse si <strong>Traindía no está abierta en ningún otro sitio</strong>: cierra las demás pestañas y la app de la pantalla de inicio, y pulsa el botón.</p>
        <button class="btn primary block" id="docEnable">${UI.icon('refresh', 15)} Activar documentos</button>
        <p class="section-intro dim">Mientras tanto el resto de la app funciona con normalidad; tus datos están intactos.</p>
      </div>`;
    }
    const fmtKB = (n) => n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
    const fecha = (ts) => { try { return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
    // Miniaturas de las fotos (se liberan al volver a pintar)
    (this._docThumbs || []).forEach(u => URL.revokeObjectURL(u)); this._docThumbs = [];
    const thumb = (d) => {
      if (!(d.type || '').startsWith('image/')) return '';
      try { const u = URL.createObjectURL(new Blob([d.data], { type: d.type })); this._docThumbs.push(u); return u; } catch (e) { return ''; }
    };
    const docs = this._docs || [];
    const rows = docs.map(d => {
      const k = this.docKind(d), t = thumb(d);
      return `<div class="more-row doc-row" data-open="${UI.esc(d.id)}" role="button" tabindex="0">
        ${t ? `<img class="doc-thumb" src="${t}" alt="">` : `<span class="more-ic doc-ic ${k === 'PDF' ? 'pdf' : ''}">${k === 'PDF' ? '<b>PDF</b>' : UI.icon('notebook', 18)}</span>`}
        <span class="more-txt"><strong class="doc-name">${UI.esc(d.name)}</strong><span>${k} · ${fmtKB(d.size || 0)}${d.addedAt ? ` · ${fecha(d.addedAt)}` : ''}</span></span>
        <button class="icon-btn" data-doc-menu="${UI.esc(d.id)}" aria-label="Opciones de ${UI.esc(d.name)}">${UI.icon('more', 20)}</button>
      </div>`;
    }).join('');
    return `<div class="section">
      <p class="section-intro">El <strong>PDF de tu fisio o entrenador</strong>, fotos de una máquina o cualquier apunte, a mano <strong>durante el entreno</strong> (botón de documentos) y sin conexión.</p>
      ${docs.length ? `<div class="more-group">${rows}</div>` : `<div class="guides-empty">
        <span class="guides-empty-ic">${UI.icon('notebook', 26)}</span>
        <strong>Aún no tienes documentos</strong>
        <p>Añade un PDF o una foto desde aquí, o mándalo desde WhatsApp u otra app con <strong>Compartir → Traindía</strong>.</p>
      </div>`}
      <p class="field-hint">${UI.icon('check', 13)} Van incluidos en la <strong>copia completa</strong>: si cambias de móvil, vuelven con ella. Máximo ${this.MAX_DOC_MB} MB por documento.</p>
      <div class="pl-new-wrap"><button class="btn primary block pl-new" id="docAdd">${UI.icon('plus', 17)} Añadir documento</button></div>
    </div>`;
  },
  bindDocs(root) {
    const enable = root.querySelector('#docEnable');
    if (enable) enable.addEventListener('click', async () => {
      enable.disabled = true; enable.textContent = 'Activando…';
      const ok = await DB.upgradeNow();
      if (ok) { UI.toast('Documentos activados'); this.render(); return; }
      UI.modal({
        title: 'Sigue abierta en otro sitio',
        bodyHTML: `<p class="modal-text">No se ha podido ampliar el almacén porque Traindía sigue abierta en otro lado.</p>
          <p class="modal-text dim">Cierra las demás pestañas y la app de la pantalla de inicio (deslízala fuera de recientes) y vuelve a intentarlo. Tus datos no corren ningún riesgo.</p>`,
        actions: [{ label: 'Entendido', kind: 'primary', onClick: () => location.reload() }],
      });
    });
    const add = root.querySelector('#docAdd');
    if (add) add.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; // sin filtro: en Android los adjuntos de WhatsApp llegan como octet-stream
      inp.addEventListener('change', async () => {
        const f = inp.files[0]; if (!f) return;
        if (f.size > this.MAX_DOC_MB * 1048576) { UI.toast(`Máximo ${this.MAX_DOC_MB} MB por documento`, 'err'); return; }
        await DB.addFile(this.activeUser.id, { name: f.name, type: f.type, size: f.size, data: await f.arrayBuffer() });
        await this.loadDocs();
        this.render();
        UI.toast('Documento añadido');
      });
      inp.click();
    });
    const find = (id) => (this._docs || []).find(x => x.id === id);
    root.querySelectorAll('[data-open]').forEach(row => {
      const go = (ev) => { if (ev.target.closest('[data-doc-menu]')) return; const d = find(row.dataset.open); if (d) this.openDoc(d); };
      row.addEventListener('click', go);
      row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(ev); });
    });
    root.querySelectorAll('[data-doc-menu]').forEach(b => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const d = find(b.dataset.docMenu); if (!d) return;
      const file = (() => { try { return new File([d.data], d.name, { type: d.type || 'application/octet-stream' }); } catch (e) { return null; } })();
      const canShare = !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
      const ov = UI.modal({
        title: d.name,
        bodyHTML: `<div class="menu-list">
          <button class="menu-row" data-op="open"><span>${UI.icon('notebook', 16)} Abrir</span><span class="chev">›</span></button>
          <button class="menu-row" data-op="rename"><span>${UI.icon('edit', 16)} Renombrar</span><span class="chev">›</span></button>
          ${canShare ? `<button class="menu-row" data-op="share"><span>${UI.icon('upload', 16)} Enviar a otra app</span><span class="chev">›</span></button>` : ''}
          <button class="menu-row danger" data-op="del"><span>${UI.icon('trash', 16)} Quitar</span><span class="chev">›</span></button>
        </div>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
        onMount: (m) => {
          const on = (op, fn) => { const x = m.querySelector(`[data-op="${op}"]`); if (x) x.addEventListener('click', fn); };
          on('open', () => { UI.closeModal(ov); this.openDoc(d); });
          on('share', () => { try { const p = navigator.share({ files: [file], title: d.name }); if (p && p.catch) p.catch(() => {}); } catch (e) {} });
          on('rename', async () => {
            UI.closeModal(ov);
            const dot = d.name.lastIndexOf('.'), ext = dot > 0 ? d.name.slice(dot) : '';
            const base = ext ? d.name.slice(0, dot) : d.name;
            const v = await UI.prompt({ title: 'Renombrar documento', label: 'Nombre', value: base, placeholder: 'Ej: Plan del fisio' });
            if (v == null || !v.trim()) return;
            d.name = v.trim() + (ext && !v.trim().toLowerCase().endsWith(ext.toLowerCase()) ? ext : '');
            await DB.put('files', d); await this.loadDocs(); this.render(); UI.toast('Documento renombrado');
          });
          on('del', async () => {
            UI.closeModal(ov);
            const ok = await UI.confirm({ title: 'Quitar documento', message: `Se borrará «${d.name}» de este móvil.`, confirmLabel: 'Quitar', danger: true });
            if (!ok) return;
            await DB.del('files', d.id); await this.loadDocs(); this.render(); UI.toast('Documento quitado');
          });
        },
      });
    }));
  },
  // Lista rápida de documentos (se usa desde el entreno en vivo).
  async openDocsPicker() {
    const docs = await this.loadDocs();
    if (!docs.length) { UI.toast('No tienes documentos guardados'); return; }
    UI.modal({
      title: 'Documentos',
      bodyHTML: `<div class="menu-list">${docs.map(d => `<button class="picker-row" data-doc="${UI.esc(d.id)}"><span class="picker-name">${UI.icon(this.docIcon(d.type), 16)} ${UI.esc(d.name)}</span></button>`).join('')}</div>`,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (r) => r.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', () => {
        const d = docs.find(x => x.id === b.dataset.doc); if (d) this.openDoc(d);
      })),
    });
  },

  // ---- Vista COPIAS INTERNAS ----
  // Copias y datos, por lo que quieres hacer: 1) estar a salvo (estado de tu copia
  // completa y hacerla), 2) mover datos (exportar / importar) y 3) las copias
  // automáticas que la app guarda sola en este móvil.
  async renderBackups() {
    const st = await DB.getSettings().catch(() => null);
    const last = (st && st.lastBackupAt) || 0;
    const days = last ? Math.floor((Date.now() - last) / 86400000) : -1;
    const state = days < 0 ? 'never' : days > 7 ? 'old' : 'ok';
    const when = days < 0 ? 'Nunca has hecho una copia completa' : `Última copia completa ${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}`;
    const why = { never: 'Tus datos solo viven en este móvil. Si lo pierdes o borras la app, se pierden.',
      old: 'Hace más de una semana: lo que has apuntado desde entonces no está a salvo.',
      ok: 'Todo lo apuntado hasta entonces está a salvo fuera del móvil.' }[state];
    const list = DB.listInternalBackups();
    const fmt = (at) => { try { return new Date(at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const autos = list.length ? list.map(b => `
        <div class="more-row bk-row">
          <span class="more-ic" style="background:var(--moderate)">${UI.icon('clock', 18)}</span>
          <span class="more-txt"><strong class="wrap">${UI.esc(b.reason || 'Copia automática')}</strong><span>${fmt(b.at)} · ${b.sizeKB} KB</span></span>
          <button class="icon-btn" data-bk-menu="${UI.esc(b.key)}" aria-label="Opciones de la copia">${UI.icon('more', 20)}</button>
        </div>`).join('')
      : `<div class="more-row bk-row"><span class="more-txt"><span class="wrap">Aún no hay. Se crean solas antes de cambios grandes (una migración, restaurar…).</span></span></div>`;
    return `<div class="section">
      <div class="bk-status ${state}">
        <div class="bk-status-top">
          <span class="bk-status-ic">${UI.icon(state === 'ok' ? 'check' : 'warning', 22)}</span>
          <div class="bk-status-txt"><span class="bk-eyebrow">Tu copia de seguridad</span><strong>${when}</strong></div>
        </div>
        <p class="bk-why">${why}</p>
        <button class="btn primary block" data-bk-act="profile">${UI.icon('download', 17)} ${state === 'never' ? 'Hacer mi primera copia' : 'Hacer copia completa ahora'}</button>
        <p class="bk-note">Un archivo con todo: ejercicios, planes, sesiones, progreso, nutrición y documentos. Guárdalo en Drive, en el correo o en el ordenador.</p>
      </div>

      <div class="more-sec">Mover datos</div>
      <div class="bk-tiles">
        <button class="bk-tile" data-bk-act="export"><span class="more-ic" style="background:var(--light)">${UI.icon('upload', 20)}</span><strong>Exportar</strong><span>Un plan, un día, sesiones o progreso, para ti o un compañero</span></button>
        <button class="bk-tile" data-bk-act="import"><span class="more-ic" style="background:var(--light)">${UI.icon('download', 20)}</span><strong>Importar</strong><span>Un archivo o texto de Traindía (también una copia completa)</span></button>
      </div>

      <div class="more-sec">Copias automáticas · en este móvil</div>
      <div class="more-group">${autos}</div>
      <details class="det bk-help"><summary>¿Por qué no bastan las automáticas?</summary>
        <p class="field-hint">Se guardan <strong>dentro de la app</strong> (como mucho 2; la nueva sustituye a la más antigua). Sirven para deshacer un cambio grande, pero si borras los datos de la app, la desinstalas o pierdes el móvil, <strong>se pierden con todo lo demás</strong>. Para estar a salvo de verdad, haz la <strong>copia completa</strong> y guárdala fuera.</p>
      </details>
    </div>`;
  },
  bindBackups(root) {
    const act = (k, fn) => { const b = root.querySelector(`[data-bk-act="${k}"]`); if (b) b.addEventListener('click', fn); };
    act('profile', async () => { await VData.backupProfile(this); this.render(); }); // refresca el estado de la copia
    act('export', () => VData.openExport(this));
    act('import', () => VData.startImport(this));
    const fmt = (at) => { try { return new Date(at).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    root.querySelectorAll('[data-bk-menu]').forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.bkMenu;
      const bk = DB.listInternalBackups().find(x => x.key === key); if (!bk) return;
      UI.modal({
        title: bk.reason || 'Copia automática',
        bodyHTML: `<p class="field-hint" style="margin-top:0">${fmt(bk.at)} · ${bk.sizeKB} KB</p>
          <div class="menu-list">
            <button class="menu-row" data-op="restore"><span>${UI.icon('refresh', 16)} Volver a como estaba entonces</span><span class="chev">›</span></button>
            <button class="menu-row" data-op="dl"><span>${UI.icon('download', 16)} Descargar esta copia</span><span class="chev">›</span></button>
            <button class="menu-row danger" data-op="del"><span>${UI.icon('trash', 16)} Borrar esta copia</span><span class="chev">›</span></button>
          </div>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
        onMount: (m) => {
          m.querySelector('[data-op="dl"]').addEventListener('click', () => {
            const raw = localStorage.getItem(key); if (!raw) return;
            const blob = new Blob([raw], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'traindia-copia-interna.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            UI.closeModal(); UI.toast('Copia descargada');
          });
          m.querySelector('[data-op="restore"]').addEventListener('click', async () => {
            const ok = await UI.confirm({ title: 'Volver a esta copia', message: `Tus datos quedarán como estaban el ${fmt(bk.at)}: se REEMPLAZA todo lo actual (ejercicios, sesiones, planes, progreso y nutrición). No se puede deshacer.`, confirmLabel: 'Restaurar', danger: true });
            if (!ok) return;
            await DB.restoreInternalBackup(key);
            UI.toast('Copia restaurada'); location.reload();
          });
          m.querySelector('[data-op="del"]').addEventListener('click', async () => {
            const ok = await UI.confirm({ title: 'Borrar copia', message: '¿Eliminar esta copia automática?', confirmLabel: 'Borrar', danger: true });
            if (!ok) return;
            DB.deleteInternalBackup(key); UI.closeModal(); this.go('backups', {}, true);
          });
        },
      });
    }));
  },

  // ---- Vista PERFILES ----
  // Perfiles: tú arriba y, debajo, tus amigos (invitados) para compararos.
  async renderProfiles() {
    const users = await DB.getUsers();
    const st = {};
    for (const u of users) {
      const ses = (await DB.sessionsOf(u.id)).filter(x => !x.draft);
      st[u.id] = { n: ses.length, last: ses.reduce((m, x) => ((x.date || '') > m ? x.date : m), '') };
    }
    const txt = (u) => { const x = st[u.id]; return x.n === 0 ? 'Sin entrenos apuntados' : `${x.n} entreno${x.n === 1 ? '' : 's'} · el último, ${UI.fmtDateShort(x.last)}`; };
    const ago = (ts) => { const d = Math.floor((Date.now() - ts) / 86400000); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
    const me = users.find(u => u.isMain) || this.mainUser;
    const friends = users.filter(u => !u.isMain);
    const rows = friends.map(u => `<div class="more-row pf-row">
        ${UI.avatar(u, 42)}
        <span class="more-txt"><strong>${UI.esc(u.name)}</strong><span>${txt(u)}</span>${u.sharedAt ? `<span class="pf-sync">${UI.icon('refresh', 11)} Actualizado ${ago(u.sharedAt)}</span>` : ''}</span>
        ${st[u.id].n ? `<button class="btn ghost small" data-compare="${u.id}">Comparar</button>` : ''}
        <button class="icon-btn" data-pf-menu="${u.id}" aria-label="Opciones de ${UI.esc(u.name)}">${UI.icon('more', 20)}</button>
      </div>`).join('');
    return `<div class="section">
      <button class="set-head pf-me" data-edit="${me.id}">
        ${UI.avatar(me, 54)}
        <span class="pf-me-txt"><span class="bk-eyebrow">Tú</span><strong>${UI.esc(me.name)}</strong><span>${txt(me)}</span></span>
        <span class="set-head-edit">${UI.icon('edit', 15)} Editar</span>
      </button>

      <div class="more-sec">Tus amigos</div>
      ${friends.length ? `<div class="more-group">${rows}</div>` : `<div class="guides-empty">
        <span class="guides-empty-ic">${UI.icon('users', 26)}</span>
        <strong>Compárate con tus amigos</strong>
        <p>Cuando un amigo te mande el enlace con su progreso, ábrelo y aparecerá aquí. Luego lo ves junto al tuyo en Progreso → Comparativa.</p>
      </div>`}
      <div class="pf-actions">
        <button class="btn primary block" id="shareMine">${UI.icon('upload', 16)} Compartir mi progreso</button>
        <button class="link-btn" id="addGuest">o añadir un amigo a mano</button>
      </div>
      <p class="field-hint">Los datos de tus amigos solo sirven para compararos: nunca se mezclan con los tuyos.</p>
    </div>`;
  },

  bindProfiles(root) {
    const sm = root.querySelector('#shareMine'); if (sm) sm.addEventListener('click', () => VShare.start(this));
    root.querySelector('#addGuest').addEventListener('click', () => this.editUserModal(null));
    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.editUserModal(b.dataset.edit)));
    root.querySelectorAll('[data-compare]').forEach(b => b.addEventListener('click', () => this.go('progress', { tab: 'compare', guestId: b.dataset.compare })));
    root.querySelectorAll('[data-pf-menu]').forEach(b => b.addEventListener('click', () => {
      const u = this.usersById[b.dataset.pfMenu]; if (!u) return;
      const ov = UI.modal({
        title: u.name,
        bodyHTML: `<div class="menu-list">
          <button class="menu-row" data-op="compare"><span>${UI.icon('activity', 16)} Comparar con ${UI.esc(u.name)}</span><span class="chev">›</span></button>
          <button class="menu-row" data-op="edit"><span>${UI.icon('edit', 16)} Nombre y color</span><span class="chev">›</span></button>
          <button class="menu-row danger" data-op="del"><span>${UI.icon('trash', 16)} Quitar</span><span class="chev">›</span></button>
        </div>
        <p class="field-hint">Para actualizar sus datos, que te mande otro enlace: se actualizan solos.</p>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
        onMount: (m) => {
          m.querySelector('[data-op="compare"]').addEventListener('click', () => { UI.closeModal(ov); this.go('progress', { tab: 'compare', guestId: u.id }); });
          m.querySelector('[data-op="edit"]').addEventListener('click', () => { UI.closeModal(ov); this.editUserModal(u.id); });
          m.querySelector('[data-op="del"]').addEventListener('click', () => { UI.closeModal(ov); this.deleteGuest(u.id); });
        },
      });
    }));
  },

  editUserModal(userId) {
    const u = userId ? this.usersById[userId] : null;
    const isNew = !u;
    UI.modal({
      title: isNew ? 'Añadir un amigo' : (u.isMain ? 'Tu perfil' : `Editar a ${u.name}`),
      bodyHTML: `<div id="userForm">
        ${UI.field('Nombre', UI.input('name', u ? u.name : '', { placeholder: 'Nombre' }))}
        ${UI.field('Color', UI.colorPicker('color', u ? u.color : UI.ESSENTIALS[1]))}
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          const data = UI.readForm(root.querySelector('#userForm'));
          if (!data.name || !data.name.trim()) { UI.toast('Escribe un nombre', 'err'); return false; }
          if (isNew) {
            await DB.createUser({ name: data.name, color: data.color, isGuest: true });
          } else {
            await DB.put('users', { ...u, name: data.name.trim(), color: data.color });
          }
          await this.loadUsers();
          this.render();
          UI.toast('Perfil guardado');
        }},
      ],
      onMount: (root) => UI.bindColorPicker(root),
    });
  },

  async deleteGuest(userId) {
    const u = this.usersById[userId];
    if (!u || u.isMain) return;
    const ok = await UI.confirm({
      title: `¿Quitar a ${u.name}?`,
      message: 'Se borran de este móvil sus entrenos y su progreso (los tuyos no se tocan). Si te vuelve a mandar su enlace, aparecerá otra vez.',
      confirmLabel: 'Quitar', danger: true,
    });
    if (!ok) return;
    for (const store of ['exercises', 'routines', 'sessions', 'progress']) {
      const items = await DB.byIndex(store, 'userId', userId);
      for (const it of items) await DB.del(store, it.id);
    }
    await DB.del('users', userId);
    await this.loadUsers();
    this.render();
    UI.toast('Perfil eliminado');
  },

  // ---- Vista AJUSTES ----
  // Ajustes → Notificaciones: interruptor, estado de cada pieza y aviso de prueba.
  bindNotifSettings(root) {
    const card = root.querySelector('#notifCard');
    if (!card) return;
    const chk = card.querySelector('#setNotif');
    const box = card.querySelector('#notifStatus');
    const row = (ok, label, value, hint = '') => `<li class="${ok === true ? 'ok' : ok === false ? 'bad' : ''}"><span>${label}</span><strong>${value}</strong>${hint ? `<em>${hint}</em>` : ''}</li>`;
    const paint = async () => {
      const st = await VSessions.notifStatus();
      if (!document.body.contains(box)) return;
      chk.checked = st.on;
      const perm = { granted: [true, 'Permitido'], denied: [false, 'Bloqueado'], default: [null, 'Sin pedir'], unsupported: [false, 'No disponible'] }[st.permission] || [null, st.permission];
      const err = st.lastError && st.lastError.msg ? `Último fallo: ${UI.esc(st.lastError.msg)}` : '';
      const sum = card.querySelector('#notifSummary');
      if (sum) {
        const listo = st.on && st.permission === 'granted' && st.server && st.subscribed;
        sum.textContent = !st.on ? 'Desactivado' : listo ? 'Todo listo' : 'Revisar';
        sum.className = !st.on ? '' : listo ? 'ok' : 'bad';
        if (st.on && !listo) { const det = card.querySelector('.set-det'); if (det) det.open = true; } // si algo falla, a la vista
      }
      box.innerHTML = [
        row(perm[0], 'Permiso del móvil', perm[1], st.permission === 'denied' ? 'Actívalo en Ajustes de Android → Aplicaciones → Traindía (o Chrome) → Notificaciones.' : ''),
        row(st.server, 'Servidor de avisos', st.server ? 'Conectado' : 'No responde', st.server ? '' : 'Sin él, con el móvil bloqueado no llega el aviso.'),
        row(st.on ? st.subscribed : null, 'Este móvil', st.subscribed ? 'Suscrito' : (st.on ? 'Sin suscribir' : 'Aviso desactivado'), err),
      ].join('');
    };
    chk.addEventListener('change', async () => {
      chk.checked = await VSessions.setRestNotify(chk.checked);
      if (chk.checked) UI.toast('Te avisaremos al acabar cada descanso');
      setTimeout(paint, 1500); // la suscripción tarda un momento
    });
    card.querySelector('#notifTest').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        if (await VSessions.testPush(10000)) UI.toast('Aviso de prueba en 10 s: bloquea el móvil');
      } catch (e) { UI.toast('No se pudo programar: ' + ((e && e.message) || 'error'), 'err'); }
      b.disabled = false; paint();
    });
    paint();
  },

  // Ajustes: solo lo que es de la app (cómo se ve, cómo avisa, acerca de y lo peligroso).
  // Perfiles y Copias y datos tienen su propia entrada en Más: aquí no se repiten.
  renderSettings() {
    const theme = this.getTheme();
    const themeOpts = [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']];
    const row = (attrs, icon, color, title, sub, extra = '') => `<button class="more-row" ${attrs}><span class="more-ic" style="background:${color}">${UI.icon(icon, 18)}</span><span class="more-txt"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}</span>${extra || '<span class="chev">›</span>'}</button>`;
    return `<div class="section">
      <div class="more-sec">Apariencia</div>
      <div class="more-group"><div class="set-block">
        <div class="seg" id="themeChoices">
          ${themeOpts.map(([v, l]) => `<button type="button" class="seg-opt${theme === v ? ' on' : ''}" data-theme-opt="${v}">${l}</button>`).join('')}
        </div>
        <p class="field-hint" style="margin-bottom:0">«Sistema» sigue el modo claro u oscuro de tu móvil.</p>
      </div></div>

      <div class="more-sec">Durante el entreno</div>
      <div class="more-group">
        <button class="more-row" id="setRestDur"><span class="more-ic" style="background:var(--strong)">${UI.icon('clock', 18)}</span><span class="more-txt"><strong>Descanso por defecto</strong><span>El que sale al empezar el descanso</span></span><span class="set-val" id="restDurVal">${VSessions.fmtClock(VSessions.getRestDuration(this))}</span><span class="chev">›</span></button>
        <label class="more-row set-switch"><span class="more-ic" style="background:var(--strong)">${UI.icon('play', 18)}</span><span class="more-txt"><strong>Sonido al acabar</strong><span>Dos pitidos cortos</span></span><input type="checkbox" class="sw" id="setRestSound"${VSessions.restSoundOn() ? ' checked' : ''}></label>
        <label class="more-row set-switch"><span class="more-ic" style="background:var(--strong)">${UI.icon('activity', 18)}</span><span class="more-txt"><strong>Vibración al acabar</strong><span>Si tu móvil lo permite</span></span><input type="checkbox" class="sw" id="setRestVibrate"${VSessions.restVibrateOn() ? ' checked' : ''}></label>
      </div>
      <div class="more-group" id="notifCard" style="margin-top:10px">
        <label class="more-row set-switch">
          <span class="more-ic" style="background:var(--strong)">${UI.icon('clock', 18)}</span>
          <span class="more-txt"><strong>Aviso de fin de descanso</strong><span class="wrap">${UI.esc(VSessions.REST_NOTIFY_TEXT)}</span></span>
          <input type="checkbox" class="sw" id="setNotif"${VSessions.restNotifyOn() ? ' checked' : ''}>
        </label>
        <details class="set-det">
          <summary><span>Estado de los avisos</span><strong id="notifSummary">Comprobando…</strong></summary>
          <ul class="notif-status" id="notifStatus"><li class="dim">Comprobando…</li></ul>
          <button class="btn ghost block" id="notifTest">${UI.icon('clock', 16)} Probar aviso (llega en 10 s)</button>
          <p class="field-hint" style="margin-bottom:0">Pulsa y <strong>bloquea el móvil</strong>: si a los 10 s te llega la notificación, está todo bien.</p>
        </details>
      </div>

      <div class="more-sec">Acerca de Traindía</div>
      <div class="more-group">
        ${row('id="seeLanding"', 'info', 'var(--rest)', 'Ver la presentación', 'Qué es Traindía y cómo funciona')}
        ${row('id="seeRepo"', 'code', 'var(--rest)', 'Código en GitHub', 'Novedades de cada versión', `<span class="chev">↗</span>`)}
      </div>

      <div class="more-sec danger">Zona peligrosa</div>
      <div class="more-group danger">
        ${row('id="resetApp"', 'trash', 'var(--priority)', 'Borrar todos los datos', 'Perfiles, sesiones y progreso de este móvil. Haz antes una copia.')}
      </div>
      <p class="version-foot">© 2026 Raúl Márquez</p>
    </div>`;
  },

  bindSettings(root) {
    this.bindNotifSettings(root);
    const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.addEventListener('click', fn); };
    on('#seeLanding', () => this.previewLanding());
    on('#seeRepo', () => window.open(this.REPO_URL + '/releases', '_blank', 'noopener'));
    const snd = root.querySelector('#setRestSound'); if (snd) snd.addEventListener('change', () => VSessions.setRestSound(snd.checked));
    const vib = root.querySelector('#setRestVibrate'); if (vib) vib.addEventListener('change', () => { VSessions.setRestVibrate(vib.checked); if (vib.checked) { try { navigator.vibrate && navigator.vibrate(120); } catch (e) {} } });
    on('#setRestDur', () => {
      const cur = VSessions.getRestDuration(this), opts = [45, 60, 90, 120, 150, 180];
      const ov = UI.modal({
        title: 'Descanso por defecto',
        bodyHTML: `<div class="menu-list">${opts.map(d => `<button class="menu-row${d === cur ? ' on' : ''}" data-d="${d}"><span><strong>${VSessions.fmtClock(d)}</strong> <span class="dim">· ${d} s</span></span>${d === cur ? UI.icon('check', 16) : ''}</button>`).join('')}
          <button class="menu-row${opts.includes(cur) ? '' : ' on'}" data-d="custom"><span>Otro…${opts.includes(cur) ? '' : ` <span class="dim">(${cur} s)</span>`}</span></button></div>
          <p class="field-hint">Durante el entreno puedes cambiarlo cuando quieras; se queda el último que elijas.</p>`,
        actions: [{ label: 'Cerrar', kind: 'ghost' }],
        onMount: (m) => m.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', async () => {
          UI.closeModal(ov);
          let n = parseInt(b.dataset.d, 10);
          if (b.dataset.d === 'custom') n = parseInt(await UI.prompt({ title: 'Descanso por defecto', label: 'Segundos', value: String(cur), placeholder: 'Ej: 75' }), 10);
          if (!n || n < 5 || n > 1800) return;
          VSessions.setRestDefault(this, n);
          const v = root.querySelector('#restDurVal'); if (v) v.textContent = VSessions.fmtClock(n);
          UI.toast(`Descanso por defecto: ${VSessions.fmtClock(n)}`);
        })),
      });
    });
    root.querySelectorAll('[data-theme-opt]').forEach(b => b.addEventListener('click', () => {
      this.setTheme(b.dataset.themeOpt);
      root.querySelectorAll('[data-theme-opt]').forEach(x => x.classList.toggle('on', x === b));
    }));
    on('#resetApp', async () => {
      const ok = await UI.confirm({
        title: 'Borrar todos los datos',
        message: 'CUIDADO: esto elimina PERMANENTEMENTE todos los perfiles, sesiones, progreso, nutrición y rutinas. La app volverá a la pantalla inicial. No se puede deshacer.',
        confirmLabel: 'Borrar todo', danger: true, requireText: 'BORRAR',
      });
      if (!ok) return;
      for (const store of Object.keys(DB.STORES)) await DB.clearStore(store);
      UI.toast('Datos borrados');
      setTimeout(() => location.reload(), 700);
    });
  },
};

document.addEventListener('DOMContentLoaded', () => app.init());
