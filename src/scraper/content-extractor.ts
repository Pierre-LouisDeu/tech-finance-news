/**
 * Article Content Extractor
 *
 * Fetches and extracts full article content from URLs
 */

import type { Page } from 'playwright';
import {
  initBrowser,
  createPage,
  navigateTo,
  closePage,
  closeBrowser,
  waitForRateLimit,
} from './browser.js';
import { logger } from '../utils/logger.js';
import {
  getArticlesWithEmptyContent,
  updateArticleContent,
  logProcessing,
} from '../db/queries.js';
import type { Article } from '../types/index.js';

/**
 * Content extraction result
 */
export interface ContentExtractionResult {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
}

/**
 * Extract text content from a page
 */
async function extractPageContent(page: Page): Promise<string> {
  return page.evaluate((): string => {
    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      'aside',
      '.sidebar',
      '.menu',
      '.navigation',
      '.comments',
      '.social-share',
      '.advertisement',
      '.ads',
      '[class*="cookie"]',
      '[class*="popup"]',
      '[class*="modal"]',
      '[class*="banner"]',
    ];

    for (const selector of unwantedSelectors) {
      document.querySelectorAll(selector).forEach((el) => el.remove());
    }

    // Try to find the main article content
    const contentSelectors = [
      'article',
      '[class*="article-body"]',
      '[class*="article-content"]',
      '[class*="post-content"]',
      '[class*="entry-content"]',
      '.content',
      'main',
      '[role="main"]',
    ];

    let contentElement: Element | null = null;
    for (const selector of contentSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim().length > 200) {
        contentElement = el;
        break;
      }
    }

    // Fallback to body if no specific container found
    if (!contentElement) {
      contentElement = document.body;
    }

    // Extract paragraphs
    const paragraphs: string[] = [];
    const pElements = contentElement.querySelectorAll('p');

    if (pElements.length > 0) {
      pElements.forEach((p) => {
        const text = p.textContent?.trim();
        if (text && text.length > 30) {
          paragraphs.push(text);
        }
      });
    }

    // If no paragraphs found, get all text content
    if (paragraphs.length === 0) {
      const text = contentElement.textContent?.trim();
      if (text) {
        // Split by double newlines and filter
        const blocks = text.split(/\n\s*\n/).filter((b) => b.trim().length > 30);
        paragraphs.push(...blocks);
      }
    }

    return paragraphs.join('\n\n');
  });
}

/**
 * Fetch content for a single article
 */
async function fetchArticleContent(
  page: Page,
  article: Article
): Promise<string | null> {
  try {
    logger.debug({ url: article.url, id: article.id }, 'Fetching article content');

    await navigateTo(page, article.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500); // Wait for dynamic content

    const content = await extractPageContent(page);

    if (content && content.length > 100) {
      logger.debug(
        { id: article.id, contentLength: content.length },
        'Content extracted'
      );
      return content;
    }

    logger.warn({ id: article.id, url: article.url }, 'No substantial content found');
    return null;
  } catch (error) {
    logger.error({ error, url: article.url }, 'Failed to fetch article content');
    return null;
  }
}

/**
 * Extract content for multiple articles
 */
export async function extractArticleContents(options: {
  limit?: number;
  articles?: Article[];
} = {}): Promise<ContentExtractionResult> {
  const { limit = 20 } = options;

  const result: ContentExtractionResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
  };

  // Get articles that need content extraction
  const articles = options.articles ?? (await getArticlesWithEmptyContent(limit));

  if (articles.length === 0) {
    logger.info('No articles need content extraction');
    return result;
  }

  logger.info({ count: articles.length }, 'Starting content extraction');

  try {
    await initBrowser({ headless: true });
    const page = await createPage();

    for (const article of articles) {
      result.processed++;

      // Skip if already has content
      if (article.content && article.content.length > 100) {
        result.skipped++;
        continue;
      }

      const content = await fetchArticleContent(page, article);

      if (content) {
        await updateArticleContent(article.id, content);
        await logProcessing(article.id, 'scraped', 'success');
        result.successful++;
        logger.info(
          { id: article.id, contentLength: content.length },
          'Article content saved'
        );
      } else {
        await logProcessing(article.id, 'scraped', 'failed', 'Content extraction failed');
        result.failed++;
      }

      // Rate limit between requests
      await waitForRateLimit();
    }

    await closePage(page);
  } catch (error) {
    logger.error({ error }, 'Content extraction failed');
    throw error;
  } finally {
    await closeBrowser();
  }

  logger.info(
    {
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      skipped: result.skipped,
    },
    'Content extraction completed'
  );

  return result;
}
