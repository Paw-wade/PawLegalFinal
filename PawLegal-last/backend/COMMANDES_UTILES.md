# Commandes Utiles - Déploiement Paw Legal

## 🚀 Démarrage Rapide

```bash
# Démarrer le backend
cd /var/www/pawlegal/backend
pm2 start ecosystem.config.js

# Démarrer le frontend
cd /var/www/pawlegal/frontend
pm2 start ecosystem.config.js

# Démarrer tout
pm2 start ecosystem.config.js --cwd /var/www/pawlegal/backend
pm2 start ecosystem.config.js --cwd /var/www/pawlegal/frontend
```

## 📊 PM2 - Gestion des Applications

```bash
# Voir le statut
pm2 status

# Voir les logs
pm2 logs
pm2 logs pawlegal-backend
pm2 logs pawlegal-frontend

# Redémarrer
pm2 restart pawlegal-backend
pm2 restart pawlegal-frontend
pm2 restart all

# Arrêter
pm2 stop pawlegal-backend
pm2 stop all

# Supprimer
pm2 delete pawlegal-backend

# Monitoring en temps réel
pm2 monit

# Sauvegarder la configuration
pm2 save

# Configurer le démarrage automatique
pm2 startup
```

## 🌐 Nginx

```bash
# Tester la configuration
sudo nginx -t

# Recharger la configuration (sans interruption)
sudo nginx -s reload

# Redémarrer
sudo systemctl restart nginx

# Voir le statut
sudo systemctl status nginx

# Voir les logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/pawlegal-error.log
```

## 🔒 SSL / Let's Encrypt

```bash
# Voir les certificats
sudo certbot certificates

# Renouveler manuellement
sudo certbot renew

# Tester le renouvellement
sudo certbot renew --dry-run

# Vérifier l'auto-renouvellement
sudo systemctl status certbot.timer
```

## 🔍 Diagnostic

```bash
# Vérifier les ports ouverts (ss est préféré sur Ubuntu moderne)
sudo ss -tlnp

# Si vous préférez netstat, installez net-tools:
# sudo apt install -y net-tools
# sudo netstat -tlnp

# Vérifier les processus Node.js
ps aux | grep node

# Vérifier l'utilisation des ressources
top
htop

# Vérifier l'espace disque
df -h

# Vérifier la mémoire
free -h
```

## 📝 Logs

```bash
# Logs PM2
pm2 logs --lines 100

# Logs Nginx
sudo tail -100 /var/log/nginx/error.log
sudo tail -100 /var/log/nginx/access.log

# Logs système
sudo journalctl -u nginx -n 50
sudo journalctl -xe
```

## 🔄 Déploiement

```bash
# Utiliser le script de déploiement
cd /var/www/pawlegal
./deploy.sh all
./deploy.sh backend
./deploy.sh frontend

# Déploiement manuel backend
cd /var/www/pawlegal/backend
npm install --production
pm2 restart pawlegal-backend

# Déploiement manuel frontend
cd /var/www/pawlegal/frontend
npm install --production
npm run build
pm2 restart pawlegal-frontend
```

## 🗄️ Base de Données

```bash
# Tester la connexion MongoDB (dans le dossier backend)
cd /var/www/pawlegal/backend
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connexion MongoDB OK'))
  .catch(e => console.error('❌ Erreur:', e.message));
"
```

## 🔐 Sécurité

```bash
# Vérifier le firewall
sudo ufw status
sudo ufw status verbose

# Vérifier les permissions
ls -la /var/www/pawlegal/
ls -la /var/www/pawlegal/backend/.env
ls -la /var/www/pawlegal/frontend/.env.production

# Vérifier les variables d'environnement (sans afficher les valeurs)
cd /var/www/pawlegal/backend
cat .env | grep -v "SECRET\|PASSWORD\|URI" | head -5
```

## 🧹 Maintenance

```bash
# Nettoyer les logs anciens
find /var/www/pawlegal/backend/logs -name "*.log" -mtime +30 -delete
find /var/www/pawlegal/frontend/logs -name "*.log" -mtime +30 -delete

# Nettoyer npm cache
npm cache clean --force

# Vérifier les mises à jour système
sudo apt update
sudo apt list --upgradable

# Mettre à jour le système (attention, redémarre les services)
sudo apt upgrade -y
```

## 🧪 Tests

```bash
# Tester le backend
curl http://localhost:3005/api

# Tester le frontend
curl http://localhost:3000

# Tester via Nginx (remplacez par votre domaine)
curl -I https://votredomaine.com
curl -I https://votredomaine.com/api

# Tester avec verbose
curl -v https://votredomaine.com
```

## 📦 Sauvegarde

```bash
# Sauvegarder les fichiers
tar -czf /var/backups/pawlegal_$(date +%Y%m%d).tar.gz \
  /var/www/pawlegal/backend \
  /var/www/pawlegal/frontend \
  /etc/nginx/sites-available/pawlegal

# Sauvegarder seulement les fichiers importants (sans node_modules)
tar -czf /var/backups/pawlegal_light_$(date +%Y%m%d).tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='logs' \
  /var/www/pawlegal
```

## 🔄 Redémarrage Complet

```bash
# Redémarrer tout le système
sudo systemctl restart nginx
pm2 restart all

# Ou redémarrer le serveur (attention!)
sudo reboot
```

## 📊 Performance

```bash
# Voir l'utilisation CPU/Mémoire en temps réel
pm2 monit

# Voir les statistiques détaillées
pm2 describe pawlegal-backend
pm2 describe pawlegal-frontend

# Voir l'utilisation des ressources système
iostat -x 1
vmstat 1
```

