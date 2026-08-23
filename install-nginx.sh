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

# Copier la configuration
echo "Configuration de nginx..."
cp /home/azerxim/Documents/Shard-2/ShardUI-2-Maps/nginx.conf /etc/nginx/sites-available/shardui-maps

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
