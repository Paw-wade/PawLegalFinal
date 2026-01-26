# Guide de Création d'un Compte Client

Ce guide vous explique comment créer un compte client sur le site Paw Legal.

## 📋 Processus de Création de Compte

La création d'un compte client se fait en **2 étapes** :

### **Étape 1 : Inscription de base**

1. **Accéder à la page d'inscription**
   - Depuis la page d'accueil (`http://localhost:3000`), cliquez sur le bouton **"Créer un compte"** dans le header
   - Ou accédez directement à : `http://localhost:3000/auth/signup`

2. **Remplir le formulaire d'inscription**
   
   **Champs obligatoires :**
   - **Prénom** : Minimum 2 caractères
   - **Nom** : Minimum 2 caractères
   - **Email** : Adresse email valide (sera utilisée pour la connexion)
   - **Mot de passe** : Minimum 6 caractères
   - **Confirmer le mot de passe** : Doit correspondre au mot de passe
   
   **Champ optionnel :**
   - **Téléphone** : Numéro de téléphone (optionnel)

3. **Soumission du formulaire**
   - Cliquez sur **"Créer mon compte"**
   - Si toutes les informations sont valides, vous serez automatiquement redirigé vers la page de complétion de profil

### **Étape 2 : Complétion du profil**

Après l'inscription, vous serez redirigé vers la page `/auth/complete-profile` pour compléter vos informations personnelles.

**Champs à remplir :**
- **Numéro d'étranger** : Obligatoire
- **Date de naissance** : Optionnel
- **Lieu de naissance** : Optionnel
- **Nationalité** : Optionnel
- **Sexe** : Optionnel (Masculin, Féminin, Autre)
- **Adresse postale** : Optionnel
- **Ville** : Optionnel
- **Code postal** : Optionnel
- **Pays** : Optionnel (par défaut : France)

Une fois le profil complété, vous serez redirigé vers votre **tableau de bord client** (`/client`).

## 🔐 Connexion après Création

Pour vous connecter après avoir créé votre compte :

1. Accédez à la page de connexion : `http://localhost:3000/auth/signin`
2. Entrez votre **email** et votre **mot de passe**
3. Cliquez sur **"Se connecter"**

Vous serez automatiquement redirigé vers :
- **Espace Admin** si vous êtes administrateur
- **Espace Client** si vous êtes un client

## ✨ Fonctionnalités Disponibles après Inscription

Une fois votre compte créé et votre profil complété, vous avez accès à :

- ✅ **Tableau de bord client** : Vue d'ensemble de vos dossiers et activités
- ✅ **Gestion des dossiers** : Créer et suivre vos dossiers administratifs
- ✅ **Documents** : Télécharger et gérer vos documents
- ✅ **Rendez-vous** : Prendre et gérer vos rendez-vous
- ✅ **Témoignages** : Publier un témoignage sur vos expériences
- ✅ **Mon compte** : Modifier vos informations personnelles et changer votre mot de passe

## 🚨 Résolution de Problèmes

### Erreur : "Email déjà utilisé"
- Cet email est déjà associé à un compte. Essayez de vous connecter ou utilisez un autre email.

### Erreur : "Les mots de passe ne correspondent pas"
- Vérifiez que les deux champs de mot de passe sont identiques.

### Erreur : "Le mot de passe doit contenir au moins 6 caractères"
- Votre mot de passe doit contenir au moins 6 caractères.

### Redirection vers la page de complétion de profil
- Si vous êtes redirigé vers `/auth/complete-profile` après connexion, c'est que votre profil n'est pas encore complet. Complétez les informations demandées pour accéder à votre espace client.

## 📞 Besoin d'Aide ?

Si vous rencontrez des difficultés lors de la création de votre compte, vous pouvez :
- Contacter le support via la page **Contact** : `http://localhost:3000/contact`
- Prendre un rendez-vous directement depuis la page d'accueil

---

**Note** : Le processus de création de compte est entièrement gratuit et ne nécessite aucun paiement.


