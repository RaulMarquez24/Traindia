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
    await VSessions.checkResume(this);
    VData.checkBackupReminder(this); // recordatorio semanal de copia (si procede)
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
      journal:  { render: (a, p) => VJournal.render(a, p),  bind: (a, r, p) => VJournal.bind(a, r, p) },

      more:     { render: (a, p) => this.renderMore(),      bind: (a, r) => this.bindMore(r) },
      profiles: { render: (a, p) => this.renderProfiles(),  bind: (a, r) => this.bindProfiles(r) },
      data:     { render: (a, p) => VData.render(a, p),     bind: (a, r, p) => VData.bind(a, r, p) },
      settings: { render: (a, p) => this.renderSettings(),  bind: (a, r) => this.bindSettings(r) },
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
      progress: 'Progreso', journal: 'Diario',
      more: 'Más', profiles: 'Perfiles', data: 'Datos', settings: 'Ajustes',
    };
    let label = titles[this.currentView] || 'Traindía';
    if (this.currentView === 'day' && this.routine) {
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
      progress: 'progress', journal: 'journal',
      more: 'more', profiles: 'more', data: 'more', settings: 'more', guides: 'more', guide: 'more', info: 'more', places: 'more',
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

  // ---- Vista MÁS ----
  renderMore() {
    const rows = [
      { v: 'guides', icon: 'book', color: 'var(--light)', label: 'Guías', sub: 'Documentación del plan', cnp: true },
      { v: 'exercises', icon: 'tag', color: 'var(--strong)', label: 'Ejercicios', sub: 'Catálogo editable' },
      { v: 'places', icon: 'pin', color: 'var(--priority)', label: 'Lugares', sub: 'Sitios donde entrenas' },
      { v: 'info', icon: 'info', color: 'var(--moderate)', label: 'El plan', sub: 'Tus planes de entrenamiento' },
      { v: 'profiles', icon: 'users', color: 'var(--sub-accent)', label: 'Perfiles', sub: 'Principal e invitados' },
      { v: 'data', icon: 'swap', color: 'var(--light)', label: 'Importar / Exportar', sub: 'Copias y traspasos JSON' },
      { v: 'settings', icon: 'settings', color: 'var(--rest)', label: 'Ajustes', sub: 'Perfil principal y app' },
    ].filter(r => !r.cnp || this.isCnp());
    return `<div class="section">
      ${rows.map(r => `<button class="big-row" data-link="${r.v}"><span class="big-row-icon tile" style="background:${r.color}">${UI.icon(r.icon, 20)}</span><span class="big-row-text"><strong>${r.label}</strong><span class="dim">${r.sub}</span></span><span class="chev">›</span></button>`).join('')}
      <p class="version-foot">Traindía · v2.3.0 · ${Object.keys(this.usersById).length} perfil(es)<br>© 2026 Raúl Márquez · <a class="foot-link" href="${this.REPO_URL}" target="_blank" rel="noopener">Ver en GitHub ↗</a></p>
    </div>`;
  },
  bindMore() {},

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
      <p class="version-foot">Traindía · v2.3.0</p>
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
