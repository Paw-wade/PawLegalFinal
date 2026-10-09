# Cabinet Dupont — comptes de démonstration

> **Environnement de développement uniquement.**  
> Ne pas utiliser ces mots de passe en production.


| Paramètre               | Valeur                  |
| ----------------------- | ----------------------- |
| Slug tenant             | `cabinet-dupont`        |
| Base MongoDB            | `tenant_cabinet_dupont` |
| Domaine dev (optionnel) | `dupont.localhost`      |
| `DEFAULT_ORG_SLUG`      | `cabinet-dupont`        |


## Comptes


| Rôle      | Prénom Nom    | Email                             | Mot de passe  | Téléphone    |
| --------- | ------------- | --------------------------------- | ------------- | ------------ |
| Admin     | Admin Dupont  | `admin@cabinet-dupont.fr`         | `Dupont2025!` | +33600000001 |
| Juriste   | Sophie Dupont | `sophie.dupont@cabinet-dupont.fr` | `User2025!`   | +33600000002 |
| Assistant | Marc Leroy    | `marc.leroy@cabinet-dupont.fr`    | `User2025!`   | +33600000003 |


## Connexion interface web

Voir aussi [dev-local-cabinets.md](./dev-local-cabinets.md) (tous les cabinets).

1. Backend démarré (`PORT=3005`) avec `MULTI_TENANT=true`.
2. Frontend : **[http://dupont.localhost:3004/auth/signin](http://dupont.localhost:3004/auth/signin)** (recommandé).
3. Saisir l’email et le mot de passe d’un compte ci-dessus.

> Sur `http://localhost:3004` sans sous-domaine, c’est `DEFAULT_ORG_SLUG` (souvent `cabinet-wadepaw`) qui s’applique — pas Dupont.

## Connexion API (PowerShell)

```powershell
Invoke-RestMethod -Uri "http://localhost:3005/api/auth/login" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "X-Tenant-Slug" = "cabinet-dupont"
  } `
  -Body '{"email":"admin@cabinet-dupont.fr","password":"Dupont2025!"}'
```

Sur `localhost`, l’en-tête `X-Tenant-Slug` est optionnel si `DEFAULT_ORG_SLUG=cabinet-dupont` est défini.

## Réinitialiser les comptes

Depuis le dossier `backend/` :

```bash
npm run seed:tenants
# ou
npm run fix:demo-login
```

Puis redémarrer le serveur backend.

## Création initiale

```bash
npm run seed:master-orgs
npm run seed:tenants
```

