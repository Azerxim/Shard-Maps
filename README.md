# ShardUI-2-Maps

Application de cartographie interactive du serveur **Tetrago**, basée sur [MinedMap](https://github.com/nightkynight/MinedMap) et [Leaflet](https://leafletjs.com/). Permet de consulter les cartes du monde (surface, Nether, etc.), d'afficher des marqueurs (civilisations, commerces, alliances, religions) et d'éditer ces données via un éditeur intégré.

Application statique (HTML/CSS/JS vanilla), sans étape de build, servie via nginx.

## Fonctionnalités

- **Visualiseur de carte** ([index.html](index.html)) : navigation sur les cartes générées par MinedMap, sélection de la carte (Tetrago, Nether surface, Nether toit…) et du thème (clair/sombre).
- **Éditeur** ([editor.html](editor.html)) : édition des marqueurs sur la carte (civilisations, commerces, alliances, religions).
- **Embed** ([embed.html](embed.html) / [embedfull.html](embedfull.html)) : versions intégrables (iframe) de la carte, pour affichage externe.
- **À propos** ([about.html](about.html)) : page d'information.
- **API PHP** ([assets/api](assets/api)) : endpoints `get`/`put` pour la lecture et l'écriture des données de carte (civilisations, marqueurs…), servis via PHP-FPM.

## Stack technique

- HTML / CSS / JavaScript vanilla
- [Leaflet](https://leafletjs.com/) + plugins (`leaflet-geoman`, `leaflet.awesome-markers`, `leaflet.icon-material`)
- [MinedMap](assets/scripts/minedmap.js) pour l'affichage des cartes générées à partir du monde Minecraft
- [Tailwind CSS](https://tailwindcss.com/) (CDN) + [DaisyUI](https://daisyui.com/) pour l'UI
- [Font Awesome](https://fontawesome.com/) pour les icônes
- nginx + PHP-FPM pour le serveur et l'API

## Prérequis

- nginx
- PHP-FPM (pour les endpoints de l'API `assets/api`)
- `pm2` (optionnel, pour le suivi du processus en développement local)

## Installation & lancement

### Développement local (sans sudo)

```bash
npm run init          # rend les scripts exécutables
npm run dev            # équivalent à: ./start-nginx-local.sh
# ou en précisant un port :
./start-nginx-local.sh 8080
```

Accès : `http://localhost:8080` (port par défaut ou celui indiqué).

### Installation système (production)

```bash
npm run install:nginx   # sudo bash install-nginx.sh
```

Installe et configure nginx + PHP-FPM, active et démarre le service.

### Gestion via pm2 (optionnel)

```bash
npm run pm2:start     # démarre l'app sous pm2
npm run pm2:stop      # arrête
npm run pm2:restart   # redémarre
npm run pm2:logs      # affiche les logs
npm run pm2:delete    # supprime le process pm2
```

Voir [NGINX-SETUP.md](NGINX-SETUP.md) pour le détail des règles de configuration nginx (routes de cartes, embed, éditeur, API) et le dépannage.

## Génération hebdomadaire des cartes

[scripts/map-generator](scripts/map-generator) récupère le monde hébergé sur Minestrator et regénère les tuiles de `assets/data`, en s'appuyant sur les binaires MinedMap de [MinedMap Viewer Generator](https://github.com/Azerxim/MinedMap-Viewer-Generator).

1. **Récupération** : l'API Minestrator ne permet pas de télécharger les sauvegardes ; le monde est donc copié par SFTP (`level.dat` et dossiers `region` uniquement, seuls les fichiers modifiés sont téléchargés). Pendant la copie, `save-off` / `save-all flush` puis `save-on` sont envoyés via l'API.
2. **Génération** : incrémentale dans `scripts/map-generator/work/output` (seules les régions modifiées sont redessinées).
3. **Publication** : chaque carte réussie est copiée dans `assets/data/<nom>` et `maps.json` est mis à jour. Une carte en erreur garde ses anciennes tuiles.

Les cartes générées sont définies dans [maps.config.json](scripts/map-generator/maps.config.json) (`tetrago`, `nether`, `nether_toit`, `end` désactivé, dimensions personnalisées en option).

```bash
cp .env.example .env         # renseigner MINESTRATOR_API_KEY, MINESTRATOR_SERVER_ID, MINESTRATOR_SFTP_PASSWORD
npm run maps:generate        # exécution manuelle (crée .venv et récupère MinedMap au premier lancement)
npm run maps:generate:local  # regénérer depuis la copie locale, sans téléchargement
npm run maps:cron:install    # tâche cron hebdomadaire (lundi 4h00)
npm run maps:cron:remove     # retirer la tâche cron
```

Options : `run.sh --update-tools` (met à jour paramiko et MinedMap), `--only tetrago`, `--no-publish`. Journaux dans `logs/map-generator/` (12 semaines conservées).

## Structure du projet

```
assets/
├── api/            # Endpoints PHP (get/put) pour lire/écrire les données de carte
├── css/            # Styles (minedmap.css, themes.css)
├── data/            # Données de carte réelles (maps.json, tuiles générées…) — non versionnées
├── data_exemple/    # Jeux de données d'exemple par monde (tetrago, nether, nether_toit, skyslands, aegol, endrya)
├── fontawesome/     # Librairie d'icônes
├── images/          # Logos, fonds, icônes
├── leaflet/         # Librairie Leaflet + plugins
└── scripts/         # Scripts JS applicatifs :
    ├── minedmap.js               # Rendu de la carte MinedMap
    ├── functions.js               # Fonctions utilitaires
    ├── menu.js                    # Menu de sélection de carte / options
    ├── markers.js                 # Gestion générique des marqueurs
    ├── markers.civilisations.js   # Marqueurs de civilisations
    ├── markers.commerces.js       # Marqueurs de commerces
    ├── markers.alliances.js       # Marqueurs d'alliances
    ├── markers.religions.js       # Marqueurs de religions
    ├── editor.minedmap.js         # Logique de l'éditeur
    └── editor.save.js             # Sauvegarde des données éditées

index.html       # Visualiseur de carte principal
editor.html       # Éditeur de marqueurs
embed.html         # Vue intégrable (embed)
embedfull.html      # Vue intégrable complète
about.html          # Page à propos
error.html           # Page d'erreur
options.json          # Configuration des onglets/boutons affichés (menu, liens externes…)
nginx.conf              # Configuration nginx du site
install-nginx.sh          # Script d'installation système (nginx + PHP-FPM)
start-nginx-local.sh        # Script de lancement en local sans sudo
```

## Routes / redirections

Les cartes sont accessibles par des URLs courtes, réécrites par nginx vers les fichiers HTML avec un paramètre `data` :

| URL | Cible |
|---|---|
| `/tetrago`, `/nether_toit`, … | `index.html?data=<nom>` |
| `/<nom>-embed` | `embed.html?data=<nom>` |
| `/<nom>-embedplus` | `embedplus.html?data=<nom>` |
| `/<nom>-editor` | `editor.html?data=<nom>` |
| `/api/get/...`, `/api/put/...` | `api/get/*.php`, `api/put/*.php` |

Le mapping complet des mondes disponibles est défini dans [assets/data/maps.json](assets/data/maps.json). Voir [NGINX-SETUP.md](NGINX-SETUP.md) pour le détail des règles de réécriture.

## Configuration de l'interface

[options.json](options.json) contrôle les onglets du menu (embed, éditeur, civilisations, commerces, alliances, religions) et les boutons externes (à propos, retour au site, carte en temps réel, GitHub), avec leur icône, titre, visibilité (`hidden`) et cible.

## Projets liés

- [Shard-API](../Shard-API) — API backend
- [ShardUI-2](../ShardUI-2) — Portail communautaire du serveur (comptes, bibliothèque, civilisations)
