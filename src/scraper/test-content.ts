/**
 * Content Extractor Test Script
 *
 * Run with: npx tsx src/scraper/test-content.ts
 */

import { extractArticleContents } from './content-extractor.js';
import { initDatabase, closeDatabase } from '../db/index.js';
import { getArticlesWithEmptyContent, getArticleById } from '../db/queries.js';
import { logger } from '../utils/logger.js';

async function testContentExtractor(): Promise<void> {
  logger.info('Starting content extractor test');

  try {
    // Initialize database
    initDatabase();

    // Check articles needing content
    const articlesNeedingContent = getArticlesWithEmptyContent(5);
    logger.info(
      { count: articlesNeedingContent.length },
      'Articles needing content extraction'
    );

    if (articlesNeedingContent.length === 0) {
      logger.info('No articles need content extraction. Run test-rss.ts first.');
      return;
    }

    // Show sample URLs
    logger.info('Sample articles to process:');
    for (const article of articlesNeedingContent.slice(0, 3)) {
      logger.info({
        id: article.id,
        title: article.title.slice(0, 50) + '...',
        url: article.url,
      });
    }

    // Extract content for a few articles
    logger.info('Extracting content (limit: 3)...');
    const result = await extractArticleContents({ limit: 3 });

    logger.info(
      {
        processed: result.processed,
        successful: result.successful,
        failed: result.failed,
      },
      'Extraction result'
    );

    // Verify content was saved
    if (result.successful > 0) {
      const firstArticle = articlesNeedingContent[0];
      if (firstArticle) {
        const updated = getArticleById(firstArticle.id);
        if (updated) {
          logger.info(
            {
              id: updated.id,
              contentLength: updated.content.length,
              preview: updated.content.slice(0, 200) + '...',
            },
            'Content verification'
          );
        }
      }
    }

    logger.info('=== Content Extractor Test Complete ===');
  } catch (error) {
    logger.error({ error }, 'Content extractor test failed');
    throw error;
  } finally {
    closeDatabase();
  }
}

testContentExtractor().catch((error) => {
  logger.fatal({ error }, 'Test failed');
  process.exit(1);
});
