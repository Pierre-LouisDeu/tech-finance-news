/**
 * RSS Fetcher Test Script
 *
 * Run with: npx tsx src/scraper/test-rss.ts
 */

import { fetchRssFeeds, DEFAULT_FEEDS, saveScrapedArticles } from './rss-fetcher.js';
import { initDatabase, closeDatabase } from '../db/index.js';
import { getStats } from '../db/queries.js';
import { logger } from '../utils/logger.js';

async function testRssFetcher(): Promise<void> {
  logger.info('Starting RSS fetcher test');

  try {
    // Initialize database
    await initDatabase();
    const statsBefore = await getStats();
    logger.info({ articles: statsBefore.totalArticles }, 'Database state before fetching');

    // Show configured feeds
    logger.info('Configured RSS feeds:');
    for (const feed of DEFAULT_FEEDS) {
      logger.info({ name: feed.name, url: feed.url, source: feed.source });
    }

    // Fetch RSS feeds
    logger.info('Fetching RSS feeds...');
    const result = await fetchRssFeeds({
      maxArticlesPerFeed: 20,
    });

    logger.info(
      {
        feedsProcessed: result.pagesProcessed,
        totalFound: result.totalFound,
        newArticles: result.newArticles,
        errors: result.errors,
      },
      'Fetch result'
    );

    // Show sample articles
    logger.info('Sample articles found:');
    for (const article of result.articles.slice(0, 5)) {
      logger.info({
        title: article.title.slice(0, 60) + (article.title.length > 60 ? '...' : ''),
        url: article.url,
        source: article.source,
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
    const statsAfter = await getStats();
    logger.info(
      {
        before: statsBefore.totalArticles,
        after: statsAfter.totalArticles,
        added: statsAfter.totalArticles - statsBefore.totalArticles,
      },
      'Database state after fetching'
    );

    logger.info('=== RSS Fetcher Test Complete ===');
  } catch (error) {
    logger.error({ error }, 'RSS fetcher test failed');
    throw error;
  } finally {
    await closeDatabase();
  }
}

testRssFetcher().catch((error) => {
  logger.fatal({ error }, 'Test failed');
  process.exit(1);
});
