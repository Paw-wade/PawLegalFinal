## Ajout de la case à cocher "CGU / Confidentialité" sur la page d'inscription

Fichier concerné : `frontend/src/app/auth/signup/page.tsx`

### 1. Ajouter l'état pour la case à cocher

Dans le composant `SignupPage`, au niveau des `useState` en haut :

```ts
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
const [acceptedTerms, setAcceptedTerms] = useState(false);
```

### 2. Bloquer la soumission si la case n’est pas cochée

Dans la fonction `handleSubmit`, juste après la vérification des champs obligatoires (`firstName`, `lastName`, `email`, `phone`) :

```ts
if (!firstName || !lastName || !email || !cleanedPhone) {
  setError('Veuillez remplir tous les champs obligatoires');
  return;
}

if (!acceptedTerms) {
  setError(
    "Vous devez accepter les Conditions Générales d'Utilisation et la Politique de confidentialité pour créer un compte."
  );
  return;
}
```

### 3. Remplacer le bloc bouton + texte par la case à cocher + bouton

Dans le JSX du formulaire, **remplacer** le bloc actuel :

```tsx
<Button
  type="submit"
  className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
  disabled={isLoading}
>
  {isLoading ? (
    <span className="flex items-center gap-2">
      <span className="animate-spin">⏳</span>
      <span>Envoi en cours...</span>
    </span>
  ) : (
    <span className="flex items-center gap-2">
      <span>Créer mon compte</span>
    </span>
  )}
</Button>
<p className="mt-3 text-[11px] text-muted-foreground leading-snug">
  En créant un compte, vous acceptez les{' '}
  <Link href="/cgu" className="text-primary hover:underline font-semibold">
    Conditions Générales d&apos;Utilisation
  </Link>{' '}
  et la{' '}
  <Link href="/politique-confidentialite" className="text-primary hover:underline font-semibold">
    Politique de confidentialité
  </Link>
  .
</p>
```

par ce bloc :

```tsx
<div className="space-y-3">
  <label className="flex items-start gap-2 text-[11px] text-muted-foreground leading-snug cursor-pointer">
    <input
      type="checkbox"
      checked={acceptedTerms}
      onChange={(e) => setAcceptedTerms(e.target.checked)}
      className="mt-[2px] h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
    />
    <span>
      En cochant cette case et en créant un compte, vous acceptez les{' '}
      <Link href="/cgu" className="text-primary hover:underline font-semibold">
        Conditions Générales d&apos;Utilisation
      </Link>{' '}
      et la{' '}
      <Link href="/politique-confidentialite" className="text-primary hover:underline font-semibold">
        Politique de confidentialité
      </Link>
      .
    </span>
  </label>

  <Button
    type="submit"
    className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
    disabled={isLoading || !acceptedTerms}
  >
    {isLoading ? (
      <span className="flex items-center gap-2">
        <span className="animate-spin">⏳</span>
        <span>Envoi en cours...</span>
      </span>
    ) : (
      <span className="flex items-center gap-2">
        <span>Créer mon compte</span>
      </span>
    )}
  </Button>
</div>
```

Après ces changements :

- L’utilisateur doit **cocher la case** pour pouvoir cliquer sur « Créer mon compte ».
- Si la case n’est pas cochée, `handleSubmit` affiche un message d’erreur et bloque la création du compte.

