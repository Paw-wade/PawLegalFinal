# Guide de Vérification du Déploiement Nginx

Ce guide vous aide à vérifier que votre déploiement sur Nginx fonctionne correctement.

## ✅ Checklist de Vérification

### 1. Vérifier que les services sont actifs

```bash
# Vérifier Nginx
sudo systemctl status nginx

# Vérifier PM2 (backend et frontend)
pm2 status

# Vérifier les processus Node.js
ps aux | grep node
```

### 2. Vérifier les ports

```bash
# Vérifier que les ports sont bien ouverts
sudo netstat -tlnp | grep -E ':(3000|3005|80|443)'

# Ou avec ss
sudo ss -tlnp | grep -E ':(3000|3005|80|443)'
```

### 3. Vérifier la configuration Nginx

```bash
# Tester la configuration
sudo nginx -t

# Voir la configuration active
sudo nginx -T | grep -A 50 "server_name"

# Vérifier les logs d'erreur
sudo tail -f /var/log/nginx/error.log
```

### 4. Vérifier les applications PM2

```bash
# Voir le statut détaillé
pm2 status

# Voir les logs du backend
pm2 logs pawlegal-backend --lines 50

# Voir les logs du frontend
pm2 logs pawlegal-frontend --lines 50

# Voir toutes les métriques
pm2 monit
```

### 5. Tester les endpoints

```bash
# Tester le backend directement
curl http://localhost:3005/api

# Tester le frontend directement
curl http://localhost:3000

# Tester via Nginx (remplacez par votre domaine)
curl https://votredomaine.com
curl https://votredomaine.com/api
```

### 6. Vérifier les certificats SSL

```bash
# Vérifier la date d'expiration
sudo certbot certificates

# Tester le renouvellement
sudo certbot renew --dry-run
```

---

## 🔧 Commandes Utiles pour le Déploiement

### Redémarrer les services

```bash
# Redémarrer Nginx
sudo systemctl restart nginx

# Redémarrer le backend
pm2 restart pawlegal-backend

# Redémarrer le frontend
pm2 restart pawlegal-frontend

# Redémarrer tout
pm2 restart all
```

### Voir les logs en temps réel

```bash
# Logs Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Logs PM2
pm2 logs

# Logs spécifiques
pm2 logs pawlegal-backend
pm2 logs pawlegal-frontend
```

### Vérifier les performances

```bash
# Utilisation CPU et mémoire
pm2 monit

# Statistiques PM2
pm2 list
pm2 info pawlegal-backend
pm2 info pawlegal-frontend
```

---

## 🐛 Dépannage Courant

### Problème : 502 Bad Gateway

**Causes possibles :**
- Le backend/frontend n'est pas démarré
- Le port est incorrect dans Nginx
- Problème de permissions

**Solutions :**
```bash
# Vérifier que PM2 est actif
pm2 status

# Vérifier les ports
sudo netstat -tlnp | grep -E ':(3000|3005)'

# Redémarrer les applications
pm2 restart all

# Vérifier la configuration Nginx
sudo nginx -t
```

### Problème : 404 Not Found

**Causes possibles :**
- Route non configurée dans Nginx
- Problème avec les rewrites Next.js

**Solutions :**
```bash
# Vérifier la configuration Nginx
sudo cat /etc/nginx/sites-available/pawlegal

# Vérifier les logs
sudo tail -f /var/log/nginx/error.log
```

### Problème : Erreur de connexion MongoDB

**Solutions :**
```bash
# Vérifier les variables d'environnement
cd /var/www/pawlegal/backend
cat .env | grep MONGODB_URI

# Tester la connexion
node -e "require('dotenv').config(); const mongoose = require('mongoose'); mongoose.connect(process.env.MONGODB_URI).then(() => console.log('OK')).catch(e => console.error(e))"
```

### Problème : Frontend ne se build pas

**Solutions :**
```bash
cd /var/www/pawlegal/frontend

# Vérifier les variables d'environnement
cat .env.production

# Nettoyer et rebuilder
rm -rf .next
npm run build
```

---

## 📊 Monitoring Recommandé

### Configuration PM2 pour monitoring

```bash
# Installer PM2 Plus (optionnel)
pm2 install pm2-server-monit

# Voir les métriques
pm2 monit
```

### Logs rotatifs

Créer un script pour nettoyer les anciens logs :

```bash
sudo nano /usr/local/bin/clean-pawlegal-logs.sh
```

```bash
#!/bin/bash
# Nettoyer les logs de plus de 30 jours
find /var/www/pawlegal/backend/logs -name "*.log" -mtime +30 -delete
find /var/www/pawlegal/frontend/logs -name "*.log" -mtime +30 -delete
find /var/log/nginx -name "*.log" -mtime +30 -exec truncate -s 0 {} \;
```

Ajouter au cron :
```bash
sudo crontab -e
# Ajouter:
0 3 * * * /usr/local/bin/clean-pawlegal-logs.sh
```

---

## 🔄 Mise à Jour de l'Application

### Méthode 1 : Script de déploiement

```bash
cd /var/www/pawlegal
./deploy.sh all
```

### Méthode 2 : Manuel

```bash
# Backend
cd /var/www/pawlegal/backend
git pull  # Si vous utilisez Git
npm install --production
pm2 restart pawlegal-backend

# Frontend
cd /var/www/pawlegal/frontend
git pull  # Si vous utilisez Git
npm install --production
npm run build
pm2 restart pawlegal-frontend
```

---

## 🔐 Sécurité

### Vérifications de sécurité

```bash
# Vérifier les permissions des fichiers
ls -la /var/www/pawlegal/

# Les fichiers .env ne doivent pas être accessibles publiquement
ls -la /var/www/pawlegal/backend/.env
ls -la /var/www/pawlegal/frontend/.env.production

# Vérifier le firewall
sudo ufw status

# Vérifier les ports ouverts
sudo netstat -tlnp
```

### Mise à jour de sécurité

```bash
# Mettre à jour le système
sudo apt update
sudo apt upgrade -y

# Mettre à jour Node.js si nécessaire
# Vérifier la version
node --version

# Mettre à jour npm
sudo npm install -g npm@latest
```

---

## 📝 Configuration Recommandée

### Variables d'environnement à vérifier

**Backend (.env) :**
- ✅ `PORT=3005`
- ✅ `MONGODB_URI` (valide et accessible)
- ✅ `JWT_SECRET` (long et aléatoire)
- ✅ `NODE_ENV=production`

**Frontend (.env.production) :**
- ✅ `NEXT_PUBLIC_API_URL` (URL complète avec https)
- ✅ `NEXTAUTH_URL` (URL complète avec https)
- ✅ `NEXTAUTH_SECRET` (long et aléatoire)
- ✅ `NODE_ENV=production`

### Configuration Nginx recommandée

- ✅ SSL activé (HTTPS)
- ✅ Redirection HTTP → HTTPS
- ✅ Headers de sécurité configurés
- ✅ Timeouts appropriés pour les uploads
- ✅ Cache pour les fichiers statiques

---

## 🎯 Prochaines Étapes

Une fois le déploiement vérifié :

1. **Tester toutes les fonctionnalités** :
   - Connexion admin
   - Connexion client
   - Création de compte
   - Upload de documents
   - Prise de rendez-vous

2. **Configurer les sauvegardes** :
   - Base de données MongoDB
   - Fichiers uploadés
   - Configuration serveur

3. **Mettre en place le monitoring** :
   - Alertes en cas de problème
   - Surveillance des performances
   - Logs centralisés

4. **Optimiser les performances** :
   - Cache Nginx
   - Compression gzip
   - CDN pour les assets statiques (optionnel)

---

## 📞 Support

Si vous rencontrez des problèmes :

1. Vérifiez les logs : `pm2 logs` et `sudo tail -f /var/log/nginx/error.log`
2. Vérifiez le statut : `pm2 status` et `sudo systemctl status nginx`
3. Testez les endpoints : `curl http://localhost:3005/api`
4. Vérifiez les variables d'environnement
5. Vérifiez la connectivité MongoDB


