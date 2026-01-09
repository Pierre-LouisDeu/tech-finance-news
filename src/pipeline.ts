/**
 * Main Pipeline
 *
 * Orchestrates the full news processing workflow:
 * 1. Fetch articles from RSS feeds
 * 2. Extract full content
 * 3. Filter by tech keywords
 * 4. Generate AI summaries
 * 5. Push to Notion
 */

import { fetchRssFeeds, saveScrapedArticles } from './scraper/index.js';
import { extractArticleContents } from './scraper/content-extractor.js';
import { filterArticles, matchArticle } from './filter/index.js';
import { summarizeArticles, isSummarizationAvailable } from './summarizer/index.js';
import { pushArticlesToNotion, isNotionAvailable } from './notion/index.js';
import { runDailyDigest } from './digest/index.js';
import { initDatabase, closeDatabase } from './db/index.js';
import {
  getArticlesWithEmptyContent,
  getArticlesNeedingProcessing,
  getUnsyncedArticles,
  getStats,
  logProcessing,
} from './db/queries.js';
import { logger } from './utils/logger.js';
import type { PipelineResult } from './types/index.js';

/**
 * Pipeline options
 */
export interface PipelineOptions {
  maxArticles?: number;
  skipScrape?: boolean;
  skipContent?: boolean;
  skipFilter?: boolean;
  skipSummarize?: boolean;
  skipPush?: boolean;
  dryRun?: boolean;
}

/**
 * Run the full pipeline
 */
export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineResult> {
  const {
    maxArticles = 20,
    skipScrape = false,
    skipContent = false,
    skipFilter = false,
    skipSummarize = false,
    skipPush = false,
    dryRun = false,
  } = options;

  const startTime = Date.now();
  const result: PipelineResult = {
    scraped: 0,
    filtered: 0,
    summarized: 0,
    pushed: 0,
    errors: 0,
    durationMs: 0,
  };

  logger.info({ options }, 'Starting pipeline');

  try {
    initDatabase();

    // Step 1: Fetch articles from RSS feeds
    if (!skipScrape) {
      logger.info('Step 1: Fetching articles from RSS feeds...');
      const scrapeResult = await fetchRssFeeds({ maxArticlesPerFeed: maxArticles });
      result.scraped = scrapeResult.newArticles;

      if (scrapeResult.articles.length > 0 && !dryRun) {
        await saveScrapedArticles(scrapeResult.articles);
      }

      logger.info({ scraped: result.scraped }, 'RSS fetch complete');
    }

    // Step 2: Extract full article content
    if (!skipContent) {
      logger.info('Step 2: Extracting article content...');
      const articlesToExtract = getArticlesWithEmptyContent(maxArticles);

      if (articlesToExtract.length > 0 && !dryRun) {
        const contentResult = await extractArticleContents({
          articles: articlesToExtract,
          limit: maxArticles,
        });
        logger.info(
          { extracted: contentResult.successful, failed: contentResult.failed },
          'Content extraction complete'
        );
        result.errors += contentResult.failed;
      } else {
        logger.info('No articles need content extraction');
      }
    }

    // Step 3: Filter articles by tech keywords
    if (!skipFilter) {
      logger.info('Step 3: Filtering articles...');
      const articlesToFilter = getArticlesNeedingProcessing('filtered');

      if (articlesToFilter.length > 0) {
        const { matched, rejected, results } = filterArticles(articlesToFilter);
        result.filtered = matched.length;

        if (!dryRun) {
          // Log filter results
          for (const article of matched) {
            const matchResult = results.get(article.id);
            logProcessing(article.id, 'filtered', 'success');
            logger.debug({
              id: article.id,
              score: matchResult?.score,
              keywords: matchResult?.matchedKeywords.length,
            }, 'Article passed filter');
          }

          for (const article of rejected) {
            logProcessing(article.id, 'filtered', 'skipped', 'No tech keywords matched');
          }
        }

        logger.info(
          { matched: matched.length, rejected: rejected.length },
          'Filtering complete'
        );
      } else {
        logger.info('No articles need filtering');
      }
    }

    // Step 4: Generate summaries
    if (!skipSummarize) {
      logger.info('Step 4: Generating summaries...');

      if (!isSummarizationAvailable()) {
        logger.warn('OpenAI API key not configured, skipping summarization');
      } else {
        const articlesToSummarize = getArticlesNeedingProcessing('summarized');

        if (articlesToSummarize.length > 0 && !dryRun) {
          const summaryResult = await summarizeArticles(
            articlesToSummarize.slice(0, maxArticles)
          );
          result.summarized = summaryResult.successful;
          result.errors += summaryResult.failed;

          logger.info(
            { summarized: result.summarized, tokens: summaryResult.totalTokens },
            'Summarization complete'
          );
        } else {
          logger.info('No articles need summarization');
        }
      }
    }

    // Step 5: Push to Notion
    if (!skipPush) {
      logger.info('Step 5: Pushing to Notion...');

      if (!isNotionAvailable()) {
        logger.warn('Notion not configured, skipping push');
      } else {
        const articlesToPush = getUnsyncedArticles();

        if (articlesToPush.length > 0 && !dryRun) {
          const pushResult = await pushArticlesToNotion(
            articlesToPush.slice(0, maxArticles)
          );
          result.pushed = pushResult.successful;
          result.errors += pushResult.failed;

          logger.info({ pushed: result.pushed }, 'Notion push complete');
        } else {
          logger.info('No articles need to be pushed to Notion');
        }
      }
    }

    // Step 6: Generate daily digest
    if (!skipPush && !dryRun) {
      logger.info('Step 6: Generating daily digest...');

      const digestResult = await runDailyDigest();

      if (digestResult.success && digestResult.digest) {
        logger.info(
          {
            date: digestResult.digest.date,
            articles: digestResult.digest.articleCount,
            notionPageId: digestResult.notionPageId,
          },
          'Daily digest complete'
        );
      } else if (!digestResult.success) {
        logger.warn({ error: digestResult.error }, 'Daily digest failed');
      }
    }

    // Final stats
    const stats = getStats();
    result.durationMs = Date.now() - startTime;

    logger.info(
      {
        result,
        dbStats: {
          totalArticles: stats.totalArticles,
          byStage: stats.articlesByStage,
          synced: stats.articlesSynced,
        },
      },
      'Pipeline complete'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Pipeline failed');
    result.errors++;
    throw error;
  } finally {
    closeDatabase();
  }
}

/**
 * Run pipeline with CLI arguments
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: PipelineOptions = {
    maxArticles: 20,
    dryRun: args.includes('--dry-run'),
    skipScrape: args.includes('--skip-scrape'),
    skipContent: args.includes('--skip-content'),
    skipFilter: args.includes('--skip-filter'),
    skipSummarize: args.includes('--skip-summarize'),
    skipPush: args.includes('--skip-push'),
  };

  // Parse --max-articles=N
  const maxArg = args.find((a) => a.startsWith('--max-articles='));
  if (maxArg) {
    const value = parseInt(maxArg.split('=')[1] ?? '20', 10);
    if (!isNaN(value)) {
      options.maxArticles = value;
    }
  }

  logger.info('Tech Finance News Pipeline');
  logger.info('==========================');

  if (options.dryRun) {
    logger.info('DRY RUN MODE - No changes will be made');
  }

  try {
    const result = await runPipeline(options);

    logger.info('');
    logger.info('Pipeline Summary:');
    logger.info(`  Scraped:    ${result.scraped} articles`);
    logger.info(`  Filtered:   ${result.filtered} articles`);
    logger.info(`  Summarized: ${result.summarized} articles`);
    logger.info(`  Pushed:     ${result.pushed} articles`);
    logger.info(`  Errors:     ${result.errors}`);
    logger.info(`  Duration:   ${(result.durationMs / 1000).toFixed(1)}s`);
  } catch (error) {
    logger.fatal({ error }, 'Pipeline failed');
    process.exit(1);
  }
}

// Only run if this file is the entry point (not imported)
const isDirectRun = process.argv[1]?.includes('pipeline');
if (isDirectRun) {
  main().catch(console.error);
}
