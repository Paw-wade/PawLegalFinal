# Routes Admin - Gestion des Utilisateurs

## Documentation des routes API pour la gestion des utilisateurs par l'admin

### Routes disponibles

#### 1. GET `/api/user/all`
**Description** : Récupérer tous les utilisateurs (Admin seulement)

**Accès** : Admin et SuperAdmin uniquement

**Headers requis** :
```
Authorization: Bearer <token>
```

**Réponse succès (200)** :
```json
{
  "success": true,
  "count": 10,
  "users": [
    {
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+33123456789",
      "role": "client",
      "profilComplete": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      ...
    }
  ]
}
```

---

#### 2. GET `/api/user/:id`
**Description** : Récupérer un utilisateur spécifique par son ID (Admin seulement)

**Accès** : Admin et SuperAdmin uniquement

**Paramètres URL** :
- `id` : ID MongoDB de l'utilisateur

**Headers requis** :
```
Authorization: Bearer <token>
```

**Réponse succès (200)** :
```json
{
  "success": true,
  "user": {
    "id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+33123456789",
    "role": "client",
    "profilComplete": true,
    "dateNaissance": "1990-01-01T00:00:00.000Z",
    "lieuNaissance": "Paris",
    "nationalite": "Française",
    "sexe": "M",
    "numeroEtranger": "...",
    "numeroTitre": "...",
    "typeTitre": "...",
    "dateDelivrance": "2020-01-01T00:00:00.000Z",
    "dateExpiration": "2025-01-01T00:00:00.000Z",
    "adressePostale": "123 Rue Example",
    "ville": "Paris",
    "codePostal": "75001",
    "pays": "France",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Réponse erreur (404)** :
```json
{
  "success": false,
  "message": "Utilisateur non trouvé"
}
```

---

#### 3. PUT `/api/user/:id`
**Description** : Mettre à jour un utilisateur par son ID (Admin seulement)

**Accès** : Admin et SuperAdmin uniquement

**Paramètres URL** :
- `id` : ID MongoDB de l'utilisateur

**Headers requis** :
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body (tous les champs sont optionnels)** :
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+33123456789",
  "role": "client",
  "dateNaissance": "1990-01-01",
  "lieuNaissance": "Paris",
  "nationalite": "Française",
  "sexe": "M",
  "numeroEtranger": "...",
  "numeroTitre": "...",
  "typeTitre": "...",
  "dateDelivrance": "2020-01-01",
  "dateExpiration": "2025-01-01",
  "adressePostale": "123 Rue Example",
  "ville": "Paris",
  "codePostal": "75001",
  "pays": "France",
  "profilComplete": true,
  "isActive": true
}
```

**Validation** :
- `firstName` : Optionnel, ne peut pas être vide si fourni
- `lastName` : Optionnel, ne peut pas être vide si fourni
- `email` : Optionnel, doit être un email valide si fourni
- `role` : Optionnel, doit être 'client', 'admin' ou 'superadmin' si fourni

**Réponse succès (200)** :
```json
{
  "success": true,
  "message": "Utilisateur mis à jour avec succès",
  "user": {
    "id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+33123456789",
    "role": "client",
    "profilComplete": true,
    "isActive": true,
    ...
  }
}
```

**Réponse erreur (400)** :
```json
{
  "success": false,
  "message": "Cet email est déjà utilisé par un autre utilisateur"
}
```

**Réponse erreur (404)** :
```json
{
  "success": false,
  "message": "Utilisateur non trouvé"
}
```

---

## Utilisation dans le frontend

### Exemple avec Axios

```typescript
import { userAPI } from '@/lib/api';

// Récupérer tous les utilisateurs
const response = await userAPI.getAllUsers();
console.log(response.data.users);

// Récupérer un utilisateur spécifique
const userResponse = await userAPI.getUserById('userId123');
console.log(userResponse.data.user);

// Mettre à jour un utilisateur
const updateResponse = await userAPI.updateUser('userId123', {
  firstName: 'John',
  lastName: 'Doe',
  role: 'admin',
  isActive: true
});
console.log(updateResponse.data.message);
```

---

## Sécurité

- Toutes les routes nécessitent une authentification (`protect` middleware)
- Seuls les admins et superadmins peuvent accéder à ces routes (`authorize` middleware)
- Le mot de passe n'est jamais retourné dans les réponses
- L'email est vérifié pour éviter les doublons lors de la modification

---

## Notes importantes

1. **Ordre des routes** : La route `/all` doit être définie avant `/:id` pour éviter les conflits
2. **Validation** : Les dates doivent être au format ISO (YYYY-MM-DD)
3. **Rôle** : Seuls les rôles 'client', 'admin' et 'superadmin' sont autorisés
4. **Email unique** : Si vous modifiez l'email, le système vérifie qu'il n'est pas déjà utilisé


