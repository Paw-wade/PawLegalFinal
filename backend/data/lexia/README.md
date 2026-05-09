# Corpus LEXIA (base interne)

Placez ici des fichiers **`.md`**, **`.txt`**, **`.xml`**, **`.pdf`**, **`.doc`** ou **`.docx`** (sous-dossiers autorisés). Le texte est extrait puis indexé pour le mode **interne** de LEXIA (recherche par mots-clés, sans API Anthropic).

Variable optionnelle sur le serveur : **`LEXIA_KNOWLEDGE_DIR`** — chemin absolu vers un autre dossier de documents.

Variable **`LEXIA_PROVIDER`** : `auto` (défaut), `anthropic`, ou `internal`.

- **auto** : Anthropic si `ANTHROPIC_API_KEY` est définie, sinon base interne.
- **internal** : toujours la base documentaire locale.
- **anthropic** : toujours le modèle cloud (échoue sans clé).

Le client admin peut envoyer `provider` dans le corps JSON pour surcharger le choix (mêmes valeurs).
