// ============================================================
// APP CNP v2 — controlador, router, shell, onboarding, perfiles
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
    await DB.open();
    this.registerViews();
    this.bindShell();

    this.settings = await DB.getSettings();
    if (!this.settings || !this.settings.seeded || !this.settings.mainUserId) {
      this.renderOnboarding();
      return;
    }
    await DB.migrate();
    await this.loadUsers();
    await this.refreshRoutine();
    await DB.ensurePlaces(this.routine);
    this.go('week', {}, true);
    // Unificación de cardio (v10): si hay variantes, avisa y deja hacer copia antes.
    if (await DB.cardioUnifyPending()) { this.showCardioMigration(); return; }
    if (((this.settings && this.settings.dataVersion) || 0) < 10) await DB.runCardioUnify(); // nada que cambiar: solo marca hecho
    // Un archivo compartido es una acción explícita del usuario: va ANTES que el aviso
    // de entreno a medias (si no, se apilan dos modales). El aviso vuelve al siguiente inicio.
    if (await this.checkSharedImport()) return;
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
    let buf = null, type = '', name = 'archivo';
    try {
      const cache = await caches.open('traindia-share-inbox');
      const res = await cache.match('./__shared-import');
      if (res) {
        type = res.headers.get('Content-Type') || '';
        try { name = decodeURIComponent(res.headers.get('X-Share-Name') || 'archivo'); } catch (e) {}
        buf = await res.arrayBuffer();
        await cache.delete('./__shared-import');
      }
    } catch (e) { /* sin caché disponible: nada que hacer */ }
    clean();
    if (!buf || !buf.byteLength) return false;

    // ¿Es un export de Traindía? Entonces se importa. Si no, se guarda como documento.
    let parsed = null;
    try { parsed = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { /* no es texto JSON */ }
    if (parsed && parsed.format === 'cnp-export' && parsed.data) {
      VData.routeImport(this, parsed);
      return true;
    }
    return await this.offerSaveSharedDoc({ buf, type, name });
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
      places:   { render: (a, p) => VPlan.places(a, p),   bind: (a, r, p) => VPlan.placesBind(a, r, p) },
      guides:   { render: (a, p) => VPlan.guides(a, p) },
      guide:    { render: (a, p) => VPlan.guide(a, p) },
      info:     { render: (a, p) => VPlan.info(a, p),      bind: (a, r, p) => VPlan.infoBind(a, r, p) },

      sessions: { render: (a, p) => VSessions.list(a, p),   bind: (a, r, p) => VSessions.listBind(a, r, p) },
      session:  { render: (a, p) => VSessions.detail(a, p), bind: (a, r, p) => VSessions.detailBind(a, r, p) },
      live:     { render: (a, p) => VSessions.live(a, p),   bind: (a, r, p) => VSessions.liveBind(a, r, p) },

      progress: { render: (a, p) => VProgress.render(a, p), bind: (a, r, p) => VProgress.bind(a, r, p) },
      nutrition:{ render: (a, p) => VNutrition.render(a, p), bind: (a, r, p) => VNutrition.bind(a, r, p) },

      more:     { render: (a, p) => this.renderMore(),      bind: (a, r) => this.bindMore(r) },
      profiles: { render: (a, p) => this.renderProfiles(),  bind: (a, r) => this.bindProfiles(r) },
      data:     { render: (a, p) => VData.render(a, p),     bind: (a, r, p) => VData.bind(a, r, p) },
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
    if (dataBtn) dataBtn.addEventListener('click', () => VData.openMenu(this));
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
      week: 'Traindía', exercises: 'Ejercicios', places: 'Lugares', guides: 'Guías', info: 'El plan',
      sessions: 'Sesiones', live: 'Entreno', session: 'Sesión',
      progress: 'Progreso', nutrition: 'Nutrición',
      more: 'Más', profiles: 'Perfiles', data: 'Datos', settings: 'Ajustes', backups: 'Copias internas', docs: 'Documentos',
    };
    let label = titles[this.currentView] || 'Traindía';
    if (this.currentView === 'nutrition' && typeof VNutrition !== 'undefined') {
      label = VNutrition.headerTitle(this.params) || label;   // Nutrición → pauta → comida
    } else if (this.currentView === 'day' && this.routine) {
      const d = this.routine.days.find(x => x.id === this.params.dayId);
      if (d) label = d.name;
    } else if (this.currentView === 'guide' && typeof PLAN_DATA !== 'undefined') {
      const g = PLAN_DATA.guides.find(x => x.id === this.params.guideId);
      if (g) label = g.title;
    }
    title.textContent = label;
  },

  updateNavActive() {
    const map = {
      week: 'week', day: 'week', exercises: 'week',
      sessions: 'sessions', session: 'sessions', live: 'sessions',
      progress: 'progress', nutrition: 'nutrition',
      more: 'more', profiles: 'more', data: 'more', settings: 'more', guides: 'more', guide: 'more', info: 'more', places: 'more', backups: 'more', docs: 'more',
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
    let planType = 'cnp';
    host.innerHTML = `
      <div class="onb-wrap">
        <div class="onb-card">
          <div class="onb-eyebrow">Bienvenida a Traindía</div>
          <h1>Configura tu perfil</h1>
          <p class="onb-sub">Este es el perfil principal de este dispositivo. La app arrancará siempre con él. Podrás cambiarlo todo desde Ajustes.</p>
          <div id="onbForm">
            ${UI.field('Tu nombre', UI.input('name', '', { placeholder: 'Ej: Raúl' }))}
            ${UI.field('Color', UI.colorPicker('color', UI.COLORS[0]))}
          </div>
          <span class="field-label">Elige tu plan</span>
          <div class="plan-choices" id="planChoices">
            <button type="button" class="plan-choice sel" data-plan="cnp">
              <strong>Plan CNP (mujer)</strong>
              <span class="dim">Rutina completa, guías y todo el contenido CNP.</span>
            </button>
            <button type="button" class="plan-choice" data-plan="custom">
              <strong>Plan personalizado</strong>
              <span class="dim">7 días vacíos que montas tú. Sin guías ni contenido CNP.</span>
            </button>
            <div class="plan-choice disabled">
              <strong>Más planes <span class="badge soon">Próximamente</span></strong>
              <span class="dim">Nuevas plantillas en camino.</span>
            </div>
          </div>
          <button class="btn primary block" id="onbStart">Empezar</button>
        </div>
      </div>`;
    UI.bindColorPicker(host);
    host.querySelectorAll('.plan-choice[data-plan]').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll('.plan-choice').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); planType = b.dataset.plan;
    }));
    const start = host.querySelector('#onbStart');
    start.addEventListener('click', async () => {
      const data = UI.readForm(host.querySelector('#onbForm'));
      if (!data.name || !data.name.trim()) { UI.toast('Escribe un nombre', 'err'); return; }
      start.disabled = true;
      const user = await DB.createUser({ name: data.name, color: data.color, isMain: true });
      await DB.createPlan(user.id, planType, { activate: true });
      await DB.saveSettings({ mainUserId: user.id, activeUserId: user.id, seeded: true, version: 2, dataVersion: 8 });
      await DB.migrate();
      await DB.runCardioUnify(); // usuario nuevo: cardio ya unificado de inicio, sin aviso
      host.remove();
      document.getElementById('appShell').style.display = '';
      this.settings = await DB.getSettings();
      await this.loadUsers();
      await this.refreshRoutine();
      await DB.ensurePlaces(this.routine);
      UI.toast(`¡Listo, ${user.name}!`);
      this.go('week', {}, true);
    });
  },

  isCnp() { return !this.routine || this.routine.planType !== 'custom'; },

  // ---- Menú de usuario (desde el chip) ----
  openUserMenu() {
    const others = Object.values(this.usersById).filter(u => !u.isMain);
    UI.modal({
      title: 'Perfil activo',
      bodyHTML: `
        <div class="user-menu-active">${UI.avatar(this.activeUser, 44)}<div><strong>${UI.esc(this.activeUser.name)}</strong><span class="dim">Usuario principal</span></div></div>
        <p class="modal-text dim">En el uso diario la app trabaja siempre con tu perfil principal. Los perfiles invitados sirven para importar datos a su nombre y comparar progreso.</p>
        <div class="menu-list">
          <button class="menu-row" data-act="profiles"><span>${UI.icon('users', 18)} Gestionar perfiles</span><span class="chev">›</span></button>
          <button class="menu-row" data-act="settings"><span>${UI.icon('settings', 18)} Editar perfil principal</span><span class="chev">›</span></button>
        </div>
        ${others.length ? `<div class="field-label" style="margin-top:14px">Perfiles invitados</div>${others.map(u => `<div class="user-menu-active small">${UI.avatar(u, 30)}<div><strong>${UI.esc(u.name)}</strong><span class="dim">Invitado</span></div></div>`).join('')}` : ''}
      `,
      actions: [{ label: 'Cerrar', kind: 'ghost' }],
      onMount: (root) => {
        root.querySelector('[data-act="profiles"]').addEventListener('click', () => { UI.closeModal(); this.go('profiles'); });
        root.querySelector('[data-act="settings"]').addEventListener('click', () => { UI.closeModal(); this.go('settings'); });
      },
    });
  },

  // ---- Sugerencias / reportes (formulario → email vía Web3Forms) ----
  openFeedback(pre) {
    const ACCESS_KEY = '1ba5f2b9-bc2f-4d16-b0d7-6fcdf7f4639e';
    const preTipo = (pre && pre.tipo) || '';
    const preMsg = (pre && pre.mensaje) || '';
    UI.modal({
      title: 'Sugerencias y reportes',
      bodyHTML: `<div id="fbForm">
        <p class="modal-text dim">¿Una idea para mejorar o algo que no va bien? Cuéntamelo y me llega directo. Deja un contacto solo si quieres respuesta.</p>
        ${UI.field('Tipo', UI.select('tipo', [{ value: 'Sugerencia', label: '💡 Sugerencia' }, { value: 'Error', label: '🐞 Error / fallo' }, { value: 'Otro', label: 'Otro' }].concat(preTipo ? [{ value: preTipo, label: preTipo }] : []), preTipo || 'Sugerencia'))}
        ${UI.field('Mensaje', UI.textarea('mensaje', preMsg, 'Describe tu idea o el problema con detalle…', 6))}
        ${UI.field('Tu contacto (opcional)', UI.input('contacto', '', { placeholder: 'Email o nombre, por si quiero responderte' }))}
        <input type="text" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
        <p class="field-hint">Se envía a través de un servicio externo (Web3Forms) para que me llegue por correo. No se envía ningún dato de tus entrenos.</p>
      </div>`,
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
                version: 'v2.12.8',
                perfil: (this.mainUser && this.mainUser.name) || '',
                navegador: navigator.userAgent,
              }),
            });
            const out = await res.json().catch(() => ({}));
            if (res.ok && out.success) { UI.toast('¡Enviado! Gracias por tu mensaje 🙌'); return; }
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
  renderMore() {
    const rows = [
      { v: 'guides', icon: 'book', color: 'var(--light)', label: 'Guías', sub: 'Documentación del plan', cnp: true },
      { v: 'exercises', icon: 'tag', color: 'var(--strong)', label: 'Ejercicios', sub: 'Catálogo editable' },
      { v: 'places', icon: 'pin', color: 'var(--priority)', label: 'Lugares', sub: 'Sitios donde entrenas' },
      { v: 'info', icon: 'info', color: 'var(--moderate)', label: 'El plan', sub: 'Tus planes de entrenamiento' },
      { v: 'profiles', icon: 'users', color: 'var(--sub-accent)', label: 'Perfiles', sub: 'Principal e invitados' },
      { v: 'data', icon: 'swap', color: 'var(--light)', label: 'Importar / Exportar', sub: 'Copias y traspasos JSON' },
      { v: 'docs', icon: 'book', color: 'var(--sub-accent)', label: 'Documentos', sub: 'PDFs y fotos, a mano en el entreno' },
      { v: 'backups', icon: 'clock', color: 'var(--moderate)', label: 'Copias internas', sub: 'Puntos de restauración' },
      { v: 'settings', icon: 'settings', color: 'var(--rest)', label: 'Ajustes', sub: 'Perfil principal y app' },
    ].filter(r => !r.cnp || this.isCnp());
    return `<div class="section">
      ${rows.map(r => `<button class="big-row" data-link="${r.v}"><span class="big-row-icon tile" style="background:${r.color}">${UI.icon(r.icon, 20)}</span><span class="big-row-text"><strong>${r.label}</strong><span class="dim">${r.sub}</span></span><span class="chev">›</span></button>`).join('')}
      <button class="big-row" data-feedback><span class="big-row-icon tile" style="background:var(--strong)">${UI.icon('chat', 20)}</span><span class="big-row-text"><strong>Sugerencias y reportes</strong><span class="dim">Envíame ideas o fallos</span></span><span class="chev">›</span></button>
      <p class="version-foot">Traindía · v2.12.8 · ${Object.keys(this.usersById).length} perfil(es)<br>© 2026 Raúl Márquez · <a class="foot-link" href="${this.REPO_URL}" target="_blank" rel="noopener">Ver en GitHub ↗</a></p>
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
  async renderDocs() {
    await this.loadDocs();
    const fmtKB = (n) => n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
    const rows = (this._docs || []).map(d => `
      <div class="bk-card">
        <div class="bk-head">
          <span class="big-row-icon tile" style="background:var(--sub-accent)">${UI.icon(this.docIcon(d.type), 18)}</span>
          <div class="bk-meta"><strong>${UI.esc(d.name)}</strong><span class="dim">${fmtKB(d.size || 0)}</span></div>
        </div>
        <div class="bk-actions">
          <button class="btn ghost small" data-open="${UI.esc(d.id)}">${UI.icon('book', 14)} Abrir</button>
          <button class="btn ghost small danger" data-rm="${UI.esc(d.id)}">${UI.icon('trash', 14)} Quitar</button>
        </div>
      </div>`).join('');
    const listo = await DB.hasStore('files');
    if (!listo) {
      return `<div class="section">
        <p class="section-intro">Aquí podrás guardar el <strong>PDF del fisio</strong> o fotos y consultarlos durante el entreno.</p>
        <p class="section-intro">Para activarlo hay que ampliar el almacén de la app, y eso solo puede hacerse si <strong>Traindía no está abierta en ningún otro sitio</strong>: cierra las demás pestañas y la app de la pantalla de inicio, y pulsa el botón.</p>
        <button class="btn primary block" id="docEnable">${UI.icon('refresh', 15)} Activar documentos</button>
        <p class="section-intro dim">Mientras tanto el resto de la app funciona con normalidad; tus datos están intactos.</p>
      </div>`;
    }
    return `<div class="section">
      <p class="section-intro">Guarda aquí el <strong>PDF del fisio</strong>, fotos de una máquina o cualquier apunte. Se consultan <strong>durante el entreno</strong> con el botón de documentos, sin salir de la app y sin conexión.</p>
      <p class="section-intro">Desde el móvil también puedes mandarlos con <strong>Compartir → Traindía</strong>.</p>
      <button class="btn primary block" id="docAdd">${UI.icon('plus', 15)} Añadir documento</button>
      ${(this._docs || []).length ? rows : '<div class="empty-state"><p class="dim">Todavía no has añadido ninguno.</p></div>'}
      <p class="section-intro" style="color:var(--priority)">⚠️ Se guardan <strong>en este dispositivo</strong> y no entran en las copias ni en el export: si borras los datos de la app, hay que volver a añadirlos.</p>
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
    root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const d = (this._docs || []).find(x => x.id === b.dataset.open); if (d) this.openDoc(d);
    }));
    root.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      const d = (this._docs || []).find(x => x.id === b.dataset.rm); if (!d) return;
      const ok = await UI.confirm({ title: 'Quitar documento', message: `Se borrará "${d.name}" de este dispositivo.`, confirmLabel: 'Quitar', danger: true });
      if (!ok) return;
      await DB.del('files', d.id);
      await this.loadDocs();
      this.render();
      UI.toast('Documento quitado');
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
  renderBackups() {
    const list = DB.listInternalBackups();
    const fmt = (at) => { try { return new Date(at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const rows = list.map(b => `
      <div class="bk-card">
        <div class="bk-head">
          <span class="big-row-icon tile" style="background:var(--moderate)">${UI.icon('clock', 18)}</span>
          <div class="bk-meta"><strong>${UI.esc(b.reason || 'Copia')}</strong><span class="dim">${fmt(b.at)} · ${b.sizeKB} KB</span></div>
        </div>
        <div class="bk-actions">
          <button class="btn ghost small" data-dl="${UI.esc(b.key)}">${UI.icon('upload', 14)} Descargar</button>
          <button class="btn ghost small" data-restore="${UI.esc(b.key)}">${UI.icon('swap', 14)} Restaurar</button>
          <button class="btn ghost small danger" data-del="${UI.esc(b.key)}">${UI.icon('trash', 14)} Borrar</button>
        </div>
      </div>`).join('');
    return `<div class="section">
      <p class="section-intro">Puntos de restauración guardados <strong>en este dispositivo</strong> antes de cambios importantes. Se conservan como mucho <strong>2</strong> (al crear una nueva se borra la más antigua).</p>
      <p class="section-intro" style="color:var(--priority)">⚠️ Viven aquí dentro: si borras los datos de la app, la desinstalas o limpias el navegador, <strong>se pierden igual que el resto</strong>. Para una copia de verdad segura, usa <strong>Exportar</strong> en Datos y guarda el archivo fuera del móvil.</p>
      ${list.length ? rows : '<div class="empty-state"><p class="dim">Aún no hay copias internas.</p></div>'}
    </div>`;
  },
  bindBackups(root) {
    root.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => {
      const raw = localStorage.getItem(b.dataset.dl); if (!raw) return;
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'traindia-copia-interna.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      UI.toast('Copia descargada');
    }));
    root.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Restaurar copia', message: 'Se REEMPLAZARÁN todos tus datos actuales (ejercicios, sesiones, plan, progreso, diario) por los de esta copia. No se puede deshacer.', confirmLabel: 'Restaurar', danger: true });
      if (!ok) return;
      await DB.restoreInternalBackup(b.dataset.restore);
      UI.toast('Copia restaurada'); location.reload();
    }));
    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Borrar copia', message: '¿Eliminar esta copia interna?', confirmLabel: 'Borrar', danger: true });
      if (!ok) return;
      DB.deleteInternalBackup(b.dataset.del); this.go('backups', {}, true);
    }));
  },

  // ---- Vista PERFILES ----
  async renderProfiles() {
    const users = await DB.getUsers();
    const counts = {};
    for (const u of users) {
      const s = await DB.sessionsOf(u.id);
      counts[u.id] = s.length;
    }
    const cards = users.map(u => `
      <div class="profile-card">
        ${UI.avatar(u, 40)}
        <div class="profile-meta">
          <strong>${UI.esc(u.name)} ${u.isMain ? '<span class="badge">Principal</span>' : '<span class="badge guest">Invitado</span>'}</strong>
          <span class="dim">${counts[u.id]} sesión(es) registradas</span>
        </div>
        <div class="profile-actions">
          <button class="icon-btn" data-edit="${u.id}" title="Editar">${UI.icon('edit', 17)}</button>
          ${u.isMain ? '' : `<button class="icon-btn danger" data-del="${u.id}" title="Eliminar">${UI.icon('trash', 17)}</button>`}
        </div>
      </div>`).join('');
    return `<div class="section">
      <p class="section-intro">El <strong>perfil principal</strong> es el dueño del dispositivo y el usuario activo siempre. Los <strong>invitados</strong> son perfiles de referencia: sirven para importar datos a su nombre y comparar progreso, pero no se usan como sesión activa.</p>
      ${cards}
      <button class="btn primary block" id="addGuest">+ Crear perfil invitado</button>
    </div>`;
  },

  bindProfiles(root) {
    root.querySelector('#addGuest').addEventListener('click', () => this.editUserModal(null));
    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.editUserModal(b.dataset.edit)));
    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => this.deleteGuest(b.dataset.del)));
  },

  editUserModal(userId) {
    const u = userId ? this.usersById[userId] : null;
    const isNew = !u;
    UI.modal({
      title: isNew ? 'Nuevo perfil invitado' : (u.isMain ? 'Editar perfil principal' : 'Editar invitado'),
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
      title: `Eliminar a ${u.name}`,
      message: 'Se borrarán también todas sus sesiones, progreso y diario importados. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    for (const store of ['exercises', 'routines', 'sessions', 'progress', 'journal']) {
      const items = await DB.byIndex(store, 'userId', userId);
      for (const it of items) await DB.del(store, it.id);
    }
    await DB.del('users', userId);
    await this.loadUsers();
    this.render();
    UI.toast('Perfil eliminado');
  },

  // ---- Vista AJUSTES ----
  renderSettings() {
    const u = this.mainUser;
    return `<div class="section">
      <div class="card">
        <div class="card-label">Perfil principal</div>
        <div id="mainForm">
          ${UI.field('Nombre', UI.input('name', u.name))}
          ${UI.field('Color', UI.colorPicker('color', u.color))}
        </div>
        <button class="btn primary" id="saveMain">Guardar perfil</button>
      </div>
      ${this.isCnp() ? `<div class="card">
        <div class="card-label">Datos predefinidos</div>
        <p class="field-hint" style="margin-top:0;margin-bottom:10px">Los ejercicios predefinidos nunca se borran. Si has cambiado tu rutina, puedes volver al plan original.</p>
        <button class="btn ghost block" id="restorePlan">Restaurar plan original</button>
      </div>` : ''}
      <div class="card">
        <div class="card-label">Datos de la app</div>
        <button class="btn ghost block" data-link="data">Importar / Exportar datos</button>
        <button class="btn danger block" id="resetApp">Borrar todos los datos</button>
        <p class="field-hint">Restablece la app al estado inicial (se borran todos los perfiles, sesiones y progreso).</p>
      </div>
      <p class="version-foot">Traindía · v2.12.8</p>
    </div>`;
  },

  bindSettings(root) {
    UI.bindColorPicker(root);
    root.querySelector('#saveMain').addEventListener('click', async () => {
      const data = UI.readForm(root.querySelector('#mainForm'));
      if (!data.name || !data.name.trim()) { UI.toast('Escribe un nombre', 'err'); return; }
      await DB.put('users', { ...this.mainUser, name: data.name.trim(), color: data.color });
      await this.loadUsers();
      UI.toast('Perfil actualizado');
      this.render();
    });
    const restorePlanBtn = root.querySelector('#restorePlan');
    if (restorePlanBtn) restorePlanBtn.addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Restaurar plan original',
        message: 'CUIDADO: esto SOBREESCRIBE los 7 días con el plan predefinido y BORRA todas las ediciones que hayas hecho en tu rutina (ejercicios, series, orden…). No se puede deshacer. Tus sesiones registradas y tu progreso NO se tocan.',
        confirmLabel: 'Sí, restaurar plan', danger: true, requireText: 'RESTAURAR',
      });
      if (!ok) return;
      await DB.restoreDefaultRoutine(this.mainUser.id);
      await this.refreshRoutine();
      UI.toast('Plan restaurado');
    });
    root.querySelector('#resetApp').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Borrar todos los datos',
        message: 'CUIDADO: esto elimina PERMANENTEMENTE todos los perfiles, sesiones, progreso, diario y rutinas. La app volverá a la pantalla inicial. No se puede deshacer.',
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
