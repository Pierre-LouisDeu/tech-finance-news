/**
 * Application configuration
 */

import { env } from './env.js';
import { TECH_KEYWORDS } from './keywords.js';

export const config = {
  app: {
    name: 'tech-finance-news',
    version: '1.0.0',
    env: env.NODE_ENV,
  },

  openai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
  },

  notion: {
    apiKey: env.NOTION_API_KEY,
    databaseId: env.NOTION_DATABASE_ID,
    briefingDatabaseId: env.NOTION_BRIEFING_DATABASE_ID, // Optional: falls back to main DB
  },

  scraper: {
    rateLimitMs: env.SCRAPE_RATE_LIMIT_MS,
    userAgent: env.USER_AGENT,
    timeout: 30000,
    zoneBourseUrl: 'https://www.zonebourse.com/actualite-bourse/',
    zoneBourseEconomieUrl: 'https://www.zonebourse.com/actualite-bourse/economie/',
  },

  database: {
    url: env.DATABASE_URL,
  },

  logging: {
    level: env.LOG_LEVEL,
    file: env.LOG_FILE,
  },

  keywords: TECH_KEYWORDS,

  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    factor: 2,
  },

  rateLimit: {
    notion: {
      requestsPerSecond: 3,
    },
    openai: {
      requestsPerMinute: 60,
    },
  },
} as const;

export type Config = typeof config;
export { env } from './env.js';
export { TECH_KEYWORDS } from './keywords.js';
