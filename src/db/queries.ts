/**
 * Database Queries and Operations
 */

import crypto from 'crypto';
import { getDatabase } from './index.js';
import type {
  Article,
  ArticleSource,
  ArticleSummary,
  ProcessingLog,
  ProcessingStage,
  ProcessingStatus,
  NotionSync,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Article Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate article ID from title and date
 */
export function generateArticleId(title: string, publishedAt: Date): string {
  const input = `${title.trim().toLowerCase()}${publishedAt.toISOString()}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Check if article exists by ID
 */
export function articleExists(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('SELECT 1 FROM articles WHERE id = ?');
  return stmt.get(id) !== undefined;
}

/**
 * Check if article exists by URL
 */
export function articleExistsByUrl(url: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('SELECT 1 FROM articles WHERE url = ?');
  return stmt.get(url) !== undefined;
}

/**
 * Insert a new article
 */
export function insertArticle(article: Omit<Article, 'createdAt'>): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO articles (id, title, url, content, published_at, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    article.id,
    article.title,
    article.url,
    article.content,
    article.publishedAt.toISOString(),
    article.source
  );
}

/**
 * Update article content
 */
export function updateArticleContent(id: string, content: string): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE articles SET content = ? WHERE id = ?');
  stmt.run(content, id);
}

/**
 * Get articles with empty content
 */
export function getArticlesWithEmptyContent(limit: number = 50): Article[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM articles
    WHERE content IS NULL OR content = ''
    ORDER BY published_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as ArticleRow[];
  return rows.map(mapArticleRow);
}

/**
 * Get article by ID
 */
export function getArticleById(id: string): Article | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM articles WHERE id = ?');
  const row = stmt.get(id) as ArticleRow | undefined;
  return row ? mapArticleRow(row) : null;
}

/**
 * Get articles by stage and status
 */
export function getArticlesByStage(
  stage: ProcessingStage,
  status: ProcessingStatus = 'success'
): Article[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT DISTINCT a.* FROM articles a
    INNER JOIN processing_log pl ON a.id = pl.article_id
    WHERE pl.stage = ? AND pl.status = ?
    ORDER BY a.published_at DESC
  `);
  const rows = stmt.all(stage, status) as ArticleRow[];
  return rows.map(mapArticleRow);
}

/**
 * Get articles that need processing at a specific stage
 */
export function getArticlesNeedingProcessing(stage: ProcessingStage): Article[] {
  const db = getDatabase();

  // Get articles that have completed the previous stage but not this one
  const previousStage = getPreviousStage(stage);

  let stmt;
  if (previousStage) {
    stmt = db.prepare(`
      SELECT a.* FROM articles a
      INNER JOIN processing_log pl ON a.id = pl.article_id
      WHERE pl.stage = ? AND pl.status = 'success'
      AND a.id NOT IN (
        SELECT article_id FROM processing_log WHERE stage = ?
      )
      ORDER BY a.published_at DESC
    `);
    return (stmt.all(previousStage, stage) as ArticleRow[]).map(mapArticleRow);
  } else {
    // For 'scraped' stage, get articles not in processing_log at all
    stmt = db.prepare(`
      SELECT a.* FROM articles a
      WHERE a.id NOT IN (
        SELECT DISTINCT article_id FROM processing_log
      )
      ORDER BY a.published_at DESC
    `);
    return (stmt.all() as ArticleRow[]).map(mapArticleRow);
  }
}

/**
 * Get unsynced articles (summarized but not pushed to Notion)
 */
export function getUnsyncedArticles(): Article[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT a.* FROM articles a
    INNER JOIN processing_log pl ON a.id = pl.article_id
    WHERE pl.stage = 'summarized' AND pl.status = 'success'
    AND a.id NOT IN (SELECT article_id FROM notion_sync)
    ORDER BY a.published_at DESC
  `);
  return (stmt.all() as ArticleRow[]).map(mapArticleRow);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Processing Log Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log processing status for an article
 */
export function logProcessing(
  articleId: string,
  stage: ProcessingStage,
  status: ProcessingStatus,
  errorMessage?: string
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO processing_log (article_id, stage, status, error_message)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(articleId, stage, status, errorMessage ?? null);
}

/**
 * Get latest processing status for an article
 */
export function getLatestProcessingStatus(articleId: string): ProcessingLog | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM processing_log
    WHERE article_id = ?
    ORDER BY processed_at DESC
    LIMIT 1
  `);
  const row = stmt.get(articleId) as ProcessingLogRow | undefined;
  return row ? mapProcessingLogRow(row) : null;
}

/**
 * Get processing history for an article
 */
export function getProcessingHistory(articleId: string): ProcessingLog[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM processing_log
    WHERE article_id = ?
    ORDER BY processed_at ASC
  `);
  const rows = stmt.all(articleId) as ProcessingLogRow[];
  return rows.map(mapProcessingLogRow);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Insert or update article summary
 */
export function upsertSummary(
  articleId: string,
  shortSummary: string,
  detailedSummary?: string,
  tokensUsed?: number
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO summaries (article_id, short_summary, detailed_summary, tokens_used)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(article_id) DO UPDATE SET
      short_summary = excluded.short_summary,
      detailed_summary = excluded.detailed_summary,
      tokens_used = excluded.tokens_used,
      created_at = datetime('now')
  `);
  stmt.run(articleId, shortSummary, detailedSummary ?? null, tokensUsed ?? null);
}

/**
 * Get summary for an article
 */
export function getSummary(articleId: string): ArticleSummary | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM summaries WHERE article_id = ?');
  const row = stmt.get(articleId) as SummaryRow | undefined;
  return row ? mapSummaryRow(row) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notion Sync Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record Notion sync for an article
 */
export function recordNotionSync(articleId: string, notionPageId: string): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO notion_sync (article_id, notion_page_id)
    VALUES (?, ?)
    ON CONFLICT(article_id) DO UPDATE SET
      notion_page_id = excluded.notion_page_id,
      synced_at = datetime('now')
  `);
  stmt.run(articleId, notionPageId);
}

/**
 * Check if article is synced to Notion
 */
export function isArticleSynced(articleId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('SELECT 1 FROM notion_sync WHERE article_id = ?');
  return stmt.get(articleId) !== undefined;
}

/**
 * Get Notion sync info for an article
 */
export function getNotionSync(articleId: string): NotionSync | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM notion_sync WHERE article_id = ?');
  const row = stmt.get(articleId) as NotionSyncRow | undefined;
  return row ? mapNotionSyncRow(row) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Statistics
// ═══════════════════════════════════════════════════════════════════════════════

export interface DbStats {
  totalArticles: number;
  articlesByStage: Record<ProcessingStage, number>;
  articlesSynced: number;
  lastProcessedAt: Date | null;
}

/**
 * Get database statistics
 */
export function getStats(): DbStats {
  const db = getDatabase();

  const totalArticles = (
    db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number }
  ).count;

  const stageCountsRaw = db
    .prepare(
      `
    SELECT stage, COUNT(DISTINCT article_id) as count
    FROM processing_log
    WHERE status = 'success'
    GROUP BY stage
  `
    )
    .all() as { stage: ProcessingStage; count: number }[];

  const articlesByStage: Record<ProcessingStage, number> = {
    scraped: 0,
    filtered: 0,
    summarized: 0,
    pushed: 0,
  };

  for (const row of stageCountsRaw) {
    articlesByStage[row.stage] = row.count;
  }

  const articlesSynced = (
    db.prepare('SELECT COUNT(*) as count FROM notion_sync').get() as { count: number }
  ).count;

  const lastProcessedRow = db
    .prepare('SELECT MAX(processed_at) as last FROM processing_log')
    .get() as { last: string | null };

  return {
    totalArticles,
    articlesByStage,
    articlesSynced,
    lastProcessedAt: lastProcessedRow.last ? new Date(lastProcessedRow.last) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

function getPreviousStage(stage: ProcessingStage): ProcessingStage | null {
  const stages: ProcessingStage[] = ['scraped', 'filtered', 'summarized', 'pushed'];
  const index = stages.indexOf(stage);
  return index > 0 ? stages[index - 1]! : null;
}

// Row types for database results
interface ArticleRow {
  id: string;
  title: string;
  url: string;
  content: string | null;
  published_at: string;
  source: string;
  created_at: string;
}

interface ProcessingLogRow {
  id: number;
  article_id: string;
  stage: string;
  status: string;
  error_message: string | null;
  processed_at: string;
}

interface SummaryRow {
  article_id: string;
  short_summary: string;
  detailed_summary: string | null;
  tokens_used: number | null;
  created_at: string;
}

interface NotionSyncRow {
  article_id: string;
  notion_page_id: string;
  synced_at: string;
}

// Mappers
function mapArticleRow(row: ArticleRow): Article {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    content: row.content ?? '',
    publishedAt: new Date(row.published_at),
    source: row.source as ArticleSource,
    createdAt: new Date(row.created_at),
  };
}

function mapProcessingLogRow(row: ProcessingLogRow): ProcessingLog {
  return {
    id: row.id,
    articleId: row.article_id,
    stage: row.stage as ProcessingStage,
    status: row.status as ProcessingStatus,
    errorMessage: row.error_message ?? undefined,
    processedAt: new Date(row.processed_at),
  };
}

function mapSummaryRow(row: SummaryRow): ArticleSummary {
  return {
    articleId: row.article_id,
    shortSummary: row.short_summary,
    detailedSummary: row.detailed_summary ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

function mapNotionSyncRow(row: NotionSyncRow): NotionSync {
  return {
    articleId: row.article_id,
    notionPageId: row.notion_page_id,
    syncedAt: new Date(row.synced_at),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Daily Digest Queries
// ═══════════════════════════════════════════════════════════════════════════════

export interface ArticleWithSummary {
  article: Article;
  summary: ArticleSummary;
}

/**
 * Get today's synced articles with their summaries
 */
export function getTodaySyncedArticles(): ArticleWithSummary[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      a.*,
      s.short_summary,
      s.detailed_summary,
      s.created_at as summary_created_at
    FROM articles a
    INNER JOIN notion_sync ns ON a.id = ns.article_id
    INNER JOIN summaries s ON a.id = s.article_id
    WHERE date(ns.synced_at) = date('now', 'localtime')
    ORDER BY a.published_at DESC
  `);

  interface JoinedRow extends ArticleRow {
    short_summary: string;
    detailed_summary: string | null;
    summary_created_at: string;
  }

  const rows = stmt.all() as JoinedRow[];

  return rows.map((row) => ({
    article: mapArticleRow(row),
    summary: {
      articleId: row.id,
      shortSummary: row.short_summary,
      detailedSummary: row.detailed_summary ?? undefined,
      createdAt: new Date(row.summary_created_at),
    },
  }));
}
