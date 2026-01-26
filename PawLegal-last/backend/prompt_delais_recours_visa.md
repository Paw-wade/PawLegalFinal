# Prompt Structuré pour Calcul des Délais de Recours Visa

## 1. Objectif

Créer un outil interactif calculant automatiquement les délais légaux
liés aux recours contre les refus de visa : - Refus explicite ou
implicite - Calcul RAPO - Communication des motifs - Recours tribunal -
Génération de timeline et messages dynamiques

## 2. Champs de Base

-   **Nature du visa**
-   **Consulat du dépôt**
-   **Date de confirmation du dépôt** (`date_confirmation_depot`)

## 3. Refus Explicite ou Implicite

### A. Refus Implicite

Case : *« Je n'ai pas reçu de réponse après 4 mois »*\
Calcul automatique :

    date_rejet_implicite = date_confirmation_depot + 4 mois

### B. Refus Explicite

Case : *« J'ai reçu une notification de refus »*\
Champ affiché : - `date_notification_refus`

## 4. Calcul du RAPO

### A. Début possible

-   Refus explicite : `date_notification_refus + 1 jour`
-   Refus implicite : `date_rejet_implicite + 1 jour`

### B. Date limite RAPO (30 jours)

-   Explicite : `date_notification_refus + 30 jours`
-   Implicite : `date_rejet_implicite + 30 jours`

### Messages dynamiques

-   **Vert** si délai ouvert\
-   **Rouge** si délai expiré

## 5. Après le RAPO

### Si RAPO Déposé

Champ : `date_depot_rapo`\
Calcul :

    date_limite_reponse_commission = date_depot_rapo + 2 mois

### Si Réponse Reçue

Champ : `date_reponse_rapo`\
Délais tribunal : - Début : `date_reponse_rapo + 1 jour` - Fin :
`date_reponse_rapo + 2 mois`

### Si Pas de Réponse (après 2 mois)

Deux choix : 1. **Saisir tribunal** - Début :
`date_limite_reponse_commission + 1 jour` - Fin :
`date_limite_reponse_commission + 2 mois` 2. **Demander communication
des motifs**

## 6. Communication des Motifs

Case : « J'ai fait une demande de communication des motifs »

Champ : `date_demande_motifs`

Calcul :

    date_limite_motifs = date_demande_motifs + 1 mois

### A. Motifs Reçus

Champ : `date_reception_motifs` - Début tribunal :
`date_reception_motifs + 1 jour` - Fin tribunal :
`date_reception_motifs + 2 mois`

### B. Motifs Non reçus

-   Début tribunal : `date_demande_motifs + 30 jours`
-   Fin tribunal : `date_demande_motifs + 2 mois`

## 7. Rappel Légal Motifs

-   Refus explicite → 30 jours après la notification
-   Refus implicite → 30 jours après la naissance du rejet implicite

## 8. Matrice de Calcul

  Situation                   Départ               Calcul            Résultat
  --------------------------- -------------------- ----------------- --------------------
  Rejet implicite             confirmation dépôt   +4 mois           décision implicite
  RAPO début                  refus                +1 jour           date début
  RAPO limite                 refus                +30 jours         date fin
  Commission                  dépôt RAPO           +2 mois           fin délai
  Motifs                      demande motifs       +1 mois           limite
  Tribunal motifs reçus       réception            +1 j / +2 mois    début/fin
  Tribunal motifs non reçus   demande              +30 j / +2 mois   début/fin

## 9. Timeline Générée

L'outil doit produire automatiquement : - Date dépôt - Naissance refus -
Début/fin RAPO - Délais motifs - Délais tribunal - Alertes
