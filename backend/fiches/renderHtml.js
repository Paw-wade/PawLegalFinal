/**
 * Rendu HTML générique d'une fiche à partir de son schéma et des données saisies.
 * Le HTML est ensuite converti en PDF (utils/htmlToPdf) avec l'en-tête / logo AdaPapers.
 * Un même moteur sert toutes les fiches → fidélité rubrique-à-rubrique garantie.
 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

function fmtMontant(v) {
  const n = String(v == null ? '' : v).trim();
  if (n === '') return '';
  const num = Number(n.replace(/[^\d.-]/g, ''));
  if (!Number.isNaN(num) && n.replace(/[^\d]/g, '') !== '') {
    return num.toLocaleString('fr-FR') + ' F CFA';
  }
  return esc(n);
}

function val(data, name) {
  return data && data[name] !== undefined && data[name] !== null ? data[name] : '';
}

function checkbox(checked, label) {
  return `<span class="cb">${checked ? '☑' : '☐'} ${esc(label)}</span>`;
}

function renderField(field, data) {
  const v = val(data, field.name);
  const label = esc(field.label || '');
  if (field.type === 'radio') {
    const opts = (field.options || []).map((o) => checkbox(String(v) === String(o.value), o.label)).join(' &nbsp; ');
    return `<div class="fld"><span class="lbl">${label} :</span> <span class="opts">${opts}</span></div>`;
  }
  if (field.type === 'checkboxes') {
    const arr = Array.isArray(v) ? v.map(String) : [];
    const opts = (field.options || []).map((o) => checkbox(arr.includes(String(o.value)), o.label)).join(' &nbsp; ');
    return `<div class="fld"><span class="lbl">${label} :</span> <div class="opts">${opts}</div></div>`;
  }
  let shown;
  if (field.type === 'montant') shown = fmtMontant(v);
  else if (field.type === 'percent') shown = v === '' ? '' : `${esc(v)} %`;
  else if (field.type === 'textarea') shown = v === '' ? '' : `<div class="ta">${nl2br(v)}</div>`;
  else shown = esc(v);
  const suffix = field.suffix ? ` <span class="suf">${esc(field.suffix)}</span>` : '';
  if (field.type === 'textarea') {
    return `<div class="fld full"><span class="lbl">${label} :</span>${shown || '<span class="dots"></span>'}</div>`;
  }
  return `<div class="fld${field.fullWidth ? ' full' : ''}"><span class="lbl">${label} :</span> <span class="vv">${shown || '<span class="dots"></span>'}${suffix}</span></div>`;
}

function renderRepeatable(section, data) {
  const rows = Array.isArray(data[section.id]) ? data[section.id] : [];
  const rep = section.repeatable;
  if (rows.length === 0) {
    return `<p class="muted">Aucun ${esc(rep.itemLabel || 'élément').toLowerCase()} renseigné.</p>`;
  }
  const heads = rep.fields.map((f) => `<th>${esc(f.label)}</th>`).join('');
  const body = rows.map((row, i) => {
    const tds = rep.fields.map((f) => {
      let cell = row && row[f.name] !== undefined ? row[f.name] : '';
      if (f.type === 'montant') cell = fmtMontant(cell);
      else if (f.type === 'percent') cell = cell === '' ? '' : `${esc(cell)} %`;
      else cell = esc(cell);
      return `<td>${cell || '—'}</td>`;
    }).join('');
    return `<tr><td class="idx">${i + 1}</td>${tds}</tr>`;
  }).join('');
  return `<table class="rep"><thead><tr><th class="idx">#</th>${heads}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderSection(section, data) {
  const titre = section.titre ? `<h2>${esc(section.titre)}</h2>` : '';
  if (section.static) {
    return `<section>${titre}<p class="static">${nl2br(section.static)}</p></section>`;
  }
  if (section.repeatable) {
    const note = section.note ? `<p class="note">${esc(section.note)}</p>` : '';
    return `<section>${titre}${note}${renderRepeatable(section, data)}</section>`;
  }
  const fields = (section.fields || []).map((f) => renderField(f, data)).join('');
  const note = section.note ? `<p class="note">${esc(section.note)}</p>` : '';
  return `<section>${titre}<div class="grid">${fields}</div>${note}</section>`;
}

/**
 * @param {object} schema  schéma de la fiche (registry)
 * @param {object} data    données saisies
 * @param {object} opts    { cabinet:{nom,telephone,email}, logoDataUri, reference }
 */
function renderFicheHtml(schema, data, opts = {}) {
  data = data || {};
  const cabinet = opts.cabinet || { nom: 'Ada Papers', telephone: '+33 7 68 03 33 58', email: 'contact@adapapers.fr' };
  const logo = opts.logoDataUri
    ? `<img class="logo" src="${opts.logoDataUri}" alt="logo">`
    : `<div class="logo-txt">ADA&nbsp;PAPERS</div>`;
  const sections = (schema.sections || []).map((s) => renderSection(s, data)).join('');
  const signature = schema.signature
    ? `<div class="sign"><div class="sign-line">Fait à ……………………, le ……… / ……… / …………</div><div class="sign-line">Signature :</div><div class="sign-box"></div></div>`
    : '';
  const ref = opts.reference ? `<div class="ref">Réf. dossier : ${esc(opts.reference)}</div>` : '';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; }
  header.doc { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #ea580c; padding-bottom: 10px; margin-bottom: 6px; }
  .logo { height: 46px; }
  .logo-txt { font-size: 22px; font-weight: 800; color: #ea580c; letter-spacing: .5px; }
  .head-txt { flex: 1; }
  .head-txt .baseline { font-size: 10px; color: #666; }
  h1 { font-size: 16px; margin: 10px 0 2px; color: #111; text-transform: uppercase; }
  .subtitle { font-size: 11px; color: #666; margin: 0 0 8px; }
  .ref { font-size: 10px; color: #666; margin-bottom: 8px; }
  section { margin: 0 0 10px; break-inside: avoid; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #ea580c; border-bottom: 1px solid #f0c9ac; padding-bottom: 2px; margin: 12px 0 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; }
  .fld { padding: 2px 0; }
  .fld.full { grid-column: 1 / -1; }
  .lbl { font-weight: 600; }
  .vv { }
  .dots { display: inline-block; min-width: 120px; border-bottom: 1px dotted #999; }
  .opts { }
  .cb { white-space: nowrap; margin-right: 6px; }
  .ta { border: 1px solid #ddd; border-radius: 4px; padding: 5px 7px; margin-top: 3px; min-height: 28px; background: #fafafa; }
  .suf { color: #666; }
  .static { text-align: justify; color: #333; margin: 2px 0; }
  .note { font-size: 10px; color: #555; font-style: italic; margin: 4px 0 0; text-align: justify; }
  .muted { color: #888; font-style: italic; }
  table.rep { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.rep th, table.rep td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10.5px; }
  table.rep th { background: #fdf1e8; }
  table.rep td.idx, table.rep th.idx { width: 26px; text-align: center; color: #666; }
  .sign { margin-top: 24px; }
  .sign-line { margin: 6px 0; }
  .sign-box { height: 60px; border: 1px dashed #bbb; border-radius: 4px; max-width: 240px; }
  footer.doc { position: fixed; bottom: 6mm; left: 16mm; right: 16mm; border-top: 1px solid #ddd; padding-top: 4px; font-size: 9px; color: #777; text-align: center; }
  </style></head><body>
  <header class="doc">${logo}<div class="head-txt"><div class="baseline">Service d'accompagnement aux démarches administratives</div></div></header>
  <h1>${esc(schema.titre || 'Fiche de renseignements')}</h1>
  ${schema.sousTitre ? `<p class="subtitle">${esc(schema.sousTitre)}</p>` : ''}
  ${ref}
  ${sections}
  ${signature}
  <footer class="doc">${esc(cabinet.nom)} · ${esc(cabinet.telephone)} · ${esc(cabinet.email)}</footer>
  </body></html>`;
}

module.exports = { renderFicheHtml };
