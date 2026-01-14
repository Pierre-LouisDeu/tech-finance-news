/**
 * Database Queries and Operations (PostgreSQL)
 */

import crypto from 'crypto';
import { query, queryOne } from './index.js';
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
export async function articleExists(id: string): Promise<boolean> {
  const row = await queryOne('SELECT 1 FROM articles WHERE id = $1', [id]);
  return row !== null;
}

/**
 * Check if article exists by URL
 */
export async function articleExistsByUrl(url: string): Promise<boolean> {
  const row = await queryOne('SELECT 1 FROM articles WHERE url = $1', [url]);
  return row !== null;
}

/**
 * Insert a new article
 */
export async function insertArticle(article: Omit<Article, 'createdAt'>): Promise<void> {
  await query(
    `INSERT INTO articles (id, title, url, content, published_at, source)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [article.id, article.title, article.url, article.content, article.publishedAt, article.source]
  );
}

/**
 * Update article content
 */
export async function updateArticleContent(id: string, content: string): Promise<void> {
  await query('UPDATE articles SET content = $1 WHERE id = $2', [content, id]);
}

/**
 * Get articles with empty content
 */
export async function getArticlesWithEmptyContent(limit: number = 50): Promise<Article[]> {
  const rows = await query<ArticleRow>(
    `SELECT * FROM articles
     WHERE content IS NULL OR content = ''
     ORDER BY published_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(mapArticleRow);
}

/**
 * Get article by ID
 */
export async function getArticleById(id: string): Promise<Article | null> {
  const row = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = $1', [id]);
  return row ? mapArticleRow(row) : null;
}

/**
 * Get articles by stage and status
 */
export async function getArticlesByStage(
  stage: ProcessingStage,
  status: ProcessingStatus = 'success'
): Promise<Article[]> {
  const rows = await query<ArticleRow>(
    `SELECT DISTINCT a.* FROM articles a
     INNER JOIN processing_log pl ON a.id = pl.article_id
     WHERE pl.stage = $1 AND pl.status = $2
     ORDER BY a.published_at DESC`,
    [stage, status]
  );
  return rows.map(mapArticleRow);
}

/**
 * Get articles that need processing at a specific stage
 */
export async function getArticlesNeedingProcessing(stage: ProcessingStage): Promise<Article[]> {
  const previousStage = getPreviousStage(stage);

  let rows: ArticleRow[];
  if (previousStage) {
    rows = await query<ArticleRow>(
      `SELECT a.* FROM articles a
       INNER JOIN processing_log pl ON a.id = pl.article_id
       WHERE pl.stage = $1 AND pl.status = 'success'
       AND a.id NOT IN (
         SELECT article_id FROM processing_log WHERE stage = $2
       )
       ORDER BY a.published_at DESC`,
      [previousStage, stage]
    );
  } else {
    // For 'scraped' stage, get articles not in processing_log at all
    rows = await query<ArticleRow>(
      `SELECT a.* FROM articles a
       WHERE a.id NOT IN (
         SELECT DISTINCT article_id FROM processing_log
       )
       ORDER BY a.published_at DESC`
    );
  }
  return rows.map(mapArticleRow);
}

/**
 * Get unsynced articles (summarized but not pushed to Notion)
 */
export async function getUnsyncedArticles(): Promise<Article[]> {
  const rows = await query<ArticleRow>(
    `SELECT a.* FROM articles a
     INNER JOIN processing_log pl ON a.id = pl.article_id
     WHERE pl.stage = 'summarized' AND pl.status = 'success'
     AND a.id NOT IN (SELECT article_id FROM notion_sync)
     ORDER BY a.published_at DESC`
  );
  return rows.map(mapArticleRow);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Processing Log Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log processing status for an article
 */
export async function logProcessing(
  articleId: string,
  stage: ProcessingStage,
  status: ProcessingStatus,
  errorMessage?: string
): Promise<void> {
  await query(
    `INSERT INTO processing_log (article_id, stage, status, error_message)
     VALUES ($1, $2, $3, $4)`,
    [articleId, stage, status, errorMessage ?? null]
  );
}

/**
 * Get latest processing status for an article
 */
export async function getLatestProcessingStatus(articleId: string): Promise<ProcessingLog | null> {
  const row = await queryOne<ProcessingLogRow>(
    `SELECT * FROM processing_log
     WHERE article_id = $1
     ORDER BY processed_at DESC
     LIMIT 1`,
    [articleId]
  );
  return row ? mapProcessingLogRow(row) : null;
}

/**
 * Get processing history for an article
 */
export async function getProcessingHistory(articleId: string): Promise<ProcessingLog[]> {
  const rows = await query<ProcessingLogRow>(
    `SELECT * FROM processing_log
     WHERE article_id = $1
     ORDER BY processed_at ASC`,
    [articleId]
  );
  return rows.map(mapProcessingLogRow);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Insert or update article summary
 */
export async function upsertSummary(
  articleId: string,
  shortSummary: string,
  detailedSummary?: string,
  tokensUsed?: number
): Promise<void> {
  await query(
    `INSERT INTO summaries (article_id, short_summary, detailed_summary, tokens_used)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(article_id) DO UPDATE SET
       short_summary = EXCLUDED.short_summary,
       detailed_summary = EXCLUDED.detailed_summary,
       tokens_used = EXCLUDED.tokens_used,
       created_at = NOW()`,
    [articleId, shortSummary, detailedSummary ?? null, tokensUsed ?? null]
  );
}

/**
 * Get summary for an article
 */
export async function getSummary(articleId: string): Promise<ArticleSummary | null> {
  const row = await queryOne<SummaryRow>('SELECT * FROM summaries WHERE article_id = $1', [
    articleId,
  ]);
  return row ? mapSummaryRow(row) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notion Sync Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record Notion sync for an article
 */
export async function recordNotionSync(articleId: string, notionPageId: string): Promise<void> {
  await query(
    `INSERT INTO notion_sync (article_id, notion_page_id)
     VALUES ($1, $2)
     ON CONFLICT(article_id) DO UPDATE SET
       notion_page_id = EXCLUDED.notion_page_id,
       synced_at = NOW()`,
    [articleId, notionPageId]
  );
}

/**
 * Check if article is synced to Notion
 */
export async function isArticleSynced(articleId: string): Promise<boolean> {
  const row = await queryOne('SELECT 1 FROM notion_sync WHERE article_id = $1', [articleId]);
  return row !== null;
}

/**
 * Get Notion sync info for an article
 */
export async function getNotionSync(articleId: string): Promise<NotionSync | null> {
  const row = await queryOne<NotionSyncRow>('SELECT * FROM notion_sync WHERE article_id = $1', [
    articleId,
  ]);
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
export async function getStats(): Promise<DbStats> {
  const totalRow = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM articles');
  const totalArticles = parseInt(totalRow?.count ?? '0', 10);

  const stageCountsRaw = await query<{ stage: ProcessingStage; count: string }>(
    `SELECT stage, COUNT(DISTINCT article_id) as count
     FROM processing_log
     WHERE status = 'success'
     GROUP BY stage`
  );

  const articlesByStage: Record<ProcessingStage, number> = {
    scraped: 0,
    filtered: 0,
    summarized: 0,
    pushed: 0,
  };

  for (const row of stageCountsRaw) {
    articlesByStage[row.stage] = parseInt(row.count, 10);
  }

  const syncedRow = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM notion_sync');
  const articlesSynced = parseInt(syncedRow?.count ?? '0', 10);

  const lastProcessedRow = await queryOne<{ last: Date | null }>(
    'SELECT MAX(processed_at) as last FROM processing_log'
  );

  return {
    totalArticles,
    articlesByStage,
    articlesSynced,
    lastProcessedAt: lastProcessedRow?.last ?? null,
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
export async function getTodaySyncedArticles(): Promise<ArticleWithSummary[]> {
  interface JoinedRow extends ArticleRow {
    short_summary: string;
    detailed_summary: string | null;
    summary_created_at: Date;
  }

  const rows = await query<JoinedRow>(
    `SELECT
       a.*,
       s.short_summary,
       s.detailed_summary,
       s.created_at as summary_created_at
     FROM articles a
     INNER JOIN notion_sync ns ON a.id = ns.article_id
     INNER JOIN summaries s ON a.id = s.article_id
     WHERE DATE(ns.synced_at AT TIME ZONE 'Europe/Paris') = CURRENT_DATE
     ORDER BY a.published_at DESC`
  );

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

/**
 * Get synced articles with summaries for a date range
 */
export async function getSyncedArticlesByDateRange(
  startDate: string,
  endDate: string
): Promise<ArticleWithSummary[]> {
  interface JoinedRow extends ArticleRow {
    short_summary: string;
    detailed_summary: string | null;
    summary_created_at: Date;
  }

  const rows = await query<JoinedRow>(
    `SELECT
       a.*,
       s.short_summary,
       s.detailed_summary,
       s.created_at as summary_created_at
     FROM articles a
     INNER JOIN notion_sync ns ON a.id = ns.article_id
     INNER JOIN summaries s ON a.id = s.article_id
     WHERE DATE(ns.synced_at AT TIME ZONE 'Europe/Paris') >= $1::date
       AND DATE(ns.synced_at AT TIME ZONE 'Europe/Paris') <= $2::date
     ORDER BY a.published_at DESC`,
    [startDate, endDate]
  );

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

/**
 * Get synced articles with summaries for a specific week (ISO week, Monday to Sunday)
 */
export async function getWeeklySyncedArticles(weekStartDate: string): Promise<ArticleWithSummary[]> {
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndDate = weekEnd.toISOString().split('T')[0]!;

  return getSyncedArticlesByDateRange(weekStartDate, weekEndDate);
}

/**
 * Get synced articles with summaries for a specific month
 */
export async function getMonthlySyncedArticles(yearMonth: string): Promise<ArticleWithSummary[]> {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  const startDate = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${yearMonth}-${lastDay.toString().padStart(2, '0')}`;

  return getSyncedArticlesByDateRange(startDate, endDate);
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
  published_at: Date;
  source: string;
  created_at: Date;
}

interface ProcessingLogRow {
  id: number;
  article_id: string;
  stage: string;
  status: string;
  error_message: string | null;
  processed_at: Date;
}

interface SummaryRow {
  article_id: string;
  short_summary: string;
  detailed_summary: string | null;
  tokens_used: number | null;
  created_at: Date;
}

interface NotionSyncRow {
  article_id: string;
  notion_page_id: string;
  synced_at: Date;
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
