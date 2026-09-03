/**
 * Repli de génération PDF d'une fiche SANS navigateur headless : rendu direct via pdfkit.
 * Utilisé quand htmlToPdf (Chromium) est indisponible ou échoue (ex. serveur sans Chrome).
 * Rendu volontairement sobre mais complet (mêmes rubriques que le schéma).
 */
const ORANGE = '#ea580c';
const INK = '#1a1a1a';
const MUTED = '#666666';

function fmtMontant(v) {
  const n = String(v == null ? '' : v).trim();
  if (n === '') return '';
  const num = Number(n.replace(/[^\d.-]/g, ''));
  // Helvetica (WinAnsi) ne gère pas l'espace fine insécable utilisée par fr-FR → espace normale.
  if (!Number.isNaN(num) && n.replace(/[^\d]/g, '') !== '') return num.toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' F CFA';
  return n;
}

function fieldDisplay(field, data) {
  const v = data && data[field.name] !== undefined && data[field.name] !== null ? data[field.name] : '';
  if (field.type === 'radio') {
    const opt = (field.options || []).find((o) => String(o.value) === String(v));
    return opt ? opt.label : '';
  }
  if (field.type === 'checkboxes') {
    const arr = Array.isArray(v) ? v.map(String) : [];
    return (field.options || []).filter((o) => arr.includes(String(o.value))).map((o) => o.label).join(', ');
  }
  if (field.type === 'montant') return fmtMontant(v);
  if (field.type === 'percent') return v === '' ? '' : `${v} %`;
  return v == null ? '' : String(v);
}

// Convertit le HTML d'un schéma « document » en texte (les fiches en prose : procuration, déclaration).
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderFichePdfKit(schema, data, opts = {}) {
  data = data || {};
  const cabinet = opts.cabinet || { nom: 'Ada Papers', telephone: '+33 7 68 03 33 58', email: 'contact@adapapers.fr' };
  const PDFDocument = require('pdfkit');

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const label = (t) => doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(t, { continued: true });
      const sectionTitle = (t) => {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(ORANGE).text(String(t).toUpperCase());
        doc.moveTo(doc.x, doc.y + 1).lineTo(doc.x + width, doc.y + 1).strokeColor('#f0c9ac').stroke();
        doc.moveDown(0.4);
      };

      // En-tête
      doc.font('Helvetica-Bold').fontSize(18).fillColor(ORANGE).text('ADA PAPERS');
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text("Service d'accompagnement aux démarches administratives");
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111').text(String(schema.titre || 'Fiche de renseignements').toUpperCase());
      if (schema.sousTitre) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(schema.sousTitre);
      if (opts.reference) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Réf. dossier : ${opts.reference}`);
      doc.moveDown(0.3);

      if (typeof schema.document === 'function') {
        // Fiche en prose (procuration, déclaration sur l'honneur…)
        let html = '';
        try { html = schema.document(data, { esc: (s) => s, nl2br: (s) => s, fmtMontant }); } catch { html = ''; }
        doc.font('Helvetica').fontSize(11).fillColor(INK).text(htmlToText(html), { align: 'justify', lineGap: 3 });
      } else {
        for (const section of (schema.sections || [])) {
          if (section.titre) sectionTitle(section.titre);

          if (section.static) {
            doc.font('Helvetica').fontSize(10).fillColor('#333333').text(String(section.static), { align: 'justify', lineGap: 2 });
            continue;
          }

          if (section.repeatable) {
            if (section.note) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(section.note).moveDown(0.2);
            const rows = Array.isArray(data[section.id]) ? data[section.id] : [];
            const rep = section.repeatable;
            if (rows.length === 0) {
              doc.font('Helvetica-Oblique').fontSize(9).fillColor('#888888').text(`Aucun ${String(rep.itemLabel || 'élément').toLowerCase()} renseigné.`);
            } else {
              rows.forEach((row, i) => {
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`${rep.itemLabel || 'Élément'} ${i + 1}`);
                rep.fields.forEach((f) => {
                  const disp = fieldDisplay(f, row || {}) || '—';
                  label(`${f.label} : `);
                  doc.font('Helvetica').fontSize(9).fillColor(INK).text(disp);
                });
                doc.moveDown(0.3);
              });
            }
            continue;
          }

          (section.fields || []).forEach((f) => {
            const disp = fieldDisplay(f, data);
            label(`${f.label} : `);
            doc.font('Helvetica').fontSize(9).fillColor(disp ? INK : '#999999').text(disp || '—');
          });
          if (section.note) doc.moveDown(0.1).font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(section.note);
        }
      }

      if (schema.signature) {
        doc.moveDown(1.2);
        doc.font('Helvetica').fontSize(10).fillColor(INK).text('Fait à ……………………, le ……… / ……… / …………');
        doc.moveDown(0.4).text('Signature :');
        const sigX = doc.x;
        const sigY = doc.y + 4;
        doc.rect(sigX, sigY, 220, 56).dash(2, { space: 2 }).strokeColor('#bbbbbb').stroke().undash();
        const sig = data.__signature;
        if (sig && typeof sig === 'string' && sig.startsWith('data:image/png;base64,')) {
          try {
            const imgBuf = Buffer.from(sig.split(',')[1], 'base64');
            doc.image(imgBuf, sigX + 2, sigY + 2, { width: 216, height: 52 });
          } catch { /* image invalide, on laisse la case vide */ }
        }
        doc.y = sigY + 62;
      }

      // Pied de page
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(`${cabinet.nom} · ${cabinet.telephone} · ${cabinet.email}`, doc.page.margins.left, doc.page.height - 40, { width, align: 'center' });

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { renderFichePdfKit };
