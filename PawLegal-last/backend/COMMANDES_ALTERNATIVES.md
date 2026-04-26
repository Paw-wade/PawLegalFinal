# Commandes Alternatives - Ubuntu Moderne

Sur Ubuntu récent, certaines commandes classiques ne sont plus installées par défaut. Voici les alternatives.

## 🔍 Vérification des Ports

### Au lieu de `netstat`, utilisez `ss` :

```bash
# Vérifier les ports ouverts
sudo ss -tlnp

# Vérifier un port spécifique (3005)
sudo ss -tlnp | grep 3005

# Vérifier un port spécifique (3000)
sudo ss -tlnp | grep 3000

# Voir tous les ports en écoute
sudo ss -tlnp

# Voir les connexions actives
sudo ss -tn
```

### Ou installer net-tools (si vous préférez netstat) :

```bash
sudo apt update
sudo apt install -y net-tools
# Ensuite vous pouvez utiliser netstat normalement
sudo netstat -tlnp
```

## 📊 Commandes Utiles avec `ss`

```bash
# Ports en écoute avec processus
sudo ss -tlnp

# Ports en écoute IPv4 seulement
sudo ss -tlnp4

# Ports en écoute IPv6 seulement
sudo ss -tlnp6

# Voir les connexions établies
sudo ss -tn state established

# Voir les connexions en attente
sudo ss -tn state listening
```

## 🔄 Équivalences de Commandes

| Ancienne commande | Nouvelle commande |
|-------------------|-------------------|
| `netstat -tlnp` | `ss -tlnp` |
| `netstat -an` | `ss -an` |
| `netstat -rn` | `ip route` |
| `ifconfig` | `ip addr` ou `ip a` |
| `route` | `ip route` |

## 🔍 Diagnostic Backend avec `ss`

```bash
# Vérifier si le port 3005 est utilisé
sudo ss -tlnp | grep 3005

# Voir quel processus utilise le port
sudo ss -tlnp | grep 3005

# Voir toutes les connexions sur le port 3005
sudo ss -tn | grep 3005

# Voir les détails complets
sudo ss -tlnp sport = :3005
```

## 📝 Script de Diagnostic Mis à Jour

```bash
#!/bin/bash
echo "=== Diagnostic Backend ==="
echo ""
echo "1. Processus Node.js:"
ps aux | grep node | grep -v grep
echo ""
echo "2. Port 3005:"
sudo ss -tlnp | grep 3005 || echo "Port 3005 non utilisé"
echo ""
echo "3. Port 3000:"
sudo ss -tlnp | grep 3000 || echo "Port 3000 non utilisé"
echo ""
echo "4. PM2 Status:"
pm2 list
echo ""
echo "5. Test de connexion:"
curl -v http://localhost:3005/api 2>&1 | head -10
```

## 🛠️ Installation des Outils Utiles

```bash
# Installer net-tools (netstat, ifconfig, etc.)
sudo apt update
sudo apt install -y net-tools

# Installer lsof (pour voir les fichiers ouverts)
sudo apt install -y lsof

# Installer htop (monitoring amélioré)
sudo apt install -y htop

# Installer tree (affichage arborescent)
sudo apt install -y tree
```

## 🔍 Commandes de Diagnostic Complètes

```bash
# Voir tous les ports en écoute
sudo ss -tlnp

# Voir les connexions actives
sudo ss -tn

# Voir les statistiques réseau
ss -s

# Voir les processus utilisant des ports
sudo ss -tlnp | grep -E ':(3000|3005|80|443)'

# Voir les connexions établies sur un port
sudo ss -tn state established sport = :3005
```

---

**Note** : `ss` est plus moderne et plus rapide que `netstat`. Il est recommandé de l'utiliser à la place de `netstat`.


