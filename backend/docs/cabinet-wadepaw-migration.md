# Cabinet Wadepaw (legacy) — migration multi-tenant

Conservation des données production sur le cluster d’origine :

`mongodb+srv://ablaye:***@pawlegalnew.zeenzkp.mongodb.net/test?retryWrites=true&w=majority&appName=Pawlegalnew`

> Les données production sont dans la base MongoDB nommée **`test`** sur ce cluster (17 dossiers, `wadepaw@gmail.com` superadmin).  
> Une URI sans segment `/base` se connecte aussi à `test` par défaut.

Compte historique : **wadepaw@gmail.com** (superadmin) — vérifier aussi `wadepaw@mail.com`.

## Étape 1 — Organisation en base maître ✅

```bash
cd backend
npm run seed:wadepaw-org
```

Crée ou met à jour `organizations` :

| Champ | Valeur |
|-------|--------|
| `slug` | `cabinet-wadepaw` |
| `mongoUri` | URI legacy (`.env` → `TENANT_WADEPAW_MONGODB_URI`) |
| `domains` | `wadepaw.localhost`, … |
| `status` | `active` |

Inclus aussi dans `npm run seed:master-orgs` si `TENANT_WADEPAW_MONGODB_URI` est défini.

## Étape 2 — Utiliser ce cabinet (à faire)

1. **Cibler le tenant** (une des options) :
   - `DEFAULT_ORG_SLUG=cabinet-wadepaw` dans `.env` pour `localhost`
   - En-tête API : `X-Tenant-Slug: cabinet-wadepaw`
   - Domaine : `http://wadepaw.localhost:3004` (+ entrée `hosts`)

2. **Connexion** : email / mot de passe existants (inchangés en base legacy).

3. **JWT** : se reconnecter après activation multi-tenant (`orgId` dans le token).

## Variables `.env`

```env
TENANT_WADEPAW_DB_NAME=test
TENANT_WADEPAW_MONGODB_URI=mongodb+srv://ablaye:Pawlegal25@pawlegalnew.zeenzkp.mongodb.net/test?retryWrites=true&w=majority&appName=Pawlegalnew
```

Ne pas utiliser `/pawlegal` : les dossiers sont dans la base **`test`**, pas `pawlegal`.

## Vérification

Le script `seed:wadepaw-org` affiche le nombre de **dossiers** et confirme si un compte legacy est trouvé.

```powershell
Invoke-RestMethod -Uri "http://localhost:3005/api/tenant/health" `
  -Headers @{ "X-Tenant-Slug" = "cabinet-wadepaw" }
```
