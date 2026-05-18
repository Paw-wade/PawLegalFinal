# Cabinets en développement local — URLs et séparation

Chaque cabinet a **sa propre base MongoDB** et **ses propres comptes**.  
Le même email sur deux cabinets = **deux comptes distincts** (inscription séparée sur chaque domaine).

## Variables d’environnement

| Fichier | Variable | Rôle |
|---------|----------|------|
| `backend/.env` | `MULTI_TENANT=true` | Active le multi-tenant |
| `backend/.env` | `DEFAULT_ORG_SLUG` | Cabinet utilisé sur `localhost` **sans** sous-domaine |
| `frontend/.env.local` | `NEXT_PUBLIC_DEFAULT_ORG_SLUG` | Miroir frontend (doit être aligné en dev) |

## URLs locales (frontend port 3004)

| Cabinet | Slug | URL recommandée | Base MongoDB |
|---------|------|-----------------|--------------|
| Wadepaw (legacy / défaut) | `cabinet-wadepaw` | http://localhost:3004 ou http://wadepaw.localhost:3004 | `test` (pawlegalnew) |
| Dupont (démo) | `cabinet-dupont` | http://dupont.localhost:3004 ou http://cabinet-dupont.localhost:3004 | `tenant_cabinet_dupont` |
| Martin (démo) | `cabinet-martin` | http://martin.localhost:3004 | `tenant_cabinet_martin` |

Les sous-domaines `*.localhost` fonctionnent sur Windows / macOS / Linux récents **sans** fichier `hosts`.  
Sinon, ajoutez par exemple : `127.0.0.1 dupont.localhost` dans `C:\Windows\System32\drivers\etc\hosts`.

## Connexion / inscription

1. Démarrer le backend (`PORT=3005`) et le frontend (`3004`).
2. Ouvrir l’URL du **cabinet voulu** (pas seulement `localhost` si vous testez Dupont ou Martin).
3. Créer un compte ou se connecter : les identifiants ne sont valables **que** sur ce cabinet.

Un bandeau jaune en bas de l’écran (mode dev) affiche le cabinet actif et des liens pour basculer.

## Console plateforme SaaS (multi-cabinets)

Connexion dédiée (séparée du login cabinet / client) :

- **Connexion :** http://localhost:3004/platform/signin  
- **Console :** http://localhost:3004/platform/cabinets  

Prérequis : compte `superadmin` **Ada Papers** — email `*@adapapers.fr` ou liste `PLATFORM_ADMIN_EMAILS` (ex. `wadepaw@gmail.com`). Les superadmins d’un cabinet client (Dupont, etc.) sont **exclus**.

## Vérifier le cabinet côté API

Réponse HTTP : en-têtes `x-org-slug` et `x-org-id`.

```powershell
Invoke-RestMethod -Uri "http://localhost:3005/api/tenant/config" `
  -Headers @{ "X-Tenant-Slug" = "cabinet-dupont" }
```

Login Dupont :

```powershell
Invoke-RestMethod -Uri "http://localhost:3005/api/auth/login" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "X-Tenant-Slug" = "cabinet-dupont"
  } `
  -Body '{"email":"admin@cabinet-dupont.fr","password":"Dupont2025!"}'
```

## Comptes de démo

- Dupont : voir [cabinet-dupont-comptes-demo.md](./cabinet-dupont-comptes-demo.md)
- Wadepaw : voir [cabinet-wadepaw-migration.md](./cabinet-wadepaw-migration.md)

## Erreurs fréquentes

| Symptôme | Cause probable |
|----------|----------------|
| « Identifiants incorrects » sur Dupont avec un compte Wadepaw | Compte absent de la base Dupont — inscrivez-vous sur `dupont.localhost` |
| Tout part sur Wadepaw alors que vous voulez Dupont | Vous êtes sur `localhost:3004` → `DEFAULT_ORG_SLUG=cabinet-wadepaw` |
| Google OK puis retour connexion | Compte Google inexistant sur **ce** cabinet — créer un compte sur ce domaine |
