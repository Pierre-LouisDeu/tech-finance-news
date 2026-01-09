/**
 * Zone Bourse Scraper
 *
 * Extracts articles from Zone Bourse news section
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
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { generateArticleId, articleExistsByUrl, insertArticle, logProcessing } from '../db/queries.js';
import type { Article } from '../types/index.js';
import type { RawArticleListing, ScrapeResult } from './types.js';

/**
 * Extract article listings from a Zone Bourse page
 */
async function extractArticleListings(page: Page): Promise<RawArticleListing[]> {
  return page.evaluate((): Array<{ title: string; url: string; dateText: string }> => {
    const articles: Array<{ title: string; url: string; dateText: string }> = [];

    // Try different selectors for article cards
    const cardSelectors = [
      '[class*="card"] a[href*="/actualite/"]',
      '[class*="article"] a[href*="/actualite/"]',
      'a[href*="/actualite/"][class*="c-"]',
      '.news-list a[href*="/actualite/"]',
    ];

    const seenUrls = new Set<string>();

    for (const selector of cardSelectors) {
      const elements = document.querySelectorAll<HTMLAnchorElement>(selector);

      elements.forEach((anchor: HTMLAnchorElement) => {
        const href = anchor.href;

        // Skip if already seen or not an article link
        if (seenUrls.has(href) || !href.includes('/actualite/')) {
          return;
        }

        // Skip category pages
        if (href.match(/\/actualite-bourse\/(societes|indices|devises|economie|secteurs|taux|ETF|cryptomonnaies|matieres-premieres)\/?$/)) {
          return;
        }

        seenUrls.add(href);

        // Try to find title
        let title = anchor.title || anchor.textContent?.trim() || '';

        // Look for title in parent/child elements
        if (!title || title.length < 10) {
          const parent = anchor.closest('[class*="card"], [class*="article"]');
          if (parent) {
            const titleEl = parent.querySelector('h1, h2, h3, h4, .title, [class*="title"]');
            if (titleEl) {
              title = titleEl.textContent?.trim() || title;
            }
          }
        }

        // Skip if no valid title
        if (!title || title.length < 10) {
          return;
        }

        // Try to find date
        let dateText = '';
        const parent = anchor.closest('[class*="card"], [class*="article"]');
        if (parent) {
          const dateEl = parent.querySelector('time, .date, [class*="date"], [class*="time"]');
          if (dateEl) {
            dateText = dateEl.getAttribute('datetime') || dateEl.textContent?.trim() || '';
          }
        }

        articles.push({
          title: title.slice(0, 500), // Limit title length
          url: href,
          dateText,
        });
      });
    }

    return articles;
  });
}

/**
 * Parse date text to Date object
 */
function parseDate(dateText: string): Date {
  if (!dateText) {
    return new Date();
  }

  // Try ISO format first
  const isoDate = new Date(dateText);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try French format "07/01/2026 14:30"
  const frenchMatch = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})?:?(\d{2})?/);
  if (frenchMatch) {
    const [, day, month, year, hour = '0', minute = '0'] = frenchMatch;
    return new Date(
      parseInt(year!),
      parseInt(month!) - 1,
      parseInt(day!),
      parseInt(hour),
      parseInt(minute)
    );
  }

  // Try relative format "Il y a X heures"
  const relativeMatch = dateText.match(/(\d+)\s*(heure|minute|jour)/i);
  if (relativeMatch) {
    const [, amount, unit] = relativeMatch;
    const now = new Date();
    const value = parseInt(amount!);

    if (unit?.includes('minute')) {
      now.setMinutes(now.getMinutes() - value);
    } else if (unit?.includes('heure')) {
      now.setHours(now.getHours() - value);
    } else if (unit?.includes('jour')) {
      now.setDate(now.getDate() - value);
    }
    return now;
  }

  return new Date();
}

/**
 * Scrape articles from Zone Bourse
 */
export async function scrapeZoneBourse(options: {
  maxPages?: number;
  section?: 'economie' | 'societes' | 'all';
} = {}): Promise<ScrapeResult> {
  const { maxPages = 2, section = 'economie' } = options;

  const startTime = Date.now();
  const result: ScrapeResult = {
    articles: [],
    scrapedAt: new Date(),
    pagesProcessed: 0,
    totalFound: 0,
    newArticles: 0,
    errors: 0,
  };

  logger.info({ maxPages, section }, 'Starting Zone Bourse scrape');

  try {
    await initBrowser({ headless: true });
    const page = await createPage();

    // Determine URL based on section
    const baseUrl =
      section === 'all'
        ? config.scraper.zoneBourseUrl
        : section === 'economie'
          ? config.scraper.zoneBourseEconomieUrl
          : `${config.scraper.zoneBourseUrl}${section}/`;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const url = pageNum === 1 ? baseUrl : `${baseUrl}?p=${pageNum}`;

        logger.info({ url, page: pageNum }, 'Scraping page');

        await navigateTo(page, url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000); // Wait for dynamic content

        const listings = await extractArticleListings(page);
        result.totalFound += listings.length;
        result.pagesProcessed++;

        logger.info({ count: listings.length, page: pageNum }, 'Found articles on page');

        // Process each article
        for (const listing of listings) {
          try {
            // Check if already exists
            if (articleExistsByUrl(listing.url)) {
              logger.debug({ url: listing.url }, 'Article already exists, skipping');
              continue;
            }

            const publishedAt = parseDate(listing.dateText);
            const id = generateArticleId(listing.title, publishedAt);

            const article: Article = {
              id,
              title: listing.title,
              url: listing.url,
              content: '', // Will be filled in Story 2.3
              publishedAt,
              source: 'zonebourse',
              createdAt: new Date(),
            };

            result.articles.push(article);
            result.newArticles++;

            logger.debug({ id, title: listing.title.slice(0, 50) }, 'New article found');
          } catch (error) {
            logger.error({ error, listing }, 'Error processing article listing');
            result.errors++;
          }
        }

        // Rate limit between pages
        if (pageNum < maxPages) {
          await waitForRateLimit();
        }
      } catch (error) {
        logger.error({ error, page: pageNum }, 'Error scraping page');
        result.errors++;
      }
    }

    await closePage(page);
  } catch (error) {
    logger.error({ error }, 'Scraping failed');
    result.errors++;
    throw error;
  } finally {
    await closeBrowser();
  }

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      pagesProcessed: result.pagesProcessed,
      totalFound: result.totalFound,
      newArticles: result.newArticles,
      errors: result.errors,
      durationMs,
    },
    'Scrape completed'
  );

  return result;
}

/**
 * Save scraped articles to database
 */
export async function saveScrapedArticles(articles: Article[]): Promise<number> {
  let saved = 0;

  for (const article of articles) {
    try {
      if (!articleExistsByUrl(article.url)) {
        insertArticle(article);
        logProcessing(article.id, 'scraped', 'success');
        saved++;
        logger.debug({ id: article.id }, 'Article saved');
      }
    } catch (error) {
      logger.error({ error, article: article.id }, 'Failed to save article');
    }
  }

  logger.info({ saved, total: articles.length }, 'Articles saved to database');
  return saved;
}
