# Tech Finance News Aggregator

> Veille automatisée des actualités financières tech via scraping, résumé IA et centralisation Notion

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production
npm start
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start in development mode with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled production build |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Type-check without emitting |
| `npm run pipeline` | Run the news pipeline manually |

## Project Structure

```
src/
├── index.ts              # Entry point
├── pipeline.ts           # Main orchestration (TODO)
├── config/
│   ├── index.ts          # Configuration loader
│   ├── env.ts            # Environment validation
│   └── keywords.ts       # Tech keywords list
├── scraper/              # Playwright scraping (TODO)
├── filter/               # Hybrid filtering (TODO)
├── summarizer/           # GPT summarization (TODO)
├── notion/               # Notion integration (TODO)
├── db/                   # SQLite database (TODO)
├── utils/
│   ├── logger.ts         # Pino logger
│   ├── retry.ts          # Exponential backoff
│   └── rate-limiter.ts   # API rate limiting
└── types/
    └── index.ts          # TypeScript types
```

## Configuration

See `.env.example` for all configuration options.

Required:
- `OPENAI_API_KEY` - Your OpenAI API key
- `NOTION_API_KEY` - Your Notion integration token
- `NOTION_DATABASE_ID` - Target Notion database ID

## Development Status

**Current Sprint:** 1 - Project Setup & Infrastructure

| Story | Status | Description |
|-------|--------|-------------|
| 1.1 | Done | Project Initialization |
| 1.2 | Ready | SQLite Database Setup |
| 1.3 | Ready | Logging & Configuration |

## Documentation

- [Product Brief](docs/product-brief.md)
- [Architecture](docs/architecture.md)
- [Epics & Stories](docs/epics.md)
- [Workflow Status](docs/workflow-status.yaml)

---

Run `/workflow-status` to check current progress.
