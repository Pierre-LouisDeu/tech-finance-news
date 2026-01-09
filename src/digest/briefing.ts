/**
 * Daily Briefing Module
 *
 * Manages daily briefing archive in SQLite and Notion
 * Provides structured navigation through daily summaries
 */

import { Client } from '@notionhq/client';
import { getDatabase } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { DailyDigest } from './index.js';

/**
 * Daily briefing record from database
 */
export interface DailyBriefing {
  date: string; // YYYY-MM-DD
  articleCount: number;
  globalSummary: string;
  notionPageId?: string;
  createdAt?: Date;
}

/**
 * Article reference for briefing
 */
export interface BriefingArticle {
  title: string;
  shortSummary: string;
  url: string;
  source: string;
  notionPageId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if briefing already exists for a date
 */
export function briefingExists(date: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('SELECT 1 FROM daily_briefings WHERE date = ?');
  return stmt.get(date) !== undefined;
}

/**
 * Get briefing by date
 */
export function getBriefing(date: string): DailyBriefing | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM daily_briefings WHERE date = ?');
  const row = stmt.get(date) as BriefingRow | undefined;
  return row ? mapBriefingRow(row) : null;
}

/**
 * Save or update briefing in database
 */
export function saveBriefing(briefing: DailyBriefing): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO daily_briefings (date, article_count, global_summary, notion_page_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      article_count = excluded.article_count,
      global_summary = excluded.global_summary,
      notion_page_id = COALESCE(excluded.notion_page_id, notion_page_id),
      created_at = datetime('now')
  `);
  stmt.run(
    briefing.date,
    briefing.articleCount,
    briefing.globalSummary,
    briefing.notionPageId ?? null
  );
  logger.debug({ date: briefing.date }, 'Briefing saved to database');
}

/**
 * Update briefing with Notion page ID
 */
export function updateBriefingNotionId(date: string, notionPageId: string): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE daily_briefings SET notion_page_id = ? WHERE date = ?');
  stmt.run(notionPageId, date);
}

/**
 * Get recent briefings for navigation
 */
export function getRecentBriefings(limit: number = 30): DailyBriefing[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM daily_briefings
    ORDER BY date DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as BriefingRow[];
  return rows.map(mapBriefingRow);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notion Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get articles with their Notion page IDs for linking
 */
export function getArticlesWithNotionIds(date: string): BriefingArticle[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      a.title,
      a.url,
      a.source,
      s.short_summary,
      ns.notion_page_id
    FROM articles a
    INNER JOIN notion_sync ns ON a.id = ns.article_id
    INNER JOIN summaries s ON a.id = s.article_id
    WHERE date(ns.synced_at) = ?
    ORDER BY a.published_at DESC
  `);

  interface ArticleRow {
    title: string;
    url: string;
    source: string;
    short_summary: string;
    notion_page_id: string;
  }

  const rows = stmt.all(date) as ArticleRow[];

  return rows.map((row) => ({
    title: row.title,
    shortSummary: row.short_summary,
    url: row.url,
    source: row.source,
    notionPageId: row.notion_page_id,
  }));
}

/**
 * Create Notion briefing page with article links
 */
export async function createNotionBriefingPage(
  digest: DailyDigest,
  articles: BriefingArticle[]
): Promise<string | null> {
  const notionApiKey = config.notion.apiKey;
  const databaseId = config.notion.briefingDatabaseId || config.notion.databaseId;

  if (!notionApiKey || !databaseId) {
    logger.warn('Notion not configured, skipping briefing push');
    return null;
  }

  const client = new Client({ auth: notionApiKey });

  try {
    // Build article blocks with Notion links when available
    const articleBlocks = articles.map((article) => {
      const richText: Array<{
        type: 'text';
        text: { content: string; link?: { url: string } };
        annotations?: { color: 'gray' };
      }> = [];

      // Article title with link (prefer Notion page link if available)
      if (article.notionPageId) {
        richText.push({
          type: 'text' as const,
          text: {
            content: article.title,
            link: { url: `https://notion.so/${article.notionPageId.replace(/-/g, '')}` },
          },
        });
      } else {
        richText.push({
          type: 'text' as const,
          text: {
            content: article.title,
            link: { url: article.url },
          },
        });
      }

      // Source tag
      richText.push({
        type: 'text' as const,
        text: { content: ` (${article.source})` },
        annotations: { color: 'gray' as const },
      });

      return {
        object: 'block' as const,
        type: 'bulleted_list_item' as const,
        bulleted_list_item: { rich_text: richText },
      };
    });

    // Format date for display
    const displayDate = new Date(digest.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const response = await client.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: `Briefing du ${displayDate}` } }],
        },
        Source: { select: { name: 'briefing' } },
        'Published Date': { date: { start: digest.date } },
        'Processed Date': { date: { start: digest.date } },
      },
      children: [
        // Header callout with stats
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '📊' },
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${digest.articleCount} articles tech/finance traités le ${displayDate}`,
                },
              },
            ],
          },
        },
        // Global summary heading
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: 'Points clés du jour' } }],
          },
        },
        // Global summary content
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content: digest.globalSummary },
              },
            ],
          },
        },
        // Divider
        {
          object: 'block',
          type: 'divider',
          divider: {},
        },
        // Articles heading
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: `Articles du jour (${articles.length})` } }],
          },
        },
        // Article list with links
        ...articleBlocks,
        // Footer divider
        {
          object: 'block',
          type: 'divider',
          divider: {},
        },
        // Footer
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content: 'Briefing généré automatiquement par Tech Finance News' },
                annotations: { italic: true, color: 'gray' },
              },
            ],
          },
        },
      ],
    });

    logger.info(
      { pageId: response.id, date: digest.date, articles: articles.length },
      'Daily briefing pushed to Notion'
    );

    return response.id;
  } catch (error) {
    logger.error({ error, date: digest.date }, 'Failed to push briefing to Notion');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Types & Functions
// ═══════════════════════════════════════════════════════════════════════════════

interface BriefingRow {
  date: string;
  article_count: number;
  global_summary: string;
  notion_page_id: string | null;
  created_at: string;
}

function mapBriefingRow(row: BriefingRow): DailyBriefing {
  return {
    date: row.date,
    articleCount: row.article_count,
    globalSummary: row.global_summary,
    notionPageId: row.notion_page_id ?? undefined,
    createdAt: new Date(row.created_at),
  };
}
