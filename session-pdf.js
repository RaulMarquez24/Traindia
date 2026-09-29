// =====================================================
// PDF DE UNA SESIÓN — para mandar los resultados al entrenador
// =====================================================
// Se dibuja a mano con jsPDF (se carga solo al usarlo y queda en la caché del
// service worker, así que después funciona sin conexión). Las fuentes estándar
// del PDF solo tienen Latin-1: los símbolos que no están (→, −, emojis…) se
// cambian por equivalentes antes de escribir.
const VSessionPDF = (() => {
  const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js';
  const APP_URL = 'https://traindia.raulmarquez.dev/';
  let _loading = null;
  function loadJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (_loading) return _loading;
    _loading = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = JSPDF_URL;
      sc.crossOrigin = 'anonymous'; // petición CORS: así el service worker la puede guardar para offline
      sc.onload = () => (window.jspdf && window.jspdf.jsPDF) ? res(window.jspdf.jsPDF) : rej(new Error('jsPDF no disponible'));
      sc.onerror = () => { _loading = null; sc.remove(); rej(new Error('No se pudo cargar el generador de PDF')); };
      document.head.appendChild(sc);
    });
    return _loading;
  }

  const MAP = { '→': '»', '−': '-', '—': '-', '–': '-', '…': '...', '‘': "'", '’': "'", '“': '"', '”': '"', '•': '·', '≈': '~', '✓': '', '✔': '' };
  function clean(t) {
    return String(t == null ? '' : t)
      .replace(/[→−—–…‘’“”•≈✓✔]/g, c => MAP[c])
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '') // fuera de Latin-1 (emojis…) no se puede pintar
      .replace(/[ \t]+/g, ' ').trim();
  }
  const slug = (t) => clean(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sesion';

  // Paleta (en claro, pensado para imprimir o leer en el móvil del entrenador)
  const C = {
    ink: [22, 24, 33], dim: [110, 114, 128], line: [226, 228, 236], zebra: [246, 247, 251],
    accent: [79, 70, 229], accentBg: [238, 237, 253], go: [22, 163, 74], wait: [217, 119, 6], stop: [220, 38, 38],
  };

  function build(jsPDF, m) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 16, CW = W - 2 * M, BOTTOM = H - 18;
    let y = 0;
    const font = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...(color || C.ink)); };
    const lines = (t, w) => doc.splitTextToSize(clean(t), w);
    const lh = (size) => size * 0.3528 * 1.3; // alto de línea en mm
    const newPage = () => { doc.addPage(); y = M; };
    const need = (h) => { if (y + h > BOTTOM) newPage(); };

    // ---- Cabecera ----
    doc.setFillColor(...C.accent); doc.rect(0, 0, W, 5, 'F');
    y = M + 2;
    font('bold', 9, C.accent); doc.text('TRAINDÍA · RESULTADOS DEL ENTRENO', M, y);
    y += 8;
    font('bold', 20);
    const tl = lines(m.name, CW); doc.text(tl, M, y); y += tl.length * lh(20);
    font('normal', 11, C.dim);
    doc.text(clean([m.dateTxt, m.author].filter(Boolean).join('  ·  ')), M, y); y += 7;

    // ---- Cifras ----
    const stats = [
      m.duration && ['Duración', m.duration],
      ['Ejercicios', String(m.entries.filter(e => !e.check).length)],
      ['Series', String(m.nSeries)],
      m.volume && ['Volumen', `${m.volume.toLocaleString('es-ES')} kg`],
    ].filter(Boolean);
    const gap = 3, bw = (CW - gap * (stats.length - 1)) / stats.length;
    stats.forEach(([k, v], i) => {
      const x = M + i * (bw + gap);
      doc.setFillColor(...C.zebra); doc.roundedRect(x, y, bw, 16, 2, 2, 'F');
      font('normal', 8, C.dim); doc.text(k.toUpperCase(), x + 4, y + 5.5);
      font('bold', 13); doc.text(clean(v), x + 4, y + 12.5);
    });
    y += 21;
    if (m.response) {
      const col = C[m.response.cls] || C.dim;
      doc.setFillColor(...col); doc.circle(M + 1.6, y - 1.2, 1.6, 'F');
      font('normal', 10, C.dim); doc.text('Al día siguiente:', M + 5, y);
      font('bold', 10, col); doc.text(clean(m.response.label), M + 5 + doc.getTextWidth('Al día siguiente: '), y);
      y += 7;
    }

    // ---- Récords ----
    if (m.prs.length) {
      const txt = lines(m.prs.map(p => `${p.name}: ${p.value}`).join('   ·   '), CW - 10);
      const h = 9 + txt.length * lh(10);
      need(h);
      doc.setFillColor(...C.accentBg); doc.roundedRect(M, y, CW, h, 2, 2, 'F');
      font('bold', 9, C.accent); doc.text(m.prs.length > 1 ? 'RÉCORDS PERSONALES' : 'RÉCORD PERSONAL', M + 5, y + 5.5);
      font('normal', 10); doc.text(txt, M + 5, y + 10.5);
      y += h + 5;
    }

    // ---- Ejercicios ----
    const COL_N = 10, COL_HOY = (CW - COL_N) * 0.52, COL_PREV = CW - COL_N - COL_HOY;
    const entries = m.entries;
    let i = 0, num = 0;
    while (i < entries.length) {
      const e = entries[i];
      if (e.check) {
        // Hecho / no hecho seguidos (calentamiento, movilidad…): lista compacta
        const group = [e];
        while (entries[i + group.length] && entries[i + group.length].check && entries[i + group.length].block === e.block) group.push(entries[i + group.length]);
        i += group.length;
        need(14);
        y += 2;
        font('bold', 12); doc.text(clean(e.block || 'Hecho / no hecho'), M, y); y += 3;
        group.forEach((g, gi) => {
          const st = g.sets[0] || { txt: 'Sin apuntar', empty: true };
          const nl = lines(g.name + (g.target ? `  (${g.target})` : ''), CW * 0.62);
          const rh = Math.max(7, nl.length * lh(10) + 2.6);
          need(rh);
          if (gi % 2 === 0) { doc.setFillColor(...C.zebra); doc.rect(M, y, CW, rh, 'F'); }
          font('normal', 10); doc.text(nl, M + 3, y + 4.8);
          const col = st.empty ? C.dim : st.skip ? C.stop : C.go;
          font('bold', 10, col); doc.text(clean(st.txt), M + CW - 3, y + 4.8, { align: 'right' });
          y += rh;
        });
        if (group.some(g => g.note)) {
          group.filter(g => g.note).forEach(g => { const nl = lines(`Nota (${g.name}): ${g.note}`, CW); need(nl.length * lh(9) + 2); font('italic', 9, C.dim); doc.text(nl, M, y + 4); y += nl.length * lh(9) + 1; });
        }
        y += 6;
        continue;
      }
      i++; num++;
      // Cabecera del ejercicio (y al menos dos filas juntas, para no dejarla huérfana)
      const nameL = lines(`${num}. ${e.name}`, CW - 4);
      const sub = [e.target && `Objetivo: ${e.target}`, e.detail].filter(Boolean).join('  ·  ');
      const subL = sub ? lines(sub, CW - 4) : [];
      need(nameL.length * lh(12) + subL.length * lh(9) + 7 + 2 * 7);
      y += 2;
      font('bold', 12); doc.text(nameL, M, y + 3); y += nameL.length * lh(12);
      if (subL.length) { font('normal', 9, C.dim); doc.text(subL, M, y + 2.4); y += subL.length * lh(9); }
      y += 2.5;
      // Tabla de series
      const headRow = () => {
        doc.setDrawColor(...C.line); doc.setLineWidth(0.3); doc.line(M, y + 6, M + CW, y + 6);
        font('bold', 8, C.dim);
        doc.text('SERIE', M + 1, y + 4.3);
        doc.text(clean(UI.fmtDateShort(m.date) || 'ESTE DÍA').toUpperCase(), M + COL_N + 2, y + 4.3);
        doc.text(clean(e.prevDate ? `ANTERIOR (${UI.fmtDateShort(e.prevDate)})` : 'ANTERIOR'), M + COL_N + COL_HOY + 2, y + 4.3);
        y += 6.5;
      };
      headRow();
      const rows = e.sets.length ? e.sets : [{ n: '', txt: 'Sin series', empty: true, prev: '' }];
      rows.forEach((st, si) => {
        const hl = lines(st.txt, COL_HOY - 4), pl = lines(st.prev || '-', COL_PREV - 4);
        const rh = Math.max(hl.length, pl.length) * lh(10) + 2.8;
        if (y + rh > BOTTOM) { newPage(); font('bold', 10, C.dim); doc.text(clean(`${e.name} (sigue)`), M, y + 3); y += 5; headRow(); }
        if (si % 2 === 1) { doc.setFillColor(...C.zebra); doc.rect(M, y, CW, rh, 'F'); }
        font('normal', 10, C.dim); doc.text(String(st.n), M + 3, y + 4.9);
        font(st.empty ? 'normal' : 'bold', 10, st.empty ? C.dim : st.skip ? C.stop : C.ink); doc.text(hl, M + COL_N + 2, y + 4.9);
        font('normal', 10, C.dim); doc.text(pl, M + COL_N + COL_HOY + 2, y + 4.9);
        y += rh;
      });
      if (e.totals) { need(6); font('bold', 9, C.dim); doc.text(clean(`Total: ${e.totals.replace(' total', '')}`), M + COL_N + 2, y + 4.5); y += 6; }
      if (e.note) {
        const nl = lines(`Nota: ${e.note}`, CW - 8);
        const h = nl.length * lh(9.5) + 4;
        need(h + 1);
        doc.setFillColor(...C.accentBg); doc.rect(M, y + 1, 1.2, h - 1, 'F');
        font('italic', 9.5); doc.text(nl, M + 4, y + 4.8); y += h + 1;
      }
      y += 6;
    }
    if (!entries.length) { font('normal', 11, C.dim); doc.text('Sin ejercicios.', M, y + 4); y += 10; }

    // ---- Notas de la sesión ----
    if (m.notes) {
      const nl = lines(m.notes, CW - 10);
      const h = nl.length * lh(10) + 11;
      need(Math.min(h, 60));
      doc.setDrawColor(...C.line); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, h, 2, 2, 'S');
      font('bold', 9, C.dim); doc.text('NOTAS DE LA SESIÓN', M + 5, y + 5.5);
      font('normal', 10); doc.text(nl, M + 5, y + 11);
      y += h + 4;
    }

    // ---- Pie en todas las páginas ----
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(...C.line); doc.setLineWidth(0.3); doc.line(M, H - 12, W - M, H - 12);
      font('normal', 8, C.dim);
      const pre = 'Hecho con Traindía · ';
      doc.text(pre, M, H - 7.5);
      const lx = M + doc.getTextWidth(pre) + 0.8; // medido con la fuente del texto de antes (+ aire tras el ·)
      // Enlace de verdad (se puede tocar en el visor del móvil), no solo texto
      font('bold', 8, C.accent);
      doc.textWithLink('traindia.raulmarquez.dev', lx, H - 7.5, { url: APP_URL });
      font('normal', 8, C.dim);
      doc.text(`${p} / ${total}`, W - M, H - 7.5, { align: 'right' });
    }
    doc.setProperties({ title: clean(`${m.name} · ${m.dateTxt}`), subject: 'Resultados del entreno', creator: 'Traindía' });
    return doc.output('blob');
  }

  // Genera el PDF y ofrece mandarlo. navigator.share necesita un toque reciente y
  // generar tarda un momento, así que el envío va en un botón nuevo del aviso.
  async function share(app, sessionId) {
    const s = await DB.get('sessions', sessionId);
    if (!s) { UI.toast('Sesión no encontrada', 'err'); return; }
    UI.toast('Preparando el PDF…');
    let blob;
    try {
      const [jsPDF, model] = await Promise.all([loadJsPDF(), VSessions.reportModel(app, s)]);
      blob = build(jsPDF, model);
    } catch (e) {
      console.error(e);
      UI.toast(navigator.onLine === false ? 'Para el primer PDF hace falta conexión' : 'No se pudo generar el PDF', 'err');
      return;
    }
    const filename = `traindia-${slug(s.name)}-${s.date || DB.todayISO()}.pdf`;
    const file = typeof File === 'function' ? new File([blob], filename, { type: 'application/pdf' }) : null;
    const canShare = !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    const descargar = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    const ver = () => { const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
    UI.modal({
      title: 'PDF listo',
      bodyHTML: `<p class="modal-text"><strong>${UI.esc(filename)}</strong></p>
        <p class="modal-text dim">Con cada ejercicio, sus series y lo que hiciste la vez anterior, para que tu entrenador vea cómo vas.</p>`,
      actions: canShare ? [
        { label: 'Descargar', kind: 'ghost', onClick: () => { descargar(); UI.toast('PDF descargado'); } },
        { label: 'Compartir', kind: 'primary', onClick: () => {
          try {
            const p = navigator.share({ files: [file], title: clean(`${s.name || 'Entreno'} · ${UI.fmtDate(s.date)}`) });
            if (p && p.catch) p.catch(err => { if (!err || err.name !== 'AbortError') { descargar(); UI.toast('No se pudo compartir: lo tienes en Descargas', 'err'); } });
          } catch (err) { descargar(); UI.toast('No se pudo compartir: lo tienes en Descargas', 'err'); }
        } },
      ] : [
        { label: 'Ver', kind: 'ghost', onClick: () => { ver(); return false; } },
        { label: 'Descargar', kind: 'primary', onClick: () => { descargar(); UI.toast('PDF descargado'); } },
      ],
    });
  }

  return { share, build, loadJsPDF };
})();
