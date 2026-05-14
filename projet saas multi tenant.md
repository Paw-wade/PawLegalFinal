# Ada Papers — Prompt Cursor : architecture multi-tenant

## Contexte du projet

Tu travailles sur **Ada Papers**, une application SaaS de gestion de dossiers juridiques (recours, documents, messagerie, rendez-vous, tarification).

L'objectif est de transformer l'application en **plateforme multi-tenant** : un seul déploiement (Vercel + Coolify) qui sert plusieurs cabinets, chacun avec sa propre base de données MongoDB isolée, son propre domaine, son branding et ses intégrations.

**Stack technique actuelle :**
- Backend : Node.js / Express (ou Next.js API routes)
- Base de données : MongoDB avec Mongoose
- Frontend : Next.js
- Déploiement : Coolify (backend) + Vercel (frontend)
- Email : Brevo (Sendinblue)
- Auth : JWT

---

## Modèle d'architecture cible

### Principe fondamental

Quand une requête arrive, l'app lit le `hostname` entrant, interroge la **base maître** pour charger la config du bon cabinet, puis connecte toutes les requêtes suivantes à la **base MongoDB dédiée** de ce cabinet.

Aucune donnée ne traverse entre cabinets. Zéro redéploiement pour ajouter un nouveau cabinet.

### Base maître (collection `organizations`)

```ts
interface Organization {
  _id: ObjectId
  slug: string                    // ex: "cabinet-dupont"
  domain: string                  // ex: "app.cabinetdupont.fr"
  mongoUri: string                // URI Atlas dédiée à ce cabinet
  status: "trial" | "active" | "suspended"
  branding: {
    name: string                  // ex: "Cabinet Dupont"
    logo: string                  // URL CDN
    primaryColor: string          // ex: "#2A4DD0"
    favicon?: string
  }
  email: {
    from: string                  // ex: "contact@cabinetdupont.fr"
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
    modules: string[]             // ex: ["dossiers", "messagerie", "lexia"]
  }
  createdAt: Date
}
```

### Middleware de routage tenant (à créer)

Fichier : `middleware/tenant.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMasterDb } from '@/lib/db/master'
import { getTenantConnection } from '@/lib/db/tenants'

export async function tenantMiddleware(req: NextRequest) {
  const hostname = req.headers.get('host') ?? ''
  const masterDb = await getMasterDb()
  
  const org = await masterDb
    .collection('organizations')
    .findOne({ domain: hostname, status: 'active' })

  if (!org) {
    return NextResponse.json({ error: 'Cabinet introuvable' }, { status: 404 })
  }

  // Injecter l'org dans les headers pour les route handlers
  const res = NextResponse.next()
  res.headers.set('x-org-id', org._id.toString())
  res.headers.set('x-org-slug', org.slug)
  return res
}
```

### Gestionnaire de connexions MongoDB (pool par tenant)

Fichier : `lib/db/tenants.ts`

```ts
import mongoose from 'mongoose'

const connections: Map<string, mongoose.Connection> = new Map()

export async function getTenantConnection(mongoUri: string, orgId: string) {
  if (connections.has(orgId)) {
    return connections.get(orgId)!
  }
  const conn = await mongoose.createConnection(mongoUri).asPromise()
  connections.set(orgId, conn)
  return conn
}
```

---

## Règles absolues à respecter

1. **Jamais de requête sans filtre tenant.** Toute lecture/écriture en base doit passer par la connexion du tenant actif, jamais par une connexion globale.

2. **La base maître ne contient que la config des organisations.** Aucune donnée métier (dossiers, clients, documents) ne doit s'y trouver.

3. **Un pool de connexions par cabinet.** Ne pas ouvrir une nouvelle connexion Mongoose à chaque requête — réutiliser les connexions en cache.

4. **Les fichiers uploadés sont préfixés par orgId.** Format : `uploads/{orgId}/{filename}`. Jamais de fichier partagé entre cabinets.

5. **Les clés API (Brevo, Google) sont par cabinet.** Jamais une clé globale pour tous.

6. **Les emails transactionnels utilisent le `from` du cabinet.** Ne jamais envoyer depuis une adresse Ada Papers à un client d'un autre cabinet.

7. **Les tokens JWT incluent l'orgId.** Un token ne peut pas être réutilisé sur le domaine d'un autre cabinet.

---

## Structure des dossiers à créer/modifier

```
lib/
  db/
    master.ts          ← connexion à la base maître
    tenants.ts         ← pool de connexions par cabinet
  tenant.ts            ← helper pour lire l'org depuis req headers
  branding.ts          ← charger le branding du cabinet actif

middleware/
  tenant.ts            ← middleware Next.js de routage

models/
  organization.ts      ← schéma Mongoose pour la base maître

app/
  api/
    [tous les endpoints existants]  ← ajouter getTenantDb() en tête

components/
  TenantProvider.tsx   ← context React avec branding + config cabinet
```

---

## Tâches à implémenter dans l'ordre

### Étape 1 — Base maître et connexion
- [ ] Créer `lib/db/master.ts` avec connexion singleton à la base maître
- [ ] Créer le schéma `Organization` dans `models/organization.ts`
- [ ] Créer `lib/db/tenants.ts` avec pool de connexions par `orgId`

### Étape 2 — Middleware de routage
- [ ] Créer `middleware/tenant.ts` qui lit le hostname et charge l'org
- [ ] Injecter `x-org-id` dans les headers de chaque requête
- [ ] Retourner 404 si le domaine n'est pas dans la base maître

### Étape 3 — Adapter les route handlers
- [ ] Créer helper `lib/tenant.ts` → `getTenantDb(req)` qui retourne la connexion du bon cabinet
- [ ] Remplacer tous les `await mongoose.connect(...)` par `await getTenantDb(req)`
- [ ] Vérifier que chaque endpoint utilise bien la connexion tenant

### Étape 4 — Branding dynamique
- [ ] Créer `components/TenantProvider.tsx` avec un context React
- [ ] Charger `branding`, `landingPage`, `email` depuis l'API au démarrage
- [ ] Injecter les CSS variables (`--primary-color`, etc.) dans le `<head>`
- [ ] Landing page dynamique : lire `org.landingPage` pour afficher headline/CTA

### Étape 5 — Fichiers et emails
- [ ] Préfixer tous les uploads par `orgId` : `uploads/${orgId}/...`
- [ ] Adapter l'envoi Brevo pour utiliser `org.email.brevoApiKey` et `org.email.from`

### Étape 6 — Auth
- [ ] Ajouter `orgId` dans le payload JWT à la connexion
- [ ] Vérifier que `orgId` dans le token correspond au domaine de la requête

### Étape 7 — Console admin Ada Papers
- [ ] Route `/admin` protégée par un superadmin Ada Papers
- [ ] CRUD sur la collection `organizations`
- [ ] Formulaire : créer un nouveau cabinet (slug, domain, mongoUri, branding, email)

---

## Comportement attendu pour chaque nouvelle requête

```
1. Requête → hostname lu par le middleware
2. Middleware → cherche l'org dans la base maître
3. Org trouvée → connexion tenant chargée depuis le pool
4. Route handler → toutes les queries tapent dans la base du cabinet
5. Réponse → données du bon cabinet, jamais mélangées
```

---

## Pour ajouter un nouveau cabinet (zéro déploiement)

Insérer un document dans la collection `organizations` de la base maître :

```js
await masterDb.collection('organizations').insertOne({
  slug: 'nouveau-cabinet',
  domain: 'app.nouveau-cabinet.fr',
  mongoUri: 'mongodb+srv://user:pass@cluster.mongodb.net/nouveau-cabinet',
  status: 'active',
  branding: {
    name: 'Nouveau Cabinet',
    logo: 'https://cdn.example.com/logo.png',
    primaryColor: '#1A3D8F'
  },
  email: {
    from: 'contact@nouveau-cabinet.fr',
    brevoApiKey: 'xkeysib-...'
  },
  landingPage: {
    headline: 'Votre recours, simplifié.',
    cta: 'Déposer mon dossier'
  },
  limits: {
    maxUsers: 10,
    maxStorageGb: 20,
    modules: ['dossiers', 'messagerie', 'documents']
  },
  createdAt: new Date()
})
```

Puis ajouter le domaine dans les settings Vercel. C'est tout.

---

## Ce que tu ne dois jamais faire

- Utiliser `process.env.MONGODB_URI` directement dans les route handlers (c'est la base maître, pas la base du cabinet)
- Faire une requête Mongoose sans avoir appelé `getTenantDb(req)` d'abord
- Stocker des données métier dans la base maître
- Utiliser une seule clé Brevo pour tous les cabinets
- Créer une nouvelle connexion Mongoose à chaque requête (utiliser le pool)