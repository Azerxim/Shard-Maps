#!/usr/bin/env bash
# Installe (ou retire) la tâche cron hebdomadaire de génération des cartes.
#
# Usage : ./install-cron.sh ["m h dom mon dow"]   (défaut : lundi à 4h00)
#         ./install-cron.sh --remove
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="# Shard-Maps:map-generator"

current="$(crontab -l 2>/dev/null | grep -vF "$MARKER" || true)"

if [ "${1:-}" = "--remove" ]; then
    printf '%s\n' "$current" | sed '/^$/d' | crontab -
    echo "Tâche cron retirée."
    exit 0
fi

SCHEDULE="${1:-0 4 * * 1}"
LINE="$SCHEDULE /bin/bash $SCRIPT_DIR/run.sh >/dev/null 2>&1 $MARKER"

printf '%s\n%s\n' "$current" "$LINE" | sed '/^$/d' | crontab -
echo "Tâche cron installée : $LINE"
echo "Journaux : $(cd "$SCRIPT_DIR/../.." && pwd)/logs/map-generator/"
