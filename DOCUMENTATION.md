# Shard-Maps — Documentation

Carte interactive du serveur Minecraft RP **Tetrago**, basée sur [MinedMap](https://github.com/neocturne/MinedMap)
et [Leaflet](https://leafletjs.com/). Elle affiche les tuiles du monde et, par-dessus, les données de
[Shard-API](../Shard-API) (civilisations, frontières, commerces, religions, alliances, guerres, habitants). Elle
contient aussi l'éditeur des marqueurs et frontières, ouvert depuis [ShardUI-2](../ShardUI-2), et le générateur
hebdomadaire des cartes et des statistiques du monde.

Version actuelle : `2.0.6` (voir `package.json`).

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Installation et lancement](#installation-et-lancement)
- [Configuration](#configuration)
- [Pages et adresses](#pages-et-adresses)
- [Organisation du code](#organisation-du-code)
- [Calques de données](#calques-de-données)
- [Éditeur](#éditeur)
- [Générateur de cartes](#générateur-de-cartes)
- [Statistiques du monde](#statistiques-du-monde)
- [Déploiement](#déploiement)
- [Points d'attention](#points-dattention)

## Vue d'ensemble

| Élément    | Choix                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Pages      | HTML, CSS et JavaScript sans étape de build                                                             |
| Carte      | Leaflet (`L.CRS.Simple`) + plugins `leaflet-geoman`, `leaflet.awesome-markers`, `leaflet.icon-material` |
| Tuiles     | MinedMap 2.2.0 (et MinedMap 1.19 pour la surface du Nether)                                             |
| Style      | Tailwind CSS 4 + DaisyUI, FontAwesome — tous servis depuis `assets/`                                    |
| Serveur    | nginx (fichiers statiques et réécriture d'adresses)                                                     |
| Générateur | Python 3 (`paramiko` pour le SFTP), bash, cron                                                          |
| Données    | Shard-API (lecture publique, écriture avec le jeton du site)                                            |

```
Minestrator ──SFTP──► générateur ──► assets/data/<carte>/ (tuiles, info.json, maps.json)
                           │
                           └── relevé du monde ──► Shard-API POST /api/monde/releves

Navigateur ──► nginx ──► index.html / embed / locate / editor
                  │
                  └── scripts ──► Shard-API (civilisations, cartographie, religions, guerres…)
```

## Installation et lancement

Prérequis : nginx, bash, `lsof` ; Python 3 et `git` pour le générateur ; `pm2` en option.

```bash
npm run init            # rend les scripts exécutables (ou, depuis la racine de Shard-2 : npm run maps:init)
cp .env.example .env    # puis adapter les valeurs
npm run dev             # nginx local sur le port 3005, avec .env.development
```

| Commande                                                                     | Effet                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                                                                | `MAPS_ENV=development ./deploy/start-nginx-local.sh` : `.env` puis `.env.development` |
| `npm run start`                                                              | `./deploy/start-nginx-local.sh` : `.env` seul                                         |
| `npm run install:nginx`                                                      | `sudo bash deploy/install-nginx.sh` : installation système                            |
| `npm run pm2:start` / `pm2:stop` / `pm2:restart` / `pm2:logs` / `pm2:delete` | Processus pm2 `Shard-Maps`                                                            |
| `npm run maps:*`                                                             | Générateur et statistiques (voir plus bas)                                            |

`deploy/start-nginx-local.sh`, sans droits administrateur :

1. charge `.env`, puis `.env.development` si `MAPS_ENV=development` ;
2. génère `assets/scripts/core/env.js` (`SHARD_API_BASE_URL`, `UI_BASE_URL`, `UI_ALLOWED_ORIGINS`) ;
3. **arrête tout processus qui écoute déjà sur le port 3005** ;
4. écrit une configuration complète dans `/tmp/nginx-local/` (ou `$NGINX_TEMP`) à partir de `deploy/nginx.conf` ;
5. lance nginx sur `0.0.0.0:3005`.

Le port est fixé dans le script (`PORT=3005`) ; il doit correspondre à `VITE_MAPS_BASE_URL` de ShardUI-2.

## Configuration

### `.env`

Voir `.env.example` pour la liste commentée. Le fichier n'est pas versionné. `.env.development` le surcharge en
mode développement.

| Variable                                           | Usage                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SHARD_API_BASE_URL`                               | Shard-API **avec** `/api` (défaut `http://localhost:8000/api`) ; utilisée par les pages et par le relevé du monde |
| `UI_BASE_URL`                                      | ShardUI-2 : liens des popups et origine autorisée à transmettre le jeton à l'éditeur                              |
| `UI_ALLOWED_ORIGINS`                               | Autres origines autorisées pour le jeton, séparées par des virgules                                               |
| `MINESTRATOR_API_KEY`, `MINESTRATOR_SERVER_ID`     | API Minestrator (accès SFTP, `save-off` / `save-on`)                                                              |
| `MINESTRATOR_SFTP_PASSWORD`                        | Mot de passe SFTP (obligatoire, non fourni par l'API)                                                             |
| `MINESTRATOR_SFTP_HOST`, `_PORT`, `_USER`, `_ROOT` | Accès SFTP explicites (facultatif)                                                                                |
| `MAP_LOCAL_WORLD`                                  | Sauvegarde locale à utiliser au lieu du SFTP (équivaut à `--local-world`)                                         |
| `MAP_WORLD_NAME`                                   | Dossier du monde (défaut : `level-name` de `server.properties`)                                                   |
| `MAP_SAVE_COMMANDS`                                | Suspendre la sauvegarde automatique pendant la copie (`true`)                                                     |
| `MAP_SAVE_WAIT`                                    | Attente en secondes après `save-all flush` (20)                                                                   |
| `MAP_JOBS`                                         | Threads MinedMap (0 = un par cœur)                                                                                |
| `MAP_SIGN_PREFIX`                                  | Préfixes des panneaux affichés sur la carte (vide = aucun)                                                        |
| `MAP_STATS`                                        | Relever les statistiques à chaque génération (`true`)                                                             |
| `MAP_STATS_API_KEY`                                | Clé d'envoi, égale à `platforms.monde.key` de Shard-API                                                           |
| `MAP_STATS_BED_HOURS`                              | Heures de présence minimales pour compter les lits d'un chunk (10)                                                |
| `MAP_STATS_ACTIVE_HOURS`, `MAP_STATS_ACTIVE_DAYS`  | Joueur actif : temps de jeu minimal et connexion récente (1 h, 30 jours)                                          |
| `MAP_STATS_TILE`, `MAP_STATS_TOP_ZONES`            | Côté des zones en blocs et nombre de zones gardées (256, 25)                                                      |
| `MAP_STATS_RADIUS`, `MAP_STATS_QUARTIER_RADIUS`    | Rayon mesuré sans frontières tracées (128, 64 blocs)                                                              |
| `MINEDMAP_BIN`, `MINEDMAP_NETHER_BIN`              | Chemins des binaires MinedMap (défaut : ceux installés par `run.sh`)                                              |

`assets/scripts/core/env.js` est **généré** à partir de ces variables et chargé avant `shard-api.js`. Il n'est pas
versionné : après un changement de `.env`, relancer `deploy/start-nginx-local.sh`.

### `options.json`

Onglets et boutons du menu de la carte (`ui/menu.js`).

`BuildOptions()` construit les entrées (`Option_<clé>`) dans `#OptionsMenu`, et `updateOptions()` remet leurs liens
à jour à chaque changement de position. `index.html`, `embed.html` et `editor.html` appellent `BuildOptions()` ;
`embedfull.html` et `locate.html` masquent leur menu et ne l'appellent pas, donc `updateOptions()` ignore
simplement les entrées absentes.

- `options` : `embed`, `embedfull`, `locate`, `editor`, `civilisations`, `commerces`, `alliances`, `religions`,
  `guerres`, chacun avec `title`, `icon`, `class` et `hidden` (0 ou 1).
- `buttons` : liens externes (`about`, `retour` vers le site, carte en temps réel, GitHub) avec `href`, `title`,
  `icon`, `class`, `target`, `hidden`.

### `assets/data/maps.json`

Écrit par le générateur : cartes disponibles par groupe, et date de génération.

```json
{
  "vanilla": {
    "Tetrago": "tetrago",
    "Nether:surface": "nether",
    "Nether:toit": "nether_toit"
  },
  "dimensions": {},
  "date": "16/09/2026"
}
```

Chaque carte a son dossier `assets/data/<nom>/` (`info.json`, `entities.json`, tuiles). Le `link` d'une dimension
dans Shard-API doit être égal à ce nom.

## Pages et adresses

nginx réécrit des adresses courtes vers les pages HTML avec `?data=<carte>` ; la requête d'origine est conservée
(`?ville=12` par exemple). Les noms de carte sont en minuscules, avec jusqu'à deux `_`.

| Adresse                         | Page             | Usage                                                                                              |
| ------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `/<carte>`                      | `index.html`     | Carte complète avec menu                                                                           |
| `/<carte>-<calque>`             | `index.html`     | Idem, calque choisi (ex. `/tetrago-civilisations`)                                                 |
| `/<carte>-embed[-<calque>]`     | `embed.html`     | Carte intégrable réduite                                                                           |
| `/<carte>-embedfull[-<calque>]` | `embedfull.html` | Carte intégrable complète (fiches du site)                                                         |
| `/<carte>-locate[-<calque>]`    | `locate.html`    | Choix d'une position : envoie `{ source: "minedmap", type: "move", x, z, zoom }` à la page parente |
| `/<carte>-editor[-<calque>]`    | `editor.html`    | Éditeur (voir plus bas)                                                                            |
| `/about`                        | `about.html`     | À propos                                                                                           |
| `/assets/...`                   | fichiers         | Scripts et styles revalidés à chaque visite (`no-cache`), autres fichiers en cache 7 jours         |

Le script lit aussi l'adresse lui-même (`parsePathName` de `core/functions.js`) : `<calque>` vaut `civilisations`,
`commerces`, `alliances`, `religions` ou `guerres` et choisit les données affichées ; la carte par défaut est
`tetrago`.

Paramètres dans l'ancre (`#`), mis à jour pendant la navigation :

| Paramètre    | Effet                                   |
| ------------ | --------------------------------------- |
| `x`, `z`     | Centre (défaut : point d'apparition)    |
| `zoom`       | Niveau de zoom (0 par défaut)           |
| `light=1`    | Calque d'illumination                   |
| `signs=0`    | Masque les panneaux                     |
| `marker=x,z` | Ouvre le panneau situé à cette position |

## Organisation du code

```
Shard-Maps/
├── index.html, embed.html, embedfull.html, locate.html, editor.html, about.html, error.html
├── options.json                   # Menu
├── deploy/
│   ├── nginx.conf                 # Modèle ({{PORT}}, {{ROOT_PATH}})
│   ├── start-nginx-local.sh       # Lancement local
│   ├── install-nginx.sh           # Installation système
│   └── NGINX-SETUP.md             # Commandes de service et dépannage
├── .env.example                   # Variables
├── assets/
│   ├── css/                       # minedmap.css, themes.css
│   ├── data/                      # Cartes générées (non versionné)
│   ├── data_exemple/              # Jeux d'exemple par monde
│   ├── fontawesome/, images/, leaflet/
│   ├── vendor/                    # Copies locales : Tailwind, DaisyUI, SweetAlert,
│   │                              #   police Material Icons (utilisée par L.IconMaterial)
│   └── scripts/
│       ├── core/                  # Socle chargé par toutes les pages
│       │   ├── env.js             # Généré (adresses de l'API et du site)
│       │   ├── functions.js       # Utilitaires
│       │   ├── shard-api.js       # Client Shard-API et jeton de l'éditeur
│       │   └── markers.js         # Icônes, couleurs (dont ReligionColor), popups communs
│       ├── layers/                # Un calque de données par domaine
│       │   ├── civilisations.js
│       │   ├── commerces.js
│       │   ├── religions.js
│       │   ├── alliances.js
│       │   └── guerres.js
│       ├── pages/                 # Un point d'entrée par page
│       │   ├── map.js             # Carte complète (index.html)
│       │   ├── embed.js           # Variantes intégrables
│       │   ├── locate.js          # Choix d'une position
│       │   └── editor.js          # Carte de l'éditeur
│       ├── editor/
│       │   └── cartographie.js    # Édition des formes et enregistrement
│       └── ui/
│           └── menu.js            # Menu, thème clair/sombre, choix de la carte
├── scripts/map-generator/
│   ├── run.sh                     # Lanceur (venv, verrou, journaux)
│   ├── generate_maps.py           # Téléchargement, génération, publication
│   ├── world_stats.py             # Relevé du monde et envoi à l'API
│   ├── mcworld.py                 # Lecture NBT et régions Minecraft sans dépendance
│   ├── maps.config.json           # Cartes à générer
│   ├── install-cron.sh            # Tâche hebdomadaire
│   └── requirements.txt           # paramiko
└── logs/map-generator/            # Journaux (12 semaines)
```

Les scripts sont chargés dans l'ordre par chaque page, sans module ni build : Leaflet et ses greffons, le socle
`core/` (`functions.js`, `markers.js`, `env.js`, `shard-api.js`), les calques `layers/` dont la page a besoin, puis
son point d'entrée `pages/` et `ui/menu.js`. Les fonctions sont globales.

Les pages HTML restent à la racine du projet : nginx sert ce dossier et y réécrit les URL courtes.

### Conventions de rangement

- **Un dossier par rôle dans `assets/scripts/`** : `core/` est chargé par toutes les pages, `layers/` contient un
  fichier par domaine de données, `pages/` un point d'entrée par page HTML, `editor/` ce qui est propre à
  l'éditeur, `ui/` le menu. Le nom du fichier ne répète pas celui du dossier (`layers/civilisations.js`, pas
  `layers/markers.civilisations.js`).
- **Les pages HTML et `options.json` restent à la racine** : leurs chemins sont ceux des URL servies par nginx.
- **Tout ce qui sert au déploiement est dans `deploy/`** : modèle nginx, scripts de lancement et d'installation,
  et leur documentation.
- **Les bibliothèques tierces sont dans `assets/`** (`leaflet/`, `fontawesome/`, `vendor/`) et jamais appelées
  depuis un CDN : la carte doit s'afficher sans dépendre d'un service extérieur. Cela vaut aussi pour les polices :
  la police Material Icons, dont `L.IconMaterial` a besoin pour le marqueur du spawn et les icônes de `markers.js`,
  est servie depuis `assets/vendor/`.
- **Pas de build ni de modules** : les scripts se chargent par `<script src>` dans l'ordre et exposent des
  fonctions globales. Un nouveau calque s'ajoute dans `layers/` puis dans la balise `<script>` des pages
  concernées, et son onglet dans `options.json`.

## Calques de données

Chaque calque interroge Shard-API (lecture publique, `shardApiGet`) et ne montre que les éléments publics de la
carte affichée. Les liens des popups pointent vers `UI_BASE_URL`.

| Calque        | Script                    | Données                                                   | Affichage                                                                                     |
| ------------- | ------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Civilisations | `layers/civilisations.js` | civilisations, villes, quartiers, cartographie, habitants | Marqueurs, frontières des villes et quartiers, popups avec population et nombre d'habitants   |
| Commerces     | `layers/commerces.js`     | commerces et magasins                                     | Magasins, icône propre pour le siège                                                          |
| Religions     | `layers/religions.js`     | religions et leur présence                                | Villes à la couleur de la religion majoritaire, répartition dans la popup, gris sans religion |
| Alliances     | `layers/alliances.js`     | `/alliances/list`                                         | Villes et frontières aux couleurs de l'alliance (militaire en priorité)                       |
| Guerres       | `layers/guerres.js`       | `/guerres/list`, cartographie `guerre`                    | Zones rouges pendant la guerre, grises une fois terminée                                      |

Le calque Alliances est chargé par `index.html`, `embed.html`, `embedfull.html` et `locate.html`. `editor.html`
ne charge que le calque Civilisations : l'éditeur ne modifie que ses marqueurs et ses frontières, et les autres
calques masqueraient les formes en cours d'édition.

`layers/civilisations.js` reconstruit la structure produite autrefois par l'API PHP. Les anciens champs `inactif`
(civilisation, ville) et `parc` (ville, quartier) n'existent plus : ils valent toujours « actif » et `0`.

Les couleurs des religions sont calculées comme sur le site (`ReligionColor`) : une religion a la même couleur
partout.

## Éditeur

### Ouverture

L'éditeur s'ouvre depuis le site (`openMapEditor` de ShardUI-2) :

```
/<carte>-editor-civilisations?<type>=<id>#x=…&z=…&zoom=…
```

| Paramètre         | Mode                   | Formes                        | Couleur par défaut    |
| ----------------- | ---------------------- | ----------------------------- | --------------------- |
| `civilisation=ID` | Marqueurs              | Marqueur, texte               | Couleur des marqueurs |
| `ville=ID`        | Frontières             | Polygone, rectangle           | `#3388ff`             |
| `quartier=ID`     | Frontières du quartier | Polygone, rectangle           | `#f59e0b`             |
| `guerre=ID`       | Zones de conflit       | Polygone, rectangle, marqueur | `#dc2626`             |

Les autres civilisations et villes sont affichées en lecture seule. Les modifications restent locales jusqu'au
bouton d'enregistrement, qui appelle `/cartographie/create`, `/update/{id}` et `/delete/{id}`. Les coordonnées sont
stockées au format Leaflet `[-z, x]`, en JSON.

Les droits sont vérifiés par Shard-API : Fondateur/Admin de la civilisation (ou administrateur) ; pour une guerre,
chefs de camp et modérateurs RP d'une guerre en cours.

### Connexion

La carte et le site ont des origines différentes : l'éditeur ne peut pas lire le `localStorage` du site.
`shardApiToken()` (`core/shard-api.js`) obtient le jeton ainsi :

1. jeton déjà reçu dans cet onglet (`sessionStorage.token`) ;
2. sans fenêtre d'origine (`window.opener`) : `localStorage.token`, utile si la carte est servie sur la même origine
   que le site ;
3. sinon, demande à l'onglet du site par `postMessage` (`{ source: "minedmap", type: "editor-auth-request" }`),
   répétée chaque seconde jusqu'à la réponse, pendant 15 secondes au plus ;
4. la réponse n'est acceptée que si elle vient de la fenêtre d'origine **et** d'une origine listée dans
   `UI_BASE_URL` / `UI_ALLOWED_ORIGINS` ;
5. si l'API répond 401 (jeton expiré ou remplacé), un nouveau jeton est demandé et la requête est rejouée une fois.

Messages d'erreur affichés : onglet du site fermé, site sans réponse, utilisateur non connecté, origine non
autorisée (à ajouter à `UI_ALLOWED_ORIGINS`), ou refus du site (`editor-auth-refused`, carte servie depuis une autre
origine que `VITE_MAPS_BASE_URL`).

Le jeton n'est valable que pour la Shard-API qui l'a émis : `SHARD_API_BASE_URL` doit viser la même API que le site.

## Générateur de cartes

`scripts/map-generator` récupère le monde et regénère les tuiles de `assets/data`, avec les binaires de
[MinedMap Viewer Generator](https://github.com/Azerxim/MinedMap-Viewer-Generator).

### Commandes

| Commande                                 | Effet                                                      |
| ---------------------------------------- | ---------------------------------------------------------- |
| `npm run maps:generate`                  | Téléchargement SFTP, génération, publication, statistiques |
| `npm run maps:generate:local`            | Regénère depuis la copie `work/world` déjà téléchargée     |
| `npm run maps:generate:world -- /chemin` | Utilise une sauvegarde présente sur la machine             |
| `npm run maps:cron:install`              | Tâche cron hebdomadaire (lundi 4 h 00 par défaut)          |
| `npm run maps:cron:remove`               | Retire la tâche cron                                       |

Options (après `--`) :

| Option                 | Effet                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `--update-tools`       | Met à jour `paramiko` et MinedMap (premier argument de `run.sh`)                              |
| `--only NOM`           | Ne traite que cette carte (répétable)                                                         |
| `--skip-download`      | Utilise `work/world`                                                                          |
| `--local-world CHEMIN` | Dossier du monde (contenant `level.dat`) ou du serveur (monde trouvé via `server.properties`) |
| `--no-publish`         | Génère sans copier dans `assets/data`                                                         |
| `--no-stats`           | Pas de relevé du monde                                                                        |
| `--stats-only`         | Relevé sans génération                                                                        |
| `--stats-no-send`      | Relevé sans envoi à l'API                                                                     |

`install-cron.sh` accepte aussi une planification : `./install-cron.sh "0 4 * * 1"`.

### Déroulement

`run.sh` :

1. journalise dans `logs/map-generator/<date>.log` (12 semaines conservées) ;
2. refuse une seconde exécution simultanée (verrou `.cache/run.lock`) ;
3. charge `.env` ;
4. crée `.venv` et installe `requirements.txt` au premier lancement ;
5. clone MinedMap Viewer Generator dans `.cache/` au premier lancement ;
6. lance `generate_maps.py`.

`generate_maps.py` :

1. **Récupération** : l'API Minestrator ne permet pas de télécharger les sauvegardes. Le monde est copié par SFTP
   (`level.dat` et dossiers `region`, fichiers modifiés seulement), entre `save-off` / `save-all flush` et
   `save-on` envoyés par l'API. Avec `--local-world`, les fichiers sont repris par lien matériel quand c'est
   possible, sans modifier la sauvegarde.
2. **Génération** : incrémentale dans `work/output` ; seules les régions modifiées sont redessinées.
3. **Publication** : chaque carte réussie est copiée dans `assets/data/<nom>` et `maps.json` est mis à jour sans
   perdre les entrées existantes. Une carte en erreur garde ses anciennes tuiles.
4. **Statistiques** : relevé du monde et envoi à Shard-API.

### `maps.config.json`

```json
{
  "maps": [
    {
      "name": "tetrago",
      "label": "Tetrago",
      "group": "vanilla",
      "source": "",
      "generator": "minedmap"
    },
    {
      "name": "nether",
      "label": "Nether:surface",
      "group": "vanilla",
      "source": "DIM-1",
      "generator": "legacy_nether"
    },
    {
      "name": "nether_toit",
      "label": "Nether:toit",
      "group": "vanilla",
      "source": "DIM-1",
      "generator": "minedmap"
    },
    {
      "name": "end",
      "label": "End",
      "group": "vanilla",
      "source": "DIM1",
      "generator": "minedmap",
      "enabled": false
    }
  ],
  "custom_dimensions": false
}
```

| Champ               | Rôle                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `name`              | Dossier dans `assets/data`, nom dans les adresses et `link` de la dimension dans Shard-API               |
| `label`             | Libellé dans `maps.json`                                                                                 |
| `group`             | Groupe dans `maps.json`                                                                                  |
| `source`            | Sous-dossier du monde (`""` surface, `DIM-1` Nether, `DIM1` End)                                         |
| `generator`         | `minedmap` (MinedMap 2.2.0) ou `legacy_nether` (MinedMap 1.19, seul à dessiner sous le toit de bedrock)  |
| `enabled`           | `false` pour ignorer la carte                                                                            |
| `custom_dimensions` | `true` ajoute les dimensions `dimensions/<namespace>/<nom>` trouvées dans le monde (groupe `dimensions`) |

## Statistiques du monde

`world_stats.py` lit la sauvegarde après la génération (serveur Fabric, sans greffon : tout vient des fichiers) et
envoie un relevé à `POST <SHARD_API_BASE_URL>/monde/releves` avec l'en-tête `X-Monde-Key`. Les administrateurs le
consultent sur `/admin/monde` du site.

| Mesure                                  | Source                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Présence des joueurs                    | `InhabitedTime` de chaque chunk (`region/*.mca`)                                                                                    |
| Population d'une ville ou d'un quartier | Lits dans les chunks fréquentés (≥ `MAP_STATS_BED_HOURS`), à l'intérieur de ses frontières, sinon dans un rayon autour de son point |
| Villageois et entités                   | `entities/*.mca`                                                                                                                    |
| Joueurs                                 | `playerdata/*.dat` (position, lit, niveau), `stats/*.json` (temps de jeu, morts, distance…)                                         |
| Pseudos                                 | `usercache.json` du serveur ; côté API, compte lié ou playerdb.co                                                                   |
| Zones les plus visitées                 | Carrés de `MAP_STATS_TILE` blocs, classés par présence                                                                              |

Le script lit d'abord sur Shard-API les civilisations, villes, quartiers, dimensions et formes tracées, puis
rattache chaque dimension à un dossier du monde via le `link` de la dimension et `maps.config.json`. Les
civilisations reprennent la somme de leurs villes. La lecture NBT est faite par `mcworld.py`, sans dépendance.

**Chaque relevé remplace la population des villes et quartiers du site.** Les villes d'une dimension absente de
la sauvegarde ne sont pas touchées. Sans frontières tracées, la mesure au rayon est approximative : tracer les
frontières dans l'éditeur rend la mesure fiable.

| Commande                                | Effet                                          |
| --------------------------------------- | ---------------------------------------------- |
| `npm run maps:stats`                    | Relevé seul, monde repris par SFTP             |
| `npm run maps:stats:world -- /chemin`   | Relevé d'une sauvegarde locale (lue sur place) |
| `npm run maps:stats:local`              | Relevé de `work/world`                         |
| `npm run maps:stats -- --stats-no-send` | Relevé sans envoi                              |

Utilisation directe :

```bash
python3 scripts/map-generator/world_stats.py --world /chemin/du/monde [--server /chemin/du/serveur] \
    [--dimension SOURCE] [--api-url URL] [--key CLE] [--json releve.json] [--no-send]
```

Une sauvegarde incomplète est signalée dans le journal (`entities` absent : 0 villageois ; `playerdata` absent :
0 joueur), ce qui arrive avec `maps:stats:local` si la copie date d'avant les statistiques. Un relevé complet prend
un peu plus d'une minute pour 2,6 Go de régions.

Erreurs d'envoi fréquentes : clé absente (`MAP_STATS_API_KEY` vide) ou refusée (401 : la clé ne correspond pas à
`platforms.monde.key`).

## Déploiement

### Avec le script local (production actuelle)

```bash
npm run pm2:start       # pm2 lance npm run start (nginx sur le port 3005)
```

La carte publique (`map.beta.tetrago.fr`) doit être relayée vers ce port par le serveur web frontal.

### Installation système

```bash
sudo PORT=80 ROOT_PATH=/chemin/Shard-Maps bash deploy/install-nginx.sh
```

Le script installe nginx, écrit `/etc/nginx/sites-available/shardui-maps` à partir de `deploy/nginx.conf`,
l'active, teste la configuration et redémarre nginx. Il **ne génère pas** `assets/scripts/core/env.js` : le créer
une fois avec `deploy/start-nginx-local.sh` (puis l'arrêter) ou à la main, sinon les pages visent
`http://localhost:8000/api`.

Voir [deploy/NGINX-SETUP.md](deploy/NGINX-SETUP.md) pour les commandes de service et le dépannage.

### Génération automatique

```bash
npm run maps:cron:install
```

Vérifier dans `.env` les accès Minestrator et `MAP_STATS_API_KEY`.

## Points d'attention

Les cinq constats relevés lors de la rédaction de ce document ont été traités :

| Constat                                                                                                                                         | Traitement                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restes de l'ancienne API PHP : PHP-FPM installé, routes `/api/get/<nom>` réécrites vers un fichier absent, fonction morte `oldMarkersCommerces` | PHP-FPM retiré de `deploy/install-nginx.sh`, bloc `/api` retiré de `deploy/nginx.conf`, fonction supprimée de `layers/commerces.js`. Plus aucune trace de PHP dans le code                                                |
| `README.md` et `NGINX-SETUP.md` périmés (API PHP, `embedplus.html`, port 8080, argument de port)                                                | Les deux réécrits pour l'état actuel, `NGINX-SETUP.md` déplacé dans `deploy/`                                                                                                                                             |
| `start-nginx-local.sh` tuait (`kill -9`) tout processus écoutant sur le port                                                                    | Le script n'arrête que sa propre instance (PID de `$NGINX_TEMP/pid/nginx.pid`, par `nginx -s quit`). Face à un processus inconnu, il le nomme et s'arrête — voir [Déploiement](#avec-le-script-local-production-actuelle) |
| Tailwind et SweetAlert chargés depuis des CDN tiers (`jsdelivr`, `common.olemiss.edu`, Google Fonts)                                            | Copiés dans `assets/vendor/` : Tailwind 4.3.3, DaisyUI 5.7.40, SweetAlert, et la police Material Icons (`material-icons.css` + `material-icons.woff2`). Plus aucune requête vers un tiers à l'affichage                   |
| Calque Alliances désactivé alors que son onglet est affiché                                                                                     | Activé sur `index.html` ; l'absence des autres calques dans `editor.html` est volontaire et documentée — voir [Calques de données](#calques-de-données)                                                                   |

Restent ouverts, sans urgence :

- **Tailwind est compilé dans le navigateur** (`assets/vendor/tailwind-browser.js`, 282 Ko) : c'est un outil de
  développement utilisé en production. Une étape de build produirait une feuille de style bien plus légère, au prix
  d'un outillage que ce dépôt n'a pas.
- **`assets/vendor/daisyui.css` pèse 1,1 Mo** : c'est la source complète de DaisyUI, que Tailwind trie au
  chargement. Même remède que ci-dessus.
- **Les copies de `assets/vendor/` ne sont pas suivies par un gestionnaire de dépendances** : une mise à jour
  demande de retélécharger les fichiers à la main.
