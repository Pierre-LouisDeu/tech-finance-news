# Deployment Guide

Guide de déploiement du Tech Finance News Aggregator.

## Architecture Production

L'application utilise :
- **PostgreSQL** comme base de données externe
- **Crontab serveur** pour le scheduling (pas de scheduler interne)
- **One-shot execution** : chaque exécution traite les articles et se termine

## Options de déploiement

1. **Dokploy + PostgreSQL** (recommandé) - PaaS self-hosted
2. **Docker Compose** - Déploiement manuel sur VPS

---

# Option 1: Déploiement Dokploy

## Prérequis Dokploy

- Instance Dokploy installée sur votre serveur
- PostgreSQL installé sur le serveur (ou service PostgreSQL Dokploy)
- Compte OpenAI avec API key
- Compte Notion avec integration configurée

## Configuration Dokploy

### 1. Créer la base de données PostgreSQL

```bash
# Sur le serveur
sudo -u postgres psql

CREATE DATABASE tech_finance_news;
CREATE USER techfinance WITH PASSWORD 'votre_mot_de_passe_securise';
GRANT ALL PRIVILEGES ON DATABASE tech_finance_news TO techfinance;
\c tech_finance_news
GRANT ALL ON SCHEMA public TO techfinance;
\q
```

### 2. Créer l'application dans Dokploy

Dans Dokploy :
1. Créer un nouveau projet
2. Ajouter une application de type "Docker"
3. Connecter votre repository Git

### 3. Variables d'environnement

Ajouter ces variables dans Dokploy > Settings > Environment :

```
OPENAI_API_KEY=sk-...
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=...
DATABASE_URL=postgresql://techfinance:votre_mot_de_passe@localhost:5432/tech_finance_news
NODE_ENV=production
TZ=Europe/Paris
```

### 4. Configurer le CRON serveur

L'application n'a plus de scheduler interne. Configurez le crontab du serveur :

```bash
# Éditer le crontab
crontab -e

# Ajouter les lignes suivantes (ajustez le chemin)
SHELL=/bin/bash
TZ=Europe/Paris

# Tech Finance News Pipeline - Lun-Ven à 8h, 11h, 14h, 17h, 20h
0 8,11,14,17,20 * * 1-5 /opt/tech-finance/scripts/run-pipeline.sh >> /var/log/tech-finance.log 2>&1
```

### 5. Script de démarrage

Créez le script `/opt/tech-finance/scripts/run-pipeline.sh` :

```bash
#!/bin/bash
set -e

# Charger l'environnement
source /opt/tech-finance/.env

# Exécuter le pipeline via Docker
docker run --rm \
  --network host \
  -e DATABASE_URL="$DATABASE_URL" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e NOTION_API_KEY="$NOTION_API_KEY" \
  -e NOTION_DATABASE_ID="$NOTION_DATABASE_ID" \
  -e TZ="$TZ" \
  tech-finance-news:latest \
  node dist/index.js --run

echo "[$(date)] Pipeline completed"
```

### 6. Déployer

Cliquer sur "Deploy" - Dokploy va :
1. Build l'image Docker
2. L'image reste prête, le cron déclenchera l'exécution

### 7. Vérifier les logs

```bash
# Logs du pipeline
tail -f /var/log/tech-finance.log

# Logs du conteneur (si en cours)
docker logs tech-finance-news
```

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
- `DATABASE_URL` - URL de connexion PostgreSQL (fournie par docker-compose pour dev local)

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

Le scheduling est géré via le crontab du serveur (pas de scheduler interne) :

```bash
# Éditer le crontab
crontab -e

# Exemples de configurations

# Toutes les 2 heures de 8h à 20h, lundi-vendredi
0 8,10,12,14,16,18,20 * * 1-5 /chemin/vers/run-pipeline.sh

# Toutes les 4 heures
0 */4 * * * /chemin/vers/run-pipeline.sh

# Configuration par défaut (8h, 11h, 14h, 17h, 20h lun-ven)
0 8,11,14,17,20 * * 1-5 /chemin/vers/run-pipeline.sh
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
