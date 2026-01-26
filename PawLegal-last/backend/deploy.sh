#!/bin/bash

# Script de déploiement complet pour Paw Legal
# Usage: ./deploy.sh [backend|frontend|all]

set -e  # Arrêter en cas d'erreur

COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_RED='\033[0;31m'
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

deploy_backend() {
    echo_info "🚀 Déploiement du backend..."
    
    cd backend || exit 1
    
    # Sauvegarder les logs
    if [ -d "logs" ]; then
        echo_info "📦 Sauvegarde des logs..."
        cp -r logs "logs_backup_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    fi
    
    # Créer le répertoire logs s'il n'existe pas
    mkdir -p logs
    
    # Installation des dépendances
    echo_info "📥 Installation des dépendances..."
    npm install --production
    
    # Vérifier que le fichier .env existe
    if [ ! -f ".env" ]; then
        echo_error "Le fichier .env n'existe pas !"
        exit 1
    fi
    
    # Redémarrer avec PM2
    echo_info "🔄 Redémarrage de l'application..."
    if pm2 list | grep -q "pawlegal-backend"; then
        pm2 restart pawlegal-backend
    else
        pm2 start ecosystem.config.js
        pm2 save
    fi
    
    # Attendre un peu pour que l'application démarre
    sleep 3
    
    # Vérifier le statut
    if pm2 list | grep -q "pawlegal-backend.*online"; then
        echo_success "Backend déployé avec succès !"
        pm2 status pawlegal-backend
    else
        echo_error "Le backend n'a pas démarré correctement"
        pm2 logs pawlegal-backend --lines 50
        exit 1
    fi
    
    cd ..
}

deploy_frontend() {
    echo_info "🚀 Déploiement du frontend..."
    
    cd frontend || exit 1
    
    # Sauvegarder les logs
    if [ -d "logs" ]; then
        echo_info "📦 Sauvegarde des logs..."
        cp -r logs "logs_backup_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    fi
    
    # Créer le répertoire logs s'il n'existe pas
    mkdir -p logs
    
    # Installation des dépendances
    echo_info "📥 Installation des dépendances..."
    npm install --production
    
    # Vérifier que le fichier .env.production existe
    if [ ! -f ".env.production" ]; then
        echo_error "Le fichier .env.production n'existe pas !"
        exit 1
    fi
    
    # Build de l'application
    echo_info "🔨 Build de l'application Next.js..."
    npm run build
    
    # Redémarrer avec PM2
    echo_info "🔄 Redémarrage de l'application..."
    if pm2 list | grep -q "pawlegal-frontend"; then
        pm2 restart pawlegal-frontend
    else
        pm2 start ecosystem.config.js
        pm2 save
    fi
    
    # Attendre un peu pour que l'application démarre
    sleep 3
    
    # Vérifier le statut
    if pm2 list | grep -q "pawlegal-frontend.*online"; then
        echo_success "Frontend déployé avec succès !"
        pm2 status pawlegal-frontend
    else
        echo_error "Le frontend n'a pas démarré correctement"
        pm2 logs pawlegal-frontend --lines 50
        exit 1
    fi
    
    cd ..
}

# Vérifier que PM2 est installé
if ! command -v pm2 &> /dev/null; then
    echo_error "PM2 n'est pas installé. Installez-le avec: npm install -g pm2"
    exit 1
fi

# Gérer les arguments
case "${1:-all}" in
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all)
        deploy_backend
        echo ""
        deploy_frontend
        echo ""
        echo_success "Déploiement complet terminé !"
        echo_info "Statut de toutes les applications:"
        pm2 status
        ;;
    *)
        echo_error "Usage: $0 [backend|frontend|all]"
        exit 1
        ;;
esac


