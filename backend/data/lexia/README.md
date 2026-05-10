# Corpus LEXIA (base interne)

Placez ici des fichiers **`.md`**, **`.txt`**, **`.xml`**, **`.pdf`**, **`.doc`** ou **`.docx`** (sous-dossiers autorisés). Le texte est extrait puis indexé pour le mode **interne** de LEXIA (recherche par mots-clés, sans API Anthropic).

Variable optionnelle sur le serveur : **`LEXIA_KNOWLEDGE_DIR`** — chemin absolu vers un autre dossier de documents.

Variable **`LEXIA_PROVIDER`** (défaut côté serveur si le client envoie `auto`) : `auto`, `internal`, `anthropic`, `gemini`, `all`.

- **auto** : Anthropic si `ANTHROPIC_API_KEY`, sinon Gemini si `GEMINI_API_KEY`, sinon base interne.
- **internal** : uniquement la base documentaire locale (recherche Lexia sur fichiers).
- **anthropic** : uniquement l’API Anthropic (`ANTHROPIC_API_KEY`, modèle `ANTHROPIC_MODEL`).
- **gemini** : uniquement l’API Google Gemini (`GEMINI_API_KEY`, modèle `GEMINI_MODEL`).
- **all** : base interne + Anthropic + Gemini en parallèle, puis synthèse (Claude ou Gemini si clé disponible).

Le client Paw AI envoie `provider` dans le corps JSON de `POST /api/lexia` pour surcharger (mêmes valeurs).

Variables optionnelles : **`ANTHROPIC_MODEL`**, **`GEMINI_MODEL`**, **`ANTHROPIC_MAX_TOKENS`**, **`GEMINI_MAX_TOKENS`**.
