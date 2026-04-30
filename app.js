// ============================================================
// APP CNP - Lógica de navegación
// ============================================================

const app = {
  currentView: 'week',
  currentDay: null,
  currentGuide: null,
  history: [],

  init() {
    this.bindNav();
    this.render();
  },

  bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.history = [];
        this.go(view);
      });
    });

    document.getElementById('backBtn').addEventListener('click', () => {
      this.back();
    });
  },

  go(view, params = {}) {
    if (this.currentView !== view || params.id) {
      this.history.push({
        view: this.currentView,
        day: this.currentDay,
        guide: this.currentGuide
      });
    }
    this.currentView = view;
    if (params.id && view === 'day') this.currentDay = params.id;
    if (params.id && view === 'guide') this.currentGuide = params.id;
    this.render();
    window.scrollTo(0, 0);
  },

  back() {
    if (this.history.length === 0) return;
    const prev = this.history.pop();
    this.currentView = prev.view;
    this.currentDay = prev.day;
    this.currentGuide = prev.guide;
    this.render();
    window.scrollTo(0, 0);
  },

  updateHeader() {
    const backBtn = document.getElementById('backBtn');
    const title = document.getElementById('headerTitle');
    const meta = document.getElementById('headerMeta');

    if (this.history.length > 0) {
      backBtn.style.display = 'flex';
    } else {
      backBtn.style.display = 'none';
    }

    if (this.currentView === 'week') {
      title.textContent = 'Plan CNP';
      meta.textContent = 'Fase 1';
    } else if (this.currentView === 'day') {
      const day = PLAN_DATA.days.find(d => d.id === this.currentDay);
      title.textContent = day ? day.name : 'Día';
      meta.textContent = day ? day.duration : '';
    } else if (this.currentView === 'guides') {
      title.textContent = 'Guías';
      meta.textContent = `${PLAN_DATA.guides.length} temas`;
    } else if (this.currentView === 'guide') {
      const guide = PLAN_DATA.guides.find(g => g.id === this.currentGuide);
      title.textContent = guide ? guide.title : 'Guía';
      meta.textContent = guide ? `Guía ${guide.number}` : '';
    } else if (this.currentView === 'info') {
      title.textContent = 'El plan';
      meta.textContent = 'Información';
    }
  },

  updateNavActive() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    let activeView = this.currentView;
    if (activeView === 'day') activeView = 'week';
    if (activeView === 'guide') activeView = 'guides';
    const activeBtn = document.querySelector(`.nav-btn[data-view="${activeView}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  },

  render() {
    this.updateHeader();
    this.updateNavActive();
    const main = document.getElementById('mainContent');

    let html = '';
    if (this.currentView === 'week') {
      html = this.renderWeek();
    } else if (this.currentView === 'day') {
      html = this.renderDay();
    } else if (this.currentView === 'guides') {
      html = this.renderGuides();
    } else if (this.currentView === 'guide') {
      html = this.renderGuide();
    } else if (this.currentView === 'info') {
      html = this.renderInfo();
    }

    main.innerHTML = `<div class="view active">${html}</div>`;
    this.bindLinks();
  },

  bindLinks() {
    document.querySelectorAll('[data-link]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = el.dataset.link;
        const id = el.dataset.id;
        this.go(target, { id });
      });
    });
  },

  renderWeek() {
    const days = PLAN_DATA.days.map(d => {
      if (d.isRest) {
        return `
          <a class="day-card ${d.type}" data-link="day" data-id="${d.id}">
            <div class="day-row-1">
              <span class="day-name">${d.name}</span>
              <span class="day-tag tag-${d.type}">${d.typeLabel}</span>
            </div>
            <div class="day-focus">${d.focus}</div>
            <div class="day-meta">
              <span class="day-place">${d.place}</span>
              <span class="day-arrow">›</span>
            </div>
          </a>
        `;
      }
      const placeClass = d.placeAccent ? 'parque' : '';
      return `
        <a class="day-card ${d.type}" data-link="day" data-id="${d.id}">
          <div class="day-row-1">
            <span class="day-name">${d.name}</span>
            <span class="day-tag tag-${d.type}">${d.typeLabel}</span>
          </div>
          <div class="day-focus">${d.focus}</div>
          <div class="day-meta">
            <span class="day-place ${placeClass}">${d.place} · <strong>${d.duration}</strong></span>
            <span class="day-arrow">›</span>
          </div>
        </a>
      `;
    }).join('');

    return `
      <div class="week-intro">
        <div class="eyebrow">Semana — Fase 1</div>
        <h2>Tu rutina</h2>
        <p>Toca un día para ver los ejercicios, suplentes y guías relacionadas.</p>
      </div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot dot-strong"></span>Fuerte</div>
        <div class="legend-item"><span class="legend-dot dot-moderate"></span>Moderado</div>
        <div class="legend-item"><span class="legend-dot dot-light"></span>Ligero</div>
        <div class="legend-item"><span class="legend-dot dot-rest"></span>Descanso</div>
      </div>
      ${days}
    `;
  },

  renderDay() {
    const d = PLAN_DATA.days.find(day => day.id === this.currentDay);
    if (!d) return '<p>Día no encontrado</p>';

    if (d.isRest) {
      return `
        <div class="detail-hero">
          <span class="day-tag tag-${d.type}">${d.typeLabel}</span>
          <h2>${d.name}</h2>
          <div class="focus">${d.focus}</div>
        </div>
        <div class="rest-display">
          <span class="x">×</span>
          <div class="lead">Recuperación total</div>
          <div class="small">Sin entreno · Sin culpa</div>
        </div>
        <p style="font-size: 13px; color: var(--ink-soft); line-height: 1.5; margin-top: 20px;">
          El viernes está fijo como descanso por dos motivos: <strong>fisiológico</strong> (tu cuerpo necesita recuperación total para asimilar los estímulos antes del sábado fuerte) y <strong>vital</strong> (necesitas un día para vida social, descanso mental, lo que sea que no sea entrenar).
        </p>
        <p style="font-size: 13px; color: var(--ink-soft); line-height: 1.5; margin-top: 10px;">
          Sí puedes: estiramientos suaves si te apetece, cuidados de lipedema si los necesitas, vida normal.
        </p>
      `;
    }

    const blocks = d.blocks.map(b => {
      const items = b.exercises.map(ex => {
        const cls = (ex.optional ? 'optional ' : '') + (ex.priority ? '' : '');
        const nameCls = ex.priority ? 'ex-name priority' : 'ex-name';
        return `<li class="${cls}"><span class="${nameCls}">${ex.name}</span><span class="ex-sets">${ex.sets}</span></li>`;
      }).join('');
      const labelCls = b.optional ? 'block-label optional' : 'block-label';
      const labelText = b.optional ? `${b.label} · si hay tiempo` : b.label;
      return `
        <div class="block">
          <div class="${labelCls}">${labelText}</div>
          <ul class="ex-list">${items}</ul>
        </div>
      `;
    }).join('');

    let substitutes = '';
    if (d.substitutes && d.substitutes.length > 0) {
      const subTitle = d.substitutesTitle || 'Suplentes';
      const subItems = d.substitutes.map(s => `
        <li><span class="sub-orig">${s.orig}</span><span class="arrow">→</span>${s.sub}</li>
      `).join('');
      substitutes = `
        <div class="substitutes">
          <div class="substitutes-title">${subTitle}</div>
          <ul class="sub-list">${subItems}</ul>
        </div>
      `;
    }

    let related = '';
    if (d.relatedGuides && d.relatedGuides.length > 0) {
      const links = d.relatedGuides.map(gid => {
        const g = PLAN_DATA.guides.find(x => x.id === gid);
        if (!g) return '';
        return `
          <a class="guide-link" data-link="guide" data-id="${g.id}">
            <span>${g.title}</span>
            <span class="guide-link-arrow">›</span>
          </a>
        `;
      }).join('');
      related = `
        <div class="related-guides">
          <div class="block-label">Guías relacionadas</div>
          ${links}
        </div>
      `;
    }

    const placeClass = d.placeAccent ? 'parque' : '';
    return `
      <div class="detail-hero">
        <span class="day-tag tag-${d.type}">${d.typeLabel}</span>
        <h2>${d.name}</h2>
        <div class="focus">${d.focus}</div>
        <div class="meta">
          <span class="${placeClass}">📍 ${d.place}</span>
          <span>⏱ ${d.duration}</span>
        </div>
      </div>
      ${blocks}
      ${substitutes}
      ${related}
    `;
  },

  renderGuides() {
    const cards = PLAN_DATA.guides.map(g => `
      <a class="guide-card" data-link="guide" data-id="${g.id}">
        <div class="num">GUÍA ${g.number}</div>
        <h3>${g.title}</h3>
        <p>${g.summary}</p>
      </a>
    `).join('');

    return `
      <div class="week-intro">
        <div class="eyebrow">Documentación detallada</div>
        <h2>Guías</h2>
        <p>Información completa sobre cada parte del plan.</p>
      </div>
      <div class="guides-list">${cards}</div>
    `;
  },

  renderGuide() {
    const g = PLAN_DATA.guides.find(x => x.id === this.currentGuide);
    if (!g) return '<p>Guía no encontrada</p>';
    return `
      <div class="guide-content">
        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.18em; color: var(--ink-dim); text-transform: uppercase; margin-bottom: 8px; font-weight: 500;">GUÍA ${g.number}</div>
        <h2>${g.title}</h2>
        ${g.content}
      </div>
    `;
  },

  renderInfo() {
    return `
      <div class="week-intro">
        <div class="eyebrow">Sobre el plan</div>
        <h2>Plan CNP — Fase 1</h2>
        <p>Información general y datos del plan.</p>
      </div>

      <div class="block">
        <div class="block-label">Datos atleta</div>
        <ul class="ex-list">
          <li><span class="ex-name">Altura</span><span class="ex-sets">168 cm</span></li>
          <li><span class="ex-name">Peso</span><span class="ex-sets">60-65 kg</span></li>
          <li><span class="ex-name">Sede actual</span><span class="ex-sets">Basic Fit</span></li>
          <li><span class="ex-name">Sede junio</span><span class="ex-sets">Go Fit</span></li>
        </ul>
      </div>

      <div class="block">
        <div class="block-label">Objetivos prioritarios</div>
        <ul class="ex-list">
          <li><span class="ex-name priority">Dominadas</span><span class="ex-sets">★ alta</span></li>
          <li><span class="ex-name priority">Suspensión supina</span><span class="ex-sets">★ alta</span></li>
          <li><span class="ex-name">1 km carrera</span><span class="ex-sets">media</span></li>
          <li><span class="ex-name">Agilidad / circuito</span><span class="ex-sets">media</span></li>
          <li><span class="ex-name">Fuerza general</span><span class="ex-sets">base</span></li>
        </ul>
      </div>

      <div class="block">
        <div class="block-label">Estructura</div>
        <ul class="ex-list">
          <li><span class="ex-name">Días entreno</span><span class="ex-sets">5</span></li>
          <li><span class="ex-name">Días ligeros</span><span class="ex-sets">1</span></li>
          <li><span class="ex-name">Descanso</span><span class="ex-sets">1 (vie)</span></li>
          <li><span class="ex-name">Duración fase</span><span class="ex-sets">8-10 sem</span></li>
        </ul>
      </div>

      <div class="related-guides">
        <div class="block-label">Guías clave</div>
        <a class="guide-link" data-link="guide" data-id="logica-semana">
          <span>Lógica de la semana</span>
          <span class="guide-link-arrow">›</span>
        </a>
        <a class="guide-link" data-link="guide" data-id="analisis-nivel">
          <span>Análisis de tu nivel</span>
          <span class="guide-link-arrow">›</span>
        </a>
        <a class="guide-link" data-link="guide" data-id="progresion-dominadas">
          <span>Progresión de dominadas</span>
          <span class="guide-link-arrow">›</span>
        </a>
      </div>

      <p style="font-size: 11px; color: var(--ink-dim); text-align: center; margin-top: 30px; font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.05em;">
        Plan CNP · Fase 1 · v1.0
      </p>
    `;
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
