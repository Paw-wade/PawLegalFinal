# 🚀 Guide de démarrage — Ada Papers

Ce guide vous explique comment lancer le site (frontend et backend) à chaque fois que vous rallumez votre machine.

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir installé :
- **Node.js** (version 18 ou supérieure)
- **npm** (généralement inclus avec Node.js)
- **MongoDB Atlas** (compte configuré avec IP whitelistée)

## 🔧 Configuration Initiale (Une seule fois)

### 1. Installer les dépendances du backend

```bash
npm install
```

### 2. Installer les dépendances du frontend

```bash
cd frontend
npm install
cd ..
```

### 3. Vérifier le fichier `.env`

Assurez-vous que le fichier `.env` à la racine du projet contient :

```
MONGODB_URI=mongodb+srv://paw:BVFy4FC8Of5hBIn@pawlegalnew.zeenzkp.mongodb.net/
PORT=3005
JWT_SECRET=your-secret-key-change-this-in-production
```

## 🎯 Démarrage Rapide (À chaque redémarrage)

### Option 1 : Utiliser les scripts PowerShell (Recommandé)

#### Windows PowerShell :

1. Ouvrez PowerShell dans le dossier du projet
2. Exécutez le script de démarrage :

```powershell
.\start.ps1
```

Ce script va :
- Démarrer le backend sur le port 3005
- Démarrer le frontend sur le port 3000
- Ouvrir automatiquement votre navigateur

### Option 2 : Démarrage Manuel

#### Étape 1 : Démarrer le Backend

Ouvrez un **premier terminal** et exécutez :

```bash
npm start
```

Vous devriez voir :
```
✅ MongoDB connecté : ...
🚀 Serveur démarré sur le port 3005
```

#### Étape 2 : Démarrer le Frontend

Ouvrez un **deuxième terminal** et exécutez :

```bash
cd frontend
npm run dev
```

Vous devriez voir :
```
- ready started server on 0.0.0.0:3000
- Local: http://localhost:3000
```

#### Étape 3 : Accéder au site

Ouvrez votre navigateur et allez sur :
- **Frontend** : http://localhost:3000
- **Backend API** : http://localhost:3005

## 🛑 Arrêter les serveurs

Pour arrêter les serveurs :
- Appuyez sur `Ctrl + C` dans chaque terminal
- Ou fermez simplement les fenêtres de terminal

## 🔍 Vérification

### Vérifier que le backend fonctionne

Ouvrez votre navigateur et allez sur :
```
http://localhost:3005/
```

Vous devriez voir :
```json
{
  "success": true,
  "message": "API Ada Papers est en ligne",
  "version": "1.0.0"
}
```

### Vérifier que le frontend fonctionne

Ouvrez votre navigateur et allez sur :
```
http://localhost:3000
```

Vous devriez voir la page d'accueil du site.

## ⚠️ Problèmes Courants

### Erreur : Port déjà utilisé

Si vous voyez `EADDRINUSE: address already in use :::3005` :

1. Trouvez le processus qui utilise le port :
   ```powershell
   netstat -ano | findstr :3005
   ```

2. Tuez le processus (remplacez PID par le numéro trouvé) :
   ```powershell
   taskkill /PID <PID> /F
   ```

3. Relancez le serveur

### Erreur : MongoDB non connecté

Si vous voyez une erreur de connexion MongoDB :

1. Vérifiez que votre IP est whitelistée sur MongoDB Atlas
2. Vérifiez que le fichier `.env` contient la bonne `MONGODB_URI`
3. Vérifiez votre connexion internet

### Erreur : Module non trouvé

Si vous voyez `Cannot find module '...'` :

1. Réinstallez les dépendances :
   ```bash
   # Backend
   npm install
   
   # Frontend
   cd frontend
   npm install
   ```

## 📝 Commandes Utiles

### Backend

```bash
# Démarrer en mode développement (avec rechargement automatique)
npm run dev

# Démarrer en mode production
npm start

# Créer un compte administrateur
npm run create-admin

# Exécuter le seed de la base de données
npm run seed
```

### Frontend

```bash
# Démarrer le serveur de développement
npm run dev

# Construire pour la production
npm run build

# Démarrer en mode production
npm start

# Vérifier le code (linting)
npm run lint
```

## 🔐 Créer un compte administrateur

Pour créer un compte administrateur :

```bash
npm run create-admin
```

Suivez les instructions à l'écran pour entrer :
- Prénom
- Nom
- Email
- Mot de passe (min 8 caractères)
- Téléphone (optionnel)

## 📁 Structure du Projet

```
PawLegal New/
├── frontend/          # Application Next.js
│   ├── src/
│   ├── package.json
│   └── ...
├── models/            # Modèles MongoDB
├── routes/            # Routes API
├── middleware/        # Middleware Express
├── scripts/           # Scripts utilitaires
├── server.js          # Serveur Express
├── package.json       # Dépendances backend
└── .env              # Variables d'environnement
```

## 🆘 Besoin d'aide ?

Si vous rencontrez des problèmes :
1. Vérifiez que tous les prérequis sont installés
2. Vérifiez que les ports 3000 et 3005 ne sont pas utilisés
3. Vérifiez que MongoDB Atlas est accessible
4. Consultez les logs dans les terminaux pour plus de détails

---

**Bon développement ! 🎉**



