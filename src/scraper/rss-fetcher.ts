/**
 * RSS Feed Fetcher
 *
 * Fetches articles from financial news RSS feeds
 */

import Parser from 'rss-parser';
import { logger } from '../utils/logger.js';
import { generateArticleId, articleExistsByUrl } from '../db/queries.js';
import type { Article, ArticleSource } from '../types/index.js';
import type { ScrapeResult } from './types.js';

/**
 * RSS feed configuration
 */
export interface RssFeedConfig {
  name: string;
  url: string;
  source: ArticleSource;
}

/**
 * Default financial news RSS feeds
 */
export const DEFAULT_FEEDS: RssFeedConfig[] = [
  {
    name: 'ABC Bourse - Actualités',
    url: 'https://www.abcbourse.com/rss/displaynewsrss',
    source: 'abcbourse',
  },
  {
    name: 'ABC Bourse - Analyses',
    url: 'https://www.abcbourse.com/rss/lastanalysisrss',
    source: 'abcbourse',
  },
];

/**
 * Create RSS parser with custom headers
 */
function createParser(): Parser {
  return new Parser({
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    timeout: 30000,
  });
}

/**
 * Parse RSS date to Date object
 */
function parseRssDate(dateStr: string | undefined): Date {
  if (!dateStr) {
    return new Date();
  }

  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  return new Date();
}

/**
 * Fetch articles from a single RSS feed
 */
async function fetchFeed(
  feed: RssFeedConfig,
  parser: Parser
): Promise<Article[]> {
  const articles: Article[] = [];

  try {
    logger.info({ feed: feed.name, url: feed.url }, 'Fetching RSS feed');

    const result = await parser.parseURL(feed.url);

    logger.info(
      { feed: feed.name, itemCount: result.items?.length ?? 0 },
      'RSS feed parsed'
    );

    for (const item of result.items ?? []) {
      if (!item.link || !item.title) {
        continue;
      }

      // Skip if already exists
      if (articleExistsByUrl(item.link)) {
        logger.debug({ url: item.link }, 'Article already exists, skipping');
        continue;
      }

      const publishedAt = parseRssDate(item.pubDate ?? item.isoDate);
      const id = generateArticleId(item.title, publishedAt);

      const article: Article = {
        id,
        title: item.title,
        url: item.link,
        content: item.contentSnippet ?? item.content ?? '',
        publishedAt,
        source: feed.source,
        createdAt: new Date(),
      };

      articles.push(article);
    }
  } catch (error) {
    logger.error({ error, feed: feed.name }, 'Failed to fetch RSS feed');
    throw error;
  }

  return articles;
}

/**
 * Fetch articles from multiple RSS feeds
 */
export async function fetchRssFeeds(options: {
  feeds?: RssFeedConfig[];
  maxArticlesPerFeed?: number;
} = {}): Promise<ScrapeResult> {
  const { feeds = DEFAULT_FEEDS, maxArticlesPerFeed = 50 } = options;

  const startTime = Date.now();
  const result: ScrapeResult = {
    articles: [],
    scrapedAt: new Date(),
    pagesProcessed: 0,
    totalFound: 0,
    newArticles: 0,
    errors: 0,
  };

  const parser = createParser();

  logger.info({ feedCount: feeds.length }, 'Starting RSS feed fetch');

  for (const feed of feeds) {
    try {
      const articles = await fetchFeed(feed, parser);

      // Apply limit per feed
      const limitedArticles = articles.slice(0, maxArticlesPerFeed);

      result.totalFound += articles.length;
      result.newArticles += limitedArticles.length;
      result.articles.push(...limitedArticles);
      result.pagesProcessed++;

      logger.info(
        { feed: feed.name, found: articles.length, added: limitedArticles.length },
        'Feed processed'
      );
    } catch (error) {
      logger.error({ error, feed: feed.name }, 'Error processing feed');
      result.errors++;
    }
  }

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      feedsProcessed: result.pagesProcessed,
      totalFound: result.totalFound,
      newArticles: result.newArticles,
      errors: result.errors,
      durationMs,
    },
    'RSS fetch completed'
  );

  return result;
}

/**
 * Save fetched articles to database
 */
export { saveScrapedArticles } from './zonebourse.js';
