# Variables d'environnement par cabinet

Ce fichier documente les variables optionnelles a ajouter dans `backend/.env`
pour configurer chaque cabinet avec sa propre base MongoDB et son propre stockage R2.

## Correction requise (MASTER DB)

Commenter ou supprimer la ligne suivante dans `.env` :
```
# MASTER_MONGODB_URI=...   <- supprimer cette ligne
```
Garder uniquement :
```
MULTI_TENANT=true
MASTER_DB_NAME=adapapers_master
```
Le code utilisera alors le meme cluster Atlas que MONGODB_URI avec la base adapapers_master.

---

## MongoDB par cabinet

Si chaque cabinet utilise son propre cluster Atlas, definir ces variables.
Sans ces variables, le code derive l'URI depuis MONGODB_URI + nom de base.

```env
# Cabinet Wadepaw (legacy)
TENANT_WADEPAW_MONGODB_URI=
TENANT_WADEPAW_DB_NAME=test

# Cabinet Dupont
TENANT_DUPONT_MONGODB_URI=
TENANT_DUPONT_DB_NAME=tenant_cabinet_dupont

# Cabinet Martin
TENANT_MARTIN_MONGODB_URI=
TENANT_MARTIN_DB_NAME=tenant_cabinet_martin
```

---

## Cloudflare R2 par cabinet

Ces credentials sont stockes en base (Organization.storage), pas en variables d'env.
Renseigner via le script d'administration ou directement dans MongoDB (collection organizations de adapapers_master).

Structure du champ `storage` d'un document Organization :
```json
{
  "provider": "cloudflare",
  "endpoint": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
  "bucket": "<NOM_DU_BUCKET>",
  "accountId": "<CLOUDFLARE_ACCOUNT_ID>",
  "accessKeyId": "<R2_ACCESS_KEY_ID>",
  "secretAccessKey": "<R2_SECRET_ACCESS_KEY>",
  "publicUrl": "https://<CUSTOM_DOMAIN_OR_R2_PUBLIC_URL>"
}
```

Exemple pour mettre a jour via MongoDB Compass ou Atlas :
```js
db.organizations.updateOne(
  { slug: "cabinet-dupont" },
  { $set: { storage: {
    provider: "cloudflare",
    endpoint: "https://ACCOUNT_ID.r2.cloudflarestorage.com",
    bucket: "cabinet-dupont-docs",
    accountId: "ACCOUNT_ID",
    accessKeyId: "KEY",
    secretAccessKey: "SECRET",
    publicUrl: "https://docs.cabinet-dupont.fr"
  }}}
)
```

Apres modification, redemarrer le backend pour vider le cache de resolution de tenant.

---

## Lancer les seeds (apres configuration du .env)

```bash
cd backend

# 1. Cree les organisations dans la base maitre (adapapers_master)
npm run seed:master-orgs

# 2. Cree les comptes de demo dans chaque base tenant
npm run seed:tenants

# 3. (Si Wadepaw a une URI separee)
npm run seed:wadepaw-org
```

---

## Google OAuth multi-tenant

Un seul Google OAuth App couvre tous les cabinets.
Dans la Google Console, l'URI de redirection autorisee est :
  http://localhost:3004/api/auth/callback/google  (dev)
  https://www.adapapers.fr/api/auth/callback/google  (prod)

Le tenant est transmis via l'en-tete X-Tenant-Slug dans le handler next-auth.
Les cookies next-auth sont configures avec domain=.localhost en dev pour que
la connexion fonctionne depuis n'importe quel sous-domaine (dupont.localhost, etc.).
