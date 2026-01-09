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
 *   npm run scheduler    - Run with cron scheduling
 */

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { getStats } from './db/queries.js';
import { runPipeline } from './pipeline.js';
import { startScheduler, stopScheduler } from './scheduler.js';

/**
 * Run mode: 'once' | 'scheduled'
 */
type RunMode = 'once' | 'scheduled';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode: RunMode = args.includes('--scheduled') ? 'scheduled' : 'once';

  logger.info('');
  logger.info('╔═══════════════════════════════════════════════════╗');
  logger.info('║       Tech Finance News Aggregator                ║');
  logger.info('╚═══════════════════════════════════════════════════╝');
  logger.info('');
  logger.info({ mode, env: config.app.env }, 'Starting application');

  // Initialize database
  try {
    initDatabase();
    const stats = getStats();
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
  const shutdown = (): void => {
    logger.info('Shutting down...');
    if (mode === 'scheduled') {
      stopScheduler();
    }
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Run based on mode
  if (mode === 'scheduled') {
    // Scheduled mode: run with cron
    logger.info(`Cron schedule: ${config.scheduler.cronExpression}`);
    logger.info(`Timezone: ${config.scheduler.timezone}`);

    // Run once immediately
    logger.info('Running initial pipeline...');
    try {
      await runPipeline({ maxArticles: 30 });
    } catch (error) {
      logger.error({ error }, 'Initial pipeline failed');
    }

    // Start scheduler
    startScheduler();
    logger.info('Scheduler running. Press Ctrl+C to stop.');

    // Keep process alive
    await new Promise(() => {}); // Never resolves
  } else {
    // Once mode: run pipeline and exit
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
      closeDatabase();
      process.exit(1);
    }

    closeDatabase();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ error }, 'Application failed');
  process.exit(1);
});
