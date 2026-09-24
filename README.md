# Shard-Maps

> Documentation complète : [DOCUMENTATION.md](DOCUMENTATION.md).

Application de cartographie interactive du serveur **Tetrago**, basée sur [MinedMap](https://github.com/nightkynight/MinedMap) et [Leaflet](https://leafletjs.com/). Permet de consulter les cartes du monde (surface, Nether, etc.), d'afficher des marqueurs (civilisations, commerces, alliances, religions) et d'éditer ces données via un éditeur intégré.

Application statique (HTML/CSS/JS vanilla), sans étape de build, servie via nginx.

## Fonctionnalités

- **Visualiseur de carte** ([index.html](index.html)) : navigation sur les cartes générées par MinedMap, sélection de la carte (Tetrago, Nether surface, Nether toit…) et du thème (clair/sombre).
- **Éditeur** ([editor.html](editor.html)) : édition des marqueurs sur la carte (civilisations, commerces, alliances, religions).
- **Embed** ([embed.html](embed.html) / [embedfull.html](embedfull.html)) : versions intégrables (iframe) de la carte, pour affichage externe.
- **Choix d'une position** ([locate.html](locate.html)) : vue intégrée par les formulaires de ShardUI-2, qui renvoie les coordonnées cliquées au site par `postMessage`.
- **À propos** ([about.html](about.html)) : page d'information.

Les données (civilisations, commerces, alliances, religions, guerres) viennent de [Shard-API](../Shard-API), interrogée directement par [assets/scripts/core/shard-api.js](assets/scripts/core/shard-api.js). Il n'y a plus d'API PHP dans ce dépôt.

## Stack technique

- HTML / CSS / JavaScript vanilla
- [Leaflet](https://leafletjs.com/) + plugins (`leaflet-geoman` pour le dessin, `leaflet.awesome-markers` et `leaflet.icon-material` pour les marqueurs)
- [MinedMap](assets/scripts/pages/map.js) pour l'affichage des cartes générées à partir du monde Minecraft
- [Tailwind CSS](https://tailwindcss.com/) + [DaisyUI](https://daisyui.com/), SweetAlert et la police Material Icons, **copiés dans [assets/vendor](assets/vendor)** : aucune dépendance n'est chargée depuis un CDN tiers au moment de l'affichage
- [Font Awesome](https://fontawesome.com/) pour les icônes
- nginx pour servir le site

## Prérequis

- nginx
- `lsof` (le script local s'en sert pour vérifier que le port est libre)
- `pm2` (optionnel, pour le suivi du processus en développement local)

## Installation & lancement

### Développement local (sans sudo)

```bash
npm run init     # rend les scripts exécutables
npm run dev      # MAPS_ENV=development ./deploy/start-nginx-local.sh
npm run start    # même chose sans le mode développement
```

Accès : `http://localhost:3005`. Pour un autre port, passer `PORT` en variable d'environnement :

```bash
PORT=3006 npm run dev
```

Si le port est occupé, le script arrête une instance qu'il a lui-même lancée, mais **refuse de toucher à un
processus tiers** : il affiche qui occupe le port et s'arrête.

### Installation système (production)

```bash
npm run install:nginx   # sudo bash deploy/install-nginx.sh
```

Installe nginx si besoin, écrit la configuration à partir de [deploy/nginx.conf](deploy/nginx.conf), l'active et
démarre le service. Ce script **ne génère pas** `assets/scripts/core/env.js` : le créer une fois à la main d'après
[.env.example](.env.example).

### Gestion via pm2 (optionnel)

```bash
npm run pm2:start     # démarre l'app sous pm2
npm run pm2:stop      # arrête
npm run pm2:restart   # redémarre
npm run pm2:logs      # affiche les logs
npm run pm2:delete    # supprime le process pm2
```

Voir [deploy/NGINX-SETUP.md](deploy/NGINX-SETUP.md) pour le détail des règles de configuration nginx (routes de cartes, embed, locate, éditeur) et le dépannage.

## Génération hebdomadaire des cartes

[scripts/map-generator](scripts/map-generator) récupère le monde hébergé sur Minestrator et regénère les tuiles de `assets/data`, en s'appuyant sur les binaires MinedMap de [MinedMap Viewer Generator](https://github.com/Azerxim/MinedMap-Viewer-Generator).

1. **Récupération** : l'API Minestrator ne permet pas de télécharger les sauvegardes ; le monde est donc copié par SFTP (`level.dat` et dossiers `region` uniquement, seuls les fichiers modifiés sont téléchargés). Pendant la copie, `save-off` / `save-all flush` puis `save-on` sont envoyés via l'API.
2. **Génération** : incrémentale dans `scripts/map-generator/work/output` (seules les régions modifiées sont redessinées).
3. **Publication** : chaque carte réussie est copiée dans `assets/data/<nom>` et `maps.json` est mis à jour. Une carte en erreur garde ses anciennes tuiles.
4. **Statistiques** : la sauvegarde est relue (`world_stats.py`) et le relevé est envoyé à Shard-API, où les administrateurs le consultent sur `/admin/monde`.

Les cartes générées sont définies dans [maps.config.json](scripts/map-generator/maps.config.json) (`tetrago`, `nether`, `nether_toit`, `end` désactivé, dimensions personnalisées en option).

```bash
cp .env.example .env         # renseigner MINESTRATOR_API_KEY, MINESTRATOR_SERVER_ID, MINESTRATOR_SFTP_PASSWORD
npm run maps:generate        # exécution manuelle (crée .venv et récupère MinedMap au premier lancement)
npm run maps:generate:local  # regénérer depuis la copie locale, sans téléchargement
npm run maps:cron:install    # tâche cron hebdomadaire (lundi 4h00)
npm run maps:cron:remove     # retirer la tâche cron
```

Options : `run.sh --update-tools` (met à jour paramiko et MinedMap), `--only tetrago`, `--no-publish`. Journaux dans `logs/map-generator/` (12 semaines conservées).

Trois sources de monde possibles :

| Source                                | Commande                                                  |
| ------------------------------------- | --------------------------------------------------------- |
| Serveur Minestrator (SFTP)            | `npm run maps:generate`                                   |
| Sauvegarde sur la machine             | `npm run maps:generate:world -- /chemin/de/la/sauvegarde` |
| Copie déjà téléchargée (`work/world`) | `npm run maps:generate:local`                             |

`--local-world` (ou `MAP_LOCAL_WORLD` dans `.env`) accepte le dossier du monde (celui qui contient `level.dat`) ou celui du serveur (le monde est alors trouvé par `level-name` de `server.properties`). Les fichiers sont repris par lien matériel quand c'est possible, donc sans occuper d'espace disque supplémentaire, et la sauvegarde n'est jamais modifiée. Sur un serveur en cours d'exécution, préférer une sauvegarde arrêtée : les régions peuvent être incomplètes.

## Statistiques du monde

[world_stats.py](scripts/map-generator/world_stats.py) lit la sauvegarde après la génération des cartes (le serveur est en Fabric, sans greffon : tout vient des fichiers) et envoie un relevé à Shard-API, consultable par les administrateurs sur `/admin/monde`.

| Mesure                 | Source dans la sauvegarde                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Présence des joueurs   | `InhabitedTime` de chaque chunk (`region/*.mca`)                                                     |
| Population d'une ville | lits posés dans les chunks fréquentés, à l'intérieur de ses frontières                               |
| Villageois et entités  | `entities/*.mca`                                                                                     |
| Joueurs                | `playerdata/*.dat` (position, lit, niveau) et `stats/*.json` (temps de jeu, morts, distance)         |
| Pseudos                | `usercache.json` du serveur, sinon le compte Minecraft lié sur le site, sinon playerdb.co (côté API) |

La population ne compte que les lits des chunks où les joueurs ont réellement passé du temps (`MAP_STATS_BED_HOURS`, 10 h par défaut) : sans ce tri, les villages générés par le jeu écrasent les villes des joueurs. **À chaque relevé, la population des villes et des quartiers du site est remplacée par cette mesure** (une valeur saisie à la main ne survit donc pas au relevé suivant) ; les villes d'une dimension absente de la sauvegarde ne sont pas touchées, et la valeur précédente reste consultable dans le relevé. Une ville sans frontières tracées sur la carte est mesurée dans un rayon autour de son point, ce que la page d'administration signale : **tracer les frontières est ce qui rend la mesure fiable**.

```bash
npm run maps:stats                               # relever sans regénérer les cartes (monde repris par SFTP)
npm run maps:stats:world -- /chemin/du/monde     # relever une sauvegarde présente sur la machine
npm run maps:stats:local                         # relever la copie déjà téléchargée (work/world)
npm run maps:generate -- --no-stats              # générer les cartes sans relever
npm run maps:stats -- --stats-no-send            # relever sans envoyer à l'API (vérification)
python3 scripts/map-generator/world_stats.py --world "/chemin/du/monde" --json releve.json --no-send
```

Le relevé accepte les mêmes sources de monde que la génération (`--local-world`, ou `MAP_LOCAL_WORLD` dans `.env`, s'appliquent aussi à `npm run maps:stats`). Avec `--local-world`, la sauvegarde est lue sur place : rien n'est recopié dans `work/world`. Une sauvegarde incomplète est signalée dans le journal — `entities` manquant donne 0 villageois, `playerdata` manquant donne 0 joueur —, ce qui arrive avec `maps:stats:local` si le dernier téléchargement datait d'avant les statistiques.

L'envoi demande `MAP_STATS_API_KEY`, qui doit valoir `platforms.monde.key` dans la configuration de Shard-API. Les seuils (`MAP_STATS_*`) sont décrits dans `.env.example`. Le relevé du monde entier prend un peu plus d'une minute pour 2,6 Go de régions.

## Structure du projet

```
Shard-Maps/
├── index.html            # Visualiseur de carte principal
├── editor.html           # Éditeur de marqueurs et de frontières
├── embed.html            # Vue intégrable
├── embedfull.html        # Vue intégrable complète
├── locate.html           # Choix d'une position (renvoyée au site)
├── about.html            # Page à propos
├── error.html            # Page d'erreur
├── options.json          # Onglets du menu et boutons externes
├── assets/
│   ├── css/              # minedmap.css, themes.css
│   ├── data/             # Cartes générées (non versionné)
│   ├── data_exemple/     # Jeux d'exemple par monde
│   ├── fontawesome/      # Icônes
│   ├── leaflet/          # Leaflet et ses greffons
│   ├── images/           # Logos et fonds
│   ├── vendor/           # Tailwind, DaisyUI, SweetAlert, police Material Icons
│   └── scripts/
│       ├── core/         # Socle : env.js (généré), functions.js, shard-api.js, markers.js
│       ├── layers/       # Un calque de données par domaine : civilisations, commerces,
│       │                 #   alliances, religions, guerres
│       ├── pages/        # Un point d'entrée par page : map, embed, locate, editor
│       ├── editor/       # cartographie.js : dessin des formes et enregistrement
│       └── ui/           # menu.js : menu, thème clair/sombre, choix de la carte
├── deploy/
│   ├── nginx.conf              # Modèle ({{PORT}}, {{ROOT_PATH}})
│   ├── start-nginx-local.sh    # Lancement local, sans sudo
│   ├── install-nginx.sh        # Installation système
│   └── NGINX-SETUP.md          # Détail des règles nginx
├── scripts/map-generator/      # Génération des cartes et relevé du monde
└── logs/map-generator/         # Journaux (non versionné)
```

Les pages HTML restent à la racine : nginx sert le dossier du projet et réécrit les URL courtes vers ces fichiers.

Chaque page charge ses scripts dans l'ordre, sans module ni build : Leaflet et ses greffons, puis `core/`, puis les
calques dont elle a besoin, puis son point d'entrée `pages/` et `ui/menu.js`. Les fonctions sont globales.

## Routes / redirections

Les cartes sont accessibles par des URL courtes, réécrites par nginx vers les fichiers HTML avec un paramètre `data` :

| URL                                               | Cible                                  |
| ------------------------------------------------- | -------------------------------------- |
| `/tetrago`, `/nether_toit`, …                     | `index.html?data=<nom>`                |
| `/<nom>-embed`                                    | `embed.html?data=<nom>`                |
| `/<nom>-embedfull`                                | `embedfull.html?data=<nom>`            |
| `/<nom>-locate`                                   | `locate.html?data=<nom>`               |
| `/<nom>-editor`                                   | `editor.html?data=<nom>`               |
| `/<nom>-<calque>`, `/<nom>-embedfull-<calque>`, … | même cible, le calque est lu côté page |
| `/about`                                          | `about.html`                           |

Le mapping complet des mondes disponibles est défini dans `assets/data/maps.json`. Voir
[deploy/NGINX-SETUP.md](deploy/NGINX-SETUP.md) pour le détail des règles de réécriture.

## Configuration de l'interface

[options.json](options.json) contrôle les onglets du menu (embed, éditeur, civilisations, commerces, alliances, religions) et les boutons externes (à propos, retour au site, carte en temps réel, GitHub), avec leur icône, titre, visibilité (`hidden`) et cible.

## Projets liés

- [Shard-API](../Shard-API) — API backend
- [ShardUI-2](../ShardUI-2) — Portail communautaire du serveur (comptes, bibliothèque, civilisations)
