/**
 * Tech Finance News Aggregator
 *
 * Automated pipeline that:
 * 1. Fetches tech finance news from RSS feeds (ABC Bourse)
 * 2. Extracts full article content
 * 3. Filters articles using tech keyword matching
 * 4. Summarizes content with OpenAI GPT-4o-mini
 * 5. Pushes results to Notion database
 * 6. Generates daily/weekly/monthly briefings
 *
 * Usage:
 *   node dist/index.js --service  - Run as service (stays alive for scheduler)
 *   node dist/index.js --run      - Run pipeline once and exit
 *   node dist/index.js --run --weekly  - Run pipeline + weekly digest
 *   node dist/index.js --run --monthly - Run pipeline + monthly digest
 *   node dist/index.js            - Default: service mode
 */

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { getStats } from './db/queries.js';
import { runPipeline } from './pipeline.js';

// Parse command line arguments
const args = process.argv.slice(2);
const isRunOnce = args.includes('--run');
const isService = args.includes('--service') || !isRunOnce;
const runWeekly = args.includes('--weekly');
const runMonthly = args.includes('--monthly');

async function executePipeline(): Promise<void> {
  try {
    const result = await runPipeline({
      maxArticles: 20,
      runWeeklyDigest: runWeekly,
      runMonthlyDigest: runMonthly,
    });

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
    logger.error({ error }, 'Pipeline failed');
    throw error;
  }
}

async function main(): Promise<void> {
  logger.info('');
  logger.info('╔═══════════════════════════════════════════════════╗');
  logger.info('║       Tech Finance News Aggregator                ║');
  logger.info('╚═══════════════════════════════════════════════════╝');
  logger.info('');
  logger.info({ env: config.app.env, mode: isService ? 'service' : 'run-once' }, 'Starting application');

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

  if (isRunOnce) {
    // Run pipeline once and exit
    try {
      await executePipeline();
    } catch {
      await closeDatabase();
      process.exit(1);
    }
    await closeDatabase();
  } else {
    // Service mode: stay alive for Dokploy scheduler
    logger.info('Running in service mode - waiting for scheduler triggers');
    logger.info('Use "node dist/index.js --run" to execute pipeline manually');

    // Keep the process alive
    // The Dokploy scheduler will execute commands via docker exec
    setInterval(() => {
      logger.debug('Service heartbeat');
    }, 60000); // Heartbeat every minute
  }
}

main().catch((error: unknown) => {
  logger.fatal({ error }, 'Application failed');
  process.exit(1);
});
