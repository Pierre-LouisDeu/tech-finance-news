/**
 * SQLite Database Schema
 */

export const SCHEMA = `
-- ═══════════════════════════════════════════════════════════════════════════════
-- Articles Table
-- Stores scraped article data
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  content TEXT,
  published_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'zonebourse',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Processing Log Table
-- Tracks article processing through pipeline stages
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS processing_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('scraped', 'filtered', 'summarized', 'pushed')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Summaries Table
-- Stores AI-generated article summaries
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS summaries (
  article_id TEXT PRIMARY KEY,
  short_summary TEXT NOT NULL,
  detailed_summary TEXT,
  tokens_used INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Notion Sync Table
-- Tracks articles synced to Notion
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notion_sync (
  article_id TEXT PRIMARY KEY,
  notion_page_id TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Daily Briefings Table
-- Stores daily digest summaries for archive/navigation
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS daily_briefings (
  date TEXT PRIMARY KEY,                          -- YYYY-MM-DD format
  article_count INTEGER NOT NULL DEFAULT 0,
  global_summary TEXT NOT NULL,
  notion_page_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes for Performance
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
CREATE INDEX IF NOT EXISTS idx_processing_log_article ON processing_log(article_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_stage_status ON processing_log(stage, status);
CREATE INDEX IF NOT EXISTS idx_processing_log_processed_at ON processing_log(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date ON daily_briefings(date DESC);
`;

export const MIGRATIONS: string[] = [
  // Future migrations can be added here
  // Each migration should be idempotent (use IF NOT EXISTS, etc.)
];
