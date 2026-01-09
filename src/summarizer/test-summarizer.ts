/**
 * Summarizer Test Script
 *
 * Run with: npx tsx src/summarizer/test-summarizer.ts
 *
 * Note: Requires OPENAI_API_KEY to be set in .env
 */

import { summarizeArticle, summarizeAndSave, isSummarizationAvailable } from './summarizer.js';
import { initDatabase, closeDatabase, getDatabase } from '../db/index.js';
import { getSummary } from '../db/queries.js';
import { logger } from '../utils/logger.js';
import type { Article } from '../types/index.js';

async function testSummarizer(): Promise<void> {
  logger.info('Starting summarizer test');

  // Check if API key is available
  if (!isSummarizationAvailable()) {
    logger.warn('OPENAI_API_KEY not configured. Set it in .env to test summarization.');
    logger.info('Skipping summarizer test - API key required');
    return;
  }

  try {
    initDatabase();

    // Get a real article with content
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM articles
      WHERE content IS NOT NULL AND length(content) > 200
      ORDER BY published_at DESC
      LIMIT 1
    `);
    const row = stmt.get() as {
      id: string;
      title: string;
      url: string;
      content: string;
      published_at: string;
      source: string;
      created_at: string;
    } | undefined;

    if (!row) {
      logger.warn('No articles with content found. Run content extraction first.');
      return;
    }

    const article: Article = {
      id: row.id,
      title: row.title,
      url: row.url,
      content: row.content,
      publishedAt: new Date(row.published_at),
      source: row.source as 'zonebourse' | 'abcbourse',
      createdAt: new Date(row.created_at),
    };

    logger.info({
      id: article.id,
      title: article.title.slice(0, 60),
      contentLength: article.content.length,
    }, 'Testing with article');

    // Test summarization
    logger.info('Generating summary...');
    const result = await summarizeAndSave(article);

    if (result) {
      logger.info({
        shortSummary: result.shortSummary,
        detailedLength: result.detailedSummary.length,
        tokensUsed: result.tokensUsed,
      }, 'Summary generated');

      logger.info('Short summary:');
      logger.info(result.shortSummary);

      logger.info('Detailed summary:');
      logger.info(result.detailedSummary);

      // Verify saved to database
      const saved = getSummary(article.id);
      if (saved) {
        logger.info({ savedAt: saved.createdAt }, 'Summary verified in database');
      }
    } else {
      logger.error('Summarization failed');
    }

    logger.info('=== Summarizer Test Complete ===');
  } catch (error) {
    logger.error({ error }, 'Summarizer test failed');
    throw error;
  } finally {
    closeDatabase();
  }
}

testSummarizer().catch((error) => {
  logger.fatal({ error }, 'Test failed');
  process.exit(1);
});
