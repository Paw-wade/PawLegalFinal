const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const Task = require('../models/Task');
const Dossier = require('../models/Dossier');
const RendezVous = require('../models/RendezVous');
const MessageInterne = require('../models/MessageInterne');
const User = require('../models/User');

const ADMIN_ROLES = ['admin', 'superadmin'];

function getAnthropicModel() {
  let m = String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim();
  if (m.charCodeAt(0) === 0xfeff) m = m.slice(1).trim();
  const ALIASES = { 'claude-sonnet-4-20250514': 'claude-sonnet-4-6' };
  return ALIASES[m] || m || 'claude-sonnet-4-6';
}

function fmtDate(d) {
  if (!d) return 'sans date';
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return 'sans date';
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function daysAgo(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function daysUntil(date) {
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
}

async function buildCabinetContext(userId) {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const tomorrow = new Date(startOfDay); tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfTomorrow = new Date(tomorrow); endOfTomorrow.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const twoDaysAgo = new Date(now - 2 * 86400000);

  const [tasks, dossiers, rdvAujourdhui, rdvDemain, rdvEnAttente, messagesNonLus] = await Promise.all([
    Task.find({ archived: { $ne: true } })
      .populate('assignedTo', 'firstName lastName')
      .populate('dossier', 'clientNom clientPrenom numero titre')
      .lean(),
    Dossier.find({})
      .select('clientNom clientPrenom titre statut createdAt updatedAt numero dateEcheance')
      .lean(),
    RendezVous.find({ date: { $gte: startOfDay, $lte: endOfDay } })
      .populate('user', 'firstName lastName')
      .lean(),
    RendezVous.find({ date: { $gte: tomorrow, $lte: endOfTomorrow } })
      .populate('user', 'firstName lastName')
      .lean(),
    RendezVous.find({ statut: 'en_attente' })
      .populate('user', 'firstName lastName')
      .lean(),
    MessageInterne.countDocuments({
      $or: [{ destinataires: userId }, { copie: userId }],
      lu: { $not: { $elemMatch: { user: userId } } },
      archive: { $not: { $elemMatch: { user: userId } } },
    }),
  ]);

  // Classifier les taches
  const tachesEnRetard = tasks.filter(t =>
    t.statut !== 'termine' && t.statut !== 'annule' &&
    t.dateEcheance && new Date(t.dateEcheance) < startOfDay
  );
  const tachesAujourdhui = tasks.filter(t =>
    t.statut !== 'termine' && t.statut !== 'annule' &&
    t.dateEcheance &&
    new Date(t.dateEcheance) >= startOfDay &&
    new Date(t.dateEcheance) <= endOfDay
  );
  const tachesEnCoursSansMaj = tasks.filter(t =>
    t.statut === 'en_cours' && t.updatedAt && new Date(t.updatedAt) < twoDaysAgo
  );
  const tachesUrgentes = tasks.filter(t =>
    t.priorite === 'urgente' && t.statut !== 'termine' && t.statut !== 'annule'
  );
  const tachesTermineesAujourdhui = tasks.filter(t =>
    t.statut === 'termine' && t.updatedAt &&
    new Date(t.updatedAt) >= startOfDay
  );

  // Dossiers inactifs (updatedAt > 7j)
  const dossiersActifs = dossiers.filter(d => d.statut !== 'archive' && d.statut !== 'ferme');
  const dossiersInactifs = dossiersActifs.filter(d => d.updatedAt && new Date(d.updatedAt) < sevenDaysAgo);

  function taskLine(t) {
    const assignes = Array.isArray(t.assignedTo)
      ? t.assignedTo.map(a => `${a.firstName || ''} ${a.lastName || ''}`.trim()).filter(Boolean).join(', ')
      : '';
    const dos = t.dossier ? `${t.dossier.clientNom || ''} ${t.dossier.clientPrenom || ''}`.trim() : '';
    const echeance = t.dateEcheance ? ` (echeance: ${fmtDate(t.dateEcheance)})` : '';
    const retard = t.dateEcheance && new Date(t.dateEcheance) < startOfDay
      ? ` [EN RETARD de ${daysAgo(t.dateEcheance)} j]` : '';
    const parts = [t.titre || 'Sans titre', echeance, retard];
    if (dos) parts.push(`dossier: ${dos}`);
    if (assignes) parts.push(`assigne a: ${assignes}`);
    return '  - ' + parts.filter(Boolean).join(' | ');
  }

  function dossierLine(d) {
    const client = `${d.clientNom || ''} ${d.clientPrenom || ''}`.trim() || d.titre || 'Anonyme';
    const inactive = d.updatedAt ? ` [inactif depuis ${daysAgo(d.updatedAt)} j]` : '';
    const echeance = d.dateEcheance ? ` echeance: ${fmtDate(d.dateEcheance)}` : '';
    return `  - ${client} | statut: ${d.statut || 'en_cours'}${echeance}${inactive}`;
  }

  function rdvLine(r) {
    const client = r.user ? `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim() : (r.clientNom || 'Client inconnu');
    return `  - ${fmtDateTime(r.date)} | ${client} | ${r.type || 'RDV'} | statut: ${r.statut}`;
  }

  const lines = [];
  lines.push(`=== CONTEXTE CABINET ADA PAPERS ===`);
  lines.push(`Date: ${now.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
  lines.push('');

  lines.push(`--- TACHES ---`);
  lines.push(`Total actives: ${tasks.filter(t => t.statut !== 'termine' && t.statut !== 'annule').length}`);

  if (tachesUrgentes.length) {
    lines.push(`\nURGENTES (${tachesUrgentes.length}):`);
    tachesUrgentes.forEach(t => lines.push(taskLine(t)));
  }
  if (tachesEnRetard.length) {
    lines.push(`\nEN RETARD (${tachesEnRetard.length}):`);
    tachesEnRetard.forEach(t => lines.push(taskLine(t)));
  }
  if (tachesAujourdhui.length) {
    lines.push(`\nA FAIRE AUJOURD'HUI (${tachesAujourdhui.length}):`);
    tachesAujourdhui.forEach(t => lines.push(taskLine(t)));
  }
  if (tachesEnCoursSansMaj.length) {
    lines.push(`\nEN COURS SANS MISE A JOUR DEPUIS +48H (${tachesEnCoursSansMaj.length}):`);
    tachesEnCoursSansMaj.forEach(t => lines.push(taskLine(t)));
  }
  if (tachesTermineesAujourdhui.length) {
    lines.push(`\nTERMINEES AUJOURD'HUI (${tachesTermineesAujourdhui.length}):`);
    tachesTermineesAujourdhui.forEach(t => lines.push(taskLine(t)));
  }

  lines.push('');
  lines.push(`--- DOSSIERS ---`);
  lines.push(`Total actifs: ${dossiersActifs.length} | Inactifs >7j: ${dossiersInactifs.length}`);
  if (dossiersInactifs.length) {
    lines.push(`\nDOSSIERS INACTIFS >7 JOURS (${dossiersInactifs.length}):`);
    dossiersInactifs.slice(0, 15).forEach(d => lines.push(dossierLine(d)));
  }

  lines.push('');
  lines.push(`--- RENDEZ-VOUS ---`);
  if (rdvAujourdhui.length) {
    lines.push(`\nAUJOURD'HUI (${rdvAujourdhui.length}):`);
    rdvAujourdhui.forEach(r => lines.push(rdvLine(r)));
  } else {
    lines.push(`Aucun RDV aujourd'hui.`);
  }
  if (rdvDemain.length) {
    lines.push(`\nDEMAIN (${rdvDemain.length}):`);
    rdvDemain.forEach(r => lines.push(rdvLine(r)));
  }
  if (rdvEnAttente.length) {
    lines.push(`\nEN ATTENTE DE CONFIRMATION (${rdvEnAttente.length}):`);
    rdvEnAttente.slice(0, 10).forEach(r => lines.push(rdvLine(r)));
  }

  lines.push('');
  lines.push(`--- MESSAGES INTERNES ---`);
  if (messagesNonLus > 0) {
    lines.push(`Messages non lus: ${messagesNonLus}`);
  } else {
    lines.push(`Aucun message non lu.`);
  }

  return {
    text: lines.join('\n'),
    stats: {
      tachesEnRetard: tachesEnRetard.length,
      tachesAujourdhui: tachesAujourdhui.length,
      tachesUrgentes: tachesUrgentes.length,
      tachesEnCours: tasks.filter(t => t.statut === 'en_cours').length,
      dossiersActifs: dossiersActifs.length,
      dossiersInactifs: dossiersInactifs.length,
      rdvAujourdhui: rdvAujourdhui.length,
      rdvEnAttente: rdvEnAttente.length,
      messagesNonLus: messagesNonLus,
    },
  };
}

function buildSystemPrompt(userName, contextText) {
  return `Tu es l'assistant executif de ${userName}, juriste au cabinet Ada Papers (droit des etrangers : OQTF, titres de sejour, recours visa). Tu es a la fois secretaire, chef de projet et conseiller operationnel.

Tu as acces aux donnees reelles du cabinet ci-dessous. Utilise-les pour repondre avec precision - cite les noms, dates et chiffres concrets.

REGLES DE COMPORTEMENT :
- Commence toujours par l'essentiel, sans preambule
- Utilise des listes courtes et structurees
- Classe les alertes : CRITIQUE (delai legal, rdv rate), IMPORTANT (retard, dossier inactif), INFO (mise a jour)
- Propose toujours une action suivante concrete
- Ne donne pas de conseil juridique au client final, ne prend pas de decision sans validation
- Reponds en francais

DONNEES CABINET EN TEMPS REEL :
${contextText}`;
}

// GET /api/assistant/context - donnees agregees pour l'UI
router.get('/context', protect, authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { stats } = await buildCabinetContext(userId);
    res.json({ success: true, stats });
  } catch (err) {
    console.error('[assistant] context error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/assistant/chat - chat stream SSE
router.post('/chat', protect, authorize(...ADMIN_ROLES), async (req, res) => {
  const { messages = [], autobrief = false } = req.body;

  const writeSse = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      writeSse({ type: 'error', error: 'ANTHROPIC_API_KEY manquante' });
      return res.end();
    }

    const userId = req.user._id || req.user.id;
    const userName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || 'Admin';
    const { text: contextText, stats } = await buildCabinetContext(userId);

    // Envoyer les stats au client
    writeSse({ type: 'stats', stats });

    const systemPrompt = buildSystemPrompt(userName, contextText);

    let msgs;
    if (autobrief) {
      msgs = [{
        role: 'user',
        content: "Donne-moi le briefing complet de la journee. Commence par les alertes critiques, puis les taches du jour, puis les RDV, puis les dossiers inactifs, puis les messages en attente. Termine par les 3 actions prioritaires a faire maintenant.",
      }];
    } else {
      msgs = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
        role: m.role,
        content: String(m.content || ''),
      }));
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') {
        writeSse({ type: 'error', error: 'Message invalide' });
        return res.end();
      }
    }

    const model = getAnthropicModel();
    const client = new Anthropic({ apiKey: key, timeout: 120000 });
    const stream = client.messages.stream({ model, max_tokens: 4096, system: systemPrompt, messages: msgs });

    let upstreamSettled = false;
    res.on('close', () => {
      if (!upstreamSettled) { try { stream.abort(); } catch (_) {} }
    });

    stream.on('text', (delta) => {
      if (typeof delta === 'string' && delta.length) writeSse({ type: 'delta', text: delta });
    });

    const finalText = await stream.finalText();
    upstreamSettled = true;
    writeSse({ type: 'complete', text: finalText });
  } catch (err) {
    let msg = err.message || 'Erreur serveur';
    try {
      const idx = msg.indexOf('{');
      if (idx !== -1) {
        const parsed = JSON.parse(msg.slice(idx));
        msg = parsed?.error?.message || parsed?.message || msg;
      }
    } catch (_) {}
    console.error('[assistant] chat error:', msg);
    writeSse({ type: 'error', error: msg });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

module.exports = router;
