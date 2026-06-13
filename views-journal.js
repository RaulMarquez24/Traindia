// ============================================================
// VISTA: Diario — texto libre + estado de ánimo (usuario principal)
// ============================================================

const VJournal = (() => {

  const MOODS = [
    { key: 'great', emoji: '🤩', label: 'Genial' },
    { key: 'good', emoji: '🙂', label: 'Bien' },
    { key: 'ok', emoji: '😐', label: 'Normal' },
    { key: 'low', emoji: '😕', label: 'Bajo' },
    { key: 'bad', emoji: '😣', label: 'Mal' },
  ];
  const moodOf = (k) => MOODS.find(m => m.key === k) || null;

  async function render(app) {
    // El diario va siempre vinculado al usuario principal
    const entries = (await DB.journalOf(app.mainUser.id)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    const cards = entries.map(e => {
      const m = moodOf(e.mood);
      return `<div class="journal-card">
        <div class="journal-top">
          <span class="journal-date">${UI.fmtDate(e.date)}</span>
          ${m ? `<span class="journal-mood" title="${m.label}">${m.emoji}</span>` : ''}
          <span class="journal-actions"><button class="icon-btn" data-edit="${e.id}">${UI.icon('edit', 17)}</button><button class="icon-btn danger" data-del="${e.id}">${UI.icon('trash', 17)}</button></span>
        </div>
        <p class="journal-text">${UI.esc(e.text).replace(/\n/g, '<br>')}</p>
      </div>`;
    }).join('');

    return `<div class="section">
      <p class="section-intro">Diario de <strong>${UI.esc(app.mainUser.name)}</strong>. Anota cómo te sientes, cómo van los entrenos y cualquier nota personal.</p>
      <button class="btn primary block" id="addEntry">+ Nueva entrada</button>
      ${cards || '<div class="empty-state"><p>El diario está vacío.</p></div>'}
    </div>`;
  }

  function bind(app, root) {
    root.querySelector('#addEntry').addEventListener('click', () => editEntry(app, null));
    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => editEntry(app, await DB.get('journal', b.dataset.edit))));
    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Eliminar entrada', message: '¿Borrar esta entrada del diario?', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.del('journal', b.dataset.del); app.render(); UI.toast('Entrada eliminada');
    }));
  }

  function editEntry(app, existing) {
    const isNew = !existing;
    const e = existing || { date: DB.todayISO(), mood: 'good', text: '' };
    UI.modal({
      title: isNew ? 'Nueva entrada' : 'Editar entrada',
      bodyHTML: `<div id="jForm">
        ${UI.field('Fecha', UI.input('date', e.date, { type: 'date' }))}
        <span class="field-label">Estado de ánimo</span>
        <div class="mood-picker" data-mood="${UI.esc(e.mood)}">
          ${MOODS.map(m => `<button type="button" class="mood-opt${m.key === e.mood ? ' sel' : ''}" data-m="${m.key}" title="${m.label}">${m.emoji}</button>`).join('')}
          <input type="hidden" name="mood" value="${UI.esc(e.mood)}">
        </div>
        ${UI.field('Texto', UI.textarea('text', e.text, '¿Cómo ha ido el día?…', 5))}
      </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: async (root) => {
          const d = UI.readForm(root.querySelector('#jForm'));
          if (!d.text.trim()) { UI.toast('Escribe algo', 'err'); return false; }
          await DB.put('journal', { id: existing ? existing.id : DB.uid('jrn'), userId: app.mainUser.id, date: d.date, mood: d.mood, text: d.text.trim(), createdAt: existing ? existing.createdAt : Date.now() });
          UI.toast('Entrada guardada');
          app.render();
        }},
      ],
      onMount: (root) => {
        const pick = root.querySelector('.mood-picker');
        const hidden = pick.querySelector('input[type="hidden"]');
        pick.querySelectorAll('.mood-opt').forEach(opt => opt.addEventListener('click', () => {
          pick.querySelectorAll('.mood-opt').forEach(o => o.classList.remove('sel'));
          opt.classList.add('sel'); hidden.value = opt.dataset.m;
        }));
      },
    });
  }

  return { render, bind };
})();
