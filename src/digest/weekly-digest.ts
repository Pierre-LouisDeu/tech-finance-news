/**
 * Weekly Digest Module
 *
 * Generates a weekly summary of all processed articles
 * and pushes it to Notion as a special briefing page
 */

import OpenAI from 'openai';
import { Client } from '@notionhq/client';
import { query, queryOne } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getWeeklySyncedArticles, type ArticleWithSummary } from '../db/queries.js';
import type { DigestResult } from './index.js';

/**
 * Weekly briefing record from database
 */
export interface WeeklyBriefing {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  articleCount: number;
  globalSummary: string;
  notionPageId?: string;
  createdAt?: Date;
}

/**
 * Weekly digest structure
 */
export interface WeeklyDigest {
  weekStart: string;
  weekEnd: string;
  articleCount: number;
  globalSummary: string;
  articles: {
    title: string;
    shortSummary: string;
    url: string;
    source: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Date Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get ISO week start (Monday) for a given date
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get ISO week end (Sunday) for a given date
 */
export function getWeekEnd(date: Date): Date {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return weekEnd;
}

/**
 * Get previous week's Monday date
 */
export function getPreviousWeekStart(): Date {
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  return currentWeekStart;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════════════════════

interface WeeklyBriefingRow {
  week_start: Date;
  week_end: Date;
  article_count: number;
  global_summary: string;
  notion_page_id: string | null;
  created_at: Date;
}

function mapWeeklyBriefingRow(row: WeeklyBriefingRow): WeeklyBriefing {
  return {
    weekStart:
      row.week_start instanceof Date
        ? row.week_start.toISOString().split('T')[0]!
        : String(row.week_start),
    weekEnd:
      row.week_end instanceof Date ? row.week_end.toISOString().split('T')[0]! : String(row.week_end),
    articleCount: row.article_count,
    globalSummary: row.global_summary,
    notionPageId: row.notion_page_id ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Check if weekly briefing already exists
 */
export async function weeklyBriefingExists(weekStartDate: string): Promise<boolean> {
  const row = await queryOne('SELECT 1 FROM weekly_briefings WHERE week_start = $1', [
    weekStartDate,
  ]);
  return row !== null;
}

/**
 * Get weekly briefing by week start date
 */
export async function getWeeklyBriefing(weekStartDate: string): Promise<WeeklyBriefing | null> {
  const row = await queryOne<WeeklyBriefingRow>(
    'SELECT * FROM weekly_briefings WHERE week_start = $1',
    [weekStartDate]
  );
  return row ? mapWeeklyBriefingRow(row) : null;
}

/**
 * Save or update weekly briefing in database
 */
export async function saveWeeklyBriefing(briefing: WeeklyBriefing): Promise<void> {
  await query(
    `INSERT INTO weekly_briefings (week_start, week_end, article_count, global_summary, notion_page_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(week_start) DO UPDATE SET
       week_end = EXCLUDED.week_end,
       article_count = EXCLUDED.article_count,
       global_summary = EXCLUDED.global_summary,
       notion_page_id = COALESCE(EXCLUDED.notion_page_id, weekly_briefings.notion_page_id),
       created_at = NOW()`,
    [
      briefing.weekStart,
      briefing.weekEnd,
      briefing.articleCount,
      briefing.globalSummary,
      briefing.notionPageId ?? null,
    ]
  );
  logger.debug({ weekStart: briefing.weekStart }, 'Weekly briefing saved to database');
}

/**
 * Update weekly briefing with Notion page ID
 */
export async function updateWeeklyBriefingNotionId(
  weekStartDate: string,
  notionPageId: string
): Promise<void> {
  await query('UPDATE weekly_briefings SET notion_page_id = $1 WHERE week_start = $2', [
    notionPageId,
    weekStartDate,
  ]);
}

/**
 * Get recent weekly briefings for navigation
 */
export async function getRecentWeeklyBriefings(limit: number = 12): Promise<WeeklyBriefing[]> {
  const rows = await query<WeeklyBriefingRow>(
    `SELECT * FROM weekly_briefings
     ORDER BY week_start DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(mapWeeklyBriefingRow);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Digest Generation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate weekly digest from week's articles
 */
export async function generateWeeklyDigest(weekStartDate?: string): Promise<WeeklyDigest | null> {
  const weekStart = weekStartDate ? new Date(weekStartDate) : getPreviousWeekStart();
  const weekStartStr = weekStart.toISOString().split('T')[0]!;
  const weekEnd = getWeekEnd(weekStart);
  const weekEndStr = weekEnd.toISOString().split('T')[0]!;

  const articlesWithSummaries = await getWeeklySyncedArticles(weekStartStr);

  if (articlesWithSummaries.length === 0) {
    logger.info({ weekStart: weekStartStr }, 'No articles synced this week, skipping digest');
    return null;
  }

  logger.info(
    { count: articlesWithSummaries.length, weekStart: weekStartStr, weekEnd: weekEndStr },
    'Generating weekly digest'
  );

  // Build context for GPT
  const articlesContext = articlesWithSummaries
    .map((a, i) => `${i + 1}. ${a.article.title}\n   ${a.summary.shortSummary}`)
    .join('\n\n');

  // Generate global summary via GPT
  const globalSummary = await generateWeeklySummary(
    articlesContext,
    articlesWithSummaries.length,
    weekStartStr,
    weekEndStr
  );

  const digest: WeeklyDigest = {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    articleCount: articlesWithSummaries.length,
    globalSummary,
    articles: articlesWithSummaries.map((a) => ({
      title: a.article.title,
      shortSummary: a.summary.shortSummary,
      url: a.article.url,
      source: a.article.source,
    })),
  };

  logger.info(
    { weekStart: weekStartStr, weekEnd: weekEndStr, articles: digest.articleCount },
    'Weekly digest generated'
  );

  return digest;
}

/**
 * Generate weekly summary using GPT
 */
async function generateWeeklySummary(
  context: string,
  count: number,
  weekStart: string,
  weekEnd: string
): Promise<string> {
  if (!config.openai.apiKey) {
    logger.warn('OpenAI API key not configured, using fallback summary');
    return `${count} articles traites cette semaine (${weekStart} - ${weekEnd}). Consultez les details ci-dessous.`;
  }

  try {
    const openai = new OpenAI({ apiKey: config.openai.apiKey });

    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `Tu es un analyste financier expert. Genere un resume executif des actualites tech/finance de la semaine en 5-7 points cles maximum.

Format attendu:
## Tendances de la semaine
- Point cle 1
- Point cle 2
- Point cle 3

## Faits marquants
- Fait 1
- Fait 2

Sois concis, factuel et oriente business/investissement. Identifie les tendances recurrentes et les evenements majeurs de la semaine.`,
        },
        {
          role: 'user',
          content: `Voici les ${count} actualites tech/finance de la semaine du ${weekStart} au ${weekEnd}:\n\n${context}\n\nGenere un resume executif hebdomadaire des points cles et tendances.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content ?? 'Resume non disponible.';
  } catch (error) {
    logger.error({ error }, 'Failed to generate weekly summary');
    return `${count} articles traites cette semaine. Erreur lors de la generation du resume.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notion Integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create Notion weekly briefing page
 */
export async function createNotionWeeklyBriefingPage(
  digest: WeeklyDigest
): Promise<string | null> {
  const notionApiKey = config.notion.apiKey;
  const databaseId = config.notion.briefingDatabaseId || config.notion.databaseId;

  if (!notionApiKey || !databaseId) {
    logger.warn('Notion not configured, skipping weekly briefing push');
    return null;
  }

  const client = new Client({ auth: notionApiKey });

  try {
    // Build article blocks
    const articleBlocks = digest.articles.slice(0, 50).map((article) => ({
      object: 'block' as const,
      type: 'bulleted_list_item' as const,
      bulleted_list_item: {
        rich_text: [
          {
            type: 'text' as const,
            text: {
              content: article.title,
              link: { url: article.url },
            },
          },
          {
            type: 'text' as const,
            text: { content: ` (${article.source})` },
            annotations: { color: 'gray' as const },
          },
        ],
      },
    }));

    // Format dates for display
    const startDisplay = new Date(digest.weekStart).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    });
    const endDisplay = new Date(digest.weekEnd).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const response = await client.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: `Briefing Hebdo du ${startDisplay} au ${endDisplay}` } }],
        },
        Source: { select: { name: 'briefing-weekly' } },
        'Published Date': { date: { start: digest.weekStart } },
        'Processed Date': { date: { start: new Date().toISOString().split('T')[0]! } },
      },
      children: [
        // Header callout with stats
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '📈' },
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${digest.articleCount} articles tech/finance traites du ${startDisplay} au ${endDisplay}`,
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
            rich_text: [{ type: 'text', text: { content: 'Synthese de la semaine' } }],
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
            rich_text: [
              { type: 'text', text: { content: `Articles de la semaine (${digest.articleCount})` } },
            ],
          },
        },
        // Article list
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
                text: { content: 'Briefing hebdomadaire genere automatiquement par Tech Finance News' },
                annotations: { italic: true, color: 'gray' },
              },
            ],
          },
        },
      ],
    });

    logger.info(
      { pageId: response.id, weekStart: digest.weekStart, articles: digest.articleCount },
      'Weekly briefing pushed to Notion'
    );

    return response.id;
  } catch (error) {
    logger.error({ error, weekStart: digest.weekStart }, 'Failed to push weekly briefing to Notion');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate and push weekly digest
 */
export async function runWeeklyDigest(weekStartDate?: string): Promise<DigestResult> {
  try {
    const weekStart = weekStartDate
      ? new Date(weekStartDate)
      : getPreviousWeekStart();
    const weekStartStr = weekStart.toISOString().split('T')[0]!;

    // Check if briefing already exists for this week (deduplication)
    if (await weeklyBriefingExists(weekStartStr)) {
      logger.info({ weekStart: weekStartStr }, 'Weekly briefing already exists, skipping');
      return { success: true };
    }

    const digest = await generateWeeklyDigest(weekStartStr);

    if (!digest) {
      return { success: true }; // No articles = nothing to digest, not an error
    }

    // Save briefing to database first
    await saveWeeklyBriefing({
      weekStart: digest.weekStart,
      weekEnd: digest.weekEnd,
      articleCount: digest.articleCount,
      globalSummary: digest.globalSummary,
    });

    // Push to Notion
    const pageId = await createNotionWeeklyBriefingPage(digest);

    // Update database with Notion page ID
    if (pageId) {
      await updateWeeklyBriefingNotionId(digest.weekStart, pageId);
    }

    return {
      success: true,
      notionPageId: pageId ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, 'Weekly digest failed');
    return { success: false, error: errorMessage };
  }
}
