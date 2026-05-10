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

## Mémoire (erreur « JavaScript heap out of memory »)

L’index Lexia charge en RAM les extraits de tous les fichiers (jusqu’à **`LEXIA_INDEX_MAX_FILES`**) puis des milliers de **chunks**. Des valeurs très élevées (ex. 50 000 fichiers) peuvent faire monter le heap à plusieurs Go et faire planter Node même avec **`--max-old-space-size`**.

- **`LEXIA_INDEX_MAX_FILES`** : plafond du nombre de fichiers pris en compte (ex. `8000`–`15000` sur une machine modeste ; monter seulement si la RAM suit).
- **`LEXIA_MAX_TOTAL_CHUNKS`** : plafond des segments indexés (défaut `70000`). Le baisser (ex. `32000`) réduit la consommation mémoire.
- **`LEXIA_ENFORCE_SOFT_CAP`** : si le répertoire contient *plus* de N fichiers que ce nombre, le serveur refuse la requête avec un message d’aide au lieu de charger (utile si `LEXIA_INDEX_MAX_FILES` est illimité ou très grand). Ce seuil doit rester **supérieur** au plafond d’index si vous voulez éviter de bloquer toutes les requêtes alors que l’index est déjà tronqué.
- Scripts npm : le backend démarre avec **`--max-old-space-size=8192`** (8 Go). Sur un VPS étroit, baissez surtout **`LEXIA_INDEX_MAX_FILES`** / **`LEXIA_MAX_TOTAL_CHUNKS`** plutôt que d’augmenter sans limite la mémoire Node.

Après changement des variables, redémarrez le processus Node. Si vous utilisiez un cache Lexia en mémoire, un appel à **`POST /api/lexia/invalidate-cache`** (ou un redémarrage) recharge l’index avec les nouvelles limites.
