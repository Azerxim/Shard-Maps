#!/bin/bash

# Script d'installation et configuration de nginx pour ShardUI-2-Maps
# Exécutez ce script avec: sudo bash install-nginx.sh

set -e

echo "=========================================="
echo "Installation et configuration de nginx"
echo "=========================================="

# Vérifier si root
if [[ $EUID -ne 0 ]]; then
   echo "Ce script doit être exécuté avec sudo"
   exit 1
fi

# Installer nginx si nécessaire
if ! command -v nginx &> /dev/null; then
    echo "Installation de nginx..."
    apt-get update
    apt-get install -y nginx
else
    echo "✓ nginx est déjà installé"
fi

# Installer PHP-FPM si nécessaire (pour les routes API)
if ! command -v php-fpm &> /dev/null; then
    echo "Installation de PHP-FPM..."
    apt-get install -y php-fpm php-cli
else
    echo "✓ PHP-FPM est déjà installé"
fi

# Créer le dossier de configuration nginx
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# Racine du site et port d'écoute (surchargeables via variables d'environnement)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_PATH="${ROOT_PATH:-$SCRIPT_DIR}"
PORT="${PORT:-80}"

# Générer la configuration à partir du template en remplaçant {{PORT}} et {{ROOT_PATH}}
echo "Configuration de nginx..."
sed -e "s|{{PORT}}|$PORT|g" \
    -e "s|{{ROOT_PATH}}|$ROOT_PATH|g" \
    "$SCRIPT_DIR/nginx.conf" > /etc/nginx/sites-available/shardui-maps

# Activer la configuration
if [ ! -L /etc/nginx/sites-enabled/shardui-maps ]; then
    ln -s /etc/nginx/sites-available/shardui-maps /etc/nginx/sites-enabled/shardui-maps
fi

# Tester la configuration
echo "Test de la configuration nginx..."
/usr/sbin/nginx -t

# Redémarrer nginx
echo "Démarrage de nginx..."
systemctl restart nginx
systemctl enable nginx

echo ""
echo "=========================================="
echo "✓ Installation terminée!"
echo "=========================================="
echo ""
echo "Le serveur nginx est maintenant actif sur http://localhost"
echo ""
echo "Pour vérifier le statut:"
echo "  systemctl status nginx"
echo ""
echo "Pour consulter les logs:"
echo "  tail -f /var/log/nginx/access.log"
echo "  tail -f /var/log/nginx/error.log"
echo ""
echo "Pour arrêter nginx:"
echo "  sudo systemctl stop nginx"
echo ""
echo "Pour redémarrer nginx après modifications:"
echo "  sudo systemctl restart nginx"
echo ""
