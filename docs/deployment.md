# Deployment Guide

Guide de déploiement du Tech Finance News Aggregator.

## Options de déploiement

1. **Dokploy** (recommandé) - PaaS self-hosted avec CRON intégré
2. **Docker Compose** - Déploiement manuel sur VPS

---

# Option 1: Déploiement Dokploy

## Prérequis Dokploy

- Instance Dokploy installée sur votre serveur
- Compte OpenAI avec API key
- Compte Notion avec integration configurée

## Configuration Dokploy

### 1. Créer une nouvelle application

Dans Dokploy :
1. Créer un nouveau projet
2. Ajouter une application de type "Docker"
3. Connecter votre repository Git ou uploader le code

### 2. Variables d'environnement

Ajouter ces variables dans Dokploy > Settings > Environment :

```
OPENAI_API_KEY=sk-...
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=...
NODE_ENV=production
DB_PATH=/app/data/news.db
TZ=Europe/Paris
```

### 3. Configurer le volume persistant

Dans Dokploy > Settings > Volumes :
- Source: `/app/data`
- Ceci persiste la base SQLite entre les redémarrages

### 4. Configurer le CRON

Dans Dokploy > Settings > Advanced > Cron Job :

```
# Exécution quotidienne à 8h du matin
0 8 * * *
```

Ou pour plusieurs exécutions par jour :
```
# À 8h, 12h et 18h
0 8,12,18 * * *
```

### 5. Déployer

Cliquer sur "Deploy" - Dokploy va :
1. Build l'image Docker
2. Lancer le container
3. Exécuter le pipeline selon le CRON configuré

### 6. Vérifier les logs

Dans Dokploy > Logs, vous verrez :
- Les exécutions du pipeline
- Le nombre d'articles traités
- Le digest quotidien généré

---

# Option 2: Déploiement Docker Compose (VPS manuel)

## Prérequis

- VPS avec Ubuntu 22.04+ (Hetzner, OVH, etc.)
- Docker et Docker Compose installés
- 1 GB RAM minimum
- Compte OpenAI avec API key
- Compte Notion avec integration configurée

## 1. Préparation du serveur

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Installer Docker Compose
sudo apt install docker-compose-plugin -y

# Créer le répertoire de l'application
mkdir -p ~/tech-finance-news
cd ~/tech-finance-news
```

## 2. Configuration

### Cloner le projet

```bash
git clone <votre-repo> .
# ou télécharger les fichiers manuellement
```

### Configurer les variables d'environnement

```bash
# Copier le template
cp .env.example .env

# Éditer avec vos clés
nano .env
```

Variables requises :
- `OPENAI_API_KEY` - Clé API OpenAI
- `NOTION_API_KEY` - Token d'intégration Notion
- `NOTION_DATABASE_ID` - ID de la base Notion

### Configurer la base Notion

1. Créer une nouvelle base de données Notion (vide)
2. Les propriétés sont créées automatiquement au premier lancement :
   - `Name` (Title) - Titre de l'article (propriété par défaut)
   - `Source` (Select) - Source (abcbourse)
   - `URL` (URL) - Lien vers l'article
   - `Published Date` (Date) - Date de publication
   - `Processed Date` (Date) - Date de traitement

3. Partager la base avec votre intégration Notion (permissions : lecture + écriture)

## 3. Déploiement

### Build et lancement

```bash
# Build l'image Docker
docker compose build

# Lancer en arrière-plan
docker compose up -d

# Vérifier les logs
docker compose logs -f
```

### Commandes utiles

```bash
# Voir les logs
docker compose logs -f app

# Redémarrer
docker compose restart

# Arrêter
docker compose down

# Mettre à jour
git pull
docker compose build
docker compose up -d
```

## 4. Monitoring

### Logs

Les logs sont stockés dans le container et visibles via :
```bash
docker compose logs -f --tail 100
```

### Vérifier l'état

```bash
# État des containers
docker compose ps

# Santé de l'application
docker compose exec app node -e "console.log('OK')"
```

### Base de données

Les données sont persistées dans un volume Docker :
```bash
# Voir les volumes
docker volume ls

# Sauvegarder la base
docker compose exec app cat /app/data/news.db > backup.db
```

## 5. Personnalisation

### Modifier le planning

Éditer `CRON_SCHEDULE` dans `.env` :
```bash
# Toutes les 2 heures de 8h à 20h, lundi-vendredi
CRON_SCHEDULE=0 8,10,12,14,16,18,20 * * 1-5

# Toutes les 4 heures
CRON_SCHEDULE=0 */4 * * *
```

### Modifier les mots-clés

Éditer `src/config/keywords.ts` puis rebuild :
```bash
docker compose build
docker compose up -d
```

## 6. Dépannage

### L'application ne démarre pas

```bash
# Vérifier les erreurs
docker compose logs app

# Vérifier la configuration
docker compose config
```

### Erreur OpenAI 401

- Vérifier que `OPENAI_API_KEY` est valide
- Vérifier le solde du compte OpenAI

### Erreur Notion

- Vérifier que `NOTION_API_KEY` est valide
- Vérifier que la base est partagée avec l'intégration
- Vérifier que les propriétés de la base correspondent

### Playwright échoue

```bash
# Reconstruire l'image avec les dépendances
docker compose build --no-cache
```

## 7. Coûts estimés

| Service | Coût estimé/mois |
|---------|------------------|
| VPS Hetzner CX11 | ~4€ |
| OpenAI GPT-4o-mini | ~5-15€ |
| **Total** | **~10-20€** |

## 8. Sécurité

- Ne jamais commiter le fichier `.env`
- Utiliser des secrets Docker en production
- Mettre à jour régulièrement les dépendances
- Configurer un firewall (ufw)

```bash
# Configurer ufw
sudo ufw allow ssh
sudo ufw enable
```
