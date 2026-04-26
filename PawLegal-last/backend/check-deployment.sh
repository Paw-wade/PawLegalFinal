#!/bin/bash

# Script de vérification du déploiement Paw Legal
# Usage: ./check-deployment.sh

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
echo "🔍 Vérification du déploiement Paw Legal"
echo "========================================"
echo ""

# Vérifier Nginx
echo_info "Vérification de Nginx..."
if systemctl is-active --quiet nginx; then
    echo_success "Nginx est actif"
else
    echo_error "Nginx n'est pas actif"
fi

# Vérifier la configuration Nginx
if sudo nginx -t &>/dev/null; then
    echo_success "Configuration Nginx valide"
else
    echo_error "Configuration Nginx invalide"
    sudo nginx -t
fi

# Vérifier PM2
echo ""
echo_info "Vérification de PM2..."
if command -v pm2 &> /dev/null; then
    echo_success "PM2 est installé"
    
    # Vérifier les applications
    BACKEND_STATUS=$(pm2 list | grep "pawlegal-backend" | awk '{print $10}' || echo "notfound")
    FRONTEND_STATUS=$(pm2 list | grep "pawlegal-frontend" | awk '{print $10}' || echo "notfound")
    
    if [ "$BACKEND_STATUS" = "online" ]; then
        echo_success "Backend est en ligne"
    else
        echo_error "Backend n'est pas en ligne"
    fi
    
    if [ "$FRONTEND_STATUS" = "online" ]; then
        echo_success "Frontend est en ligne"
    else
        echo_error "Frontend n'est pas en ligne"
    fi
else
    echo_error "PM2 n'est pas installé"
fi

# Vérifier les ports
echo ""
echo_info "Vérification des ports..."
if sudo netstat -tlnp 2>/dev/null | grep -q ":3005"; then
    echo_success "Port 3005 (backend) est ouvert"
else
    echo_error "Port 3005 (backend) n'est pas ouvert"
fi

if sudo netstat -tlnp 2>/dev/null | grep -q ":3000"; then
    echo_success "Port 3000 (frontend) est ouvert"
else
    echo_error "Port 3000 (frontend) n'est pas ouvert"
fi

if sudo netstat -tlnp 2>/dev/null | grep -q ":443"; then
    echo_success "Port 443 (HTTPS) est ouvert"
else
    echo_warning "Port 443 (HTTPS) n'est pas ouvert"
fi

# Vérifier les fichiers .env
echo ""
echo_info "Vérification des fichiers de configuration..."
if [ -f "/var/www/pawlegal/backend/.env" ]; then
    echo_success "Fichier .env backend existe"
    
    # Vérifier les variables importantes
    if grep -q "MONGODB_URI" /var/www/pawlegal/backend/.env; then
        echo_success "MONGODB_URI est configuré"
    else
        echo_error "MONGODB_URI n'est pas configuré"
    fi
    
    if grep -q "JWT_SECRET" /var/www/pawlegal/backend/.env; then
        echo_success "JWT_SECRET est configuré"
    else
        echo_error "JWT_SECRET n'est pas configuré"
    fi
else
    echo_error "Fichier .env backend n'existe pas"
fi

if [ -f "/var/www/pawlegal/frontend/.env.production" ]; then
    echo_success "Fichier .env.production frontend existe"
    
    if grep -q "NEXTAUTH_SECRET" /var/www/pawlegal/frontend/.env.production; then
        echo_success "NEXTAUTH_SECRET est configuré"
    else
        echo_error "NEXTAUTH_SECRET n'est pas configuré"
    fi
else
    echo_error "Fichier .env.production frontend n'existe pas"
fi

# Tester les endpoints
echo ""
echo_info "Test des endpoints..."

# Backend
BACKEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/api 2>/dev/null || echo "000")
if [ "$BACKEND_RESPONSE" = "200" ] || [ "$BACKEND_RESPONSE" = "404" ]; then
    echo_success "Backend répond (HTTP $BACKEND_RESPONSE)"
else
    echo_error "Backend ne répond pas (HTTP $BACKEND_RESPONSE)"
fi

# Frontend
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "$FRONTEND_RESPONSE" = "200" ] || [ "$FRONTEND_RESPONSE" = "404" ]; then
    echo_success "Frontend répond (HTTP $FRONTEND_RESPONSE)"
else
    echo_error "Frontend ne répond pas (HTTP $FRONTEND_RESPONSE)"
fi

# Vérifier SSL
echo ""
echo_info "Vérification SSL..."
if [ -d "/etc/letsencrypt/live" ]; then
    CERT_COUNT=$(ls -1 /etc/letsencrypt/live 2>/dev/null | wc -l)
    if [ "$CERT_COUNT" -gt 0 ]; then
        echo_success "$CERT_COUNT certificat(s) SSL trouvé(s)"
        
        # Vérifier la date d'expiration
        for cert_dir in /etc/letsencrypt/live/*/; do
            if [ -f "$cert_dir/fullchain.pem" ]; then
                EXPIRY=$(sudo openssl x509 -enddate -noout -in "$cert_dir/fullchain.pem" 2>/dev/null | cut -d= -f2)
                echo_info "Certificat $(basename $cert_dir) expire le: $EXPIRY"
            fi
        done
    else
        echo_warning "Aucun certificat SSL trouvé"
    fi
else
    echo_warning "Let's Encrypt n'est pas configuré"
fi

# Vérifier l'espace disque
echo ""
echo_info "Vérification de l'espace disque..."
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    echo_success "Espace disque: ${DISK_USAGE}% utilisé"
else
    echo_warning "Espace disque: ${DISK_USAGE}% utilisé (considérer le nettoyage)"
fi

# Résumé
echo ""
echo "========================================"
echo_info "Vérification terminée"
echo ""
echo "Pour plus de détails:"
echo "  - PM2: pm2 status"
echo "  - Logs: pm2 logs"
echo "  - Nginx: sudo systemctl status nginx"
echo ""


