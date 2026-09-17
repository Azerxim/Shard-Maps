# Configuration nginx de ShardUI-2-Maps

ShardUI-2-Maps est un site statique : nginx sert le dossier du projet et réécrit des URL courtes
(`/tetrago-embedfull-civilisations`) vers les pages HTML de la racine. Il n'y a ni build ni langage serveur —
les données viennent de Shard-API, interrogée par le navigateur.

Tout part de [nginx.conf](nginx.conf), un modèle où `{{PORT}}` et `{{ROOT_PATH}}` sont remplacés au lancement.

## Lancement local (sans sudo)

```bash
npm run dev            # MAPS_ENV=development, port 3005
npm run start          # sans le mode développement
PORT=3006 npm run dev  # autre port
```

[start-nginx-local.sh](start-nginx-local.sh) :

1. charge `.env`, puis `.env.development` par-dessus si `MAPS_ENV=development` ;
2. génère `assets/scripts/core/env.js` (adresses de Shard-API et du site) ;
3. écrit la configuration et les journaux dans `/tmp/nginx-local` (surchargeable avec `NGINX_TEMP`) ;
4. lance nginx au premier plan — `Ctrl+C` pour arrêter.

**Port déjà occupé** : le script arrête proprement une instance qu'il a lui-même lancée (PID connu par
`$NGINX_TEMP/pid/nginx.pid`, arrêt par `nginx -s quit`). Face à un processus qu'il ne connaît pas, il affiche
qui occupe le port et s'arrête sans rien tuer. Lancer alors sur un autre port, ou arrêter le processus soi-même.

## Installation système (production)

```bash
npm run install:nginx   # sudo bash deploy/install-nginx.sh
```

[install-nginx.sh](install-nginx.sh) installe nginx si besoin, écrit `/etc/nginx/sites-available/shardui-maps`
à partir du modèle, l'active dans `sites-enabled`, teste la configuration (`nginx -t`) et redémarre le service.
`ROOT_PATH` et `PORT` peuvent être passés en variables d'environnement (par défaut : le dossier du projet et le
port 80).

Ce script **ne génère pas** `assets/scripts/core/env.js` : le créer une fois à la main d'après
[.env.example](../.env.example), sinon les calques de données restent vides.

## Règles de réécriture

`<nom>` est un monde de `assets/data/maps.json` (`tetrago`, `nether_toit`, `nether_toit_light`…) ; il peut
comporter jusqu'à trois segments séparés par `_`. `<calque>` est un onglet de `options.json`
(`civilisations`, `commerces`, `alliances`, `religions`, `guerres`) ou un thème.

| URL | Cible |
| --- | --- |
| `/<nom>` | `index.html?data=<nom>` |
| `/<nom>-embed` | `embed.html?data=<nom>` |
| `/<nom>-embedfull` | `embedfull.html?data=<nom>` |
| `/<nom>-locate` | `locate.html?data=<nom>` |
| `/<nom>-editor` | `editor.html?data=<nom>` |
| `/<nom>-<calque>` | `index.html?data=<nom>` |
| `/<nom>-embed-<calque>` | `embed.html?data=<nom>` |
| `/<nom>-embedfull-<calque>` | `embedfull.html?data=<nom>` |
| `/<nom>-locate-<calque>` | `locate.html?data=<nom>` |
| `/<nom>-editor-<calque>` | `editor.html?data=<nom>` |
| `/about` | `about.html` |
| `/assets/...` | Fichiers statiques, servis tels quels |

Le calque n'est pas transmis en paramètre : la page le lit dans son URL. Toute autre adresse tombe sur la page
d'accueil ou une 404 selon la règle qui correspond.

`/assets/` est traité avant les règles de cartes, donc jamais pris pour un nom de monde. Les fichiers y sont
mis en cache 7 jours, sauf les `.js` et `.css` qui sont toujours revalidés (`Cache-Control: no-cache`) : ils ne
sont pas versionnés dans leur nom, une mise à jour devrait sinon attendre l'expiration du cache.

## Gestion du service

```bash
systemctl status nginx      # état
sudo systemctl restart nginx   # après modification de la configuration
sudo systemctl stop nginx
sudo nginx -t                  # vérifier la configuration avant de redémarrer
```

Journaux système : `/var/log/nginx/access.log` et `/var/log/nginx/error.log`.
En local : `/tmp/nginx-local/logs/` (ou `$NGINX_TEMP/logs/`).

## Dépannage

**`open() "/run/nginx.pid" failed`** — dossier de PID absent pour le service système :

```bash
sudo mkdir -p /run/nginx && sudo chown -R www-data:www-data /run/nginx
```

**`Permission denied` sur le port 80** — un port sous 1024 demande les droits root. Utiliser `sudo`, ou passer
`PORT` (`PORT=8080 npm run install:nginx`).

**Les calques restent vides** — `assets/scripts/core/env.js` manque ou pointe vers la mauvaise API. Le fichier
est généré par `start-nginx-local.sh` ; en production, le créer d'après `.env.example` et vérifier
`SHARD_API_BASE_URL` dans la console du navigateur.

**Une modification de script ou de style n'apparaît pas** — vider le cache du navigateur. La configuration
demande une revalidation des `.js` et `.css`, mais un cache déjà rempli par une ancienne configuration peut
persister.

**Configuration invalide** — `sudo nginx -t` affiche le fichier et la ligne en cause.
