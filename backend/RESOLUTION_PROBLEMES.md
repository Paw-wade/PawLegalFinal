# 🔧 Résolution des Problèmes

## ✅ Problèmes Résolus

### 1. Conflit de Dépendances ESLint

**Problème :**
- `eslint-config-next@16.0.7` nécessite `eslint>=9.0.0`
- Mais `eslint@8.56.0` était installé
- Conflit de dépendances peer

**Solution :**
- ✅ Rétrogradé `eslint-config-next` de `^16.0.7` à `^14.1.0` (compatible avec Next.js 14)
- ✅ Réinstallé les dépendances avec `npm install --legacy-peer-deps`

### 2. Port 3005 Déjà Utilisé

**Problème :**
```
Error: listen EADDRINUSE: address already in use :::3005
```

**Solution :**
- ✅ Arrêté le processus qui utilisait le port 3005
- ✅ Le serveur peut maintenant démarrer normalement

### 3. Package.json Manquant

**Problème :**
- npm ne trouvait pas le `package.json` dans certains cas

**Solution :**
- ✅ Vérifié que les fichiers `package.json` existent :
  - `package.json` (racine - backend)
  - `frontend/package.json` (frontend)

## 📋 Commandes Utiles

### Pour Réinstaller les Dépendances Frontend

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

**Windows PowerShell :**
```powershell
cd frontend
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install --legacy-peer-deps
```

### Pour Arrêter un Processus sur un Port

**Windows PowerShell :**
```powershell
# Trouver le processus
Get-NetTCPConnection -LocalPort 3005 | Select-Object -ExpandProperty OwningProcess

# Arrêter le processus (remplacez PID par le numéro)
Stop-Process -Id <PID> -Force
```

**Ou utiliser le script :**
```powershell
.\stop.ps1
```

### Pour Démarrer les Serveurs

**Option 1 : Script automatique**
```powershell
.\start.ps1
```

**Option 2 : Manuel**
```bash
# Terminal 1 - Backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## ⚠️ Notes Importantes

### Dépendances ESLint

Si vous rencontrez encore des problèmes avec ESLint :

1. **Utiliser --legacy-peer-deps** pour ignorer les conflits :
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Ou mettre à jour ESLint** (peut nécessiter des changements) :
   ```bash
   npm install eslint@^9.0.0 --save-dev
   ```

### Versions Compatibles

Pour Next.js 14 :
- `eslint`: `^8.56.0`
- `eslint-config-next`: `^14.1.0`
- `next`: `^14.1.0`

## 🔍 Vérification

### Vérifier que tout fonctionne

1. **Backend :**
   ```bash
   npm start
   ```
   Devrait afficher :
   ```
   ✅ MongoDB connecté : ...
   🚀 Serveur démarré sur le port 3005
   ```

2. **Frontend :**
   ```bash
   cd frontend
   npm run dev
   ```
   Devrait afficher :
   ```
   - ready started server on 0.0.0.0:3000
   - Local: http://localhost:3000
   ```

3. **Tester l'API :**
   ```
   http://localhost:3005/
   ```
   Devrait retourner :
   ```json
   {
     "success": true,
     "message": "API Cabinet Juridique est en ligne",
     "version": "1.0.0"
   }
   ```

4. **Tester le Frontend :**
   ```
   http://localhost:3000
   ```
   Devrait afficher la page d'accueil

## 📝 Structure des Fichiers

```
PawLegal New/
├── package.json              # Backend
├── server.js
├── .env
├── frontend/
│   ├── package.json          # Frontend
│   ├── next.config.js
│   ├── tsconfig.json
│   └── src/
│       └── ...
```

## 🆘 Si les Problèmes Persistent

1. **Nettoyer complètement :**
   ```bash
   # Backend
   rm -rf node_modules package-lock.json
   npm install

   # Frontend
   cd frontend
   rm -rf node_modules package-lock.json .next
   npm install --legacy-peer-deps
   ```

2. **Vérifier les versions de Node.js :**
   ```bash
   node --version  # Devrait être >= 18.0.0
   npm --version   # Devrait être >= 9.0.0
   ```

3. **Vérifier les variables d'environnement :**
   - `.env` existe à la racine
   - `frontend/.env.local` existe

---

**Tous les problèmes ont été résolus ! 🎉**



