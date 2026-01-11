/**
 * Notion Integration Test Script
 *
 * Run with: npx tsx src/notion/test-notion.ts
 *
 * Note: Requires NOTION_API_KEY and NOTION_DATABASE_ID in .env
 */

import { pushArticleToNotion, isNotionAvailable } from './client.js';
import { initDatabase, closeDatabase, query } from '../db/index.js';
import { getSummary } from '../db/queries.js';
import { logger } from '../utils/logger.js';
import type { Article } from '../types/index.js';

async function testNotion(): Promise<void> {
  logger.info('Starting Notion integration test');

  // Check if Notion is configured
  if (!isNotionAvailable()) {
    logger.warn('Notion not configured. Set NOTION_API_KEY and NOTION_DATABASE_ID in .env');
    logger.info('Skipping Notion test - configuration required');
    return;
  }

  try {
    await initDatabase();

    // Get an article with a summary
    const rows = await query<{
      id: string;
      title: string;
      url: string;
      content: string;
      published_at: string;
      source: string;
      created_at: string;
    }>(`
      SELECT a.* FROM articles a
      INNER JOIN summaries s ON a.id = s.article_id
      ORDER BY a.published_at DESC
      LIMIT 1
    `);

    if (rows.length === 0) {
      logger.warn('No articles with summaries found. Run summarizer first.');
      return;
    }

    const row = rows[0]!;
    const article: Article = {
      id: row.id,
      title: row.title,
      url: row.url,
      content: row.content,
      publishedAt: new Date(row.published_at),
      source: row.source as 'zonebourse' | 'abcbourse',
      createdAt: new Date(row.created_at),
    };

    const summary = await getSummary(article.id);
    if (!summary) {
      logger.warn('Summary not found for article');
      return;
    }

    logger.info({
      id: article.id,
      title: article.title.slice(0, 60),
      shortSummary: summary.shortSummary.slice(0, 60),
    }, 'Testing with article');

    // Push to Notion
    logger.info('Pushing to Notion...');
    const result = await pushArticleToNotion(article);

    if (result.success) {
      logger.info({
        pageId: result.pageId,
      }, 'Successfully pushed to Notion');
    } else {
      logger.error({ error: result.error }, 'Failed to push to Notion');
    }

    logger.info('=== Notion Integration Test Complete ===');
  } catch (error) {
    logger.error({ error }, 'Notion test failed');
    throw error;
  } finally {
    await closeDatabase();
  }
}

testNotion().catch((error) => {
  logger.fatal({ error }, 'Test failed');
  process.exit(1);
});
