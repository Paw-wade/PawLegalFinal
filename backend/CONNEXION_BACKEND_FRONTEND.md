# 🔗 Connexion Backend - Frontend

## ✅ Configuration Effectuée

### 1. Fichiers de Configuration Créés

#### Backend (Port 3005)
- ✅ `server.js` - Serveur Express configuré
- ✅ `.env` - Variables d'environnement backend
- ✅ Routes API configurées (`/api/auth`, `/api/user`, `/api/contact`)

#### Frontend
- ✅ `frontend/src/lib/api.ts` - Client API avec Axios (pour Next.js)
- ✅ `frontend/src/utils/api.ts` - Client API avec Axios (pour Vite/React)
- ✅ `frontend/src/lib/config.ts` - Configuration centralisée
- ✅ `frontend/.env.local` - Variables d'environnement frontend (Next.js)
- ✅ `frontend/.env` - Variables d'environnement frontend (Vite)

### 2. Configuration de l'URL API

L'URL de l'API backend est configurée pour pointer vers :
```
http://localhost:3005/api
```

**Pour Next.js :**
- Variable d'environnement : `NEXT_PUBLIC_API_URL`
- Fichier : `frontend/.env.local`

**Pour Vite/React :**
- Variable d'environnement : `VITE_API_URL`
- Fichier : `frontend/.env`

### 3. Authentification

#### NextAuth (Next.js)
- ✅ Configuration dans `frontend/src/app/api/auth/[...nextauth]/route.ts`
- ✅ Connexion au backend via `/api/auth/login`
- ✅ Gestion du token JWT

#### Stockage du Token
- Le token est stocké dans `localStorage` après connexion
- Ajout automatique du header `Authorization: Bearer <token>` dans les requêtes

## 🚀 Utilisation

### Dans les Composants React/Next.js

```typescript
import api, { authAPI, userAPI, contactAPI } from '@/lib/api';

// Exemple : Connexion
const handleLogin = async (email: string, password: string) => {
  try {
    const response = await authAPI.login({ email, password });
    const { token, user } = response.data;
    
    // Stocker le token
    localStorage.setItem('token', token);
    
    // Rediriger
    router.push('/client');
  } catch (error) {
    console.error('Erreur de connexion:', error);
  }
};

// Exemple : Récupérer le profil
const getProfile = async () => {
  try {
    const response = await userAPI.getProfile();
    return response.data.user;
  } catch (error) {
    console.error('Erreur:', error);
  }
};

// Exemple : Envoyer un message de contact
const sendContact = async (formData) => {
  try {
    const response = await contactAPI.sendMessage(formData);
    return response.data;
  } catch (error) {
    console.error('Erreur:', error);
  }
};
```

### Utilisation Directe avec Axios

```typescript
import api from '@/lib/api';

// Requête GET
const data = await api.get('/user/profile');

// Requête POST
const result = await api.post('/auth/register', {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  password: 'password123'
});
```

## 🔧 Configuration CORS

Le backend accepte **plusieurs origines** via `FRONTEND_URL` (liste séparée par des **virgules**, sans espace superflu) :

```bash
# Exemple Render / production
FRONTEND_URL=https://www.adapapers.fr,https://adapapers.fr,https://adapapers.vercel.app
```

- La **première** URL sert aussi de base pour les liens dans les e-mails (reset mot de passe), sauf si vous définissez **`PUBLIC_APP_URL`** (URL canonique unique pour les mails).
- Variable alternative : **`CORS_ORIGINS`** (si `FRONTEND_URL` n’est pas défini).

En local, la valeur par défaut inclut `http://localhost:3000` et `http://localhost:3004`.

## 📝 Endpoints Disponibles

### Authentification
- `POST /api/auth/register` - Créer un compte
- `POST /api/auth/login` - Se connecter
- `POST /api/auth/forgot-password` - Mot de passe oublié
- `GET /api/auth/me` - Récupérer l'utilisateur connecté (nécessite token)

### Utilisateur
- `GET /api/user/profile` - Récupérer le profil (nécessite token)
- `PUT /api/user/profile` - Mettre à jour le profil (nécessite token)
- `PUT /api/user/password` - Changer le mot de passe (nécessite token)

### Contact
- `POST /api/contact` - Envoyer un message de contact

## 🔍 Vérification de la Connexion

### Test 1 : Vérifier que le backend répond

```bash
curl http://localhost:3005/
```

Réponse attendue :
```json
{
  "success": true,
  "message": "API Cabinet Juridique est en ligne",
  "version": "1.0.0"
}
```

### Test 2 : Tester l'inscription

```bash
curl -X POST http://localhost:3005/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Test 3 : Tester la connexion

```bash
curl -X POST http://localhost:3005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## ⚠️ Problèmes Courants

### Erreur CORS

Si vous voyez une erreur CORS :
1. Vérifiez que le backend est démarré sur le port 3005
2. Vérifiez que `cors()` est bien configuré dans `server.js`
3. Vérifiez l'URL dans les variables d'environnement

### Erreur 401 (Non autorisé)

Si vous voyez une erreur 401 :
1. Vérifiez que le token est bien stocké dans `localStorage`
2. Vérifiez que le header `Authorization` est bien ajouté
3. Vérifiez que le token n'a pas expiré

### Erreur de connexion

Si le frontend ne peut pas se connecter au backend :
1. Vérifiez que le backend est démarré : `npm start`
2. Vérifiez l'URL dans `.env` ou `.env.local`
3. Vérifiez que les ports ne sont pas bloqués par un firewall

## 🎯 Prochaines Étapes

1. ✅ Backend et Frontend connectés
2. ⏭️ Créer les pages d'authentification (signup, signin)
3. ⏭️ Créer les pages client
4. ⏭️ Créer le panneau d'administration
5. ⏭️ Ajouter la gestion des dossiers et documents

---

**La connexion backend-frontend est maintenant configurée ! 🎉**



