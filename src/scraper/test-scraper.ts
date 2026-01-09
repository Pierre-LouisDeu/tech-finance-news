/**
 * Zone Bourse Scraper Test
 *
 * Run with: npx tsx src/scraper/test-scraper.ts
 */

import { scrapeZoneBourse, saveScrapedArticles } from './zonebourse.js';
import { initDatabase, closeDatabase } from '../db/index.js';
import { getStats } from '../db/queries.js';
import { logger } from '../utils/logger.js';

async function testScraper(): Promise<void> {
  logger.info('Starting scraper test');

  try {
    // Initialize database
    initDatabase();
    const statsBefore = getStats();
    logger.info({ articles: statsBefore.totalArticles }, 'Database state before scraping');

    // Scrape Zone Bourse
    logger.info('Scraping Zone Bourse...');
    const result = await scrapeZoneBourse({
      maxPages: 1, // Just 1 page for testing
      section: 'economie',
    });

    logger.info(
      {
        pagesProcessed: result.pagesProcessed,
        totalFound: result.totalFound,
        newArticles: result.newArticles,
        errors: result.errors,
      },
      'Scrape result'
    );

    // Show sample articles
    logger.info('Sample articles found:');
    for (const article of result.articles.slice(0, 5)) {
      logger.info({
        title: article.title.slice(0, 60) + '...',
        url: article.url,
        date: article.publishedAt.toISOString(),
      });
    }

    // Save to database
    if (result.articles.length > 0) {
      logger.info('Saving articles to database...');
      const saved = await saveScrapedArticles(result.articles);
      logger.info({ saved }, 'Articles saved');
    }

    // Check database after
    const statsAfter = getStats();
    logger.info(
      {
        before: statsBefore.totalArticles,
        after: statsAfter.totalArticles,
        added: statsAfter.totalArticles - statsBefore.totalArticles,
      },
      'Database state after scraping'
    );

    logger.info('=== Scraper Test Complete ===');
  } catch (error) {
    logger.error({ error }, 'Scraper test failed');
    throw error;
  } finally {
    closeDatabase();
  }
}

testScraper().catch((error) => {
  logger.fatal({ error }, 'Test failed');
  process.exit(1);
});
