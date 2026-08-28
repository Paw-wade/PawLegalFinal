# CLAUDE.md — PawLegal / Ada Papers

Plateforme SaaS pour cabinet juridique spécialisé en **droit des étrangers** (OQTF, titres
de séjour, recours visa). Monorepo : un front-end Next.js, un back-end Express/MongoDB, et un
moteur de recherche juridique Python distinct.

## Architecture

| Brique | Dossier | Stack | Port dev |
|---|---|---|---|
| Front-end | `frontend/` | Next.js 16 (App Router), React 18, TypeScript, Tailwind, next-auth | **3004** |
| Back-end | `backend/` | Node.js/Express, MongoDB (Mongoose), CommonJS | **3005** |
| Recherche juridique | `justicelibre/` | Python (scraping Légifrance/CJUE/CEDH/DILA) — **projet séparé** | — |

- **Base de données** : MongoDB **Atlas** (cloud), pas de mongod local requis.
- **Multi-tenant** : plusieurs cabinets par slug (base maître `organizations` + une base par
  tenant). En local sans sous-domaine, tout utilise `DEFAULT_ORG_SLUG` (voir
  `backend/docs/dev-local-cabinets.md`). Cabinets de test : wadepaw, dupont, martin
  (`http://dupont.localhost:3004`, etc.).

## Lancer en local

```bash
# Back-end (port 3005) — nodemon
cd backend && npm run dev

# Front-end (port 3004) — Next dev (webpack)
cd frontend && npm run dev
```

- Front : http://localhost:3004 · API : http://localhost:3005
- Les `.env` (`backend/.env`, `frontend/.env.local`) sont déjà renseignés — **ne pas commiter**.
- Libérer un port bloqué : `npm run kill-port` (défini dans chaque `package.json`).

## Back-end — repères

- Point d'entrée : `backend/server.js` (CORS via `utils/frontendOrigins`, connexion Mongo,
  démarrage en mode dégradé si `MONGODB_URI` manquant).
- Routes : `backend/routes/*.js` (~35). Modèles Mongoose : `backend/models/*.js` (~35).
- Intégrations : **Anthropic SDK** (assistant « Lexia »), **AWS S3** + Cloudinary (documents),
  **Twilio / Dexchange / Brevo** (SMS + email), **web-push**, Google Calendar.
- Déploiement : VPS/OVH via **PM2** (`ecosystem.config.js`) + nginx (`nginx-pawlegal.conf`).

## Front-end — repères

- App Router sous `frontend/src/app/` : espaces `admin/` (back-office cabinet),
  `client/` (espace client), et pages publiques (forum, lexia, calculateur, depot-dossier…).
- Auth : **next-auth** ; appels API via axios (`NEXT_PUBLIC_API_URL`).
- Déploiement : **Cloudflare Workers** via OpenNext (`open-next.config.ts`, `wrangler.jsonc`).
  Un `vercel.json` existe également.

## Messagerie interne (chantier en cours)

- Modèle : `backend/models/MessageInterne.js` (expéditeur/destinataire, threads, pièces
  jointes, lu/archivé, lié à un dossier). Route : `backend/routes/messages.js` (upload multer,
  10 Mo/fichier). Il existe aussi un modèle `Message.js` distinct.
- UI : `frontend/src/app/admin/messages/` et `frontend/src/app/client/messages/`.

## Git

- Remote `origin` → `github.com/Paw-wade/PawLegalFinal` (le SaaS).
- Remote `justicelibre` → `github.com/Dahliyaal/justicelibre` (moteur Python).
- Branche de travail : `main`. Autres : `pre-deploy` (16 commits locaux non poussés),
  `multi-tenant`, `saas-landing`, `feature/Saasmultitenant`.

## À savoir / dettes

- `PawLegal-last/` (dossier imbriqué à la racine) est une **ancienne copie** (pas un dépôt Git) —
  résidu à nettoyer après confirmation.
- `backend/passwords_backup.txt` traîne dans le dossier — vérifier qu'il n'est pas commité.
