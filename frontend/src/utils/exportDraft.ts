/**
 * Export des documents en préparation en PDF ou Word
 */

import { jsPDF } from 'jspdf';

/** Convertit du HTML simple en texte brut (supprime les balises, décode les entités) */
export function htmlToPlainText(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (!div) return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

/** Télécharge le document en préparation au format PDF */
export function exportDraftAsPdf(title: string, content: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - 2 * margin;
  let y = margin;

  // Titre
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title || 'Sans titre', maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 6;

  // Contenu (texte brut)
  const text = htmlToPlainText(content);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  if (text) {
    const contentLines = doc.splitTextToSize(text, maxWidth);
    const lineHeight = 6;
    for (let i = 0; i < contentLines.length; i++) {
      if (y > pageHeight - 25) {
        doc.addPage();
        y = margin;
      }
      doc.text(contentLines[i], margin, y);
      y += lineHeight;
    }
  } else {
    doc.text('(Aucun contenu)', margin, y);
  }

  const filename = `${(title || 'document').replace(/[^a-zA-Z0-9\u00C0-\u024F\-_]/g, '_').slice(0, 60)}.pdf`;
  doc.save(filename);
}

/** Télécharge le document en préparation au format Word (HTML en .doc) */
export function exportDraftAsWord(title: string, content: string): void {
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title || 'Sans titre')}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; margin: 2cm; }
    h1 { font-size: 16pt; margin-bottom: 12pt; }
    p { margin: 0 0 6pt; }
    ul, ol { margin: 0 0 6pt; padding-left: 24pt; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title || 'Sans titre')}</h1>
  <div>${content || '<p>(Aucun contenu)</p>'}</div>
</body>
</html>`;

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'document').replace(/[^a-zA-Z0-9\u00C0-\u024F\-_]/g, '_').slice(0, 60)}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
