#!/bin/bash

# Script de démarrage local de nginx (sans sudo, pour développement)
# Utilise un port alternative si 80 n'est pas disponible

HOST=0.0.0.0
PORT=3005
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_PATH="$SCRIPT_DIR"
NGINX_CONF="$SCRIPT_DIR/nginx.conf"
NGINX_TEMP="/tmp/nginx-local"
ENV_FILE="$SCRIPT_DIR/.env"

echo "=========================================="
echo "Démarrage local de nginx"
echo "=========================================="
echo "Port: $PORT"
echo "Racine: $ROOT_PATH"
echo "Config: $NGINX_CONF"
echo ""

# Vérifier que le fichier nginx.conf existe
if [ ! -f "$NGINX_CONF" ]; then
    echo "❌ Erreur: Le fichier nginx.conf n'existe pas à $NGINX_CONF"
    exit 1
fi

# Charger les variables du fichier .env (voir .env.example) s'il existe
if [ -f "$ENV_FILE" ]; then
    echo "✓ Chargement de $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
else
    echo "⚠ Aucun fichier .env trouvé, valeurs par défaut utilisées (voir .env.example)"
fi

# Mode développement (npm run dev) : .env.development surcharge .env
# (API locale, ShardUI-2 sur le serveur Vite pour l'échange de jeton de l'éditeur)
ENV_DEV_FILE="$SCRIPT_DIR/.env.development"
if [ "$MAPS_ENV" = "development" ] && [ -f "$ENV_DEV_FILE" ]; then
    echo "✓ Mode développement : chargement de $ENV_DEV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_DEV_FILE"
    set +a
fi

# Générer assets/scripts/env.js à partir des variables d'environnement, lu par
# shard-api.js via window.SHARD_API_BASE_URL. Fichier généré, non versionné.
echo "✓ Génération de assets/scripts/env.js..."
cat > "$SCRIPT_DIR/assets/scripts/env.js" << EOF
// Fichier généré automatiquement par start-nginx-local.sh à partir de .env.
// Ne pas éditer à la main ni committer (voir .gitignore).
window.SHARD_API_BASE_URL = "${SHARD_API_BASE_URL:-http://localhost:8000/api}";
window.UI_BASE_URL = "${UI_BASE_URL:-http://localhost:5173}";
window.UI_ALLOWED_ORIGINS = "${UI_ALLOWED_ORIGINS:-}";
EOF

# Créer un dossier temporaire pour les fichiers de nginx
mkdir -p "$NGINX_TEMP"/{cache,pid,logs}

# Arrêter les processus existants sur le port
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠ Le port $PORT est déjà utilisé, arrêt des processus existants..."
    PID=$(lsof -Pi :$PORT -sTCP:LISTEN -t)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null
        sleep 1
        echo "✓ Processus arrêté"
    fi
fi

# Créer une configuration temporaire avec les variables remplacées
echo "✓ Génération de la configuration nginx..."
sed -e "s|{{PORT}}|$PORT|g" \
    -e "s|{{ROOT_PATH}}|$ROOT_PATH|g" \
    -e "s|{{NGINX_TEMP}}|$NGINX_TEMP|g" \
    "$NGINX_CONF" > "$NGINX_TEMP/nginx.conf"

if [ ! -f "$NGINX_TEMP/nginx.conf" ]; then
    echo "❌ Erreur: Impossible de générer la configuration nginx"
    exit 1
fi

# Configuration pour ajouter au début du fichier nginx généré
cat > "$NGINX_TEMP/nginx.full.conf" << EOF
worker_processes auto;
pid $NGINX_TEMP/pid/nginx.pid;
error_log $NGINX_TEMP/logs/error.log warn;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log $NGINX_TEMP/logs/access.log;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    gzip on;
    gzip_types text/plain text/css text/javascript application/javascript text/xml application/xml application/xml+rss;
    gzip_min_length 1000;

    include $NGINX_TEMP/nginx.conf;
}
EOF

echo "✓ Configuration générée"

echo "✓ Démarrage sur $HOST:$PORT"
echo ""
echo "Accédez à: http://localhost:$PORT"
echo ""
echo "Pour arrêter: Ctrl+C"
echo ""

# Démarrer nginx
/usr/sbin/nginx -c "$NGINX_TEMP/nginx.full.conf" -g "daemon off;"
