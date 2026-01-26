#!/bin/bash

# Script de réparation du backend Paw Legal
# Usage: ./fix-backend.sh

COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[1;33m'
COLOR_RESET='\033[0m'

echo_info() {
    echo -e "${COLOR_BLUE}ℹ️  $1${COLOR_RESET}"
}

echo_success() {
    echo -e "${COLOR_GREEN}✅ $1${COLOR_RESET}"
}

echo_error() {
    echo -e "${COLOR_RED}❌ $1${COLOR_RESET}"
}

echo_warning() {
    echo -e "${COLOR_YELLOW}⚠️  $1${COLOR_RESET}"
}

echo ""
echo "🔧 Réparation du Backend Paw Legal"
echo "===================================="
echo ""

# Trouver le répertoire backend
BACKEND_DIR=""
if [ -d "/var/www/pawlegal/backend" ]; then
    BACKEND_DIR="/var/www/pawlegal/backend"
elif [ -d "$HOME/pawlegal/backend" ]; then
    BACKEND_DIR="$HOME/pawlegal/backend"
elif [ -d "./backend" ]; then
    BACKEND_DIR="./backend"
else
    echo_error "Répertoire backend non trouvé !"
    echo_info "Recherche dans le système..."
    BACKEND_DIR=$(find /var/www ~ -name "server.js" -type f 2>/dev/null | head -1 | xargs dirname)
    if [ -z "$BACKEND_DIR" ]; then
        echo_error "Impossible de trouver le backend. Veuillez spécifier le chemin:"
        echo "Usage: BACKEND_DIR=/chemin/vers/backend ./fix-backend.sh"
        exit 1
    fi
fi

echo_success "Backend trouvé dans: $BACKEND_DIR"
cd "$BACKEND_DIR" || exit 1

# Vérifier le fichier .env
echo ""
echo_info "Vérification du fichier .env..."
if [ ! -f ".env" ]; then
    echo_error "Fichier .env n'existe pas !"
    echo_info "Création du fichier .env..."
    cat > .env << EOF
PORT=3005
MONGODB_URI=votre_mongodb_uri_ici
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
NODE_ENV=production
EOF
    echo_warning "Fichier .env créé. VEUILLEZ LE MODIFIER avec vos vraies valeurs !"
    echo "Éditez-le avec: nano .env"
    read -p "Appuyez sur Entrée après avoir modifié .env..."
else
    echo_success "Fichier .env existe"
    
    # Vérifier PORT
    if ! grep -q "PORT=3005" .env; then
        echo_warning "PORT n'est pas défini à 3005 dans .env"
        if ! grep -q "^PORT=" .env; then
            echo "PORT=3005" >> .env
            echo_success "PORT=3005 ajouté à .env"
        fi
    fi
fi

# Vérifier les dépendances
echo ""
echo_info "Vérification des dépendances..."
if [ ! -d "node_modules" ]; then
    echo_warning "node_modules n'existe pas. Installation..."
    npm install --production
else
    echo_success "node_modules existe"
fi

# Vérifier que server.js existe
if [ ! -f "server.js" ]; then
    echo_error "server.js n'existe pas dans $BACKEND_DIR"
    exit 1
fi

# Arrêter l'ancien processus s'il existe
echo ""
echo_info "Arrêt des anciens processus..."
pm2 delete pawlegal-backend 2>/dev/null || true
pkill -f "node.*server.js" 2>/dev/null || true
sleep 2

# Vérifier que le port est libre
if sudo ss -tlnp 2>/dev/null | grep -q ":3005"; then
    echo_warning "Le port 3005 est déjà utilisé"
    PID=$(sudo ss -tlnp | grep :3005 | awk '{print $6}' | cut -d',' -f2 | cut -d'=' -f2 | head -1)
    if [ ! -z "$PID" ]; then
        echo_info "Arrêt du processus utilisant le port 3005 (PID: $PID)"
        sudo kill -9 $PID 2>/dev/null || true
        sleep 2
    fi
fi

# Créer le répertoire logs
mkdir -p logs

# Tester le démarrage manuel
echo ""
echo_info "Test du démarrage (5 secondes)..."
timeout 5 node server.js > /tmp/backend-test.log 2>&1 &
TEST_PID=$!
sleep 3

if ps -p $TEST_PID > /dev/null 2>&1; then
    echo_success "Le serveur démarre correctement"
    kill $TEST_PID 2>/dev/null || true
    sleep 1
else
    echo_error "Le serveur ne démarre pas correctement"
    echo_info "Logs du test:"
    cat /tmp/backend-test.log
    echo ""
    echo_error "Vérifiez les erreurs ci-dessus"
    exit 1
fi

# Démarrer avec PM2
echo ""
echo_info "Démarrage avec PM2..."

if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
else
    pm2 start server.js --name pawlegal-backend --env production
fi

sleep 3

# Vérifier le statut
if pm2 list | grep -q "pawlegal-backend.*online"; then
    echo_success "Backend démarré avec PM2"
    pm2 save
    
    # Tester la connexion
    echo ""
    echo_info "Test de connexion..."
    sleep 2
    if curl -s http://localhost:3005/api > /dev/null 2>&1; then
        echo_success "Backend accessible sur http://localhost:3005/api"
        curl -s http://localhost:3005/api | head -3
    else
        echo_warning "Backend démarré mais ne répond pas encore. Vérifiez les logs:"
        echo "pm2 logs pawlegal-backend"
    fi
else
    echo_error "Le backend n'a pas démarré correctement"
    echo_info "Logs:"
    pm2 logs pawlegal-backend --lines 20 --nostream
    exit 1
fi

echo ""
echo_success "Réparation terminée !"
echo ""
echo_info "Commandes utiles:"
echo "  - Voir les logs: pm2 logs pawlegal-backend"
echo "  - Voir le statut: pm2 status"
echo "  - Redémarrer: pm2 restart pawlegal-backend"
echo "  - Tester: curl http://localhost:3005/api"

