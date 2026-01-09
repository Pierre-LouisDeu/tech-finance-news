/**
 * Daily Digest Module
 *
 * Generates a daily summary of all processed articles
 * and pushes it to Notion as a special briefing page
 * with links to individual article pages
 */

import OpenAI from 'openai';
import { Client } from '@notionhq/client';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getTodaySyncedArticles } from '../db/queries.js';
import {
  briefingExists,
  saveBriefing,
  updateBriefingNotionId,
  getArticlesWithNotionIds,
  createNotionBriefingPage,
  getBriefing,
  getRecentBriefings,
  type DailyBriefing,
} from './briefing.js';

/**
 * Daily digest structure
 */
export interface DailyDigest {
  date: string;
  articleCount: number;
  globalSummary: string;
  articles: {
    title: string;
    shortSummary: string;
    url: string;
    source: string;
  }[];
}

/**
 * Digest generation result
 */
export interface DigestResult {
  success: boolean;
  digest?: DailyDigest;
  notionPageId?: string;
  error?: string;
}

/**
 * Generate daily digest from today's articles
 */
export async function generateDailyDigest(): Promise<DailyDigest | null> {
  const articlesWithSummaries = getTodaySyncedArticles();

  if (articlesWithSummaries.length === 0) {
    logger.info('No articles synced today, skipping digest');
    return null;
  }

  logger.info({ count: articlesWithSummaries.length }, 'Generating daily digest');

  const today = new Date().toISOString().split('T')[0]!;

  // Build context for GPT
  const articlesContext = articlesWithSummaries
    .map((a, i) => `${i + 1}. ${a.article.title}\n   ${a.summary.shortSummary}`)
    .join('\n\n');

  // Generate global summary via GPT
  const globalSummary = await generateGlobalSummary(
    articlesContext,
    articlesWithSummaries.length
  );

  const digest: DailyDigest = {
    date: today,
    articleCount: articlesWithSummaries.length,
    globalSummary,
    articles: articlesWithSummaries.map((a) => ({
      title: a.article.title,
      shortSummary: a.summary.shortSummary,
      url: a.article.url,
      source: a.article.source,
    })),
  };

  logger.info({ date: today, articles: digest.articleCount }, 'Daily digest generated');

  return digest;
}

/**
 * Generate global summary using GPT
 */
async function generateGlobalSummary(context: string, count: number): Promise<string> {
  if (!config.openai.apiKey) {
    logger.warn('OpenAI API key not configured, using fallback summary');
    return `${count} articles traités aujourd'hui. Consultez les détails ci-dessous.`;
  }

  try {
    const openai = new OpenAI({ apiKey: config.openai.apiKey });

    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `Tu es un analyste financier expert. Génère un résumé exécutif des actualités tech/finance du jour en 3-5 points clés maximum.
Format attendu:
- Point clé 1
- Point clé 2
- Point clé 3

Sois concis, factuel et orienté business/investissement.`,
        },
        {
          role: 'user',
          content: `Voici les ${count} actualités tech/finance du jour:\n\n${context}\n\nGénère un résumé exécutif des points clés.`,
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content ?? 'Résumé non disponible.';
  } catch (error) {
    logger.error({ error }, 'Failed to generate global summary');
    return `${count} articles traités aujourd'hui. Erreur lors de la génération du résumé.`;
  }
}

/**
 * Push daily digest to Notion
 */
export async function pushDigestToNotion(digest: DailyDigest): Promise<string | null> {
  if (!config.notion.apiKey || !config.notion.databaseId) {
    logger.warn('Notion not configured, skipping digest push');
    return null;
  }

  const client = new Client({ auth: config.notion.apiKey });

  try {
    // Create article list blocks
    const articleBlocks = digest.articles.map((article) => ({
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

    const response = await client.pages.create({
      parent: { database_id: config.notion.databaseId },
      properties: {
        Name: {
          title: [{ text: { content: `Daily Digest - ${digest.date}` } }],
        },
        Source: { select: { name: 'digest' } },
        'Published Date': { date: { start: digest.date } },
        'Processed Date': { date: { start: digest.date } },
      },
      children: [
        // Header callout
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '📊' },
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${digest.articleCount} articles traités le ${digest.date}`,
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
            rich_text: [{ type: 'text', text: { content: 'Articles du jour' } }],
          },
        },
        // Article list
        ...articleBlocks,
      ],
    });

    logger.info({ pageId: response.id, date: digest.date }, 'Daily digest pushed to Notion');

    return response.id;
  } catch (error) {
    logger.error({ error }, 'Failed to push digest to Notion');
    return null;
  }
}

/**
 * Generate and push daily digest (convenience function)
 * Uses the new briefing system with deduplication and article links
 */
export async function runDailyDigest(): Promise<DigestResult> {
  try {
    const today = new Date().toISOString().split('T')[0]!;

    // Check if briefing already exists for today (deduplication)
    if (briefingExists(today)) {
      logger.info({ date: today }, 'Briefing already exists for today, skipping');
      return { success: true };
    }

    const digest = await generateDailyDigest();

    if (!digest) {
      return { success: true }; // No articles = nothing to digest, not an error
    }

    // Save briefing to database first
    saveBriefing({
      date: digest.date,
      articleCount: digest.articleCount,
      globalSummary: digest.globalSummary,
    });

    // Get articles with their Notion page IDs for linking
    const articlesWithLinks = getArticlesWithNotionIds(digest.date);

    // Push to Notion with article links
    const pageId = await createNotionBriefingPage(digest, articlesWithLinks);

    // Update database with Notion page ID
    if (pageId) {
      updateBriefingNotionId(digest.date, pageId);
    }

    return {
      success: true,
      digest,
      notionPageId: pageId ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, 'Daily digest failed');
    return { success: false, error: errorMessage };
  }
}

// Re-export briefing utilities for external use
export { briefingExists, getBriefing, getRecentBriefings, type DailyBriefing };
