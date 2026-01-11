# Diagnostic - Backend non accessible sur le port 3005

## 🔍 Étapes de Diagnostic

### 1. Vérifier si le backend est démarré

```bash
# Vérifier PM2
pm2 status

# Vérifier les processus Node.js
ps aux | grep node

# Vérifier si le port 3005 est utilisé
sudo ss -tlnp | grep 3005
# ou installer net-tools si vous préférez netstat
# sudo apt install net-tools
# sudo netstat -tlnp | grep 3005
```

### 2. Vérifier les logs

```bash
# Si PM2 est utilisé
pm2 logs pawlegal-backend --lines 50

# Si le backend est dans un répertoire spécifique
cd /var/www/pawlegal/backend
# ou
cd ~/pawlegal/backend
cat logs/err.log
cat logs/out.log
```

### 3. Vérifier la configuration

```bash
# Vérifier le fichier .env
cd /var/www/pawlegal/backend
# ou le chemin où se trouve votre backend
cat .env

# Vérifier que PORT=3005 est bien défini
grep PORT .env
```

### 4. Tester manuellement

```bash
# Aller dans le répertoire du backend
cd /var/www/pawlegal/backend
# ou le chemin où se trouve votre backend

# Tester le démarrage manuel
node server.js

# Si ça fonctionne, vous verrez un message de démarrage
# Arrêtez avec Ctrl+C
```

---

## 🔧 Solutions selon le problème

### Problème 1 : Backend pas démarré avec PM2

**Solution :**
```bash
# Aller dans le répertoire backend
cd /var/www/pawlegal/backend
# ou votre chemin

# Démarrer avec PM2
pm2 start ecosystem.config.js
# ou
pm2 start server.js --name pawlegal-backend

# Sauvegarder la configuration
pm2 save

# Vérifier
pm2 status
```

### Problème 2 : Backend crash au démarrage

**Vérifier les logs :**
```bash
pm2 logs pawlegal-backend --lines 100
```

**Causes possibles :**
- MongoDB non connecté
- Variables d'environnement manquantes
- Erreur dans le code

**Solution :**
```bash
# Vérifier MongoDB
cd /var/www/pawlegal/backend
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => { console.log('✅ MongoDB OK'); process.exit(0); })
  .catch(e => { console.error('❌ MongoDB:', e.message); process.exit(1); });
"

# Vérifier les variables d'environnement
cat .env | grep -E "PORT|MONGODB_URI|JWT_SECRET"
```

### Problème 3 : Port déjà utilisé

```bash
# Vérifier ce qui utilise le port 3005
sudo ss -tlnp | grep 3005
# ou avec lsof (si installé)
# sudo lsof -i :3005

# Tuer le processus si nécessaire
sudo kill -9 <PID>
```

### Problème 4 : Backend écoute sur une autre interface

**Vérifier dans server.js :**
```bash
cd /var/www/pawlegal/backend
grep -n "listen\|PORT" server.js
```

Le serveur doit écouter sur `0.0.0.0` ou `localhost`, pas seulement sur une IP spécifique.

---

## 🚀 Démarrage Complet du Backend

### Méthode 1 : Avec PM2 (Recommandé)

```bash
# Aller dans le répertoire backend
cd /var/www/pawlegal/backend
# ou votre chemin

# Vérifier que ecosystem.config.js existe
ls -la ecosystem.config.js

# Si le fichier n'existe pas, créer un démarrage simple
pm2 start server.js --name pawlegal-backend --env production

# Ou utiliser ecosystem.config.js
pm2 start ecosystem.config.js

# Sauvegarder
pm2 save

# Configurer le démarrage automatique
pm2 startup
# Suivre les instructions affichées

# Vérifier
pm2 status
pm2 logs pawlegal-backend
```

### Méthode 2 : Vérifier le fichier server.js

```bash
cd /var/www/pawlegal/backend
cat server.js | grep -A 5 "listen\|PORT"
```

Le code devrait ressembler à :
```javascript
const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
```

---

## 📝 Checklist de Vérification

Exécutez ces commandes dans l'ordre :

```bash
# 1. Vérifier où se trouve le backend
find /var/www -name "server.js" 2>/dev/null
find ~ -name "server.js" 2>/dev/null

# 2. Aller dans le répertoire
cd /chemin/vers/backend

# 3. Vérifier .env
cat .env

# 4. Vérifier les dépendances
ls node_modules | head -5

# 5. Tester manuellement
node server.js
# Si ça fonctionne, vous verrez: "Serveur démarré sur le port 3005"
# Arrêtez avec Ctrl+C

# 6. Démarrer avec PM2
pm2 start server.js --name pawlegal-backend
pm2 save

# 7. Vérifier
pm2 status
curl http://localhost:3005/api
```

---

## 🔍 Commandes de Diagnostic Complètes

```bash
# Script de diagnostic complet
echo "=== Vérification Backend ==="
echo ""
echo "1. Processus Node.js:"
ps aux | grep node | grep -v grep
echo ""
echo "2. Port 3005:"
sudo ss -tlnp | grep 3005 || echo "Port 3005 non utilisé"
echo ""
echo "3. PM2 Status:"
pm2 list
echo ""
echo "4. Variables d'environnement:"
if [ -f "/var/www/pawlegal/backend/.env" ]; then
    echo "Fichier .env trouvé"
    grep PORT /var/www/pawlegal/backend/.env || echo "PORT non défini"
else
    echo "Fichier .env non trouvé dans /var/www/pawlegal/backend/"
fi
echo ""
echo "5. Test de connexion:"
curl -v http://localhost:3005/api 2>&1 | head -10
```

