/**
 * Playwright Browser Factory
 *
 * Manages browser lifecycle for web scraping
 */

import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;

/**
 * Browser configuration options
 */
export interface BrowserOptions {
  headless?: boolean;
  timeout?: number;
}

/**
 * Initialize browser instance
 */
export async function initBrowser(options: BrowserOptions = {}): Promise<Browser> {
  if (browser) {
    logger.debug('Browser already initialized');
    return browser;
  }

  const headless = options.headless ?? true;

  logger.info({ headless }, 'Launching browser');

  browser = await chromium.launch({
    headless,
    // Required for Docker/containerized environments
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  // Create default context with realistic browser fingerprint
  context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // Realistic browser settings
    javaScriptEnabled: true,
    hasTouch: false,
    isMobile: false,
    deviceScaleFactor: 1,
    // Accept cookies and headers
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    },
  });

  // Set default timeout
  context.setDefaultTimeout(options.timeout ?? config.scraper.timeout);

  logger.info('Browser initialized successfully');
  return browser;
}

/**
 * Get or create a new page
 */
export async function createPage(): Promise<Page> {
  if (!context) {
    await initBrowser();
  }

  if (!context) {
    throw new Error('Failed to initialize browser context');
  }

  const page = await context.newPage();

  // Block unnecessary resource types for faster loading
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    const blockedTypes = ['media', 'font'];

    if (blockedTypes.includes(resourceType)) {
      return route.abort();
    }
    return route.continue();
  });

  return page;
}

/**
 * Navigate to URL with retry logic
 */
export async function navigateTo(
  page: Page,
  url: string,
  options: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' } = {}
): Promise<void> {
  const waitUntil = options.waitUntil ?? 'domcontentloaded';

  logger.debug({ url, waitUntil }, 'Navigating to URL');

  try {
    await page.goto(url, { waitUntil });
    logger.debug({ url }, 'Navigation successful');
  } catch (error) {
    logger.error({ url, error }, 'Navigation failed');
    throw error;
  }
}

/**
 * Close a page
 */
export async function closePage(page: Page): Promise<void> {
  try {
    await page.close();
  } catch (error) {
    logger.warn({ error }, 'Error closing page');
  }
}

/**
 * Close browser and cleanup
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    try {
      await context.close();
    } catch (error) {
      logger.warn({ error }, 'Error closing context');
    }
    context = null;
  }

  if (browser) {
    try {
      await browser.close();
      logger.info('Browser closed');
    } catch (error) {
      logger.warn({ error }, 'Error closing browser');
    }
    browser = null;
  }
}

/**
 * Check if browser is running
 */
export function isBrowserRunning(): boolean {
  return browser !== null && browser.isConnected();
}

/**
 * Wait for rate limit
 */
export async function waitForRateLimit(): Promise<void> {
  const delay = config.scraper.rateLimitMs;
  logger.debug({ delayMs: delay }, 'Rate limit delay');
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export type { Browser, BrowserContext, Page };
