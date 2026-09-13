#!/usr/bin/env bash
# Lanceur de la génération des cartes (utilisé par cron, voir install-cron.sh).
# - charge ../../.env
# - empêche deux exécutions simultanées
# - prépare l'environnement virtuel Python et les binaires MinedMap
# - journalise dans ../../logs/map-generator/
#
# Usage : ./run.sh [--update-tools] [options de generate_maps.py]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAPS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CACHE_DIR="$SCRIPT_DIR/.cache"
VENV_DIR="$SCRIPT_DIR/.venv"
LOG_DIR="$MAPS_DIR/logs/map-generator"
MMVG_REPO="https://github.com/Azerxim/MinedMap-Viewer-Generator.git"
MMVG_DIR="$CACHE_DIR/MinedMap-Viewer-Generator"

mkdir -p "$CACHE_DIR" "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

exec 9>"$CACHE_DIR/run.lock"
if ! flock -n 9; then
    echo "Une génération est déjà en cours, abandon."
    exit 1
fi

if [ -f "$MAPS_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$MAPS_DIR/.env"
    set +a
fi

UPDATE_TOOLS=0
if [ "${1:-}" = "--update-tools" ]; then
    UPDATE_TOOLS=1
    shift
fi

# Environnement virtuel Python (paramiko pour le SFTP)
if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo "Création de l'environnement virtuel..."
    python3 -m venv "$VENV_DIR"
    UPDATE_TOOLS=1
fi
if [ "$UPDATE_TOOLS" = 1 ]; then
    "$VENV_DIR/bin/python" -m pip install --quiet --upgrade pip
    "$VENV_DIR/bin/python" -m pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
fi

# Binaires MinedMap fournis par MinedMap Viewer Generator
if [ ! -d "$MMVG_DIR/.git" ]; then
    echo "Récupération de MinedMap Viewer Generator..."
    git clone --depth 1 "$MMVG_REPO" "$MMVG_DIR"
elif [ "$UPDATE_TOOLS" = 1 ]; then
    git -C "$MMVG_DIR" pull --ff-only
fi
chmod +x "$MMVG_DIR/MinedMap/MinedMap-2.2.0" "$MMVG_DIR/MinedMap/1.19/"* 2>/dev/null || true

echo "=== Génération des cartes : $(date) ==="
status=0
"$VENV_DIR/bin/python" "$SCRIPT_DIR/generate_maps.py" "$@" || status=$?

# Conserver 12 semaines de journaux
find "$LOG_DIR" -name '*.log' -mtime +84 -delete

exit "$status"
