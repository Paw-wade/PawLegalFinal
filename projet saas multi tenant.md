# Ada Papers — Architecture multi-tenant (roadmap & implémentation)

## Contexte du projet

**Ada Papers** est une application SaaS de gestion de dossiers juridiques (recours, documents, messagerie, rendez-vous, tarification).

**Objectif** : une seule application déployée (Vercel + Coolify) pour plusieurs cabinets, chacun avec :

- sa propre base MongoDB (données métier isolées) ;
- son domaine, branding, emails ;
- zéro redéploiement pour ajouter un cabinet.

**Stack actuelle**


| Couche      | Technologie                             |
| ----------- | --------------------------------------- |
| Backend     | Node.js / Express (`backend/server.js`) |
| Base        | MongoDB + Mongoose (~35 modèles)        |
| Frontend    | Next.js                                 |
| Déploiement | Coolify (API) + Vercel (front)          |
| Email       | Brevo                                   |
| Auth        | JWT (+ NextAuth côté front)             |


---

## Décisions d’architecture validées

### Isolation des données

- **1 URI MongoDB par cabinet** (cluster ou base dédiée).
- **Base maître** : uniquement la collection `organizations` (config, pas de dossiers/clients/documents).

### Modules « plateforme » (partagés, pas par cabinet)

Ces fonctionnalités restent au **niveau plateforme Ada Papers** (une config globale, pas de duplication par tenant en Phase 1–3) :


| Module             | Routes API                      | Remarque                     |
| ------------------ | ------------------------------- | ---------------------------- |
| **CMS**            | `/api/content`, `/api/media`    | Contenu éditorial plateforme |
| **Lexia / Paw AI** | `/api/lexia`, `/api/paw-search` | Index & clés globales        |
| **Légifrance**     | `/api/legal`                    | API juridique externe        |
| **Judilibre**      | `/api/judilibre`                | API juridique externe        |


Le middleware tenant **n’exige pas** de cabinet résolu pour ces préfixes (voir `backend/middleware/tenant.js` → `PLATFORM_API_PREFIXES`).

### Données « par cabinet »

Tout le reste : utilisateurs, dossiers, documents, messages, RDV, brouillons, notifications, etc. → **base tenant** via `req.tenantDb` (Phase 2+).

---

## Principe de fonctionnement

```
1. Requête HTTP → Host (ou X-Tenant-Slug en dev)
2. Lookup dans la base maître (organizations)
3. Pool MongoDB → connexion dédiée au cabinet
4. Route handler → données du bon cabinet uniquement
5. JWT (Phase 2) → orgId doit correspondre au cabinet résolu
```

---

## Schéma `Organization` (base maître)

```ts
interface Organization {
  _id: ObjectId
  slug: string                    // ex: "cabinet-dupont"
  domain?: string                 // legacy — préférer domains[]
  domains: string[]               // ex: ["app.cabinetdupont.fr", "dupont.localhost"]
  mongoUri: string                // URI Atlas dédiée
  status: "trial" | "active" | "suspended"
  branding: {
    name: string
    logo: string
    primaryColor: string
    favicon?: string
  }
  email: {
    from: string
    brevoApiKey: string
    replyTo?: string
  }
  landingPage: {
    headline: string
    subheadline?: string
    cta: string
  }
  limits: {
    maxUsers: number
    maxStorageGb: number
    modules: string[]
  }
  createdAt: Date
  updatedAt: Date
}
```

Implémentation : `backend/models/Organization.js`

---

## Feature flag & variables d’environnement


| Variable             | Rôle                                                     |
| -------------------- | -------------------------------------------------------- |
| `MULTI_TENANT=true`  | Active résolution par domaine + base maître              |
| `MASTER_MONGODB_URI` | URI base maître (sinon `MONGODB_URI` + `MASTER_DB_NAME`) |
| `MASTER_DB_NAME`     | Défaut `adapapers_master`                                |
| `MONGODB_URI`        | Connexion **legacy** (routes non migrées) + seed dev     |
| `DEFAULT_ORG_SLUG`   | Cabinet par défaut sur `localhost`                       |
| `X-Tenant-Slug`      | En-tête HTTP **dev uniquement** pour forcer un cabinet   |


Exemple complet : `backend/.env.multi-tenant.example`

---

## Phase 1 — Fondations ✅ (implémentée)

### Livrables réalisés


| Fichier                                      | Rôle                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `backend/lib/db/master.js`                   | Connexion singleton base maître                    |
| `backend/lib/db/tenants.js`                  | Pool `Map<orgId, Connection>`                      |
| `backend/lib/db/mongoUri.js`                 | Helper URI avec nom de base                        |
| `backend/models/Organization.js`             | Schéma + `getOrganizationModel()`                  |
| `backend/lib/models/registerTenantModels.js` | Copie des schémas sur connexion tenant             |
| `backend/lib/tenant/resolveOrganization.js`  | Résolution Host / slug / cache                     |
| `backend/lib/tenant/getTenantDb.js`          | Helper Phase 2 `getTenantDb(req)`                  |
| `backend/middleware/tenant.js`               | Middleware Express                                 |
| `backend/routes/tenant.js`                   | `GET /api/tenant/config`, `GET /api/tenant/health` |
| `backend/scripts/seedMasterOrganizations.js` | 2 orgs de dev                                      |
| `backend/server.js`                          | Intégration flag + middleware                      |


### Commandes

```bash
cd backend

# 1. Activer dans .env (voir .env.multi-tenant.example)
#    MULTI_TENANT=true
#    DEFAULT_ORG_SLUG=cabinet-dupont

# 2. Créer / mettre à jour les orgs en base maître
npm run seed:master-orgs

# 3. Démarrer l’API
npm run dev
```

### Organisations de développement (seed)


| Slug             | Domaines                                   | Base Mongo (suffixe)    |
| ---------------- | ------------------------------------------ | ----------------------- |
| `cabinet-dupont` | `dupont.localhost`, `www.dupont.localhost` | `tenant_cabinet_dupont` |
| `cabinet-martin` | `martin.localhost`, `www.martin.localhost` | `tenant_cabinet_martin` |


**Test local**

1. Option A — fichier `hosts` : `127.0.0.1 dupont.localhost martin.localhost`
2. Option B — en-tête : `X-Tenant-Slug: cabinet-dupont` ou `cabinet-martin`
3. Option C — `localhost` + `DEFAULT_ORG_SLUG=cabinet-dupont`

**Endpoints de test**

```http
GET /api/tenant/config
Host: dupont.localhost:3005

GET /api/health
X-Tenant-Slug: cabinet-martin
```

### Comportement si `MULTI_TENANT` absent ou `false`

Comportement **identique à avant** : un seul `mongoose.connect(MONGODB_URI)`, pas de middleware bloquant.

---

## Phase 2 — Migration des routes métier ✅ (implémentée)

### Objectif

Toutes les lectures/écritures métier passent par la connexion du cabinet courant ; JWT contient `orgId`.

### Infrastructure Phase 2


| Fichier                                        | Rôle                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| `backend/tenantModels.js`                      | Proxy `M.User`, `M.Dossier`, … → connexion tenant (ALS) |
| `backend/lib/tenant/asyncContext.js`           | `AsyncLocalStorage` + `getModel(name)`                  |
| `backend/lib/tenant/jwt.js`                    | `signAuthToken`, `assertTokenMatchesTenant`             |
| `backend/middleware/auth.js`                   | Vérifie `orgId` + `getModel('User')`                    |
| `backend/middleware/tenant.js`                 | Enveloppe chaque requête dans `runWithTenantStore`      |
| `backend/lib/tenant/runForEachActiveTenant.js` | Cron / jobs par cabinet actif                           |


### Routes migrées (`tenantModels`)

- `auth`, `otp`, `user`, `permissions`, `messages`, `notifications`, `appointments`, `creneaux`, `tasks`, `notes`, `recours`, `forum`, `contact`, `sms`, `push`, `trash`, `logs`, `temoignages`, `document-requests`, `dossierGuestUpload`, `dossierDocumentDrafts`, `pawAiPublicShare`, `sms-templates`, `sms-history`
- `**dossiers`**, `**documents`**, `**collaborativeDrafts**`, `**email**`, `**documentDownloadShare**`

### Utils migrés (cron inclus)

- `tarificationInstallmentNotifications`, `clientReminders`, `adminAgendaNotifications`, `taskDeadlineNotifications`, `emailTemplateMailer`, `pushService`
- Cron serveur : `runForEachActiveTenant` avant rappels tarification

### Plateforme (connexion legacy / pas de tenant obligatoire)

- `legal`, `judilibre`, `lexia`, `content`, `paw-search` — inchangés (`require('../models/...')` global)

### JWT

- Connexion / OTP : `signAuthToken(userId, { orgId: req.tenant?.orgId })`
- `protect` : refuse si `orgId` du token ≠ cabinet résolu par le domaine
- **Reconnecter** les utilisateurs après activation multi-tenant (anciens tokens sans `orgId`)

### Utilisation dans une nouvelle route

```js
const M = require('../tenantModels');
// dans un handler (après tenantMiddleware) :
const dossiers = await M.Dossier.find({ ... });
```

Ou : `const { getModel } = require('../lib/tenant/asyncContext');` → `getModel('Dossier')`

### Critère de sortie

- Contexte tenant par requête (ALS)
- JWT + orgId sur routes auth
- Routes métier critiques sur `tenantModels`
- Tests manuels 2 orgs (dupont / martin) : login, dossier, document sur chaque domaine

---

## Phase 3 — Fichiers & emails ✅ (implémentée)


| Fichier                                        | Rôle                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `backend/lib/tenant/uploads.js`                | Chemins `uploads/{orgId}/{subdir}`, Cloudinary `orgs/{orgId}/…`, résolution legacy |
| `backend/lib/tenant/tenantEmail.js`            | Expéditeur / clé Brevo par cabinet (ALS + `req.tenant`)                            |
| `backend/services/brevoService.js`             | Pool API par clé + `sender` / `replyTo` par appel                                  |
| `backend/utils/emailNotifications.js`          | Signature « L’équipe {branding.name} », config tenant                              |
| `backend/scripts/migrateUploadsToOrgPrefix.js` | Migration fichiers legacy → `uploads/{orgId}/`                                     |


### Livrables

- Uploads : `uploads/{orgId}/...` — `documents`, `avatars`, `messages`, `contact`, `lexia-attachments`, guest upload
- Cloudinary : dossier `cabinets/{slug}/{subdir}` (migration : `npm run migrate:cloudinary-cabinets`)
- Brevo : clé + `from` / nom d’équipe depuis `organizations.email` + `branding.name` (fallback `.env`)
- Script : `npm run migrate:uploads -- cabinet-dupont`

### Commandes

```bash
cd backend
npm run migrate:uploads -- cabinet-dupont   # une fois, si fichiers déjà en uploads/documents/ etc.
```

Configurer un cabinet en base maître :

```js
email: {
  from: 'contact@cabinet-dupont.fr',
  brevoApiKey: 'xkeysib-...',  // vide = clé globale BREVO_API_KEY
  replyTo: 'contact@cabinet-dupont.fr',
}
```

---

## Phase 4 — Frontend & domaines (2–3 semaines) ✅ (implémentée)


| Fichier                                        | Rôle                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `frontend/src/middleware.ts`                   | Transmet `x-forwarded-host` (NextAuth / SSR)           |
| `frontend/src/components/TenantProvider.tsx`   | `GET /api/tenant/config`, CSS `--primary`, logo, titre |
| `frontend/src/lib/tenant/fetchTenantConfig.ts` | Appel config tenant                                    |
| `frontend/src/lib/tenant/brandingCss.ts`       | `primaryColor` → variables CSS                         |
| `backend/lib/tenant/tenantCorsOrigins.js`      | CORS dynamique depuis `organizations.domains`          |


### Livrables

- `middleware.ts` Next
- `TenantProvider.tsx` : fetch `/api/tenant/config`, CSS variables, logo
- Landing dynamique depuis `landingPage` (page d’accueil, priorité sur CMS si défini)
- Header : nom + logo cabinet
- CORS : origines dérivées des `domains` actifs (`loadTenantCorsOrigins` au démarrage)
- NextAuth : `trustHost` + cookies **sans** `domain` (un cookie par host)
- Domaines Vercel par cabinet (config manuelle Coolify/Vercel — voir ci-dessous)

### Domaines Vercel / prod (manuel)

Pour chaque cabinet : ajouter le domaine custom dans Vercel → pointer DNS → vérifier `organizations.domains` en base maître → redémarrer l’API (refresh CORS).

Ex. : `app.cabinet-dupont.fr` → slug `cabinet-dupont`, `mongoUri` du tenant.

---

## Phase 5 — Console Ada Papers (1–2 semaines) ✅

- ✅ API `GET/POST/PATCH/DELETE /api/platform/organizations` (base maître, garde `PLATFORM_ADMIN_EMAILS` + rôle `superadmin`)
- ✅ Provisioning premier admin cabinet : `POST …/:slug/provision-admin`
- ✅ Checklist DNS / Vercel / Brevo / Cloudinary : `GET …/:slug/dns-checklist`
- ✅ UI admin : `/admin/platform/cabinets` (menu « Console Ada Papers » pour superadmins plateforme)

Variables :

```env
PLATFORM_ADMIN_EMAILS=wadepaw@gmail.com
NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS=wadepaw@gmail.com
```

---

## Phase 6 — Migration production (1–3 semaines)

- Dump Mongo actuel → URI cabinet pilote
- Fichiers → préfixe `orgId`
- Bascule DNS + rollback plan

---

## Phase 7 — Exploitation continue

- Tests auto anti-fuite cross-tenant
- Monitoring pool connexions
- Suspension `status: suspended`
- Sauvegardes par URI
- Chiffrement `mongoUri` / `brevoApiKey` en base maître

---

## Structure des dossiers (cible)

```
backend/
  lib/
    db/
      master.ts          ✅ master.js
      tenants.ts         ✅ tenants.js
      mongoUri.js        ✅
    models/
      registerTenantModels.js  ✅
    tenant/
      resolveOrganization.js   ✅
      getTenantDb.js             ✅
      uploads.js                 ✅ Phase 3
      tenantEmail.js             ✅ Phase 3
  middleware/
    tenant.js            ✅
  models/
    Organization.js      ✅
  routes/
    tenant.js            ✅
    platformOrganizations.js  ✅ Phase 5
  middleware/
    platformAdmin.js     ✅ Phase 5
  lib/platform/          ✅ organizationDto, dnsChecklist, provisionTenantAdmin
  scripts/
    seedMasterOrganizations.js  ✅

frontend/   (Phase 4 ✅)
  middleware.ts
  components/TenantProvider.tsx
  lib/tenant/
```

---

## Ajouter un nouveau cabinet (zéro déploiement)

1. Créer la base MongoDB (Atlas) + URI.
2. Insérer un document dans `organizations` (ou via console Phase 5).
3. Ajouter le domaine dans Vercel / DNS.
4. Configurer Brevo (clé + expéditeur) pour ce cabinet.

Exemple :

```js
await Organization.create({
  slug: 'nouveau-cabinet',
  domains: ['app.nouveau-cabinet.fr'],
  mongoUri: 'mongodb+srv://.../nouveau-cabinet',
  status: 'active',
  branding: { name: 'Nouveau Cabinet', logo: '', primaryColor: '#1A3D8F' },
  email: { from: 'contact@nouveau-cabinet.fr', brevoApiKey: 'xkeysib-...' },
  landingPage: { headline: 'Votre recours, simplifié.', cta: 'Déposer mon dossier' },
  limits: { maxUsers: 10, maxStorageGb: 20, modules: ['dossiers', 'messagerie'] },
})
```

---

## Ce qu’il ne faut jamais faire

- Stocker dossiers / clients / documents dans la base maître.
- Utiliser `MONGODB_URI` pour du métier tenant **après** migration sans passer par `getTenantDb(req)`.
- Une clé Brevo globale pour tous les cabinets en production multi-tenant.
- Ouvrir une nouvelle connexion Mongoose à **chaque** requête (utiliser le pool).
- Mélanger `tenantId` dans une seule DB **et** DB par cabinet (choisir un seul modèle).

---

## Estimation globale


| Phase              | Durée indicative (1 dev) |
| ------------------ | ------------------------ |
| 1 Fondations       | ✅ fait                   |
| 2 Routes / auth    | 2–4 sem.                 |
| 3 Fichiers / mail  | ✅ fait                   |
| 4 Front / domaines | 2–3 sem.                 |
| 5 Console          | 1–2 sem.                 |
| 6 Migration prod   | 1–3 sem.                 |
| **Total restant**  | **~8–14 sem.**           |


---

## Checklist « 2e cabinet en prod »

- Domaine → bon `mongoUri`
- Routes métier sur `req.tenantDb`
- JWT lié à `orgId` + domaine
- Uploads & emails scopés org
- Branding / landing par host
- Procédure doc sans redeploy

---

## Références code Phase 1

- Activation : `backend/lib/db/master.js` → `isMultiTenantEnabled()`
- Résolution : `backend/lib/tenant/resolveOrganization.js`
- Middleware : `backend/middleware/tenant.js`
- Config publique : `GET /api/tenant/config`

