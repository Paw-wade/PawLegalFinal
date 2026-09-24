const { parseDocument } = require('htmlparser2');
const { htmlToPdf } = require('./htmlToPdf');
const { sanitizeLettreHtml } = require('./lettreMissionHtml');

const ORANGE = '#ea580c';
const INK = '#1a1a1a';
const MUTED = '#666666';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
}

function versionLabel(version) {
  return version.type === 'avenant' ? 'Avenant' : 'Lettre de mission';
}

/** Nom de fichier propre pour le telechargement et le document du dossier. */
function buildFileName(dossier, version) {
  const ref = String(dossier.numero || dossier._id || 'dossier').replace(/[\\/:*?"<>|\s]+/g, '-');
  const versions = (dossier.lettreMission && dossier.lettreMission.versions) || [];
  const rank = versions.filter((v) => v.type === 'avenant' && v.numero <= version.numero).length || 1;
  const kind = version.type === 'avenant' ? `avenant-${rank}` : 'lettre-de-mission';
  return `${kind}-${ref}.pdf`;
}

/** Bloc de mention finale : acceptation electronique ou attente d'acceptation. */
function statusLines(version) {
  if (version.statut === 'acceptee') {
    return [
      `Acceptée électroniquement le ${fmtDate(version.accepteeAt)} par ${version.accepteeNom || 'le client'}.`,
      `Empreinte du texte accepté (SHA-256) : ${version.hash}`,
    ];
  }
  return [`Envoyée le ${fmtDate(version.envoyeeAt)} : en attente d'acceptation du client.`];
}

function buildHtml(dossier, version) {
  const body = sanitizeLettreHtml(version.contenuHtml);
  const title = version.titre || versionLabel(version);
  const motif = version.motifAvenant ? `<p class="motif">Objet de l'avenant : ${esc(version.motifAvenant)}</p>` : '';
  const status = statusLines(version).map((l) => `<div>${esc(l)}</div>`).join('');
  const accepted = version.statut === 'acceptee';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5; color: ${INK}; }
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid ${ORANGE}; padding-bottom: 8px; margin-bottom: 18px; }
.brand { font-size: 20pt; font-weight: bold; color: ${ORANGE}; }
.ref { font-size: 9pt; color: ${MUTED}; text-align: right; }
h1.doc { font-size: 15pt; margin: 0 0 6px; }
.motif { font-size: 10pt; color: ${MUTED}; margin: 0 0 12px; }
.content ul { list-style: disc; padding-left: 22px; } .content ol { list-style: decimal; padding-left: 22px; }
.content table { border-collapse: collapse; margin: 8px 0; } .content td, .content th { border: 1px solid #999; padding: 4px 8px; }
.sign { margin-top: 26px; padding: 10px 12px; border: 1px solid ${accepted ? '#16a34a' : '#d1d5db'}; border-radius: 6px; font-size: 9pt; color: ${accepted ? '#166534' : MUTED}; word-break: break-all; page-break-inside: avoid; }
</style></head><body>
<div class="head"><div class="brand">Ada Papers</div><div class="ref">Dossier ${esc(dossier.numero || '')}<br>${esc(dossier.titre || '')}</div></div>
<h1 class="doc">${esc(title)}</h1>${motif}
<div class="content">${body}</div>
<div class="sign">${status}</div>
</body></html>`;
}

// Repli sans navigateur : rendu pdfkit a partir du HTML nettoye (mise en forme simplifiee).
function renderWithPdfKit(dossier, version) {
  const PDFDocument = require('pdfkit');
  const body = sanitizeLettreHtml(version.contenuHtml);
  const dom = parseDocument(body);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fontFor = (s) => (s.bold && s.italic ? 'Helvetica-BoldOblique' : s.bold ? 'Helvetica-Bold' : s.italic ? 'Helvetica-Oblique' : 'Helvetica');
      const colorOf = (node, fallback) => {
        const m = /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8})/i.exec((node.attribs && node.attribs.style) || '');
        return m ? m[1] : fallback;
      };

      doc.font('Helvetica-Bold').fontSize(20).fillColor(ORANGE).text('Ada Papers');
      doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text(`Dossier ${dossier.numero || ''} ${dossier.titre || ''}`.trim());
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(version.titre || versionLabel(version));
      if (version.motifAvenant) {
        doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`Objet de l'avenant : ${version.motifAvenant}`);
      }
      doc.moveDown(0.8);

      // Collecte les segments de texte d'un bloc avec leur style.
      const collect = (node, style, out) => {
        if (node.type === 'text') {
          const t = node.data.replace(/\s+/g, ' ');
          if (t) out.push({ text: t, ...style });
          return;
        }
        if (node.name === 'br') { out.push({ text: '\n', ...style }); return; }
        const next = { ...style };
        if (['b', 'strong'].includes(node.name)) next.bold = true;
        if (['i', 'em'].includes(node.name)) next.italic = true;
        if (node.name === 'u') next.underline = true;
        next.color = colorOf(node, style.color);
        (node.children || []).forEach((c) => collect(c, next, out));
      };

      const writeSegments = (segments, opts = {}) => {
        const list = segments.filter((s) => s.text !== '');
        if (!list.length) return;
        list[0].text = list[0].text.replace(/^\s+/, '');
        list.forEach((s, i) => {
          doc.font(fontFor(s)).fillColor(s.color || INK).fontSize(opts.size || 11)
            .text(s.text, { continued: i < list.length - 1, underline: !!s.underline, align: opts.align || 'left' });
        });
      };

      const alignOf = (node) => {
        const m = /text-align\s*:\s*(left|right|center|justify)/i.exec((node.attribs && node.attribs.style) || '');
        return m ? m[1].toLowerCase() : 'left';
      };

      const walkBlock = (node, ctx) => {
        if (node.type !== 'tag') return;
        const name = node.name;
        if (/^h[1-4]$/.test(name)) {
          const size = { h1: 16, h2: 14, h3: 12.5, h4: 11.5 }[name];
          const segs = []; collect(node, { bold: true, color: INK }, segs);
          doc.moveDown(0.4); writeSegments(segs, { size, align: alignOf(node) }); doc.moveDown(0.3);
        } else if (['p', 'div', 'blockquote'].includes(name)) {
          const hasBlock = (node.children || []).some((c) => c.type === 'tag' && ['p', 'div', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4'].includes(c.name));
          if (hasBlock) { (node.children || []).forEach((c) => walkBlock(c, ctx)); return; }
          const segs = []; collect(node, { color: INK }, segs);
          writeSegments(segs, { align: alignOf(node) }); doc.moveDown(0.4);
        } else if (name === 'ul' || name === 'ol') {
          let n = Number((node.attribs && node.attribs.start) || 1);
          (node.children || []).filter((c) => c.type === 'tag' && c.name === 'li').forEach((li) => {
            const segs = [{ text: name === 'ol' ? `${n++}. ` : '- ', color: INK }];
            collect(li, { color: INK }, segs);
            writeSegments(segs); doc.moveDown(0.15);
          });
          doc.moveDown(0.3);
        } else if (name === 'table') {
          const rows = [];
          const findRows = (n) => (n.children || []).forEach((c) => {
            if (c.type !== 'tag') return;
            if (c.name === 'tr') rows.push(c); else findRows(c);
          });
          findRows(node);
          rows.forEach((tr) => {
            const cells = (tr.children || []).filter((c) => c.type === 'tag' && (c.name === 'td' || c.name === 'th'));
            const segs = [];
            cells.forEach((cell, i) => {
              if (i > 0) segs.push({ text: '  |  ', color: MUTED });
              collect(cell, { color: INK, bold: cell.name === 'th' }, segs);
            });
            writeSegments(segs); doc.moveDown(0.15);
          });
          doc.moveDown(0.3);
        } else if (name === 'hr') {
          doc.moveDown(0.3);
        } else {
          (node.children || []).forEach((c) => walkBlock(c, ctx));
        }
      };

      (dom.children || []).forEach((n) => {
        if (n.type === 'text') {
          const t = n.data.trim();
          if (t) { doc.font('Helvetica').fontSize(11).fillColor(INK).text(t); doc.moveDown(0.4); }
        } else walkBlock(n, {});
      });

      doc.moveDown(1);
      const accepted = version.statut === 'acceptee';
      doc.font('Helvetica').fontSize(9).fillColor(accepted ? '#166534' : MUTED);
      statusLines(version).forEach((l) => doc.text(l));
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Genere le PDF d'une version de lettre : Chromium si disponible, sinon repli pdfkit. */
async function generateLettreMissionPdf(dossier, version) {
  try {
    return await htmlToPdf(buildHtml(dossier, version));
  } catch (e) {
    console.warn('PDF lettre de mission : repli pdfkit (', e.message || e, ')');
    return renderWithPdfKit(dossier, version);
  }
}

module.exports = { generateLettreMissionPdf, renderWithPdfKit, buildFileName };
