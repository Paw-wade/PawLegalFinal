# Solution Définitive pour le Port 3005

## Problème
L'erreur `EADDRINUSE: address already in use :::3005` se produit lorsque le port 3005 est déjà utilisé par un autre processus.

## Solutions Automatiques

### 1. Détection et Libération Automatique
Le serveur détecte maintenant automatiquement si le port 3005 est utilisé et tente de le libérer avant de démarrer.

### 2. Script de Libération de Port
Un script `scripts/kill-port.js` a été créé pour libérer manuellement le port :

```bash
# Libérer le port 3005
node scripts/kill-port.js 3005

# Ou via npm
npm run kill-port
```

### 3. Script de Démarrage Propre
Utilisez le script de démarrage qui libère automatiquement le port :

```bash
# Via npm (recommandé)
npm run start:clean

# Via PowerShell
.\start.ps1

# Via Batch
start.bat
```

## Solutions Manuelles

### Windows (PowerShell)
```powershell
# Trouver le processus utilisant le port 3005
netstat -ano | findstr :3005

# Tuer le processus (remplacez PID par le numéro trouvé)
taskkill /F /PID <PID>
```

### Windows (CMD)
```cmd
# Trouver le processus
netstat -ano | findstr :3005

# Tuer le processus
taskkill /F /PID <PID>
```

### Linux/Mac
```bash
# Trouver le processus
lsof -ti:3005

# Tuer le processus
kill -9 $(lsof -ti:3005)
```

## Prévention

### 1. Toujours utiliser les scripts de démarrage
Utilisez `start.ps1` ou `start.bat` qui gèrent automatiquement la libération des ports.

### 2. Arrêter proprement les serveurs
Utilisez `stop.ps1` pour arrêter tous les serveurs avant de redémarrer.

### 3. Vérifier avant de démarrer
Le serveur vérifie maintenant automatiquement si le port est disponible et le libère si nécessaire.

## Fonctionnalités Ajoutées

1. **Détection automatique** : Le serveur détecte si le port est utilisé
2. **Libération automatique** : Tentative automatique de libérer le port
3. **Script dédié** : `scripts/kill-port.js` pour libérer manuellement
4. **Scripts améliorés** : `start.ps1` et `start.bat` libèrent automatiquement les ports
5. **Messages d'erreur clairs** : Instructions précises en cas d'échec

## Commandes Utiles

```bash
# Démarrer avec libération automatique du port
npm run start:clean

# Libérer manuellement le port 3005
npm run kill-port

# Ou directement
node scripts/kill-port.js 3005

# Arrêter tous les serveurs
.\stop.ps1
```

## Notes

- Le script `kill-port.js` fonctionne sur Windows, Linux et Mac
- La libération automatique attend 1 seconde après avoir tué le processus
- Si la libération automatique échoue, des instructions sont affichées
- Vous pouvez toujours utiliser un autre port en définissant `PORT` dans `.env`


