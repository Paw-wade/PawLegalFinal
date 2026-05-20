import { jsPDF } from 'jspdf';
import { addDocumentHeader, formatDate } from '@/utils/documentHeader';

function stripMarkdownForPdf(md: string): string {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
}

export function downloadDossierPawAiPdf(opts: {
  dossierTitle: string;
  dossierNumero?: string;
  prompt: string;
  outputMarkdown: string;
  fileName?: string;
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = addDocumentHeader(doc, { margin });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Paw AI — Synthèse dossier', margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const meta = [
    opts.dossierNumero ? `Dossier n° ${opts.dossierNumero}` : '',
    opts.dossierTitle,
    `Généré le ${formatDate(new Date())}`,
  ].filter(Boolean);
  meta.forEach((line) => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Prompt', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const promptLines = doc.splitTextToSize(stripMarkdownForPdf(opts.prompt), maxWidth);
  promptLines.forEach((line: string) => {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 4.5;
  });
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Résultat', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const bodyLines = doc.splitTextToSize(stripMarkdownForPdf(opts.outputMarkdown), maxWidth);
  bodyLines.forEach((line: string) => {
    if (y > 275) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 4.5;
  });

  const safeName = (opts.fileName || 'synthese-paw-ai-dossier')
    .replace(/[^\w\-]+/g, '-')
    .slice(0, 80);
  doc.save(`${safeName}.pdf`);
}
