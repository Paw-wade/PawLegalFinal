# Projet SaaS multi-tenant — Ada Papers

Document de cadrage pour permettre à d’autres cabinets d’utiliser le système de gestion Ada Papers en autonomie.

## Situation actuelle

Ada Papers est conçu comme **une seule instance métier** : un cabinet, une base de données partagée, une marque unique.

- Pas de notion de **tenant** ou d’**organisation** sur les utilisateurs et les dossiers.
- Les rôles (`admin`, `client`, `partenaire`, etc.) gèrent les droits, pas l’appartenance à un cabinet distinct.
- Les administrateurs peuvent voir l’ensemble des dossiers selon les règles de rôle.
- L’identité produit (marque, e-mails, domaines) est celle d’Ada Papers.
- Les intégrations (messagerie, agenda, SMS) sont en pratique **globales** à l’instance.

Pour qu’**d’autres cabinets** utilisent la plateforme **en autonomie**, il faut d’abord choisir le modèle produit, puis l’isolation des données.

## Trois modèles possibles

### 1. Une instance par cabinet (recommandé pour démarrer)

Chaque cabinet dispose de **son propre déploiement** : base MongoDB, stockage fichiers, variables d’environnement (Brevo, Google Agenda, domaine), branding.

**Avantages**

- Isolation forte par défaut.
- Peu de refonte du code existant.
- Conformité et facturation plus simples.
- Un incident ou une fuite reste limité à un client.

**Inconvénients**

- Déploiements et mises à jour à répéter.
- Coût d’exploitation qui augmente avec le nombre de cabinets.

**Autonomie**

- Un super-admin local par instance.
- Ada Papers peut rester l’éditeur sans accéder aux dossiers des autres cabinets.

### 2. SaaS multi-tenant (une application, plusieurs cabinets)

Un seul produit avec un **`organizationId` / `tenantId`** sur les entités métier (utilisateurs, dossiers, documents, messages, rendez-vous, tarification, modèles d’e-mails, etc.) et un **filtre systématique** sur chaque requête.

**Avantages**

- Une codebase, un déploiement.
- Onboarding et évolutions centralisés.

**Inconvénients**

- Refonte large du backend et du frontend.
- Risque de fuite inter-cabinets si une requête oublie le filtre tenant.
- Paramétrage par tenant (tarifs, workflows, Lexia, SMS).

**Rôles typiques**

- Super-admin plateforme (Ada Papers).
- Admin cabinet.
- Équipe du cabinet.
- Clients rattachés uniquement à leur cabinet.

### 3. Hybride

**Cœur multi-tenant** pour dossiers, messagerie, documents, rendez-vous, tarification ; **modules sensibles** (Lexia, certains connecteurs) en option par cabinet ou en instance dédiée.

Souvent le bon compromis si l’on vend le **socle gestion** à plusieurs cabinets tout en gardant des options « premium » isolées.

## Socle technique à prévoir (surtout en multi-tenant)

### Modèle Organisation

- Nom, slug, domaine ou sous-domaine.
- Logo, fuseau horaire, langue.
- Statut : essai, actif, suspendu.
- Limites : utilisateurs, stockage, modules activés.

### Utilisateurs

- Rattachement à une ou plusieurs organisations.
- Règle à trancher : e-mail unique **par organisation** ou global sur toute la plateforme.

### Données

- `organizationId` sur dossiers, documents, notifications, rendez-vous, partages publics, logs.
- Index composés pour les listes et recherches.

### Authentification

- JWT ou session avec **organisation active**.
- Refus de toute lecture ou écriture hors périmètre tenant.

### Fichiers

- Préfixes par organisation (`uploads/{orgId}/...`).
- Liens publics (dépôt tiers, téléchargement) liés au tenant.

### Intégrations

- Brevo, Google Agenda, SMS, OAuth : **par cabinet**, pas un seul compte global.

### CMS et e-mails

- Templates et contenus par organisation.
- Textes Ada Papers en défaut seulement.

### Lexia / Paw AI

- Corpus, prompts et quotas **par cabinet**.
- Éviter le mélange de données et la facturation croisée.

### Audit

- Qui a fait quoi, dans quel cabinet.
- Utile en cas de litige, contrôle ou support.

## Autonomie fonctionnelle (au-delà de la technique)

Les cabinets autonomes attendent en général :

- invitation et gestion de l’équipe ;
- paramètres cabinet (tarification, statuts de dossier, modèles recours, e-mails/SMS) ;
- espace client à leur marque (nom, couleurs, URL) ;
- export, sauvegarde, suppression sur demande ;
- support sans accès aux dossiers, sauf accord explicite.

Sans **panneau d’administration cabinet**, une instance technique isolée reste dépendante d’Ada Papers pour chaque réglage.

## Produit, juridique, exploitation

- **Contrat** : rôles hébergeur (éditeur) vs responsable des données (souvent le cabinet) ; DPA, conservation, export, résiliation.
- **Facturation** : par siège, par dossier actif, ou forfait + options (SMS, stockage, IA).
- **Onboarding** : création organisation, premier admin, import clients/dossiers, checklist (domaine, e-mail, agenda).
- **Mises à jour** : fenêtre de maintenance, notes de version ; version figée possible pour les gros clients.

## Recommandation pragmatique

| Horizon | Piste |
|--------|--------|
| **1 à 3 cabinets pilotes** | Instance dédiée par cabinet + charte d’exploitation et paramètres externalisés (`.env`, branding, modèles). |
| **5 à 20 cabinets** | Extraire un **noyau « organisation »** sur les modules critiques, puis généraliser `organizationId`. |
| **Produit éditeur** | Console Ada Papers (tenants, abonnements, suspension) + admin cabinet + isolation testée en continu. |

Éviter d’empiler des modules transverses (ex. suivi financier global) **avant** la règle « à qui appartiennent les montants » : en multi-tenant, la compta est **par organisation**, pas globale.

## Risques à anticiper

- Requêtes admin sans filtre tenant → fuite de dossiers entre cabinets.
- URLs et tokens publics sans lien organisation.
- Comptes `superadmin` globaux trop permissifs.
- Une seule clé API (mail, agenda) pour tous les tenants.
- Marque et mentions juridiques Ada Papers imposées à des cabinets qui veulent leur propre identité.

## Synthèse

Pour une **autonomie réelle**, le levier principal est une **frontière d’organisation** (instance dédiée ou multi-tenant strict), complétée par **paramétrage et gouvernance par cabinet**. Le reste (tarification, messagerie, documents) peut suivre une fois cette frontière posée.
