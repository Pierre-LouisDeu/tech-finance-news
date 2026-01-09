/**
 * Scraper Module
 *
 * Exports RSS-based fetching (primary) and web scraping (fallback)
 */

// RSS-based fetching (primary approach)
export {
  fetchRssFeeds,
  DEFAULT_FEEDS,
  type RssFeedConfig,
} from './rss-fetcher.js';

// Web scraping (fallback for Zone Bourse if needed)
export { scrapeZoneBourse, saveScrapedArticles } from './zonebourse.js';

// Content extraction
export {
  extractArticleContents,
  type ContentExtractionResult,
} from './content-extractor.js';

// Browser utilities
export {
  initBrowser,
  closeBrowser,
  createPage,
  navigateTo,
  closePage,
  waitForRateLimit,
  isBrowserRunning,
} from './browser.js';

export type { BrowserOptions } from './browser.js';
export type { Scraper, ScrapeResult, RawArticleListing } from './types.js';
