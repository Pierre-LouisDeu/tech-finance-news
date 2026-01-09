/**
 * Scheduler
 *
 * Runs the pipeline on a cron schedule
 */

import cron from 'node-cron';
import { runPipeline } from './pipeline.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

/**
 * Scheduler state
 */
let scheduledTask: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Execute pipeline with lock to prevent overlapping runs
 */
async function executePipeline(): Promise<void> {
  if (isRunning) {
    logger.warn('Pipeline already running, skipping this execution');
    return;
  }

  isRunning = true;
  const startTime = new Date();

  logger.info({ startTime: startTime.toISOString() }, 'Scheduled pipeline starting');

  try {
    const result = await runPipeline({
      maxArticles: 30,
    });

    logger.info(
      {
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        result,
      },
      'Scheduled pipeline completed'
    );
  } catch (error) {
    logger.error({ error }, 'Scheduled pipeline failed');
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  const cronExpression = config.scheduler.cronExpression;

  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  logger.info(
    {
      cronExpression,
      timezone: config.scheduler.timezone,
    },
    'Starting scheduler'
  );

  scheduledTask = cron.schedule(
    cronExpression,
    () => {
      executePipeline().catch((error) => {
        logger.error({ error }, 'Pipeline execution failed');
      });
    },
    {
      timezone: config.scheduler.timezone,
    }
  );

  logger.info('Scheduler started');
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return scheduledTask !== null;
}

/**
 * Run scheduler as standalone process
 */
async function main(): Promise<void> {
  logger.info('Tech Finance News Scheduler');
  logger.info('===========================');
  logger.info(`Cron: ${config.scheduler.cronExpression}`);
  logger.info(`Timezone: ${config.scheduler.timezone}`);
  logger.info('');

  // Run once immediately on startup
  logger.info('Running initial pipeline...');
  await executePipeline();

  // Start scheduled runs
  startScheduler();

  // Keep process alive
  logger.info('Scheduler running. Press Ctrl+C to stop.');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    stopScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    stopScheduler();
    process.exit(0);
  });
}

// Run if called directly
if (process.argv[1]?.endsWith('scheduler.ts') || process.argv[1]?.endsWith('scheduler.js')) {
  main().catch((error) => {
    logger.fatal({ error }, 'Scheduler failed');
    process.exit(1);
  });
}
