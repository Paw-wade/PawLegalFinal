# Guide de migration : Détection de l'auto-remplissage du navigateur

Ce guide explique comment appliquer la détection de l'auto-remplissage du navigateur à tous les formulaires du site.

## Hook réutilisable

Un hook `useAutoFillDetection` a été créé dans `frontend/src/hooks/useAutoFillDetection.ts` pour faciliter l'application de cette fonctionnalité.

## Étapes de migration

### 1. Importer le hook et les utilitaires

```tsx
import { useAutoFillDetection, getRealInputValues } from '@/hooks/useAutoFillDetection';
import React, { useRef } from 'react';
```

### 2. Créer des refs pour chaque input

```tsx
const firstNameInputRef = useRef<HTMLInputElement>(null);
const lastNameInputRef = useRef<HTMLInputElement>(null);
const emailInputRef = useRef<HTMLInputElement>(null);
// ... etc pour tous les champs
```

### 3. Modifier les composants Input pour supporter les refs

Si vous avez un composant Input personnalisé, utilisez `React.forwardRef` :

```tsx
const Input = React.forwardRef<HTMLInputElement, any>(({ className = '', ...props }, ref) => {
  return (
    <input 
      ref={ref}
      className={`... ${className}`} 
      {...props} 
    />
  );
});
Input.displayName = 'Input';
```

### 4. Ajouter le hook de détection

```tsx
useAutoFillDetection({
  inputRefs: {
    firstName: firstNameInputRef,
    lastName: lastNameInputRef,
    email: emailInputRef,
    // ... tous les champs
  },
  formData,
  setFormData: (updater) => setFormData(updater),
});
```

### 5. Ajouter les refs aux inputs dans le JSX

```tsx
<Input 
  ref={firstNameInputRef}
  id="firstName"
  name="firstName"
  value={formData.firstName}
  onChange={handleChange}
  autoComplete="given-name"
/>
```

### 6. Modifier handleSubmit pour utiliser les valeurs réelles

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Récupérer les valeurs réelles des inputs DOM
  const realValues = getRealInputValues({
    firstName: firstNameInputRef,
    lastName: lastNameInputRef,
    email: emailInputRef,
    // ... tous les champs
  }, formData);
  
  // Mettre à jour l'état avec les valeurs réelles
  setFormData(realValues);
  
  // Utiliser realValues pour la validation et l'envoi
  if (!realValues.firstName || !realValues.email) {
    setError('Veuillez remplir tous les champs obligatoires');
    return;
  }
  
  // ... reste du code
};
```

## Formulaires déjà migrés

- ✅ `frontend/src/components/ReservationWidget.tsx`
- ✅ `frontend/src/app/contact/page.tsx`

## Formulaires à migrer

- [ ] `frontend/src/app/auth/signup/page.tsx`
- [ ] `frontend/src/app/auth/complete-profile/page.tsx`
- [ ] `frontend/src/app/admin/taches/page.tsx`
- [ ] `frontend/src/app/admin/dossiers/page.tsx`
- [ ] `frontend/src/app/admin/rendez-vous/page.tsx`
- [ ] `frontend/src/app/admin/compte/page.tsx`
- [ ] `frontend/src/app/admin/utilisateurs/page.tsx`
- [ ] `frontend/src/app/client/compte/page.tsx`
- [ ] `frontend/src/app/client/rendez-vous/page.tsx`
- [ ] `frontend/src/app/dossiers/create/page.tsx`

## Notes importantes

1. **Pour les champs de date** : Utilisez un sélecteur DOM pour trouver l'input date natif dans le composant DateInput :
   ```tsx
   const dateInputNative = document.querySelector('#date[type="date"]') as HTMLInputElement;
   const dateValue = dateInputNative?.value || formData.date;
   ```

2. **Pour les textarea** : Utilisez `useRef<HTMLTextAreaElement>` au lieu de `HTMLInputElement`.

3. **Pour les select** : Utilisez `useRef<HTMLSelectElement>`.

4. **Attributs autoComplete** : Ajoutez les attributs `autoComplete` appropriés pour améliorer l'auto-remplissage :
   - `autoComplete="given-name"` pour le prénom
   - `autoComplete="family-name"` pour le nom
   - `autoComplete="email"` pour l'email
   - `autoComplete="tel"` pour le téléphone
   - etc.

