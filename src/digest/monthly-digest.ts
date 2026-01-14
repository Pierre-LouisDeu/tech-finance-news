/**
 * Monthly Digest Module
 *
 * Generates a monthly summary of all processed articles
 * and pushes it to Notion as a special briefing page
 */

import OpenAI from 'openai';
import { Client } from '@notionhq/client';
import { query, queryOne } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getMonthlySyncedArticles } from '../db/queries.js';
import type { DigestResult } from './index.js';

/**
 * Monthly briefing record from database
 */
export interface MonthlyBriefing {
  yearMonth: string; // YYYY-MM
  articleCount: number;
  globalSummary: string;
  notionPageId?: string;
  createdAt?: Date;
}

/**
 * Monthly digest structure
 */
export interface MonthlyDigest {
  yearMonth: string;
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
 * Get previous month in YYYY-MM format
 */
export function getPreviousMonth(): string {
  const today = new Date();
  today.setMonth(today.getMonth() - 1);
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get current month in YYYY-MM format
 */
export function getCurrentMonth(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get month name in French
 */
export function getMonthNameFr(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════════════════════

interface MonthlyBriefingRow {
  year_month: string;
  article_count: number;
  global_summary: string;
  notion_page_id: string | null;
  created_at: Date;
}

function mapMonthlyBriefingRow(row: MonthlyBriefingRow): MonthlyBriefing {
  return {
    yearMonth: row.year_month,
    articleCount: row.article_count,
    globalSummary: row.global_summary,
    notionPageId: row.notion_page_id ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Check if monthly briefing already exists
 */
export async function monthlyBriefingExists(yearMonth: string): Promise<boolean> {
  const row = await queryOne('SELECT 1 FROM monthly_briefings WHERE year_month = $1', [yearMonth]);
  return row !== null;
}

/**
 * Get monthly briefing by year-month
 */
export async function getMonthlyBriefing(yearMonth: string): Promise<MonthlyBriefing | null> {
  const row = await queryOne<MonthlyBriefingRow>(
    'SELECT * FROM monthly_briefings WHERE year_month = $1',
    [yearMonth]
  );
  return row ? mapMonthlyBriefingRow(row) : null;
}

/**
 * Save or update monthly briefing in database
 */
export async function saveMonthlyBriefing(briefing: MonthlyBriefing): Promise<void> {
  await query(
    `INSERT INTO monthly_briefings (year_month, article_count, global_summary, notion_page_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(year_month) DO UPDATE SET
       article_count = EXCLUDED.article_count,
       global_summary = EXCLUDED.global_summary,
       notion_page_id = COALESCE(EXCLUDED.notion_page_id, monthly_briefings.notion_page_id),
       created_at = NOW()`,
    [briefing.yearMonth, briefing.articleCount, briefing.globalSummary, briefing.notionPageId ?? null]
  );
  logger.debug({ yearMonth: briefing.yearMonth }, 'Monthly briefing saved to database');
}

/**
 * Update monthly briefing with Notion page ID
 */
export async function updateMonthlyBriefingNotionId(
  yearMonth: string,
  notionPageId: string
): Promise<void> {
  await query('UPDATE monthly_briefings SET notion_page_id = $1 WHERE year_month = $2', [
    notionPageId,
    yearMonth,
  ]);
}

/**
 * Get recent monthly briefings for navigation
 */
export async function getRecentMonthlyBriefings(limit: number = 12): Promise<MonthlyBriefing[]> {
  const rows = await query<MonthlyBriefingRow>(
    `SELECT * FROM monthly_briefings
     ORDER BY year_month DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(mapMonthlyBriefingRow);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Digest Generation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate monthly digest from month's articles
 */
export async function generateMonthlyDigest(yearMonth?: string): Promise<MonthlyDigest | null> {
  const targetMonth = yearMonth ?? getPreviousMonth();
  const articlesWithSummaries = await getMonthlySyncedArticles(targetMonth);

  if (articlesWithSummaries.length === 0) {
    logger.info({ yearMonth: targetMonth }, 'No articles synced this month, skipping digest');
    return null;
  }

  logger.info(
    { count: articlesWithSummaries.length, yearMonth: targetMonth },
    'Generating monthly digest'
  );

  // Build context for GPT (limit to top 100 articles to avoid token limits)
  const topArticles = articlesWithSummaries.slice(0, 100);
  const articlesContext = topArticles
    .map((a, i) => `${i + 1}. ${a.article.title}\n   ${a.summary.shortSummary}`)
    .join('\n\n');

  // Generate global summary via GPT
  const globalSummary = await generateMonthlySummary(
    articlesContext,
    articlesWithSummaries.length,
    targetMonth
  );

  const digest: MonthlyDigest = {
    yearMonth: targetMonth,
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
    { yearMonth: targetMonth, articles: digest.articleCount },
    'Monthly digest generated'
  );

  return digest;
}

/**
 * Generate monthly summary using GPT
 */
async function generateMonthlySummary(
  context: string,
  count: number,
  yearMonth: string
): Promise<string> {
  if (!config.openai.apiKey) {
    logger.warn('OpenAI API key not configured, using fallback summary');
    const monthName = getMonthNameFr(yearMonth);
    return `${count} articles traites en ${monthName}. Consultez les details ci-dessous.`;
  }

  try {
    const openai = new OpenAI({ apiKey: config.openai.apiKey });
    const monthName = getMonthNameFr(yearMonth);

    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `Tu es un analyste financier expert. Genere un resume executif des actualites tech/finance du mois en 7-10 points cles maximum.

Format attendu:
## Tendances majeures du mois
- Tendance 1
- Tendance 2
- Tendance 3

## Evenements marquants
- Evenement 1
- Evenement 2
- Evenement 3

## Perspectives
- Perspective 1
- Perspective 2

Sois concis, factuel et oriente business/investissement. Identifie les grandes tendances du mois, les evenements majeurs et les perspectives pour les prochains mois.`,
        },
        {
          role: 'user',
          content: `Voici les principales actualites tech/finance du mois de ${monthName} (${count} articles au total, les 100 premiers sont presentes ici):\n\n${context}\n\nGenere un resume executif mensuel complet.`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content ?? 'Resume non disponible.';
  } catch (error) {
    logger.error({ error }, 'Failed to generate monthly summary');
    return `${count} articles traites ce mois. Erreur lors de la generation du resume.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notion Integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create Notion monthly briefing page
 */
export async function createNotionMonthlyBriefingPage(
  digest: MonthlyDigest
): Promise<string | null> {
  const notionApiKey = config.notion.apiKey;
  const databaseId = config.notion.briefingDatabaseId || config.notion.databaseId;

  if (!notionApiKey || !databaseId) {
    logger.warn('Notion not configured, skipping monthly briefing push');
    return null;
  }

  const client = new Client({ auth: notionApiKey });

  try {
    // Build article blocks (limit to 50 to stay within Notion limits)
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

    const monthName = getMonthNameFr(digest.yearMonth);

    const response = await client.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: `Briefing Mensuel - ${monthName}` } }],
        },
        Source: { select: { name: 'briefing-monthly' } },
        'Published Date': { date: { start: `${digest.yearMonth}-01` } },
        'Processed Date': { date: { start: new Date().toISOString().split('T')[0]! } },
      },
      children: [
        // Header callout with stats
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '📅' },
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${digest.articleCount} articles tech/finance traites en ${monthName}`,
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
            rich_text: [{ type: 'text', text: { content: 'Synthese du mois' } }],
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
              {
                type: 'text',
                text: { content: `Selection d'articles (${Math.min(50, digest.articleCount)} sur ${digest.articleCount})` },
              },
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
                text: { content: 'Briefing mensuel genere automatiquement par Tech Finance News' },
                annotations: { italic: true, color: 'gray' },
              },
            ],
          },
        },
      ],
    });

    logger.info(
      { pageId: response.id, yearMonth: digest.yearMonth, articles: digest.articleCount },
      'Monthly briefing pushed to Notion'
    );

    return response.id;
  } catch (error) {
    logger.error({ error, yearMonth: digest.yearMonth }, 'Failed to push monthly briefing to Notion');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate and push monthly digest
 */
export async function runMonthlyDigest(yearMonth?: string): Promise<DigestResult> {
  try {
    const targetMonth = yearMonth ?? getPreviousMonth();

    // Check if briefing already exists for this month (deduplication)
    if (await monthlyBriefingExists(targetMonth)) {
      logger.info({ yearMonth: targetMonth }, 'Monthly briefing already exists, skipping');
      return { success: true };
    }

    const digest = await generateMonthlyDigest(targetMonth);

    if (!digest) {
      return { success: true }; // No articles = nothing to digest, not an error
    }

    // Save briefing to database first
    await saveMonthlyBriefing({
      yearMonth: digest.yearMonth,
      articleCount: digest.articleCount,
      globalSummary: digest.globalSummary,
    });

    // Push to Notion
    const pageId = await createNotionMonthlyBriefingPage(digest);

    // Update database with Notion page ID
    if (pageId) {
      await updateMonthlyBriefingNotionId(digest.yearMonth, pageId);
    }

    return {
      success: true,
      notionPageId: pageId ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, 'Monthly digest failed');
    return { success: false, error: errorMessage };
  }
}
