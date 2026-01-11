# Guide de Déploiement Rapide - VPS OVH

## 🚀 Déploiement en 5 étapes

### 1. Préparation du serveur (5 minutes)

```bash
# Connexion SSH
ssh root@VOTRE_IP

# Mise à jour
sudo apt update && sudo apt upgrade -y

# Installation Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# Installation PM2
sudo npm install -g pm2

# Configuration firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Transfert des fichiers (10 minutes)

```bash
# Sur votre machine locale, compresser le projet
tar -czf pawlegal.tar.gz backend/ frontend/

# Transférer sur le serveur
scp pawlegal.tar.gz root@VOTRE_IP:/var/www/

# Sur le serveur
cd /var/www
tar -xzf pawlegal.tar.gz
mv backend pawlegal/
mv frontend pawlegal/
```

### 3. Configuration Backend (5 minutes)

```bash
cd /var/www/pawlegal/backend

# Créer .env
nano .env
# Ajouter:
# PORT=3005
# MONGODB_URI=votre_connection_string
# JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Installer et démarrer
npm install --production
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
```

### 4. Configuration Frontend (10 minutes)

```bash
cd /var/www/pawlegal/frontend

# Créer .env.production
nano .env.production
# Ajouter:
# NEXT_PUBLIC_API_URL=https://votredomaine.com/api
# NEXTAUTH_URL=https://votredomaine.com
# NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Build et démarrer
npm install --production
npm run build
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
```

### 5. Configuration Nginx + SSL (10 minutes)

```bash
# Copier la configuration
sudo cp /var/www/pawlegal/nginx-pawlegal.conf /etc/nginx/sites-available/pawlegal

# Éditer et remplacer votredomaine.com
sudo nano /etc/nginx/sites-available/pawlegal

# Activer
sudo ln -s /etc/nginx/sites-available/pawlegal /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Obtenir le certificat SSL
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d votredomaine.com -d www.votredomaine.com
```

## ✅ Vérification

```bash
# Vérifier PM2
pm2 status

# Vérifier Nginx
sudo systemctl status nginx

# Vérifier les logs
pm2 logs
```

## 🔄 Mise à jour

```bash
cd /var/www/pawlegal
./deploy.sh all
```

## 📝 Fichiers créés

- `GUIDE_DEPLOIEMENT_OVH.md` - Guide complet détaillé
- `ecosystem.config.js` - Configuration PM2 pour le backend
- `frontend/ecosystem.config.js` - Configuration PM2 pour le frontend
- `deploy.sh` - Script de déploiement automatisé
- `nginx-pawlegal.conf` - Configuration Nginx

## ⚠️ Important

1. Remplacez `votredomaine.com` par votre vrai domaine partout
2. Configurez MongoDB Atlas avec l'IP de votre serveur
3. Générez des secrets sécurisés pour JWT_SECRET et NEXTAUTH_SECRET
4. Testez en local avant de déployer en production


