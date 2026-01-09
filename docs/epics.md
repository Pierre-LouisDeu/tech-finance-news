# Epics & Stories: Tech Finance News Aggregator

## Overview

Ce document définit les epics et user stories pour le MVP du Tech Finance News Aggregator. Les stories sont découpées pour des sprints de 2-3 stories maximum.

---

## Epic Map

```
EPIC 1: Project Setup & Infrastructure
    ↓
EPIC 2: Scraper Module (Zone Bourse)
    ↓
EPIC 3: Filter Module (Hybrid)
    ↓
EPIC 4: Summarizer Module (OpenAI)
    ↓
EPIC 5: Notion Integration
    ↓
EPIC 6: Pipeline Orchestration & Scheduling
    ↓
EPIC 7: Deployment & Operations
```

---

## Sprint Mapping

| Sprint | Epic | Stories | Focus |
|--------|------|---------|-------|
| 1 | Epic 1 | 1.1, 1.2, 1.3 | Project foundation |
| 2 | Epic 2 | 2.1, 2.2 | Scraper core |
| 3 | Epic 2, 3 | 2.3, 3.1 | Scraper polish, Filter start |
| 4 | Epic 3 | 3.2, 3.3 | Filter complete |
| 5 | Epic 4 | 4.1, 4.2 | Summarizer |
| 6 | Epic 5 | 5.1, 5.2 | Notion integration |
| 7 | Epic 6 | 6.1, 6.2 | Pipeline & scheduling |
| 8 | Epic 7 | 7.1, 7.2 | Deployment |

**Estimation totale**: 8 sprints (~16 stories)

---

# EPIC 1: Project Setup & Infrastructure

**Objectif**: Établir les fondations du projet avec la structure, la configuration et la base de données.

**Valeur**: Infrastructure prête pour le développement des modules fonctionnels.

---

## Story 1.1: Project Initialization

**En tant que** développeur
**Je veux** un projet Node.js/TypeScript configuré
**Afin de** commencer le développement avec les bons outils

### Acceptance Criteria

- [ ] `package.json` créé avec scripts: `dev`, `build`, `start`, `lint`
- [ ] TypeScript configuré (`tsconfig.json`) avec strict mode
- [ ] ESLint + Prettier configurés
- [ ] Structure de dossiers créée (`src/`, `data/`, `logs/`)
- [ ] `.gitignore` configuré (node_modules, .env, data/, logs/)
- [ ] `.env.example` créé avec toutes les variables documentées

### Technical Notes

```bash
# Dependencies
npm init -y
npm i typescript @types/node tsx
npm i -D eslint prettier @typescript-eslint/eslint-plugin
```

### Definition of Done

- [ ] `npm run build` compile sans erreur
- [ ] `npm run dev` démarre en mode watch
- [ ] Code formaté automatiquement au save

---

## Story 1.2: SQLite Database Setup

**En tant que** système
**Je veux** une base de données SQLite initialisée
**Afin de** persister les articles et leur statut de traitement

### Acceptance Criteria

- [ ] Module `src/db/index.ts` créé avec connexion SQLite
- [ ] Schema créé avec tables: `articles`, `processing_log`, `summaries`, `notion_sync`
- [ ] Index créés pour les queries fréquentes
- [ ] Script de migration/init DB
- [ ] Queries préparées dans `src/db/queries.ts`

### Technical Notes

```typescript
// Dependencies
// npm i better-sqlite3 @types/better-sqlite3

// Connection singleton
import Database from 'better-sqlite3';
const db = new Database('./data/news.db');
```

### Definition of Done

- [ ] DB créée au démarrage si inexistante
- [ ] Tables et index présents
- [ ] CRUD basique fonctionnel

---

## Story 1.3: Logging & Configuration

**En tant que** développeur
**Je veux** un système de logging structuré et une configuration centralisée
**Afin de** débugger facilement et gérer les environnements

### Acceptance Criteria

- [ ] Logger Pino configuré dans `src/utils/logger.ts`
- [ ] Logs JSON vers console + fichier rotatif
- [ ] Niveaux de log configurables via env
- [ ] Module config dans `src/config/index.ts`
- [ ] Validation des variables d'environnement au démarrage
- [ ] Keywords tech dans `src/config/keywords.ts`

### Technical Notes

```typescript
// npm i pino pino-pretty dotenv zod

// Validation avec Zod
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  NOTION_API_KEY: z.string().min(1),
  // ...
});
```

### Definition of Done

- [ ] Logs visibles en console (dev) et fichier (prod)
- [ ] App crash proprement si config invalide
- [ ] Keywords exportés et utilisables

---

# EPIC 2: Scraper Module (Zone Bourse)

**Objectif**: Extraire les articles de la section Économie de Zone Bourse.

**Valeur**: Source de données brutes pour le pipeline.

---

## Story 2.1: Playwright Browser Setup

**En tant que** scraper
**Je veux** un navigateur Playwright configuré
**Afin de** naviguer sur Zone Bourse comme un utilisateur

### Acceptance Criteria

- [ ] Playwright installé avec Chromium
- [ ] Browser factory dans `src/scraper/browser.ts`
- [ ] Configuration headless avec user-agent réaliste
- [ ] Gestion propre du lifecycle (open/close)
- [ ] Timeout et retry configurables

### Technical Notes

```typescript
// npm i playwright

import { chromium, Browser } from 'playwright';

const browser = await chromium.launch({
  headless: true,
});
```

### Definition of Done

- [ ] Browser s'ouvre et se ferme sans leak
- [ ] User-agent custom appliqué
- [ ] Navigation vers Zone Bourse réussit

---

## Story 2.2: Article List Extraction

**En tant que** scraper
**Je veux** extraire la liste des articles de la page Économie
**Afin de** identifier les nouveaux articles à traiter

### Acceptance Criteria

- [ ] Navigation vers `https://www.zonebourse.com/actualites/economie/`
- [ ] Extraction des métadonnées: titre, URL, date
- [ ] Pagination gérée (au moins 2 pages)
- [ ] Rate limiting entre requêtes (2-3s)
- [ ] Gestion des erreurs de navigation

### Technical Notes

```typescript
// Selectors à déterminer via inspection du site
// Exemple hypothétique:
const articles = await page.$$eval('.article-item', items =>
  items.map(item => ({
    title: item.querySelector('.title')?.textContent,
    url: item.querySelector('a')?.href,
    date: item.querySelector('.date')?.textContent,
  }))
);
```

### Definition of Done

- [ ] Liste d'articles extraite avec succès
- [ ] Dates parsées en objets Date
- [ ] Pas de duplicates dans la liste
- [ ] Rate limit respecté (vérifiable dans logs)

---

## Story 2.3: Article Content Extraction

**En tant que** scraper
**Je veux** extraire le contenu complet de chaque article
**Afin de** l'analyser et le résumer

### Acceptance Criteria

- [ ] Navigation vers chaque URL d'article
- [ ] Extraction du contenu textuel principal
- [ ] Nettoyage du texte (suppression pubs, nav, footer)
- [ ] Stockage en base avec statut `scraped`
- [ ] Skip des articles déjà en base (déduplication par ID)
- [ ] Génération de l'ID via hash(titre + date)

### Technical Notes

```typescript
import crypto from 'crypto';

function generateArticleId(title: string, date: Date): string {
  return crypto
    .createHash('sha256')
    .update(`${title}${date.toISOString()}`)
    .digest('hex')
    .slice(0, 16);
}
```

### Definition of Done

- [ ] Contenu extrait lisible (pas de HTML)
- [ ] Articles sauvés en DB avec ID unique
- [ ] Logs indiquent nouveaux vs skipped
- [ ] Pas de re-scrape des articles existants

---

# EPIC 3: Filter Module (Hybrid)

**Objectif**: Identifier les articles tech parmi les articles économiques.

**Valeur**: Réduction du bruit, focus sur le contenu pertinent.

---

## Story 3.1: Keyword Filter

**En tant que** système
**Je veux** un filtre par mots-clés
**Afin de** pré-filtrer rapidement les articles potentiellement tech

### Acceptance Criteria

- [ ] Module `src/filter/keywords.ts` implémenté
- [ ] Matching case-insensitive sur titre + contenu
- [ ] Catégories de keywords: companies, themes, terms
- [ ] Retourne true/false + keywords matchés
- [ ] Logs des matches pour debug

### Technical Notes

```typescript
interface KeywordMatch {
  matched: boolean;
  keywords: string[];
  categories: string[];
}

function matchKeywords(article: Article): KeywordMatch {
  // ...
}
```

### Definition of Done

- [ ] Articles avec "Apple", "IA", etc. matchent
- [ ] Articles sans keywords tech ne matchent pas
- [ ] Performance < 10ms par article

---

## Story 3.2: AI Validator (OpenAI)

**En tant que** système
**Je veux** valider avec GPT si un article est vraiment tech
**Afin de** réduire les faux positifs du filtre keywords

### Acceptance Criteria

- [ ] Client OpenAI configuré dans `src/filter/ai-validator.ts`
- [ ] Prompt de validation binaire (OUI/NON)
- [ ] Input: titre + 500 premiers caractères
- [ ] Parsing robuste de la réponse
- [ ] Retry avec exponential backoff
- [ ] Fallback: accept si API indisponible

### Technical Notes

```typescript
// npm i openai

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model: gpt-4o-mini pour coût optimisé
```

### Definition of Done

- [ ] Appel API réussit avec réponse OUI/NON
- [ ] Retry fonctionne sur erreur transitoire
- [ ] Logs incluent token usage pour monitoring

---

## Story 3.3: Hybrid Filter Orchestrator

**En tant que** système
**Je veux** orchestrer le filtrage hybride
**Afin de** combiner efficacement keywords et IA

### Acceptance Criteria

- [ ] Module `src/filter/index.ts` orchestrant le flow
- [ ] Flow: Keywords → si match → AI validation
- [ ] Articles non-matchés marqués `skipped` en DB
- [ ] Articles validés marqués `filtered` en DB
- [ ] Métriques: total, keyword_matched, ai_validated, skipped

### Technical Notes

```
Article → Keyword Filter
            ├── No match → Skip (save to DB as skipped)
            └── Match → AI Validator
                          ├── OUI → Accept (save as filtered)
                          └── NON → Skip (save as skipped)
```

### Definition of Done

- [ ] Pipeline filter exécutable standalone
- [ ] Stats loggées en fin de run
- [ ] DB reflète le statut de chaque article

---

# EPIC 4: Summarizer Module (OpenAI)

**Objectif**: Générer des résumés IA des articles filtrés.

**Valeur**: Gain de temps lecture, information condensée.

---

## Story 4.1: Short Summary Generation

**En tant qu'** utilisateur
**Je veux** un résumé court (2-3 phrases) de chaque article
**Afin de** comprendre l'essentiel rapidement

### Acceptance Criteria

- [ ] Module `src/summarizer/index.ts` implémenté
- [ ] Prompt optimisé pour résumés financiers concis
- [ ] Limite de tokens output (~100)
- [ ] Stockage résumé dans table `summaries`
- [ ] Article marqué `summarized` après succès

### Technical Notes

```typescript
const SUMMARY_PROMPT = `Tu es un analyste financier.
Résume cet article en 2-3 phrases maximum.
Focus sur: les faits clés, les chiffres importants, l'impact potentiel.

Article:
{content}`;
```

### Definition of Done

- [ ] Résumés générés de bonne qualité
- [ ] Token usage loggé
- [ ] Résumés persistés en DB

---

## Story 4.2: Error Handling & Rate Limiting

**En tant que** système
**Je veux** gérer les erreurs et limites API OpenAI
**Afin de** maintenir la stabilité du pipeline

### Acceptance Criteria

- [ ] Rate limiter implémenté (`src/utils/rate-limiter.ts`)
- [ ] Retry avec exponential backoff (`src/utils/retry.ts`)
- [ ] Circuit breaker: stop après 5 erreurs consécutives
- [ ] Logs détaillés des erreurs API
- [ ] Métriques: success_rate, avg_latency, tokens_used

### Technical Notes

```typescript
interface RetryConfig {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
}
```

### Definition of Done

- [ ] Retry fonctionne sur 429/5xx
- [ ] Circuit breaker se déclenche après seuil
- [ ] Métriques visibles dans logs

---

# EPIC 5: Notion Integration

**Objectif**: Synchroniser les articles résumés vers Notion.

**Valeur**: Centralisation de la veille dans l'outil quotidien.

---

## Story 5.1: Notion Client Setup

**En tant que** système
**Je veux** un client Notion configuré
**Afin de** interagir avec l'API Notion

### Acceptance Criteria

- [ ] Client Notion dans `src/notion/index.ts`
- [ ] Authentification via API key
- [ ] Vérification connexion DB au démarrage
- [ ] Mapping des propriétés Notion documenté
- [ ] Gestion des erreurs API Notion

### Technical Notes

```typescript
// npm i @notionhq/client

import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});
```

### Definition of Done

- [ ] Connexion à Notion réussit au démarrage
- [ ] Database ID validé
- [ ] Erreurs auth/permissions détectées

---

## Story 5.2: Article Push to Notion

**En tant qu'** utilisateur
**Je veux** voir les articles résumés dans ma base Notion
**Afin de** consulter ma veille depuis Notion

### Acceptance Criteria

- [ ] Module `src/notion/mapper.ts` pour transformer Article → Notion page
- [ ] Création de page avec propriétés: Title, Date, Résumé, Lien, Source
- [ ] Déduplication: skip si déjà synced (via table `notion_sync`)
- [ ] Stockage du `notion_page_id` après création
- [ ] Rate limiting Notion (3 req/sec)

### Technical Notes

```typescript
// Propriétés Notion attendues
const properties = {
  Title: { title: [{ text: { content: article.title } }] },
  'Date Publication': { date: { start: article.publishedAt.toISOString() } },
  Résumé: { rich_text: [{ text: { content: summary } }] },
  'Lien Source': { url: article.url },
  Source: { select: { name: 'Zone Bourse' } },
};
```

### Definition of Done

- [ ] Articles apparaissent dans Notion
- [ ] Pas de duplicates sur re-run
- [ ] Propriétés correctement remplies

---

# EPIC 6: Pipeline Orchestration & Scheduling

**Objectif**: Orchestrer le pipeline complet et l'exécuter automatiquement.

**Valeur**: Automatisation complète de la veille.

---

## Story 6.1: Main Pipeline Orchestrator

**En tant que** système
**Je veux** un orchestrateur qui exécute le pipeline complet
**Afin de** traiter les articles de bout en bout

### Acceptance Criteria

- [ ] Module `src/pipeline.ts` orchestrant: Scrape → Filter → Summarize → Push
- [ ] Gestion des erreurs à chaque étape sans bloquer les suivantes
- [ ] Rapport de fin de run: articles_scraped, filtered, summarized, pushed
- [ ] Durée totale du run loggée
- [ ] Mode dry-run pour tests

### Technical Notes

```typescript
interface PipelineResult {
  scraped: number;
  filtered: number;
  summarized: number;
  pushed: number;
  errors: number;
  durationMs: number;
}

async function runPipeline(): Promise<PipelineResult> {
  // ...
}
```

### Definition of Done

- [ ] Pipeline exécutable via `npm run pipeline`
- [ ] Rapport clair en fin de run
- [ ] Erreurs isolées ne bloquent pas le reste

---

## Story 6.2: Cron Scheduling

**En tant qu'** utilisateur
**Je veux** que le pipeline s'exécute automatiquement
**Afin de** recevoir les actualités sans action manuelle

### Acceptance Criteria

- [ ] Scheduler avec node-cron dans `src/index.ts`
- [ ] Exécution: 8h, 11h, 14h, 17h, 20h (Lun-Ven, Europe/Paris)
- [ ] Configuration via variable d'environnement
- [ ] Log au démarrage: prochaine exécution planifiée
- [ ] Graceful shutdown (attendre fin du run en cours)

### Technical Notes

```typescript
// npm i node-cron

import cron from 'node-cron';

// "0 8,11,14,17,20 * * 1-5" = 5 fois/jour, Lun-Ven
cron.schedule(process.env.CRON_SCHEDULE, runPipeline, {
  timezone: 'Europe/Paris',
});
```

### Definition of Done

- [ ] App démarre et affiche schedule
- [ ] Pipeline se déclenche aux heures prévues
- [ ] Ctrl+C attend fin du run avant exit

---

# EPIC 7: Deployment & Operations

**Objectif**: Déployer l'application sur VPS et assurer son opération.

**Valeur**: Application en production, fonctionnelle 24/7.

---

## Story 7.1: Production Build & Docker

**En tant que** opérateur
**Je veux** un build production et une image Docker
**Afin de** déployer facilement sur VPS

### Acceptance Criteria

- [ ] Script `npm run build` produit bundle optimisé
- [ ] `Dockerfile` créé avec multi-stage build
- [ ] `docker-compose.yml` pour run local
- [ ] Variables d'environnement injectables
- [ ] Health check endpoint ou log

### Technical Notes

```dockerfile
# Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npx playwright install-deps chromium
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

### Definition of Done

- [ ] `docker build` réussit
- [ ] `docker run` démarre l'app
- [ ] Logs visibles via `docker logs`

---

## Story 7.2: VPS Deployment

**En tant qu'** opérateur
**Je veux** déployer sur un VPS Hetzner/OVH
**Afin de** faire tourner l'application en production

### Acceptance Criteria

- [ ] Documentation de setup VPS (README)
- [ ] Script ou guide d'installation
- [ ] Systemd service configuré
- [ ] Logs persistés et rotatifs
- [ ] Monitoring basique (process up/down)

### Technical Notes

```ini
# /etc/systemd/system/news-aggregator.service
[Unit]
Description=Tech Finance News Aggregator
After=network.target

[Service]
Type=simple
User=newsbot
WorkingDirectory=/home/newsbot/app
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Definition of Done

- [ ] App running sur VPS
- [ ] Redémarre auto après crash
- [ ] Logs accessibles via journalctl
- [ ] Premier run réel en production

---

# Story Status Legend

| Status | Description |
|--------|-------------|
| `draft` | Story créée, pas encore prête |
| `ready` | Story affinée, prête pour sprint |
| `in_progress` | En cours de développement |
| `review` | Code review / QA |
| `done` | Complétée et validée |
| `blocked` | Bloquée par dépendance |

---

# Dependencies Graph

```
1.1 (Project Init)
 └── 1.2 (Database) ──┐
 └── 1.3 (Logging) ───┼── 2.1 (Browser) ── 2.2 (List) ── 2.3 (Content)
                      │                                       │
                      └── 3.1 (Keywords) ─────────────────────┤
                                                              │
                      ┌── 3.2 (AI Validator) ─────────────────┤
                      │                                       │
                      └── 3.3 (Hybrid Filter) ────────────────┤
                                                              │
                          4.1 (Summarizer) ── 4.2 (Error) ────┤
                                                              │
                          5.1 (Notion Client) ── 5.2 (Push) ──┤
                                                              │
                          6.1 (Pipeline) ── 6.2 (Cron) ───────┤
                                                              │
                          7.1 (Docker) ── 7.2 (VPS) ──────────┘
```

---

# Metrics & Success Criteria

| Métrique | Cible MVP |
|----------|-----------|
| Coverage Zone Bourse | 90%+ articles tech capturés |
| Précision filtrage | <10% faux positifs |
| Disponibilité | 95%+ uptime |
| Latence Notion | <15min après publication source |
| Coût mensuel | <50€ (OpenAI + VPS) |

---

*Document créé le: 2026-01-07*
*Total: 7 Epics, 16 Stories*
*Estimation: 8 Sprints*
