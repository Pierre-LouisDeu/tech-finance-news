# Architecture: Tech Finance News Aggregator

## Overview

Application backend Node.js/TypeScript qui automatise la veille des actualités financières tech via scraping, filtrage intelligent, résumé IA et centralisation Notion.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VPS (Hetzner/OVH)                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Node.js Application                           │  │
│  │                                                                       │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │  │
│  │  │   Cron      │───▶│   Main      │───▶│   Logger    │               │  │
│  │  │  Scheduler  │    │  Pipeline   │    │   (pino)    │               │  │
│  │  └─────────────┘    └──────┬──────┘    └─────────────┘               │  │
│  │                            │                                          │  │
│  │         ┌──────────────────┼──────────────────┐                      │  │
│  │         ▼                  ▼                  ▼                      │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │  │
│  │  │   Scraper   │    │   Filter    │    │ Summarizer  │               │  │
│  │  │ (Playwright)│    │  (Hybrid)   │    │ (OpenAI)    │               │  │
│  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘               │  │
│  │         │                  │                  │                      │  │
│  │         ▼                  ▼                  ▼                      │  │
│  │  ┌─────────────────────────────────────────────────────┐             │  │
│  │  │                    SQLite DB                        │             │  │
│  │  │  (articles, processing_status, sync_history)        │             │  │
│  │  └─────────────────────────────────────────────────────┘             │  │
│  │                            │                                          │  │
│  │                            ▼                                          │  │
│  │                     ┌─────────────┐                                  │  │
│  │                     │   Notion    │                                  │  │
│  │                     │   Pusher    │                                  │  │
│  │                     └─────────────┘                                  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌───────────┐   ┌───────────┐   ┌───────────┐
             │   Zone    │   │  OpenAI   │   │  Notion   │
             │  Bourse   │   │    API    │   │    API    │
             └───────────┘   └───────────┘   └───────────┘
```

---

## Technology Decisions

| Composant | Choix | Justification |
|-----------|-------|---------------|
| **Runtime** | Node.js 20+ LTS | Écosystème riche, async natif |
| **Language** | TypeScript 5.x | Type safety, meilleur DX |
| **Scraping** | Playwright | Moderne, auto-wait, bon TS support |
| **Database** | SQLite (better-sqlite3) | Léger, sans serveur, déduplication facile |
| **LLM** | OpenAI GPT-4o-mini | Bon rapport qualité/prix |
| **Logging** | Pino | Performant, structured JSON logs |
| **Hosting** | VPS Hetzner/OVH | Économique, contrôle total |
| **Scheduling** | node-cron | Simple, fiable pour usage interne |

---

## Project Structure

```
tech-finance-news/
├── src/
│   ├── index.ts              # Entry point
│   ├── pipeline.ts           # Main orchestration
│   ├── config/
│   │   ├── index.ts          # Configuration loader
│   │   ├── keywords.ts       # Tech keywords list
│   │   └── env.ts            # Environment validation
│   ├── scraper/
│   │   ├── index.ts          # Scraper factory
│   │   ├── zonebourse.ts     # Zone Bourse scraper
│   │   └── types.ts          # Scraper interfaces
│   ├── filter/
│   │   ├── index.ts          # Hybrid filter orchestrator
│   │   ├── keywords.ts       # Keyword matcher
│   │   └── ai-validator.ts   # GPT validation
│   ├── summarizer/
│   │   ├── index.ts          # Summarizer service
│   │   └── prompts.ts        # GPT prompts
│   ├── notion/
│   │   ├── index.ts          # Notion client wrapper
│   │   └── mapper.ts         # Article to Notion mapper
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   ├── schema.ts         # SQLite schema
│   │   └── queries.ts        # Prepared statements
│   ├── utils/
│   │   ├── logger.ts         # Pino logger setup
│   │   ├── retry.ts          # Exponential backoff
│   │   └── rate-limiter.ts   # API rate limiting
│   └── types/
│       └── index.ts          # Shared types
├── data/
│   └── news.db               # SQLite database file
├── logs/
│   └── app.log               # Rotating log files
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## Core Components

### 1. Scraper Module

**Responsabilité**: Extraire les articles de Zone Bourse

```typescript
interface Article {
  id: string;              // Hash du titre + date
  title: string;
  url: string;
  publishedAt: Date;
  content: string;         // Texte complet de l'article
  source: 'zonebourse';
}

interface Scraper {
  scrape(): Promise<Article[]>;
}
```

**Stratégie Zone Bourse**:
- URL cible: `https://www.zonebourse.com/actualites/economie/`
- Navigation avec Playwright (headless)
- Extraction des liens d'articles de la page listing
- Visite de chaque article pour extraire le contenu
- Rate limiting: 2-3 secondes entre chaque requête

### 2. Filter Module

**Responsabilité**: Identifier les articles tech-related

**Approche hybride**:

```
Article ──▶ Keyword Filter ──▶ Match? ──▶ AI Validator ──▶ Tech? ──▶ Accept
                │                              │
                └── No match ──▶ Reject        └── Non-tech ──▶ Reject
```

**Keywords configurables** (`config/keywords.ts`):
```typescript
export const TECH_KEYWORDS = {
  companies: ['Apple', 'Microsoft', 'Google', 'Amazon', 'Meta', 'NVIDIA',
              'Tesla', 'AMD', 'Intel', 'Netflix', 'Salesforce', 'Oracle',
              'IBM', 'SAP', 'Adobe', 'Qualcomm', 'Broadcom'],
  themes: ['IA', 'intelligence artificielle', 'cloud', 'semi-conducteurs',
           'cybersécurité', 'blockchain', 'crypto', '5G', 'IoT'],
  terms: ['tech', 'technologie', 'startup', 'fintech', 'big tech',
          'GAFA', 'FAANG', 'licenciements tech', 'IPO tech']
};
```

**AI Validation Prompt**:
```
Cet article concerne-t-il principalement l'actualité financière
d'une entreprise tech ou du secteur technologique ?

Titre: {title}
Contenu: {first_500_chars}

Répondre uniquement par OUI ou NON.
```

### 3. Summarizer Module

**Responsabilité**: Générer résumés via GPT-4o-mini

**Deux formats**:

| Format | Description | Tokens estimés |
|--------|-------------|----------------|
| **Court** | 2-3 phrases, l'essentiel | ~100 output |
| **Détaillé** | Points clés, impact, entreprises | ~300 output |

**Prompt résumé court**:
```
Tu es un analyste financier. Résume cet article en 2-3 phrases maximum.
Focus sur: les faits clés, les chiffres importants, l'impact potentiel.

Article:
{content}
```

### 4. Notion Pusher Module

**Responsabilité**: Synchroniser les articles vers Notion

**Mapping vers Notion Database**:

| Champ Article | Propriété Notion | Type |
|---------------|------------------|------|
| `title` | Title | title |
| `publishedAt` | Date Publication | date |
| `summary.short` | Résumé | rich_text |
| `url` | Lien Source | url |
| `source` | Source | select |
| `processedAt` | Traité le | date |

**Déduplication**: Vérification via `id` (hash) stocké dans SQLite avant push.

### 5. Database Schema

```sql
-- Articles table
CREATE TABLE articles (
  id TEXT PRIMARY KEY,           -- Hash(title + publishedAt)
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,
  published_at DATETIME NOT NULL,
  source TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Processing status
CREATE TABLE processing_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  stage TEXT NOT NULL,           -- 'scraped', 'filtered', 'summarized', 'pushed'
  status TEXT NOT NULL,          -- 'success', 'failed', 'skipped'
  error_message TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- Summaries
CREATE TABLE summaries (
  article_id TEXT PRIMARY KEY,
  short_summary TEXT NOT NULL,
  detailed_summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- Notion sync tracking
CREATE TABLE notion_sync (
  article_id TEXT PRIMARY KEY,
  notion_page_id TEXT NOT NULL,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- Indexes
CREATE INDEX idx_articles_published ON articles(published_at);
CREATE INDEX idx_processing_stage ON processing_log(stage, status);
```

---

## Data Flow

```
1. SCRAPE
   ├── Playwright ouvre Zone Bourse
   ├── Extrait liste articles (titre, URL, date)
   ├── Pour chaque article non-existant en DB:
   │   ├── Visite la page article
   │   ├── Extrait contenu complet
   │   └── Sauvegarde en SQLite (status: scraped)
   └── Retourne nouveaux articles

2. FILTER
   ├── Pour chaque article scraped:
   │   ├── Applique keyword filter
   │   ├── Si match: appelle GPT pour validation
   │   ├── Si validé: marque "filtered"
   │   └── Sinon: marque "skipped"
   └── Retourne articles filtrés

3. SUMMARIZE
   ├── Pour chaque article filtered:
   │   ├── Appelle GPT-4o-mini (résumé court)
   │   ├── Stocke résumé en DB
   │   └── Marque "summarized"
   └── Retourne articles résumés

4. PUSH
   ├── Pour chaque article summarized non-synced:
   │   ├── Crée page Notion
   │   ├── Stocke notion_page_id
   │   └── Marque "pushed"
   └── Log récapitulatif
```

---

## Error Handling

### Retry Strategy (Exponential Backoff)

```typescript
interface RetryConfig {
  maxAttempts: number;      // 3
  initialDelayMs: number;   // 1000
  maxDelayMs: number;       // 30000
  factor: number;           // 2
}

// Délais: 1s → 2s → 4s → fail
```

### Error Categories

| Catégorie | Action | Exemple |
|-----------|--------|---------|
| **Transient** | Retry | Network timeout, rate limit |
| **Permanent** | Skip + Log | Article non trouvé, parsing error |
| **Critical** | Alert + Stop | API key invalide, DB corruption |

### Circuit Breaker

Pour les APIs externes (OpenAI, Notion):
- Seuil: 5 erreurs consécutives
- Cooldown: 5 minutes
- Fallback: Skip processing, log warning

---

## Configuration

### Environment Variables

```bash
# .env.example

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Notion
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=...

# Scraping
SCRAPE_INTERVAL_HOURS=3
SCRAPE_RATE_LIMIT_MS=2000
USER_AGENT=Mozilla/5.0 (compatible; NewsBot/1.0)

# Database
DB_PATH=./data/news.db

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### Scheduling

```typescript
// Exécution toutes les 3 heures, 8h-20h (heures de marché Europe)
// Cron: "0 8,11,14,17,20 * * 1-5"

const SCHEDULE = {
  expression: '0 8,11,14,17,20 * * 1-5',  // Lun-Ven, 5 fois/jour
  timezone: 'Europe/Paris'
};
```

---

## API Rate Limits

| Service | Limite | Stratégie |
|---------|--------|-----------|
| Zone Bourse | Non documenté | 2s entre requêtes, user-agent réaliste |
| OpenAI | 10K RPM (tier 1) | Queue avec rate limiter |
| Notion | 3 req/sec | Batch + throttle |

---

## Observability

### Logging (Pino)

```typescript
// Structured JSON logs
{
  "level": "info",
  "time": 1704672000000,
  "msg": "Article processed",
  "article_id": "abc123",
  "stage": "summarized",
  "duration_ms": 1523
}
```

### Metrics à surveiller

| Métrique | Description |
|----------|-------------|
| `articles_scraped` | Nombre d'articles extraits par run |
| `articles_filtered` | Taux de passage du filtre |
| `api_calls_openai` | Appels GPT (suivi coûts) |
| `api_calls_notion` | Appels Notion API |
| `errors_by_stage` | Erreurs par étape pipeline |
| `run_duration_ms` | Durée totale du pipeline |

---

## Security Considerations

| Aspect | Mesure |
|--------|--------|
| **Secrets** | Variables d'environnement, jamais en code |
| **API Keys** | Rotation périodique recommandée |
| **Scraping** | Respecter robots.txt, rate limiting |
| **Data** | SQLite local uniquement, pas de données sensibles |

---

## Deployment

### VPS Setup (Hetzner/OVH)

```bash
# 1. Provisionner VPS (Ubuntu 22.04, 2GB RAM minimum)

# 2. Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Installer Playwright dependencies
npx playwright install-deps chromium

# 4. Clone & setup
git clone <repo>
cd tech-finance-news
npm install
cp .env.example .env
# Éditer .env avec vraies valeurs

# 5. Build
npm run build

# 6. Setup systemd service
sudo nano /etc/systemd/system/news-aggregator.service

# 7. Start
sudo systemctl enable news-aggregator
sudo systemctl start news-aggregator
```

### Systemd Service

```ini
[Unit]
Description=Tech Finance News Aggregator
After=network.target

[Service]
Type=simple
User=newsbot
WorkingDirectory=/home/newsbot/tech-finance-news
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## Extension Points (Phase 2)

| Feature | Approach |
|---------|----------|
| **Multi-sources** | Interface `Scraper`, nouveaux scrapers par source |
| **Déduplication cross-source** | Similarity matching sur titres (fuzzy) |
| **Analyse détaillée** | Second appel GPT avec prompt enrichi |
| **Notifications** | Webhook Discord/Telegram après push |

---

## Risks & Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Zone Bourse change structure HTML | Moyenne | Élevé | Selectors résilients, alertes sur erreurs parsing |
| Blocage IP | Faible | Élevé | User-agent réaliste, rate limit, rotation IP si nécessaire |
| Coûts OpenAI dépassent budget | Faible | Moyen | Monitoring tokens, cache résumés, limite quotidienne |
| Downtime Notion API | Faible | Moyen | Queue locale, retry, sync différée |

---

## Decision Log

| Date | Décision | Raison |
|------|----------|--------|
| 2026-01-07 | Playwright vs Puppeteer | Meilleur support TS, auto-wait, plus moderne |
| 2026-01-07 | SQLite vs JSON files | Déduplication robuste, queries flexibles |
| 2026-01-07 | GPT-4o-mini vs GPT-4o | Rapport qualité/prix optimal pour résumés |
| 2026-01-07 | VPS vs Railway | Contrôle total, économique long terme |
| 2026-01-07 | Pino vs Winston | Performance, JSON structured logs natif |

---

*Document créé le: 2026-01-07*
*Statut: Draft - En attente de validation*
