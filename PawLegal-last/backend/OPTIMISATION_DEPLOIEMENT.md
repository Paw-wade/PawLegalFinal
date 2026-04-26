# Optimisation du Déploiement Nginx Existant

Ce guide vous aide à optimiser et vérifier votre déploiement Nginx existant pour Paw Legal.

## 🔍 Vérification Rapide

### Script de vérification automatique

```bash
# Rendre le script exécutable
chmod +x check-deployment.sh

# Exécuter la vérification
./check-deployment.sh
```

### Vérification manuelle

```bash
# 1. Vérifier que tout fonctionne
pm2 status
sudo systemctl status nginx

# 2. Tester les endpoints
curl http://localhost:3005/api
curl http://localhost:3000

# 3. Vérifier les logs
pm2 logs --lines 20
sudo tail -20 /var/log/nginx/error.log
```

---

## ⚙️ Optimisations Recommandées

### 1. Optimisation Nginx pour Next.js

Ajoutez ces optimisations à votre configuration Nginx :

```nginx
# Dans votre fichier /etc/nginx/sites-available/pawlegal

# Compression gzip
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

# Cache pour les fichiers statiques
location /_next/static {
    proxy_pass http://localhost:3000;
    proxy_cache_valid 200 60m;
    add_header Cache-Control "public, immutable";
    expires 1y;
}

# Cache pour les images
location ~* \.(jpg|jpeg|png|gif|ico|svg|webp)$ {
    proxy_pass http://localhost:3000;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 2. Optimisation PM2

Vérifiez que votre `ecosystem.config.js` inclut :

```javascript
{
  max_memory_restart: '1G',  // Redémarrer si > 1GB
  min_uptime: '10s',         // Temps minimum avant redémarrage
  max_restarts: 10,          // Max 10 redémarrages
  autorestart: true
}
```

### 3. Variables d'environnement de production

Vérifiez que vous utilisez les bonnes variables :

**Backend** (`/var/www/pawlegal/backend/.env`) :
```env
NODE_ENV=production
PORT=3005
```

**Frontend** (`/var/www/pawlegal/frontend/.env.production`) :
```env
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://votredomaine.com
NEXTAUTH_URL=https://votredomaine.com
```

---

## 🔒 Sécurité

### Headers de sécurité Nginx

Ajoutez ces headers dans votre configuration Nginx :

```nginx
# Headers de sécurité
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### Protection des fichiers sensibles

```nginx
# Bloquer l'accès aux fichiers .env
location ~ /\.env {
    deny all;
    return 404;
}

# Bloquer l'accès aux fichiers de configuration
location ~ /(ecosystem\.config\.js|package\.json|\.git) {
    deny all;
    return 404;
}
```

---

## 📊 Monitoring

### Configuration PM2 pour monitoring avancé

```bash
# Installer les modules PM2 utiles
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### Surveillance des performances

```bash
# Voir les métriques en temps réel
pm2 monit

# Voir les statistiques détaillées
pm2 describe pawlegal-backend
pm2 describe pawlegal-frontend
```

---

## 🔄 Mise à Jour

### Processus de mise à jour sécurisé

```bash
# 1. Sauvegarder avant mise à jour
cd /var/www/pawlegal
tar -czf ../backup_$(date +%Y%m%d).tar.gz backend/ frontend/

# 2. Mettre à jour le backend
cd backend
# git pull  # Si vous utilisez Git
npm install --production
pm2 restart pawlegal-backend

# 3. Mettre à jour le frontend
cd ../frontend
# git pull  # Si vous utilisez Git
npm install --production
npm run build
pm2 restart pawlegal-frontend

# 4. Vérifier que tout fonctionne
pm2 status
curl http://localhost:3005/api
curl http://localhost:3000
```

---

## 🐛 Dépannage

### Problèmes courants et solutions

#### Backend ne répond pas

```bash
# Vérifier les logs
pm2 logs pawlegal-backend --lines 50

# Vérifier le port
sudo netstat -tlnp | grep 3005

# Redémarrer
pm2 restart pawlegal-backend

# Vérifier les variables d'environnement
cd /var/www/pawlegal/backend
cat .env
```

#### Frontend ne se build pas

```bash
# Nettoyer et rebuilder
cd /var/www/pawlegal/frontend
rm -rf .next node_modules
npm install --production
npm run build
```

#### Erreur 502 Bad Gateway

```bash
# Vérifier que les applications sont actives
pm2 status

# Vérifier la configuration Nginx
sudo nginx -t

# Vérifier les logs Nginx
sudo tail -f /var/log/nginx/error.log
```

#### Erreur de connexion MongoDB

```bash
# Tester la connexion
cd /var/www/pawlegal/backend
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ OK'))
  .catch(e => console.error('❌', e.message));
"

# Vérifier l'IP whitelist sur MongoDB Atlas
```

---

## 📈 Performance

### Optimisations de performance

1. **Activer le cache Nginx** pour les fichiers statiques
2. **Compression gzip** activée
3. **PM2 cluster mode** (optionnel, pour plusieurs instances)

```javascript
// Dans ecosystem.config.js, pour le backend
{
  instances: 2,  // 2 instances
  exec_mode: 'cluster'  // Mode cluster
}
```

### Monitoring des performances

```bash
# Voir l'utilisation CPU/Mémoire
pm2 monit

# Voir les statistiques système
top
htop

# Voir l'utilisation disque
df -h
du -sh /var/www/pawlegal/*
```

---

## 🔐 Maintenance

### Nettoyage régulier

```bash
# Nettoyer les logs anciens (à ajouter au cron)
find /var/www/pawlegal/*/logs -name "*.log" -mtime +30 -delete

# Nettoyer npm cache
npm cache clean --force

# Nettoyer les builds Next.js anciens (si vous gardez plusieurs builds)
cd /var/www/pawlegal/frontend
ls -la .next
```

### Sauvegardes automatiques

Créer un script de sauvegarde quotidienne :

```bash
sudo nano /usr/local/bin/backup-pawlegal.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/pawlegal"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Sauvegarder les fichiers (sans node_modules)
tar -czf $BACKUP_DIR/pawlegal_$DATE.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='logs' \
  /var/www/pawlegal

# Garder seulement les 7 dernières sauvegardes
find $BACKUP_DIR -name "pawlegal_*.tar.gz" -mtime +7 -delete

echo "✅ Sauvegarde créée: pawlegal_$DATE.tar.gz"
```

Ajouter au cron :
```bash
sudo crontab -e
# Ajouter:
0 2 * * * /usr/local/bin/backup-pawlegal.sh
```

---

## ✅ Checklist de Vérification

- [ ] Nginx fonctionne : `sudo systemctl status nginx`
- [ ] PM2 applications actives : `pm2 status`
- [ ] Backend répond : `curl http://localhost:3005/api`
- [ ] Frontend répond : `curl http://localhost:3000`
- [ ] SSL configuré : `sudo certbot certificates`
- [ ] Variables d'environnement configurées
- [ ] MongoDB connecté
- [ ] Logs accessibles : `pm2 logs`
- [ ] Firewall configuré : `sudo ufw status`
- [ ] Sauvegardes configurées
- [ ] Monitoring en place

---

## 📞 Commandes Rapides

```bash
# Redémarrer tout
pm2 restart all && sudo systemctl restart nginx

# Voir les logs
pm2 logs && sudo tail -f /var/log/nginx/error.log

# Vérifier le statut
pm2 status && sudo systemctl status nginx

# Tester les endpoints
curl http://localhost:3005/api && curl http://localhost:3000
```

---

**Note** : Adaptez ces configurations à votre environnement spécifique. Testez toujours les changements dans un environnement de staging avant la production.


