-- Tech Finance News Aggregator
-- PostgreSQL Database Schema

-- ═══════════════════════════════════════════════════════════════════════════════
-- Articles Table
-- Stores scraped article data
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  content TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'abcbourse',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Processing Log Table
-- Tracks article processing through pipeline stages
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS processing_log (
  id SERIAL PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('scraped', 'filtered', 'summarized', 'pushed')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Summaries Table
-- Stores AI-generated article summaries
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS summaries (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  short_summary TEXT NOT NULL,
  detailed_summary TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Notion Sync Table
-- Tracks articles synced to Notion
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notion_sync (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  notion_page_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Daily Briefings Table
-- Stores daily digest summaries for archive/navigation
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS daily_briefings (
  date DATE PRIMARY KEY,
  article_count INTEGER NOT NULL DEFAULT 0,
  global_summary TEXT NOT NULL,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes for Performance
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
CREATE INDEX IF NOT EXISTS idx_processing_log_article ON processing_log(article_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_stage_status ON processing_log(stage, status);
CREATE INDEX IF NOT EXISTS idx_processing_log_processed_at ON processing_log(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_notion_sync_synced_at ON notion_sync(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date ON daily_briefings(date DESC);
