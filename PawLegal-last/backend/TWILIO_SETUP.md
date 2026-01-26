# Configuration Twilio pour l'envoi de SMS

Ce guide explique comment configurer Twilio pour l'envoi de SMS dans l'application.

## Prérequis

1. Un compte Twilio (gratuit pour les tests) : https://www.twilio.com/try-twilio
2. Un numéro de téléphone Twilio (fourni lors de l'inscription)

## Configuration

### 1. Obtenir vos identifiants Twilio

1. Connectez-vous à votre console Twilio : https://console.twilio.com/
2. Sur le tableau de bord, vous trouverez :
   - **Account SID** : Identifiant unique de votre compte
   - **Auth Token** : Token d'authentification (cliquez sur "View" pour le révéler)
   - **Phone Number** : Votre numéro Twilio (format : +33612345678)

### 2. Configurer les variables d'environnement

Ajoutez les variables suivantes dans votre fichier `.env` :

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+33612345678
```

**Important** : 
- Remplacez les valeurs par vos propres identifiants Twilio
- Le numéro de téléphone doit être au format E.164 (commence par + suivi du code pays)

### 3. Mode Test vs Production

#### Mode Test (Sandbox)
- Gratuit
- Limité aux numéros vérifiés dans votre console Twilio
- Parfait pour les tests et le développement

#### Mode Production
- Nécessite un compte payant
- Permet d'envoyer des SMS à n'importe quel numéro
- Coûts variables selon le pays de destination

## Utilisation de l'API

### Routes disponibles

#### 1. Envoyer un SMS simple
```http
POST /api/sms/send
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "to": "+33612345678",
  "message": "Votre message SMS ici"
}
```

#### 2. Envoyer un SMS de notification
```http
POST /api/sms/notification
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "to": "+33612345678",
  "type": "appointment_confirmed",
  "data": {
    "name": "Jean Dupont",
    "date": "lundi 15 janvier 2024",
    "time": "14:30"
  }
}
```

Types de notifications disponibles :
- `appointment_confirmed` : Confirmation de rendez-vous
- `appointment_reminder` : Rappel de rendez-vous
- `appointment_cancelled` : Annulation de rendez-vous
- `dossier_updated` : Mise à jour de dossier
- `document_uploaded` : Document ajouté
- `message_received` : Nouveau message

#### 3. Envoyer un SMS en masse
```http
POST /api/sms/bulk
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "recipients": [
    { "phone": "+33612345678", "name": "Jean Dupont" },
    { "phone": "+33687654321", "name": "Marie Martin" }
  ],
  "message": "Message pour tous les destinataires"
}
```

#### 4. Formater un numéro de téléphone
```http
POST /api/sms/format-phone
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "0612345678"
}
```

## Intégration automatique

L'API Twilio est automatiquement intégrée dans les fonctionnalités suivantes :

### Rendez-vous
- **Confirmation** : Un SMS est envoyé automatiquement quand un rendez-vous est confirmé
- **Annulation** : Un SMS est envoyé automatiquement quand un rendez-vous est annulé

### Format des numéros

Le service formate automatiquement les numéros de téléphone :
- `0612345678` → `+33612345678` (France)
- `+33612345678` → `+33612345678` (déjà formaté)
- `06 12 34 56 78` → `+33612345678` (espaces supprimés)

## Gestion des erreurs

### Erreurs communes

1. **21211 - Invalid 'To' Phone Number**
   - Le numéro de téléphone fourni est invalide
   - Vérifiez le format du numéro

2. **21608 - Unverified Phone Number**
   - En mode test, vous ne pouvez envoyer des SMS qu'aux numéros vérifiés
   - Ajoutez le numéro dans votre console Twilio ou passez en mode production

3. **21408 - Permission Denied**
   - Vous n'avez pas la permission d'envoyer des SMS à ce numéro
   - Vérifiez les restrictions de votre compte Twilio

### Logs

Tous les envois de SMS sont journalisés dans la base de données :
- Action : `send_sms`, `send_notification_sms`, `send_bulk_sms`
- Métadonnées : numéro, message, statut Twilio, SID

## Sécurité

- Seuls les administrateurs (`admin`, `superadmin`) peuvent envoyer des SMS
- Toutes les actions sont journalisées pour traçabilité
- Les credentials Twilio sont stockés dans les variables d'environnement (jamais dans le code)

## Coûts

Les coûts varient selon :
- Le pays de destination
- Le type de message (SMS standard vs MMS)
- Votre plan Twilio

Consultez la grille tarifaire Twilio : https://www.twilio.com/sms/pricing

## Support

- Documentation Twilio : https://www.twilio.com/docs
- Support Twilio : https://support.twilio.com/
- Console Twilio : https://console.twilio.com/

