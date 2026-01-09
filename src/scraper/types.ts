/**
 * Scraper Types
 */

import type { Article } from '../types/index.js';

/**
 * Raw article data extracted from listing page
 */
export interface RawArticleListing {
  title: string;
  url: string;
  dateText: string;
}

/**
 * Scraper interface for different sources
 */
export interface Scraper {
  /**
   * Scrape articles from the source
   * @param maxPages Maximum number of pages to scrape
   * @returns Array of scraped articles
   */
  scrape(maxPages?: number): Promise<Article[]>;

  /**
   * Get the source identifier
   */
  getSource(): string;
}

/**
 * Scraper result with metadata
 */
export interface ScrapeResult {
  articles: Article[];
  scrapedAt: Date;
  pagesProcessed: number;
  totalFound: number;
  newArticles: number;
  errors: number;
}
