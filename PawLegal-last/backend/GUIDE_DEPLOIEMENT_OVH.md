# Guide de Déploiement sur VPS OVH

Ce guide vous explique comment déployer l'application Paw Legal (backend Node.js + frontend Next.js) sur un serveur VPS OVH.

## 📋 Prérequis

- Un VPS OVH avec Ubuntu 20.04 ou 22.04
- Accès SSH au serveur
- Un nom de domaine pointant vers l'IP du serveur (optionnel mais recommandé)
- MongoDB Atlas (recommandé) ou MongoDB installé sur le serveur

---

## 🔧 Étape 1 : Préparation du Serveur

### 1.1 Connexion SSH

```bash
ssh root@VOTRE_IP_SERVEUR
# ou
ssh utilisateur@VOTRE_IP_SERVEUR
```

### 1.2 Mise à jour du système

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.3 Installation des dépendances de base

```bash
# Installation de Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Vérification
node --version
npm --version

# Installation de Git
sudo apt install -y git

# Installation de Nginx
sudo apt install -y nginx

# Installation de PM2 (gestionnaire de processus)
sudo npm install -g pm2

# Installation de Certbot (pour SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### 1.4 Configuration du Firewall

```bash
# Installation d'UFW si pas déjà installé
sudo apt install -y ufw

# Autoriser SSH
sudo ufw allow 22/tcp

# Autoriser HTTP et HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Activer le firewall
sudo ufw enable

# Vérifier le statut
sudo ufw status
```

---

## 📦 Étape 2 : Déploiement du Backend

### 2.1 Cloner ou transférer le code

```bash
# Créer un répertoire pour l'application
sudo mkdir -p /var/www/pawlegal
cd /var/www/pawlegal

# Option 1 : Cloner depuis Git
sudo git clone https://github.com/VOTRE_REPO/pawlegal-backend.git backend
cd backend

# Option 2 : Transférer les fichiers via SCP depuis votre machine locale
# Sur votre machine locale :
# scp -r backend/ root@VOTRE_IP:/var/www/pawlegal/
```

### 2.2 Installation des dépendances

```bash
cd /var/www/pawlegal/backend
sudo npm install --production
```

### 2.3 Configuration des variables d'environnement

```bash
# Créer le fichier .env
sudo nano .env
```

Contenu du fichier `.env` :

```env
# Port du serveur
PORT=3005

# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/pawlegal?retryWrites=true&w=majority

# JWT Secret (générez une clé aléatoire)
JWT_SECRET=votre_secret_jwt_tres_long_et_aleatoire_ici

# Environnement
NODE_ENV=production
```

Générer un JWT_SECRET sécurisé :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2.4 Créer le répertoire pour les uploads

```bash
sudo mkdir -p /var/www/pawlegal/backend/uploads/messages
sudo mkdir -p /var/www/pawlegal/backend/uploads/documents
sudo chown -R $USER:$USER /var/www/pawlegal/backend/uploads
```

### 2.5 Tester le backend

```bash
# Tester que le serveur démarre
node server.js

# Si tout fonctionne, arrêter avec Ctrl+C
```

### 2.6 Configuration PM2

```bash
# Créer un fichier de configuration PM2
sudo nano /var/www/pawlegal/backend/ecosystem.config.js
```

Contenu :

```javascript
module.exports = {
  apps: [{
    name: 'pawlegal-backend',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3005
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
```

Créer le répertoire des logs :
```bash
sudo mkdir -p /var/www/pawlegal/backend/logs
```

Démarrer avec PM2 :
```bash
cd /var/www/pawlegal/backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Vérifier le statut :
```bash
pm2 status
pm2 logs pawlegal-backend
```

---

## 🎨 Étape 3 : Déploiement du Frontend

### 3.1 Transférer le code frontend

```bash
cd /var/www/pawlegal

# Option 1 : Cloner depuis Git
sudo git clone https://github.com/VOTRE_REPO/pawlegal-frontend.git frontend
cd frontend

# Option 2 : Transférer via SCP
# Sur votre machine locale :
# scp -r frontend/ root@VOTRE_IP:/var/www/pawlegal/
```

### 3.2 Installation des dépendances

```bash
cd /var/www/pawlegal/frontend
sudo npm install --production
```

### 3.3 Configuration des variables d'environnement

```bash
sudo nano .env.production
```

Contenu :

```env
# URL de l'API backend
NEXT_PUBLIC_API_URL=https://api.votredomaine.com/api

# NextAuth
NEXTAUTH_URL=https://votredomaine.com
NEXTAUTH_SECRET=votre_secret_nextauth_tres_long_et_aleatoire_ici

# Environnement
NODE_ENV=production
```

Générer un NEXTAUTH_SECRET :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3.4 Build de l'application Next.js

```bash
cd /var/www/pawlegal/frontend
sudo npm run build
```

### 3.5 Configuration PM2 pour le frontend

```bash
sudo nano /var/www/pawlegal/frontend/ecosystem.config.js
```

Contenu :

```javascript
module.exports = {
  apps: [{
    name: 'pawlegal-frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
```

Créer le répertoire des logs :
```bash
sudo mkdir -p /var/www/pawlegal/frontend/logs
```

Démarrer avec PM2 :
```bash
cd /var/www/pawlegal/frontend
pm2 start ecosystem.config.js
pm2 save
```

---

## 🌐 Étape 4 : Configuration Nginx

### 4.1 Créer la configuration Nginx

```bash
sudo nano /etc/nginx/sites-available/pawlegal
```

Contenu (remplacez `votredomaine.com` par votre domaine) :

```nginx
# Redirection HTTP vers HTTPS
server {
    listen 80;
    server_name votredomaine.com www.votredomaine.com;
    return 301 https://$server_name$request_uri;
}

# Configuration HTTPS pour le frontend
server {
    listen 443 ssl http2;
    server_name votredomaine.com www.votredomaine.com;

    # Certificats SSL (seront générés par Certbot)
    ssl_certificate /etc/letsencrypt/live/votredomaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votredomaine.com/privkey.pem;

    # Configuration SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logs
    access_log /var/log/nginx/pawlegal-access.log;
    error_log /var/log/nginx/pawlegal-error.log;

    # Frontend Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:3005/api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Fichiers statiques
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}

# Configuration pour l'API (si vous voulez un sous-domaine séparé)
# server {
#     listen 443 ssl http2;
#     server_name api.votredomaine.com;
#
#     ssl_certificate /etc/letsencrypt/live/api.votredomaine.com/fullchain.pem;
#     ssl_certificate_key /etc/letsencrypt/live/api.votredomaine.com/privkey.pem;
#
#     location / {
#         proxy_pass http://localhost:3005;
#         proxy_http_version 1.1;
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#     }
# }
```

### 4.2 Activer la configuration

```bash
# Créer le lien symbolique
sudo ln -s /etc/nginx/sites-available/pawlegal /etc/nginx/sites-enabled/

# Supprimer la configuration par défaut
sudo rm /etc/nginx/sites-enabled/default

# Tester la configuration
sudo nginx -t

# Redémarrer Nginx
sudo systemctl restart nginx
```

---

## 🔒 Étape 5 : Configuration SSL avec Let's Encrypt

### 5.1 Obtenir le certificat SSL

```bash
# Pour le domaine principal
sudo certbot --nginx -d votredomaine.com -d www.votredomaine.com

# Suivez les instructions à l'écran
# Certbot configurera automatiquement Nginx
```

### 5.2 Renouvellement automatique

Let's Encrypt expire après 90 jours. Le renouvellement est automatique, mais vous pouvez tester :

```bash
# Tester le renouvellement
sudo certbot renew --dry-run

# Vérifier l'auto-renouvellement
sudo systemctl status certbot.timer
```

---

## 🔄 Étape 6 : Scripts de Déploiement

### 6.1 Script de déploiement backend

```bash
sudo nano /var/www/pawlegal/deploy-backend.sh
```

Contenu :

```bash
#!/bin/bash

echo "🚀 Déploiement du backend Paw Legal..."

cd /var/www/pawlegal/backend

# Sauvegarder les logs
echo "📦 Sauvegarde des logs..."
cp -r logs logs_backup_$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Pull des dernières modifications (si Git)
# git pull origin main

# Installation des dépendances
echo "📥 Installation des dépendances..."
npm install --production

# Redémarrer avec PM2
echo "🔄 Redémarrage de l'application..."
pm2 restart pawlegal-backend

# Vérifier le statut
pm2 status pawlegal-backend

echo "✅ Déploiement terminé !"
```

Rendre exécutable :
```bash
sudo chmod +x /var/www/pawlegal/deploy-backend.sh
```

### 6.2 Script de déploiement frontend

```bash
sudo nano /var/www/pawlegal/deploy-frontend.sh
```

Contenu :

```bash
#!/bin/bash

echo "🚀 Déploiement du frontend Paw Legal..."

cd /var/www/pawlegal/frontend

# Sauvegarder les logs
echo "📦 Sauvegarde des logs..."
cp -r logs logs_backup_$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Pull des dernières modifications (si Git)
# git pull origin main

# Installation des dépendances
echo "📥 Installation des dépendances..."
npm install --production

# Build de l'application
echo "🔨 Build de l'application..."
npm run build

# Redémarrer avec PM2
echo "🔄 Redémarrage de l'application..."
pm2 restart pawlegal-frontend

# Vérifier le statut
pm2 status pawlegal-frontend

echo "✅ Déploiement terminé !"
```

Rendre exécutable :
```bash
sudo chmod +x /var/www/pawlegal/deploy-frontend.sh
```

---

## 📊 Étape 7 : Monitoring et Maintenance

### 7.1 Commandes PM2 utiles

```bash
# Voir le statut de toutes les applications
pm2 status

# Voir les logs en temps réel
pm2 logs

# Voir les logs d'une application spécifique
pm2 logs pawlegal-backend
pm2 logs pawlegal-frontend

# Redémarrer une application
pm2 restart pawlegal-backend
pm2 restart pawlegal-frontend

# Arrêter une application
pm2 stop pawlegal-backend

# Supprimer une application
pm2 delete pawlegal-backend

# Monitoring en temps réel
pm2 monit
```

### 7.2 Configuration PM2 pour le monitoring

```bash
# Installer PM2 Plus (optionnel, pour monitoring avancé)
pm2 install pm2-server-monit
```

### 7.3 Sauvegarde automatique

Créer un script de sauvegarde :

```bash
sudo nano /var/www/pawlegal/backup.sh
```

Contenu :

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/pawlegal"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Sauvegarder les fichiers
tar -czf $BACKUP_DIR/pawlegal_$DATE.tar.gz \
    /var/www/pawlegal/backend \
    /var/www/pawlegal/frontend \
    /etc/nginx/sites-available/pawlegal

# Garder seulement les 7 dernières sauvegardes
find $BACKUP_DIR -name "pawlegal_*.tar.gz" -mtime +7 -delete

echo "✅ Sauvegarde créée : pawlegal_$DATE.tar.gz"
```

Ajouter au cron pour exécution quotidienne :
```bash
sudo crontab -e
```

Ajouter :
```
0 2 * * * /var/www/pawlegal/backup.sh
```

---

## 🔧 Étape 8 : Configuration MongoDB

### Option A : MongoDB Atlas (Recommandé)

1. Créer un cluster sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Configurer les accès réseau pour autoriser l'IP de votre serveur
3. Créer un utilisateur avec les permissions nécessaires
4. Utiliser la connection string dans votre `.env`

### Option B : MongoDB sur le serveur

```bash
# Installation de MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org

# Démarrer MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Configuration de sécurité
sudo nano /etc/mongod.conf
# Décommenter et configurer :
# security:
#   authorization: enabled
```

---

## 🚨 Dépannage

### Problème : Le backend ne démarre pas

```bash
# Vérifier les logs
pm2 logs pawlegal-backend

# Vérifier les variables d'environnement
cd /var/www/pawlegal/backend
cat .env

# Tester manuellement
node server.js
```

### Problème : Le frontend ne se build pas

```bash
# Vérifier les erreurs de build
cd /var/www/pawlegal/frontend
npm run build

# Vérifier les variables d'environnement
cat .env.production
```

### Problème : Nginx ne fonctionne pas

```bash
# Vérifier la configuration
sudo nginx -t

# Vérifier les logs
sudo tail -f /var/log/nginx/error.log

# Redémarrer Nginx
sudo systemctl restart nginx
```

### Problème : Certificat SSL expiré

```bash
# Renouveler manuellement
sudo certbot renew

# Redémarrer Nginx
sudo systemctl restart nginx
```

---

## 📝 Checklist de Déploiement

- [ ] Serveur VPS configuré avec Ubuntu
- [ ] Node.js et npm installés
- [ ] Git installé
- [ ] Nginx installé et configuré
- [ ] PM2 installé
- [ ] Firewall configuré (ports 22, 80, 443)
- [ ] Backend déployé et fonctionnel
- [ ] Frontend déployé et fonctionnel
- [ ] Variables d'environnement configurées
- [ ] MongoDB connecté (Atlas ou local)
- [ ] SSL configuré avec Let's Encrypt
- [ ] PM2 configuré pour démarrage automatique
- [ ] Scripts de déploiement créés
- [ ] Sauvegardes automatiques configurées
- [ ] Monitoring en place

---

## 🔗 Ressources Utiles

- [Documentation OVH](https://docs.ovh.com/)
- [Documentation PM2](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Documentation Nginx](https://nginx.org/en/docs/)
- [Documentation Let's Encrypt](https://letsencrypt.org/docs/)
- [Documentation Next.js Deployment](https://nextjs.org/docs/deployment)

---

## 📞 Support

En cas de problème, vérifiez :
1. Les logs PM2 : `pm2 logs`
2. Les logs Nginx : `sudo tail -f /var/log/nginx/error.log`
3. Les logs système : `sudo journalctl -u nginx`
4. La connectivité MongoDB
5. Les variables d'environnement

---

**Note importante** : Remplacez tous les `votredomaine.com` par votre vrai nom de domaine dans les configurations.


