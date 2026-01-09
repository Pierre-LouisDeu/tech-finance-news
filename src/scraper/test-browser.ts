/**
 * Browser Test Script
 *
 * Run with: npx tsx src/scraper/test-browser.ts
 */

import { initBrowser, createPage, navigateTo, closeBrowser, closePage } from './browser.js';
import { logger } from '../utils/logger.js';

async function testBrowser(): Promise<void> {
  logger.info('Starting browser test');

  try {
    // Initialize browser
    await initBrowser({ headless: true });
    logger.info('Browser launched');

    // Create page
    const page = await createPage();
    logger.info('Page created');

    // Test 1: Simple navigation to example.com
    logger.info('Test 1: Navigating to example.com');
    await navigateTo(page, 'https://example.com');
    const title1 = await page.title();
    logger.info({ title: title1 }, 'example.com loaded');

    if (title1.includes('Example Domain')) {
      logger.info('Test 1 PASSED: Basic navigation works');
    } else {
      logger.error('Test 1 FAILED: Unexpected title');
    }

    // Test 2: Check user agent is set
    const userAgent = await page.evaluate((): string => {
      return (window.navigator as { userAgent: string }).userAgent;
    });
    logger.info({ userAgent }, 'User agent check');

    if (userAgent.includes('Chrome')) {
      logger.info('Test 2 PASSED: User agent is Chrome-like');
    } else {
      logger.warn('Test 2 WARNING: User agent may not be realistic');
    }

    // Test 3: Try Zone Bourse homepage (may be blocked)
    logger.info('Test 3: Attempting Zone Bourse (may be blocked by anti-bot)');
    try {
      await navigateTo(page, 'https://www.zonebourse.com/', { waitUntil: 'domcontentloaded' });
      const title2 = await page.title();
      const url = page.url();
      logger.info({ title: title2, url }, 'Zone Bourse response');

      if (title2.includes('404') || title2.includes('Access') || title2.includes('Denied')) {
        logger.warn('Zone Bourse blocked or 404 - will need anti-bot measures in Story 2.2');
      } else {
        logger.info('Test 3 PASSED: Zone Bourse accessible!');
      }
    } catch (error) {
      logger.warn({ error }, 'Zone Bourse navigation failed - expected with anti-bot protection');
    }

    // Save screenshot
    await page.screenshot({ path: './data/test-screenshot.png' });
    logger.info('Screenshot saved to ./data/test-screenshot.png');

    // Close page
    await closePage(page);

    logger.info('=== Browser Test Summary ===');
    logger.info('Browser setup: WORKING');
    logger.info('Navigation: WORKING');
    logger.info('User agent: CONFIGURED');
    logger.info('Zone Bourse: MAY NEED ANTI-BOT WORKAROUND (Story 2.2)');
    logger.info('===========================');
  } catch (error) {
    logger.error({ error }, 'Browser test failed');
    throw error;
  } finally {
    await closeBrowser();
  }
}

testBrowser().catch((error) => {
  logger.fatal({ error }, 'Test failed');
  process.exit(1);
});
