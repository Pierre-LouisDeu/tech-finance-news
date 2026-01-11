/**
 * Tech Finance News Aggregator
 *
 * Automated pipeline that:
 * 1. Fetches tech finance news from RSS feeds (ABC Bourse)
 * 2. Extracts full article content
 * 3. Filters articles using tech keyword matching
 * 4. Summarizes content with OpenAI GPT-4o-mini
 * 5. Pushes results to Notion database
 *
 * Usage:
 *   npm run dev          - Run once with watch mode
 *   npm run pipeline     - Run pipeline once
 *   node dist/index.js   - Run pipeline once (production)
 */

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { getStats } from './db/queries.js';
import { runPipeline } from './pipeline.js';

async function main(): Promise<void> {
  logger.info('');
  logger.info('╔═══════════════════════════════════════════════════╗');
  logger.info('║       Tech Finance News Aggregator                ║');
  logger.info('╚═══════════════════════════════════════════════════╝');
  logger.info('');
  logger.info({ env: config.app.env }, 'Starting application');

  // Initialize database
  try {
    await initDatabase();
    const stats = await getStats();
    logger.info(
      {
        totalArticles: stats.totalArticles,
        byStage: stats.articlesByStage,
        synced: stats.articlesSynced,
        lastProcessed: stats.lastProcessedAt?.toISOString() ?? 'never',
      },
      'Database ready'
    );
  } catch (error) {
    logger.fatal({ error }, 'Failed to initialize database');
    process.exit(1);
  }

  // Graceful shutdown handler
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Run pipeline once and exit
  try {
    const result = await runPipeline({ maxArticles: 20 });

    logger.info('');
    logger.info('Pipeline Complete:');
    logger.info(`  ✓ Scraped:    ${result.scraped} articles`);
    logger.info(`  ✓ Filtered:   ${result.filtered} articles`);
    logger.info(`  ✓ Summarized: ${result.summarized} articles`);
    logger.info(`  ✓ Pushed:     ${result.pushed} articles`);
    if (result.errors > 0) {
      logger.info(`  ⚠ Errors:     ${result.errors}`);
    }
    logger.info(`  ⏱ Duration:   ${(result.durationMs / 1000).toFixed(1)}s`);
  } catch (error) {
    logger.fatal({ error }, 'Pipeline failed');
    await closeDatabase();
    process.exit(1);
  }

  await closeDatabase();
}

main().catch((error: unknown) => {
  logger.fatal({ error }, 'Application failed');
  process.exit(1);
});
